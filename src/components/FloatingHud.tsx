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
  Plus,
  Minus,
  Compass,
  MousePointer2,
  MapPin,
  Spline,
  Trash2,
  X,
  Zap,
  CalendarPlus,
  Search,
  Undo2,
  Redo2,
  Check,
  AlertTriangle,
  Globe,
  Menu,
  ChevronUp,
  ChevronDown,
  Building2,
} from 'lucide-react';
import {
  ActiveLoan,
  CityMap,
  DEPTH_LEVELS,
  DifficultyConfig,
  ElevationMode,
  FarePolicy,
  Language,
  LayerVisibility,
  LINE_SPEED_CONFIGS,
  LINE_SPEED_TIERS,
  LineSpeedKmh,
  SimulationStats,
  Station,
  StationSize,
  STATION_CONFIGS,
  TOD_CONFIGS,
  TodPropertyKind,
  ToolMode,
  TrackDepth,
  TrackSegment,
  TransitLine,
} from '../types/game';
import {
  computeNetworkMileageKm,
  getDistrictUnlockCost,
  getLineCurveAnalysis,
  getTimeOfDayDemand,
} from '../engine/simulation';
import { OpenMapStyleId } from '../engine/geo';
import { formatCurrencyWan, formatPop, t } from '../i18n/translations';
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
  loans: ActiveLoan[];
  onTakeLoan: (offerId: string) => void;
  onRepayLoan: (loanId: string) => void;
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
  segments: TrackSegment[];
  activeLineId: string;
  onSelectLine: (id: string) => void;
  onCreateLine: () => void;
  onUpdateLine: (id: string, patch: Partial<TransitLine>) => void;
  selectedStation: Station | null;
  onClearSelectedStation: () => void;
  onUpdateStation: (id: string, patch: Partial<Station>) => void;
  onUpgradeStation: (id: string, newSize: StationSize) => void;
  onDevelopTod: (stationId: string, kind: TodPropertyKind) => void;
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
  onOpenMetroCore: (tab?: 'overview' | 'lines' | 'stations' | 'fleet' | 'fares' | 'loans') => void;
  onOpenMetroCircle: () => void;
  unreadCircleCount: number;
}

const popoverSurface =
  'bg-white/98 backdrop-blur-sm border border-slate-200 text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.10)] rounded-xl';

