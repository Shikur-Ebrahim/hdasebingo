import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, RefreshCw, Eye, AlertCircle, Users,
  ChevronDown, ChevronUp, Settings, Save, X, Edit3,
  Clock, Zap, Trophy, UserCheck, Percent
} from "lucide-react";
import WebApp from "@twa-dev/sdk";
import { useGameStore } from "../store/gameStore";

const API = import.meta.env.VITE_API_URL || "/api";

interface BGame {
  id: string; stake: number; prize_pool: number;
  status: "waiting" | "calling" | "finished";
  called_numbers: number[];
  winner_cartela: number | null; winner_prize: number | null; winner_first_name: string | null;
  start_at: string; finished_at: string | null; created_at: string;
}
interface GameSettings {
  call_interval_ms: number;
  waiting_period_s: number;
  release_time_s: number;
  min_players: number;
  max_players: number;
  prize_percent: number;
  max_cartelas_per_user: number;
  early_call_8_enabled?: boolean;
  early_call_8_rewards?: Record<number, number>;
  early_call_10_enabled?: boolean;
  early_call_10_rewards?: Record<number, number>;
}
const DEFAULT: GameSettings = { 
  call_interval_ms: 3000, 
  waiting_period_s: 60, 
  release_time_s: 60,
  min_players: 2, 
  max_players: 150, 
  prize_percent: 80,
  max_cartelas_per_user: 2,
  early_call_8_enabled: false,
  early_call_8_rewards: { 10: 100, 20: 200, 50: 500, 100: 1000 },
  early_call_10_enabled: false,
  early_call_10_rewards: { 10: 70, 20: 210, 50: 350, 100: 700 }
};
const STATUS_COLOR: Record<string, string> = {
  waiting:  "bg-amber-100 text-amber-700",
  calling:  "bg-emerald-100 text-emerald-700",
  finished: "bg-slate-100 text-slate-500",
};

