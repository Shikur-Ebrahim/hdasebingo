import { ArrowLeft, Trophy, Clock, Users, Coins, Star, AlertCircle, CheckCircle2, Zap, Gift } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { t } from '../lib/translations';

export default function Rules() {
  const navigate = useNavigate();
  const { language } = useGameStore();
  
  const rules = [
    {
      icon: Users,
      color: 'bg-blue-50 dark:bg-blue-950/60 text-blue-500 dark:text-blue-400 border border-transparent dark:border-blue-500/30',
      title: t[language].rules.rule1Title,
      body: t[language].rules.rule1Body,
    },
    {
      icon: Clock,
      color: 'bg-purple-50 dark:bg-purple-950/60 text-purple-500 dark:text-purple-400 border border-transparent dark:border-purple-500/30',
      title: t[language].rules.rule2Title,
      body: t[language].rules.rule2Body,
    },
    {
      icon: Star,
      color: 'bg-yellow-50 dark:bg-amber-950/60 text-yellow-500 dark:text-amber-400 border border-transparent dark:border-amber-500/30',
      title: t[language].rules.rule3Title,
      body: t[language].rules.rule3Body,
    },
    {
      icon: Trophy,
      color: 'bg-green-50 dark:bg-emerald-950/60 text-green-500 dark:text-emerald-400 border border-transparent dark:border-emerald-500/30',
      title: t[language].rules.rule4Title,
      body: t[language].rules.rule4Body,
    },
    {
      icon: Coins,
      color: 'bg-orange-50 dark:bg-orange-950/60 text-orange-500 dark:text-orange-400 border border-transparent dark:border-orange-500/30',
      title: t[language].rules.rule5Title,
      body: t[language].rules.rule5Body,
    },
    {
      icon: AlertCircle,
      color: 'bg-rose-50 dark:bg-rose-950/60 text-rose-500 dark:text-rose-400 border border-transparent dark:border-rose-500/30',
      title: t[language].rules.rule6Title,
      body: t[language].rules.rule6Body,
    },
    {
      icon: CheckCircle2,
      color: 'bg-teal-50 dark:bg-teal-950/60 text-teal-500 dark:text-teal-400 border border-transparent dark:border-teal-500/30',
      title: t[language].rules.rule7Title,
      body: t[language].rules.rule7Body,
    },
  ];

  const bonusRules = [
    {
      icon: Zap,
      color: 'bg-amber-50 dark:bg-amber-950/60 text-amber-500 dark:text-amber-400 border border-transparent dark:border-amber-500/30',
      badge: '⚡ ' + t[language].rules.bonus1Badge,
      title: t[language].rules.bonus1Title,
      body: t[language].rules.bonus1Body,
      highlight: true,
    },
    {
      icon: Zap,
      color: 'bg-violet-50 dark:bg-violet-950/60 text-violet-500 dark:text-violet-400 border border-transparent dark:border-violet-500/30',
      badge: '⚡ ' + t[language].rules.bonus2Badge,
      title: t[language].rules.bonus2Title,
      body: t[language].rules.bonus2Body,
      highlight: true,
    },
    {
      icon: Gift,
      color: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-500 dark:text-emerald-400 border border-transparent dark:border-emerald-500/30',
      badge: '🎁 ' + t[language].rules.bonus3Badge,
      title: t[language].rules.bonus3Title,
      body: t[language].rules.bonus3Body,
      highlight: true,
    },
    {
      icon: Gift,
      color: 'bg-pink-50 dark:bg-pink-950/60 text-pink-500 dark:text-pink-400 border border-transparent dark:border-pink-500/30',
      badge: '🎁 ' + t[language].rules.bonus4Badge,
      title: t[language].rules.bonus4Title,
      body: t[language].rules.bonus4Body,
      highlight: true,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#070b14] pb-10 text-slate-800 dark:text-slate-100 transition-colors">

      {/* Header */}
      <div className="bg-white dark:bg-[#0b1020]/95 backdrop-blur-md sticky top-0 z-10 px-4 pt-5 pb-4 border-b border-gray-100 dark:border-slate-800/80 shadow-xs transition-colors">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-[#12192c] hover:bg-slate-200 dark:hover:bg-[#19233d] border border-transparent dark:border-slate-700/80 flex items-center justify-center active:scale-90 transition-all shrink-0">
            <ArrowLeft size={18} className="text-slate-600 dark:text-slate-200" />
          </button>
          <div>
            <h1 className="text-lg font-black text-slate-800 dark:text-white leading-tight">{t[language].rules.title}</h1>
            <p className="text-xs text-slate-400 dark:text-slate-400">{t[language].rules.subtitle}</p>
          </div>
        </div>
      </div>

      {/* Hero banner */}
      <div className="mx-4 mt-4 bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 rounded-2xl px-5 py-5 shadow-[0_4px_20px_rgba(245,158,11,0.25)] border border-amber-300/30 flex items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-8 translate-x-8 pointer-events-none" />
        <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center shrink-0 border border-white/25 shadow-inner">
          <Trophy size={30} className="text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)]" />
        </div>
        <div className="relative z-10">
          <p className="text-white font-black text-base leading-tight drop-shadow-xs">{t[language].rules.heroTitle}</p>
          <p className="text-white/90 text-xs mt-0.5">{t[language].rules.heroDesc}</p>
        </div>
      </div>

      {/* Rules list */}
      <div className="px-4 mt-4 space-y-3">
        {rules.map((rule, i) => {
          const Icon = rule.icon;
          return (
            <div key={i} className="bg-white dark:bg-[#0c1222] rounded-2xl p-4 border border-gray-100 dark:border-slate-800/80 shadow-xs dark:shadow-[0_4px_20px_rgba(0,0,0,0.35)] flex gap-3 transition-all">
              <div className={`w-9 h-9 rounded-xl ${rule.color} flex items-center justify-center shrink-0 mt-0.5 shadow-xs`}>
                <Icon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-[#141d33] text-slate-500 dark:text-slate-300 text-[10px] font-black flex items-center justify-center shrink-0 border border-transparent dark:border-slate-700/60">{i + 1}</span>
                  <p className="font-black text-slate-800 dark:text-white text-sm">{rule.title}</p>
                </div>
                <p className="text-slate-500 dark:text-slate-300 text-[11px] leading-relaxed">{rule.body}</p>
              </div>
            </div>
          );
        })}

        {/* Bonus Rewards Section */}
        <div className="mt-6">
          {/* Section header */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-gradient-to-r from-yellow-300 dark:from-yellow-500/40 to-orange-300 dark:to-orange-500/40" />
            <div className="bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full px-3 py-1 flex items-center gap-1.5 shadow-sm border border-amber-300/30">
              <Gift size={13} className="text-white" />
              <span className="text-white font-black text-[11px] uppercase tracking-wide">{t[language].rules.bonusRewardsTitle}</span>
            </div>
            <div className="flex-1 h-px bg-gradient-to-l from-yellow-300 dark:from-yellow-500/40 to-orange-300 dark:to-orange-500/40" />
          </div>

          <div className="space-y-3">
            {bonusRules.map((rule, i) => {
              const Icon = rule.icon;
              return (
                <div key={i} className="bg-gradient-to-br from-white to-amber-50/30 dark:from-[#0c1222] dark:to-[#131b2e] rounded-2xl p-4 border border-amber-100 dark:border-amber-500/25 shadow-xs dark:shadow-[0_4px_20px_rgba(0,0,0,0.35)] flex gap-3 relative overflow-hidden transition-all">
                  {/* Subtle glow accent */}
                  <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-400/5 dark:bg-amber-400/10 rounded-full blur-xl -translate-y-6 translate-x-6 pointer-events-none" />
                  <div className={`w-9 h-9 rounded-xl ${rule.color} flex items-center justify-center shrink-0 mt-0.5 shadow-xs`}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0 relative z-10">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="bg-gradient-to-r from-amber-400 to-orange-400 text-white text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 shadow-xs">
                        {rule.badge}
                      </span>
                    </div>
                    <p className="font-black text-slate-800 dark:text-white text-sm mb-1">{rule.title}</p>
                    <p className="text-slate-500 dark:text-slate-300 text-[11px] leading-relaxed">{rule.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      
        {/* Footer note */}
        <div className="bg-slate-800 dark:bg-[#0c1222] border border-slate-700/80 rounded-2xl px-4 py-3.5 flex items-start gap-3 mt-2 shadow-md">
          <AlertCircle size={16} className="text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-white/90 dark:text-slate-200 text-[11px] leading-relaxed">
            {t[language].rules.footerNote}
          </p>
        </div>
        <div className="h-2" />
      </div>
    </div>
  );
}

