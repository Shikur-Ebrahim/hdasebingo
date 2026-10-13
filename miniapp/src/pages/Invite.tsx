import { useState } from 'react';
import { ArrowLeft, Share2, Copy, Check, Users, Gift, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { t } from '../lib/translations';
import WebApp from '@twa-dev/sdk';

export default function Invite() {
  const { user, setProfileOpen, language } = useGameStore();
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  // The bot username should ideally come from env, but we can hardcode for hdasebingo
  const botUsername = import.meta.env.VITE_BOT_USERNAME || 'hdasebingo_bot';
  const inviteLink = `https://t.me/${botUsername}?start=ref_${user?.telegram_id || 'player'}`;

  const handleBack = () => {
    navigate(-1);
    setTimeout(() => setProfileOpen(true), 50);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      if (typeof WebApp !== 'undefined') WebApp.HapticFeedback.impactOccurred('light');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleShare = () => {
    const text = `🎮 Play Hdasebingo with me! Join using my link and let's win together!\n\n${inviteLink}`;
    if (typeof WebApp !== 'undefined') {
      // Use Telegram's native share feature if available
      WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent('🎮 Play Hdasebingo with me! Join using my link and let\'s win together!')}`);
    } else {
      // Fallback
      if (navigator.share) {
        navigator.share({
          title: 'Hdasebingo',
          text: 'Play Hdasebingo with me!',
          url: inviteLink,
        }).catch(console.error);
      } else {
        handleCopy();
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col pb-24">
      {/* HEADER */}
      <div className="bg-white dark:bg-slate-900 px-4 pt-6 pb-4 shadow-sm border-b border-gray-100 dark:border-slate-800 flex items-center sticky top-0 z-10">
        <button
          onClick={handleBack}
          className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 active:bg-slate-200 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="ml-4 flex-1">
          <h1 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{t[language].invite.title}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t[language].invite.subtitle}</p>
        </div>
      </div>

      <div className="px-4 py-3 flex flex-col space-y-3 flex-1 overflow-hidden">

        {/* COMPACT HERO BANNER */}
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-4 text-white shadow-sm relative overflow-hidden flex items-center space-x-4 shrink-0">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white dark:bg-slate-900/10 rounded-full -mr-8 -mt-8 blur-xl"></div>
          <div className="w-12 h-12 bg-white dark:bg-slate-900/20 rounded-full flex items-center justify-center shrink-0 backdrop-blur-sm z-10">
            <Gift size={24} className="text-white" />
          </div>
          <div className="z-10">
            <h2 className="text-lg font-black leading-tight mb-0.5">{t[language].invite.heroTitle}</h2>
            <p className="text-white/90 text-[11px] font-medium leading-snug">
              {t[language].invite.heroDesc}
            </p>
          </div>
        </div>

        {/* LINK SECTION (MOVED UP) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-slate-800 shrink-0">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">{t[language].invite.linkTitle}</label>
          <div className="flex bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden p-1 mb-3">
            <div className="flex-1 px-2 py-2 overflow-x-auto whitespace-nowrap hide-scrollbar flex items-center">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{inviteLink}</span>
            </div>
            <button
              onClick={handleCopy}
              className={`shrink-0 w-10 h-8 rounded-lg flex items-center justify-center transition-colors ${copied ? 'bg-emerald-500 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:bg-slate-800'}`}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>

          <button
            onClick={handleShare}
            className="w-full bg-slate-800 text-white hover:bg-slate-700 py-2.5 rounded-xl font-black text-sm shadow-sm transition-transform active:scale-95 flex items-center justify-center space-x-2"
          >
            <Share2 size={16} />
            <span>{t[language].invite.shareBtn}</span>
          </button>
        </div>

        {/* COMPACT HOW IT WORKS */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-slate-800 flex-1">
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-3">{t[language].invite.howItWorks}</h3>
          <div className="space-y-3">
            <div className="flex items-center">
              <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center font-black text-[10px] shrink-0 mr-3">1</div>
              <div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{t[language].invite.step1Title}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">{t[language].invite.step1Desc}</p>
              </div>
            </div>
            <div className="flex items-center">
              <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center font-black text-[10px] shrink-0 mr-3">2</div>
              <div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{t[language].invite.step2Title}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">{t[language].invite.step2Desc}</p>
              </div>
            </div>
            <div className="flex items-center">
              <div className="w-7 h-7 rounded-full bg-purple-50 text-purple-500 flex items-center justify-center font-black text-[10px] shrink-0 mr-3">3</div>
              <div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{t[language].invite.step3Title}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">{t[language].invite.step3Desc}</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
