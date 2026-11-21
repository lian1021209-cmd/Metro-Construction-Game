import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActiveLoan,
  BuildingModel,
  CityMap,
  computeMonthlyInstallmentWan,
  computeStationTodMonthlyRentWan,
  DEPTH_LEVELS,
  DIFFICULTIES,
  DifficultyLevel,
  ElevationMode,
  FarePolicy,
  getEffectiveLoanMonthlyRate,
  HistorySnapshot,
  Language,
  LayerVisibility,
  LINE_PALETTE,
  LINE_SPEED_CONFIGS,
  LOAN_OFFERS,
  NetworkSnapshot,
  RealCityId,
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
} from './types/game';
import { generateCityMap, resolveNominatimStationName, suggestStationName } from './engine/noise';
import { recomputeMapCoverage, TransitRouter } from './engine/pathfinding';
import {
  analyzeTrackCrossing,
  applyDailyUrbanEvolution,
  computeNetworkMileageKm,
  DEFAULT_FARE_POLICY,
  findLockedDistrictAt,
  getCityUnlockCost,
  getCityUnlockPrereq,
  getDistrictUnlockCost,
  getDistrictUnlockPrereq,
  getLineCurveAnalysis,
  getProvinceUnlockCost,
  getStationBuildCost,
  isWaterAt,
  splitQuadraticBezier,
  stepSimulation,
  unlockRegionCascade,
  validateProposedTrackSegment,
} from './engine/simulation';
import { soundEngine } from './engine/audio';
import {
  fetchLocalOverpassStreets,
  fetchOverpassCityGeometry,
  latLonToWorld,
  OpenMapStyleId,
  reverseGeocodeStationPlace,
  worldToLatLon,
} from './engine/geo';
import {
  ensureProvinceChunkLoaded,
  loadNationalProvinces,
  purgeTaiwanFromMap,
} from './engine/chinaGeoLoader';
import { detectIsChinaUserSync, verifyChinaUserIpCountry } from './engine/regionPolicy';
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
    speedKmh: 60,
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
    stations: stations.map((s) => ({
      ...s,
      waiting: s.waiting.map((w) => ({ ...w })),
      todProperty: s.todProperty ? { ...s.todProperty } : undefined,
    })),
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
      x: pos.x,
      y: pos.y,
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
  const [isChinaUser, setIsChinaUser] = useState<boolean>(() => detectIsChinaUserSync());
  const isChinaUserRef = useRef<boolean>(isChinaUser);
  isChinaUserRef.current = isChinaUser;
  const unlockingRef = useRef<boolean>(false);

  const [mapSeedKey, setMapSeedKey] = useState(`${initialMap.mode}_${initialMap.seed}`);
  const [mapVersion, setMapVersion] = useState(0);
  const [speed, setSpeed] = useState<0 | 1 | 2 | 4>(1);
  const [gameMinutesOfDay, setGameMinutesOfDay] = useState(14 * 60 + 54);
  const [day, setDay] = useState(13);
  const [year, setYear] = useState(initialMap.startYear);
  const [money, setMoney] = useState(DIFFICULTIES.normal.startingMoney);
  const [farePolicy, setFarePolicy] = useState<FarePolicy>(DEFAULT_FARE_POLICY);
  const [monthlyCapexWan, setMonthlyCapexWan] = useState(0);
  const [loans, setLoans] = useState<ActiveLoan[]>([]);
  const loansRef = useRef<ActiveLoan[]>([]);

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
          liveLines.reduce(
            (sum, l) =>
              sum + l.trains.length * 12 * (LINE_SPEED_CONFIGS[l.speedKmh ?? 60]?.costMult ?? 0.92),
            0
          )) *
          difficulty.maintenanceMultiplier
      );
      const dailyTotalCityTrips = Math.max(120000, Math.round(cov.totalPopulation * 1.15));
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
          (16 + modeSharePercent * 0.28) *
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
    tab: 'overview' | 'lines' | 'stations' | 'fleet' | 'fares' | 'loans';
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

  const hydrateCityOverpassAt = useCallback((targetMap: CityMap, lat: number, lon: number) => {
    if (!targetMap.geoBounds) return;
    fetchOverpassCityGeometry(targetMap.geoBounds, targetMap.width, targetMap.height, {
      lat,
      lon,
    }).then((res) => {
      if (!res || simDataRef.current.map !== targetMap) return;
      if (res.roads.length > 0) {
        const existingRoadIds = new Set(targetMap.roads.map((r) => r.id));
        const extraRoads = res.roads.filter((r) => !existingRoadIds.has(r.id));
        if (extraRoads.length > 0) {
          targetMap.roads = [...targetMap.roads, ...extraRoads];
        }
      }
      if (res.pois.length > 0) {
        const existingNames = new Set(targetMap.pois.map((p) => p.name));
        targetMap.pois = [
          ...targetMap.pois,
          ...res.pois.filter((p) => !existingNames.has(p.name)).slice(0, 10),
        ];
      }
      setMapVersion((v) => v + 1);
    });
    fetchLocalOverpassStreets(lat, lon, targetMap.geoBounds, targetMap.width, targetMap.height).then(
      (extraRoads) => {
        if (!extraRoads || extraRoads.length === 0 || simDataRef.current.map !== targetMap) return;
        const existingIds = new Set(targetMap.roads.map((r) => r.id));
        const newOnes = extraRoads.filter((r) => !existingIds.has(r.id));
        if (newOnes.length > 0) {
          targetMap.roads = [...targetMap.roads, ...newOnes];
        }
      }
    );
  }, []);

  useEffect(() => {
    hydrateRealCityOverpass(simDataRef.current.map);
  }, [hydrateRealCityOverpass]);

  const syncUiSnapshots = useCallback(() => {
    const sim = simDataRef.current;
    const liveLines = sim.lines.filter((l) => !l.isDraft);
    for (const st of sim.stations) {
      if (st.todProperty) {
        const servingCount = liveLines.filter((l) => l.stationIds.includes(st.id)).length;
        st.todProperty.monthlyRentWan = computeStationTodMonthlyRentWan(st, servingCount, sim.map);
      }
    }
    setStationsSnapshot([...sim.stations]);
    setSegmentsSnapshot([...sim.segments]);
    setLinesSnapshot([...sim.lines]);
    setGameMinutesOfDay(timeRef.current.minutes);
    setDay(timeRef.current.day);
    setYear(timeRef.current.year);
    setMoney(timeRef.current.money);
    setStats(computeStatsObj(sim));
  }, [computeStatsObj]);

  useEffect(() => {
    let cancelled = false;
    const targetMap = simDataRef.current.map;
    loadNationalProvinces(targetMap, isChinaUserRef.current).then((changed) => {
      if (cancelled || !changed || simDataRef.current.map !== targetMap) return;
      recomputeMapCoverage(targetMap, simDataRef.current.stations);
      setMapVersion((v) => v + 1);
      syncUiSnapshots();
    });
    verifyChinaUserIpCountry().then(async (verifiedIsCn) => {
      if (cancelled || verifiedIsCn === isChinaUserRef.current) return;
      isChinaUserRef.current = verifiedIsCn;
      setIsChinaUser(verifiedIsCn);
      const currentMap = simDataRef.current.map;
      let changed = false;
      if (!verifiedIsCn) {
        changed = purgeTaiwanFromMap(currentMap);
      } else {
        changed = await loadNationalProvinces(currentMap, true);
      }
      if (!cancelled && changed && simDataRef.current.map === currentMap) {
        recomputeMapCoverage(currentMap, simDataRef.current.stations);
        setMapVersion((v) => v + 1);
        syncUiSnapshots();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [syncUiSnapshots]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const settleMonthlyFinances = useCallback(
    (sim: { map: CityMap; stations: Station[]; lines: TransitLine[] }) => {
      const liveLines = sim.lines.filter((l) => !l.isDraft);
      let totalTodRentWan = 0;
      for (const st of sim.stations) {
        if (!st.isDraft && st.todProperty) {
          const servingCount = liveLines.filter((l) => l.stationIds.includes(st.id)).length;
          const rent = computeStationTodMonthlyRentWan(st, servingCount, sim.map);
          st.todProperty.monthlyRentWan = rent;
          totalTodRentWan += rent;
        }
      }
      if (totalTodRentWan > 0) {
        timeRef.current.money += totalTodRentWan;
      }

      let totalLoanPaidWan = 0;
      if (loansRef.current.length > 0) {
        const nextLoans: ActiveLoan[] = [];
        for (const ln of loansRef.current) {
          const interest = Math.round(ln.remainingPrincipalWan * ln.monthlyRate);
          const payment = Math.min(ln.remainingPrincipalWan + interest, ln.monthlyPaymentWan);
          const principalPaid = Math.max(0, payment - interest);
          totalLoanPaidWan += payment;
          const remPrincipal = Math.max(0, ln.remainingPrincipalWan - principalPaid);
          const remMonths = ln.monthsRemaining - 1;
          if (remPrincipal > 0 && remMonths > 0) {
            nextLoans.push({
              ...ln,
              remainingPrincipalWan: remPrincipal,
              monthsRemaining: remMonths,
            });
          }
        }
        timeRef.current.money -= totalLoanPaidWan;
        loansRef.current = nextLoans;
        setLoans(nextLoans);
      }

      return { totalTodRentWan, totalLoanPaidWan };
    },
    []
  );

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

            const { totalTodRentWan, totalLoanPaidWan } = settleMonthlyFinances(sim);
            if (totalTodRentWan > 0 || totalLoanPaidWan > 0) {
              const parts: string[] = [];
              if (totalTodRentWan > 0) parts.push(`TOD 物業收租 +${formatCurrencyWan(totalTodRentWan, lang)}`);
              if (totalLoanPaidWan > 0) parts.push(`貸款月供 -${formatCurrencyWan(totalLoanPaidWan, lang)}`);
              showToast(`月度結算：${parts.join(' · ')}`);
            }
          }

          const liveStations = sim.stations.filter((s) => !s.isDraft);
          const liveSegments = sim.segments.filter((seg) => !seg.isDraft);
          const liveLines = sim.lines.filter((l) => !l.isDraft);
          const maint = Math.round(
            (liveStations.reduce((sum, s) => sum + STATION_CONFIGS[s.size].maintenance, 0) +
              liveSegments.length * 14 +
              liveLines.reduce(
                (sum, l) =>
                  sum + l.trains.length * 12 * (LINE_SPEED_CONFIGS[l.speedKmh ?? 60]?.costMult ?? 0.92),
                0
              )) *
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
  }, [screen, speed, difficulty, farePolicy, lang, computeStatsObj, settleMonthlyFinances, showToast, syncUiSnapshots]);

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

    const { totalTodRentWan, totalLoanPaidWan } = settleMonthlyFinances(sim);
    const financeParts: string[] = [];
    if (totalTodRentWan > 0) {
      financeParts.push(`物業收租 +${formatCurrencyWan(totalTodRentWan, lang)}`);
    }
    if (totalLoanPaidWan > 0) {
      financeParts.push(`貸款扣繳 -${formatCurrencyWan(totalLoanPaidWan, lang)}`);
    }
    const financeMsg = financeParts.length > 0 ? ` · ${financeParts.join(' · ')}` : '';

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
    showToast(`時間推進至 ${timeRef.current.year}年 · 都市演化已更新${financeMsg}`);
  };

  const handleTakeLoan = useCallback(
    (offerId: string) => {
      const offer = LOAN_OFFERS.find((o) => o.id === offerId);
      if (!offer) return;
      const todCount = simDataRef.current.stations.filter((s) => !s.isDraft && s.todProperty).length;
      const maxLoans = 4 + Math.min(4, Math.floor(todCount / 2));
      if (loansRef.current.length >= maxLoans) {
        soundEngine.playError();
        showToast(`已達授信上限 ${maxLoans} 筆（每開發 2 座 TOD 上蓋物業可擴增 +1 授信額度）`);
        return;
      }
      const effRate = getEffectiveLoanMonthlyRate(offer.monthlyRate, todCount);
      const monthlyPaymentWan = computeMonthlyInstallmentWan(
        offer.principalWan,
        effRate,
        offer.months
      );
      const newLoan: ActiveLoan = {
        id: `loan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        offerId: offer.id,
        name: offer.name,
        principalWan: offer.principalWan,
        remainingPrincipalWan: offer.principalWan,
        monthlyRate: effRate,
        monthlyPaymentWan,
        monthsTotal: offer.months,
        monthsRemaining: offer.months,
        takenYear: timeRef.current.year,
        takenDay: timeRef.current.day,
      };
      timeRef.current.money += offer.principalWan;
      const next = [...loansRef.current, newLoan];
      loansRef.current = next;
      setLoans(next);
      soundEngine.playTrackConnected();
      syncUiSnapshots();
      const discountNote = todCount > 0 ? ` · 含物業抵押優惠年息 ${(effRate * 12 * 100).toFixed(2)}%` : '';
      showToast(
        `已核貸「${offer.name}」+${formatCurrencyWan(offer.principalWan, lang)}（月付 ${formatCurrencyWan(monthlyPaymentWan, lang)}${discountNote}）`
      );
    },
    [lang, showToast, syncUiSnapshots]
  );

  const handleRepayLoan = useCallback(
    (loanId: string) => {
      const target = loansRef.current.find((l) => l.id === loanId);
      if (!target) return;
      if (timeRef.current.money < target.remainingPrincipalWan) {
        soundEngine.playError();
        showToast(
          `資金不足，提前清償需 ${formatCurrencyWan(target.remainingPrincipalWan, lang)}`
        );
        return;
      }
      timeRef.current.money -= target.remainingPrincipalWan;
      const next = loansRef.current.filter((l) => l.id !== loanId);
      loansRef.current = next;
      setLoans(next);
      soundEngine.playUiClick();
      syncUiSnapshots();
      showToast(
        `已提前清償「${target.name}」本金 ${formatCurrencyWan(target.remainingPrincipalWan, lang)}`
      );
    },
    [lang, showToast, syncUiSnapshots]
  );

  const handlePlaceStation = useCallback(
    (wx: number, wy: number) => {
      const sim = simDataRef.current;
      const waterCheck = isWaterAt(sim.map, wx, wy);
      if (waterCheck.isWater) {
        soundEngine.playError();
        showToast(
          waterCheck.reason === 'sea'
            ? '無法於海上或邊界水域設站，請將站點設於陸域版圖內！'
            : '無法於黃浦江、蘇州河、太湖或錢塘江水面設站，僅可透過軌道跨越！'
        );
        return;
      }

      const lockedDist = findLockedDistrictAt(sim.map, wx, wy);
      if (lockedDist) {
        const prereq = getDistrictUnlockPrereq(sim.map, lockedDist);
        soundEngine.playError();
        if (!prereq.canUnlock && prereq.blockedByName) {
          showToast(
            `「${lockedDist.name}」尚未開放，需先解鎖「${prereq.blockedByName}」（可點擊地圖門戶鎖頭或「區域發展」）`
          );
        } else {
          const unlockCost = getDistrictUnlockCost(lockedDist, difficulty);
          showToast(
            `「${lockedDist.name}」尚未解鎖，點擊地圖鎖頭花費 ${formatCurrencyWan(unlockCost, lang)} 解鎖`
          );
        }
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
      const targetX = wx;
      const targetY = wy;
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
        const bounds = sim.map.geoBounds;
        const targetMap = sim.map;
        const ll = worldToLatLon(newStation.x, newStation.y, bounds, sim.map.width, sim.map.height);
        fetchLocalOverpassStreets(ll.lat, ll.lon, bounds, targetMap.width, targetMap.height).then(
          (extraRoads) => {
            if (!extraRoads || extraRoads.length === 0 || simDataRef.current.map !== targetMap) return;
            const existingIds = new Set(targetMap.roads.map((r) => r.id));
            const newOnes = extraRoads.filter((r) => !existingIds.has(r.id));
            if (newOnes.length > 0) {
              targetMap.roads = [...targetMap.roads, ...newOnes];
            }
          }
        );
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
      const targetX = split.mx;
      const targetY = split.my;
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
        const bounds = sim.map.geoBounds;
        const targetMap = sim.map;
        const ll = worldToLatLon(newStation.x, newStation.y, bounds, sim.map.width, sim.map.height);
        fetchLocalOverpassStreets(ll.lat, ll.lon, bounds, targetMap.width, targetMap.height).then(
          (extraRoads) => {
            if (!extraRoads || extraRoads.length === 0 || simDataRef.current.map !== targetMap) return;
            const existingIds = new Set(targetMap.roads.map((r) => r.id));
            const newOnes = extraRoads.filter((r) => !existingIds.has(r.id));
            if (newOnes.length > 0) {
              targetMap.roads = [...targetMap.roads, ...newOnes];
            }
          }
        );
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

      const curveCheck = validateProposedTrackSegment(
        sim.map,
        line,
        sim.stations,
        sim.segments,
        stA,
        stB,
        cx,
        cy
      );
      if (!curveCheck.ok) {
        soundEngine.playError();
        const rLabel = Math.round(curveCheck.minRadiusM);
        showToast(
          curveCheck.violationReason === 'junction_angle'
            ? `接軌轉折過急（有效半徑 ${rLabel} m），${curveCheck.speedKmh} km/h 路線要求最小轉彎半徑 ${curveCheck.requiredMinRadiusM} m`
            : `軌道彎道過急（轉彎半徑 ${rLabel} m），${curveCheck.speedKmh} km/h 路線要求必須達 ${curveCheck.requiredMinRadiusM} m 以上`
        );
        return;
      }

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
        true,
        line.speedKmh ?? 60
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

    if (patch.speedKmh !== undefined && patch.speedKmh !== (line.speedKmh ?? 60)) {
      const cfg = LINE_SPEED_CONFIGS[patch.speedKmh];
      const liveLines = sim.lines.filter((l) => !l.isDraft);
      const totalKm = computeNetworkMileageKm(sim.map, liveLines, sim.segments);
      if (totalKm < cfg.unlockKm) {
        soundEngine.playError();
        showToast(
          `${cfg.isHighSpeed ? '高速地鐵 ' : ''}${cfg.label} 需營運里程達 ${cfg.unlockKm} km 解鎖（目前 ${totalKm.toFixed(1)} km）`
        );
        return;
      }
      const analysis = getLineCurveAnalysis(sim.map, line, sim.stations, sim.segments);
      if (analysis.minRadiusM < cfg.minRadiusM) {
        soundEngine.playError();
        showToast(
          `「${line.name}」最小轉彎半徑為 ${Math.round(analysis.minRadiusM)} m${
            analysis.worstLocation ? `（${analysis.worstLocation}）` : ''
          }，未達 ${cfg.label} 所需 ${cfg.minRadiusM} m`
        );
        return;
      }
      soundEngine.playUiClick();
      showToast(
        `${line.name} 運行速度已調整為 ${cfg.label}${cfg.isHighSpeed ? '（高速地鐵）' : ''} · 最小半徑要求 ${cfg.minRadiusM} m`
      );
    }

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

  const handleDevelopStationTod = useCallback(
    (stationId: string, kind: TodPropertyKind) => {
      const sim = simDataRef.current;
      const st = sim.stations.find((s) => s.id === stationId);
      if (!st) return;
      if (st.isDraft) {
        soundEngine.playError();
        showToast('請先確認建設（竣工）此車站，再進行 TOD 上蓋物業開發');
        return;
      }

      const existing = st.todProperty;
      const isUpgrade = Boolean(existing);
      const activeKind = existing ? existing.kind : kind;
      const cfg = TOD_CONFIGS[activeKind];

      if (existing && existing.level >= 3) {
        soundEngine.playError();
        showToast(`「${st.name}」${cfg.label}已擴建至最高 Lv.3`);
        return;
      }

      const costWan = Math.round(cfg.costWan * (isUpgrade ? 0.7 : 1) * difficulty.costMultiplier);
      if (timeRef.current.money < costWan) {
        soundEngine.playError();
        showToast(`資金不足，${isUpgrade ? '擴建' : '開發'}${cfg.label}需 ${formatCurrencyWan(costWan, lang)}`);
        return;
      }

      timeRef.current.money -= costWan;
      setMonthlyCapexWan((c) => c + costWan);

      const presaleWan = !isUpgrade ? cfg.presaleRebateWan : 0;
      if (presaleWan > 0) {
        timeRef.current.money += presaleWan;
      }

      const nextLevel = existing ? existing.level + 1 : 1;
      const liveLines = sim.lines.filter((l) => !l.isDraft);
      const servingCount = liveLines.filter((l) => l.stationIds.includes(st.id)).length;

      st.todProperty = {
        kind: activeKind,
        level: nextLevel,
        monthlyRentWan: 0,
        developedYear: existing?.developedYear ?? timeRef.current.year,
      };
      const liveRentWan = computeStationTodMonthlyRentWan(st, servingCount, sim.map);
      st.todProperty.monthlyRentWan = liveRentWan;

      // Boost nearby cells' population, jobs, and land value to generate real metro ridership & higher rents
      const nearbyCells: { cell: CityMap['cells'][number]; weight: number }[] = [];
      let totalWeight = 0;
      for (const cell of sim.map.cells) {
        if (cell.terrain !== 'land') continue;
        const cx = (cell.gx + 0.5) * sim.map.cellSize;
        const cy = (cell.gy + 0.5) * sim.map.cellSize;
        const d = Math.hypot(cx - st.x, cy - st.y);
        if (d <= 220) {
          const w = 1 - d / 240;
          nearbyCells.push({ cell, weight: w });
          totalWeight += w;
        }
      }
      if (totalWeight > 0) {
        const boostFactor = isUpgrade ? 0.65 : 1;
        for (const { cell, weight } of nearbyCells) {
          const share = weight / totalWeight;
          cell.population = Math.min(980, cell.population + cfg.popBoost * boostFactor * share);
          cell.jobs = Math.min(990, cell.jobs + cfg.jobsBoost * boostFactor * share);
          cell.landValue = Math.min(3.0, cell.landValue + cfg.landValueBoost * (isUpgrade ? 0.6 : 1) * (0.4 + weight * 0.6));
        }
      }

      // Add physical architectural towers around the station for immediate visual feedback on canvas
      const buildingKind: BuildingModel['kind'] =
        activeKind === 'office' ? 'cbd' : activeKind === 'retail' ? 'landmark' : 'res';
      const towerCount = isUpgrade ? 2 : 3;
      const baseAngle = st.x * 0.03 + st.y * 0.02 + nextLevel * 1.1;
      for (let i = 0; i < towerCount; i++) {
        const ang = baseAngle + (i * Math.PI * 2) / towerCount;
        const dist = 20 + (i % 2) * 10;
        const bw = activeKind === 'retail' ? 18 : 13;
        const bd = activeKind === 'retail' ? 16 : 13;
        const bh = Math.min(94, (activeKind === 'office' ? 68 : activeKind === 'apartment' ? 56 : 44) + nextLevel * 9 + i * 4);
        sim.map.buildings.push({
          id: `tod_${st.id}_lv${nextLevel}_${i}_${Date.now()}`,
          x: Math.round(st.x + Math.cos(ang) * dist - bw / 2),
          y: Math.round(st.y + Math.sin(ang) * dist - bd / 2),
          w: bw,
          d: bd,
          h: bh,
          kind: buildingKind,
          lit: 0.92,
        });
      }

      recomputeMapCoverage(sim.map, sim.stations);
      setMapVersion((v) => v + 1);
      soundEngine.playTrackConnected();
      syncUiSnapshots();

      const presaleMsg = presaleWan > 0 ? ` · 預售回款 +${formatCurrencyWan(presaleWan, lang)}` : '';
      showToast(
        `${st.name} ${isUpgrade ? '擴建' : '竣工'}「${cfg.label} Lv.${nextLevel}」${presaleMsg} · 月租收益 +${formatCurrencyWan(liveRentWan, lang)}/月`
      );
    },
    [difficulty.costMultiplier, lang, showToast, syncUiSnapshots]
  );

  const handlePreloadProvinceChunk = useCallback(async (provinceId: string) => {
    const sim = simDataRef.current;
    const ok = await ensureProvinceChunkLoaded(sim.map, provinceId);
    if (ok) {
      setMapVersion((v) => v + 1);
    }
  }, []);

  const handleUnlockRegion = useCallback(
    async (kind: 'province' | 'city' | 'district', id: string) => {
      if (unlockingRef.current) return;
      unlockingRef.current = true;
      try {
        const sim = simDataRef.current;

        if (kind === 'province') {
          const prov = sim.map.provinces?.find((p) => p.id === id);
          if (!prov || prov.unlocked) return;
          const cost = getProvinceUnlockCost(prov, difficulty);
          if (timeRef.current.money < cost) {
            soundEngine.playError();
            showToast(`資金不足，解鎖「${prov.name}」需 ${formatCurrencyWan(cost, lang)}`);
            return;
          }
          if (!prov.loaded) {
            showToast(`正在載入「${prov.name}」省市區級地理資料...`);
            const loaded = await ensureProvinceChunkLoaded(sim.map, id);
            if (!loaded) {
              soundEngine.playError();
              showToast(`「${prov.name}」地理資料載入失敗，請稍後重試`);
              return;
            }
          }
          timeRef.current.money -= cost;
          setMonthlyCapexWan((c) => c + cost);
          const res = unlockRegionCascade(sim.map, 'province', id);
          for (const c of res.unlockedCities) {
            hydrateCityOverpassAt(sim.map, c.lat, c.lon);
          }
          if (sim.map.geoBounds) {
            for (const d of res.unlockedDistricts) {
              const ll = worldToLatLon(d.x, d.y, sim.map.geoBounds, sim.map.width, sim.map.height);
              hydrateCityOverpassAt(sim.map, ll.lat, ll.lon);
            }
          }
          recomputeMapCoverage(sim.map, sim.stations);
          soundEngine.playTrackConnected();
          setMapVersion((v) => v + 1);
          syncUiSnapshots();
          const cityLabel = res.unlockedCities.map((c) => c.name).join('、');
          const distLabel = res.unlockedDistricts.map((d) => d.name).join('、');
          showToast(
            `已花費 ${formatCurrencyWan(cost, lang)} 解鎖「${prov.name}」${
              cityLabel ? ` → 自動開放最近市「${cityLabel}」` : ''
            }${distLabel ? ` → 自動開放最近區「${distLabel}」` : ''}`
          );
          return;
        }

        if (kind === 'city') {
          const city = sim.map.cities?.find((c) => c.id === id);
          if (!city || city.unlocked) return;
          const prereq = getCityUnlockPrereq(sim.map, city);
          if (!prereq.canUnlock) {
            soundEngine.playError();
            showToast(`需先解鎖「${prereq.blockedByName}」，再逐層開放「${city.name}」`);
            return;
          }
          const cost = getCityUnlockCost(city, difficulty);
          if (timeRef.current.money < cost) {
            soundEngine.playError();
            showToast(`資金不足，解鎖「${city.name}」需 ${formatCurrencyWan(cost, lang)}`);
            return;
          }
          timeRef.current.money -= cost;
          setMonthlyCapexWan((c) => c + cost);
          const res = unlockRegionCascade(sim.map, 'city', id);
          for (const c of res.unlockedCities) {
            hydrateCityOverpassAt(sim.map, c.lat, c.lon);
          }
          if (sim.map.geoBounds) {
            for (const d of res.unlockedDistricts) {
              const ll = worldToLatLon(d.x, d.y, sim.map.geoBounds, sim.map.width, sim.map.height);
              hydrateCityOverpassAt(sim.map, ll.lat, ll.lon);
            }
          }
          recomputeMapCoverage(sim.map, sim.stations);
          soundEngine.playTrackConnected();
          setMapVersion((v) => v + 1);
          syncUiSnapshots();
          const distLabel = res.unlockedDistricts.map((d) => d.name).join('、');
          showToast(
            `已花費 ${formatCurrencyWan(cost, lang)} 解鎖「${city.name}」${
              distLabel ? ` → 自動開放最近區「${distLabel}」` : ''
            }`
          );
          return;
        }

        const dist = sim.map.districts.find((d) => d.id === id);
        if (!dist || dist.unlocked) return;
        const prereq = getDistrictUnlockPrereq(sim.map, dist);
        if (!prereq.canUnlock) {
          soundEngine.playError();
          showToast(`「${dist.name}」需先解鎖鄰近行政區「${prereq.blockedByName}」`);
          return;
        }

        const cost = getDistrictUnlockCost(dist, difficulty);
        if (timeRef.current.money < cost) {
          soundEngine.playError();
          showToast(`資金不足，解鎖「${dist.name}」需 ${formatCurrencyWan(cost, lang)}`);
          return;
        }

        timeRef.current.money -= cost;
        setMonthlyCapexWan((c) => c + cost);
        unlockRegionCascade(sim.map, 'district', id);
        if (sim.map.geoBounds) {
          const ll = worldToLatLon(dist.x, dist.y, sim.map.geoBounds, sim.map.width, sim.map.height);
          hydrateCityOverpassAt(sim.map, ll.lat, ll.lon);
        }
        recomputeMapCoverage(sim.map, sim.stations);
        soundEngine.playTrackConnected();
        setMapVersion((v) => v + 1);
        syncUiSnapshots();
        showToast(`已花費 ${formatCurrencyWan(cost, lang)} 解鎖「${dist.name}」`);
      } finally {
        unlockingRef.current = false;
      }
    },
    [difficulty, hydrateCityOverpassAt, lang, showToast, syncUiSnapshots]
  );

  const handleUnlockDistrict = useCallback(
    (districtId: string) => {
      void handleUnlockRegion('district', districtId);
    },
    [handleUnlockRegion]
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
    loansRef.current = [];
    setLoans([]);
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
    loadNationalProvinces(newMap, isChinaUserRef.current).then((changed) => {
      if (changed && simDataRef.current.map === newMap) {
        recomputeMapCoverage(newMap, simDataRef.current.stations);
        setMapVersion((v) => v + 1);
        syncUiSnapshots();
      }
    });
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
            includeTaiwan={isChinaUser}
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
            onUnlockRegion={handleUnlockRegion}
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
            loans={loans}
            onTakeLoan={handleTakeLoan}
            onRepayLoan={handleRepayLoan}
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
            segments={segmentsSnapshot}
            activeLineId={activeLineId}
            onSelectLine={setActiveLineId}
            onCreateLine={handleCreateLine}
            onUpdateLine={handleUpdateLine}
            selectedStation={selectedStation}
            onClearSelectedStation={() => setSelectedStationId(null)}
            onUpdateStation={handleUpdateStation}
            onUpgradeStation={handleUpgradeStation}
            onDevelopTod={handleDevelopStationTod}
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
        onUnlockRegion={handleUnlockRegion}
        onPreloadProvinceChunk={handlePreloadProvinceChunk}
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
        onUpdateStation={handleUpdateStation}
        onDevelopTod={handleDevelopStationTod}
        difficulty={difficulty}
        money={money}
        loans={loans}
        onTakeLoan={handleTakeLoan}
        onRepayLoan={handleRepayLoan}
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
