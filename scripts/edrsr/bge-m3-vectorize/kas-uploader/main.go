// kas-uploader — idempotent, streaming, resource-capped bulk uploader
// for BGE-M3 embeddings (npy + payload jsonl) into Qdrant via gRPC.
//
// Design (replaces python upload_stream*.py):
//   - Deterministic point IDs: doc_id*100 + chunk_index  → re-runs overwrite,
//     never duplicate; resume is safe by construction.
//   - Streams npy rows from disk (no full-group RAM load).
//   - Per-group checkpoint of the contiguous confirmed batch prefix.
//   - Global caps: network token bucket (bytes/s) + AIMD in-flight window
//     (grows on success, halves on errors/timeouts).
//
// npy part ordering replicates python exactly:
//   sorted(glob("embeddings_gpu{N}_part*.npy"), key=int(suffix)) + final "embeddings_gpu{N}.npy" last.
package main

import (
	"bufio"
	"context"
	"encoding/binary"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/qdrant/go-client/qdrant"
	"golang.org/x/time/rate"
)

// ---------- npy streaming reader ----------

var headerRe = regexp.MustCompile(`'descr':\s*'([^']+)'.*'fortran_order':\s*(\w+).*'shape':\s*\((\d+),\s*(\d+)\)`)

type npyFile struct {
	path    string
	rows    int64
	cols    int64
	dataOff int64
}

func parseNpyHeader(path string) (npyFile, error) {
	f, err := os.Open(path)
	if err != nil {
		return npyFile{}, err
	}
	defer f.Close()
	magic := make([]byte, 8)
	if _, err := io.ReadFull(f, magic); err != nil {
		return npyFile{}, err
	}
	if string(magic[:6]) != "\x93NUMPY" {
		return npyFile{}, fmt.Errorf("%s: not an npy file", path)
	}
	major := magic[6]
	var hlen int64
	if major == 1 {
		b := make([]byte, 2)
		if _, err := io.ReadFull(f, b); err != nil {
			return npyFile{}, err
		}
		hlen = int64(binary.LittleEndian.Uint16(b))
	} else {
		b := make([]byte, 4)
		if _, err := io.ReadFull(f, b); err != nil {
			return npyFile{}, err
		}
		hlen = int64(binary.LittleEndian.Uint32(b))
	}
	hdr := make([]byte, hlen)
	if _, err := io.ReadFull(f, hdr); err != nil {
		return npyFile{}, err
	}
	m := headerRe.FindStringSubmatch(string(hdr))
	if m == nil {
		return npyFile{}, fmt.Errorf("%s: cannot parse npy header: %s", path, string(hdr))
	}
	if m[1] != "<f4" {
		return npyFile{}, fmt.Errorf("%s: dtype %s, want <f4", path, m[1])
	}
	if m[2] != "False" {
		return npyFile{}, fmt.Errorf("%s: fortran_order not supported", path)
	}
	rows, _ := strconv.ParseInt(m[3], 10, 64)
	cols, _ := strconv.ParseInt(m[4], 10, 64)
	off := int64(8)
	if major == 1 {
		off += 2 + hlen
	} else {
		off += 4 + hlen
	}
	return npyFile{path: path, rows: rows, cols: cols, dataOff: off}, nil
}

// groupFiles returns npy files of a group in exact python order.
func groupFiles(dir string, gpu int) ([]npyFile, error) {
	pattern := filepath.Join(dir, fmt.Sprintf("embeddings_gpu%d_part*.npy", gpu))
	parts, err := filepath.Glob(pattern)
	if err != nil {
		return nil, err
	}
	type pf struct {
		n    int
		path string
	}
	var pfs []pf
	for _, p := range parts {
		base := strings.TrimSuffix(filepath.Base(p), ".npy")
		idx := strings.LastIndex(base, "part")
		n, err := strconv.Atoi(base[idx+4:])
		if err != nil {
			return nil, fmt.Errorf("bad part suffix in %s", p)
		}
		pfs = append(pfs, pf{n, p})
	}
	sort.Slice(pfs, func(i, j int) bool { return pfs[i].n < pfs[j].n })
	var files []npyFile
	for _, p := range pfs {
		nf, err := parseNpyHeader(p.path)
		if err != nil {
			return nil, err
		}
		files = append(files, nf)
	}
	final := filepath.Join(dir, fmt.Sprintf("embeddings_gpu%d.npy", gpu))
	if _, err := os.Stat(final); err == nil {
		nf, err := parseNpyHeader(final)
		if err != nil {
			return nil, err
		}
		files = append(files, nf)
	}
	return files, nil
}

// vectorStream yields rows across the ordered npy files, with seek-resume.
type vectorStream struct {
	files   []npyFile
	fi      int
	f       *os.File
	r       *bufio.Reader
	rowInF  int64
	rowBuf  []byte
	cols    int64
}

