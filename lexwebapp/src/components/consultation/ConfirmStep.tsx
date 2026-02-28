import { Loader2, FileText, File } from 'lucide-react';
import type { CreateConsultationRequest } from '../../services/api/ConsultationService';
import type { VaultDocument } from '../../pages/DocumentsPage/types';
import { getFileExtension } from '../../pages/DocumentsPage/types';

const TYPE_LABELS: Record<string, string> = {
  consultation: 'Консультація',
  representation: 'Представництво в суді',
  document_review: 'Аналіз документів',
};

const URGENCY_LABELS: Record<string, string> = {
  low: 'Низька',
  normal: 'Звичайна',
  high: 'Висока',
  urgent: 'Термінова',
};

interface Props {
  form: CreateConsultationRequest;
  selectedDocIds: string[];
  allDocs: VaultDocument[];
  attorneyName: string;
  consultationFee?: number;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string;
}

export function ConfirmStep({ form, selectedDocIds, allDocs, attorneyName, consultationFee, onBack, onSubmit, submitting, error }: Props) {
  const selectedDocs = allDocs.filter(d => selectedDocIds.includes(d.id));

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>
        )}

        <div className="space-y-3">
          <Row label="Адвокат" value={attorneyName} />
          {consultationFee && <Row label="Вартість" value={`${consultationFee} грн`} />}
          <Row label="Тип послуги" value={TYPE_LABELS[form.consultationType || ''] || form.consultationType || ''} />
          <Row label="Тема" value={form.requestTitle} />
          {form.requestDescription && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Опис</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{form.requestDescription}</p>
            </div>
          )}
          <Row label="Терміновість" value={URGENCY_LABELS[form.urgency || ''] || form.urgency || ''} />
        </div>

        <div className="pt-2">
          <p className="text-xs text-gray-500 mb-2">Документи</p>
          {selectedDocs.length === 0 ? (
            <p className="text-sm text-gray-400">Документи не вибрані</p>
          ) : (
            <div className="space-y-1">
              {selectedDocs.map(doc => {
                const ext = getFileExtension(doc);
                return (
                  <div key={doc.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded text-sm">
                    {ext === '.pdf' ? (
                      <FileText className="w-4 h-4 text-red-500 shrink-0" />
                    ) : (
                      <File className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                    <span className="truncate">{doc.title}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 p-5 pt-3 border-t">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-2.5 border rounded-lg text-sm hover:bg-gray-50"
        >
          Назад
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Надіслати запит
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value}</p>
    </div>
  );
}
