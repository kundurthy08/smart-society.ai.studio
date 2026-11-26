import { useEffect, useState } from 'react';
import { apiFetch, setAuthToken } from './lib/api.ts';
import type { UserSession } from './types/society.ts';
import { PublicWebsite } from './components/PublicWebsite.tsx';
import { ResidentApp } from './components/ResidentApp.tsx';
import { LoginModal } from './components/LoginModal.tsx';
import { AdminLayout, type AdminTab } from './components/AdminLayout.tsx';
import {
  WebsiteContentManager,
  CommitteeManagerView,
  GalleryManagerView,
  NoticesEventsComplaintsView,
} from './components/CommitteeContentViews.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { FlatsView } from './components/FlatsView.tsx';
import { MaintenanceView } from './components/MaintenanceView.tsx';
import { TreasurerApprovalsView } from './components/TreasurerApprovalsView.tsx';
import { PaymentsView } from './components/PaymentsView.tsx';
import { ReceiptsView } from './components/ReceiptsView.tsx';
import { ResidentAccessView } from './components/ResidentAccessView.tsx';
import { ReportsView } from './components/ReportsView.tsx';
import { AuditAndGasView } from './components/AuditAndGasView.tsx';
import { OfflineIndicator } from './components/PWAComponents.tsx';

export default function App() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [viewMode, setViewMode] = useState<'public' | 'preview_draft' | 'portal'>('public');
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [loginOpen, setLoginOpen] = useState(false);

  const [preselectFlatId, setPreselectFlatId] = useState<string | undefined>(undefined);
  const [focusReceiptId, setFocusReceiptId] = useState<string | null>(null);
  const [focusLedgerFlatId, setFocusLedgerFlatId] = useState<string | null>(null);

  useEffect(() => {
    // Re-hydrate authenticated session via HttpOnly cookie if active
    apiFetch<{ user: UserSession }>('/api/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => {
        setAuthToken(null);
      });
  }, []);

  const handleLoginSuccess = (session: UserSession) => {
    setUser(session);
    setLoginOpen(false);
    setViewMode('portal');
    setActiveTab(session.role === 'treasurer' ? 'approvals' : 'dashboard');
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors during sign-out
    }
    setAuthToken(null);
    setUser(null);
    setViewMode('public');
  };

  const handleDashboardNavigate = (tab: AdminTab, flatId?: string) => {
    if (flatId && tab === 'payments') {
      setPreselectFlatId(flatId);
    }
    setActiveTab(tab);
  };

  return (
    <>
      <OfflineIndicator />
      {viewMode === 'public' || viewMode === 'preview_draft' || !user ? (
        <>
          <PublicWebsite
            user={user}
            previewDraftMode={viewMode === 'preview_draft'}
            onExitPreview={() => setViewMode('portal')}
            onOpenLogin={() => setLoginOpen(true)}
            onEnterPortal={() => {
              if (!user) {
                setLoginOpen(true);
              } else {
                setViewMode('portal');
              }
            }}
          />
          <LoginModal
            open={loginOpen}
            onClose={() => setLoginOpen(false)}
            onSuccess={handleLoginSuccess}
          />
        </>
      ) : user.role === 'resident' ? (
        // Area B — Smart Society 4.0 Mobile-First Resident App (strictly scoped via FlatAccess)
        <ResidentApp
          user={user}
          onUserUpdate={setUser}
          onGoHome={() => setViewMode('public')}
          onLogout={handleLogout}
        />
      ) : (
        // Area C — Committee Administration (Group A Website Content + Group B Finance, Approvals & Access)
        <AdminLayout
          user={user}
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setFocusReceiptId(null);
            setFocusLedgerFlatId(null);
            setActiveTab(tab);
          }}
          onGoHome={() => setViewMode('public')}
          onPreviewDraft={() => setViewMode('preview_draft')}
          onLogout={handleLogout}
        >
          {/* Group A: Website Content Management */}
          {activeTab === 'website' && (
            <WebsiteContentManager onPreviewDraft={() => setViewMode('preview_draft')} />
          )}
          {activeTab === 'committee' && <CommitteeManagerView />}
          {activeTab === 'gallery' && <GalleryManagerView />}
          {activeTab === 'notices' && <NoticesEventsComplaintsView initialSection="notices" />}
          {activeTab === 'complaints' && <NoticesEventsComplaintsView initialSection="complaints" />}

          {/* Group B: Maintenance, Finance, Approvals & Resident Access */}
          {activeTab === 'dashboard' && (
            <DashboardView user={user} onNavigate={handleDashboardNavigate} />
          )}
          {activeTab === 'flats' && (
            <FlatsView
              user={user}
              onViewLedger={(flatId) => {
                setFocusLedgerFlatId(flatId);
                setFocusReceiptId(null);
                setActiveTab('receipts');
              }}
            />
          )}
          {activeTab === 'maintenance' && <MaintenanceView user={user} />}
          {activeTab === 'approvals' && (
            <TreasurerApprovalsView
              user={user}
              onOpenReceipt={(receiptId) => {
                setFocusReceiptId(receiptId);
                setFocusLedgerFlatId(null);
                setActiveTab('receipts');
              }}
            />
          )}
          {activeTab === 'payments' && (
            <PaymentsView
              user={user}
              preselectFlatId={preselectFlatId}
              onOpenReceipt={(receiptId) => {
                setFocusReceiptId(receiptId);
                setFocusLedgerFlatId(null);
                setActiveTab('receipts');
              }}
            />
          )}
          {activeTab === 'receipts' && (
            <ReceiptsView
              user={user}
              focusReceiptId={focusReceiptId}
              focusLedgerFlatId={focusLedgerFlatId}
              onClearFocus={() => {
                setFocusReceiptId(null);
                setFocusLedgerFlatId(null);
              }}
            />
          )}
          {activeTab === 'residents' && <ResidentAccessView />}
          {activeTab === 'reports' && <ReportsView user={user} />}
          {activeTab === 'audit' && <AuditAndGasView />}
        </AdminLayout>
      )}
    </>
  );
}
