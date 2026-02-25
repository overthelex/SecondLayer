import { useEffect, useState } from 'react';
import { RefreshCw, Users } from 'lucide-react';
import { api } from '../../../utils/api-client';
import type { Cohort } from './types';

export function CohortSection() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.admin.getCohorts();
        setCohorts(res.data?.cohorts || []);
      } catch {
        // non-critical
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Users size={18} className="text-claude-subtext" />
        <h2 className="text-lg font-semibold text-claude-text font-sans">Cohort Analysis</h2>
      </div>

      <div className="bg-white rounded-xl border border-claude-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-claude-border bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-claude-subtext">Month</th>
                <th className="text-right px-4 py-3 font-medium text-claude-subtext">Signups</th>
                <th className="text-right px-4 py-3 font-medium text-claude-subtext">Active</th>
                <th className="text-right px-4 py-3 font-medium text-claude-subtext">Revenue</th>
                <th className="px-4 py-3 font-medium text-claude-subtext">Retention</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-claude-subtext">
                    <RefreshCw size={20} className="animate-spin inline-block mr-2" />
                    Loading...
                  </td>
                </tr>
              ) : cohorts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-claude-subtext">
                    No cohort data
                  </td>
                </tr>
              ) : (
                cohorts.map((c) => (
                  <tr key={c.month} className="border-b border-claude-border/50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">
                      {new Date(c.month + '-01').toLocaleDateString('en-US', {
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">{c.users}</td>
                    <td className="px-4 py-3 text-right">{c.active_users}</td>
                    <td className="px-4 py-3 text-right font-mono">${c.total_revenue_usd.toFixed(2)}</td>
                    <td className="px-4 py-3 w-36">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${c.retention_rate}%` }}
                          />
                        </div>
                        <span className="text-xs text-claude-subtext w-10 text-right">
                          {c.retention_rate.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
