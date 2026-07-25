/**
 * Team Overview Tab Component
 * Displays team members, statistics, roles, and management functions
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Trash2,
  RotateCw,
} from 'lucide-react';
import { api } from '../../utils/api-client';
import { TeamMember, TeamStats, PermissionRow } from '../../types/models/Team';
import toast from 'react-hot-toast';
import { getErrorMessage } from '../../utils/errors';
import { useAppT } from '../../i18n/app-i18n';

export function OverviewTab() {
  const { t } = useAppT();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'user' | 'observer'>('user');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    loadTeamData();
  }, []);

  const loadTeamData = async () => {
    try {
      setLoading(true);
      const [membersRes, statsRes] = await Promise.all([
        api.team.getMembers(),
        api.team.getStats(),
      ]);

      setMembers(membersRes.data.data || []);
      setStats(statsRes.data.data || null);
    } catch (error) {
      toast.error(t('team.loadError'));
      console.error('Error loading team data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inviteEmail) {
      toast.error(t('team.enterEmail'));
      return;
    }

    try {
      setInviting(true);
      await api.team.inviteMember(inviteEmail, inviteRole);
      toast.success(`${t('team.inviteSent')} ${inviteEmail}`);
      setInviteEmail('');
      setShowInviteForm(false);
      await loadTeamData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm(t('team.removeMemberConfirm'))) {
      return;
    }

    try {
      await api.team.removeMember(memberId);
      toast.success(t('team.memberRemoved'));
      await loadTeamData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleResendInvite = async (memberId: string) => {
    try {
      await api.team.resendInvite(memberId);
      toast.success(t('team.inviteResent'));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const permissions: PermissionRow[] = [
    { name: t('team.permApiTools'), owner: true, admin: true, user: true, observer: false },
    { name: t('team.permViewStats'), owner: true, admin: true, user: true, observer: true },
    { name: t('team.permManageKeys'), owner: true, admin: true, user: false, observer: false },
    { name: t('team.permManageUsers'), owner: true, admin: true, user: false, observer: false },
    { name: t('team.permBilling'), owner: true, admin: true, user: false, observer: false },
    { name: t('team.permChangePlan'), owner: true, admin: false, user: false, observer: false },
    { name: t('team.permDeleteOrg'), owner: true, admin: false, user: false, observer: false },
  ];

  return (
    <div className="space-y-8">
      {/* Upgrade Banner */}
      {(!stats || stats.totalMembers < 5) && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6"
        >
          <div className="absolute inset-0 opacity-10">
            <div className="absolute inset-0" style={{
              backgroundImage: 'linear-gradient(45deg, transparent 25%, rgba(255,255,255,.05) 25%, rgba(255,255,255,.05) 50%, transparent 50%, transparent 75%, rgba(255,255,255,.05) 75%, rgba(255,255,255,.05))',
              backgroundSize: '40px 40px',
            }}></div>
          </div>

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold mb-1">{t('team.upgradeTitle')}</h3>
              <p className="text-blue-100">
                {t('team.upgradeDesc')}
              </p>
            </div>
            <button className="px-6 py-2 bg-white text-blue-600 font-medium rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap">
              {t('team.upgradeButton')}
            </button>
          </div>
        </motion.div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t('team.totalMembers'), value: stats?.totalMembers || 0, unit: `/${10}` },
          { label: t('team.activeUsers'), value: stats?.activeUsers || 0, unit: t('team.last7Days') },
          { label: t('team.teamRequests'), value: stats?.teamRequests?.toLocaleString() || 0, unit: `/5,000` },
          { label: t('team.teamCost'), value: `₴${stats?.teamCost || 0}`, unit: t('team.thisMonth') },
        ].map((stat, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-white rounded-lg border border-gray-200 p-6"
          >
            <p className="text-gray-600 text-sm font-medium mb-2">{stat.label}</p>
            <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-gray-500 text-xs mt-1">{stat.unit}</p>
          </motion.div>
        ))}
      </div>

      {/* Team Members Section */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{t('team.membersTitle')}</h3>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowInviteForm(!showInviteForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            {t('team.inviteMember')}
          </motion.button>
        </div>

        {/* Invite Form */}
        {showInviteForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleInvite}
            className="px-6 py-4 border-b border-gray-200 bg-gray-50"
          >
            <div className="flex flex-col md:flex-row gap-4">
              <input
                type="email"
                placeholder={t('team.emailPlaceholder')}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={inviting}
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as any)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={inviting}
              >
                <option value="user">{t('team.roleUser')}</option>
                <option value="admin">{t('team.roleAdmin')}</option>
                <option value="observer">{t('team.roleObserver')}</option>
              </select>
              <button
                type="submit"
                disabled={inviting}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium"
              >
                {inviting ? t('team.sending') : t('team.sendInvite')}
              </button>
            </div>
          </motion.form>
        )}

        {/* Members Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">{t('team.thUser')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">{t('team.thRole')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">{t('team.thRequests')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">{t('team.thCost')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">{t('team.thLastActive')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">{t('team.thStatus')}</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-900 uppercase tracking-wider">{t('team.thActions')}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <motion.tr
                  key={member.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm bg-${member.avatarColor}-500`}
                    >
                      {member.initials}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{member.name}</p>
                      <p className="text-sm text-gray-500">{member.email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
                      {member.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {member.requests !== null ? member.requests.toLocaleString() : '—'}
                  </td>
                  <td className="px-6 py-4 text-gray-600">{member.cost || '—'}</td>
                  <td className="px-6 py-4 text-gray-600 text-sm">{member.lastActive}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      member.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : member.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {member.status === 'active' ? t('team.statusActive') : member.status === 'pending' ? t('team.statusPending') : t('team.statusInactive')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {member.status === 'pending' && (
                        <button
                          onClick={() => handleResendInvite(member.id)}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title={t('team.resendInvite')}
                        >
                          <RotateCw size={18} />
                        </button>
                      )}
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title={t('team.removeMember')}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {members.length === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-gray-500">{t('team.noMembers')}</p>
          </div>
        )}
      </div>

      {/* Roles & Permissions Matrix */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{t('team.rolesPermissions')}</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">{t('team.thPermission')}</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-900 uppercase tracking-wider">Owner</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-900 uppercase tracking-wider">Admin</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-900 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-900 uppercase tracking-wider">Observer</th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((row, idx) => (
                <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-900 font-medium">{row.name}</td>
                  <td className="px-6 py-4 text-center">
                    {row.owner ? <span className="text-green-600 text-lg">✓</span> : <span className="text-gray-300">✗</span>}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {row.admin ? <span className="text-green-600 text-lg">✓</span> : <span className="text-gray-300">✗</span>}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {row.user ? <span className="text-green-600 text-lg">✓</span> : <span className="text-gray-300">✗</span>}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {row.observer ? <span className="text-green-600 text-lg">✓</span> : <span className="text-gray-300">✗</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