func newVectorStream(files []npyFile, skipRows int64) (*vectorStream, error) {
	vs := &vectorStream{files: files}
	if len(files) == 0 {
		return nil, fmt.Errorf("no npy files")
	}
	vs.cols = files[0].cols
	for _, f := range files {
		if f.cols != vs.cols {
			return nil, fmt.Errorf("inconsistent cols: %s", f.path)
		}
	}
	// seek past whole files
	for vs.fi < len(files) && skipRows >= files[vs.fi].rows {
		skipRows -= files[vs.fi].rows
		vs.fi++
	}
	if vs.fi >= len(files) {
		return vs, nil // fully consumed
	}
	if err := vs.openCurrent(skipRows); err != nil {
		return nil, err
	}
	return vs, nil
}

func (vs *vectorStream) openCurrent(skipRows int64) error {
	nf := vs.files[vs.fi]
	f, err := os.Open(nf.path)
	if err != nil {
		return err
	}
	if _, err := f.Seek(nf.dataOff+skipRows*vs.cols*4, io.SeekStart); err != nil {
		f.Close()
		return err
	}
	vs.f = f
	vs.r = bufio.NewReaderSize(f, 4<<20)
	vs.rowInF = skipRows
	vs.rowBuf = make([]byte, vs.cols*4)
	return nil
}

// next returns the next vector row, or nil when exhausted.
func (vs *vectorStream) next() ([]float32, error) {
	for {
		if vs.f == nil {
			return nil, nil
		}
		if vs.rowInF >= vs.files[vs.fi].rows {
			vs.f.Close()
			vs.f = nil
			vs.fi++
			if vs.fi >= len(vs.files) {
				return nil, nil
			}
			if err := vs.openCurrent(0); err != nil {
				return nil, err
			}
			continue
		}
		if _, err := io.ReadFull(vs.r, vs.rowBuf); err != nil {
			return nil, fmt.Errorf("%s row %d: %w", vs.files[vs.fi].path, vs.rowInF, err)
		}
		vs.rowInF++
		vec := make([]float32, vs.cols)
		for i := range vec {
			vec[i] = math.Float32frombits(binary.LittleEndian.Uint32(vs.rowBuf[i*4:]))
		}
		return vec, nil
	}
}

// ---------- payload → qdrant.Value ----------

func toValue(v any) *qdrant.Value {
	switch t := v.(type) {
	case nil:
		return qdrant.NewValueNull()
	case string:
		return qdrant.NewValueString(t)
	case bool:
		return qdrant.NewValueBool(t)
	case float64:
		if t == math.Trunc(t) && math.Abs(t) < 1e15 {
			return qdrant.NewValueInt(int64(t))
		}
		return qdrant.NewValueDouble(t)
	case json.Number:
		if i, err := t.Int64(); err == nil {
			return qdrant.NewValueInt(i)
		}
		f, _ := t.Float64()
		return qdrant.NewValueDouble(f)
	default:
		b, _ := json.Marshal(t)
		return qdrant.NewValueString(string(b))
	}
}

// ---------- batching / AIMD / checkpoint ----------

type batch struct {
	group   int
	seq     int64 // batch sequence within group
	points  []*qdrant.PointStruct
	bytes   int64
	lastIdx int64 // payload line index (exclusive) covered by this batch
}

type checkpointer struct {
	mu        sync.Mutex
	path      string
	confirmed map[int]int64 // group → contiguous confirmed payload-line count
	pending   map[int]map[int64]int64 // group → seq → lastIdx
	nextSeq   map[int]int64           // group → next seq expected for frontier
}

func newCheckpointer(path string) *checkpointer {
	c := &checkpointer{
		path:      path,
		confirmed: map[int]int64{},
		pending:   map[int]map[int64]int64{},
		nextSeq:   map[int]int64{},
	}
	if b, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(b, &c.confirmed)
	}
	return c
}

func (c *checkpointer) confirmedLines(group int) int64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.confirmed[group]
}

func (c *checkpointer) markDone(group int, seq int64, lastIdx int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.pending[group] == nil {
		c.pending[group] = map[int64]int64{}
	}
	c.pending[group][seq] = lastIdx
	for {
		idx, ok := c.pending[group][c.nextSeq[group]]
		if !ok {
			break
		}
		delete(c.pending[group], c.nextSeq[group])
		c.confirmed[group] = idx
		c.nextSeq[group]++
	}
}

func (c *checkpointer) save() {
	c.mu.Lock()
	b, _ := json.MarshalIndent(c.confirmed, "", " ")
	c.mu.Unlock()
	tmp := c.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0644); err == nil {
		_ = os.Rename(tmp, c.path)
	}
}

