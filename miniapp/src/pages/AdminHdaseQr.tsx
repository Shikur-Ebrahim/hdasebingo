import { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { 
  ArrowLeft, Download, Share2, Copy, Check, CheckCircle2, 
  Send, ExternalLink, Sparkles, QrCode, Smartphone, RefreshCw, Edit3
} from 'lucide-react';
import { Link } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function AdminHdaseQr() {
  const { user } = useGameStore();
  const botUsername = import.meta.env.VITE_BOT_USERNAME || 'hdasebingo_bot';

  // Preset options for QR code link
  // 1. 'qr' (Adwa exact format: https://t.me/hdasebingo_bot?start=qr) - auto-starts bot & delivers play button instantly
  // 2. 'bot' (https://t.me/hdasebingo_bot - direct bot chat page)
  // 3. 'play' (https://t.me/hdasebingo_bot?start=play)
  // 4. 'direct_app' (https://t.me/hdasebingo_bot/app - if BotFather short name is configured)
  // 5. 'custom' (admin typed link)
  const [selectedPreset, setSelectedPreset] = useState<'qr' | 'bot' | 'play' | 'direct_app' | 'custom'>('qr');
  const [customUrl, setCustomUrl] = useState(`https://t.me/${botUsername}?start=qr`);
  
  const [copiedLink, setCopiedLink] = useState(false);
  const [downloadedFlyer, setDownloadedFlyer] = useState(false);
  const [isSavingFlyer, setIsSavingFlyer] = useState(false);
  const [flyerSentToTg, setFlyerSentToTg] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Determine active target link
  const targetLink = selectedPreset === 'custom' 
    ? customUrl 
    : selectedPreset === 'qr'
      ? `https://t.me/${botUsername}?start=qr`
      : selectedPreset === 'bot'
        ? `https://t.me/${botUsername}`
        : selectedPreset === 'play'
          ? `https://t.me/${botUsername}?start=play`
          : `https://t.me/${botUsername}/app`;

  const triggerHaptic = (style: 'light' | 'medium' | 'heavy' = 'light') => {
    try {
      if (WebApp?.HapticFeedback) {
        WebApp.HapticFeedback.impactOccurred(style);
      }
    } catch {}
  };

  const triggerSuccessHaptic = () => {
    try {
      if (WebApp?.HapticFeedback) {
        WebApp.HapticFeedback.notificationOccurred('success');
      }
    } catch {}
  };

  // Generate high-resolution luxury flyer (750 x 1150)
  const generateFlyerImage = useCallback((): string | null => {
    const qrCanvas = qrCanvasRef.current;
    if (!qrCanvas) return null;

    try {
      const width = 750;
      const height = 1150;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // 1. Warm ivory luxury background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#ffffff');
      bgGrad.addColorStop(0.25, '#fdfcf9');
      bgGrad.addColorStop(0.65, '#faf5ea');
      bgGrad.addColorStop(1, '#f5edd9');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Radial ambient lighting in center
      const radial = ctx.createRadialGradient(width / 2, 450, 40, width / 2, 450, 560);
      radial.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
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
      drawDiamond(26, 26, 4.5);
      drawDiamond(width - 26, 26, 4.5);
      drawDiamond(26, height - 26, 4.5);
      drawDiamond(width - 26, height - 26, 4.5);

      // Corner bracket accents
      const drawCornerBracket = (x: number, y: number, xDir: number, yDir: number) => {
        ctx.strokeStyle = '#c59b27';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x + xDir * 18, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + yDir * 18);
        ctx.stroke();

        ctx.fillStyle = '#c59b27';
        ctx.beginPath();
        ctx.arc(x + xDir * 6, y + yDir * 6, 2, 0, Math.PI * 2);
        ctx.fill();
      };
      drawCornerBracket(36, 36, 1, 1);
      drawCornerBracket(width - 36, 36, -1, 1);
      drawCornerBracket(36, height - 36, 1, -1);
      drawCornerBracket(width - 36, height - 36, -1, -1);

      // 3. Top Royal Crown & Medallion Emblem
      const emblemY = 82;
      const emblemX = width / 2;

      // Gold Crown base
      ctx.fillStyle = '#d4af37';
      ctx.beginPath();
      ctx.roundRect(emblemX - 22, emblemY - 34, 44, 7, 2);
      ctx.fill();

      // Crown spikes (5 peaks)
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

      // Crown pearls
      ctx.fillStyle = '#fef08a';
      [-25, -12, 0, 12, 25].forEach((px, idx) => {
        const py = idx === 2 ? emblemY - 57 : (idx === 0 || idx === 4) ? emblemY - 53 : emblemY - 41;
        ctx.beginPath();
        ctx.arc(emblemX + px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Medallion Circle with HB Monogram
      ctx.fillStyle = '#171c26'; // Deep luxury dark navy
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

      // Monogram text HB (HDASE BINGO)
      ctx.fillStyle = '#fef08a';
      ctx.font = '900 18px "Times New Roman", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('HB', emblemX, emblemY - 9);
      ctx.textBaseline = 'alphabetic';

      // Symmetrical scrolls
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

      // 4. Main Title "HDASE BINGO"
      ctx.fillStyle = '#0f172a'; // Deep slate / navy
      ctx.font = '900 42px "Times New Roman", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('HDASE BINGO', width / 2, 142);

      // 5. Subtitle "OFFICIAL HDASE BINGO" with divider lines
      ctx.fillStyle = '#8a6a1d';
      ctx.font = 'bold 12.5px sans-serif';
      const subText = 'OFFICIAL HDASE BINGO';
      ctx.fillText(subText, width / 2, 172);

      const subWidth = ctx.measureText(subText).width;
      const lineY = 168;
      const lineLen = 75;
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

      // 6. Bold "SCAN TO PLAY" with wheat/arrow wings
      const scanY = 224;
      ctx.fillStyle = '#17120a';
      ctx.font = '900 34px "Times New Roman", Georgia, sans-serif';
      ctx.fillText('SCAN TO PLAY', width / 2, scanY);

      const scanWidth = ctx.measureText('SCAN TO PLAY').width;
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

      // 7. Gold Ribbon Banner "SCAN THE QR CODE TO Play & Win Cash!"
      const ribbonW = 470;
      const ribbonH = 42;
      const ribbonX = (width - ribbonW) / 2;
      const ribbonY = 248;

      const ribGrad = ctx.createLinearGradient(ribbonX, ribbonY, ribbonX + ribbonW, ribbonY);
      ribGrad.addColorStop(0, '#ebd596');
      ribGrad.addColorStop(0.5, '#deb55b');
      ribGrad.addColorStop(1, '#ebd596');
      ctx.fillStyle = ribGrad;
      ctx.beginPath();
      ctx.roundRect(ribbonX, ribbonY, ribbonW, ribbonH, 21);
      ctx.fill();

      ctx.strokeStyle = '#a67718';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const midRibY = ribbonY + ribbonH / 2;
      ctx.font = 'bold 12.5px sans-serif';
      ctx.fillStyle = '#3a2707';
      const part1 = 'SCAN THE QR CODE TO ';
      const p1W = ctx.measureText(part1).width;

      ctx.font = 'italic bold 18.5px "Brush Script MT", "Great Vibes", "Lucida Calligraphy", cursive, serif';
      const part2 = 'Play & Win Cash!';
      const p2W = ctx.measureText(part2).width;

      const totalRibTextW = p1W + p2W;
      const startRibTextX = width / 2 - totalRibTextW / 2;

      ctx.font = 'bold 12.5px sans-serif';
      ctx.fillStyle = '#3a2707';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(part1, startRibTextX, midRibY);

      ctx.font = 'italic bold 18.5px "Brush Script MT", "Great Vibes", "Lucida Calligraphy", cursive, serif';
      ctx.fillStyle = '#831414'; // Ruby red cursive text
      ctx.fillText(part2, startRibTextX + p1W, midRibY);
      ctx.textBaseline = 'alphabetic';

      // 8. Central White Card with Gold Border & QR Code
      const cardW = 530;
      const cardH = 530;
      const cardX = (width - cardW) / 2;
      const cardY = 308;
      const cardRadius = 32;

      ctx.shadowColor = 'rgba(120, 80, 20, 0.14)';
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 10;
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

      // Central HDASE BINGO Badge on QR Code
      const centerBadgeW = 120;
      const centerBadgeH = 52;
      const centerBadgeX = width / 2 - centerBadgeW / 2;
      const centerBadgeY = qrY + qrSize / 2 - centerBadgeH / 2;

      const badgeGrad = ctx.createLinearGradient(centerBadgeX, centerBadgeY, centerBadgeX + centerBadgeW, centerBadgeY + centerBadgeH);
      badgeGrad.addColorStop(0, '#f97316');
      badgeGrad.addColorStop(1, '#c2410c');
      ctx.fillStyle = badgeGrad;
      ctx.beginPath();
      ctx.roundRect(centerBadgeX, centerBadgeY, centerBadgeW, centerBadgeH, 14);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 11px sans-serif';
      ctx.fillText('HDASE', width / 2, centerBadgeY + 19);
      ctx.font = '900 17px sans-serif';
      ctx.fillText('BINGO', width / 2, centerBadgeY + 40);

      // 9. Bottom Section: 4 feature icons + dividers
      const featY = 880;
      const feats = [
        { icon: '🏆', text: 'JACKPOT' },
        { icon: '⚡', text: 'INSTANT PAY' },
        { icon: '🎱', text: '75 BINGO' },
        { icon: '🛡️', text: 'VERIFIED' }
      ];

      const colW = (width - 120) / 4;
      feats.forEach((f, idx) => {
        const colX = 60 + idx * colW + colW / 2;

        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(f.icon, colX, featY);

        ctx.fillStyle = '#6b4f14';
        ctx.font = '900 10.5px sans-serif';
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

      // 10. Cursive Motto "Real Players • Good Luck • Big Wins"
      ctx.textAlign = 'center';
      ctx.fillStyle = '#221609';
      ctx.font = 'italic bold 23px "Brush Script MT", "Great Vibes", "Lucida Calligraphy", cursive, serif';
      ctx.fillText('Real Players  •  Good Luck  •  Big Wins', width / 2, 955);

      // 11. Official Bot Link Box
      const codeBoxW = 290;
      const codeBoxH = 38;
      const codeBoxX = (width - codeBoxW) / 2;
      const codeBoxY = 988;

      ctx.fillStyle = '#fbf6ea';
      ctx.beginPath();
      ctx.roundRect(codeBoxX, codeBoxY, codeBoxW, codeBoxH, 12);
      ctx.fill();

      ctx.strokeStyle = '#c59b27';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#664a10';
      ctx.font = 'bold 15.5px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(`@${botUsername}`, width / 2, codeBoxY + codeBoxH / 2);
      ctx.textBaseline = 'alphabetic';

      // 12. Footer
      ctx.fillStyle = '#9c8141';
      ctx.font = '600 11.5px sans-serif';
      ctx.fillText('Official Partner Network • Powered by HDASE BINGO', width / 2, 1058);

      return canvas.toDataURL('image/png');
    } catch (e) {
      console.error('Error generating HDASE QR flyer canvas:', e);
      return null;
    }
  }, [botUsername]);

  // Refresh preview when target link changes
  const refreshPreview = useCallback(() => {
    setTimeout(() => {
      const url = generateFlyerImage();
      if (url) setPreviewDataUrl(url);
    }, 120);
  }, [generateFlyerImage]);

  useEffect(() => {
    refreshPreview();
  }, [refreshPreview, targetLink]);

  // Download directly to device / gallery
  const handleDownloadFlyer = () => {
    triggerHaptic('medium');
    const dataUrl = generateFlyerImage();
    if (!dataUrl) return;

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `hdasebingo-official-qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setDownloadedFlyer(true);
    triggerSuccessHaptic();
    setTimeout(() => setDownloadedFlyer(false), 2500);
  };

  // Deliver directly to Admin's Telegram Chat so they can tap "Save to Gallery"
  const handleSendFlyerToTelegram = async () => {
    triggerHaptic('heavy');
    const dataUrl = generateFlyerImage();
    if (!dataUrl) return;

    setIsSavingFlyer(true);
    try {
      const res = await fetch(`${API_URL}/player/send-flyer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': WebApp?.initData || '',
        },
        body: JSON.stringify({
          image_base64: dataUrl,
          room_name: 'Official HDASE BINGO Bot QR',
        }),
      });

      if (res.ok) {
        setFlyerSentToTg(true);
        triggerSuccessHaptic();
        setTimeout(() => setFlyerSentToTg(false), 4000);
      } else {
        // Fallback: download directly
        handleDownloadFlyer();
      }
    } catch (e) {
      console.error('Error sending flyer to Telegram:', e);
      handleDownloadFlyer();
    } finally {
      setIsSavingFlyer(false);
    }
  };

  // Native Web Share API (share as image to camera roll or social)
  const handleShareFlyer = async () => {
    triggerHaptic('light');
    const dataUrl = generateFlyerImage();
    if (!dataUrl) return;

    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], 'hdasebingo-qr.png', { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'HDASE BINGO Official QR',
          text: `Scan to play HDASE BINGO on Telegram (@${botUsername})!`,
          files: [file],
        });
        triggerSuccessHaptic();
        return;
      }
    } catch (e) {
      console.log('Share canceled or not supported', e);
    }

    // Fallback: copy link
    handleCopyLink();
  };

  const handleCopyLink = () => {
    triggerHaptic('light');
    navigator.clipboard.writeText(targetLink).then(() => {
      setCopiedLink(true);
      triggerSuccessHaptic();
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  if (!user || user.role !== 'admin') {
    return <div className="p-10 text-center font-bold text-slate-600">Access Denied!</div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Hidden high-res QR code canvas for flyer drawing */}
      <div style={{ position: 'absolute', top: -9999, left: -9999, opacity: 0, pointerEvents: 'none' }}>
        <QRCodeCanvas
          ref={qrCanvasRef}
          value={targetLink}
          size={600}
          level="H"
          marginSize={2}
          bgColor="#ffffff"
          fgColor="#000000"
        />
      </div>

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-30 shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Link
            to="/admin"
            className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 active:scale-95 transition-all"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-lg font-black text-slate-900 flex items-center space-x-1.5">
              <span>HDASE QR Code</span>
              <Sparkles size={16} className="text-amber-500 fill-amber-500" />
            </h1>
            <p className="text-xs text-slate-500 font-medium">Official Bot Launch & Mini App Scanner</p>
          </div>
        </div>

        <button
          onClick={refreshPreview}
          className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95 transition-all"
          title="Refresh Flyer"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="p-4 max-w-xl mx-auto w-full space-y-4">
        {/* Preset Selector Card */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">QR Code Link Mode</span>
            <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              @{botUsername}
            </span>
          </div>

          {/* Quick Presets */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { triggerHaptic('light'); setSelectedPreset('qr'); }}
              className={`p-2.5 rounded-xl border text-center transition-all ${
                selectedPreset === 'qr'
                  ? 'border-amber-500 bg-amber-50/80 shadow-sm ring-1 ring-amber-400 font-black text-amber-900'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold'
              }`}
            >
              <div className="text-xs font-bold">⭐ ?start=qr</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Adwa Auto-Start (Recommended)</div>
            </button>

            <button
              onClick={() => { triggerHaptic('light'); setSelectedPreset('bot'); }}
              className={`p-2.5 rounded-xl border text-center transition-all ${
                selectedPreset === 'bot'
                  ? 'border-amber-500 bg-amber-50/80 shadow-sm ring-1 ring-amber-400 font-black text-amber-900'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold'
              }`}
            >
              <div className="text-xs font-bold">🤖 @{botUsername}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Direct Bot Page</div>
            </button>

            <button
              onClick={() => { triggerHaptic('light'); setSelectedPreset('play'); }}
              className={`p-2.5 rounded-xl border text-center transition-all ${
                selectedPreset === 'play'
                  ? 'border-amber-500 bg-amber-50/80 shadow-sm ring-1 ring-amber-400 font-black text-amber-900'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold'
              }`}
            >
              <div className="text-xs font-bold">🎮 ?start=play</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Play Direct</div>
            </button>

            <button
              onClick={() => { triggerHaptic('light'); setSelectedPreset('direct_app'); }}
              className={`p-2.5 rounded-xl border text-center transition-all ${
                selectedPreset === 'direct_app'
                  ? 'border-amber-500 bg-amber-50/80 shadow-sm ring-1 ring-amber-400 font-black text-amber-900'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold'
              }`}
            >
              <div className="text-xs font-bold">📱 /app</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Direct Mini App</div>
            </button>
          </div>

          {/* Editable / Current URL */}
          <div className="space-y-1.5 pt-1">
            <label className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
              <span>Encoded URL:</span>
              {selectedPreset === 'qr' && <span className="text-emerald-600 font-semibold">✓ Exact Adwa match (auto-start)</span>}
            </label>
            <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <input
                type="text"
                value={selectedPreset === 'custom' ? customUrl : targetLink}
                onChange={(e) => {
                  setSelectedPreset('custom');
                  setCustomUrl(e.target.value);
                }}
                className="text-xs font-mono text-slate-800 bg-transparent flex-1 focus:outline-none"
                placeholder="https://t.me/hdasebingo_bot?start=qr"
              />
              <button
                onClick={handleCopyLink}
                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 active:scale-95 transition-all flex items-center space-x-1 shrink-0"
              >
                {copiedLink ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                <span>{copiedLink ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={handleDownloadFlyer}
            className="flex items-center justify-center space-x-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black py-3.5 px-4 rounded-2xl shadow-md shadow-amber-500/20 active:scale-95 transition-all text-xs"
          >
            {downloadedFlyer ? <CheckCircle2 size={16} /> : <Download size={16} />}
            <span>{downloadedFlyer ? 'Saved to Files!' : 'Download Image'}</span>
          </button>

          <button
            onClick={handleSendFlyerToTelegram}
            disabled={isSavingFlyer}
            className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 px-4 rounded-2xl shadow-md shadow-blue-500/20 active:scale-95 transition-all text-xs disabled:opacity-50"
          >
            {isSavingFlyer ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : flyerSentToTg ? (
              <CheckCircle2 size={16} />
            ) : (
              <Send size={16} />
            )}
            <span>{flyerSentToTg ? 'Sent to Telegram!' : 'Save to Gallery'}</span>
          </button>
        </div>

        {/* Secondary Actions */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={handleShareFlyer}
            className="flex items-center justify-center space-x-2 bg-white hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-2xl border border-slate-200 shadow-sm active:scale-95 transition-all text-xs"
          >
            <Share2 size={15} className="text-amber-600" />
            <span>Share Flyer</span>
          </button>

          <a
            href={targetLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center space-x-2 bg-white hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-2xl border border-slate-200 shadow-sm active:scale-95 transition-all text-xs"
          >
            <ExternalLink size={15} className="text-blue-600" />
            <span>Test Link</span>
          </a>
        </div>

        {/* Gallery tip */}
        <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-3.5 text-xs text-amber-900 space-y-1">
          <p className="font-bold flex items-center space-x-1.5">
            <span>💡 How Scanning Works:</span>
          </p>
          <p className="text-[11px] text-amber-800 leading-relaxed">
            Scanning <b>?start=qr</b> (default) triggers the Telegram Bot directly without showing "Restart", and immediately presents the player with the <b>START PLAYING</b> button to launch the Mini App!
          </p>
        </div>

        {/* Live Poster Preview */}
        <div className="bg-white rounded-3xl p-3 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-2 py-1.5 mb-2">
            <span className="text-xs font-black text-slate-700">Flyer Preview (High Resolution)</span>
            <span className="text-[10px] font-bold text-slate-400">750 × 1150 px</span>
          </div>

          <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-inner bg-slate-100 flex items-center justify-center">
            {previewDataUrl ? (
              <img
                src={previewDataUrl}
                alt="HDASE BINGO QR Flyer"
                className="w-full h-auto object-contain select-none"
              />
            ) : (
              <div className="py-24 flex flex-col items-center justify-center space-y-2 text-slate-400">
                <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-semibold">Rendering HDASE Flyer...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
