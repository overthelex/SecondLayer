import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface EmptyStateProps {
  onSelectPrompt: (prompt: string) => void;
}

export function EmptyState({ onSelectPrompt }: EmptyStateProps) {
  const prompts = [
    'Допоможіть скласти позовну заяву про стягнення заборгованості',
    'Знайдіть практику ВС по договорах поставки',
    'Проаналізуйте підстави для скасування рішення суду',
    'Які документи потрібні для банкрутства фізичної особи?',
  ];

  return (
    <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
      <div className="max-w-xl w-full">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mb-10"
        >
          <h1 className="font-sans text-2xl md:text-3xl font-semibold text-zinc-900 mb-3 tracking-tight">
            Чим можу допомогти?
          </h1>
          <p className="font-sans text-zinc-500 text-sm md:text-base leading-relaxed">
            AI-асистент для роботи з українським правом. Аналіз практики,
            підготовка документів, правові консультації.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-2"
        >
          {prompts.map((prompt, index) => (
            <motion.button
              key={index}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.2 + index * 0.07 }}
              onClick={() => onSelectPrompt(prompt)}
              className="group w-full text-left px-4 py-3 bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl transition-all duration-150 hover:shadow-elevation-1 flex items-center justify-between gap-3 active:scale-[0.99]"
            >
              <p className="font-sans text-[13px] md:text-[14px] text-zinc-700 leading-relaxed">
                {prompt}
              </p>
              <ArrowRight
                size={14}
                strokeWidth={2}
                className="flex-shrink-0 text-zinc-300 group-hover:text-zinc-500 transition-colors duration-150"
              />
            </motion.button>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
