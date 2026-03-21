import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Loader2, FileText, AlertCircle, ChevronDown } from 'lucide-react';
import apiClient from '../../utils/api-client';
import { DiffViewer } from './DiffViewer';

interface Change {
  id: number;
  legislation_id: number;
  rada_id: string;
  article_number: string | null;
  change_type: 'added' | 'modified' | 'removed';
  old_text: string | null;
  new_text: string | null;
  diff_html: string | null;
  detected_at: string;
  version_date: string | null;
  title?: string;
  short_title?: string;
}

interface ChangeFeedProps {
  radaId?: string;
}

const changeTypeBadge: Record<string, { label: string; color: string }> = {
  added: { label: 'Додано', color: 'bg-green-50 text-green-700 border-green-200' },
  modified: { label: 'Змінено', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  removed: { label: 'Видалено', color: 'bg-red-50 text-red-700 border-red-200' },
};

function formatDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('uk-UA', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function ChangeFeed({ radaId }: ChangeFeedProps) {
  const [changes, setChanges] = useState<Change[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedChange, setExpandedChange] = useState<Change | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadChanges = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { limit: 50, offset: 0 };
      if (radaId) params.rada_id = radaId;

      const response = await apiClient.get('/api/legislation/monitoring/changes', { params });
      setChanges(response.data.changes || []);
      setTotal(response.data.total || 0);
    } catch (err) {
      console.error('Failed to load changes:', err);
    } finally {
      setLoading(false);
    }
  }, [radaId]);

  useEffect(() => { loadChanges(); }, [loadChanges]);

  const handleExpand = async (change: Change) => {
    if (expandedId === change.id) {
      setExpandedId(null);
      setExpandedChange(null);
      return;
    }

    setExpandedId(change.id);

    if (change.diff_html || change.old_text || change.new_text) {
      setExpandedChange(change);
      return;
    }

    setDetailLoading(true);
    try {
      const response = await apiClient.get(`/api/legislation/monitoring/changes/${change.id}`);
      setExpandedChange(response.data);
    } catch {
      setExpandedChange(change);
    } finally {
      setDetailLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-claude-accent" />
        <span className="ml-2 text-sm text-claude-subtext font-sans">Завантаження змін...</span>
      </div>
    );
  }

  if (changes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <FileText size={48} className="text-claude-subtext/30 mb-4" />
        <p className="text-claude-subtext font-sans text-sm">
          {radaId
            ? 'Для цього документа ще не зафіксовано змін'
            : 'Підпишіться на документи, щоб відстежувати зміни'}
        </p>
      </div>
    );
  }

  // Group by detected_at date
  const grouped = changes.reduce<Record<string, Change[]>>((acc, change) => {
    const dateKey = new Date(change.detected_at).toLocaleDateString('uk-UA');
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(change);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <p className="text-sm text-claude-subtext font-sans">
        Всього змін: {total}
      </p>

      {Object.entries(grouped).map(([dateStr, dateChanges]) => (
        <div key={dateStr}>
          <h3 className="text-sm font-medium text-claude-subtext font-sans mb-3 flex items-center gap-2">
            <AlertCircle size={14} />
            {dateStr}
          </h3>
          <div className="space-y-2">
            {dateChanges.map((change) => {
              const badge = changeTypeBadge[change.change_type] || changeTypeBadge.modified;
              return (
                <motion.div
                  key={change.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <button
                    onClick={() => handleExpand(change)}
                    className="w-full text-left p-4 bg-white rounded-xl border border-claude-border hover:border-claude-accent/30 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${badge.color}`}>
                          {badge.label}
                        </span>
                        <span className="text-sm font-sans text-claude-text">
                          {change.short_title || change.title || change.rada_id}
                          {change.article_number && ` — ст. ${change.article_number}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-claude-subtext font-sans">
                          {formatDateTime(change.detected_at)}
                        </span>
                        <ChevronDown
                          size={16}
                          className={`text-claude-subtext transition-transform ${expandedId === change.id ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </div>
                  </button>

                  {expandedId === change.id && (
                    <div className="mt-2 ml-4">
                      {detailLoading ? (
                        <div className="flex items-center py-4">
                          <Loader2 size={16} className="animate-spin text-claude-accent" />
                          <span className="ml-2 text-sm text-claude-subtext">Завантаження...</span>
                        </div>
                      ) : expandedChange ? (
                        <DiffViewer
                          diffHtml={expandedChange.diff_html}
                          oldText={expandedChange.old_text}
                          newText={expandedChange.new_text}
                          articleNumber={expandedChange.article_number}
                          changeType={expandedChange.change_type}
                        />
                      ) : null}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
