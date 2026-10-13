import { useState } from 'react';
import { ArrowLeft, ArrowRightLeft, CheckCircle2, AlertCircle, Send, User, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { t } from '../lib/translations';
import WebApp from '@twa-dev/sdk';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type Step = 'form' | 'confirm' | 'success' | 'error';

export default function Transfer() {
  const { user, fetchUser, language, setProfileOpen } = useGameStore();
  const [recipientId, setRecipientId] = useState('');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [recipientName, setRecipientName] = useState('');
  const [recipientUsername, setRecipientUsername] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const navigate = useNavigate();

  const handleBack = () => {
    navigate(-1);
    setTimeout(() => setProfileOpen(true), 50);
  };

  // Step 1: Validate input & lookup recipient, then show confirmation screen
  const handleInitiate = async () => {
    const amt = Number(amount);
    if (!recipientId.trim()) {
      setErrorMsg(language === 'am' ? 'እባክዎ የተጠቃሚ መለያ (ID) ያስገቡ።' : 'Please enter a Telegram ID.');
      return;
    }
    if (recipientId.trim() === user?.telegram_id) {
      setErrorMsg(language === 'am' ? 'ለራስዎ ማስተላለፍ አይችሉም።' : 'You cannot transfer to yourself.');
      return;
    }
    if (!amt || amt <= 0) {
      setErrorMsg(language === 'am' ? 'እባክዎ ትክክለኛ መጠን ያስገቡ።' : 'Please enter a valid amount.');
      return;
    }
    if (amt < 10) {
      setErrorMsg(language === 'am' ? 'አነስተኛ ማስተላለፊያ 10 ETB ነው።' : 'Minimum transfer is 10 ETB.');
      return;
    }
    if (amt > (user?.main_balance || 0)) {
      setErrorMsg(language === 'am' ? `በቂ ሂሳብ የለዎትም። ያለዎት ${user?.main_balance || 0} ETB ነው።` : `Insufficient main balance. You have ${user?.main_balance || 0} ETB.`);
      return;
    }

    setErrorMsg('');
    setLoading(true);
    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const res = await fetch(`${API_URL}/player/transfer/lookup?recipient_id=${encodeURIComponent(recipientId.trim())}`, {
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initData,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || (language === 'am' ? 'ተቀባይ አልተገኘም። እባክዎ መለያውን ያረጋግጡ።' : 'Recipient not found. Please check the ID.'));
      } else {
        setRecipientName(data.first_name);
        setRecipientUsername(data.username || '');
        setStep('confirm');
        if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.impactOccurred('light');
      }
    } catch (err: any) {
      setErrorMsg(`Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Actually execute the transfer once user confirms
  const handleConfirm = async () => {
    const amt = Number(amount);
    setConfirming(true);
    setErrorMsg('');
    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const res = await fetch(`${API_URL}/player/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initData,
        },
        body: JSON.stringify({ recipient_telegram_id: recipientId.trim(), amount: amt }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        setErrorMsg(`Server error (${res.status}).`);
        setStep('form');
        setConfirming(false);
        return;
      }

      if (!res.ok) {
        setErrorMsg(data.error || 'Transfer failed.');
        setStep('form');
      } else {
        setRecipientName(data.recipient_name || recipientName);
        await fetchUser(); // refresh balance
        setStep('success');
        if (typeof WebApp !== 'undefined') WebApp.HapticFeedback?.notificationOccurred('success');
      }
    } catch (err: any) {
      setErrorMsg(`Network error: ${err.message}`);
      setStep('form');
    } finally {
      setConfirming(false);
    }
  };

  // ─── CONFIRMATION SCREEN ──────────────────────────────────
  if (step === 'confirm') {
    const amt = Number(amount);
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center px-4 py-8 pb-24">
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 shadow-xl border border-gray-100 dark:border-slate-800 text-center w-full max-w-sm">
          {/* Top Badge */}
          <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/40 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100 dark:border-emerald-900/50">
            <ShieldCheck size={32} className="text-emerald-500" />
          </div>

          <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-1">
            {t[language].transfer.confirmTitle || 'Confirm Transfer'}
          </h2>
          <p className="text-xs text-slate-400 font-medium mb-5 px-2">
            {t[language].transfer.confirmSubtitle || 'Please review transfer details before proceeding'}
          </p>

          {/* Amount Box */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-4 mb-4 shadow-sm border border-slate-700/50">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              {t[language].transfer.amountLabel}
            </p>
            <p className="text-3xl font-black text-emerald-400 tracking-tight">
              {amt.toLocaleString('en-US')} <span className="text-sm font-bold text-white">ETB</span>
            </p>
          </div>

          {/* Sender & Recipient Card */}
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 mb-5 border border-slate-100 dark:border-slate-800 text-left space-y-3">
            {/* Sender */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">
                {t[language].transfer.transferFrom || 'From'}:
              </span>
              <div className="text-right">
                <p className="text-sm font-black text-slate-800 dark:text-slate-100">
                  {user?.first_name || 'You'}
                </p>
                {user?.username && (
                  <p className="text-[10px] text-slate-400 font-medium">@{user.username}</p>
                )}
              </div>
            </div>

            <div className="h-px bg-slate-200/70 dark:bg-slate-700/70" />

            {/* Recipient */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">
                {t[language].transfer.transferTo || 'To'}:
              </span>
              <div className="text-right">
                <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                  {recipientName}
                </p>
                <p className="text-[10px] text-slate-400 font-medium">
                  {recipientUsername ? `@${recipientUsername}` : `ID: ${recipientId}`}
                </p>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mb-5 px-1 leading-relaxed">
            ⚠️ {t[language].transfer.cannotTransferSelf}
          </p>

          {/* Action Buttons */}
          <div className="space-y-2.5">
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-98 text-white py-3.5 rounded-2xl font-black text-sm shadow-md shadow-emerald-500/20 transition-all flex items-center justify-center space-x-2 disabled:bg-slate-200"
            >
              {confirming ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Send size={16} />
                  <span>{t[language].transfer.confirmBtn || 'Confirm & Send'}</span>
                </>
              )}
            </button>
            <button
              onClick={() => { setStep('form'); setErrorMsg(''); }}
              disabled={confirming}
              className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-2xl font-bold text-xs transition-colors"
            >
              {t[language].transfer.cancelBtn || 'Cancel / Edit'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── SUCCESS SCREEN ───────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center px-6 pb-24">
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 shadow-sm border border-gray-100 dark:border-slate-800 text-center w-full max-w-sm">
          <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-950/40 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 size={40} className="text-emerald-500" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-1">
            {t[language].transfer.successTitle}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
            <span className="font-bold text-slate-700 dark:text-slate-200">{Number(amount).toLocaleString('en-US')} ETB</span> {language === 'am' ? 'በተሳካ ሁኔታ ለ' : 'transferred to'} <span className="font-bold text-slate-700 dark:text-slate-200">{recipientName}</span> {language === 'am' ? 'ተላልፏል' : ''}.
          </p>
          <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl p-4 mb-6 text-left border border-emerald-100 dark:border-emerald-900/40">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-0.5">{language === 'am' ? 'አዲስ ሂሳብ' : 'New Balance'}</p>
            <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{(user?.main_balance || 0).toLocaleString('en-US')} <span className="text-xs">ETB</span></p>
          </div>
          <button
            onClick={() => { setStep('form'); setRecipientId(''); setAmount(''); }}
            className="w-full bg-slate-800 dark:bg-slate-700 text-white py-3.5 rounded-2xl font-black text-sm mb-3"
          >
            {language === 'am' ? 'ሌላ ያስተላልፉ' : 'Send Another Transfer'}
          </button>
          <button onClick={handleBack} className="w-full text-slate-400 text-sm font-semibold py-2">
            {language === 'am' ? 'ወደ ፕሮፋይል ተመለስ' : 'Back to Profile'}
          </button>
        </div>
      </div>
    );
  }

  // ─── MAIN FORM ────────────────────────────────────────────
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
          <h1 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{t[language].transfer.transferTitle}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t[language].transfer.transferSubtitle}</p>
        </div>
        <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-950/40 rounded-full flex items-center justify-center">
          <ArrowRightLeft size={18} className="text-emerald-500" />
        </div>
      </div>

      <div className="px-4 py-5 flex flex-col space-y-4">

        {/* BALANCE CARD */}
        <div className="bg-slate-900 rounded-[1.5rem] p-5 flex justify-between items-center shadow-sm">
          <div>
            <p className="text-white/50 text-xs font-semibold mb-1">{t[language].transfer.yourMainBalance}</p>
            <p className="text-3xl font-black text-white">{(user?.main_balance || 0).toLocaleString('en-US')} <span className="text-sm">ETB</span></p>
          </div>
          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
            <User size={24} className="text-white/70" />
          </div>
        </div>

        {/* RECIPIENT INPUT */}
        <div className="bg-white dark:bg-slate-900 rounded-[1.5rem] p-5 shadow-sm border border-gray-100 dark:border-slate-800 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">{t[language].transfer.userIdLabel}</label>
            <input
              type="number"
              inputMode="numeric"
              placeholder={t[language].transfer.userIdPlaceholder}
              value={recipientId}
              onChange={e => { setRecipientId(e.target.value); setErrorMsg(''); setStep('form'); }}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-100 font-bold text-base focus:outline-none focus:border-emerald-400 transition-colors"
            />
            <p className="text-[10px] text-slate-400 font-medium mt-2 ml-1">
              📌 Ask the recipient to copy their ID from their Profile sidebar
            </p>
          </div>

          <div className="h-px bg-slate-100 dark:bg-slate-800" />

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">{t[language].transfer.amountLabel}</label>
            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
                placeholder="Enter amount (Min 10)"
                value={amount}
                onChange={e => { setAmount(e.target.value); setErrorMsg(''); setStep('form'); }}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 pr-16 text-slate-800 dark:text-slate-100 font-bold text-base focus:outline-none focus:border-emerald-400 transition-colors"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">ETB</span>
            </div>
          </div>
        </div>

        {/* ERROR */}
        {errorMsg && (
          <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 rounded-2xl p-4 flex items-start space-x-3">
            <AlertCircle size={18} className="text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{errorMsg}</p>
          </div>
        )}

        {/* SUBMIT BUTTON */}
        <button
          onClick={handleInitiate}
          disabled={loading || !recipientId || !amount}
          className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white py-4 rounded-2xl font-black text-base shadow-sm transition-colors flex items-center justify-center space-x-2"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Send size={18} />
              <span>{t[language].transfer.transferBtn}</span>
            </>
          )}
        </button>

        <p className="text-center text-[10px] text-slate-400 font-semibold">
          ⚠️ {t[language].transfer.cannotTransferSelf}
        </p>
      </div>
    </div>
  );
}
