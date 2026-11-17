import React, { useMemo, useState } from 'react';
import {
  Play,
  Pause,
  Coins,
  Users,
  TrainFront,
  CarFront,
  Map as MapIcon,
  FileText,
  Volume2,
  VolumeX,
  Home,
  Layers,
  Box,
  ArrowUpDown,
  Plus,
  Minus,
  Compass,
  MousePointer2,
  MapPin,
  Spline,
  Trash2,
  Smile,
  Cpu,
  X,
  Zap,
  CalendarPlus,
  Search,
  BarChart3,
  Network,
  Undo2,
  Redo2,
  Check,
  AlertTriangle,
  Globe,
} from 'lucide-react';
import {
  CityMap,
  DEPTH_LEVELS,
  DifficultyConfig,
  ElevationMode,
  FarePolicy,
  Language,
  LayerVisibility,
  SimulationStats,
  Station,
  StationSize,
  STATION_CONFIGS,
  ToolMode,
  TrackDepth,
  TransitLine,
} from '../types/game';
import { getDistrictUnlockCost, getTimeOfDayDemand } from '../engine/simulation';
import { OpenMapStyleId } from '../engine/geo';
import { formatCurrencyWan, formatPop, LANG_LABELS, t } from '../i18n/translations';
import { ActiveKpiPopover, KpiPopovers } from './KpiPopovers';

interface FloatingHudProps {
  lang: Language;
  onChangeLang: (l: Language) => void;
  map: CityMap;
  difficulty: DifficultyConfig;
  gameMinutesOfDay: number;
  day: number;
  year: number;
  speed: 0 | 1 | 2 | 4;
  onChangeSpeed: (s: 0 | 1 | 2 | 4) => void;
  onAdvanceMonth: () => void;
  money: number;
  stats: SimulationStats;
  farePolicy: FarePolicy;
  monthlyCapexWan: number;
  tool: ToolMode;
  onSelectTool: (t: ToolMode) => void;
  stationSize: StationSize;
  onSelectStationSize: (s: StationSize) => void;
  elevationMode: ElevationMode;
  onSelectElevationMode: (m: ElevationMode) => void;
  activeDepth: TrackDepth;
  onSelectDepth: (d: TrackDepth) => void;
  draftMode: boolean;
  onToggleDraftMode: () => void;
  draftCount: number;
  draftCostWan: number;
  draftWarnings: number;
  canUndoDraft: boolean;
  canRedoDraft: boolean;
  onUndoDraft: () => void;
  onRedoDraft: () => void;
  onDiscardDraft: () => void;
  onConfirmDraft: () => void;
  lines: TransitLine[];
  stations: Station[];
  activeLineId: string;
  onSelectLine: (id: string) => void;
  onCreateLine: () => void;
  selectedStation: Station | null;
  onClearSelectedStation: () => void;
  onUpdateStation: (id: string, patch: Partial<Station>) => void;
  onUpgradeStation: (id: string, newSize: StationSize) => void;
  onDeleteStation: (id: string) => void;
  layers: LayerVisibility;
  onToggleLayer: (key: keyof Omit<LayerVisibility, 'depthFilter'>) => void;
  onChangeDepthFilter: (df: 'ALL' | TrackDepth) => void;
  openMapStyle: OpenMapStyleId;
  onChangeOpenMapStyle: (s: OpenMapStyleId) => void;
  is25D: boolean;
  onToggle25D: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onSearchJump: (wx: number, wy: number, label: string) => void;
  trackStartStationName: string | null;
  hasTrackWaypoint: boolean;
  onCancelTrackDraw: () => void;
  muted: boolean;
  onToggleMute: () => void;
  onOpenSetup: () => void;
  onOpenGdd: () => void;
  onReturnTitle: () => void;
  onOpenCityStats: () => void;
  onOpenNetworkMap: () => void;
  onOpenMetroCore: (tab?: 'overview' | 'lines' | 'stations' | 'fleet' | 'fares') => void;
  onOpenMetroCircle: () => void;
  unreadCircleCount: number;
}

const glassIsland =
  'bg-[#0A1322]/85 backdrop-blur-xl border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.55)]';

