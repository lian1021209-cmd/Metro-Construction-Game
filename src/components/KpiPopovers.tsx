import React, { useState } from 'react';
import {
  Coins,
  Users,
  TrainFront,
  CarFront,
  X,
  TrendingUp,
  Ticket,
  ChevronRight,
} from 'lucide-react';
import {
  DifficultyConfig,
  FarePolicy,
  Language,
  LayerVisibility,
  SimulationStats,
} from '../types/game';
import { formatCurrencyWan, formatPop, formatRidershipWan, t } from '../i18n/translations';

export type ActiveKpiPopover = 'none' | 'finance' | 'population' | 'share' | 'congestion';

interface KpiPopoversProps {
  active: ActiveKpiPopover;
  onClose: () => void;
  lang: Language;
  year: number;
  day: number;
  difficulty: DifficultyConfig;
  stats: SimulationStats;
  farePolicy: FarePolicy;
  monthlyCapexWan: number;
  layers: LayerVisibility;
  onToggleLayer: (key: keyof Omit<LayerVisibility, 'depthFilter'>) => void;
  onOpenMetroCoreFares: () => void;
}

const glassPopover =
  'bg-[#0A1322]/92 backdrop-blur-2xl border border-white/12 shadow-[0_20px_60px_rgba(0,0,0,0.68)] rounded-2xl';

