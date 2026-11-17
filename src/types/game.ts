import { GeoBounds } from '../engine/geo';

export type Language = 'zh-Hant' | 'zh-Hans' | 'en';

export type MapMode = 'real_city';
export type RealCityId = 'shanghai';
export type DifficultyLevel = 'easy' | 'normal' | 'hard' | 'nightmare';

export type TrackDepth = 'EL' | 'B1' | 'B2' | 'B3' | 'B4' | 'B5';
export type ElevationMode = 'underground' | 'ground' | 'elevated';

export type StationSize = 'small' | 'standard' | 'hub' | 'mall';

export type ZoneType = 'none' | 'residential' | 'commercial' | 'industrial' | 'park';

export type TerrainType = 'water' | 'land' | 'hill';

export type ServiceMode = 'local' | 'express' | 'short_turn' | 'through';

export type ToolMode = 'select' | 'station' | 'track' | 'demolish';

export interface FarePolicy {
  baseFare: number; // Base currency units (e.g. 2)
  baseKm: number; // Included km in base fare (e.g. 6)
  stepFare: number; // Added per step (e.g. 1)
  stepKm: number; // Km per step (e.g. 8)
  maxFare: number; // Fare cap (e.g. 12)
}

export interface CityPoi {
  id: string;
  name: string;
  kind: 'university' | 'hospital' | 'airport' | 'rail' | 'park';
  x: number;
  y: number;
}

export interface DistrictInfo {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  polygon?: { x: number; y: number }[];
  polygons?: { x: number; y: number }[][];
  unlockYear: number;
  unlockCostWan: number;
  isStarter: boolean;
  unlocked: boolean;
  growthMultiplier: number;
}

export interface RoadSegment {
  id: string;
  name: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  points?: { x: number; y: number }[];
  tier?: 'highway' | 'arterial' | 'secondary' | 'local';
  isArterial: boolean;
  capacity: number;
  saturation: number; // 0..1+
}

export interface CityCell {
  gx: number;
  gy: number;
  elevation: number; // 0..1
  terrain: TerrainType;
  zone: ZoneType;
  population: number; // 0..1000 per cell
  jobs: number; // 0..1000 per cell
  landValue: number; // 0.5..3.0 (TOD boosted)
  roadCongestion: number; // 0..1
  coveredByMetro: boolean;
  lightSeed: number; // 0..1 for glowing urban night dots
}

export interface RiverPath {
  id: string;
  name: string;
  width: number;
  widths?: number[];
  points: { x: number; y: number }[];
}

export interface HillContour {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotation: number;
}

export interface BuildingModel {
  id: string;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number; // 8..95 world units
  angle?: number;
  kind: 'cbd' | 'res' | 'ind' | 'landmark';
  lit: number; // 0..1 window illumination
}

export interface CityMap {
  cols: number;
  rows: number;
  cellSize: number; // world px per grid cell for terrain/demographics
  width: number;
  height: number;
  seed: number;
  name: string;
  subtitle: string;
  startYear: number;
  mode: MapMode;
  cells: CityCell[];
  districts: DistrictInfo[];
  roads: RoadSegment[];
  rivers: RiverPath[];
  waterPolygons?: { id: string; name: string; points: { x: number; y: number }[] }[];
  hills: HillContour[];
  buildings: BuildingModel[];
  pois: CityPoi[];
  geoBounds?: GeoBounds;
}

export interface WaitingPassenger {
  id: string;
  originId: string;
  destinationId: string;
  nextHopStationId: string | null;
  spawnTime: number;
  patience: number; // 0..100
}

export interface Station {
  id: string;
  name: string;
  x: number;
  y: number;
  size: StationSize;
  depth: TrackDepth;
  elevationMode: ElevationMode;
  elevationMeters: number; // e.g. -15 for B1, 0 ground, +12 elevated
  platforms: number; // 2..8
  entrances: number; // 1..6
  isExpressStop: boolean;
  catchmentRadius: number;
  throughputCapacity: number; // pax / min
  waiting: WaitingPassenger[];
  boardedTotal: number;
  alightedTotal: number;
  congestionLoad: number; // 0..1+
  isDraft?: boolean;
}

