import { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import WebApp from '@twa-dev/sdk';
import { QRCodeCanvas } from 'qrcode.react';
import {
  Megaphone,
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
  AlertCircle,
  Wallet,
  Zap,
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
    if (typeof WebApp !== 'undefined' && WebApp.openTelegramLink) {
      WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent('🎮 Play HDASE BINGO with me! Join using my promoter link and start winning today!')}`);
    } else if (navigator.share) {
      navigator.share({ title: 'HDASE BINGO Promoter Link', text: 'Play HDASE BINGO with me!', url: inviteLink }).catch(() => {});
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
    <div className="min-h-screen bg-slate-50 text-slate-800 select-none pb-24 font-sans">

      {/* ─── STICKY TOP APP BAR ─── */}
      <div className="bg-white border-b border-gray-100 px-4 py-2.5 sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center justify-between max-w-md mx-auto">
          {/* Promoter Avatar & Info */}
          <div className="flex items-center space-x-2.5 min-w-0 flex-1 mr-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 via-purple-500 to-pink-500 flex items-center justify-center text-white font-black text-sm shadow-sm ring-2 ring-purple-200 shrink-0">
              {(user?.first_name || 'P').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5 flex-wrap">
                <span className="text-sm font-black text-slate-900 leading-tight truncate">
                  {user?.first_name || 'Promoter'}
                </span>
                <span className="inline-flex items-center space-x-0.5 text-[9px] font-black px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
                  <Zap size={10} className="text-purple-500 fill-purple-500" />
                  <span>10% Commission</span>
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium truncate">
                {user?.username ? `@${user.username}` : `ID: ${user?.telegram_id}`}
              </p>
            </div>
          </div>

          {/* Right: Bonus Balance & Refresh */}
          <div className="flex items-center space-x-2.5 shrink-0">
            <div className="text-right">
              <div className="flex items-center justify-end space-x-1 text-slate-400">
                <Wallet size={11} />
                <span className="text-[9px] font-bold uppercase tracking-wider">Bonus</span>
              </div>
              <p className="text-sm font-black text-purple-600 leading-tight">
                {((user as any)?.bonus_balance ?? 0).toLocaleString()} <span className="text-[10px] font-extrabold">ETB</span>
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center active:scale-95 transition-all shadow-2xs"
              title="Refresh"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin text-purple-500' : ''} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-3.5">
        {/* Error notification */}
        {error && (
          <div className="flex items-center space-x-2 bg-rose-50 border border-rose-200 rounded-2xl px-3.5 py-2.5 shadow-2xs">
            <AlertCircle size={15} className="text-rose-500 shrink-0" />
            <p className="text-xs text-rose-700 font-bold">{error}</p>
          </div>
        )}

        {/* ─── STATS GRID ─── */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-white rounded-2xl p-3.5 border border-gray-100 shadow-sm flex flex-col items-center text-center space-y-1">
            <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center">
              <Users size={16} className="text-sky-500" />
            </div>
            <p className="text-xl font-black text-slate-900">{loading ? '—' : invitedList.length}</p>
            <p className="text-[10px] text-slate-400 font-semibold">Invited Friends</p>
          </div>

          <div className="bg-white rounded-2xl p-3.5 border border-gray-100 shadow-sm flex flex-col items-center text-center space-y-1">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
              <TrendingUp size={16} className="text-emerald-500" />
            </div>
            <p className="text-xl font-black text-emerald-600">{loading ? '—' : `${totalEarned.toLocaleString()}`}</p>
            <p className="text-[10px] text-slate-400 font-semibold">Total Commission (ETB)</p>
          </div>

          <div className="bg-white rounded-2xl p-3.5 border border-gray-100 shadow-sm flex flex-col items-center text-center space-y-1">
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
              <Gift size={16} className="text-amber-500" />
            </div>
            <p className="text-xl font-black text-amber-600">{((user as any)?.bonus_balance ?? 0).toLocaleString()}</p>
            <p className="text-[10px] text-slate-400 font-semibold">Bonus Balance (ETB)</p>
          </div>

          <div className="bg-white rounded-2xl p-3.5 border border-gray-100 shadow-sm flex flex-col items-center text-center space-y-1">
            <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center">
              <CheckCircle2 size={16} className="text-purple-500" />
            </div>
            <p className="text-xl font-black text-purple-600">{loading ? '—' : activeDepositors}</p>
            <p className="text-[10px] text-slate-400 font-semibold">Active Depositors</p>
          </div>
        </div>

        {/* ─── PROMOTER LINK CARD ─── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center">
                <Share2 size={15} className="text-purple-600" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">Your Promotion Link</h3>
                <p className="text-[10px] text-slate-400">Share to earn 10% commission per referral</p>
              </div>
            </div>
            <button
              onClick={() => setShowQR(!showQR)}
              className="px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-[10px] font-black text-slate-600 flex items-center space-x-1 active:scale-95 transition-all"
            >
              <QrCode size={12} />
              <span>{showQR ? 'Hide QR' : 'QR'}</span>
              {showQR ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>

          {/* Link box */}
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-2.5">
            <span className="font-mono text-xs text-slate-600 truncate mr-2 select-all">
              {inviteLink}
            </span>
            <button
              onClick={handleCopyLink}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-black flex items-center space-x-1 transition-all active:scale-95 ${
                copiedLink ? 'bg-emerald-500 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white shadow-sm'
              }`}
            >
              {copiedLink ? <Check size={12} /> : <Copy size={12} />}
              <span>{copiedLink ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>

          {/* Referral Code */}
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <div className="flex items-center space-x-2 truncate mr-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Code:</span>
              <span className="font-mono text-xs font-black text-slate-800">{refCode}</span>
            </div>
            <button
              onClick={handleCopyCode}
              className="text-[11px] font-bold text-purple-600 hover:text-purple-500 flex items-center space-x-1 shrink-0"
            >
              {copiedCode ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
              <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
            </button>
          </div>

          {/* QR Code Collapsible */}
          {showQR && (
            <div className="p-3 bg-white border border-slate-100 rounded-2xl flex flex-col items-center text-center animate-in fade-in duration-200">
              <div className="p-2 bg-white rounded-xl relative shadow-sm">
                <QRCodeCanvas
                  ref={qrCanvasRef}
                  value={inviteLink}
                  size={180}
                  level="H"
                  includeMargin={false}
                  fgColor="#1e293b"
                  bgColor="#ffffff"
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-gradient-to-r from-amber-500 to-yellow-400 border-2 border-white shadow-lg rounded-xl px-2 py-0.5 flex flex-col items-center justify-center" style={{ minWidth: 56 }}>
                    <span className="text-[7px] font-black text-white/90 uppercase tracking-widest leading-none">HDASE</span>
                    <span className="text-[10px] font-black text-white leading-none tracking-wider">BINGO</span>
                  </div>
                </div>
              </div>
              <p className="text-[10px] font-bold text-slate-500 mt-2">Scan to join with your referral code</p>
              <div className="flex space-x-2 w-full mt-2">
                <button
                  onClick={handleDownloadQR}
                  className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-black flex items-center justify-center space-x-1.5 active:scale-95 transition-all"
                >
                  {downloadedQR ? <CheckCircle2 size={13} className="text-emerald-600" /> : <Download size={13} />}
                  <span>{downloadedQR ? 'Saved!' : 'Save QR'}</span>
                </button>
                <button
                  onClick={handleShare}
                  className="flex-1 py-2 bg-purple-600 text-white rounded-xl text-xs font-black flex items-center justify-center space-x-1.5 active:scale-95 transition-all shadow-sm"
                >
                  <Share2 size={13} />
                  <span>Share QR</span>
                </button>
              </div>
            </div>
          )}

          {/* Primary Share Button */}
          <button
            onClick={handleShare}
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-black text-sm flex items-center justify-center space-x-2 shadow-md shadow-purple-600/20 active:scale-98 transition-all"
          >
            <Share2 size={17} />
            <span>Share Link on Telegram</span>
          </button>
        </div>

        {/* ─── HOW IT WORKS ─── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-7 h-7 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
              <DollarSign size={14} className="text-amber-500" />
            </div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">Promoter Rewards Program</h4>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            As a registered Promoter, you earn a <span className="font-black text-amber-600">10% instant bonus</span> added to your bonus balance for every new player who registers via your link and makes their first deposit.
          </p>
        </div>

        {/* ─── INVITED PLAYERS LIST ─── */}
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">
              Invited Players ({invitedList.length})
            </h3>
            <span className="text-[11px] font-bold text-purple-600">
              {activeDepositors} Deposited
            </span>
          </div>

          {loading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-14 bg-slate-100 rounded-2xl" />
              <div className="h-14 bg-slate-100 rounded-2xl" />
            </div>
          ) : invitedList.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center flex flex-col items-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                <Users size={24} className="text-slate-400" />
              </div>
              <p className="text-sm font-black text-slate-800">No Friends Invited Yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                Share your promoter link on Telegram to invite players and start earning!
              </p>
              <button
                onClick={handleShare}
                className="mt-4 px-4 py-2 bg-purple-50 border border-purple-200 text-purple-700 rounded-xl text-xs font-black flex items-center space-x-1.5 active:scale-95 transition-all"
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
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5 flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center font-black text-sm shrink-0">
                      {(player.first_name || player.username || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="truncate">
                      <p className="text-xs font-black text-slate-900 truncate">{player.first_name}</p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {player.username ? `@${player.username}` : `ID: ${player.telegram_id}`}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-3">
                    {player.has_deposited ? (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black">
                        <CheckCircle2 size={10} />
                        <span>+{player.reward_earned ?? 0} ETB</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-600 text-[10px] font-bold">
                        <Clock size={10} />
                        <span>Pending</span>
                      </span>
                    )}
                    <p className="text-[9px] text-slate-400 mt-0.5">
                      {new Date(player.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col items-center space-y-1 pt-2 text-center">
          <div className="flex items-center space-x-1.5">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center">
              <span className="text-[8px] font-black text-slate-900">75</span>
            </div>
            <span className="text-xs font-black text-slate-700">HDASE <span className="text-amber-500">BINGO</span></span>
          </div>
          <p className="text-[10px] text-slate-400 font-semibold">🇪🇹 Official Promoter Network</p>
        </div>
      </div>
    </div>
  );
}
