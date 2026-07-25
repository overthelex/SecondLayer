import { withLLMRetry } from '../llm-retry';

describe('withLLMRetry', () => {
  it('returns result on first success', async () => {
    const fn = jest.fn().mockResolvedValue({ content: 'ok' });
    const result = await withLLMRetry(fn, { operationName: 'test' });
    expect(result).toEqual({ content: 'ok' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on rate limit (429) and succeeds', async () => {
    const error429 = Object.assign(new Error('rate limit'), { status: 429 });
    const fn = jest.fn()
      .mockRejectedValueOnce(error429)
      .mockResolvedValueOnce({ content: 'ok' });

    const result = await withLLMRetry(fn, {
      operationName: 'test',
      maxRetries: 2,
      baseDelayMs: 10,
    });

    expect(result).toEqual({ content: 'ok' });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on 500 server error', async () => {
    const error500 = Object.assign(new Error('internal'), { status: 500 });
    const fn = jest.fn()
      .mockRejectedValueOnce(error500)
      .mockResolvedValueOnce({ content: 'recovered' });

    const result = await withLLMRetry(fn, {
      operationName: 'test',
      maxRetries: 1,
      baseDelayMs: 10,
    });

    expect(result).toEqual({ content: 'recovered' });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on JSON parse errors', async () => {
    const parseError = new Error('Unexpected token in JSON');
    const fn = jest.fn().mockRejectedValue(parseError);

    await expect(
      withLLMRetry(fn, { operationName: 'test', maxRetries: 2, baseDelayMs: 10 })
    ).rejects.toThrow('Unexpected token in JSON');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('respects maxRetries limit', async () => {
    const timeoutError = Object.assign(new Error('timeout'), { status: 504 });
    const fn = jest.fn().mockRejectedValue(timeoutError);

    await expect(
      withLLMRetry(fn, { operationName: 'test', maxRetries: 2, baseDelayMs: 10 })
    ).rejects.toThrow('timeout');

    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('retries on timeout (AbortError)', async () => {
    let callCount = 0;
    const fn = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return new Promise((_, reject) => {
          setTimeout(() => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          }, 5);
        });
      }
      return Promise.resolve({ content: 'ok' });
    });

    const result = await withLLMRetry(fn, {
      operationName: 'test',
      maxRetries: 1,
      baseDelayMs: 10,
      timeoutMs: 1, // very short timeout to trigger abort
    });

    expect(result).toEqual({ content: 'ok' });
  });

  it('retries on network errors (ECONNRESET)', async () => {
    const networkErr = new Error('socket hang up');
    const fn = jest.fn()
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValueOnce({ content: 'ok' });

    const result = await withLLMRetry(fn, {
      operationName: 'test',
      maxRetries: 1,
      baseDelayMs: 10,
    });

    expect(result).toEqual({ content: 'ok' });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
