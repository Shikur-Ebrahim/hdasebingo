import { useState, useEffect } from 'react';
import { ArrowLeft, Settings, Save, Gift, Users, Headphones, Megaphone, CheckCircle2, AlertCircle, Phone, PhoneCall } from 'lucide-react';
import { Link } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { useGameStore } from '../store/gameStore';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface SettingField {
  key: string;
  label: string;
  icon: React.ReactNode;
  type: 'number' | 'text' | 'textarea';
  unit?: string;
  color: string;
  bg: string;
  defaultValue: string | number;
}

const SETTING_FIELDS: SettingField[] = [
  { key: 'welcome_bonus_amount', label: 'Welcome / Signup Bonus', icon: <Gift size={16} />, type: 'number', unit: 'ETB', color: 'text-amber-600', bg: 'bg-amber-50', defaultValue: 10 },
  { key: 'first_deposit_bonus_pct', label: '1st Deposit Bonus', icon: <Gift size={16} />, type: 'number', unit: '%', color: 'text-emerald-600', bg: 'bg-emerald-50', defaultValue: 20 },
  { key: 'second_deposit_bonus_pct', label: '2nd Deposit Bonus', icon: <Gift size={16} />, type: 'number', unit: '%', color: 'text-blue-600', bg: 'bg-blue-50', defaultValue: 10 },
  { key: 'invitation_reward_pct', label: 'Invite Reward', icon: <Users size={16} />, type: 'number', unit: '%', color: 'text-violet-600', bg: 'bg-violet-50', defaultValue: 10 },
  { key: 'support_username', label: 'Support Team User', icon: <Headphones size={16} />, type: 'text', color: 'text-orange-600', bg: 'bg-orange-50', defaultValue: 'hdasebingo_admin' },
  { key: 'support_phone_usa', label: 'USA Support Phone', icon: <Phone size={16} />, type: 'text', color: 'text-blue-700', bg: 'bg-blue-50', defaultValue: '+1 (984) 378-9510' },
  { key: 'support_phone_eth', label: 'Ethiopia Support Phone', icon: <Phone size={16} />, type: 'text', color: 'text-green-700', bg: 'bg-green-50', defaultValue: '0999992524' },
  { key: 'channel_link', label: 'Official Channel Link', icon: <Megaphone size={16} />, type: 'text', color: 'text-indigo-600', bg: 'bg-indigo-50', defaultValue: 'https://t.me/hdasebingo' },
  { key: 'announcement_message', label: 'Announcement Message', icon: <Megaphone size={16} />, type: 'textarea', color: 'text-fuchsia-600', bg: 'bg-fuchsia-50', defaultValue: '' },
  { key: 'announcement_max_views', label: 'Popup Max Views', icon: <Users size={16} />, type: 'number', color: 'text-pink-600', bg: 'bg-pink-50', defaultValue: 2 },
];

