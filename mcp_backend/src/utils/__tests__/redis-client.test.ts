jest.mock('../logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock the redis module before importing the module under test
const mockRedisOn = jest.fn();
const mockRedisConnect = jest.fn().mockResolvedValue(undefined);
const mockRedisQuit = jest.fn().mockResolvedValue(undefined);
let mockIsOpen = true;

const mockRedisInstance = {
  on: mockRedisOn,
  connect: mockRedisConnect,
  quit: mockRedisQuit,
  get isOpen() { return mockIsOpen; },
};

const mockCreateClient = jest.fn().mockReturnValue(mockRedisInstance);

jest.mock('redis', () => ({
  createClient: (...args: any[]) => mockCreateClient(...args),
}));

// Import after mocks are set up
import { getRedisClient, disconnectRedis, isRedisConnected } from '../redis-client';

// Helper to reset the singleton between tests
async function resetSingleton() {
  await disconnectRedis();
  // disconnectRedis sets the module-level `redisClient` to null via quit()
  mockIsOpen = true;
}

describe('redis-client', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedisConnect.mockResolvedValue(undefined);
    mockRedisQuit.mockResolvedValue(undefined);
    mockIsOpen = true;
    await resetSingleton();
    // After resetSingleton, redisClient is null — clear mock call counts again
    jest.clearAllMocks();
  });

  describe('getRedisClient', () => {
    it('should create a redis client with the configured URL on first call', async () => {
      const client = await getRedisClient();
      expect(mockCreateClient).toHaveBeenCalledTimes(1);
      expect(mockRedisConnect).toHaveBeenCalledTimes(1);
      expect(client).toBe(mockRedisInstance);
    });

    it('should use REDIS_URL env var when set', async () => {
      process.env.REDIS_URL = 'redis://custom-host:6380';
      await getRedisClient();
      expect(mockCreateClient).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'redis://custom-host:6380' }),
      );
      delete process.env.REDIS_URL;
    });

    it('should fall back to redis://localhost:6379 when REDIS_URL is not set', async () => {
      delete process.env.REDIS_URL;
      await getRedisClient();
      expect(mockCreateClient).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'redis://localhost:6379' }),
      );
    });

    it('should configure keepAlive + pingInterval so dead connections fail fast', async () => {
      delete process.env.REDIS_URL;
      await getRedisClient();
      const opts = mockCreateClient.mock.calls[0][0];
      expect(opts.pingInterval).toBeGreaterThan(0);
      expect(opts.socket?.keepAlive).toBe(true);
    });

    it('should return the same singleton on repeated calls', async () => {
      const c1 = await getRedisClient();
      const c2 = await getRedisClient();
      expect(mockCreateClient).toHaveBeenCalledTimes(1);
      expect(c1).toBe(c2);
    });

    it('should return null and log warning when connection fails', async () => {
      mockRedisConnect.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const client = await getRedisClient();
      expect(client).toBeNull();
      const { logger } = require('../logger');
      expect(logger.warn).toHaveBeenCalled();
    });

    // The names must be the ones node-redis actually emits. This test used to require
    // 'disconnect', which node-redis has never emitted, so it locked in a listener that could
    // never fire and a closed socket was logged nowhere.
    it('should register event handlers the client actually emits', async () => {
      await getRedisClient();
      const eventNames = mockRedisOn.mock.calls.map((c: any[]) => c[0]);
      expect(eventNames).toContain('error');
      expect(eventNames).toContain('connect');
      expect(eventNames).toContain('end');
      expect(eventNames).toContain('reconnecting');
      expect(eventNames).not.toContain('disconnect');
    });
  });

  describe('disconnectRedis', () => {
    it('should call quit() on an active client', async () => {
      await getRedisClient(); // create the singleton
      jest.clearAllMocks();
      await disconnectRedis();
      expect(mockRedisQuit).toHaveBeenCalledTimes(1);
    });

    it('should do nothing when no client is connected', async () => {
      // singleton is already null after beforeEach
      await disconnectRedis();
      expect(mockRedisQuit).not.toHaveBeenCalled();
    });

    it('should set client to null even when quit throws', async () => {
      await getRedisClient();
      mockRedisQuit.mockRejectedValueOnce(new Error('quit failed'));
      await disconnectRedis(); // should not throw
      // After failed quit, client should still be nulled
      jest.clearAllMocks();
      const client = await getRedisClient(); // fresh connection
      expect(mockCreateClient).toHaveBeenCalledTimes(1); // proves null was set
      await resetSingleton();
    });
  });

  describe('isRedisConnected', () => {
    it('should return false when client has not been created', () => {
      expect(isRedisConnected()).toBe(false);
    });

    it('should return true when client is open', async () => {
      mockIsOpen = true;
      await getRedisClient();
      expect(isRedisConnected()).toBe(true);
    });

    it('should return false when client exists but isOpen is false', async () => {
      await getRedisClient();
      mockIsOpen = false;
      expect(isRedisConnected()).toBe(false);
    });
  });
});
