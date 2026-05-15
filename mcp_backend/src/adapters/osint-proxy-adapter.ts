import { logger } from '../utils/logger.js';

export class OsintProxyAdapter {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  async executeTool(remoteName: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}/api/v1/tools/execute`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify({ name: remoteName, params }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        logger.warn('[OsintProxy] HTTP %d from %s: %s', resp.status, remoteName, text.slice(0, 200));
        return { error: `HTTP ${resp.status}`, details: text.slice(0, 200) };
      }

      const data = await resp.json() as Record<string, unknown>;

      if (data.success === false) {
        return { error: String(data.error || 'Tool call failed') };
      }

      return (data.result as Record<string, unknown>) ?? data;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        logger.warn('[OsintProxy] Timeout for %s', remoteName);
        return { error: 'Proxy timeout (30s)' };
      }
      logger.error('[OsintProxy] Error calling %s: %s', remoteName, err.message);
      return { error: err.message };
    } finally {
      clearTimeout(timeout);
    }
  }

  async health(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/v1/health`, {
        headers: { 'X-Api-Key': this.apiKey },
        signal: AbortSignal.timeout(5_000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }
}