export interface TrackSegment {
  id: string;
  fromStationId: string;
  toStationId: string;
  controlX: number; // quadratic bezier control point
  controlY: number;
  depth: TrackDepth;
  isUnderwater: boolean;
  isBridge: boolean;
  length: number;
  buildCost: number; // in 萬元 (10k units)
  isDraft?: boolean;
}

export interface TrainPassenger {
  originId: string;
  destinationId: string;
  boardedAt: number;
  fareAmount: number;
}

export interface Train {
  id: string;
  lineId: string;
  segmentIndex: number;
  direction: 1 | -1;
  t: number; // 0..1 along current segment
  speed: number; // world px / sec
  state: 'moving' | 'dwelling';
  dwellTimer: number;
  passengers: TrainPassenger[];
  capacity: number;
  x: number;
  y: number;
  angle: number;
}

export interface TransitLine {
  id: string;
  name: string;
  code: string;
  color: string;
  stationIds: string[];
  segmentIds: string[];
  serviceMode: ServiceMode;
  headwayMin: number; // 2..20 min
  carCount: number; // 2..12 cars
  fare: number; // legacy line modifier (100% default multiplier or flat fallback)
  nightMaintenance: boolean; // closes 01:00 - 04:30
  throughTargetLineId: string | null;
  trains: Train[];
  dispatchTimer: number;
  dailyRidership: number;
  dailyRevenue: number; // in 萬元 (10k units)
  isDraft?: boolean;
}

export interface DifficultyConfig {
  id: DifficultyLevel;
  label: string;
  subtitle: string;
  startingMoney: number; // in 萬元 (e.g. 450000 = 45.00億元)
  costMultiplier: number;
  maintenanceMultiplier: number;
  passengerTolerance: number;
  roadCompetition: number;
}

export interface LayerVisibility {
  populationHeatmap: boolean;
  metroCoverageOverlay: boolean;
  zones: boolean;
  catchmentRings: boolean;
  congestionOverlay: boolean;
  depthFilter: 'ALL' | TrackDepth;
}

export interface SimulationStats {
  totalPopulation: number;
  totalJobs: number;
  coveragePercent: number; // population-weighted %
  modeSharePercent: number; // % of total city trips riding metro
  avgCongestion: number;
  congestionIndex: number; // 1.00 .. 3.50
  peakCongestionIndex: number;
  satisfaction: number; // 0..100
  dailyRidership: number; // scaled realistic daily trips
  dailyTotalCityTrips: number;
  totalRidership: number;
  dailyRevenue: number; // in 萬元
  dailyMaintenance: number; // in 萬元
  activePassengersWaiting: number;
  avgFare: number;
  gdpBillions: number; // 億元
}

export interface NetworkSnapshot {
  stations: Station[];
  segments: TrackSegment[];
  lines: TransitLine[];
}

export interface HistorySnapshot {
  id: string;
  label: string;
  year: number;
  month: number;
  day: number;
  dailyRidership: number;
  modeSharePct: number;
  congestionIndex: number;
  satisfaction: number;
  population: number;
  coveredPop: number;
  stationCount: number;
  coveragePercent: number;
  lineRiderships: { id: string; name: string; color: string; ridership: number }[];
  topologyPreview: {
    stations: { id: string; name: string; x: number; y: number; isHub: boolean }[];
    lines: { id: string; name: string; color: string; stationIds: string[] }[];
  };
}

export const DEPTH_LEVELS: {
  id: TrackDepth;
  label: string;
  costMult: number;
  shortLabel: string;
  defaultMeters: number;
  elevationMode: ElevationMode;
}[] = [
  { id: 'EL', label: '高架橋 (EL)', costMult: 0.78, shortLabel: '高架', defaultMeters: 10, elevationMode: 'elevated' },
  { id: 'B1', label: '淺層地下 (B1)', costMult: 1.0, shortLabel: 'B1', defaultMeters: -15, elevationMode: 'underground' },
  { id: 'B2', label: '中層地下 (B2)', costMult: 1.25, shortLabel: 'B2', defaultMeters: -22, elevationMode: 'underground' },
  { id: 'B3', label: '深層地下 (B3)', costMult: 1.55, shortLabel: 'B3', defaultMeters: -28, elevationMode: 'underground' },
  { id: 'B4', label: '超深隧道 (B4)', costMult: 1.9, shortLabel: 'B4', defaultMeters: -34, elevationMode: 'underground' },
  { id: 'B5', label: '極深潛盾 (B5)', costMult: 2.35, shortLabel: 'B5', defaultMeters: -40, elevationMode: 'underground' },
];

