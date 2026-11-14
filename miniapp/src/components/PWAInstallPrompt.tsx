import React, { useState, useEffect } from 'react';
import { Download, X, Share, PlusSquare, CheckCircle2 } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

// ── Environment Detectors ──────────────────────────────────────
const isTelegramMiniApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg && (Boolean(tg.initData) || (tg.platform && tg.platform !== 'unknown' && tg.platform !== 'weba'))) {
      return true;
    }
    const ua = window.navigator.userAgent.toLowerCase();
    if (ua.includes('telegram') || ua.includes('tgwebapp')) {
      return true;
    }
  } catch {}
  return false;
};

const isPWAInstalledOrStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
    const isNavStandalone = (window.navigator as any).standalone === true;
    const isUrlPwa = window.location.search.includes('source=pwa') || window.location.search.includes('pwa=true');
    const isLocalInstalled = localStorage.getItem('hdase_pwa_installed') === 'true';
    return isStandaloneMedia || isNavStandalone || isUrlPwa || isLocalInstalled;
  } catch {}
  return false;
};

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [shouldShow, setShouldShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  useEffect(() => {
    // 1. If inside Telegram Mini App -> NEVER show install prompt
    if (isTelegramMiniApp()) {
      return;
    }

    // 2. If already running inside installed PWA / standalone -> NEVER show install prompt
    if (isPWAInstalledOrStandalone()) {
      return;
    }

    // 3. Detect iOS Safari
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
    setIsIOS(isIosDevice);

    // 4. Check if user dismissed recently (24 hours)
    const dismissedAt = localStorage.getItem('hdase_pwa_dismissed_at');
    const isRecentlyDismissed = dismissedAt && Date.now() - Number(dismissedAt) < 24 * 60 * 60 * 1000;

    // 5. Capture native 'beforeinstallprompt' (Chrome / Android / Edge)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (!isRecentlyDismissed) {
        setShouldShow(true);
      }
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 6. Listen for successful install
    const handleAppInstalled = () => {
      setJustInstalled(true);
      setShouldShow(false);
      setShowIOSModal(false);
      setDeferredPrompt(null);
      localStorage.setItem('hdase_pwa_installed', 'true');
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    // 7. For browsers where beforeinstallprompt doesn't fire immediately (e.g. iOS Safari)
    // Show banner only if in external browser and not dismissed
    const timer = setTimeout(() => {
      if (!isRecentlyDismissed && !isPWAInstalledOrStandalone() && !isTelegramMiniApp()) {
        setShouldShow(true);
      }
    }, 1500);

    // Global trigger event (e.g. from Profile menu)
    const handleTriggerInstall = () => {
      handleInstallClick();
    };
    window.addEventListener('hdase-trigger-pwa-install', handleTriggerInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('hdase-trigger-pwa-install', handleTriggerInstall);
      clearTimeout(timer);
    };
  }, []);

  // One-click install action
  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        // Direct native browser install dialog without intermediate options
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setJustInstalled(true);
          setShouldShow(false);
          localStorage.setItem('hdase_pwa_installed', 'true');
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.error('Install prompt error:', err);
      }
    } else if (isIOS) {
      setShowIOSModal(true);
    } else {
      setShowIOSModal(true);
    }
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShouldShow(false);
    localStorage.setItem('hdase_pwa_dismissed_at', Date.now().toString());
  };

  // If inside Telegram, or already installed as standalone PWA -> render nothing
  if (isTelegramMiniApp() || isPWAInstalledOrStandalone()) {
    return null;
  }

  return (
    <>
      {/* ─── SUCCESS TOAST UPON INSTALLATION ─── */}
      {justInstalled && (
        <div className="fixed top-3 left-3 right-3 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-emerald-600 text-white p-3.5 rounded-2xl shadow-2xl flex items-center space-x-3 border border-emerald-400">
            <CheckCircle2 size={24} className="shrink-0 text-white" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black">መተግበሪያው በተሳካ ሁኔታ ተጭኗል! 🎉</p>
              <p className="text-[10px] text-emerald-100">Hdase Bingo is installed. Open it from your Home Screen!</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── ONLY 1 SINGLE CLEAN INSTALL BANNER (Displays only in browser when not installed) ─── */}
      {shouldShow && !justInstalled && (
        <div className="sticky top-0 left-0 right-0 z-40 px-3 pt-2 pb-1 bg-slate-50 dark:bg-slate-900 animate-in fade-in slide-in-from-top-3 duration-300">
          <div
            onClick={handleInstallClick}
            className="cursor-pointer bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950 text-white rounded-2xl p-2.5 shadow-lg border border-amber-500/40 flex items-center justify-between gap-2.5 active:scale-[0.99] transition-transform"
          >
            {/* App Icon + App Details */}
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="relative shrink-0">
                <img
                  src="/app-icon.png"
                  alt="Hdase Bingo App Icon"
                  className="w-11 h-11 rounded-xl object-contain bg-white p-0.5 border border-amber-400/80 shadow-md"
                />
                <span className="absolute -bottom-1 -right-1 bg-amber-500 text-slate-950 font-black text-[7.5px] px-1 rounded-full border border-white">
                  PWA
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className="font-black text-xs text-white truncate">HDASE BINGO</span>
                  <span className="bg-amber-400/20 text-amber-300 text-[8.5px] font-black px-1.5 py-0.2 rounded-full border border-amber-400/30">
                    APP
                  </span>
                </div>
                <p className="text-[10px] text-amber-200/90 font-bold truncate">
                  ወደ ስልክዎ ይጫኑ • Install to Screen
                </p>
                <p className="text-[9px] text-slate-400 truncate">
                  ፈጣን አጨዋወት • Full Screen & Faster
                </p>
              </div>
            </div>

            {/* Direct Install Button */}
            <div className="flex items-center space-x-1.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleInstallClick();
                }}
                className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 active:scale-95 text-slate-950 px-3.5 py-2 rounded-xl font-black text-xs shadow-md shadow-amber-500/25 flex items-center space-x-1.5 transition-all"
              >
                <Download size={13} strokeWidth={3} />
                <span>ጫን / Install</span>
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="w-7 h-7 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center active:scale-95 transition-all"
                title="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── SIMPLE 1-2-3 SHEET ONLY FOR iOS SAFARI (Apple requires manual tap) ─── */}
      {showIOSModal && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 w-full max-w-sm shadow-2xl border border-slate-100 dark:border-slate-800 animate-in slide-in-from-bottom-6 duration-200 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-3">
                <img
                  src="/app-icon.png"
                  alt="App Icon"
                  className="w-11 h-11 rounded-2xl object-contain bg-white p-0.5 border border-amber-300 shadow-md"
                />
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">Hdase Bingo ጫን</h3>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">Add to Home Screen</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            {/* Instruction Steps */}
            <div className="space-y-3 py-1">
              {isIOS ? (
                <>
                  <div className="flex items-start space-x-3 bg-amber-50/70 dark:bg-slate-800/60 p-2.5 rounded-2xl border border-amber-200/60 dark:border-slate-700">
                    <div className="w-7 h-7 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-sm">
                      1
                    </div>
                    <div className="text-xs">
                      <p className="font-black text-slate-800 dark:text-slate-200">
                        በ Safari ታችኛ ክፍል ያለውን <Share size={13} className="inline text-blue-500 mx-0.5" /> <span className="text-blue-600 font-bold">Share</span> ቁልፍ ይጫኑ
                      </p>
                      <p className="text-[10px] text-slate-400">Tap the Share icon at the bottom of Safari</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 bg-amber-50/70 dark:bg-slate-800/60 p-2.5 rounded-2xl border border-amber-200/60 dark:border-slate-700">
                    <div className="w-7 h-7 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-sm">
                      2
                    </div>
                    <div className="text-xs">
                      <p className="font-black text-slate-800 dark:text-slate-200">
                        ወደ ታች ዝቅ ብለው <PlusSquare size={13} className="inline text-slate-700 dark:text-slate-300 mx-0.5" /> <span className="font-black">"Add to Home Screen"</span> (ወደ መነሻ ገጽ አክል) ይምረጡ
                      </p>
                      <p className="text-[10px] text-slate-400">Scroll down and tap "Add to Home Screen"</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 bg-amber-50/70 dark:bg-slate-800/60 p-2.5 rounded-2xl border border-amber-200/60 dark:border-slate-700">
                    <div className="w-7 h-7 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-sm">
                      3
                    </div>
                    <div className="text-xs">
                      <p className="font-black text-slate-800 dark:text-slate-200">
                        በላይኛው ቀኝ ጥግ ላይ <span className="text-blue-600 font-black">"Add"</span> የሚለውን ይጫኑ
                      </p>
                      <p className="text-[10px] text-slate-400">Tap "Add" in the top right corner</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start space-x-3 bg-amber-50/70 dark:bg-slate-800/60 p-2.5 rounded-2xl border border-amber-200/60 dark:border-slate-700">
                    <div className="w-7 h-7 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-sm">
                      1
                    </div>
                    <div className="text-xs">
                      <p className="font-black text-slate-800 dark:text-slate-200">
                        የብራውዘርዎን ሜኑ <span className="font-bold">⋮ (Menu)</span> ይክፈቱ
                      </p>
                      <p className="text-[10px] text-slate-400">Open your browser menu (top-right ⋮)</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 bg-amber-50/70 dark:bg-slate-800/60 p-2.5 rounded-2xl border border-amber-200/60 dark:border-slate-700">
                    <div className="w-7 h-7 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-sm">
                      2
                    </div>
                    <div className="text-xs">
                      <p className="font-black text-slate-800 dark:text-slate-200">
                        <Download size={13} className="inline text-amber-600 mx-0.5" /> <span className="font-black">"Install App"</span> ወይም <span className="font-black">"Add to Home Screen"</span> ይጫኑ
                      </p>
                      <p className="text-[10px] text-slate-400">Tap "Install app" or "Add to Home screen"</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs rounded-xl shadow-md active:scale-95 transition-all text-center"
            >
              ተረድቻለሁ / Got it!
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// Global trigger function
export function triggerPWAInstall() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('hdase-trigger-pwa-install'));
  }
}