// aimd controls the global in-flight window.
type aimd struct {
	cur, min, max int64
}

func (a *aimd) onSuccess() {
	if atomic.LoadInt64(&a.cur) < a.max {
		atomic.AddInt64(&a.cur, 1)
	}
}
func (a *aimd) onError() {
	for {
		c := atomic.LoadInt64(&a.cur)
		n := c / 2
		if n < a.min {
			n = a.min
		}
		if atomic.CompareAndSwapInt64(&a.cur, c, n) {
			return
		}
	}
}

// ---------- main ----------

func main() {
	var (
		dirsFlag   = flag.String("dirs", "", "comma-separated group dirs (each with embeddings_gpu0*.npy + payloads_gpu0.jsonl)")
		host       = flag.String("host", "10.88.0.6", "qdrant host")
		port       = flag.Int("port", 6334, "qdrant grpc port")
		apiKey     = flag.String("api-key", "", "qdrant api key")
		collection = flag.String("collection", "edrsr_decisions", "collection")
		batchSize  = flag.Int("batch", 400, "points per upsert")
		inflight0  = flag.Int64("inflight-start", 8, "initial in-flight window")
		inflightMx = flag.Int64("inflight-max", 48, "max in-flight window")
		netMBps    = flag.Float64("net-mbps", 110, "network cap, MB/s (~80% of link)")
		ckptPath   = flag.String("checkpoint", "kas-upload.ckpt", "checkpoint file")
		statsEvery = flag.Duration("stats", 15*time.Second, "stats interval")
		waitUpsert = flag.Bool("wait", false, "wait=true on upserts")
	)
	flag.Parse()
	if *dirsFlag == "" || *apiKey == "" {
		log.Fatal("need -dirs and -api-key")
	}
	dirs := strings.Split(*dirsFlag, ",")

	client, err := qdrant.NewClient(&qdrant.Config{
		Host: *host, Port: *port, APIKey: *apiKey, UseTLS: false,
		GrpcOptions: nil,
	})
	if err != nil {
		log.Fatalf("qdrant client: %v", err)
	}
	ctx := context.Background()
	if _, err := client.GetCollectionInfo(ctx, *collection); err != nil {
		log.Fatalf("collection check: %v", err)
	}

	ckpt := newCheckpointer(*ckptPath)
	win := &aimd{cur: *inflight0, min: 2, max: *inflightMx}
	limiter := rate.NewLimiter(rate.Limit(*netMBps*1024*1024), 8<<20)

	var (
		sentPoints int64
		sentBytes  int64
		errCount   int64
		inFlight   int64
	)

	batches := make(chan *batch, 16)

	// upsert workers
	var wg sync.WaitGroup
	for w := 0; w < 64; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for b := range batches {
				// AIMD window gate
				for atomic.LoadInt64(&inFlight) >= atomic.LoadInt64(&win.cur) {
					time.Sleep(20 * time.Millisecond)
				}
				atomic.AddInt64(&inFlight, 1)
				_ = limiter.WaitN(ctx, int(b.bytes))
				var lastErr error
				for attempt := 0; attempt < 6; attempt++ {
					cctx, cancel := context.WithTimeout(ctx, 120*time.Second)
					_, lastErr = client.Upsert(cctx, &qdrant.UpsertPoints{
						CollectionName: *collection,
						Wait:           waitUpsert,
						Points:         b.points,
					})
					cancel()
					if lastErr == nil {
						break
					}
					win.onError()
					atomic.AddInt64(&errCount, 1)
					time.Sleep(time.Duration(1<<attempt) * time.Second)
				}
				atomic.AddInt64(&inFlight, -1)
				if lastErr != nil {
					log.Printf("FATAL group %d seq %d: upsert failed after retries: %v", b.group, b.seq, lastErr)
					os.Exit(1)
				}
				win.onSuccess()
				atomic.AddInt64(&sentPoints, int64(len(b.points)))
				atomic.AddInt64(&sentBytes, b.bytes)
				ckpt.markDone(b.group, b.seq, b.lastIdx)
			}
		}()
	}

	// checkpoint saver + stats
	stop := make(chan struct{})
	go func() {
		t := time.NewTicker(3 * time.Second)
		s := time.NewTicker(*statsEvery)
		var lastP, lastB int64
		lastT := time.Now()
		for {
			select {
			case <-t.C:
				ckpt.save()
			case <-s.C:
				p := atomic.LoadInt64(&sentPoints)
				bb := atomic.LoadInt64(&sentBytes)
				dt := time.Since(lastT).Seconds()
				log.Printf("STATS pts=%d (+%.0f/s) net=%.1fMB/s inflight=%d/%d errs=%d",
					p, float64(p-lastP)/dt, float64(bb-lastB)/dt/1048576,
					atomic.LoadInt64(&inFlight), atomic.LoadInt64(&win.cur), atomic.LoadInt64(&errCount))
				lastP, lastB, lastT = p, bb, time.Now()
			case <-stop:
				ckpt.save()
				return
			}
		}
	}()

	// producers: one per group
	var pwg sync.WaitGroup
	for gi, dir := range dirs {
		pwg.Add(1)
		go func(group int, dir string) {
			defer pwg.Done()
			if err := produceGroup(group, dir, *batchSize, ckpt, batches); err != nil {
				log.Printf("FATAL group %d (%s): %v", group, dir, err)
				os.Exit(1)
			}
		}(gi, dir)
	}
	pwg.Wait()
	close(batches)
	wg.Wait()
	close(stop)
	ckpt.save()
	log.Printf("ALL DONE: %d points, %d errors", atomic.LoadInt64(&sentPoints), atomic.LoadInt64(&errCount))
}

