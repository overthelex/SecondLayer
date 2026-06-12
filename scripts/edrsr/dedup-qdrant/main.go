package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

const (
	scrollBatch = 10_000
	deleteBatch = 500
)

var (
	qdrantURL = "http://localhost:6333"
	apiKey    = "3cCOLVQESro11stD9LvVQm4TnWDm9DqUxKjfYBXy"
	collection = "edrsr_decisions"
)

// Partition boundaries for parallel scroll (split UUID hex space into N equal parts)
var partitions8 = [][2]string{
	{"", "20000000-0000-0000-0000-000000000000"},
	{"20000000-0000-0000-0000-000000000000", "40000000-0000-0000-0000-000000000000"},
	{"40000000-0000-0000-0000-000000000000", "60000000-0000-0000-0000-000000000000"},
	{"60000000-0000-0000-0000-000000000000", "80000000-0000-0000-0000-000000000000"},
	{"80000000-0000-0000-0000-000000000000", "a0000000-0000-0000-0000-000000000000"},
	{"a0000000-0000-0000-0000-000000000000", "c0000000-0000-0000-0000-000000000000"},
	{"c0000000-0000-0000-0000-000000000000", "e0000000-0000-0000-0000-000000000000"},
	{"e0000000-0000-0000-0000-000000000000", ""},
}

// ShardedMap — concurrent map sharded by doc_id for low contention
type ShardedMap struct {
	shards [256]shard
}

type shard struct {
	mu sync.Mutex
	m  map[uint64]struct{}
}

func NewShardedMap() *ShardedMap {
	sm := &ShardedMap{}
	for i := range sm.shards {
		sm.shards[i].m = make(map[uint64]struct{}, 1<<16)
	}
	return sm
}

func encodeKey(docID int64, chunkIdx int) uint64 {
	return uint64(docID)<<16 | uint64(chunkIdx)
}

// TryInsert returns true if key was new (inserted), false if already existed
func (sm *ShardedMap) TryInsert(docID int64, chunkIdx int) bool {
	key := encodeKey(docID, chunkIdx)
	s := &sm.shards[byte(docID)]
	s.mu.Lock()
	_, exists := s.m[key]
	if !exists {
		s.m[key] = struct{}{}
	}
	s.mu.Unlock()
	return !exists
}

func (sm *ShardedMap) Len() int {
	total := 0
	for i := range sm.shards {
		sm.shards[i].mu.Lock()
		total += len(sm.shards[i].m)
		sm.shards[i].mu.Unlock()
	}
	return total
}

// Qdrant API types
type ScrollRequest struct {
	Filter     map[string]interface{} `json:"filter"`
	Limit      int                    `json:"limit"`
	WithPayload []string             `json:"with_payload"`
	WithVector  bool                 `json:"with_vector"`
	Offset     string                `json:"offset,omitempty"`
}

type ScrollResponse struct {
	Result struct {
		Points         []Point `json:"points"`
		NextPageOffset *string `json:"next_page_offset"`
	} `json:"result"`
}

type Point struct {
	ID      string                 `json:"id"`
	Payload map[string]interface{} `json:"payload"`
}

type CountResponse struct {
	Result struct {
		Count int64 `json:"count"`
	} `json:"result"`
}

var httpClient = &http.Client{Timeout: 120 * time.Second}

func qdrantPost(path string, body interface{}) ([]byte, error) {
	data, _ := json.Marshal(body)
	url := fmt.Sprintf("%s/collections/%s%s", qdrantURL, collection, path)
	req, _ := http.NewRequest("POST", url, bytes.NewReader(data))
	req.Header.Set("api-key", apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respData, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respData[:min(200, len(respData))]))
	}
	return respData, nil
}