const floatingBarSurface =
  'bg-white/95 backdrop-blur-sm border border-slate-200 text-slate-900 shadow-[0_4px_16px_rgba(15,23,42,0.08)]';

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
  loans,
  onTakeLoan,
  onRepayLoan,
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
  segments,
  activeLineId,
  onSelectLine,
  onCreateLine,
  onUpdateLine,
  selectedStation,
  onClearSelectedStation,
  onUpdateStation,
  onUpgradeStation,
  onDevelopTod,
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
  const [openDrawer, setOpenDrawer] = useState<'none' | 'view' | 'search' | 'menu'>('none');
  const [linePickerOpen, setLinePickerOpen] = useState(false);
  const [speedPickerOpen, setSpeedPickerOpen] = useState(false);
  const [activeKpi, setActiveKpi] = useState<ActiveKpiPopover>('none');
  const [searchQuery, setSearchQuery] = useState('');

  const hours = Math.floor(gameMinutesOfDay / 60) % 24;
  const mins = Math.floor(gameMinutesOfDay % 60);
  const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  const demand = getTimeOfDayDemand(gameMinutesOfDay);
  const month = Math.min(12, Math.floor((day - 1) / 30) + 1);
  const dayOfMonth = ((day - 1) % 30) + 1;

  const activeLine = lines.find((l) => l.id === activeLineId) || lines[0] || null;
  const todStations = stations.filter((s) => !s.isDraft && s.todProperty);
  const todCount = todStations.length;
  const totalTodRentWan = todStations.reduce((sum, s) => sum + (s.todProperty?.monthlyRentWan ?? 0), 0);

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
    for (const prov of map.provinces ?? []) {
      if (!q || prov.name.toLowerCase().includes(q)) {
        list.push({
          id: `prov_${prov.id}`,
          label: prov.name,
          kind: prov.unlocked ? '已解鎖省份' : '跨省門戶',
          x: prov.x,
          y: prov.y,
        });
      }
    }
    for (const c of map.cities ?? []) {
      if (!q || c.name.toLowerCase().includes(q)) {
        list.push({
          id: `city_${c.id}`,
          label: c.name,
          kind: c.unlocked ? '已解鎖城市' : `地級市 (${c.distanceKmFromShanghai}km)`,
          x: c.x,
          y: c.y,
        });
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
            : d.cityName && d.cityId !== 'city_sh'
            ? `${d.cityName} · 已解鎖`
            : '已解鎖地區'
          : `${d.cityName && d.cityId !== 'city_sh' ? `${d.cityName} · ` : ''}${formatCurrencyWan(getDistrictUnlockCost(d, difficulty), lang)}`;
        list.push({ id: `d_${d.id}`, label: d.name, kind: kindLabel, x: d.x, y: d.y });
      }
    }
    return list.slice(0, 12);
  }, [searchQuery, stations, map.pois, map.provinces, map.cities, map.districts, difficulty, lang]);

  const toggleDrawer = (target: 'view' | 'search' | 'menu') => {
    setActiveKpi('none');
    setLinePickerOpen(false);
    setOpenDrawer((prev) => (prev === target ? 'none' : target));
  };

  const toggleKpi = (target: Exclude<ActiveKpiPopover, 'none'>) => {
    setOpenDrawer('none');
    setLinePickerOpen(false);
    setActiveKpi((prev) => (prev === target ? 'none' : target));
  };

  return (
    <>
      {/* SINGLE EDGE-TO-EDGE SLIM TOP HEADER */}
      <header className="fixed top-0 inset-x-0 z-30 h-12 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-4 flex items-center justify-between gap-4">
        {/* Left: City, Date/Time & Speed Segmented Control */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-sm font-bold text-slate-950 tracking-tight">{map.name}</span>
            <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
              ·
            </span>
            <span className="text-xs font-mono-tabular text-slate-600 hidden sm:inline">
              {year}/{String(month).padStart(2, '0')}/{String(dayOfMonth).padStart(2, '0')}{' '}
              {timeStr}
            </span>
            <span className="text-[11px] text-slate-400 hidden xl:inline">
              {demand.periodLabel}
            </span>
          </div>

          <div className="flex items-center gap-0.5 bg-slate-100 border border-slate-200/80 rounded-lg p-0.5 shrink-0">
            <button
              onClick={() => onChangeSpeed(speed === 0 ? 1 : 0)}
              title={speed === 0 ? `${t(lang, 'resume')} (${t(lang, 'space')})` : t(lang, 'paused')}
              className={`h-7 px-2 rounded-md flex items-center gap-1 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                speed === 0
                  ? 'bg-amber-500 text-white'
                  : 'bg-white text-slate-800 shadow-2xs hover:bg-slate-50'
              }`}
            >
              {speed === 0 ? (
                <>
                  <Play className="w-3 h-3 fill-current" />
                  <span className="hidden md:inline">{t(lang, 'paused')}</span>
                </>
              ) : (
                <Pause className="w-3 h-3" />
              )}
            </button>
            {([1, 2, 4] as const).map((s) => (
              <button
                key={s}
                onClick={() => onChangeSpeed(s)}
                className={`px-2 h-7 rounded-md text-[11px] font-mono-tabular font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  speed === s
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-950 hover:bg-white/70'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Center: Flat Inline Clickable KPIs */}
        <div className="hidden lg:flex items-center divide-x divide-slate-200">
          <button
            onClick={() => toggleKpi('finance')}
            className={`px-3 py-1 rounded-md text-left transition-colors whitespace-nowrap cursor-pointer ${
              activeKpi === 'finance' ? 'bg-slate-100' : 'hover:bg-slate-50'
            }`}
          >
            <span className="text-[11px] text-slate-500 mr-1.5">{t(lang, 'funds')}</span>
            <span className="text-xs font-bold font-mono-tabular text-slate-950">
              {formatCurrencyWan(money, lang)}
            </span>
          </button>

          <button
            onClick={() => toggleKpi('population')}
            className={`px-3 py-1 rounded-md text-left transition-colors whitespace-nowrap cursor-pointer ${
              activeKpi === 'population' ? 'bg-slate-100' : 'hover:bg-slate-50'
            }`}
          >
            <span className="text-[11px] text-slate-500 mr-1.5">{t(lang, 'population')}</span>
            <span className="text-xs font-bold font-mono-tabular text-slate-950">
              {formatPop(stats.totalPopulation, lang)}
            </span>
          </button>

          <button
            onClick={() => toggleKpi('share')}
            className={`px-3 py-1 rounded-md text-left transition-colors whitespace-nowrap cursor-pointer ${
              activeKpi === 'share' ? 'bg-slate-100' : 'hover:bg-slate-50'
            }`}
          >
            <span className="text-[11px] text-slate-500 mr-1.5">{t(lang, 'metroShare')}</span>
            <span className="text-xs font-bold font-mono-tabular text-slate-950">
              {stats.modeSharePercent.toFixed(1)}%
            </span>
          </button>

          <button
            onClick={() => toggleKpi('congestion')}
            className={`px-3 py-1 rounded-md text-left transition-colors whitespace-nowrap cursor-pointer ${
              activeKpi === 'congestion' ? 'bg-slate-100' : 'hover:bg-slate-50'
            }`}
          >
            <span className="text-[11px] text-slate-500 mr-1.5">{t(lang, 'congestionIdx')}</span>
            <span className="text-xs font-bold font-mono-tabular text-slate-950 mr-1">
              {stats.congestionIndex.toFixed(2)}
            </span>
            <span className={`text-[11px] font-semibold ${congestionStatus.cls}`}>
              {congestionStatus.label}
            </span>
          </button>
        </div>

        {/* Right: Concise Navigation Text Tabs + 3 Utility Triggers */}
        <div className="flex items-center gap-1 shrink-0">
          <nav className="hidden md:flex items-center gap-1 mr-1">
            <button
              onClick={onOpenCityStats}
              className="px-2.5 h-8 rounded-md text-xs font-medium text-slate-600 hover:text-slate-950 hover:bg-slate-100 transition-colors whitespace-nowrap cursor-pointer"
            >
              {lang === 'en' ? 'Stats' : '統計'}
            </button>
            <button
              onClick={() => onOpenMetroCore('overview')}
              className="px-2.5 h-8 rounded-md text-xs font-medium text-slate-600 hover:text-slate-950 hover:bg-slate-100 transition-colors whitespace-nowrap cursor-pointer"
            >
              {lang === 'en' ? 'Lines' : '線網'}
            </button>
            <button
              onClick={onOpenNetworkMap}
              className="px-2.5 h-8 rounded-md text-xs font-medium text-slate-600 hover:text-slate-950 hover:bg-slate-100 transition-colors whitespace-nowrap cursor-pointer"
            >
              {lang === 'en' ? 'Topology' : '拓撲'}
            </button>
            <button
              onClick={onOpenMetroCircle}
              className="px-2.5 h-8 rounded-md text-xs font-medium text-slate-600 hover:text-slate-950 hover:bg-slate-100 transition-colors whitespace-nowrap cursor-pointer"
            >
              {lang === 'en' ? 'Feed' : '動態'}
              {unreadCircleCount > 0 && (
                <span className="ml-1 font-mono-tabular text-blue-600 font-semibold">
                  ({unreadCircleCount})
                </span>
              )}
            </button>
          </nav>

          <div className="hidden md:block h-4 w-px bg-slate-200 mx-1" />

          <button
            onClick={() => toggleDrawer('search')}
            title={t(lang, 'searchPlaceholder')}
            className={`h-8 px-2 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              openDrawer === 'search'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{lang === 'en' ? 'Find' : '搜尋'}</span>
          </button>

          <button
            onClick={() => toggleDrawer('view')}
            title={t(lang, 'layers')}
            className={`h-8 px-2 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              openDrawer === 'view'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t(lang, 'layers')}</span>
          </button>

          <button
            onClick={() => toggleDrawer('menu')}
            title={lang === 'en' ? 'Menu' : '選單'}
            className={`h-8 px-2 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              openDrawer === 'menu'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
            }`}
          >
            <Menu className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{lang === 'en' ? 'Menu' : '選單'}</span>
          </button>
        </div>
      </header>

      {/* INTERACTIVE KPI DRILL-DOWN POPOVER */}
      <KpiPopovers
        active={activeKpi}
        onClose={() => setActiveKpi('none')}
        lang={lang}
        year={year}
        day={day}
        difficulty={difficulty}
        money={money}
        loans={loans}
        todCount={todCount}
        totalTodRentWan={totalTodRentWan}
        onTakeLoan={onTakeLoan}
        onRepayLoan={onRepayLoan}
        stats={stats}
        farePolicy={farePolicy}
        monthlyCapexWan={monthlyCapexWan}
        layers={layers}
        onToggleLayer={onToggleLayer}
        onOpenMetroCoreFares={() => {
          setActiveKpi('none');
          onOpenMetroCore('fares');
        }}
        onOpenMetroCoreLoans={() => {
          setActiveKpi('none');
          onOpenMetroCore('loans');
        }}
      />

      {/* SEARCH POPOVER */}
      {openDrawer === 'search' && (
        <div className={`fixed top-14 right-4 z-35 w-80 ${popoverSurface} p-3 space-y-2.5`}>
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
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-800 cursor-pointer"
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

      {/* UNIFIED VIEW, LAYERS, BASEMAP & DEPTH POPOVER */}
      {openDrawer === 'view' && (
        <div
          className={`fixed top-14 right-4 z-35 w-72 ${popoverSurface} p-3.5 space-y-3 max-h-[80vh] overflow-y-auto`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-900 pb-2 border-b border-slate-200">
            <span>{t(lang, 'layers')}與視圖</span>
            <button
              onClick={() => setOpenDrawer('none')}
              className="text-slate-400 hover:text-slate-900 cursor-pointer"
            >
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
            {layers.populationHeatmap && (
              <div className="pt-1 pb-0.5 space-y-1">
                <div className="h-2 w-full rounded-full border border-slate-200 bg-[linear-gradient(90deg,#FFF8E0_0%,#FEF08A_16%,#FACC15_32%,#F97316_48%,#EF4444_64%,#C026D3_80%,#7E22CE_92%,#4C1D95_100%)]" />
                <div className="flex justify-between text-[10px] font-mono-tabular text-slate-500">
                  <span>0 (白/黃)</span>
                  <span>中 (橙/紅)</span>
                  <span>6 萬人/km² (紫)</span>
                </div>
                <div className="text-[10px] text-slate-400">
                  WorldPop 2020 · 七普空間網格
                </div>
              </div>
            )}
          </div>

          <div className="pt-2.5 border-t border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500">
                {t(lang, 'depthView')}
              </span>
              <button
                onClick={onToggle25D}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  is25D
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                2.5D {is25D ? '開' : '關'}
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1">
              <button
                onClick={() => onChangeDepthFilter('ALL')}
                className={`py-1 text-[11px] rounded-md font-medium cursor-pointer ${
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
                  className={`py-1 text-[11px] rounded-md font-mono-tabular font-medium cursor-pointer ${
                    layers.depthFilter === d.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                  }`}
                >
                  {d.id}
                </button>
              ))}
            </div>
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

      {/* UNIFIED SYSTEM MENU DROPDOWN */}
      {openDrawer === 'menu' && (
        <div className={`fixed top-14 right-4 z-35 w-60 ${popoverSurface} p-1.5 space-y-0.5`}>
          {/* Compact mobile nav fallbacks */}
          <div className="md:hidden grid grid-cols-2 gap-1 p-1 border-b border-slate-100 mb-1">
            <button
              onClick={() => {
                setOpenDrawer('none');
                onOpenCityStats();
              }}
              className="px-2 py-1.5 rounded-md bg-slate-50 text-xs font-medium text-slate-800 text-left cursor-pointer"
            >
              統計總覽
            </button>
            <button
              onClick={() => {
                setOpenDrawer('none');
                onOpenMetroCore('overview');
              }}
              className="px-2 py-1.5 rounded-md bg-slate-50 text-xs font-medium text-slate-800 text-left cursor-pointer"
            >
              線網中心
            </button>
            <button
              onClick={() => {
                setOpenDrawer('none');
                onOpenNetworkMap();
              }}
              className="px-2 py-1.5 rounded-md bg-slate-50 text-xs font-medium text-slate-800 text-left cursor-pointer"
            >
              路線拓撲圖
            </button>
            <button
              onClick={() => {
                setOpenDrawer('none');
                onOpenMetroCircle();
              }}
              className="px-2 py-1.5 rounded-md bg-slate-50 text-xs font-medium text-slate-800 text-left cursor-pointer"
            >
              市民動態
            </button>
          </div>

          <button
            onClick={() => {
              onAdvanceMonth();
              setOpenDrawer('none');
            }}
            className="w-full px-3 py-2 rounded-lg text-xs font-medium text-slate-800 hover:bg-slate-100 flex items-center gap-2.5 text-left transition-colors cursor-pointer"
          >
            <CalendarPlus className="w-4 h-4 text-blue-600" />
            <span>{t(lang, 'advanceMonth')}</span>
          </button>

          <button
            onClick={() => {
              setOpenDrawer('none');
              onOpenSetup();
            }}
            className="w-full px-3 py-2 rounded-lg text-xs font-medium text-slate-800 hover:bg-slate-100 flex items-center gap-2.5 text-left transition-colors cursor-pointer"
          >
            <MapIcon className="w-4 h-4 text-slate-500" />
            <span>開局與難度設定</span>
          </button>

          <button
            onClick={() => {
              setOpenDrawer('none');
              onOpenGdd();
            }}
            className="w-full px-3 py-2 rounded-lg text-xs font-medium text-slate-800 hover:bg-slate-100 flex items-center gap-2.5 text-left transition-colors cursor-pointer"
          >
            <FileText className="w-4 h-4 text-slate-500" />
            <span>系統設計文件 (GDD)</span>
          </button>

          <button
            onClick={onToggleMute}
            className="w-full px-3 py-2 rounded-lg text-xs font-medium text-slate-800 hover:bg-slate-100 flex items-center justify-between text-left transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2.5">
              {muted ? (
                <VolumeX className="w-4 h-4 text-slate-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-slate-500" />
              )}
              <span>{muted ? '音效已關閉' : '音效已開啟'}</span>
            </span>
            <span className="text-[11px] font-mono-tabular text-slate-400">
              {muted ? 'OFF' : 'ON'}
            </span>
          </button>

          <div className="border-t border-slate-100 my-1 pt-1 px-2 py-1">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1.5">
              <Globe className="w-3 h-3" />
              <span>語言 / Language</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {(['zh-Hant', 'zh-Hans', 'en'] as Language[]).map((l) => (
                <button
                  key={l}
                  onClick={() => onChangeLang(l)}
                  className={`py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    lang === l
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                  }`}
                >
                  {l === 'zh-Hant' ? '繁體' : l === 'zh-Hans' ? '简体' : 'EN'}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 my-1 pt-1">
            <button
              onClick={() => {
                setOpenDrawer('none');
                onReturnTitle();
              }}
              className="w-full px-3 py-2 rounded-lg text-xs font-medium text-rose-700 hover:bg-rose-50 flex items-center gap-2.5 text-left transition-colors cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>返回主畫面</span>
            </button>
          </div>
        </div>
      )}

      {/* SINGLE SLEEK BOTTOM-CENTER BUILD BAR (+ CONDITIONAL DRAFT STRIP) */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 max-w-[95vw]">
        {draftCount > 0 && (
          <div
            className={`${floatingBarSurface} border-blue-500/40 rounded-xl px-3.5 py-1.5 flex items-center gap-2.5 whitespace-nowrap`}
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
                className="p-1 rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-35 cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onRedoDraft}
                disabled={!canRedoDraft}
                title={t(lang, 'redo')}
                className="p-1 rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-35 cursor-pointer"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={onDiscardDraft}
              className="px-2 py-1 rounded-md bg-slate-100 hover:bg-rose-50 text-xs text-slate-700 hover:text-rose-700 transition-colors cursor-pointer"
            >
              {t(lang, 'discardDraft')}
            </button>

            <button
              onClick={onConfirmDraft}
              className="px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{t(lang, 'confirmBuild')}</span>
            </button>
          </div>
        )}

        <div className="relative">
          {/* Upward Line Picker Menu when Track Tool is active */}
          {tool === 'track' && linePickerOpen && (
            <div
              className={`absolute bottom-13 left-0 z-40 w-64 ${popoverSurface} p-1.5 space-y-0.5 max-h-64 overflow-y-auto`}
            >
              {lines.map((line) => (
                <button
                  key={line.id}
                  onClick={() => {
                    onSelectLine(line.id);
                    setLinePickerOpen(false);
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                    line.id === activeLineId
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0"
                      style={{ backgroundColor: line.color }}
                    />
                    <span className="truncate">{line.name}</span>
                  </span>
                  <span className="text-[10px] font-mono-tabular opacity-75 shrink-0 ml-2">
                    {line.speedKmh ?? 60}km/h · {line.stationIds.length}站
                  </span>
                </button>
              ))}
              <div className="border-t border-slate-100 mt-1 pt-1">
                <button
                  onClick={() => {
                    onCreateLine();
                    setLinePickerOpen(false);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-700 hover:bg-blue-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>新增地鐵路線</span>
                </button>
              </div>
            </div>
          )}

          {/* Upward Operating Speed & Turning Radius Picker when Track Tool is active */}
          {tool === 'track' && speedPickerOpen && activeLine && (() => {
            const liveKm = computeNetworkMileageKm(
              map,
              lines.filter((l) => !l.isDraft),
              segments
            );
            const curveInfo = getLineCurveAnalysis(map, activeLine, stations, segments);
            const curSpeed: LineSpeedKmh = activeLine.speedKmh ?? 60;
            const curCfg = LINE_SPEED_CONFIGS[curSpeed];
            return (
              <div className={`absolute bottom-13 left-32 z-40 w-80 ${popoverSurface} p-3 space-y-2 text-xs`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">設計運行速度 · {activeLine.name}</span>
                  <span className="font-mono-tabular text-[11px] text-slate-500">
                    里程 {liveKm.toFixed(1)} km
                  </span>
                </div>
                <div className="grid grid-cols-6 gap-1 bg-slate-100 p-1 rounded-lg">
                  {LINE_SPEED_TIERS.map((spd) => {
                    const cfg = LINE_SPEED_CONFIGS[spd];
                    const selected = curSpeed === spd;
                    const locked = liveKm < cfg.unlockKm || curveInfo.minRadiusM < cfg.minRadiusM;
                    return (
                      <button
                        key={spd}
                        onClick={() => onUpdateLine(activeLine.id, { speedKmh: spd })}
                        className={`py-1.5 rounded-md font-mono-tabular font-bold transition-colors cursor-pointer ${
                          selected
                            ? 'bg-slate-900 text-sky-300'
                            : locked
                            ? 'text-slate-400 hover:bg-slate-200/60'
                            : 'text-slate-700 hover:bg-white'
                        }`}
                      >
                        {spd}
                      </button>
                    );
                  })}
                </div>
                <div className="text-[11px] font-mono-tabular text-slate-600 flex items-center justify-between">
                  <span>
                    最小轉彎半徑 <strong className="text-slate-900">{curCfg.minRadiusM} m</strong>
                    {curCfg.isHighSpeed ? ' (高速地鐵)' : ''}
                  </span>
                  <span>
                    營運成本 <strong className="text-amber-700">×{curCfg.costMult.toFixed(2)}</strong>
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Unified Single-Row Build Dock */}
          <div
            className={`${floatingBarSurface} rounded-xl p-1 flex items-center gap-1 overflow-x-auto max-w-[95vw]`}
          >
            {/* Primary 4 Tools */}
            <div className="flex items-center gap-0.5 shrink-0">
              {(
                [
                  {
                    id: 'select',
                    label: t(lang, 'select'),
                    icon: <MousePointer2 className="w-3.5 h-3.5" />,
                  },
                  {
                    id: 'station',
                    label: t(lang, 'station'),
                    icon: <MapPin className="w-3.5 h-3.5" />,
                  },
                  {
                    id: 'track',
                    label: t(lang, 'track'),
                    icon: <Spline className="w-3.5 h-3.5" />,
                  },
                  {
                    id: 'demolish',
                    label: t(lang, 'demolish'),
                    icon: <Trash2 className="w-3.5 h-3.5" />,
                  },
                ] as { id: ToolMode; label: string; icon: React.ReactNode }[]
              ).map((item) => {
                const active = tool === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setLinePickerOpen(false);
                      setSpeedPickerOpen(false);
                      onSelectTool(item.id);
                    }}
                    className={`h-9 px-3 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? item.id === 'demolish'
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-950 text-white'
                        : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Inline Station Tool Options (Same Single Row) */}
            {tool === 'station' && (
              <>
                <div className="h-5 w-px bg-slate-200 mx-1 shrink-0" />

                <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg shrink-0">
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
                      className={`h-7 px-2.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                        elevationMode === m.id
                          ? 'bg-white text-slate-950 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-950'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {elevationMode === 'underground' && (
                  <select
                    value={activeDepth}
                    onChange={(e) => onSelectDepth(e.target.value as TrackDepth)}
                    aria-label={t(lang, 'depthView')}
                    className="h-8 px-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono-tabular font-medium text-slate-800 focus:outline-none focus:border-blue-600 cursor-pointer shrink-0"
                  >
                    {DEPTH_LEVELS.filter((d) => d.id !== 'EL').map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.shortLabel}
                      </option>
                    ))}
                  </select>
                )}

                <select
                  value={stationSize}
                  onChange={(e) => onSelectStationSize(e.target.value as StationSize)}
                  aria-label={t(lang, 'scaleLabel')}
                  className="h-8 px-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 cursor-pointer shrink-0"
                >
                  <option value="small">{t(lang, 'small')}</option>
                  <option value="standard">{t(lang, 'medium')}</option>
                  <option value="hub">{t(lang, 'large')}</option>
                  <option value="mall">{t(lang, 'mega')}</option>
                </select>

                <label className="h-8 px-2.5 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer text-xs text-slate-700 whitespace-nowrap shrink-0">
                  <input
                    type="checkbox"
                    checked={draftMode}
                    onChange={onToggleDraftMode}
                    className="w-3.5 h-3.5 accent-blue-600 rounded"
                  />
                  <span>{draftMode ? t(lang, 'draftMode') : t(lang, 'instantMode')}</span>
                </label>
              </>
            )}

            {/* Inline Track Tool Options (Same Single Row) */}
            {tool === 'track' && (
              <>
                <div className="h-5 w-px bg-slate-200 mx-1 shrink-0" />

                <button
                  onClick={() => {
                    setSpeedPickerOpen(false);
                    setLinePickerOpen((v) => !v);
                  }}
                  className="h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-xs font-medium text-slate-900 flex items-center gap-2 whitespace-nowrap cursor-pointer shrink-0"
                >
                  {activeLine && (
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0"
                      style={{ backgroundColor: activeLine.color }}
                    />
                  )}
                  <span>{activeLine ? activeLine.name : '選擇路線'}</span>
                  {linePickerOpen ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                  ) : (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                  )}
                </button>

                {activeLine && (() => {
                  const spd: LineSpeedKmh = activeLine.speedKmh ?? 60;
                  const cfg = LINE_SPEED_CONFIGS[spd];
                  return (
                    <button
                      onClick={() => {
                        setLinePickerOpen(false);
                        setSpeedPickerOpen((v) => !v);
                      }}
                      title={`設定路線設計時速（最小轉彎半徑 ${cfg.minRadiusM} m）`}
                      className={`h-8 px-2.5 rounded-lg border text-xs font-mono-tabular font-semibold whitespace-nowrap cursor-pointer shrink-0 transition-colors ${
                        cfg.isHighSpeed
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-800 hover:bg-indigo-100'
                          : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      {spd} km/h · R≥{cfg.minRadiusM}m
                    </button>
                  );
                })()}

                <button
                  onClick={() => {
                    setLinePickerOpen(false);
                    setSpeedPickerOpen(false);
                    onOpenMetroCore('lines');
                  }}
                  title="設定路線快慢車、區間車大小交路與班距"
                  className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 whitespace-nowrap cursor-pointer shrink-0"
                >
                  {activeLine?.serviceMode === 'express'
                    ? '快慢車'
                    : activeLine?.serviceMode === 'short_turn'
                    ? '區間車'
                    : activeLine?.serviceMode === 'through'
                    ? '貫通'
                    : '站站停'}
                </button>

                <select
                  value={activeDepth}
                  onChange={(e) => onSelectDepth(e.target.value as TrackDepth)}
                  aria-label={t(lang, 'depthView')}
                  className="h-8 px-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono-tabular font-medium text-slate-800 focus:outline-none focus:border-blue-600 cursor-pointer shrink-0"
                >
                  {DEPTH_LEVELS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.shortLabel}
                    </option>
                  ))}
                </select>

                <label className="h-8 px-2.5 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer text-xs text-slate-700 whitespace-nowrap shrink-0">
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
                    <div className="h-5 w-px bg-slate-200 mx-0.5 shrink-0" />
                    <div className="flex items-center gap-2 px-1.5 text-xs text-slate-800 whitespace-nowrap shrink-0">
                      <span>
                        起點: <strong>{trackStartStationName}</strong>
                        {hasTrackWaypoint ? ' (已設彎道)' : ' · 點空地彎道或點目標站'}
                      </span>
                      <button
                        onClick={onCancelTrackDraw}
                        className="text-rose-600 hover:text-rose-800 font-medium cursor-pointer"
                      >
                        取消
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* QUIET BOTTOM-RIGHT VIEWPORT STRIP */}
      <div
        className={`fixed bottom-5 right-5 z-30 ${floatingBarSurface} rounded-lg p-0.5 flex items-center gap-0.5`}
      >
        <button
          onClick={onZoomOut}
          title="縮小"
          className="w-8 h-8 rounded-md flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-950 transition-colors cursor-pointer"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onResetView}
          title={t(lang, 'resetView')}
          className="w-8 h-8 rounded-md flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-950 transition-colors cursor-pointer"
        >
          <Compass className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onZoomIn}
          title="放大"
          className="w-8 h-8 rounded-md flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-950 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <div className="h-4 w-px bg-slate-200 mx-0.5" />
        <button
          onClick={onToggle25D}
          title="切換 2.5D 視角 (快捷鍵 T)"
          className={`h-8 px-2 rounded-md flex items-center gap-1 text-[11px] font-mono-tabular font-medium transition-colors cursor-pointer ${
            is25D
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
          }`}
        >
          <Box className="w-3.5 h-3.5" />
          <span>2.5D</span>
        </button>
      </div>

      {/* FLOATING STATION INSPECTOR */}
      {selectedStation && (
        <div
          className={`fixed top-14 right-4 z-30 w-88 ${popoverSurface} p-4 space-y-3.5 max-h-[75vh] overflow-y-auto`}
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

          {/* TOD 上蓋物業開發 (Rail + Property) */}
          <div className="space-y-2 pt-2.5 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-amber-600" />
                <span>TOD 上蓋物業開發</span>
              </span>
              {selectedStation.todProperty && (
                <span className="text-[10px] font-mono-tabular font-semibold text-emerald-700">
                  +{formatCurrencyWan(selectedStation.todProperty.monthlyRentWan, lang)}/月
                </span>
              )}
            </div>

            {selectedStation.todProperty ? (
              (() => {
                const tod = selectedStation.todProperty;
                const cfg = TOD_CONFIGS[tod.kind];
                const upgradeCost = Math.round(cfg.costWan * 0.7 * difficulty.costMultiplier);
                return (
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">
                        {cfg.label} · Lv.{tod.level}
                      </span>
                      <span className="font-mono-tabular text-emerald-700 font-semibold">
                        月租 +{formatCurrencyWan(tod.monthlyRentWan, lang)}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      已併入銀行抵押授信，降低全線貸款利率並帶動周邊地價與客流。
                    </p>
                    {tod.level < 3 ? (
                      <button
                        onClick={() => onDevelopTod(selectedStation.id, tod.kind)}
                        className="w-full py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-medium font-mono-tabular cursor-pointer"
                      >
                        擴建至 Lv.{tod.level + 1} (+65% 月租 · {formatCurrencyWan(upgradeCost, lang)})
                      </button>
                    ) : (
                      <div className="text-[10px] font-medium text-amber-700 text-center py-0.5">
                        已達最高規模 Lv.3
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="space-y-1.5">
                {selectedStation.isDraft && (
                  <div className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2 py-1">
                    請先點擊底部「確認建設」竣工後即可開發上蓋物業
                  </div>
                )}
                <div className="grid grid-cols-3 gap-1.5">
                  {(['retail', 'office', 'apartment'] as TodPropertyKind[]).map((kind) => {
                    const cfg = TOD_CONFIGS[kind];
                    const devCost = Math.round(cfg.costWan * difficulty.costMultiplier);
                    return (
                      <button
                        key={kind}
                        disabled={selectedStation.isDraft}
                        onClick={() => onDevelopTod(selectedStation.id, kind)}
                        className="p-2 rounded-lg border border-slate-200 bg-white hover:border-amber-500 hover:bg-amber-50/40 disabled:opacity-45 text-left transition-colors cursor-pointer"
                      >
                        <div className="text-[11px] font-semibold text-slate-900 truncate">
                          {kind === 'retail' ? '商業廣場' : kind === 'office' ? '寫字樓' : '住宅社區'}
                        </div>
                        <div className="text-[10px] font-mono-tabular text-amber-700 mt-0.5">
                          {formatCurrencyWan(devCost, lang)}
                        </div>
                        <div className="text-[10px] font-mono-tabular text-emerald-700">
                          +{formatCurrencyWan(cfg.baseMonthlyRentWan, lang)}/月
                        </div>
                        {cfg.presaleRebateWan > 0 && (
                          <div className="text-[9px] font-mono-tabular text-blue-700">
                            即返 {formatCurrencyWan(cfg.presaleRebateWan, lang)}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2.5 pt-2.5 border-t border-slate-200 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-700 font-medium">車站標高方式</span>
              <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                {(
                  [
                    {
                      id: 'underground' as const,
                      label: t(lang, 'underground'),
                      meters: -15,
                      depth: 'B1' as TrackDepth,
                    },
                    {
                      id: 'ground' as const,
                      label: t(lang, 'ground'),
                      meters: 0,
                      depth: 'B1' as TrackDepth,
                    },
                    {
                      id: 'elevated' as const,
                      label: t(lang, 'elevated'),
                      meters: 10,
                      depth: 'EL' as TrackDepth,
                    },
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
