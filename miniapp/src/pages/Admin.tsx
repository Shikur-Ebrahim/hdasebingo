import { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { Users, UserCog, ArrowDownToLine, ArrowUpFromLine, Landmark, CreditCard, Gamepad2, Receipt, Settings2, Search, Radio, Building2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function Admin() {
  const { user } = useGameStore();
  const [stats, setStats] = useState({ pendingDeposits: 0, pendingWithdrawals: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
        const res = await fetch(`${API_URL}/admin/stats`, {
          headers: { 'x-telegram-init-data': initData }
        });
        if (res.ok) setStats(await res.json());
      } catch (err) {}
    };
    fetchStats();
  }, []);

  if (!user || (user.role !== 'admin' && user.role !== 'worker')) {
    return <div className="p-10 text-center font-bold text-slate-600">Access Denied!</div>;
  }

  const perms = user.permissions || {};
  const isAdmin = user.role === 'admin';

  let adminModules = [
    { id: 'dep_methods', title: 'Deposit Methods', icon: Landmark, color: 'text-blue-600', bg: 'bg-blue-100', show: isAdmin },
    { id: 'with_methods', title: 'Withdraw Methods', icon: CreditCard, color: 'text-purple-600', bg: 'bg-purple-100', show: isAdmin },
    { id: 'deposits', title: 'Deposits', icon: ArrowDownToLine, color: 'text-emerald-600', bg: 'bg-emerald-100', show: isAdmin || perms.deposits },
    { id: 'withdrawals', title: 'Withdrawals', icon: ArrowUpFromLine, color: 'text-rose-600', bg: 'bg-rose-100', show: isAdmin || perms.withdrawals },
    { id: 'users', title: 'Users', icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-100', show: isAdmin || perms.users },
    { id: 'workers', title: 'Workers', icon: UserCog, color: 'text-orange-600', bg: 'bg-orange-100', show: isAdmin },
    { id: 'agents', title: 'Agent Rooms', icon: Building2, color: 'text-sky-600', bg: 'bg-sky-100', show: isAdmin },
    { id: 'bingo_games', title: 'Bingo Games', icon: Gamepad2, color: 'text-yellow-600', bg: 'bg-yellow-100', show: isAdmin || perms.games },
    { id: 'user_audit', title: 'User Audit', icon: Search, color: 'text-cyan-600', bg: 'bg-cyan-100', show: isAdmin || perms.reports },
    { id: 'tx_report', title: 'Transaction Report', icon: Receipt, color: 'text-teal-600', bg: 'bg-teal-100', show: isAdmin || perms.reports },
    { id: 'settings', title: 'Settings', icon: Settings2, color: 'text-slate-600', bg: 'bg-slate-100', show: isAdmin || perms.settings },
    { id: 'broadcast', title: 'Broadcast', icon: Radio, color: 'text-pink-600', bg: 'bg-pink-100', show: isAdmin },
  ].filter(m => m.show);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50  p-4 pt-6 pb-8">
      <div className="grid grid-cols-2 gap-3">
        {adminModules.map((mod) => {
          const Icon = mod.icon;
          
          if (mod.id === 'dep_methods') {
            return (
              <Link 
                key={mod.id}
                to="/admin/deposit-methods" 
                className="bg-white  p-5 rounded-2xl shadow-sm border border-gray-100  flex flex-col items-center justify-center space-y-3 transition-all hover:shadow-md active:scale-95"
              >
                <div className={`w-12 h-12 rounded-2xl ${mod.bg} ${mod.color} flex items-center justify-center shadow-inner`}>
                  <Icon size={24} strokeWidth={2.5} />
                </div>
                <span className="font-bold text-sm text-slate-700  text-center">{mod.title}</span>
              </Link>
            )
          }

          if (mod.id === 'with_methods') {
            return (
              <Link
                key={mod.id}
                to="/admin/withdrawal-methods"
                className="bg-white  p-5 rounded-2xl shadow-sm border border-gray-100  flex flex-col items-center justify-center space-y-3 transition-all hover:shadow-md active:scale-95"
              >
                <div className={`w-12 h-12 rounded-2xl ${mod.bg} ${mod.color} flex items-center justify-center shadow-inner`}>
                  <Icon size={24} strokeWidth={2.5} />
                </div>
                <span className="font-bold text-sm text-slate-700  text-center">{mod.title}</span>
              </Link>
            )
          }

          if (mod.id === 'deposits') {
            return (
              <Link
                key={mod.id}
                to="/admin/deposits"
                className="bg-white  p-5 rounded-2xl shadow-sm border border-gray-100  flex flex-col items-center justify-center space-y-3 transition-all hover:shadow-md active:scale-95"
              >
                <div className={`w-12 h-12 rounded-2xl ${mod.bg} ${mod.color} flex items-center justify-center shadow-inner`}>
                  <Icon size={24} strokeWidth={2.5} />
                </div>
                <div className="flex items-center justify-center space-x-1.5">
                  <span className="font-bold text-sm text-slate-700  text-center">{mod.title}</span>
                  {stats.pendingDeposits > 0 && (
                    <span className="bg-emerald-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-md animate-pulse shadow-sm">
                      {stats.pendingDeposits}
                    </span>
                  )}
                </div>
              </Link>
            )
          }

          if (mod.id === 'withdrawals') {
            return (
              <Link
                key={mod.id}
                to="/admin/withdrawals"
                className="bg-white  p-5 rounded-2xl shadow-sm border border-gray-100  flex flex-col items-center justify-center space-y-3 transition-all hover:shadow-md active:scale-95"
              >
                <div className={`w-12 h-12 rounded-2xl ${mod.bg} ${mod.color} flex items-center justify-center shadow-inner`}>
                  <Icon size={24} strokeWidth={2.5} />
                </div>
                <div className="flex items-center justify-center space-x-1.5">
                  <span className="font-bold text-sm text-slate-700  text-center">{mod.title}</span>
                  {stats.pendingWithdrawals > 0 && (
                    <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-md animate-pulse shadow-sm">
                      {stats.pendingWithdrawals}
                    </span>
                  )}
                </div>
              </Link>
            )
          }

          // Route-based modules
          const routeMap: Record<string, string> = {
            users: '/admin/users',
            workers: '/admin/workers',
            agents: '/admin/agents',
              bingo_games: '/admin/bingo-games',
            user_audit: '/admin/user-audit',
            tx_report: '/admin/tx-report',
            settings: '/admin/settings',
            broadcast: '/admin/broadcast',
          };
          if (routeMap[mod.id]) {
            return (
              <Link
                key={mod.id}
                to={routeMap[mod.id]}
                className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center space-y-3 transition-all hover:shadow-md active:scale-95"
              >
                <div className={`w-12 h-12 rounded-2xl ${mod.bg} ${mod.color} flex items-center justify-center shadow-inner`}>
                  <Icon size={24} strokeWidth={2.5} />
                </div>
                <span className="font-bold text-sm text-slate-700 text-center">{mod.title}</span>
              </Link>
            );
          }

          return (
            <button
              key={mod.id}
              className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center space-y-3 transition-all hover:shadow-md active:scale-95"
            >
              <div className={`w-12 h-12 rounded-2xl ${mod.bg} ${mod.color} flex items-center justify-center shadow-inner`}>
                <Icon size={24} strokeWidth={2.5} />
              </div>
              <span className="font-bold text-sm text-slate-700 text-center">{mod.title}</span>
            </button>
          )
        })}
      </div>
    </div>
  );
}
