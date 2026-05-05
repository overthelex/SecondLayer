import { QueryReformulator } from '../query-reformulator';

describe('QueryReformulator', () => {
  it('returns original for short queries', async () => {
    const llm = { chatCompletion: jest.fn() } as any;
    const reformulator = new QueryReformulator(llm);

    const result = await reformulator.reformulate('оренда');
    expect(result.original).toBe('оренда');
    expect(result.semantic).toBe('оренда');
    expect(result.fts).toBe('оренда');
    expect(llm.chatCompletion).not.toHaveBeenCalled();
  });

  it('reformulates queries via LLM', async () => {
    const llm = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          semantic: 'відповідальність за самовільне залишення військової частини в умовах воєнного стану',
          fts: 'самовільне залишення частини стаття 407 КК воєнний стан',
          expanded: 'дезертирство ЗЧВП ст.407 ст.408 КК військові злочини',
        }),
      }),
    } as any;
    const reformulator = new QueryReformulator(llm);

    const result = await reformulator.reformulate('покарання за самоволку під час війни');

    expect(result.original).toBe('покарання за самоволку під час війни');
    expect(result.semantic).toContain('самовільне залишення');
    expect(result.fts).toContain('407');
    expect(result.expanded).toContain('дезертирство');
    expect(llm.chatCompletion).toHaveBeenCalledTimes(1);
  });

  it('returns original on LLM failure', async () => {
    const llm = {
      chatCompletion: jest.fn().mockRejectedValue(new Error('timeout')),
    } as any;
    const reformulator = new QueryReformulator(llm);

    const result = await reformulator.reformulate('стягнення боргу за договором оренди');
    expect(result.original).toBe('стягнення боргу за договором оренди');
    expect(result.semantic).toBe('стягнення боргу за договором оренди');
    expect(result.fts).toBe('стягнення боргу за договором оренди');
  });

  it('handles empty semantic/fts in response', async () => {
    const llm = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: JSON.stringify({ semantic: '', fts: null, expanded: null }),
      }),
    } as any;
    const reformulator = new QueryReformulator(llm);

    const result = await reformulator.reformulate('оподаткування нерухомості ВПО');
    expect(result.semantic).toBe('оподаткування нерухомості ВПО');
    expect(result.fts).toBe('оподаткування нерухомості ВПО');
  });
});
