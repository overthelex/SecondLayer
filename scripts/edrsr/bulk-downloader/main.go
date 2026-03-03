// bulk-downloader — high-throughput file downloader replacing xargs+wget
//
// Usage:
//   bulk-downloader [flags] <url-list-file>
//
// URL list format (one entry per line):
//   <url>                          → saves to <output-dir>/<filename from URL>
//   <url> <relative/path/file>     → saves to <output-dir>/<relative/path/file>
//
// Example (generate from DB):
//   psql ... -c "COPY (SELECT doc_url, doc_id||'.rtf' FROM edrsr_documents) TO STDOUT" \
//     | bulk-downloader -workers 200 -out /data/rtf -
//
// Performance vs xargs+wget (39M files, 16-core):
//   xargs+wget: 56% sy (kernel), ~2100 fork/exec/sec
//   bulk-downloader: ~3% sy, keep-alive TCP, 3-5x throughput

package main

import (
	"bufio"
	"context"
	"crypto/tls"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

// ---- Config ----------------------------------------------------------------

type Config struct {
	Workers     int
	OutDir      string
	Retries     int
	RetryDelay  time.Duration
	Timeout     time.Duration
	SkipExist   bool
	RateLimit   int // requests per second, 0 = unlimited
	ProgressSec int // progress interval in seconds
	UserAgent   string
	TLSSkip     bool
}

// ---- Job -------------------------------------------------------------------

type Job struct {
	URL      string
	DestPath string // absolute path
}

// ---- Stats -----------------------------------------------------------------

type Stats struct {
	done    atomic.Int64
	errors  atomic.Int64
	skipped atomic.Int64
	bytes   atomic.Int64
}

func (s *Stats) print(total int64, elapsed time.Duration) {
	done := s.done.Load()
	errs := s.errors.Load()
	skip := s.skipped.Load()
	mb := float64(s.bytes.Load()) / 1024 / 1024
	pct := float64(0)
	if total > 0 {
		pct = float64(done+skip) / float64(total) * 100
	}
	rps := float64(done+skip) / elapsed.Seconds()
	fmt.Printf("\r[%s] done=%d skip=%d err=%d  %.1f%% | %.0f r/s | %.1f MB",
		elapsed.Round(time.Second), done, skip, errs, pct, rps, mb)
}

// ---- HTTP client -----------------------------------------------------------

func newClient(cfg *Config) *http.Client {
	tr := &http.Transport{
		MaxIdleConns:        cfg.Workers * 2,
		MaxIdleConnsPerHost: cfg.Workers,
		IdleConnTimeout:     90 * time.Second,
		DisableCompression:  false,
		TLSClientConfig:     &tls.Config{InsecureSkipVerify: cfg.TLSSkip},
	}
	return &http.Client{
		Timeout:   cfg.Timeout,
		Transport: tr,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}
}

// ---- Downloader ------------------------------------------------------------

func download(ctx context.Context, client *http.Client, job Job, cfg *Config, stats *Stats) error {
	// Skip if file already exists
	if cfg.SkipExist {
		if _, err := os.Stat(job.DestPath); err == nil {
			stats.skipped.Add(1)
			return nil
		}
	}

	// Ensure directory
	dir := filepath.Dir(job.DestPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("mkdir %s: %w", dir, err)
	}

	var lastErr error
	for attempt := 0; attempt <= cfg.Retries; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(cfg.RetryDelay * time.Duration(attempt)):
			}
		}

		lastErr = doDownload(ctx, client, job, cfg, stats)
		if lastErr == nil {
			return nil
		}

		// Don't retry on 4xx (client errors)
		if isClientError(lastErr) {
			return lastErr
		}
	}
	return lastErr
}

