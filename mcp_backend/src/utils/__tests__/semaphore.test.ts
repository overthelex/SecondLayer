import { Semaphore } from '../semaphore';

describe('Semaphore', () => {
  describe('basic acquisition', () => {
    it('should allow acquisition up to max concurrency', async () => {
      const sem = new Semaphore(3);
      const r1 = await sem.acquire();
      const r2 = await sem.acquire();
      const r3 = await sem.acquire();

      expect(sem.inFlight).toBe(3);
      expect(sem.pending).toBe(0);

      r1(); r2(); r3();
    });

    it('should queue requests beyond max concurrency', async () => {
      const sem = new Semaphore(2);
      const r1 = await sem.acquire();
      const r2 = await sem.acquire();

      // This one should be queued
      let resolved = false;
      const p3 = sem.acquire().then(r => { resolved = true; return r; });

      expect(sem.inFlight).toBe(2);
      expect(sem.pending).toBe(1);
      expect(resolved).toBe(false);

      // Release one slot
      r1();
      const r3 = await p3;
      expect(resolved).toBe(true);
      expect(sem.inFlight).toBe(2);
      expect(sem.pending).toBe(0);

      r2(); r3();
    });

    it('should resolve queued requests in FIFO order', async () => {
      const sem = new Semaphore(1);
      const order: number[] = [];

      const r1 = await sem.acquire();

      const p2 = sem.acquire().then(r => { order.push(2); return r; });
      const p3 = sem.acquire().then(r => { order.push(3); return r; });

      r1();
      const r2 = await p2;
      r2();
      const r3 = await p3;
      r3();

      expect(order).toEqual([2, 3]);
    });
  });

  describe('release behaviour', () => {
    it('should decrement inFlight on release', async () => {
      const sem = new Semaphore(2);
      const release = await sem.acquire();

      expect(sem.inFlight).toBe(1);
      release();
      expect(sem.inFlight).toBe(0);
    });

    it('should not go below 0 on double release (defensive guard)', async () => {
      const sem = new Semaphore(2);
      const release = await sem.acquire();
      release();
      release(); // double release
      expect(sem.inFlight).toBe(0);
    });
  });

  describe('pending getter', () => {
    it('should report 0 pending when under capacity', async () => {
      const sem = new Semaphore(5);
      await sem.acquire();
      expect(sem.pending).toBe(0);
    });

    it('should report correct number of pending waiters', async () => {
      const sem = new Semaphore(1);
      const r1 = await sem.acquire();

      sem.acquire(); // pending 1
      sem.acquire(); // pending 2

      expect(sem.pending).toBe(2);
      r1();
    });
  });

  describe('concurrency limiting in practice', () => {
    it('should limit concurrent async tasks to max', async () => {
      const sem = new Semaphore(2);
      let concurrent = 0;
      let maxConcurrent = 0;

      const task = async () => {
        const release = await sem.acquire();
        try {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          // Simulate async work
          await new Promise(r => setImmediate(r));
          concurrent--;
        } finally {
          release();
        }
      };

      await Promise.all([task(), task(), task(), task(), task()]);

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe('semaphore with max=1 (mutex)', () => {
    it('should serialize access when max=1', async () => {
      const sem = new Semaphore(1);
      const log: string[] = [];

      const taskA = async () => {
        const release = await sem.acquire();
        log.push('A:start');
        await new Promise(r => setImmediate(r));
        log.push('A:end');
        release();
      };

      const taskB = async () => {
        const release = await sem.acquire();
        log.push('B:start');
        log.push('B:end');
        release();
      };

      await Promise.all([taskA(), taskB()]);

      // A must complete before B starts
      expect(log.indexOf('A:end')).toBeLessThan(log.indexOf('B:start'));
    });
  });
});
