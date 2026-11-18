import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ArrowLeftRight,
  Zap,
} from 'lucide-react';
import {
  CityMap,
  FarePolicy,
  HistorySnapshot,
  Language,
  LINE_PALETTE,
  ServiceMode,
  SimulationStats,
  Station,
  StationSize,
  STATION_CONFIGS,
  TrackSegment,
  TransitLine,
} from '../types/game';
import { computeProgressiveFare, pixelsToKm } from '../engine/simulation';
import { formatRidershipWan, t } from '../i18n/translations';

interface MetroCoreModalProps {
  open: boolean;
  initialTab?: 'overview' | 'lines' | 'stations' | 'fleet' | 'fares';
  onClose: () => void;
  lang: Language;
  map: CityMap;
  year: number;
  day: number;
  stats: SimulationStats;
  stations: Station[];
  segments: TrackSegment[];
  lines: TransitLine[];
  activeLineId: string;
  history: HistorySnapshot[];
  farePolicy: FarePolicy;
  onUpdateFarePolicy: (patch: Partial<FarePolicy>) => void;
  onSelectLine: (id: string) => void;
  onCreateLine: () => void;
  onUpdateLine: (id: string, patch: Partial<TransitLine>) => void;
  onDeleteLine: (id: string) => void;
  onFocusStation: (station: Station) => void;
  onUpgradeStation: (id: string, newSize: StationSize) => void;
}