func doDownload(ctx context.Context, client *http.Client, job Job, cfg *Config, stats *Stats) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, job.URL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", cfg.UserAgent)

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return &httpError{code: resp.StatusCode, url: job.URL}
	}

	// Write to temp file, rename on success (atomic)
	tmp := job.DestPath + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return fmt.Errorf("create %s: %w", tmp, err)
	}

	n, err := io.Copy(f, resp.Body)
	f.Close()
	if err != nil {
		os.Remove(tmp)
		return fmt.Errorf("write %s: %w", tmp, err)
	}

	if err := os.Rename(tmp, job.DestPath); err != nil {
		os.Remove(tmp)
		return fmt.Errorf("rename %s: %w", tmp, err)
	}

	stats.bytes.Add(n)
	stats.done.Add(1)
	return nil
}

// ---- HTTP error type -------------------------------------------------------

type httpError struct {
	code int
	url  string
}

func (e *httpError) Error() string {
	return fmt.Sprintf("HTTP %d: %s", e.code, e.url)
}

func isClientError(err error) bool {
	if e, ok := err.(*httpError); ok {
		return e.code >= 400 && e.code < 500
	}
	return false
}

// ---- URL list reader -------------------------------------------------------

// readJobs reads jobs from reader. Format per line:
//   <url>
//   <url> <dest-relative-path>
// Lines starting with # or empty lines are skipped.
func readJobs(r io.Reader, outDir string) ([]Job, error) {
	var jobs []Job
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.Fields(line)
		rawURL := parts[0]

		var destPath string
		if len(parts) >= 2 {
			// Explicit destination path provided
			destPath = filepath.Join(outDir, filepath.FromSlash(parts[1]))
		} else {
			// Derive filename from URL
			segment := rawURL
			if idx := strings.LastIndex(rawURL, "/"); idx >= 0 {
				segment = rawURL[idx+1:]
			}
			// Strip query string
			if idx := strings.Index(segment, "?"); idx >= 0 {
				segment = segment[:idx]
			}
			if segment == "" {
				segment = "file"
			}
			destPath = filepath.Join(outDir, segment)
		}

		jobs = append(jobs, Job{URL: rawURL, DestPath: destPath})
	}

	return jobs, scanner.Err()
}

// ---- Worker pool -----------------------------------------------------------

func runWorkers(ctx context.Context, jobs []Job, cfg *Config, client *http.Client, errLog *log.Logger) *Stats {
	stats := &Stats{}
	jobCh := make(chan Job, cfg.Workers*4)

	// Rate limiter (token bucket via ticker)
	var rateTicker <-chan time.Time
	if cfg.RateLimit > 0 {
		t := time.NewTicker(time.Second / time.Duration(cfg.RateLimit))
		defer t.Stop()
		rateTicker = t.C
	}

	var wg sync.WaitGroup
	for i := 0; i < cfg.Workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for job := range jobCh {
				if rateTicker != nil {
					select {
					case <-rateTicker:
					case <-ctx.Done():
						return
					}
				}
				if err := download(ctx, client, job, cfg, stats); err != nil {
					stats.errors.Add(1)
					errLog.Printf("ERROR %s → %s: %v", job.URL, job.DestPath, err)
				}
			}
		}()
	}

	// Feed jobs
	go func() {
		for _, j := range jobs {
			select {
			case jobCh <- j:
			case <-ctx.Done():
				break
			}
		}
		close(jobCh)
	}()

	wg.Wait()
	return stats
}

// ---- Main ------------------------------------------------------------------

