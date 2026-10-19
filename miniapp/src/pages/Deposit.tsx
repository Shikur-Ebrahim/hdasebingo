import { useState, useEffect } from 'react';
import { ArrowLeft, ChevronRight, CheckCircle2, UploadCloud, X, Clock, AlertCircle, Copy, Check, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';
import { t } from '../lib/translations';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface DepositMethod {
  id: string;
  type: 'cbe' | 'boa' | 'telebirr' | 'mpesa';
  name: string;
  account_number: string;
  logo_url: string;
  min_deposit: number;
}

const typeLabels: Record<string, string> = {
    cbe: 'Commercial Bank of Ethiopia',
  boa: 'Bank of Abyssinia',
  telebirr: 'Telebirr',
  mpesa: 'M-Pesa',
  cbebirr: 'CBE Birr',
  ebirr: 'E-Birr',
  awash: 'Awash Bank',
  dashen: 'Dashen Bank',
  amhara: 'Amhara Bank',
  coop: 'Cooperative Bank of Oromia',
  amole: 'Amole Wallet',
  hello_cash: 'HelloCash',
  nib: 'Nib International Bank',
  wegagen: 'Wegagen Bank',
  zemen: 'Zemen Bank',
  oromia: 'Oromia Bank',
  hibret: 'Hibret Bank',
};

const typeBadge: Record<string, string> = {
    cbe: 'bg-yellow-100 text-yellow-700',
  boa: 'bg-blue-100 text-blue-700',
  telebirr: 'bg-purple-100 text-purple-700',
  mpesa: 'bg-green-100 text-green-700',
  cbebirr: 'bg-yellow-200 text-yellow-800',
  ebirr: 'bg-orange-100 text-orange-700',
  awash: 'bg-slate-100 text-slate-700',
  dashen: 'bg-blue-200 text-blue-800',
  amhara: 'bg-teal-100 text-teal-700',
  coop: 'bg-indigo-100 text-indigo-700',
  amole: 'bg-red-100 text-red-700',
  hello_cash: 'bg-green-200 text-green-800',
  nib: 'bg-purple-200 text-purple-800',
  wegagen: 'bg-slate-200 text-slate-800',
  zemen: 'bg-orange-200 text-orange-800',
  oromia: 'bg-teal-200 text-teal-800',
  hibret: 'bg-yellow-100 text-yellow-800',
};

type Step = 'list' | 'form' | 'success' | 'pending_status';

export default function Deposit() {
  const { language } = useGameStore();
  const [methods, setMethods] = useState<DepositMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DepositMethod | null>(null);
  const [step, setStep] = useState<Step>('list');
  const [pendingAmount, setPendingAmount] = useState<number | null>(null);
  const [supportUsername, setSupportUsername] = useState<string | null>(null);

  // Form state
  const [amount, setAmount] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => { fetchMethods(); }, []);

  const fetchMethods = async () => {
    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const [methodsRes, historyRes, supportRes] = await Promise.all([
        fetch(`${API_URL}/deposit/methods`, { headers: { 'x-telegram-init-data': initData } }),
        fetch(`${API_URL}/deposit/history`, { headers: { 'x-telegram-init-data': initData } }),
        fetch(`${API_URL}/player/support-contact`, { headers: { 'x-telegram-init-data': initData } })
      ]);

      if (methodsRes.ok) setMethods(await methodsRes.json());
      
      if (historyRes.ok) {
        const history = await historyRes.json();
        const pending = history.find((d: any) => d.status === 'pending');
        if (pending) {
          setPendingAmount(pending.amount);
          setStep('pending_status');
        }
      }

      if (supportRes.ok) {
        const support = await supportRes.json();
        if (support.username) setSupportUsername(support.username);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const selectMethod = (method: DepositMethod) => {
    setSelected(method);
    setAmount('');
    setFile(null);
    setError('');
    setStep('form');
  };

  const uploadScreenshot = async (file: File): Promise<string> => {
    const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
    const res = await fetch(`${API_URL}/upload/presign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData },
      body: JSON.stringify({ filename: file.name, contentType: file.type })
    });
    if (!res.ok) throw new Error('Could not get upload URL');
    const { uploadUrl, publicUrl } = await res.json();
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file
    });
    if (!uploadRes.ok) throw new Error('Screenshot upload failed. Check R2 CORS settings.');
    return publicUrl;
  };

  const handleSubmit = async () => {
    if (!selected) return;
    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid amount.'); return;
    }
    if (numAmount < selected.min_deposit) {
      setError(`Minimum deposit is ${selected.min_deposit.toLocaleString()} ETB`); return;
    }
    if (!file) {
      setError('Please upload your payment screenshot.'); return;
    }
    setError('');
    setSubmitting(true);
    try {
      const screenshotUrl = await uploadScreenshot(file);
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const res = await fetch(`${API_URL}/deposit/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData },
        body: JSON.stringify({ method_id: selected.id, amount: numAmount, screenshot_url: screenshotUrl })
      });
      if (res.ok) {
        setStep('success');
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to submit.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── STEP: SUCCESS ────────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-6">
        <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800 p-8 text-center">
          <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-5 border-4 border-emerald-100">
            <CheckCircle2 size={40} className="text-emerald-500" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100">{t[language].deposit.submitted}</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium mt-2 leading-relaxed">
            {t[language].deposit.pendingReview.split('{amount}')[0]}<span className="font-black text-slate-700 dark:text-slate-200">{parseFloat(amount).toLocaleString('en-US')} ETB</span>{t[language].deposit.pendingReview.split('{amount}')[1]}
          </p>
          <div className="mt-5 bg-yellow-50 border border-yellow-100 rounded-xl p-4 flex items-start space-x-3">
            <Clock size={18} className="text-yellow-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-yellow-700 font-semibold text-left">{t[language].deposit.willBeCredited}</p>
          </div>
          <Link to="/" className="mt-3 block w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-black py-4 rounded-xl text-center transition-all active:scale-95">
            {t[language].deposit.backHome}
          </Link>
          
          {supportUsername && (
            <a 
              href={`https://t.me/${supportUsername.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center justify-center space-x-2 text-blue-600 font-black text-sm bg-blue-50 hover:bg-blue-100 transition-colors py-3.5 rounded-xl w-full border border-blue-100"
            >
              <MessageCircle size={18} />
              <span>Need Help? {t[language].deposit.contactSupport}</span>
            </a>
          )}
        </div>
      </div>
    );
  }

  // ── STEP: PENDING STATUS ─────────────────────────────────────────────────────
  if (step === 'pending_status') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-6">
        <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800 p-8 text-center">
          <div className="w-20 h-20 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-5 border-4 border-yellow-100">
            <Clock size={40} className="text-yellow-500" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100">{t[language].deposit.alreadyPendingTitle}</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium mt-2 leading-relaxed">
            {t[language].deposit.alreadyPendingDesc.split('{amount}')[0]}<span className="font-black text-slate-700 dark:text-slate-200">{pendingAmount?.toLocaleString('en-US')} ETB</span> {t[language].deposit.alreadyPendingDesc.split('{amount}')[1]}
          </p>
          <div className="mt-5 bg-blue-50 border border-blue-100 rounded-xl p-4">
            <p className="text-xs text-blue-700 font-semibold text-center">{t[language].deposit.waitAdmin}</p>
          </div>
          
          {supportUsername && (
            <a 
              href={`https://t.me/${supportUsername.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center justify-center space-x-2 text-blue-600 font-black text-sm bg-blue-50 hover:bg-blue-100 transition-colors py-3.5 rounded-xl w-full border border-blue-100"
            >
              <MessageCircle size={18} />
              <span>Need Help? {t[language].deposit.contactSupport}</span>
            </a>
          )}

          <Link to="/" className="mt-3 block w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-black py-4 rounded-xl text-center transition-all active:scale-95">
            {t[language].deposit.backHome}
          </Link>
        </div>
      </div>
    );
  }

  // ── STEP: FORM ───────────────────────────────────────────────────────────────
  if (step === 'form' && selected) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-16">
        {/* Header */}
        <div className="bg-white dark:bg-slate-900 px-4 py-3 rounded-b-2xl shadow-sm border-b border-gray-100 dark:border-slate-800 flex items-center space-x-3 sticky top-0 z-10">
          <button onClick={() => setStep('list')} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-black text-slate-800 dark:text-slate-100 text-base leading-tight truncate">
              {t[language].deposit.depositVia} {typeLabels[selected.type] || selected.name}
            </h1>
            <p className="text-[11px] text-slate-400 font-semibold truncate">
              {selected.name}
            </p>
          </div>
        </div>

        <div className="p-3.5 space-y-3">
          {/* Card 1: Bank & Account Details with 1-Tap Copy & Min Deposit */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 p-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                {t[language].deposit.sendMoneyTo}
              </span>
              <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-100 dark:border-emerald-900/40">
                Min: {selected.min_deposit.toLocaleString('en-US')} ETB
              </span>
            </div>

            <div className="flex items-center space-x-3">
              {selected.logo_url ? (
                <img src={selected.logo_url} alt="logo" className="w-12 h-12 rounded-xl object-contain bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60 p-1 flex-shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 font-bold text-xs flex-shrink-0">
                  {selected.type}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${typeBadge[selected.type] || 'bg-slate-100 text-slate-700'}`}>
                    {selected.type.toUpperCase()}
                  </span>
                  <span className="font-black text-slate-700 dark:text-slate-200 text-xs truncate">
                    {selected.name}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-black text-lg text-slate-900 dark:text-slate-100 tracking-wider select-all">
                    {selected.account_number}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(selected.account_number)}
                    className={`flex items-center space-x-1 px-3 py-1 rounded-xl text-xs font-black transition-all active:scale-95 ${
                      copied
                        ? 'bg-emerald-500 text-white shadow-xs'
                        : 'bg-amber-400 hover:bg-amber-500 text-slate-900 shadow-xs'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check size={12} strokeWidth={3} />
                        <span>{t[language].deposit.copySuccess}</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>{t[language].deposit.copy}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Amount Input */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                {t[language].deposit.amountSent}
              </label>
              <span className="text-[10px] text-slate-400 font-semibold">
                ETB
              </span>
            </div>
            <div className="relative">
              <input
                type="number"
                min={selected.min_deposit}
                placeholder={`Minimum ${selected.min_deposit.toLocaleString()} ETB`}
                className="w-full h-11 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 text-base font-black outline-none focus:border-amber-400 focus:bg-white dark:focus:bg-slate-900 transition-all text-slate-800 dark:text-slate-100"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setError(''); }}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                ETB
              </span>
            </div>
          </div>

          {/* Card 3: Screenshot Upload */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                {t[language].deposit.paymentScreenshot}
              </label>
              <span className="text-[10px] text-slate-400 font-semibold">
                JPG / PNG
              </span>
            </div>

            {file ? (
              <div className="h-14 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl px-3 flex items-center justify-between">
                <div className="flex items-center space-x-2.5 overflow-hidden">
                  <img src={URL.createObjectURL(file)} alt="Receipt" className="w-10 h-10 object-cover rounded-lg border border-emerald-300 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-black text-emerald-800 dark:text-emerald-200 truncate">{file.name}</p>
                    <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
                      <Check size={11} strokeWidth={3} />
                      <span>Receipt Attached</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="w-7 h-7 rounded-full bg-rose-100 hover:bg-rose-200 text-rose-600 flex items-center justify-center flex-shrink-0 ml-2"
                >
                  <X size={13} strokeWidth={2.5} />
                </button>
              </div>
            ) : (
              <label className="w-full h-14 border border-dashed border-amber-300 dark:border-amber-500/50 bg-amber-50/30 dark:bg-amber-950/20 hover:bg-amber-50/60 rounded-xl px-3.5 flex items-center justify-between cursor-pointer active:scale-[0.99] transition-all">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-400/20 text-amber-600 flex items-center justify-center flex-shrink-0">
                    <UploadCloud size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-700 dark:text-slate-200 leading-tight">
                      {t[language].deposit.tapToUpload}
                    </p>
                    <p className="text-[9.5px] text-slate-400 font-semibold leading-tight">
                      Attach payment screenshot
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-black text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 px-2.5 py-1 rounded-lg">
                  Browse
                </span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] || null); setError(''); }} />
              </label>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-2.5 flex items-center space-x-2">
              <AlertCircle size={15} className="text-rose-500 flex-shrink-0" />
              <p className="text-xs font-bold text-rose-600">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full h-12 bg-amber-400 hover:bg-amber-500 active:scale-95 text-slate-950 font-black rounded-2xl shadow-sm text-base transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
          >
            {submitting ? (
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                <span>{t[language].deposit.submitting}</span>
              </div>
            ) : (
              <span>{t[language].deposit.submitBtn}</span>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── STEP: LIST ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-20">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 px-4 py-4 rounded-b-2xl shadow-sm border-b border-gray-100 dark:border-slate-800 flex items-center space-x-3 sticky top-0 z-10">
        <Link to="/" className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="font-black text-slate-800 dark:text-slate-100 text-lg leading-tight">{t[language].deposit.title}</h1>
          <p className="text-xs text-slate-400 font-semibold">{t[language].deposit.selectMethod}</p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {loading ? (
          <div className="grid grid-cols-2 gap-3 mt-1">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white dark:bg-slate-900 rounded-3xl h-28 animate-pulse border border-slate-100 dark:border-slate-800" />
            ))}
          </div>
        ) : methods.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 p-10 text-center mt-4">
            <p className="text-slate-500 dark:text-slate-400 font-medium">No deposit methods available.</p>
            <p className="text-xs text-slate-400 mt-1">Please check back later.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-1 pt-1">
              <p className="text-[11px] font-black text-slate-400 tracking-widest uppercase">
                {t[language].deposit.availableMethods}
              </p>
              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-0.5 rounded-full border border-amber-200/50">
                {methods.length} {language === 'am' ? 'መንገዶች' : 'Methods'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-3.5 pt-1">
              {methods.map((method) => (
                <button
                  key={method.id}
                  onClick={() => selectMethod(method)}
                  className="group relative flex items-center justify-center p-3 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800/80 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-md hover:border-amber-400 dark:hover:border-amber-500 active:scale-95 transition-all duration-200 overflow-hidden h-24"
                >
                  {method.logo_url ? (
                    <img
                      src={method.logo_url}
                      alt={typeLabels[method.type] || method.name}
                      className="max-h-16 max-w-[85%] object-contain drop-shadow-xs group-hover:scale-105 transition-transform duration-200"
                    />
                  ) : (
                    <div className="text-slate-400 text-xs font-black uppercase">
                      {method.type}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
