// Proprietary implementation: @secondlayer/core (private repo)

export class ChatResultCompactor {
  constructor(...args: any[]) {}

  summarize(result: unknown, limits: unknown): unknown {
    return result;
  }

  async ragCompact(
    query: string,
    toolResults: Array<{ tool: string; content: string }>,
    maxChars: number
  ): Promise<Array<{ tool: string; content: string }>> {
    return toolResults;
  }
}