export default function AdminBingoGames() {
  const { user } = useGameStore();
  const [games, setGames]       = useState<BGame[]>([]);
  const [counts, setCounts]     = useState<Record<string, number>>({});
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<'monitor' | 'report'>('monitor');
  const [reportPeriod, setReportPeriod] = useState('today');
  const [reportStats, setReportStats]   = useState<any>(null);
  const [reportGames, setReportGames]   = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT);
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState<GameSettings>(DEFAULT);
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState("");

  const hdrs = () => ({
    "Content-Type": "application/json",
    "x-telegram-init-data": WebApp?.initData ?? "",
  });

  const fetchGames = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/admin/bingo-games`, { headers: hdrs() });
      if (!r.ok) return;
      const data: BGame[] = await r.json();
      setGames(data);
      const live = data.filter(g => g.status !== "finished").slice(0, 3);
      const newCounts: Record<string, number> = {};
      await Promise.all(live.map(async g => {
        const r2 = await fetch(`${API}/admin/bingo-games/${g.id}/players`, { headers: hdrs() });
        if (r2.ok) { const d = await r2.json(); newCounts[g.id] = d.count; }
      }));
      setCounts(newCounts);
    } finally { setLoading(false); }
  }, []);

  const fetchReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const r = await fetch(`${API}/admin/bingo-report?period=${reportPeriod}`, { headers: hdrs() });
      if (r.ok) {
        const data = await r.json();
        setReportStats(data.stats);
        setReportGames(data.games);
      }
    } finally { setReportLoading(false); }
  }, [reportPeriod]);

  const fetchSettings = useCallback(async () => {
    try {
      const r = await fetch(`${API}/admin/game-settings`, { headers: hdrs() });
      if (r.ok) {
        const raw = await r.json();
        // Merge with DEFAULT so any missing/null fields fall back to defaults
        const s: GameSettings = {
          call_interval_ms: Number(raw.call_interval_ms) || DEFAULT.call_interval_ms,
          waiting_period_s: Number(raw.waiting_period_s) || DEFAULT.waiting_period_s,
          release_time_s:   Number(raw.release_time_s)   || DEFAULT.release_time_s,
          min_players:      Number(raw.min_players)      || DEFAULT.min_players,
          max_players:      Number(raw.max_players)      || DEFAULT.max_players,
          prize_percent:    Number(raw.prize_percent)    || DEFAULT.prize_percent,
          max_cartelas_per_user: Number(raw.max_cartelas_per_user) || DEFAULT.max_cartelas_per_user,
          early_call_8_enabled:  raw.early_call_8_enabled  ?? DEFAULT.early_call_8_enabled,
          early_call_8_rewards:  raw.early_call_8_rewards  ?? DEFAULT.early_call_8_rewards,
          early_call_10_enabled: raw.early_call_10_enabled ?? DEFAULT.early_call_10_enabled,
          early_call_10_rewards: raw.early_call_10_rewards ?? DEFAULT.early_call_10_rewards,
        };
        setSettings(s); setDraft(s);
      }
      // If not ok, keep DEFAULT values (already initialized)
    } catch { /* keep defaults */ }
  }, []);

  useEffect(() => { fetchGames(); fetchSettings(); }, [fetchGames, fetchSettings]);
  useEffect(() => { if (tab === 'report') fetchReport(); }, [tab, reportPeriod, fetchReport]);

  const saveSettings = async () => {
    setSaving(true); setSaveMsg("");
    try {
      const r = await fetch(`${API}/admin/game-settings`, {
        method: "PUT", headers: hdrs(), body: JSON.stringify(draft),
      });
      const body = await r.json().catch(() => ({}));
      if (r.ok) {
        const saved: GameSettings = {
          call_interval_ms: Number(body.settings?.call_interval_ms) || draft.call_interval_ms,
          waiting_period_s: Number(body.settings?.waiting_period_s) || draft.waiting_period_s,
          release_time_s:   Number(body.settings?.release_time_s)   || draft.release_time_s,
          min_players:      Number(body.settings?.min_players)      || draft.min_players,
          max_players:      Number(body.settings?.max_players)      || draft.max_players,
          prize_percent:    Number(body.settings?.prize_percent)    || draft.prize_percent,
          max_cartelas_per_user: Number(body.settings?.max_cartelas_per_user) || draft.max_cartelas_per_user,
          early_call_8_enabled:  body.settings?.early_call_8_enabled  ?? draft.early_call_8_enabled,
          early_call_8_rewards:  body.settings?.early_call_8_rewards  ?? draft.early_call_8_rewards,
          early_call_10_enabled: body.settings?.early_call_10_enabled ?? draft.early_call_10_enabled,
          early_call_10_rewards: body.settings?.early_call_10_rewards ?? draft.early_call_10_rewards,
        };
        setSettings(saved); setDraft(saved); setEditing(false);
        setSaveMsg("Settings saved and applied!");
        setTimeout(() => setSaveMsg(""), 3000);
      } else {
        setSaveMsg(`Failed to save: ${body.error || r.status}`);
      }
    } catch (e: any) {
      setSaveMsg(`Error: ${e?.message || "unknown"}`);
    } finally { setSaving(false); }
  };

  const forceFinish = async (id: string) => {
    if (!confirm("Force-stop this game? No winner will be declared.")) return;
    await fetch(`${API}/admin/bingo-games/${id}/finish`, { method: "POST", headers: hdrs() });
    fetchGames();
  };

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        <div className="text-center">
          <AlertCircle size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="font-bold">Admin access only</p>
        </div>
      </div>
    );
  }

  const liveGame = games.find(g => g.status !== "finished");

  type FieldKey = keyof GameSettings;
  const FIELDS: { key: FieldKey; label: string; unit: string; Icon: any; min: number; max: number; step: number; hint: string }[] = [
    { key: "call_interval_ms",      label: "Call Interval",       unit: "ms", Icon: Zap,       min: 1000, max: 30000, step: 500, hint: "1000-30000ms" },
    { key: "waiting_period_s",      label: "Waiting Period",      unit: "s",  Icon: Clock,     min: 10,   max: 3600,  step: 5,   hint: "10-3600s" },
    { key: "release_time_s",        label: "Release Time",        unit: "s",  Icon: Clock,     min: 15,   max: 600,   step: 5,   hint: "15-600s (Auto-refund solo player)" },
    { key: "min_players",           label: "Min Players",         unit: "",   Icon: UserCheck, min: 2,    max: 50,    step: 1,   hint: "2-50" },
    { key: "max_players",           label: "Max Players",         unit: "",   Icon: Users,     min: 10,   max: 500,   step: 10,  hint: "10-500" },
    { key: "prize_percent",         label: "Prize %",             unit: "%",  Icon: Percent,   min: 50,   max: 100,   step: 5,   hint: "50-100%" },
    { key: "max_cartelas_per_user", label: "Max Cartelas / User", unit: "",   Icon: Trophy,    min: 1,    max: 10,    step: 1,   hint: "1-10 cartelas" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <div className="bg-gradient-to-r from-orange-600 to-amber-500 text-white px-4 pt-5 pb-5">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="p-2 rounded-full bg-white/20 active:scale-90">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-black">Bingo Monitor</h1>
            <p className="text-orange-100 text-xs">Fully automated engine</p>
          </div>
          <button onClick={tab === 'monitor' ? fetchGames : fetchReport} className="p-2 bg-white/20 rounded-full active:scale-90">
            <RefreshCw size={16} className={(tab === 'monitor' ? loading : reportLoading) ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="flex gap-2 mt-4 bg-black/10 p-1 rounded-xl">
          <button onClick={() => setTab('monitor')} className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-colors ${tab === 'monitor' ? 'bg-white text-orange-600 shadow-sm' : 'text-orange-50 hover:bg-white/10'}`}>Monitor</button>
          <button onClick={() => setTab('report')} className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-colors ${tab === 'report' ? 'bg-white text-orange-600 shadow-sm' : 'text-orange-50 hover:bg-white/10'}`}>Advanced Report</button>
        </div>
      </div>

      <div className="p-4 space-y-4">

        {tab === 'report' ? (
          <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {['today', 'yesterday', 'week', 'month', '3month', '6month', 'year', 'all'].map(p => (
                <button key={p} onClick={() => setReportPeriod(p)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition-colors ${reportPeriod === p ? 'bg-orange-600 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>
                  {p === 'today' ? 'Today' : p === 'yesterday' ? 'Yesterday' : p === 'week' ? '7 Days' : p === 'month' ? '30 Days' : p === '3month' ? '3 Months' : p === '6month' ? '6 Months' : p === 'year' ? '1 Year' : 'All Time'}
                </button>
              ))}
            </div>

            {reportLoading ? (
              <div className="flex justify-center py-10"><RefreshCw size={24} className="text-orange-400 animate-spin"/></div>
            ) : reportStats ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Total Games</p>
                    <p className="text-2xl font-black text-slate-800 mt-1">{reportStats.total_games}</p>
                  </div>
                  <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Profit</p>
                    <p className={`text-2xl font-black mt-1 ${reportStats.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {reportStats.profit >= 0 ? '+' : ''}{reportStats.profit}
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Stakes Collected</p>
                    <p className="text-lg font-black text-blue-600 mt-1">{reportStats.total_stakes_collected}</p>
                  </div>
                  <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Prizes Paid</p>
                    <p className="text-lg font-black text-amber-600 mt-1">{reportStats.total_prizes_paid}</p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                    <h3 className="font-black text-slate-700 text-sm">Games List ({reportGames.length})</h3>
                  </div>
                  <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
                    {reportGames.length === 0 ? (
                      <p className="p-4 text-center text-slate-400 text-sm">No games found for this period</p>
                    ) : (
                      reportGames.map((g: any) => (
                        <div key={g.id} className="p-3 hover:bg-slate-50 transition-colors">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-black text-sm text-slate-700">#{g.id.replace(/-/g, '').substring(0, 8).toUpperCase()}</span>
                            <span className="text-[10px] font-bold text-slate-400">{new Date(g.created_at).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500 font-bold">{g.stake} ETB • <Users size={10} className="inline"/> {g.players_count}</span>
                            <span className="font-black text-emerald-600 text-right">{g.paid} ETB Paid</span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] mt-1">
                            <span className="text-slate-400 uppercase">{g.status}</span>
                            <span className={`font-black ${g.collected - g.paid >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>Profit: {g.collected - g.paid}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <>
        {/* Engine Settings */}
        <div className="bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden">
          <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-slate-50">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="font-black text-slate-700">Engine Settings</h3>
            </div>
            {!editing ? (
              <button onClick={() => { setDraft(settings); setEditing(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-600 rounded-xl text-xs font-black active:scale-95">
                <Edit3 size={12} /> Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => { setEditing(false); setDraft(settings); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 text-slate-500 rounded-xl text-xs font-bold active:scale-95">
                  <X size={11} /> Cancel
                </button>
                <button onClick={saveSettings} disabled={saving}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white rounded-xl text-xs font-black active:scale-95 disabled:opacity-60">
                  {saving ? <RefreshCw size={11} className="animate-spin" /> : <Save size={11} />}
                  {saving ? "Saving" : "Save"}
                </button>
              </div>
            )}
          </div>

          {saveMsg && (
            <div className="px-4 py-2 bg-emerald-50 text-emerald-700 text-xs font-bold border-b border-emerald-100">
              {saveMsg}
            </div>
          )}

          <div className="p-3 space-y-2">
            {FIELDS.map(({ key, label, unit, Icon, min, max, step, hint }) => {
              const val = editing ? draft[key] : settings[key];
              const display = key === "call_interval_ms" ? `${(Number(val) / 1000).toFixed(1)}s` : `${val}${unit}`;
              return (
                <div key={key} className={`rounded-xl border p-3 flex items-center gap-3 ${editing ? "border-orange-200 bg-orange-50/40" : "border-slate-100 bg-slate-50"}`}>
                  <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-500 flex items-center justify-center shrink-0">
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                    {editing ? (
                      <div className="flex items-center gap-2 mt-0.5">
                        <input type="number" min={min} max={max} step={step}
                          value={draft[key] as number}
                          onChange={e => setDraft(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                          className="w-28 border border-orange-300 rounded-lg px-2 py-1 text-sm font-black text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
                        />
                        {unit && <span className="text-xs text-slate-500 font-bold">{unit}</span>}
                        <span className="text-[9px] text-slate-400 ml-1">{hint}</span>
                      </div>
                    ) : (
                      <p className="font-black text-slate-800 text-sm">{display}</p>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Early Call Bonuses section */}
            <div className={`mt-4 rounded-xl border p-3 ${editing ? "border-orange-200 bg-orange-50/20" : "border-slate-100 bg-slate-50"}`}>
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Trophy size={14} className="text-amber-500" /> Early Call Bonuses
              </h4>
              
              {/* 8 Call */}
              <div className="mb-4 border-b border-slate-100 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-slate-700">8-Call Jackpot</span>
                  {editing ? (
                    <button onClick={() => setDraft(p => ({ ...p, early_call_8_enabled: !p.early_call_8_enabled }))}
                      className={`w-10 h-5 rounded-full relative transition-colors ${draft.early_call_8_enabled ? "bg-emerald-500" : "bg-slate-300"}`}>
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${draft.early_call_8_enabled ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  ) : (
                    <span className={`text-xs font-black px-2 py-0.5 rounded-md ${settings.early_call_8_enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                      {settings.early_call_8_enabled ? "ON" : "OFF"}
                    </span>
                  )}
                </div>
                {(editing ? draft.early_call_8_enabled : settings.early_call_8_enabled) && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {[10, 20, 50, 100].map(stake => (
                      <div key={`8c-${stake}`} className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 w-12 text-right">{stake} ETB:</span>
                        {editing ? (
                          <input type="number" 
                            value={draft.early_call_8_rewards?.[stake] || 0}
                            onChange={e => setDraft(p => ({
                              ...p, 
                              early_call_8_rewards: { ...p.early_call_8_rewards, [stake]: Number(e.target.value) }
                            }))}
                            className="w-20 border border-orange-300 rounded md px-2 py-1 text-xs font-black text-slate-800"
                          />
                        ) : (
                          <span className="text-xs font-black text-amber-600">{settings.early_call_8_rewards?.[stake]} ETB</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 10 Call */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-slate-700">10-Call Jackpot</span>
                  {editing ? (
                    <button onClick={() => setDraft(p => ({ ...p, early_call_10_enabled: !p.early_call_10_enabled }))}
                      className={`w-10 h-5 rounded-full relative transition-colors ${draft.early_call_10_enabled ? "bg-emerald-500" : "bg-slate-300"}`}>
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${draft.early_call_10_enabled ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  ) : (
                    <span className={`text-xs font-black px-2 py-0.5 rounded-md ${settings.early_call_10_enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                      {settings.early_call_10_enabled ? "ON" : "OFF"}
                    </span>
                  )}
                </div>
                {(editing ? draft.early_call_10_enabled : settings.early_call_10_enabled) && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {[10, 20, 50, 100].map(stake => (
                      <div key={`10c-${stake}`} className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 w-12 text-right">{stake} ETB:</span>
                        {editing ? (
                          <input type="number" 
                            value={draft.early_call_10_rewards?.[stake] || 0}
                            onChange={e => setDraft(p => ({
                              ...p, 
                              early_call_10_rewards: { ...p.early_call_10_rewards, [stake]: Number(e.target.value) }
                            }))}
                            className="w-20 border border-orange-300 rounded md px-2 py-1 text-xs font-black text-slate-800"
                          />
                        ) : (
                          <span className="text-xs font-black text-amber-600">{settings.early_call_10_rewards?.[stake]} ETB</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {!editing && (
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-500 flex items-center justify-center shrink-0">
                    <Settings size={14} />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Mode</p>
                    <p className="font-black text-slate-800 text-xs">Auto</p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-500 flex items-center justify-center shrink-0">
                    <Trophy size={14} />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Winner</p>
                    <p className="font-black text-slate-800 text-xs">Server-side</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Live Game */}
        {liveGame ? (
          <div className="bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Live Game</span>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full capitalize ${STATUS_COLOR[liveGame.status]}`}>
                    {liveGame.status === "calling" ? "Calling" : "Waiting"}
                  </span>
                </div>
                <button onClick={() => setExpanded(expanded === liveGame.id ? null : liveGame.id)}
                  className="p-1.5 bg-slate-100 rounded-lg">
                  {expanded === liveGame.id ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">Game ID</p>
                  <p className="text-2xl font-black text-orange-600">#{liveGame.id.replace(/-/g, '').substring(0, 8).toUpperCase()}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">Players</p>
                  <p className="text-2xl font-black text-slate-700">
                    <Users size={14} className="inline mr-0.5 mb-0.5" />{counts[liveGame.id] ?? "..."}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase">Prize Pool</p>
                  <p className="text-2xl font-black text-emerald-600">{liveGame.prize_pool} <span className="text-sm">ETB</span></p>
                </div>
              </div>
              <div className="flex gap-2">
                <Link to="/bingo/live" className="flex-1 py-2 bg-orange-100 text-orange-700 font-black rounded-xl text-xs flex items-center justify-center gap-1 active:scale-95">
                  <Eye size={12}/> Watch Live
                </Link>
                <button onClick={() => forceFinish(liveGame.id)} className="flex-1 py-2 bg-red-100 text-red-600 font-black rounded-xl text-xs active:scale-95">
                  Force Stop
                </button>
              </div>
            </div>
            {expanded === liveGame.id && liveGame.status === "calling" && (
              <div className="border-t border-slate-100 p-4 bg-slate-50/50">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Called Numbers ({liveGame.called_numbers?.length ?? 0}/75)</p>
                <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                  {(liveGame.called_numbers ?? []).map(n => (
                    <span key={n} className="text-[10px] font-black bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{n}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-6 shadow-sm text-center text-slate-400">
            <p className="text-4xl mb-2">🎱</p>
            <p className="font-bold">Engine is preparing the next game...</p>
            <p className="text-xs mt-1">Auto-creates a new game every {settings.waiting_period_s}s</p>
          </div>
        )}

        {/* Game History */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <h3 className="font-black text-slate-700 mb-3">Recent Games</h3>
          {loading ? (
            <div className="flex justify-center py-6"><RefreshCw size={20} className="text-orange-400 animate-spin"/></div>
          ) : (
            <div className="space-y-2">
              {games.filter(g => g.status === "finished").slice(0, 15).map(g => (
                <div key={g.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="font-black text-slate-700 text-sm">Game #{g.id.replace(/-/g, '').substring(0, 8).toUpperCase()}</p>
                    <p className="text-xs text-slate-400">
                      {g.winner_first_name === "REMATCH"
                        ? "REMATCH - stakes refunded"
                        : g.winner_cartela
                          ? `${g.winner_first_name || "Player"} #${g.winner_cartela} - ${g.winner_prize} ETB`
                          : `${g.stake} ETB`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400">{g.finished_at ? new Date(g.finished_at).toLocaleDateString() : ""}</p>
                    <p className="text-[10px] text-slate-400">{g.finished_at ? new Date(g.finished_at).toLocaleTimeString() : ""}</p>
                  </div>
                </div>
              ))}
              {games.filter(g => g.status === "finished").length === 0 && (
                <p className="text-center text-slate-400 text-sm py-4">No finished games yet</p>
              )}
            </div>
          )}
        </div>
        </>
        )}

      </div>
    </div>
  );
}