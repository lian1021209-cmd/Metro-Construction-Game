import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CityMap,
  DEPTH_LEVELS,
  DIFFICULTIES,
  DifficultyLevel,
  ElevationMode,
  FarePolicy,
  HistorySnapshot,
  Language,
  LayerVisibility,
  LINE_PALETTE,
  NetworkSnapshot,
  RealCityId,
  SimulationStats,
  Station,
  StationSize,
  STATION_CONFIGS,
  ToolMode,
  TrackDepth,
  TrackSegment,
  TransitLine,
} from './types/game';
import { generateCityMap, resolveNominatimStationName, suggestStationName } from './engine/noise';
import { recomputeMapCoverage, TransitRouter } from './engine/pathfinding';
import {
  analyzeTrackCrossing,
  applyDailyUrbanEvolution,
  DEFAULT_FARE_POLICY,
  findLockedDistrictAt,
  getDistrictUnlockCost,
  getStationBuildCost,
  isWaterAt,
  splitQuadraticBezier,
  stepSimulation,
} from './engine/simulation';
import { soundEngine } from './engine/audio';
import {
  fetchOverpassCityGeometry,
  latLonToWorld,
  OpenMapStyleId,
  reverseGeocodeStationPlace,
  worldToLatLon,
} from './engine/geo';
import { formatCurrencyWan } from './i18n/translations';
import { TitleScreen } from './components/TitleScreen';
import { MetroCanvas, MetroCanvasHandle } from './components/MetroCanvas';
import { FloatingHud } from './components/FloatingHud';
import { SetupModal } from './components/SetupModal';
import { GddModal } from './components/GddModal';
import { CityStatsModal } from './components/CityStatsModal';
import { NetworkDiagramModal } from './components/NetworkDiagramModal';
import { MetroCoreModal } from './components/MetroCoreModal';
import { MetroCircleModal } from './components/MetroCircleModal';

function createEmptyLine(index: number): TransitLine {
  return {
    id: `line_${Date.now()}_${index}`,
    name: `${index + 1}號線`,
    code: `L${index + 1}`,
    color: LINE_PALETTE[index % LINE_PALETTE.length],
    stationIds: [],
    segmentIds: [],
    serviceMode: 'local',
    headwayMin: 6,
    carCount: 6,
    fare: 30,
    nightMaintenance: true,
    throughTargetLineId: null,
    trains: [],
    dispatchTimer: 10,
    dailyRidership: 0,
    dailyRevenue: 0,
  };
}

function depthToDefaults(depth: TrackDepth): {
  elevationMode: ElevationMode;
  elevationMeters: number;
} {
  const found = DEPTH_LEVELS.find((d) => d.id === depth);
  return {
    elevationMode: found?.elevationMode ?? 'underground',
    elevationMeters: found?.defaultMeters ?? -15,
  };
}

function cloneSnapshot(
  stations: Station[],
  segments: TrackSegment[],
  lines: TransitLine[]
): NetworkSnapshot {
  return {
    stations: stations.map((s) => ({ ...s, waiting: s.waiting.map((w) => ({ ...w })) })),
    segments: segments.map((seg) => ({ ...seg })),
    lines: lines.map((l) => ({
      ...l,
      stationIds: [...l.stationIds],
      segmentIds: [...l.segmentIds],
      trains: l.trains.map((tr) => ({ ...tr, passengers: [...tr.passengers] })),
    })),
  };
}

function buildStarterNetwork(
  map: CityMap,
  _realCityId: RealCityId = 'shanghai'
): {
  stations: Station[];
  segments: TrackSegment[];
  lines: TransitLine[];
} {
  const w = map.width;
  const h = map.height;

  const makeSt = (
    id: string,
    name: string,
    rx: number,
    ry: number,
    size: StationSize,
    depth: TrackDepth,
    isExpressStop: boolean,
    gps?: [number, number]
  ): Station => {
    const cfg = STATION_CONFIGS[size];
    const pos =
      gps && map.geoBounds
        ? latLonToWorld(gps[0], gps[1], map.geoBounds, w, h)
        : { x: w * rx, y: h * ry };
    const elev = depthToDefaults(depth);
    return {
      id,
      name,
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      size,
      depth,
      elevationMode: elev.elevationMode,
      elevationMeters: elev.elevationMeters,
      platforms: cfg.defaultPlatforms,
      entrances: 2,
      isExpressStop,
      catchmentRadius: cfg.catchment,
      throughputCapacity: cfg.throughput,
      waiting: [],
      boardedTotal: 0,
      alightedTotal: 0,
      congestionLoad: 0,
    };
  };

  const line1Names = '1號線 (南北縱貫)';
  const line2Names = '2號線 (浦西橫貫)';
  const line3Names = '8號線 (虹口聯絡)';

  const s1 = makeSt('st_1', '徐家匯', 0.39, 0.64, 'standard', 'B1', true, [31.1945, 121.4368]);
  const s2 = makeSt('st_2', '陝西南路', 0.43, 0.53, 'standard', 'B1', false, [31.2156, 121.4586]);
  const s3 = makeSt('st_3', '人民廣場', 0.47, 0.45, 'hub', 'B2', true, [31.2328, 121.4754]);
  const s4 = makeSt('st_4', '南京東路', 0.54, 0.45, 'standard', 'B2', false, [31.2381, 121.4847]);

  const s5 = makeSt('st_5', '中山公園', 0.33, 0.47, 'standard', 'B1', true, [31.2185, 121.4167]);
  const s6 = makeSt('st_6', '靜安寺', 0.4, 0.47, 'hub', 'B2', true, [31.2236, 121.4465]);
  const s7 = makeSt('st_7', '北外灘 · 提籃橋', 0.56, 0.38, 'hub', 'B2', true, [31.2535, 121.5085]);

  const s8 = makeSt('st_8', '虹口足球場', 0.5, 0.28, 'standard', 'EL', true, [31.2715, 121.4803]);
  const s9 = makeSt('st_9', '老西門', 0.48, 0.54, 'standard', 'B1', false, [31.2186, 121.484]);
  const stations: Station[] = [s1, s2, s3, s4, s5, s6, s7, s8, s9];

  const makeSeg = (a: Station, b: Station, depth: TrackDepth, ctrlOffsetY = 0): TrackSegment => {
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2 + ctrlOffsetY;
    const info = analyzeTrackCrossing(map, a.x, a.y, cx, cy, b.x, b.y, depth, DIFFICULTIES.normal, true);
    return {
      id: `seg_${a.id}_${b.id}`,
      fromStationId: a.id,
      toStationId: b.id,
      controlX: cx,
      controlY: cy,
      depth,
      isUnderwater: info.isUnderwater,
      isBridge: info.isBridge,
      length: info.length,
      buildCost: info.cost,
    };
  };

  const seg12 = makeSeg(s1, s2, 'B1', 8);
  const seg23 = makeSeg(s2, s3, 'B2', -6);
  const seg34 = makeSeg(s3, s4, 'B2', 0);

  const seg56 = makeSeg(s5, s6, 'B1', -8);
  const seg63 = makeSeg(s6, s3, 'B2', 6);
  const seg37 = makeSeg(s3, s7, 'B3', -12);

  const seg83 = makeSeg(s8, s3, 'EL', 10);
  const seg39 = makeSeg(s3, s9, 'B1', 0);
  const seg91 = makeSeg(s9, s1, 'B1', 10);

  const lineRed: TransitLine = {
    ...createEmptyLine(0),
    id: 'line_1',
    name: line1Names,
    code: 'L1',
    color: '#E11D48',
    stationIds: [s1.id, s2.id, s3.id, s4.id],
    segmentIds: [seg12.id, seg23.id, seg34.id],
    headwayMin: 5,
    carCount: 6,
    dispatchTimer: 10,
  };

  const lineLime: TransitLine = {
    ...createEmptyLine(1),
    id: 'line_2',
    name: line2Names,
    code: 'L2',
    color: '#84CC16',
    stationIds: [s5.id, s6.id, s3.id, s7.id],
    segmentIds: [seg56.id, seg63.id, seg37.id],
    headwayMin: 5,
    carCount: 8,
    dispatchTimer: 10,
  };

  const lineYellow: TransitLine = {
    ...createEmptyLine(2),
    id: 'line_8',
    name: line3Names,
    code: 'L8',
    color: '#FACC15',
    stationIds: [s8.id, s3.id, s9.id, s1.id],
    segmentIds: [seg83.id, seg39.id, seg91.id],
    headwayMin: 6,
    carCount: 6,
    dispatchTimer: 10,
  };

  return {
    stations,
    segments: [seg12, seg23, seg34, seg56, seg63, seg37, seg83, seg39, seg91],
    lines: [lineRed, lineLime, lineYellow],
  };
}

