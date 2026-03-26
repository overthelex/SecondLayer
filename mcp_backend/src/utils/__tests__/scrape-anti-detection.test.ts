import { getRandomUserAgent, getRandomDelay, sleepWithJitter } from '../scrape-anti-detection';

describe('scrape-anti-detection', () => {
  describe('getRandomUserAgent', () => {
    it('should return a non-empty string', () => {
      const ua = getRandomUserAgent();
      expect(typeof ua).toBe('string');
      expect(ua.length).toBeGreaterThan(0);
    });

    it('should return a valid Mozilla-based user agent string', () => {
      const ua = getRandomUserAgent();
      expect(ua).toMatch(/^Mozilla\/5\.0/);
    });

    it('should return one of the known user agent strings', () => {
      const knownAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
      ];

      // Run many times to increase coverage probability
      for (let i = 0; i < 50; i++) {
        const ua = getRandomUserAgent();
        expect(knownAgents).toContain(ua);
      }
    });

    it('should return different agents over multiple calls (randomness)', () => {
      const agents = new Set<string>();
      for (let i = 0; i < 100; i++) {
        agents.add(getRandomUserAgent());
      }
      // With 100 calls across 4 agents, we should almost certainly see more than 1
      expect(agents.size).toBeGreaterThan(1);
    });
  });

  describe('getRandomDelay', () => {
    it('should return a number within the specified range', () => {
      const delay = getRandomDelay(100, 500);
      expect(delay).toBeGreaterThanOrEqual(100);
      expect(delay).toBeLessThan(500);
    });

    it('should return minMs when min === max', () => {
      // When min === max, random() * 0 === 0, so result is min
      const delay = getRandomDelay(200, 200);
      expect(delay).toBe(200);
    });

    it('should handle zero base delay', () => {
      const delay = getRandomDelay(0, 100);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(100);
    });

    it('should return a number (not integer required)', () => {
      const delay = getRandomDelay(0, 1000);
      expect(typeof delay).toBe('number');
    });

    it('should produce values across the range over many calls', () => {
      const values = Array.from({ length: 100 }, () => getRandomDelay(0, 1000));
      const min = Math.min(...values);
      const max = Math.max(...values);
      // Over 100 samples in [0, 1000) the spread should be > 200
      expect(max - min).toBeGreaterThan(200);
    });
  });

  describe('sleepWithJitter', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should resolve after approximately baseMs time', async () => {
      const promise = sleepWithJitter(100, 0); // jitterMs=0 → no jitter
      jest.runAllTimers();
      await promise;
      // If it resolves without hanging, the test passes
    });

    it('should not reject even if computed delay is negative (clamped to 0)', async () => {
      // Large jitter can produce negative delay; implementation uses Math.max(0, delay)
      const promise = sleepWithJitter(0, 1000);
      jest.runAllTimers();
      await expect(promise).resolves.toBeUndefined();
    });

    it('should return undefined on resolution', async () => {
      const promise = sleepWithJitter(10, 0);
      jest.runAllTimers();
      const result = await promise;
      expect(result).toBeUndefined();
    });
  });
});
