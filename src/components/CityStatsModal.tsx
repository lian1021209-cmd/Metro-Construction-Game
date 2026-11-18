import React, { useState } from 'react';
import {
  X,
  TrainFront,
  CarFront,
  Smile,
  Users,
  MapPin,
  TrendingUp,
  Lock,
  Unlock,
} from 'lucide-react';
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
        <line x1="0" y1="24" x2="180" y2="24" stroke={color} strokeWidth="1.8" strokeOpacity="0.55" />
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

  const compositeScore = Math.round(
    stats.satisfaction * 0.4 +
      Math.min(100, stats.modeSharePercent * 2.8) * 0.35 +
      stats.coveragePercent * 0.25
  );
  const grade = compositeScore >= 85 ? 'S' : compositeScore >= 72 ? 'A' : compositeScore >= 55 ? 'B' : 'C';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="w-full max-w-6xl max-h-[90vh] bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col overflow-hidden text-slate-900">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-900">{t(lang, 'cityStats')}</h2>
              <div className="text-xs text-slate-500 font-mono-tabular">
                {map.name} · {year} {lang === 'en' ? `Day ${day}` : `第 ${day} 日`}
              </div>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200 overflow-x-auto">
              {tabs.map((tb) => (
                <button
                  key={tb.id}
                  onClick={() => setTab(tb.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors ${
                    tab === tb.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tb.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50/40">
          {tab === 'overview' && (
            <>
              {/* 6 Sparkline KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                    <TrainFront className="w-3.5 h-3.5 text-blue-600" />
                    <span>{t(lang, 'dailyRidership')}</span>
                  </div>
                  <div className="text-2xl font-bold font-mono-tabular text-slate-900">
                    {formatRidershipWan(stats.dailyRidership, lang)}
                  </div>
                  <div className="text-[11px] text-emerald-700 font-mono-tabular font-medium">
                    {base ? `+${formatRidershipWan(Math.max(0, stats.dailyRidership - base.dailyRidership), lang)}` : '+0'}
                  </div>
                  <MiniSparkline values={ridershipSeries} color="#2563EB" />
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{t(lang, 'metroShare')}</span>
                  </div>
                  <div className="text-2xl font-bold font-mono-tabular text-slate-900">
                    {stats.modeSharePercent.toFixed(1)}%
                  </div>
                  <div className="text-[11px] text-emerald-700 font-mono-tabular font-medium">
                    +{base ? (stats.modeSharePercent - base.modeSharePct).toFixed(1) : '0.0'}%
                  </div>
                  <MiniSparkline values={shareSeries} color="#059669" />
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                    <CarFront className="w-3.5 h-3.5 text-amber-600" />
                    <span>{t(lang, 'congestionIdx')}</span>
                  </div>
                  <div className="text-2xl font-bold font-mono-tabular text-slate-900">
                    {stats.congestionIndex.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-blue-700 font-mono-tabular font-medium">
                    {base ? `Δ ${(stats.congestionIndex - base.congestionIndex).toFixed(2)}` : '0.00'}
                  </div>
                  <MiniSparkline values={congSeries} color="#D97706" />
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                    <Smile className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{t(lang, 'residentSatisfaction')}</span>
                  </div>
                  <div className="text-2xl font-bold font-mono-tabular text-slate-900">
                    {stats.satisfaction} <span className="text-sm text-slate-400 font-normal">/ 100</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono-tabular">
                    {base ? `Δ ${stats.satisfaction - base.satisfaction}` : '—'}
                  </div>
                  <MiniSparkline values={satSeries} color="#059669" />
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                    <Users className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{t(lang, 'population')}</span>
                  </div>
                  <div className="text-2xl font-bold font-mono-tabular text-slate-900">
                    {formatPop(stats.totalPopulation, lang)}
                  </div>
                  <div className="text-[11px] text-emerald-700 font-mono-tabular font-medium">
                    +{Math.max(0, stats.totalPopulation - (base?.population ?? stats.totalPopulation)).toLocaleString()}
                  </div>
                  <MiniSparkline values={popSeries} color="#4F46E5" />
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" />
                    <span>
                      {t(lang, 'stations')} · {lang === 'en' ? 'Coverage' : '覆蓋率'}
                    </span>
                  </div>
                  <div className="text-2xl font-bold font-mono-tabular text-slate-900">
                    {liveStations.length} <span className="text-sm text-slate-400">· {stats.coveragePercent.toFixed(0)}%</span>
                  </div>
                  <div className="text-[11px] text-emerald-700 font-mono-tabular font-medium">
                    +{Math.max(0, liveStations.length - (base?.stationCount ?? liveStations.length))} {t(lang, 'stations')}
                  </div>
                  <MiniSparkline values={covSeries} color="#2563EB" />
                </div>
              </div>

              {/* Bottom 2 Panels: Ridership Trend + Per-line Bars */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
                  <div className="text-sm font-semibold text-slate-900">
                    {t(lang, 'dailyRidership')} ({lang === 'en' ? 'Timeline' : '歷史趨勢'})
                  </div>
                  <div className="h-44 flex items-end pt-4">
                    <svg className="w-full h-full" viewBox="0 0 420 140" preserveAspectRatio="none">
                      {[25, 65, 105].map((y) => (
                        <line key={y} x1="0" y1={y} x2="420" y2={y} stroke="rgba(15,23,42,0.08)" />
                      ))}
                      {ridershipSeries.length >= 2 && (
                        <polyline
                          fill="none"
                          stroke="#2563EB"
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

                <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
                  <div className="text-sm font-semibold text-slate-900">
                    {lang === 'en' ? 'Ridership by Line' : lang === 'zh-Hans' ? '各线路日客运量' : '各線路日客運量'}
                  </div>
                  <div className="space-y-2.5 max-h-44 overflow-y-auto pr-1">
                    {liveLines.map((line) => {
                      const pct = Math.max(6, (line.dailyRidership / maxLineRider) * 100);
                      return (
                        <div key={line.id} className="flex items-center gap-3 text-xs">
                          <div className="w-28 truncate text-slate-700 font-semibold">{line.name}</div>
                          <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden">
                            <div
                              className="h-full rounded transition-all"
                              style={{ width: `${pct}%`, backgroundColor: line.color }}
                            />
                          </div>
                          <div className="w-20 text-right font-mono-tabular text-slate-900 font-medium">
                            {formatRidershipWan(line.dailyRidership, lang)}
                          </div>
                        </div>
                      );
                    })}
                    {liveLines.length === 0 && (
                      <div className="text-xs text-slate-400 py-8 text-center">
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
              <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
                <div className="text-sm font-semibold text-slate-900">
                  {lang === 'en' ? 'Urban Modal Split Breakdown' : '全城出行方式結構'}
                </div>
                <div className="space-y-2.5 font-mono-tabular">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500 font-sans">{lang === 'en' ? 'Daily Total Urban Trips' : '全城總日均出行量'}</span>
                    <span className="font-semibold text-slate-900">{formatRidershipWan(stats.dailyTotalCityTrips, lang)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500 font-sans">{lang === 'en' ? 'Metro Trips' : '地鐵承載出行'}</span>
                    <span className="text-blue-700 font-semibold">{formatRidershipWan(stats.dailyRidership, lang)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500 font-sans">{lang === 'en' ? 'Surface Road Saturation' : '平均道路飽和度'}</span>
                    <span className="text-amber-700 font-semibold">{stats.avgCongestion.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
              <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
                <div className="text-sm font-semibold text-slate-900">
                  {lang === 'en' ? 'Station Congestion Top 5' : '車站負荷排行'}
                </div>
                <div className="space-y-2">
                  {[...liveStations]
                    .sort((a, b) => b.waiting.length - a.waiting.length)
                    .slice(0, 5)
                    .map((st) => (
                      <div key={st.id} className="flex justify-between py-1 border-b border-slate-100 last:border-b-0 font-mono-tabular">
                        <span className="text-slate-800 font-sans font-medium">{st.name}</span>
                        <span className={st.congestionLoad > 0.8 ? 'text-rose-600 font-semibold' : 'text-emerald-700 font-semibold'}>
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
              <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-2">
                <div className="text-slate-500 font-medium">{lang === 'en' ? 'Daily Ticket Revenue' : '今日票款收益'}</div>
                <div className="text-xl font-bold font-mono-tabular text-emerald-700">
                  +{formatCurrencyWan(stats.dailyRevenue, lang)}
                </div>
              </div>
              <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-2">
                <div className="text-slate-500 font-medium">{lang === 'en' ? 'Daily Network OpEx' : '今日運營維運費'}</div>
                <div className="text-xl font-bold font-mono-tabular text-rose-600">
                  -{formatCurrencyWan(stats.dailyMaintenance, lang)}
                </div>
              </div>
              <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-2">
                <div className="text-slate-500 font-medium">{lang === 'en' ? 'Regional GDP Estimate' : '都市年度 GDP 預估'}</div>
                <div className="text-xl font-bold font-mono-tabular text-blue-700">
                  {lang === 'en'
                    ? `$${(stats.gdpBillions / 7).toFixed(1)}B`
                    : `${stats.gdpBillions.toFixed(0)} ${lang === 'zh-Hans' ? '亿元' : '億元'}`}
                </div>
              </div>
            </div>
          )}

          {tab === 'chronicle' && (
            <div className="space-y-2 text-xs">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="p-3.5 rounded-lg bg-white border border-slate-200 flex items-center justify-between font-mono-tabular"
                >
                  <span className="text-blue-700 font-semibold">{h.label}</span>
                  <span className="text-slate-700">
                    {h.stationCount} {t(lang, 'stations')} · {formatRidershipWan(h.dailyRidership, lang)} · {h.modeSharePct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {tab === 'features' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-600">
                  {lang === 'en'
                    ? 'Starter spawn zones are open at game start. Other districts require funding to unlock.'
                    : '「開局出生點」於遊戲開局即開放建設；其餘外圍地區採用金錢解鎖制，解鎖後即可設站擴網。'}
                </span>
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {map.districts.filter((d) => d.unlocked).length} / {map.districts.length}{' '}
                  {lang === 'en' ? 'Unlocked' : '已解鎖'}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {map.districts.map((d) => {
                  const cost = getDistrictUnlockCost(d, difficulty);
                  return (
                    <div
                      key={d.id}
                      className="p-4 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 truncate">{d.name}</span>
                          <span className="text-[11px] font-mono-tabular text-slate-400">
                            {d.growthMultiplier.toFixed(2)}x
                          </span>
                        </div>
                        <div className="mt-1">
                          {d.isStarter ? (
                            <span className="inline-flex items-center text-[11px] font-medium text-emerald-700">
                              {lang === 'en' ? 'Starting Spawn Point' : '開局出生點'}
                            </span>
                          ) : d.unlocked ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700">
                              <Unlock className="w-3 h-3" />
                              {lang === 'en' ? 'Unlocked District' : '已花費解鎖'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
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
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium whitespace-nowrap transition-colors"
                          >
                            {t(lang, 'locateBtn')}
                          </button>
                        )}
                        {!d.unlocked && (
                          <button
                            onClick={() => onUnlockDistrict(d.id)}
                            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold font-mono-tabular text-[11px] whitespace-nowrap transition-colors"
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
            <div className="p-6 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
              <div className="space-y-2 max-w-xl">
                <div className="text-sm font-semibold text-slate-900">
                  {lang === 'en' ? 'Comprehensive Transit Evaluation' : '城市軌道運輸綜合評等'}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {lang === 'en'
                    ? 'Evaluated dynamically from metro mode share, 15-minute population coverage, and station dwell/congestion satisfaction.'
                    : '綜合地鐵客運分擔率、步行覆蓋率及全城通勤滿意度即時評核。擴張跨江/跨區幹線並保持低擁擠度可提升評級。'}
                </p>
              </div>
              <div className="text-right">
                <div className="text-5xl font-bold font-mono-tabular text-blue-600">{grade}</div>
                <div className="text-xs font-mono-tabular text-slate-500 mt-1">
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
