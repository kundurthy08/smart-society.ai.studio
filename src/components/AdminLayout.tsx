import React, { useState } from 'react';
import {
  LayoutDashboard,
  Building2,
  FileSpreadsheet,
  CreditCard,
  Receipt,
  BarChart3,
  ShieldCheck,
  Globe,
  Eye,
  LogOut,
  Menu,
  X,
  FileEdit,
  Users,
  Images,
  Megaphone,
  MessageSquareWarning,
  FileCheck2,
  UserCheck,
} from 'lucide-react';
import type { UserSession } from '../types/society.ts';

export type AdminTab =
  | 'website'
  | 'committee'
  | 'gallery'
  | 'notices'
  | 'complaints'
  | 'dashboard'
  | 'flats'
  | 'maintenance'
  | 'approvals'
  | 'payments'
  | 'receipts'
  | 'residents'
  | 'reports'
  | 'audit';

interface AdminLayoutProps {
  user: UserSession;
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  onGoHome: () => void;
  onPreviewDraft: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}

const GROUP_A_ITEMS: {
  id: AdminTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'website', label: 'Website Content', icon: FileEdit },
  { id: 'committee', label: 'Committee Members', icon: Users },
  { id: 'gallery', label: 'Photo Gallery', icon: Images },
  { id: 'notices', label: 'Notices & Events', icon: Megaphone },
  { id: 'complaints', label: 'Complaints Desk', icon: MessageSquareWarning },
];

const GROUP_B_ITEMS: {
  id: AdminTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}[] = [
  { id: 'dashboard', label: 'Financial Dashboard', icon: LayoutDashboard },
  { id: 'flats', label: 'Flat Register', icon: Building2 },
  { id: 'maintenance', label: 'Maintenance Billing', icon: FileSpreadsheet },
  { id: 'approvals', label: 'Treasurer Approvals', icon: FileCheck2, adminOnly: true },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'receipts', label: 'Receipts & Ledger', icon: Receipt },
  { id: 'residents', label: 'Resident Access', icon: UserCheck, adminOnly: true },
  { id: 'reports', label: 'Financial Reports', icon: BarChart3 },
  { id: 'audit', label: 'Audit & GAS Code', icon: ShieldCheck, adminOnly: true },
];

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  user,
  activeTab,
  onSelectTab,
  onGoHome,
  onPreviewDraft,
  onLogout,
  children,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isAdmin = user.role === 'president' || user.role === 'treasurer';

  const visibleGroupB = GROUP_B_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const allItems = [...GROUP_A_ITEMS, ...visibleGroupB];
  const activeLabel = allItems.find((i) => i.id === activeTab)?.label ?? 'Financial Dashboard';

  const renderNavItem = (item: {
    id: AdminTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }) => {
    const Icon = item.icon;
    const active = activeTab === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => {
          onSelectTab(item.id);
          setSidebarOpen(false);
        }}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
          active
            ? 'bg-[#EBF1EC] text-[#234D3C] font-semibold'
            : 'text-[#52615B] hover:bg-[#F8F6F1] hover:text-[#26332E]'
        }`}
      >
        <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>{item.label}</span>
      </button>
    );
  };

  const SidebarContent = (
    <div className="flex flex-col h-full justify-between p-4 overflow-y-auto">
      <div>
        <div className="flex items-center gap-2.5 px-2 pb-4 mb-4 border-b border-[#E2DDD3]">
          <span className="w-9 h-9 rounded-lg bg-[#234D3C] text-white flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <div className="font-display font-bold text-sm tracking-tight text-[#26332E] truncate">
              HAPPY HOMES PALACE-B
            </div>
            <div className="text-[11px] text-[#52615B] truncate">Committee Administration</div>
          </div>
        </div>

        <nav className="space-y-5" aria-label="Committee Administration Sidebar">
          <div>
            <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#64736D]">
              Community Website
            </div>
            <div className="space-y-0.5">{GROUP_A_ITEMS.map(renderNavItem)}</div>
          </div>

          <div>
            <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#64736D]">
              Maintenance &amp; Finance
            </div>
            <div className="space-y-0.5">{visibleGroupB.map(renderNavItem)}</div>
          </div>
        </nav>
      </div>

      <div className="pt-4 mt-4 border-t border-[#E2DDD3] space-y-1">
        <button
          type="button"
          onClick={onPreviewDraft}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[#234D3C] hover:bg-[#EBF1EC] transition-colors cursor-pointer whitespace-nowrap"
        >
          <Eye className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Preview Draft Site</span>
        </button>
        <button
          type="button"
          onClick={onGoHome}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[#52615B] hover:bg-[#F8F6F1] hover:text-[#26332E] transition-colors cursor-pointer whitespace-nowrap"
        >
          <Globe className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Public Website</span>
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-red-700 hover:bg-red-50 transition-colors cursor-pointer whitespace-nowrap"
        >
          <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F6F1] flex text-[#26332E]">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 bg-white border-r border-[#E2DDD3] sticky top-0 h-screen no-print">
        {SidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-[#26332E]/40"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative w-64 max-w-[82vw] bg-white h-full border-r border-[#E2DDD3] z-10">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-3 p-1.5 rounded-lg text-[#52615B] hover:bg-[#F8F6F1] cursor-pointer"
              aria-label="Close sidebar"
            >
              <X className="w-4 h-4" />
            </button>
            {SidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-[#E2DDD3] px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-[#D8D1C5] text-[#26332E] hover:bg-[#F8F6F1] cursor-pointer"
              aria-label="Open menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-[#64736D] hidden sm:inline">Committee Admin</span>
              <span className="text-[#D8D1C5] hidden sm:inline">/</span>
              <span className="font-display font-semibold text-[#26332E] truncate">
                {activeLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs sm:text-sm shrink-0">
            <span className="hidden md:inline text-[#52615B]">
              Pilot Sample Dataset (Flats 101–110)
            </span>
            <span className="hidden md:inline text-[#D8D1C5]">·</span>
            <div className="text-right">
              <div className="font-semibold text-[#26332E] leading-tight whitespace-nowrap">
                {user.name}
              </div>
              <div className="text-xs text-[#52615B] leading-tight whitespace-nowrap">
                {user.roleLabel}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
