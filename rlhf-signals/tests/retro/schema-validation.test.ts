import { describe, it, expect } from 'vitest';
import {
  WorkflowSession,
  WorkflowSessionInsert,
  WorkflowArtifact,
  WorkflowArtifactInsert,
  WorkflowEdit,
  WorkflowOutcome,
  SessionSource,
  CaptureMode,
  ConsentStatus,
  ArtifactRole,
  SemanticChangeClass,
  AttributionConfidence,
  OutcomeType,
} from '../../src/schema';

describe('Schema Validation', () => {
  describe('enums', () => {
    it('should accept valid session sources', () => {
      expect(SessionSource.parse('github_pr')).toBe('github_pr');
      expect(SessionSource.parse('plane_issue')).toBe('plane_issue');
      expect(SessionSource.parse('claude_code_transcript')).toBe('claude_code_transcript');
      expect(SessionSource.parse('mcp_call')).toBe('mcp_call');
      expect(SessionSource.parse('manual')).toBe('manual');
    });

    it('should reject invalid session sources', () => {
      expect(() => SessionSource.parse('invalid')).toThrow();
    });

    it('should accept valid capture modes', () => {
      expect(CaptureMode.parse('retro')).toBe('retro');
      expect(CaptureMode.parse('live')).toBe('live');
    });

    it('should accept valid semantic change classes', () => {
      const classes = ['cosmetic', 'reorganization', 'factual_correction', 'tone_adjustment', 'substantive_rewrite', 'rejection'];
      for (const cls of classes) {
        expect(SemanticChangeClass.parse(cls)).toBe(cls);
      }
    });

    it('should accept valid outcome types', () => {
      expect(OutcomeType.parse('merged_clean')).toBe('merged_clean');
      expect(OutcomeType.parse('issue_resolved')).toBe('issue_resolved');
      expect(OutcomeType.parse('response_received')).toBe('response_received');
    });
  });

  describe('WorkflowSessionInsert', () => {
    it('should validate a valid session insert', () => {
      const input = {
        source: 'github_pr',
        external_ref: '123',
        created_at: new Date(),
        capture_mode: 'retro',
      };
      const result = WorkflowSessionInsert.parse(input);
      expect(result.source).toBe('github_pr');
      expect(result.consent_status).toBe('pending');
      expect(result.surface_tags).toEqual([]);
    });

    it('should reject session with empty external_ref', () => {
      const input = {
        source: 'github_pr',
        external_ref: '',
        created_at: new Date(),
        capture_mode: 'retro',
      };
      expect(() => WorkflowSessionInsert.parse(input)).toThrow();
    });
  });

  describe('WorkflowArtifactInsert', () => {
    it('should validate a valid artifact insert', () => {
      const input = {
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        role: 'prompt',
        sequence_index: 0,
        content_hash: 'abc123',
        timestamp: new Date(),
      };
      const result = WorkflowArtifactInsert.parse(input);
      expect(result.role).toBe('prompt');
      expect(result.content_raw).toBeNull();
    });
  });

  describe('content hash utility', () => {
    it('should produce consistent hashes', async () => {
      const { contentHash } = await import('../../src/schema/queries');
      const hash1 = contentHash('test content');
      const hash2 = contentHash('test content');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('should produce different hashes for different content', async () => {
      const { contentHash } = await import('../../src/schema/queries');
      const hash1 = contentHash('content A');
      const hash2 = contentHash('content B');
      expect(hash1).not.toBe(hash2);
    });
  });
});
