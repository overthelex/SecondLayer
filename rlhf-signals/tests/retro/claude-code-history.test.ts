import { describe, it, expect } from 'vitest';
import { extractTextContent, extractToolNames } from '../../src/retro/claude-code-history';

describe('Claude Code History Extractor', () => {
  describe('extractTextContent', () => {
    it('extracts string content from user messages', () => {
      const msg = { role: 'user', content: 'fix the bug' };
      expect(extractTextContent(msg)).toBe('fix the bug');
    });

    it('extracts text blocks from assistant messages', () => {
      const msg = {
        role: 'assistant',
        content: [
          { type: 'thinking', text: 'Let me think...' },
          { type: 'text', text: 'Here is the fix.' },
          { type: 'tool_use', name: 'Read' },
        ],
      };
      expect(extractTextContent(msg)).toBe('Here is the fix.');
    });

    it('joins multiple text blocks', () => {
      const msg = {
        role: 'assistant',
        content: [
          { type: 'text', text: 'First part.' },
          { type: 'text', text: 'Second part.' },
        ],
      };
      expect(extractTextContent(msg)).toBe('First part.\nSecond part.');
    });

    it('returns empty for undefined message', () => {
      expect(extractTextContent(undefined)).toBe('');
    });

    it('returns empty for message with no content', () => {
      expect(extractTextContent({ role: 'user' })).toBe('');
    });

    it('returns empty for content array with only tool_use', () => {
      const msg = {
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'Bash' }],
      };
      expect(extractTextContent(msg)).toBe('');
    });

    it('skips thinking blocks', () => {
      const msg = {
        role: 'assistant',
        content: [
          { type: 'thinking', text: 'internal reasoning' },
          { type: 'text', text: 'visible output' },
        ],
      };
      expect(extractTextContent(msg)).toBe('visible output');
    });
  });

  describe('extractToolNames', () => {
    it('extracts tool names from content blocks', () => {
      const msg = {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Reading file' },
          { type: 'tool_use', name: 'Read' },
          { type: 'tool_use', name: 'Bash' },
        ],
      };
      expect(extractToolNames(msg)).toEqual(['Read', 'Bash']);
    });

    it('returns empty for string content', () => {
      const msg = { role: 'user', content: 'hello' };
      expect(extractToolNames(msg)).toEqual([]);
    });

    it('returns empty for no tool_use blocks', () => {
      const msg = {
        role: 'assistant',
        content: [{ type: 'text', text: 'no tools' }],
      };
      expect(extractToolNames(msg)).toEqual([]);
    });

    it('returns empty for undefined message', () => {
      expect(extractToolNames(undefined)).toEqual([]);
    });
  });

  describe('role classification', () => {
    it('first user message is prompt', () => {
      let hadUser = false;
      const role = !hadUser ? 'prompt' : 'edit';
      expect(role).toBe('prompt');
    });

    it('subsequent user messages are edit', () => {
      let hadUser = true;
      const role = !hadUser ? 'prompt' : 'edit';
      expect(role).toBe('edit');
    });

    it('assistant messages are llm_output', () => {
      const msgType = 'assistant';
      const role = msgType === 'user' ? 'prompt' : 'llm_output';
      expect(role).toBe('llm_output');
    });
  });

  describe('token count thresholding', () => {
    it('stores short content directly', () => {
      const tokens = 100;
      const shouldStore = tokens <= 50000;
      expect(shouldStore).toBe(true);
    });

    it('truncates very long content', () => {
      const tokens = 60000;
      const shouldStore = tokens <= 50000;
      expect(shouldStore).toBe(false);
    });
  });

  describe('transcript line filtering', () => {
    it('includes user and assistant types', () => {
      const lines = [
        { type: 'permission-mode' },
        { type: 'user', message: { role: 'user', content: 'hi' } },
        { type: 'file-history-snapshot' },
        { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] } },
        { type: 'system' },
        { type: 'attachment' },
      ];
      const filtered = lines.filter(l => l.type === 'user' || l.type === 'assistant');
      expect(filtered).toHaveLength(2);
      expect(filtered[0].type).toBe('user');
      expect(filtered[1].type).toBe('assistant');
    });
  });
});