export const MetroCoreModal: React.FC<MetroCoreModalProps> = ({
  open,
  initialTab = 'overview',
  onClose,
  lang,
  map,
  year,
  day,
  stats,
  stations,
  segments,
  lines,
  activeLineId,
  history,
  farePolicy,
  onUpdateFarePolicy,
  onSelectLine,
  onCreateLine,
  onUpdateLine,
  onDeleteLine,
  onFocusStation,
  onUpgradeStation,
}) => {
  const [tab, setTab] = useState<'overview' | 'lines' | 'stations' | 'fleet' | 'fares'>(initialTab);
  const [chartMetric, setChartMetric] = useState<'ridership' | 'share' | 'satisfaction'>('ridership');
  const [autoAlert, setAutoAlert] = useState(true);

  React.useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  if (!open) return null;

  const liveStations = stations.filter((s) => !s.isDraft);
  const liveLines = lines.filter((l) => !l.isDraft);
  const activeLine = liveLines.find((l) => l.id === activeLineId) ?? liveLines[0];

  const stMap = new Map(liveStations.map((s) => [s.id, s]));
  const segMap = new Map<string, TrackSegment>();
  for (const seg of segments) {
    segMap.set(`${seg.fromStationId}_${seg.toStationId}`, seg);
    segMap.set(`${seg.toStationId}_${seg.fromStationId}`, seg);
  }

  let totalKm = 0;
  for (const l of liveLines) {
    for (let i = 0; i < l.stationIds.length - 1; i++) {
      const s = segMap.get(`${l.stationIds[i]}_${l.stationIds[i + 1]}`);
      if (s) totalKm += pixelsToKm(s.length, map);
    }
  }

  const totalTrains = liveLines.reduce((acc, l) => acc + l.trains.length, 0);
  const transferStations = liveStations.filter(
    (st) => liveLines.filter((l) => l.stationIds.includes(st.id)).length >= 2
  ).length;

  const crowdedStations = liveStations.filter((s) => s.congestionLoad > 0.85);
  const lowFreqLines = liveLines.filter((l) => l.stationIds.length >= 3 && l.headwayMin > 10);

  const month = Math.min(12, Math.floor((day - 1) / 30) + 1);

  const seriesValues =
    chartMetric === 'ridership'
      ? [...history.map((h) => h.dailyRidership), stats.dailyRidership]
      : chartMetric === 'share'
      ? [...history.map((h) => h.modeSharePct), stats.modeSharePercent]
      : [...history.map((h) => h.satisfaction), stats.satisfaction];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="w-full max-w-6xl h-[86vh] bg-white border border-slate-200 rounded-xl shadow-xl flex overflow-hidden text-slate-900">
        {/* Left Navigation Sidebar */}
        <aside className="w-52 shrink-0 bg-slate-50 border-r border-slate-200 p-4 flex flex-col justify-between">
          <div className="space-y-6">
            <div>
              <div className="text-base font-bold text-slate-900">{t(lang, 'metroCore')}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {lang === 'en' ? 'Network Operations Center' : '線網管理系統'}
              </div>
            </div>

            <nav className="space-y-1">
              {(
                [
                  { id: 'overview', label: t(lang, 'mcOverview'), count: null },
                  { id: 'lines', label: t(lang, 'mcLines'), count: liveLines.length },
                  { id: 'stations', label: t(lang, 'mcStations'), count: liveStations.length },
                  { id: 'fleet', label: t(lang, 'mcFleet'), count: totalTrains },
                  { id: 'fares', label: t(lang, 'mcFares'), count: null },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`w-full px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                    tab === item.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.count !== null && (
                    <span
                      className={`font-mono-tabular text-[11px] ${
                        tab === item.id ? 'text-slate-300' : 'text-slate-400'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          <div className="space-y-3">
            <div
              className={`text-xs flex items-center gap-1.5 font-medium ${
                crowdedStations.length === 0 ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{crowdedStations.length === 0 ? t(lang, 'networkSmooth') : `${crowdedStations.length} alerts`}</span>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2 px-3 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-xs font-medium text-slate-800 transition-colors"
            >
              {t(lang, 'backToCity')}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden bg-white">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              {tab === 'overview' && t(lang, 'mcOverview')}
              {tab === 'lines' && t(lang, 'mcLines')}
              {tab === 'stations' && t(lang, 'mcStations')}
              {tab === 'fleet' && t(lang, 'mcFleet')}
              {tab === 'fares' && t(lang, 'mcFares')}
            </h2>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500 font-mono-tabular">
                {map.name} · {year}/{month}
              </span>
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-6 overflow-y-auto flex-1 space-y-5 bg-slate-50/40">
            {tab === 'overview' && (
              <>
                {/* 6 KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                    <div className="text-[11px] text-slate-500 font-medium">{t(lang, 'dailyRidership')}</div>
                    <div className="text-xl font-bold font-mono-tabular text-slate-900 mt-1">
                      {formatRidershipWan(stats.dailyRidership, lang)}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                    <div className="text-[11px] text-slate-500 font-medium">{t(lang, 'metroShare')}</div>
                    <div className="text-xl font-bold font-mono-tabular text-slate-900 mt-1">
                      {stats.modeSharePercent.toFixed(1)}%
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                    <div className="text-[11px] text-slate-500 font-medium">{t(lang, 'satisfaction')}</div>
                    <div className="text-xl font-bold font-mono-tabular text-emerald-700 mt-1">
                      {stats.satisfaction}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                    <div className="text-[11px] text-slate-500 font-medium">{t(lang, 'lines')}</div>
                    <div className="text-xl font-bold font-mono-tabular text-slate-900 mt-1">
                      {liveLines.length}
                    </div>
                    <div className="text-[10px] font-mono-tabular text-slate-500">
                      {totalKm.toFixed(1)} km
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                    <div className="text-[11px] text-slate-500 font-medium">{t(lang, 'stations')}</div>
                    <div className="text-xl font-bold font-mono-tabular text-slate-900 mt-1">
                      {liveStations.length}
                    </div>
                    <div className="text-[10px] font-mono-tabular text-slate-500">
                      {transferStations} {t(lang, 'legendTransfer')}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                    <div className="text-[11px] text-slate-500 font-medium">{t(lang, 'trains')}</div>
                    <div className="text-xl font-bold font-mono-tabular text-slate-900 mt-1">
                      {totalTrains}
                    </div>
                  </div>
                </div>

                {/* Mini Line Preview + Trend Chart */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900">{t(lang, 'linePreview')}</span>
                      <span className="text-slate-500 font-mono-tabular">
                        {liveLines.length} {t(lang, 'lines')}
                      </span>
                    </div>
                    <svg viewBox={`0 0 ${map.width} ${map.height}`} className="w-full h-52 rounded-lg bg-[#F4F6F9] border border-slate-200">
                      {map.rivers.map((rv) => (
                        <polyline
                          key={rv.id}
                          fill="none"
                          stroke="#CBE0F0"
                          strokeWidth={rv.width}
                          strokeLinecap="round"
                          points={rv.points.map((p) => `${p.x},${p.y}`).join(' ')}
                        />
                      ))}
                      {liveLines.map((l) => (
                        <polyline
                          key={l.id}
                          fill="none"
                          stroke={l.color}
                          strokeWidth={14}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={l.stationIds
                            .map((id) => stMap.get(id))
                            .filter((s): s is Station => Boolean(s))
                            .map((s) => `${s.x},${s.y}`)
                            .join(' ')}
                        />
                      ))}
                    </svg>
                  </div>

                  <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900">{t(lang, 'dailyRidership')}</span>
                      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 border border-slate-200 text-[11px]">
                        {(
                          [
                            { id: 'ridership', label: t(lang, 'dailyRidership') },
                            { id: 'share', label: t(lang, 'metroShare') },
                            { id: 'satisfaction', label: t(lang, 'satisfaction') },
                          ] as const
                        ).map((m) => (
                          <button
                            key={m.id}
                            onClick={() => setChartMetric(m.id)}
                            className={`px-2 py-1 rounded-md font-medium whitespace-nowrap transition-colors ${
                              chartMetric === m.id
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-900'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="h-44 flex items-center justify-center">
                      {seriesValues.length < 2 ? (
                        <div className="text-xs text-slate-400">
                          {lang === 'en' ? 'Advance simulation to record trend curve' : '推進時間記錄歷史走勢'}
                        </div>
                      ) : (
                        <svg viewBox="0 0 380 140" className="w-full h-full">
                          {[30, 65, 100].map((y) => (
                            <line key={y} x1="10" y1={y} x2="370" y2={y} stroke="rgba(15,23,42,0.08)" />
                          ))}
                          <polyline
                            fill="none"
                            stroke="#2563EB"
                            strokeWidth="2.5"
                            points={seriesValues
                              .map((v, i) => {
                                const maxV = Math.max(1, ...seriesValues);
                                const x = (i / (seriesValues.length - 1)) * 360 + 10;
                                const y = 125 - (v / maxV) * 105;
                                return `${x},${y}`;
                              })
                              .join(' ')}
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>

                {/* Pending Operational Alerts */}
                <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">{t(lang, 'pendingItems')}</span>
                    <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                      <span>{t(lang, 'autoPopup')}</span>
                      <input
                        type="checkbox"
                        checked={autoAlert}
                        onChange={(e) => setAutoAlert(e.target.checked)}
                        className="accent-blue-600"
                      />
                    </label>
                  </div>

                  {crowdedStations.length === 0 && lowFreqLines.length === 0 ? (
                    <div className="py-5 text-center text-xs text-emerald-700 font-medium flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{t(lang, 'networkSmooth')}</span>
                    </div>
                  ) : (
                    <div className="space-y-2 text-xs">
                      {crowdedStations.map((st) => (
                        <div
                          key={st.id}
                          className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between"
                        >
                          <span className="flex items-center gap-2 text-amber-900 font-medium">
                            <AlertTriangle className="w-4 h-4 text-amber-600" />
                            <span>
                              {st.name} · {Math.round(st.congestionLoad * 100)}% load ({st.waiting.length} waiting)
                            </span>
                          </span>
                          <button
                            onClick={() => {
                              onFocusStation(st);
                              onClose();
                            }}
                            className="px-2.5 py-1 rounded-md bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 font-medium"
                          >
                            {t(lang, 'locateBtn')}
                          </button>
                        </div>
                      ))}
                      {lowFreqLines.map((l) => (
                        <div
                          key={l.id}
                          className="p-3 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-between"
                        >
                          <span className="text-blue-900 font-medium">
                            {l.name} · {l.headwayMin} min headway
                          </span>
                          <button
                            onClick={() => {
                              onSelectLine(l.id);
                              setTab('lines');
                            }}
                            className="px-2.5 py-1 rounded-md bg-white hover:bg-blue-100 border border-blue-300 text-blue-900 font-medium"
                          >
                            {t(lang, 'viewLineBtn')}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {tab === 'lines' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="space-y-2">
                  <button
                    onClick={onCreateLine}
                    className="w-full py-2.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{lang === 'en' ? 'New Transit Line' : '新增營運路線'}</span>
                  </button>
                  {liveLines.map((line) => (
                    <button
                      key={line.id}
                      onClick={() => onSelectLine(line.id)}
                      className={`w-full p-3 rounded-lg border text-left flex items-center justify-between text-xs transition-colors ${
                        activeLine?.id === line.id
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
                      }`}
                    >
                      <span className="flex items-center gap-2 font-semibold truncate">
                        <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: line.color }} />
                        <span className="truncate">{line.name}</span>
                      </span>
                      <span
                        className={`font-mono-tabular ${
                          activeLine?.id === line.id ? 'text-slate-300' : 'text-slate-400'
                        }`}
                      >
                        {line.stationIds.length} · {line.trains.length}
                      </span>
                    </button>
                  ))}
                </div>

                {activeLine && (
                  <div className="lg:col-span-2 p-5 rounded-xl bg-white border border-slate-200 space-y-4">
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={activeLine.name}
                        onChange={(e) => onUpdateLine(activeLine.id, { name: e.target.value })}
                        className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                      {liveLines.length > 1 && (
                        <button
                          onClick={() => onDeleteLine(activeLine.id)}
                          className="p-2 text-slate-500 hover:text-rose-600 rounded-lg bg-slate-50 border border-slate-200 hover:border-rose-200 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {LINE_PALETTE.map((c) => (
                        <button
                          key={c}
                          onClick={() => onUpdateLine(activeLine.id, { color: c })}
                          className={`w-6 h-6 rounded-md transition-transform ${
                            activeLine.color === c
                              ? 'ring-2 ring-slate-900 ring-offset-2 scale-110'
                              : 'opacity-80 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(
                        [
                          { id: 'local', label: lang === 'en' ? 'Local' : '站站停' },
                          { id: 'express', label: lang === 'en' ? 'Express' : '快車跳站' },
                          { id: 'short_turn', label: lang === 'en' ? 'Short-turn' : '區間車' },
                          { id: 'through', label: lang === 'en' ? 'Through' : '貫通運轉' },
                        ] as { id: ServiceMode; label: string }[]
                      ).map((m) => (
                        <button
                          key={m.id}
                          onClick={() => onUpdateLine(activeLine.id, { serviceMode: m.id })}
                          className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                            activeLine.serviceMode === m.id
                              ? 'bg-slate-900 border-slate-900 text-white'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

                    {activeLine.serviceMode === 'through' && (
                      <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 space-y-1.5 text-xs">
                        <label className="flex items-center gap-1.5 text-blue-900 font-semibold">
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                          <span>{lang === 'en' ? 'Through-Service Target Line' : '直通聯運目標路線'}</span>
                        </label>
                        <select
                          value={activeLine.throughTargetLineId ?? ''}
                          onChange={(e) =>
                            onUpdateLine(activeLine.id, { throughTargetLineId: e.target.value || null })
                          }
                          className="w-full bg-white border border-blue-200 rounded-md px-2.5 py-2 text-xs text-slate-900"
                        >
                          <option value="">--</option>
                          {liveLines
                            .filter((l) => l.id !== activeLine.id)
                            .map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-slate-600 font-medium">{lang === 'en' ? 'Headway' : '發車班距'}</span>
                          <span className="font-mono-tabular text-blue-700 font-semibold">{activeLine.headwayMin} min</span>
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={20}
                          value={activeLine.headwayMin}
                          onChange={(e) =>
                            onUpdateLine(activeLine.id, { headwayMin: Number(e.target.value) })
                          }
                          className="w-full accent-blue-600"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-slate-600 font-medium">{lang === 'en' ? 'Train Consist' : '列車編組'}</span>
                          <span className="font-mono-tabular text-blue-700 font-semibold">{activeLine.carCount} cars</span>
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={12}
                          value={activeLine.carCount}
                          onChange={(e) =>
                            onUpdateLine(activeLine.id, { carCount: Number(e.target.value) })
                          }
                          className="w-full accent-blue-600"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'stations' && (
              <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="text-slate-500 bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">{t(lang, 'stations')}</th>
                      <th className="py-2.5 px-3 font-semibold">{lang === 'en' ? 'Tier' : '規模'}</th>
                      <th className="py-2.5 px-3 font-semibold">{lang === 'en' ? 'Elevation' : '標高'}</th>
                      <th className="py-2.5 px-3 font-semibold">{lang === 'en' ? 'Waiting / Load' : '候車 / 負荷'}</th>
                      <th className="py-2.5 px-3 text-right font-semibold">{lang === 'en' ? 'Actions' : '操作'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono-tabular">
                    {liveStations.map((st) => (
                      <tr key={st.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-sans font-semibold text-slate-900">{st.name}</td>
                        <td className="py-2.5 px-3 text-slate-600">{STATION_CONFIGS[st.size].label}</td>
                        <td className="py-2.5 px-3 text-blue-700">
                          {st.depth} ({st.elevationMeters}m)
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">
                          {st.waiting.length} · {Math.round(st.congestionLoad * 100)}%
                        </td>
                        <td className="py-2.5 px-3 text-right space-x-2">
                          <button
                            onClick={() => onUpgradeStation(st.id, st.size === 'small' ? 'standard' : 'hub')}
                            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium"
                          >
                            +Tier
                          </button>
                          <button
                            onClick={() => {
                              onFocusStation(st);
                              onClose();
                            }}
                            className="px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium"
                          >
                            {t(lang, 'locateBtn')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'fleet' && (
              <div className="space-y-3">
                {liveLines.map((line) => (
                  <div
                    key={line.id}
                    className="p-4 rounded-xl bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: line.color }} />
                      <div>
                        <div className="font-semibold text-slate-900">{line.name}</div>
                        <div className="text-slate-500 font-mono-tabular">
                          {line.trains.length} {t(lang, 'trains')} · {line.carCount} cars · {line.headwayMin} min
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onUpdateLine(line.id, { carCount: Math.max(2, line.carCount - 2) })}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium"
                      >
                        -2 Cars
                      </button>
                      <button
                        onClick={() => onUpdateLine(line.id, { carCount: Math.min(12, line.carCount + 2) })}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium"
                      >
                        +2 Cars
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'fares' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
                <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4">
                  <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-emerald-600" />
                    <span>{lang === 'en' ? 'Distance-Based Progressive Fare Matrix' : '按里程階梯票價規則'}</span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-slate-600 font-medium">{lang === 'en' ? 'Base Boarding Fare' : '起跳票價'}</span>
                        <span className="font-mono-tabular text-emerald-700 font-bold">¥{farePolicy.baseFare}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={8}
                        value={farePolicy.baseFare}
                        onChange={(e) => onUpdateFarePolicy({ baseFare: Number(e.target.value) })}
                        className="w-full accent-emerald-600"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-slate-600 font-medium">{lang === 'en' ? 'Base Distance (km)' : '起跳包含里程'}</span>
                        <span className="font-mono-tabular text-blue-700 font-semibold">{farePolicy.baseKm} km</span>
                      </div>
                      <input
                        type="range"
                        min={2}
                        max={12}
                        value={farePolicy.baseKm}
                        onChange={(e) => onUpdateFarePolicy({ baseKm: Number(e.target.value) })}
                        className="w-full accent-blue-600"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-slate-600 font-medium">{lang === 'en' ? 'Step Increment Distance (km)' : '每加價 ¥1 里程階梯'}</span>
                        <span className="font-mono-tabular text-blue-700 font-semibold">{farePolicy.stepKm} km</span>
                      </div>
                      <input
                        type="range"
                        min={3}
                        max={15}
                        value={farePolicy.stepKm}
                        onChange={(e) => onUpdateFarePolicy({ stepKm: Number(e.target.value) })}
                        className="w-full accent-blue-600"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-slate-600 font-medium">{lang === 'en' ? 'Maximum Fare Cap' : '單程最高封頂票價'}</span>
                        <span className="font-mono-tabular text-amber-700 font-semibold">¥{farePolicy.maxFare}</span>
                      </div>
                      <input
                        type="range"
                        min={6}
                        max={25}
                        value={farePolicy.maxFare}
                        onChange={(e) => onUpdateFarePolicy({ maxFare: Number(e.target.value) })}
                        className="w-full accent-amber-600"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
                  <div className="text-sm font-semibold text-slate-900">
                    {lang === 'en' ? 'Trip Distance Fare Preview' : '各距離區間實收票價試算'}
                  </div>
                  <div className="space-y-2 font-mono-tabular">
                    {[3, 8, 15, 25, 40].map((km) => (
                      <div
                        key={km}
                        className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between"
                      >
                        <span className="text-slate-700">{km} km</span>
                        <span className="text-emerald-700 font-bold">
                          ¥{computeProgressiveFare(km, farePolicy)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
