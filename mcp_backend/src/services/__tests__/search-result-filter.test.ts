import { SearchResultFilter } from '../search-result-filter';

const mockResults = [
  { doc_id: 1, cause_num: '111/222/23', court_name: 'Київський суд', judge: 'Іванов', justice_kind_name: 'Цивільне', judgment_form: 'Рішення', adjudication_date: '2024-01-10', headline: 'стягнення боргу за договором оренди' },
  { doc_id: 2, cause_num: '333/444/23', court_name: 'Одеський суд', judge: 'Петров', justice_kind_name: 'Господарське', judgment_form: 'Ухвала', adjudication_date: '2024-02-15', headline: 'визнання правочину недійсним' },
  { doc_id: 3, cause_num: '555/666/23', court_name: 'Львівський суд', judge: 'Сидоров', justice_kind_name: 'Кримінальне', judgment_form: 'Вирок', adjudication_date: '2024-03-20', headline: 'крадіжка' },
  { doc_id: 4, cause_num: '777/888/23', court_name: 'Харківський суд', judge: 'Коваль', justice_kind_name: 'Цивільне', judgment_form: 'Рішення', adjudication_date: '2024-04-25', headline: 'договір оренди нежитлового приміщення' },
  { doc_id: 5, cause_num: '999/000/23', court_name: 'Дніпровський суд', judge: 'Мельник', justice_kind_name: 'Адміністративне', judgment_form: 'Постанова', adjudication_date: '2024-05-01', headline: 'оскарження рішення податкової' },
  { doc_id: 6, cause_num: '101/202/23', court_name: 'Запорізький суд', judge: 'Шевченко', justice_kind_name: 'Цивільне', judgment_form: 'Рішення', adjudication_date: '2024-06-10', headline: 'розірвання договору оренди' },
  { doc_id: 7, cause_num: '303/404/23', court_name: 'Полтавський суд', judge: 'Бондаренко', justice_kind_name: 'Господарське', judgment_form: 'Рішення', adjudication_date: '2024-07-15', headline: 'стягнення заборгованості' },
  { doc_id: 8, cause_num: '505/606/23', court_name: 'Чернігівський суд', judge: 'Ткаченко', justice_kind_name: 'Кримінальне', judgment_form: 'Вирок', adjudication_date: '2024-08-20', headline: 'шахрайство' },
  { doc_id: 9, cause_num: '707/808/23', court_name: 'Вінницький суд', judge: 'Олійник', justice_kind_name: 'Цивільне', judgment_form: 'Ухвала', adjudication_date: '2024-09-25', headline: 'орендна плата' },
  { doc_id: 10, cause_num: '909/010/23', court_name: 'Тернопільський суд', judge: 'Гриценко', justice_kind_name: 'Адміністративне', judgment_form: 'Постанова', adjudication_date: '2024-10-01', headline: 'ліцензування' },
];

describe('SearchResultFilter', () => {
  it('returns all results when fewer than threshold', async () => {
    const llm = { chatCompletion: jest.fn() } as any;
    const filter = new SearchResultFilter(llm);

    const result = await filter.filterResults(mockResults.slice(0, 5), 'оренда');
    expect(result.filtered).toHaveLength(5);
    expect(llm.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns all results when query is empty', async () => {
    const llm = { chatCompletion: jest.fn() } as any;
    const filter = new SearchResultFilter(llm);

    const result = await filter.filterResults(mockResults, '');
    expect(result.filtered).toHaveLength(10);
    expect(llm.chatCompletion).not.toHaveBeenCalled();
  });

  it('filters by LLM relevance scores', async () => {
    const llm = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: JSON.stringify([
          { doc_id: 1, score: 9 },
          { doc_id: 4, score: 8 },
          { doc_id: 6, score: 7 },
          { doc_id: 9, score: 6 },
          { doc_id: 7, score: 5 },
          { doc_id: 2, score: 3 },
          { doc_id: 5, score: 2 },
        ]),
      }),
    } as any;
    const filter = new SearchResultFilter(llm);

    const result = await filter.filterResults(mockResults, 'договір оренди');

    expect(result.original_count).toBe(10);
    expect(result.filtered_count).toBe(5);
    expect(result.filtered[0].doc_id).toBe(1);
    expect(result.filtered[0].relevance_score).toBe(9);
    expect(result.filtered.every((r: any) => r.relevance_score >= 5)).toBe(true);
  });

  it('returns unfiltered on LLM failure', async () => {
    const llm = {
      chatCompletion: jest.fn().mockRejectedValue(new Error('LLM timeout')),
    } as any;
    const filter = new SearchResultFilter(llm);

    const result = await filter.filterResults(mockResults, 'оренда');
    expect(result.filtered).toHaveLength(10);
    expect(result.original_count).toBe(10);
  });

  it('handles wrapped JSON response', async () => {
    const llm = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          results: [
            { doc_id: 1, score: 9 },
            { doc_id: 4, score: 7 },
          ],
        }),
      }),
    } as any;
    const filter = new SearchResultFilter(llm);

    const result = await filter.filterResults(mockResults, 'оренда');
    expect(result.filtered_count).toBe(2);
  });
});
