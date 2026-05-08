import { describe, it, expect } from 'vitest';
import {
  PRNode,
  isClaudeAssisted,
  hasMultipleHumanAuthors,
  isMinimalDiff,
  terminalAction,
  surfaceTags,
  simpleTokenize,
  tokenLevenshtein,
} from '../../src/retro/github-pr';

function makePR(overrides: Partial<PRNode> = {}): PRNode {
  return {
    number: 100,
    title: 'feat: add search',
    body: 'Implements full-text search',
    state: 'MERGED',
    mergedAt: '2026-01-15T10:00:00Z',
    closedAt: null,
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z',
    additions: 200,
    deletions: 50,
    isDraft: false,
    labels: { nodes: [] },
    commits: {
      nodes: [{
        commit: {
          message: 'feat: add search',
          messageBody: 'Co-Authored-By: Claude <noreply@anthropic.com>',
          authoredDate: '2026-01-10T10:00:00Z',
          author: { user: { login: 'overthelex' } },
          additions: 200,
          deletions: 50,
        },
      }],
      totalCount: 1,
    },
    reviews: { nodes: [] },
    closingIssuesReferences: { nodes: [] },
    ...overrides,
  };
}

describe('isClaudeAssisted', () => {
  it('detects Co-Authored-By: Claude in messageBody', () => {
    expect(isClaudeAssisted(makePR())).toBe(true);
  });

  it('detects claude-code in commit message', () => {
    const pr = makePR({
      commits: {
        nodes: [{
          commit: {
            message: 'fix: resolve bug (claude-code)',
            messageBody: '',
            authoredDate: '2026-01-10T10:00:00Z',
            author: { user: { login: 'overthelex' } },
            additions: 20,
            deletions: 5,
          },
        }],
        totalCount: 1,
      },
    });
    expect(isClaudeAssisted(pr)).toBe(true);
  });

  it('detects anthropic keyword', () => {
    const pr = makePR({
      commits: {
        nodes: [{
          commit: {
            message: 'feat: new feature',
            messageBody: 'Built with Anthropic tools',
            authoredDate: '2026-01-10T10:00:00Z',
            author: { user: { login: 'overthelex' } },
            additions: 50,
            deletions: 10,
          },
        }],
        totalCount: 1,
      },
    });
    expect(isClaudeAssisted(pr)).toBe(true);
  });

  it('returns false for manual commits', () => {
    const pr = makePR({
      commits: {
        nodes: [{
          commit: {
            message: 'manual: add feature by hand',
            messageBody: '',
            authoredDate: '2026-01-10T10:00:00Z',
            author: { user: { login: 'overthelex' } },
            additions: 100,
            deletions: 20,
          },
        }],
        totalCount: 1,
      },
    });
    expect(isClaudeAssisted(pr)).toBe(false);
  });

  it('checks all commits, not just the first', () => {
    const pr = makePR({
      commits: {
        nodes: [
          {
            commit: {
              message: 'initial manual commit',
              messageBody: '',
              authoredDate: '2026-01-10T10:00:00Z',
              author: { user: { login: 'overthelex' } },
              additions: 50,
              deletions: 10,
            },
          },
          {
            commit: {
              message: 'fix from claude-code',
              messageBody: '',
              authoredDate: '2026-01-11T10:00:00Z',
              author: { user: { login: 'overthelex' } },
              additions: 10,
              deletions: 2,
            },
          },
        ],
        totalCount: 2,
      },
    });
    expect(isClaudeAssisted(pr)).toBe(true);
  });
});

describe('hasMultipleHumanAuthors', () => {
  it('returns false for single author', () => {
    expect(hasMultipleHumanAuthors(makePR())).toBe(false);
  });

  it('returns true for two distinct authors', () => {
    const pr = makePR({
      commits: {
        nodes: [
          {
            commit: {
              message: 'commit 1',
              messageBody: '',
              authoredDate: '2026-01-10T10:00:00Z',
              author: { user: { login: 'alice' } },
              additions: 50,
              deletions: 10,
            },
          },
          {
            commit: {
              message: 'commit 2',
              messageBody: '',
              authoredDate: '2026-01-11T10:00:00Z',
              author: { user: { login: 'bob' } },
              additions: 20,
              deletions: 5,
            },
          },
        ],
        totalCount: 2,
      },
    });
    expect(hasMultipleHumanAuthors(pr)).toBe(true);
  });

  it('returns false when same author has multiple commits', () => {
    const pr = makePR({
      commits: {
        nodes: [
          {
            commit: {
              message: 'commit 1',
              messageBody: '',
              authoredDate: '2026-01-10T10:00:00Z',
              author: { user: { login: 'overthelex' } },
              additions: 50,
              deletions: 10,
            },
          },
          {
            commit: {
              message: 'commit 2',
              messageBody: '',
              authoredDate: '2026-01-11T10:00:00Z',
              author: { user: { login: 'overthelex' } },
              additions: 20,
              deletions: 5,
            },
          },
        ],
        totalCount: 2,
      },
    });
    expect(hasMultipleHumanAuthors(pr)).toBe(false);
  });

  it('handles null author gracefully', () => {
    const pr = makePR({
      commits: {
        nodes: [{
          commit: {
            message: 'commit',
            messageBody: '',
            authoredDate: '2026-01-10T10:00:00Z',
            author: { user: null },
            additions: 50,
            deletions: 10,
          },
        }],
        totalCount: 1,
      },
    });
    expect(hasMultipleHumanAuthors(pr)).toBe(false);
  });
});

