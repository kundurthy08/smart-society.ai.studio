import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Building2,
  KeyRound,
  Lock,
  Phone,
  Shield,
  Sparkles,
  UserCheck,
  X,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';
import { apiFetch, setAuthToken, type AuthResponse } from '../lib/api.ts';
import { PWAInstallButton } from './PWAComponents.tsx';
import type { UserSession } from '../types/society.ts';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (user: UserSession) => void;
}

type AuthMode = 'login' | 'activate' | 'recover';

const DEMO_ACCOUNTS = [
  {
    label: 'Resident · Flat 101 (All Paid)',
    identifier: '9845011201',
    pass: 'Resident@101',
    badge: 'Mobile Login',
  },
  {
    label: 'Resident · Flat 102 (₹1,200 Due)',
    identifier: '9845011202',
    pass: 'Resident@102',
    badge: 'Mobile Login',
  },
  {
    label: 'Treasurer / Accountant',
    identifier: 'treasurer@smartsociety.demo',
    pass: 'Treasurer@2026',
    badge: 'Committee',
  },
  {
    label: 'President / Secretary',
    identifier: 'secretary@smartsociety.demo',
    pass: 'Admin@2026',
    badge: 'Committee',
  },
];

export const LoginModal: React.FC<LoginModalProps> = ({ open, onClose, onSuccess }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [identifier, setIdentifier] = useState('9845011202');
  const [password, setPassword] = useState('Resident@102');

  // Activation / Recovery states
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [email, setEmail] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!open) return null;

  const performLogin = async (loginId: string, loginPass: string) => {
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const data = await apiFetch<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: loginId, password: loginPass }),
      });
      setAuthToken(data.token);
      onSuccess(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performLogin(identifier, password);
  };

  const handleActivateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const data = await apiFetch<AuthResponse>('/api/auth/activate', {
        method: 'POST',
        body: JSON.stringify({
          mobile,
          activationCode: code,
          newPassword,
          email,
        }),
      });
      setAuthToken(data.token);
      onSuccess(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account activation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/recover', {
        method: 'POST',
        body: JSON.stringify({
          mobile,
          recoveryCode: code,
          newPassword,
        }),
      });
      setSuccessMsg(res.message);
      setIdentifier(mobile);
      setPassword(newPassword);
      setMode('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password recovery failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#26332E]/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.22 }}
        className="bg-white border border-[#E2DDD3] rounded-2xl max-w-md w-full p-6 sm:p-7 space-y-5 text-[#26332E] shadow-2xl my-auto"
      >
        {/* App Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#234D3C] text-[#F8F6F1] flex items-center justify-center shrink-0 shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-display font-bold text-[#26332E] leading-tight">
                HAPPY HOMES PALACE-B
              </h2>
              <p className="text-xs text-[#52615B] mt-0.5">
                Your Home. Your Community. Your Services.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#52615B] hover:bg-[#F8F6F1] cursor-pointer"
            aria-label="Close sign in dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switch Tabs */}
        {mode === 'login' ? (
          <div className="flex items-center justify-between gap-2 p-1 bg-[#F8F6F1] rounded-xl border border-[#E2DDD3]">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode('login');
              }}
              className="flex-1 py-2 text-xs font-semibold rounded-lg bg-white text-[#234D3C] shadow-xs cursor-pointer"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setSuccessMsg(null);
                setMode('activate');
              }}
              className="flex-1 py-2 text-xs font-semibold rounded-lg text-[#52615B] hover:text-[#234D3C] cursor-pointer"
            >
              Activate Account
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setSuccessMsg(null);
              setMode('login');
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#234D3C] hover:underline cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Sign In</span>
          </button>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 leading-relaxed">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        <AnimatePresence mode="wait">
          {mode === 'login' && (
            <motion.form
              key="login-form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onSubmit={handleLoginSubmit}
              className="space-y-3.5"
            >
              <div>
                <label className="block text-xs font-semibold text-[#26332E] mb-1">
                  Mobile Number or Committee Email
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-[#64736D] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="e.g. 9845011202 or secretary@smartsociety.demo"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm border border-[#D8D1C5] rounded-xl focus:outline-none focus:border-[#234D3C]"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-[#26332E]">
                    Private Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setSuccessMsg(null);
                      setMode('recover');
                    }}
                    className="text-[11px] font-semibold text-[#234D3C] hover:underline cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#64736D] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm border border-[#D8D1C5] rounded-xl focus:outline-none focus:border-[#234D3C]"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 text-sm font-semibold text-white bg-[#234D3C] hover:bg-[#1B3D2F] disabled:opacity-60 rounded-xl transition-colors cursor-pointer"
              >
                {loading ? 'Verifying...' : 'Sign In to My Community'}
              </button>
            </motion.form>
          )}

          {mode === 'activate' && (
            <motion.form
              key="activate-form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onSubmit={handleActivateSubmit}
              className="space-y-3"
            >
              <div className="p-3 rounded-xl bg-[#F8F6F1] border border-[#E2DDD3] text-xs text-[#52615B]">
                Enter your registered 10-digit mobile number and the single-use activation code provided by the Association Secretary to set your private password.
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Registered Mobile Number *</label>
                <input
                  type="tel"
                  required
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="10-digit mobile number"
                  className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Activation Code *</label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. A4F9C21B"
                    className="w-full px-3.5 py-2 text-sm font-mono uppercase border border-[#D8D1C5] rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Email (Optional)</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.in"
                    className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-xl"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Create Private Password *
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 chars, letters + number (not flat/mobile)"
                  className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-xl"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 text-sm font-semibold text-white bg-[#234D3C] hover:bg-[#1B3D2F] disabled:opacity-60 rounded-xl cursor-pointer inline-flex items-center justify-center gap-2"
              >
                <UserCheck className="w-4 h-4" />
                <span>{loading ? 'Activating...' : 'Activate Resident Account'}</span>
              </button>
            </motion.form>
          )}

          {mode === 'recover' && (
            <motion.form
              key="recover-form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onSubmit={handleRecoverSubmit}
              className="space-y-3"
            >
              <div className="p-3 rounded-xl bg-[#F8F6F1] border border-[#E2DDD3] text-xs text-[#52615B]">
                Password recovery uses a single-use reset code issued by your Association Secretary or President — no paid SMS OTP required.
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Registered Mobile Number *</label>
                <input
                  type="tel"
                  required
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="10-digit mobile number"
                  className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Committee Recovery Code *</label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="8-character code"
                  className="w-full px-3.5 py-2 text-sm font-mono uppercase border border-[#D8D1C5] rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">New Private Password *</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 chars, letters + number"
                  className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-xl"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 text-sm font-semibold text-white bg-[#234D3C] hover:bg-[#1B3D2F] disabled:opacity-60 rounded-xl cursor-pointer inline-flex items-center justify-center gap-2"
              >
                <KeyRound className="w-4 h-4" />
                <span>{loading ? 'Updating Password...' : 'Reset Password'}</span>
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Pilot Quick-Login Demo Section */}
        {mode === 'login' && (
          <div className="pt-4 border-t border-[#E2DDD3] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[#52615B]">
                <Shield className="w-3.5 h-3.5 text-[#234D3C]" />
                <span>Pilot Accounts (One-Tap Demo)</span>
              </div>
              <PWAInstallButton variant="compact" />
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.identifier}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setIdentifier(acc.identifier);
                    setPassword(acc.pass);
                    performLogin(acc.identifier, acc.pass);
                  }}
                  className="flex items-center justify-between px-3 py-2 text-left text-xs border border-[#E2DDD3] hover:border-[#234D3C]/50 hover:bg-[#F8F6F1] rounded-xl transition-colors cursor-pointer"
                >
                  <span className="font-semibold text-[#26332E]">{acc.label}</span>
                  <span className="text-[#52615B] font-mono text-[11px]">{acc.identifier}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#64736D]">
              <Sparkles className="w-3 h-3 text-[#C5A46D] shrink-0" />
              <span>
                Strict flat isolation: Flat 101 &amp; Flat 102 sessions cannot read each other’s data.
              </span>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
