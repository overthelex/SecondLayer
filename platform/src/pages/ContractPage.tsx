import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, Loader2 } from 'lucide-react';
import { api } from '@/utils/api-client';
import content from '@/content/developer-offer-uk.md?raw';

interface Contract {
  version: string;
  contractNumber: string;
  contractDate: string;
  acceptedAt: string;
  ipAddress: string;
}

export function ContractPage() {
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/auth/my-contracts').then(({ data }) => {
      const dev = data.contracts?.find((c: Contract) => c.version === 'developer-offer-1.0');
      setContract(dev || null);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-txt-primary">Договір</h1>
        <p className="text-sm text-txt-muted mt-1">
          Публічна оферта про надання доступу до платформи
        </p>
      </div>

      {contract && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <FileText size={20} className="text-green-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-800">
              Договір №{contract.contractNumber} від {new Date(contract.contractDate).toLocaleDateString('uk-UA')}
            </p>
            <p className="text-xs text-green-700 mt-1">
              Прийнято {new Date(contract.acceptedAt).toLocaleString('uk-UA')}
              {' • contracts@legal.org.ua'}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-border p-6">
        <div className="prose prose-sm max-w-none prose-headings:text-txt-primary prose-p:text-txt-secondary prose-li:text-txt-secondary prose-strong:text-txt-primary">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