describe('isMinimalDiff', () => {
  it('returns true for tiny changes (<10 lines)', () => {
    expect(isMinimalDiff(makePR({ additions: 3, deletions: 2 }))).toBe(true);
  });

  it('returns false for substantial changes', () => {
    expect(isMinimalDiff(makePR({ additions: 100, deletions: 50 }))).toBe(false);
  });

  it('returns false for exactly 10 lines', () => {
    expect(isMinimalDiff(makePR({ additions: 7, deletions: 3 }))).toBe(false);
  });

  it('returns true for 9 lines total', () => {
    expect(isMinimalDiff(makePR({ additions: 5, deletions: 4 }))).toBe(true);
  });
});

describe('terminalAction', () => {
  it('returns merged when mergedAt is set', () => {
    expect(terminalAction(makePR())).toBe('merged');
  });

  it('returns closed for CLOSED state without merge', () => {
    expect(terminalAction(makePR({
      mergedAt: null,
      state: 'CLOSED',
    }))).toBe('closed');
  });

  it('returns abandoned for stale OPEN PRs (>90 days)', () => {
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    expect(terminalAction(makePR({
      mergedAt: null,
      state: 'OPEN',
      updatedAt: oldDate,
    }))).toBe('abandoned');
  });

  it('returns open for recently active OPEN PRs', () => {
    expect(terminalAction(makePR({
      mergedAt: null,
      state: 'OPEN',
      updatedAt: new Date().toISOString(),
    }))).toBe('open');
  });
});

describe('surfaceTags', () => {
  it('returns empty array for plain PR', () => {
    expect(surfaceTags(makePR())).toEqual([]);
  });

  it('detects [WIP] in title', () => {
    expect(surfaceTags(makePR({ title: '[WIP] work in progress' }))).toContain('wip');
  });

  it('detects [draft] in title case-insensitive', () => {
    expect(surfaceTags(makePR({ title: '[Draft] early version' }))).toContain('wip');
  });

  it('detects isDraft flag', () => {
    expect(surfaceTags(makePR({ isDraft: true }))).toContain('wip');
  });

  it('detects bug label', () => {
    const pr = makePR({ labels: { nodes: [{ name: 'bug' }] } });
    expect(surfaceTags(pr)).toContain('bugfix');
  });

  it('detects feature label', () => {
    const pr = makePR({ labels: { nodes: [{ name: 'feat: new' }] } });
    expect(surfaceTags(pr)).toContain('feature');
  });

  it('detects refactor label', () => {
    const pr = makePR({ labels: { nodes: [{ name: 'refactoring' }] } });
    expect(surfaceTags(pr)).toContain('refactoring');
  });

  it('combines multiple tags', () => {
    const pr = makePR({
      isDraft: true,
      labels: { nodes: [{ name: 'bug' }, { name: 'feat' }] },
    });
    const tags = surfaceTags(pr);
    expect(tags).toContain('wip');
    expect(tags).toContain('bugfix');
    expect(tags).toContain('feature');
  });
});

describe('simpleTokenize', () => {
  it('splits on whitespace', () => {
    expect(simpleTokenize('hello world')).toEqual(['hello', 'world']);
  });

  it('handles multiple spaces', () => {
    expect(simpleTokenize('hello   world')).toEqual(['hello', 'world']);
  });

  it('returns empty for empty string', () => {
    expect(simpleTokenize('')).toEqual([]);
  });

  it('handles tabs and newlines', () => {
    expect(simpleTokenize('a\tb\nc')).toEqual(['a', 'b', 'c']);
  });
});

describe('tokenLevenshtein', () => {
  it('returns 0 distance for identical strings', () => {
    const result = tokenLevenshtein('hello world', 'hello world');
    expect(result.distance).toBe(0);
    expect(result.normalized).toBe(0);
  });

  it('returns non-zero for different strings', () => {
    const result = tokenLevenshtein('hello world', 'goodbye world');
    expect(result.distance).toBeGreaterThan(0);
    expect(result.normalized).toBeGreaterThan(0);
    expect(result.normalized).toBeLessThanOrEqual(1);
  });

  it('returns high distance for completely different content', () => {
    const result = tokenLevenshtein('alpha beta gamma', 'one two three four five');
    expect(result.normalized).toBeGreaterThan(0.5);
  });

  it('handles empty strings', () => {
    const result = tokenLevenshtein('', '');
    expect(result.distance).toBe(0);
    expect(result.normalized).toBe(0);
  });

  it('handles one empty string', () => {
    const result = tokenLevenshtein('hello world', '');
    expect(result.distance).toBeGreaterThan(0);
    expect(result.normalized).toBe(1);
  });
});

describe('contentHash', () => {
  it('produces consistent SHA-256 hashes', async () => {
    const { contentHash } = await import('../../src/schema/queries');
    const h1 = contentHash('test');
    const h2 = contentHash('test');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it('different content produces different hashes', async () => {
    const { contentHash } = await import('../../src/schema/queries');
    expect(contentHash('a')).not.toBe(contentHash('b'));
  });
});
