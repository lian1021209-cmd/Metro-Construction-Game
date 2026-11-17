import React, { useState } from 'react';
import {
  X,
  TrainFront,
  CarFront,
  Smile,
  Users,
  MapPin,
  TrendingUp,
} from 'lucide-react';
import { Lock, Unlock } from 'lucide-react';
import {
  CityMap,
  DifficultyConfig,
  HistorySnapshot,
  Language,
  SimulationStats,
  Station,
  TransitLine,
} from '../types/game';
import { getDistrictUnlockCost } from '../engine/simulation';
import { formatCurrencyWan, formatPop, formatRidershipWan, t } from '../i18n/translations';

interface CityStatsModalProps {
  open: boolean;
  onClose: () => void;
  lang: Language;
  map: CityMap;
  difficulty: DifficultyConfig;
  year: number;
  day: number;
  stats: SimulationStats;
  stations: Station[];
  lines: TransitLine[];
  history: HistorySnapshot[];
  onUnlockDistrict: (districtId: string) => void;
  onLocateDistrict?: (x: number, y: number, label: string) => void;
}

function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) {
    return (
      <svg className="w-full h-9" viewBox="0 0 180 36" preserveAspectRatio="none">
        <line x1="0" y1="24" x2="180" y2="24" stroke={color} strokeWidth="1.8" strokeOpacity="0.6" />
      </svg>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(0.001, max - min);
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 180;
      const y = 30 - ((v - min) / span) * 24;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg className="w-full h-9" viewBox="0 0 180 36" preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" points={pts} />
    </svg>
  );
}

