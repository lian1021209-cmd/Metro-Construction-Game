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

const lightPopover =
  'bg-white/98 backdrop-blur-sm border border-slate-200 text-slate-900 shadow-[0_12px_36px_rgba(15,23,42,0.12)] rounded-xl';

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
      <div className={`fixed top-14 left-1/2 -translate-x-1/2 z-40 w-84 ${lightPopover} p-4 space-y-3.5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Coins className="w-4 h-4 text-amber-600" />
            <span>{t(lang, 'financeOverview')}</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-900 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200/80">
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
              className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                finTab === tb.id
                  ? 'bg-white text-slate-950 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {finTab === 'overview' && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-500">
                <span className="font-semibold text-slate-800">{t(lang, 'monthlySummary')}</span>
                <span className="font-mono-tabular text-[11px]">
                  {year}/{month} · {dayOfMonth} {lang === 'en' ? 'days' : '天'}
                </span>
              </div>
              <div className="flex justify-between font-mono-tabular">
                <span className="text-slate-500">{t(lang, 'ticketRev')}</span>
                <span className="text-emerald-700 font-semibold">
                  +{formatCurrencyWan(monthlyRev, lang)}
                </span>
              </div>
              <div className="flex justify-between font-mono-tabular">
                <span className="text-slate-500">{t(lang, 'opCost')}</span>
                <span className="text-rose-700 font-semibold">
                  -{formatCurrencyWan(monthlyOp, lang)}
                </span>
              </div>
              <div className="flex justify-between font-mono-tabular">
                <span className="text-slate-500">{t(lang, 'capex')}</span>
                <span className="text-amber-700 font-semibold">
                  -{formatCurrencyWan(monthlyCapexWan, lang)}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                  <span>{year} {lang === 'en' ? 'Metro Area GDP' : '都市範圍 GDP'}</span>
                </span>
                <span className="text-emerald-700 font-medium">{lang === 'en' ? 'Steady' : '平穩'}</span>
              </div>
              <div className="text-lg font-bold font-mono-tabular text-slate-950">
                {lang === 'en'
                  ? `$${(stats.gdpBillions / 7).toFixed(1)}B`
                  : `${stats.gdpBillions.toFixed(0)} ${lang === 'zh-Hans' ? '亿元' : '億元'}`}
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1.5 text-[11px] font-mono-tabular border-t border-slate-200">
                <div>
                  <div className="text-slate-500">{lang === 'en' ? 'Growth' : '實質成長'}</div>
                  <div className="text-emerald-700 font-semibold">+{(1.8 + stats.modeSharePercent * 0.12).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-slate-500">{lang === 'en' ? 'Inflation' : '通膨率'}</div>
                  <div className="text-slate-800">+3.1%</div>
                </div>
                <div>
                  <div className="text-slate-500">{lang === 'en' ? 'Transit Boost' : '軌道效應'}</div>
                  <div className="text-blue-700 font-semibold">+{(stats.modeSharePercent * 0.08).toFixed(1)}%</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {finTab === 'economy' && (
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">{lang === 'en' ? 'Daily Farebox' : '日均票務收入'}</span>
              <span className="font-mono-tabular text-emerald-700 font-semibold">
                +{formatCurrencyWan(stats.dailyRevenue, lang)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{lang === 'en' ? 'Daily OpEx' : '日均線網維運'}</span>
              <span className="font-mono-tabular text-rose-700 font-semibold">
                -{formatCurrencyWan(stats.dailyMaintenance, lang)}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-200">
              <span className="text-slate-800 font-semibold">{lang === 'en' ? 'Net Operating Margin' : '營運日淨結餘'}</span>
              <span
                className={`font-mono-tabular font-bold ${
                  stats.dailyRevenue - stats.dailyMaintenance >= 0
                    ? 'text-emerald-700'
                    : 'text-rose-700'
                }`}
              >
                {stats.dailyRevenue - stats.dailyMaintenance >= 0 ? '+' : ''}
                {formatCurrencyWan(stats.dailyRevenue - stats.dailyMaintenance, lang)}
              </span>
            </div>
          </div>
        )}

        {finTab === 'finance' && (
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 space-y-2 text-xs font-mono-tabular">
            <div className="flex justify-between">
              <span className="text-slate-500">{lang === 'en' ? 'Difficulty Tier' : '財政難度'}</span>
              <span className="text-slate-900 font-medium">{difficulty.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{lang === 'en' ? 'CapEx Multiplier' : '造價係數'}</span>
              <span className="text-amber-700 font-semibold">{difficulty.costMultiplier.toFixed(2)}x</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{lang === 'en' ? 'OpEx Multiplier' : '維運係數'}</span>
              <span className="text-blue-700 font-semibold">{difficulty.maintenanceMultiplier.toFixed(2)}x</span>
            </div>
          </div>
        )}

        <button
          onClick={() => {
            onClose();
            onOpenMetroCoreFares();
          }}
          className="w-full px-3 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200/70 border border-slate-200 flex items-center justify-between text-xs transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2 text-slate-800 font-medium">
            <Ticket className="w-3.5 h-3.5 text-blue-600" />
            <span>{t(lang, 'fareRule')}</span>
          </span>
          <span className="flex items-center gap-1 text-slate-600 font-mono-tabular">
            <span>
              ¥{farePolicy.baseFare} {lang === 'en' ? 'base · dist' : '起·按里程'}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          </span>
        </button>
      </div>
    );
  }

  if (active === 'population') {
    return (
      <div className={`fixed top-14 left-1/2 -translate-x-1/2 z-40 w-80 ${lightPopover} p-4 space-y-3.5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Users className="w-4 h-4 text-blue-600" />
            <span>{t(lang, 'population')}</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-900 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-2xl font-bold font-mono-tabular text-slate-950">
          {formatPop(stats.totalPopulation, lang)}
        </div>

        <label className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between cursor-pointer">
          <div>
            <div className="text-xs font-semibold text-amber-900">{t(lang, 'popDensityLayer')}</div>
            <div className="text-[11px] text-amber-800/80 mt-0.5">
              {lang === 'en' ? 'Residential & employment density heatmap' : '顯示各街區常住人口與職缺熱區'}
            </div>
          </div>
          <input
            type="checkbox"
            checked={layers.populationHeatmap}
            onChange={() => onToggleLayer('populationHeatmap')}
            className="w-4 h-4 accent-amber-600 rounded"
          />
        </label>

        <div className="space-y-1.5 text-xs border-t border-slate-200 pt-2.5 font-mono-tabular">
          <div className="flex justify-between text-slate-700">
            <span className="text-slate-500">{lang === 'en' ? 'Total Jobs' : '城市總就業崗位'}</span>
            <span>{formatPop(stats.totalJobs, lang)}</span>
          </div>
          <div className="flex justify-between text-slate-700">
            <span className="text-slate-500">{lang === 'en' ? '15-min Metro Covered' : '地鐵覆蓋人口'}</span>
            <span className="text-emerald-700 font-semibold">{stats.coveragePercent.toFixed(1)}%</span>
          </div>
        </div>
      </div>
    );
  }

  if (active === 'share') {
    return (
      <div className={`fixed top-14 left-1/2 -translate-x-1/2 z-40 w-84 ${lightPopover} p-4 space-y-3.5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <TrainFront className="w-4 h-4 text-teal-600" />
            <span>{t(lang, 'metroShare')}</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-900 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-2xl font-bold font-mono-tabular text-slate-950">
          {stats.modeSharePercent.toFixed(1)}%
        </div>

        <label className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between cursor-pointer">
          <div>
            <div className="text-xs font-semibold text-emerald-900">{t(lang, 'metroCoverageLayer')}</div>
            <div className="text-[11px] text-emerald-800/80 mt-0.5">
              {lang === 'en' ? 'Green covered vs Red underserved demand' : '步行可達車站範圍（綠）與盲區（紅）'}
            </div>
          </div>
          <input
            type="checkbox"
            checked={layers.metroCoverageOverlay}
            onChange={() => onToggleLayer('metroCoverageOverlay')}
            className="w-4 h-4 accent-emerald-600 rounded"
          />
        </label>

        <div className="space-y-1.5 text-xs font-mono-tabular border-t border-slate-200 pt-2.5">
          <div className="flex justify-between">
            <span className="text-slate-500">{lang === 'en' ? 'Daily Total Trips (Car+Metro)' : '日均出行 (汽車+地鐵)'}</span>
            <span className="text-slate-800">{formatRidershipWan(stats.dailyTotalCityTrips, lang)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{lang === 'en' ? 'Metro Ridership' : '其中地鐵日運量'}</span>
            <span className="text-teal-700 font-semibold">{formatRidershipWan(stats.dailyRidership, lang)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{lang === 'en' ? 'Weekday / Weekend Split' : '工作日 / 週末分擔率'}</span>
            <span className="text-slate-800">
              {stats.modeSharePercent.toFixed(1)}% / {(stats.modeSharePercent * 1.04).toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{lang === 'en' ? '15-min Walk Access' : '步行 15 分鐘可達人口'}</span>
            <span className="text-emerald-700 font-semibold">{stats.coveragePercent.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{lang === 'en' ? 'Average Fare' : '平均票價'}</span>
            <span className="text-slate-800">¥{stats.avgFare.toFixed(2)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed top-14 left-1/2 -translate-x-1/2 z-40 w-84 ${lightPopover} p-4 space-y-3.5`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <CarFront className="w-4 h-4 text-emerald-600" />
          <span>{t(lang, 'congestionIdx')}</span>
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-900 rounded-lg">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="text-xl font-bold font-mono-tabular text-slate-950">
        {stats.congestionIndex.toFixed(2)} ({lang === 'en' ? 'All-day' : '全日'}) /{' '}
        {stats.peakCongestionIndex.toFixed(2)} ({lang === 'en' ? 'AM Peak' : '早高峰'})
      </div>

      <label className="p-3 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-between cursor-pointer">
        <div>
          <div className="text-xs font-semibold text-rose-900">{t(lang, 'roadCongestionLayer')}</div>
          <div className="text-[11px] text-rose-800/80 mt-0.5">
            {lang === 'en' ? 'Color arterial roads by real-time saturation' : '主要道路即時擁堵程度綠/黃/紅著色'}
          </div>
        </div>
        <input
          type="checkbox"
          checked={layers.congestionOverlay}
          onChange={() => onToggleLayer('congestionOverlay')}
          className="w-4 h-4 accent-rose-600 rounded"
        />
      </label>

      <div className="text-[11px] text-slate-500 leading-relaxed border-t border-slate-200 pt-2.5">
        {lang === 'en'
          ? '1.00 = Free-flow · 1.15+ Busy · 1.35+ Congested · 1.60+ Severe Gridlock. Expanding metro catchment directly relieves surface road VKT.'
          : '1.00 表示暢通 · 1.15 起緩行 · 1.35 起擁堵 · 1.60 起嚴重擁堵。擴大軌道站點覆蓋能有效分流地面車流。'}
      </div>
    </div>
  );
};
