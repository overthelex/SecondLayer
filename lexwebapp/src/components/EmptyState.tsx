import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useMemo } from 'react';

interface EmptyStateProps {
  onSelectPrompt: (prompt: string) => void;
}

interface SamplePrompt {
  category: string;
  text: string;
}

/**
 * Pool of sample prompts organized by category.
 * Each prompt is designed to trigger specific MCP tools with minimal LLM overhead.
 */
const PROMPT_POOL: SamplePrompt[] = [
  // ── Судова практика ──
  { category: 'Судова практика', text: 'Знайди судові рішення де відповідач ТОВ «Нова Пошта»' },
  { category: 'Судова практика', text: 'Покажи повний текст рішення суду у справі №910/12345/23' },
  { category: 'Судова практика', text: 'Покажи всі інстанції та рішення у справі №757/1234/24' },
  { category: 'Судова практика', text: 'Знайди справи зі схожими обставинами: ДТП з пішоходом на переході' },
  { category: 'Судова практика', text: 'Збери практику «за» і «проти» стягнення моральної шкоди за невиконання договору' },
  { category: 'Судова практика', text: 'Скільки справ у ТОВ «Укрзалізниця» як відповідача?' },
  { category: 'Судова практика', text: 'Шукай рішення в ЄДРСР за номером справи 916/2345/24' },
  { category: 'Судова практика', text: 'Повнотекстовий пошук в ЄДРСР: «визнання правочину недійсним удаваний правочин»' },
  { category: 'Судова практика', text: 'Семантичний пошук в ЄДРСР: відповідальність директора за борги товариства' },
  { category: 'Судова практика', text: 'Розклад засідань у справі №910/5678/24' },
  { category: 'Судова практика', text: 'Статус справи №757/12345/24 у суді' },

  // ── Аналіз ──
  { category: 'Аналіз', text: 'Аналіз патерну: як суди вирішують спори щодо поручительства' },
  { category: 'Аналіз', text: 'Знайди рішення зі схожим обґрунтуванням щодо ст. 625 ЦК' },
  { category: 'Аналіз', text: 'Побудуй граф цитувань для рішення ВС у справі 910/1111/22' },
  { category: 'Аналіз', text: 'Перевір чи актуальне рішення КГС ВС у справі 916/2222/21' },

  // ── Законодавство ──
  { category: 'Законодавство', text: 'Які норми регулюють позовну давність у цивільних справах?' },
  { category: 'Законодавство', text: 'Покажи статті 256–268 Цивільного кодексу' },
  { category: 'Законодавство', text: 'Стаття 625 Цивільного кодексу України' },
  { category: 'Законодавство', text: 'Структура Господарського процесуального кодексу' },
  { category: 'Законодавство', text: 'Історія змін статті 80 Земельного кодексу' },
  { category: 'Законодавство', text: 'Знайди процесуальні норми щодо забезпечення позову' },
  { category: 'Законодавство', text: 'Пошук правових актів: постанови КМУ про мінімальну зарплату' },

  // ── Процесуальне ──
  { category: 'Процесуальне', text: 'Розрахуй строк на апеляційне оскарження рішення від 01.03.2026' },
  { category: 'Процесуальне', text: 'Чеклист для подання касаційної скарги в господарському процесі' },
  { category: 'Процесуальне', text: 'Розрахуй 3% річних та інфляційні за період 01.01.2024–01.01.2026 на суму 500 000 грн' },

  // ── Парламент ──
  { category: 'Парламент', text: 'Законопроекти про земельну реформу у Верховній Раді' },
  { category: 'Парламент', text: 'Інформація про депутата Стефанчук Руслан' },
  { category: 'Парламент', text: 'Текст закону «Про виконавче провадження»' },
  { category: 'Парламент', text: 'Голосування за закон №3524 про мобілізацію' },

  // ── Реєстри ──
  { category: 'Реєстри', text: 'Інформація про юрособу за ЄДРПОУ 00032112' },
  { category: 'Реєстри', text: 'Знайди юросіб з назвою «Нафтогаз»' },
  { category: 'Реєстри', text: 'Хто бенефіціари компанії ТОВ «Промінвест»?' },
  { category: 'Реєстри', text: 'Виконавчі провадження проти ТОВ «Будінвест»' },
  { category: 'Реєстри', text: 'Справи про банкрутство у Київській області' },
  { category: 'Реєстри', text: 'Нотаріуси Львівської області' },
  { category: 'Реєстри', text: 'Судові експерти з оціночної діяльності' },
  { category: 'Реєстри', text: 'Арбітражні керуючі Харківської області' },
  { category: 'Реєстри', text: 'Тендери ProZorro: ремонт доріг Київ 2025' },
  { category: 'Реєстри', text: 'Декларації НАЗК: Ткаченко' },

  // ── Держреєстри ──
  { category: 'Держреєстри', text: 'Знайди суддю Іванов Олександр Петрович' },
  { category: 'Держреєстри', text: 'Адвокат Петренко у реєстрі адвокатів' },
  { category: 'Держреєстри', text: 'Судові експерти з почеркознавства' },
  { category: 'Держреєстри', text: 'Реєстр корупційних правопорушень: Київ' },
  { category: 'Держреєстри', text: 'Пошук зниклих безвісти: Коваленко' },
  { category: 'Держреєстри', text: 'Особи в розшуку: Сидоренко' },
  { category: 'Держреєстри', text: 'Розшук автомобіля за номером АА1234ВВ' },
  { category: 'Держреєстри', text: 'Громадські організації з охорони довкілля Київ' },
  { category: 'Держреєстри', text: 'Санкції проти компанії Газпром' },
  { category: 'Держреєстри', text: 'Банки з ліцензією НБУ' },
  { category: 'Держреєстри', text: 'Великі платники податків Харківська область' },
  { category: 'Держреєстри', text: 'Перевір платника ПДВ за кодом 12345678' },
  { category: 'Держреєстри', text: 'Патенти у сфері фармацевтики' },
  { category: 'Держреєстри', text: 'Торгова марка «Рошен»' },
  { category: 'Держреєстри', text: 'Боржник ТОВ «Альфа» у виконавчих провадженнях' },
  { category: 'Держреєстри', text: 'Підприємства із заборгованістю по зарплаті' },
  { category: 'Держреєстри', text: 'Власники цінних паперів компанії Укрнафта' },
  { category: 'Держреєстри', text: 'Протоколи авторозподілу справ у Печерському суді' },
  { category: 'Держреєстри', text: 'Дані ВККС про суддів Дніпровського суду' },
  { category: 'Держреєстри', text: 'Рішення ВРП щодо дисциплінарних справ суддів' },
  { category: 'Держреєстри', text: 'Звільнені та усунуті судді за даними ВРП' },

  // ── ЄСПЛ ──
  { category: 'ЄСПЛ', text: 'Практика ЄСПЛ щодо права на справедливий суд (ст. 6 Конвенції)' },

  // ── Комплексний запит (мультитулові) ──
  { category: 'Комплексний запит', text: 'Знайди рішення ВС у справі 910/1234/24 та покажи розклад засідань' },
  { category: 'Комплексний запит', text: 'Стаття 625 ЦК України та судова практика по ній' },
  { category: 'Комплексний запит', text: 'Перевір ТОВ за ЄДРПОУ 00032112: бенефіціари та виконавчі провадження' },
  { category: 'Комплексний запит', text: 'Суддя Іванов О.П. — дані ВККС та дисциплінарні справи ВРП' },
  { category: 'Комплексний запит', text: 'Практика ВС щодо поручительства: за і проти + аналіз патерну' },
  { category: 'Комплексний запит', text: 'Норми про забезпечення позову в ГПК та чеклист для подання заяви' },
  { category: 'Комплексний запит', text: 'Рішення у справі 757/5678/24, всі інстанції та перевірка актуальності' },
  { category: 'Комплексний запит', text: 'Статті 256–268 ЦК (позовна давність) та практика ВС щодо їх застосування' },
  { category: 'Комплексний запит', text: 'Перевір компанію «Будінвест»: реєстр юросіб, борги, банкрутство' },
  { category: 'Комплексний запит', text: 'Законопроекти про оренду землі та поточний текст Земельного кодексу розділ X' },
  { category: 'Комплексний запит', text: 'Розрахуй 3% річних за 2 роки на 1 млн грн та знайди практику ВС по ст. 625 ЦК' },
  { category: 'Комплексний запит', text: 'Санкції проти компанії + перевірка в реєстрі РНБО' },
  { category: 'Комплексний запит', text: 'Інформація про депутата Стефанчук та його голосування за останній рік' },
  { category: 'Комплексний запит', text: 'Адвокат Петренко — реєстр адвокатів та справи як представника' },
  { category: 'Комплексний запит', text: 'Стаття 16 ЦК та практика ЄСПЛ щодо ефективного засобу захисту' },
  { category: 'Комплексний запит', text: 'Знайди патенти фармкомпанії та перевір її за ЄДРПОУ' },
  { category: 'Комплексний запит', text: 'Повнотекстовий пошук «самочинне будівництво» + відповідні норми ЦК' },
  { category: 'Комплексний запит', text: 'Строк на апеляцію рішення від 01.03.2026 + процесуальні норми ГПК' },
  { category: 'Комплексний запит', text: 'Нотаріуси Львова + судові експерти з оцінки нерухомості Львів' },
  { category: 'Комплексний запит', text: 'Структура Закону «Про виконавче провадження» та статті про арешт майна' },
];