export const CityStatsModal: React.FC<CityStatsModalProps> = ({
  open,
  onClose,
  lang,
  map,
  difficulty,
  year,
  day,
  stats,
  stations,
  lines,
  history,
  onUnlockDistrict,
  onLocateDistrict,
}) => {
  const [tab, setTab] = useState<'overview' | 'traffic' | 'economy' | 'chronicle' | 'features' | 'rating'>('overview');

  if (!open) return null;

  const base = history[0];
  const ridershipSeries = [...history.map((h) => h.dailyRidership), stats.dailyRidership];
  const shareSeries = [...history.map((h) => h.modeSharePct), stats.modeSharePercent];
  const congSeries = [...history.map((h) => h.congestionIndex), stats.congestionIndex];
  const satSeries = [...history.map((h) => h.satisfaction), stats.satisfaction];
  const popSeries = [...history.map((h) => h.population), stats.totalPopulation];
  const covSeries = [...history.map((h) => h.coveragePercent), stats.coveragePercent];

  const liveStations = stations.filter((s) => !s.isDraft);
  const liveLines = lines.filter((l) => !l.isDraft && l.stationIds.length >= 2);
  const maxLineRider = Math.max(1, ...liveLines.map((l) => l.dailyRidership));

  const tabs = [
    { id: 'overview', label: t(lang, 'tabOverview') },
    { id: 'traffic', label: t(lang, 'tabTraffic') },
    { id: 'economy', label: t(lang, 'tabEconomy') },
    { id: 'chronicle', label: t(lang, 'tabChronicle') },
    { id: 'features', label: t(lang, 'tabFeatures') },
    { id: 'rating', label: t(lang, 'tabRating') },
  ] as const;

  // Overall city transit grade S/A/B/C
  const compositeScore = Math.round(
    stats.satisfaction * 0.4 +
      Math.min(100, stats.modeSharePercent * 2.8) * 0.35 +
      stats.coveragePercent * 0.25
  );
  const grade = compositeScore >= 85 ? 'S' : compositeScore >= 72 ? 'A' : compositeScore >= 55 ? 'B' : 'C';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-6xl max-h-[90vh] bg-[#0B1320]/95 border border-white/12 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div>
              <h2 className="text-lg font-bold text-slate-100">{t(lang, 'cityStats')}</h2>
              <div className="text-xs text-slate-400">
                {map.name} · {year} {lang === 'en' ? `Day ${day}` : `第 ${day} 日`}
              </div>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/70 border border-white/10 overflow-x-auto">
              {tabs.map((tb) => (
                <button
                  key={tb.id}
                  onClick={() => setTab(tb.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                    tab === tb.id
                      ? 'bg-white/15 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tb.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {tab === 'overview' && (
            <>
              {/* 6 Sparkline KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/8 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <TrainFront className="w-3.5 h-3.5 text-sky-400" />
                    <span>{t(lang, 'dailyRidership')}</span>
                  </div>
                  <div className="text-2xl font-bold font-mono-tabular text-slate-100">
                    {formatRidershipWan(stats.dailyRidership, lang)}
                  </div>
                  <div className="text-[11px] text-emerald-400 font-mono-tabular">
                    {base ? `+${formatRidershipWan(Math.max(0, stats.dailyRidership - base.dailyRidership), lang)}` : '+0'}
                  </div>
                  <MiniSparkline values={ridershipSeries} color="#38BDF8" />
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/8 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{t(lang, 'metroShare')}</span>
                  </div>
                  <div className="text-2xl font-bold font-mono-tabular text-slate-100">
                    {stats.modeSharePercent.toFixed(1)}%
                  </div>
                  <div className="text-[11px] text-emerald-400 font-mono-tabular">
                    ▲ {base ? (stats.modeSharePercent - base.modeSharePct).toFixed(1) : '0.0'}%
                  </div>
                  <MiniSparkline values={shareSeries} color="#34D399" />
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/8 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <CarFront className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t(lang, 'congestionIdx')}</span>
                  </div>
                  <div className="text-2xl font-bold font-mono-tabular text-slate-100">
                    {stats.congestionIndex.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-sky-300 font-mono-tabular">
                    {base ? `Δ ${(stats.congestionIndex - base.congestionIndex).toFixed(2)}` : '0.00'}
                  </div>
                  <MiniSparkline values={congSeries} color="#FBBF24" />
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/8 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Smile className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{t(lang, 'residentSatisfaction')}</span>
                  </div>
                  <div className="text-2xl font-bold font-mono-tabular text-slate-100">
                    {stats.satisfaction} <span className="text-sm text-slate-400 font-normal">/ 100</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono-tabular">
                    {base ? `Δ ${stats.satisfaction - base.satisfaction}` : '—'}
                  </div>
                  <MiniSparkline values={satSeries} color="#10B981" />
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/8 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Users className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{t(lang, 'population')}</span>
                  </div>
                  <div className="text-2xl font-bold font-mono-tabular text-slate-100">
                    {formatPop(stats.totalPopulation, lang)}
                  </div>
                  <div className="text-[11px] text-emerald-400 font-mono-tabular">
                    +{Math.max(0, stats.totalPopulation - (base?.population ?? stats.totalPopulation)).toLocaleString()}
                  </div>
                  <MiniSparkline values={popSeries} color="#818CF8" />
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/8 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <MapPin className="w-3.5 h-3.5 text-sky-400" />
                    <span>
                      {t(lang, 'stations')} · {lang === 'en' ? 'Coverage' : '覆蓋率'}
                    </span>
                  </div>
                  <div className="text-2xl font-bold font-mono-tabular text-slate-100">
                    {liveStations.length} <span className="text-sm text-slate-400">· {stats.coveragePercent.toFixed(0)}%</span>
                  </div>
                  <div className="text-[11px] text-emerald-400 font-mono-tabular">
                    +{Math.max(0, liveStations.length - (base?.stationCount ?? liveStations.length))} {t(lang, 'stations')}
                  </div>
                  <MiniSparkline values={covSeries} color="#38BDF8" />
                </div>
              </div>

              {/* Bottom 2 Panels: Ridership Trend + Per-line Bars */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/8 space-y-3">
                  <div className="text-sm font-semibold text-slate-100">
                    {t(lang, 'dailyRidership')} ({lang === 'en' ? 'Timeline' : '歷史趨勢'})
                  </div>
                  <div className="h-44 flex items-end pt-4">
                    <svg className="w-full h-full" viewBox="0 0 420 140" preserveAspectRatio="none">
                      {[25, 65, 105].map((y) => (
                        <line key={y} x1="0" y1={y} x2="420" y2={y} stroke="rgba(148,163,184,0.12)" />
                      ))}
                      {ridershipSeries.length >= 2 && (
                        <polyline
                          fill="none"
                          stroke="#38BDF8"
                          strokeWidth="2.5"
                          points={ridershipSeries
                            .map((val, i) => {
                              const maxR = Math.max(1000, ...ridershipSeries);
                              const x = (i / (ridershipSeries.length - 1)) * 410 + 5;
                              const y = 128 - (val / maxR) * 110;
                              return `${x},${y}`;
                            })
                            .join(' ')}
                        />
                      )}
                    </svg>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/8 space-y-3">
                  <div className="text-sm font-semibold text-slate-100">
                    {lang === 'en' ? 'Ridership by Line' : lang === 'zh-Hans' ? '各线路日客运量' : '各線路日客運量'}
                  </div>
                  <div className="space-y-2.5 max-h-44 overflow-y-auto pr-1">
                    {liveLines.map((line) => {
                      const pct = Math.max(6, (line.dailyRidership / maxLineRider) * 100);
                      return (
                        <div key={line.id} className="flex items-center gap-3 text-xs">
                          <div className="w-28 truncate text-slate-300 font-medium">{line.name}</div>
                          <div className="flex-1 h-4 bg-white/5 rounded overflow-hidden">
                            <div
                              className="h-full rounded transition-all"
                              style={{ width: `${pct}%`, backgroundColor: line.color }}
                            />
                          </div>
                          <div className="w-20 text-right font-mono-tabular text-slate-200">
                            {formatRidershipWan(line.dailyRidership, lang)}
                          </div>
                        </div>
                      );
                    })}
                    {liveLines.length === 0 && (
                      <div className="text-xs text-slate-500 py-8 text-center">
                        {lang === 'en' ? 'No operating lines yet' : '尚無營運線路'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'traffic' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-5 rounded-2xl bg-slate-950/60 border border-white/8 space-y-3">
                <div className="text-sm font-semibold text-slate-100">
                  {lang === 'en' ? 'Urban Modal Split Breakdown' : '全城出行方式結構'}
                </div>
                <div className="space-y-2 font-mono-tabular">
                  <div className="flex justify-between">
                    <span className="text-slate-400">{lang === 'en' ? 'Daily Total Urban Trips' : '全城總日均出行量'}</span>
                    <span>{formatRidershipWan(stats.dailyTotalCityTrips, lang)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{lang === 'en' ? 'Metro Trips' : '地鐵承載出行'}</span>
                    <span className="text-sky-300">{formatRidershipWan(stats.dailyRidership, lang)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{lang === 'en' ? 'Surface Road Saturation' : '平均道路飽和度'}</span>
                    <span className="text-amber-300">{stats.avgCongestion.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
              <div className="p-5 rounded-2xl bg-slate-950/60 border border-white/8 space-y-3">
                <div className="text-sm font-semibold text-slate-100">
                  {lang === 'en' ? 'Station Congestion Top 5' : '車站負荷排行'}
                </div>
                <div className="space-y-2">
                  {[...liveStations]
                    .sort((a, b) => b.waiting.length - a.waiting.length)
                    .slice(0, 5)
                    .map((st) => (
                      <div key={st.id} className="flex justify-between font-mono-tabular">
                        <span className="text-slate-200">{st.name}</span>
                        <span className={st.congestionLoad > 0.8 ? 'text-rose-400' : 'text-emerald-400'}>
                          {st.waiting.length} {lang === 'en' ? 'waiting' : '人候車'} ({Math.round(st.congestionLoad * 100)}%)
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'economy' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-5 rounded-2xl bg-slate-950/60 border border-white/8 space-y-2">
                <div className="text-slate-400">{lang === 'en' ? 'Daily Ticket Revenue' : '今日票款收益'}</div>
                <div className="text-xl font-bold font-mono-tabular text-emerald-400">
                  +{formatCurrencyWan(stats.dailyRevenue, lang)}
                </div>
              </div>
              <div className="p-5 rounded-2xl bg-slate-950/60 border border-white/8 space-y-2">
                <div className="text-slate-400">{lang === 'en' ? 'Daily Network OpEx' : '今日運營維運費'}</div>
                <div className="text-xl font-bold font-mono-tabular text-rose-400">
                  -{formatCurrencyWan(stats.dailyMaintenance, lang)}
                </div>
              </div>
              <div className="p-5 rounded-2xl bg-slate-950/60 border border-white/8 space-y-2">
                <div className="text-slate-400">{lang === 'en' ? 'Regional GDP Estimate' : '都市年度 GDP 預估'}</div>
                <div className="text-xl font-bold font-mono-tabular text-sky-300">
                  {lang === 'en'
                    ? `$${(stats.gdpBillions / 7).toFixed(1)}B`
                    : `${stats.gdpBillions.toFixed(0)} ${lang === 'zh-Hans' ? '亿元' : '億元'}`}
                </div>
              </div>
            </div>
          )}

          {tab === 'chronicle' && (
            <div className="space-y-2.5 text-xs">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="p-3.5 rounded-xl bg-slate-950/60 border border-white/8 flex items-center justify-between font-mono-tabular"
                >
                  <span className="text-sky-300 font-semibold">{h.label}</span>
                  <span className="text-slate-300">
                    {h.stationCount} {t(lang, 'stations')} · {formatRidershipWan(h.dailyRidership, lang)} · {h.modeSharePct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {tab === 'features' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/8 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-300">
                  {lang === 'en'
                    ? 'Starter spawn zones are open at game start. Other districts require funding to unlock.'
                    : '「開局出生點」於遊戲開局即開放建設；其餘外圍地區採用金錢解鎖制，解鎖後即可設站擴網。'}
                </span>
                <span className="font-mono-tabular text-sky-300">
                  {map.districts.filter((d) => d.unlocked).length} / {map.districts.length}{' '}
                  {lang === 'en' ? 'Unlocked' : '已解鎖'}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {map.districts.map((d) => {
                  const cost = getDistrictUnlockCost(d, difficulty);
                  return (
                    <div
                      key={d.id}
                      className="p-4 rounded-xl bg-slate-950/60 border border-white/8 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-100 truncate">{d.name}</span>
                          <span className="text-[11px] font-mono-tabular text-slate-400">
                            {d.growthMultiplier.toFixed(2)}x
                          </span>
                        </div>
                        <div className="mt-1">
                          {d.isStarter ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-400/30 text-[11px] font-medium text-emerald-300">
                              {lang === 'en' ? 'Starting Spawn Point' : '開局出生點'}
                            </span>
                          ) : d.unlocked ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-400/30 text-[11px] font-medium text-sky-300">
                              <Unlock className="w-3 h-3" />
                              {lang === 'en' ? 'Unlocked District' : '已花費解鎖'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-300">
                              <Lock className="w-3 h-3" />
                              {lang === 'en' ? 'Locked District' : '未解鎖地區'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {onLocateDistrict && (
                          <button
                            onClick={() => onLocateDistrict(d.x, d.y, d.name)}
                            className="px-2.5 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-slate-300 text-[11px] transition-colors"
                          >
                            {t(lang, 'locateBtn')}
                          </button>
                        )}
                        {!d.unlocked && (
                          <button
                            onClick={() => onUnlockDistrict(d.id)}
                            className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 font-semibold font-mono-tabular text-[11px] transition-colors"
                          >
                            {lang === 'en' ? 'Unlock' : '解鎖'} · {formatCurrencyWan(cost, lang)}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'rating' && (
            <div className="p-6 rounded-2xl bg-slate-950/60 border border-white/8 flex items-center justify-between">
              <div className="space-y-2 max-w-xl">
                <div className="text-sm font-semibold text-slate-200">
                  {lang === 'en' ? 'Comprehensive Transit Evaluation' : '城市軌道運輸綜合評等'}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {lang === 'en'
                    ? 'Evaluated dynamically from metro mode share, 15-minute population coverage, and station dwell/congestion satisfaction.'
                    : '綜合地鐵客運分擔率、步行覆蓋率及全城通勤滿意度即時評核。擴張跨江/跨區幹線並保持低擁擠度可提升評級。'}
                </p>
              </div>
              <div className="text-right">
                <div className="text-5xl font-bold font-mono-tabular text-sky-400">{grade}</div>
                <div className="text-xs font-mono-tabular text-slate-400 mt-1">
                  {compositeScore} / 100
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
