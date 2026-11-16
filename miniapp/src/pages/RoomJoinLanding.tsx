import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Download,
  Send,
  Gamepad2,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Trophy,
  Users,
  Sparkles,
  Share2,
  PlusSquare,
  ArrowRight,
  Crown,
  Building2,
  HelpCircle,
  X,
} from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';
import { syncManifestWithRoom } from '../lib/pwa';

const API = import.meta.env.VITE_API_URL || '/api';
const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || 'hdasebingo_bot';

interface PublicRoom {
  id: string;
  room_name: string;
  total_players?: number;
  stakes?: number[];
  commission_rate?: number;
  status?: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function RoomJoinLanding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuthModalOpen } = useGameStore();

  const [roomId, setRoomId] = useState<string>('');
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(true);

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  // 1. Resolve room ID from URL search, hash, or localStorage
  useEffect(() => {
    let detectedId =
      searchParams.get('room') ||
      searchParams.get('start') ||
      searchParams.get('startapp') ||
      searchParams.get('tgWebAppStartParam') ||
      '';

    if (detectedId.startsWith('room_')) {
      detectedId = detectedId.replace('room_', '');
    }

    if (!detectedId && typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash) {
        const hp = new URLSearchParams(hash.replace(/^#/, ''));
        detectedId = hp.get('room') || hp.get('start') || '';
        if (detectedId.startsWith('room_')) detectedId = detectedId.replace('room_', '');
      }
    }

    if (!detectedId && typeof window !== 'undefined') {
      detectedId = localStorage.getItem('hdase_invited_room_id') || '';
    }

    if (detectedId) {
      setRoomId(detectedId);
      localStorage.setItem('hdase_invited_room_id', detectedId);
    }

    // Resolve inviter / referral ID
    let detectedRef =
      searchParams.get('ref') ||
      searchParams.get('inviter') ||
      '';
    if (!detectedRef && typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash) {
        const hp = new URLSearchParams(hash.replace(/^#/, ''));
        detectedRef = hp.get('ref') || hp.get('inviter') || '';
      }
    }
    if (detectedRef) {
      if (detectedRef.startsWith('ref_')) detectedRef = detectedRef.replace('ref_', '');
      localStorage.setItem('hdase_promoter_ref', detectedRef);
      localStorage.setItem('hdase_invited_by', detectedRef);
    }

    if (detectedId || detectedRef) {
      syncManifestWithRoom(detectedId, detectedRef);
    }
  }, [searchParams]);

  // 2. Fetch room details
  useEffect(() => {
    if (!roomId) {
      setLoadingRoom(false);
      return;
    }

    let isMounted = true;
    fetch(`${API}/player/public-room/${roomId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.room) {
          setRoom(data.room);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoadingRoom(false);
      });

    return () => {
      isMounted = false;
    };
  }, [roomId]);

  // 3. Listen for PWA beforeinstallprompt & detect iOS
  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
    setIsIOS(isIosDevice);

    const handlePrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', () => {
      setInstallSuccess(true);
      localStorage.setItem('hdase_pwa_installed', 'true');
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
    };
  }, []);

  // Handler for PWA install button
  const handleInstallPWA = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setInstallSuccess(true);
          localStorage.setItem('hdase_pwa_installed', 'true');
        }
      } catch (err) {
        console.error('Install prompt error:', err);
      }
    } else if (isIOS) {
      setShowIOSGuide(true);
    } else {
      // Browser didn't trigger prompt or user is in non-supporting browser:
      // Navigate to web app directly with room pre-assigned
      if (roomId) localStorage.setItem('hdase_invited_room_id', roomId);
      navigate('/');
      setTimeout(() => setAuthModalOpen(true), 300);
    }
  };

  // Handler for Web Play
  const handlePlayOnWeb = () => {
    if (roomId) localStorage.setItem('hdase_invited_room_id', roomId);
    navigate('/');
    setTimeout(() => setAuthModalOpen(true), 350);
  };

  // Handler for Telegram Bot
  const handleOpenTelegramBot = () => {
    const inviterRef = typeof window !== 'undefined' ? localStorage.getItem('hdase_promoter_ref') || '' : '';
    let startParam = '';
    if (inviterRef && roomId) {
      startParam = `ref_${inviterRef}_room_${roomId}`;
    } else if (roomId) {
      startParam = `room_${roomId}`;
    } else if (inviterRef) {
      startParam = `ref_${inviterRef}`;
    }

    const tgUrl = startParam
      ? `https://t.me/${BOT_USERNAME}?start=${startParam}`
      : `https://t.me/${BOT_USERNAME}`;
    if (typeof WebApp !== 'undefined' && WebApp.openTelegramLink) {
      WebApp.openTelegramLink(tgUrl);
    } else {
      window.location.href = tgUrl;
    }
  };

  const roomName = room?.room_name || 'HDASE BINGO';
  const stakes = (room?.stakes && room.stakes.length === 4) ? room.stakes : [5, 10, 20, 35];

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/60 via-slate-50 to-orange-50/40 text-slate-800 flex flex-col justify-between p-4 sm:p-6 font-sans select-none pb-20">
      <div className="max-w-md mx-auto w-full space-y-4">
        {/* ─── TOP ROYAL BRANDING ─── */}
        <div className="text-center pt-2 space-y-2">
          {/* Royal Crown & Medallion */}
          <div className="flex flex-col items-center justify-center">
            <div className="flex items-center space-x-2 text-[#b8860b]">
              <span className="w-8 h-px bg-[#d4af37]" />
              <Crown size={22} className="text-[#d4af37] fill-[#d4af37]/20" />
              <span className="w-8 h-px bg-[#d4af37]" />
            </div>
            <div className="w-10 h-10 rounded-full bg-[#1b140c] border-2 border-[#d4af37] ring-2 ring-[#fef08a]/60 flex items-center justify-center mt-1 shadow-md">
              <span className="font-serif font-black text-sm text-[#fef08a] tracking-wider">HB</span>
            </div>
          </div>

          <div>
            <h1 className="font-serif font-black text-2xl tracking-[0.12em] text-[#140f09] uppercase drop-shadow-2xs">
              HDASE BINGO
            </h1>
            <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
              Official Ethiopian Bingo Platform • ሕዳሴ ቢንጎ
            </p>
          </div>
        </div>

        {/* ─── INVITED ROOM HERO CARD ─── */}
        <div
          className="relative overflow-hidden rounded-3xl border-2 border-[#c59b27] p-4 text-center shadow-md bg-white"
          style={{
            background: 'linear-gradient(180deg, #ffffff 0%, #fdfcf9 40%, #faf4e8 100%)',
          }}
        >
          <div className="border border-[#e6c86e]/80 rounded-2xl p-3.5 space-y-2.5">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-100/80 border border-amber-300 text-amber-900 text-[10px] font-black uppercase tracking-wider">
              <Building2 size={11} className="text-amber-700" />
              <span>Official Game Room Invitation</span>
            </div>

            <div>
              <h2 className="text-xl font-black text-slate-900">
                {roomName}
              </h2>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                You are invited to join this room. All games, payouts & stakes are managed here.
              </p>
            </div>

            {/* Stake Chips Row */}
            <div className="flex items-center justify-center space-x-1.5 pt-1">
              {stakes.map((stk) => (
                <span
                  key={stk}
                  className="px-2.5 py-1 rounded-xl bg-white border border-amber-300 shadow-2xs text-xs font-black text-amber-700 font-mono"
                >
                  {stk} ETB
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ─── OPTION 1: INSTALL APPLICATION (MAIN PRIORITY) ─── */}
        <div className="bg-gradient-to-br from-emerald-950 via-slate-900 to-emerald-950 border-2 border-emerald-500/50 rounded-3xl p-5 text-white shadow-xl relative overflow-hidden space-y-3.5">
          {/* Glowing background aura */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                <Sparkles size={10} />
                <span>Option 1 • Recommended • ፈጣን ጭነት</span>
              </span>
              <h3 className="text-base font-black text-white">
                Install Mobile Application (PWA)
              </h3>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Add directly to your phone screen with 1 tap. Play anytime without needing Telegram. Instant Telebirr, CBE & BOA cash payouts.
              </p>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Download size={22} />
            </div>
          </div>

          {/* Primary Action Button: Install PWA */}
          <button
            onClick={handleInstallPWA}
            className="w-full py-3.5 px-4 rounded-2xl font-black text-sm bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg shadow-emerald-900/30 active:scale-[0.98] transition-all flex items-center justify-center space-x-2"
          >
            {installSuccess ? (
              <>
                <CheckCircle2 size={18} />
                <span>Installed Successfully!</span>
              </>
            ) : (
              <>
                <Download size={18} />
                <span>Install Application (PWA)</span>
              </>
            )}
          </button>

          {/* Secondary Web Play link */}
          <button
            onClick={handlePlayOnWeb}
            className="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-slate-200 border border-white/15 transition flex items-center justify-center space-x-1.5 active:scale-95"
          >
            <Gamepad2 size={14} className="text-emerald-400" />
            <span>Or Play Directly on Web Browser</span>
            <ArrowRight size={12} />
          </button>
        </div>

        {/* ─── OPTION 2: TELEGRAM BOT ─── */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-0.5">
              <span className="text-[9px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                Option 2 • Telegram Mini App
              </span>
              <h3 className="text-sm font-black text-slate-800">
                Play in Telegram Bot
              </h3>
              <p className="text-[11px] text-slate-500">
                Launch instantly inside official @{BOT_USERNAME} on Telegram.
              </p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
              <Send size={18} />
            </div>
          </div>

          <button
            onClick={handleOpenTelegramBot}
            className="w-full py-3 px-4 rounded-2xl font-black text-xs bg-gradient-to-r from-blue-600 via-sky-600 to-blue-700 hover:opacity-95 text-white shadow-sm active:scale-[0.98] transition-all flex items-center justify-center space-x-2"
          >
            <Send size={15} />
            <span>Open in Telegram Bot (@{BOT_USERNAME})</span>
          </button>
        </div>

        {/* ─── PLATFORM GUARANTEES ─── */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-2xs flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Trophy size={16} />
            </div>
            <div>
              <p className="font-black text-slate-800 text-[11px]">Real Cash Wins</p>
              <p className="text-[9px] text-slate-400">Instant Telebirr & CBE</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-2xs flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <ShieldCheck size={16} />
            </div>
            <div>
              <p className="font-black text-slate-800 text-[11px]">Verified Fair</p>
              <p className="text-[9px] text-slate-400">75-Ball Ethiopian Live</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── IOS INSTALL GUIDE MODAL ─── */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl border border-slate-200 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Download size={16} />
                </div>
                <div>
                  <h3 className="font-black text-xs uppercase tracking-wide text-slate-900">
                    Install on iPhone / iPad
                  </h3>
                  <p className="text-[10px] text-slate-400">Follow these 2 quick steps in Safari</p>
                </div>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="flex items-start space-x-3 p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="w-6 h-6 rounded-full bg-amber-500 text-white font-black text-xs flex items-center justify-center shrink-0">
                  1
                </span>
                <div>
                  <p className="font-bold text-slate-900">Tap the Share button</p>
                  <p className="text-[11px] text-slate-500">
                    Tap the square icon with an arrow pointing up at the bottom of Safari: <Share2 size={13} className="inline text-blue-600" />
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="w-6 h-6 rounded-full bg-amber-500 text-white font-black text-xs flex items-center justify-center shrink-0">
                  2
                </span>
                <div>
                  <p className="font-bold text-slate-900">Tap "Add to Home Screen"</p>
                  <p className="text-[11px] text-slate-500">
                    Scroll down and tap <PlusSquare size={13} className="inline text-slate-700" /> <b>Add to Home Screen</b>.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setShowIOSGuide(false);
                handlePlayOnWeb();
              }}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-xs rounded-2xl shadow-sm active:scale-95"
            >
              Continue to Web Game
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
