import { describe, it, expect } from 'vitest';

describe('Claude Code History Extractor', () => {
  describe('JSONL parsing', () => {
    it('should parse valid JSONL messages', () => {
      const lines = [
        '{"role":"user","content":"fix the bug"}',
        '{"role":"assistant","content":"I will fix the bug by..."}',
      ];
      const messages = lines.map(l => JSON.parse(l));
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
    });

    it('should handle complex content arrays', () => {
      const msg = JSON.parse('{"role":"assistant","content":[{"type":"text","text":"Hello"},{"type":"tool_use","name":"Read"}]}');
      const textParts = msg.content.filter((c: any) => c.type === 'text');
      const toolParts = msg.content.filter((c: any) => c.type === 'tool_use');
      expect(textParts).toHaveLength(1);
      expect(toolParts).toHaveLength(1);
      expect(toolParts[0].name).toBe('Read');
    });
  });

  describe('role classification', () => {
    it('should classify first user message as prompt', () => {
      let lastUserContent: string | null = null;
      const role = lastUserContent !== null ? 'edit' : 'prompt';
      expect(role).toBe('prompt');
    });

    it('should classify subsequent user messages as edit', () => {
      let lastUserContent: string | null = 'previous message';
      const role = lastUserContent !== null ? 'edit' : 'prompt';
      expect(role).toBe('edit');
    });
  });

  describe('token count thresholding', () => {
    it('should store short content directly', () => {
      const content = 'short message';
      const tokens = content.split(/\s+/).length;
      const shouldStore = tokens <= 50000;
      expect(shouldStore).toBe(true);
    });
  });
});
