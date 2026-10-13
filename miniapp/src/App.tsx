import { useEffect, useRef, useState } from 'react';
import { MemoryRouter, Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { Gamepad2, Wallet, Trophy, User, Headphones } from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from './store/gameStore';
import { t } from './lib/translations';

import Home from './pages/Home';
import Deposit from './pages/Deposit';
import Withdraw from './pages/Withdraw';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import Worker from './pages/Worker';
import BingoGame from './pages/BingoGame';
import AdminBingoGames from './pages/AdminBingoGames';
import AdminUserAudit from './pages/AdminUserAudit';
import Leaderboard from './pages/Leaderboard';
import GamesReport from './pages/GamesReport';
import Audit from './pages/Audit';
import Rules from './pages/Rules';
import Support from './pages/Support';
import { ErrorBoundary } from './components/ErrorBoundary';

// Show/hide Telegram's native Back button based on route depth
// Uses a stable ref so we NEVER register multiple onClick handlers
function TelegramBackButton() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const isRoot = location.pathname === '/' || location.pathname === '/admin' || location.pathname === '/worker';

  useEffect(() => {
    if (!WebApp?.BackButton) return;

    // Single stable handler — registered once, never duplicated
    const handler = () => { navigateRef.current(-1); };

    if (isRoot) {
      WebApp.BackButton.hide();
      WebApp.BackButton.offClick(handler);
    } else {
      // Clear previous, then set fresh — prevents stacking
      WebApp.BackButton.offClick(handler);
      WebApp.BackButton.onClick(handler);
      WebApp.BackButton.show();
    }

    return () => { WebApp.BackButton.offClick(handler); };
  }, [isRoot]);

  return null;
}

function Navigation() {
  const location = useLocation();
  const { user, isProfileOpen, setProfileOpen, language } = useGameStore();

  // Hide the player bottom navigation if the user is an Admin or Worker
  if (user?.role === 'admin' || user?.role === 'worker') {
    return null;
  }

  const navItems = [
    { path: '/', label: t[language].nav.games, icon: Gamepad2 },
    { path: '/deposit', label: t[language].nav.deposit, icon: Wallet },
    { path: '/leaderboard', label: t[language].nav.leaderboard, icon: Trophy },
    { path: '#', label: t[language].nav.profile, icon: User },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 pb-safe z-40 transition-colors">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isProfileTab = item.icon === User;
          const isActive = isProfileTab ? isProfileOpen : (!isProfileOpen && location.pathname === item.path);
          
          return (
            <Link
              key={item.label}
              to={isProfileTab ? location.pathname : item.path}
              onClick={(e) => {
                if (isProfileTab) {
                  e.preventDefault();
                  setProfileOpen(true);
                } else {
                  setProfileOpen(false);
                }
              }}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
                isActive ? 'text-yellow-600 dark:text-yellow-500' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'
              }`}
            >
              <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function RoleRouter() {
  const { user, loading } = useGameStore();
  
  // Show spinner while user is loading (prevents blank flash)
  if (!user && loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }
  
  if (user?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }
  
  if (user?.role === 'worker') {
    return <Navigate to="/worker" replace />;
  }
  
  // Default user role sees the normal bingo home page
  return <Home />;
}

import AdminDepositMethods from './pages/AdminDepositMethods';
import AdminWithdrawalMethods from './pages/AdminWithdrawalMethods';
import AdminDeposits from './pages/AdminDeposits';
import AdminWithdrawals from './pages/AdminWithdrawals';
import AdminSettings from './pages/AdminSettings';
import AdminTxReport from './pages/AdminTxReport';
import AdminUsers from './pages/AdminUsers';
import AdminWorkers from './pages/AdminWorkers';
import AdminBroadcast from './pages/AdminBroadcast';
import AdminAgents from './pages/AdminAgents';

import DepositHistory from './pages/DepositHistory';
import WithdrawHistory from './pages/WithdrawHistory';
import Transfer from './pages/Transfer';
import Invite from './pages/Invite';
import InvitedPeople from './pages/InvitedPeople';

function App() {
  const { fetchUser, subscribeToBalance, isDarkMode, isBlocked, setProfileOpen } = useGameStore();
  const [supportUsername, setSupportUsername] = useState<string>('');

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    // Always start with profile closed (prevent persisted open state)
    setProfileOpen(false);

    // Apply dark mode on initial load
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    fetchUser().then(() => {
      const unsub = subscribeToBalance();
      return unsub;
    });
  }, [fetchUser, subscribeToBalance]);

  useEffect(() => {
    if (isBlocked) {
      fetch(`${import.meta.env.VITE_API_URL || '/api'}/player/support-contact`, {
        headers: { 'x-telegram-init-data': WebApp.initData }
      })
      .then(r => r.json())
      .then(d => {
        if (d.username) setSupportUsername(d.username);
      })
      .catch(e => console.error(e));
    }
  }, [isBlocked]);

  const handleSupport = () => {
    if (supportUsername) {
      const username = supportUsername.replace('@', '');
      WebApp.openTelegramLink(`https://t.me/${username}`);
    }
  };

  if (isBlocked) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center p-6 z-50">
        <div className="w-20 h-20 rounded-full bg-rose-500/20 flex items-center justify-center mb-5">
          <span className="text-4xl">🚫</span>
        </div>
        <h1 className="text-white font-black text-xl mb-2 text-center">Account Deactivated</h1>
        <p className="text-white/60 text-sm font-medium text-center max-w-xs mb-8">
          Your account has been deactivated by the admin. Please contact support for more information.
        </p>
        
        {supportUsername && (
          <button 
            onClick={handleSupport}
            className="px-6 py-3 bg-white text-slate-900 rounded-xl font-black text-sm active:scale-95 transition-all flex items-center space-x-2"
          >
            <span>💬</span>
            <span>Contact Support</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <MemoryRouter initialEntries={['/']} initialIndex={0}>
      <TelegramBackButton />
      <div className="min-h-screen bg-slate-50 pb-20 font-sans text-slate-800">
        <ErrorBoundary><Routes>
          <Route path="/" element={<RoleRouter />} />
          <Route path="/deposit" element={<Deposit />} />
          <Route path="/deposit-history" element={<DepositHistory />} />
          <Route path="/withdraw-history" element={<WithdrawHistory />} />
          <Route path="/transfer" element={<Transfer />} />
          <Route path="/bingo/live" element={<BingoGame />} />
          <Route path="/invite" element={<Invite />} />
          <Route path="/invited" element={<InvitedPeople />} />
          <Route path="/withdraw" element={<Withdraw />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/games-report" element={<GamesReport />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/support" element={<Support />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/bingo-games" element={<AdminBingoGames />} />
          <Route path="/admin/user-audit" element={<AdminUserAudit />} />
          <Route path="/admin/deposit-methods" element={<AdminDepositMethods />} />
          <Route path="/admin/withdrawal-methods" element={<AdminWithdrawalMethods />} />
          <Route path="/admin/deposits" element={<AdminDeposits />} />
          <Route path="/admin/withdrawals" element={<AdminWithdrawals />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
          <Route path="/admin/tx-report" element={<AdminTxReport />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/workers" element={<AdminWorkers />} />
          <Route path="/admin/broadcast" element={<AdminBroadcast />} />
          <Route path="/admin/agents" element={<AdminAgents />} />
          <Route path="/worker" element={<Worker />} />
        </Routes></ErrorBoundary>
        <Profile />
        <Navigation />
      </div>
    </MemoryRouter>
  );
}

export default App;

