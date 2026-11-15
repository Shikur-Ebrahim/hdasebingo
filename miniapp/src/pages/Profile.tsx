import { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { t } from '../lib/translations';
import { 
  Wallet, Gift, PlusCircle, ArrowDownToLine, Share2, 
  ArrowRightLeft, History, Users, Globe, Headphones, Megaphone,
  ChevronRight, X, Moon, Copy, Check, BookOpen, Bot, Sparkles, Download, LogOut,
  KeyRound, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, DoorOpen, Search
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { triggerPWAInstall } from '../components/PWAInstallPrompt';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function Profile() {
  const { user, isProfileOpen, setProfileOpen, isDarkMode, toggleDarkMode, language, setLanguage, logoutPwa, setAuthModalOpen, rooms, fetchRooms } = useGameStore();
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [supportUsername, setSupportUsername] = useState('hdasebingo_admin');
  const [channelLink, setChannelLink] = useState('https://t.me/hdasebingo');
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  // Room Selection states
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [roomSearch, setRoomSearch] = useState('');
  const [selectingRoom, setSelectingRoom] = useState(false);
  const [roomSuccessMsg, setRoomSuccessMsg] = useState<string | null>(null);

  const userRoomId = (user as any)?.room_id || (typeof window !== 'undefined' ? localStorage.getItem('hdase_invited_room_id') : null);
  const currentRoom = rooms.find(r => r.id === userRoomId) || rooms.find(r => r.room_name?.toUpperCase().includes('HDASE')) || rooms[0];
  const currentRoomName = currentRoom?.room_name || 'HDASE BINGO';

  const filteredRooms = rooms
    .filter(r => !r.is_private || (userRoomId && r.id === userRoomId))
    .filter(r => !roomSearch.trim() || r.room_name.toLowerCase().includes(roomSearch.toLowerCase()));

  const handleSelectRoom = async (roomId: string) => {
    setSelectingRoom(true);
    try {
      if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.impactOccurred('medium');
      localStorage.setItem('hdase_invited_room_id', roomId);
      
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const pwaToken = typeof window !== 'undefined' ? localStorage.getItem('hdase_pwa_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (initData) headers['x-telegram-init-data'] = initData;
      if (pwaToken) headers['x-pwa-token'] = pwaToken;

      await fetch(`${API_URL}/player/room/select`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ room_id: roomId }),
      }).catch(() => {});

      if (user) {
        useGameStore.setState({ user: { ...user, room_id: roomId } });
      }
      await fetchRooms();

      const selected = rooms.find(r => r.id === roomId);
      setRoomSuccessMsg(selected?.room_name ? `Switched to ${selected.room_name}` : 'Room selected successfully');
      setTimeout(() => {
        setRoomSuccessMsg(null);
        setShowRoomModal(false);
      }, 700);
    } finally {
      setSelectingRoom(false);
    }
  };

  // Change password states
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currPass, setCurrPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showCurrPass, setShowCurrPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passLoading, setPassLoading] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);

  const isRegisteredAccount = Boolean(
    (typeof window !== 'undefined' && localStorage.getItem('hdase_pwa_token')) ||
    user?.telegram_id?.startsWith('251')
  );

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);
    setPassSuccess(null);

    if (!currPass) {
      setPassError('Please enter your current password • የድሮውን ይለፍ ቃል ያስገቡ');
      return;
    }
    if (!newPass || newPass.length < 4) {
      setPassError('New password must be at least 4 characters • አዲሱ ይለፍ ቃል ቢያንስ 4 ፊደል መሆን አለበት');
      return;
    }
    if (newPass !== confirmPass) {
      setPassError('New passwords do not match • የይለፍ ቃሎች አይመሳሰሉም');
      return;
    }

    setPassLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currPass, new_password: newPass }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update password');
      }
      setPassSuccess('Password updated successfully! • የይለፍ ቃልዎ ተቀይሯል');
      setCurrPass('');
      setNewPass('');
      setConfirmPass('');
      setTimeout(() => {
        setShowChangePassword(false);
        setPassSuccess(null);
      }, 1400);
    } catch (err: any) {
      setPassError(err.message || 'Failed to update password');
    } finally {
      setPassLoading(false);
    }
  };

  useEffect(() => {
    const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
    fetch(`${API_URL}/player/support-contact`, {
      headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData }
    })
      .then(r => r.json())
      .then(data => {
        if (data.username) setSupportUsername(data.username);
        if (data.channel) setChannelLink(data.channel);
      })
      .catch(console.error);
  }, []);

  const formatMoney = (amount: number | undefined) => (amount || 0).toLocaleString('en-US');

  const handleSupport = () => {
    const url = `https://t.me/${supportUsername.replace('@', '')}`;
    if (typeof WebApp !== 'undefined' && WebApp.openTelegramLink) {
      WebApp.openTelegramLink(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const handleChannel = () => {
    if (typeof WebApp !== 'undefined' && WebApp.openTelegramLink) {
      WebApp.openTelegramLink(channelLink);
    } else {
      window.open(channelLink, '_blank');
    }
  };

  const navigateTo = (path: string) => {
    setProfileOpen(false);
    navigate(path);
  };

  // Shared class for every list row
  const row = "w-full flex items-center px-2 py-[7px] hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors active:bg-slate-100 text-left";
  const icon = (color: string) => `w-6 h-6 rounded-full ${color} flex items-center justify-center mr-2 shrink-0`;

  return (
    <>
      {/* OVERLAY */}
      {isProfileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm transition-opacity"
          onClick={() => setProfileOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <div
        className={`fixed top-0 left-0 h-full w-[75%] max-w-[310px] bg-slate-50 dark:bg-slate-900 border-r dark:border-slate-800 z-50 transform transition-transform duration-300 ease-in-out shadow-2xl flex flex-col overflow-hidden ${
          isProfileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* ── HEADER (Chocolate Brown) ── */}
        <div className="bg-[#3B2219] rounded-br-[1.5rem] px-4 pt-4 pb-4 shadow-md relative shrink-0">
          <button
            onClick={() => setProfileOpen(false)}
            className="absolute top-3 right-3 text-white/50 hover:text-white p-1"
          >
            <X size={16} />
          </button>

          <div className="flex items-center space-x-3 mb-3 mt-0.5">
            <div className="w-10 h-10 rounded-full bg-emerald-500 border-2 border-white/20 flex items-center justify-center text-white font-black text-lg shadow-sm shrink-0">
              {user?.first_name ? user.first_name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-white font-black text-sm truncate leading-tight">{user?.first_name || 'Player'}</p>
              <div className="flex items-center space-x-1 mt-0.5">
                <span className="text-white/50 text-[9px] font-mono font-semibold truncate">ID: {user?.telegram_id || '—'}</span>
                <button
                  onClick={() => {
                    if (user?.telegram_id) {
                      navigator.clipboard.writeText(user.telegram_id).then(() => {
                        setCopied(true);
                        if (typeof WebApp !== 'undefined') WebApp.HapticFeedback.impactOccurred('light');
                        setTimeout(() => setCopied(false), 2000);
                      });
                    }
                  }}
                  className="shrink-0 text-white/50 hover:text-white transition-colors"
                >
                  {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-2 border border-white/10 flex flex-col">
              <div className="flex items-center space-x-1 text-white/70 mb-0.5">
                <Wallet size={10} />
                <p className="text-[8px] font-bold uppercase tracking-wider">{t[language].profile.mainBalance}</p>
              </div>
              <p className="text-base font-black text-white">{formatMoney(user?.main_balance)} <span className="text-[8px]">ETB</span></p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-2 border border-white/10 flex flex-col">
              <div className="flex items-center space-x-1 text-purple-300 mb-0.5">
                <Gift size={10} />
                <p className="text-[8px] font-bold uppercase tracking-wider">{t[language].profile.bonusBalance}</p>
              </div>
              <p className="text-base font-black text-white">{formatMoney(user?.bonus_balance)} <span className="text-[8px]">ETB</span></p>
            </div>
          </div>
        </div>

        {/* ── SCROLLABLE CONTENT ── */}
        <div className="px-3 pt-2.5 pb-2 flex flex-col gap-2 flex-1 min-h-0">

          {/* Action buttons 2×2 */}
          <div className="grid grid-cols-2 gap-1.5 shrink-0">
            <button onClick={() => navigateTo('/deposit')} className="bg-yellow-400 active:bg-yellow-500 transition-colors text-yellow-950 rounded-xl py-1.5 flex flex-col items-center justify-center shadow-sm">
              <PlusCircle size={16} className="mb-0.5" />
              <span className="font-bold text-[9px]">{t[language].profile.deposit}</span>
            </button>
            <button onClick={() => navigateTo('/withdraw')} className="bg-white dark:bg-slate-800 active:bg-gray-100 transition-colors text-slate-700 dark:text-slate-200 rounded-xl py-1.5 flex flex-col items-center justify-center shadow-sm border border-gray-100 dark:border-slate-700">
              <ArrowDownToLine size={16} className="mb-0.5" />
              <span className="font-bold text-[9px]">{t[language].profile.withdraw}</span>
            </button>
            <button onClick={() => navigateTo('/invite')} className="bg-white dark:bg-slate-800 active:bg-gray-100 transition-colors text-slate-700 dark:text-slate-200 rounded-xl py-1.5 flex flex-col items-center justify-center shadow-sm border border-gray-100 dark:border-slate-700">
              <Share2 size={16} className="mb-0.5 text-blue-500" />
              <span className="font-bold text-[9px]">{t[language].profile.invite}</span>
            </button>
            <button onClick={() => navigateTo('/transfer')} className="bg-white dark:bg-slate-800 active:bg-gray-100 transition-colors text-slate-700 dark:text-slate-200 rounded-xl py-1.5 flex flex-col items-center justify-center shadow-sm border border-gray-100 dark:border-slate-700">
              <ArrowRightLeft size={16} className="mb-0.5 text-emerald-500" />
              <span className="font-bold text-[9px]">{t[language].profile.transfer}</span>
            </button>
          </div>

          {/* List items — flex-1 fills all remaining height, justify-around spreads evenly */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl px-1.5 shadow-sm border border-gray-100 dark:border-slate-700 flex flex-col flex-1 justify-around py-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>

            <button onClick={() => navigateTo('/deposit-history')} className={row}>
              <div className={icon('bg-blue-50 text-blue-500')}><History size={12} /></div>
              <span className="flex-1 font-bold text-slate-700 dark:text-slate-200 text-[10px]">{t[language].profile.depositHistory}</span>
              <ChevronRight size={11} className="text-slate-300" />
            </button>

            <button onClick={() => navigateTo('/withdraw-history')} className={row}>
              <div className={icon('bg-rose-50 text-rose-500')}><History size={12} /></div>
              <span className="flex-1 font-bold text-slate-700 dark:text-slate-200 text-[10px]">{t[language].profile.withdrawHistory}</span>
              <ChevronRight size={11} className="text-slate-300" />
            </button>

            {/* Room Selection */}
            <button onClick={() => { fetchRooms(); setShowRoomModal(true); }} className={row}>
              <div className={icon('bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400')}><DoorOpen size={12} /></div>
              <span className="flex-1 font-bold text-slate-700 dark:text-slate-200 text-[10px]">{language === 'am' ? 'ክፍል ምረጥ' : 'Room Selection'}</span>
              <span className="text-[8.5px] font-black text-amber-700 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-900/40 px-2 py-0.5 rounded-full mr-1 truncate max-w-[100px]">
                {currentRoomName}
              </span>
              <ChevronRight size={11} className="text-slate-300" />
            </button>

            <button onClick={() => navigateTo('/invited')} className={row}>
              <div className={icon('bg-emerald-50 text-emerald-500')}><Users size={12} /></div>
              <span className="flex-1 font-bold text-slate-700 dark:text-slate-200 text-[10px]">{t[language].profile.invitePerson}</span>
              <ChevronRight size={11} className="text-slate-300" />
            </button>

            {/* Install App - only visible when visiting via external browser and not yet installed */}
            {typeof window !== 'undefined' && !window.matchMedia('(display-mode: standalone)').matches && !(window.navigator as any).standalone && !(window as any).Telegram?.WebApp?.initData && localStorage.getItem('hdase_pwa_installed') !== 'true' && (
              <button onClick={() => { setProfileOpen(false); triggerPWAInstall(); }} className={`${row} bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30`}>
                <div className={icon('bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300')}><Download size={12} /></div>
                <span className="flex-1 font-black text-amber-900 dark:text-amber-300 text-[10px]">መተግበሪያውን ጫን • Install App</span>
                <span className="text-[7.5px] font-black bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded-full mr-1 shadow-xs">PWA</span>
                <ChevronRight size={11} className="text-amber-400" />
              </button>
            )}

            <button onClick={() => navigateTo('/rules')} className={row}>
              <div className={icon('bg-yellow-50 text-yellow-500')}><BookOpen size={12} /></div>
              <span className="flex-1 font-bold text-slate-700 dark:text-slate-200 text-[10px]">{t[language].profile.rules}</span>
              <ChevronRight size={11} className="text-slate-300" />
            </button>

            {/* Language Selector */}
            <div className="relative">
              <button onClick={() => setShowLangDropdown(!showLangDropdown)} className={row}>
                <div className={icon('bg-purple-50 text-purple-500')}><Globe size={12} /></div>
                <span className="flex-1 font-bold text-slate-700 dark:text-slate-200 text-[10px]">{t[language].profile.language}</span>
                <span className="text-[8px] font-black text-slate-400 mr-1.5 uppercase bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded transition-all">{language.toUpperCase()}</span>
                <ChevronRight size={11} className={`text-slate-300 transition-transform ${showLangDropdown ? 'rotate-90' : ''}`} />
              </button>
              
              {showLangDropdown && (
                <div className="absolute top-[100%] right-2 w-32 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-100 dark:border-slate-700 z-50 overflow-hidden">
                  <button 
                    onClick={() => { setLanguage('en'); setShowLangDropdown(false); }}
                    className={`w-full text-left px-3 py-2 text-[10px] font-bold flex items-center justify-between ${language === 'en' ? 'text-purple-600 bg-purple-50 dark:bg-purple-900/20' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                  >
                    English
                    {language === 'en' && <Check size={10} />}
                  </button>
                  <button 
                    onClick={() => { setLanguage('am'); setShowLangDropdown(false); }}
                    className={`w-full text-left px-3 py-2 text-[10px] font-bold flex items-center justify-between border-t border-slate-100 dark:border-slate-700 ${language === 'am' ? 'text-purple-600 bg-purple-50 dark:bg-purple-900/20' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                  >
                    አማርኛ
                    {language === 'am' && <Check size={10} />}
                  </button>
                </div>
              )}
              {showLangDropdown && <div className="fixed inset-0 z-40" onClick={() => setShowLangDropdown(false)} />}
            </div>

            <button onClick={toggleDarkMode} className={row}>
              <div className={icon('bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300')}><Moon size={12} /></div>
              <span className="flex-1 font-bold text-slate-700 dark:text-slate-200 text-[10px]">{t[language].profile.darkMode}</span>
              <div className={`w-7 h-3.5 rounded-full relative mr-1 transition-colors ${isDarkMode ? 'bg-violet-500' : 'bg-slate-200'}`}>
                <div className={`w-3 h-3 bg-white rounded-full absolute top-[1px] shadow-sm transition-all duration-300 ${isDarkMode ? 'left-[15px]' : 'left-[1px]'}`} />
              </div>
            </button>

            <button onClick={() => navigateTo('/support')} className={row}>
              <div className={icon('bg-purple-50 text-purple-600')}><Bot size={12} /></div>
              <span className="flex-1 font-bold text-slate-700 dark:text-slate-200 text-[10px]">{t[language].profile.aiAssistance || 'AI Assistance'}</span>
              <ChevronRight size={11} className="text-slate-300" />
            </button>

            <button onClick={handleSupport} className={row}>
              <div className={icon('bg-orange-50 text-orange-500')}><Headphones size={12} /></div>
              <span className="flex-1 font-bold text-slate-700 dark:text-slate-200 text-[10px]">{t[language].profile.support}</span>
              <ChevronRight size={11} className="text-slate-300" />
            </button>

            <button onClick={handleChannel} className={row}>
              <div className={icon('bg-indigo-50 text-indigo-500')}><Megaphone size={12} /></div>
              <span className="flex-1 font-bold text-slate-700 dark:text-slate-200 text-[10px]">{t[language].profile.channel}</span>
              <ChevronRight size={11} className="text-slate-300" />
            </button>

            {/* Change Password (Only for registered account users) */}
            {isRegisteredAccount && (
              <button
                onClick={() => {
                  setPassError(null);
                  setPassSuccess(null);
                  setShowChangePassword(true);
                }}
                className={row}
              >
                <div className={icon('bg-amber-50 text-amber-600')}><KeyRound size={12} /></div>
                <span className="flex-1 font-bold text-slate-700 dark:text-slate-200 text-[10px]">Change Password • የይለፍ ቃል ቀይር</span>
                <ChevronRight size={11} className="text-slate-300" />
              </button>
            )}

            {/* PWA Auth Switch or Logout */}
            {user ? (
              <button
                onClick={() => {
                  logoutPwa();
                  setProfileOpen(false);
                  setAuthModalOpen(true);
                }}
                className={row}
              >
                <div className={icon('bg-rose-50 text-rose-500')}><LogOut size={12} /></div>
                <span className="flex-1 font-bold text-rose-600 dark:text-rose-400 text-[10px]">Log Out • ውጣ</span>
                <ChevronRight size={11} className="text-slate-300" />
              </button>
            ) : (
              <button
                onClick={() => {
                  setProfileOpen(false);
                  setAuthModalOpen(true);
                }}
                className={row}
              >
                <div className={icon('bg-amber-50 text-amber-500')}><Sparkles size={12} /></div>
                <span className="flex-1 font-bold text-amber-600 dark:text-amber-400 text-[10px]">Register / Login • ተመዝገብ</span>
                <ChevronRight size={11} className="text-slate-300" />
              </button>
            )}

          </div>
        </div>
      </div>

      {/* ── CHANGE PASSWORD MODAL (CLEAN WHITE THEME) ── */}
      {showChangePassword && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowChangePassword(false)}
        >
          <div 
            className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-amber-200 relative flex flex-col space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                  <KeyRound size={16} />
                </div>
                <h3 className="text-sm font-black text-slate-900">Change Password • የይለፍ ቃል ቀይር</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowChangePassword(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {passError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start space-x-2 text-rose-700 text-xs">
                <AlertCircle size={14} className="shrink-0 mt-0.5 text-rose-500" />
                <span className="flex-1 font-medium leading-snug">{passError}</span>
              </div>
            )}

            {passSuccess && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-2 text-emerald-700 text-xs font-bold">
                <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
                <span>{passSuccess}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3">
              {/* Previous password */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Current Password • የድሮው ይለፍ ቃል
                </label>
                <div className="relative">
                  <input
                    type={showCurrPass ? 'text' : 'password'}
                    required
                    value={currPass}
                    onChange={(e) => { setCurrPass(e.target.value); setPassError(null); }}
                    placeholder="Enter current password"
                    className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 focus:bg-white focus:border-amber-500 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrPass(!showCurrPass)}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    {showCurrPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* New password */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  New Password • አዲሱ ይለፍ ቃል
                </label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    required
                    value={newPass}
                    onChange={(e) => { setNewPass(e.target.value); setPassError(null); }}
                    placeholder="Min 4 characters"
                    className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 focus:bg-white focus:border-amber-500 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    {showNewPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Confirm new password */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Confirm New Password • በድጋሚ ያስገቡ
                </label>
                <input
                  type={showNewPass ? 'text' : 'password'}
                  required
                  value={confirmPass}
                  onChange={(e) => { setConfirmPass(e.target.value); setPassError(null); }}
                  placeholder="Repeat new password"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:bg-white focus:border-amber-500 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={passLoading}
                className="w-full mt-2 py-2.5 px-4 bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-500 text-slate-950 font-black text-xs rounded-xl shadow-md shadow-amber-500/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center space-x-1.5"
              >
                {passLoading ? (
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>Update Password • ቀይር</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── ROOM SELECTION MODAL ── */}
      {showRoomModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                  <DoorOpen size={18} />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-800 dark:text-white">
                    {language === 'am' ? 'ክፍል ምረጥ' : 'Room Selection'}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold">
                    {language === 'am' ? 'የሚጫወቱበትን ክፍል ይምረጡ' : 'Choose which room you want to play in'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowRoomModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-90 transition-all"
              >
                <X size={16} />
              </button>
            </div>

            {/* Search */}
            <div className="p-3 border-b border-slate-100 dark:border-slate-800">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={roomSearch}
                  onChange={(e) => setRoomSearch(e.target.value)}
                  placeholder={language === 'am' ? 'ክፍል ፈልግ...' : 'Search room by name...'}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/80 rounded-xl text-xs font-bold text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Feedback message */}
            {roomSuccessMsg && (
              <div className="mx-3 mt-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2 text-emerald-700 dark:text-emerald-300 text-xs font-black animate-in fade-in">
                <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                <span>{roomSuccessMsg}</span>
              </div>
            )}

            {/* Room List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredRooms.map((r) => {
                const isSelected = r.id === userRoomId;
                return (
                  <button
                    key={r.id}
                    disabled={selectingRoom}
                    onClick={() => handleSelectRoom(r.id)}
                    className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-all active:scale-[0.98] ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-400 dark:border-amber-500/50 shadow-xs'
                        : 'bg-white dark:bg-slate-800/70 border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-amber-500 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}>
                        <DoorOpen size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-black text-xs text-slate-800 dark:text-white truncate">
                            {r.room_name}
                          </p>
                          {r.is_pinned && (
                            <span className="text-[8px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-black px-1.5 py-0.2 rounded-full uppercase">
                              Official
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-0.5">
                          <Users size={10} className="inline mr-1 -mt-0.5" />
                          {r.total_players || 0} {language === 'am' ? 'ተጫዋቾች' : 'players'}
                        </p>
                      </div>
                    </div>
                    {isSelected ? (
                      <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs shrink-0">
                        <Check size={14} />
                      </div>
                    ) : (
                      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 hover:text-amber-600 shrink-0">
                        {language === 'am' ? 'ምረጥ' : 'Select'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
