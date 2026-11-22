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
  ArrowRight,
  Compass,
  ChevronDown,
  ChevronRight,
  Search,
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
import {
  getCityUnlockCost,
  getCityUnlockPrereq,
  getDistrictUnlockCost,
  getDistrictUnlockPrereq,
  getProvinceUnlockCost,
} from '../engine/simulation';
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
  onUnlockRegion?: (kind: 'province' | 'city' | 'district', id: string) => void;
  onPreloadProvinceChunk?: (provinceId: string) => void | Promise<void>;
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
  onUnlockRegion,
  onPreloadProvinceChunk,
  onLocateDistrict,
}) => {
  const [tab, setTab] = useState<'overview' | 'traffic' | 'economy' | 'chronicle' | 'features' | 'rating'>('overview');
  const [regionQuery, setRegionQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState<'all' | 'unlockable' | 'unlocked'>('all');
  const [expandedProvinces, setExpandedProvinces] = useState<Record<string, boolean>>({});
  const [expandedCities, setExpandedCities] = useState<Record<string, boolean>>({});

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
            <div className="space-y-5">
              {/* Summary Header + Filter Bar */}
              <div className="p-3.5 rounded-lg bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <div className="text-slate-800 font-semibold">
                    {lang === 'en'
                      ? 'Province → Nearest City → Nearest District Cascade'
                      : '跨省層級解鎖：解鎖鄰省自動開放最近「市」與最近「區縣」，並可沿相鄰行政區逐層向外擴張'}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono-tabular">
                    已開放 {map.districts.filter((d) => d.unlocked).length} / {map.districts.length} 區縣 ·{' '}
                    {(map.cities ?? []).filter((c) => c.unlocked).length} / {(map.cities ?? []).length} 跨省城市 ·{' '}
                    當前解鎖人口 <strong className="text-slate-800">{formatPop(stats.totalPopulation, lang)}</strong>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={regionQuery}
                      onChange={(e) => setRegionQuery(e.target.value)}
                      placeholder="搜尋省/市/區縣..."
                      className="pl-7 pr-2.5 py-1.5 rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-800 focus:outline-none focus:border-blue-400 w-44"
                    />
                  </div>
                  <div className="flex items-center p-0.5 rounded-md bg-slate-100 border border-slate-200">
                    {(
                      [
                        ['all', '全部'],
                        ['unlockable', '可解鎖'],
                        ['unlocked', '已開放'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        onClick={() => setRegionFilter(id)}
                        className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                          regionFilter === id
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Nationwide Provinces Section */}
              {(map.provinces?.length ?? 0) > 0 && (() => {
                const totalNationalProvs = map.provinces!.length;
                const totalNationalCities =
                  map.provinces!.reduce((s, p) => s + (p.cityCount ?? 0), 0) ||
                  (map.cities ?? []).length;
                const totalNationalDists =
                  map.provinces!.reduce((s, p) => s + (p.districtCount ?? 0), 0) ||
                  map.districts.filter((d) => d.provinceId && d.provinceId !== 'prov_sh').length;
                const loadedDistCount = map.districts.filter((d) => d.unlocked).length;

                return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold tracking-wide text-slate-700 flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-blue-600" />
                      全國都市圈層級擴張（{totalNationalProvs} 省區市 · {totalNationalCities} 市 · 共 {totalNationalDists} 區縣，已開放 {loadedDistCount} 區）
                    </h3>
                    <span className="text-[11px] text-slate-500 font-mono-tabular">
                      省 → 最近市 → 最近區
                    </span>
                  </div>

                  <div className="space-y-3">
                    {map.provinces!
                      .filter((prov) => prov.id !== 'prov_sh')
                      .map((prov) => {
                      const provCost = getProvinceUnlockCost(prov, difficulty);
                      const q = regionQuery.trim();
                      const provCities = (map.cities ?? [])
                        .filter((c) => c.provinceId === prov.id)
                        .sort((a, b) => a.distanceKmFromShanghai - b.distanceKmFromShanghai);
                      const closestCity = provCities.find((c) => c.id === prov.closestCityId);
                      const closestDist = closestCity
                        ? map.districts.find((d) => d.id === closestCity.closestDistrictId)
                        : undefined;
                      const previewCityName = closestCity?.name ?? prov.closestCityName;
                      const previewDistName = closestDist?.name ?? prov.closestDistrictName;

                      const visibleCities = provCities.filter((city) => {
                        const cityPrereq = getCityUnlockPrereq(map, city);
                        const cityDistricts = map.districts.filter((d) => d.cityId === city.id);
                        const matchesQuery =
                          !q ||
                          prov.name.includes(q) ||
                          city.name.includes(q) ||
                          cityDistricts.some((d) => d.name.includes(q));
                        if (!matchesQuery) return false;
                        if (regionFilter === 'unlocked') return city.unlocked;
                        if (regionFilter === 'unlockable') {
                          return (
                            (!city.unlocked && cityPrereq.canUnlock) ||
                            (city.unlocked && cityDistricts.some((d) => !d.unlocked && getDistrictUnlockPrereq(map, d).canUnlock))
                          );
                        }
                        return true;
                      });

                      const matchesProvMeta =
                        !q ||
                        prov.name.includes(q) ||
                        Boolean(previewCityName?.includes(q)) ||
                        Boolean(previewDistName?.includes(q));

                      if (regionFilter === 'unlocked' && !prov.unlocked) return null;
                      if (q && visibleCities.length === 0 && !matchesProvMeta) {
                        return null;
                      }

                      const isProvExpanded =
                        expandedProvinces[prov.id] ?? (prov.unlocked || Boolean(q && visibleCities.length > 0));
                      const displayCityTotal = provCities.length > 0 ? provCities.length : (prov.cityCount ?? 0);
                      const unlockedCityCount = provCities.filter((c) => c.unlocked).length;

                      return (
                        <div
                          key={prov.id}
                          className={`rounded-xl border overflow-hidden ${
                            prov.unlocked
                              ? 'bg-white border-blue-200'
                              : 'bg-slate-50/70 border-slate-200'
                          }`}
                        >
                          {/* Province Banner */}
                          <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white">
                            <button
                              type="button"
                              onClick={() => {
                                const next = !isProvExpanded;
                                setExpandedProvinces((prev) => ({ ...prev, [prov.id]: next }));
                                if (next && prov.loaded === false) {
                                  void onPreloadProvinceChunk?.(prov.id);
                                }
                              }}
                              className="min-w-0 flex-1 text-left space-y-1 cursor-pointer"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                {isProvExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                                )}
                                <span className="text-sm font-bold text-slate-900">{prov.name}</span>
                                <span className="text-[11px] font-mono-tabular text-slate-400">
                                  {unlockedCityCount}/{displayCityTotal} 市
                                  {prov.districtCount ? ` · ${prov.districtCount} 區縣` : ''}
                                  {prov.provincePopulation ? ` · ${formatPop(prov.provincePopulation, lang)}` : ''}
                                </span>
                                {prov.unlocked ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                    <Unlock className="w-3 h-3" /> 已開放跨省門戶
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
                                    <Lock className="w-3 h-3" /> 尚未解鎖
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 pl-6">{prov.description}</p>
                              {!prov.unlocked && previewCityName && previewDistName && (
                                <div className="flex items-center gap-1.5 text-[11px] text-blue-700 font-medium pt-0.5 pl-6">
                                  <span>聯動開啟：</span>
                                  <span>{prov.name}</span>
                                  <ArrowRight className="w-3 h-3" />
                                  <span>{previewCityName}</span>
                                  <ArrowRight className="w-3 h-3" />
                                  <span>{previewDistName}</span>
                                </div>
                              )}
                            </button>

                            <div className="flex items-center gap-2 shrink-0">
                              {onLocateDistrict && (
                                <button
                                  onClick={() => onLocateDistrict(prov.x, prov.y, prov.name)}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors"
                                >
                                  {t(lang, 'locateBtn')}
                                </button>
                              )}
                              {!prov.unlocked && (
                                <button
                                  onClick={() =>
                                    onUnlockRegion
                                      ? onUnlockRegion('province', prov.id)
                                      : undefined
                                  }
                                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold font-mono-tabular text-[11px] whitespace-nowrap shrink-0 transition-colors"
                                >
                                  解鎖{prov.name} · {formatCurrencyWan(provCost, lang)}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Cities inside Province */}
                          {isProvExpanded && (
                          <div className="p-3 space-y-2">
                            {prov.loaded === false && provCities.length === 0 && (
                              <div className="px-3 py-4 text-center text-[11px] text-slate-500">
                                正在載入 {prov.name} 市級與區縣疆域數據...
                              </div>
                            )}
                            {visibleCities.map((city) => {
                              const cityCost = getCityUnlockCost(city, difficulty);
                              const cityPrereq = getCityUnlockPrereq(map, city);
                              const cityDistricts = map.districts
                                .filter((d) => d.cityId === city.id)
                                .sort((a, b) => (a.distanceOrder ?? 99) - (b.distanceOrder ?? 99));
                              const autoDist = cityDistricts.find((d) => d.id === city.closestDistrictId);
                              const unlockedDistCount = cityDistricts.filter((d) => d.unlocked).length;
                              const isExpanded =
                                expandedCities[city.id] ?? (city.unlocked || Boolean(q));

                              return (
                                <div
                                  key={city.id}
                                  className={`p-3 rounded-lg border text-xs ${
                                    city.unlocked
                                      ? 'bg-white border-slate-200'
                                      : 'bg-slate-100/70 border-slate-200/80'
                                  }`}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedCities((prev) => ({
                                          ...prev,
                                          [city.id]: !isExpanded,
                                        }))
                                      }
                                      className="flex items-center gap-2 min-w-0 text-left"
                                    >
                                      {isExpanded ? (
                                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                      ) : (
                                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                      )}
                                      <span className="font-semibold text-slate-900">{city.name}</span>
                                      <span className="text-[11px] font-mono-tabular text-slate-400">
                                        {unlockedDistCount}/{cityDistricts.length} 區 ·{' '}
                                        {formatPop(
                                          cityDistricts.reduce((s, d) => s + (d.realPopulation ?? 0), 0),
                                          lang
                                        )}{' '}
                                        · {city.distanceKmFromShanghai} km
                                      </span>
                                      {city.unlocked ? (
                                        <span className="text-[11px] text-emerald-700 font-medium">
                                          已開放
                                        </span>
                                      ) : !cityPrereq.canUnlock ? (
                                        <span className="text-[11px] text-slate-500">
                                          需先解鎖 {cityPrereq.blockedByName}
                                        </span>
                                      ) : null}
                                    </button>

                                    <div className="flex items-center gap-2 shrink-0">
                                      {onLocateDistrict && (
                                        <button
                                          onClick={() => onLocateDistrict(city.x, city.y, city.name)}
                                          className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] whitespace-nowrap shrink-0 transition-colors"
                                        >
                                          {t(lang, 'locateBtn')}
                                        </button>
                                      )}
                                      {!city.unlocked && (
                                        <button
                                          onClick={() =>
                                            onUnlockRegion
                                              ? onUnlockRegion('city', city.id)
                                              : undefined
                                          }
                                          disabled={!cityPrereq.canUnlock}
                                          className={`px-2.5 py-1 rounded font-semibold font-mono-tabular text-[11px] whitespace-nowrap shrink-0 transition-colors ${
                                            cityPrereq.canUnlock
                                              ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                              : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                          }`}
                                        >
                                          {cityPrereq.canUnlock
                                            ? `解鎖${city.name}${autoDist ? `（含${autoDist.name}）` : ''} · ${formatCurrencyWan(cityCost, lang)}`
                                            : `需 ${cityPrereq.blockedByName}`}
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Progressive Districts inside this City */}
                                  {isExpanded && (
                                    <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                      {cityDistricts
                                        .filter((d) => !q || d.name.includes(q) || city.name.includes(q))
                                        .map((d) => {
                                          const distCost = getDistrictUnlockCost(d, difficulty);
                                          const distPrereq = getDistrictUnlockPrereq(map, d);
                                          return (
                                            <div
                                              key={d.id}
                                              className={`px-2.5 py-2 rounded-md border flex items-center justify-between gap-2 ${
                                                d.unlocked
                                                  ? 'bg-blue-50/40 border-blue-200/80'
                                                  : 'bg-white border-slate-200'
                                              }`}
                                            >
                                              <div className="min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                  <span className="font-medium text-slate-900 truncate">
                                                    {d.name}
                                                  </span>
                                                  {d.isStarter && (
                                                    <span className="text-[10px] font-semibold text-emerald-700 shrink-0">
                                                      · 出生點
                                                    </span>
                                                  )}
                                                </div>
                                                <div className="text-[10px] text-slate-500 mt-0.5 font-mono-tabular">
                                                  {d.realPopulation ? `人口 ${formatPop(d.realPopulation, lang)} · ` : ''}
                                                  成長 {d.growthMultiplier.toFixed(2)}x
                                                  {!d.unlocked && !distPrereq.canUnlock
                                                    ? ` · 需先解鎖${distPrereq.blockedByName}`
                                                    : ''}
                                                </div>
                                              </div>

                                              {d.unlocked ? (
                                                <button
                                                  onClick={() => onLocateDistrict?.(d.x, d.y, d.name)}
                                                  className="px-2 py-1 rounded bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[10px] whitespace-nowrap shrink-0"
                                                >
                                                  定位
                                                </button>
                                              ) : (
                                                <button
                                                  onClick={() =>
                                                    onUnlockRegion
                                                      ? onUnlockRegion('district', d.id)
                                                      : onUnlockDistrict(d.id)
                                                  }
                                                  disabled={!distPrereq.canUnlock}
                                                  className={`px-2 py-1 rounded text-[10px] font-semibold font-mono-tabular whitespace-nowrap shrink-0 ${
                                                    distPrereq.canUnlock
                                                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                  }`}
                                                >
                                                  {distPrereq.canUnlock
                                                    ? formatCurrencyWan(distCost, lang)
                                                    : '未前置'}
                                                </button>
                                              )}
                                            </div>
                                          );
                                        })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                );
              })()}

              {/* Shanghai 16 Districts Section */}
              {(() => {
                const shProv = map.provinces?.find((p) => p.id === 'prov_sh');
                const shCost = shProv ? getProvinceUnlockCost(shProv, difficulty) : 0;
                const shDistricts = map.districts.filter((d) => !d.provinceId || d.provinceId === 'prov_sh');
                const q = regionQuery.trim();
                const filteredShDistricts = shDistricts.filter((d) => {
                  if (q && !d.name.includes(q) && !'上海市'.includes(q)) return false;
                  if (regionFilter === 'unlocked') return d.unlocked;
                  if (regionFilter === 'unlockable') {
                    return !d.unlocked && getDistrictUnlockPrereq(map, d).canUnlock;
                  }
                  return true;
                });
                if (q && filteredShDistricts.length === 0 && !'上海市'.includes(q)) return null;
                return (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold tracking-wide text-slate-700">
                        上海市轄區（16 個行政區）
                      </h3>
                      {shProv && !shProv.unlocked && (
                        <span className="text-[11px] font-medium text-amber-700">
                          · 尚未開放直轄市門戶
                        </span>
                      )}
                    </div>
                    {shProv && !shProv.unlocked && (
                      <button
                        onClick={() =>
                          onUnlockRegion ? onUnlockRegion('province', shProv.id) : undefined
                        }
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold font-mono-tabular text-[11px] whitespace-nowrap shrink-0 transition-colors"
                      >
                        解鎖上海市 · {formatCurrencyWan(shCost, lang)}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {filteredShDistricts.map((d) => {
                      const cost = getDistrictUnlockCost(d, difficulty);
                      const distPrereq = getDistrictUnlockPrereq(map, d);
                      return (
                        <div
                          key={d.id}
                          className="p-4 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900 truncate">{d.name}</span>
                              <span className="text-[11px] font-mono-tabular text-slate-400">
                                {d.realPopulation ? `${formatPop(d.realPopulation, lang)} · ` : ''}
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
                                  {!distPrereq.canUnlock && distPrereq.blockedByName
                                    ? `需先解鎖${distPrereq.blockedByName}`
                                    : lang === 'en'
                                    ? 'Locked District'
                                    : '未解鎖地區'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {onLocateDistrict && (
                              <button
                                onClick={() => onLocateDistrict(d.x, d.y, d.name)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors"
                              >
                                {t(lang, 'locateBtn')}
                              </button>
                            )}
                            {!d.unlocked && (
                              <button
                                onClick={() =>
                                  onUnlockRegion
                                    ? onUnlockRegion('district', d.id)
                                    : onUnlockDistrict(d.id)
                                }
                                disabled={!distPrereq.canUnlock}
                                className={`px-3 py-1.5 rounded-lg font-semibold font-mono-tabular text-[11px] whitespace-nowrap shrink-0 transition-colors ${
                                  distPrereq.canUnlock
                                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                    : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                }`}
                              >
                                {distPrereq.canUnlock
                                  ? `${lang === 'en' ? 'Unlock' : '解鎖'} · ${formatCurrencyWan(cost, lang)}`
                                  : '未前置'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                );
              })()}
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
