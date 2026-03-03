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
	"net"
	"net/http"
	"os"
	"os/exec"
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
	Workers      int
	OutDir       string
	Retries      int
	RetryDelay   time.Duration
	Timeout      time.Duration
	SkipExist    bool
	RateLimit    int    // requests per second, 0 = unlimited
	ProgressSec  int    // progress interval in seconds
	UserAgent    string
	TLSSkip      bool
	PipeCmd      string // if set, pipe response body through "sh -c <PipeCmd>", write stdout to destPath
	BindAddr     string // local IP to bind TCP connections to (forces specific interface via policy routing)
	ShardIndex   int    // 0-based shard index (process only lines where lineNum % ShardTotal == ShardIndex)
	ShardTotal   int    // total number of shards (0 = disabled)
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
	dialer := &net.Dialer{
		Timeout:   30 * time.Second,
		KeepAlive: 30 * time.Second,
	}
	if cfg.BindAddr != "" {
		dialer.LocalAddr = &net.TCPAddr{IP: net.ParseIP(cfg.BindAddr)}
	}
	tr := &http.Transport{
		DialContext:         dialer.DialContext,
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

	if cfg.PipeCmd != "" {
		return doPipe(ctx, resp.Body, job, cfg, stats)
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

// doPipe streams resp.Body through "sh -c <PipeCmd>" and writes stdout to job.DestPath.
// This avoids writing the raw (e.g. RTF) file to disk — only converted output is kept.
func doPipe(ctx context.Context, body io.Reader, job Job, cfg *Config, stats *Stats) error {
	dir := filepath.Dir(job.DestPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("mkdir %s: %w", dir, err)
	}

	tmp := job.DestPath + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return fmt.Errorf("create %s: %w", tmp, err)
	}

	cmd := exec.CommandContext(ctx, "sh", "-c", cfg.PipeCmd)
	cmd.Stdin = body
	cmd.Stdout = f
	// Suppress converter stderr to avoid noise from 300 concurrent processes.
	// Errors are surfaced via non-zero exit code.
	cmd.Stderr = io.Discard

	runErr := cmd.Run()
	f.Close()

	if runErr != nil {
		os.Remove(tmp)
		return fmt.Errorf("pipe cmd: %w", runErr)
	}

	fi, err := os.Stat(tmp)
	if err != nil {
		os.Remove(tmp)
		return fmt.Errorf("stat tmp: %w", err)
	}

	if err := os.Rename(tmp, job.DestPath); err != nil {
		os.Remove(tmp)
		return fmt.Errorf("rename %s: %w", tmp, err)
	}

	stats.bytes.Add(fi.Size())
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

// ---- URL list streaming ----------------------------------------------------

// parseLine parses one URL-list line into a Job. Returns ok=false for blank/comment lines.
func parseLine(line, outDir string) (Job, bool) {
	line = strings.TrimSpace(line)
	if line == "" || strings.HasPrefix(line, "#") {
		return Job{}, false
	}
	parts := strings.Fields(line)
	rawURL := parts[0]
	var destPath string
	if len(parts) >= 2 {
		destPath = filepath.Join(outDir, filepath.FromSlash(parts[1]))
	} else {
		segment := rawURL
		if idx := strings.LastIndex(rawURL, "/"); idx >= 0 {
			segment = rawURL[idx+1:]
		}
		if idx := strings.Index(segment, "?"); idx >= 0 {
			segment = segment[:idx]
		}
		if segment == "" {
			segment = "file"
		}
		destPath = filepath.Join(outDir, segment)
	}
	return Job{URL: rawURL, DestPath: destPath}, true
}

// streamJobs reads the URL list line-by-line and sends jobs directly into jobCh.
// Supports sharding: if cfg.ShardTotal > 0, only lines where lineNum%ShardTotal==ShardIndex are emitted.
// Returns total line count (including skipped shards/blanks) for progress display.
func streamJobs(ctx context.Context, r io.Reader, cfg *Config, jobCh chan<- Job) (total int64, err error) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	var lineNum int64
	for scanner.Scan() {
		job, ok := parseLine(scanner.Text(), cfg.OutDir)
		if !ok {
			continue
		}
		lineNum++
		total++
		if cfg.ShardTotal > 0 && int(lineNum%int64(cfg.ShardTotal)) != cfg.ShardIndex {
			continue
		}
		select {
		case jobCh <- job:
		case <-ctx.Done():
			return total, ctx.Err()
		}
	}
	return total, scanner.Err()
}

// ---- Worker pool -----------------------------------------------------------

func runWorkers(ctx context.Context, jobCh <-chan Job, cfg *Config, client *http.Client, errLog *log.Logger, stats *Stats) {

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

	wg.Wait()
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
	flag.StringVar(&cfg.PipeCmd, "pipe", "", "shell command to pipe each response body through; stdout is written to destPath (e.g. \"unrtf --text 2>/dev/null\")")
	flag.StringVar(&cfg.BindAddr, "bind", "", "local IP to bind outgoing TCP connections to (e.g. 178.150.37.129 to force enp11s0 via policy routing)")
	flag.IntVar(&cfg.ShardIndex, "shard-index", 0, "0-based shard index for this process (use with -shard-total)")
	flag.IntVar(&cfg.ShardTotal, "shard-total", 0, "split URL list into N shards; 0 = disabled")

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

  # Pipe mode: convert RTF→text on the fly, never write RTF to disk (~3x less space)
  # URL list must use .txt destinations:
  #   psql ... -Atc "SELECT doc_url, doc_id||'.txt' FROM edrsr_documents WHERE status=1"
  bulk-downloader -workers 300 -pipe "unrtf --text 2>/dev/null" -out /data/edrsr/txt urls-txt.txt

  # Pipe to tmpfs (fits 92 GB text in 132 GB RAM, avoid disk entirely):
  #   mount -t tmpfs -o size=100g tmpfs /mnt/edrsr
  bulk-downloader -workers 300 -pipe "unrtf --text 2>/dev/null" -out /mnt/edrsr urls-txt.txt

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

	// Validate shard flags
	if cfg.ShardTotal > 0 && (cfg.ShardIndex < 0 || cfg.ShardIndex >= cfg.ShardTotal) {
		log.Fatalf("-shard-index must be in [0, shard-total)")
	}

	// Ensure output dir exists
	if err := os.MkdirAll(cfg.OutDir, 0755); err != nil {
		log.Fatalf("mkdir -p %s: %v", cfg.OutDir, err)
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

	shardLabel := ""
	if cfg.ShardTotal > 0 {
		shardLabel = fmt.Sprintf(" [shard %d/%d]", cfg.ShardIndex, cfg.ShardTotal)
	}
	fmt.Printf("Starting%s — workers=%d out=%s\n", shardLabel, cfg.Workers, cfg.OutDir)

	// jobCh bridges the streaming reader and the worker pool.
	// Buffer = workers*4 so the reader stays slightly ahead.
	jobCh := make(chan Job, cfg.Workers*4)

	// Stats is created upfront so the progress ticker can read it during execution.
	stats := &Stats{}

	// Stream URL list → jobCh (runs in background goroutine)
	totalCh := make(chan int64, 1)
	go func() {
		n, err := streamJobs(ctx, inputReader, cfg, jobCh)
		close(jobCh)
		if err != nil && err != context.Canceled {
			log.Printf("stream jobs: %v", err)
		}
		totalCh <- n
	}()

	// Worker pool (runs in background goroutine)
	doneCh := make(chan struct{}, 1)
	go func() {
		runWorkers(ctx, jobCh, cfg, client, errLog, stats)
		close(doneCh)
	}()

	// Progress printer — total unknown until streaming finishes (shows 0% until then).
	ticker := time.NewTicker(time.Duration(cfg.ProgressSec) * time.Second)
	defer ticker.Stop()

	var total int64
	totalKnown := false

loop:
	for {
		select {
		case n := <-totalCh:
			total = n
			totalKnown = true
		case <-ticker.C:
			stats.print(total, time.Since(start))
		case <-doneCh:
			if !totalKnown {
				total = <-totalCh
			}
			break loop
		}
	}

	elapsed := time.Since(start)
	stats.print(total, elapsed)

	fmt.Printf("\n\nDone in %s\n", elapsed.Round(time.Millisecond))

	if stats.errors.Load() > 0 {
		fmt.Fprintf(os.Stderr, "Finished with %d errors\n", stats.errors.Load())
		os.Exit(1)
	}
}
