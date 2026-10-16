import { useState, useRef } from 'react';
import { 
  ArrowLeft, Share2, Copy, Check, Gift, QrCode, Link2, 
  Download, Maximize2, X, Sparkles, CheckCircle2, Crown, RefreshCw 
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

  // Generate the luxury branded invite canvas (same style as Agent flyer)
  const generateInviteCanvas = (): HTMLCanvasElement | null => {
    const qrCanvas = qrCanvasRef.current;
    if (!qrCanvas) return null;

    try {
      const canvas = document.createElement('canvas');
      const width = 800;
      const height = 1150;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // 1. Warm ivory luxury background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#ffffff');
      bgGrad.addColorStop(0.3, '#fdfcf9');
      bgGrad.addColorStop(0.7, '#faf5ea');
      bgGrad.addColorStop(1, '#f5edd9');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Radial ambient lighting
      const radial = ctx.createRadialGradient(width / 2, 450, 50, width / 2, 450, 550);
      radial.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
      radial.addColorStop(1, 'rgba(245, 235, 215, 0)');
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, width, height);

      // 2. Double gold ornate border frame
      ctx.strokeStyle = '#c59b27';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(20, 20, width - 40, height - 40);
      ctx.strokeStyle = '#e6c86e';
      ctx.lineWidth = 1;
      ctx.strokeRect(26, 26, width - 52, height - 52);

      // Corner diamond ornaments
      const drawDiamond = (x: number, y: number, s: number) => {
        ctx.fillStyle = '#b8860b';
        ctx.beginPath();
        ctx.moveTo(x, y - s);
        ctx.lineTo(x + s, y);
        ctx.lineTo(x, y + s);
        ctx.lineTo(x - s, y);
        ctx.closePath();
        ctx.fill();
      };
      drawDiamond(26, 26, 4);
      drawDiamond(width - 26, 26, 4);
      drawDiamond(26, height - 26, 4);
      drawDiamond(width - 26, height - 26, 4);

      // 3. Top Royal Crown & Medallion Emblem
      const emblemY = 82;
      const emblemX = width / 2;

      ctx.fillStyle = '#d4af37';
      ctx.beginPath();
      ctx.roundRect(emblemX - 22, emblemY - 34, 44, 7, 2);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(emblemX - 22, emblemY - 34);
      ctx.lineTo(emblemX - 25, emblemY - 52);
      ctx.lineTo(emblemX - 12, emblemY - 40);
      ctx.lineTo(emblemX, emblemY - 56);
      ctx.lineTo(emblemX + 12, emblemY - 40);
      ctx.lineTo(emblemX + 25, emblemY - 52);
      ctx.lineTo(emblemX + 22, emblemY - 34);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#fef08a';
      [-25, -12, 0, 12, 25].forEach((px, idx) => {
        const py = idx === 2 ? emblemY - 57 : (idx === 0 || idx === 4) ? emblemY - 53 : emblemY - 41;
        ctx.beginPath();
        ctx.arc(emblemX + px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.fillStyle = '#1c150c';
      ctx.beginPath();
      ctx.arc(emblemX, emblemY - 10, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(emblemX, emblemY - 10, 20, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.font = '900 18px "Times New Roman", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('HB', emblemX, emblemY - 9);
      ctx.textBaseline = 'alphabetic';

      ctx.strokeStyle = '#c59b27';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(emblemX - 35, emblemY - 10);
      ctx.bezierCurveTo(emblemX - 55, emblemY - 24, emblemX - 70, emblemY + 2, emblemX - 90, emblemY - 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(emblemX + 35, emblemY - 10);
      ctx.bezierCurveTo(emblemX + 55, emblemY - 24, emblemX + 70, emblemY + 2, emblemX + 90, emblemY - 6);
      ctx.stroke();

      // 4. Main Title
      ctx.fillStyle = '#140f09';
      ctx.font = '900 40px "Times New Roman", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('HDASE BINGO', width / 2, 142);

      // 5. Subtitle with divider lines — personalized with player's first name
      ctx.fillStyle = '#8a6a1d';
      ctx.font = 'bold 12.5px sans-serif';
      const playerName = (user?.first_name || user?.username || 'A PLAYER').toUpperCase();
      const subText = `PLAYER INVITE \u2022 ${playerName}'S INVITATION`;
      ctx.fillText(subText, width / 2, 172);

      const subWidth = ctx.measureText(subText).width;
      const lineY = 168;
      const lineLen = Math.max(20, (width - 80 - subWidth) / 2 - 12);
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(width / 2 - subWidth / 2 - 12 - lineLen, lineY);
      ctx.lineTo(width / 2 - subWidth / 2 - 12, lineY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(width / 2 + subWidth / 2 + 12, lineY);
      ctx.lineTo(width / 2 + subWidth / 2 + 12 + lineLen, lineY);
      ctx.stroke();

      // 6. "SCAN TO JOIN" with wing ornaments
      const scanY = 224;
      ctx.fillStyle = '#17120a';
      ctx.font = '900 35px "Times New Roman", Georgia, sans-serif';
      ctx.fillText('SCAN TO JOIN', width / 2, scanY);

      const scanWidth = ctx.measureText('SCAN TO JOIN').width;
      const wingLeftX = width / 2 - scanWidth / 2 - 25;
      const wingRightX = width / 2 + scanWidth / 2 + 25;

      const drawWing = (cx: number, cy: number, isRight: boolean) => {
        ctx.fillStyle = '#c59b27';
        const dir = isRight ? 1 : -1;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.ellipse(cx + dir * 10, cy + i * 8, 11, 4, (dir * (i * 25) * Math.PI) / 180, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.moveTo(cx + dir * 26, cy);
        ctx.lineTo(cx + dir * 18, cy - 7);
        ctx.lineTo(cx + dir * 18, cy + 7);
        ctx.closePath();
        ctx.fill();
      };
      drawWing(wingLeftX, scanY - 11, false);
      drawWing(wingRightX, scanY - 11, true);

      // 7. Gold Ribbon Banner
      const ribbonW = 460;
      const ribbonH = 40;
      const ribbonX = (width - ribbonW) / 2;
      const ribbonY = 248;

      const ribGrad = ctx.createLinearGradient(ribbonX, ribbonY, ribbonX + ribbonW, ribbonY);
      ribGrad.addColorStop(0, '#ebd596');
      ribGrad.addColorStop(0.5, '#deb55b');
      ribGrad.addColorStop(1, '#ebd596');
      ctx.fillStyle = ribGrad;
      ctx.beginPath();
      ctx.roundRect(ribbonX, ribbonY, ribbonW, ribbonH, 20);
      ctx.fill();
      ctx.strokeStyle = '#a67718';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const midRibY = ribbonY + ribbonH / 2;
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#3a2707';
      const part1 = 'SCAN THE QR CODE TO ';
      const p1W = ctx.measureText(part1).width;
      ctx.font = 'italic bold 18px "Brush Script MT", "Great Vibes", "Lucida Calligraphy", cursive';
      const part2 = 'Join & Win Bonus!';
      const p2W = ctx.measureText(part2).width;
      const startRibTextX = width / 2 - (p1W + p2W) / 2;

      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#3a2707';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(part1, startRibTextX, midRibY);
      ctx.font = 'italic bold 19px "Brush Script MT", "Great Vibes", "Lucida Calligraphy", cursive';
      ctx.fillStyle = '#831414';
      ctx.fillText(part2, startRibTextX + p1W, midRibY);
      ctx.textBaseline = 'alphabetic';

      // 8. Central White Card with QR Code
      const cardW = 530;
      const cardH = 530;
      const cardX = (width - cardW) / 2;
      const cardY = 308;
      const cardRadius = 32;

      ctx.shadowColor = 'rgba(120, 80, 20, 0.12)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, cardRadius);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#c59b27';
      ctx.lineWidth = 4.5;
      ctx.stroke();
      ctx.strokeStyle = '#fae596';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(cardX + 4, cardY + 4, cardW - 8, cardH - 8, cardRadius - 4);
      ctx.stroke();

      // Draw QR Code
      const qrSize = 440;
      const qrX = cardX + (cardW - qrSize) / 2;
      const qrY = cardY + (cardH - qrSize) / 2;
      ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

      // HDASE BINGO Badge on QR
      const centerBadgeW = 114;
      const centerBadgeH = 50;
      const centerBadgeX = width / 2 - centerBadgeW / 2;
      const centerBadgeY = qrY + qrSize / 2 - centerBadgeH / 2;

      const badgeGrad = ctx.createLinearGradient(centerBadgeX, centerBadgeY, centerBadgeX + centerBadgeW, centerBadgeY + centerBadgeH);
      badgeGrad.addColorStop(0, '#f59e0b');
      badgeGrad.addColorStop(1, '#d97706');
      ctx.fillStyle = badgeGrad;
      ctx.beginPath();
      ctx.roundRect(centerBadgeX, centerBadgeY, centerBadgeW, centerBadgeH, 12);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 10.5px sans-serif';
      ctx.fillText('HDASE', width / 2, centerBadgeY + 18);
      ctx.font = '900 16px sans-serif';
      ctx.fillText('BINGO', width / 2, centerBadgeY + 38);

      // 9. Feature icons row
      ctx.strokeStyle = '#c59b27';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(width / 2, 830, 360, 0.25 * Math.PI, 0.75 * Math.PI);
      ctx.stroke();

      const featY = 880;
      const feats = [
        { icon: '\uD83C\uDF81', text: '10% BONUS' },
        { icon: '\u26A1', text: 'INSTANT PAY' },
        { icon: '\uD83C\uDFB1', text: '75 BINGO' },
        { icon: '\uD83D\uDEE1\uFE0F', text: 'VERIFIED' },
      ];
      const colW = (width - 120) / 4;
      feats.forEach((f, idx) => {
        const colX = 60 + idx * colW + colW / 2;
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(f.icon, colX, featY);
        ctx.fillStyle = '#6b4f14';
        ctx.font = '900 10px sans-serif';
        ctx.fillText(f.text, colX, featY + 22);
        if (idx < 3) {
          const divX = 60 + (idx + 1) * colW;
          ctx.strokeStyle = '#d4af37';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(divX, featY - 14);
          ctx.lineTo(divX, featY + 24);
          ctx.stroke();
        }
      });

      // 10. Cursive Motto
      ctx.textAlign = 'center';
      ctx.fillStyle = '#221609';
      ctx.font = 'italic bold 23px "Brush Script MT", "Great Vibes", "Lucida Calligraphy", cursive';
      ctx.fillText('Invite Friends  \u2022  Play Together  \u2022  Win Big', width / 2, 955);

      // 11. Official Bot Invite Link Box
      const codeBoxW = 540;
      const codeBoxH = 38;
      const codeBoxX = (width - codeBoxW) / 2;
      const codeBoxY = 988;

      ctx.fillStyle = '#fbf6ea';
      ctx.beginPath();
      ctx.roundRect(codeBoxX, codeBoxY, codeBoxW, codeBoxH, 10);
      ctx.fill();
      ctx.strokeStyle = '#c59b27';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#664a10';
      ctx.font = 'bold 13px monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText(inviteLink, width / 2, codeBoxY + codeBoxH / 2);
      ctx.textBaseline = 'alphabetic';

      // 12. Footer
      ctx.fillStyle = '#9c8141';
      ctx.font = '600 11px sans-serif';
      ctx.fillText('Official Player Invitation \u2022 Powered by HDASE BINGO', width / 2, 1056);

      return canvas;
    } catch (e) {
      console.error('Error generating invite canvas', e);
      return null;
    }
  };

  // Download the luxury branded invitation poster
  const handleDownloadQR = () => {
    const canvas = generateInviteCanvas();
    if (!canvas) return;

    try {
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
    const canvas = generateInviteCanvas();
    if (canvas && navigator.canShare) {
      try {
        canvas.toBlob(blob => {
          if (!blob) {
            handleShare();
            return;
          }
          const file = new File([blob], `hdasebingo-invite-${user?.telegram_id || 'invite'}.png`, { type: 'image/png' });
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

        {/* TAB 1: LUXURY CANVAS QR CODE POSTER (MATCHING AGENT SECTION) */}
        {activeTab === 'qr' && (
          <div className="flex flex-col space-y-3 shrink-0">
            {/* LUXURY POSTER FRAME */}
            <div
              className="relative overflow-hidden rounded-3xl border-2 border-[#c59b27] p-4 text-center shadow-md shrink-0"
              style={{
                background: 'linear-gradient(180deg, #ffffff 0%, #fdfcf9 40%, #faf4e8 100%)',
              }}
            >
              {/* Inner thin gold accent border */}
              <div className="border border-[#e6c86e]/70 rounded-2xl p-3.5 space-y-2.5">
                {/* 1. Royal Crown & Medallion Emblem */}
                <div className="flex flex-col items-center justify-center">
                  <div className="flex items-center space-x-1.5 text-[#b8860b]">
                    <span className="w-8 h-px bg-[#d4af37]" />
                    <Crown size={22} className="text-[#d4af37] fill-[#d4af37]/20 drop-shadow-xs" />
                    <span className="w-8 h-px bg-[#d4af37]" />
                  </div>
                  {/* Circular Medallion */}
                  <div className="w-9 h-9 rounded-full bg-[#1b140c] border-2 border-[#d4af37] ring-1 ring-[#fef08a] flex items-center justify-center mt-1 shadow-sm">
                    <span className="font-serif font-black text-xs text-[#fef08a] tracking-wider">HB</span>
                  </div>
                </div>

                {/* 2. Main Title "HDASE BINGO" */}
                <div>
                  <h3 className="font-serif font-black text-2xl tracking-[0.15em] text-[#140f09] uppercase drop-shadow-2xs">
                    HDASE BINGO
                  </h3>
                  <div className="flex items-center justify-center space-x-2 text-[10px] font-bold text-[#8a6a1d] uppercase tracking-wider mt-0.5">
                    <span className="w-6 h-px bg-[#d4af37]" />
                    <span>PLAYER INVITE • {((user?.first_name || user?.username || 'PLAYER') + "'S INVITATION").toUpperCase()}</span>
                    <span className="w-6 h-px bg-[#d4af37]" />
                  </div>
                </div>

                {/* 3. Bold "SCAN TO JOIN" */}
                <div className="flex items-center justify-center space-x-2 pt-0.5">
                  <span className="text-[#c59b27] font-black text-sm">⮞</span>
                  <span className="font-serif font-black text-lg text-[#140f09] tracking-wider">
                    SCAN TO JOIN
                  </span>
                  <span className="text-[#c59b27] font-black text-sm">⮜</span>
                </div>

                {/* 4. Golden Ribbon Banner */}
                <div
                  className="mx-auto px-4 py-1.5 rounded-full border border-[#a67718] shadow-2xs max-w-xs flex items-center justify-center space-x-1"
                  style={{
                    background: 'linear-gradient(90deg, #ebd596 0%, #deb55b 50%, #ebd596 100%)',
                  }}
                >
                  <span className="text-[10px] font-black text-[#3a2707] uppercase tracking-wider">
                    Scan the QR code to
                  </span>
                  <span className="font-serif italic font-black text-xs text-[#831414]">
                    Join & Win Bonus!
                  </span>
                </div>

                {/* 5. Central White QR Code Card with double gold border */}
                <div
                  onClick={() => setShowFullscreenQR(true)}
                  className="relative mx-auto w-fit p-3 bg-white rounded-3xl border-[3px] border-[#c59b27] ring-2 ring-[#fae596] shadow-sm my-1 cursor-pointer active:scale-98 transition-transform"
                >
                  {/* Corner decorative brackets */}
                  <div className="absolute top-2 left-2 w-3.5 h-3.5 border-t-2 border-l-2 border-[#b8860b] rounded-tl-sm pointer-events-none" />
                  <div className="absolute top-2 right-2 w-3.5 h-3.5 border-t-2 border-r-2 border-[#b8860b] rounded-tr-sm pointer-events-none" />
                  <div className="absolute bottom-2 left-2 w-3.5 h-3.5 border-b-2 border-l-2 border-[#b8860b] rounded-bl-sm pointer-events-none" />
                  <div className="absolute bottom-2 right-2 w-3.5 h-3.5 border-b-2 border-r-2 border-[#b8860b] rounded-br-sm pointer-events-none" />

                  <div className="relative">
                    <QRCodeCanvas
                      ref={qrCanvasRef}
                      value={inviteLink}
                      size={200}
                      level="H"
                      includeMargin={false}
                      fgColor="#0f172a"
                      bgColor="#ffffff"
                    />

                    {/* Center HDASE BINGO Badge */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="bg-gradient-to-r from-amber-500 to-yellow-400 border-2 border-white shadow-lg rounded-xl px-2.5 py-1 flex flex-col items-center justify-center" style={{ minWidth: 68 }}>
                        <span className="text-[8px] font-black text-white/80 uppercase tracking-widest leading-none">HDASE</span>
                        <span className="text-[11px] font-black text-white leading-none tracking-wider">BINGO</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 6. 4 Features row (10% Bonus, Instant Pay, 75 Bingo, Verified) */}
                <div className="grid grid-cols-4 divide-x divide-[#d4af37]/50 pt-1 text-center">
                  <div className="px-1">
                    <p className="text-sm">🎁</p>
                    <p className="text-[8.5px] font-black text-[#6b4f14] uppercase">10% Bonus</p>
                  </div>
                  <div className="px-1">
                    <p className="text-sm">⚡</p>
                    <p className="text-[8.5px] font-black text-[#6b4f14] uppercase">Instant</p>
                  </div>
                  <div className="px-1">
                    <p className="text-sm">🎱</p>
                    <p className="text-[8.5px] font-black text-[#6b4f14] uppercase">75 Bingo</p>
                  </div>
                  <div className="px-1">
                    <p className="text-sm">🛡️</p>
                    <p className="text-[8.5px] font-black text-[#6b4f14] uppercase">Verified</p>
                  </div>
                </div>

                {/* 7. Cursive motto */}
                <p className="font-serif italic font-bold text-xs text-[#221609] pt-0.5">
                  Invite Friends &nbsp;•&nbsp; Play Together &nbsp;•&nbsp; Win Big
                </p>

                {/* 8. Full Start Bot Invite Link Box with Copy Button */}
                <div className="mx-auto w-full max-w-xs px-2.5 py-1.5 bg-[#fbf6ea] border border-[#c59b27] rounded-xl shadow-2xs flex items-center justify-between gap-1.5">
                  <span className="font-mono text-[10px] text-[#664a10] truncate select-all">
                    {inviteLink}
                  </span>
                  <button
                    onClick={handleCopyLink}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black shrink-0 transition-all active:scale-95 flex items-center gap-1 ${
                      copiedLink ? 'bg-emerald-600 text-white' : 'bg-[#c59b27] hover:bg-[#b8860b] text-white shadow-2xs'
                    }`}
                  >
                    {copiedLink ? <Check size={11} /> : <Copy size={11} />}
                    <span>{copiedLink ? (language === 'am' ? 'ተቀድቷል!' : 'Copied!') : (language === 'am' ? 'ቅዳ' : 'Copy')}</span>
                  </button>
                </div>
              </div>
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
                <div className="bg-gradient-to-r from-amber-500 to-yellow-400 border-2 border-white shadow-lg rounded-xl px-2.5 py-1.5 flex flex-col items-center justify-center" style={{ minWidth: 70 }}>
                  <span className="text-[9px] font-black text-white/80 uppercase tracking-widest leading-none">HDASE</span>
                  <span className="text-[13px] font-black text-white leading-none tracking-wider">BINGO</span>
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
                className="py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-sm"
              >
                <Download size={14} />
                <span>{downloaded ? 'Saved!' : 'Save'}</span>
              </button>
              <button
                onClick={handleShare}
                className="py-2.5 bg-slate-800 text-white hover:bg-slate-900 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-sm"
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
