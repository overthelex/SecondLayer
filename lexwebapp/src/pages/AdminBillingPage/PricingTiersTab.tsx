/**
 * Pricing Tiers tab - manages billing tiers and volume discounts
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../utils/api-client';
import toast from 'react-hot-toast';
import type { BillingTier, VolumeDiscount } from './types';

export function PricingTiersTab() {
  const [tiers, setTiers] = useState<BillingTier[]>([]);
  const [discounts, setDiscounts] = useState<VolumeDiscount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTier, setEditingTier] = useState<BillingTier | null>(null);
  const [editingDiscounts, setEditingDiscounts] = useState(false);
  const [discountDraft, setDiscountDraft] = useState<Array<{ min_monthly_spend_usd: number; discount_percentage: number }>>([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [tiersRes, discountsRes] = await Promise.all([
        api.admin.getBillingTiers(),
        api.admin.getVolumeDiscounts(),
      ]);
      setTiers(tiersRes.data.tiers || []);
      setDiscounts(discountsRes.data.discounts || []);
    } catch {
      toast.error('Failed to load tiers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaveTier = async () => {
    if (!editingTier) return;
    try {
      await api.admin.updateBillingTier(editingTier.id, {
        display_name: editingTier.display_name,
        markup_percentage: editingTier.markup_percentage,
        description: editingTier.description,
        features: editingTier.features,
        default_daily_limit_usd: editingTier.default_daily_limit_usd,
        default_monthly_limit_usd: editingTier.default_monthly_limit_usd,
      });
      toast.success('Tier updated');
      setEditingTier(null);
      load();
    } catch {
      toast.error('Failed to update tier');
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await api.admin.setDefaultTier(id);
      toast.success('Default tier updated');
      load();
    } catch {
      toast.error('Failed to set default');
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await api.admin.deleteBillingTier(id);
      toast.success('Tier deactivated');
      load();
    } catch {
      toast.error('Failed to deactivate tier');
    }
  };

  const handleSaveDiscounts = async () => {
    try {
      await api.admin.updateVolumeDiscounts(discountDraft);
      toast.success('Volume discounts updated');
      setEditingDiscounts(false);
      load();
    } catch {
      toast.error('Failed to update discounts');
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Tiers Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-sm text-gray-800">Pricing Tiers</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Tier</th>
                <th className="px-4 py-2 text-left">Display Name</th>
                <th className="px-4 py-2 text-right">Markup %</th>
                <th className="px-4 py-2 text-right">Daily Limit</th>
                <th className="px-4 py-2 text-right">Monthly Limit</th>
                <th className="px-4 py-2 text-center">Default</th>
                <th className="px-4 py-2 text-center">Active</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tiers.map((tier) => (
                <tr key={tier.id} className={!tier.is_active ? 'opacity-50' : ''}>
                  <td className="px-4 py-2 font-mono text-xs">{tier.tier_key}</td>
                  <td className="px-4 py-2">{tier.display_name}</td>
                  <td className="px-4 py-2 text-right">{tier.markup_percentage}%</td>
                  <td className="px-4 py-2 text-right">${tier.default_daily_limit_usd}</td>
                  <td className="px-4 py-2 text-right">${tier.default_monthly_limit_usd}</td>
                  <td className="px-4 py-2 text-center">
                    {tier.is_default ? (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">Default</span>
                    ) : (
                      <button
                        onClick={() => handleSetDefault(tier.id)}
                        className="text-xs text-gray-400 hover:text-blue-600"
                      >
                        Set
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`w-2 h-2 rounded-full inline-block ${tier.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">
                    <button
                      onClick={() => setEditingTier({ ...tier })}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                    {tier.is_active && !tier.is_default && (
                      <button
                        onClick={() => handleDeactivate(tier.id)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Tier Modal */}
      {editingTier && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setEditingTier(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Edit Tier: {editingTier.tier_key}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Display Name</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={editingTier.display_name}
                  onChange={(e) => setEditingTier({ ...editingTier, display_name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Markup %</label>
                  <input
                    type="number"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={editingTier.markup_percentage}
                    onChange={(e) => setEditingTier({ ...editingTier, markup_percentage: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Daily Limit $</label>
                  <input
                    type="number"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={editingTier.default_daily_limit_usd}
                    onChange={(e) => setEditingTier({ ...editingTier, default_daily_limit_usd: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Monthly Limit $</label>
                  <input
                    type="number"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={editingTier.default_monthly_limit_usd}
                    onChange={(e) => setEditingTier({ ...editingTier, default_monthly_limit_usd: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  rows={2}
                  value={editingTier.description}
                  onChange={(e) => setEditingTier({ ...editingTier, description: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Features (one per line)</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  rows={4}
                  value={editingTier.features.join('\n')}
                  onChange={(e) => setEditingTier({ ...editingTier, features: e.target.value.split('\n').filter(Boolean) })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditingTier(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleSaveTier} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Volume Discounts */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-sm text-gray-800">Volume Discounts</h3>
          <button
            onClick={() => {
              setDiscountDraft(discounts.map(d => ({ min_monthly_spend_usd: d.min_monthly_spend_usd, discount_percentage: d.discount_percentage })));
              setEditingDiscounts(true);
            }}
            className="text-xs text-blue-600 hover:underline"
          >
            Edit
          </button>
        </div>
        {editingDiscounts ? (
          <div className="p-4 space-y-2">
            {discountDraft.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-500">$</span>
                <input
                  type="number"
                  className="w-24 border rounded px-2 py-1 text-sm"
                  value={d.min_monthly_spend_usd}
                  onChange={(e) => {
                    const next = [...discountDraft];
                    next[i] = { ...next[i], min_monthly_spend_usd: Number(e.target.value) };
                    setDiscountDraft(next);
                  }}
                />
                <span className="text-xs text-gray-500">spend/mo =</span>
                <input
                  type="number"
                  className="w-20 border rounded px-2 py-1 text-sm"
                  value={d.discount_percentage}
                  onChange={(e) => {
                    const next = [...discountDraft];
                    next[i] = { ...next[i], discount_percentage: Number(e.target.value) };
                    setDiscountDraft(next);
                  }}
                />
                <span className="text-xs text-gray-500">% off</span>
                <button onClick={() => setDiscountDraft(discountDraft.filter((_, j) => j !== i))} className="text-red-400 text-xs hover:text-red-600">Remove</button>
              </div>
            ))}
            <button
              onClick={() => setDiscountDraft([...discountDraft, { min_monthly_spend_usd: 0, discount_percentage: 0 }])}
              className="text-xs text-blue-600 hover:underline"
            >
              + Add threshold
            </button>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditingDiscounts(false)} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
              <button onClick={handleSaveDiscounts} className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Min Monthly Spend</th>
                <th className="px-4 py-2 text-left">Discount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {discounts.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-2">${d.min_monthly_spend_usd}</td>
                  <td className="px-4 py-2">{d.discount_percentage}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