func main() {
	cfg := &Config{}

	flag.IntVar(&cfg.Workers, "workers", 100, "concurrent download goroutines")
	flag.StringVar(&cfg.OutDir, "out", ".", "output directory")
	flag.IntVar(&cfg.Retries, "retries", 3, "retry count per URL (0 = no retry)")
	flag.DurationVar(&cfg.RetryDelay, "retry-delay", time.Second, "base delay between retries (multiplied by attempt)")
	flag.DurationVar(&cfg.Timeout, "timeout", 60*time.Second, "per-request timeout")
	flag.BoolVar(&cfg.SkipExist, "skip-exist", true, "skip files that already exist")
	flag.IntVar(&cfg.RateLimit, "rate", 0, "max requests/sec per worker (0 = unlimited)")
	flag.IntVar(&cfg.ProgressSec, "progress", 5, "progress print interval in seconds")
	flag.StringVar(&cfg.UserAgent, "ua", "bulk-downloader/1.0", "User-Agent header")
	flag.BoolVar(&cfg.TLSSkip, "tls-skip", false, "skip TLS certificate verification")

	errFile := flag.String("errlog", "", "file to log errors to (default: stderr)")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, `bulk-downloader — replaces xargs+wget for massive file downloads

Usage:
  bulk-downloader [flags] <url-list-file>
  bulk-downloader [flags] -          # read from stdin

URL list format (one entry per line):
  https://example.com/file.rtf
  https://example.com/file.rtf  subdir/custom-name.rtf

Flags:
`)
		flag.PrintDefaults()
		fmt.Fprintf(os.Stderr, `
Examples:
  # Download RTF files from EDRSR, 200 workers, skip existing
  bulk-downloader -workers 200 -out /data/rtf -skip-exist urls.txt

  # Stream URLs from psql
  psql "$DSN" -Atc "SELECT doc_url||E'\t'||doc_id||'.rtf' FROM edrsr_documents" \
    | bulk-downloader -workers 300 -out /data/rtf -

  # Limit to 1000 req/s total (rate/workers per goroutine)
  bulk-downloader -workers 100 -rate 10 -out /data/rtf urls.txt
`)
	}

	flag.Parse()

	if flag.NArg() < 1 {
		flag.Usage()
		os.Exit(1)
	}

	// Open error log
	errWriter := io.Writer(os.Stderr)
	if *errFile != "" {
		f, err := os.OpenFile(*errFile, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
		if err != nil {
			log.Fatalf("open errlog: %v", err)
		}
		defer f.Close()
		errWriter = f
	}
	errLog := log.New(errWriter, "", log.LstdFlags)

	// Open input
	inputPath := flag.Arg(0)
	var inputReader io.Reader
	if inputPath == "-" {
		inputReader = os.Stdin
	} else {
		f, err := os.Open(inputPath)
		if err != nil {
			log.Fatalf("open input: %v", err)
		}
		defer f.Close()
		inputReader = f
	}

	// Ensure output dir exists
	if err := os.MkdirAll(cfg.OutDir, 0755); err != nil {
		log.Fatalf("mkdir -p %s: %v", cfg.OutDir, err)
	}

	// Read jobs
	fmt.Printf("Reading URL list...")
	jobs, err := readJobs(inputReader, cfg.OutDir)
	if err != nil {
		log.Fatalf("read jobs: %v", err)
	}
	fmt.Printf(" %d URLs\n", len(jobs))

	if len(jobs) == 0 {
		fmt.Println("Nothing to do.")
		return
	}

	// Context with graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sig
		fmt.Println("\nInterrupted, finishing in-flight requests...")
		cancel()
	}()

	client := newClient(cfg)
	start := time.Now()

	// Progress printer
	ticker := time.NewTicker(time.Duration(cfg.ProgressSec) * time.Second)
	defer ticker.Stop()

	var statsPtr *Stats
	var statsMu sync.Mutex
	doneCh := make(chan *Stats, 1)

	go func() {
		s := runWorkers(ctx, jobs, cfg, client, errLog)
		doneCh <- s
	}()

	total := int64(len(jobs))
loop:
	for {
		select {
		case <-ticker.C:
			statsMu.Lock()
			if statsPtr != nil {
				statsPtr.print(total, time.Since(start))
			}
			statsMu.Unlock()
		case s := <-doneCh:
			statsMu.Lock()
			statsPtr = s
			statsMu.Unlock()
			break loop
		}
	}

	// Wait for stats to be set then print final
	elapsed := time.Since(start)
	statsMu.Lock()
	if statsPtr != nil {
		statsPtr.print(total, elapsed)
	}
	statsMu.Unlock()

	fmt.Printf("\n\nDone in %s\n", elapsed.Round(time.Millisecond))

	if statsPtr != nil && statsPtr.errors.Load() > 0 {
		fmt.Fprintf(os.Stderr, "Finished with %d errors\n", statsPtr.errors.Load())
		os.Exit(1)
	}
}
