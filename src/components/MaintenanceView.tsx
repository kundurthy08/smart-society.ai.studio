import React, { useEffect, useState } from 'react';
import { Calendar, Plus, SlidersHorizontal, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { apiFetch, formatINR } from '../lib/api.ts';
import type { MaintenanceBill, RateRule, UserSession } from '../types/society.ts';

interface MaintenanceResponse {
  bills: MaintenanceBill[];
  months: string[];
  activeRate: RateRule;
  rateHistory: RateRule[];
}

interface MaintenanceViewProps {
  user: UserSession;
}

export const MaintenanceView: React.FC<MaintenanceViewProps> = ({ user }) => {
  const [selectedMonth, setSelectedMonth] = useState('2026-11');
  const [bills, setBills] = useState<MaintenanceBill[]>([]);
  const [months, setMonths] = useState<string[]>(['2026-09', '2026-10', '2026-11']);
  const [activeRate, setActiveRate] = useState<RateRule | null>(null);
  const [rateHistory, setRateHistory] = useState<RateRule[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Paid' | 'Partial' | 'Unpaid'>('ALL');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const [newBillMonth, setNewBillMonth] = useState('2026-12');
  const [generating, setGenerating] = useState(false);

  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [rateForm, setRateForm] = useState({
    effectiveFrom: '2027-01',
    baseMonthlyCharge: 1350,
    doorLockDiscountPercent: 50,
    description: 'Revised tariff effective Jan 2027',
  });

  const [editingBill, setEditingBill] = useState<MaintenanceBill | null>(null);
  const [billEditForm, setBillEditForm] = useState({
    doorLockEnabled: false,
    specialDiscount: 0,
    otherCharges: 0,
    notes: '',
  });

  const isAdmin = user.role === 'president' || user.role === 'treasurer';

  const loadMaintenance = async (m: string) => {
    setLoading(true);
    try {
      const res = await apiFetch<MaintenanceResponse>(
        `/api/maintenance?month=${encodeURIComponent(m)}`
      );
      setBills(res.bills);
      if (res.months.length > 0) setMonths(res.months);
      setActiveRate(res.activeRate);
      setRateHistory(res.rateHistory);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to load maintenance bills.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMaintenance(selectedMonth);
  }, [selectedMonth]);

  const handleGenerateBills = async () => {
    setFeedback(null);
    setGenerating(true);
    try {
      const res = await apiFetch<{ createdCount: number; billingMonth: string }>(
        '/api/maintenance/generate',
        {
          method: 'POST',
          body: JSON.stringify({ billingMonth: newBillMonth }),
        }
      );
      setFeedback({
        type: 'success',
        text: `Generated ${res.createdCount} maintenance bills for ${res.billingMonth}.`,
      });
      setSelectedMonth(res.billingMonth);
      await loadMaintenance(res.billingMonth);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Bill generation failed.',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveRateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await apiFetch('/api/settings/rates', {
        method: 'POST',
        body: JSON.stringify(rateForm),
      });
      setRateModalOpen(false);
      setFeedback({
        type: 'success',
        text: `Saved effective-dated tariff ₹${rateForm.baseMonthlyCharge}/mo from ${rateForm.effectiveFrom}. Historical bills remain unaltered.`,
      });
      await loadMaintenance(selectedMonth);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to save rate rule.',
      });
    }
  };

  const openConcessionEditor = (bill: MaintenanceBill) => {
    setEditingBill(bill);
    setBillEditForm({
      doorLockEnabled: bill.doorLockDiscount > 0,
      specialDiscount: bill.specialDiscount,
      otherCharges: bill.otherCharges,
      notes: bill.notes,
    });
  };

  const handleSaveBillConcession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBill) return;
    setFeedback(null);
    try {
      await apiFetch(`/api/maintenance/${editingBill.billId}/discount`, {
        method: 'PUT',
        body: JSON.stringify(billEditForm),
      });
      setEditingBill(null);
      setFeedback({
        type: 'success',
        text: `Updated concessions for Flat ${editingBill.flatNumber} (${editingBill.billingMonth}).`,
      });
      await loadMaintenance(selectedMonth);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update concession.',
      });
    }
  };

  const filteredBills = bills.filter((b) =>
    statusFilter === 'ALL' ? true : b.status === statusFilter
  );

  const totals = filteredBills.reduce(
    (acc, b) => ({
      gross: acc.gross + b.grossAmount,
      discounts: acc.discounts + b.doorLockDiscount + b.specialDiscount,
      net: acc.net + b.netAmount,
      paid: acc.paid + b.allocatedAmount,
      due: acc.due + b.balanceDue,
    }),
    { gross: 0, discounts: 0, net: 0, paid: 0, due: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#26332E]">
            Maintenance Billing
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Monthly charge calculation, door-lock concessions, special discounts, and effective-dated rate rules.
          </p>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setRateModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-[#D8D1C5] hover:bg-[#F8F6F1] rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Configure Rate Schedule</span>
            </button>

            <div className="flex items-center gap-2 bg-white border border-[#E2DDD3] rounded-lg p-1 pl-3">
              <input
                type="month"
                value={newBillMonth}
                onChange={(e) => setNewBillMonth(e.target.value)}
                className="text-sm font-medium text-[#26332E] focus:outline-none"
              />
              <button
                type="button"
                disabled={generating}
                onClick={handleGenerateBills}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-semibold text-white bg-[#234D3C] hover:bg-[#1B3D2F] disabled:opacity-60 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{generating ? 'Generating...' : 'Generate Monthly Bills'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {feedback && (
        <div
          className={`flex items-start gap-2.5 p-4 rounded-xl border text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Active Rate & Filter Strip */}
      <div className="bg-white border border-[#E2DDD3] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <Calendar className="w-4 h-4 text-[#234D3C]" />
            <span className="font-medium">Billing Month:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-1.5 border border-[#D8D1C5] rounded-lg font-semibold text-[#26332E] bg-white cursor-pointer"
            >
              {Array.from(new Set([...months, selectedMonth])).sort().map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          {activeRate && (
            <div className="text-xs text-slate-600">
              Tariff Applied: <strong className="text-[#26332E] tabular-nums">{formatINR(activeRate.baseMonthlyCharge)}</strong> · Door-Lock{' '}
              <strong className="text-[#26332E] tabular-nums">{activeRate.doorLockDiscountPercent}%</strong> · Effective {activeRate.effectiveFrom}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#EDE9E0] rounded-lg">
          {(['ALL', 'Paid', 'Partial', 'Unpaid'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-white text-[#26332E] shadow-sm'
                  : 'text-slate-600 hover:text-[#26332E]'
              }`}
            >
              {st === 'ALL' ? 'All Statuses' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Bills Table */}
      <div className="bg-white border border-[#E2DDD3] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F8F6F1] text-xs text-slate-500 border-b border-[#E2DDD3]">
              <tr>
                <th className="text-left font-semibold px-4 py-3">Flat</th>
                <th className="text-left font-semibold px-4 py-3">Owner</th>
                <th className="text-right font-semibold px-4 py-3">Gross</th>
                <th className="text-right font-semibold px-4 py-3">Door-Lock</th>
                <th className="text-right font-semibold px-4 py-3">Special Disc.</th>
                <th className="text-right font-semibold px-4 py-3">Net Payable</th>
                <th className="text-right font-semibold px-4 py-3">Allocated Paid</th>
                <th className="text-right font-semibold px-4 py-3">Balance Due</th>
                <th className="text-left font-semibold px-4 py-3">Status</th>
                {isAdmin && <th className="text-right font-semibold px-4 py-3">Concession</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                    Loading maintenance bills...
                  </td>
                </tr>
              ) : filteredBills.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                    No bills found for {selectedMonth}.
                  </td>
                </tr>
              ) : (
                filteredBills.map((bill) => (
                  <tr key={bill.billId} className="hover:bg-[#F8F6F1]/70">
                    <td className="px-4 py-3 font-semibold text-[#26332E] whitespace-nowrap">
                      {bill.flatNumber}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <div>{bill.ownerName}</div>
                      <div className="text-xs text-slate-400">{bill.notes}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                      {formatINR(bill.grossAmount)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                      {bill.doorLockDiscount > 0 ? `-${formatINR(bill.doorLockDiscount)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                      {bill.specialDiscount > 0 ? `-${formatINR(bill.specialDiscount)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-[#26332E]">
                      {formatINR(bill.netAmount)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">
                      {formatINR(bill.allocatedAmount)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-red-700">
                      {formatINR(bill.balanceDue)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`text-xs font-semibold ${
                          bill.status === 'Paid'
                            ? 'text-emerald-700'
                            : bill.status === 'Partial'
                            ? 'text-amber-700'
                            : 'text-red-700'
                        }`}
                      >
                        {bill.status}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openConcessionEditor(bill)}
                          className="text-xs font-semibold text-[#234D3C] hover:underline cursor-pointer whitespace-nowrap"
                        >
                          Adjust
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
            {filteredBills.length > 0 && (
              <tfoot className="bg-[#F8F6F1] border-t border-[#E2DDD3] font-semibold text-xs">
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-[#26332E]">
                    Totals ({filteredBills.length} bills)
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {formatINR(totals.gross)}
                  </td>
                  <td colSpan={2} className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                    -{formatINR(totals.discounts)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {formatINR(totals.net)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">
                    {formatINR(totals.paid)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-red-700">
                    {formatINR(totals.due)}
                  </td>
                  <td colSpan={isAdmin ? 2 : 1} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Effective-Dated Rate Rule Modal */}
      {rateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2DDD3] rounded-xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-bold text-[#26332E]">
                Effective-Dated Maintenance Tariff
              </h2>
              <button
                type="button"
                onClick={() => setRateModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-[#EDE9E0] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-500">Historical Rate Schedule</div>
              <div className="border border-[#E2DDD3] rounded-lg divide-y divide-slate-100 text-xs">
                {rateHistory.map((r) => (
                  <div key={r.rateId} className="px-3 py-2 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-[#26332E]">{r.effectiveFrom}</span>
                      <span className="text-slate-500 ml-2">{r.description}</span>
                    </div>
                    <span className="font-mono font-semibold text-[#234D3C] tabular-nums">
                      {formatINR(r.baseMonthlyCharge)}/mo ({r.doorLockDiscountPercent}% DL)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleSaveRateRule} className="space-y-3.5 pt-2 border-t border-[#E2DDD3]">
              <div className="text-xs font-semibold text-slate-700">
                Add New Effective Rate (Past bills remain unchanged)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Effective Month</label>
                  <input
                    type="month"
                    required
                    value={rateForm.effectiveFrom}
                    onChange={(e) =>
                      setRateForm((f) => ({ ...f, effectiveFrom: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Base Charge (₹)</label>
                  <input
                    type="number"
                    required
                    min={100}
                    value={rateForm.baseMonthlyCharge}
                    onChange={(e) =>
                      setRateForm((f) => ({ ...f, baseMonthlyCharge: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Door-Lock (%)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={100}
                    value={rateForm.doorLockDiscountPercent}
                    onChange={(e) =>
                      setRateForm((f) => ({
                        ...f,
                        doorLockDiscountPercent: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Resolution Note</label>
                <input
                  type="text"
                  value={rateForm.description}
                  onChange={(e) =>
                    setRateForm((f) => ({ ...f, description: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRateModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium border border-[#D8D1C5] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-semibold text-white bg-[#234D3C] rounded-lg cursor-pointer"
                >
                  Save Rate Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bill Concession Adjustment Modal */}
      {editingBill && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2DDD3] rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-bold text-[#26332E]">
                Adjust Concession — Flat {editingBill.flatNumber} ({editingBill.billingMonth})
              </h2>
              <button
                type="button"
                onClick={() => setEditingBill(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-[#EDE9E0] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBillConcession} className="space-y-4">
              <label className="flex items-center gap-2.5 text-sm font-medium text-[#26332E] cursor-pointer">
                <input
                  type="checkbox"
                  checked={billEditForm.doorLockEnabled}
                  onChange={(e) =>
                    setBillEditForm((f) => ({ ...f, doorLockEnabled: e.target.checked }))
                  }
                  className="w-4 h-4 accent-[#234D3C]"
                />
                <span>Apply 50% Door-Lock Discount</span>
              </label>

              {!billEditForm.doorLockEnabled && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Special Concession (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={editingBill.grossAmount}
                    value={billEditForm.specialDiscount}
                    onChange={(e) =>
                      setBillEditForm((f) => ({
                        ...f,
                        specialDiscount: Number(e.target.value || 0),
                      }))
                    }
                    className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg tabular-nums"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Other Approved Charges (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  value={billEditForm.otherCharges}
                  onChange={(e) =>
                    setBillEditForm((f) => ({
                      ...f,
                      otherCharges: Number(e.target.value || 0),
                    }))
                  }
                  className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={billEditForm.notes}
                  onChange={(e) =>
                    setBillEditForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingBill(null)}
                  className="px-4 py-2 text-sm font-medium border border-[#D8D1C5] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-semibold text-white bg-[#234D3C] rounded-lg cursor-pointer"
                >
                  Save Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
