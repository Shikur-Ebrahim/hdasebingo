import { useState, useEffect } from 'react';
import { ArrowLeft, Clock, CheckCircle2, XCircle, ArrowUpFromLine, Receipt, ChevronDown, ChevronUp } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { t } from '../lib/translations';
import WebApp from '@twa-dev/sdk';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface Withdrawal {
  id: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  account_name: string;
  account_number: string;
  withdrawal_methods?: {
    type: string;
  };
}

export default function WithdrawHistory() {
  const [history, setHistory] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { setProfileOpen, language } = useGameStore();

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
        const res = await fetch(`${API_URL}/withdraw/history`, {
          headers: {
            'Content-Type': 'application/json',
            'x-telegram-init-data': initData
          }
        });
        if (res.ok) {
          const data = await res.json();
          setHistory(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'approved': return { color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', icon: CheckCircle2, label: t[language].withdrawHistory.statusApproved, badgeBg: 'bg-emerald-100 text-emerald-700' };
      case 'rejected': return { color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100', icon: XCircle, label: t[language].withdrawHistory.statusRejected, badgeBg: 'bg-rose-100 text-rose-700' };
      default: return { color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', icon: Clock, label: t[language].withdrawHistory.statusPending, badgeBg: 'bg-amber-100 text-amber-700' };
    }
  };

  const handleBack = () => {
    navigate(-1);
    setTimeout(() => setProfileOpen(true), 50);
  };

  const getMethodLabel = (type?: string) => {
    const labels: Record<string, string> = {
      cbe: 'Commercial Bank',
      boa: 'Bank of Abyssinia',
      telebirr: 'Telebirr',
      mpesa: 'M-Pesa',
    };
    return labels[type || ''] || type || 'Bank Transfer';
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col pb-24">

      {/* HEADER */}
      <div className="bg-white dark:bg-slate-900 px-4 pt-6 pb-4 shadow-sm border-b border-gray-100 dark:border-slate-800 flex items-center sticky top-0 z-10">
        <button
          onClick={handleBack}
          className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 active:bg-slate-200 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="ml-4 flex-1">
        <h1 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{t[language].withdrawHistory.title}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t[language].withdrawHistory.subtitle}</p>
        </div>
      </div>

      {/* CONTENT */}
      <div className="px-4 py-4 flex-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 space-y-3">
            <div className="w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-bold text-slate-400">{t[language].withdrawHistory.loading}</p>
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
              <Receipt size={32} className="text-slate-300" />
            </div>
            <h3 className="text-lg font-black text-slate-700 dark:text-slate-200 mb-1">{t[language].withdrawHistory.noWithdrawalsTitle}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{t[language].withdrawHistory.noWithdrawalsDesc}</p>
            <Link to="/withdraw" className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-xl font-black text-sm shadow-sm active:scale-95 transition-transform">
              {t[language].withdrawHistory.withdrawNow}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((withdrawal) => {
              const { color, bg, border, icon: StatusIcon, label, badgeBg } = getStatusConfig(withdrawal.status);
              const isExpanded = expandedId === withdrawal.id;

              return (
                <div key={withdrawal.id} className={`bg-white dark:bg-slate-900 rounded-[1.25rem] shadow-sm border ${border} overflow-hidden transition-all`}>
                  {/* MAIN ROW */}
                  <div className="p-4 flex items-center">
                    <div className={`w-12 h-12 rounded-2xl ${bg} flex items-center justify-center shrink-0 mr-3`}>
                      <ArrowUpFromLine size={22} className={color} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">
                        {getMethodLabel(withdrawal.withdrawal_methods?.type)}
                      </p>
                      <div className="flex items-center space-x-1.5 mt-0.5 flex-wrap gap-y-0.5">
                        <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${badgeBg} flex items-center space-x-0.5`}>
                          <StatusIcon size={9} />
                          <span>{label}</span>
                        </span>
                        <span className="text-[10px] font-semibold text-slate-400">
                          {formatDate(withdrawal.created_at)}
                        </span>
                      </div>
                    </div>

                    <div className="text-right pl-2 shrink-0">
                      <p className="font-black text-slate-800 dark:text-slate-100 text-base">-{withdrawal.amount.toLocaleString('en-US')}</p>
                      <p className="text-[10px] font-bold text-slate-400">ETB</p>
                    </div>
                  </div>

                  {/* VIEW DETAIL TOGGLE */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : withdrawal.id)}
                    className={`w-full flex items-center justify-center space-x-1.5 py-2.5 border-t ${border} text-xs font-bold transition-colors ${isExpanded ? `${bg} ${color}` : 'text-blue-500 hover:bg-blue-50'}`}
                  >
                    <span>{isExpanded ? t[language].withdrawHistory.hideDetails : t[language].withdrawHistory.viewDetails}</span>
                    {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>

                  {/* EXPANDED DETAIL */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-3 space-y-2">
                      <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t[language].withdrawHistory.accountName}</span>
                          <span className="text-xs font-black text-slate-700 dark:text-slate-200">{withdrawal.account_name}</span>
                        </div>
                        <div className="h-px bg-slate-100 dark:bg-slate-800" />
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t[language].withdrawHistory.accountNumber}</span>
                          <span className="text-xs font-black text-slate-700 dark:text-slate-200 font-mono">{withdrawal.account_number}</span>
                        </div>
                        <div className="h-px bg-slate-100 dark:bg-slate-800" />
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t[language].withdrawHistory.amount}</span>
                          <span className={`text-xs font-black ${color}`}>{withdrawal.amount.toLocaleString('en-US')} ETB</span>
                        </div>
                        <div className="h-px bg-slate-100 dark:bg-slate-800" />
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t[language].withdrawHistory.status}</span>
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${badgeBg} flex items-center space-x-0.5`}>
                            <StatusIcon size={9} />
                            <span className="ml-0.5">{label}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
