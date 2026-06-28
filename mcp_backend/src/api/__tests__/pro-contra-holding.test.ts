import { ProceduralTools } from '../tools/procedural-tools';

/**
 * Regression for compare_practice_pro_contra holding classification (LEXAI-1751): the legacy
 * keyword suffix could put the same decision on both sides with a header-only snippet. The new
 * path retrieves candidates once and classifies each holding via the LLM into supports / opposes
 * / not_on_point — a decision can only land on the side the LLM assigns, and not_on_point is dropped.
 */
function makeTools(opts: {
  hits: any[];
  classifications: any[];
}): ProceduralTools {
  const edsrVectorizer: any = {
    semanticSearch: jest.fn().mockResolvedValue(opts.hits),
  };
  const llm: any = {
    chatCompletion: jest.fn().mockResolvedValue({
      content: JSON.stringify({ classifications: opts.classifications }),
    }),
  };
  // Required ctor args are unused on this path — stub them.
  return new ProceduralTools(
    {} as any, {} as any, {} as any, {} as any, {} as any,
    llm, undefined, undefined, edsrVectorizer,
  );
}

function hit(doc_id: number, court_code: number, text: string) {
  return {
    doc_id,
    score: 0.9,
    text,
    metadata: { court_code, adjudication_date: '2025-01-01', cause_num: `c/${doc_id}` },
  };
}

async function run(tools: ProceduralTools, args: any) {
  const res = await (tools as any).comparePracticeProContra(args);
  return JSON.parse(res.content[0].text);
}

describe('comparePracticeProContra — LLM holding classification', () => {
  it('splits pro/contra by LLM stance and drops not_on_point', async () => {
    const tools = makeTools({
      hits: [hit(101, 9921, 'frag A'), hit(102, 9921, 'frag B'), hit(103, 1370, 'frag C')],
      classifications: [
        { doc_id: 101, stance: 'supports', quote: 'суд погодився', confidence: 0.9 },
        { doc_id: 102, stance: 'opposes', quote: 'суд відмовив', confidence: 0.8 },
        { doc_id: 103, stance: 'not_on_point', quote: '', confidence: 0.4 },
      ],
    });
    const out = await run(tools, { procedure_code: 'cac', query: 'теза' });

    expect(out.search_method).toBe('llm_holding_semantic_hnsw');
    expect(out.pro.map((c: any) => c.doc_id)).toEqual([101]);
    expect(out.contra.map((c: any) => c.doc_id)).toEqual([102]);
    expect(out.total_pro).toBe(1);
    expect(out.total_contra).toBe(1);
    // A doc never appears on both sides.
    expect(out.pro.map((c: any) => c.doc_id)).not.toEqual(out.contra.map((c: any) => c.doc_id));
    // Snippet is the cited quote, not a header.
    expect(out.pro[0].snippet).toBe('суд погодився');
    expect(out.insufficient_practice).toBeUndefined();
  });

  it('flags insufficient_practice when one side is empty', async () => {
    const tools = makeTools({
      hits: [hit(201, 9921, 'frag A'), hit(202, 9921, 'frag B')],
      classifications: [
        { doc_id: 201, stance: 'supports', quote: 'за', confidence: 0.9 },
        { doc_id: 202, stance: 'supports', quote: 'теж за', confidence: 0.7 },
      ],
    });
    const out = await run(tools, { procedure_code: 'cac', query: 'теза' });
    expect(out.total_pro).toBe(2);
    expect(out.total_contra).toBe(0);
    expect(out.insufficient_practice).toBe(true);
  });

  it('degrades to unclassified relevant practice when the LLM response is unparseable', async () => {
    // Both the initial classify call and the repair retry return non-JSON, so classifyHoldings
    // gives up. Instead of discarding the good semantic candidates and dropping to keyword-FTS,
    // the tool returns them as relevant practice with stances unlabeled.
    const edsrVectorizer: any = {
      semanticSearch: jest.fn().mockResolvedValue([hit(301, 9921, 'frag A'), hit(302, 9921, 'frag B')]),
    };
    const llm: any = {
      chatCompletion: jest.fn().mockResolvedValue({ content: 'вибачте, не можу' }),
    };
    const tools = new ProceduralTools(
      {} as any, {} as any, {} as any, {} as any, {} as any,
      llm, undefined, undefined, edsrVectorizer,
    );
    const out = await run(tools, { procedure_code: 'cac', query: 'теза' });

    expect(out.stance_classification_unavailable).toBe(true);
    expect(out.search_method).toBe('semantic_semantic_hnsw_unclassified');
    expect(out.pro).toEqual([]);
    expect(out.contra).toEqual([]);
    expect(out.relevant_practice.map((c: any) => c.doc_id)).toEqual([301, 302]);
    // Repair retry was attempted (2 calls: initial + repair).
    expect(llm.chatCompletion).toHaveBeenCalledTimes(2);
  });
});
