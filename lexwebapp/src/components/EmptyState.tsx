import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface EmptyStateProps {
  onSelectPrompt: (prompt: string) => void;
}

const PROMPTS = [
  {
    label: 'Позовна заява',
    text: 'Допоможіть скласти позовну заяву про стягнення заборгованості',
  },
  {
    label: 'Судова практика',
    text: 'Знайдіть практику ВС по договорах поставки',
  },
  {
    label: 'Оскарження',
    text: 'Проаналізуйте підстави для скасування рішення суду',
  },
  {
    label: 'Банкрутство',
    text: 'Які документи потрібні для банкрутства фізичної особи?',
  },
];

export function EmptyState({ onSelectPrompt }: EmptyStateProps) {
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
          {PROMPTS.map((prompt, index) => (
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
                  {prompt.label}
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
