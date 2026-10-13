import { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { t } from '../lib/translations';
import { 
  Wallet, Gift, PlusCircle, ArrowDownToLine, Share2, 
  ArrowRightLeft, History, Users, Globe, Headphones, Megaphone,
  ChevronRight, X, Moon, BarChart2, Copy, Check, BookOpen
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function Profile() {
  const { user, isProfileOpen, setProfileOpen, isDarkMode, toggleDarkMode, language, setLanguage } = useGameStore();
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [supportUsername, setSupportUsername] = useState('hdasebingo_admin');
  const [channelLink, setChannelLink] = useState('https://t.me/hdasebingo');
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

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
        {/* ── HEADER ── */}
        <div className="bg-slate-900 rounded-br-[1.5rem] px-4 pt-4 pb-4 shadow-md relative shrink-0">
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
          <div className="bg-white dark:bg-slate-800 rounded-2xl px-1.5 shadow-sm border border-gray-100 dark:border-slate-700 flex flex-col flex-1 justify-around py-1">

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

            <button onClick={() => navigateTo('/games-report')} className={row}>
              <div className={icon('bg-teal-50 text-teal-500')}><BarChart2 size={12} /></div>
              <span className="flex-1 font-bold text-slate-700 dark:text-slate-200 text-[10px]">{t[language].profile.gamesReport}</span>
              <ChevronRight size={11} className="text-slate-300" />
            </button>

            <button onClick={() => navigateTo('/audit')} className={row}>
              <div className={icon('bg-indigo-50 text-indigo-500')}><History size={12} /></div>
              <span className="flex-1 font-bold text-slate-700 dark:text-slate-200 text-[10px]">{t[language].profile.fullAudit}</span>
              <ChevronRight size={11} className="text-slate-300" />
            </button>

            <button onClick={() => navigateTo('/invited')} className={row}>
              <div className={icon('bg-emerald-50 text-emerald-500')}><Users size={12} /></div>
              <span className="flex-1 font-bold text-slate-700 dark:text-slate-200 text-[10px]">{t[language].profile.invitePerson}</span>
              <ChevronRight size={11} className="text-slate-300" />
            </button>

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

          </div>
        </div>
      </div>
    </>
  );
}
