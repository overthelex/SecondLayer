/**
 * Matter Detail Page Component
 * Tabbed layout: overview, team, holds, documents, activity
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Briefcase,
  Users,
  Shield,
  FileText,
  Clock,
  Building2,
  User,
  Gavel,
  Calendar,
  Lock,
  Loader2,
  Plus,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useClientMatterStore } from '../../stores/clientMatterStore';
import { useMatter, useMatterTeam, useAddTeamMember, useRemoveTeamMember, useCloseMatter } from '../../hooks/queries/useMatters';
import { useClient } from '../../hooks/queries/useClients';
import { HoldsList } from '../../components/matters/HoldsList';
import { MatterDocuments } from '../../components/matters/MatterDocuments';
import { AuditLogViewer } from '../../components/audit/AuditLogViewer';
import { Spinner } from '../../components/ui/Spinner';
import { generateRoute, ROUTES } from '../../router/routes';
import { useMattersT } from '../../i18n/matters-i18n';
import { getLocale } from '../../i18n/locales';
import type { MatterTeamRole } from '../../types/models/Matter';

const MATTER_TYPE_KEYS: Record<string, string> = {
  litigation: 'typeLitigation',
  advisory: 'typeAdvisory',
  transactional: 'typeTransactional',
  regulatory: 'typeRegulatory',
  arbitration: 'typeArbitration',
  other: 'typeOther',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-600',
  archived: 'bg-amber-100 text-amber-700',
};

const STATUS_LABEL_KEYS: Record<string, string> = {
  open: 'statusOpen',
  active: 'statusActive',
  closed: 'statusClosed',
  archived: 'statusArchived',
};

const ROLE_LABEL_KEYS: Record<string, string> = {
  lead_attorney: 'roleLeadAttorney',
  associate: 'roleAssociate',
  paralegal: 'roleParalegal',
  counsel: 'roleCounsel',
  admin: 'roleAdmin',
  observer: 'roleObserver',
};

const ROLE_COLORS: Record<string, string> = {
  lead_attorney: 'bg-purple-100 text-purple-700',
  associate: 'bg-blue-100 text-blue-700',
  paralegal: 'bg-teal-100 text-teal-700',
  counsel: 'bg-indigo-100 text-indigo-700',
  admin: 'bg-gray-100 text-gray-700',
  observer: 'bg-gray-100 text-gray-500',
};

type Tab = 'overview' | 'team' | 'holds' | 'documents' | 'activity';

const TAB_IDS: Tab[] = ['overview', 'team', 'holds', 'documents', 'activity'];

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  overview: <Briefcase size={16} />,
  team: <Users size={16} />,
  holds: <Lock size={16} />,
  documents: <FileText size={16} />,
  activity: <Clock size={16} />,
};

const TAB_LABEL_KEYS: Record<Tab, string> = {
  overview: 'tabOverview',
  team: 'tabTeam',
  holds: 'tabHolds',
  documents: 'tabDocuments',
  activity: 'tabActivity',
};

export function MatterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const t = useMattersT();
  const locale = getLocale();
  const dateLocale = locale === 'uk' ? 'uk-UA' : locale === 'de' ? 'de-DE' : locale === 'es' ? 'es-ES' : 'en-US';
  const { data: matter, isLoading, error } = useMatter(id || '');
  const matterDetailTab = useClientMatterStore(s => s.matterDetailTab);
  const setMatterDetailTab = useClientMatterStore(s => s.setMatterDetailTab);
  const closeMatter = useCloseMatter();
  const { data: teamData } = useMatterTeam(matter?.id || '');
  const { data: clientData } = useClient(matter?.client_id || '');
  const removeTeamMember = useRemoveTeamMember();
  const addTeamMember = useAddTeamMember();
  const [addMemberId, setAddMemberId] = useState('');
  const [addMemberRole, setAddMemberRole] = useState<MatterTeamRole>('associate');

  const onBack = () => {
    navigate(ROUTES.MATTERS);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !matter) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-claude-subtext font-sans">{t('matterNotFound')}</p>
          <button
            onClick={onBack}
            className="mt-4 px-4 py-2 bg-claude-accent text-white rounded-lg font-sans text-sm"
          >
            {t('returnToList')}
          </button>
        </div>
      </div>
    );
  }

  const team = teamData?.members || [];
  const statusColor = STATUS_COLORS[matter.status] || STATUS_COLORS.open;
  const statusLabel = t(STATUS_LABEL_KEYS[matter.status] || 'statusOpen');
  const activeTab = matterDetailTab as Tab;

  const handleClose = async () => {
    if (window.confirm(t('closeConfirm'))) {
      try {
        await closeMatter.mutateAsync(matter.id);
      } catch {
        // Error handled by mutation
      }
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addMemberId.trim()) return;
    try {
      await addTeamMember.mutateAsync({
        matterId: matter.id,
        memberId: addMemberId.trim(),
        role: addMemberRole,
      });
      setAddMemberId('');
    } catch {
      // Error handled
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-claude-bg p-4 md:p-8 lg:p-12 pb-32">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Back */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-claude-subtext hover:text-claude-text transition-colors group"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          <span className="font-sans text-sm">{t('backToMatters')}</span>
        </button>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="bg-white rounded-2xl p-6 md:p-8 border border-claude-border shadow-sm"
        >
          <div className="flex flex-col md:flex-row items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-mono text-claude-subtext">{matter.matter_number}</span>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${statusColor}`}>
                  {statusLabel}
                </span>
                {matter.has_legal_hold && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-red-100 text-red-700">
                    <Shield size={12} />
                    {t('legalHold')}
                  </span>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-serif text-claude-text font-medium tracking-tight">
                {matter.matter_name}
              </h1>

              {/* Client link */}
              {clientData && (
                <button
                  onClick={() => navigate(generateRoute.clientDetail(matter.client_id))}
                  className="flex items-center gap-2 mt-2 text-sm text-claude-accent font-sans hover:underline"
                >
                  <Building2 size={14} />
                  {clientData.client_name}
                </button>
              )}
            </div>

            <div className="flex gap-2">
              {(matter.status === 'open' || matter.status === 'active') && (
                <button
                  onClick={handleClose}
                  disabled={closeMatter.isPending}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-sans font-medium text-gray-700 bg-white border border-claude-border rounded-xl hover:bg-claude-bg transition-colors disabled:opacity-50"
                >
                  {closeMatter.isPending ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                  {t('closeMatter')}
                </button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl border border-claude-border p-1 shadow-sm overflow-x-auto">
          {TAB_IDS.map((tabId) => (
            <button
              key={tabId}
              onClick={() => setMatterDetailTab(tabId)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-sans font-medium transition-all whitespace-nowrap ${
                activeTab === tabId
                  ? 'bg-claude-accent text-white shadow-sm'
                  : 'text-claude-subtext hover:text-claude-text hover:bg-claude-bg'
              }`}
            >
              {TAB_ICONS[tabId]}
              {t(TAB_LABEL_KEYS[tabId])}
              {tabId === 'team' && team.length > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === 'team' ? 'bg-white/20' : 'bg-claude-subtext/10'}`}>
                  {team.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Details */}
              <div className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm">
                <h2 className="text-xl font-serif text-claude-text mb-4">{t('matterDetails')}</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-claude-bg rounded-lg">
                    <div>
                      <span className="text-sm text-claude-subtext font-sans">{t('typeLabel')}</span>
                      <p className="text-[11px] text-claude-subtext/60 font-sans">{t('typeDescription')}</p>
                    </div>
                    <span className="text-sm font-medium text-claude-text font-sans">
                      {t(MATTER_TYPE_KEYS[matter.matter_type] || 'typeOther')}
                    </span>
                  </div>
                  {matter.responsible_attorney && (
                    <div className="flex items-center justify-between p-3 bg-claude-bg rounded-lg">
                      <div>
                        <span className="text-sm text-claude-subtext font-sans">{t('responsibleLabel')}</span>
                        <p className="text-[11px] text-claude-subtext/60 font-sans">{t('responsibleDescription')}</p>
                      </div>
                      <span className="text-sm font-medium text-claude-text font-sans flex items-center gap-2">
                        <User size={14} />
                        {matter.responsible_attorney}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between p-3 bg-claude-bg rounded-lg">
                    <div>
                      <span className="text-sm text-claude-subtext font-sans">{t('openDate')}</span>
                      <p className="text-[11px] text-claude-subtext/60 font-sans">{t('openDateDescription')}</p>
                    </div>
                    <span className="text-sm font-medium text-claude-text font-sans flex items-center gap-2">
                      <Calendar size={14} />
                      {new Date(matter.opened_date).toLocaleDateString(dateLocale)}
                    </span>
                  </div>
                  {matter.closed_date && (
                    <div className="flex items-center justify-between p-3 bg-claude-bg rounded-lg">
                      <div>
                        <span className="text-sm text-claude-subtext font-sans">{t('closeDate')}</span>
                        <p className="text-[11px] text-claude-subtext/60 font-sans">{t('closeDateDescription')}</p>
                      </div>
                      <span className="text-sm font-medium text-claude-text font-sans">
                        {new Date(matter.closed_date).toLocaleDateString(dateLocale)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between p-3 bg-claude-bg rounded-lg">
                    <div>
                      <span className="text-sm text-claude-subtext font-sans">{t('retentionPeriod')}</span>
                      <p className="text-[11px] text-claude-subtext/60 font-sans">{t('retentionDescription')}</p>
                    </div>
                    <span className="text-sm font-medium text-claude-text font-sans">
                      {matter.retention_period_years} {t('yearsShort')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Court & Parties */}
              <div className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm">
                <h2 className="text-xl font-serif text-claude-text mb-4">{t('courtAndParties')}</h2>
                <div className="space-y-4">
                  {matter.court_name && (
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-claude-bg rounded-lg text-claude-subtext"><Gavel size={18} /></div>
                      <div>
                        <div className="text-xs text-claude-subtext font-sans mb-0.5">{t('courtLabel')}</div>
                        <p className="text-[11px] text-claude-subtext/60 font-sans mb-1">{t('courtDescription')}</p>
                        <p className="text-sm text-claude-text font-sans">{matter.court_name}</p>
                      </div>
                    </div>
                  )}
                  {matter.court_case_number && (
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-claude-bg rounded-lg text-claude-subtext"><FileText size={18} /></div>
                      <div>
                        <div className="text-xs text-claude-subtext font-sans mb-0.5">{t('courtCaseNumber')}</div>
                        <p className="text-[11px] text-claude-subtext/60 font-sans mb-1">{t('courtCaseNumberDescription')}</p>
                        <p className="text-sm text-claude-text font-sans font-mono">{matter.court_case_number}</p>
                      </div>
                    </div>
                  )}
                  {matter.opposing_party && (
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-claude-bg rounded-lg text-claude-subtext"><Users size={18} /></div>
                      <div>
                        <div className="text-xs text-claude-subtext font-sans mb-0.5">{t('opposingParty')}</div>
                        <p className="text-[11px] text-claude-subtext/60 font-sans mb-1">{t('opposingPartyDescription')}</p>
                        <p className="text-sm text-claude-text font-sans">{matter.opposing_party}</p>
                      </div>
                    </div>
                  )}
                  {matter.related_parties && matter.related_parties.length > 0 && (
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-claude-bg rounded-lg text-claude-subtext"><Users size={18} /></div>
                      <div>
                        <div className="text-xs text-claude-subtext font-sans mb-0.5">{t('relatedParties')}</div>
                        <p className="text-[11px] text-claude-subtext/60 font-sans mb-1">{t('relatedPartiesDescription')}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {matter.related_parties.map((party, i) => (
                            <span key={i} className="px-2 py-0.5 bg-claude-bg rounded text-xs font-sans text-claude-text">
                              {typeof party === 'object' && party !== null
                                ? [party.name, party.role, party.inn].filter(Boolean).join(' — ')
                                : String(party)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {!matter.court_name && !matter.court_case_number && !matter.opposing_party && (
                    <p className="text-sm text-claude-subtext font-sans">{t('noCourtInfo')}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'team' && (
            <div className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-serif text-claude-text">{t('matterTeam')}</h2>
              </div>

              {/* Add member form */}
              <form onSubmit={handleAddMember} className="flex gap-2 mb-6 p-4 bg-claude-bg rounded-xl">
                <input
                  id="matter-add-member-id"
                  name="memberId"
                  type="text"
                  value={addMemberId}
                  onChange={(e) => setAddMemberId(e.target.value)}
                  placeholder={t('memberIdPlaceholder')}
                  className="flex-1 px-3 py-2 bg-white border border-claude-border rounded-lg text-sm font-sans focus:outline-none focus:ring-2 focus:ring-claude-accent/20"
                />
                <select
                  id="matter-add-member-role"
                  name="memberRole"
                  value={addMemberRole}
                  onChange={(e) => setAddMemberRole(e.target.value as MatterTeamRole)}
                  className="px-3 py-2 bg-white border border-claude-border rounded-lg text-sm font-sans focus:outline-none focus:ring-2 focus:ring-claude-accent/20"
                >
                  {Object.entries(ROLE_LABEL_KEYS).map(([value, key]) => (
                    <option key={value} value={value}>{t(key)}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={addTeamMember.isPending || !addMemberId.trim()}
                  className="flex items-center gap-1 px-3 py-2 bg-claude-accent text-white rounded-lg text-sm font-sans font-medium hover:bg-[#C66345] transition-colors disabled:opacity-50"
                >
                  {addTeamMember.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {t('addButton')}
                </button>
              </form>

              {/* Team list */}
              {team.length === 0 ? (
                <div className="text-center py-8">
                  <Users size={24} className="mx-auto text-claude-subtext mb-2" />
                  <p className="text-claude-subtext font-sans text-sm">{t('noTeamMembers')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {team.map((member, index) => {
                    const roleColor = ROLE_COLORS[member.role] || ROLE_COLORS.observer;
                    return (
                      <motion.div
                        key={member.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-center justify-between p-3 border border-claude-border/50 rounded-xl hover:bg-claude-bg/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-claude-sidebar flex items-center justify-center text-sm font-serif text-claude-subtext">
                            {(member.user_name || member.user_id).slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-claude-text font-sans">
                              {member.user_name || member.user_id}
                            </div>
                            {member.user_email && (
                              <div className="text-xs text-claude-subtext font-sans">{member.user_email}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${roleColor}`}>
                            {t(ROLE_LABEL_KEYS[member.role] || 'roleObserver')}
                          </span>
                          <button
                            onClick={() => removeTeamMember.mutate({ matterId: matter.id, userId: member.user_id })}
                            className="p-1.5 text-claude-subtext hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title={t('removeTitle')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'holds' && (
            <div className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm">
              <HoldsList matterId={matter.id} />
            </div>
          )}

          {activeTab === 'documents' && (
            <MatterDocuments matterId={matter.id} />
          )}

          {activeTab === 'activity' && (
            <div className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm">
              <h2 className="text-xl font-serif text-claude-text mb-4">{t('activityHistory')}</h2>
              <AuditLogViewer resourceType="matter" resourceId={matter.id} />
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