/**
 * All unique categories in the pool.
 */
const CATEGORIES = [...new Set(PROMPT_POOL.map(p => p.category))];

/**
 * Pick N prompts from different categories using Fisher-Yates on categories,
 * then one random prompt per selected category.
 */
function pickDiversePrompts(count: number): SamplePrompt[] {
  const shuffled = [...CATEGORIES].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, count);

  return selected.map(cat => {
    const pool = PROMPT_POOL.filter(p => p.category === cat);
    return pool[Math.floor(Math.random() * pool.length)];
  });
}

export function EmptyState({ onSelectPrompt }: EmptyStateProps) {
  const prompts = useMemo(() => pickDiversePrompts(4), []);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-8 pb-6 overflow-y-auto">
      <div className="max-w-2xl w-full">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="mb-12 text-center"
        >
          <h1 className="font-sans text-[28px] md:text-[34px] font-semibold text-zinc-900 mb-4 tracking-[-0.02em] leading-tight">
            Чим можу допомогти?
          </h1>
          <p className="font-sans text-zinc-500 text-[15px] leading-relaxed max-w-md mx-auto">
            AI-асистент для роботи з українським правом — аналіз судової практики,
            підготовка документів та правові консультації.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="grid grid-cols-1 md:grid-cols-2 gap-2.5"
        >
          {prompts.map((prompt, index) => (
            <motion.button
              key={index}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.18 + index * 0.06, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => onSelectPrompt(prompt.text)}
              className="group w-full text-left px-5 py-4 bg-white border border-zinc-200/80 hover:border-zinc-300 rounded-xl transition-all duration-200 hover:shadow-sm flex items-start justify-between gap-3 active:scale-[0.99]"
            >
              <div className="flex-1 min-w-0">
                <p className="font-sans text-[12px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">
                  {prompt.category}
                </p>
                <p className="font-sans text-[13px] text-zinc-700 leading-snug">
                  {prompt.text}
                </p>
              </div>
              <ArrowRight
                size={14}
                strokeWidth={1.75}
                className="flex-shrink-0 text-zinc-300 group-hover:text-zinc-500 transition-colors duration-150 mt-0.5"
              />
            </motion.button>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