func countPoints(justiceKind int) int64 {
	body := map[string]interface{}{
		"filter": map[string]interface{}{
			"must": []interface{}{
				map[string]interface{}{"key": "justice_kind", "match": map[string]interface{}{"value": justiceKind}},
			},
		},
		"exact": false,
	}
	data, err := qdrantPost("/points/count", body)
	if err != nil {
		log.Fatalf("count failed: %v", err)
	}
	var resp CountResponse
	json.Unmarshal(data, &resp)
	return resp.Result.Count
}

func deletePoints(ids []string) error {
	body := map[string]interface{}{"points": ids}
	_, err := qdrantPost("/points/delete?wait=false", body)
	return err
}

// scrollWorker scrolls a partition of the UUID space
func scrollWorker(id int, justiceKind int, startOffset, endOffset string, seen *ShardedMap, stats *Stats, deleteCh chan<- []string) {
	offset := startOffset
	filter := map[string]interface{}{
		"must": []interface{}{
			map[string]interface{}{"key": "justice_kind", "match": map[string]interface{}{"value": justiceKind}},
		},
	}

	var localDups []string

	for {
		req := ScrollRequest{
			Filter:      filter,
			Limit:       scrollBatch,
			WithPayload: []string{"edrsr_doc_id", "chunk_index"},
			WithVector:  false,
		}
		if offset != "" {
			req.Offset = offset
		}

		data, err := qdrantPost("/points/scroll", req)
		if err != nil {
			log.Printf("[W%d] scroll error: %v, retrying in 2s", id, err)
			time.Sleep(2 * time.Second)
			continue
		}

		var resp ScrollResponse
		json.Unmarshal(data, &resp)

		points := resp.Result.Points
		if len(points) == 0 {
			break
		}

		// Check if we've crossed into the next partition
		if endOffset != "" && points[0].ID >= endOffset {
			break
		}

		for _, p := range points {
			if endOffset != "" && p.ID >= endOffset {
				break
			}

			docIDf, ok1 := p.Payload["edrsr_doc_id"].(float64)
			chunkf, ok2 := p.Payload["chunk_index"].(float64)
			if !ok1 || !ok2 {
				continue
			}

			if !seen.TryInsert(int64(docIDf), int(chunkf)) {
				localDups = append(localDups, p.ID)
			}
		}

		atomic.AddInt64(&stats.scanned, int64(len(points)))

		// Flush local dups to delete channel
		if len(localDups) >= deleteBatch {
			batch := make([]string, len(localDups))
			copy(batch, localDups)
			atomic.AddInt64(&stats.dupsFound, int64(len(batch)))
			deleteCh <- batch
			localDups = localDups[:0]
		}

		if resp.Result.NextPageOffset == nil {
			break
		}
		offset = *resp.Result.NextPageOffset

		if endOffset != "" && offset >= endOffset {
			break
		}
	}

	// Flush remaining
	if len(localDups) > 0 {
		atomic.AddInt64(&stats.dupsFound, int64(len(localDups)))
		deleteCh <- localDups
	}
}

type Stats struct {
	scanned  int64
	dupsFound int64
	deleted  int64
	start    time.Time
}

func deleteWorker(id int, ch <-chan []string, stats *Stats, wg *sync.WaitGroup, dryRun bool) {
	defer wg.Done()
	for batch := range ch {
		if dryRun {
			atomic.AddInt64(&stats.deleted, int64(len(batch)))
			continue
		}
		// Split into sub-batches of deleteBatch
		for i := 0; i < len(batch); i += deleteBatch {
			end := i + deleteBatch
			if end > len(batch) {
				end = len(batch)
			}
			sub := batch[i:end]
			for attempt := 0; attempt < 3; attempt++ {
				err := deletePoints(sub)
				if err == nil {
					atomic.AddInt64(&stats.deleted, int64(len(sub)))
					break
				}
				log.Printf("[D%d] delete error (attempt %d): %v", id, attempt+1, err)
				time.Sleep(time.Duration(1<<attempt) * time.Second)
				if attempt == 2 {
					log.Printf("[D%d] giving up on %d points", id, len(sub))
				}
			}
		}
	}
}

