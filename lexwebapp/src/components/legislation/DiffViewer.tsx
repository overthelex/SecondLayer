import { motion } from 'framer-motion';

interface DiffViewerProps {
  diffHtml: string | null;
  oldText?: string | null;
  newText?: string | null;
  articleNumber?: string | null;
  changeType: 'added' | 'modified' | 'removed';
}

const changeTypeLabels: Record<string, { label: string; color: string }> = {
  added: { label: 'Додано', color: 'bg-green-50 text-green-700 border-green-200' },
  modified: { label: 'Змінено', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  removed: { label: 'Видалено', color: 'bg-red-50 text-red-700 border-red-200' },
};

export function DiffViewer({ diffHtml, oldText, newText, articleNumber, changeType }: DiffViewerProps) {
  const typeConfig = changeTypeLabels[changeType] || changeTypeLabels.modified;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-claude-border overflow-hidden"
    >
      <div className="flex items-center gap-3 px-4 py-3 bg-claude-bg border-b border-claude-border">
        {articleNumber && (
          <span className="text-sm font-medium text-claude-text font-sans">
            Стаття {articleNumber}
          </span>
        )}
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${typeConfig.color}`}>
          {typeConfig.label}
        </span>
      </div>

      <div className="p-4">
        {changeType === 'modified' && diffHtml ? (
          <div
            className="text-sm font-sans text-claude-text leading-relaxed whitespace-pre-wrap diff-content"
            dangerouslySetInnerHTML={{ __html: diffHtml }}
          />
        ) : changeType === 'added' && newText ? (
          <div className="text-sm font-sans text-claude-text leading-relaxed whitespace-pre-wrap">
            <ins className="diff-add">{newText}</ins>
          </div>
        ) : changeType === 'removed' && oldText ? (
          <div className="text-sm font-sans text-claude-text leading-relaxed whitespace-pre-wrap">
            <del className="diff-del">{oldText}</del>
          </div>
        ) : (
          <p className="text-sm text-claude-subtext font-sans">
            Деталі зміни недоступні
          </p>
        )}
      </div>

      <style>{`
        .diff-content ins.diff-add,
        ins.diff-add {
          background-color: #d4edda;
          text-decoration: none;
          padding: 1px 2px;
          border-radius: 2px;
        }
        .diff-content del.diff-del,
        del.diff-del {
          background-color: #f8d7da;
          text-decoration: line-through;
          padding: 1px 2px;
          border-radius: 2px;
        }
      `}</style>
    </motion.div>
  );
}
