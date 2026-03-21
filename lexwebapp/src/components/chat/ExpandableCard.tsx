/**
 * ExpandableCard — reusable card with expand/collapse, copy, modal and external link actions.
 * Used by DecisionsTab, RegulationsTab and DocumentsTab.
 */

import { useState } from 'react';
import { Copy, Check, Maximize2, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import ReactMarkdown from 'react-markdown';

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1], delay: i * 0.03 },
  }),
};

interface ExpandableCardProps {
  id: string;
  index: number;
  icon: React.ElementType;
  header: React.ReactNode;
  preview?: React.ReactNode;
  content: string;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenModal?: () => void;
  externalUrl?: string;
}

export function ExpandableCard({
  id,
  index,
  icon: _Icon,
  header,
  preview,
  content,
  isExpanded,
  onToggle,
  onOpenModal,
  externalUrl,
}: ExpandableCardProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyContent = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <motion.div
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      layout
      className="bg-white border border-zinc-200 rounded-lg overflow-hidden hover:border-zinc-300 hover:shadow-elevation-1 transition-all duration-150"
    >
      <div onClick={onToggle} className="p-3 cursor-pointer group">
        {header}
        {!isExpanded && preview}
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 border-t border-zinc-100">
              <div className="mt-3 max-h-[280px] overflow-y-auto text-[12px] text-zinc-700 leading-relaxed prose prose-sm">
                <ReactMarkdown>{content}</ReactMarkdown>
              </div>
              <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-zinc-100">
                <button
                  onClick={(e) => { e.stopPropagation(); copyContent(content); }}
                  className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-700 px-2 py-1 rounded hover:bg-zinc-50 transition-colors duration-150"
                >
                  {copiedId === id ? <Check size={10} /> : <Copy size={10} />}
                  {copiedId === id ? 'Скопійовано' : 'Копіювати'}
                </button>
                {onOpenModal && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenModal(); }}
                    className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-700 px-2 py-1 rounded hover:bg-zinc-50 transition-colors duration-150"
                  >
                    <Maximize2 size={10} />
                    Повний вигляд
                  </button>
                )}
                {externalUrl && onOpenModal && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenModal(); }}
                    className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-700 px-2 py-1 rounded hover:bg-zinc-50 transition-colors duration-150"
                  >
                    <ExternalLink size={10} />
                    Відкрити
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function EmptyTabState({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="text-center py-10 text-zinc-400">
      <Icon size={24} className="mx-auto mb-3 opacity-25" strokeWidth={1.5} />
      <p className="text-[12px]">{text}</p>
    </div>
  );
}
