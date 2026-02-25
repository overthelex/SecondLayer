/**
 * ExpandableCard — reusable card with expand/collapse, copy, modal and external link actions.
 * Used by DecisionsTab, RegulationsTab and DocumentsTab.
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Check, Maximize2, ExternalLink, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';

const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: i * 0.04 },
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
  icon: Icon,
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
      className="bg-white border border-claude-border rounded-xl overflow-hidden hover:border-claude-subtext/30 hover:shadow-md transition-all duration-200"
    >
      <div onClick={onToggle} className="p-3 cursor-pointer group">
        {header}
        {!isExpanded && preview}
        {!isExpanded && (
          <div className="flex items-center justify-end pt-2 border-t border-claude-border/30 mt-2">
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Eye size={12} className="text-claude-subtext" strokeWidth={2} />
              <span className="text-[10px] text-claude-subtext">Розгорнути</span>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 border-t border-claude-border/30">
              <div className="mt-3 max-h-[300px] overflow-y-auto text-[12px] text-claude-text/90 leading-relaxed prose prose-sm prose-slate">
                <ReactMarkdown>{content}</ReactMarkdown>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-claude-border/30">
                <button
                  onClick={(e) => { e.stopPropagation(); copyContent(content); }}
                  className="flex items-center gap-1 text-[10px] text-claude-subtext hover:text-claude-text px-2 py-1 rounded-md hover:bg-claude-bg transition-colors"
                >
                  {copiedId === id ? <Check size={11} /> : <Copy size={11} />}
                  {copiedId === id ? 'Скопійовано' : 'Копіювати'}
                </button>
                {onOpenModal && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenModal(); }}
                    className="flex items-center gap-1 text-[10px] text-claude-subtext hover:text-claude-text px-2 py-1 rounded-md hover:bg-claude-bg transition-colors"
                  >
                    <Maximize2 size={11} />
                    Повний вигляд
                  </button>
                )}
                {externalUrl && (
                  <a
                    href={externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-[10px] text-claude-subtext hover:text-claude-text px-2 py-1 rounded-md hover:bg-claude-bg transition-colors"
                  >
                    <ExternalLink size={11} />
                    Відкрити
                  </a>
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
    <div className="text-center py-12 text-claude-subtext/50">
      <Icon size={28} className="mx-auto mb-3 opacity-30" strokeWidth={1.5} />
      <p className="text-[12px]">{text}</p>
    </div>
  );
}
