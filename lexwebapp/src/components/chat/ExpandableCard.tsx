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
      className="bg-white border border-zinc-200/90 rounded-md overflow-hidden hover:border-zinc-300 hover:shadow-sm transition-all duration-150"
    >
      <div onClick={onToggle} className="px-3 py-2.5 cursor-pointer select-none">
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
              <div className="mt-3 max-h-[280px] overflow-y-auto text-[12px] text-zinc-600 leading-[1.7] prose prose-sm prose-p:my-1 prose-p:leading-[1.7]">
                <ReactMarkdown>{content}</ReactMarkdown>
              </div>
              <div className="flex items-center gap-0.5 mt-3 pt-2.5 border-t border-zinc-100">
                <button
                  onClick={(e) => { e.stopPropagation(); copyContent(content); }}
                  className="flex items-center gap-1.5 text-[10px] text-zinc-400 hover:text-zinc-800 px-2 py-1 rounded hover:bg-zinc-50 transition-colors duration-150 font-medium"
                >
                  {copiedId === id ? <Check size={10} strokeWidth={2.5} /> : <Copy size={10} strokeWidth={2} />}
                  {copiedId === id ? 'Скопійовано' : 'Копіювати'}
                </button>
                {onOpenModal && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenModal(); }}
                    className="flex items-center gap-1.5 text-[10px] text-zinc-400 hover:text-zinc-800 px-2 py-1 rounded hover:bg-zinc-50 transition-colors duration-150 font-medium"
                  >
                    <Maximize2 size={10} strokeWidth={2} />
                    Повний вигляд
                  </button>
                )}
                {externalUrl && onOpenModal && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenModal(); }}
                    className="flex items-center gap-1.5 text-[10px] text-zinc-400 hover:text-zinc-800 px-2 py-1 rounded hover:bg-zinc-50 transition-colors duration-150 font-medium"
                  >
                    <ExternalLink size={10} strokeWidth={2} />
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
    <div className="text-center py-12 px-4">
      <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center mx-auto mb-3">
        <Icon size={18} className="text-zinc-400" strokeWidth={1.5} />
      </div>
      <p className="text-[11px] text-zinc-400 leading-relaxed font-medium">{text}</p>
    </div>
  );
}