// Costs & daily maintenance are in 萬元 (10,000 currency units; 10,000萬 = 1億元)
export const STATION_CONFIGS: Record<
  StationSize,
  {
    label: string;
    shortLabel: string;
    cost: number; // 萬元 (e.g. 12000 = 1.20億元)
    maintenance: number; // 萬元 / 日
    defaultPlatforms: number;
    maxCars: number;
    hourlyCapacity: number; // 人次/時
    catchment: number;
    throughput: number;
    radiusPx: number;
  }
> = {
  small: {
    label: '小型站',
    shortLabel: '小',
    cost: 12000, // 1.20 億元
    maintenance: 2, // 2 萬元/日
    defaultPlatforms: 2,
    maxCars: 4,
    hourlyCapacity: 15000,
    catchment: 125,
    throughput: 220,
    radiusPx: 6,
  },
  standard: {
    label: '中型標準站',
    shortLabel: '中',
    cost: 20000, // 2.00 億元
    maintenance: 3, // 3 萬元/日
    defaultPlatforms: 2,
    maxCars: 6,
    hourlyCapacity: 35000,
    catchment: 165,
    throughput: 460,
    radiusPx: 8,
  },
  hub: {
    label: '大型轉運樞紐',
    shortLabel: '大',
    cost: 32000, // 3.20 億元
    maintenance: 5, // 5 萬元/日
    defaultPlatforms: 4,
    maxCars: 8,
    hourlyCapacity: 70000,
    catchment: 215,
    throughput: 980,
    radiusPx: 11,
  },
  mall: {
    label: '超大型樞紐',
    shortLabel: '樞紐',
    cost: 57600, // 5.76 億元
    maintenance: 8, // 8 萬元/日
    defaultPlatforms: 6,
    maxCars: 12,
    hourlyCapacity: 150000,
    catchment: 265,
    throughput: 1750,
    radiusPx: 13,
  },
};

export const DIFFICULTIES: Record<DifficultyLevel, DifficultyConfig> = {
  easy: {
    id: 'easy',
    label: '簡單',
    subtitle: '資金充裕（85億元）、造價低廉，乘客容忍度高',
    startingMoney: 850000, // 85 億元
    costMultiplier: 0.7,
    maintenanceMultiplier: 0.65,
    passengerTolerance: 1.3,
    roadCompetition: 0.75,
  },
  normal: {
    id: 'normal',
    label: '普通',
    subtitle: '貼近現實收支平衡（45億元），須精算路線收益與班距',
    startingMoney: 450000, // 45 億元
    costMultiplier: 1.0,
    maintenanceMultiplier: 1.0,
    passengerTolerance: 1.0,
    roadCompetition: 1.0,
  },
  hard: {
    id: 'hard',
    label: '困難',
    subtitle: '高昂深層開挖成本（28億元）、高維護費與嚴格營運考驗',
    startingMoney: 280000, // 28 億元
    costMultiplier: 1.35,
    maintenanceMultiplier: 1.35,
    passengerTolerance: 0.8,
    roadCompetition: 1.25,
  },
  nightmare: {
    id: 'nightmare',
    label: '惡夢',
    subtitle: '極端預算緊縮（16億元）、地表競爭激烈且通勤族極度挑剔',
    startingMoney: 160000, // 16 億元
    costMultiplier: 1.75,
    maintenanceMultiplier: 1.7,
    passengerTolerance: 0.6,
    roadCompetition: 1.55,
  },
};

export const LINE_PALETTE = [
  '#E11D48', // Crimson Red
  '#FACC15', // Transit Yellow
  '#84CC16', // Lime Green
  '#0EA5E9', // Sky Blue
  '#A855F7', // Violet
  '#F97316', // Orange
  '#14B8A6', // Teal
  '#EC4899', // Magenta
];