func progressLogger(stats *Stats, total int64, seen *ShardedMap, done <-chan struct{}) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			s := atomic.LoadInt64(&stats.scanned)
			d := atomic.LoadInt64(&stats.dupsFound)
			del := atomic.LoadInt64(&stats.deleted)
			elapsed := time.Since(stats.start).Seconds()
			rate := float64(s) / elapsed
			eta := float64(total-s) / rate
			pct := float64(s) / float64(total) * 100
			seenN := seen.Len()
			log.Printf("%12d/%d (%.1f%%) | dups: %d | deleted: %d | rate: %.0f/s | ETA: %.1fm | seen: %d",
				s, total, pct, d, del, rate, eta/60, seenN)
		}
	}
}

func main() {
	justiceKind := flag.Int("jk", 0, "justice_kind to dedup (required)")
	workers := flag.Int("workers", 8, "number of scroll workers")
	deleteWorkers := flag.Int("dworkers", 4, "number of delete workers")
	dryRun := flag.Bool("dry-run", false, "scan only, no deletes")
	url := flag.String("url", "http://localhost:6333", "Qdrant URL")
	flag.Parse()

	if *justiceKind == 0 {
		log.Fatal("--jk required (1, 2, 3, or 5)")
	}
	qdrantURL = *url

	total := countPoints(*justiceKind)
	log.Printf("=== Dedup justice_kind=%d: %d points, %d scroll workers, %d delete workers ===",
		*justiceKind, total, *workers, *deleteWorkers)
	if *dryRun {
		log.Println("DRY RUN — no deletes")
	}

	seen := NewShardedMap()
	stats := &Stats{start: time.Now()}

	// Build partition boundaries based on worker count
	partitions := buildPartitions(*workers)

	// Delete channel and workers
	deleteCh := make(chan []string, *workers*4)
	var delWg sync.WaitGroup
	for i := 0; i < *deleteWorkers; i++ {
		delWg.Add(1)
		go deleteWorker(i, deleteCh, stats, &delWg, *dryRun)
	}

	// Progress logger
	progressDone := make(chan struct{})
	go progressLogger(stats, total, seen, progressDone)

	// Scroll workers
	var scrollWg sync.WaitGroup
	for i, p := range partitions {
		scrollWg.Add(1)
		go func(id int, start, end string) {
			defer scrollWg.Done()
			scrollWorker(id, *justiceKind, start, end, seen, stats, deleteCh)
			log.Printf("[W%d] done", id)
		}(i, p[0], p[1])
	}

	scrollWg.Wait()
	close(deleteCh)
	delWg.Wait()
	close(progressDone)

	elapsed := time.Since(stats.start)
	log.Printf("=== Done: scanned %d, dups %d, deleted %d in %.1fm ===",
		stats.scanned, stats.dupsFound, stats.deleted, elapsed.Minutes())
	log.Printf("Unique keys: %d", seen.Len())

	// Verify
	newTotal := countPoints(*justiceKind)
	log.Printf("Post-dedup count: %d (expected ~%d)", newTotal, seen.Len())
	diff := newTotal - int64(seen.Len())
	if diff < 0 {
		diff = -diff
	}
	if diff > int64(seen.Len())/100 {
		log.Printf("WARNING: count mismatch, diff=%d", newTotal-int64(seen.Len()))
	} else {
		log.Println("Count OK (within 1%)")
	}
}

func buildPartitions(n int) [][2]string {
	if n == 8 {
		return partitions8
	}
	// Generate N equal partitions of hex UUID space
	parts := make([][2]string, n)
	step := 0x100 / n
	for i := 0; i < n; i++ {
		start := ""
		end := ""
		if i > 0 {
			start = fmt.Sprintf("%02x000000-0000-0000-0000-000000000000", i*step)
		}
		if i < n-1 {
			end = fmt.Sprintf("%02x000000-0000-0000-0000-000000000000", (i+1)*step)
		}
		parts[i] = [2]string{start, end}
	}
	return parts
}