function createHistoryEntry(
  year: number,
  day: number,
  stats: SimulationStats,
  stations: Station[],
  lines: TransitLine[]
): HistorySnapshot {
  const month = Math.min(12, Math.floor((day - 1) / 30) + 1);
  const liveStations = stations.filter((s) => !s.isDraft);
  const liveLines = lines.filter((l) => !l.isDraft);
  return {
    id: `hist_${year}_${month}_${day}_${Date.now()}`,
    label: `${year}/${month}`,
    year,
    month,
    day,
    dailyRidership: stats.dailyRidership,
    modeSharePct: stats.modeSharePercent,
    congestionIndex: stats.congestionIndex,
    satisfaction: stats.satisfaction,
    population: stats.totalPopulation,
    coveredPop: Math.round((stats.totalPopulation * stats.coveragePercent) / 100),
    stationCount: liveStations.length,
    coveragePercent: stats.coveragePercent,
    lineRiderships: liveLines.map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
      ridership: l.dailyRidership,
    })),
    topologyPreview: {
      stations: liveStations.map((s) => ({
        id: s.id,
        name: s.name,
        x: s.x,
        y: s.y,
        isHub: s.size === 'hub' || s.size === 'mall',
      })),
      lines: liveLines.map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
        stationIds: [...l.stationIds],
      })),
    },
  };
}

