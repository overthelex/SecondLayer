/**
 * LEXAI-1809: the /print and edition parsers must not let the last "Стаття N."
 * swallow the "Прикінцеві та перехідні положення" tail into one mega-record
 * (ПКУ ст. 346 was ~1M chars). These tests build synthetic RADA markup where a
 * huge transitional block follows the last article and assert the bound holds.
 */

import axios from 'axios';
import { RadaLegislationAdapter } from '../rada-legislation-adapter.js';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Distinctive sentence that lives ONLY in transitional point 38.6 — must never
// end up inside the ст. 346 body.
const TRANSITIONAL_MARKER =
  'не є об’єктом оподаткування податком на нерухоме майно на тимчасово окупованій території';

// A large filler so that, pre-fix, ст. 346 would balloon (it used to swallow the
// entire transitional tail). Sized to keep the individual point realistic (<400K).
const BIG_FILLER = ('додатковий текст перехідних положень підрозділу 10 розділу XX. ').repeat(3000);

const PKU_PRINT_HTML = `
<!DOCTYPE html><html><head><title>Податковий кодекс України</title></head><body>
<span class=rvts15>Розділ I </span><br><span class=rvts15>ЗАГАЛЬНІ ПОЛОЖЕННЯ</span>
<span class=rvts9>Стаття 1. Сфера дії</span> Текст першої статті достатньої довжини для проходження фільтра парсера.
<span class=rvts9>Стаття 2. Визначення</span> Текст другої статті також достатньої довжини щоб пройти фільтр.
<span class=rvts9>Стаття 3. Принципи</span> Текст третьої статті достатньої довжини для проходження.
<span class=rvts9>Стаття 4. Засади</span> Текст четвертої статті достатньої довжини для проходження.
<span class=rvts9>Стаття 5. Співвідношення</span> Текст пʼятої статті достатньої довжини для проходження.
<span class=rvts15>Розділ XVIII-2 </span><br><span class=rvts15>ОСОБЛИВОСТІ ОПОДАТКУВАННЯ</span>
<span class=rvts9>Стаття 346. Оплата праці працівників контролюючого органу</span> Держава забезпечує достатній рівень оплати праці державних службовців контролюючого органу.
<span class=rvts15>ПРИКІНЦЕВІ ТА ПЕРЕХІДНІ ПОЛОЖЕННЯ</span>
<span class=rvts15>Підрозділ 10 </span><br><span class=rvts15>Інші перехідні положення</span>
<a name="n386"></a> 38.6. Об’єкти житлової та нежитлової нерухомості, розташовані на тимчасово окупованій території, ${TRANSITIONAL_MARKER}. ${BIG_FILLER}
<a name="n6922"></a> 69.22. Тимчасово, на період дії воєнного стану, положення статті 266 застосовуються з особливостями.
</body></html>
`;

describe('RadaLegislationAdapter — mega-record prevention (LEXAI-1809)', () => {
  let adapter: RadaLegislationAdapter;
  let mockAxiosInstance: any;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockAxiosInstance = { get: jest.fn() };
    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);
    adapter = new RadaLegislationAdapter({} as any);
  });

  test('the last article does not swallow the transitional tail', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: PKU_PRINT_HTML });

    const { articles } = await adapter.fetchLegislation('2755-17');

    const art346 = articles.find(a => a.article_number === '346');
    expect(art346).toBeDefined();
    // ст. 346 keeps only its own body — none of the transitional block.
    expect(art346!.full_text).toContain('оплати праці');
    expect(art346!.full_text).not.toContain(TRANSITIONAL_MARKER);
    // And it is nowhere near the old ~1M-char size.
    expect(art346!.full_text.length).toBeLessThan(5000);
  });

  test('transitional points are still extracted as separate п. records', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: PKU_PRINT_HTML });

    const { articles } = await adapter.fetchLegislation('2755-17');
    const numbers = articles.map(a => a.article_number);

    expect(numbers).toContain('п.38.6');
    expect(numbers).toContain('п.69.22');
    const p386 = articles.find(a => a.article_number === 'п.38.6');
    expect(p386!.full_text).toContain(TRANSITIONAL_MARKER);
    expect(p386!.metadata?.is_transitional).toBe(true);
  });

  test('no article exceeds the mega-parse guard threshold', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: PKU_PRINT_HTML });

    const { articles } = await adapter.fetchLegislation('2755-17');
    for (const a of articles) {
      expect(a.full_text.length).toBeLessThan(400_000);
    }
  });
});
