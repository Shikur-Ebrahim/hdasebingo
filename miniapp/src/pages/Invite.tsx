import { useState, useRef } from 'react';
import { 
  ArrowLeft, Share2, Copy, Check, Gift, QrCode, Link2, 
  Download, Maximize2, X, Sparkles, CheckCircle2 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { t } from '../lib/translations';
import WebApp from '@twa-dev/sdk';
import { QRCodeCanvas } from 'qrcode.react';

export default function Invite() {
  const { user, setProfileOpen, language } = useGameStore();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [activeTab, setActiveTab] = useState<'qr' | 'link'>('qr');
  const [showFullscreenQR, setShowFullscreenQR] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const navigate = useNavigate();

  const botUsername = import.meta.env.VITE_BOT_USERNAME || 'hdasebingo_bot';
  const refCode = `ref_${user?.telegram_id || 'player'}`;
  const inviteLink = `https://t.me/${botUsername}?start=${refCode}`;

  const handleBack = () => {
    navigate(-1);
    setTimeout(() => setProfileOpen(true), 50);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopiedLink(true);
      if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.impactOccurred('light');
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(refCode).then(() => {
      setCopiedCode(true);
      if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.impactOccurred('light');
      setTimeout(() => setCopiedCode(false), 2000);
    });
  };

  const handleShare = () => {
    const text = `🎮 Play Hdasebingo with me! Join using my link and let's win together!\n\n${inviteLink}`;
    if (typeof WebApp !== 'undefined' && WebApp.openTelegramLink) {
      WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent("🎮 Play Hdasebingo with me! Join using my link and let's win together!")}`);
    } else if (navigator.share) {
      navigator.share({
        title: 'Hdasebingo',
        text: 'Play Hdasebingo with me!',
        url: inviteLink,
      }).catch(() => {});
    } else {
      handleCopyLink();
    }
  };

  // Generate and download a branded invitation poster
  const handleDownloadQR = () => {
    const qrCanvas = qrCanvasRef.current;
    if (!qrCanvas) return;

    try {
      const canvas = document.createElement('canvas');
      const width = 600;
      const height = 750;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Dark luxury gradient background
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, '#0f172a');
      bgGrad.addColorStop(0.5, '#1e1b4b');
      bgGrad.addColorStop(1, '#020617');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Decorative ambient glow
      ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
      ctx.beginPath();
      ctx.arc(100, 100, 140, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(147, 51, 234, 0.15)';
      ctx.beginPath();
      ctx.arc(500, 650, 180, 0, Math.PI * 2);
      ctx.fill();

      // Brand Title
      ctx.fillStyle = '#f59e0b';
      ctx.font = '900 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('HDASE BINGO', width / 2, 70);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 15px sans-serif';
      ctx.fillText('Official Ethiopian Bingo • Scan to Play & Win', width / 2, 102);

      // White card container with rounded corners
      const cardX = 80;
      const cardY = 135;
      const cardW = 440;
      const cardH = 440;
      const radius = 24;

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, radius);
      ctx.fill();

      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Draw QR code onto white card
      const qrDrawSize = 350;
      const qrDrawX = (width - qrDrawSize) / 2;
      const qrDrawY = cardY + 45;
      ctx.drawImage(qrCanvas, qrDrawX, qrDrawY, qrDrawSize, qrDrawSize);

      // Center Bingo Badge on card
      const centerX = width / 2;
      const centerY = qrDrawY + qrDrawSize / 2;
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 24, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('75', centerX, centerY);
      ctx.textBaseline = 'alphabetic';

      // Referral code text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px monospace';
      ctx.fillText(`CODE: ${refCode}`, width / 2, 625);

      // Subtitle
      ctx.fillStyle = '#a855f7';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('Scan with Camera or Telegram to Join & Earn Bonus!', width / 2, 660);

      // Download trigger
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `hdasebingo-invite-${user?.telegram_id || 'player'}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setDownloaded(true);
      if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.notificationOccurred('success');
      setTimeout(() => setDownloaded(false), 2000);
    } catch (e) {
      console.error('Download QR failed', e);
    }
  };

  const handleShareQR = () => {
    const qrCanvas = qrCanvasRef.current;
    if (qrCanvas && navigator.canShare) {
      try {
        qrCanvas.toBlob(blob => {
          if (!blob) {
            handleShare();
            return;
          }
          const file = new File([blob], `hdasebingo-qr-${user?.telegram_id || 'invite'}.png`, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            navigator.share({
              title: 'Hdasebingo Invite',
              text: `🎮 Play Hdasebingo with me! Join using my link: ${inviteLink}`,
              files: [file],
            }).catch(() => handleShare());
            return;
          }
          handleShare();
        });
        return;
      } catch {
        handleShare();
      }
    }
    handleShare();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col pb-24 select-none">
      {/* HEADER */}
      <div className="bg-white dark:bg-slate-900 px-4 pt-4 pb-3 shadow-xs border-b border-gray-100 dark:border-slate-800 flex items-center sticky top-0 z-20">
        <button
          onClick={handleBack}
          className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 active:scale-95 transition-transform"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="ml-3 flex-1">
          <h1 className="text-lg font-black text-slate-800 dark:text-slate-100 tracking-tight leading-tight">
            {t[language].invite.title}
          </h1>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            {t[language].invite.subtitle}
          </p>
        </div>
      </div>

      <div className="px-4 py-3 flex flex-col space-y-3 flex-1 overflow-y-auto">

        {/* HERO BANNER */}
        <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-700 rounded-2xl p-3.5 text-white shadow-sm relative overflow-hidden flex items-center space-x-3 shrink-0">
          <div className="absolute top-0 right-0 w-28 h-28 bg-white/10 rounded-full -mr-8 -mt-8 blur-xl pointer-events-none" />
          <div className="w-11 h-11 bg-white/20 border border-white/30 rounded-2xl flex items-center justify-center shrink-0 backdrop-blur-xs shadow-inner">
            <Gift size={22} className="text-white drop-shadow-sm" />
          </div>
          <div className="flex-1 min-w-0 z-10">
            <div className="flex items-center gap-1.5 mb-0.5">
              <h2 className="text-base font-black leading-tight truncate">
                {t[language].invite.heroTitle}
              </h2>
              <span className="bg-amber-400 text-amber-950 text-[8px] font-black px-1.5 py-0.2 rounded-full uppercase tracking-wider">
                10% BONUS
              </span>
            </div>
            <p className="text-white/90 text-[10.5px] font-medium leading-snug">
              {t[language].invite.heroDesc}
            </p>
          </div>
        </div>

        {/* TAB SELECTOR: QR CODE vs LINK */}
        <div className="bg-slate-200/80 dark:bg-slate-800 p-1 rounded-2xl flex items-center shrink-0 shadow-inner">
          <button
            onClick={() => setActiveTab('qr')}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'qr'
                ? 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800'
            }`}
          >
            <QrCode size={15} />
            <span>{t[language].invite.qrCode || 'QR Code'}</span>
          </button>
          <button
            onClick={() => setActiveTab('link')}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'link'
                ? 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800'
            }`}
          >
            <Link2 size={15} />
            <span>{t[language].invite.link || 'Invite Link'}</span>
          </button>
        </div>

        {/* TAB 1: ADVANCED QR CODE CARD */}
        {activeTab === 'qr' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-center shrink-0">
            {/* Top header info */}
            <div className="flex items-center justify-between w-full mb-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wide">
                  {t[language].invite.scanToJoin || 'Scan to Join & Play'}
                </span>
              </div>
              <button
                onClick={() => setShowFullscreenQR(true)}
                className="flex items-center gap-1 px-2.5 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg text-[10px] font-bold active:scale-95 transition-all"
                title={t[language].invite.tapToExpand || 'Fullscreen'}
              >
                <Maximize2 size={11} />
                <span>{language === 'am' ? 'አጉላ' : 'Enlarge'}</span>
              </button>
            </div>

            {/* QR Code Frame with interactive scanner corners */}
            <div 
              onClick={() => setShowFullscreenQR(true)}
              className="relative p-3.5 bg-gradient-to-b from-purple-50/60 to-amber-50/50 dark:from-slate-800/80 dark:to-slate-800/40 rounded-2xl border border-purple-200/80 dark:border-purple-800/40 cursor-pointer group shadow-inner transition-transform active:scale-98"
            >
              {/* Corner brackets */}
              <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-purple-500 rounded-tl-sm pointer-events-none" />
              <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-purple-500 rounded-tr-sm pointer-events-none" />
              <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-purple-500 rounded-bl-sm pointer-events-none" />
              <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-purple-500 rounded-br-sm pointer-events-none" />

              <div className="bg-white p-2.5 rounded-xl shadow-xs relative">
                <QRCodeCanvas
                  ref={qrCanvasRef}
                  value={inviteLink}
                  size={180}
                  level="H"
                  includeMargin={false}
                  fgColor="#0f172a"
                  bgColor="#ffffff"
                />

                {/* Center Badge */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-400 border-2 border-white shadow-md flex items-center justify-center text-white font-black text-xs">
                    75
                  </div>
                </div>
              </div>
            </div>

            {/* Referral Code Chip */}
            <div className="mt-3 w-full flex items-center justify-between bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3 py-2">
              <div className="flex flex-col text-left truncate mr-2">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                  {t[language].invite.referralCode || 'Referral Code'}
                </span>
                <span className="font-mono text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                  {refCode}
                </span>
              </div>
              <button
                onClick={handleCopyCode}
                className="shrink-0 px-2.5 py-1 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-lg text-[10px] font-bold active:scale-95 transition-all flex items-center gap-1 shadow-2xs"
              >
                {copiedCode ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                <span>{copiedCode ? (language === 'am' ? 'ተቀድቷል' : 'Copied') : (language === 'am' ? 'ቅዳ' : 'Copy')}</span>
              </button>
            </div>

            {/* Action Buttons Row */}
            <div className="grid grid-cols-2 gap-2 w-full mt-3">
              <button
                onClick={handleDownloadQR}
                className={`py-2.5 px-3 rounded-xl font-black text-xs shadow-xs transition-all active:scale-95 flex items-center justify-center gap-1.5 border ${
                  downloaded 
                    ? 'bg-emerald-500 text-white border-emerald-500' 
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                }`}
              >
                {downloaded ? <CheckCircle2 size={15} /> : <Download size={15} className="text-purple-600 dark:text-purple-400" />}
                <span>{downloaded ? (language === 'am' ? 'ወርዷል!' : 'Saved!') : (t[language].invite.downloadQR || 'Save QR')}</span>
              </button>

              <button
                onClick={handleShareQR}
                className="py-2.5 px-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-black text-xs shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1.5 hover:opacity-95"
              >
                <Share2 size={15} />
                <span>{t[language].invite.shareQR || 'Share QR'}</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: LINK SECTION */}
        {activeTab === 'link' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-slate-800 shrink-0">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">
              {t[language].invite.linkTitle}
            </label>
            <div className="flex bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden p-1 mb-3">
              <div className="flex-1 px-2 py-2 overflow-x-auto whitespace-nowrap hide-scrollbar flex items-center">
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 font-mono">
                  {inviteLink}
                </span>
              </div>
              <button
                onClick={handleCopyLink}
                className={`shrink-0 w-10 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  copiedLink 
                    ? 'bg-emerald-500 text-white' 
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                }`}
              >
                {copiedLink ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>

            <button
              onClick={handleShare}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-xl font-black text-sm shadow-sm transition-transform active:scale-95 flex items-center justify-center space-x-2"
            >
              <Share2 size={16} />
              <span>{t[language].invite.shareBtn}</span>
            </button>
          </div>
        )}

        {/* COMPACT HOW IT WORKS */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-slate-800">
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-1.5">
            <Sparkles size={14} className="text-amber-500" />
            <span>{t[language].invite.howItWorks}</span>
          </h3>
          <div className="space-y-3">
            <div className="flex items-center">
              <div className="w-7 h-7 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black text-[11px] shrink-0 mr-3 shadow-2xs">
                1
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{t[language].invite.step1Title}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                  {language === 'am' ? 'የመጋበዣ ሊንክዎን ወይም QR ኮድዎን ለጓደኞች ያጋሩ።' : 'Send your invite link or show your QR code to friends.'}
                </p>
              </div>
            </div>
            <div className="flex items-center">
              <div className="w-7 h-7 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-[11px] shrink-0 mr-3 shadow-2xs">
                2
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{t[language].invite.step2Title}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">{t[language].invite.step2Desc}</p>
              </div>
            </div>
            <div className="flex items-center">
              <div className="w-7 h-7 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black text-[11px] shrink-0 mr-3 shadow-2xs">
                3
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{t[language].invite.step3Title}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">{t[language].invite.step3Desc}</p>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* FULLSCREEN IN-PERSON SCAN MODAL */}
      {showFullscreenQR && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setShowFullscreenQR(false)}
        >
          <div 
            className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-white/20 flex flex-col items-center text-center relative"
            onClick={e => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowFullscreenQR(false)}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            >
              <X size={18} />
            </button>

            <div className="w-10 h-10 rounded-2xl bg-amber-400/20 text-amber-600 flex items-center justify-center mb-2 font-black">
              <QrCode size={22} />
            </div>

            <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
              {t[language].invite.scanToJoin || 'Scan to Join & Play'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
              {language === 'am' ? 'ጓደኛዎ በስልካቸው ካሜራ ወይም ቴሌግራም ስካን ያድርጉ' : 'Have your friend point their phone camera or Telegram scanner'}
            </p>

            {/* High-contrast QR Canvas */}
            <div className="p-4 bg-white rounded-2xl shadow-md border-2 border-amber-300 relative">
              <QRCodeCanvas
                ref={fullscreenCanvasRef}
                value={inviteLink}
                size={230}
                level="H"
                includeMargin={false}
                fgColor="#000000"
                bgColor="#ffffff"
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-400 border-2 border-white shadow-lg flex items-center justify-center text-white font-black text-sm">
                  75
                </div>
              </div>
            </div>

            {/* Referral Code Chip */}
            <div className="mt-4 flex items-center justify-between w-full bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2 border border-slate-200 dark:border-slate-700">
              <span className="font-mono text-xs font-black text-slate-800 dark:text-slate-200">
                {refCode}
              </span>
              <button
                onClick={handleCopyCode}
                className="text-[10px] font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1"
              >
                {copiedCode ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                <span>{copiedCode ? (language === 'am' ? 'ተቀድቷል' : 'Copied') : (language === 'am' ? 'ቅዳ' : 'Copy')}</span>
              </button>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2 w-full mt-4">
              <button
                onClick={handleDownloadQR}
                className="py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-95"
              >
                <Download size={14} />
                <span>{downloaded ? 'Saved!' : 'Save'}</span>
              </button>
              <button
                onClick={handleShare}
                className="py-2.5 bg-purple-600 text-white hover:bg-purple-700 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-sm"
              >
                <Share2 size={14} />
                <span>{t[language].invite.shareBtn}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
