import { useEffect, useState } from 'react';
import {
  RefreshCw,
  XCircle,
  FileText,
  X,
} from 'lucide-react';
import { api } from '../../../utils/api-client';
import { formatDate } from './shared';

interface DocumentModalProps {
  documentId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DocumentModal({ documentId, isOpen, onClose }: DocumentModalProps) {
  const [document, setDocument] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (documentId && isOpen) {
      fetchDocument();
    }
  }, [documentId, isOpen]);

  const fetchDocument = async () => {
    if (!documentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.documents.getById(documentId);
      setDocument(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] mx-4 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-claude-border">
          <h3 className="text-lg font-semibold text-claude-text truncate pr-4">
            {document?.title || 'Документ'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0">
            <X size={20} className="text-claude-subtext" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={24} className="animate-spin text-claude-subtext mr-3" />
              <span>Завантаження...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <XCircle size={32} className="mx-auto mb-3 text-red-400" />
              <p className="text-red-600">{error}</p>
            </div>
          ) : document ? (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-xs">
                {document.case_number && <div><span className="text-claude-subtext">Номер справи:</span> <span className="font-mono">{document.case_number}</span></div>}
                {document.court && <div><span className="text-claude-subtext">Суд:</span> <span>{document.court}</span></div>}
                {document.date && <div><span className="text-claude-subtext">Дата:</span> <span>{formatDate(document.date)}</span></div>}
                {document.dispute_category && <div><span className="text-claude-subtext">Категорія:</span> <span>{document.dispute_category}</span></div>}
              </div>
              {document.full_text ? (
                <div className="whitespace-pre-wrap text-sm text-claude-text bg-gray-50 rounded-lg p-4 max-h-96 overflow-auto">
                  {document.full_text}
                </div>
              ) : document.full_text_html ? (
                <div className="text-sm text-claude-text bg-gray-50 rounded-lg p-4 max-h-96 overflow-auto"
                  dangerouslySetInnerHTML={{ __html: document.full_text_html }}
                />
              ) : (
                <div className="text-center py-8 text-claude-subtext">
                  <FileText size={32} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">Повний текст документа недоступний</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
        <div className="px-6 py-4 border-t border-claude-border flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-claude-border rounded-lg hover:bg-gray-50">Закрити</button>
        </div>
      </div>
    </div>
  );
}
