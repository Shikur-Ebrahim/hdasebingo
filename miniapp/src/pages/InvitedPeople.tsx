import { useState, useEffect } from 'react';
import { ArrowLeft, Users, Gift, CheckCircle2, Clock, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import WebApp from '@twa-dev/sdk';
import { t } from '../lib/translations';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface InvitedUser {
  telegram_id: string;
  first_name: string;
  username?: string;
  joined_at: string;
  has_deposited: boolean;
  first_deposit_amount: number;
  first_deposit_date: string | null;
  reward_earned: number;
}

export default function InvitedPeople() {
  const [invited, setInvited] = useState<InvitedUser[]>([]);
  const [totalEarned, setTotalEarned] = useState(0);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { setProfileOpen, language } = useGameStore();

  useEffect(() => {
    const fetchInvited = async () => {
      try {
        const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
        const res = await fetch(`${API_URL}/player/invited`, {
          headers: {
            'Content-Type': 'application/json',
            'x-telegram-init-data': initData,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setInvited(data.invited || []);
          setTotalEarned(data.total_earned || 0);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchInvited();
  }, []);

  const handleBack = () => {
    navigate(-1);
    setTimeout(() => setProfileOpen(true), 50);
  };

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getInitial = (name: string) => name?.charAt(0)?.toUpperCase() || '?';

  const avatarColors = [
    'bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-rose-500',
    'bg-amber-500', 'bg-cyan-500', 'bg-pink-500', 'bg-indigo-500',
  ];
  const getColor = (id: string) => avatarColors[parseInt(id.slice(-1)) % avatarColors.length];

  const depositedCount = invited.filter(u => u.has_deposited).length;
  const pendingCount = invited.length - depositedCount;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col pb-6">

      {/* HEADER */}
      <div className="bg-white dark:bg-slate-900 px-4 pt-6 pb-4 shadow-sm border-b border-gray-100 dark:border-slate-800 flex items-center sticky top-0 z-10">
        <button
          onClick={handleBack}
          className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 active:bg-slate-200 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="ml-4 flex-1">
          <h1 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{t[language].invitedPeople.title}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t[language].invitedPeople.subtitle}</p>
        </div>
      </div>

      <div className="px-4 py-4 flex flex-col space-y-4">

        {/* STATS ROW */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 shadow-sm border border-gray-100 dark:border-slate-800 text-center">
            <div className="w-8 h-8 bg-violet-50 rounded-full flex items-center justify-center mx-auto mb-1.5">
              <Users size={16} className="text-violet-500" />
            </div>
            <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{invited.length}</p>
            <p className="text-[10px] font-semibold text-slate-400 mt-0.5">{t[language].invitedPeople.totalInvited}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 shadow-sm border border-gray-100 dark:border-slate-800 text-center">
            <div className="w-8 h-8 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-1.5">
              <CheckCircle2 size={16} className="text-emerald-500" />
            </div>
            <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{depositedCount}</p>
            <p className="text-[10px] font-semibold text-slate-400 mt-0.5">{t[language].invitedPeople.deposited}</p>
          </div>
          <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl p-3 shadow-sm text-center">
            <div className="w-8 h-8 bg-white dark:bg-slate-900/20 rounded-full flex items-center justify-center mx-auto mb-1.5">
              <Gift size={16} className="text-white" />
            </div>
            <p className="text-2xl font-black text-white">{totalEarned.toLocaleString('en-US')}</p>
            <p className="text-[10px] font-semibold text-white/80 mt-0.5">{t[language].invitedPeople.etbEarned}</p>
          </div>
        </div>

        {/* LIST */}
        {loading ? (
          <div className="flex flex-col items-center justify-center h-40 space-y-3">
            <div className="w-7 h-7 border-4 border-violet-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold text-slate-400">{t[language].invitedPeople.loading}</p>
          </div>
        ) : invited.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-52 text-center">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-3">
              <UserPlus size={28} className="text-slate-300" />
            </div>
            <h3 className="text-base font-black text-slate-700 dark:text-slate-200 mb-1">{t[language].invitedPeople.noInvites}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 max-w-[200px]">{t[language].invitedPeople.shareLinkText}</p>
            <button
              onClick={() => navigate('/invite')}
              className="bg-violet-500 text-white px-5 py-2.5 rounded-xl font-black text-sm active:scale-95 transition-transform"
            >
              Invite Friends
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 px-1">{t[language].invitedPeople.friendsList.replace('{count}', invited.length.toString())}</p>
            {invited.map((user) => (
              <div key={user.telegram_id} className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 shadow-sm border border-gray-100 dark:border-slate-800 flex items-center">

                {/* AVATAR */}
                <div className={`w-10 h-10 rounded-full ${getColor(user.telegram_id)} flex items-center justify-center text-white font-black text-base shrink-0 mr-3`}>
                  {getInitial(user.first_name)}
                </div>

                {/* INFO */}
                <div className="flex-1 min-w-0">
                  <p className="font-black text-sm text-slate-800 dark:text-slate-100 truncate">{user.first_name}</p>
                  <div className="flex items-center space-x-1.5 mt-0.5">
                    {user.has_deposited ? (
                      <span className="flex items-center space-x-0.5 text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                        <CheckCircle2 size={9} />
                        <span>{t[language].invitedPeople.statusDeposited}</span>
                      </span>
                    ) : (
                      <span className="flex items-center space-x-0.5 text-[9px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                        <Clock size={9} />
                        <span>{t[language].invitedPeople.notYet}</span>
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 font-medium">
                      {t[language].invitedPeople.joined.replace('{date}', formatDate(user.joined_at))}
                    </span>
                  </div>
                </div>

                {/* REWARD */}
                <div className="text-right pl-2 shrink-0">
                  {user.has_deposited ? (
                    <>
                      <p className="text-sm font-black text-amber-600">+{user.reward_earned.toLocaleString('en-US')}</p>
                      <p className="text-[9px] font-bold text-slate-400">{t[language].invitedPeople.etbBonus}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-black text-slate-300">—</p>
                      <p className="text-[9px] font-bold text-slate-400">{t[language].invitedPeople.pending}</p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
