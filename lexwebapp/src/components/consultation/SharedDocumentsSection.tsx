/**
 * SharedDocumentsSection
 * Shows shared documents in a consultation with E2EE status and access management.
 * Only visible when the consultation has document_ids.
 */

import { useState, useEffect } from 'react';
import { FileText, Lock, UserX, Loader2 } from 'lucide-react';
import { mcpService } from '../../services';
import { encryptionService } from '../../services/api/EncryptionService';
import { showToast } from '../../utils/toast';
import { toastT } from '../../i18n/toast-i18n';
import type { VaultDocument } from '../../pages/DocumentsPage/types';

interface Props {
  documentIds: string[];
  attorneyUserId: string;
  isClient: boolean;
  consultationStatus: string;
}

export function SharedDocumentsSection({ documentIds, attorneyUserId, isClient, consultationStatus }: Props) {
  const [docs, setDocs] = useState<VaultDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    if (documentIds.length === 0) {
      setLoading(false);
      return;
    }

    // Load document metadata
    mcpService.callTool('list_documents', { limit: 200 }).then(result => {
      const parsed = result?.result?.content?.[0]?.text
        ? JSON.parse(result.result.content[0].text)
        : result?.result || result;
      const allDocs: VaultDocument[] = parsed.documents || [];
      const shared = allDocs.filter(d => documentIds.includes(d.id));
      setDocs(shared);
    }).catch(() => {
      // Fail silently
    }).finally(() => setLoading(false));
  }, [documentIds]);

  const handleRevokeAccess = async (docId: string) => {
    setRevoking(docId);
    try {
      await encryptionService.revokeAccess(docId, attorneyUserId);
      showToast.success(toastT('documentAccessRevoked'));
    } catch (err: any) {
      showToast.error(toastT('documentAccessRevokeFailed'));
    } finally {
      setRevoking(null);
    }
  };

  if (documentIds.length === 0) return null;

  const isActive = ['paid', 'in_progress'].includes(consultationStatus);

  return (
    <div className="bg-white border rounded-lg p-4 mb-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <FileText size={16} className="text-gray-400" />
        Спільні документи ({documentIds.length})
      </h3>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 size={14} className="animate-spin" />
          Завантаження...
        </div>
      ) : docs.length === 0 ? (
        <p className="text-sm text-gray-400">Документи не знайдено</p>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <div
              key={doc.id}
              className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={14} className="text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-700 truncate">{doc.title}</span>
                {doc.is_encrypted && (
                  <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-semibold rounded border border-green-300 bg-green-50 text-green-700 flex-shrink-0">
                    <Lock size={8} className="mr-0.5" />
                    E2EE
                  </span>
                )}
              </div>

              {isClient && isActive && doc.is_encrypted && (
                <button
                  onClick={() => handleRevokeAccess(doc.id)}
                  disabled={revoking === doc.id}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                  title="Відкликати доступ до зашифрованого документа"
                >
                  {revoking === doc.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <UserX size={12} />
                  )}
                  Відкликати
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
