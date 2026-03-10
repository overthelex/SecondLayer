/**
 * Matter Documents
 * Lists documents linked to a matter, with assign/unassign actions
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Plus,
  X,
  Loader2,
  Search,
  Check,
  Trash2,
} from 'lucide-react';
import { useMatterDocuments, useAssignDocuments, useUnassignDocuments } from '../../hooks/queries/useMatters';
import { mcpService } from '../../services';
import { DocumentViewerModal, DocumentViewerItem } from '../DocumentViewerModal';
import type { MatterDocument } from '../../services/api/MatterService';

const DOC_TYPE_LABELS: Record<string, string> = {
  contract: 'Договір',
  legislation: 'Законодавство',
  court_decision: 'Судове рішення',
  internal: 'Внутрішній',
  other: 'Інше',
};

const DOC_TYPE_COLORS: Record<string, string> = {
  contract: 'bg-blue-100 text-blue-700',
  legislation: 'bg-purple-100 text-purple-700',
  court_decision: 'bg-amber-100 text-amber-700',
  internal: 'bg-gray-100 text-gray-600',
  other: 'bg-gray-100 text-gray-600',
};

interface MatterDocumentsProps {
  matterId: string;
}

export function MatterDocuments({ matterId }: MatterDocumentsProps) {
  const { data, isLoading } = useMatterDocuments(matterId);
  const assignMutation = useAssignDocuments();
  const unassignMutation = useUnassignDocuments();

  const [showAddModal, setShowAddModal] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<DocumentViewerItem | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(false);

  const documents = data?.documents || [];
  const total = data?.total || 0;

  const handleUnassign = async (docId: string) => {
    await unassignMutation.mutateAsync({ matterId, documentIds: [docId] });
  };

  const handleViewDocument = async (doc: MatterDocument) => {
    setViewerLoading(true);
    setViewerOpen(true);
    try {
      const result = await mcpService.callTool('get_document', { documentId: doc.id });
      const content = result?.content || result?.document?.content || '';
      setViewerDoc({
        type: 'document',
        title: doc.title,
        badge: DOC_TYPE_LABELS[doc.type] || doc.type,
        content,
        documentId: doc.id,
        mimeType: doc.mime_type,
      });
    } catch {
      setViewerDoc({
        type: 'document',
        title: doc.title,
        content: 'Не вдалося завантажити документ',
        documentId: doc.id,
      });
    } finally {
      setViewerLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-claude-subtext" size={24} />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-claude-border shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-claude-border">
        <div>
          <h3 className="text-lg font-serif text-claude-text">Документи справи</h3>
          <p className="text-sm text-claude-subtext mt-0.5">
            {total} {total === 1 ? 'документ' : total < 5 ? 'документи' : 'документів'}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-claude-bg text-claude-text text-sm font-medium rounded-lg border border-claude-border hover:bg-claude-hover transition-colors"
        >
          <Plus size={16} />
          Додати документи
        </button>
      </div>

      {/* Documents list */}
      {documents.length === 0 ? (
        <div className="text-center py-12 px-6">
          <FileText size={32} className="mx-auto text-claude-subtext mb-3" />
          <p className="text-claude-subtext text-sm">
            Документи ще не додані до цієї справи
          </p>
        </div>
      ) : (
        <div className="divide-y divide-claude-border">
          {documents.map((doc: MatterDocument) => (
            <div
              key={doc.id}
              className="flex items-center justify-between px-6 py-3 hover:bg-claude-bg/50 transition-colors group"
            >
              <button
                onClick={() => handleViewDocument(doc)}
                className="flex items-center gap-3 flex-1 text-left min-w-0"
              >
                <FileText size={18} className="text-claude-subtext flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-claude-text truncate">{doc.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${DOC_TYPE_COLORS[doc.type] || DOC_TYPE_COLORS.other}`}>
                      {DOC_TYPE_LABELS[doc.type] || doc.type}
                    </span>
                    <span className="text-xs text-claude-subtext">
                      {doc.created_at ? new Date(doc.created_at).toLocaleDateString('uk-UA') : ''}
                    </span>
                  </div>
                </div>
              </button>
              <button
                onClick={() => handleUnassign(doc.id)}
                disabled={unassignMutation.isPending}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-claude-subtext hover:text-red-500 transition-all"
                title="Видалити зі справи"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Documents Modal */}
      <AnimatePresence>
        {showAddModal && (
          <AddDocumentsModal
            existingDocIds={documents.map((d: MatterDocument) => d.id)}
            onClose={() => setShowAddModal(false)}
            onAssign={async (ids) => {
              await assignMutation.mutateAsync({ matterId, documentIds: ids });
              setShowAddModal(false);
            }}
            isAssigning={assignMutation.isPending}
          />
        )}
      </AnimatePresence>

      {/* Document Viewer */}
      <DocumentViewerModal
        isOpen={viewerOpen}
        onClose={() => { setViewerOpen(false); setViewerDoc(null); }}
        item={viewerDoc}
        isLoading={viewerLoading}
      />
    </div>
  );
}

// ─── Add Documents Modal ──────────────────────────────────

interface AddDocumentsModalProps {
  existingDocIds: string[];
  onClose: () => void;
  onAssign: (ids: string[]) => Promise<void>;
  isAssigning: boolean;
}

function AddDocumentsModal({ existingDocIds, onClose, onAssign, isAssigning }: AddDocumentsModalProps) {
  const [availableDocs, setAvailableDocs] = useState<MatterDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      const result = await mcpService.callTool('list_documents', { limit: 200 });
      const docs = result?.documents || [];
      // Filter out already-assigned documents
      const unlinked = docs.filter((d: MatterDocument) => !existingDocIds.includes(d.id));
      setAvailableDocs(unlinked);
    } catch {
      setAvailableDocs([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = search.trim()
    ? availableDocs.filter((d: MatterDocument) =>
        d.title?.toLowerCase().includes(search.toLowerCase())
      )
    : availableDocs;

  const toggleDoc = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-claude-border">
          <h3 className="text-lg font-serif text-claude-text">Додати документи до справи</h3>
          <button onClick={onClose} className="text-claude-subtext hover:text-claude-text">
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pt-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-claude-subtext" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук документів..."
              className="w-full pl-9 pr-4 py-2 border border-claude-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent"
            />
          </div>
        </div>

        {/* Documents list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-claude-subtext" size={20} />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-claude-subtext text-sm py-8">
              {search ? 'Документів не знайдено' : 'Немає доступних документів'}
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((doc: MatterDocument) => (
                <button
                  key={doc.id}
                  onClick={() => toggleDoc(doc.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    selected.has(doc.id)
                      ? 'bg-claude-accent/10 border border-claude-accent/30'
                      : 'hover:bg-claude-bg border border-transparent'
                  }`}
                >
                  <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                    selected.has(doc.id)
                      ? 'bg-claude-accent border-claude-accent text-white'
                      : 'border-claude-border'
                  }`}>
                    {selected.has(doc.id) && <Check size={12} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-claude-text truncate">{doc.title}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${DOC_TYPE_COLORS[doc.type] || DOC_TYPE_COLORS.other}`}>
                      {DOC_TYPE_LABELS[doc.type] || doc.type}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-claude-border">
          <span className="text-sm text-claude-subtext">
            Обрано: {selected.size}
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-claude-subtext hover:text-claude-text transition-colors"
            >
              Скасувати
            </button>
            <button
              onClick={() => onAssign(Array.from(selected))}
              disabled={selected.size === 0 || isAssigning}
              className="flex items-center gap-2 px-4 py-2 bg-claude-accent text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-claude-accent/90 transition-colors"
            >
              {isAssigning && <Loader2 size={14} className="animate-spin" />}
              Додати
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
