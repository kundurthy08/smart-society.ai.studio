import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  BookOpen,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  Globe,
  HelpCircle,
  Home,
  KeyRound,
  LogOut,
  MapPin,
  Megaphone,
  MessageSquareWarning,
  Paperclip,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  User,
  Wrench,
  X,
} from 'lucide-react';
import {
  apiFetch,
  buildAuthenticatedAssetUrl,
  downloadCsv,
  fileToDataUrl,
  formatINR,
} from '../lib/api.ts';
import { PWAInstallButton } from './PWAComponents.tsx';
import type {
  Announcement,
  CommunityEvent,
  Complaint,
  DashboardSummary,
  Flat,
  LedgerEntry,
  MaintenanceBill,
  NotificationItem,
  NotificationPreferences,
  PaymentSubmission,
  ReceiptRecord,
  ResidentDocument,
  SocietySettings,
  UserSession,
} from '../types/society.ts';

type AppTab = 'home' | 'maintenance' | 'complaints' | 'notices' | 'profile';
type MaintSubTab = 'dues' | 'status' | 'receipts' | 'statement';
type NoticeSubTab = 'announcements' | 'events' | 'documents';

interface ResidentAppProps {
  user: UserSession;
  onUserUpdate: (u: UserSession) => void;
  onGoHome: () => void;
  onLogout: () => void;
}

const COMPLAINT_CATEGORIES = [
  'Plumbing & Water',
  'Electrical & Lighting',
  'Lift & Power Backup',
  'Common Area & Housekeeping',
  'Security & Gate',
  'Parking & Driveway',
];

const SUBMISSION_STEPS = ['Submitted', 'Treasurer Review', 'Receipt Issued'];

function getSubmissionStepIndex(state: PaymentSubmission['state']): number {
  if (state === 'APPROVED') return 2;
  if (state === 'PENDING_REVIEW' || state === 'CLARIFICATION_REQUIRED') return 1;
  return 0;
}

