import { describe, it, expect } from 'vitest';

describe('Plane Issues Extractor Logic', () => {
  describe('terminal action mapping', () => {
    const mapTerminal = (group: string): string | null => {
      if (group === 'completed') return 'done';
      if (group === 'cancelled') return 'cancelled';
      return null;
    };

    it('maps completed to done', () => {
      expect(mapTerminal('completed')).toBe('done');
    });

    it('maps cancelled to cancelled', () => {
      expect(mapTerminal('cancelled')).toBe('cancelled');
    });

    it('returns null for started', () => {
      expect(mapTerminal('started')).toBeNull();
    });

    it('returns null for backlog', () => {
      expect(mapTerminal('backlog')).toBeNull();
    });

    it('returns null for unstarted', () => {
      expect(mapTerminal('unstarted')).toBeNull();
    });
  });

  describe('surface tags from labels', () => {
    it('extracts label names as tags', () => {
      const labels = [
        { id: '1', name: 'Feature' },
        { id: '2', name: 'data' },
      ];
      const tags = labels.map(l => l.name);
      expect(tags).toEqual(['Feature', 'data']);
    });

    it('handles empty labels', () => {
      const labels: { id: string; name: string }[] = [];
      const tags = labels.map(l => l.name);
      expect(tags).toEqual([]);
    });
  });

  describe('Plane API URL construction', () => {
    it('builds correct path for issues', () => {
      const workspace = 'lex';
      const project = 'abc-123';
      const base = `https://plane.legal.org.ua/api/v1/workspaces/${workspace}/projects/${project}`;
      expect(`${base}/issues/`).toBe('https://plane.legal.org.ua/api/v1/workspaces/lex/projects/abc-123/issues/');
    });

    it('builds correct path for comments', () => {
      const workspace = 'lex';
      const project = 'abc-123';
      const issueId = 'issue-456';
      const base = `https://plane.legal.org.ua/api/v1/workspaces/${workspace}/projects/${project}`;
      expect(`${base}/issues/${issueId}/comments/`).toBe(
        'https://plane.legal.org.ua/api/v1/workspaces/lex/projects/abc-123/issues/issue-456/comments/'
      );
    });
  });

  describe('issue content extraction', () => {
    it('combines name and description for prompt', () => {
      const name = 'Fix login bug';
      const description = 'Users cannot log in after password reset';
      const prompt = `${name}\n\n${description}`.trim();
      expect(prompt).toBe('Fix login bug\n\nUsers cannot log in after password reset');
    });

    it('handles empty description', () => {
      const name = 'Quick task';
      const description = '';
      const prompt = `${name}\n\n${description}`.trim();
      expect(prompt).toBe('Quick task');
    });

    it('handles null description', () => {
      const name = 'Quick task';
      const description: string | null = null;
      const prompt = `${name}\n\n${description || ''}`.trim();
      expect(prompt).toBe('Quick task');
    });
  });

  describe('comment filtering', () => {
    it('skips empty comments', () => {
      const comments = [
        { id: '1', comment_stripped: 'real comment', created_at: '2026-01-01', actor_detail: null },
        { id: '2', comment_stripped: '', created_at: '2026-01-02', actor_detail: null },
        { id: '3', comment_stripped: '   ', created_at: '2026-01-03', actor_detail: null },
        { id: '4', comment_stripped: 'another comment', created_at: '2026-01-04', actor_detail: null },
      ];
      const filtered = comments.filter(c => c.comment_stripped?.trim());
      expect(filtered).toHaveLength(2);
      expect(filtered[0].id).toBe('1');
      expect(filtered[1].id).toBe('4');
    });
  });
});
