import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  FileCheck2,
  HelpCircle,
  Paperclip,
  Receipt,
  ShieldAlert,
  XCircle,
  X,
} from 'lucide-react';
import { apiFetch, buildAuthenticatedAssetUrl, formatINR } from '../lib/api.ts';
import type { PaymentSubmission, SubmissionState, UserSession } from '../types/society.ts';

interface TreasurerApprovalsViewProps {
  user: UserSession;
  onOpenReceipt?: (receiptId: string) => void;
}

const STATE_LABELS: Record<SubmissionState, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending Review',
  CLARIFICATION_REQUIRED: 'Clarification Needed',
  APPROVED: 'Approved & Posted',
  REJECTED: 'Rejected',
};

export const TreasurerApprovalsView: React.FC<TreasurerApprovalsViewProps> = ({
  user,
  onOpenReceipt,
}) => {
  const [submissions, setSubmissions] = useState<PaymentSubmission[]>([]);
  const [filter, setFilter] = useState<'ALL' | SubmissionState>('PENDING_REVIEW');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [decisionModal, setDecisionModal] = useState<{
    sub: PaymentSubmission;
    action: 'clarify' | 'reject';
  } | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [previewEvidenceSub, setPreviewEvidenceSub] = useState<PaymentSubmission | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ submissions: PaymentSubmission[] }>('/api/payment-submissions');
      setSubmissions(res.submissions);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDecision = async (
    sub: PaymentSubmission,
    action: 'approve' | 'clarify' | 'reject',
    note?: string
  ) => {
    setBusyId(sub.submissionId);
    setFeedback(null);
    try {
      const res = await apiFetch<{
        submission: PaymentSubmission;
        receipt?: { receiptId: string; receiptNumber: string };
      }>(`/api/treasurer/submissions/${sub.submissionId}/decision`, {
        method: 'POST',
        body: JSON.stringify({ action, note }),
      });
      setDecisionModal(null);
      setNoteInput('');
      setFeedback({
        type: 'ok',
        text:
          action === 'approve'
            ? `Approved ${sub.submissionId} for Flat ${sub.flatNumber} and issued ${res.receipt?.receiptNumber}.`
            : action === 'clarify'
            ? `Clarification requested from Flat ${sub.flatNumber}.`
            : `Rejected ${sub.submissionId} with audit note.`,
      });
      await load();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to process submission decision.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const pendingCount = submissions.filter((s) => s.state === 'PENDING_REVIEW').length;
  const clarifyCount = submissions.filter((s) => s.state === 'CLARIFICATION_REQUIRED').length;
  const pendingValue = submissions
    .filter((s) => s.state === 'PENDING_REVIEW' || s.state === 'CLARIFICATION_REQUIRED')
    .reduce((sum, s) => sum + s.amount, 0);

  const filtered = submissions.filter((s) => (filter === 'ALL' ? true : s.state === filter));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#26332E]">
            Treasurer Payment Proof Approvals
          </h1>
          <p className="text-sm text-[#52615B] mt-0.5">
            Verify resident-submitted UPI/NEFT references and evidence before posting receipts or reducing flat dues.
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E2DDD3] rounded-xl p-5">
          <div className="text-xs font-medium text-[#52615B]">Pending Review Queue</div>
          <div className="mt-1.5 text-2xl font-display font-bold text-amber-800 tabular-nums">
            {pendingCount}
          </div>
          <div className="text-xs text-[#64736D] mt-1">
            {clarifyCount} awaiting resident clarification
          </div>
        </div>
        <div className="bg-white border border-[#E2DDD3] rounded-xl p-5">
          <div className="text-xs font-medium text-[#52615B]">Unverified Claimed Amount</div>
          <div className="mt-1.5 text-2xl font-display font-bold text-[#26332E] tabular-nums">
            {formatINR(pendingValue)}
          </div>
          <div className="text-xs text-[#64736D] mt-1">
            Excluded from collections until approved
          </div>
        </div>
        <div className="bg-white border border-[#E2DDD3] rounded-xl p-5">
          <div className="text-xs font-medium text-[#52615B]">Approved &amp; Receipted</div>
          <div className="mt-1.5 text-2xl font-display font-bold text-emerald-800 tabular-nums">
            {submissions.filter((s) => s.state === 'APPROVED').length}
          </div>
          <div className="text-xs text-[#64736D] mt-1">
            Idempotent single-receipt posting enforced
          </div>
        </div>
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

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {(
          [
            ['PENDING_REVIEW', `Pending Review (${pendingCount})`],
            ['CLARIFICATION_REQUIRED', `Clarification (${clarifyCount})`],
            ['APPROVED', 'Approved'],
            ['REJECTED', 'Rejected'],
            ['ALL', 'All Submissions'],
          ] as ['ALL' | SubmissionState, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
              filter === key
                ? 'bg-[#234D3C] text-white border-[#234D3C]'
                : 'bg-white text-[#52615B] border-[#E2DDD3] hover:text-[#26332E]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Queue List */}
      {loading ? (
        <div className="bg-white border border-[#E2DDD3] rounded-xl p-8 text-center text-sm text-[#52615B]">
          Loading payment submissions...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-[#E2DDD3] rounded-xl p-8 text-center text-sm text-[#52615B]">
          No payment submissions in this filter view.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((sub) => {
            const isSelfSubmitted = sub.submittedByUserId === user.userId;
            const actionable =
              sub.state === 'PENDING_REVIEW' || sub.state === 'CLARIFICATION_REQUIRED';

            return (
              <div
                key={sub.submissionId}
                className="bg-white border border-[#E2DDD3] rounded-xl p-5 space-y-4"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-mono font-semibold text-[#234D3C]">
                        {sub.submissionId}
                      </span>
                      <span className="text-[#D8D1C5]">·</span>
                      <span className="font-semibold text-[#26332E]">
                        Flat {sub.flatNumber} ({sub.ownerName})
                      </span>
                      <span className="text-[#D8D1C5]">·</span>
                      <span
                        className={`font-semibold ${
                          sub.state === 'APPROVED'
                            ? 'text-emerald-800'
                            : sub.state === 'REJECTED'
                            ? 'text-red-700'
                            : sub.state === 'CLARIFICATION_REQUIRED'
                            ? 'text-amber-800'
                            : 'text-[#234D3C]'
                        }`}
                      >
                        {STATE_LABELS[sub.state]}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="text-xl font-display font-bold text-[#26332E] tabular-nums">
                        {formatINR(sub.amount)}
                      </span>
                      <span className="text-xs text-[#52615B]">
                        {sub.paymentMethod} · Ref:{' '}
                        <span className="font-mono font-semibold text-[#26332E]">
                          {sub.bankReference || 'N/A'}
                        </span>{' '}
                        · Paid on {sub.paymentDate}
                      </span>
                    </div>

                    <div className="text-xs text-[#52615B]">
                      Target Months:{' '}
                      <span className="font-medium text-[#26332E]">
                        {sub.targetMonths.length > 0 ? sub.targetMonths.join(', ') : 'Oldest unpaid'}
                      </span>{' '}
                      · Submitted by {sub.submittedByName}
                    </div>

                    {sub.remarks && (
                      <p className="text-xs text-[#52615B] bg-[#F8F6F1] px-3 py-2 rounded-lg border border-[#E2DDD3]">
                        &ldquo;{sub.remarks}&rdquo;
                      </p>
                    )}

                    {sub.clarificationNote && (
                      <div className="text-xs text-amber-900 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                        <strong>Clarification Note:</strong> {sub.clarificationNote}
                      </div>
                    )}

                    {sub.rejectionReason && (
                      <div className="text-xs text-red-900 bg-red-50 px-3 py-2 rounded-lg border border-red-200">
                        <strong>Rejection Reason:</strong> {sub.rejectionReason}
                      </div>
                    )}
                  </div>

                  {/* Right Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {sub.evidenceFileId && (
                      <button
                        type="button"
                        onClick={() => setPreviewEvidenceSub(sub)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#234D3C] bg-[#EBF1EC] hover:bg-[#DCE7DE] rounded-lg cursor-pointer"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        <span>Inspect Proof</span>
                      </button>
                    )}

                    {sub.state === 'APPROVED' && sub.approvedReceiptId && onOpenReceipt && (
                      <button
                        type="button"
                        onClick={() => onOpenReceipt(sub.approvedReceiptId!)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#234D3C] border border-[#234D3C]/30 hover:bg-[#F8F6F1] rounded-lg cursor-pointer"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>View {sub.approvedReceiptNumber}</span>
                      </button>
                    )}

                    {actionable && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === sub.submissionId}
                          onClick={() => handleDecision(sub, 'approve')}
                          title={
                            isSelfSubmitted
                              ? 'Separation of duties prevents self-approval'
                              : 'Verify bank credit and issue official receipt'
                          }
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#234D3C] hover:bg-[#1B3D2F] disabled:opacity-50 rounded-lg cursor-pointer"
                        >
                          <FileCheck2 className="w-3.5 h-3.5" />
                          <span>
                            {busyId === sub.submissionId ? 'Posting...' : 'Approve & Post'}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={busyId === sub.submissionId}
                          onClick={() => {
                            setDecisionModal({ sub, action: 'clarify' });
                            setNoteInput('');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg cursor-pointer"
                        >
                          <HelpCircle className="w-3.5 h-3.5" />
                          <span>Clarify</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyId === sub.submissionId}
                          onClick={() => {
                            setDecisionModal({ sub, action: 'reject' });
                            setNoteInput('');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isSelfSubmitted && actionable && (
                  <div className="text-[11px] text-amber-800 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Submitted by your account ({user.name}). Separation-of-duties guard requires another committee officer to approve.
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Clarification / Rejection Reason Modal */}
      {decisionModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2DDD3] rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-[#26332E]">
                {decisionModal.action === 'clarify'
                  ? `Request Clarification · ${decisionModal.sub.submissionId}`
                  : `Reject Submission · ${decisionModal.sub.submissionId}`}
              </h3>
              <button
                type="button"
                onClick={() => setDecisionModal(null)}
                className="cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#52615B]">
              Flat {decisionModal.sub.flatNumber} · {formatINR(decisionModal.sub.amount)} · Ref:{' '}
              <span className="font-mono">{decisionModal.sub.bankReference}</span>
            </p>
            <textarea
              rows={3}
              required
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder={
                decisionModal.action === 'clarify'
                  ? 'e.g. Please attach the bank UTR screenshot or confirm transfer date.'
                  : 'e.g. No matching credit found in association bank statement.'
              }
              className="w-full px-3.5 py-2.5 text-sm border border-[#D8D1C5] rounded-lg"
            />
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDecisionModal(null)}
                className="px-4 py-2 text-xs font-semibold border border-[#D8D1C5] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!noteInput.trim() || busyId === decisionModal.sub.submissionId}
                onClick={() =>
                  handleDecision(decisionModal.sub, decisionModal.action, noteInput.trim())
                }
                className={`px-4 py-2 text-xs font-semibold text-white rounded-lg cursor-pointer disabled:opacity-50 ${
                  decisionModal.action === 'reject' ? 'bg-red-700' : 'bg-[#234D3C]'
                }`}
              >
                {decisionModal.action === 'clarify' ? 'Send Clarification Request' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Private Evidence Preview Modal */}
      {previewEvidenceSub && (
        <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2DDD3] rounded-xl max-w-2xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-base text-[#26332E]">
                  Payment Proof · {previewEvidenceSub.submissionId} (Flat {previewEvidenceSub.flatNumber})
                </h3>
                <p className="text-xs text-[#52615B]">
                  {previewEvidenceSub.evidenceFileName} · Private Committee Review
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewEvidenceSub(null)}
                className="p-1.5 rounded-lg hover:bg-[#F8F6F1] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {previewEvidenceSub.evidenceMimeType === 'application/pdf' ? (
              <div className="p-6 bg-[#F8F6F1] rounded-lg text-center space-y-3">
                <p className="text-sm text-[#52615B]">
                  PDF evidence attached ({previewEvidenceSub.evidenceFileName}).
                </p>
                <a
                  href={buildAuthenticatedAssetUrl(
                    `/api/payment-submissions/${previewEvidenceSub.submissionId}/evidence`
                  )}
                  download={previewEvidenceSub.evidenceFileName}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#234D3C] rounded-lg"
                >
                  Download PDF Proof
                </a>
              </div>
            ) : (
              <div className="bg-[#F8F6F1] rounded-lg p-3 flex justify-center max-h-[65vh] overflow-auto">
                <img
                  src={buildAuthenticatedAssetUrl(
                    `/api/payment-submissions/${previewEvidenceSub.submissionId}/evidence`
                  )}
                  alt={`Payment proof for ${previewEvidenceSub.submissionId}`}
                  referrerPolicy="no-referrer"
                  className="max-h-[60vh] object-contain rounded-lg"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
