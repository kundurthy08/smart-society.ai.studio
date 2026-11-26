import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  KeyRound,
  Plus,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import type { Flat, ResidentAccountSummary } from '../types/society.ts';

export const ResidentAccessView: React.FC = () => {
  const [residents, setResidents] = useState<ResidentAccountSummary[]>([]);
  const [flats, setFlats] = useState<Flat[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // New Resident Form
  const [form, setForm] = useState({
    name: '',
    mobile: '',
    email: '',
    flatId: 'FLT-103',
    relationship: 'Owner' as 'Owner' | 'Tenant' | 'Family',
  });
  const [submitting, setSubmitting] = useState(false);

  // Issued Activation Code Dialog
  const [issuedCode, setIssuedCode] = useState<{
    name: string;
    mobile: string;
    code: string;
    expiresAt: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Grant extra flat dialog
  const [grantTarget, setGrantTarget] = useState<ResidentAccountSummary | null>(null);
  const [grantForm, setGrantForm] = useState({
    flatId: 'FLT-103',
    relationship: 'Owner' as 'Owner' | 'Tenant' | 'Family',
  });

  const load = async () => {
    setLoading(true);
    try {
      const [rRes, fRes] = await Promise.all([
        apiFetch<{ residents: ResidentAccountSummary[] }>('/api/admin/residents'),
        apiFetch<{ flats: Flat[] }>('/api/flats'),
      ]);
      setResidents(rRes.residents);
      setFlats(fRes.flats);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{
        resident: { name: string; mobile: string };
        activationCode: string | null;
        expiresAt: string | null;
      }>('/api/admin/residents', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm({ name: '', mobile: '', email: '', flatId: 'FLT-103', relationship: 'Owner' });
      if (res.activationCode && res.expiresAt) {
        setIssuedCode({
          name: res.resident.name,
          mobile: res.resident.mobile,
          code: res.activationCode,
          expiresAt: res.expiresAt,
        });
        setCopied(false);
      } else {
        setFeedback({
          type: 'ok',
          text: `Flat access linked for ${res.resident.name} (${res.resident.mobile}).`,
        });
      }
      await load();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to register resident.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleIssueCode = async (resAcc: ResidentAccountSummary) => {
    setFeedback(null);
    try {
      const res = await apiFetch<{ activationCode: string; expiresAt: string; mobile: string }>(
        `/api/admin/residents/${resAcc.userId}/activation-code`,
        { method: 'POST' }
      );
      setIssuedCode({
        name: resAcc.name,
        mobile: res.mobile,
        code: res.activationCode,
        expiresAt: res.expiresAt,
      });
      setCopied(false);
      await load();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Could not issue activation code.',
      });
    }
  };

  const handleRevokeFlat = async (userId: string, flatId: string) => {
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/residents/${userId}/flat-access`, {
        method: 'POST',
        body: JSON.stringify({ action: 'revoke', flatId }),
      });
      setFeedback({ type: 'ok', text: 'Flat access revoked immediately.' });
      await load();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to revoke access.',
      });
    }
  };

  const handleGrantFlat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantTarget) return;
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/residents/${grantTarget.userId}/flat-access`, {
        method: 'POST',
        body: JSON.stringify({ action: 'grant', ...grantForm }),
      });
      setGrantTarget(null);
      setFeedback({ type: 'ok', text: `Additional flat access granted to ${grantTarget.name}.` });
      await load();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to grant flat access.',
      });
    }
  };

  const handleToggleStatus = async (resAcc: ResidentAccountSummary) => {
    const nextStatus = resAcc.status === 'Suspended' ? 'Active' : 'Suspended';
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/residents/${resAcc.userId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });
      setFeedback({
        type: 'ok',
        text: `${resAcc.name} account marked ${nextStatus}.`,
      });
      await load();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to update status.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-[#26332E]">
          Resident Onboarding &amp; FlatAccess Control
        </h1>
        <p className="text-sm text-[#52615B] mt-0.5">
          Register residents with verified mobile numbers, issue single-use activation codes, and govern per-flat access.
        </p>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-sm flex items-start gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Onboarding Form */}
        <form
          onSubmit={handleRegister}
          className="lg:col-span-4 bg-white border border-[#E2DDD3] rounded-xl p-6 space-y-3.5 self-start"
        >
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-[#234D3C]" />
            <h2 className="font-display font-bold text-lg text-[#26332E]">
              Register / Invite Resident
            </h2>
          </div>
          <p className="text-xs text-[#52615B]">
            Generates an expiring single-use activation code (no SMS OTP charges).
          </p>
          <div>
            <label className="block text-xs font-semibold mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Arvind Deshmukh"
              className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">10-Digit Mobile Number *</label>
            <input
              type="tel"
              required
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              placeholder="9845011203"
              className="w-full px-3 py-2 text-sm font-mono border border-[#D8D1C5] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Email (Optional)</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="resident@example.in"
              className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Assign Flat *</label>
              <select
                value={form.flatId}
                onChange={(e) => setForm({ ...form, flatId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg bg-white"
              >
                {flats.map((f) => (
                  <option key={f.flatId} value={f.flatId}>
                    Flat {f.flatNumber}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Relationship</label>
              <select
                value={form.relationship}
                onChange={(e) =>
                  setForm({
                    ...form,
                    relationship: e.target.value as 'Owner' | 'Tenant' | 'Family',
                  })
                }
                className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg bg-white"
              >
                <option value="Owner">Owner</option>
                <option value="Tenant">Tenant</option>
                <option value="Family">Family</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 text-sm font-semibold text-white bg-[#234D3C] hover:bg-[#1B3D2F] disabled:opacity-60 rounded-lg cursor-pointer"
          >
            {submitting ? 'Registering...' : 'Register & Generate Activation Code'}
          </button>
        </form>

        {/* Resident Accounts List */}
        <div className="lg:col-span-8 space-y-4">
          {loading ? (
            <div className="bg-white border border-[#E2DDD3] rounded-xl p-8 text-center text-sm text-[#52615B]">
              Loading resident access directory...
            </div>
          ) : (
            residents.map((resAcc) => {
              const activeFlats = resAcc.flatAccess.filter((fa) => fa.active);
              const revokedFlats = resAcc.flatAccess.filter((fa) => !fa.active);

              return (
                <div
                  key={resAcc.userId}
                  className="bg-white border border-[#E2DDD3] rounded-xl p-5 space-y-3.5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display font-bold text-base text-[#26332E]">
                          {resAcc.name}
                        </h3>
                        <span
                          className={`text-xs font-semibold ${
                            resAcc.status === 'Active'
                              ? 'text-emerald-800'
                              : resAcc.status === 'Pending'
                              ? 'text-amber-800'
                              : 'text-red-700'
                          }`}
                        >
                          · {resAcc.status}
                        </span>
                      </div>
                      <div className="text-xs text-[#52615B] mt-0.5 font-mono">
                        {resAcc.mobile} · {resAcc.email}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setGrantTarget(resAcc);
                          setGrantForm({ flatId: flats[0]?.flatId || 'FLT-101', relationship: 'Owner' });
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#234D3C] border border-[#D8D1C5] hover:bg-[#F8F6F1] rounded-lg cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Grant Flat</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleIssueCode(resAcc)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#234D3C] bg-[#EBF1EC] hover:bg-[#DCE7DE] rounded-lg cursor-pointer"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Issue Reset Code</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(resAcc)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer ${
                          resAcc.status === 'Suspended'
                            ? 'text-emerald-800 border-emerald-200 bg-emerald-50'
                            : 'text-red-700 border-red-200 bg-red-50'
                        }`}
                      >
                        {resAcc.status === 'Suspended' ? (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Reactivate</span>
                          </>
                        ) : (
                          <>
                            <UserX className="w-3.5 h-3.5" />
                            <span>Suspend</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Active FlatAccess Mappings */}
                  <div className="pt-2 border-t border-[#F0ECE3] space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64736D]">
                      Authorized Flats
                    </div>
                    {activeFlats.length === 0 ? (
                      <div className="text-xs text-amber-800">
                        No active flat access assigned (all access revoked).
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {activeFlats.map((fa) => (
                          <div
                            key={fa.accessId}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F8F6F1] border border-[#E2DDD3] text-xs"
                          >
                            <span className="font-semibold text-[#26332E]">
                              Flat {fa.flatNumber}
                            </span>
                            <span className="text-[#52615B]">({fa.relationship})</span>
                            <button
                              type="button"
                              onClick={() => handleRevokeFlat(resAcc.userId, fa.flatId)}
                              className="text-red-700 hover:underline font-semibold ml-1 cursor-pointer"
                            >
                              Revoke
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {revokedFlats.length > 0 && (
                      <div className="text-[11px] text-[#64736D]">
                        Previously revoked:{' '}
                        {revokedFlats
                          .map((r) => `Flat ${r.flatNumber} (${r.relationship})`)
                          .join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Single-Use Code Modal */}
      {issuedCode && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2DDD3] rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-[#26332E]">
                Single-Use Activation / Reset Code
              </h3>
              <button
                type="button"
                onClick={() => setIssuedCode(null)}
                className="cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#52615B]">
              Share this single-use code with <strong>{issuedCode.name}</strong> ({issuedCode.mobile}). It expires in 48 hours and is stored hashed on the server.
            </p>
            <div className="p-4 rounded-xl bg-[#F8F6F1] border border-[#D8D1C5] flex items-center justify-between">
              <span className="text-2xl font-mono font-bold tracking-widest text-[#234D3C]">
                {issuedCode.code}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(issuedCode.code);
                  setCopied(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#234D3C] bg-white border border-[#D8D1C5] rounded-lg cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setIssuedCode(null)}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#234D3C] rounded-lg cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grant Extra Flat Modal */}
      {grantTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleGrantFlat}
            className="bg-white border border-[#E2DDD3] rounded-xl max-w-sm w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg">
                Grant Flat Access · {grantTarget.name}
              </h3>
              <button
                type="button"
                onClick={() => setGrantTarget(null)}
                className="cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Select Flat</label>
              <select
                value={grantForm.flatId}
                onChange={(e) => setGrantForm({ ...grantForm, flatId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg bg-white"
              >
                {flats.map((f) => (
                  <option key={f.flatId} value={f.flatId}>
                    Flat {f.flatNumber} — {f.ownerName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Relationship</label>
              <select
                value={grantForm.relationship}
                onChange={(e) =>
                  setGrantForm({
                    ...grantForm,
                    relationship: e.target.value as 'Owner' | 'Tenant' | 'Family',
                  })
                }
                className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg bg-white"
              >
                <option value="Owner">Owner</option>
                <option value="Tenant">Tenant</option>
                <option value="Family">Family</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setGrantTarget(null)}
                className="px-4 py-2 text-xs border border-[#D8D1C5] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#234D3C] rounded-lg cursor-pointer"
              >
                Grant Access
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
