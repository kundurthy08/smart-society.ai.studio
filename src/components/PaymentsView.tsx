import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  FileCheck2,
  RotateCcw,
  Receipt,
  X,
} from 'lucide-react';
import { apiFetch, formatINR } from '../lib/api.ts';
import type {
  Flat,
  MaintenanceBill,
  PaymentMethod,
  PaymentRecord,
  ReceiptRecord,
  UserSession,
} from '../types/society.ts';

interface PaymentsViewProps {
  user: UserSession;
  preselectFlatId?: string;
  onOpenReceipt: (receiptId: string) => void;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  user,
  preselectFlatId,
  onOpenReceipt,
}) => {
  const [flats, setFlats] = useState<Flat[]>([]);
  const [bills, setBills] = useState<MaintenanceBill[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
    receiptId?: string;
  } | null>(null);

  const [selectedFlatId, setSelectedFlatId] = useState(preselectFlatId || 'FLT-102');
  const [paymentDate, setPaymentDate] = useState('2026-11-23');
  const [bankDate, setBankDate] = useState('2026-11-23');
  const [amount, setAmount] = useState<number>(1200);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [bankReference, setBankReference] = useState('');
  const [targetMonths, setTargetMonths] = useState<string[]>([]);
  const [remarks, setRemarks] = useState('');

  const [reverseModalPayment, setReverseModalPayment] = useState<PaymentRecord | null>(null);
  const [reverseReason, setReverseReason] = useState('');

  const isAdmin = user.role === 'president' || user.role === 'treasurer';

  const loadData = async () => {
    setLoading(true);
    try {
      const [flatsRes, billsRes, payRes] = await Promise.all([
        apiFetch<{ flats: Flat[] }>('/api/flats'),
        apiFetch<{ bills: MaintenanceBill[] }>('/api/maintenance'),
        apiFetch<{ payments: PaymentRecord[] }>('/api/payments'),
      ]);
      setFlats(flatsRes.flats);
      setBills(billsRes.bills);
      setPayments(payRes.payments);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to load payment records.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (preselectFlatId) {
      setSelectedFlatId(preselectFlatId);
    }
  }, [preselectFlatId]);

  const selectedFlat = useMemo(
    () => flats.find((f) => f.flatId === selectedFlatId) ?? flats[0],
    [flats, selectedFlatId]
  );

  const flatUnpaidBills = useMemo(() => {
    if (!selectedFlat) return [];
    return bills
      .filter((b) => b.flatId === selectedFlat.flatId && b.balanceDue > 0)
      .sort((a, b) => a.billingMonth.localeCompare(b.billingMonth));
  }, [bills, selectedFlat]);

  // Auto-select unpaid months and total due when switching flats
  useEffect(() => {
    if (flatUnpaidBills.length > 0) {
      const months = flatUnpaidBills.map((b) => b.billingMonth);
      const total = flatUnpaidBills.reduce((s, b) => s + b.balanceDue, 0);
      setTargetMonths(months);
      setAmount(total);
    } else {
      setTargetMonths([]);
      setAmount(0);
    }
  }, [selectedFlatId, bills]);

  const toggleMonth = (month: string) => {
    setTargetMonths((prev) => {
      const next = prev.includes(month)
        ? prev.filter((m) => m !== month)
        : [...prev, month].sort();
      const suggested = flatUnpaidBills
        .filter((b) => next.includes(b.billingMonth))
        .reduce((s, b) => s + b.balanceDue, 0);
      if (suggested > 0) setAmount(suggested);
      return next;
    });
  };

  const submitPayment = async (mode: 'draft' | 'confirm' | 'confirm_and_receipt') => {
    if (!selectedFlat) return;
    setFeedback(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ payment: PaymentRecord; receipt?: ReceiptRecord }>(
        '/api/payments',
        {
          method: 'POST',
          body: JSON.stringify({
            flatId: selectedFlat.flatId,
            paymentDate,
            bankDate,
            amount,
            paymentMethod,
            bankReference,
            targetMonths,
            remarks,
            mode,
          }),
        }
      );

      setBankReference('');
      setRemarks('');
      await loadData();

      if (mode === 'draft') {
        setFeedback({
          type: 'success',
          text: `Saved unverified draft ${res.payment.paymentId} for Flat ${res.payment.flatNumber}. Invoices remain unpaid until bank reference is verified.`,
        });
      } else {
        setFeedback({
          type: 'success',
          text: `Confirmed ${formatINR(res.payment.amount)} for Flat ${res.payment.flatNumber} covering ${res.payment.targetMonths.join(', ')}. Issued single receipt ${res.receipt?.receiptNumber}.`,
          receiptId: res.receipt?.receiptId,
        });
        if (mode === 'confirm_and_receipt' && res.receipt) {
          onOpenReceipt(res.receipt.receiptId);
        }
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to record payment.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyDraft = async (paymentId: string) => {
    setFeedback(null);
    try {
      const res = await apiFetch<{ payment: PaymentRecord; receipt: ReceiptRecord }>(
        `/api/payments/${paymentId}/verify`,
        { method: 'POST' }
      );
      await loadData();
      setFeedback({
        type: 'success',
        text: `Verified bank reference and posted ${res.payment.paymentId}. Issued receipt ${res.receipt.receiptNumber}.`,
        receiptId: res.receipt.receiptId,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Verification failed.',
      });
    }
  };

  const handleReverseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reverseModalPayment) return;
    setFeedback(null);
    try {
      await apiFetch(`/api/payments/${reverseModalPayment.paymentId}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reason: reverseReason }),
      });
      setReverseModalPayment(null);
      setReverseReason('');
      await loadData();
      setFeedback({
        type: 'success',
        text: `Reversed ${reverseModalPayment.paymentId}. Original record preserved in ledger and audit log.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Reversal failed.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-[#26332E]">
          Payment Entry &amp; Allocations
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Record verified maintenance payments across one or multiple months under a single non-duplicated transaction.
        </p>
      </div>

      {feedback && (
        <div
          className={`flex items-center justify-between gap-4 p-4 rounded-xl border text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          {feedback.receiptId && (
            <button
              type="button"
              onClick={() => onOpenReceipt(feedback.receiptId!)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#234D3C] rounded-lg whitespace-nowrap cursor-pointer"
            >
              Open Receipt
            </button>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="bg-white border border-[#E2DDD3] rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-[#E2DDD3] pb-4">
            <h2 className="text-base font-display font-semibold text-[#26332E]">
              New Payment Entry
            </h2>
            <span className="text-xs text-slate-500">
              One payment creates one receipt regardless of how many months are allocated
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Flat Number *
              </label>
              <select
                value={selectedFlat?.flatId || ''}
                onChange={(e) => setSelectedFlatId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-[#D8D1C5] rounded-lg bg-white font-semibold"
              >
                {flats.map((f) => (
                  <option key={f.flatId} value={f.flatId}>
                    Flat {f.flatNumber} — {f.ownerName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Owner Name (Auto-displayed)
              </label>
              <input
                type="text"
                readOnly
                value={selectedFlat?.ownerName || ''}
                className="w-full px-3.5 py-2.5 text-sm border border-[#E2DDD3] rounded-lg bg-[#F8F6F1] text-slate-700 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Amount Received (₹) *
              </label>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 text-sm border border-[#D8D1C5] rounded-lg font-mono font-semibold tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Payment Date *
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-[#D8D1C5] rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Payment Method *
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-3.5 py-2.5 text-sm border border-[#D8D1C5] rounded-lg bg-white"
              >
                <option value="UPI">UPI</option>
                <option value="NEFT / IMPS">NEFT / IMPS</option>
                <option value="Cheque">Cheque</option>
                <option value="Cash">Cash</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Bank Reference / UTR / Cheque No.
              </label>
              <input
                type="text"
                value={bankReference}
                onChange={(e) => setBankReference(e.target.value)}
                placeholder="e.g. UPI6329004412"
                className="w-full px-3.5 py-2.5 text-sm border border-[#D8D1C5] rounded-lg font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Bank Value Date
              </label>
              <input
                type="date"
                value={bankDate}
                onChange={(e) => setBankDate(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-[#D8D1C5] rounded-lg"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Remarks</label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Combined settlement for overdue months"
                className="w-full px-3.5 py-2.5 text-sm border border-[#D8D1C5] rounded-lg"
              />
            </div>
          </div>

          {/* Maintenance Months Selector */}
          <div className="p-4 rounded-xl bg-[#F8F6F1] border border-[#E2DDD3] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#26332E]">
                Maintenance Months to Allocate (Flat {selectedFlat?.flatNumber})
              </span>
              <span className="text-xs text-slate-500 tabular-nums">
                {flatUnpaidBills.length} unpaid/partial bill(s)
              </span>
            </div>

            {flatUnpaidBills.length === 0 ? (
              <p className="text-xs text-emerald-700 font-medium">
                All generated monthly bills for Flat {selectedFlat?.flatNumber} are settled.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {flatUnpaidBills.map((b) => {
                  const checked = targetMonths.includes(b.billingMonth);
                  return (
                    <label
                      key={b.billId}
                      className={`flex items-center justify-between p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                        checked
                          ? 'bg-white border-[#234D3C] text-[#26332E]'
                          : 'bg-white border-[#E2DDD3] text-slate-600'
                      }`}
                    >
                      <span className="flex items-center gap-2 font-medium">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMonth(b.billingMonth)}
                          className="w-4 h-4 accent-[#234D3C]"
                        />
                        <span>{b.billingMonth}</span>
                      </span>
                      <span className="font-mono font-semibold text-red-700 tabular-nums">
                        Due {formatINR(b.balanceDue)}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <button
              type="button"
              disabled={submitting || amount <= 0}
              onClick={() => submitPayment('draft')}
              className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-[#D8D1C5] hover:bg-[#F8F6F1] disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap"
            >
              Save Draft
            </button>
            <button
              type="button"
              disabled={submitting || amount <= 0}
              onClick={() => submitPayment('confirm')}
              className="px-4 py-2.5 text-sm font-semibold text-[#234D3C] bg-[#EBF1EC] hover:bg-[#DCE7DE] disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap"
            >
              Confirm Payment
            </button>
            <button
              type="button"
              disabled={submitting || amount <= 0}
              onClick={() => submitPayment('confirm_and_receipt')}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#234D3C] hover:bg-[#1B3D2F] disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap"
            >
              <Receipt className="w-4 h-4" />
              <span>Generate Receipt</span>
            </button>
          </div>
        </div>
      )}

      {/* Payments Register Table */}
      <div className="bg-white border border-[#E2DDD3] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2DDD3] flex items-center justify-between">
          <h2 className="text-base font-display font-semibold text-[#26332E]">
            Recorded Payments &amp; Verification Queue
          </h2>
          <span className="text-xs text-slate-500 tabular-nums">
            {payments.length} transaction(s)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F8F6F1] text-xs text-slate-500 border-b border-[#E2DDD3]">
              <tr>
                <th className="text-left font-semibold px-4 py-3">Payment ID</th>
                <th className="text-left font-semibold px-4 py-3">Flat</th>
                <th className="text-left font-semibold px-4 py-3">Date</th>
                <th className="text-left font-semibold px-4 py-3">Method / Bank Ref</th>
                <th className="text-left font-semibold px-4 py-3">Allocated Months</th>
                <th className="text-right font-semibold px-4 py-3">Amount</th>
                <th className="text-left font-semibold px-4 py-3">Status</th>
                <th className="text-right font-semibold px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Loading payments...
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.paymentId} className="hover:bg-[#F8F6F1]/70">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-[#26332E] whitespace-nowrap">
                      {p.paymentId}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#26332E]">Flat {p.flatNumber}</div>
                      <div className="text-xs text-slate-500">{p.ownerName}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 tabular-nums whitespace-nowrap">
                      {p.paymentDate}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-800">{p.paymentMethod}</div>
                      <div className="text-xs font-mono text-slate-500">{p.bankReference}</div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-600">
                      {p.targetMonths.join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-[#26332E] tabular-nums whitespace-nowrap">
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
                        {p.status === 'Draft' ? 'Unverified Draft' : p.status}
                      </span>
                      {p.reversalReason && (
                        <div className="text-xs text-red-600">{p.reversalReason}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-3">
                        {isAdmin && p.status === 'Draft' && (
                          <button
                            type="button"
                            onClick={() => handleVerifyDraft(p.paymentId)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                          >
                            <FileCheck2 className="w-3.5 h-3.5" />
                            <span>Verify &amp; Confirm</span>
                          </button>
                        )}
                        {p.receiptId && (
                          <button
                            type="button"
                            onClick={() => onOpenReceipt(p.receiptId!)}
                            className="text-xs font-semibold text-[#234D3C] hover:underline cursor-pointer"
                          >
                            {p.receiptNumber}
                          </button>
                        )}
                        {isAdmin && p.status === 'Confirmed' && (
                          <button
                            type="button"
                            onClick={() => {
                              setReverseModalPayment(p);
                              setReverseReason('');
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Reverse</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reversal Modal */}
      {reverseModalPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2DDD3] rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-display font-bold text-[#26332E]">
                Reverse Payment {reverseModalPayment.paymentId}
              </h3>
              <button
                type="button"
                onClick={() => setReverseModalPayment(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Reversing this {formatINR(reverseModalPayment.amount)} transaction for Flat{' '}
              {reverseModalPayment.flatNumber} preserves the original record in the audit trail
              and restores the unpaid balance on the linked maintenance bills.
            </p>
            <form onSubmit={handleReverseSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Mandatory Reversal Reason *
                </label>
                <input
                  type="text"
                  required
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  placeholder="e.g. Cheque returned unpaid / wrong flat entry"
                  className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setReverseModalPayment(null)}
                  className="px-4 py-2 text-sm border border-[#D8D1C5] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg cursor-pointer"
                >
                  Confirm Reversal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
