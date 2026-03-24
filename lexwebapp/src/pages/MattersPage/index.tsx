/**
 * Matters Page Component
 * List of matters with search, status filter, and client filter
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search,
  Briefcase,
  Plus,
  Shield,
  Calendar,
  User,
  Building2,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { useMatters } from '../../hooks/queries/useMatters';
import { useClients } from '../../hooks/queries/useClients';
import { Spinner } from '../../components/ui/Spinner';
import { CreateMatterModal } from '../../components/matters/CreateMatterModal';
import { generateRoute } from '../../router/routes';
import { useMattersT } from '../../i18n/matters-i18n';
import { getLocale } from '../../i18n/locales';
import type { MatterStatus } from '../../types/models/Matter';

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-600',
  archived: 'bg-amber-100 text-amber-700',
};

const PAGE_SIZE = 20;

type FilterStatus = 'all' | MatterStatus;

const STATUS_LABEL_KEYS: Record<string, string> = {
  open: 'statusOpen',
  active: 'statusActive',
  closed: 'statusClosed',
  archived: 'statusArchived',
};

export function MattersPage() {
  const navigate = useNavigate();
  const t = useMattersT();
  const locale = getLocale();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterClientId, setFilterClientId] = useState('');
  const [offset, setOffset] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');

  const { data: mattersData, isLoading, error, refetch } = useMatters({
    search: searchQuery || undefined,
    status: filterStatus !== 'all' ? filterStatus : undefined,
    clientId: filterClientId || undefined,
    limit: PAGE_SIZE,
    offset,
  });

  const { data: clientsData } = useClients({ limit: 200 });

  const matters = mattersData?.matters || [];
  const total = mattersData?.total || 0;
  const clients = clientsData?.clients || [];

  const hasMore = offset + PAGE_SIZE < total;
  const hasPrev = offset > 0;

  const handleCreateMatter = () => {
    setSelectedClientId(filterClientId || (clients.length > 0 ? clients[0].id : ''));
    setShowCreateModal(true);
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-claude-bg p-4 md:p-8 lg:p-12 pb-32">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-4"
        >
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-serif text-claude-text font-medium tracking-tight mb-2">
                {t('mattersTitle')}
              </h1>
              <p className="text-claude-subtext font-sans text-sm">
                {t('mattersSubtitle')}
              </p>
            </div>

            <button
              onClick={handleCreateMatter}
              className="flex items-center gap-2 px-4 py-2.5 bg-claude-accent text-white rounded-xl font-medium text-sm font-sans hover:bg-[#C66345] transition-colors shadow-sm active:scale-[0.98]"
            >
              <Plus size={18} />
              {t('createMatter')}
            </button>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-3 text-sm font-sans">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-claude-border shadow-sm">
              <span className="text-claude-subtext">{t('totalLabel')}</span>
              <span className="font-serif font-medium text-claude-text">{total}</span>
            </div>
          </div>

          {/* Search + Filters */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1 group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-claude-subtext group-focus-within:text-claude-accent transition-colors" />
              </div>
              <input
                type="text"
                className="block w-full pl-11 pr-4 py-3 bg-white border border-claude-border rounded-xl text-claude-text placeholder-claude-subtext/50 focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all shadow-sm font-sans"
                placeholder={t('searchMattersPlaceholder')}
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setOffset(0); }}
              />
            </div>

            {/* Status filter */}
            <div className="flex gap-2">
              {([
                ['all', t('filterAll')],
                ['open', t('filterOpen')],
                ['active', t('filterActive')],
                ['closed', t('filterClosed')],
                ['archived', t('filterArchived')],
              ] as [FilterStatus, string][]).map(([status, label]) => (
                <button
                  key={status}
                  onClick={() => { setFilterStatus(status); setOffset(0); }}
                  className={`px-4 py-3 rounded-xl font-medium text-sm font-sans transition-all whitespace-nowrap ${
                    filterStatus === status
                      ? 'bg-claude-accent text-white shadow-sm'
                      : 'bg-white text-claude-text border border-claude-border hover:bg-claude-bg'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Client filter */}
          {clients.length > 0 && (
            <div>
              <select
                value={filterClientId}
                onChange={(e) => { setFilterClientId(e.target.value); setOffset(0); }}
                className="px-3 py-2.5 bg-white border border-claude-border rounded-xl text-claude-text text-sm font-sans focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all"
              >
                <option value="">{t('allClients')}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.client_name}</option>
                ))}
              </select>
            </div>
          )}
        </motion.div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700"
          >
            <AlertCircle size={20} />
            <span className="font-sans text-sm">{t('failedToLoadMatters')}</span>
            <button onClick={() => refetch()} className="ml-auto text-sm font-medium underline hover:no-underline">
              {t('tryAgain')}
            </button>
          </motion.div>
        )}

        {/* Matters List */}
        {!isLoading && !error && (
          <div className="space-y-3">
            {matters.map((matter, index) => {
              const statusColor = STATUS_COLORS[matter.status] || STATUS_COLORS.open;
              const statusLabel = t(STATUS_LABEL_KEYS[matter.status] || 'statusOpen');
              return (
                <motion.div
                  key={matter.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.03 + 0.2 }}
                  onClick={() => navigate(generateRoute.matterDetail(matter.id))}
                  className="group bg-white rounded-2xl p-5 border border-claude-border shadow-sm hover:shadow-md hover:border-claude-subtext/30 transition-all cursor-pointer"
                >
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="w-10 h-10 rounded-lg bg-claude-bg flex items-center justify-center text-claude-subtext flex-shrink-0">
                      <Briefcase size={18} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono text-claude-subtext">{matter.matter_number}</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                              {statusLabel}
                            </span>
                            {matter.has_legal_hold && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                <Shield size={10} />
                                {t('legalHold')}
                              </span>
                            )}
                          </div>
                          <h3 className="text-lg font-serif font-medium text-claude-text group-hover:text-claude-accent transition-colors">
                            {matter.matter_name}
                          </h3>
                        </div>
                      </div>

                      {/* Details row */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                        {matter.client_name && (
                          <div className="flex items-center gap-2 text-sm text-claude-subtext font-sans">
                            <Building2 size={14} className="flex-shrink-0" />
                            <span className="truncate">{matter.client_name}</span>
                          </div>
                        )}
                        {matter.responsible_attorney && (
                          <div className="flex items-center gap-2 text-sm text-claude-subtext font-sans">
                            <User size={14} className="flex-shrink-0" />
                            <span className="truncate">{matter.responsible_attorney}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-sm text-claude-subtext font-sans">
                          <Calendar size={14} className="flex-shrink-0" />
                          <span>{new Date(matter.opened_date).toLocaleDateString(locale === 'uk' ? 'uk-UA' : locale === 'de' ? 'de-DE' : locale === 'es' ? 'es-ES' : 'en-US')}</span>
                        </div>
                      </div>

                      {/* Bottom action */}
                      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-claude-border/50">
                        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium font-sans text-claude-accent hover:bg-claude-accent/10 rounded-lg transition-colors ml-auto">
                          {t('openMatter')}
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && matters.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
            <div className="w-16 h-16 bg-claude-bg rounded-full flex items-center justify-center mx-auto mb-4 text-claude-subtext">
              <Briefcase size={24} />
            </div>
            <h3 className="text-lg font-serif text-claude-text mb-2">{t('noMattersFound')}</h3>
            <p className="text-claude-subtext font-sans max-w-md mx-auto text-sm">
              {total === 0 ? t('createFirstMatter') : t('adjustFilters')}
            </p>
          </motion.div>
        )}

        {/* Pagination */}
        {!isLoading && !error && total > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-4">
            <span className="text-sm text-claude-subtext font-sans">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} {t('paginationOf')} {total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                disabled={!hasPrev}
                className="px-4 py-2 rounded-xl text-sm font-sans font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-white border border-claude-border text-claude-text hover:bg-claude-bg"
              >
                {t('prevPage')}
              </button>
              <button
                onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                disabled={!hasMore}
                className="px-4 py-2 rounded-xl text-sm font-sans font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-white border border-claude-border text-claude-text hover:bg-claude-bg"
              >
                {t('nextPage')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <CreateMatterModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        clientId={selectedClientId}
        clientName={clients.find((c) => c.id === selectedClientId)?.client_name}
      />
    </div>
  );
}
