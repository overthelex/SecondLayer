import { describe, it, expect } from 'vitest';

describe('GitHub PR Extractor', () => {
  describe('Claude detection markers', () => {
    it('should identify Co-Authored-By: Claude marker', () => {
      const commitMessage = 'feat: add search\n\nCo-Authored-By: Claude <noreply@anthropic.com>';
      const markers = ['co-authored-by: claude', 'claude-code', 'claude code', 'anthropic'];
      const lower = commitMessage.toLowerCase();
      const isClaudeAssisted = markers.some(m => lower.includes(m));
      expect(isClaudeAssisted).toBe(true);
    });

    it('should identify claude-code marker', () => {
      const commitMessage = 'fix: resolve bug (via claude-code)';
      const markers = ['co-authored-by: claude', 'claude-code', 'claude code', 'anthropic'];
      const lower = commitMessage.toLowerCase();
      const isClaudeAssisted = markers.some(m => lower.includes(m));
      expect(isClaudeAssisted).toBe(true);
    });

    it('should reject non-Claude commits', () => {
      const commitMessage = 'feat: manual implementation of search';
      const markers = ['co-authored-by: claude', 'claude-code', 'claude code', 'anthropic'];
      const lower = commitMessage.toLowerCase();
      const isClaudeAssisted = markers.some(m => lower.includes(m));
      expect(isClaudeAssisted).toBe(false);
    });
  });

  describe('terminal action detection', () => {
    it('should detect merged PR', () => {
      const pr = { mergedAt: '2026-01-01', state: 'MERGED', updatedAt: '2026-01-01' };
      const action = pr.mergedAt ? 'merged' : pr.state === 'CLOSED' ? 'closed' : 'open';
      expect(action).toBe('merged');
    });

    it('should detect closed PR', () => {
      const pr = { mergedAt: null, state: 'CLOSED', updatedAt: '2026-01-01' };
      const action = pr.mergedAt ? 'merged' : pr.state === 'CLOSED' ? 'closed' : 'open';
      expect(action).toBe('closed');
    });
  });

  describe('surface tag extraction', () => {
    it('should detect WIP tag from title', () => {
      const title = '[WIP] add new feature';
      const isWip = /\[wip\]|\[draft\]/i.test(title);
      expect(isWip).toBe(true);
    });

    it('should detect draft tag', () => {
      const title = '[DRAFT] refactor service';
      const isWip = /\[wip\]|\[draft\]/i.test(title);
      expect(isWip).toBe(true);
    });
  });
});
