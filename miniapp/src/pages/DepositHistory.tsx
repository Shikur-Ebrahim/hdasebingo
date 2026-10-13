import { useState, useEffect } from 'react';
import { ArrowLeft, Clock, CheckCircle2, XCircle, ArrowDownToLine, Receipt, ChevronDown, ChevronUp, Image, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { t } from '../lib/translations';
import WebApp from '@twa-dev/sdk';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface Deposit {
  id: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  screenshot_url?: string;
  deposit_methods?: {
    type: string;
    name: string;
  };
}

export default function DepositHistory() {
  const [history, setHistory] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const navigate = useNavigate();
  const { setProfileOpen, language } = useGameStore();

  const handleBack = () => {
    navigate(-1);
    setTimeout(() => setProfileOpen(true), 50);
  };

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
        const res = await fetch(`${API_URL}/deposit/history`, {
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
      case 'approved': return { color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', icon: CheckCircle2, label: t[language].depositHistory.statusApproved, badgeBg: 'bg-emerald-100 text-emerald-700' };
      case 'rejected': return { color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100', icon: XCircle, label: t[language].depositHistory.statusRejected, badgeBg: 'bg-rose-100 text-rose-700' };
      default: return { color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', icon: Clock, label: t[language].depositHistory.statusPending, badgeBg: 'bg-amber-100 text-amber-700' };
    }
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
          <h1 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{t[language].depositHistory.title}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t[language].depositHistory.subtitle}</p>
        </div>
      </div>

      {/* CONTENT */}
      <div className="px-4 py-4 flex-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 space-y-3">
            <div className="w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-bold text-slate-400">{t[language].depositHistory.loading}</p>
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
              <Receipt size={32} className="text-slate-300" />
            </div>
            <h3 className="text-lg font-black text-slate-700 dark:text-slate-200 mb-1">{t[language].depositHistory.noDepositsTitle}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{t[language].depositHistory.noDepositsDesc}</p>
            <Link to="/deposit" className="bg-yellow-400 hover:bg-yellow-500 text-yellow-950 px-6 py-3 rounded-xl font-black text-sm shadow-sm active:scale-95 transition-transform">
              {t[language].depositHistory.depositNow}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((deposit) => {
              const { color, bg, border, icon: StatusIcon, label, badgeBg } = getStatusConfig(deposit.status);
              const isExpanded = expandedId === deposit.id;

              return (
                <div key={deposit.id} className={`bg-white dark:bg-slate-900 rounded-[1.25rem] shadow-sm border ${border} overflow-hidden transition-all`}>
                  {/* MAIN ROW */}
                  <div className="p-4 flex items-center">
                    <div className={`w-12 h-12 rounded-2xl ${bg} flex items-center justify-center shrink-0 mr-3`}>
                      <ArrowDownToLine size={22} className={color} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">
                        {deposit.deposit_methods?.name || 'Bank Transfer'}
                      </p>
                      <div className="flex items-center space-x-1.5 mt-0.5 flex-wrap gap-y-0.5">
                        <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${badgeBg} flex items-center space-x-0.5`}>
                          <StatusIcon size={9} />
                          <span>{label}</span>
                        </span>
                        <span className="text-[10px] font-semibold text-slate-400">
                          {formatDate(deposit.created_at)}
                        </span>
                      </div>
                    </div>

                    <div className="text-right pl-2 shrink-0">
                      <p className="font-black text-slate-800 dark:text-slate-100 text-base">+{deposit.amount.toLocaleString('en-US')}</p>
                      <p className="text-[10px] font-bold text-slate-400">ETB</p>
                    </div>
                  </div>

                  {/* VIEW DETAIL BUTTON */}
                  {deposit.screenshot_url && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : deposit.id)}
                      className={`w-full flex items-center justify-center space-x-1.5 py-2.5 border-t ${border} text-xs font-bold transition-colors ${isExpanded ? `${bg} ${color}` : 'text-blue-500 hover:bg-blue-50'}`}
                    >
                      <Image size={13} />
                      <span>{isExpanded ? t[language].depositHistory.hideDetails : t[language].depositHistory.viewReceipt}</span>
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  )}

                  {/* SCREENSHOT PREVIEW */}
                  {isExpanded && deposit.screenshot_url && (
                    <div className="px-4 pb-4 pt-2">
                      <div
                        className="rounded-xl overflow-hidden border border-gray-100 dark:border-slate-800 cursor-zoom-in"
                        onClick={() => setLightboxUrl(deposit.screenshot_url!)}
                      >
                        <img
                          src={deposit.screenshot_url}
                          alt="Payment receipt"
                          className="w-full object-contain max-h-64"
                        />
                      </div>
                      <p className="text-center text-[10px] text-slate-400 font-semibold mt-2">{t[language].depositHistory.viewReceipt}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* LIGHTBOX (full-screen image viewer) */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-5 right-5 text-white bg-white dark:bg-slate-900/20 rounded-full w-9 h-9 flex items-center justify-center"
            onClick={() => setLightboxUrl(null)}
          >
            <X size={20} />
          </button>
          <img
            src={lightboxUrl}
            alt="Payment receipt full"
            className="max-w-full max-h-full rounded-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
