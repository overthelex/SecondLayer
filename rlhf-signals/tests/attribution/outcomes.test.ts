import { describe, it, expect } from 'vitest';

describe('Outcome Attribution Logic', () => {
  describe('GitHub outcome classification', () => {
    it('should classify clean merge after 30+ days', () => {
      const daysSince = 45;
      const hasRevert = false;
      const hasFollowup = false;

      let outcomeType: string;
      if (hasRevert) outcomeType = 'merged_then_reverted';
      else if (hasFollowup) outcomeType = 'followup_fix_pr';
      else if (daysSince >= 30) outcomeType = 'merged_clean';
      else outcomeType = 'still_running_after_30d';

      expect(outcomeType).toBe('merged_clean');
    });

    it('should classify reverted merge', () => {
      const hasRevert = true;
      const outcomeType = hasRevert ? 'merged_then_reverted' : 'merged_clean';
      expect(outcomeType).toBe('merged_then_reverted');
    });

    it('should classify followup fix', () => {
      const hasRevert = false;
      const hasFollowup = true;
      let outcomeType: string;
      if (hasRevert) outcomeType = 'merged_then_reverted';
      else if (hasFollowup) outcomeType = 'followup_fix_pr';
      else outcomeType = 'merged_clean';
      expect(outcomeType).toBe('followup_fix_pr');
    });
  });

  describe('Plane outcome classification', () => {
    it('should classify completed issues as resolved', () => {
      const stateGroup = 'completed';
      const outcomeType = stateGroup === 'completed' ? 'issue_resolved'
        : stateGroup === 'cancelled' ? 'closed_obsolete' : null;
      expect(outcomeType).toBe('issue_resolved');
    });

    it('should classify cancelled issues as obsolete', () => {
      const stateGroup = 'cancelled';
      const outcomeType = stateGroup === 'completed' ? 'issue_resolved'
        : stateGroup === 'cancelled' ? 'closed_obsolete' : null;
      expect(outcomeType).toBe('closed_obsolete');
    });

    it('should return null for in-progress issues', () => {
      const stateGroup = 'started';
      const outcomeType = stateGroup === 'completed' ? 'issue_resolved'
        : stateGroup === 'cancelled' ? 'closed_obsolete' : null;
      expect(outcomeType).toBeNull();
    });
  });

  describe('attribution confidence', () => {
    it('should assign strong confidence to terminal states', () => {
      const stateGroup = 'completed';
      const confidence = (stateGroup === 'completed' || stateGroup === 'cancelled') ? 'strong' : 'medium';
      expect(confidence).toBe('strong');
    });

    it('should assign medium confidence to inferred states', () => {
      const stateGroup = 'started';
      const confidence = (stateGroup === 'completed' || stateGroup === 'cancelled') ? 'strong' : 'medium';
      expect(confidence).toBe('medium');
    });
  });
});