export default function AdminSettings() {
  const { user } = useGameStore();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'x-telegram-init-data': typeof WebApp !== 'undefined' ? WebApp.initData : '',
  });

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/settings`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, string> = {};
        (data.settings || []).forEach((s: any) => { map[s.key] = s.value; });
        SETTING_FIELDS.forEach(f => {
          if (!(f.key in map)) map[f.key] = String(f.defaultValue);
        });
        setValues(map);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  if (!user || (user.role !== 'admin' && !(user.role === 'worker' && user.permissions?.settings))) {
    return <div className="p-10 text-center font-bold text-slate-600">Access Denied</div>;
  }

  const handleSave = async (key: string) => {
    setSaving(key);
    try {
      const res = await fetch(`${API_URL}/admin/settings`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ key, value: values[key] }),
      });
      if (res.ok) {
        showToast('success', 'Saved!');
        if (typeof WebApp !== 'undefined') WebApp.HapticFeedback.notificationOccurred('success');
      } else {
        try {
          const d = await res.json();
          showToast('error', d.error || `Error ${res.status}`);
        } catch {
          showToast('error', `HTTP ${res.status} - Update VPS!`);
        }
      }
    } catch (err: any) {
      showToast('error', err.message || 'Network Error');
    } finally {
      setSaving(null);
    }
  };

  const handleCall = (phone: string) => {
    if (typeof WebApp !== 'undefined') WebApp.HapticFeedback.impactOccurred('medium');
    // Strip formatting to get raw digits/+ for tel: link
    const clean = phone.replace(/[\s()\-]/g, '');
    window.open(`tel:${clean}`, '_self');
  };

  // Read phone values from DB (falls back to hardcoded defaults)
  const usaPhone = values['support_phone_usa'] || '+1 (984) 378-9510';
  const ethPhone = values['support_phone_eth'] || '0999992524';

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-2 left-4 right-4 z-50 flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl shadow-md text-xs font-bold ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white px-3 py-3 shadow-sm border-b border-gray-100 flex items-center shrink-0">
        <Link to="/admin" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 active:bg-slate-200 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="ml-3 flex-1">
          <h1 className="text-lg font-black text-slate-800 leading-tight">Settings</h1>
        </div>
        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-white shrink-0">
          <Settings size={16} />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full space-y-2">
            <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold text-slate-400">Loading...</p>
          </div>
        ) : (
          <>
            {/* ── SUPPORT CONTACT NUMBERS ─────────────────────────────────── */}
            <div className="space-y-2">
              {/* Section label */}
              <div className="flex items-center space-x-2 px-0.5">
                <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                  <PhoneCall size={13} className="text-emerald-600" />
                </div>
                <span className="text-[10.5px] font-black text-slate-500 uppercase tracking-widest">
                  Support Contact Numbers
                </span>
              </div>

              {/* Two phone cards side-by-side */}
              <div className="grid grid-cols-2 gap-2.5">

                {/* ── USA Card ────────────────────────────────────────────── */}
                <button
                  type="button"
                  onClick={() => handleCall(usaPhone)}
                  className="group relative bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden active:scale-[0.96] transition-all duration-150 text-left"
                >
                  {/* USA flag-colored top stripe */}
                  <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #002868 0%, #BF0A30 50%, #FFFFFF 100%)' }} />

                  <div className="p-3 space-y-2.5">
                    {/* Flag + label */}
                    <div className="flex items-center space-x-2">
                      <span className="text-2xl leading-none" role="img" aria-label="USA">🇺🇸</span>
                      <div>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-wide leading-none">United States</p>
                        <p className="text-[8px] text-slate-400 leading-none mt-0.5">US Support Line</p>
                      </div>
                    </div>

                    {/* Number in green */}
                    <div className="bg-emerald-50 border border-emerald-200/70 rounded-xl px-2 py-1.5">
                      <p className="text-[10.5px] font-black text-emerald-700 tracking-tight leading-none break-all">
                        {usaPhone}
                      </p>
                    </div>

                    {/* Call button */}
                    <div className="flex items-center justify-center space-x-1.5 bg-blue-600 group-active:bg-blue-700 rounded-xl py-2 transition-colors shadow-sm">
                      <Phone size={12} className="text-white" />
                      <span className="text-[10px] font-black text-white uppercase tracking-wide">Call Now</span>
                    </div>
                  </div>
                </button>

                {/* ── Ethiopia Card ────────────────────────────────────────── */}
                <button
                  type="button"
                  onClick={() => handleCall(ethPhone)}
                  className="group relative bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden active:scale-[0.96] transition-all duration-150 text-left"
                >
                  {/* Ethiopian flag stripe: green / yellow / red */}
                  <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #078930 0%, #FCDD09 50%, #DA121A 100%)' }} />

                  <div className="p-3 space-y-2.5">
                    {/* Flag + label */}
                    <div className="flex items-center space-x-2">
                      <span className="text-2xl leading-none" role="img" aria-label="Ethiopia">🇪🇹</span>
                      <div>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-wide leading-none">Ethiopia</p>
                        <p className="text-[8px] text-slate-400 leading-none mt-0.5">ETH Support Line</p>
                      </div>
                    </div>

                    {/* Number in green */}
                    <div className="bg-emerald-50 border border-emerald-200/70 rounded-xl px-2 py-1.5">
                      <p className="text-[10.5px] font-black text-emerald-700 tracking-tight leading-none break-all">
                        {ethPhone}
                      </p>
                    </div>

                    {/* Call button */}
                    <div className="flex items-center justify-center space-x-1.5 bg-green-600 group-active:bg-green-700 rounded-xl py-2 transition-colors shadow-sm">
                      <Phone size={12} className="text-white" />
                      <span className="text-[10px] font-black text-white uppercase tracking-wide">Call Now</span>
                    </div>
                  </div>
                </button>
              </div>

              {/* Helper note */}
              <p className="text-[9px] text-slate-400 text-center font-medium">
                Tap a card to call • Update numbers from settings below
              </p>
            </div>

            {/* Section divider */}
            <div className="flex items-center space-x-2">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-[9.5px] font-black text-slate-400 uppercase tracking-wider shrink-0">System Settings</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* Settings fields */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 space-y-1">
              {SETTING_FIELDS.map((field, idx) => (
                <div key={field.key} className={`p-2 flex flex-col space-y-2 ${idx !== SETTING_FIELDS.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div className="flex items-center space-x-2">
                    <div className={`w-7 h-7 rounded-lg ${field.bg} ${field.color} flex items-center justify-center shrink-0`}>
                      {field.icon}
                    </div>
                    <span className="font-bold text-[13px] text-slate-700">{field.label}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="flex-1 relative">
                      {field.type === 'textarea' ? (
                        <textarea
                          value={values[field.key] ?? field.defaultValue}
                          onChange={(e) => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                          rows={3}
                          className="w-full border border-slate-200 focus:border-violet-400 outline-none rounded-lg px-2 py-1.5 font-bold text-slate-800 bg-slate-50 text-[11px] resize-none"
                        />
                      ) : (
                        <input
                          type={field.type}
                          value={values[field.key] ?? field.defaultValue}
                          onChange={(e) => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                          className={`w-full border border-slate-200 focus:border-violet-400 outline-none rounded-lg px-2 py-1.5 font-bold text-slate-800 bg-slate-50 ${field.type === 'number' ? 'text-sm text-center' : 'text-[11px]'}`}
                        />
                      )}
                      {field.unit && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs">
                          {field.unit}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleSave(field.key)}
                      disabled={saving === field.key}
                      className="h-8 px-3 bg-slate-800 hover:bg-slate-900 active:scale-95 disabled:opacity-50 text-white font-bold text-[11px] rounded-lg flex items-center justify-center shadow-sm shrink-0 w-16 transition-all"
                    >
                      {saving === field.key ? (
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <div className="flex items-center space-x-1">
                          <Save size={12} />
                          <span>Save</span>
                        </div>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
