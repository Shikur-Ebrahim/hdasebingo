import React, { useState, useEffect, useRef } from 'react';
import { User as UserIcon, Phone, Lock, Eye, EyeOff, Sparkles, X, AlertCircle, Play, Building2, CheckCircle2, Video } from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import { useGameStore, Room } from '../store/gameStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface VideoInfo {
  id?: string;
  title?: string;
  description?: string;
  video_url: string;
  thumbnail_url?: string;
}

export function PWAAuthModal() {
  const { user, isAuthModalOpen, setAuthModalOpen, loginPwa } = useGameStore();

  const [activeTab, setActiveTab] = useState<'register' | 'login'>('register');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [publicRooms, setPublicRooms] = useState<Room[]>([]);
  const [videoData, setVideoData] = useState<VideoInfo | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Check if inside Telegram WebApp with native initData
  const isInsideTelegram = typeof WebApp !== 'undefined' && Boolean(WebApp.initData && WebApp.initData.trim() !== '');

  // 1. Fetch public rooms for room dropdown
  useEffect(() => {
    let isMounted = true;
    fetch(`${API_URL}/player/rooms`)
      .then(res => res.json())
      .then(data => {
        if (!isMounted) return;
        if (Array.isArray(data?.rooms)) {
          // Strictly public rooms only (not private)
          const available = data.rooms.filter((r: any) => !r.is_private);
          // Sort: pinned first, then room_number ascending
          available.sort((a: any, b: any) => {
            if (Boolean(b.is_pinned) !== Boolean(a.is_pinned)) return b.is_pinned ? 1 : -1;
            if (a.room_number !== undefined && b.room_number !== undefined && a.room_number !== b.room_number) {
              return Number(a.room_number) - Number(b.room_number);
            }
            return 0;
          });
          setPublicRooms(available);

          // Pre-select invited room if present
          const invitedRoom = typeof window !== 'undefined' ? localStorage.getItem('hdase_invited_room_id') : null;
          if (invitedRoom && available.some((r: any) => r.id === invitedRoom)) {
            setSelectedRoomId(invitedRoom);
          } else if (available.length > 0 && !selectedRoomId) {
            setSelectedRoomId(available[0].id);
          }
        }
      })
      .catch(() => {});

    return () => { isMounted = false; };
  }, []);

  // 2. Fetch guide / tutorial video for the top of the modal
  useEffect(() => {
    let isMounted = true;
    fetch(`${API_URL}/player/support-contact`)
      .then(r => r.json())
      .then(data => {
        if (!isMounted) return;
        if (data?.home_popup_video?.video_url) {
          setVideoData(data.home_popup_video);
        } else {
          // Fallback to active how_to_use video
          fetch(`${API_URL}/player/support-videos?category=how_to_use`)
            .then(res => res.json())
            .then(vidData => {
              if (isMounted && Array.isArray(vidData?.videos) && vidData.videos.length > 0) {
                setVideoData(vidData.videos[0]);
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    return () => { isMounted = false; };
  }, []);

  // Format and sanitize phone input (accepts 9 digits starting with 9 or 7)
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, ''); // only digits
    if (val.startsWith('251')) {
      val = val.slice(3);
    }
    if (val.startsWith('0')) {
      val = val.slice(1);
    }
    if (val.length > 9) {
      val = val.slice(0, 9);
    }
    setPhone(val);
    setError(null);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!fullName.trim() || fullName.trim().length < 2) {
      setError('Please enter your full name (at least 2 letters) • ሙሉ ስም ያስገቡ');
      return;
    }

    if (phone.length !== 9 || (!phone.startsWith('9') && !phone.startsWith('7'))) {
      setError('Please enter a valid 9-digit Ethiopian number starting with 9 or 7 (e.g. 912345678).');
      return;
    }

    if (!password || password.length < 4) {
      setError('Password must be at least 4 characters • የይለፍ ቃል ቢያንስ 4 ፊደል መሆን አለበት');
      return;
    }

    setLoading(true);
    try {
      const promoterRef = typeof window !== 'undefined' ? localStorage.getItem('hdase_promoter_ref') : null;
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: fullName.trim(),
          phone_number: `+251${phone}`,
          password,
          room_id: selectedRoomId || undefined,
          promoter_ref: promoterRef || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      setSuccessMsg('Account created successfully! Welcome to Hdase Bingo.');
      setTimeout(() => {
        loginPwa(data.user, data.token);
      }, 500);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (phone.length !== 9 || (!phone.startsWith('9') && !phone.startsWith('7'))) {
      setError('Please enter your 9-digit Ethiopian phone number starting with 9 or 7.');
      return;
    }

    if (!password) {
      setError('Please enter your password • የይለፍ ቃል ያስገቡ');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: `+251${phone}`,
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      setSuccessMsg('Logged in successfully!');
      setTimeout(() => {
        loginPwa(data.user, data.token);
      }, 400);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  // Do NOT render if:
  // 1. Inside native Telegram Mini App (auto-authenticated by Telegram)
  // 2. User is already authenticated
  // 3. Modal is not flagged open
  if (isInsideTelegram || user || !isAuthModalOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-[420px] bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-amber-500/30 rounded-3xl shadow-2xl shadow-amber-500/10 overflow-hidden my-auto flex flex-col max-h-[92vh]">

        {/* Close Button (allows visitor to dismiss and browse) */}
        <button
          type="button"
          onClick={() => setAuthModalOpen(false)}
          className="absolute top-3 right-3 z-30 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 text-white flex items-center justify-center transition-transform active:scale-90"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* ── TOP SECTION: Video Header / Guide ──────────────────────────── */}
        <div className="relative w-full bg-slate-950 border-b border-amber-500/20 shrink-0 overflow-hidden">
          {videoData?.video_url ? (
            <div className="relative w-full aspect-video bg-black flex items-center justify-center">
              <video
                ref={videoRef}
                src={videoData.video_url}
                poster={videoData.thumbnail_url || undefined}
                controls
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 left-2 z-10 bg-black/60 backdrop-blur-sm border border-amber-500/40 px-2 py-0.5 rounded-full flex items-center space-x-1.5">
                <Video size={11} className="text-amber-400" />
                <span className="text-[10px] font-black tracking-wider text-amber-300 uppercase">
                  {videoData.title || 'Video Guide • አጫዋች ቪዲዮ'}
                </span>
              </div>
            </div>
          ) : (
            <div className="relative p-5 pb-4 text-center bg-gradient-to-b from-amber-500/15 via-slate-900 to-slate-950">
              <div className="w-16 h-16 mx-auto mb-2.5 rounded-2xl p-1 bg-gradient-to-tr from-amber-500 via-yellow-300 to-amber-600 shadow-xl shadow-amber-500/20 flex items-center justify-center">
                <img src="/app-icon.png" alt="Hdase Bingo" className="w-full h-full object-cover rounded-xl" />
              </div>
              <h2 className="text-xl font-black text-white tracking-tight">HDASE BINGO</h2>
              <p className="text-xs text-amber-400/90 font-medium mt-0.5">
                Ethiopia's #1 Live Multiplayer Bingo Platform
              </p>
            </div>
          )}
        </div>

        {/* ── SCROLLABLE BODY ────────────────────────────────────────────── */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">

          {/* TAB TOGGLE: Register (default) vs Login */}
          <div className="grid grid-cols-2 p-1 bg-slate-800/80 rounded-2xl border border-slate-700/60 shadow-inner">
            <button
              type="button"
              onClick={() => { setActiveTab('register'); setError(null); }}
              className={`py-2 px-3 rounded-xl font-black text-xs transition-all flex items-center justify-center space-x-1.5 ${
                activeTab === 'register'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md shadow-amber-500/25'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles size={13} className={activeTab === 'register' ? 'text-slate-950' : 'text-amber-400'} />
              <span>Register • ተመዝገብ</span>
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('login'); setError(null); }}
              className={`py-2 px-3 rounded-xl font-black text-xs transition-all flex items-center justify-center space-x-1.5 ${
                activeTab === 'login'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md shadow-amber-500/25'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Login • ግባ</span>
            </button>
          </div>

          {/* Alerts */}
          {error && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/40 rounded-2xl flex items-start space-x-2 text-rose-300 text-xs">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-400" />
              <div className="flex-1 leading-snug">{error}</div>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/40 rounded-2xl flex items-center space-x-2 text-emerald-300 text-xs font-bold">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* ── REGISTER FORM (DEFAULT) ──────────────────────────────────── */}
          {activeTab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3">
              {/* 1. Full Name */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 ml-1">
                  Full Name • ሙሉ ስም
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <UserIcon size={16} />
                  </div>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => { setFullName(e.target.value); setError(null); }}
                    placeholder="e.g. Abebe Kebede"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-800/90 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl text-white text-sm placeholder:text-slate-500 outline-none transition-all"
                  />
                </div>
              </div>

              {/* 2. Phone Number with fixed +251 badge */}
              <div>
                <div className="flex items-center justify-between mb-1 ml-1">
                  <label className="text-[11px] font-bold text-slate-300">
                    Phone Number • ስልክ ቁጥር
                  </label>
                  <span className="text-[10px] text-amber-400/90 font-mono font-bold">
                    {phone.length}/9 digits
                  </span>
                </div>
                <div className="flex rounded-xl overflow-hidden border border-slate-700 focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500 transition-all bg-slate-800/90">
                  <div className="px-3 py-2.5 bg-slate-700/60 border-r border-slate-700 flex items-center space-x-1.5 select-none shrink-0">
                    <span className="text-sm">🇪🇹</span>
                    <span className="text-white font-mono font-black text-xs">+251</span>
                  </div>
                  <input
                    type="tel"
                    inputMode="numeric"
                    required
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="9xxxxxxxx or 7xxxxxxxx"
                    className="flex-1 px-3 py-2.5 bg-transparent text-white text-sm font-mono placeholder:text-slate-500 outline-none"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1 ml-1">
                  Type 9 or 7 followed by 8 digits (auto-strips leading 0)
                </p>
              </div>

              {/* 3. Password */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 ml-1">
                  Create Password • የይለፍ ቃል ፍጠር
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock size={16} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    placeholder="Min. 4 characters"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-800/90 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl text-white text-sm placeholder:text-slate-500 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* 4. Room Selection (Only Public Rooms) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 ml-1">
                  Select Room • የሚጫወቱበት ክፍል
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-amber-400">
                    <Building2 size={16} />
                  </div>
                  <select
                    value={selectedRoomId}
                    onChange={(e) => setSelectedRoomId(e.target.value)}
                    className="w-full pl-10 pr-8 py-2.5 bg-slate-800/90 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl text-white text-sm appearance-none outline-none transition-all cursor-pointer"
                  >
                    {publicRooms.length > 0 ? (
                      publicRooms.map((room) => (
                        <option key={room.id} value={room.id} className="bg-slate-900 text-white">
                          {room.room_number ? `#${room.room_number} • ` : ''}{room.room_name}
                        </option>
                      ))
                    ) : (
                      <option value="" className="bg-slate-900 text-white">Loading rooms...</option>
                    )}
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                    ▼
                  </div>
                </div>
              </div>

              {/* Submit Register */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-sm rounded-xl shadow-lg shadow-amber-500/25 transition-all transform active:scale-[0.98] disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Register & Play • ተመዝገብና ተጫወት</span>
                  </>
                )}
              </button>

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => { setActiveTab('login'); setError(null); }}
                  className="text-xs text-slate-400 hover:text-amber-400 transition-colors font-medium"
                >
                  Already have an account? <span className="text-amber-400 font-bold underline">Login</span>
                </button>
              </div>
            </form>
          )}

          {/* ── LOGIN FORM ──────────────────────────────────────────────── */}
          {activeTab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-3">
              {/* Phone with fixed +251 badge */}
              <div>
                <div className="flex items-center justify-between mb-1 ml-1">
                  <label className="text-[11px] font-bold text-slate-300">
                    Phone Number • ስልክ ቁጥር
                  </label>
                  <span className="text-[10px] text-amber-400/90 font-mono font-bold">
                    {phone.length}/9 digits
                  </span>
                </div>
                <div className="flex rounded-xl overflow-hidden border border-slate-700 focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500 transition-all bg-slate-800/90">
                  <div className="px-3 py-2.5 bg-slate-700/60 border-r border-slate-700 flex items-center space-x-1.5 select-none shrink-0">
                    <span className="text-sm">🇪🇹</span>
                    <span className="text-white font-mono font-black text-xs">+251</span>
                  </div>
                  <input
                    type="tel"
                    inputMode="numeric"
                    required
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="9xxxxxxxx or 7xxxxxxxx"
                    className="flex-1 px-3 py-2.5 bg-transparent text-white text-sm font-mono placeholder:text-slate-500 outline-none"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 ml-1">
                  Password • የይለፍ ቃል
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock size={16} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-800/90 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl text-white text-sm placeholder:text-slate-500 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Submit Login */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-sm rounded-xl shadow-lg shadow-amber-500/25 transition-all transform active:scale-[0.98] disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>Log In • ግባ</span>
                )}
              </button>

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => { setActiveTab('register'); setError(null); }}
                  className="text-xs text-slate-400 hover:text-amber-400 transition-colors font-medium"
                >
                  Don't have an account? <span className="text-amber-400 font-bold underline">Register now</span>
                </button>
              </div>
            </form>
          )}

          {/* Quick Support note */}
          <div className="pt-2 text-center border-t border-slate-800/80">
            <p className="text-[10px] text-slate-400">
              Need help? Join our Telegram channel or contact support anytime.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
