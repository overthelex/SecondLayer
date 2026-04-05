import { useState, useEffect } from 'react';
import { FileText, ExternalLink, Calendar, Hash, Shield } from 'lucide-react';
import { authService } from '../../services/api/AuthService';
import showToast from '../../utils/toast';
import { toastT } from '../../i18n/toast-i18n';

interface Contract {
  id: string;
  version: string;
  contractNumber: string | null;
  contractDate: string | null;
  acceptedAt: string;
  ipAddress: string | null;
  title: string;
  type: string;
  url: string;
}

export function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authService.getMyContracts()
      .then(data => setContracts(data.contracts))
      .catch(() => showToast.error(toastT('contractsLoadFailed')))
      .finally(() => setLoading(false));
  }, []);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('uk-UA', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'attorney_offer': return <Shield size={20} className="text-blue-600" />;
      case 'client_offer': return <FileText size={20} className="text-emerald-600" />;
      case 'marketplace_rules': return <FileText size={20} className="text-amber-600" />;
      default: return <FileText size={20} className="text-claude-subtext" />;
    }
  };

  const typeBadge = (type: string) => {
    switch (type) {
      case 'attorney_offer': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'client_offer': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'marketplace_rules': return 'bg-amber-50 text-amber-700 border-amber-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-claude-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-claude-text font-sans">Мої договори</h1>
          <p className="text-sm text-claude-subtext mt-1">
            Підписані документи з платформою
          </p>
        </div>

        {contracts.length === 0 ? (
          <div className="text-center py-16">
            <FileText size={48} className="mx-auto text-claude-subtext/30 mb-4" />
            <p className="text-claude-subtext text-[15px]">Немає підписаних договорів</p>
          </div>
        ) : (
          <div className="space-y-4">
            {contracts.map(contract => (
              <div
                key={contract.id}
                className="bg-white border border-claude-border rounded-xl p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start gap-4">
                  <div className="p-2.5 bg-claude-bg rounded-xl flex-shrink-0">
                    {typeIcon(contract.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-[15px] font-semibold text-claude-text font-sans">
                        {contract.title}
                      </h3>
                      <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full border ${typeBadge(contract.type)}`}>
                        v{contract.version.split('-').pop() || contract.version}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-claude-subtext">
                      {contract.contractNumber && (
                        <div className="flex items-center gap-1.5">
                          <Hash size={13} className="text-claude-subtext/50" />
                          <span className="font-mono">{contract.contractNumber}</span>
                        </div>
                      )}
                      {contract.contractDate && (
                        <div className="flex items-center gap-1.5">
                          <Calendar size={13} className="text-claude-subtext/50" />
                          <span>Дата договору: {formatDate(contract.contractDate)}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Calendar size={13} className="text-claude-subtext/50" />
                        <span>Підписано: {formatDateTime(contract.acceptedAt)}</span>
                      </div>
                    </div>
                  </div>

                  {contract.url && contract.url !== '#' && (
                    <a
                      href={contract.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 p-2 text-claude-subtext hover:text-claude-accent hover:bg-claude-accent/5 rounded-lg transition-colors"
                      title="Відкрити документ"
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
