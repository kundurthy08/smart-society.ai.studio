import React, { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Download, Pencil, X, BookOpen } from 'lucide-react';
import { apiFetch, downloadCsv, formatINR } from '../lib/api.ts';
import type { Flat, OccupancyStatus, UserSession } from '../types/society.ts';

interface EnrichedFlat extends Flat {
  totalBilled: number;
  totalPaid: number;
  closingBalance: number;
}

interface FlatsViewProps {
  user: UserSession;
  onViewLedger: (flatId: string) => void;
}

export const FlatsView: React.FC<FlatsViewProps> = ({ user, onViewLedger }) => {
  const [flats, setFlats] = useState<EnrichedFlat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingFlat, setEditingFlat] = useState<EnrichedFlat | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState({
    flatNumber: '',
    floor: '1st Floor',
    areaSqFt: 1250,
    ownerName: '',
    mobile: '',
    email: '',
    occupancyStatus: 'Occupied' as OccupancyStatus,
    doorLockActive: false,
    specialDiscountAmount: 0,
    specialDiscountReason: '',
  });

  const isAdmin = user.role === 'president' || user.role === 'treasurer';

  const loadFlats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ flats: EnrichedFlat[] }>('/api/flats');
      setFlats(res.flats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load flats.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFlats();
  }, []);

  const filtered = useMemo(() => {
    return flats.filter((f) => {
      if (statusFilter !== 'ALL' && f.occupancyStatus !== statusFilter) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        f.flatNumber.toLowerCase().includes(q) ||
        f.ownerName.toLowerCase().includes(q) ||
        f.mobile.toLowerCase().includes(q) ||
        f.maintenanceCategory.toLowerCase().includes(q)
      );
    });
  }, [flats, search, statusFilter]);

  const openAddModal = () => {
    setEditingFlat(null);
    setFormError(null);
    setForm({
      flatNumber: '',
      floor: '3rd Floor',
      areaSqFt: 1250,
      ownerName: '',
      mobile: '',
      email: '',
      occupancyStatus: 'Occupied',
      doorLockActive: false,
      specialDiscountAmount: 0,
      specialDiscountReason: '',
    });
    setModalOpen(true);
  };

  const openEditModal = (flat: EnrichedFlat) => {
    setEditingFlat(flat);
    setFormError(null);
    setForm({
      flatNumber: flat.flatNumber,
      floor: flat.floor,
      areaSqFt: flat.areaSqFt,
      ownerName: flat.ownerName,
      mobile: flat.mobile,
      email: flat.email,
      occupancyStatus: flat.occupancyStatus,
      doorLockActive: flat.doorLockActive,
      specialDiscountAmount: flat.specialDiscountAmount,
      specialDiscountReason: flat.specialDiscountReason,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (editingFlat) {
        await apiFetch(`/api/flats/${editingFlat.flatId}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch('/api/flats', {
          method: 'POST',
          body: JSON.stringify(form),
        });
      }
      setModalOpen(false);
      await loadFlats();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save flat.');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    downloadCsv(
      'smart-society-flat-register.csv',
      [
        'Flat Number',
        'Floor',
        'Owner Name',
        'Mobile Number',
        'Maintenance Category',
        'Occupancy Status',
        'Total Billed',
        'Total Paid',
        'Closing Balance',
      ],
      filtered.map((f) => [
        f.flatNumber,
        f.floor,
        f.ownerName,
        f.mobile,
        f.maintenanceCategory,
        f.occupancyStatus,
        f.totalBilled,
        f.totalPaid,
        f.closingBalance,
      ])
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#26332E]">Flat Register</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Master directory of apartment units, owners, concession rules, and live closing balances.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-[#D8D1C5] hover:bg-[#F8F6F1] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#234D3C] hover:bg-[#1B3D2F] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Flat</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white border border-[#E2DDD3] rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by flat number, owner name, or mobile..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-[#D8D1C5] rounded-lg focus:outline-none focus:border-[#234D3C]"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#EDE9E0] rounded-lg overflow-x-auto">
          {['ALL', 'Occupied', 'Vacant / Door-Lock', 'Tenant'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                statusFilter === st
                  ? 'bg-white text-[#26332E] shadow-sm'
                  : 'text-slate-600 hover:text-[#26332E]'
              }`}
            >
              {st === 'ALL' ? 'All Flats' : st}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
          {error}
        </div>
      )}

      {/* Register Table */}
      <div className="bg-white border border-[#E2DDD3] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F8F6F1] text-xs text-slate-500 border-b border-[#E2DDD3]">
              <tr>
                <th className="text-left font-semibold px-4 py-3">Flat No.</th>
                <th className="text-left font-semibold px-4 py-3">Owner Name</th>
                <th className="text-left font-semibold px-4 py-3">Mobile Number</th>
                <th className="text-left font-semibold px-4 py-3">Maintenance Category</th>
                <th className="text-left font-semibold px-4 py-3">Occupancy Status</th>
                <th className="text-right font-semibold px-4 py-3">Closing Balance</th>
                <th className="text-right font-semibold px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Loading flat register...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No flats match your search criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((flat) => (
                  <tr key={flat.flatId} className="hover:bg-[#F8F6F1]/70">
                    <td className="px-4 py-3 font-display font-semibold text-[#26332E] whitespace-nowrap">
                      {flat.flatNumber}
                      <div className="text-xs font-normal text-slate-500">{flat.floor}</div>
                    </td>
                    <td className="px-4 py-3 text-[#26332E]">
                      <div className="font-medium">{flat.ownerName}</div>
                      {flat.isSampleData && (
                        <div className="text-xs text-slate-400">Sample Pilot Flat</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 tabular-nums font-mono whitespace-nowrap">
                      {flat.mobile}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <div>{flat.maintenanceCategory}</div>
                      {flat.specialDiscountAmount > 0 && !flat.doorLockActive && (
                        <div className="text-xs text-[#234D3C] tabular-nums">
                          -₹{flat.specialDiscountAmount}/mo concession
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {flat.occupancyStatus}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                        flat.closingBalance > 0 ? 'text-red-700' : 'text-emerald-700'
                      }`}
                    >
                      {formatINR(flat.closingBalance)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => onViewLedger(flat.flatId)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-[#234D3C] cursor-pointer"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>Ledger</span>
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => openEditModal(flat)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#234D3C] hover:underline cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Edit Flat</span>
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

      {/* Add / Edit Flat Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2DDD3] rounded-xl max-w-lg w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-bold text-[#26332E]">
                {editingFlat ? `Edit Flat ${editingFlat.flatNumber}` : 'Add New Flat'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-[#EDE9E0] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                {formError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Flat Number *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingFlat)}
                    value={form.flatNumber}
                    onChange={(e) => setForm((f) => ({ ...f, flatNumber: e.target.value }))}
                    placeholder="e.g. 111"
                    className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg disabled:bg-[#EDE9E0]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Floor</label>
                  <input
                    type="text"
                    value={form.floor}
                    onChange={(e) => setForm((f) => ({ ...f, floor: e.target.value }))}
                    className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Owner Name *
                </label>
                <input
                  type="text"
                  required
                  value={form.ownerName}
                  onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))}
                  className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Mobile Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.mobile}
                    onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}
                    placeholder="+91 98450 00000"
                    className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Occupancy Status
                  </label>
                  <select
                    value={form.occupancyStatus}
                    onChange={(e) => {
                      const val = e.target.value as OccupancyStatus;
                      setForm((f) => ({
                        ...f,
                        occupancyStatus: val,
                        doorLockActive: val === 'Vacant / Door-Lock' ? true : f.doorLockActive,
                      }));
                    }}
                    className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg bg-white"
                  >
                    <option value="Occupied">Occupied</option>
                    <option value="Vacant / Door-Lock">Vacant / Door-Lock</option>
                    <option value="Tenant">Tenant</option>
                  </select>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-[#F8F6F1] border border-[#E2DDD3] space-y-3">
                <label className="flex items-center gap-2.5 text-sm font-medium text-[#26332E] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.doorLockActive}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        doorLockActive: e.target.checked,
                        occupancyStatus: e.target.checked
                          ? 'Vacant / Door-Lock'
                          : 'Occupied',
                      }))
                    }
                    className="w-4 h-4 accent-[#234D3C]"
                  />
                  <span>Apply 50% Door-Lock Concession</span>
                </label>

                {!form.doorLockActive && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Special Discount (₹/mo)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={1200}
                        value={form.specialDiscountAmount}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            specialDiscountAmount: Number(e.target.value || 0),
                          }))
                        }
                        className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg bg-white tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Concession Reason
                      </label>
                      <input
                        type="text"
                        value={form.specialDiscountReason}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, specialDiscountReason: e.target.value }))
                        }
                        placeholder="Committee approval note"
                        className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-[#D8D1C5] rounded-lg hover:bg-[#F8F6F1] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-sm font-semibold text-white bg-[#234D3C] hover:bg-[#1B3D2F] disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
