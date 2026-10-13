import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const BACKGROUND_THRESHOLD_MS = 15_000; // 15 seconds away = force fresh remount

function Root() {
  const [appKey, setAppKey] = useState(0);
  const hiddenAtRef = useRef<number | null>(null);

  const forceRemount = useCallback(() => {
    // Re-expand WebView first (fixes collapsed WebView on return)
    try { (window as any).Telegram?.WebApp?.expand(); } catch (_) {}
    setAppKey(k => k + 1);
  }, []);

  const handleReturn = useCallback(() => {
    // Always re-expand WebView when returning from background
    // (Telegram may have collapsed it, causing click targets to be misaligned)
    try { (window as any).Telegram?.WebApp?.expand(); } catch (_) {}

    const hidden = hiddenAtRef.current;
    hiddenAtRef.current = null;
    if (hidden !== null && Date.now() - hidden > BACKGROUND_THRESHOLD_MS) {
      forceRemount();
    }
  }, [forceRemount]);

  const handleHide = useCallback(() => {
    hiddenAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    // ── Event-based detection ──────────────────────────────────────────────
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') handleHide();
      else handleReturn();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', handleReturn);
    window.addEventListener('pageshow', handleReturn);

    // Telegram-specific activated/deactivated events
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.onEvent) {
        tg.onEvent('activated', handleReturn);
        tg.onEvent('deactivated', handleHide);
      }
    } catch (_) {}

    // ── Heartbeat suspension detector ─────────────────────────────────────
    // The ONLY reliable way to detect Android JS engine suspension.
    // While JS is suspended, this interval doesn't fire.
    // When JS resumes, if the gap is > threshold → force remount.
    let lastBeat = Date.now();
    const beatId = setInterval(() => {
      const now = Date.now();
      const gap = now - lastBeat;
      lastBeat = now;
      if (gap > BACKGROUND_THRESHOLD_MS) {
        // JS engine was suspended for too long — force fresh remount
        try { (window as any).Telegram?.WebApp?.expand(); } catch (_) {}
        setAppKey(k => k + 1);
      }
    }, 3000); // check every 3 seconds

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', handleReturn);
      window.removeEventListener('pageshow', handleReturn);
      clearInterval(beatId);
      try {
        const tg = (window as any).Telegram?.WebApp;
        if (tg?.offEvent) {
          tg.offEvent('activated', handleReturn);
          tg.offEvent('deactivated', handleHide);
        }
      } catch (_) {}
    };
  }, [handleReturn, handleHide]);

  return <App key={appKey} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Root /></React.StrictMode>
);
