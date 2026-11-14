import React, { useState, useEffect } from 'react';
import { Download, X, Share, PlusSquare, Smartphone, CheckCircle2, Sparkles, ExternalLink } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // 1. Check if running in standalone mode (already installed PWA)
    const checkStandalone = () => {
      const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
      const isNavStandalone = (window.navigator as any).standalone === true;
      const isUrlPwa = window.location.search.includes('source=pwa') || window.location.search.includes('pwa=true');
      return isStandaloneMedia || isNavStandalone || isUrlPwa;
    };

    const standalone = checkStandalone();
    setIsStandalone(standalone);

    // 2. Check if iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    setIsIOS(isIosDevice);

    // If already installed, do not show install prompt
    if (standalone) return;

    // Check if dismissed recently (within 24 hours)
    const dismissedAt = localStorage.getItem('hdase_pwa_dismissed_at');
    const isRecentlyDismissed = dismissedAt && Date.now() - Number(dismissedAt) < 24 * 60 * 60 * 1000;

    // 3. Listen for Chrome / Android / Edge 'beforeinstallprompt'
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (!isRecentlyDismissed) {
        setShowBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 4. Listen for 'appinstalled'
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowBanner(false);
      setShowIOSModal(false);
      setDeferredPrompt(null);
      localStorage.setItem('hdase_pwa_installed', 'true');
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    // 5. For iOS or other browsers where beforeinstallprompt doesn't fire
    // Show banner on web browsers after a short delay if not standalone and not recently dismissed
    const timer = setTimeout(() => {
      if (!standalone && !isRecentlyDismissed) {
        setShowBanner(true);
      }
    }, 2000);

    // Global event listener so any button in the app can trigger the install prompt
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

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
          setShowBanner(false);
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.error('PWA install error:', err);
      }
    } else if (isIOS) {
      setShowIOSModal(true);
    } else {
      // General fallback instructions for Android Firefox / Desktop without native prompt
      setShowIOSModal(true);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('hdase_pwa_dismissed_at', Date.now().toString());
  };

  // Do not render anything if already running in standalone PWA mode
  if (isStandalone) return null;

  return (
    <>
      {/* ─── SUCCESS TOAST ─── */}
      {isInstalled && (
        <div className="fixed top-3 left-3 right-3 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-emerald-600 text-white p-3.5 rounded-2xl shadow-2xl flex items-center space-x-3 border border-emerald-400">
            <CheckCircle2 size={24} className="shrink-0 text-white" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black">መተግበሪያው በተሳካ ሁኔታ ተጭኗል! 🎉</p>
              <p className="text-[10px] text-emerald-100">Hdase Bingo is installed. Open it directly from your Home Screen!</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── SMART PWA TOP / FLOATING BANNER ─── */}
      {showBanner && !isInstalled && (
        <div className="fixed top-2 left-2 right-2 z-40 animate-in fade-in slide-in-from-top-3 duration-300">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950 text-white rounded-2xl p-3 shadow-[0_10px_30px_rgba(0,0,0,0.35)] border border-amber-500/30 flex items-center justify-between gap-2.5">
            {/* App Icon + Information */}
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="relative shrink-0">
                <img
                  src="/app-icon.png"
                  alt="Hdase Bingo App Icon"
                  className="w-12 h-12 rounded-xl object-contain bg-white p-0.5 border border-amber-400/80 shadow-md"
                />
                <span className="absolute -bottom-1 -right-1 bg-amber-500 text-slate-950 font-black text-[8px] px-1 py-0.2 rounded-full border border-white">
                  PWA
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className="font-black text-xs text-white truncate">HDASE BINGO</span>
                  <span className="bg-amber-400/20 text-amber-300 text-[9px] font-black px-1.5 py-0.5 rounded-full border border-amber-400/30">
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

            {/* Actions */}
            <div className="flex items-center space-x-1.5 shrink-0">
              <button
                type="button"
                onClick={handleInstallClick}
                className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 active:scale-95 text-slate-950 px-3.5 py-2 rounded-xl font-black text-xs shadow-md shadow-amber-500/20 flex items-center space-x-1.5 transition-all"
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

      {/* ─── STEP-BY-STEP INSTALL GUIDE MODAL (iOS / GENERAL) ─── */}
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
                        ወደ ታች ዝቅ ብለው <PlusSquare size={13} className="inline text-slate-700 dark:text-slate-300 mx-0.5" /> <span className="font-black">"Add to Home Screen"</span> (ወደ መነሻ ገጽ አክል) የሚለውን ይምረጡ
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

            {/* Close / Got it button */}
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

// Helper function that any component (Header, Profile, Help) can invoke
export function triggerPWAInstall() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('hdase-trigger-pwa-install'));
  }
}
