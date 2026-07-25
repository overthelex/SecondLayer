/**
 * Subscriptions tab - manages user/org subscriptions
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../utils/api-client';
import toast from 'react-hot-toast';
import type { BillingTier, Subscription } from './types';
import { StatusBadge } from './StatusBadge';

export function SubscriptionsTab() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [cancelModal, setCancelModal] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [tiers, setTiers] = useState<BillingTier[]>([]);

  // Create form
  const [createForm, setCreateForm] = useState({
    user_id: '', organization_id: '', tier_key: '', billing_cycle: 'monthly' as string, price_usd: 0, trial_ends_at: '',
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [subsRes, tiersRes] = await Promise.all([
        api.admin.getSubscriptions({ status: statusFilter || undefined }),
        api.admin.getBillingTiers(),
      ]);
      setSubs(subsRes.data.subscriptions || []);
      setTotal(subsRes.data.total || 0);
      setTiers(tiersRes.data.tiers?.filter((t: BillingTier) => t.is_active) || []);
    } catch {
      toast.error('Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    try {
      await api.admin.createSubscription({
        user_id: createForm.user_id || undefined,
        organization_id: createForm.organization_id || undefined,
        tier_key: createForm.tier_key,
        billing_cycle: createForm.billing_cycle,
        price_usd: createForm.price_usd,
        trial_ends_at: createForm.trial_ends_at || undefined,
      });
      toast.success('Subscription created');
      setShowCreate(false);
      setCreateForm({ user_id: '', organization_id: '', tier_key: '', billing_cycle: 'monthly', price_usd: 0, trial_ends_at: '' });
      load();
    } catch {
      toast.error('Failed to create subscription');
    }
  };

  const handleCancel = async () => {
    if (!cancelModal) return;
    try {
      await api.admin.cancelSubscription(cancelModal, cancelReason || 'Admin canceled');
      toast.success('Subscription canceled');
      setCancelModal(null);
      setCancelReason('');
      load();
    } catch {
      toast.error('Failed to cancel subscription');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await api.admin.activateSubscription(id);
      toast.success('Subscription activated');
      load();
    } catch {
      toast.error('Failed to activate subscription');
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-500">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select
            className="border rounded-lg px-3 py-1.5 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="past_due">Past Due</option>
            <option value="canceled">Canceled</option>
            <option value="expired">Expired</option>
          </select>
          <span className="text-xs text-gray-400">{total} total</span>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          + Create
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">User / Org</th>
                <th className="px-4 py-2 text-left">Tier</th>
                <th className="px-4 py-2 text-center">Status</th>
                <th className="px-4 py-2 text-left">Cycle</th>
                <th className="px-4 py-2 text-right">Price</th>
                <th className="px-4 py-2 text-left">Next Billing</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {subs.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No subscriptions found</td></tr>
              )}
              {subs.map((sub) => (
                <tr key={sub.id}>
                  <td className="px-4 py-2">
                    {sub.user_email || sub.user_name || sub.org_name || (sub.user_id ? `User ${sub.user_id.slice(0, 8)}...` : `Org ${sub.organization_id?.slice(0, 8)}...`)}
                  </td>
                  <td className="px-4 py-2">{sub.tier_display_name || sub.tier_key}</td>
                  <td className="px-4 py-2 text-center"><StatusBadge status={sub.status} /></td>
                  <td className="px-4 py-2">{sub.billing_cycle}</td>
                  <td className="px-4 py-2 text-right">${sub.price_usd.toFixed(2)}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {sub.next_billing_date ? new Date(sub.next_billing_date).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">
                    {(sub.status === 'active' || sub.status === 'trial') && (
                      <button onClick={() => setCancelModal(sub.id)} className="text-xs text-red-500 hover:underline">Cancel</button>
                    )}
                    {sub.status === 'canceled' && (
                      <button onClick={() => handleActivate(sub.id)} className="text-xs text-green-600 hover:underline">Activate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Create Subscription</h3>
            <div className="space-y-3">
              <div>
                <label htmlFor="create-sub-user-id" className="block text-xs text-gray-500 mb-1">User ID (leave empty for org)</label>
                <input id="create-sub-user-id" name="userId" className="w-full border rounded-lg px-3 py-2 text-sm" value={createForm.user_id} onChange={(e) => setCreateForm({ ...createForm, user_id: e.target.value })} placeholder="UUID" />
              </div>
              <div>
                <label htmlFor="create-sub-org-id" className="block text-xs text-gray-500 mb-1">Organization ID (leave empty for user)</label>
                <input id="create-sub-org-id" name="organizationId" className="w-full border rounded-lg px-3 py-2 text-sm" value={createForm.organization_id} onChange={(e) => setCreateForm({ ...createForm, organization_id: e.target.value })} placeholder="UUID" />
              </div>
              <div>
                <label htmlFor="create-sub-tier" className="block text-xs text-gray-500 mb-1">Tier</label>
                <select id="create-sub-tier" name="tier" className="w-full border rounded-lg px-3 py-2 text-sm" value={createForm.tier_key} onChange={(e) => setCreateForm({ ...createForm, tier_key: e.target.value })}>
                  <option value="">Select tier</option>
                  {tiers.map(t => <option key={t.id} value={t.tier_key}>{t.display_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="create-sub-billing-cycle" className="block text-xs text-gray-500 mb-1">Billing Cycle</label>
                  <select id="create-sub-billing-cycle" name="billingCycle" className="w-full border rounded-lg px-3 py-2 text-sm" value={createForm.billing_cycle} onChange={(e) => setCreateForm({ ...createForm, billing_cycle: e.target.value })}>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="create-sub-price" className="block text-xs text-gray-500 mb-1">Price (USD)</label>
                  <input id="create-sub-price" name="priceUsd" type="number" step="0.01" className="w-full border rounded-lg px-3 py-2 text-sm" value={createForm.price_usd} onChange={(e) => setCreateForm({ ...createForm, price_usd: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <label htmlFor="create-sub-trial-ends" className="block text-xs text-gray-500 mb-1">Trial Ends At (optional)</label>
                <input id="create-sub-trial-ends" name="trialEndsAt" type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={createForm.trial_ends_at} onChange={(e) => setCreateForm({ ...createForm, trial_ends_at: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleCreate} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700" disabled={!createForm.tier_key}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setCancelModal(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-3">Cancel Subscription</h3>
            <div>
              <label htmlFor="cancel-sub-reason" className="block text-xs text-gray-500 mb-1">Reason</label>
              <textarea id="cancel-sub-reason" name="cancelReason" className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason for cancellation..." />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setCancelModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Back</button>
              <button onClick={handleCancel} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">Confirm Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
