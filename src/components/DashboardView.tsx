import React, { useEffect, useState } from 'react';
import {
  Building2,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  PlusCircle,
} from 'lucide-react';
import { apiFetch, formatINR } from '../lib/api.ts';
import type { DashboardSummary, UserSession } from '../types/society.ts';
import type { AdminTab } from './AdminLayout.tsx';

interface DashboardViewProps {
  user: UserSession;
  onNavigate: (tab: AdminTab, preselectFlatId?: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ user, onNavigate }) => {
  const [month, setMonth] = useState('2026-11');
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user.role === 'president' || user.role === 'treasurer';

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiFetch<DashboardSummary>(`/api/dashboard?month=${encodeURIComponent(month)}`)
      .then((res) => {
        if (active) {
          setData(res);
          if (res.selectedMonth && res.selectedMonth !== month) {
            setMonth(res.selectedMonth);
          }
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load dashboard.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [month]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 bg-slate-200/70 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-32 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const maxChartValue = Math.max(
    1,
    ...data.monthlySeries.map((m) => Math.max(m.demand, m.collected))
  );
  const collectionPct =
    data.monthlyDemandNet > 0
      ? Math.round((data.monthlyCollections / data.monthlyDemandNet) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#26332E]">
            {isAdmin ? 'Association Financial Dashboard' : 'My Flat Maintenance Overview'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Live figures derived from posted maintenance bills and verified payment allocations.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-slate-600 bg-white border border-[#E2DDD3] rounded-lg px-3 py-2">
            <span className="font-medium whitespace-nowrap">Billing Month</span>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="bg-transparent font-semibold text-[#26332E] focus:outline-none cursor-pointer"
            >
              {data.availableMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          {isAdmin && (
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#234D3C] hover:bg-[#1B3D2F] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Record Payment</span>
            </button>
          )}
        </div>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2DDD3] rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-2">
            <span>Total Flats</span>
            <Building2 className="w-4 h-4 text-[#234D3C]" />
          </div>
          <div className="text-3xl font-display font-bold text-[#26332E] tabular-nums">
            {data.totalFlats}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {data.occupiedCount} Occupied · {data.vacantCount} Door-Lock · {data.tenantCount} Tenant
          </p>
        </div>

        <div className="bg-white border border-[#E2DDD3] rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-2">
            <span>Monthly Maintenance Demand</span>
            <FileSpreadsheet className="w-4 h-4 text-[#234D3C]" />
          </div>
          <div className="text-3xl font-display font-bold text-[#26332E] tabular-nums">
            {formatINR(data.monthlyDemandNet)}
          </div>
          <p className="text-xs text-slate-500 mt-2 tabular-nums">
            Gross {formatINR(data.monthlyDemandGross)} · Concessions -{formatINR(data.monthlyConcessions)}
          </p>
        </div>

        <div className="bg-white border border-[#E2DDD3] rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-2">
            <span>Total Collections ({data.selectedMonth})</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-display font-bold text-emerald-700 tabular-nums">
            {formatINR(data.monthlyCollections)}
          </div>
          <p className="text-xs text-slate-500 mt-2 tabular-nums">
            {collectionPct}% of {data.selectedMonth} net demand realized
          </p>
        </div>

        <div className="bg-white border border-[#E2DDD3] rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-2">
            <span>Outstanding Balance</span>
            <AlertCircle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-3xl font-display font-bold text-[#26332E] tabular-nums">
            {formatINR(data.totalOutstanding)}
          </div>
          <p className="text-xs text-slate-500 mt-2 tabular-nums">
            Current {formatINR(data.currentMonthOutstanding)} · Prior Arrears{' '}
            {formatINR(data.historicalArrearsOutstanding)}
          </p>
        </div>
      </div>

      {/* Collection Chart + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-[#E2DDD3] rounded-xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div>
              <h2 className="text-base font-display font-semibold text-[#26332E]">
                Monthly Demand vs. Confirmed Collections
              </h2>
              <p className="text-xs text-slate-500">
                Unverified draft bank references are excluded until confirmed.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#E5E0D6] inline-block" />
                Net Billed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#234D3C] inline-block" />
                Confirmed Collected
              </span>
            </div>
          </div>

          <div className="space-y-5">
            {data.monthlySeries.map((row) => {
              const demandWidth = Math.round((row.demand / maxChartValue) * 100);
              const collectedWidth = Math.round((row.collected / maxChartValue) * 100);
              return (
                <div key={row.month} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#26332E]">{row.label}</span>
                    <span className="text-slate-600 tabular-nums font-mono">
                      Collected {formatINR(row.collected)} / {formatINR(row.demand)}
                    </span>
                  </div>
                  <div className="h-6 bg-slate-100 rounded-md overflow-hidden relative">
                    <div
                      className="h-full bg-[#E5E0D6] absolute left-0 top-0 rounded-md transition-all"
                      style={{ width: `${demandWidth}%` }}
                    />
                    <div
                      className="h-full bg-[#234D3C] absolute left-0 top-0 rounded-md transition-all"
                      style={{ width: `${collectedWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-4 bg-white border border-[#E2DDD3] rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-display font-semibold text-[#26332E] mb-1">
              Quick Workflows
            </h2>
            <p className="text-xs text-slate-500 mb-5">
              Direct shortcuts to daily association accounting tasks.
            </p>
            <div className="space-y-2.5">
              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => onNavigate('maintenance')}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[#26332E] bg-[#F8F6F1] hover:bg-[#EBF1EC] border border-[#E2DDD3] rounded-lg transition-colors cursor-pointer"
                  >
                    <span>Generate Monthly Bills</span>
                    <ArrowUpRight className="w-4 h-4 text-[#234D3C]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('payments')}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[#26332E] bg-[#F8F6F1] hover:bg-[#EBF1EC] border border-[#E2DDD3] rounded-lg transition-colors cursor-pointer"
                  >
                    <span>Verify Bank References</span>
                    <ArrowUpRight className="w-4 h-4 text-[#234D3C]" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => onNavigate('receipts')}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[#26332E] bg-[#F8F6F1] hover:bg-[#EBF1EC] border border-[#E2DDD3] rounded-lg transition-colors cursor-pointer"
              >
                <span>Download Receipt PDFs</span>
                <ArrowUpRight className="w-4 h-4 text-[#234D3C]" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[#26332E] bg-[#F8F6F1] hover:bg-[#EBF1EC] border border-[#E2DDD3] rounded-lg transition-colors cursor-pointer"
              >
                <span>Export Financial Reports</span>
                <ArrowUpRight className="w-4 h-4 text-[#234D3C]" />
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => onNavigate('complaints')}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[#26332E] bg-[#F8F6F1] hover:bg-[#EBF1EC] border border-[#E2DDD3] rounded-lg transition-colors cursor-pointer"
                >
                  <span>Resident Complaints ({data.openComplaintsCount} active)</span>
                  <ArrowUpRight className="w-4 h-4 text-[#234D3C]" />
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-[#64736D] mt-6">
            All posted records maintain immutable audit timestamps.
          </p>
        </div>
      </div>

      {/* Bottom Tables: Recent Payments & Outstanding Flats */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E2DDD3] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E2DDD3] flex items-center justify-between">
            <h2 className="text-base font-display font-semibold text-[#26332E]">
              Recent Payments
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="text-xs font-semibold text-[#234D3C] hover:underline cursor-pointer"
            >
              View All
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8F6F1] text-xs text-slate-500 border-b border-[#E2DDD3]">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Flat</th>
                  <th className="text-left font-semibold px-4 py-3">Date</th>
                  <th className="text-left font-semibold px-4 py-3">Method</th>
                  <th className="text-right font-semibold px-4 py-3">Amount</th>
                  <th className="text-left font-semibold px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recentPayments.map((p) => (
                  <tr key={p.paymentId} className="hover:bg-[#F8F6F1]/70">
                    <td className="px-4 py-3 font-medium text-[#26332E]">
                      {p.flatNumber}
                      <div className="text-xs text-slate-500 font-normal">{p.ownerName}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 tabular-nums whitespace-nowrap">
                      {p.paymentDate}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {p.paymentMethod}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-[#26332E] tabular-nums">
                      {formatINR(p.amount)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`text-xs font-semibold ${
                          p.status === 'Confirmed'
                            ? 'text-emerald-700'
                            : p.status === 'Draft'
                            ? 'text-amber-700'
                            : 'text-red-700'
                        }`}
                      >
                        {p.status === 'Draft' ? 'Pending Verification' : p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-[#E2DDD3] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E2DDD3] flex items-center justify-between">
            <h2 className="text-base font-display font-semibold text-[#26332E]">
              Outstanding Flats
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-xs font-semibold text-[#234D3C] hover:underline cursor-pointer"
            >
              Dues Report
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8F6F1] text-xs text-slate-500 border-b border-[#E2DDD3]">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Flat</th>
                  <th className="text-left font-semibold px-4 py-3">Unpaid Months</th>
                  <th className="text-right font-semibold px-4 py-3">Total Due</th>
                  {isAdmin && <th className="text-right font-semibold px-4 py-3">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.outstandingFlats.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500 text-sm">
                      All flats are settled with zero outstanding dues.
                    </td>
                  </tr>
                ) : (
                  data.outstandingFlats.map((f) => (
                    <tr key={f.flatId} className="hover:bg-[#F8F6F1]/70">
                      <td className="px-4 py-3 font-medium text-[#26332E]">
                        Flat {f.flatNumber}
                        <div className="text-xs text-slate-500 font-normal">{f.ownerName}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 font-mono">
                        {f.unpaidMonths.join(', ')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-red-700 tabular-nums">
                        {formatINR(f.totalDue)}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => onNavigate('payments', f.flatId)}
                            className="text-xs font-semibold text-[#234D3C] hover:underline cursor-pointer whitespace-nowrap"
                          >
                            Collect
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