export const ResidentApp: React.FC<ResidentAppProps> = ({
  user,
  onUserUpdate,
  onGoHome,
  onLogout,
}) => {
  const [tab, setTab] = useState<AppTab>('home');
  const [maintSub, setMaintSub] = useState<MaintSubTab>('dues');
  const [noticeSub, setNoticeSub] = useState<NoticeSubTab>('announcements');

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [flatDetails, setFlatDetails] = useState<Flat | null>(null);
  const [bills, setBills] = useState<MaintenanceBill[]>([]);
  const [submissions, setSubmissions] = useState<PaymentSubmission[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [settings, setSettings] = useState<SocietySettings | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerClosing, setLedgerClosing] = useState(0);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [documents, setDocuments] = useState<ResidentDocument[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    userId: user.userId,
    billReminders: true,
    paymentUpdates: true,
    complaintUpdates: true,
    announcements: true,
    events: true,
  });

  // UI Overlays & Modals
  const [notifOpen, setNotifOpen] = useState(false);
  const [flatModalOpen, setFlatModalOpen] = useState(false);
  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [editingDraftSub, setEditingDraftSub] = useState<PaymentSubmission | null>(null);
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptRecord | null>(null);
  const [activeAnnouncement, setActiveAnnouncement] = useState<Announcement | null>(null);
  const [newComplaintOpen, setNewComplaintOpen] = useState(false);
  const [reopenTarget, setReopenTarget] = useState<Complaint | null>(null);
  const [reopenNote, setReopenNote] = useState('');
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Receipts filters
  const [receiptSearch, setReceiptSearch] = useState('');
  const [receiptYear, setReceiptYear] = useState('all');

  // Submit Payment Form
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [payForm, setPayForm] = useState({
    paymentDate: new Date().toISOString().slice(0, 10),
    amount: '',
    paymentMethod: 'UPI' as 'UPI' | 'NEFT / IMPS' | 'Cheque' | 'Cash',
    bankReference: '',
    remarks: '',
    evidenceBase64: '',
    evidenceFileName: '',
  });
  const [payBusy, setPayBusy] = useState(false);

  // Complaint Form
  const [cmpForm, setCmpForm] = useState({
    category: 'Plumbing & Water',
    priority: 'Normal' as 'Normal' | 'Urgent',
    subject: '',
    description: '',
    photoBase64: '',
    photoFileName: '',
  });
  const [cmpBusy, setCmpBusy] = useState(false);

  // Password Change Form
  const [pwdForm, setPwdForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [pwdBusy, setPwdBusy] = useState(false);

  const showToast = (type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast((curr) => (curr?.text === text ? null : curr)), 5000);
  };

  const activeFlatId = user.activeFlatId || user.flatId || user.allowedFlats[0]?.flatId;

  const loadAll = async (flatParam?: string) => {
    setLoading(true);
    const q = flatParam ? `?flatId=${encodeURIComponent(flatParam)}` : activeFlatId ? `?flatId=${encodeURIComponent(activeFlatId)}` : '';
    try {
      const [
        dashRes,
        flatsRes,
        maintRes,
        subRes,
        recRes,
        ledgRes,
        cmpRes,
        annRes,
        evtRes,
        docRes,
        ntfRes,
        prefRes,
      ] = await Promise.all([
        apiFetch<DashboardSummary>(`/api/dashboard${q}`),
        apiFetch<{ flats: Flat[] }>(`/api/flats${q}`),
        apiFetch<{ bills: MaintenanceBill[] }>(`/api/maintenance${q}`),
        apiFetch<{ submissions: PaymentSubmission[] }>(`/api/payment-submissions${q}`),
        apiFetch<{ receipts: ReceiptRecord[]; society: SocietySettings }>(`/api/receipts${q}`),
        apiFetch<{ ledger: LedgerEntry[]; closingBalance: number }>(`/api/ledger${q}`),
        apiFetch<{ complaints: Complaint[] }>(`/api/complaints${q}`),
        apiFetch<{ announcements: Announcement[] }>('/api/announcements'),
        apiFetch<{ events: CommunityEvent[] }>('/api/events'),
        apiFetch<{ documents: ResidentDocument[] }>('/api/documents'),
        apiFetch<{ notifications: NotificationItem[]; unreadCount: number }>('/api/notifications'),
        apiFetch<{ preferences: NotificationPreferences }>('/api/notifications/preferences'),
      ]);
      setSummary(dashRes);
      setFlatDetails(flatsRes.flats[0] ?? null);
      setBills(maintRes.bills);
      setSubmissions(subRes.submissions);
      setReceipts(recRes.receipts);
      setSettings(recRes.society);
      setLedger(ledgRes.ledger);
      setLedgerClosing(ledgRes.closingBalance);
      setComplaints(cmpRes.complaints);
      setAnnouncements(annRes.announcements);
      setEvents(evtRes.events);
      setDocuments(docRes.documents);
      setNotifications(ntfRes.notifications);
      setUnreadCount(ntfRes.unreadCount);
      setPrefs(prefRes.preferences);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll(activeFlatId);
  }, [activeFlatId]);

  const unpaidBills = useMemo(
    () => bills.filter((b) => b.balanceDue > 0).sort((a, b) => a.billingMonth.localeCompare(b.billingMonth)),
    [bills]
  );

  const openPaymentWizard = (prefillSub?: PaymentSubmission) => {
    if (prefillSub) {
      setEditingDraftSub(prefillSub);
      setSelectedMonths(prefillSub.targetMonths);
      setPayForm({
        paymentDate: prefillSub.paymentDate,
        amount: String(prefillSub.amount),
        paymentMethod: prefillSub.paymentMethod,
        bankReference: prefillSub.bankReference,
        remarks: prefillSub.remarks,
        evidenceBase64: '',
        evidenceFileName: prefillSub.evidenceFileName || '',
      });
    } else {
      setEditingDraftSub(null);
      const months = unpaidBills.map((b) => b.billingMonth);
      const total = unpaidBills.reduce((s, b) => s + b.balanceDue, 0);
      setSelectedMonths(months);
      setPayForm({
        paymentDate: new Date().toISOString().slice(0, 10),
        amount: total > 0 ? String(total) : '1200',
        paymentMethod: 'UPI',
        bankReference: '',
        remarks: '',
        evidenceBase64: '',
        evidenceFileName: '',
      });
    }
    setPaySheetOpen(true);
  };

  const toggleMonthSelection = (month: string) => {
    const next = selectedMonths.includes(month)
      ? selectedMonths.filter((m) => m !== month)
      : [...selectedMonths, month].sort();
    setSelectedMonths(next);
    const sum = bills
      .filter((b) => next.includes(b.billingMonth))
      .reduce((acc, b) => acc + Math.max(0, b.balanceDue), 0);
    if (sum > 0) {
      setPayForm((prev) => ({ ...prev, amount: String(sum) }));
    }
  };

  const handleEvidencePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      showToast('err', 'Proof file must be 3 MB or smaller (JPG, PNG, or PDF).');
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setPayForm((prev) => ({
        ...prev,
        evidenceBase64: dataUrl,
        evidenceFileName: file.name,
      }));
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Unable to attach file.');
    }
  };

  const handleSubmitPayment = async (mode: 'draft' | 'submit') => {
    setPayBusy(true);
    try {
      const payload = {
        flatId: activeFlatId,
        paymentDate: payForm.paymentDate,
        amount: Number(payForm.amount),
        paymentMethod: payForm.paymentMethod,
        bankReference: payForm.bankReference.trim(),
        targetMonths: selectedMonths,
        remarks: payForm.remarks.trim(),
        mode,
        evidenceBase64: payForm.evidenceBase64 || undefined,
        evidenceFileName: payForm.evidenceFileName || undefined,
      };
      if (editingDraftSub) {
        await apiFetch(`/api/payment-submissions/${editingDraftSub.submissionId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/api/payment-submissions', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setPaySheetOpen(false);
      setTab('maintenance');
      setMaintSub('status');
      showToast(
        'ok',
        mode === 'draft'
          ? 'Payment draft saved. Your flat dues remain unchanged until submitted and verified.'
          : 'Payment proof submitted! The Treasurer will verify and issue your official receipt.'
      );
      await loadAll(activeFlatId);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Could not submit payment.');
    } finally {
      setPayBusy(false);
    }
  };

  const handleDownloadPdf = (receipt: ReceiptRecord) => {
    const url = buildAuthenticatedAssetUrl(
      `/api/receipts/${encodeURIComponent(receipt.receiptId)}/pdf`
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${receipt.receiptNumber}-Flat-${receipt.flatNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleComplaintPhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      showToast('err', 'Photo must be 3 MB or smaller.');
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    setCmpForm((prev) => ({ ...prev, photoBase64: dataUrl, photoFileName: file.name }));
  };

  const handleComplaintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCmpBusy(true);
    try {
      await apiFetch('/api/complaints', {
        method: 'POST',
        body: JSON.stringify({
          flatId: activeFlatId,
          ...cmpForm,
        }),
      });
      setCmpForm({
        category: 'Plumbing & Water',
        priority: 'Normal',
        subject: '',
        description: '',
        photoBase64: '',
        photoFileName: '',
      });
      setNewComplaintOpen(false);
      showToast('ok', 'Complaint registered! You can track staff assignment and updates live.');
      await loadAll(activeFlatId);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Unable to register complaint.');
    } finally {
      setCmpBusy(false);
    }
  };

  const handleResidentComplaintAction = async (
    cmp: Complaint,
    action: 'close' | 'reopen',
    note?: string
  ) => {
    try {
      await apiFetch(`/api/complaints/${cmp.complaintId}/resident-action`, {
        method: 'POST',
        body: JSON.stringify({ action, note }),
      });
      setReopenTarget(null);
      setReopenNote('');
      showToast(
        'ok',
        action === 'close'
          ? `Complaint ${cmp.complaintId} confirmed closed.`
          : `Complaint ${cmp.complaintId} reopened for committee follow-up.`
      );
      await loadAll(activeFlatId);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Action failed.');
    }
  };

  const handleSwitchFlat = async (flatId: string) => {
    try {
      const res = await apiFetch<{ user: UserSession }>('/api/auth/switch-flat', {
        method: 'POST',
        body: JSON.stringify({ flatId }),
      });
      onUserUpdate(res.user);
      showToast('ok', `Switched to Flat ${res.user.allowedFlats.find((f) => f.flatId === flatId)?.flatNumber}`);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Could not switch flat.');
    }
  };

  const handleMarkNotifRead = async (ntf: NotificationItem) => {
    if (!ntf.read) {
      await apiFetch(`/api/notifications/${ntf.notificationId}/read`, { method: 'POST' });
    }
    setNotifOpen(false);
    if (ntf.linkScreen === 'receipts') {
      setTab('maintenance');
      setMaintSub('receipts');
    } else if (ntf.linkScreen === 'maintenance') {
      setTab('maintenance');
      setMaintSub('dues');
    } else if (ntf.linkScreen === 'complaints') {
      setTab('complaints');
    } else if (ntf.linkScreen === 'notices') {
      setTab('notices');
    }
    await loadAll(activeFlatId);
  };

  const handleMarkAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
    await loadAll(activeFlatId);
  };

  const handleTogglePref = async (key: keyof Omit<NotificationPreferences, 'userId'>) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    await apiFetch('/api/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(next),
    });
    showToast('ok', 'Notification preferences saved.');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      showToast('err', 'New passwords do not match.');
      return;
    }
    setPwdBusy(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: pwdForm.currentPassword,
          newPassword: pwdForm.newPassword,
        }),
      });
      setPwdForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showToast('ok', res.message);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Password change failed.');
    } finally {
      setPwdBusy(false);
    }
  };

  const copyText = (key: string, val: string) => {
    navigator.clipboard?.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const flatLabel = flatDetails?.flatNumber || activeFlatId?.replace('FLT-', '') || '101';
  const pendingReviewCount = submissions.filter(
    (s) => s.state === 'PENDING_REVIEW' || s.state === 'CLARIFICATION_REQUIRED'
  ).length;

  const filteredReceipts = receipts.filter((r) => {
    if (receiptYear !== 'all' && !r.receiptDate.startsWith(receiptYear)) return false;
    if (!receiptSearch.trim()) return true;
    const q = receiptSearch.toLowerCase();
    return (
      r.receiptNumber.toLowerCase().includes(q) ||
      r.bankReference.toLowerCase().includes(q) ||
      r.maintenancePeriod.toLowerCase().includes(q)
    );
  });

  const navItems: { id: AppTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'maintenance', label: 'Maintenance', icon: CreditCard, badge: summary && summary.totalOutstanding > 0 ? 1 : undefined },
    { id: 'complaints', label: 'Complaints', icon: Wrench, badge: summary && summary.openComplaintsCount > 0 ? summary.openComplaintsCount : undefined },
    { id: 'notices', label: 'Notices', icon: Megaphone },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <div className="min-h-screen bg-[#F8F6F1] text-[#26332E] flex flex-col pb-20 md:pb-0">
      {/* Top App Header */}
      <header className="bg-white/95 backdrop-blur-xs border-b border-[#E2DDD3] sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#234D3C] text-[#F8F6F1] flex items-center justify-center shrink-0 shadow-xs">
              <Building2 className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="font-display font-bold text-sm sm:text-base text-[#234D3C] truncate">
                HAPPY HOMES PALACE-B
              </div>
              <div className="text-[11px] text-[#52615B] flex items-center gap-1.5">
                <span>My Community App</span>
                <span>·</span>
                {user.allowedFlats.length > 1 ? (
                  <select
                    value={activeFlatId}
                    onChange={(e) => handleSwitchFlat(e.target.value)}
                    className="font-semibold text-[#234D3C] bg-[#EBF1EC] px-1.5 py-0.5 rounded-md border-none text-[11px] cursor-pointer"
                  >
                    {user.allowedFlats.map((f) => (
                      <option key={f.flatId} value={f.flatId}>
                        Flat {f.flatNumber} ({f.relationship})
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="font-semibold text-[#234D3C]">Flat {flatLabel}</span>
                )}
              </div>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Resident App Navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`relative inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#EBF1EC] text-[#234D3C]'
                      : 'text-[#52615B] hover:text-[#234D3C] hover:bg-[#F8F6F1]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {item.badge && item.badge > 0 && (
                    <span className="ml-0.5 w-4 h-4 rounded-full bg-[#C5A46D] text-white text-[10px] font-bold flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Utilities */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              aria-label="Open Notifications"
              className="relative p-2 rounded-xl border border-[#E2DDD3] hover:bg-[#F8F6F1] text-[#26332E] cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4.5 h-4.5 rounded-full bg-[#234D3C] text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onGoHome}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#234D3C] border border-[#D8D1C5] hover:bg-[#F8F6F1] rounded-xl cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Website</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              title="Sign Out"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 rounded-xl cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Floating Feedback Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed top-20 right-4 left-4 sm:left-auto sm:max-w-md z-50"
          >
            <div
              className={`p-3.5 rounded-xl border shadow-lg text-xs font-medium flex items-start justify-between gap-3 ${
                toast.type === 'ok'
                  ? 'bg-emerald-950 text-white border-emerald-800'
                  : 'bg-red-900 text-white border-red-700'
              }`}
            >
              <span>{toast.text}</span>
              <button type="button" onClick={() => setToast(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {loading && !summary ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-10 h-10 rounded-full border-2 border-[#234D3C] border-t-transparent animate-spin mx-auto" />
            <p className="text-sm text-[#52615B]">Loading Residence {flatLabel}...</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {/* =========================================================== */}
            {/* TAB 1: RESIDENT HOME                                        */}
            {/* =========================================================== */}
            {tab === 'home' && summary && (
              <motion.div
                key="tab-home"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-6"
              >
                {/* Hero Greeting & Maintenance Status Card */}
                <div className="bg-gradient-to-br from-[#234D3C] to-[#1A3B2E] text-[#F8F6F1] rounded-2xl p-6 sm:p-7 shadow-sm relative overflow-hidden">
                  <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-2">
                      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#AFC5B5]">
                        <Sparkles className="w-3.5 h-3.5 text-[#C5A46D]" />
                        <span>Welcome Home · Residence {flatLabel}</span>
                      </div>
                      <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight">
                        Hello, {user.name}
                      </h1>
                      <p className="text-xs sm:text-sm text-[#DCE7DE] max-w-xl">
                        {summary.totalOutstanding === 0
                          ? 'Your maintenance account is completely settled. Official receipts and notices are ready whenever you need them.'
                          : `You have ${unpaidBills.length} open maintenance ${unpaidBills.length === 1 ? 'bill' : 'bills'} for Flat ${flatLabel}. Pay via Association UPI/Bank Transfer and submit your proof in seconds.`}
                      </p>
                    </div>

                    {/* Right Balance Pill Card */}
                    <div className="bg-white/10 backdrop-blur-xs border border-white/15 rounded-2xl p-4 sm:p-5 min-w-[230px] space-y-3">
                      <div className="text-xs text-[#AFC5B5]">Current Maintenance Due</div>
                      <div className="text-3xl font-display font-bold tabular-nums">
                        {formatINR(summary.totalOutstanding)}
                      </div>
                      {summary.totalOutstanding > 0 ? (
                        <button
                          type="button"
                          onClick={() => openPaymentWizard()}
                          className="w-full py-2 px-4 text-xs font-semibold bg-[#C5A46D] hover:bg-[#b5935c] text-[#26332E] rounded-xl transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Pay &amp; Submit Proof</span>
                        </button>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>All Dues Settled</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Pending Proof Notice Banner */}
                {pendingReviewCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setTab('maintenance');
                      setMaintSub('status');
                    }}
                    className="w-full text-left bg-amber-50 border border-amber-200 hover:border-amber-300 rounded-2xl p-4 flex items-center justify-between gap-4 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-amber-800 shrink-0" />
                      <div>
                        <div className="text-sm font-semibold text-amber-950">
                          {pendingReviewCount} Payment Submission{pendingReviewCount > 1 ? 's' : ''} Pending Treasurer Review
                        </div>
                        <div className="text-xs text-amber-800">
                          Your flat dues update automatically once the Treasurer verifies your UTR/bank reference.
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-amber-800 shrink-0" />
                  </button>
                )}

                {/* Quick Service Tiles */}
                <div>
                  <h2 className="font-display font-bold text-lg text-[#26332E] mb-3">
                    Resident Services
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {[
                      {
                        label: 'Pay Maintenance',
                        sub: summary.totalOutstanding > 0 ? formatINR(summary.totalOutstanding) : 'Advance / Proof',
                        icon: CreditCard,
                        action: () => openPaymentWizard(),
                      },
                      {
                        label: 'My Receipts',
                        sub: `${receipts.length} Official PDFs`,
                        icon: Receipt,
                        action: () => {
                          setTab('maintenance');
                          setMaintSub('receipts');
                        },
                      },
                      {
                        label: 'Account Ledger',
                        sub: 'Bills & Credits',
                        icon: BookOpen,
                        action: () => {
                          setTab('maintenance');
                          setMaintSub('statement');
                        },
                      },
                      {
                        label: 'Raise Complaint',
                        sub: `${summary.openComplaintsCount} Active`,
                        icon: Wrench,
                        action: () => {
                          setTab('complaints');
                          setNewComplaintOpen(true);
                        },
                      },
                      {
                        label: 'Notices & Events',
                        sub: `${announcements.length} Circulars`,
                        icon: Megaphone,
                        action: () => setTab('notices'),
                      },
                      {
                        label: 'My Flat Info',
                        sub: `Flat ${flatLabel}`,
                        icon: Building2,
                        action: () => setFlatModalOpen(true),
                      },
                    ].map((tile) => {
                      const Icon = tile.icon;
                      return (
                        <motion.button
                          key={tile.label}
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.98 }}
                          type="button"
                          onClick={tile.action}
                          className="bg-white border border-[#E2DDD3] hover:border-[#234D3C]/40 rounded-2xl p-4 text-left space-y-2.5 cursor-pointer transition-colors shadow-2xs"
                        >
                          <div className="w-9 h-9 rounded-xl bg-[#EBF1EC] text-[#234D3C] flex items-center justify-center">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-semibold text-xs sm:text-sm text-[#26332E] leading-tight">
                              {tile.label}
                            </div>
                            <div className="text-[11px] text-[#64736D] mt-0.5">{tile.sub}</div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Two Column Highlights: Announcements + Upcoming Event / Recent Receipt */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  <div className="lg:col-span-7 bg-white border border-[#E2DDD3] rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="font-display font-bold text-base text-[#26332E]">
                        Latest Society Announcements
                      </h2>
                      <button
                        type="button"
                        onClick={() => setTab('notices')}
                        className="text-xs font-semibold text-[#234D3C] hover:underline cursor-pointer"
                      >
                        View All
                      </button>
                    </div>
                    <div className="space-y-3">
                      {announcements.slice(0, 3).map((a) => (
                        <button
                          key={a.announcementId}
                          type="button"
                          onClick={() => setActiveAnnouncement(a)}
                          className="w-full text-left p-3.5 rounded-xl bg-[#F8F6F1] hover:bg-[#EFECE4] transition-colors cursor-pointer space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
                            <span
                              className={
                                a.priority === 'Urgent'
                                  ? 'text-red-700'
                                  : a.priority === 'Important'
                                  ? 'text-amber-800'
                                  : 'text-[#234D3C]'
                              }
                            >
                              {a.priority} · {a.category}
                            </span>
                            <span className="text-[#64736D]">{a.publishDate}</span>
                          </div>
                          <div className="font-semibold text-sm text-[#26332E]">{a.title}</div>
                          <p className="text-xs text-[#52615B] line-clamp-2">{a.summary}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="lg:col-span-5 space-y-5">
                    {/* Latest Receipt */}
                    <div className="bg-white border border-[#E2DDD3] rounded-2xl p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h2 className="font-display font-bold text-base text-[#26332E]">
                          Latest Verified Receipt
                        </h2>
                        <button
                          type="button"
                          onClick={() => {
                            setTab('maintenance');
                            setMaintSub('receipts');
                          }}
                          className="text-xs font-semibold text-[#234D3C] hover:underline cursor-pointer"
                        >
                          All Receipts
                        </button>
                      </div>
                      {receipts[0] ? (
                        <div className="p-4 rounded-xl bg-[#F8F6F1] border border-[#E2DDD3] space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-semibold text-[#234D3C]">
                              {receipts[0].receiptNumber}
                            </span>
                            <span className="text-xs text-[#52615B]">{receipts[0].receiptDate}</span>
                          </div>
                          <div className="text-xl font-display font-bold text-[#26332E] tabular-nums">
                            {formatINR(receipts[0].amountReceived)}
                          </div>
                          <div className="text-xs text-[#52615B]">
                            Months: {receipts[0].maintenancePeriod} · {receipts[0].paymentMethod}
                          </div>
                          <div className="pt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPreviewReceipt(receipts[0])}
                              className="flex-1 py-2 text-xs font-semibold text-[#234D3C] bg-white border border-[#D8D1C5] rounded-lg cursor-pointer"
                            >
                              Preview
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadPdf(receipts[0])}
                              className="flex-1 py-2 text-xs font-semibold text-white bg-[#234D3C] rounded-lg cursor-pointer inline-flex items-center justify-center gap-1.5"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>PDF</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-[#52615B]">No verified receipts yet.</p>
                      )}
                    </div>

                    {/* Next Community Event */}
                    {events.find((e) => e.status === 'Upcoming') && (
                      <div className="bg-white border border-[#E2DDD3] rounded-2xl p-5 space-y-2.5">
                        <div className="text-xs font-semibold text-[#234D3C] flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Upcoming Community Gathering</span>
                        </div>
                        {(() => {
                          const evt = events.find((e) => e.status === 'Upcoming')!;
                          return (
                            <>
                              <h3 className="font-display font-bold text-base text-[#26332E]">
                                {evt.title}
                              </h3>
                              <div className="text-xs text-[#52615B] flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-[#234D3C]" />
                                <span>
                                  {evt.date} · {evt.time} · {evt.location}
                                </span>
                              </div>
                              <p className="text-xs text-[#52615B]">{evt.description}</p>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* =========================================================== */}
            {/* TAB 2: MAINTENANCE, PROOF SUBMISSION, RECEIPTS & STATEMENT  */}
            {/* =========================================================== */}
            {tab === 'maintenance' && (
              <motion.div
                key="tab-maint"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-display font-bold text-[#26332E]">
                      Maintenance &amp; Payments · Flat {flatLabel}
                    </h1>
                    <p className="text-sm text-[#52615B]">
                      View monthly bills, submit UPI/bank transfer proofs, track verification, and download official receipts.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openPaymentWizard()}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#234D3C] hover:bg-[#1B3D2F] rounded-xl cursor-pointer shrink-0"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Submit Payment Proof</span>
                  </button>
                </div>

                {/* Sub-Navigation */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {(
                    [
                      ['dues', `Monthly Dues (${unpaidBills.length} Open)`],
                      ['status', `Payment Status (${submissions.length})`],
                      ['receipts', `My Receipts (${receipts.length})`],
                      ['statement', 'Flat Statement'],
                    ] as [MaintSubTab, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setMaintSub(id)}
                      className={`px-3.5 py-2 text-xs font-semibold rounded-xl border whitespace-nowrap cursor-pointer transition-colors ${
                        maintSub === id
                          ? 'bg-[#234D3C] text-white border-[#234D3C]'
                          : 'bg-white text-[#52615B] border-[#E2DDD3] hover:text-[#26332E]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Sub-Tab A: Monthly Dues + Payment Instructions */}
                {maintSub === 'dues' && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-8 bg-white border border-[#E2DDD3] rounded-2xl overflow-hidden">
                      <div className="px-5 py-4 border-b border-[#E2DDD3] flex items-center justify-between">
                        <h2 className="font-display font-bold text-base text-[#26332E]">
                          Monthly Maintenance Bills
                        </h2>
                        <span className="text-xs font-semibold text-[#52615B] tabular-nums">
                          Total Due: {formatINR(summary?.totalOutstanding ?? 0)}
                        </span>
                      </div>
                      <div className="divide-y divide-[#F0ECE3]">
                        {bills.map((b) => (
                          <div
                            key={b.billId}
                            className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold text-sm text-[#26332E]">
                                  {b.billingMonth}
                                </span>
                                <span className="text-[#D8D1C5]">·</span>
                                <span
                                  className={`text-xs font-semibold ${
                                    b.status === 'Paid'
                                      ? 'text-emerald-800'
                                      : b.status === 'Partial'
                                      ? 'text-amber-800'
                                      : 'text-red-700'
                                  }`}
                                >
                                  {b.status}
                                </span>
                              </div>
                              <div className="text-xs text-[#52615B] mt-0.5">
                                Gross {formatINR(b.grossAmount)}
                                {b.doorLockDiscount + b.specialDiscount > 0 &&
                                  ` · Concession -${formatINR(b.doorLockDiscount + b.specialDiscount)}`}
                                {` · Net ${formatINR(b.netAmount)}`}
                              </div>
                            </div>
                            <div className="flex items-center justify-between sm:justify-end gap-4">
                              <div className="text-right tabular-nums">
                                <div className="text-xs text-[#64736D]">Balance Due</div>
                                <div className="font-display font-bold text-base text-[#26332E]">
                                  {formatINR(b.balanceDue)}
                                </div>
                              </div>
                              {b.balanceDue > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingDraftSub(null);
                                    setSelectedMonths([b.billingMonth]);
                                    setPayForm({
                                      paymentDate: new Date().toISOString().slice(0, 10),
                                      amount: String(b.balanceDue),
                                      paymentMethod: 'UPI',
                                      bankReference: '',
                                      remarks: `Maintenance for ${b.billingMonth}`,
                                      evidenceBase64: '',
                                      evidenceFileName: '',
                                    });
                                    setPaySheetOpen(true);
                                  }}
                                  className="px-3 py-1.5 text-xs font-semibold text-white bg-[#234D3C] rounded-lg cursor-pointer"
                                >
                                  Pay Month
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Association Payment Details */}
                    <div className="lg:col-span-4 space-y-4">
                      {settings && (
                        <div className="bg-white border border-[#E2DDD3] rounded-2xl p-5 space-y-4">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wider text-[#234D3C]">
                              Pay Externally First
                            </div>
                            <h3 className="font-display font-bold text-base text-[#26332E] mt-1">
                              Association Bank &amp; UPI
                            </h3>
                            <p className="text-xs text-[#52615B] mt-1">
                              Transfer directly via any UPI app or NEFT/IMPS, then submit your UTR reference below for Treasurer receipting.
                            </p>
                          </div>

                          <div className="p-3.5 rounded-xl bg-[#F8F6F1] border border-[#E2DDD3] space-y-1.5">
                            <div className="text-[11px] font-semibold text-[#64736D]">
                              Official UPI ID
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs font-bold text-[#234D3C] break-all">
                                {settings.upiId}
                              </span>
                              <button
                                type="button"
                                onClick={() => copyText('upi', settings.upiId)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-white border border-[#D8D1C5] rounded-lg cursor-pointer shrink-0"
                              >
                                {copiedKey === 'upi' ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-700" />
                                    <span>Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          <div className="p-3.5 rounded-xl bg-[#F8F6F1] border border-[#E2DDD3] space-y-1.5">
                            <div className="text-[11px] font-semibold text-[#64736D]">
                              Bank Account ({settings.bankAccountName})
                            </div>
                            <p className="text-xs text-[#26332E] leading-relaxed">
                              {settings.bankDetails}
                            </p>
                            <button
                              type="button"
                              onClick={() => copyText('bank', settings.bankDetails)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#234D3C] hover:underline cursor-pointer"
                            >
                              <Copy className="w-3 h-3" />
                              <span>{copiedKey === 'bank' ? 'Copied bank details!' : 'Copy bank details'}</span>
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => openPaymentWizard()}
                            className="w-full py-2.5 text-xs font-semibold text-white bg-[#234D3C] hover:bg-[#1B3D2F] rounded-xl cursor-pointer"
                          >
                            I Have Paid — Submit Proof
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Sub-Tab B: Payment Submissions Step Tracker */}
                {maintSub === 'status' && (
                  <div className="space-y-4">
                    {submissions.length === 0 ? (
                      <div className="bg-white border border-[#E2DDD3] rounded-2xl p-8 text-center space-y-3">
                        <p className="text-sm text-[#52615B]">
                          You haven’t submitted any payment proofs for Flat {flatLabel} yet.
                        </p>
                        <button
                          type="button"
                          onClick={() => openPaymentWizard()}
                          className="px-4 py-2 text-xs font-semibold text-white bg-[#234D3C] rounded-xl cursor-pointer"
                        >
                          Submit Payment Proof
                        </button>
                      </div>
                    ) : (
                      submissions.map((sub) => {
                        const activeStep = getSubmissionStepIndex(sub.state);
                        return (
                          <div
                            key={sub.submissionId}
                            className="bg-white border border-[#E2DDD3] rounded-2xl p-5 space-y-4"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <div className="text-xs font-mono font-semibold text-[#234D3C]">
                                  {sub.submissionId} · {sub.paymentMethod} · {sub.bankReference || 'Draft'}
                                </div>
                                <div className="text-xl font-display font-bold text-[#26332E] tabular-nums mt-0.5">
                                  {formatINR(sub.amount)}
                                </div>
                                <div className="text-xs text-[#52615B]">
                                  Payment Date: {sub.paymentDate} · Months:{' '}
                                  {sub.targetMonths.length > 0 ? sub.targetMonths.join(', ') : 'Auto-allocate'}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {sub.evidenceFileId && (
                                  <a
                                    href={buildAuthenticatedAssetUrl(
                                      `/api/payment-submissions/${sub.submissionId}/evidence`
                                    )}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-[#234D3C] bg-[#EBF1EC] rounded-lg"
                                  >
                                    <Paperclip className="w-3.5 h-3.5" />
                                    <span>View Proof</span>
                                  </a>
                                )}
                                {(sub.state === 'DRAFT' || sub.state === 'CLARIFICATION_REQUIRED') && (
                                  <button
                                    type="button"
                                    onClick={() => openPaymentWizard(sub)}
                                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#234D3C] rounded-lg cursor-pointer"
                                  >
                                    {sub.state === 'DRAFT' ? 'Complete & Submit' : 'Reply & Resubmit'}
                                  </button>
                                )}
                                {sub.state === 'APPROVED' && sub.approvedReceiptId && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const rec = receipts.find((r) => r.receiptId === sub.approvedReceiptId);
                                      if (rec) setPreviewReceipt(rec);
                                      else setMaintSub('receipts');
                                    }}
                                    className="inline-flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg cursor-pointer"
                                  >
                                    <Receipt className="w-3.5 h-3.5" />
                                    <span>{sub.approvedReceiptNumber}</span>
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Visual Step Progress */}
                            {sub.state !== 'REJECTED' ? (
                              <div className="grid grid-cols-3 gap-2 pt-2">
                                {SUBMISSION_STEPS.map((label, idx) => {
                                  const done = idx <= activeStep && sub.state !== 'DRAFT';
                                  return (
                                    <div key={label} className="space-y-1.5">
                                      <div
                                        className={`h-1.5 rounded-full ${
                                          done ? 'bg-[#234D3C]' : 'bg-[#E2DDD3]'
                                        }`}
                                      />
                                      <div
                                        className={`text-[11px] font-semibold ${
                                          done ? 'text-[#234D3C]' : 'text-[#64736D]'
                                        }`}
                                      >
                                        {label}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900">
                                <strong>Rejected by Treasurer:</strong> {sub.rejectionReason}
                              </div>
                            )}

                            {sub.state === 'CLARIFICATION_REQUIRED' && sub.clarificationNote && (
                              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                                <strong>Treasurer Clarification Request:</strong> {sub.clarificationNote}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Sub-Tab C: My Receipts */}
                {maintSub === 'receipts' && (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-[#64736D] absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={receiptSearch}
                          onChange={(e) => setReceiptSearch(e.target.value)}
                          placeholder="Search by Receipt No, UTR / Bank Reference, or Month..."
                          className="w-full pl-9 pr-3.5 py-2.5 text-sm bg-white border border-[#D8D1C5] rounded-xl"
                        />
                      </div>
                      <select
                        value={receiptYear}
                        onChange={(e) => setReceiptYear(e.target.value)}
                        className="px-3.5 py-2.5 text-sm bg-white border border-[#D8D1C5] rounded-xl"
                      >
                        <option value="all">All Financial Years</option>
                        <option value="2026">2026</option>
                        <option value="2025">2025</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredReceipts.map((r) => (
                        <div
                          key={r.receiptId}
                          className="bg-white border border-[#E2DDD3] rounded-2xl p-5 flex flex-col justify-between gap-4"
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs font-semibold text-[#234D3C]">
                                {r.receiptNumber}
                              </span>
                              <span
                                className={`text-xs font-semibold ${
                                  r.status === 'Active' ? 'text-emerald-800' : 'text-red-700'
                                }`}
                              >
                                {r.status}
                              </span>
                            </div>
                            <div className="text-2xl font-display font-bold text-[#26332E] tabular-nums">
                              {formatINR(r.amountReceived)}
                            </div>
                            <div className="text-xs text-[#52615B]">
                              Date: {r.receiptDate} · {r.paymentMethod} · Ref:{' '}
                              <span className="font-mono">{r.bankReference}</span>
                            </div>
                            <div className="text-xs text-[#64736D]">
                              Months Covered: {r.maintenancePeriod}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-3 border-t border-[#F0ECE3]">
                            <button
                              type="button"
                              onClick={() => setPreviewReceipt(r)}
                              className="flex-1 py-2 text-xs font-semibold text-[#234D3C] border border-[#D8D1C5] hover:bg-[#F8F6F1] rounded-xl cursor-pointer"
                            >
                              Preview Receipt
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadPdf(r)}
                              className="flex-1 py-2 text-xs font-semibold text-white bg-[#234D3C] hover:bg-[#1B3D2F] rounded-xl cursor-pointer inline-flex items-center justify-center gap-1.5"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download PDF</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sub-Tab D: Flat-wise Statement & CSV */}
                {maintSub === 'statement' && (
                  <div className="bg-white border border-[#E2DDD3] rounded-2xl overflow-hidden">
                    <div className="p-5 border-b border-[#E2DDD3] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h2 className="font-display font-bold text-base text-[#26332E]">
                          Flat {flatLabel} Account Statement
                        </h2>
                        <p className="text-xs text-[#52615B]">
                          Closing Balance:{' '}
                          <strong className="text-[#26332E] tabular-nums">
                            {formatINR(ledgerClosing)}
                          </strong>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          downloadCsv(
                            `Flat-${flatLabel}-Statement.csv`,
                            ['Date', 'Ref No', 'Type', 'Description', 'Debit', 'Credit', 'Balance'],
                            ledger.map((l) => [
                              l.date,
                              l.refNo,
                              l.type,
                              l.description,
                              l.debit,
                              l.credit,
                              l.runningBalance,
                            ])
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#234D3C] border border-[#D8D1C5] hover:bg-[#F8F6F1] rounded-xl cursor-pointer self-start"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>Export Statement CSV</span>
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs sm:text-sm">
                        <thead className="bg-[#F8F6F1] text-xs font-semibold text-[#52615B] border-b border-[#E2DDD3]">
                          <tr>
                            <th className="py-3 px-4">Date</th>
                            <th className="py-3 px-4">Ref No</th>
                            <th className="py-3 px-4">Particulars</th>
                            <th className="py-3 px-4 text-right">Billed</th>
                            <th className="py-3 px-4 text-right">Paid</th>
                            <th className="py-3 px-4 text-right">Balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0ECE3]">
                          {ledger.map((e, idx) => (
                            <tr key={`${e.refNo}-${idx}`}>
                              <td className="py-3 px-4 font-mono text-xs whitespace-nowrap">
                                {e.date}
                              </td>
                              <td className="py-3 px-4 font-mono text-xs whitespace-nowrap">
                                {e.refNo}
                              </td>
                              <td className="py-3 px-4 text-[#26332E]">{e.description}</td>
                              <td className="py-3 px-4 text-right tabular-nums">
                                {e.debit > 0 ? formatINR(e.debit) : '—'}
                              </td>
                              <td className="py-3 px-4 text-right tabular-nums text-emerald-800 font-semibold">
                                {e.credit > 0 ? formatINR(e.credit) : '—'}
                              </td>
                              <td className="py-3 px-4 text-right tabular-nums font-bold">
                                {formatINR(e.runningBalance)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* =========================================================== */}
            {/* TAB 3: COMPLAINTS & TIMELINE                                */}
            {/* =========================================================== */}
            {tab === 'complaints' && (
              <motion.div
                key="tab-complaints"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-display font-bold text-[#26332E]">
                      My Complaints &amp; Maintenance Requests
                    </h1>
                    <p className="text-sm text-[#52615B]">
                      Raise flat or common-area issues, attach photos, and confirm closure once resolved.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNewComplaintOpen(true)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#234D3C] hover:bg-[#1B3D2F] rounded-xl cursor-pointer shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Register Complaint</span>
                  </button>
                </div>

                {complaints.length === 0 ? (
                  <div className="bg-white border border-[#E2DDD3] rounded-2xl p-8 text-center text-sm text-[#52615B]">
                    No complaints logged for Flat {flatLabel}.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {complaints.map((c) => (
                      <div
                        key={c.complaintId}
                        className="bg-white border border-[#E2DDD3] rounded-2xl p-5 space-y-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold text-[#234D3C]">
                              {c.complaintId} · {c.category} · {c.priority}
                            </div>
                            <h3 className="font-display font-bold text-base text-[#26332E] mt-0.5">
                              {c.subject}
                            </h3>
                            <p className="text-xs sm:text-sm text-[#52615B] mt-1">{c.description}</p>
                          </div>
                          <span
                            className={`text-xs font-semibold px-3 py-1 rounded-lg self-start ${
                              c.status === 'Closed' || c.status === 'Resolved'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : c.status === 'Reopened'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : 'bg-[#F8F6F1] text-[#234D3C] border border-[#E2DDD3]'
                            }`}
                          >
                            {c.status}
                          </span>
                        </div>

                        <div className="text-xs text-[#64736D] flex flex-wrap items-center gap-3">
                          <span>Assigned: {c.assignedTo || 'Pending'}</span>
                          {c.resolutionNotes && <span>· Note: {c.resolutionNotes}</span>}
                          {c.photoFileId && (
                            <a
                              href={buildAuthenticatedAssetUrl(`/api/complaints/${c.complaintId}/photo`)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[#234D3C] font-semibold hover:underline"
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                              <span>View Attached Photo</span>
                            </a>
                          )}
                        </div>

                        {/* Activity Timeline */}
                        {c.history && c.history.length > 0 && (
                          <div className="pt-3 border-t border-[#F0ECE3] space-y-2">
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64736D]">
                              Status History
                            </div>
                            <div className="space-y-1.5">
                              {c.history.map((h, i) => (
                                <div key={i} className="text-xs flex items-start gap-2 text-[#52615B]">
                                  <span className="font-semibold text-[#26332E] shrink-0">
                                    {h.status}
                                  </span>
                                  <span>— {h.note}</span>
                                  <span className="text-[11px] text-[#64736D] ml-auto shrink-0">
                                    {h.timestamp.slice(0, 10)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Resident Closure / Reopen Actions */}
                        {(c.status === 'Resolved' || c.status === 'Closed') && (
                          <div className="pt-3 border-t border-[#F0ECE3] flex flex-wrap items-center gap-2">
                            {c.status === 'Resolved' && (
                              <button
                                type="button"
                                onClick={() => handleResidentComplaintAction(c, 'close')}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#234D3C] rounded-lg cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Confirm Closure</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setReopenTarget(c);
                                setReopenNote('');
                              }}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Reopen Issue</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* =========================================================== */}
            {/* TAB 4: ANNOUNCEMENTS, EVENTS & DOCUMENTS                    */}
            {/* =========================================================== */}
            {tab === 'notices' && (
              <motion.div
                key="tab-notices"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-6"
              >
                <div>
                  <h1 className="text-2xl font-display font-bold text-[#26332E]">
                    Announcements, Events &amp; Documents
                  </h1>
                  <p className="text-sm text-[#52615B]">
                    Community circulars, upcoming association events, bye-laws, and emergency contacts.
                  </p>
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {(
                    [
                      ['announcements', `Announcements (${announcements.length})`],
                      ['events', `Community Events (${events.length})`],
                      ['documents', `Society Documents (${documents.length})`],
                    ] as [NoticeSubTab, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setNoticeSub(id)}
                      className={`px-3.5 py-2 text-xs font-semibold rounded-xl border whitespace-nowrap cursor-pointer ${
                        noticeSub === id
                          ? 'bg-[#234D3C] text-white border-[#234D3C]'
                          : 'bg-white text-[#52615B] border-[#E2DDD3]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {noticeSub === 'announcements' && (
                  <div className="space-y-3">
                    {announcements.map((a) => (
                      <div
                        key={a.announcementId}
                        className="bg-white border border-[#E2DDD3] rounded-2xl p-5 space-y-2"
                      >
                        <div className="text-xs font-semibold text-[#234D3C]">
                          {a.priority} · {a.category} · {a.publishDate} · {a.audience}
                        </div>
                        <h3 className="font-display font-bold text-base text-[#26332E]">
                          {a.title}
                        </h3>
                        <p className="text-sm text-[#52615B]">{a.body || a.summary}</p>
                      </div>
                    ))}
                  </div>
                )}

                {noticeSub === 'events' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {events.map((e) => (
                      <div
                        key={e.eventId}
                        className="bg-white border border-[#E2DDD3] rounded-2xl overflow-hidden flex flex-col"
                      >
                        <img
                          src={e.coverImage}
                          alt={e.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-44 object-cover"
                        />
                        <div className="p-5 space-y-2">
                          <div className="text-xs font-semibold text-[#234D3C]">
                            {e.status} · {e.date} · {e.time}
                          </div>
                          <h3 className="font-display font-bold text-base text-[#26332E]">
                            {e.title}
                          </h3>
                          <div className="text-xs text-[#64736D] flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{e.location}</span>
                          </div>
                          <p className="text-xs sm:text-sm text-[#52615B]">{e.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {noticeSub === 'documents' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {documents.map((d) => (
                      <div
                        key={d.docId}
                        className="bg-white border border-[#E2DDD3] rounded-2xl p-5 space-y-2.5"
                      >
                        <div className="text-xs font-semibold text-[#234D3C] flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5" />
                          <span>
                            {d.category} · {d.publishedDate}
                          </span>
                        </div>
                        <h3 className="font-display font-bold text-base text-[#26332E]">
                          {d.title}
                        </h3>
                        <p className="text-xs text-[#52615B]">{d.summary}</p>
                        <p className="text-xs text-[#26332E] bg-[#F8F6F1] p-3 rounded-xl border border-[#E2DDD3] leading-relaxed">
                          {d.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* =========================================================== */}
            {/* TAB 5: PROFILE, PREFERENCES, PASSWORD & PWA INSTALL         */}
            {/* =========================================================== */}
            {tab === 'profile' && (
              <motion.div
                key="tab-profile"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-6"
              >
                <div>
                  <h1 className="text-2xl font-display font-bold text-[#26332E]">
                    My Profile &amp; App Settings
                  </h1>
                  <p className="text-sm text-[#52615B]">
                    Manage your resident identity, notification alerts, private password, and mobile app installation.
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Profile + Flat Access */}
                  <div className="lg:col-span-6 space-y-5">
                    <div className="bg-white border border-[#E2DDD3] rounded-2xl p-5 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-[#234D3C] text-white font-display font-bold text-lg flex items-center justify-center">
                          {user.name
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((p) => p[0])
                            .join('')}
                        </div>
                        <div>
                          <h2 className="font-display font-bold text-lg text-[#26332E]">
                            {user.name}
                          </h2>
                          <div className="text-xs text-[#52615B] font-mono">
                            +91 {user.mobile} · {user.email}
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-[#F0ECE3] space-y-2">
                        <div className="text-xs font-semibold text-[#64736D]">
                          Verified Flat Access
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {user.allowedFlats.map((fa) => (
                            <div
                              key={fa.flatId}
                              className="px-3 py-1.5 rounded-xl bg-[#EBF1EC] text-[#234D3C] text-xs font-semibold flex items-center gap-1.5"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>
                                Flat {fa.flatNumber} ({fa.relationship})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {flatDetails && (
                        <div className="pt-3 border-t border-[#F0ECE3] grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <div className="text-[#64736D]">Floor &amp; Area</div>
                            <div className="font-semibold text-[#26332E] mt-0.5">
                              {flatDetails.floor} · {flatDetails.areaSqFt} sq.ft
                            </div>
                          </div>
                          <div>
                            <div className="text-[#64736D]">Maintenance Category</div>
                            <div className="font-semibold text-[#26332E] mt-0.5">
                              {flatDetails.maintenanceCategory}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Install PWA Card */}
                    <PWAInstallButton variant="card" />

                    {/* Notification Preferences */}
                    <div className="bg-white border border-[#E2DDD3] rounded-2xl p-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <Settings className="w-4 h-4 text-[#234D3C]" />
                        <h3 className="font-display font-bold text-base text-[#26332E]">
                          Notification Preferences
                        </h3>
                      </div>
                      {(
                        [
                          ['billReminders', 'Monthly maintenance bill reminders'],
                          ['paymentUpdates', 'Payment verification & receipt alerts'],
                          ['complaintUpdates', 'Complaint progress & resolution updates'],
                          ['announcements', 'Association circulars & urgent alerts'],
                          ['events', 'Community festival & AGM invitations'],
                        ] as [keyof Omit<NotificationPreferences, 'userId'>, string][]
                      ).map(([key, label]) => (
                        <label
                          key={key}
                          className="flex items-center justify-between py-2 border-b last:border-none border-[#F0ECE3] cursor-pointer text-xs sm:text-sm"
                        >
                          <span className="text-[#26332E]">{label}</span>
                          <input
                            type="checkbox"
                            checked={prefs[key]}
                            onChange={() => handleTogglePref(key)}
                            className="w-4 h-4 accent-[#234D3C] cursor-pointer"
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Change Password */}
                  <div className="lg:col-span-6 space-y-5">
                    <form
                      onSubmit={handleChangePassword}
                      className="bg-white border border-[#E2DDD3] rounded-2xl p-5 space-y-4"
                    >
                      <div className="flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-[#234D3C]" />
                        <h3 className="font-display font-bold text-base text-[#26332E]">
                          Change Private Password
                        </h3>
                      </div>
                      <p className="text-xs text-[#52615B]">
                        Keep your resident account private. Passwords must be at least 8 characters with letters and numbers, and cannot match your mobile or flat number.
                      </p>
                      <div>
                        <label className="block text-xs font-semibold mb-1">Current Password</label>
                        <input
                          type="password"
                          required
                          value={pwdForm.currentPassword}
                          onChange={(e) =>
                            setPwdForm({ ...pwdForm, currentPassword: e.target.value })
                          }
                          className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-xl"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1">New Password</label>
                        <input
                          type="password"
                          required
                          value={pwdForm.newPassword}
                          onChange={(e) =>
                            setPwdForm({ ...pwdForm, newPassword: e.target.value })
                          }
                          className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-xl"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1">
                          Confirm New Password
                        </label>
                        <input
                          type="password"
                          required
                          value={pwdForm.confirmPassword}
                          onChange={(e) =>
                            setPwdForm({ ...pwdForm, confirmPassword: e.target.value })
                          }
                          className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-xl"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={pwdBusy}
                        className="w-full py-2.5 text-xs font-semibold text-white bg-[#234D3C] hover:bg-[#1B3D2F] disabled:opacity-60 rounded-xl cursor-pointer"
                      >
                        {pwdBusy ? 'Updating Password...' : 'Update Password'}
                      </button>
                    </form>

                    <div className="bg-white border border-[#E2DDD3] rounded-2xl p-5 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-display font-bold text-sm text-[#26332E]">
                          Switch Session or Sign Out
                        </div>
                        <div className="text-xs text-[#52615B]">
                          Return to the public website or sign out on shared devices.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={onLogout}
                        className="px-4 py-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl cursor-pointer"
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-[#E2DDD3] px-2 py-1.5 flex items-center justify-around"
        style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
        aria-label="Resident Bottom Navigation"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`relative flex flex-col items-center justify-center px-3 py-1 rounded-xl text-[11px] font-semibold cursor-pointer ${
                active ? 'text-[#234D3C]' : 'text-[#64736D]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="mt-0.5">{item.label}</span>
              {item.badge && item.badge > 0 && (
                <span className="absolute top-0.5 right-2 w-2 h-2 rounded-full bg-[#C5A46D]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* ================================================================= */}
      {/* MODAL: SUBMIT PAYMENT PROOF WIZARD                                */}
      {/* ================================================================= */}
      {paySheetOpen && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white border border-[#E2DDD3] rounded-t-2xl sm:rounded-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-lg text-[#26332E]">
                  {editingDraftSub ? `Update ${editingDraftSub.submissionId}` : `Submit Maintenance Payment · Flat ${flatLabel}`}
                </h3>
                <p className="text-xs text-[#52615B]">
                  Dues update only after Treasurer verifies your transaction reference.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaySheetOpen(false)}
                className="p-1.5 rounded-lg hover:bg-[#F8F6F1] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {unpaidBills.length > 0 && (
              <div>
                <label className="block text-xs font-semibold mb-1.5">
                  Select Months Covered
                </label>
                <div className="flex flex-wrap gap-2">
                  {unpaidBills.map((b) => {
                    const checked = selectedMonths.includes(b.billingMonth);
                    return (
                      <button
                        key={b.billId}
                        type="button"
                        onClick={() => toggleMonthSelection(b.billingMonth)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-xl border cursor-pointer transition-colors ${
                          checked
                            ? 'bg-[#234D3C] text-white border-[#234D3C]'
                            : 'bg-[#F8F6F1] text-[#26332E] border-[#D8D1C5]'
                        }`}
                      >
                        {b.billingMonth} ({formatINR(b.balanceDue)})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Amount Paid (INR) *</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono font-semibold border border-[#D8D1C5] rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Payment Date *</label>
                <input
                  type="date"
                  required
                  value={payForm.paymentDate}
                  onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Method</label>
                <select
                  value={payForm.paymentMethod}
                  onChange={(e) =>
                    setPayForm({
                      ...payForm,
                      paymentMethod: e.target.value as 'UPI' | 'NEFT / IMPS' | 'Cheque' | 'Cash',
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-xl bg-white"
                >
                  <option value="UPI">UPI</option>
                  <option value="NEFT / IMPS">NEFT / IMPS</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  UTR / Reference No {payForm.paymentMethod !== 'Cash' ? '*' : ''}
                </label>
                <input
                  type="text"
                  value={payForm.bankReference}
                  onChange={(e) => setPayForm({ ...payForm, bankReference: e.target.value })}
                  placeholder="e.g. UPI6329100452"
                  className="w-full px-3 py-2 text-sm font-mono border border-[#D8D1C5] rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Payment Screenshot / Receipt (Optional · JPG, PNG, PDF &le; 3 MB)
              </label>
              <label className="flex items-center gap-2 px-3.5 py-2.5 text-xs border border-dashed border-[#234D3C]/40 rounded-xl cursor-pointer hover:bg-[#F8F6F1]">
                <Upload className="w-4 h-4 text-[#234D3C]" />
                <span className="truncate">
                  {payForm.evidenceFileName || 'Choose screenshot or PDF from device'}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={handleEvidencePick}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Remarks</label>
              <input
                type="text"
                value={payForm.remarks}
                onChange={(e) => setPayForm({ ...payForm, remarks: e.target.value })}
                placeholder="Optional note for Treasurer"
                className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-xl"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                disabled={payBusy}
                onClick={() => handleSubmitPayment('draft')}
                className="flex-1 py-2.5 text-xs font-semibold text-[#26332E] border border-[#D8D1C5] hover:bg-[#F8F6F1] rounded-xl cursor-pointer"
              >
                Save Draft
              </button>
              <button
                type="button"
                disabled={payBusy}
                onClick={() => handleSubmitPayment('submit')}
                className="flex-1 py-2.5 text-xs font-semibold text-white bg-[#234D3C] hover:bg-[#1B3D2F] rounded-xl cursor-pointer"
              >
                {payBusy ? 'Submitting...' : 'Submit for Treasurer Verification'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: REGISTER COMPLAINT                                         */}
      {/* ================================================================= */}
      {newComplaintOpen && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={handleComplaintSubmit}
            className="bg-white border border-[#E2DDD3] rounded-t-2xl sm:rounded-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-[#26332E]">
                Register Complaint · Flat {flatLabel}
              </h3>
              <button
                type="button"
                onClick={() => setNewComplaintOpen(false)}
                className="p-1.5 rounded-lg hover:bg-[#F8F6F1] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">Category</label>
              <div className="grid grid-cols-2 gap-2">
                {COMPLAINT_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCmpForm({ ...cmpForm, category: cat })}
                    className={`px-3 py-2 text-xs font-semibold rounded-xl border text-left cursor-pointer ${
                      cmpForm.category === cat
                        ? 'bg-[#234D3C] text-white border-[#234D3C]'
                        : 'bg-[#F8F6F1] text-[#26332E] border-[#E2DDD3]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Priority</label>
              <div className="flex gap-2">
                {(['Normal', 'Urgent'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCmpForm({ ...cmpForm, priority: p })}
                    className={`flex-1 py-2 text-xs font-semibold rounded-xl border cursor-pointer ${
                      cmpForm.priority === p
                        ? p === 'Urgent'
                          ? 'bg-red-700 text-white border-red-700'
                          : 'bg-[#234D3C] text-white border-[#234D3C]'
                        : 'bg-white text-[#52615B] border-[#D8D1C5]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Subject *</label>
              <input
                type="text"
                required
                value={cmpForm.subject}
                onChange={(e) => setCmpForm({ ...cmpForm, subject: e.target.value })}
                placeholder="Brief summary of the issue"
                className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Description *</label>
              <textarea
                rows={3}
                required
                value={cmpForm.description}
                onChange={(e) => setCmpForm({ ...cmpForm, description: e.target.value })}
                placeholder="Location, timing, and helpful details..."
                className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Attach Photo (Optional · JPG/PNG &le; 3 MB)
              </label>
              <label className="flex items-center gap-2 px-3.5 py-2 text-xs border border-dashed border-[#234D3C]/40 rounded-xl cursor-pointer hover:bg-[#F8F6F1]">
                <Upload className="w-4 h-4 text-[#234D3C]" />
                <span className="truncate">{cmpForm.photoFileName || 'Choose photo'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={handleComplaintPhotoPick}
                  className="hidden"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={cmpBusy}
              className="w-full py-2.5 text-xs font-semibold text-white bg-[#234D3C] hover:bg-[#1B3D2F] rounded-xl cursor-pointer"
            >
              {cmpBusy ? 'Submitting...' : 'Submit Complaint Ticket'}
            </button>
          </form>
        </div>
      )}

      {/* ================================================================= */}
      {/* DRAWER: IN-APP NOTIFICATIONS CENTRE                               */}
      {/* ================================================================= */}
      {notifOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex justify-end">
          <div className="bg-white w-full max-w-md h-full flex flex-col border-l border-[#E2DDD3]">
            <div className="px-5 py-4 border-b border-[#E2DDD3] flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-base text-[#26332E]">
                  Notifications Centre
                </h3>
                <p className="text-xs text-[#52615B]">{unreadCount} unread updates</p>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-xs font-semibold text-[#234D3C] hover:underline cursor-pointer"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setNotifOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-[#F8F6F1] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-[#F0ECE3]">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#52615B]">
                  No notifications yet.
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.notificationId}
                    type="button"
                    onClick={() => handleMarkNotifRead(n)}
                    className={`w-full text-left p-4 hover:bg-[#F8F6F1] transition-colors cursor-pointer space-y-1 ${
                      !n.read ? 'bg-[#F8F6F1]/70' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#234D3C] capitalize">
                        {n.type}
                      </span>
                      <span className="text-[11px] text-[#64736D]">
                        {n.createdAt.slice(0, 10)}
                      </span>
                    </div>
                    <div className="font-semibold text-sm text-[#26332E] flex items-center gap-2">
                      {!n.read && <span className="w-2 h-2 rounded-full bg-[#C5A46D] shrink-0" />}
                      <span>{n.title}</span>
                    </div>
                    <p className="text-xs text-[#52615B]">{n.body}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: RECEIPT PREVIEW                                            */}
      {/* ================================================================= */}
      {previewReceipt && settings && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2DDD3] rounded-2xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-[#E2DDD3] pb-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#234D3C]">
                  Official Payment Receipt
                </div>
                <h3 className="font-display font-bold text-lg text-[#26332E] mt-0.5">
                  {settings.societyName}
                </h3>
                <p className="text-[11px] text-[#52615B]">{settings.address}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewReceipt(null)}
                className="p-1.5 rounded-lg hover:bg-[#F8F6F1] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-[#F8F6F1] p-4 rounded-xl border border-[#E2DDD3]">
              <div>
                <div className="text-[#64736D]">Receipt Number</div>
                <div className="font-mono font-bold text-[#234D3C] mt-0.5">
                  {previewReceipt.receiptNumber}
                </div>
              </div>
              <div>
                <div className="text-[#64736D]">Receipt Date</div>
                <div className="font-semibold text-[#26332E] mt-0.5">
                  {previewReceipt.receiptDate}
                </div>
              </div>
              <div>
                <div className="text-[#64736D]">Flat &amp; Resident</div>
                <div className="font-semibold text-[#26332E] mt-0.5">
                  Flat {previewReceipt.flatNumber} · {previewReceipt.ownerName}
                </div>
              </div>
              <div>
                <div className="text-[#64736D]">Method &amp; Ref</div>
                <div className="font-mono text-[#26332E] mt-0.5">
                  {previewReceipt.paymentMethod} · {previewReceipt.bankReference}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-[#52615B]">Month-wise Allocation</div>
              {previewReceipt.allocations.map((a) => (
                <div
                  key={a.billingMonth}
                  className="flex items-center justify-between text-xs py-1.5 border-b border-[#F0ECE3]"
                >
                  <span className="font-mono">{a.billingMonth}</span>
                  <span className="font-semibold tabular-nums">{formatINR(a.allocatedAmount)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 text-sm font-bold text-[#234D3C]">
                <span>Total Amount Received</span>
                <span className="tabular-nums">{formatINR(previewReceipt.amountReceived)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPreviewReceipt(null)}
                className="px-4 py-2 text-xs font-semibold border border-[#D8D1C5] rounded-xl cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleDownloadPdf(previewReceipt)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#234D3C] rounded-xl cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Official PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: MY FLAT DETAILS                                            */}
      {/* ================================================================= */}
      {flatModalOpen && flatDetails && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2DDD3] rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-[#26332E]">
                My Flat Profile · Residence {flatDetails.flatNumber}
              </h3>
              <button
                type="button"
                onClick={() => setFlatModalOpen(false)}
                className="cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs bg-[#F8F6F1] p-4 rounded-xl border border-[#E2DDD3]">
              <div>
                <div className="text-[#64736D]">Owner Name</div>
                <div className="font-semibold text-[#26332E] mt-0.5">{flatDetails.ownerName}</div>
              </div>
              <div>
                <div className="text-[#64736D]">Floor &amp; Area</div>
                <div className="font-semibold text-[#26332E] mt-0.5">
                  {flatDetails.floor} · {flatDetails.areaSqFt} sq.ft
                </div>
              </div>
              <div>
                <div className="text-[#64736D]">Occupancy</div>
                <div className="font-semibold text-[#26332E] mt-0.5">
                  {flatDetails.occupancyStatus}
                </div>
              </div>
              <div>
                <div className="text-[#64736D]">Tariff Category</div>
                <div className="font-semibold text-[#26332E] mt-0.5">
                  {flatDetails.maintenanceCategory}
                </div>
              </div>
            </div>
            {flatDetails.specialDiscountReason && (
              <p className="text-xs text-[#52615B]">
                Concession Note: {flatDetails.specialDiscountReason}
              </p>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setFlatModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#234D3C] rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: ANNOUNCEMENT READER                                        */}
      {/* ================================================================= */}
      {activeAnnouncement && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2DDD3] rounded-2xl max-w-md w-full p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#234D3C]">
                {activeAnnouncement.priority} · {activeAnnouncement.category}
              </span>
              <button
                type="button"
                onClick={() => setActiveAnnouncement(null)}
                className="cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <h3 className="font-display font-bold text-lg text-[#26332E]">
              {activeAnnouncement.title}
            </h3>
            <p className="text-sm text-[#52615B] leading-relaxed">
              {activeAnnouncement.body || activeAnnouncement.summary}
            </p>
            <div className="text-xs text-[#64736D] pt-2">
              Published {activeAnnouncement.publishDate}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL: REOPEN COMPLAINT REASON                                    */}
      {/* ================================================================= */}
      {reopenTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2DDD3] rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-[#26332E]">
                Reopen {reopenTarget.complaintId}
              </h3>
              <button
                type="button"
                onClick={() => setReopenTarget(null)}
                className="cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              rows={3}
              value={reopenNote}
              onChange={(e) => setReopenNote(e.target.value)}
              placeholder="Explain what still needs attention..."
              className="w-full px-3.5 py-2.5 text-sm border border-[#D8D1C5] rounded-xl"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReopenTarget(null)}
                className="px-4 py-2 text-xs border border-[#D8D1C5] rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!reopenNote.trim()}
                onClick={() =>
                  handleResidentComplaintAction(reopenTarget, 'reopen', reopenNote.trim())
                }
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-700 rounded-xl cursor-pointer disabled:opacity-50"
              >
                Reopen Complaint
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
