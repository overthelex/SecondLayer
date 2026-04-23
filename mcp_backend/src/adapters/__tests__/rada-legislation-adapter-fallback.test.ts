/**
 * Tests for RadaLegislationAdapter fallback parsers — short regulations without
 * structured articles or numbered punkts (e.g. КМУ розпорядження).
 */

import axios from 'axios';
import { RadaLegislationAdapter } from '../rada-legislation-adapter.js';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// КМУ 265-р від 24.04.2019 — розпорядження з коротким основним текстом
// та додатком-таблицею КВЕД. Немає жодних <span class=rvts9>Стаття N</span>
// і немає нумерованих пунктів — обидва попередні парсери дають 0 статей.
const KMU_265_PRINT_HTML = `
<!DOCTYPE html><html><head><title>КМУ 265-р</title></head><body>
<div id="prnpanel"><a href="#" onclick="window.print();return false;">Друкувати</a>
<button>+збільшити</button><button>−зменшити</button>
або <kbd>Ctrl</kbd> + mouse wheel</div>
<div id="article">
<p class=rvps17><span class=rvts23>КАБІНЕТ МІНІСТРІВ УКРАЇНИ</span>
<br><span class=rvts64>РОЗПОРЯДЖЕННЯ</span></p>
<p class=rvps7><span class=rvts9>від 24 квітня 2019 р. № 265-р</span>
<br><span class=rvts9>Київ</span></p>
<p class=rvps6><span class=rvts23>Про затвердження видів економічної діяльності, які належать до креативних індустрій</span></p>
<p class=rvps2>Затвердити перелік видів економічної діяльності, які належать до креативних індустрій, згідно з додатком.</p>
<p class=rvps4><span class=rvts44>Прем'єр-міністр України</span></p>
<p class=rvps15><span class=rvts44>В.ГРОЙСМАН</span></p>
<p class=rvps6><span class=rvts23>ПЕРЕЛІК</span>
<br><span class=rvts23>видів економічної діяльності, які належать до креативних індустрій</span></p>
<table><tr><td><p>32.12</p></td><td><p>Виробництво ювелірних і подібних виробів</p></td></tr>
<tr><td><p>90.02</p></td><td><p>Діяльність із підтримки театральних і музичних заходів</p></td></tr></table>
</div>
</body></html>
`;

describe('RadaLegislationAdapter — fallback_whole_document', () => {
  let adapter: RadaLegislationAdapter;
  let mockAxiosInstance: any;

  beforeEach(() => {
    mockAxiosInstance = { get: jest.fn() };
    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);
    adapter = new RadaLegislationAdapter({} as any);
  });

  test('extracts whole document as single article when no Стаття / punkts found (LEXAI-865)', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: KMU_265_PRINT_HTML });

    const { metadata, articles } = await adapter.fetchLegislation('265-2019-р');

    expect(metadata.rada_id).toBe('265-2019-р');
    expect(articles).toHaveLength(1);

    const article = articles[0];
    expect(article.article_number).toBe('1');
    expect(article.metadata?.extraction_method).toBe('fallback_whole_document');

    // Main regulatory text must be present
    expect(article.full_text).toContain('Затвердити перелік видів економічної діяльності');
    // Appendix (КВЕД codes) must be included
    expect(article.full_text).toContain('32.12');
    expect(article.full_text).toContain('Виробництво ювелірних');
    expect(article.full_text).toContain('90.02');
    // Print-panel chrome must be stripped
    expect(article.full_text).not.toContain('Друкувати');
    expect(article.full_text).not.toContain('mouse wheel');
    expect(article.full_text).not.toContain('збільшити');
    // byte_size must reflect actual text length
    expect(article.byte_size).toBeGreaterThan(200);
  });

  test('does not use whole-document fallback when structured articles exist', async () => {
    const structuredHtml = `
<html><body><div id="article">
<p><span class=rvts9>Стаття 1. Загальні положення</span>
Цей Закон встановлює основи правового регулювання.</p>
<p><span class=rvts9>Стаття 2. Сфера дії</span>
Дія цього Закону поширюється на всіх резидентів України.</p>
<p><span class=rvts9>Стаття 3. Визначення термінів</span>
Для цілей цього Закону терміни вживаються в такому значенні.</p>
<p><span class=rvts9>Стаття 4. Принципи</span>
Основними принципами є законність, рівність, гласність, незалежність.</p>
<p><span class=rvts9>Стаття 5. Права та обов'язки</span>
Кожен має право на судовий захист своїх прав і законних інтересів.</p>
<p><span class=rvts9>Стаття 6. Відповідальність</span>
Порушення вимог цього Закону тягне за собою відповідальність згідно з законодавством.</p>
</div></body></html>`;
    mockAxiosInstance.get.mockResolvedValue({ data: structuredHtml });

    const { articles } = await adapter.fetchLegislation('test-law');

    expect(articles.length).toBeGreaterThan(1);
    // None should have been produced by the whole-document fallback
    for (const a of articles) {
      expect(a.metadata?.extraction_method).not.toBe('fallback_whole_document');
    }
  });
});
