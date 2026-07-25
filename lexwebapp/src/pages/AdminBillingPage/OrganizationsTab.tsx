/**
 * Organizations tab - manages billing organizations
 */

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../utils/api-client';
import toast from 'react-hot-toast';
import type { BillingTier, Organization } from './types';

export function OrganizationsTab() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [orgDetail, setOrgDetail] = useState<any>(null);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [tiers, setTiers] = useState<BillingTier[]>([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [orgsRes, tiersRes] = await Promise.all([
        api.admin.getOrganizations(),
        api.admin.getBillingTiers(),
      ]);
      setOrgs(orgsRes.data.organizations || []);
      setTiers(tiersRes.data.tiers?.filter((t: BillingTier) => t.is_active) || []);
    } catch {
      toast.error('Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleExpand = async (orgId: string) => {
    if (expandedOrg === orgId) {
      setExpandedOrg(null);
      return;
    }
    try {
      const res = await api.admin.getOrganization(orgId);
      setOrgDetail(res.data);
      setExpandedOrg(orgId);
    } catch {
      toast.error('Failed to load org details');
    }
  };

  const handleSaveOrg = async () => {
    if (!editingOrg) return;
    try {
      await api.admin.updateOrganization(editingOrg.id, {
        plan: editingOrg.plan,
        max_members: editingOrg.max_members,
        billing_tier_key: editingOrg.billing_tier_key,
        billing_email: editingOrg.billing_email,
      });
      toast.success('Organization updated');
      setEditingOrg(null);
      load();
    } catch {
      toast.error('Failed to update organization');
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-500">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-sm text-gray-800">Organizations ({orgs.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Plan</th>
                <th className="px-4 py-2 text-right">Members</th>
                <th className="px-4 py-2 text-left">Owner</th>
                <th className="px-4 py-2 text-right">Balance</th>
                <th className="px-4 py-2 text-right">Total Spent</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orgs.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No organizations found</td></tr>
              )}
              {orgs.map((org) => (
                <React.Fragment key={org.id}>
                  <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => handleExpand(org.id)}>
                    <td className="px-4 py-2 font-medium">{org.name}</td>
                    <td className="px-4 py-2">{org.plan || '-'}</td>
                    <td className="px-4 py-2 text-right">{org.member_count}/{org.max_members}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{org.owner_email}</td>
                    <td className="px-4 py-2 text-right">${org.balance_usd.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">${org.total_spent_usd.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingOrg({ ...org }); }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                  {expandedOrg === org.id && orgDetail && (
                    <tr>
                      <td colSpan={7} className="px-6 py-3 bg-gray-50">
                        <div className="text-xs font-semibold text-gray-500 mb-2">Members</div>
                        <div className="space-y-1">
                          {orgDetail.members?.map((m: any) => (
                            <div key={m.user_id} className="flex items-center gap-3 text-xs">
                              <span className="text-gray-800">{m.name || m.email}</span>
                              <span className="text-gray-400">{m.email}</span>
                              <span className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">{m.role}</span>
                            </div>
                          ))}
                          {(!orgDetail.members || orgDetail.members.length === 0) && (
                            <span className="text-gray-400 text-xs">No members</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Org Modal */}
      {editingOrg && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setEditingOrg(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Edit: {editingOrg.name}</h3>
            <div className="space-y-3">
              <div>
                <label htmlFor="edit-org-plan" className="block text-xs text-gray-500 mb-1">Plan</label>
                <input id="edit-org-plan" name="plan" className="w-full border rounded-lg px-3 py-2 text-sm" value={editingOrg.plan || ''} onChange={(e) => setEditingOrg({ ...editingOrg, plan: e.target.value })} />
              </div>
              <div>
                <label htmlFor="edit-org-max-members" className="block text-xs text-gray-500 mb-1">Max Members</label>
                <input id="edit-org-max-members" name="maxMembers" type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={editingOrg.max_members} onChange={(e) => setEditingOrg({ ...editingOrg, max_members: Number(e.target.value) })} />
              </div>
              <div>
                <label htmlFor="edit-org-billing-tier" className="block text-xs text-gray-500 mb-1">Billing Tier</label>
                <select id="edit-org-billing-tier" name="billingTier" className="w-full border rounded-lg px-3 py-2 text-sm" value={editingOrg.billing_tier_key || ''} onChange={(e) => setEditingOrg({ ...editingOrg, billing_tier_key: e.target.value || null })}>
                  <option value="">None</option>
                  {tiers.map(t => <option key={t.id} value={t.tier_key}>{t.display_name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="edit-org-billing-email" className="block text-xs text-gray-500 mb-1">Billing Email</label>
                <input id="edit-org-billing-email" name="billingEmail" className="w-full border rounded-lg px-3 py-2 text-sm" value={editingOrg.billing_email || ''} onChange={(e) => setEditingOrg({ ...editingOrg, billing_email: e.target.value || null })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditingOrg(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleSaveOrg} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
