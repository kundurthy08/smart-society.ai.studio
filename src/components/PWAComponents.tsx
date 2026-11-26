import React, { useEffect, useState } from 'react';
import { Download, Smartphone, WifiOff, X, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}

export const PWAInstallButton: React.FC<{
  variant?: 'compact' | 'card';
  className?: string;
}> = ({ variant = 'compact', className = '' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) return null;

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      {variant === 'card' ? (
        <button
          type="button"
          onClick={handleClick}
          className={`w-full flex items-center justify-between gap-4 p-4 rounded-xl bg-[#EBF1EC] border border-[#AFC5B5] hover:bg-[#DFEAE2] transition-colors text-left cursor-pointer ${className}`}
        >
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-[#234D3C] text-[#F8F6F1] flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </span>
            <div>
              <div className="text-sm font-semibold text-[#26332E]">
                Install Palace-B Resident App
              </div>
              <div className="text-xs text-[#52615B]">
                {isInstallable
                  ? 'Add to your phone Home Screen for one-tap access'
                  : isIOS
                  ? 'Add to iPhone Home Screen via Safari Share'
                  : 'Install as a standalone mobile or desktop web app'}
              </div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#234D3C] text-white text-xs font-semibold shrink-0">
            <Download className="w-3.5 h-3.5" />
            <span>Install</span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#234D3C] bg-[#EBF1EC] hover:bg-[#DCE7DE] border border-[#AFC5B5]/70 transition-colors whitespace-nowrap cursor-pointer ${className}`}
          title="Install Resident App on your device"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>{isInstallable ? 'Install App' : isIOS ? 'Add to Home' : 'Get App'}</span>
        </button>
      )}

      {showGuide && (
        <div className="fixed inset-0 z-50 bg-[#26332E]/55 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2DDD3] rounded-2xl max-w-sm w-full p-6 space-y-4 text-[#26332E]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-[#234D3C] text-white flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-display font-bold text-base">Install Palace-B App</h3>
                  <p className="text-xs text-[#52615B]">Progressive Web App (No App Store Needed)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1.5 rounded-lg text-[#52615B] hover:bg-[#F8F6F1] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="space-y-2.5 text-sm text-[#52615B] leading-relaxed">
                <p>1. Tap the <strong className="text-[#26332E] inline-flex items-center gap-1"><Share className="w-3.5 h-3.5" /> Share</strong> button in your Safari toolbar.</p>
                <p>2. Scroll down and tap <strong className="text-[#26332E]">Add to Home Screen</strong>.</p>
                <p>3. Tap <strong className="text-[#26332E]">Add</strong> — Palace-B opens full-screen like a native app.</p>
              </div>
            ) : (
              <div className="space-y-2.5 text-sm text-[#52615B] leading-relaxed">
                <p>1. Open your browser menu (Chrome / Edge address bar install icon or <strong className="text-[#26332E]">⋮</strong> menu).</p>
                <p>2. Select <strong className="text-[#26332E]">Install app</strong> or <strong className="text-[#26332E]">Add to Home screen</strong>.</p>
                <p className="text-xs text-[#64736D]">
                  Note: In embedded preview frames, open the direct app URL in a standalone browser tab to trigger the native browser install prompt.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full py-2.5 text-sm font-semibold text-white bg-[#234D3C] hover:bg-[#1B3D2F] rounded-xl cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return isOnline;
}

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 sm:bottom-5 left-4 z-50 flex items-center gap-2 rounded-xl bg-[#26332E] border border-[#C5A46D]/60 px-3.5 py-2 text-xs font-medium text-[#F8F6F1] shadow-lg">
      <WifiOff className="w-3.5 h-3.5 text-[#C5A46D]" />
      <span>Offline — Reconnect to verify live dues &amp; submit payments.</span>
    </div>
  );
};
