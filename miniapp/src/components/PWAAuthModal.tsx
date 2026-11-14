import React, { useState, useEffect, useRef } from 'react';
import { 
  User as UserIcon, Lock, Eye, EyeOff, Sparkles, X, 
  AlertCircle, Building2, CheckCircle2, Video, ChevronDown, Search 
} from 'lucide-react';
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

  // Custom mobile-first room picker state
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [roomSearch, setRoomSearch] = useState('');

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
          // Sort: pinned first, then newest
          available.sort((a: any, b: any) => {
            if (Boolean(b.is_pinned) !== Boolean(a.is_pinned)) return b.is_pinned ? 1 : -1;
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

  // 2. Fetch Welcome Video for the top of the modal (NOT how_to_use)
  useEffect(() => {
    let isMounted = true;
    fetch(`${API_URL}/player/support-videos?category=welcome`)
      .then(r => r.json())
      .then(data => {
        if (!isMounted) return;
        if (Array.isArray(data?.videos) && data.videos.length > 0) {
          setVideoData(data.videos[0]);
        } else {
          // Check all active support videos for one in welcome category or with welcome in title
          fetch(`${API_URL}/player/support-videos?category=all`)
            .then(res => res.json())
            .then(allData => {
              if (!isMounted) return;
              const found = (allData?.videos || []).find((v: any) =>
                v.category === 'welcome' || v.title?.toLowerCase().includes('welcome')
              );
              if (found) {
                setVideoData(found);
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
          phone_number: phone,
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
          phone_number: phone,
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

  // Find currently selected room
  const selectedRoom = publicRooms.find(r => r.id === selectedRoomId);

  // Filter rooms for custom room picker
  const filteredRooms = publicRooms.filter(r => 
    r.room_name.toLowerCase().includes(roomSearch.toLowerCase())
  );

  // Do NOT render if:
  // 1. Inside native Telegram Mini App (auto-authenticated by Telegram)
  // 2. User is already authenticated
  // 3. Modal is not flagged open
  if (isInsideTelegram || user || !isAuthModalOpen) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
        <div className="relative w-full max-w-[420px] bg-white border border-amber-200/90 rounded-3xl shadow-2xl shadow-slate-900/15 overflow-hidden my-auto flex flex-col max-h-[92vh]">

          {/* Close Button (allows visitor to dismiss and browse) */}
          <button
            type="button"
            onClick={() => setAuthModalOpen(false)}
            className="absolute top-3 right-3 z-30 w-8 h-8 rounded-full bg-white/90 hover:bg-white border border-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center shadow-md active:scale-90 transition-all"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          {/* ── TOP SECTION: Welcome Video (Horizontal Clean Player) ───────── */}
          <div className="relative w-full bg-slate-950 border-b border-amber-100 shrink-0 overflow-hidden flex items-center justify-center">
            {videoData?.video_url ? (
              <div className="relative w-full flex items-center justify-center bg-black" style={{ minHeight: '190px', maxHeight: '230px' }}>
                <video
                  ref={videoRef}
                  src={videoData.video_url}
                  poster={videoData.thumbnail_url || undefined}
                  controls
                  playsInline
                  className="w-full max-h-[230px] object-contain mx-auto"
                />
                <div className="absolute top-2.5 left-2.5 z-10 bg-white/95 backdrop-blur-sm border border-amber-300 px-2.5 py-0.5 rounded-full flex items-center space-x-1.5 shadow-md">
                  <Sparkles size={11} className="text-amber-600" />
                  <span className="text-[10px] font-black tracking-wider text-amber-900 uppercase">
                    Welcome Video • እንኳን ደህና መጡ
                  </span>
                </div>
              </div>
            ) : (
              <div className="relative p-5 pb-4 text-center bg-gradient-to-b from-amber-50 via-yellow-50/50 to-white w-full">
                <div className="w-16 h-16 mx-auto mb-2 rounded-2xl p-1 bg-gradient-to-tr from-amber-400 via-yellow-300 to-amber-500 shadow-lg shadow-amber-400/20 flex items-center justify-center">
                  <img src="/app-icon.png" alt="Hdase Bingo" className="w-full h-full object-cover rounded-xl" />
                </div>
                <div className="flex items-center justify-center space-x-1.5">
                  <span className="text-xl font-black text-slate-900 tracking-tight">HDASE</span>
                  <span className="text-xl font-black text-orange-500 tracking-tight">BINGO</span>
                </div>
                <p className="text-xs text-amber-700 font-bold mt-0.5">
                  Welcome to Ethiopia's #1 Live Bingo Platform • እንኳን ደህና መጡ!
                </p>
              </div>
            )}
          </div>

          {/* ── SCROLLABLE BODY (WHITE THEME) ─────────────────────────────── */}
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4 bg-white">

            {/* TAB TOGGLE: Register (default) vs Login */}
            <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl border border-slate-200/90 shadow-inner">
              <button
                type="button"
                onClick={() => { setActiveTab('register'); setError(null); }}
                className={`py-2 px-3 rounded-xl font-black text-xs transition-all flex items-center justify-center space-x-1.5 ${
                  activeTab === 'register'
                    ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-600 hover:text-slate-900 font-bold'
                }`}
              >
                <Sparkles size={13} className={activeTab === 'register' ? 'text-slate-950' : 'text-amber-500'} />
                <span>Register • ተመዝገብ</span>
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('login'); setError(null); }}
                className={`py-2 px-3 rounded-xl font-black text-xs transition-all flex items-center justify-center space-x-1.5 ${
                  activeTab === 'login'
                    ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-600 hover:text-slate-900 font-bold'
                }`}
              >
                <span>Login • ግባ</span>
              </button>
            </div>

            {/* Alerts */}
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-start space-x-2 text-rose-700 text-xs">
                <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-500" />
                <div className="flex-1 leading-snug font-medium">{error}</div>
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center space-x-2 text-emerald-700 text-xs font-bold">
                <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* ── REGISTER FORM (DEFAULT) ──────────────────────────────────── */}
            {activeTab === 'register' && (
              <form onSubmit={handleRegister} className="space-y-3">
                {/* 1. Full Name */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 ml-1">
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
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 rounded-xl text-slate-900 text-sm placeholder:text-slate-400 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* 2. Phone Number with fixed +251 badge */}
                <div>
                  <div className="flex items-center justify-between mb-1 ml-1">
                    <label className="text-[11px] font-bold text-slate-700">
                      Phone Number • ስልክ ቁጥር
                    </label>
                    <span className="text-[10px] text-amber-600 font-mono font-bold">
                      {phone.length}/9 digits
                    </span>
                  </div>
                  <div className="flex rounded-xl overflow-hidden border border-slate-200 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 transition-all bg-slate-50">
                    <div className="px-3 py-2.5 bg-amber-50/80 border-r border-slate-200 flex items-center space-x-1.5 select-none shrink-0">
                      <span className="text-sm">🇪🇹</span>
                      <span className="text-slate-900 font-mono font-black text-xs">+251</span>
                    </div>
                    <input
                      type="tel"
                      inputMode="numeric"
                      required
                      value={phone}
                      onChange={handlePhoneChange}
                      placeholder="9xxxxxxxx or 7xxxxxxxx"
                      className="flex-1 px-3 py-2.5 bg-transparent text-slate-900 text-sm font-mono placeholder:text-slate-400 outline-none"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 ml-1">
                    Type 9 or 7 followed by 8 digits (auto-strips leading 0)
                  </p>
                </div>

                {/* 3. Password */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 ml-1">
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
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 rounded-xl text-slate-900 text-sm placeholder:text-slate-400 outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* 4. Room Selection: Mobile Screen First Drawer, NO ROOM NUMBERS (WHITE THEME) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 ml-1">
                    Select Room • የሚጫወቱበት ክፍል
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowRoomPicker(true)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 hover:border-amber-400 hover:bg-amber-50/40 rounded-xl text-left flex items-center justify-between text-slate-900 text-sm transition-all shadow-sm active:scale-[0.99]"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <Building2 size={16} className="text-amber-500 shrink-0" />
                      <span className="font-bold truncate text-slate-900">
                        {selectedRoom ? selectedRoom.room_name : 'Select Room • ክፍል ይምረጡ'}
                      </span>
                    </div>
                    <ChevronDown size={16} className="text-slate-400 shrink-0 ml-2" />
                  </button>
                </div>

                {/* Submit Register */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-500 text-slate-950 font-black text-sm rounded-xl shadow-lg shadow-amber-500/25 transition-all transform active:scale-[0.98] disabled:opacity-50 flex items-center justify-center space-x-2"
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
                    className="text-xs text-slate-500 hover:text-amber-600 transition-colors font-medium"
                  >
                    Already have an account? <span className="text-amber-600 font-bold underline">Login</span>
                  </button>
                </div>
              </form>
            )}

            {/* ── LOGIN FORM (WHITE THEME) ─────────────────────────────────── */}
            {activeTab === 'login' && (
              <form onSubmit={handleLogin} className="space-y-3">
                {/* Phone with fixed +251 badge */}
                <div>
                  <div className="flex items-center justify-between mb-1 ml-1">
                    <label className="text-[11px] font-bold text-slate-700">
                      Phone Number • ስልክ ቁጥር
                    </label>
                    <span className="text-[10px] text-amber-600 font-mono font-bold">
                      {phone.length}/9 digits
                    </span>
                  </div>
                  <div className="flex rounded-xl overflow-hidden border border-slate-200 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 transition-all bg-slate-50">
                    <div className="px-3 py-2.5 bg-amber-50/80 border-r border-slate-200 flex items-center space-x-1.5 select-none shrink-0">
                      <span className="text-sm">🇪🇹</span>
                      <span className="text-slate-900 font-mono font-black text-xs">+251</span>
                    </div>
                    <input
                      type="tel"
                      inputMode="numeric"
                      required
                      value={phone}
                      onChange={handlePhoneChange}
                      placeholder="9xxxxxxxx or 7xxxxxxxx"
                      className="flex-1 px-3 py-2.5 bg-transparent text-slate-900 text-sm font-mono placeholder:text-slate-400 outline-none"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 ml-1">
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
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 rounded-xl text-slate-900 text-sm placeholder:text-slate-400 outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Submit Login */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-500 text-slate-950 font-black text-sm rounded-xl shadow-lg shadow-amber-500/25 transition-all transform active:scale-[0.98] disabled:opacity-50 flex items-center justify-center space-x-2"
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
                    className="text-xs text-slate-500 hover:text-amber-600 transition-colors font-medium"
                  >
                    Don't have an account? <span className="text-amber-600 font-bold underline">Register now</span>
                  </button>
                </div>
              </form>
            )}

            {/* Quick Support note */}
            <div className="pt-2 text-center border-t border-slate-100">
              <p className="text-[10px] text-slate-400">
                Need help? Join our Telegram channel or contact support anytime.
              </p>
            </div>

          </div>
        </div>
      </div>

      {/* ── CUSTOM MOBILE ROOM PICKER MODAL (NO ROOM NUMBERS, CLEAN WHITE THEME) ── */}
      {showRoomPicker && (
        <div 
          className="fixed inset-0 z-[60] flex flex-col justify-end sm:justify-center items-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setShowRoomPicker(false)}
        >
          <div
            className="w-full max-w-[420px] bg-white border-t sm:border border-amber-300 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Building2 size={18} className="text-amber-600" />
                <h3 className="text-sm font-black text-slate-900">Select Bingo Room • ክፍል ይምረጡ</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRoomPicker(false)}
                className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center justify-center transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Live Search bar */}
            <div className="p-3 border-b border-slate-100 bg-white">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search size={14} />
                </div>
                <input
                  type="text"
                  value={roomSearch}
                  onChange={(e) => setRoomSearch(e.target.value)}
                  placeholder="Search hotel / room name • ስም ፈልግ..."
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 focus:bg-white focus:border-amber-500 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none"
                  autoFocus
                />
                {roomSearch && (
                  <button
                    type="button"
                    onClick={() => setRoomSearch('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Rooms List (ONLY ROOM NAMES, NO NUMBERS, WHITE CLEAN THEME) */}
            <div className="p-3 overflow-y-auto space-y-2 flex-1 bg-white">
              {filteredRooms.length > 0 ? (
                filteredRooms.map((room) => {
                  const isSelected = room.id === selectedRoomId;
                  return (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => {
                        setSelectedRoomId(room.id);
                        setShowRoomPicker(false);
                        setRoomSearch('');
                      }}
                      className={`w-full p-3 rounded-2xl flex items-center justify-between text-left transition-all ${
                        isSelected
                          ? 'bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-500 shadow-sm'
                          : 'bg-slate-50/70 border border-slate-200 hover:border-amber-300 hover:bg-amber-50/30'
                      }`}
                    >
                      <div className="flex items-center space-x-3 truncate">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-amber-500 text-slate-950 font-black shadow-sm' : 'bg-slate-200/70 text-amber-600'
                        }`}>
                          <Building2 size={18} />
                        </div>
                        <div className="truncate">
                          {/* ONLY ROOM NAME AS REQUESTED! */}
                          <p className={`text-xs font-black truncate ${isSelected ? 'text-amber-900' : 'text-slate-900'}`}>
                            {room.room_name}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {room.is_pinned ? '⭐ Featured Room' : 'Public Room'}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 ml-2">
                        {isSelected ? (
                          <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-slate-950">
                            <CheckCircle2 size={16} className="text-slate-950 font-black" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
                        )}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="py-8 text-center text-slate-400 text-xs">
                  No rooms match "{roomSearch}"
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
