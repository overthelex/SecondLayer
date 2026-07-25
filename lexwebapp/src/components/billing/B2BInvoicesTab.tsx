/**
 * B2B Invoices Tab
 * Table of B2B invoices for legal entities with bank transfer payment
 */

import { useState, useEffect, useCallback } from 'react';
import { FileText, Plus, Download, XCircle, RefreshCw, X, Eye, Loader2 } from 'lucide-react';
import { b2bInvoiceApi } from '../../utils/api/billing';
import type { B2BInvoice } from '../../types/models/Billing';
import { B2BInvoiceRequestModal } from './B2BInvoiceRequestModal';
import { useAppT } from '../../i18n/app-i18n';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  issued: 'bg-blue-100 text-blue-700',
  sent: 'bg-indigo-100 text-indigo-700',
  paid: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  overdue: 'bg-orange-100 text-orange-700',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatMoney(amount: number): string {
  return amount.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function InvoicePreviewModal({
  invoice,
  onClose,
}: {
  invoice: B2BInvoice;
  onClose: () => void;
}) {
  const { t } = useAppT();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let url: string | null = null;
    b2bInvoiceApi.downloadPDF(invoice.id).then(res => {
      const blob = new Blob([res.data], { type: 'application/pdf' });
      url = window.URL.createObjectURL(blob);
      setPdfUrl(url);
    }).catch(() => {
      setError(t('billing.invoices.error.downloadPdf'));
    }).finally(() => {
      setLoading(false);
    });

    return () => {
      if (url) window.URL.revokeObjectURL(url);
    };
  }, [invoice.id]);

  const handleDownload = () => {
    if (!pdfUrl) return;
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = `${invoice.invoice_number}.pdf`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl mx-4 h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-claude-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <FileText size={20} className="text-claude-accent" />
            <div>
              <h2 className="text-lg font-semibold text-claude-text">
                {t('billing.invoices.preview.title')} {invoice.invoice_number}
              </h2>
              <p className="text-xs text-claude-subtext">
                {formatDate(invoice.issue_date)} · {formatMoney(invoice.total_uah)} грн
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={!pdfUrl}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-claude-accent text-white rounded-lg text-sm font-medium hover:bg-claude-accent/90 transition-colors disabled:opacity-50"
              title={t('billing.invoices.action.download')}>
              <Download size={14} />
              {t('billing.invoices.preview.download')}
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-claude-bg rounded-lg">
              <X size={20} className="text-claude-subtext" />
            </button>
          </div>
        </div>

        {/* PDF viewer */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="h-full flex items-center justify-center text-claude-subtext">
              <Loader2 size={24} className="animate-spin mr-2" />
              {t('billing.invoices.preview.loading')}
            </div>
          ) : error ? (
            <div className="h-full flex items-center justify-center text-red-500 text-sm">
              {error}
            </div>
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full h-full border-0"
              title={`${t('billing.invoices.preview.title')} ${invoice.invoice_number}`}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function B2BInvoicesTab() {
  const { t } = useAppT();
  const [invoices, setInvoices] = useState<B2BInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [previewInvoice, setPreviewInvoice] = useState<B2BInvoice | null>(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { limit: 50 };
      if (statusFilter) params.status = statusFilter;
      const res = await b2bInvoiceApi.list(params);
      setInvoices(res.data.invoices || []);
      setTotal(res.data.total || 0);
    } catch {
      setInvoices([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleDownloadPDF = async (invoice: B2BInvoice) => {
    try {
      const res = await b2bInvoiceApi.downloadPDF(invoice.id);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoice.invoice_number}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert(t('billing.invoices.error.downloadPdf'));
    }
  };

  const handleCancel = async (invoice: B2BInvoice) => {
    if (!confirm(`${t('billing.invoices.action.cancelConfirm')} ${invoice.invoice_number}?`)) return;
    try {
      await b2bInvoiceApi.cancel(invoice.id);
      fetchInvoices();
    } catch {
      alert(t('billing.invoices.error.cancel'));
    }
  };

  const handleCreated = () => {
    setShowModal(false);
    fetchInvoices();
  };

  const statusFilters = [
    { value: '', label: t('billing.invoices.filter.all') },
    { value: 'issued', label: t('billing.invoices.filter.issued') },
    { value: 'paid', label: t('billing.invoices.filter.paid') },
    { value: 'cancelled', label: t('billing.invoices.filter.cancelled') },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-claude-text">{t('billing.invoices.title')}</h2>
          <p className="text-sm text-claude-subtext mt-1">
            {t('billing.invoices.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchInvoices()}
            className="p-2 hover:bg-claude-bg rounded-lg transition-colors"
            title={t('billing.invoices.refresh')}>
            <RefreshCw size={18} className="text-claude-subtext" />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-claude-accent text-white rounded-lg hover:bg-claude-accent/90 transition-colors text-sm font-medium">
            <Plus size={16} />
            {t('billing.invoices.request')}
          </button>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        {statusFilters.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === f.value
                ? 'bg-claude-accent text-white'
                : 'bg-white border border-claude-border text-claude-subtext hover:text-claude-text'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-claude-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-claude-subtext">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
            {t('billing.invoices.loading')}
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-8 text-center text-claude-subtext">
            <FileText size={32} className="mx-auto mb-3 opacity-40" />
            <p>{t('billing.invoices.empty')}</p>
            <p className="text-xs mt-1">{t('billing.invoices.emptyHint')}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-claude-border bg-claude-bg/50">
                <th className="text-left px-4 py-3 font-medium text-claude-subtext">{t('billing.invoices.col.number')}</th>
                <th className="text-left px-4 py-3 font-medium text-claude-subtext">{t('billing.invoices.col.date')}</th>
                <th className="text-left px-4 py-3 font-medium text-claude-subtext">{t('billing.invoices.col.type')}</th>
                <th className="text-right px-4 py-3 font-medium text-claude-subtext">{t('billing.invoices.col.amount')}</th>
                <th className="text-center px-4 py-3 font-medium text-claude-subtext">{t('billing.invoices.col.status')}</th>
                <th className="text-right px-4 py-3 font-medium text-claude-subtext">{t('billing.invoices.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const statusColor = statusColors[inv.status] || statusColors.draft;
                const statusLabel = t(`billing.invoice.status.${inv.status}`) || t('billing.invoice.status.draft');
                const canCancel = ['draft', 'issued', 'sent'].includes(inv.status);

                return (
                  <tr
                    key={inv.id}
                    className="border-b border-claude-border last:border-0 hover:bg-claude-bg/30 cursor-pointer"
                    onClick={() => setPreviewInvoice(inv)}>
                    <td className="px-4 py-3 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="px-4 py-3">{formatDate(inv.issue_date)}</td>
                    <td className="px-4 py-3">
                      {inv.invoice_type === 'subscription'
                        ? t('billing.invoices.type.subscription')
                        : t('billing.invoices.type.topup')}
                      {inv.tier_name && <span className="text-claude-subtext ml-1">({inv.tier_name})</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatMoney(inv.total_uah)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setPreviewInvoice(inv); }}
                          className="p-1.5 hover:bg-claude-bg rounded-lg transition-colors"
                          title={t('billing.invoices.action.preview')}>
                          <Eye size={15} className="text-claude-subtext" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDownloadPDF(inv); }}
                          className="p-1.5 hover:bg-claude-bg rounded-lg transition-colors"
                          title={t('billing.invoices.action.download')}>
                          <Download size={15} className="text-claude-subtext" />
                        </button>
                        {canCancel && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCancel(inv); }}
                            className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                            title={t('billing.invoices.action.cancel')}>
                            <XCircle size={15} className="text-red-400" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {total > 0 && (
        <p className="text-xs text-claude-subtext text-right">
          {t('billing.invoices.total')}: {total}
        </p>
      )}

      {/* Create Invoice Modal */}
      {showModal && (
        <B2BInvoiceRequestModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}

      {/* PDF Preview Modal */}
      {previewInvoice && (
        <InvoicePreviewModal
          invoice={previewInvoice}
          onClose={() => setPreviewInvoice(null)}
        />
      )}
    </div>
  );
}