export const FloatingHud: React.FC<FloatingHudProps> = ({
  lang,
  onChangeLang,
  map,
  difficulty,
  gameMinutesOfDay,
  day,
  year,
  speed,
  onChangeSpeed,
  onAdvanceMonth,
  money,
  stats,
  farePolicy,
  monthlyCapexWan,
  tool,
  onSelectTool,
  stationSize,
  onSelectStationSize,
  elevationMode,
  onSelectElevationMode,
  activeDepth,
  onSelectDepth,
  draftMode,
  onToggleDraftMode,
  draftCount,
  draftCostWan,
  draftWarnings,
  canUndoDraft,
  canRedoDraft,
  onUndoDraft,
  onRedoDraft,
  onDiscardDraft,
  onConfirmDraft,
  lines,
  stations,
  activeLineId,
  onSelectLine,
  onCreateLine,
  selectedStation,
  onClearSelectedStation,
  onUpdateStation,
  onUpgradeStation,
  onDeleteStation,
  layers,
  onToggleLayer,
  onChangeDepthFilter,
  openMapStyle,
  onChangeOpenMapStyle,
  is25D,
  onToggle25D,
  onZoomIn,
  onZoomOut,
  onResetView,
  onSearchJump,
  trackStartStationName,
  hasTrackWaypoint,
  onCancelTrackDraw,
  muted,
  onToggleMute,
  onOpenSetup,
  onOpenGdd,
  onReturnTitle,
  onOpenCityStats,
  onOpenNetworkMap,
  onOpenMetroCore,
  onOpenMetroCircle,
  unreadCircleCount,
}) => {
  const [openDrawer, setOpenDrawer] = useState<'none' | 'layers' | 'depth' | 'search' | 'lang'>(
    'none'
  );
  const [activeKpi, setActiveKpi] = useState<ActiveKpiPopover>('none');
  const [searchQuery, setSearchQuery] = useState('');

  const hours = Math.floor(gameMinutesOfDay / 60) % 24;
  const mins = Math.floor(gameMinutesOfDay % 60);
  const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  const demand = getTimeOfDayDemand(gameMinutesOfDay);
  const month = Math.min(12, Math.floor((day - 1) / 30) + 1);
  const dayOfMonth = ((day - 1) % 30) + 1;
  const dayProgress = gameMinutesOfDay / 1440;

  const liveLines = lines.filter((l) => !l.isDraft);
  const eraTitle = liveLines.every((l) => l.stationIds.length < 2)
    ? t(lang, 'eraNoMetro')
    : liveLines.length === 1
    ? t(lang, 'eraSingleLine')
    : t(lang, 'eraNetwork');

  const congestionStatus =
    stats.congestionIndex < 1.35
      ? { label: t(lang, 'smooth'), cls: 'text-emerald-400' }
      : stats.congestionIndex < 1.85
      ? { label: t(lang, 'moderate'), cls: 'text-amber-300' }
      : stats.congestionIndex < 2.25
      ? { label: t(lang, 'congested'), cls: 'text-orange-400' }
      : { label: t(lang, 'severe'), cls: 'text-rose-400' };

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list: { id: string; label: string; kind: string; x: number; y: number }[] = [];
    for (const s of stations) {
      if (!q || s.name.toLowerCase().includes(q)) {
        list.push({ id: `s_${s.id}`, label: s.name, kind: t(lang, 'stations'), x: s.x, y: s.y });
      }
    }
    for (const p of map.pois || []) {
      if (!q || p.name.toLowerCase().includes(q)) {
        list.push({ id: `p_${p.id}`, label: p.name, kind: 'POI', x: p.x, y: p.y });
      }
    }
    for (const d of map.districts) {
      if (!q || d.name.toLowerCase().includes(q)) {
        const kindLabel = d.isStarter
          ? lang === 'en'
            ? 'Spawn Point'
            : '開局出生點'
          : d.unlocked
          ? lang === 'en'
            ? 'Unlocked'
            : '已解鎖地區'
          : `🔒 ${formatCurrencyWan(getDistrictUnlockCost(d, difficulty), lang)}`;
        list.push({ id: `d_${d.id}`, label: d.name, kind: kindLabel, x: d.x, y: d.y });
      }
    }
    return list.slice(0, 10);
  }, [searchQuery, stations, map.pois, map.districts, difficulty, lang]);

  return (
    <>
      {/* TOP-LEFT FLOATING TIME & ERA ISLAND */}
      <div
        className={`fixed top-4 left-4 z-30 ${glassIsland} rounded-2xl px-3.5 py-2.5 flex items-center gap-4`}
      >
        <div className="relative w-10 h-10 shrink-0 flex items-center justify-center">
          <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
            <circle
              cx="18"
              cy="18"
              r="14"
              fill="none"
              stroke="rgba(148,163,184,0.18)"
              strokeWidth="3"
            />
            <circle
              cx="18"
              cy="18"
              r="14"
              fill="none"
              stroke={hours >= 6 && hours < 19 ? '#38BDF8' : '#818CF8'}
              strokeWidth="3"
              strokeDasharray={`${dayProgress * 88} 88`}
              strokeLinecap="round"
            />
          </svg>
          <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-emerald-400 to-sky-400 opacity-90" />
        </div>

        <div className="min-w-[155px]">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <span>{map.name}</span>
            <span>·</span>
            <span className="text-sky-300">{demand.periodLabel}</span>
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-sm font-bold text-slate-100 font-mono-tabular">
              {year}年{month}月{dayOfMonth}日
            </span>
            <span className="text-xs font-mono-tabular text-slate-300">{timeStr}</span>
          </div>
        </div>

        <div className="h-8 w-px bg-white/10 hidden sm:block" />

        <div className="hidden md:flex flex-col justify-center min-w-[98px]">
          <div className="text-[10px] text-slate-400 font-mono-tabular">
            {year}–{year + 3}
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-300 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>{eraTitle}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-slate-950/60 border border-white/10 rounded-xl p-1">
          <button
            onClick={() => onChangeSpeed(speed === 0 ? 1 : 0)}
            title={speed === 0 ? t(lang, 'resume') : t(lang, 'paused')}
            className={`w-8 h-7 rounded-lg flex items-center justify-center transition-colors ${
              speed === 0
                ? 'bg-amber-500 text-slate-950'
                : 'bg-sky-500/20 text-sky-300 hover:bg-sky-500/30'
            }`}
          >
            {speed === 0 ? (
              <Play className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Pause className="w-3.5 h-3.5" />
            )}
          </button>
          {([1, 2, 4] as const).map((s) => (
            <button
              key={s}
              onClick={() => onChangeSpeed(s)}
              className={`px-2 h-7 rounded-lg text-xs font-mono-tabular font-medium transition-colors ${
                speed === s ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {s}x
            </button>
          ))}
          <button
            onClick={onAdvanceMonth}
            className="px-2 h-7 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 flex items-center gap-1 transition-colors"
          >
            <CalendarPlus className="w-3 h-3 text-sky-400" />
            <span>{t(lang, 'advanceMonth')}</span>
          </button>
        </div>
      </div>

      {/* TOP-CENTER PAUSE INDICATOR */}
      {speed === 0 && (
        <div
          onClick={() => onChangeSpeed(1)}
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-30 ${glassIsland} rounded-full px-4 py-1.5 flex items-center gap-2.5 text-xs cursor-pointer hover:border-amber-400/50 transition-colors`}
        >
          <span className="text-amber-300 font-semibold">⏸ {t(lang, 'paused')}</span>
          <span className="px-1.5 py-0.5 rounded bg-white/10 text-slate-300 font-mono-tabular text-[10px]">
            {t(lang, 'space')}
          </span>
          <span className="text-slate-400">{t(lang, 'resume')}</span>
        </div>
      )}

      {/* TOP-RIGHT INTERACTIVE KPI TELEMETRY & UTILITY ISLANDS */}
      <div className="fixed top-4 right-4 z-30 flex items-center gap-2.5">
        <div className={`hidden xl:flex ${glassIsland} rounded-2xl p-1.5 items-center gap-1`}>
          {/* 1. Funds / Finance KPI */}
          <button
            onClick={() => setActiveKpi(activeKpi === 'finance' ? 'none' : 'finance')}
            className={`px-3 py-1 rounded-xl flex items-center gap-2.5 text-left transition-colors ${
              activeKpi === 'finance' ? 'bg-amber-500/15 ring-1 ring-amber-400/40' : 'hover:bg-white/6'
            }`}
          >
            <div className="w-7 h-7 rounded-full bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300">
              <Coins className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400">{t(lang, 'funds')}</div>
              <div className="text-sm font-bold font-mono-tabular text-slate-100">
                {formatCurrencyWan(money, lang)}
              </div>
            </div>
          </button>

          <div className="h-7 w-px bg-white/10" />

          {/* 2. Population KPI */}
          <button
            onClick={() => setActiveKpi(activeKpi === 'population' ? 'none' : 'population')}
            className={`px-3 py-1 rounded-xl flex items-center gap-2.5 text-left transition-colors ${
              activeKpi === 'population' ? 'bg-sky-500/15 ring-1 ring-sky-400/40' : 'hover:bg-white/6'
            }`}
          >
            <div className="w-7 h-7 rounded-full bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-300">
              <Users className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400">{t(lang, 'population')}</div>
              <div className="text-sm font-bold font-mono-tabular text-slate-100">
                {formatPop(stats.totalPopulation, lang)}
              </div>
            </div>
          </button>

          <div className="h-7 w-px bg-white/10" />

          {/* 3. Metro Mode Share KPI */}
          <button
            onClick={() => setActiveKpi(activeKpi === 'share' ? 'none' : 'share')}
            className={`px-3 py-1 rounded-xl flex items-center gap-2.5 text-left transition-colors ${
              activeKpi === 'share' ? 'bg-teal-500/15 ring-1 ring-teal-400/40' : 'hover:bg-white/6'
            }`}
          >
            <div className="w-7 h-7 rounded-full bg-teal-500/15 border border-teal-400/30 flex items-center justify-center text-teal-300">
              <TrainFront className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400">{t(lang, 'metroShare')}</div>
              <div className="text-sm font-bold font-mono-tabular text-slate-100">
                {stats.modeSharePercent.toFixed(1)}%
              </div>
            </div>
          </button>

          <div className="h-7 w-px bg-white/10" />

          {/* 4. Congestion Index KPI */}
          <button
            onClick={() => setActiveKpi(activeKpi === 'congestion' ? 'none' : 'congestion')}
            className={`px-3 py-1 rounded-xl flex items-center gap-2.5 text-left transition-colors ${
              activeKpi === 'congestion'
                ? 'bg-emerald-500/15 ring-1 ring-emerald-400/40'
                : 'hover:bg-white/6'
            }`}
          >
            <div className="w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
              <CarFront className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400">{t(lang, 'congestionIdx')}</div>
              <div className="text-sm font-bold font-mono-tabular text-slate-100 flex items-baseline gap-1.5">
                <span>{stats.congestionIndex.toFixed(2)}</span>
                <span className={`text-[11px] font-medium ${congestionStatus.cls}`}>
                  {congestionStatus.label}
                </span>
              </div>
            </div>
          </button>
        </div>

        {/* Utility Action Island */}
        <div className={`${glassIsland} rounded-2xl p-1.5 flex items-center gap-1`}>
          <button
            onClick={() => setOpenDrawer(openDrawer === 'search' ? 'none' : 'search')}
            title={t(lang, 'searchPlaceholder')}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
              openDrawer === 'search'
                ? 'bg-sky-500/25 text-sky-300'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenCityStats}
            title={t(lang, 'cityStats')}
            className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
          >
            <BarChart3 className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenNetworkMap}
            title={t(lang, 'networkMap')}
            className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
          >
            <Network className="w-4 h-4" />
          </button>
          <button
            onClick={() => setOpenDrawer(openDrawer === 'lang' ? 'none' : 'lang')}
            title="語言 / Language"
            className="px-2 h-9 rounded-xl hover:bg-white/10 flex items-center gap-1 text-[11px] font-semibold text-slate-300 hover:text-white transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-sky-400" />
            <span>{LANG_LABELS[lang]}</span>
          </button>
          <button
            onClick={onOpenSetup}
            title="地圖與難度"
            className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
          >
            <MapIcon className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenGdd}
            title="系統設計文件 (GDD)"
            className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
          >
            <FileText className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleMute}
            className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onReturnTitle}
            className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
          >
            <Home className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* INTERACTIVE KPI DRILL-DOWN POPOVER */}
      <KpiPopovers
        active={activeKpi}
        onClose={() => setActiveKpi('none')}
        lang={lang}
        year={year}
        day={day}
        difficulty={difficulty}
        stats={stats}
        farePolicy={farePolicy}
        monthlyCapexWan={monthlyCapexWan}
        layers={layers}
        onToggleLayer={onToggleLayer}
        onOpenMetroCoreFares={() => {
          setActiveKpi('none');
          onOpenMetroCore('fares');
        }}
      />

      {/* SEARCH JUMP POPOVER */}
      {openDrawer === 'search' && (
        <div
          className={`fixed top-18 right-24 z-35 w-80 ${glassIsland} rounded-2xl p-3 space-y-2.5`}
        >
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t(lang, 'searchPlaceholder')}
              className="w-full pl-8 pr-7 py-2 rounded-xl bg-slate-950/70 border border-white/10 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
            />
            <button
              onClick={() => setOpenDrawer('none')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1">
            {searchResults.length === 0 ? (
              <div className="text-xs text-slate-500 py-3 text-center">
                {t(lang, 'noSearchMatch')}
              </div>
            ) : (
              searchResults.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    onSearchJump(item.x, item.y, item.label);
                    setOpenDrawer('none');
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-white/8 text-xs text-slate-200 transition-colors"
                >
                  <span className="truncate font-medium">{item.label}</span>
                  <span className="text-[10px] text-sky-300 shrink-0 ml-2">{item.kind}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* LANGUAGE SWITCHER POPOVER */}
      {openDrawer === 'lang' && (
        <div className={`fixed top-18 right-16 z-35 w-36 ${glassIsland} rounded-2xl p-1.5 space-y-1`}>
          {(['zh-Hant', 'zh-Hans', 'en'] as Language[]).map((l) => (
            <button
              key={l}
              onClick={() => {
                onChangeLang(l);
                setOpenDrawer('none');
              }}
              className={`w-full px-3 py-1.5 rounded-xl text-xs font-medium text-left flex items-center justify-between transition-colors ${
                lang === l ? 'bg-sky-500/25 text-sky-200' : 'text-slate-300 hover:bg-white/8'
              }`}
            >
              <span>{l === 'zh-Hant' ? '繁體中文' : l === 'zh-Hans' ? '简体中文' : 'English'}</span>
              {lang === l && <Check className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
      )}

      {/* BOTTOM-LEFT VERTICAL FLOATING DOCK */}
      <div className="fixed bottom-4 left-4 z-30 flex flex-col gap-3">
        <div className={`${glassIsland} rounded-2xl p-1.5 flex flex-col items-center gap-1 w-13`}>
          <button
            onClick={() => setOpenDrawer(openDrawer === 'layers' ? 'none' : 'layers')}
            className={`w-10 py-2 rounded-xl flex flex-col items-center gap-0.5 text-[10px] transition-colors ${
              openDrawer === 'layers'
                ? 'bg-sky-500/25 text-sky-300'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>{t(lang, 'layers')}</span>
          </button>

          <button
            onClick={onToggle25D}
            title="切換 2.5D 視角 (快捷鍵 T)"
            className={`w-10 py-2 rounded-xl flex flex-col items-center gap-0.5 text-[10px] transition-colors ${
              is25D ? 'bg-sky-500 text-white' : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <Box className="w-4 h-4" />
            <span>2.5D</span>
          </button>

          <button
            onClick={() => setOpenDrawer(openDrawer === 'depth' ? 'none' : 'depth')}
            className={`w-10 py-2 rounded-xl flex flex-col items-center gap-0.5 text-[10px] transition-colors ${
              layers.depthFilter !== 'ALL' || openDrawer === 'depth'
                ? 'bg-sky-500/25 text-sky-300'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <ArrowUpDown className="w-4 h-4" />
            <span>{layers.depthFilter === 'ALL' ? t(lang, 'depthView') : layers.depthFilter}</span>
          </button>

          <div className="w-7 h-px bg-white/10 my-0.5" />

          <button
            onClick={onZoomIn}
            className="w-10 h-8 rounded-xl flex items-center justify-center text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={onZoomOut}
            className="w-10 h-8 rounded-xl flex items-center justify-center text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={onResetView}
            title={t(lang, 'resetView')}
            className="w-10 h-8 rounded-xl flex items-center justify-center text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Compass className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* LEFT-DOCK POPOVER: LAYERS */}
      {openDrawer === 'layers' && (
        <div
          className={`fixed bottom-20 left-20 z-30 w-60 ${glassIsland} rounded-2xl p-3.5 space-y-2`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-200 pb-1 border-b border-white/10">
            <span>{t(lang, 'layers')}</span>
            <button onClick={() => setOpenDrawer('none')} className="text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {[
            { key: 'populationHeatmap' as const, label: '人口與職缺熱區' },
            { key: 'metroCoverageOverlay' as const, label: '地鐵覆蓋與盲區 (綠/紅)' },
            { key: 'zones' as const, label: '都市用地分區' },
            { key: 'catchmentRings' as const, label: '車站步行覆蓋圈' },
            { key: 'congestionOverlay' as const, label: '地面道路飽和度' },
          ].map((item) => (
            <label
              key={item.key}
              className="flex items-center justify-between text-xs text-slate-300 py-1 cursor-pointer hover:text-white"
            >
              <span>{item.label}</span>
              <input
                type="checkbox"
                checked={layers[item.key]}
                onChange={() => onToggleLayer(item.key)}
                className="w-4 h-4 accent-sky-500 rounded"
              />
            </label>
          ))}

          {map.geoBounds && (
            <div className="pt-2 border-t border-white/10 space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-400">地圖底圖樣式</div>
              <div className="grid grid-cols-1 gap-1">
                {(
                  [
                    { id: 'esri_dark_gray' as const, label: 'Esri 深灰底圖 (免金鑰)' },
                    { id: 'canvas_vector' as const, label: '純淨向量河流底圖 (GeoJSON)' },
                  ]
                ).map((stOpt) => (
                  <button
                    key={stOpt.id}
                    onClick={() => onChangeOpenMapStyle(stOpt.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] text-left font-medium transition-colors ${
                      openMapStyle === stOpt.id
                        ? 'bg-sky-500/25 border border-sky-400/50 text-sky-200'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {stOpt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* LEFT-DOCK POPOVER: DEPTH FILTER */}
      {openDrawer === 'depth' && (
        <div
          className={`fixed bottom-20 left-20 z-30 w-52 ${glassIsland} rounded-2xl p-3.5 space-y-2`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-200 pb-1 border-b border-white/10">
            <span>{t(lang, 'depthView')}</span>
            <button onClick={() => setOpenDrawer('none')} className="text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => onChangeDepthFilter('ALL')}
              className={`py-1.5 text-xs rounded-lg font-medium ${
                layers.depthFilter === 'ALL'
                  ? 'bg-sky-500 text-white'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {t(lang, 'allDepth')}
            </button>
            {DEPTH_LEVELS.map((d) => (
              <button
                key={d.id}
                onClick={() => onChangeDepthFilter(d.id)}
                className={`py-1.5 text-xs rounded-lg font-medium ${
                  layers.depthFilter === d.id
                    ? 'bg-sky-500 text-white'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                {d.shortLabel}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* FLOATING DRAFT COMMIT BAR (when draft items exist) */}
      {draftCount > 0 && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-30 ${glassIsland} border-sky-400/35 rounded-2xl px-4 py-2 flex items-center gap-3 ${
            tool === 'station' || tool === 'track' ? 'bottom-40' : 'bottom-24'
          }`}
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-sky-300">
              {t(lang, 'draftItems')} {draftCount} {t(lang, 'itemsSuffix')}
            </span>
            <span className="font-mono-tabular font-bold text-slate-100">
              {formatCurrencyWan(draftCostWan, lang)}
            </span>
            {draftWarnings > 0 && (
              <span className="flex items-center gap-1 text-amber-400 font-mono-tabular">
                <AlertTriangle className="w-3.5 h-3.5" />
                {draftWarnings}
              </span>
            )}
          </div>

          <div className="h-4 w-px bg-white/10" />

          <div className="flex items-center gap-1">
            <button
              onClick={onUndoDraft}
              disabled={!canUndoDraft}
              title={t(lang, 'undo')}
              className="p-1.5 rounded-lg text-slate-300 hover:bg-white/10 disabled:opacity-35"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onRedoDraft}
              disabled={!canRedoDraft}
              title={t(lang, 'redo')}
              className="p-1.5 rounded-lg text-slate-300 hover:bg-white/10 disabled:opacity-35"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={onDiscardDraft}
            className="px-2.5 py-1 rounded-lg bg-white/8 hover:bg-rose-500/20 text-xs text-slate-300 hover:text-rose-200 transition-colors"
          >
            {t(lang, 'discardDraft')}
          </button>

          <button
            onClick={onConfirmDraft}
            className="px-3.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-semibold text-white flex items-center gap-1.5 shadow-lg shadow-sky-500/25 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{t(lang, 'confirmBuild')}</span>
          </button>
        </div>
      )}

      {/* BOTTOM-CENTER CONTEXTUAL TRAY (build station, draw track) */}
      {(tool === 'station' || tool === 'track') && (
        <div
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-30 ${glassIsland} rounded-2xl px-4 py-2 flex flex-col gap-2 max-w-[92vw]`}
        >
          {tool === 'station' && (
            <>
              <div className="flex items-center justify-between gap-4 text-[11px] text-slate-400">
                <span>{t(lang, 'stationHint')}</span>
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white">
                  <input
                    type="checkbox"
                    checked={draftMode}
                    onChange={onToggleDraftMode}
                    className="w-3.5 h-3.5 accent-sky-500 rounded"
                  />
                  <span>{draftMode ? t(lang, 'draftMode') : t(lang, 'instantMode')}</span>
                </label>
              </div>
              <div className="flex items-center gap-3 overflow-x-auto">
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-slate-400 mr-1">{t(lang, 'methodLabel')}:</span>
                  {(
                    [
                      { id: 'underground' as const, label: t(lang, 'underground') },
                      { id: 'ground' as const, label: t(lang, 'ground') },
                      { id: 'elevated' as const, label: t(lang, 'elevated') },
                    ]
                  ).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => onSelectElevationMode(m.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                        elevationMode === m.id
                          ? 'bg-sky-500 text-white'
                          : 'bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {elevationMode === 'underground' && (
                  <div className="flex items-center gap-0.5 bg-slate-950/60 p-0.5 rounded-lg border border-white/8">
                    {DEPTH_LEVELS.filter((d) => d.id !== 'EL').map((d) => (
                      <button
                        key={d.id}
                        onClick={() => onSelectDepth(d.id)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular ${
                          activeDepth === d.id
                            ? 'bg-amber-500/25 text-amber-300'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {d.id}
                      </button>
                    ))}
                  </div>
                )}

                <div className="h-5 w-px bg-white/10 shrink-0" />

                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-slate-400 mr-1">{t(lang, 'scaleLabel')}:</span>
                  {(
                    [
                      { id: 'small' as const, label: t(lang, 'small') },
                      { id: 'standard' as const, label: t(lang, 'medium') },
                      { id: 'hub' as const, label: t(lang, 'large') },
                      { id: 'mall' as const, label: t(lang, 'mega') },
                    ]
                  ).map((sz) => (
                    <button
                      key={sz.id}
                      onClick={() => onSelectStationSize(sz.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                        stationSize === sz.id
                          ? 'bg-sky-500 text-white'
                          : 'bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {sz.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {tool === 'track' && (
            <div className="flex items-center gap-3 overflow-x-auto">
              <div className="flex items-center gap-1.5">
                {lines.map((line) => (
                  <button
                    key={line.id}
                    onClick={() => onSelectLine(line.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                      line.id === activeLineId
                        ? 'bg-white/15 text-white border border-white/25'
                        : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: line.color }}
                    />
                    <span>{line.name}</span>
                  </button>
                ))}
                <button
                  onClick={onCreateLine}
                  className="px-2 py-1.5 rounded-lg text-xs text-sky-300 hover:bg-sky-500/15 flex items-center gap-1 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>新線</span>
                </button>
              </div>
              <div className="h-5 w-px bg-white/10 shrink-0" />
              <div className="flex items-center gap-1">
                {DEPTH_LEVELS.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => onSelectDepth(d.id)}
                    className={`px-2 py-1 rounded-lg text-xs font-mono-tabular whitespace-nowrap transition-colors ${
                      activeDepth === d.id
                        ? 'bg-amber-500/25 text-amber-300 border border-amber-400/40'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {d.shortLabel}
                  </button>
                ))}
              </div>
              <div className="h-5 w-px bg-white/10 shrink-0" />
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-300 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={draftMode}
                  onChange={onToggleDraftMode}
                  className="w-3.5 h-3.5 accent-sky-500 rounded"
                />
                <span>{draftMode ? t(lang, 'draftMode') : t(lang, 'instantMode')}</span>
              </label>
              {trackStartStationName && (
                <>
                  <div className="h-5 w-px bg-white/10 shrink-0" />
                  <div className="flex items-center gap-2 text-xs text-sky-200 whitespace-nowrap">
                    <span>
                      起點: <strong>{trackStartStationName}</strong>
                      {hasTrackWaypoint ? ' (已設彎道)' : ' · 點空地設彎道或點目標站'}
                    </span>
                    <button
                      onClick={onCancelTrackDraw}
                      className="text-rose-300 hover:text-rose-200 underline"
                    >
                      取消
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      )}

      {/* BOTTOM-CENTER PRIMARY ACTION DOCK */}
      <div
        className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-30 ${glassIsland} rounded-2xl p-1.5 flex items-center gap-1`}
      >
        {(
          [
            { id: 'select', label: t(lang, 'select'), icon: <MousePointer2 className="w-4 h-4" /> },
            { id: 'station', label: t(lang, 'station'), icon: <MapPin className="w-4 h-4" /> },
            { id: 'track', label: t(lang, 'track'), icon: <Spline className="w-4 h-4" /> },
            { id: 'demolish', label: t(lang, 'demolish'), icon: <Trash2 className="w-4 h-4" /> },
          ] as { id: ToolMode; label: string; icon: React.ReactNode }[]
        ).map((item) => {
          const active = tool === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTool(item.id)}
              className={`w-16 py-2 rounded-xl flex flex-col items-center justify-center gap-1 text-xs font-medium transition-all ${
                active
                  ? item.id === 'demolish'
                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25'
                    : 'bg-sky-500 text-white shadow-lg shadow-sky-500/25'
                  : 'text-slate-300 hover:text-white hover:bg-white/8'
              }`}
            >
              {item.icon}
              <span className="text-[11px]">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* BOTTOM-RIGHT STATUS CHIPS (MetroCore + MetroCircle) */}
      <div className="fixed bottom-4 right-4 z-30 flex items-center gap-2.5">
        <button
          onClick={() => onOpenMetroCore('overview')}
          className={`${glassIsland} rounded-2xl px-4 py-2.5 flex items-center gap-3 hover:border-sky-400/50 transition-colors`}
        >
          <div className="w-8 h-8 rounded-full bg-sky-500/15 border border-sky-400/35 flex items-center justify-center text-sky-300">
            <Cpu className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="text-[10px] text-slate-400">{t(lang, 'metroCore')}</div>
            <div className="text-sm font-bold font-mono-tabular text-slate-100">
              {liveLines.length} {t(lang, 'linesUnit')}
            </div>
          </div>
        </button>

        <button
          onClick={onOpenMetroCircle}
          className={`relative ${glassIsland} rounded-2xl px-4 py-2.5 flex items-center gap-3 hover:border-emerald-400/50 transition-colors`}
        >
          {unreadCircleCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-mono-tabular font-bold flex items-center justify-center shadow">
              {unreadCircleCount}
            </span>
          )}
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              stats.satisfaction >= 70
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-400/35'
                : stats.satisfaction >= 45
                ? 'bg-amber-500/20 text-amber-400 border border-amber-400/35'
                : 'bg-rose-500/20 text-rose-400 border border-rose-400/35'
            }`}
          >
            <Smile className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="text-[10px] text-slate-400">{t(lang, 'metroCircle')}</div>
            <div className="text-sm font-bold font-mono-tabular text-slate-100">
              {stats.satisfaction}
            </div>
          </div>
        </button>
      </div>

      {/* FLOATING STATION INSPECTOR (Screenshot 4 rich 4-tier scale + elevation meters!) */}
      {selectedStation && (
        <div
          className={`fixed top-20 right-4 z-30 w-88 ${glassIsland} rounded-2xl p-4 space-y-3.5 max-h-[75vh] overflow-y-auto`}
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
            <input
              type="text"
              value={selectedStation.name}
              onChange={(e) => onUpdateStation(selectedStation.id, { name: e.target.value })}
              className="flex-1 bg-slate-950/60 border border-white/15 rounded-lg px-2.5 py-1 text-sm font-semibold text-white focus:outline-none focus:border-sky-400"
            />
            {selectedStation.isDraft && (
              <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-medium">
                {t(lang, 'draftItems')}
              </span>
            )}
            <button
              onClick={() => onDeleteStation(selectedStation.id)}
              title="拆除車站"
              className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-white/10"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClearSelectedStation}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 rounded-xl bg-slate-950/50 border border-white/5">
              <div className="text-[10px] text-slate-400">候車中</div>
              <div className="font-mono-tabular font-bold text-sky-300 mt-0.5">
                {selectedStation.waiting.length}
              </div>
            </div>
            <div className="p-2 rounded-xl bg-slate-950/50 border border-white/5">
              <div className="text-[10px] text-slate-400">吞吐容量</div>
              <div className="font-mono-tabular font-bold text-slate-100 mt-0.5">
                {(STATION_CONFIGS[selectedStation.size].hourlyCapacity / 1000).toFixed(0)}k/時
              </div>
            </div>
            <div className="p-2 rounded-xl bg-slate-950/50 border border-white/5">
              <div className="text-[10px] text-slate-400">最大編組</div>
              <div className="font-mono-tabular font-bold text-slate-100 mt-0.5">
                {STATION_CONFIGS[selectedStation.size].maxCars} 節
              </div>
            </div>
          </div>

          {/* 4-Tier Scale Grid matching Screenshot 4 */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-slate-400">規模等級與造價</span>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(STATION_CONFIGS) as StationSize[]).map((sz) => {
                const cfg = STATION_CONFIGS[sz];
                const active = selectedStation.size === sz;
                return (
                  <button
                    key={sz}
                    onClick={() => onUpgradeStation(selectedStation.id, sz)}
                    className={`p-2 text-left rounded-xl border text-xs transition-colors ${
                      active
                        ? 'bg-sky-500/20 border-sky-400 text-white'
                        : 'bg-slate-950/40 border-white/10 text-slate-300 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span className="truncate">{cfg.label}</span>
                      <span className="text-[10px] font-mono-tabular text-sky-300">
                        {cfg.maxCars}節
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono-tabular mt-0.5">
                      {(cfg.hourlyCapacity / 1000).toFixed(0)}k/h · 維護 {cfg.maintenance}萬/日
                    </div>
                    <div className="text-[10px] text-amber-300 font-mono-tabular">
                      造價 {formatCurrencyWan(cfg.cost, lang)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Station Elevation & Rail Height Meters */}
          <div className="space-y-2 pt-2 border-t border-white/10 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-medium">車站標高方式</span>
              <div className="flex items-center gap-1 bg-slate-950/60 p-0.5 rounded-lg border border-white/10">
                {(
                  [
                    { id: 'underground' as const, label: t(lang, 'underground'), meters: -15, depth: 'B1' as TrackDepth },
                    { id: 'ground' as const, label: t(lang, 'ground'), meters: 0, depth: 'B1' as TrackDepth },
                    { id: 'elevated' as const, label: t(lang, 'elevated'), meters: 10, depth: 'EL' as TrackDepth },
                  ]
                ).map((m) => (
                  <button
                    key={m.id}
                    onClick={() =>
                      onUpdateStation(selectedStation.id, {
                        elevationMode: m.id,
                        elevationMeters: m.meters,
                        depth: m.depth,
                      })
                    }
                    className={`px-2 py-1 rounded-md text-[11px] font-medium ${
                      selectedStation.elevationMode === m.id
                        ? 'bg-sky-500 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-400">主站台軌面相對地面高度</span>
                <span className="font-mono-tabular font-semibold text-sky-300">
                  {selectedStation.elevationMeters > 0
                    ? `+${selectedStation.elevationMeters}m`
                    : `${selectedStation.elevationMeters}m`}
                </span>
              </div>
              <input
                type="range"
                min={-40}
                max={18}
                step={1}
                value={selectedStation.elevationMeters}
                onChange={(e) => {
                  const meters = Number(e.target.value);
                  const mode: ElevationMode =
                    meters > 2 ? 'elevated' : meters >= -2 ? 'ground' : 'underground';
                  const depth: TrackDepth =
                    meters > 2
                      ? 'EL'
                      : meters >= -16
                      ? 'B1'
                      : meters >= -24
                      ? 'B2'
                      : meters >= -30
                      ? 'B3'
                      : meters >= -36
                      ? 'B4'
                      : 'B5';
                  onUpdateStation(selectedStation.id, {
                    elevationMeters: meters,
                    elevationMode: mode,
                    depth,
                  });
                }}
                className="w-full accent-sky-400"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-400">月台擴建</span>
                <span className="font-mono-tabular text-sky-300">{selectedStation.platforms} 座</span>
              </div>
              <input
                type="range"
                min={2}
                max={8}
                value={selectedStation.platforms}
                onChange={(e) => {
                  const platforms = Number(e.target.value);
                  const baseTp = STATION_CONFIGS[selectedStation.size].throughput;
                  onUpdateStation(selectedStation.id, {
                    platforms,
                    throughputCapacity: Math.round(baseTp * (0.7 + platforms * 0.18)),
                  });
                }}
                className="w-full accent-sky-400"
              />
            </div>

            <label className="flex items-center justify-between pt-1 cursor-pointer">
              <span className="text-slate-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>設為快車停靠站</span>
              </span>
              <input
                type="checkbox"
                checked={selectedStation.isExpressStop}
                onChange={(e) =>
                  onUpdateStation(selectedStation.id, { isExpressStop: e.target.checked })
                }
                className="w-4 h-4 accent-amber-400 rounded"
              />
            </label>
          </div>
        </div>
      )}
    </>
  );
};
