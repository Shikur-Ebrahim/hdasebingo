import { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, Share2, Copy, Check, Gift, QrCode, Link2, 
  Download, Maximize2, X, Sparkles, CheckCircle2, Crown, RefreshCw,
  Play, ChevronLeft, ChevronRight, Volume2, VolumeX,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { t } from '../lib/translations';
import WebApp from '@twa-dev/sdk';
import { QRCodeCanvas } from 'qrcode.react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface SupportVideo {
  id: string;
  category: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url?: string | null;
}

export default function Invite() {
  const { user, setProfileOpen, language } = useGameStore();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [activeTab, setActiveTab] = useState<'qr' | 'link'>('qr');
  const [showFullscreenQR, setShowFullscreenQR] = useState(false);
  const [inviteRewardPct, setInviteRewardPct] = useState<number>(10);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const navigate = useNavigate();

  // Invite guidance video state
  const [inviteVideos, setInviteVideos] = useState<SupportVideo[]>([]);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const inlineVideoRef = useRef<HTMLVideoElement>(null);
  const [showInvitePopup, setShowInvitePopup] = useState(false);
  const [isClosingInviteVideo, setIsClosingInviteVideo] = useState(false);
  const [highlightGuideBtn, setHighlightGuideBtn] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const botUsername = import.meta.env.VITE_BOT_USERNAME || 'hdasebingo_bot';
  const refCode = `ref_${user?.telegram_id || 'player'}`;
  const inviteLink = `https://t.me/${botUsername}?start=${refCode}`;

  // Fetch real invite reward % from admin settings + invite videos
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
        const [settingsRes, videosRes] = await Promise.all([
          fetch(`${API_URL}/player/public-settings`, { headers: { 'x-telegram-init-data': initData } }),
          fetch(`${API_URL}/player/support-videos?category=invite`, { headers: { 'x-telegram-init-data': initData } }),
        ]);

        if (settingsRes.ok) {
          const data = await settingsRes.json();
          if (typeof data.invitation_reward_pct === 'number') {
            setInviteRewardPct(data.invitation_reward_pct);
          }
        }

        if (videosRes.ok) {
          const vData = await videosRes.json();
          const vids = vData.videos || [];
          setInviteVideos(vids);

          // One-time auto popup for invite guidance
          if (vids.length > 0 && vids[0].video_url) {
            const firstVid = vids[0];
            const viewedKey = `invite_video_viewed_${firstVid.id}`;
            const hasViewed = localStorage.getItem(viewedKey) || localStorage.getItem('invite_guide_viewed_once');
            if (!hasViewed) {
              localStorage.setItem(viewedKey, 'true');
              localStorage.setItem('invite_guide_viewed_once', 'true');
              setShowInvitePopup(true);
            }
          }
        }
      } catch {
        // fallback stays at defaults
      }
    };
    fetchSettings();
  }, []);

  // Auto-play invite popup video with sound prioritized
  useEffect(() => {
    if (showInvitePopup && inlineVideoRef.current) {
      inlineVideoRef.current.muted = false;
      const p = inlineVideoRef.current.play();
      if (p !== undefined) {
        p.then(() => setIsMuted(false)).catch(() => {
          if (inlineVideoRef.current) {
            inlineVideoRef.current.muted = true;
            setIsMuted(true);
            inlineVideoRef.current.play().catch(() => {});
          }
        });
      }
    }
  }, [showInvitePopup]);

  const handleCloseInvitePopup = (_fromVideoEnd = false) => {
    if (inlineVideoRef.current) {
      try { inlineVideoRef.current.pause(); } catch (_) {}
    }
    if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.notificationOccurred('success');
    setIsClosingInviteVideo(true);
    setTimeout(() => {
      setShowInvitePopup(false);
      setIsClosingInviteVideo(false);
      setHighlightGuideBtn(true);
      setTimeout(() => setHighlightGuideBtn(false), 5000);
    }, 280);
  };

  const toggleInlineSound = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (inlineVideoRef.current) {
      inlineVideoRef.current.muted = !inlineVideoRef.current.muted;
      setIsMuted(inlineVideoRef.current.muted);
      if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.impactOccurred('light');
    }
  };

  const openVideoModal = (index = 0) => {
    setActiveVideoIndex(index);
    setIsVideoModalOpen(true);
  };

  const closeVideoModal = () => {
    if (videoPlayerRef.current) videoPlayerRef.current.pause();
    setIsVideoModalOpen(false);
  };

  const nextVideo = () => {
    if (inviteVideos.length <= 1) return;
    setActiveVideoIndex((prev) => (prev + 1) % inviteVideos.length);
  };

  const prevVideo = () => {
    if (inviteVideos.length <= 1) return;
    setActiveVideoIndex((prev) => (prev - 1 + inviteVideos.length) % inviteVideos.length);
  };

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
        { icon: '\uD83C\uDF81', text: `${inviteRewardPct}% BONUS` },
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

  const renderVideoModal = () => {
    if (!isVideoModalOpen) return null;
    const currentVid = inviteVideos[activeVideoIndex];

    return (
      <div
        className="fixed inset-0 z-50 bg-white flex flex-col justify-between select-none animate-in fade-in duration-200"
        onClick={(e) => { if (e.target === e.currentTarget) closeVideoModal(); }}
      >
        {/* Top Bar - Clean White */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100 z-20 shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0 pr-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-amber-500 flex items-center justify-center shrink-0 shadow-md shadow-purple-500/30">
              <Play size={14} className="fill-white ml-0.5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-800 truncate">
                {currentVid?.title || (language === 'am' ? 'ጓደኞችን እንዴት መጋበዝ ይቻላል' : 'How to Invite Friends')}
              </p>
              <p className="text-[10px] text-slate-400 font-semibold truncate">
                {inviteVideos.length > 1
                  ? `${language === 'am' ? 'ቪዲዮ' : 'Video'} ${activeVideoIndex + 1} / ${inviteVideos.length}`
                  : (language === 'am' ? 'ኦፊሴላዊ የቪዲዮ መመሪያ' : 'Official Step-by-Step Guide')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeVideoModal}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center active:scale-90 transition-all shrink-0 border border-slate-200"
          >
            <X size={16} />
          </button>
        </div>

        {/* Video Player */}
        <div className="flex-1 min-h-0 relative flex items-center justify-center bg-white overflow-hidden p-3">
          {currentVid ? (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <video
                ref={videoPlayerRef}
                key={currentVid.id}
                src={currentVid.video_url}
                poster={currentVid.thumbnail_url || undefined}
                controls autoPlay playsInline
                className="w-full max-h-full rounded-2xl shadow-lg bg-white border border-slate-100 object-contain"
              >
                Your browser does not support video playback.
              </video>
              {inviteVideos.length > 1 && (
                <div className="flex items-center justify-center space-x-3 mt-3 shrink-0">
                  <button type="button" onClick={prevVideo} className="px-4 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-xs font-bold border border-slate-200 transition-all flex items-center space-x-1">
                    <ChevronLeft size={14} /><span>{language === 'am' ? 'ቀዳሚ' : 'Prev'}</span>
                  </button>
                  <span className="text-xs text-slate-500 font-black px-2">{activeVideoIndex + 1} / {inviteVideos.length}</span>
                  <button type="button" onClick={nextVideo} className="px-4 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-xs font-bold border border-slate-200 transition-all flex items-center space-x-1">
                    <span>{language === 'am' ? 'ቀጣይ' : 'Next'}</span><ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 text-center max-w-sm mx-auto shadow-sm">
              <div className="w-14 h-14 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center mx-auto mb-3 text-purple-400">
                <Play size={24} className="fill-purple-300" />
              </div>
              <h3 className="text-base font-black text-slate-800 mb-1">{language === 'am' ? 'የቪዲዮ መመሪያ በቅርቡ ይጫናል' : 'Video Guide Coming Soon'}</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                {language === 'am' ? 'አድሚኑ አዲስ ቪዲዮ እያዘጋጀ ነው።' : 'The invite video guide is being prepared. Share your link now!'}
              </p>
              <button type="button" onClick={closeVideoModal} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-amber-500 text-white font-black text-xs active:scale-95 transition-all shadow-md">
                {language === 'am' ? 'እሺ ተረድቻለሁ' : 'Got It'}
              </button>
            </div>
          )}
        </div>

        {/* Bottom Action - Clean White */}
        <div className="p-4 bg-white border-t border-slate-100 z-20 space-y-2 shrink-0">
          {currentVid?.description && (
            <p className="text-xs text-slate-500 font-medium text-center line-clamp-2">{currentVid.description}</p>
          )}
          <button
            type="button"
            onClick={closeVideoModal}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 via-violet-600 to-amber-500 hover:from-purple-500 hover:to-amber-400 text-white font-black text-sm shadow-xl shadow-purple-500/30 active:scale-95 transition-all border border-white/20 tracking-wide"
          >
            {language === 'am' ? 'ተረድቻለሁ • ጓደኛ ልጋብዝ' : "Got it, Let's Invite Friends!"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col pb-24 select-none">
      {renderVideoModal()}

      {/* HEADER */}
      <div className="bg-white dark:bg-slate-900 px-4 pt-4 pb-3 shadow-xs border-b border-gray-100 dark:border-slate-800 flex items-center justify-between sticky top-0 z-30 h-[60px]">
        <div className="flex items-center min-w-0">
          <button
            onClick={handleBack}
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 active:scale-95 transition-transform shrink-0"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="ml-3 min-w-0">
            <h1 className="text-lg font-black text-slate-800 dark:text-slate-100 tracking-tight leading-tight truncate">
              {t[language].invite.title}
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
              {t[language].invite.subtitle}
            </p>
          </div>
        </div>

        {/* Video Guide Button */}
        <div className="relative shrink-0 ml-2">
          {highlightGuideBtn && (
            <div className="absolute -bottom-8 right-0 z-40 whitespace-nowrap bg-gradient-to-r from-purple-600 via-violet-500 to-amber-500 text-white text-[9.5px] font-black px-2.5 py-0.5 rounded-full shadow-lg shadow-purple-500/50 flex items-center space-x-1 animate-bounce">
              <Sparkles size={10} className="text-amber-300" />
              <span>Rewatch guide here!</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => openVideoModal(0)}
            className={`relative flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-600 via-violet-500 to-amber-500 hover:from-purple-500 hover:to-amber-400 text-white shadow-md shadow-purple-500/25 active:scale-95 transition-all text-xs font-black border border-white/20 ${
              highlightGuideBtn ? 'ring-4 ring-purple-500 ring-offset-2 scale-105 shadow-xl shadow-purple-500/40 animate-pulse' : ''
            }`}
          >
            <span className="relative flex h-4 w-4 items-center justify-center rounded-full bg-white/25 text-white">
              <Play size={9} className="fill-white ml-0.5" />
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-40 duration-1000" />
            </span>
            <span className="text-[11px] font-black tracking-wide whitespace-nowrap">
              {language === 'am' ? 'የቪዲዮ መመሪያ' : 'Video Guide'}
            </span>
          </button>
        </div>
      </div>

      {/* ONE-TIME FULLSCREEN VIDEO POPUP */}
      {showInvitePopup && inviteVideos.length > 0 && (
        <div
          style={{
            top: '60px',
            bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))',
          }}
          className={`fixed inset-x-0 z-30 bg-white flex flex-col justify-between overflow-hidden shadow-xl transition-all duration-300 ${
            isClosingInviteVideo ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'
          }`}
          onClick={() => handleCloseInvitePopup(false)}
        >
          {/* Sound Toggle & Close */}
          <div className="p-3 pb-1.5 flex items-center justify-between shrink-0 bg-white border-b border-slate-100/80 z-20">
            <button
              type="button"
              onClick={toggleInlineSound}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-black shadow-md border transition-all active:scale-95 ${
                isMuted
                  ? 'bg-rose-500 text-white border-rose-400 animate-pulse ring-2 ring-rose-500/30'
                  : 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-600/20'
              }`}
            >
              {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              <span>{isMuted ? 'Sound OFF · Tap for Sound' : 'Sound ON'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleCloseInvitePopup(false)}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-90 text-slate-700 flex items-center justify-center shadow-sm border border-slate-200 transition-all"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Video */}
          <div
            className="flex-1 min-h-0 relative w-full flex items-center justify-center bg-white overflow-hidden p-2"
            onClick={(e) => { e.stopPropagation(); if (isMuted) toggleInlineSound(); }}
          >
            {isMuted && (
              <button
                type="button"
                onClick={toggleInlineSound}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 bg-slate-900/90 hover:bg-black text-white px-5 py-3 rounded-2xl border border-white/20 backdrop-blur-md shadow-2xl flex items-center space-x-2 animate-bounce cursor-pointer active:scale-95"
              >
                <VolumeX size={20} className="text-rose-400" />
                <span className="font-black text-sm">Tap to Turn Sound ON 🔊</span>
              </button>
            )}
            <video
              ref={inlineVideoRef}
              src={inviteVideos[0].video_url}
              poster={inviteVideos[0].thumbnail_url || undefined}
              controls
              playsInline
              autoPlay
              onEnded={() => handleCloseInvitePopup(true)}
              className="w-full h-full max-h-full object-contain bg-white rounded-xl"
            >
              Your browser does not support video playback.
            </video>
          </div>

          {/* Action Button */}
          <div
            className="p-3.5 bg-white/95 backdrop-blur-md border-t border-slate-100 flex flex-col items-center justify-center shrink-0 z-20 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => handleCloseInvitePopup(false)}
              className="w-full max-w-sm py-3.5 px-6 bg-gradient-to-r from-purple-600 via-violet-600 to-amber-500 hover:from-purple-500 hover:to-amber-400 active:scale-95 text-white font-black text-sm sm:text-base rounded-2xl shadow-xl shadow-purple-500/35 transition-all flex items-center justify-center border border-white/25 tracking-wide ring-2 ring-purple-500/20"
            >
              <span>{language === 'am' ? 'ተረድቻለሁ • ጓደኛ ልጋብዝ' : "Got it, Let's Invite Friends!"}</span>
            </button>
          </div>
        </div>
      )}

      <div className="px-4 py-3 flex flex-col space-y-3 flex-1 overflow-y-auto">

        {/* HERO BANNER */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-black rounded-2xl p-3.5 text-white shadow-lg relative overflow-hidden flex items-center space-x-3 shrink-0 border border-white/10">
          {/* Subtle gold shimmer overlay */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/10 rounded-full -mr-10 -mt-10 blur-xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-amber-500/5 rounded-full -ml-8 -mb-8 blur-xl pointer-events-none" />
          <div className="w-11 h-11 bg-gradient-to-br from-amber-400 to-amber-600 border border-amber-300/40 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/30">
            <Gift size={22} className="text-slate-950 drop-shadow-sm" />
          </div>
          <div className="flex-1 min-w-0 z-10">
            <div className="flex items-center gap-1.5 mb-0.5">
              <h2 className="text-base font-black leading-tight truncate">
                {language === 'am'
                  ? `${inviteRewardPct}% ቦነስ ያግኙ!`
                  : `Earn ${inviteRewardPct}% Bonus!`}
              </h2>
              <span className="bg-amber-400 text-amber-950 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                {inviteRewardPct}% BONUS
              </span>
            </div>
            <p className="text-white/80 text-[10.5px] font-medium leading-snug">
              {language === 'am'
                ? `ጓደኞቻቸው ለመጀመሪያ ጊዜ ሲያስገቡ ${inviteRewardPct}% ቦነስ ወደ ቦነስ ሂሳብዎ ይጨመርለዎታል!`
                : `Get ${inviteRewardPct}% of your friends' first deposit straight into your Bonus Balance!`}
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
                    <p className="text-[8.5px] font-black text-[#6b4f14] uppercase">{inviteRewardPct}% Bonus</p>
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
