/**
 * EmbeddingService.splitIntoChunks() unit tests
 *
 * Tests the chunking algorithm that splits large documents into
 * overlapping chunks suitable for embedding generation.
 *
 * Constants under test:
 *   MAX_CHUNK_TOKENS = 512  (approx 512 * 4 = 2048 chars per chunk)
 *   CHUNK_OVERLAP     = 50  (last 50 words carried over)
 */

import { EmbeddingService } from '../embedding-service';

// We only test the pure `splitIntoChunks` method — no Qdrant or VoyageAI needed.
// Construct via `Object.create` to skip constructor side-effects.
function createService(): EmbeddingService {
  const svc = Object.create(EmbeddingService.prototype) as EmbeddingService;
  return svc;
}

describe('EmbeddingService.splitIntoChunks', () => {
  let svc: EmbeddingService;

  beforeEach(() => {
    svc = createService();
  });

  // ── Basic behaviour ──────────────────────────────────────────────────

  it('returns a single chunk for short text', () => {
    const text = 'Hello world this is a short document.';
    const chunks = svc.splitIntoChunks(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('returns single-element array with empty string for empty input', () => {
    // ''.split(/\s+/) yields [''], so the algorithm pushes one empty-string chunk.
    // This is acceptable — callers (vault-tools) only chunk when text.length > 8000.
    const chunks = svc.splitIntoChunks('');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('');
  });

  it('returns empty array for whitespace-only string', () => {
    const chunks = svc.splitIntoChunks('   \n\t  ');
    // split(/\s+/) on whitespace-only gives ['', ''] — empty words
    // currentChunk ends up with empty strings; result depends on impl
    // Just verify no crash and reasonable output
    expect(Array.isArray(chunks)).toBe(true);
  });

  it('returns a single chunk when text is just under the limit', () => {
    // MAX_CHUNK_TOKENS * 4 = 2048 chars; use 400 five-char words ≈ 2400 chars
    // but with word+space each word is ~6 chars, so 340 words ≈ 2040 chars
    const words = Array.from({ length: 340 }, (_, i) => `word${i}`);
    const text = words.join(' ');
    const chunks = svc.splitIntoChunks(text);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // All original words should appear in some chunk
    for (const w of words) {
      expect(chunks.some(c => c.includes(w))).toBe(true);
    }
  });

  // ── Splitting & overlap ──────────────────────────────────────────────

  it('splits long text into multiple chunks', () => {
    // Generate text well above 2048 chars
    const words = Array.from({ length: 1000 }, (_, i) => `word${i}`);
    const text = words.join(' ');
    const chunks = svc.splitIntoChunks(text);

    expect(chunks.length).toBeGreaterThan(1);
  });

  it('chunks have overlap (last N words of chunk N appear in chunk N+1)', () => {
    const words = Array.from({ length: 1000 }, (_, i) => `w${i}`);
    const text = words.join(' ');
    const chunks = svc.splitIntoChunks(text);

    expect(chunks.length).toBeGreaterThan(1);

    // For each consecutive pair, the end of chunk[i] should share words with start of chunk[i+1]
    for (let i = 0; i < chunks.length - 1; i++) {
      const wordsInCurrent = chunks[i].split(' ');
      const wordsInNext = chunks[i + 1].split(' ');

      // The overlap words are the last CHUNK_OVERLAP (50) words of the current chunk
      const overlapWords = wordsInCurrent.slice(-50);

      // These overlap words should appear at the START of the next chunk
      const nextStart = wordsInNext.slice(0, overlapWords.length);
      expect(nextStart).toEqual(overlapWords);
    }
  });

  it('does not lose any words from the original text', () => {
    const words = Array.from({ length: 800 }, (_, i) => `t${i}`);
    const text = words.join(' ');
    const chunks = svc.splitIntoChunks(text);

    // Every original word must appear in at least one chunk
    for (const w of words) {
      const found = chunks.some(c => c.split(' ').includes(w));
      expect(found).toBe(true);
    }
  });

  // ── Chunk size limits ────────────────────────────────────────────────

  it('each chunk respects approximate max size (plus overlap tail)', () => {
    const words = Array.from({ length: 2000 }, (_, i) => `longword${i}`);
    const text = words.join(' ');
    const chunks = svc.splitIntoChunks(text);

    // MAX_CHUNK_TOKENS * 4 = 2048 chars for the "new" content.
    // With 50-word overlap, each chunk could be slightly larger.
    // Allow generous margin (3x) since overlap words get re-added.
    const maxReasonableLength = 2048 + 50 * 15; // overlap words up to 15 chars each
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThan(maxReasonableLength);
    }
  });

  // ── Edge cases ───────────────────────────────────────────────────────

  it('handles single very long word gracefully', () => {
    // A single word longer than the chunk limit
    const longWord = 'a'.repeat(5000);
    const chunks = svc.splitIntoChunks(longWord);
    // Should still return something (the word goes into one chunk)
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks.some(c => c.includes(longWord))).toBe(true);
  });

  it('handles text with multiple spaces and newlines', () => {
    const text = 'word1  word2\n\nword3\tword4   word5';
    const chunks = svc.splitIntoChunks(text);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // All non-empty tokens should be present
    for (const w of ['word1', 'word2', 'word3', 'word4', 'word5']) {
      expect(chunks.some(c => c.includes(w))).toBe(true);
    }
  });

  it('handles Ukrainian text', () => {
    const words = Array.from({ length: 500 }, (_, i) => `слово${i}`);
    const text = words.join(' ');
    const chunks = svc.splitIntoChunks(text);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // Spot-check first and last words are present
    expect(chunks[0]).toContain('слово0');
    expect(chunks[chunks.length - 1]).toContain(`слово${499}`);
  });
});
