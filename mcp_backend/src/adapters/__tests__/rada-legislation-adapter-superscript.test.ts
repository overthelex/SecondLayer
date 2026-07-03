/**
 * LEXAI-1821: RADA renders the надрядковий індекс of dash-numbered units
 * (ст. 297-1, транзитний п. 16-1) as a superscript span whose dash is hidden with
 * font-size:0 — verbatim from the stored HTML of ПКУ (legislation_id 641):
 *
 *   297<span class="rvts37"><span style="font-size:0px">-</span>1</span>.1. Платники…
 *
 * cheerio .text() flattens it to «297-1», but the PARSERS ran on raw HTML where
 * `[^<]*` capture stops at the inner span: «Стаття 297-1» was captured as «297»
 * (and ON CONFLICT then overwrote the REAL ст.297 with 297-1's text), while the
 * transitional point «16-1.» did not match the dotted-only point regex at all —
 * its sub-points were stored as bare 'п.1.11' orphans. The whole dash class
 * (КК 111-1, КУпАП 173-2, ПКУ 16-1/52-1…) was invisible.
 */

import axios from 'axios';
import { RadaLegislationAdapter } from '../rada-legislation-adapter.js';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/** Verbatim RADA superscript-index markup. */
const sup = (n: string) => `<span class="rvts37"><span style="font-size:0px">-</span>${n}</span>`;

const PKU_PRINT_HTML = `
<!DOCTYPE html><html><head><title>Податковий кодекс України</title></head><body>
<span class=rvts15>Розділ I </span><br><span class=rvts15>ЗАГАЛЬНІ ПОЛОЖЕННЯ</span>
<span class=rvts9>Стаття 1. Сфера дії</span> Текст першої статті достатньої довжини для проходження фільтра парсера.
<span class=rvts9>Стаття 2. Визначення</span> Текст другої статті також достатньої довжини щоб пройти фільтр.
<span class=rvts9>Стаття 3. Принципи</span> Текст третьої статті достатньої довжини для проходження.
<span class=rvts9>Стаття 4. Засади</span> Текст четвертої статті достатньої довжини для проходження.
<span class=rvts9>Стаття 5. Співвідношення</span> Текст п'ятої статті достатньої довжини для проходження.
<span class=rvts15>Розділ XIV </span><br><span class=rvts15>СПЕЦІАЛЬНІ ПОДАТКОВІ РЕЖИМИ</span>
<span class=rvts9>Стаття 297. Особливості нарахування, сплати та подання звітності з окремих податків і зборів</span> Платники єдиного податку звільняються від обов'язку нарахування, сплати та подання податкової звітності з таких податків і зборів.
<span class=rvts9>Стаття 297${sup('1')}. Особливості визначення загального мінімального податкового зобов'язання платників єдиного податку</span> Платники єдиного податку - власники, орендарі, користувачі земельних ділянок, віднесених до сільськогосподарських угідь, зобов'язані подавати додаток з розрахунком загального мінімального податкового зобов'язання.
<span class=rvts9>Стаття 298. Порядок обрання або переходу на спрощену систему оподаткування</span> Порядок обрання або переходу на спрощену систему оподаткування здійснюється відповідно до цього Кодексу.
ПРИКІНЦЕВІ ТА ПЕРЕХІДНІ ПОЛОЖЕННЯ
<span class=rvts15>Підрозділ 10 </span><br><span class=rvts15>Інші перехідні положення</span>
<p class="rvps2"><a name="n8990"></a> 16${sup('1')}. Тимчасово, до набрання чинності рішенням Верховної Ради України про завершення реформи Збройних Сил України, встановлюється військовий збір.</p>
<p class="rvps2"><span class="rvts0">Додатковий контекст пункту для реалістичної довжини розмітки.</span></p>
<p class="rvps2"><a name="n8991"></a> 1.1. Платниками збору є особи, визначені пунктом 162.1 статті 162 цього Кодексу та особливості справляння збору. Додатковий текст підпункту для реалістичної довжини.</p>
<p class="rvps2"><a name="n9000"></a> 38.6. Об'єкти житлової та нежитлової нерухомості, розташовані на тимчасово окупованій території, не є об'єктом оподаткування. Додатковий текст пункту для реалістичної довжини розмітки.</p>
<p class="rvps2"><a name="n9100"></a> 52${sup('1')}. На період з 1 березня 2020 року по останній календарний день місяця, в якому завершується дія карантину, зупиняється перебіг строків давності.</p>
</body></html>
`;

describe('RadaLegislationAdapter — superscript dash-index units (LEXAI-1821)', () => {
  let adapter: RadaLegislationAdapter;
  let mockAxiosInstance: any;

  beforeEach(() => {
    mockAxiosInstance = { get: jest.fn() };
    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);
    adapter = new RadaLegislationAdapter({} as any);
    mockAxiosInstance.get.mockResolvedValue({ data: PKU_PRINT_HTML });
  });

  test('a dash article gets its own record and does not clobber the parent number', async () => {
    const { articles } = await adapter.fetchLegislation('2755-17');
    const numbers = articles.map(a => a.article_number);

    expect(numbers).toContain('297');
    expect(numbers).toContain('297-1');

    const art297 = articles.find(a => a.article_number === '297')!;
    expect(art297.full_text).toContain('звільняються від обов\'язку');
    expect(art297.full_text).not.toContain('мінімального податкового зобов\'язання');

    const art297_1 = articles.find(a => a.article_number === '297-1')!;
    expect(art297_1.full_text).toContain('мінімального податкового зобов\'язання');
    expect(art297_1.title).toContain('Особливості визначення');
  });

  test('dash transitional points are extracted with their dash number preserved', async () => {
    const { articles } = await adapter.fetchLegislation('2755-17');
    const numbers = articles.map(a => a.article_number);

    expect(numbers).toContain('п.16-1');   // військовий збір
    expect(numbers).toContain('п.52-1');   // covid-мораторій
    expect(numbers).toContain('п.38.6');   // dotted points unaffected

    const p161 = articles.find(a => a.article_number === 'п.16-1')!;
    expect(p161.full_text).toContain('військовий збір');
    expect(p161.metadata?.is_transitional).toBe(true);
  });

  test('flattened text carries the literal dash form for downstream consumers', async () => {
    const { articles } = await adapter.fetchLegislation('2755-17');
    const art297_1 = articles.find(a => a.article_number === '297-1')!;
    // The hidden-dash span must not leak markup or lose the dash in full_text.
    expect(art297_1.full_text).not.toContain('font-size');
    expect(art297_1.full_text).not.toContain('rvts37');
  });
});
