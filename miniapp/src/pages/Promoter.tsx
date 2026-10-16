import { Navigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { Megaphone, Star, Users, TrendingUp, Gift, Share2 } from 'lucide-react';

export default function Promoter() {
  const { user } = useGameStore();

  if (user?.role !== 'promoter') {
    return <Navigate to="/" replace />;
  }

  const stats = [
    { icon: Users, label: 'Invited Friends', value: '—', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    { icon: TrendingUp, label: 'Total Earned', value: '— ETB', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    { icon: Gift, label: 'Bonus Balance', value: `${(user as any)?.bonus_balance ?? 0} ETB`, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    { icon: Star, label: 'Rank', value: 'Promoter', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white select-none">

      {/* Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-violet-500/10 to-transparent pointer-events-none" />
        <div className="absolute -top-10 -right-10 w-48 h-48 bg-purple-400/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -top-10 -left-10 w-48 h-48 bg-violet-400/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative px-5 pt-16 pb-10 flex flex-col items-center text-center">
          {/* Badge Icon */}
          <div className="relative mb-5">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-2xl shadow-purple-500/30">
              <Megaphone size={36} className="text-white" />
            </div>
            {/* Glow ring */}
            <div className="absolute -inset-1.5 rounded-[28px] border border-purple-500/30 border-t-purple-400/60 animate-spin pointer-events-none" style={{ animationDuration: '5s' }} />
          </div>

          {/* Welcome text */}
          <p className="text-xs font-black text-purple-400/80 uppercase tracking-widest mb-1">
            Promoter Portal
          </p>
          <h1 className="text-3xl font-black text-white leading-tight">
            Welcome,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-violet-400">
              {user?.first_name || 'Promoter'}!
            </span>
          </h1>
          <p className="text-slate-400 text-sm font-medium mt-2 max-w-xs leading-relaxed">
            You're a trusted promoter of HDASE BINGO. Share your link and earn rewards for every friend you invite.
          </p>

          {/* Purple pill badge */}
          <div className="mt-4 inline-flex items-center space-x-1.5 bg-purple-500/15 border border-purple-500/30 rounded-full px-4 py-1.5">
            <Star size={12} className="text-purple-400" fill="currentColor" />
            <span className="text-xs font-black text-purple-300 tracking-wide">HDASE BINGO Promoter</span>
          </div>
        </div>
      </div>

      <div className="px-5 pb-12 space-y-5">

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3">
          {stats.map(({ icon: Icon, label, value, color, bg }) => (
            <div key={label} className={`bg-slate-800/50 border border-slate-700/40 rounded-2xl p-4 flex flex-col items-center justify-center space-y-2 text-center`}>
              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${bg}`}>
                <Icon size={18} className={color} />
              </div>
              <p className={`text-lg font-black ${color}`}>{value}</p>
              <p className="text-[11px] text-slate-400 font-medium leading-tight">{label}</p>
            </div>
          ))}
        </div>

        {/* Info card */}
        <div className="relative overflow-hidden bg-gradient-to-br from-purple-900/40 to-violet-900/30 border border-purple-700/40 rounded-3xl p-5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-400/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-start space-x-3 relative">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Share2 size={18} className="text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-black text-white mb-1">How it works</p>
              <ul className="space-y-1.5">
                {[
                  'Share your referral link with friends',
                  'Friends join and deposit into HDASE BINGO',
                  'You earn 10% bonus on their first deposit',
                ].map((step, i) => (
                  <li key={i} className="flex items-start space-x-2">
                    <span className="w-4 h-4 rounded-full bg-purple-500/30 border border-purple-500/40 text-purple-300 text-[9px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <p className="text-xs text-slate-300 font-medium">{step}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Branding footer */}
        <div className="flex flex-col items-center space-y-1 pt-2">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center">
              <span className="text-[9px] font-black text-slate-900">75</span>
            </div>
            <span className="text-sm font-black text-white tracking-wide">
              HDASE <span className="text-amber-400">BINGO</span>
            </span>
          </div>
          <p className="text-[10px] text-slate-600 font-medium">🇪🇹 Official Ethiopian Bingo Platform</p>
        </div>

      </div>
    </div>
  );
}
