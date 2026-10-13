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
      color: 'bg-blue-50 text-blue-500',
      title: t[language].rules.rule1Title,
      body: t[language].rules.rule1Body,
    },
    {
      icon: Clock,
      color: 'bg-purple-50 text-purple-500',
      title: t[language].rules.rule2Title,
      body: t[language].rules.rule2Body,
    },
    {
      icon: Star,
      color: 'bg-yellow-50 text-yellow-500',
      title: t[language].rules.rule3Title,
      body: t[language].rules.rule3Body,
    },
    {
      icon: Trophy,
      color: 'bg-green-50 text-green-500',
      title: t[language].rules.rule4Title,
      body: t[language].rules.rule4Body,
    },
    {
      icon: Coins,
      color: 'bg-orange-50 text-orange-500',
      title: t[language].rules.rule5Title,
      body: t[language].rules.rule5Body,
    },
    {
      icon: AlertCircle,
      color: 'bg-rose-50 text-rose-500',
      title: t[language].rules.rule6Title,
      body: t[language].rules.rule6Body,
    },
    {
      icon: CheckCircle2,
      color: 'bg-teal-50 text-teal-500',
      title: t[language].rules.rule7Title,
      body: t[language].rules.rule7Body,
    },
  ];

  const bonusRules = [
    {
      icon: Zap,
      color: 'bg-amber-50 text-amber-500',
      badge: '⚡ ' + t[language].rules.bonus1Badge,
      title: t[language].rules.bonus1Title,
      body: t[language].rules.bonus1Body,
      highlight: true,
    },
    {
      icon: Zap,
      color: 'bg-violet-50 text-violet-500',
      badge: '⚡ ' + t[language].rules.bonus2Badge,
      title: t[language].rules.bonus2Title,
      body: t[language].rules.bonus2Body,
      highlight: true,
    },
    {
      icon: Gift,
      color: 'bg-emerald-50 text-emerald-500',
      badge: '🎁 ' + t[language].rules.bonus3Badge,
      title: t[language].rules.bonus3Title,
      body: t[language].rules.bonus3Body,
      highlight: true,
    },
    {
      icon: Gift,
      color: 'bg-pink-50 text-pink-500',
      badge: '🎁 ' + t[language].rules.bonus4Badge,
      title: t[language].rules.bonus4Title,
      body: t[language].rules.bonus4Body,
      highlight: true,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-10">

      {/* Header */}
      <div className="bg-white sticky top-0 z-10 px-4 pt-5 pb-4 border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center active:scale-90 transition-all shrink-0">
            <ArrowLeft size={18} className="text-slate-600" />
          </button>
          <div>
            <h1 className="text-lg font-black text-slate-800 leading-tight">{t[language].rules.title}</h1>
            <p className="text-xs text-slate-400">{t[language].rules.subtitle}</p>
          </div>
        </div>
      </div>

      {/* Hero banner */}
      <div className="mx-4 mt-4 bg-gradient-to-br from-yellow-400 to-orange-400 rounded-2xl px-5 py-5 shadow-sm flex items-center gap-4">
        <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
          <Trophy size={30} className="text-white" />
        </div>
        <div>
          <p className="text-white font-black text-base leading-tight">{t[language].rules.heroTitle}</p>
          <p className="text-white/80 text-xs mt-0.5">{t[language].rules.heroDesc}</p>
        </div>
      </div>

      {/* Rules list */}
      <div className="px-4 mt-4 space-y-3">
        {rules.map((rule, i) => {
          const Icon = rule.icon;
          return (
            <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex gap-3">
              <div className={`w-9 h-9 rounded-xl ${rule.color} flex items-center justify-center shrink-0 mt-0.5`}>
                <Icon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                  <p className="font-black text-slate-800 text-sm">{rule.title}</p>
                </div>
                <p className="text-slate-500 text-[11px] leading-relaxed">{rule.body}</p>
              </div>
            </div>
          );
        })}

        {/* Bonus Rewards Section */}
        <div className="mt-6">
          {/* Section header */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-gradient-to-r from-yellow-300 to-orange-300" />
            <div className="bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full px-3 py-1 flex items-center gap-1.5 shadow-sm">
              <Gift size={13} className="text-white" />
              <span className="text-white font-black text-[11px] uppercase tracking-wide">{t[language].rules.bonusRewardsTitle}</span>
            </div>
            <div className="flex-1 h-px bg-gradient-to-l from-yellow-300 to-orange-300" />
          </div>

          <div className="space-y-3">
            {bonusRules.map((rule, i) => {
              const Icon = rule.icon;
              return (
                <div key={i} className="bg-gradient-to-br from-white to-amber-50/30 rounded-2xl p-4 border border-amber-100 shadow-sm flex gap-3 relative overflow-hidden">
                  {/* Subtle glow accent */}
                  <div className="absolute top-0 right-0 w-20 h-20 bg-yellow-400/5 rounded-full -translate-y-6 translate-x-6 pointer-events-none" />
                  <div className={`w-9 h-9 rounded-xl ${rule.color} flex items-center justify-center shrink-0 mt-0.5`}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="bg-gradient-to-r from-amber-400 to-orange-400 text-white text-[9px] font-black px-2 py-0.5 rounded-full shrink-0">
                        {rule.badge}
                      </span>
                    </div>
                    <p className="font-black text-slate-800 text-sm mb-1">{rule.title}</p>
                    <p className="text-slate-500 text-[11px] leading-relaxed">{rule.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      
        {/* Footer note */}
        <div className="bg-slate-800 rounded-2xl px-4 py-3.5 flex items-start gap-3 mt-2">
          <AlertCircle size={16} className="text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-white/80 text-[11px] leading-relaxed">
            {t[language].rules.footerNote}
          </p>
        </div>
        <div className="h-2" />
      </div>
    </div>
  );
}