func produceGroup(group int, dir string, batchSize int, ckpt *checkpointer, out chan<- *batch) error {
	files, err := groupFiles(dir, 0)
	if err != nil {
		return err
	}
	var totalRows int64
	for _, f := range files {
		totalRows += f.rows
	}
	skip := ckpt.confirmedLines(group)
	log.Printf("group %d: %d npy files, %d rows total, resume at line %d", group, len(files), totalRows, skip)

	vs, err := newVectorStream(files, skip)
	if err != nil {
		return err
	}
	pf, err := os.Open(filepath.Join(dir, "payloads_gpu0.jsonl"))
	if err != nil {
		return err
	}
	defer pf.Close()
	sc := bufio.NewScanner(pf)
	sc.Buffer(make([]byte, 1<<20), 16<<20)

	// skip confirmed payload lines
	var lineIdx int64
	for lineIdx < skip && sc.Scan() {
		lineIdx++
	}

	// seed frontier so markDone sequencing starts correctly for resumed runs
	ckpt.mu.Lock()
	ckpt.nextSeq[group] = 0
	ckpt.mu.Unlock()

	var (
		pts      []*qdrant.PointStruct
		bbytes   int64
		seq      int64
	)
	flush := func() {
		if len(pts) == 0 {
			return
		}
		out <- &batch{group: group, seq: seq, points: pts, bytes: bbytes, lastIdx: lineIdx}
		seq++
		pts = nil
		bbytes = 0
	}

	for sc.Scan() {
		line := sc.Bytes()
		vec, err := vs.next()
		if err != nil {
			return err
		}
		if vec == nil {
			// Embedding job was stopped before flushing its final buffers, so the
			// payload jsonl has more lines than there are vectors. Verified clean
			// tail truncation: vector[i] <-> line[i] stay aligned for all i < rows.
			// Stop here and flush what we have; the missing tail (doc_ids beyond
			// this point) is re-embedded separately with deterministic IDs, so the
			// partial last document's remaining chunks slot in without conflict.
			log.Printf("group %d: tail-truncated cleanly at line %d (rows=%d, trailing payload lines have no vectors — deferred to tail re-embed)",
				group, lineIdx, totalRows)
			break
		}
		var meta map[string]any
		dec := json.NewDecoder(strings.NewReader(string(line)))
		dec.UseNumber()
		if err := dec.Decode(&meta); err != nil {
			return fmt.Errorf("line %d: bad json: %w", lineIdx, err)
		}
		docIDn, ok := meta["edrsr_doc_id"].(json.Number)
		if !ok {
			return fmt.Errorf("line %d: no edrsr_doc_id", lineIdx)
		}
		docID, _ := docIDn.Int64()
		chunkN, _ := meta["chunk_index"].(json.Number)
		chunkIdx, _ := chunkN.Int64()
		pointID := uint64(docID)*100 + uint64(chunkIdx)

		payload := make(map[string]*qdrant.Value, len(meta))
		for k, v := range meta {
			payload[k] = toValue(v)
		}
		pts = append(pts, &qdrant.PointStruct{
			Id:      qdrant.NewIDNum(pointID),
			Vectors: qdrant.NewVectors(vec...),
			Payload: payload,
		})
		bbytes += int64(len(line)) + int64(len(vec)*4) + 64
		lineIdx++
		if len(pts) >= batchSize {
			flush()
		}
	}
	if err := sc.Err(); err != nil {
		return err
	}
	flush()
	// verify alignment: vectors must also be exhausted
	if v, _ := vs.next(); v != nil {
		return fmt.Errorf("group %d: payload lines ended but vectors remain — ALIGNMENT ERROR", group)
	}
	log.Printf("group %d: produced all %d lines", group, lineIdx)
	return nil
}
