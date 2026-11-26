import React, { useEffect, useMemo, useState } from 'react';
import { Search, Eye, Printer, Download, BookOpen, X } from 'lucide-react';
import { apiFetch, formatINR, getAuthToken } from '../lib/api.ts';
import type {
  Flat,
  LedgerEntry,
  ReceiptRecord,
  SocietySettings,
  UserSession,
} from '../types/society.ts';

interface ReceiptsViewProps {
  user: UserSession;
  focusReceiptId?: string | null;
  focusLedgerFlatId?: string | null;
  onClearFocus: () => void;
}

export const ReceiptsView: React.FC<ReceiptsViewProps> = ({
  user,
  focusReceiptId,
  focusLedgerFlatId,
  onClearFocus,
}) => {
  const [subTab, setSubTab] = useState<'receipts' | 'ledger'>(
    focusLedgerFlatId ? 'ledger' : 'receipts'
  );
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [society, setSociety] = useState<SocietySettings | null>(null);
  const [search, setSearch] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const [flats, setFlats] = useState<Flat[]>([]);
  const [ledgerFlatId, setLedgerFlatId] = useState<string>(
    focusLedgerFlatId || user.flatId || 'FLT-101'
  );
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [ledgerClosing, setLedgerClosing] = useState(0);

  useEffect(() => {
    Promise.all([
      apiFetch<{ receipts: ReceiptRecord[]; society: SocietySettings }>('/api/receipts'),
      apiFetch<{ flats: Flat[] }>('/api/flats'),
    ])
      .then(([recRes, flatsRes]) => {
        setReceipts(recRes.receipts);
        setSociety(recRes.society);
        setFlats(flatsRes.flats);
        if (focusReceiptId) {
          const found = recRes.receipts.find((r) => r.receiptId === focusReceiptId);
          if (found) setSelectedReceipt(found);
        }
      })
      .finally(() => setLoading(false));
  }, [focusReceiptId]);

  useEffect(() => {
    if (focusLedgerFlatId) {
      setSubTab('ledger');
      setLedgerFlatId(focusLedgerFlatId);
    }
  }, [focusLedgerFlatId]);

  useEffect(() => {
    if (subTab === 'ledger' && ledgerFlatId) {
      apiFetch<{
        flat: Flat;
        closingBalance: number;
        ledger: LedgerEntry[];
      }>(`/api/ledger?flatId=${encodeURIComponent(ledgerFlatId)}`).then((res) => {
        setLedgerEntries(res.ledger);
        setLedgerClosing(res.closingBalance);
      });
    }
  }, [subTab, ledgerFlatId]);

  const filteredReceipts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return receipts;
    return receipts.filter(
      (r) =>
        r.receiptNumber.toLowerCase().includes(q) ||
        r.flatNumber.toLowerCase().includes(q) ||
        r.ownerName.toLowerCase().includes(q) ||
        r.bankReference.toLowerCase().includes(q) ||
        r.maintenancePeriod.toLowerCase().includes(q)
    );
  }, [receipts, search]);

  const handleDownloadPdf = (receipt: ReceiptRecord) => {
    const token = getAuthToken() || '';
    const url = `/api/receipts/${encodeURIComponent(receipt.receiptId)}/pdf?token=${encodeURIComponent(
      token
    )}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${receipt.receiptNumber}-Flat-${receipt.flatNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#26332E]">
            Receipts &amp; Flat-wise Ledger
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Unique numbered payment receipts with PDF export and chronological flat-wise account statements.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#EDE9E0] rounded-lg self-start">
          <button
            type="button"
            onClick={() => {
              setSubTab('receipts');
              onClearFocus();
            }}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'receipts'
                ? 'bg-white text-[#26332E] shadow-sm'
                : 'text-slate-600 hover:text-[#26332E]'
            }`}
          >
            Receipt Register
          </button>
          <button
            type="button"
            onClick={() => setSubTab('ledger')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'ledger'
                ? 'bg-white text-[#26332E] shadow-sm'
                : 'text-slate-600 hover:text-[#26332E]'
            }`}
          >
            Flat-wise Ledger
          </button>
        </div>
      </div>

      {subTab === 'receipts' ? (
        <div className="space-y-4 no-print">
          <div className="bg-white border border-[#E2DDD3] rounded-xl p-4">
            <div className="relative max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Receipt No., Flat No., Owner, or Bank Ref..."
                className="w-full pl-10 pr-4 py-2 text-sm border border-[#D8D1C5] rounded-lg focus:outline-none focus:border-[#234D3C]"
              />
            </div>
          </div>

          <div className="bg-white border border-[#E2DDD3] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F8F6F1] text-xs text-slate-500 border-b border-[#E2DDD3]">
                  <tr>
                    <th className="text-left font-semibold px-4 py-3">Receipt No.</th>
                    <th className="text-left font-semibold px-4 py-3">Receipt Date</th>
                    <th className="text-left font-semibold px-4 py-3">Flat No.</th>
                    <th className="text-left font-semibold px-4 py-3">Payment Method</th>
                    <th className="text-left font-semibold px-4 py-3">Maintenance Period</th>
                    <th className="text-right font-semibold px-4 py-3">Amount Received</th>
                    <th className="text-left font-semibold px-4 py-3">Status</th>
                    <th className="text-right font-semibold px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        Loading receipts...
                      </td>
                    </tr>
                  ) : filteredReceipts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        No receipts found matching your search.
                      </td>
                    </tr>
                  ) : (
                    filteredReceipts.map((r) => (
                      <tr key={r.receiptId} className="hover:bg-[#F8F6F1]/70">
                        <td className="px-4 py-3 font-mono font-semibold text-[#234D3C] whitespace-nowrap">
                          {r.receiptNumber}
                        </td>
                        <td className="px-4 py-3 text-slate-600 tabular-nums whitespace-nowrap">
                          {r.receiptDate}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[#26332E]">Flat {r.flatNumber}</div>
                          <div className="text-xs text-slate-500">{r.ownerName}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          <div>{r.paymentMethod}</div>
                          <div className="text-xs font-mono text-slate-400">{r.bankReference}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {r.maintenancePeriod}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-[#26332E] tabular-nums whitespace-nowrap">
                          {formatINR(r.amountReceived)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`text-xs font-semibold ${
                              r.status === 'Active' ? 'text-emerald-700' : 'text-red-700'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setSelectedReceipt(r)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-[#234D3C] hover:underline cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadPdf(r)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-[#234D3C] cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>PDF</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white border border-[#E2DDD3] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
            <label className="flex items-center gap-2.5 text-sm">
              <BookOpen className="w-4 h-4 text-[#234D3C]" />
              <span className="font-medium text-slate-700">Select Flat Account:</span>
              <select
                value={ledgerFlatId}
                onChange={(e) => setLedgerFlatId(e.target.value)}
                disabled={user.role === 'resident'}
                className="px-3 py-2 border border-[#D8D1C5] rounded-lg font-semibold text-[#26332E] bg-white"
              >
                {flats.map((f) => (
                  <option key={f.flatId} value={f.flatId}>
                    Flat {f.flatNumber} — {f.ownerName}
                  </option>
                ))}
              </select>
            </label>

            <div className="text-sm">
              <span className="text-slate-500 mr-2">Closing Balance:</span>
              <span
                className={`font-mono font-bold tabular-nums ${
                  ledgerClosing > 0 ? 'text-red-700' : 'text-emerald-700'
                }`}
              >
                {formatINR(ledgerClosing)}
              </span>
            </div>
          </div>

          <div className="bg-white border border-[#E2DDD3] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F8F6F1] text-xs text-slate-500 border-b border-[#E2DDD3]">
                  <tr>
                    <th className="text-left font-semibold px-4 py-3">Date</th>
                    <th className="text-left font-semibold px-4 py-3">Ref No.</th>
                    <th className="text-left font-semibold px-4 py-3">Type</th>
                    <th className="text-left font-semibold px-4 py-3">Description</th>
                    <th className="text-right font-semibold px-4 py-3">Billed (Dr)</th>
                    <th className="text-right font-semibold px-4 py-3">Paid (Cr)</th>
                    <th className="text-right font-semibold px-4 py-3">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledgerEntries.map((entry, idx) => (
                    <tr key={`${entry.refNo}-${idx}`} className="hover:bg-[#F8F6F1]/70">
                      <td className="px-4 py-3 tabular-nums whitespace-nowrap text-slate-600">
                        {entry.date}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-[#26332E] whitespace-nowrap">
                        {entry.refNo}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-700 whitespace-nowrap">
                        {entry.type}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{entry.description}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        {entry.debit > 0 ? formatINR(entry.debit) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">
                        {entry.credit > 0 ? formatINR(entry.credit) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-[#26332E]">
                        {formatINR(entry.runningBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Printable Official Receipt Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2DDD3] rounded-xl max-w-2xl w-full p-6 sm:p-8 space-y-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between no-print">
              <span className="text-xs font-semibold text-slate-500">Official Receipt Preview</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-[#D8D1C5] rounded-lg hover:bg-[#F8F6F1] cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Receipt</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(selectedReceipt)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#234D3C] rounded-lg hover:bg-[#1B3D2F] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedReceipt(null);
                    onClearFocus();
                  }}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-[#EDE9E0] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="print-area border border-[#E2DDD3] rounded-xl p-6 space-y-5 bg-white">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[#E2DDD3] pb-4">
                <div>
                  <h2 className="text-lg font-display font-bold text-[#26332E]">
                    {society?.societyName || 'HAPPY HOMES PALACE-B Owners Welfare Association'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {society?.address} · Reg. {society?.registrationNumber}
                  </p>
                </div>
                <div className="sm:text-right">
                  <div className="text-xs font-semibold text-[#234D3C]">
                    MAINTENANCE RECEIPT
                  </div>
                  <div className="font-mono font-bold text-base text-[#26332E]">
                    {selectedReceipt.receiptNumber}
                  </div>
                  <div className="text-xs text-slate-500 tabular-nums">
                    Date: {selectedReceipt.receiptDate}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-slate-500">Received From</div>
                  <div className="font-semibold text-[#26332E]">
                    Flat {selectedReceipt.flatNumber} — {selectedReceipt.ownerName}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Payment Mode &amp; Reference</div>
                  <div className="font-medium text-[#26332E]">
                    {selectedReceipt.paymentMethod} ·{' '}
                    <span className="font-mono text-xs">{selectedReceipt.bankReference}</span>
                  </div>
                </div>
              </div>

              <div className="border border-[#E2DDD3] rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[#F8F6F1] text-xs text-slate-500 border-b border-[#E2DDD3]">
                    <tr>
                      <th className="text-left font-semibold px-4 py-2.5">
                        Allocated Billing Month
                      </th>
                      <th className="text-right font-semibold px-4 py-2.5">Allocated Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedReceipt.allocations.map((a) => (
                      <tr key={a.billingMonth}>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-700">
                          {a.billingMonth}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#26332E]">
                          {formatINR(a.allocatedAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[#EBF1EC]/70 border-t border-[#E2DDD3]">
                    <tr>
                      <td className="px-4 py-3 font-display font-bold text-[#26332E]">
                        Total Amount Received ({selectedReceipt.status})
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-base text-[#234D3C] tabular-nums">
                        {formatINR(selectedReceipt.amountReceived)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
                <span>Issued By: {selectedReceipt.issuedBy}</span>
                <span>System-verified official receipt</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
