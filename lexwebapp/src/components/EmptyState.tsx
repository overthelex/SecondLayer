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
 * Three tiers of query complexity:
 * - Швидкий пошук: 1 data source, up to ~10 full-text documents
 * - Дослідження: 2–3 data sources, up to ~100 documents
 * - Глибокий аналіз: 5–6 data sources, up to ~1000 documents
 */
const PROMPT_POOL: SamplePrompt[] = [
  // ── Швидкий пошук (1 база, до 10 документів) ──
  { category: 'Швидкий пошук', text: 'Стаття 625 Цивільного кодексу України' },
  { category: 'Швидкий пошук', text: 'Покажи повний текст рішення у справі №910/4518/22' },
  { category: 'Швидкий пошук', text: 'Інформація про юрособу за ЄДРПОУ 20077720' },
  { category: 'Швидкий пошук', text: 'Структура Господарського процесуального кодексу' },
  { category: 'Швидкий пошук', text: 'Розклад засідань у справі №757/52706/18' },
  { category: 'Швидкий пошук', text: 'Статті 256–267 Цивільного кодексу про позовну давність' },
  { category: 'Швидкий пошук', text: 'Інформація про депутата Стефанчук Руслан' },
  { category: 'Швидкий пошук', text: 'Знайди суддю Танасевич Олена Василівна' },
  { category: 'Швидкий пошук', text: 'Історія змін статті 80 Земельного кодексу' },
  { category: 'Швидкий пошук', text: 'Торгова марка «Рошен» у реєстрі НІПВ' },
  { category: 'Швидкий пошук', text: 'Банки з ліцензією НБУ' },
  { category: 'Швидкий пошук', text: 'Санкції РНБО проти компанії Газпром' },

  // ── Дослідження (2–3 бази, до 100 документів) ──
  { category: 'Дослідження', text: 'Судові рішення де ТОВ «Нова Пошта» — відповідач та статистика по судах' },
  { category: 'Дослідження', text: 'Практика ВС щодо ст. 625 ЦК: стягнення 3% річних та інфляційних втрат' },
  { category: 'Дослідження', text: 'Всі інстанції у справі №910/4518/22 та перевірка актуальності рішення' },
  { category: 'Дослідження', text: 'Стаття 1166 ЦК та судова практика відшкодування шкоди внаслідок ДТП' },
  { category: 'Дослідження', text: 'Перевір ТОВ «Нафтогаз України» за ЄДРПОУ 20077720: бенефіціари та борги' },
  { category: 'Дослідження', text: 'Законопроекти про оренду землі у ВР та поточна редакція розділу X Земельного кодексу' },
  { category: 'Дослідження', text: 'Семантичний пошук: відповідальність директора за борги ТОВ + відповідні норми ЦК' },
  { category: 'Дослідження', text: 'Рішення у справі №461/1578/22, всі інстанції та застосовані норми' },
  { category: 'Дослідження', text: 'Розрахуй 3% річних за період 01.01.2024–01.03.2026 на 500 000 грн та знайди практику ВС' },
  { category: 'Дослідження', text: 'Стаття 376 ЦК про самочинне будівництво та практика ВС за останній рік' },
  { category: 'Дослідження', text: 'Практика ЄСПЛ щодо ст. 6 Конвенції та відповідні норми ЦПК' },
  { category: 'Дослідження', text: 'Депутат Стефанчук Руслан — профіль та голосування за останній рік' },

  // ── Глибокий аналіз (5–6 баз, до 1000 документів) ──
  { category: 'Глибокий аналіз', text: 'Due diligence ТОВ «Нафтогаз України» (ЄДРПОУ 20077720): реєстри, бенефіціари, судові справи, борги, санкції та закупівлі' },
  { category: 'Глибокий аналіз', text: 'Практика «за» і «проти» визнання правочину недійсним (ст. 203, 215 ЦК): аналіз патернів, цитування ВС та норми ЦК і ГК' },
  { category: 'Глибокий аналіз', text: 'Повний аналіз поручительства: норми ЦК, практика ВС, ЄСПЛ, патерни аргументації та процесуальний чеклист' },
  { category: 'Глибокий аналіз', text: 'Суддя Танасевич О.В. — дані ВККС, дисципліна ВРП, авторозподіл справ та статистика рішень в ЄДРСР' },
  { category: 'Глибокий аналіз', text: 'Самочинне будівництво: ст. 376 ЦК, практика ВС, земельне законодавство, ЄСПЛ та рішення місцевих судів Києва' },
  { category: 'Глибокий аналіз', text: 'Набувальна давність (ст. 344 ЦК): земельне та містобудівне законодавство, практика ВС, КС та аналіз патернів' },
  { category: 'Глибокий аналіз', text: 'Компанія «Газпром»: санкції РНБО, пов\'язані юрособи в Україні, судові справи, виконавчі провадження та закупівлі' },
  { category: 'Глибокий аналіз', text: 'Відповідальність директора ТОВ: ст. 89 ГК, ст. 1166 ЦК, практика ВС, банкрутні справи та дані з реєстрів' },

  // ── OSINT (міжнародні бази, кіберрозвідка) ──
  { category: 'OSINT', text: 'Перевірка санкцій OFAC/EU/UN для Huawei Technologies' },
  { category: 'OSINT', text: 'Перевір IP 185.220.101.1 на шкідливу активність' },
  { category: 'OSINT', text: 'Витоки облікових даних для домену @jpmorgan.com' },
  { category: 'OSINT', text: 'Червоні повідомлення ІНТЕРПОЛУ за шахрайство' },
  { category: 'OSINT', text: 'Репутація домену suspicious-site.com через VirusTotal' },
  { category: 'OSINT', text: 'Жертви ransomware у фінансовому секторі' },
  { category: 'OSINT', text: 'Дебармент Світового банку для консалтингових фірм' },
  { category: 'OSINT', text: 'Офшорні зв\'язки через ICIJ для shell-компаній' },
  { category: 'OSINT', text: 'Згадки у медіа та тональність для компанії Wirecard' },
  { category: 'OSINT', text: 'CVE вразливості Cisco критичного рівня' },
  { category: 'OSINT', text: 'Витоки API-ключів у GitHub для acme-corp.com' },
  { category: 'OSINT', text: 'Публікації на darknet-форумах про витоки даних' },
];

/**
 * Fixed display order: categories always appear in the same positions.
 * Only the specific question within each category randomizes on refresh.
 */
const DISPLAY_SLOTS: string[] = [
  'Швидкий пошук',
  'Дослідження',
  'OSINT',
  'Глибокий аналіз',
];

function pickPrompts(): SamplePrompt[] {
  return DISPLAY_SLOTS.map(cat => {
    const pool = PROMPT_POOL.filter(p => p.category === cat);
    return pool[Math.floor(Math.random() * pool.length)];
  });
}

export function EmptyState({ onSelectPrompt }: EmptyStateProps) {
  const prompts = useMemo(() => pickPrompts(), []);

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
