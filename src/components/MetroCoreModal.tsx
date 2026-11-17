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

  // Pending operational alerts
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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-6xl h-[86vh] bg-[#0B1320]/95 border border-white/12 rounded-2xl shadow-2xl flex overflow-hidden">
        {/* Left Navigation Sidebar */}
        <aside className="w-52 shrink-0 bg-[#080F1A] border-r border-white/10 p-4 flex flex-col justify-between">
          <div className="space-y-6">
            <div>
              <div className="text-base font-bold text-slate-100">{t(lang, 'metroCore')}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
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
                  className={`w-full px-3 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between transition-colors ${
                    tab === item.id
                      ? 'bg-white/12 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.count !== null && (
                    <span className="font-mono-tabular text-[11px] text-slate-400">{item.count}</span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          <div className="space-y-3">
            <div className="text-xs flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{crowdedStations.length === 0 ? t(lang, 'networkSmooth') : `${crowdedStations.length} alerts`}</span>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 px-3 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 text-xs font-medium text-slate-200"
            >
              {t(lang, 'backToCity')}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-100">
              {tab === 'overview' && t(lang, 'mcOverview')}
              {tab === 'lines' && t(lang, 'mcLines')}
              {tab === 'stations' && t(lang, 'mcStations')}
              {tab === 'fleet' && t(lang, 'mcFleet')}
              {tab === 'fares' && t(lang, 'mcFares')}
            </h2>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-400 font-mono-tabular">
                {map.name} · {year}/{month}
              </span>
              <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-6 overflow-y-auto flex-1 space-y-5">
            {tab === 'overview' && (
              <>
                {/* 6 KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/8">
                    <div className="text-[11px] text-slate-400">{t(lang, 'dailyRidership')}</div>
                    <div className="text-xl font-bold font-mono-tabular text-slate-100 mt-1">
                      {formatRidershipWan(stats.dailyRidership, lang)}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/8">
                    <div className="text-[11px] text-slate-400">{t(lang, 'metroShare')}</div>
                    <div className="text-xl font-bold font-mono-tabular text-slate-100 mt-1">
                      {stats.modeSharePercent.toFixed(1)}%
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/8">
                    <div className="text-[11px] text-slate-400">{t(lang, 'satisfaction')}</div>
                    <div className="text-xl font-bold font-mono-tabular text-emerald-400 mt-1">
                      {stats.satisfaction}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/8">
                    <div className="text-[11px] text-slate-400">{t(lang, 'lines')}</div>
                    <div className="text-xl font-bold font-mono-tabular text-slate-100 mt-1">
                      {liveLines.length}
                    </div>
                    <div className="text-[10px] font-mono-tabular text-slate-500">
                      {totalKm.toFixed(1)} km
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/8">
                    <div className="text-[11px] text-slate-400">{t(lang, 'stations')}</div>
                    <div className="text-xl font-bold font-mono-tabular text-slate-100 mt-1">
                      {liveStations.length}
                    </div>
                    <div className="text-[10px] font-mono-tabular text-slate-500">
                      {transferStations} {t(lang, 'legendTransfer')}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/8">
                    <div className="text-[11px] text-slate-400">{t(lang, 'trains')}</div>
                    <div className="text-xl font-bold font-mono-tabular text-slate-100 mt-1">
                      {totalTrains}
                    </div>
                  </div>
                </div>

                {/* Mini Line Preview + Trend Chart */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/8 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200">{t(lang, 'linePreview')}</span>
                      <span className="text-slate-400 font-mono-tabular">
                        {liveLines.length} {t(lang, 'lines')}
                      </span>
                    </div>
                    <svg viewBox={`0 0 ${map.width} ${map.height}`} className="w-full h-52 rounded-xl bg-[#0D1624]">
                      {map.rivers.map((rv) => (
                        <polyline
                          key={rv.id}
                          fill="none"
                          stroke="#1A3A57"
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

                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/8 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200">{t(lang, 'dailyRidership')}</span>
                      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-900 border border-white/10 text-[11px]">
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
                            className={`px-2 py-1 rounded-md ${
                              chartMetric === m.id ? 'bg-white/15 text-white' : 'text-slate-400'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="h-44 flex items-center justify-center">
                      {seriesValues.length < 2 ? (
                        <div className="text-xs text-slate-500">
                          {lang === 'en' ? 'Advance simulation to record trend curve' : '推進時間記錄歷史走勢'}
                        </div>
                      ) : (
                        <svg viewBox="0 0 380 140" className="w-full h-full">
                          <polyline
                            fill="none"
                            stroke="#38BDF8"
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
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/8 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-100">{t(lang, 'pendingItems')}</span>
                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                      <span>{t(lang, 'autoPopup')}</span>
                      <input
                        type="checkbox"
                        checked={autoAlert}
                        onChange={(e) => setAutoAlert(e.target.checked)}
                        className="accent-sky-400"
                      />
                    </label>
                  </div>

                  {crowdedStations.length === 0 && lowFreqLines.length === 0 ? (
                    <div className="py-5 text-center text-xs text-emerald-400 flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{t(lang, 'networkSmooth')}</span>
                    </div>
                  ) : (
                    <div className="space-y-2 text-xs">
                      {crowdedStations.map((st) => (
                        <div
                          key={st.id}
                          className="p-3 rounded-xl bg-amber-500/10 border border-amber-400/25 flex items-center justify-between"
                        >
                          <span className="flex items-center gap-2 text-amber-200">
                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                            <span>
                              {st.name} · {Math.round(st.congestionLoad * 100)}% load ({st.waiting.length} waiting)
                            </span>
                          </span>
                          <button
                            onClick={() => {
                              onFocusStation(st);
                              onClose();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                          >
                            {t(lang, 'locateBtn')}
                          </button>
                        </div>
                      ))}
                      {lowFreqLines.map((l) => (
                        <div
                          key={l.id}
                          className="p-3 rounded-xl bg-sky-500/10 border border-sky-400/25 flex items-center justify-between"
                        >
                          <span className="text-sky-200">
                            {l.name} · {l.headwayMin} min headway
                          </span>
                          <button
                            onClick={() => {
                              onSelectLine(l.id);
                              setTab('lines');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white"
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
                    className="w-full py-2.5 px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{lang === 'en' ? 'New Transit Line' : '新增營運路線'}</span>
                  </button>
                  {liveLines.map((line) => (
                    <button
                      key={line.id}
                      onClick={() => onSelectLine(line.id)}
                      className={`w-full p-3 rounded-xl border text-left flex items-center justify-between text-xs ${
                        activeLine?.id === line.id
                          ? 'bg-white/12 border-sky-400 text-white'
                          : 'bg-slate-950/50 border-white/8 text-slate-300 hover:border-white/20'
                      }`}
                    >
                      <span className="flex items-center gap-2 font-semibold truncate">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: line.color }} />
                        <span className="truncate">{line.name}</span>
                      </span>
                      <span className="font-mono-tabular text-slate-400">
                        {line.stationIds.length} · {line.trains.length}
                      </span>
                    </button>
                  ))}
                </div>

                {activeLine && (
                  <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-950/60 border border-white/8 space-y-4">
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={activeLine.name}
                        onChange={(e) => onUpdateLine(activeLine.id, { name: e.target.value })}
                        className="flex-1 bg-slate-900 border border-white/15 rounded-xl px-3 py-2 text-sm font-semibold text-white"
                      />
                      {liveLines.length > 1 && (
                        <button
                          onClick={() => onDeleteLine(activeLine.id)}
                          className="p-2 text-slate-400 hover:text-rose-400 rounded-xl bg-slate-900 border border-white/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {LINE_PALETTE.map((c) => (
                        <button
                          key={c}
                          onClick={() => onUpdateLine(activeLine.id, { color: c })}
                          className={`w-6 h-6 rounded-full ${
                            activeLine.color === c ? 'ring-2 ring-white scale-110' : 'opacity-75'
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
                          className={`py-2 px-3 rounded-xl text-xs font-medium border ${
                            activeLine.serviceMode === m.id
                              ? 'bg-sky-500/25 border-sky-400 text-white'
                              : 'bg-slate-900/60 border-white/10 text-slate-300'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

                    {activeLine.serviceMode === 'through' && (
                      <div className="p-3 rounded-xl bg-sky-950/40 border border-sky-400/30 space-y-1.5 text-xs">
                        <label className="flex items-center gap-1.5 text-sky-200 font-medium">
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                          <span>{lang === 'en' ? 'Through-Service Target Line' : '直通聯運目標路線'}</span>
                        </label>
                        <select
                          value={activeLine.throughTargetLineId ?? ''}
                          onChange={(e) =>
                            onUpdateLine(activeLine.id, { throughTargetLineId: e.target.value || null })
                          }
                          className="w-full bg-slate-950 border border-white/15 rounded-lg px-2.5 py-2 text-xs text-white"
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
                          <span className="text-slate-300">{lang === 'en' ? 'Headway' : '發車班距'}</span>
                          <span className="font-mono-tabular text-sky-300">{activeLine.headwayMin} min</span>
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={20}
                          value={activeLine.headwayMin}
                          onChange={(e) =>
                            onUpdateLine(activeLine.id, { headwayMin: Number(e.target.value) })
                          }
                          className="w-full accent-sky-400"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-slate-300">{lang === 'en' ? 'Train Consist' : '列車編組'}</span>
                          <span className="font-mono-tabular text-sky-300">{activeLine.carCount} cars</span>
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={12}
                          value={activeLine.carCount}
                          onChange={(e) =>
                            onUpdateLine(activeLine.id, { carCount: Number(e.target.value) })
                          }
                          className="w-full accent-sky-400"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'stations' && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-slate-400 border-b border-white/10">
                    <tr>
                      <th className="py-2.5 px-3">{t(lang, 'stations')}</th>
                      <th className="py-2.5 px-3">{lang === 'en' ? 'Tier' : '規模'}</th>
                      <th className="py-2.5 px-3">{lang === 'en' ? 'Elevation' : '標高'}</th>
                      <th className="py-2.5 px-3">{lang === 'en' ? 'Waiting / Load' : '候車 / 負荷'}</th>
                      <th className="py-2.5 px-3 text-right">{lang === 'en' ? 'Actions' : '操作'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono-tabular">
                    {liveStations.map((st) => (
                      <tr key={st.id} className="hover:bg-white/4">
                        <td className="py-2.5 px-3 font-sans font-semibold text-slate-100">{st.name}</td>
                        <td className="py-2.5 px-3 text-slate-300">{STATION_CONFIGS[st.size].label}</td>
                        <td className="py-2.5 px-3 text-sky-300">
                          {st.depth} ({st.elevationMeters}m)
                        </td>
                        <td className="py-2.5 px-3">
                          {st.waiting.length} · {Math.round(st.congestionLoad * 100)}%
                        </td>
                        <td className="py-2.5 px-3 text-right space-x-2">
                          <button
                            onClick={() => onUpgradeStation(st.id, st.size === 'small' ? 'standard' : 'hub')}
                            className="px-2 py-1 rounded bg-white/8 hover:bg-white/15 text-slate-200"
                          >
                            +Tier
                          </button>
                          <button
                            onClick={() => {
                              onFocusStation(st);
                              onClose();
                            }}
                            className="px-2 py-1 rounded bg-sky-500/20 text-sky-300 hover:bg-sky-500/30"
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
                    className="p-4 rounded-xl bg-slate-950/60 border border-white/8 flex flex-wrap items-center justify-between gap-4 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: line.color }} />
                      <div>
                        <div className="font-semibold text-slate-100">{line.name}</div>
                        <div className="text-slate-400 font-mono-tabular">
                          {line.trains.length} {t(lang, 'trains')} · {line.carCount} cars · {line.headwayMin} min
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => onUpdateLine(line.id, { carCount: Math.max(2, line.carCount - 2) })}
                        className="px-2.5 py-1 rounded-lg bg-white/8 hover:bg-white/15"
                      >
                        -2 Cars
                      </button>
                      <button
                        onClick={() => onUpdateLine(line.id, { carCount: Math.min(12, line.carCount + 2) })}
                        className="px-2.5 py-1 rounded-lg bg-white/8 hover:bg-white/15"
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
                <div className="p-5 rounded-2xl bg-slate-950/60 border border-white/8 space-y-4">
                  <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-emerald-400" />
                    <span>{lang === 'en' ? 'Distance-Based Progressive Fare Matrix' : '按里程階梯票價規則'}</span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-slate-300">{lang === 'en' ? 'Base Boarding Fare' : '起跳票價'}</span>
                        <span className="font-mono-tabular text-emerald-400 font-bold">¥{farePolicy.baseFare}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={8}
                        value={farePolicy.baseFare}
                        onChange={(e) => onUpdateFarePolicy({ baseFare: Number(e.target.value) })}
                        className="w-full accent-emerald-400"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-slate-300">{lang === 'en' ? 'Base Distance (km)' : '起跳包含里程'}</span>
                        <span className="font-mono-tabular text-sky-300">{farePolicy.baseKm} km</span>
                      </div>
                      <input
                        type="range"
                        min={2}
                        max={12}
                        value={farePolicy.baseKm}
                        onChange={(e) => onUpdateFarePolicy({ baseKm: Number(e.target.value) })}
                        className="w-full accent-sky-400"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-slate-300">{lang === 'en' ? 'Step Increment Distance (km)' : '每加價 ¥1 里程階梯'}</span>
                        <span className="font-mono-tabular text-sky-300">{farePolicy.stepKm} km</span>
                      </div>
                      <input
                        type="range"
                        min={3}
                        max={15}
                        value={farePolicy.stepKm}
                        onChange={(e) => onUpdateFarePolicy({ stepKm: Number(e.target.value) })}
                        className="w-full accent-sky-400"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-slate-300">{lang === 'en' ? 'Maximum Fare Cap' : '單程最高封頂票價'}</span>
                        <span className="font-mono-tabular text-amber-300">¥{farePolicy.maxFare}</span>
                      </div>
                      <input
                        type="range"
                        min={6}
                        max={25}
                        value={farePolicy.maxFare}
                        onChange={(e) => onUpdateFarePolicy({ maxFare: Number(e.target.value) })}
                        className="w-full accent-amber-400"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-slate-950/60 border border-white/8 space-y-3">
                  <div className="text-sm font-semibold text-slate-100">
                    {lang === 'en' ? 'Trip Distance Fare Preview' : '各距離區間實收票價試算'}
                  </div>
                  <div className="space-y-2 font-mono-tabular">
                    {[3, 8, 15, 25, 40].map((km) => (
                      <div
                        key={km}
                        className="p-2.5 rounded-xl bg-white/4 flex items-center justify-between"
                      >
                        <span className="text-slate-300">{km} km</span>
                        <span className="text-emerald-400 font-bold">
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
