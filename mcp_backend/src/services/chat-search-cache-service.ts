// Proprietary implementation: @secondlayer/core (private repo)

export class ChatSearchCacheService {
  constructor(...args: any[]) {}

  async getCachedResult(toolName: string, params: Record<string, unknown>): Promise<unknown | null> {
    return null;
  }

  async cacheResult(toolName: string, params: Record<string, unknown>, result: unknown): Promise<void> {}

  async invalidate(conversationId: string): Promise<void> {}

  setCachePort(cache: any): void {}
}
