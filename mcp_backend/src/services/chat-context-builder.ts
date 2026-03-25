// Proprietary implementation: @secondlayer/core (private repo)

export class ChatContextBuilder {
  constructor(...args: any[]) {}

  async build(
    history: Array<{ role: string; content: string }>,
    query: string,
    classifiedDomains?: string[],
    plan?: unknown,
    maxContextChars?: number,
    conversationId?: string,
    requestId?: string,
    queryType?: string
  ): Promise<Array<{ role: string; content: string }>> {
    return [{ role: 'user', content: query }];
  }
}
