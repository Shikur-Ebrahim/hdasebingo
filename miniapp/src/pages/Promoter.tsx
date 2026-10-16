import { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import WebApp from '@twa-dev/sdk';
import { QRCodeCanvas } from 'qrcode.react';
import {
  Megaphone,
  Star,
  Users,
  TrendingUp,
  Gift,
  Share2,
  Copy,
  Check,
  RefreshCw,
  QrCode,
  DollarSign,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Download,
  AlertCircle
} from 'lucide-react';

interface InvitedUser {
  telegram_id: string;
  first_name: string;
  username: string;
  created_at: string;
  has_deposited?: boolean;
  deposit_amount?: number;
  reward_earned?: number;
}

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function Promoter() {
  const { user, fetchUser } = useGameStore();
  const [invitedList, setInvitedList] = useState<InvitedUser[]>([]);
  const [totalEarned, setTotalEarned] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [downloadedQR, setDownloadedQR] = useState(false);
  const [error, setError] = useState('');
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Authentication guard
  if (user?.role !== 'promoter') {
    return <Navigate to="/" replace />;
  }

  const botUsername = import.meta.env.VITE_BOT_USERNAME || 'hdasebingo_bot';
  const refCode = `ref_${user?.telegram_id || 'promoter'}`;
  const inviteLink = `https://t.me/${botUsername}?start=${refCode}`;

  const fetchInvitedData = async () => {
    try {
      setError('');
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const res = await fetch(`${API_URL}/player/invited`, {
        headers: { 'x-telegram-init-data': initData }
      });
      if (!res.ok) throw new Error('Failed to load promoter stats');
      const data = await res.json();
      setInvitedList(data.invited || []);
      setTotalEarned(data.total_earned || 0);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error fetching data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchInvitedData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchInvitedData(), fetchUser()]);
    if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.impactOccurred('light');
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopiedLink(true);
      if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.notificationOccurred('success');
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(refCode).then(() => {
      setCopiedCode(true);
      if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.notificationOccurred('success');
      setTimeout(() => setCopiedCode(false), 2000);
    });
  };

  const handleShare = () => {
    const text = `🎮 Play HDASE BINGO with me! Join using my promoter link and start winning today!\n\n${inviteLink}`;
    if (typeof WebApp !== 'undefined' && WebApp.openTelegramLink) {
      WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent("🎮 Play HDASE BINGO with me! Join using my promoter link and start winning today!")}`);
    } else if (navigator.share) {
      navigator.share({
        title: 'HDASE BINGO Promoter Link',
        text: 'Play HDASE BINGO with me!',
        url: inviteLink,
      }).catch(() => {});
    } else {
      handleCopyLink();
    }
  };

  const handleDownloadQR = () => {
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    try {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `hdasebingo-promoter-${user?.telegram_id || 'qr'}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setDownloadedQR(true);
      setTimeout(() => setDownloadedQR(false), 2500);
    } catch (e) {
      console.error('QR download error', e);
    }
  };

  const activeDepositors = invitedList.filter(u => u.has_deposited).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white select-none pb-12">
      {/* ─── HEADER ─── */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600/25 via-violet-600/15 to-transparent pointer-events-none" />
        <div className="absolute -top-12 -right-12 w-52 h-52 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -top-12 -left-12 w-52 h-52 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative px-5 pt-12 pb-6">
          {/* Top Actions Row */}
          <div className="flex items-center justify-between mb-4">
            <div className="inline-flex items-center space-x-1.5 bg-purple-500/20 border border-purple-500/30 rounded-full px-3 py-1">
              <Star size={11} className="text-purple-400" fill="currentColor" />
              <span className="text-[10px] font-black text-purple-300 tracking-wider uppercase">Promoter Portal</span>
            </div>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-9 h-9 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center active:scale-95 transition-all text-purple-300"
              title="Refresh Stats"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Hero Welcome */}
          <div className="flex items-center space-x-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 via-violet-600 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/30 border border-purple-400/30">
                <Megaphone size={28} className="text-white drop-shadow" />
              </div>
              <div className="absolute -inset-1 rounded-[20px] border border-purple-400/30 border-t-purple-400 animate-spin pointer-events-none" style={{ animationDuration: '6s' }} />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-purple-300/80">Welcome back,</p>
              <h1 className="text-xl font-black text-white truncate">
                {user?.first_name || 'Promoter'}!
              </h1>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5 truncate">
                {user?.username ? `@${user.username}` : `ID: ${user?.telegram_id}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 space-y-4">
        {/* Error Alert */}
        {error && (
          <div className="flex items-center space-x-2 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">
            <AlertCircle size={16} className="text-rose-400 flex-shrink-0" />
            <p className="text-xs text-rose-300 font-medium">{error}</p>
          </div>
        )}

        {/* ─── REAL-TIME STATS GRID ─── */}
        <div className="grid grid-cols-2 gap-3">
          {/* Total Friends */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col items-center justify-center text-center relative overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-2">
              <Users size={18} className="text-blue-400" />
            </div>
            <p className="text-2xl font-black text-white leading-tight">
              {loading ? '...' : invitedList.length}
            </p>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">Invited Friends</p>
          </div>

          {/* Total Earned Commission */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col items-center justify-center text-center relative overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-2">
              <TrendingUp size={18} className="text-emerald-400" />
            </div>
            <p className="text-2xl font-black text-emerald-400 leading-tight">
              {loading ? '...' : `${totalEarned.toLocaleString()} ETB`}
            </p>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">Total Commission</p>
          </div>

          {/* Bonus Balance */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col items-center justify-center text-center relative overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-2">
              <Gift size={18} className="text-amber-400" />
            </div>
            <p className="text-2xl font-black text-amber-400 leading-tight">
              {((user as any)?.bonus_balance ?? 0).toLocaleString()} ETB
            </p>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">Bonus Balance</p>
          </div>

          {/* Active Depositing Friends */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col items-center justify-center text-center relative overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-2">
              <CheckCircle2 size={18} className="text-purple-400" />
            </div>
            <p className="text-2xl font-black text-purple-300 leading-tight">
              {loading ? '...' : activeDepositors}
            </p>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">Active Depositors</p>
          </div>
        </div>

        {/* ─── PROMOTER LINK & SHARE CARD ─── */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800/90 border border-purple-500/30 rounded-3xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                <Share2 size={15} className="text-purple-400" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">Your Promotion Link</h3>
                <p className="text-[10px] text-slate-400">Share with friends to earn 10% commission</p>
              </div>
            </div>

            <button
              onClick={() => setShowQR(!showQR)}
              className="px-2.5 py-1.5 bg-purple-500/15 border border-purple-500/30 rounded-xl text-[11px] font-black text-purple-300 flex items-center space-x-1 active:scale-95 transition-all"
            >
              <QrCode size={13} />
              <span>{showQR ? 'Hide QR' : 'View QR'}</span>
              {showQR ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          {/* Link box */}
          <div className="flex items-center justify-between bg-slate-950/80 border border-slate-700/70 rounded-2xl p-2.5 mb-3">
            <span className="font-mono text-xs text-purple-300/90 truncate mr-2 select-all">
              {inviteLink}
            </span>
            <button
              onClick={handleCopyLink}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-black flex items-center space-x-1 transition-all active:scale-95 ${
                copiedLink ? 'bg-emerald-500 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/30'
              }`}
            >
              {copiedLink ? <Check size={13} /> : <Copy size={13} />}
              <span>{copiedLink ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>

          {/* Referral Code Chip */}
          <div className="flex items-center justify-between bg-slate-950/40 border border-slate-800 rounded-xl px-3 py-2 mb-4">
            <div className="flex items-center space-x-2 truncate mr-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Referral Code:</span>
              <span className="font-mono text-xs font-black text-white">{refCode}</span>
            </div>
            <button
              onClick={handleCopyCode}
              className="text-[11px] font-bold text-purple-400 hover:text-purple-300 flex items-center space-x-1"
            >
              {copiedCode ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
            </button>
          </div>

          {/* QR Code Collapsible View */}
          {showQR && (
            <div className="p-4 bg-white rounded-2xl mb-4 flex flex-col items-center text-center animate-in fade-in duration-200">
              <div className="p-2 bg-white rounded-xl relative shadow-inner">
                <QRCodeCanvas
                  ref={qrCanvasRef}
                  value={inviteLink}
                  size={190}
                  level="H"
                  includeMargin={false}
                  fgColor="#0f172a"
                  bgColor="#ffffff"
                />
                {/* Center Badge */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-gradient-to-r from-amber-500 to-yellow-400 border-2 border-white shadow-lg rounded-xl px-2 py-0.5 flex flex-col items-center justify-center" style={{ minWidth: 60 }}>
                    <span className="text-[7px] font-black text-white/90 uppercase tracking-widest leading-none">HDASE</span>
                    <span className="text-[10px] font-black text-white leading-none tracking-wider">BINGO</span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] font-bold text-slate-700 mt-2">Scan to join using your referral</p>

              <div className="flex space-x-2 w-full mt-3">
                <button
                  onClick={handleDownloadQR}
                  className="flex-1 py-2 bg-slate-100 text-slate-800 rounded-xl text-xs font-black flex items-center justify-center space-x-1.5 active:scale-95 transition-all"
                >
                  {downloadedQR ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Download size={14} />}
                  <span>{downloadedQR ? 'Saved!' : 'Save QR'}</span>
                </button>
                <button
                  onClick={handleShare}
                  className="flex-1 py-2 bg-purple-600 text-white rounded-xl text-xs font-black flex items-center justify-center space-x-1.5 active:scale-95 transition-all shadow-md"
                >
                  <Share2 size={14} />
                  <span>Share QR</span>
                </button>
              </div>
            </div>
          )}

          {/* Primary Share Button */}
          <button
            onClick={handleShare}
            className="w-full py-3.5 bg-gradient-to-r from-purple-600 via-violet-600 to-purple-700 text-white rounded-2xl font-black text-sm flex items-center justify-center space-x-2 shadow-lg shadow-purple-600/30 active:scale-98 transition-all"
          >
            <Share2 size={18} />
            <span>Share Link on Telegram</span>
          </button>
        </div>

        {/* ─── HOW COMMISSION WORKS ─── */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center space-x-2 mb-2">
            <DollarSign size={16} className="text-amber-400" />
            <h4 className="text-xs font-black text-white uppercase tracking-wider">Promoter Rewards Program</h4>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            As a registered Promoter, you receive <span className="font-black text-amber-400">10% instant bonus</span> for every new user who registers through your link and completes their first deposit.
          </p>
        </div>

        {/* ─── RECENT REFERRALS LIST ─── */}
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
              Invited Players ({invitedList.length})
            </h3>
            <span className="text-[11px] font-bold text-purple-400">
              {activeDepositors} Deposited
            </span>
          </div>

          {loading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-14 bg-slate-800/60 rounded-2xl" />
              <div className="h-14 bg-slate-800/60 rounded-2xl" />
            </div>
          ) : invitedList.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-8 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mb-3 text-slate-500">
                <Users size={24} />
              </div>
              <p className="text-sm font-black text-white">No Friends Invited Yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                Share your promoter link on Telegram, WhatsApp, or TikTok to invite players and earn rewards!
              </p>
              <button
                onClick={handleShare}
                className="mt-4 px-4 py-2 bg-purple-600/30 border border-purple-500/40 text-purple-300 rounded-xl text-xs font-black flex items-center space-x-1.5 active:scale-95 transition-all"
              >
                <Share2 size={13} />
                <span>Start Sharing</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {invitedList.map((player) => (
                <div
                  key={player.telegram_id}
                  className="bg-slate-800/50 border border-slate-700/40 rounded-2xl p-3.5 flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center font-black text-sm shrink-0">
                      {(player.first_name || player.username || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="truncate">
                      <p className="text-xs font-black text-white truncate">
                        {player.first_name}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {player.username ? `@${player.username}` : `ID: ${player.telegram_id}`}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-3">
                    {player.has_deposited ? (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-black">
                        <CheckCircle2 size={10} />
                        <span>+{player.reward_earned ?? 0} ETB</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-bold">
                        <Clock size={10} />
                        <span>Pending</span>
                      </span>
                    )}
                    <p className="text-[9px] text-slate-500 mt-0.5">
                      {new Date(player.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── OFFICIAL FOOTER ─── */}
        <div className="flex flex-col items-center space-y-1 pt-4 text-center">
          <div className="flex items-center space-x-1.5">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center">
              <span className="text-[8px] font-black text-slate-900">75</span>
            </div>
            <span className="text-xs font-black text-white tracking-wider">
              HDASE <span className="text-amber-400">BINGO</span>
            </span>
          </div>
          <p className="text-[10px] text-slate-600 font-semibold tracking-wide">
            🇪🇹 Official Ethiopian Bingo Platform • Promoter Network
          </p>
        </div>
      </div>
    </div>
  );
}