export const KpiPopovers: React.FC<KpiPopoversProps> = ({
  active,
  onClose,
  lang,
  year,
  day,
  difficulty,
  stats,
  farePolicy,
  monthlyCapexWan,
  layers,
  onToggleLayer,
  onOpenMetroCoreFares,
}) => {
  const [finTab, setFinTab] = useState<'overview' | 'economy' | 'finance'>('overview');

  if (active === 'none') return null;

  const month = Math.min(12, Math.floor((day - 1) / 30) + 1);
  const dayOfMonth = ((day - 1) % 30) + 1;
  const monthlyRev = Math.round(stats.dailyRevenue * Math.max(1, dayOfMonth));
  const monthlyOp = Math.round(stats.dailyMaintenance * Math.max(1, dayOfMonth));

  if (active === 'finance') {
    return (
      <div className={`fixed top-18 right-64 z-40 w-84 ${glassPopover} p-4 space-y-3.5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Coins className="w-4 h-4 text-amber-400" />
            <span>{t(lang, 'financeOverview')}</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3 Segmented Tabs */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-950/60 border border-white/10">
          {(
            [
              { id: 'overview', label: t(lang, 'tabOverview') },
              { id: 'economy', label: t(lang, 'tabEconomy') },
              { id: 'finance', label: t(lang, 'tabFinance') },
            ] as const
          ).map((tb) => (
            <button
              key={tb.id}
              onClick={() => setFinTab(tb.id)}
              className={`py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                finTab === tb.id ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {finTab === 'overview' && (
          <>
            <div className="p-3 rounded-xl bg-slate-950/55 border border-white/8 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span className="font-medium text-slate-200">{t(lang, 'monthlySummary')}</span>
                <span className="font-mono-tabular text-[11px]">
                  {year}/{month} · {dayOfMonth} {lang === 'en' ? 'days' : '天'}
                </span>
              </div>
              <div className="flex justify-between font-mono-tabular">
                <span className="text-slate-400">{t(lang, 'ticketRev')}</span>
                <span className="text-emerald-400 font-semibold">
                  +{formatCurrencyWan(monthlyRev, lang)}
                </span>
              </div>
              <div className="flex justify-between font-mono-tabular">
                <span className="text-slate-400">{t(lang, 'opCost')}</span>
                <span className="text-rose-400 font-semibold">
                  -{formatCurrencyWan(monthlyOp, lang)}
                </span>
              </div>
              <div className="flex justify-between font-mono-tabular">
                <span className="text-slate-400">{t(lang, 'capex')}</span>
                <span className="text-amber-300 font-semibold">
                  -{formatCurrencyWan(monthlyCapexWan, lang)}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/55 border border-white/8 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
                  <span>{year} {lang === 'en' ? 'Metro Area GDP' : '都市範圍 GDP'}</span>
                </span>
                <span className="text-emerald-300 font-medium">{lang === 'en' ? 'Steady' : '平穩'}</span>
              </div>
              <div className="text-lg font-bold font-mono-tabular text-slate-100">
                {lang === 'en'
                  ? `$${(stats.gdpBillions / 7).toFixed(1)}B`
                  : `${stats.gdpBillions.toFixed(0)} ${lang === 'zh-Hans' ? '亿元' : '億元'}`}
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] font-mono-tabular border-t border-white/8">
                <div>
                  <div className="text-slate-500">{lang === 'en' ? 'Growth' : '實質成長'}</div>
                  <div className="text-emerald-400">+{(1.8 + stats.modeSharePercent * 0.12).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-slate-500">{lang === 'en' ? 'Inflation' : '通膨率'}</div>
                  <div className="text-slate-200">+3.1%</div>
                </div>
                <div>
                  <div className="text-slate-500">{lang === 'en' ? 'Transit Boost' : '軌道效應'}</div>
                  <div className="text-sky-300">+{(stats.modeSharePercent * 0.08).toFixed(1)}%</div>
                </div>
              </div>
            </div>
          </>
        )}

        {finTab === 'economy' && (
          <div className="p-3 rounded-xl bg-slate-950/55 border border-white/8 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">{lang === 'en' ? 'Daily Farebox' : '日均票務收入'}</span>
              <span className="font-mono-tabular text-emerald-400">
                +{formatCurrencyWan(stats.dailyRevenue, lang)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">{lang === 'en' ? 'Daily OpEx' : '日均線網維運'}</span>
              <span className="font-mono-tabular text-rose-400">
                -{formatCurrencyWan(stats.dailyMaintenance, lang)}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-white/8">
              <span className="text-slate-200 font-semibold">{lang === 'en' ? 'Net Operating Margin' : '營運日淨結餘'}</span>
              <span
                className={`font-mono-tabular font-bold ${
                  stats.dailyRevenue - stats.dailyMaintenance >= 0
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }`}
              >
                {stats.dailyRevenue - stats.dailyMaintenance >= 0 ? '+' : ''}
                {formatCurrencyWan(stats.dailyRevenue - stats.dailyMaintenance, lang)}
              </span>
            </div>
          </div>
        )}

        {finTab === 'finance' && (
          <div className="p-3 rounded-xl bg-slate-950/55 border border-white/8 space-y-2 text-xs font-mono-tabular">
            <div className="flex justify-between">
              <span className="text-slate-400">{lang === 'en' ? 'Difficulty Tier' : '財政難度'}</span>
              <span className="text-slate-100">{difficulty.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">{lang === 'en' ? 'CapEx Multiplier' : '造價係數'}</span>
              <span className="text-amber-300">{difficulty.costMultiplier.toFixed(2)}x</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">{lang === 'en' ? 'OpEx Multiplier' : '維運係數'}</span>
              <span className="text-sky-300">{difficulty.maintenanceMultiplier.toFixed(2)}x</span>
            </div>
          </div>
        )}

        <button
          onClick={() => {
            onClose();
            onOpenMetroCoreFares();
          }}
          className="w-full px-3 py-2.5 rounded-xl bg-white/6 hover:bg-white/10 border border-white/10 flex items-center justify-between text-xs transition-colors"
        >
          <span className="flex items-center gap-2 text-slate-200">
            <Ticket className="w-3.5 h-3.5 text-sky-400" />
            <span>{t(lang, 'fareRule')}</span>
          </span>
          <span className="flex items-center gap-1 text-slate-300 font-mono-tabular">
            <span>
              ¥{farePolicy.baseFare} {lang === 'en' ? 'base · dist' : '起·按里程'}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
          </span>
        </button>
      </div>
    );
  }

  if (active === 'population') {
    return (
      <div className={`fixed top-18 right-48 z-40 w-80 ${glassPopover} p-4 space-y-3.5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Users className="w-4 h-4 text-sky-400" />
            <span>{t(lang, 'population')}</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-2xl font-bold font-mono-tabular text-slate-100">
          {formatPop(stats.totalPopulation, lang)}
        </div>

        <label className="p-3 rounded-xl bg-amber-500/10 border border-amber-400/25 flex items-center justify-between cursor-pointer">
          <div>
            <div className="text-xs font-semibold text-amber-200">{t(lang, 'popDensityLayer')}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {lang === 'en' ? 'Residential & employment density heatmap' : '顯示各街區常住人口與職缺熱區'}
            </div>
          </div>
          <input
            type="checkbox"
            checked={layers.populationHeatmap}
            onChange={() => onToggleLayer('populationHeatmap')}
            className="w-4 h-4 accent-amber-400 rounded"
          />
        </label>

        <div className="space-y-1.5 text-xs border-t border-white/10 pt-2.5 font-mono-tabular">
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">{lang === 'en' ? 'Total Jobs' : '城市總就業崗位'}</span>
            <span>{formatPop(stats.totalJobs, lang)}</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-400">{lang === 'en' ? '15-min Metro Covered' : '地鐵覆蓋人口'}</span>
            <span className="text-emerald-400">{stats.coveragePercent.toFixed(1)}%</span>
          </div>
        </div>
      </div>
    );
  }

  if (active === 'share') {
    return (
      <div className={`fixed top-18 right-28 z-40 w-84 ${glassPopover} p-4 space-y-3.5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <TrainFront className="w-4 h-4 text-teal-400" />
            <span>{t(lang, 'metroShare')}</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-2xl font-bold font-mono-tabular text-slate-100">
          {stats.modeSharePercent.toFixed(1)}%
        </div>

        <label className="p-3 rounded-xl bg-emerald-500/12 border border-emerald-400/30 flex items-center justify-between cursor-pointer">
          <div>
            <div className="text-xs font-semibold text-emerald-200">{t(lang, 'metroCoverageLayer')}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {lang === 'en' ? 'Green covered vs Red underserved demand' : '步行可達車站範圍（綠）與盲區（紅）'}
            </div>
          </div>
          <input
            type="checkbox"
            checked={layers.metroCoverageOverlay}
            onChange={() => onToggleLayer('metroCoverageOverlay')}
            className="w-4 h-4 accent-emerald-400 rounded"
          />
        </label>

        <div className="space-y-1.5 text-xs font-mono-tabular border-t border-white/10 pt-2.5">
          <div className="flex justify-between">
            <span className="text-slate-400">{lang === 'en' ? 'Daily Total Trips (Car+Metro)' : '日均出行 (汽車+地鐵)'}</span>
            <span className="text-slate-200">{formatRidershipWan(stats.dailyTotalCityTrips, lang)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">{lang === 'en' ? 'Metro Ridership' : '其中地鐵日運量'}</span>
            <span className="text-teal-300 font-semibold">{formatRidershipWan(stats.dailyRidership, lang)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">{lang === 'en' ? 'Weekday / Weekend Split' : '工作日 / 週末分擔率'}</span>
            <span className="text-slate-200">
              {stats.modeSharePercent.toFixed(1)}% / {(stats.modeSharePercent * 1.04).toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">{lang === 'en' ? '15-min Walk Access' : '步行 15 分鐘可達人口'}</span>
            <span className="text-emerald-400">{stats.coveragePercent.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">{lang === 'en' ? 'Average Fare' : '平均票價'}</span>
            <span className="text-slate-200">¥{stats.avgFare.toFixed(2)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed top-18 right-12 z-40 w-84 ${glassPopover} p-4 space-y-3.5`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <CarFront className="w-4 h-4 text-emerald-400" />
          <span>{t(lang, 'congestionIdx')}</span>
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="text-xl font-bold font-mono-tabular text-slate-100">
        {stats.congestionIndex.toFixed(2)} ({lang === 'en' ? 'All-day' : '全日'}) /{' '}
        {stats.peakCongestionIndex.toFixed(2)} ({lang === 'en' ? 'AM Peak' : '早高峰'})
      </div>

      <label className="p-3 rounded-xl bg-rose-500/12 border border-rose-400/25 flex items-center justify-between cursor-pointer">
        <div>
          <div className="text-xs font-semibold text-rose-200">{t(lang, 'roadCongestionLayer')}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {lang === 'en' ? 'Color arterial roads by real-time saturation' : '主要道路即時擁堵程度綠/黃/紅著色'}
          </div>
        </div>
        <input
          type="checkbox"
          checked={layers.congestionOverlay}
          onChange={() => onToggleLayer('congestionOverlay')}
          className="w-4 h-4 accent-rose-400 rounded"
        />
      </label>

      <div className="text-[11px] text-slate-400 leading-relaxed border-t border-white/10 pt-2.5">
        {lang === 'en'
          ? '1.00 = Free-flow · 1.15+ Busy · 1.35+ Congested · 1.60+ Severe Gridlock. Expanding metro catchment directly relieves surface road VKT.'
          : '1.00 表示暢通 · 1.15 起緩行 · 1.35 起擁堵 · 1.60 起嚴重擁堵。擴大軌道站點覆蓋能有效分流地面車流。'}
      </div>
    </div>
  );
};
