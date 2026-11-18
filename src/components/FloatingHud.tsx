import React, { useMemo, useState } from 'react';
import {
  Play,
  Pause,
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

const hudSurface =
  'bg-white/95 backdrop-blur-sm border border-slate-200/95 text-slate-900 shadow-[0_4px_18px_rgba(15,23,42,0.08)]';

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
      ? { label: t(lang, 'smooth'), cls: 'text-emerald-700' }
      : stats.congestionIndex < 1.85
      ? { label: t(lang, 'moderate'), cls: 'text-amber-700' }
      : stats.congestionIndex < 2.25
      ? { label: t(lang, 'congested'), cls: 'text-orange-700' }
      : { label: t(lang, 'severe'), cls: 'text-rose-700' };

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
          : `${formatCurrencyWan(getDistrictUnlockCost(d, difficulty), lang)}`;
        list.push({ id: `d_${d.id}`, label: d.name, kind: kindLabel, x: d.x, y: d.y });
      }
    }
    return list.slice(0, 10);
  }, [searchQuery, stations, map.pois, map.districts, difficulty, lang]);

  return (
    <>
      {/* TOP-LEFT TIME & SPEED CONTROL BAR */}
      <div
        className={`fixed top-4 left-4 z-30 ${hudSurface} rounded-xl px-3.5 py-2 flex items-center gap-3.5`}
      >
        <div className="relative w-8 h-8 shrink-0 flex items-center justify-center">
          <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
            <circle
              cx="18"
              cy="18"
              r="14"
              fill="none"
              stroke="#E2E8F0"
              strokeWidth="3.2"
            />
            <circle
              cx="18"
              cy="18"
              r="14"
              fill="none"
              stroke={hours >= 6 && hours < 19 ? '#2563EB' : '#475569'}
              strokeWidth="3.2"
              strokeDasharray={`${dayProgress * 88} 88`}
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div className="min-w-[148px]">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 whitespace-nowrap">
            <span className="font-medium text-slate-700">{map.name}</span>
            <span aria-hidden="true">·</span>
            <span>{demand.periodLabel}</span>
            <span aria-hidden="true" className="hidden md:inline">·</span>
            <span className="hidden md:inline text-slate-600">{eraTitle}</span>
          </div>
          <div className="flex items-baseline gap-2 mt-0.5 whitespace-nowrap">
            <span className="text-sm font-bold text-slate-950 font-mono-tabular">
              {year}年{month}月{dayOfMonth}日
            </span>
            <span className="text-xs font-mono-tabular text-slate-500">{timeStr}</span>
          </div>
        </div>

        <div className="flex items-center gap-0.5 bg-slate-100 border border-slate-200/80 rounded-lg p-0.5">
          <button
            onClick={() => onChangeSpeed(speed === 0 ? 1 : 0)}
            title={speed === 0 ? t(lang, 'resume') : t(lang, 'paused')}
            className={`w-8 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
              speed === 0
                ? 'bg-amber-500 text-white'
                : 'bg-white text-slate-900 shadow-2xs hover:bg-slate-50'
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
              className={`px-2 h-7 rounded-md text-xs font-mono-tabular font-medium transition-colors cursor-pointer ${
                speed === s
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-950 hover:bg-white/70'
              }`}
            >
              {s}x
            </button>
          ))}
          <button
            onClick={onAdvanceMonth}
            className="px-2.5 h-7 rounded-md text-xs font-medium text-slate-700 hover:text-slate-950 hover:bg-white flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer"
          >
            <CalendarPlus className="w-3.5 h-3.5 text-blue-600" />
            <span>{t(lang, 'advanceMonth')}</span>
          </button>
        </div>
      </div>

      {/* TOP-CENTER PAUSE INDICATOR */}
      {speed === 0 && (
        <button
          onClick={() => onChangeSpeed(1)}
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-30 ${hudSurface} rounded-lg px-4 py-1.5 flex items-center gap-2.5 text-xs cursor-pointer hover:border-amber-400 transition-colors`}
        >
          <span className="text-amber-700 font-semibold">{t(lang, 'paused')}</span>
          <span className="text-slate-300" aria-hidden="true">|</span>
          <span className="font-mono-tabular text-[11px] text-slate-600">{t(lang, 'space')}</span>
          <span className="text-slate-500">{t(lang, 'resume')}</span>
        </button>
      )}

      {/* TOP-RIGHT KPI STRIP & UTILITY ACTIONS */}
      <div className="fixed top-4 right-4 z-30 flex items-center gap-2">
        <div
          className={`hidden xl:flex ${hudSurface} rounded-xl py-1 px-1 items-center divide-x divide-slate-200`}
        >
          <button
            onClick={() => setActiveKpi(activeKpi === 'finance' ? 'none' : 'finance')}
            className={`px-3 py-1 rounded-lg text-left transition-colors cursor-pointer ${
              activeKpi === 'finance' ? 'bg-slate-100' : 'hover:bg-slate-50'
            }`}
          >
            <div className="text-[10px] text-slate-500 whitespace-nowrap">{t(lang, 'funds')}</div>
            <div className="text-sm font-bold font-mono-tabular text-slate-950 whitespace-nowrap">
              {formatCurrencyWan(money, lang)}
            </div>
          </button>

          <button
            onClick={() => setActiveKpi(activeKpi === 'population' ? 'none' : 'population')}
            className={`px-3 py-1 rounded-lg text-left transition-colors cursor-pointer ${
              activeKpi === 'population' ? 'bg-slate-100' : 'hover:bg-slate-50'
            }`}
          >
            <div className="text-[10px] text-slate-500 whitespace-nowrap">{t(lang, 'population')}</div>
            <div className="text-sm font-bold font-mono-tabular text-slate-950 whitespace-nowrap">
              {formatPop(stats.totalPopulation, lang)}
            </div>
          </button>

          <button
            onClick={() => setActiveKpi(activeKpi === 'share' ? 'none' : 'share')}
            className={`px-3 py-1 rounded-lg text-left transition-colors cursor-pointer ${
              activeKpi === 'share' ? 'bg-slate-100' : 'hover:bg-slate-50'
            }`}
          >
            <div className="text-[10px] text-slate-500 whitespace-nowrap">{t(lang, 'metroShare')}</div>
            <div className="text-sm font-bold font-mono-tabular text-slate-950 whitespace-nowrap">
              {stats.modeSharePercent.toFixed(1)}%
            </div>
          </button>

          <button
            onClick={() => setActiveKpi(activeKpi === 'congestion' ? 'none' : 'congestion')}
            className={`px-3 py-1 rounded-lg text-left transition-colors cursor-pointer ${
              activeKpi === 'congestion' ? 'bg-slate-100' : 'hover:bg-slate-50'
            }`}
          >
            <div className="text-[10px] text-slate-500 whitespace-nowrap">{t(lang, 'congestionIdx')}</div>
            <div className="text-sm font-bold font-mono-tabular text-slate-950 flex items-baseline gap-1.5 whitespace-nowrap">
              <span>{stats.congestionIndex.toFixed(2)}</span>
              <span className={`text-[11px] font-semibold ${congestionStatus.cls}`}>
                {congestionStatus.label}
              </span>
            </div>
          </button>
        </div>

        {/* Utility Toolbar */}
        <div className={`${hudSurface} rounded-xl p-1 flex items-center gap-0.5`}>
          <button
            onClick={() => setOpenDrawer(openDrawer === 'search' ? 'none' : 'search')}
            title={t(lang, 'searchPlaceholder')}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
              openDrawer === 'search'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
            }`}
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenCityStats}
            title={t(lang, 'cityStats')}
            className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-950 transition-colors cursor-pointer"
          >
            <BarChart3 className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenNetworkMap}
            title={t(lang, 'networkMap')}
            className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-950 transition-colors cursor-pointer"
          >
            <Network className="w-4 h-4" />
          </button>
          <button
            onClick={() => setOpenDrawer(openDrawer === 'lang' ? 'none' : 'lang')}
            title="語言 / Language"
            className="px-2.5 h-9 rounded-lg hover:bg-slate-100 flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-slate-950 transition-colors cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5 text-slate-500" />
            <span>{LANG_LABELS[lang]}</span>
          </button>
          <button
            onClick={onOpenSetup}
            title="開局與難度設定"
            className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-950 transition-colors cursor-pointer"
          >
            <MapIcon className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenGdd}
            title="系統設計文件 (GDD)"
            className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-950 transition-colors cursor-pointer"
          >
            <FileText className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleMute}
            title={muted ? '開啟音效' : '靜音'}
            className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-950 transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onReturnTitle}
            title="返回主畫面"
            className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-950 transition-colors cursor-pointer"
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
          className={`fixed top-18 right-24 z-35 w-80 ${hudSurface} rounded-xl p-3 space-y-2.5`}
        >
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t(lang, 'searchPlaceholder')}
              className="w-full pl-8 pr-7 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
            />
            <button
              onClick={() => setOpenDrawer('none')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-800"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
            {searchResults.length === 0 ? (
              <div className="text-xs text-slate-400 py-3 text-center">
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
                  className="w-full flex items-center justify-between px-2.5 py-2 hover:bg-slate-50 text-xs text-slate-800 transition-colors text-left cursor-pointer"
                >
                  <span className="truncate font-medium">{item.label}</span>
                  <span className="text-[11px] text-slate-500 shrink-0 ml-2 font-mono-tabular">
                    {item.kind}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* LANGUAGE SWITCHER POPOVER */}
      {openDrawer === 'lang' && (
        <div className={`fixed top-18 right-16 z-35 w-36 ${hudSurface} rounded-xl p-1 space-y-0.5`}>
          {(['zh-Hant', 'zh-Hans', 'en'] as Language[]).map((l) => (
            <button
              key={l}
              onClick={() => {
                onChangeLang(l);
                setOpenDrawer('none');
              }}
              className={`w-full px-3 py-1.5 rounded-lg text-xs font-medium text-left flex items-center justify-between transition-colors cursor-pointer ${
                lang === l ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>{l === 'zh-Hant' ? '繁體中文' : l === 'zh-Hans' ? '简体中文' : 'English'}</span>
              {lang === l && <Check className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
      )}

      {/* BOTTOM-LEFT VERTICAL DOCK */}
      <div className="fixed bottom-4 left-4 z-30 flex flex-col gap-3">
        <div className={`${hudSurface} rounded-xl p-1 flex flex-col items-center gap-0.5 w-13`}>
          <button
            onClick={() => setOpenDrawer(openDrawer === 'layers' ? 'none' : 'layers')}
            className={`w-10 py-2 rounded-lg flex flex-col items-center gap-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
              openDrawer === 'layers'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>{t(lang, 'layers')}</span>
          </button>

          <button
            onClick={onToggle25D}
            title="切換 2.5D 視角 (快捷鍵 T)"
            className={`w-10 py-2 rounded-lg flex flex-col items-center gap-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
              is25D ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
            }`}
          >
            <Box className="w-4 h-4" />
            <span>2.5D</span>
          </button>

          <button
            onClick={() => setOpenDrawer(openDrawer === 'depth' ? 'none' : 'depth')}
            className={`w-10 py-2 rounded-lg flex flex-col items-center gap-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
              layers.depthFilter !== 'ALL' || openDrawer === 'depth'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
            }`}
          >
            <ArrowUpDown className="w-4 h-4" />
            <span>{layers.depthFilter === 'ALL' ? t(lang, 'depthView') : layers.depthFilter}</span>
          </button>

          <div className="w-7 h-px bg-slate-200 my-1" />

          <button
            onClick={onZoomIn}
            title="放大"
            className="w-10 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-950 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={onZoomOut}
            title="縮小"
            className="w-10 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-950 transition-colors cursor-pointer"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={onResetView}
            title={t(lang, 'resetView')}
            className="w-10 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-950 transition-colors cursor-pointer"
          >
            <Compass className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* LEFT-DOCK POPOVER: LAYERS */}
      {openDrawer === 'layers' && (
        <div
          className={`fixed bottom-20 left-20 z-30 w-64 ${hudSurface} rounded-xl p-3.5 space-y-2.5`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-900 pb-2 border-b border-slate-200">
            <span>{t(lang, 'layers')}</span>
            <button onClick={() => setOpenDrawer('none')} className="text-slate-400 hover:text-slate-900">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1">
            {[
              { key: 'populationHeatmap' as const, label: '人口與職缺熱區' },
              { key: 'metroCoverageOverlay' as const, label: '地鐵覆蓋與盲區 (綠/紅)' },
              { key: 'zones' as const, label: '都市用地分區' },
              { key: 'catchmentRings' as const, label: '車站步行覆蓋圈' },
              { key: 'congestionOverlay' as const, label: '地面道路飽和度' },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-center justify-between text-xs text-slate-700 py-1 cursor-pointer hover:text-slate-950"
              >
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  checked={layers[item.key]}
                  onChange={() => onToggleLayer(item.key)}
                  className="w-4 h-4 accent-blue-600 rounded"
                />
              </label>
            ))}
          </div>

          {map.geoBounds && (
            <div className="pt-2.5 border-t border-slate-200 space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-500">地圖底圖樣式</div>
              <div className="grid grid-cols-1 gap-1">
                {(
                  [
                    { id: 'esri_light_gray' as const, label: 'Esri 簡約淺灰地圖 (預設)' },
                    { id: 'canvas_vector' as const, label: '純淨向量白圖 (離線可用)' },
                    { id: 'esri_dark_gray' as const, label: 'Esri 夜間深灰地圖' },
                  ]
                ).map((stOpt) => (
                  <button
                    key={stOpt.id}
                    onClick={() => onChangeOpenMapStyle(stOpt.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] text-left font-medium transition-colors cursor-pointer ${
                      openMapStyle === stOpt.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
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
          className={`fixed bottom-20 left-20 z-30 w-52 ${hudSurface} rounded-xl p-3.5 space-y-2.5`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-900 pb-2 border-b border-slate-200">
            <span>{t(lang, 'depthView')}</span>
            <button onClick={() => setOpenDrawer('none')} className="text-slate-400 hover:text-slate-900">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => onChangeDepthFilter('ALL')}
              className={`py-1.5 text-xs rounded-lg font-medium cursor-pointer ${
                layers.depthFilter === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
              }`}
            >
              {t(lang, 'allDepth')}
            </button>
            {DEPTH_LEVELS.map((d) => (
              <button
                key={d.id}
                onClick={() => onChangeDepthFilter(d.id)}
                className={`py-1.5 text-xs rounded-lg font-medium cursor-pointer ${
                  layers.depthFilter === d.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                }`}
              >
                {d.shortLabel}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* FLOATING DRAFT COMMIT BAR */}
      {draftCount > 0 && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-30 ${hudSurface} border-blue-500/40 rounded-xl px-4 py-2 flex items-center gap-3 ${
            tool === 'station' || tool === 'track' ? 'bottom-40' : 'bottom-24'
          }`}
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-blue-700">
              {t(lang, 'draftItems')} {draftCount} {t(lang, 'itemsSuffix')}
            </span>
            <span className="font-mono-tabular font-bold text-slate-950">
              {formatCurrencyWan(draftCostWan, lang)}
            </span>
            {draftWarnings > 0 && (
              <span className="flex items-center gap-1 text-amber-700 font-mono-tabular">
                <AlertTriangle className="w-3.5 h-3.5" />
                {draftWarnings}
              </span>
            )}
          </div>

          <div className="h-4 w-px bg-slate-200" />

          <div className="flex items-center gap-0.5">
            <button
              onClick={onUndoDraft}
              disabled={!canUndoDraft}
              title={t(lang, 'undo')}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-35 cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onRedoDraft}
              disabled={!canRedoDraft}
              title={t(lang, 'redo')}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-35 cursor-pointer"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={onDiscardDraft}
            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 text-xs text-slate-700 hover:text-rose-700 transition-colors cursor-pointer"
          >
            {t(lang, 'discardDraft')}
          </button>

          <button
            onClick={onConfirmDraft}
            className="px-3.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{t(lang, 'confirmBuild')}</span>
          </button>
        </div>
      )}

      {/* BOTTOM-CENTER CONTEXTUAL TRAY */}
      {(tool === 'station' || tool === 'track') && (
        <div
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-30 ${hudSurface} rounded-xl px-4 py-2.5 flex flex-col gap-2 max-w-[92vw]`}
        >
          {tool === 'station' && (
            <>
              <div className="flex items-center justify-between gap-4 text-[11px] text-slate-500">
                <span>{t(lang, 'stationHint')}</span>
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 hover:text-slate-950 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={draftMode}
                    onChange={onToggleDraftMode}
                    className="w-3.5 h-3.5 accent-blue-600 rounded"
                  />
                  <span>{draftMode ? t(lang, 'draftMode') : t(lang, 'instantMode')}</span>
                </label>
              </div>
              <div className="flex items-center gap-3 overflow-x-auto">
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-slate-500 mr-1 whitespace-nowrap">
                    {t(lang, 'methodLabel')}:
                  </span>
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
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                        elevationMode === m.id
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {elevationMode === 'underground' && (
                  <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    {DEPTH_LEVELS.filter((d) => d.id !== 'EL').map((d) => (
                      <button
                        key={d.id}
                        onClick={() => onSelectDepth(d.id)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular font-medium cursor-pointer ${
                          activeDepth === d.id
                            ? 'bg-white text-slate-950 shadow-2xs'
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        {d.id}
                      </button>
                    ))}
                  </div>
                )}

                <div className="h-5 w-px bg-slate-200 shrink-0" />

                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-slate-500 mr-1 whitespace-nowrap">
                    {t(lang, 'scaleLabel')}:
                  </span>
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
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                        stationSize === sz.id
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                      line.id === activeLineId
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: line.color }}
                    />
                    <span>{line.name}</span>
                  </button>
                ))}
                <button
                  onClick={onCreateLine}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium text-blue-700 hover:bg-blue-50 flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>新線</span>
                </button>
              </div>
              <div className="h-5 w-px bg-slate-200 shrink-0" />
              <div className="flex items-center gap-1">
                {DEPTH_LEVELS.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => onSelectDepth(d.id)}
                    className={`px-2 py-1 rounded-lg text-xs font-mono-tabular font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      activeDepth === d.id
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                    }`}
                  >
                    {d.shortLabel}
                  </button>
                ))}
              </div>
              <div className="h-5 w-px bg-slate-200 shrink-0" />
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-700 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={draftMode}
                  onChange={onToggleDraftMode}
                  className="w-3.5 h-3.5 accent-blue-600 rounded"
                />
                <span>{draftMode ? t(lang, 'draftMode') : t(lang, 'instantMode')}</span>
              </label>
              {trackStartStationName && (
                <>
                  <div className="h-5 w-px bg-slate-200 shrink-0" />
                  <div className="flex items-center gap-2 text-xs text-slate-800 whitespace-nowrap">
                    <span>
                      起點: <strong>{trackStartStationName}</strong>
                      {hasTrackWaypoint ? ' (已設彎道)' : ' · 點空地設彎道或點目標站'}
                    </span>
                    <button
                      onClick={onCancelTrackDraw}
                      className="text-rose-600 hover:text-rose-800 underline cursor-pointer"
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
        className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-30 ${hudSurface} rounded-xl p-1 flex items-center gap-1`}
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
              className={`w-16 py-2 rounded-lg flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors cursor-pointer ${
                active
                  ? item.id === 'demolish'
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-950 text-white'
                  : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
              }`}
            >
              {item.icon}
              <span className="text-[11px]">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* BOTTOM-RIGHT OPERATION BUTTONS */}
      <div className="fixed bottom-4 right-4 z-30 flex items-center gap-2">
        <button
          onClick={() => onOpenMetroCore('overview')}
          className={`${hudSurface} rounded-xl px-4 py-2.5 flex items-center gap-3 hover:border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer`}
        >
          <Cpu className="w-4 h-4 text-slate-600" />
          <div className="text-left">
            <div className="text-[10px] text-slate-500">{t(lang, 'metroCore')}</div>
            <div className="text-sm font-bold font-mono-tabular text-slate-950">
              {liveLines.length} {t(lang, 'linesUnit')}
            </div>
          </div>
        </button>

        <button
          onClick={onOpenMetroCircle}
          className={`relative ${hudSurface} rounded-xl px-4 py-2.5 flex items-center gap-3 hover:border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer`}
        >
          {unreadCircleCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-md bg-rose-600 text-white text-[10px] font-mono-tabular font-bold flex items-center justify-center shadow-xs">
              {unreadCircleCount}
            </span>
          )}
          <Smile
            className={`w-4 h-4 ${
              stats.satisfaction >= 70
                ? 'text-emerald-600'
                : stats.satisfaction >= 45
                ? 'text-amber-600'
                : 'text-rose-600'
            }`}
          />
          <div className="text-left">
            <div className="text-[10px] text-slate-500">{t(lang, 'metroCircle')}</div>
            <div className="text-sm font-bold font-mono-tabular text-slate-950">
              {stats.satisfaction}
            </div>
          </div>
        </button>
      </div>

      {/* FLOATING STATION INSPECTOR */}
      {selectedStation && (
        <div
          className={`fixed top-20 right-4 z-30 w-88 ${hudSurface} rounded-xl p-4 space-y-3.5 max-h-[75vh] overflow-y-auto`}
        >
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200">
            <input
              type="text"
              value={selectedStation.name}
              onChange={(e) => onUpdateStation(selectedStation.id, { name: e.target.value })}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-950 focus:outline-none focus:border-blue-600"
            />
            {selectedStation.isDraft && (
              <span className="text-[11px] font-medium text-blue-700 shrink-0">
                {t(lang, 'draftItems')}
              </span>
            )}
            <button
              onClick={() => onDeleteStation(selectedStation.id)}
              title="拆除車站"
              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClearSelectedStation}
              className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 divide-x divide-slate-200 py-1 text-center text-xs">
            <div>
              <div className="text-[10px] text-slate-500">候車中</div>
              <div className="font-mono-tabular font-bold text-blue-700 mt-0.5">
                {selectedStation.waiting.length}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">吞吐容量</div>
              <div className="font-mono-tabular font-bold text-slate-900 mt-0.5">
                {(STATION_CONFIGS[selectedStation.size].hourlyCapacity / 1000).toFixed(0)}k/時
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">最大編組</div>
              <div className="font-mono-tabular font-bold text-slate-900 mt-0.5">
                {STATION_CONFIGS[selectedStation.size].maxCars} 節
              </div>
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-200">
            <span className="text-[11px] font-semibold text-slate-600">規模等級與造價</span>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(STATION_CONFIGS) as StationSize[]).map((sz) => {
                const cfg = STATION_CONFIGS[sz];
                const active = selectedStation.size === sz;
                return (
                  <button
                    key={sz}
                    onClick={() => onUpgradeStation(selectedStation.id, sz)}
                    className={`p-2.5 text-left rounded-lg border text-xs transition-colors cursor-pointer ${
                      active
                        ? 'bg-blue-50/70 border-blue-600 text-slate-950'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span className="truncate">{cfg.label}</span>
                      <span className="text-[10px] font-mono-tabular text-blue-700">
                        {cfg.maxCars}節
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono-tabular mt-0.5">
                      {(cfg.hourlyCapacity / 1000).toFixed(0)}k/h · 維護 {cfg.maintenance}萬/日
                    </div>
                    <div className="text-[10px] text-amber-700 font-medium font-mono-tabular">
                      造價 {formatCurrencyWan(cfg.cost, lang)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2.5 pt-2.5 border-t border-slate-200 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-700 font-medium">車站標高方式</span>
              <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
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
                    className={`px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                      selectedStation.elevationMode === m.id
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-950'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-600">主站台軌面相對地面高度</span>
                <span className="font-mono-tabular font-semibold text-blue-700">
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
                className="w-full accent-blue-600"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-600">月台擴建</span>
                <span className="font-mono-tabular font-semibold text-blue-700">
                  {selectedStation.platforms} 座
                </span>
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
                className="w-full accent-blue-600"
              />
            </div>

            <label className="flex items-center justify-between pt-1 cursor-pointer">
              <span className="text-slate-700 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-600" />
                <span>設為快車停靠站</span>
              </span>
              <input
                type="checkbox"
                checked={selectedStation.isExpressStop}
                onChange={(e) =>
                  onUpdateStation(selectedStation.id, { isExpressStop: e.target.checked })
                }
                className="w-4 h-4 accent-blue-600 rounded"
              />
            </label>
          </div>
        </div>
      )}
    </>
  );
};
