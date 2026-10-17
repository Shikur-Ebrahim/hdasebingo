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

  const isRoot =
    location.pathname === '/' ||
    location.pathname === '/admin' ||
    location.pathname === '/worker' ||
    location.pathname === '/agent' ||
    location.pathname === '/promoter';

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

  // Hide the player bottom navigation if the user is an Admin, Worker, Agent, or Promoter
  if (user?.role === 'admin' || user?.role === 'worker' || user?.role === 'agent' || user?.role === 'promoter') {
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

  if (user?.role === 'agent') {
    return <Navigate to="/agent" replace />;
  }

  if (user?.role === 'promoter') {
    return <Navigate to="/promoter" replace />;
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
import AdminSupportVideos from './pages/AdminSupportVideos';
import SupportVideos from './pages/SupportVideos';
import Agent from './pages/Agent';
import Promoter from './pages/Promoter';



import DepositHistory from './pages/DepositHistory';
import WithdrawHistory from './pages/WithdrawHistory';
import Transfer from './pages/Transfer';
import Invite from './pages/Invite';
import InvitedPeople from './pages/InvitedPeople';

function App() {
  const { fetchUser, fetchRooms, subscribeToBalance, isDarkMode, isBlocked, setProfileOpen } = useGameStore();
  const [supportUsername, setSupportUsername] = useState<string>('');
  const [isAppInitializing, setIsAppInitializing] = useState(true);

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    // Always start with profile closed (prevent persisted open state)
    setProfileOpen(false);

    // Capture agent room invite start_param if present
    try {
      let detectedRoomId: string | null = null;
      let detectedPromoterRef: string | null = null;
      if (typeof WebApp !== 'undefined' && WebApp.initDataUnsafe?.start_param) {
        const sp = String(WebApp.initDataUnsafe.start_param).trim();
        if (sp.startsWith('room_')) {
          detectedRoomId = sp.replace('room_', '');
        } else if (sp.startsWith('ref_')) {
          detectedPromoterRef = sp; // keep full ref_ string for backend
        }
      }
      if (!detectedRoomId && !detectedPromoterRef && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        let qStart = params.get('room') || params.get('startapp') || params.get('start') || params.get('tgWebAppStartParam');
        if (!qStart && window.location.hash) {
          const hashStr = window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash;
          const hashParams = new URLSearchParams(hashStr);
          qStart = hashParams.get('tgWebAppStartParam') || hashParams.get('room') || hashParams.get('startapp') || hashParams.get('start');
        }
        if (qStart) {
          if (qStart.startsWith('room_')) {
            detectedRoomId = qStart.replace('room_', '');
          } else if (qStart.startsWith('ref_')) {
            detectedPromoterRef = qStart;
          } else {
            detectedRoomId = qStart;
          }
        }
      }
      if (detectedRoomId) {
        localStorage.setItem('hdase_invited_room_id', detectedRoomId);
      }
      if (detectedPromoterRef) {
        localStorage.setItem('hdase_promoter_ref', detectedPromoterRef);
      }
    } catch {}

    // Apply dark mode on initial load
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Load initial data (User + Rooms) concurrently with attractive splash screen
    Promise.all([
      fetchUser(),
      fetchRooms(),
      new Promise(resolve => setTimeout(resolve, 1100)) // smooth display duration
    ]).then(async () => {
      // If user is an agent, prefetch agent room so Agent dashboard opens immediately with zero second loader
      try {
        const currentUser = useGameStore.getState().user;
        if (currentUser?.role === 'agent') {
          const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/player/agent-room`, {
            headers: { 'x-telegram-init-data': WebApp.initData },
          });
          if (res.ok) {
            const data = await res.json();
            localStorage.setItem('hdase_agent_cache', JSON.stringify(data));
          }
        }
      } catch (e) {
        console.error('Agent prefetch error:', e);
      }
      setIsAppInitializing(false);
      const unsub = subscribeToBalance();
      return unsub;
    }).catch(() => {
      setIsAppInitializing(false);
    });
  }, [fetchUser, fetchRooms, subscribeToBalance]);

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

  // Attractive initial loading effect on first app launch
  if (isAppInitializing) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-between py-12 px-6 bg-gradient-to-b from-white via-slate-50 to-amber-50/30 text-slate-800 select-none overflow-hidden">
        {/* Ambient soft background glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full" />

        {/* Center brand & animated bingo badge */}
        <div className="flex flex-col items-center text-center relative z-10 space-y-4">
          <div className="relative">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 shadow-[0_12px_36px_rgba(245,158,11,0.25)] flex items-center justify-center p-1.5 animate-pulse">
              <div className="w-full h-full rounded-[20px] bg-gradient-to-b from-white to-amber-50/90 flex flex-col items-center justify-center border border-amber-300/40 shadow-inner">
                <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br from-amber-600 via-yellow-600 to-amber-700">
                  75
                </span>
                <span className="text-[9px] font-black tracking-widest text-amber-600 uppercase -mt-0.5">
                  BINGO
                </span>
              </div>
            </div>
            {/* Spinning decorative orbit ring */}
            <div className="absolute -inset-2.5 rounded-[32px] border border-amber-400/25 border-t-amber-500 animate-spin pointer-events-none" style={{ animationDuration: '3s' }} />
          </div>

          {/* Title */}
          <div>
            <h1 className="text-3xl font-black tracking-wider text-slate-900 drop-shadow-sm">
              HDASE <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-yellow-600">BINGO</span>
            </h1>
            <p className="text-xs font-bold text-amber-700/80 tracking-widest uppercase mt-1">
              ሕዳሴ ቢንጎ • ይጫወቱ ያሸንፉ
            </p>
          </div>

          {/* Modern Glowing Loading Bar */}
          <div className="w-48 space-y-2.5 pt-2">
            <div className="h-2 w-full bg-slate-200/80 rounded-full overflow-hidden p-0.5 shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 rounded-full animate-pulse shadow-sm"
                style={{
                  width: '100%',
                  animation: 'pulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                }}
              />
            </div>
            <p className="text-[11px] text-slate-500 font-medium tracking-wide">
              በመጫን ላይ... Loading game rooms
            </p>
          </div>
        </div>

        {/* Footer security / platform note */}
        <div className="text-center relative z-10 text-[10px] text-slate-400 font-semibold tracking-wider">
          🇪🇹 Official Ethiopian Bingo Platform
        </div>
      </div>
    );
  }

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
          <Route path="/rooms" element={<BingoGame />} />
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
          <Route path="/admin/support-videos" element={<AdminSupportVideos />} />
          <Route path="/help-videos" element={<SupportVideos />} />
          <Route path="/worker" element={<Worker />} />
          <Route path="/agent" element={<Agent />} />
          <Route path="/promoter" element={<Promoter />} />


        </Routes></ErrorBoundary>
        <Profile />
        <Navigation />
      </div>
    </MemoryRouter>
  );
}

export default App;