export default function App() {
  const initialMap = generateCityMap('real_city', 1990, 'shanghai');
  const starter = buildStarterNetwork(initialMap, 'shanghai');

  const canvasHandleRef = useRef<MetroCanvasHandle>(null);
  const routerRef = useRef(new TransitRouter());
  const simDataRef = useRef<{
    map: CityMap;
    stations: Station[];
    segments: TrackSegment[];
    lines: TransitLine[];
  }>({
    map: initialMap,
    stations: starter.stations,
    segments: starter.segments,
    lines: starter.lines,
  });

  useState(() => {
    routerRef.current.rebuild(
      simDataRef.current.stations,
      simDataRef.current.segments,
      simDataRef.current.lines
    );
    recomputeMapCoverage(simDataRef.current.map, simDataRef.current.stations);
  });

  const [lang, setLang] = useState<Language>('zh-Hant');
  const [openMapStyle, setOpenMapStyle] = useState<OpenMapStyleId>('esri_light_gray');
  const [screen, setScreen] = useState<'TITLE' | 'PLAYING'>('TITLE');
  const [realCityId, setRealCityId] = useState<RealCityId>('shanghai');
  const [difficultyId, setDifficultyId] = useState<DifficultyLevel>('normal');
  const difficulty = DIFFICULTIES[difficultyId];

  const [mapSeedKey, setMapSeedKey] = useState(`${initialMap.mode}_${initialMap.seed}`);
  const [mapVersion, setMapVersion] = useState(0);
  const [speed, setSpeed] = useState<0 | 1 | 2 | 4>(1);
  const [gameMinutesOfDay, setGameMinutesOfDay] = useState(14 * 60 + 54);
  const [day, setDay] = useState(13);
  const [year, setYear] = useState(initialMap.startYear);
  const [money, setMoney] = useState(DIFFICULTIES.normal.startingMoney);
  const [farePolicy, setFarePolicy] = useState<FarePolicy>(DEFAULT_FARE_POLICY);
  const [monthlyCapexWan, setMonthlyCapexWan] = useState(0);

  const timeRef = useRef({
    minutes: 14 * 60 + 54,
    day: 13,
    year: initialMap.startYear,
    money: DIFFICULTIES.normal.startingMoney,
    dailyRidership: 0,
    totalRidership: 0,
    dailyRevenue: 0,
    satisfaction: 84,
    avgFare: 2.6,
  });

  const [tool, setTool] = useState<ToolMode>('select');
  const [is25D, setIs25D] = useState(false);
  const [stationSize, setStationSize] = useState<StationSize>('standard');
  const [elevationMode, setElevationMode] = useState<ElevationMode>('underground');
  const [activeDepth, setActiveDepth] = useState<TrackDepth>('B1');

  const [draftMode, setDraftMode] = useState(true);
  const [draftPast, setDraftPast] = useState<NetworkSnapshot[]>([]);
  const [draftFuture, setDraftFuture] = useState<NetworkSnapshot[]>([]);

  const [linesSnapshot, setLinesSnapshot] = useState<TransitLine[]>(starter.lines);
  const [stationsSnapshot, setStationsSnapshot] = useState<Station[]>(starter.stations);
  const [segmentsSnapshot, setSegmentsSnapshot] = useState<TrackSegment[]>(starter.segments);
  const [activeLineId, setActiveLineId] = useState<string>(starter.lines[0].id);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [trackStartStationId, setTrackStartStationId] = useState<string | null>(null);
  const [trackWaypoint, setTrackWaypoint] = useState<{ x: number; y: number } | null>(null);

  const [layers, setLayers] = useState<LayerVisibility>({
    populationHeatmap: true,
    metroCoverageOverlay: false,
    zones: false,
    catchmentRings: true,
    congestionOverlay: true,
    depthFilter: 'ALL',
  });

  const computeStatsObj = useCallback(
    (sim: {
      map: CityMap;
      stations: Station[];
      segments: TrackSegment[];
      lines: TransitLine[];
    }): SimulationStats => {
      const liveStations = sim.stations.filter((s) => !s.isDraft);
      const liveSegments = sim.segments.filter((seg) => !seg.isDraft);
      const liveLines = sim.lines.filter((l) => !l.isDraft);
      const cov = recomputeMapCoverage(sim.map, liveStations);
      const waitingTotal = liveStations.reduce((sum, s) => sum + s.waiting.length, 0);
      const dailyMaint = Math.round(
        (liveStations.reduce((sum, s) => sum + STATION_CONFIGS[s.size].maintenance, 0) +
          liveSegments.length * 14 +
          liveLines.reduce((sum, l) => sum + l.trains.length * 12, 0)) *
          difficulty.maintenanceMultiplier
      );
      const dailyTotalCityTrips = Math.max(120000, Math.round(cov.totalPopulation * 1.45));
      const modeSharePercent = Math.min(
        85,
        Number(
          Math.max(
            cov.coveragePercent * 0.24,
            (timeRef.current.dailyRidership / dailyTotalCityTrips) * 100
          ).toFixed(1)
        )
      );
      const congestionIndex = Number((1.0 + (cov.avgCongestion / 100) * 1.65).toFixed(2));
      const peakCongestionIndex = Number((congestionIndex * 1.16).toFixed(2));
      const gdpBillions = Number(
        (
          (cov.totalPopulation / 10000) *
          (0.32 + modeSharePercent * 0.008) *
          (1 + (timeRef.current.year - sim.map.startYear) * 0.03)
        ).toFixed(1)
      );

      return {
        ...cov,
        modeSharePercent,
        congestionIndex,
        peakCongestionIndex,
        satisfaction: timeRef.current.satisfaction,
        dailyRidership: timeRef.current.dailyRidership,
        dailyTotalCityTrips,
        totalRidership: timeRef.current.totalRidership,
        dailyRevenue: Number(timeRef.current.dailyRevenue.toFixed(1)),
        dailyMaintenance: dailyMaint,
        activePassengersWaiting: waitingTotal,
        avgFare: timeRef.current.avgFare,
        gdpBillions,
      };
    },
    [difficulty]
  );

  const [stats, setStats] = useState<SimulationStats>(() => computeStatsObj(simDataRef.current));
  const [history, setHistory] = useState<HistorySnapshot[]>(() => [
    createHistoryEntry(
      initialMap.startYear,
      1,
      computeStatsObj(simDataRef.current),
      starter.stations,
      starter.lines
    ),
  ]);

  const [muted, setMuted] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [gddOpen, setGddOpen] = useState(false);
  const [cityStatsOpen, setCityStatsOpen] = useState(false);
  const [networkMapOpen, setNetworkMapOpen] = useState(false);
  const [metroCoreState, setMetroCoreState] = useState<{
    open: boolean;
    tab: 'overview' | 'lines' | 'stations' | 'fleet' | 'fares';
  }>({ open: false, tab: 'overview' });
  const [metroCircleOpen, setMetroCircleOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  const hydrateRealCityOverpass = useCallback((targetMap: CityMap) => {
    if (!targetMap.geoBounds) return;
    fetchOverpassCityGeometry(targetMap.geoBounds, targetMap.width, targetMap.height).then(
      (res) => {
        if (!res || simDataRef.current.map !== targetMap) return;
        if (res.roads.length > 0) targetMap.roads = res.roads;
        if (res.buildings.length > 0) targetMap.buildings = res.buildings;
        if (res.pois.length > 0) {
          const existingNames = new Set(targetMap.pois.map((p) => p.name));
          targetMap.pois = [
            ...targetMap.pois,
            ...res.pois.filter((p) => !existingNames.has(p.name)).slice(0, 14),
          ];
        }
        setMapVersion((v) => v + 1);
      }
    );
  }, []);

  useEffect(() => {
    hydrateRealCityOverpass(simDataRef.current.map);
  }, [hydrateRealCityOverpass]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const syncUiSnapshots = useCallback(() => {
    const sim = simDataRef.current;
    setStationsSnapshot([...sim.stations]);
    setSegmentsSnapshot([...sim.segments]);
    setLinesSnapshot([...sim.lines]);
    setGameMinutesOfDay(timeRef.current.minutes);
    setDay(timeRef.current.day);
    setYear(timeRef.current.year);
    setMoney(timeRef.current.money);
    setStats(computeStatsObj(sim));
  }, [computeStatsObj]);

  // 60fps simulation loop
  useEffect(() => {
    if (screen !== 'PLAYING') return;
    let rafId = 0;
    let lastTs = performance.now();
    let uiSyncAccumulator = 0;

    const tick = (now: number) => {
      const dtReal = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      if (speed > 0) {
        const dtSimMinutes = dtReal * 3 * speed;
        const sim = simDataRef.current;

        const prevMin = timeRef.current.minutes;
        let nextMin = prevMin + dtSimMinutes;
        if (nextMin >= 1440) {
          nextMin -= 1440;
          const prevMonth = Math.min(12, Math.floor((timeRef.current.day - 1) / 30) + 1);
          timeRef.current.day += 1;
          if (timeRef.current.day > 360) {
            timeRef.current.day = 1;
            timeRef.current.year += 1;
          }
          const nextMonth = Math.min(12, Math.floor((timeRef.current.day - 1) / 30) + 1);

          if (nextMonth !== prevMonth) {
            const snapStats = computeStatsObj(sim);
            setHistory((prev) => [
              ...prev.slice(-59),
              createHistoryEntry(
                timeRef.current.year,
                timeRef.current.day,
                snapStats,
                sim.stations,
                sim.lines
              ),
            ]);
            setMonthlyCapexWan(0);
          }

          const liveStations = sim.stations.filter((s) => !s.isDraft);
          const liveSegments = sim.segments.filter((seg) => !seg.isDraft);
          const liveLines = sim.lines.filter((l) => !l.isDraft);
          const maint = Math.round(
            (liveStations.reduce((sum, s) => sum + STATION_CONFIGS[s.size].maintenance, 0) +
              liveSegments.length * 14 +
              liveLines.reduce((sum, l) => sum + l.trains.length * 12, 0)) *
              difficulty.maintenanceMultiplier
          );
          timeRef.current.money -= maint;
          timeRef.current.dailyRidership = 0;
          timeRef.current.dailyRevenue = 0;
          for (const l of sim.lines) {
            l.dailyRidership = 0;
            l.dailyRevenue = 0;
          }
          applyDailyUrbanEvolution(sim.map, timeRef.current.day, timeRef.current.year);
        }
        timeRef.current.minutes = nextMin;

        const res = stepSimulation(
          dtSimMinutes,
          dtReal * speed,
          timeRef.current.minutes,
          sim.map,
          sim.stations,
          sim.segments,
          sim.lines,
          routerRef.current,
          difficulty,
          farePolicy
        );

        timeRef.current.dailyRidership += res.ridershipDelta;
        timeRef.current.totalRidership += res.ridershipDelta;
        timeRef.current.dailyRevenue += res.revenueDelta;
        timeRef.current.money += res.revenueDelta;
        timeRef.current.satisfaction = res.satisfaction;
        timeRef.current.avgFare = res.avgFare;
      }

      uiSyncAccumulator += dtReal;
      if (uiSyncAccumulator >= 0.25) {
        uiSyncAccumulator = 0;
        syncUiSnapshots();
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [screen, speed, difficulty, farePolicy, computeStatsObj, syncUiSnapshots]);

  // Keyboard shortcuts (including T for 2D/2.5D toggle)
  useEffect(() => {
    if (screen !== 'PLAYING') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const k = e.key.toLowerCase();
      if (k === 'v') setTool('select');
      else if (k === 's') setTool('station');
      else if (k === 'r') setTool('track');
      else if (k === 't') setIs25D((v) => !v);
      else if (k === 'x') setTool('demolish');
      else if (k === 'escape') {
        setTrackStartStationId(null);
        setTrackWaypoint(null);
        setSelectedStationId(null);
      } else if (e.code === 'Space') {
        e.preventDefault();
        setSpeed((prev) => (prev === 0 ? 1 : 0));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screen]);

  const pushDraftUndo = useCallback(() => {
    const sim = simDataRef.current;
    const snap = cloneSnapshot(sim.stations, sim.segments, sim.lines);
    setDraftPast((prev) => [...prev.slice(-24), snap]);
    setDraftFuture([]);
  }, []);

  const restoreSnapshot = useCallback(
    (snap: NetworkSnapshot) => {
      const sim = simDataRef.current;
      sim.stations = snap.stations;
      sim.segments = snap.segments;
      sim.lines = snap.lines;
      routerRef.current.rebuild(sim.stations, sim.segments, sim.lines);
      syncUiSnapshots();
    },
    [syncUiSnapshots]
  );

  const handleUndoDraft = useCallback(() => {
    if (draftPast.length === 0) return;
    const sim = simDataRef.current;
    const current = cloneSnapshot(sim.stations, sim.segments, sim.lines);
    const prev = draftPast[draftPast.length - 1];
    setDraftFuture((f) => [current, ...f]);
    setDraftPast((p) => p.slice(0, -1));
    restoreSnapshot(prev);
    soundEngine.playUiClick();
  }, [draftPast, restoreSnapshot]);

  const handleRedoDraft = useCallback(() => {
    if (draftFuture.length === 0) return;
    const sim = simDataRef.current;
    const current = cloneSnapshot(sim.stations, sim.segments, sim.lines);
    const next = draftFuture[0];
    setDraftPast((p) => [...p, current]);
    setDraftFuture((f) => f.slice(1));
    restoreSnapshot(next);
    soundEngine.playUiClick();
  }, [draftFuture, restoreSnapshot]);

  const handleDiscardDraft = useCallback(() => {
    if (draftPast.length > 0) {
      restoreSnapshot(draftPast[0]);
    } else {
      const sim = simDataRef.current;
      sim.stations = sim.stations.filter((s) => !s.isDraft);
      sim.segments = sim.segments.filter((seg) => !seg.isDraft);
      const validIds = new Set(sim.stations.map((s) => s.id));
      for (const l of sim.lines) {
        l.stationIds = l.stationIds.filter((id) => validIds.has(id));
      }
      routerRef.current.rebuild(sim.stations, sim.segments, sim.lines);
      syncUiSnapshots();
    }
    setDraftPast([]);
    setDraftFuture([]);
    setTrackStartStationId(null);
    setTrackWaypoint(null);
    soundEngine.playUiClick();
    showToast('已放棄草案修改');
  }, [draftPast, restoreSnapshot, showToast, syncUiSnapshots]);

  const draftSummary = useMemo(() => {
    const draftStations = stationsSnapshot.filter((s) => s.isDraft);
    const draftSegments = segmentsSnapshot.filter((s) => s.isDraft);
    let costWan = 0;
    let warnings = 0;
    const map = simDataRef.current.map;

    for (const s of draftStations) {
      const onWater = isWaterAt(map, s.x, s.y).isWater;
      if (onWater) warnings++;
      costWan += getStationBuildCost(s.size, s.depth, onWater, difficulty, true);
    }
    for (const seg of draftSegments) {
      if (seg.isUnderwater || seg.isBridge) warnings++;
      costWan += seg.buildCost;
    }

    return {
      count: draftStations.length + draftSegments.length,
      costWan,
      warnings,
    };
  }, [stationsSnapshot, segmentsSnapshot, difficulty]);

  const handleConfirmDraft = useCallback(() => {
    const actualCost = draftSummary.costWan;
    if (timeRef.current.money < actualCost) {
      soundEngine.playError();
      showToast(`資金不足，確認建設需 ${formatCurrencyWan(actualCost, lang)}`);
      return;
    }

    const sim = simDataRef.current;
    timeRef.current.money -= actualCost;
    setMonthlyCapexWan((c) => c + draftSummary.costWan);

    for (const s of sim.stations) s.isDraft = false;
    for (const seg of sim.segments) seg.isDraft = false;
    for (const l of sim.lines) l.isDraft = false;

    setDraftPast([]);
    setDraftFuture([]);
    routerRef.current.rebuild(sim.stations, sim.segments, sim.lines);
    soundEngine.playTrackConnected();
    syncUiSnapshots();
    showToast(`已正式竣工 ${draftSummary.count} 項工程`);
  }, [difficulty, draftSummary, lang, showToast, syncUiSnapshots]);

  const handleAdvanceMonth = () => {
    const sim = simDataRef.current;
    for (let i = 0; i < 30; i++) {
      timeRef.current.day += 1;
      if (timeRef.current.day > 360) {
        timeRef.current.day = 1;
        timeRef.current.year += 1;
      }
      applyDailyUrbanEvolution(sim.map, timeRef.current.day, timeRef.current.year);
    }
    const snapStats = computeStatsObj(sim);
    setHistory((prev) => [
      ...prev.slice(-59),
      createHistoryEntry(
        timeRef.current.year,
        timeRef.current.day,
        snapStats,
        sim.stations,
        sim.lines
      ),
    ]);
    setMonthlyCapexWan(0);
    soundEngine.playUiClick();
    syncUiSnapshots();
    showToast(`時間推進至 ${timeRef.current.year}年 · 都市演化已更新`);
  };

  const handlePlaceStation = useCallback(
    (wx: number, wy: number) => {
      const sim = simDataRef.current;
      const waterCheck = isWaterAt(sim.map, wx, wy);
      if (waterCheck.isWater) {
        soundEngine.playError();
        showToast(
          waterCheck.reason === 'sea'
            ? '無法於海上或市界水域設站，請將站點設於上海陸域！'
            : '無法於黃浦江、蘇州河或湖泊水面設站，僅可透過軌道跨河！'
        );
        return;
      }

      const lockedDist = findLockedDistrictAt(sim.map, wx, wy);
      if (lockedDist) {
        const unlockCost = getDistrictUnlockCost(lockedDist, difficulty);
        soundEngine.playError();
        showToast(
          `「${lockedDist.name}」尚未解鎖，點擊地圖鎖頭花費 ${formatCurrencyWan(unlockCost, lang)} 解鎖`
        );
        return;
      }

      const effDepth: TrackDepth = elevationMode === 'elevated' ? 'EL' : activeDepth;
      const effMeters =
        elevationMode === 'elevated'
          ? 10
          : elevationMode === 'ground'
          ? 0
          : depthToDefaults(effDepth).elevationMeters;

      const cost = getStationBuildCost(stationSize, effDepth, false, difficulty, !draftMode);
      if (!draftMode && timeRef.current.money < cost) {
        soundEngine.playError();
        showToast(`資金不足，建設此車站需 ${formatCurrencyWan(cost, lang)}`);
        return;
      }

      if (draftMode) pushDraftUndo();

      const cfg = STATION_CONFIGS[stationSize];
      const targetX = Math.round(wx);
      const targetY = Math.round(wy);
      const initialName = suggestStationName(sim.map, targetX, targetY, sim.stations);
      const newStation: Station = {
        id: `st_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        name: initialName,
        x: targetX,
        y: targetY,
        size: stationSize,
        depth: effDepth,
        elevationMode,
        elevationMeters: effMeters,
        platforms: cfg.defaultPlatforms,
        entrances: 2,
        isExpressStop: stationSize === 'hub' || stationSize === 'mall',
        catchmentRadius: cfg.catchment,
        throughputCapacity: cfg.throughput,
        waiting: [],
        boardedTotal: 0,
        alightedTotal: 0,
        congestionLoad: 0,
        isDraft: draftMode,
      };

      if (!draftMode) {
        timeRef.current.money -= cost;
        setMonthlyCapexWan((c) => c + getStationBuildCost(stationSize, effDepth, false, difficulty, true));
      }

      sim.stations.push(newStation);
      routerRef.current.rebuild(sim.stations, sim.segments, sim.lines);
      soundEngine.playStationPlaced();
      setSelectedStationId(newStation.id);
      syncUiSnapshots();
      showToast(`${draftMode ? '[草案] ' : ''}已放置「${newStation.name}」`);

      if (sim.map.geoBounds) {
        const ll = worldToLatLon(newStation.x, newStation.y, sim.map.geoBounds, sim.map.width, sim.map.height);
        reverseGeocodeStationPlace(ll.lat, ll.lon).then((place) => {
          if (!place) return;
          const live = simDataRef.current.stations.find((s) => s.id === newStation.id);
          if (!live || live.name !== initialName) return;
          const refined = resolveNominatimStationName(
            place,
            simDataRef.current.map,
            live.x,
            live.y,
            simDataRef.current.stations.filter((s) => s.id !== live.id)
          );
          if (refined && refined !== live.name) {
            live.name = refined;
            syncUiSnapshots();
            showToast(`已依實地路名／地標更新站名：「${refined}」`);
          }
        });
      }
    },
    [stationSize, elevationMode, activeDepth, difficulty, draftMode, lang, pushDraftUndo, showToast, syncUiSnapshots]
  );

  const handleInsertStationOnSegment = useCallback(
    (segmentId: string, tParam: number, _wx: number, _wy: number) => {
      const sim = simDataRef.current;
      const segIdx = sim.segments.findIndex((s) => s.id === segmentId);
      if (segIdx === -1) return;
      const seg = sim.segments[segIdx];
      const stA = sim.stations.find((s) => s.id === seg.fromStationId);
      const stB = sim.stations.find((s) => s.id === seg.toStationId);
      if (!stA || !stB) return;

      const split = splitQuadraticBezier(
        stA.x,
        stA.y,
        seg.controlX,
        seg.controlY,
        stB.x,
        stB.y,
        tParam
      );

      const waterCheck = isWaterAt(sim.map, split.mx, split.my);
      if (waterCheck.isWater) {
        soundEngine.playError();
        showToast('無法於海上、江河或湖泊水面插入車站！');
        return;
      }

      const lockedDist = findLockedDistrictAt(sim.map, split.mx, split.my);
      if (lockedDist) {
        const unlockCost = getDistrictUnlockCost(lockedDist, difficulty);
        soundEngine.playError();
        showToast(
          `「${lockedDist.name}」尚未解鎖，點擊地圖鎖頭花費 ${formatCurrencyWan(unlockCost, lang)} 解鎖`
        );
        return;
      }

      const cost = getStationBuildCost(stationSize, seg.depth, false, difficulty, !draftMode);

      if (!draftMode && timeRef.current.money < cost) {
        soundEngine.playError();
        showToast(`資金不足，插入車站需 ${formatCurrencyWan(cost, lang)}`);
        return;
      }

      if (draftMode) pushDraftUndo();

      const cfg = STATION_CONFIGS[stationSize];
      const elev = depthToDefaults(seg.depth);
      const targetX = Math.round(split.mx);
      const targetY = Math.round(split.my);
      const initialName = suggestStationName(sim.map, targetX, targetY, sim.stations);
      const newStation: Station = {
        id: `st_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        name: initialName,
        x: targetX,
        y: targetY,
        size: stationSize,
        depth: seg.depth,
        elevationMode: elev.elevationMode,
        elevationMeters: elev.elevationMeters,
        platforms: cfg.defaultPlatforms,
        entrances: 2,
        isExpressStop: stationSize === 'hub' || stationSize === 'mall',
        catchmentRadius: cfg.catchment,
        throughputCapacity: cfg.throughput,
        waiting: [],
        boardedTotal: 0,
        alightedTotal: 0,
        congestionLoad: 0,
        isDraft: draftMode,
      };

      if (sim.map.geoBounds) {
        const ll = worldToLatLon(newStation.x, newStation.y, sim.map.geoBounds, sim.map.width, sim.map.height);
        reverseGeocodeStationPlace(ll.lat, ll.lon).then((place) => {
          if (!place) return;
          const live = simDataRef.current.stations.find((s) => s.id === newStation.id);
          if (!live || live.name !== initialName) return;
          const refined = resolveNominatimStationName(
            place,
            simDataRef.current.map,
            live.x,
            live.y,
            simDataRef.current.stations.filter((s) => s.id !== live.id)
          );
          if (refined && refined !== live.name) {
            live.name = refined;
            syncUiSnapshots();
            showToast(`已依實地路名／地標更新站名：「${refined}」`);
          }
        });
      }

      const infoL = analyzeTrackCrossing(
        sim.map,
        stA.x,
        stA.y,
        split.leftCtrl.x,
        split.leftCtrl.y,
        newStation.x,
        newStation.y,
        seg.depth,
        difficulty,
        true
      );
      const infoR = analyzeTrackCrossing(
        sim.map,
        newStation.x,
        newStation.y,
        split.rightCtrl.x,
        split.rightCtrl.y,
        stB.x,
        stB.y,
        seg.depth,
        difficulty,
        true
      );

      const leftSeg: TrackSegment = {
        id: `seg_${Date.now()}_l_${Math.random().toString(36).slice(2, 4)}`,
        fromStationId: stA.id,
        toStationId: newStation.id,
        controlX: split.leftCtrl.x,
        controlY: split.leftCtrl.y,
        depth: seg.depth,
        isUnderwater: infoL.isUnderwater,
        isBridge: infoL.isBridge,
        length: infoL.length,
        buildCost: 0,
        isDraft: draftMode || seg.isDraft,
      };
      const rightSeg: TrackSegment = {
        id: `seg_${Date.now()}_r_${Math.random().toString(36).slice(2, 4)}`,
        fromStationId: newStation.id,
        toStationId: stB.id,
        controlX: split.rightCtrl.x,
        controlY: split.rightCtrl.y,
        depth: seg.depth,
        isUnderwater: infoR.isUnderwater,
        isBridge: infoR.isBridge,
        length: infoR.length,
        buildCost: 0,
        isDraft: draftMode || seg.isDraft,
      };

      sim.stations.push(newStation);
      sim.segments.splice(segIdx, 1, leftSeg, rightSeg);

      for (const line of sim.lines) {
        for (let i = 0; i < line.stationIds.length - 1; i++) {
          const a = line.stationIds[i];
          const b = line.stationIds[i + 1];
          if ((a === stA.id && b === stB.id) || (a === stB.id && b === stA.id)) {
            line.stationIds.splice(i + 1, 0, newStation.id);
            break;
          }
        }
        const sPos = line.segmentIds.indexOf(seg.id);
        if (sPos !== -1) {
          line.segmentIds.splice(sPos, 1, leftSeg.id, rightSeg.id);
        }
      }

      if (!draftMode) {
        timeRef.current.money -= cost;
        setMonthlyCapexWan((c) => c + getStationBuildCost(stationSize, seg.depth, false, difficulty, true));
      }

      routerRef.current.rebuild(sim.stations, sim.segments, sim.lines);
      soundEngine.playStationPlaced();
      setSelectedStationId(newStation.id);
      syncUiSnapshots();
      showToast(`已在軌道上插入「${newStation.name}」`);
    },
    [stationSize, difficulty, draftMode, lang, pushDraftUndo, showToast, syncUiSnapshots]
  );

  const handleTrackClickStation = useCallback(
    (stationId: string) => {
      const sim = simDataRef.current;
      if (!trackStartStationId) {
        setTrackStartStationId(stationId);
        setTrackWaypoint(null);
        soundEngine.playUiClick();
        return;
      }

      if (trackStartStationId === stationId) {
        setTrackStartStationId(null);
        setTrackWaypoint(null);
        return;
      }

      const stA = sim.stations.find((s) => s.id === trackStartStationId);
      const stB = sim.stations.find((s) => s.id === stationId);
      const line = sim.lines.find((l) => l.id === activeLineId);
      if (!stA || !stB || !line) return;

      const cx = trackWaypoint ? trackWaypoint.x : (stA.x + stB.x) / 2;
      const cy = trackWaypoint ? trackWaypoint.y : (stA.y + stB.y) / 2;
      const info = analyzeTrackCrossing(
        sim.map,
        stA.x,
        stA.y,
        cx,
        cy,
        stB.x,
        stB.y,
        activeDepth,
        difficulty,
        true
      );

      const payCost = info.cost;
      if (!draftMode && timeRef.current.money < payCost) {
        soundEngine.playError();
        showToast(`資金不足，開挖此段軌道需 ${formatCurrencyWan(payCost, lang)}`);
        return;
      }

      if (draftMode) pushDraftUndo();

      const seg: TrackSegment = {
        id: `seg_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        fromStationId: stA.id,
        toStationId: stB.id,
        controlX: cx,
        controlY: cy,
        depth: activeDepth,
        isUnderwater: info.isUnderwater,
        isBridge: info.isBridge,
        length: info.length,
        buildCost: info.cost,
        isDraft: draftMode,
      };

      sim.segments.push(seg);

      if (line.stationIds.length === 0) {
        line.stationIds.push(stA.id, stB.id);
      } else if (line.stationIds[line.stationIds.length - 1] === stA.id) {
        if (!line.stationIds.includes(stB.id)) line.stationIds.push(stB.id);
      } else if (line.stationIds[0] === stA.id) {
        if (!line.stationIds.includes(stB.id)) line.stationIds.unshift(stB.id);
      } else {
        if (!line.stationIds.includes(stA.id)) line.stationIds.push(stA.id);
        if (!line.stationIds.includes(stB.id)) line.stationIds.push(stB.id);
      }
      line.segmentIds.push(seg.id);

      if (!draftMode) {
        timeRef.current.money -= payCost;
        setMonthlyCapexWan((c) => c + info.cost);
      }

      routerRef.current.rebuild(sim.stations, sim.segments, sim.lines);
      soundEngine.playTrackConnected();
      setTrackStartStationId(stB.id);
      setTrackWaypoint(null);
      syncUiSnapshots();

      const tag = info.isUnderwater ? '（潛盾過江）' : info.isBridge ? '（跨河橋）' : '';
      showToast(`${draftMode ? '[草案] ' : ''}${line.name}: ${stA.name} ↔ ${stB.name} ${tag}`);
    },
    [
      trackStartStationId,
      trackWaypoint,
      activeLineId,
      activeDepth,
      difficulty,
      draftMode,
      lang,
      pushDraftUndo,
      showToast,
      syncUiSnapshots,
    ]
  );

  const handleDeleteStation = useCallback(
    (id: string) => {
      const sim = simDataRef.current;
      const target = sim.stations.find((s) => s.id === id);
      sim.stations = sim.stations.filter((s) => s.id !== id);
      sim.segments = sim.segments.filter(
        (seg) => seg.fromStationId !== id && seg.toStationId !== id
      );
      for (const line of sim.lines) {
        line.stationIds = line.stationIds.filter((sid) => sid !== id);
        if (line.stationIds.length < 2) line.trains = [];
      }
      if (selectedStationId === id) setSelectedStationId(null);
      routerRef.current.rebuild(sim.stations, sim.segments, sim.lines);
      soundEngine.playUiClick();
      syncUiSnapshots();
      if (target) showToast(`已拆除「${target.name}」`);
    },
    [selectedStationId, showToast, syncUiSnapshots]
  );

  const handleDemolishAt = useCallback(
    (wx: number, wy: number) => {
      const sim = simDataRef.current;
      let nearest: Station | null = null;
      let bestD = 30;
      for (const st of sim.stations) {
        const d = Math.hypot(st.x - wx, st.y - wy);
        if (d < bestD) {
          bestD = d;
          nearest = st;
        }
      }
      if (nearest) handleDeleteStation(nearest.id);
    },
    [handleDeleteStation]
  );

  const handleCreateLine = () => {
    const sim = simDataRef.current;
    const newLine = createEmptyLine(sim.lines.length);
    sim.lines.push(newLine);
    setActiveLineId(newLine.id);
    soundEngine.playUiClick();
    syncUiSnapshots();
  };

  const handleUpdateLine = (id: string, patch: Partial<TransitLine>) => {
    const sim = simDataRef.current;
    const line = sim.lines.find((l) => l.id === id);
    if (!line) return;
    Object.assign(line, patch);
    routerRef.current.rebuild(sim.stations, sim.segments, sim.lines);
    syncUiSnapshots();
  };

  const handleDeleteLine = (id: string) => {
    const sim = simDataRef.current;
    if (sim.lines.length <= 1) return;
    sim.lines = sim.lines.filter((l) => l.id !== id);
    if (activeLineId === id) setActiveLineId(sim.lines[0].id);
    routerRef.current.rebuild(sim.stations, sim.segments, sim.lines);
    syncUiSnapshots();
  };

  const handleUpdateStation = (id: string, patch: Partial<Station>) => {
    const sim = simDataRef.current;
    const st = sim.stations.find((s) => s.id === id);
    if (!st) return;
    Object.assign(st, patch);
    routerRef.current.rebuild(sim.stations, sim.segments, sim.lines);
    syncUiSnapshots();
  };

  const handleUpgradeStation = (id: string, newSize: StationSize) => {
    const sim = simDataRef.current;
    const st = sim.stations.find((s) => s.id === id);
    if (!st || st.size === newSize) return;
    const oldCfg = STATION_CONFIGS[st.size];
    const newCfg = STATION_CONFIGS[newSize];
    const diffCost = Math.max(0, Math.round((newCfg.cost - oldCfg.cost * 0.5) * difficulty.costMultiplier));

    if (timeRef.current.money < diffCost) {
      soundEngine.playError();
      showToast(`資金不足，升級車站需 ${formatCurrencyWan(diffCost, lang)}`);
      return;
    }

    timeRef.current.money -= diffCost;
    setMonthlyCapexWan((c) => c + Math.round((newCfg.cost - oldCfg.cost * 0.5) * difficulty.costMultiplier));
    st.size = newSize;
    st.platforms = Math.max(st.platforms, newCfg.defaultPlatforms);
    st.catchmentRadius = newCfg.catchment;
    st.throughputCapacity = newCfg.throughput;
    if (newSize === 'hub' || newSize === 'mall') st.isExpressStop = true;

    soundEngine.playStationPlaced();
    routerRef.current.rebuild(sim.stations, sim.segments, sim.lines);
    syncUiSnapshots();
    showToast(`${st.name} 已升級為「${newCfg.label}」`);
  };

  const handleUnlockDistrict = useCallback(
    (districtId: string) => {
      const sim = simDataRef.current;
      const dist = sim.map.districts.find((d) => d.id === districtId);
      if (!dist || dist.unlocked) return;

      const cost = getDistrictUnlockCost(dist, difficulty);
      if (timeRef.current.money < cost) {
        soundEngine.playError();
        showToast(`資金不足，解鎖「${dist.name}」需 ${formatCurrencyWan(cost, lang)}`);
        return;
      }

      timeRef.current.money -= cost;
      setMonthlyCapexWan((c) => c + cost);
      dist.unlocked = true;
      soundEngine.playTrackConnected();
      setMapVersion((v) => v + 1);
      syncUiSnapshots();
      showToast(`已花費 ${formatCurrencyWan(cost, lang)} 解鎖「${dist.name}」`);
    },
    [difficulty, lang, showToast, syncUiSnapshots]
  );

  const handleApplyNewSetup = (
    nextRealCity: RealCityId,
    nextDifficulty: DifficultyLevel,
    seed: number
  ) => {
    const newMap = generateCityMap('real_city', seed, nextRealCity);
    const diffCfg = DIFFICULTIES[nextDifficulty];

    setRealCityId(nextRealCity);
    setDifficultyId(nextDifficulty);

    const starterLine = createEmptyLine(0);
    simDataRef.current = {
      map: newMap,
      stations: [],
      segments: [],
      lines: [starterLine],
    };

    timeRef.current = {
      minutes: 8 * 60,
      day: 1,
      year: newMap.startYear,
      money: diffCfg.startingMoney,
      dailyRidership: 0,
      totalRidership: 0,
      dailyRevenue: 0,
      satisfaction: 88,
      avgFare: DEFAULT_FARE_POLICY.baseFare,
    };

    setDraftPast([]);
    setDraftFuture([]);
    setMonthlyCapexWan(0);
    setActiveLineId(starterLine.id);
    setSelectedStationId(null);
    setTrackStartStationId(null);
    setTrackWaypoint(null);
    setMapSeedKey(`${newMap.mode}_${newMap.seed}`);
    setTool('station');
    setScreen('PLAYING');

    routerRef.current.rebuild([], [], [starterLine]);
    const freshStats = computeStatsObj(simDataRef.current);
    setHistory([createHistoryEntry(newMap.startYear, 1, freshStats, [], [starterLine])]);
    syncUiSnapshots();
    hydrateRealCityOverpass(newMap);
    showToast(`已載入：${newMap.name} (${diffCfg.label})`);
  };

  const handleBuildDemoNetwork = () => {
    const sim = simDataRef.current;
    const demo = buildStarterNetwork(sim.map, realCityId);
    sim.stations = demo.stations;
    sim.segments = demo.segments;
    sim.lines = demo.lines;
    setDraftPast([]);
    setDraftFuture([]);
    setActiveLineId(demo.lines[0].id);
    setSelectedStationId(null);
    setTrackStartStationId(null);
    routerRef.current.rebuild(sim.stations, sim.segments, sim.lines);
    soundEngine.playTrackConnected();
    syncUiSnapshots();
    showToast('已鋪設多線交叉轉運示範路網');
  };

  const selectedStation = stationsSnapshot.find((s) => s.id === selectedStationId) ?? null;
  const trackStartStation = stationsSnapshot.find((s) => s.id === trackStartStationId) ?? null;
  const unreadCircleCount = useMemo(() => {
    let count = 3;
    if (stats.congestionIndex > 1.7) count += 2;
    if (stats.coveragePercent < 40) count += 2;
    return Math.min(9, count);
  }, [stats.congestionIndex, stats.coveragePercent]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#F5F7FA] text-slate-900">
      {screen === 'TITLE' ? (
        <TitleScreen
          currentCityLabel={`${simDataRef.current.map.name} · ${year}年`}
          muted={muted}
          onToggleMute={() => {
            const next = !muted;
            soundEngine.muted = next;
            setMuted(next);
          }}
          onStartNewGame={() => setSetupOpen(true)}
          onContinueGame={() => setScreen('PLAYING')}
          onQuickDemo={() => {
            handleBuildDemoNetwork();
            setScreen('PLAYING');
          }}
          onOpenGdd={() => setGddOpen(true)}
        />
      ) : (
        <>
          {/* 100% Full-Bleed Cartographic Map Canvas */}
          <MetroCanvas
            ref={canvasHandleRef}
            simDataRef={simDataRef}
            lang={lang}
            openMapStyle={openMapStyle}
            mapSeedKey={mapSeedKey}
            mapVersion={mapVersion}
            mapWidth={simDataRef.current.map.width}
            mapHeight={simDataRef.current.map.height}
            tool={tool}
            stationSize={stationSize}
            activeDepth={elevationMode === 'elevated' ? 'EL' : activeDepth}
            activeLineId={activeLineId}
            selectedStationId={selectedStationId}
            trackStartStationId={trackStartStationId}
            trackWaypoint={trackWaypoint}
            layers={layers}
            difficulty={difficulty}
            is25D={is25D}
            onPlaceStation={handlePlaceStation}
            onInsertStationOnSegment={handleInsertStationOnSegment}
            onSelectStation={setSelectedStationId}
            onTrackClickStation={handleTrackClickStation}
            onTrackSetWaypoint={(x, y) => {
              setTrackWaypoint({ x, y });
              soundEngine.playUiClick();
            }}
            onDemolishAt={handleDemolishAt}
            onUnlockDistrict={handleUnlockDistrict}
          />

          {/* Floating Frosted-Glass HUD Islands */}
          <FloatingHud
            lang={lang}
            onChangeLang={setLang}
            map={simDataRef.current.map}
            difficulty={difficulty}
            gameMinutesOfDay={gameMinutesOfDay}
            day={day}
            year={year}
            speed={speed}
            onChangeSpeed={setSpeed}
            onAdvanceMonth={handleAdvanceMonth}
            money={money}
            stats={stats}
            farePolicy={farePolicy}
            monthlyCapexWan={monthlyCapexWan}
            tool={tool}
            onSelectTool={(t) => {
              setTool(t);
              if (t !== 'track') {
                setTrackStartStationId(null);
                setTrackWaypoint(null);
              }
            }}
            stationSize={stationSize}
            onSelectStationSize={setStationSize}
            elevationMode={elevationMode}
            onSelectElevationMode={(m) => {
              setElevationMode(m);
              if (m === 'elevated') setActiveDepth('EL');
              else if (activeDepth === 'EL') setActiveDepth('B1');
            }}
            activeDepth={activeDepth}
            onSelectDepth={(d) => {
              setActiveDepth(d);
              setElevationMode(d === 'EL' ? 'elevated' : 'underground');
            }}
            draftMode={draftMode}
            onToggleDraftMode={() => setDraftMode((d) => !d)}
            draftCount={draftSummary.count}
            draftCostWan={draftSummary.costWan}
            draftWarnings={draftSummary.warnings}
            canUndoDraft={draftPast.length > 0}
            canRedoDraft={draftFuture.length > 0}
            onUndoDraft={handleUndoDraft}
            onRedoDraft={handleRedoDraft}
            onDiscardDraft={handleDiscardDraft}
            onConfirmDraft={handleConfirmDraft}
            lines={linesSnapshot}
            stations={stationsSnapshot}
            activeLineId={activeLineId}
            onSelectLine={setActiveLineId}
            onCreateLine={handleCreateLine}
            selectedStation={selectedStation}
            onClearSelectedStation={() => setSelectedStationId(null)}
            onUpdateStation={handleUpdateStation}
            onUpgradeStation={handleUpgradeStation}
            onDeleteStation={handleDeleteStation}
            layers={layers}
            onToggleLayer={(key) => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
            onChangeDepthFilter={(df) => setLayers((prev) => ({ ...prev, depthFilter: df }))}
            openMapStyle={openMapStyle}
            onChangeOpenMapStyle={setOpenMapStyle}
            is25D={is25D}
            onToggle25D={() => setIs25D((v) => !v)}
            onZoomIn={() => canvasHandleRef.current?.zoomBy(1.18)}
            onZoomOut={() => canvasHandleRef.current?.zoomBy(0.85)}
            onResetView={() => canvasHandleRef.current?.resetView()}
            onSearchJump={(wx, wy, label) => {
              canvasHandleRef.current?.focusAt(wx, wy, 1.25);
              showToast(`已定位至：${label}`);
            }}
            trackStartStationName={trackStartStation?.name ?? null}
            hasTrackWaypoint={trackWaypoint !== null}
            onCancelTrackDraw={() => {
              setTrackStartStationId(null);
              setTrackWaypoint(null);
            }}
            muted={muted}
            onToggleMute={() => {
              const next = !muted;
              soundEngine.muted = next;
              setMuted(next);
            }}
            onOpenSetup={() => setSetupOpen(true)}
            onOpenGdd={() => setGddOpen(true)}
            onReturnTitle={() => setScreen('TITLE')}
            onOpenCityStats={() => setCityStatsOpen(true)}
            onOpenNetworkMap={() => setNetworkMapOpen(true)}
            onOpenMetroCore={(tab = 'overview') => setMetroCoreState({ open: true, tab })}
            onOpenMetroCircle={() => setMetroCircleOpen(true)}
            unreadCircleCount={unreadCircleCount}
          />

          {/* Clean Architectural Toast Notification */}
          {toast && (
            <div className="pointer-events-none fixed top-20 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-lg bg-white/95 backdrop-blur-sm border border-slate-200 text-xs font-medium text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.1)]">
              {toast}
            </div>
          )}
        </>
      )}

      {/* Full Subsystem Modals */}
      <CityStatsModal
        open={cityStatsOpen}
        onClose={() => setCityStatsOpen(false)}
        lang={lang}
        map={simDataRef.current.map}
        difficulty={difficulty}
        year={year}
        day={day}
        stats={stats}
        stations={stationsSnapshot}
        lines={linesSnapshot}
        history={history}
        onUnlockDistrict={handleUnlockDistrict}
        onLocateDistrict={(x, y, label) => {
          setCityStatsOpen(false);
          canvasHandleRef.current?.focusAt(x, y, 1.15);
          showToast(`已定位至：${label}`);
        }}
      />

      <NetworkDiagramModal
        open={networkMapOpen}
        onClose={() => setNetworkMapOpen(false)}
        lang={lang}
        map={simDataRef.current.map}
        year={year}
        day={day}
        stations={stationsSnapshot}
        segments={segmentsSnapshot}
        lines={linesSnapshot}
        history={history}
      />

      <MetroCoreModal
        open={metroCoreState.open}
        initialTab={metroCoreState.tab}
        onClose={() => setMetroCoreState((s) => ({ ...s, open: false }))}
        lang={lang}
        map={simDataRef.current.map}
        year={year}
        day={day}
        stats={stats}
        stations={stationsSnapshot}
        segments={segmentsSnapshot}
        lines={linesSnapshot}
        activeLineId={activeLineId}
        history={history}
        farePolicy={farePolicy}
        onUpdateFarePolicy={(patch) => setFarePolicy((prev) => ({ ...prev, ...patch }))}
        onSelectLine={setActiveLineId}
        onCreateLine={handleCreateLine}
        onUpdateLine={handleUpdateLine}
        onDeleteLine={handleDeleteLine}
        onFocusStation={(st) => {
          setSelectedStationId(st.id);
          canvasHandleRef.current?.focusAt(st.x, st.y, 1.35);
          setMetroCoreState((s) => ({ ...s, open: false }));
        }}
        onUpgradeStation={handleUpgradeStation}
      />

      <MetroCircleModal
        open={metroCircleOpen}
        onClose={() => setMetroCircleOpen(false)}
        lang={lang}
        map={simDataRef.current.map}
        year={year}
        day={day}
        stats={stats}
        stations={stationsSnapshot}
        lines={linesSnapshot}
        onLocateWorld={(x, y) => {
          setMetroCircleOpen(false);
          canvasHandleRef.current?.focusAt(x, y, 1.25);
        }}
        onInspectLine={(lineId) => {
          setMetroCircleOpen(false);
          setActiveLineId(lineId);
          setMetroCoreState({ open: true, tab: 'lines' });
        }}
      />

      <SetupModal
        open={setupOpen}
        lang={lang}
        currentRealCity={realCityId}
        currentDifficulty={difficultyId}
        onClose={() => setSetupOpen(false)}
        onApply={handleApplyNewSetup}
      />

      <GddModal open={gddOpen} onClose={() => setGddOpen(false)} />
    </div>
  );
}
