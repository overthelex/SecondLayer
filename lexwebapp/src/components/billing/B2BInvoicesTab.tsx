/**
 * B2B Invoices Tab
 * Table of B2B invoices for legal entities with bank transfer payment
 */

import { useState, useEffect, useCallback } from 'react';
import { FileText, Plus, Download, XCircle, RefreshCw } from 'lucide-react';
import { b2bInvoiceApi } from '../../utils/api/billing';
import type { B2BInvoice } from '../../types/models/Billing';
import { B2BInvoiceRequestModal } from './B2BInvoiceRequestModal';

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: 'Чернетка', color: 'bg-gray-100 text-gray-700' },
  issued: { label: 'Виставлено', color: 'bg-blue-100 text-blue-700' },
  sent: { label: 'Надіслано', color: 'bg-indigo-100 text-indigo-700' },
  paid: { label: 'Оплачено', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Скасовано', color: 'bg-red-100 text-red-700' },
  overdue: { label: 'Прострочено', color: 'bg-orange-100 text-orange-700' },
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

export function B2BInvoicesTab() {
  const [invoices, setInvoices] = useState<B2BInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { limit: 50 };
      if (statusFilter) params.status = statusFilter;
      const res = await b2bInvoiceApi.list(params);
      setInvoices(res.data.invoices || []);
      setTotal(res.data.total || 0);
    } catch {
      // If org not found or no access, show empty
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
      alert('Помилка завантаження PDF');
    }
  };

  const handleCancel = async (invoice: B2BInvoice) => {
    if (!confirm(`Скасувати рахунок ${invoice.invoice_number}?`)) return;
    try {
      await b2bInvoiceApi.cancel(invoice.id);
      fetchInvoices();
    } catch {
      alert('Помилка скасування рахунку');
    }
  };

  const handleCreated = () => {
    setShowModal(false);
    fetchInvoices();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-claude-text">Рахунки B2B</h2>
          <p className="text-sm text-claude-subtext mt-1">
            Рахунки на оплату для безготівкового розрахунку
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchInvoices()}
            className="p-2 hover:bg-claude-bg rounded-lg transition-colors"
            title="Оновити">
            <RefreshCw size={18} className="text-claude-subtext" />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-claude-accent text-white rounded-lg hover:bg-claude-accent/90 transition-colors text-sm font-medium">
            <Plus size={16} />
            Запросити рахунок
          </button>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        {[
          { value: '', label: 'Всі' },
          { value: 'issued', label: 'Виставлені' },
          { value: 'paid', label: 'Оплачені' },
          { value: 'cancelled', label: 'Скасовані' },
        ].map((f) => (
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
            Завантаження...
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-8 text-center text-claude-subtext">
            <FileText size={32} className="mx-auto mb-3 opacity-40" />
            <p>Рахунків ще немає</p>
            <p className="text-xs mt-1">Натисніть «Запросити рахунок» для створення</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-claude-border bg-claude-bg/50">
                <th className="text-left px-4 py-3 font-medium text-claude-subtext">Номер</th>
                <th className="text-left px-4 py-3 font-medium text-claude-subtext">Дата</th>
                <th className="text-left px-4 py-3 font-medium text-claude-subtext">Тип</th>
                <th className="text-right px-4 py-3 font-medium text-claude-subtext">Сума, грн</th>
                <th className="text-center px-4 py-3 font-medium text-claude-subtext">Статус</th>
                <th className="text-right px-4 py-3 font-medium text-claude-subtext">Дії</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const status = statusConfig[inv.status] || statusConfig.draft;
                const canCancel = ['draft', 'issued', 'sent'].includes(inv.status);

                return (
                  <tr key={inv.id} className="border-b border-claude-border last:border-0 hover:bg-claude-bg/30">
                    <td className="px-4 py-3 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="px-4 py-3">{formatDate(inv.issue_date)}</td>
                    <td className="px-4 py-3">
                      {inv.invoice_type === 'subscription' ? 'Підписка' : 'Поповнення'}
                      {inv.tier_name && <span className="text-claude-subtext ml-1">({inv.tier_name})</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatMoney(inv.total_uah)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleDownloadPDF(inv)}
                          className="p-1.5 hover:bg-claude-bg rounded-lg transition-colors"
                          title="Завантажити PDF">
                          <Download size={15} className="text-claude-subtext" />
                        </button>
                        {canCancel && (
                          <button
                            onClick={() => handleCancel(inv)}
                            className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                            title="Скасувати">
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
          Всього рахунків: {total}
        </p>
      )}

      {/* Create Invoice Modal */}
      {showModal && (
        <B2BInvoiceRequestModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
