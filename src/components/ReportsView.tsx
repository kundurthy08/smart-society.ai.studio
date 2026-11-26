import React, { useEffect, useMemo, useState } from 'react';
import { Printer, Download, Search } from 'lucide-react';
import { apiFetch, downloadCsv, formatINR } from '../lib/api.ts';
import type { Flat, UserSession } from '../types/society.ts';

type ReportType =
  | 'monthly_collection'
  | 'flat_statement'
  | 'receipt_register'
  | 'outstanding_dues'
  | 'discount_report'
  | 'annual_summary';

const REPORT_TABS: { id: ReportType; label: string }[] = [
  { id: 'monthly_collection', label: 'Monthly Collection' },
  { id: 'flat_statement', label: 'Flat-wise Statement' },
  { id: 'receipt_register', label: 'Receipt Register' },
  { id: 'outstanding_dues', label: 'Outstanding Dues' },
  { id: 'discount_report', label: 'Discount Report' },
  { id: 'annual_summary', label: 'Annual Summary' },
];

interface ReportsViewProps {
  user: UserSession;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ user }) => {
  const [reportType, setReportType] = useState<ReportType>('monthly_collection');
  const [month, setMonth] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [flatId, setFlatId] = useState(user.role === 'resident' && user.flatId ? user.flatId : '');
  const [search, setSearch] = useState('');

  const [flats, setFlats] = useState<Flat[]>([]);
  const [months, setMonths] = useState<string[]>(['2026-09', '2026-10', '2026-11']);
  const [rows, setRows] = useState<Record<string, string | number>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<{ flats: Flat[] }>('/api/flats'),
      apiFetch<{ months: string[] }>('/api/maintenance'),
    ]).then(([fRes, mRes]) => {
      setFlats(fRes.flats);
      if (mRes.months.length > 0) setMonths(mRes.months);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ type: reportType });
    if (month) params.set('month', month);
    if (flatId) params.set('flatId', flatId);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);

    apiFetch<{ type: string; rows: Record<string, string | number>[] }>(
      `/api/reports?${params.toString()}`
    )
      .then((res) => setRows(res.rows))
      .finally(() => setLoading(false));
  }, [reportType, month, flatId, fromDate, toDate]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      Object.values(row).some((val) => String(val).toLowerCase().includes(q))
    );
  }, [rows, search]);

  const columns = useMemo(() => {
    if (filteredRows.length === 0) return [];
    return Object.keys(filteredRows[0]);
  }, [filteredRows]);

  const formatHeader = (key: string) =>
    key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^./, (s) => s.toUpperCase());

  const isCurrencyKey = (key: string) =>
    /(amount|billed|collected|balance|due|gross|net|discount|concession|demand|outstanding|received)/i.test(
      key
    ) && !/pct|count/i.test(key);

  const handleExportCsv = () => {
    if (filteredRows.length === 0) return;
    downloadCsv(
      `smart-society-${reportType}.csv`,
      columns.map(formatHeader),
      filteredRows.map((row) => columns.map((col) => row[col] ?? ''))
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#26332E]">Financial Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Generated strictly from posted source maintenance bills, verified payments, and issued receipts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-[#D8D1C5] hover:bg-[#F8F6F1] rounded-lg cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>Print</span>
          </button>
          <button
            type="button"
            disabled={filteredRows.length === 0}
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#234D3C] hover:bg-[#1B3D2F] disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Report Selector Tabs */}
      <div className="flex items-center gap-1 p-1 bg-[#EDE9E0] rounded-xl overflow-x-auto no-print">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setReportType(tab.id)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              reportType === tab.id
                ? 'bg-white text-[#234D3C] shadow-sm'
                : 'text-slate-600 hover:text-[#26332E]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-[#E2DDD3] rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 no-print">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Month</label>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg bg-white"
          >
            <option value="">All Months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Flat Filter</label>
          <select
            value={flatId}
            disabled={user.role === 'resident'}
            onChange={(e) => setFlatId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg bg-white"
          >
            <option value="">All Flats</option>
            {flats.map((f) => (
              <option key={f.flatId} value={f.flatId}>
                Flat {f.flatNumber} — {f.ownerName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">From Date</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">To Date</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Search Rows</label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter text..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Report Data Table */}
      <div className="print-area bg-white border border-[#E2DDD3] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2DDD3] flex items-center justify-between">
          <h2 className="text-base font-display font-semibold text-[#26332E]">
            {REPORT_TABS.find((t) => t.id === reportType)?.label} Report
          </h2>
          <span className="text-xs text-slate-500 tabular-nums">
            {filteredRows.length} record(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F8F6F1] text-xs text-slate-500 border-b border-[#E2DDD3]">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    className={`font-semibold px-4 py-3 whitespace-nowrap ${
                      isCurrencyKey(col) ? 'text-right' : 'text-left'
                    }`}
                  >
                    {formatHeader(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={Math.max(1, columns.length)} className="px-4 py-8 text-center text-slate-500">
                    Generating report from posted records...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(1, columns.length)} className="px-4 py-8 text-center text-slate-500">
                    No records match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-[#F8F6F1]/70">
                    {columns.map((col) => {
                      const val = row[col];
                      const numeric = typeof val === 'number';
                      return (
                        <td
                          key={col}
                          className={`px-4 py-3 tabular-nums ${
                            isCurrencyKey(col) && numeric
                              ? 'text-right font-mono font-medium text-[#26332E]'
                              : 'text-slate-700'
                          }`}
                        >
                          {isCurrencyKey(col) && numeric
                            ? formatINR(val)
                            : col.toLowerCase().includes('pct')
                            ? `${val}%`
                            : String(val ?? '')}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
