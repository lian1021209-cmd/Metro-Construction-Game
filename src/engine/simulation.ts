import {
  CityMap,
  CityRegionInfo,
  DEPTH_LEVELS,
  DifficultyConfig,
  DistrictInfo,
  FarePolicy,
  ProvinceRegionInfo,
  Station,
  StationSize,
  STATION_CONFIGS,
  TrackDepth,
  TrackSegment,
  Train,
  TransitLine,
} from '../types/game';
import { getShortTurnRange, isStationExpressStop, TransitRouter } from './pathfinding';

export const DEFAULT_FARE_POLICY: FarePolicy = {
  baseFare: 2,
  baseKm: 6,
  stepFare: 1,
  stepKm: 8,
  maxFare: 12,
};

export function getDistrictUnlockCost(district: DistrictInfo, difficulty: DifficultyConfig): number {
  if (district.unlocked || district.isStarter) return 0;
  return Math.max(5000, Math.round(district.unlockCostWan * difficulty.costMultiplier));
}

export function getProvinceUnlockCost(province: ProvinceRegionInfo, difficulty: DifficultyConfig): number {
  if (province.unlocked) return 0;
  return Math.max(10000, Math.round(province.unlockCostWan * difficulty.costMultiplier));
}

export function getCityUnlockCost(city: CityRegionInfo, difficulty: DifficultyConfig): number {
  if (city.unlocked) return 0;
  return Math.max(8000, Math.round(city.unlockCostWan * difficulty.costMultiplier));
}

export function getCityUnlockPrereq(
  map: CityMap,
  city: CityRegionInfo
): { canUnlock: boolean; blockedByName?: string; blockedKind?: 'province' | 'city' } {
  const prov = map.provinces?.find((p) => p.id === city.provinceId);
  if (prov && !prov.unlocked) {
    return { canUnlock: false, blockedByName: prov.name, blockedKind: 'province' };
  }
  if (city.isClosestToShanghai) {
    return { canUnlock: true };
  }
  if (city.adjacentCityIds && city.adjacentCityIds.length > 0) {
    const anyAdjUnlocked = city.adjacentCityIds.some(
      (adjId) => map.cities?.find((c) => c.id === adjId)?.unlocked
    );
    if (anyAdjUnlocked) return { canUnlock: true };

    // Recommend the closest adjacent city to Shanghai as the intuitive prerequisite
    const adjCities = city.adjacentCityIds
      .map((adjId) => map.cities?.find((c) => c.id === adjId))
      .filter((c): c is CityRegionInfo => Boolean(c))
      .sort((a, b) => a.distanceKmFromShanghai - b.distanceKmFromShanghai);
    const hintName = adjCities[0]?.name ?? prov?.name;
    return { canUnlock: false, blockedByName: hintName, blockedKind: 'city' };
  }
  if (city.prereqCityId) {
    const prereqCity = map.cities?.find((c) => c.id === city.prereqCityId);
    if (prereqCity && !prereqCity.unlocked) {
      return { canUnlock: false, blockedByName: prereqCity.name, blockedKind: 'city' };
    }
  }
  return { canUnlock: true };
}

export function getDistrictUnlockPrereq(
  map: CityMap,
  district: DistrictInfo
): { canUnlock: boolean; blockedByName?: string; blockedKind?: 'province' | 'city' | 'district' } {
  if (district.provinceId && district.provinceId !== 'prov_sh') {
    const prov = map.provinces?.find((p) => p.id === district.provinceId);
    if (prov && !prov.unlocked) {
      return { canUnlock: false, blockedByName: prov.name, blockedKind: 'province' };
    }
  }
  if (district.cityId && district.cityId !== 'city_sh') {
    const city = map.cities?.find((c) => c.id === district.cityId);
    if (city && !city.unlocked) {
      return { canUnlock: false, blockedByName: city.name, blockedKind: 'city' };
    }
  }
  if (district.isCityClosestToShanghai) {
    return { canUnlock: true };
  }
  const prereqUnlocked = district.prereqDistrictId
    ? Boolean(map.districts.find((d) => d.id === district.prereqDistrictId)?.unlocked)
    : false;
  if (prereqUnlocked) return { canUnlock: true };

  if (district.adjacentDistrictIds && district.adjacentDistrictIds.length > 0) {
    const anyAdjUnlocked = district.adjacentDistrictIds.some(
      (adjId) => map.districts.find((d) => d.id === adjId)?.unlocked
    );
    if (anyAdjUnlocked) return { canUnlock: true };
  }

  if (district.prereqDistrictId) {
    const prereqDist = map.districts.find((d) => d.id === district.prereqDistrictId);
    if (prereqDist && !prereqDist.unlocked) {
      return { canUnlock: false, blockedByName: prereqDist.name, blockedKind: 'district' };
    }
  }
  if (district.adjacentDistrictIds && district.adjacentDistrictIds.length > 0) {
    const firstAdj = map.districts.find((d) => d.id === district.adjacentDistrictIds![0]);
    if (firstAdj && !firstAdj.unlocked) {
      return { canUnlock: false, blockedByName: firstAdj.name, blockedKind: 'district' };
    }
  }
  return { canUnlock: true };
}

export function unlockRegionCascade(
  map: CityMap,
  kind: 'province' | 'city' | 'district',
  id: string
): {
  unlockedProvinces: ProvinceRegionInfo[];
  unlockedCities: CityRegionInfo[];
  unlockedDistricts: DistrictInfo[];
} {
  const unlockedProvinces: ProvinceRegionInfo[] = [];
  const unlockedCities: CityRegionInfo[] = [];
  const unlockedDistricts: DistrictInfo[] = [];

  if (kind === 'province') {
    const prov = map.provinces?.find((p) => p.id === id);
    if (prov && !prov.unlocked) {
      prov.unlocked = true;
      unlockedProvinces.push(prov);
      const closestCity = map.cities?.find((c) => c.id === prov.closestCityId);
      if (closestCity && !closestCity.unlocked) {
        closestCity.unlocked = true;
        unlockedCities.push(closestCity);
        const closestDist = map.districts.find((d) => d.id === closestCity.closestDistrictId);
        if (closestDist && !closestDist.unlocked) {
          closestDist.unlocked = true;
          unlockedDistricts.push(closestDist);
        }
      }
    }
  } else if (kind === 'city') {
    const city = map.cities?.find((c) => c.id === id);
    if (city && !city.unlocked) {
      city.unlocked = true;
      unlockedCities.push(city);
      const closestDist = map.districts.find((d) => d.id === city.closestDistrictId);
      if (closestDist && !closestDist.unlocked) {
        closestDist.unlocked = true;
        unlockedDistricts.push(closestDist);
      }
    }
  } else {
    const dist = map.districts.find((d) => d.id === id);
    if (dist && !dist.unlocked) {
      dist.unlocked = true;
      unlockedDistricts.push(dist);
    }
  }

  return { unlockedProvinces, unlockedCities, unlockedDistricts };
}

function pointInPolygon(px: number, py: number, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

interface RingBox {
  ring: { x: number; y: number }[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const districtBboxCache = new WeakMap<
  DistrictInfo,
  { minX: number; maxX: number; minY: number; maxY: number; rings: RingBox[] }
>();

function getDistrictBbox(d: DistrictInfo) {
  let cached = districtBboxCache.get(d);
  if (cached) return cached;
  const rawRings = d.polygons ?? (d.polygon ? [d.polygon] : []);
  const rings: RingBox[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of rawRings) {
    if (ring.length < 3) continue;
    let rMinX = Infinity;
    let rMaxX = -Infinity;
    let rMinY = Infinity;
    let rMaxY = -Infinity;
    for (const p of ring) {
      if (p.x < rMinX) rMinX = p.x;
      if (p.x > rMaxX) rMaxX = p.x;
      if (p.y < rMinY) rMinY = p.y;
      if (p.y > rMaxY) rMaxY = p.y;
    }
    if (rMinX < minX) minX = rMinX;
    if (rMaxX > maxX) maxX = rMaxX;
    if (rMinY < minY) minY = rMinY;
    if (rMaxY > maxY) maxY = rMaxY;
    rings.push({ ring, minX: rMinX, maxX: rMaxX, minY: rMinY, maxY: rMaxY });
  }
  cached = { minX, maxX, minY, maxY, rings };
  districtBboxCache.set(d, cached);
  return cached;
}

export function pointInDistrict(d: DistrictInfo, wx: number, wy: number): boolean {
  const bb = getDistrictBbox(d);
  if (bb.rings.length > 0) {
    if (wx < bb.minX || wx > bb.maxX || wy < bb.minY || wy > bb.maxY) return false;
    for (const rb of bb.rings) {
      if (wx >= rb.minX && wx <= rb.maxX && wy >= rb.minY && wy <= rb.maxY && pointInPolygon(wx, wy, rb.ring)) {
        return true;
      }
    }
    return false;
  }
  return Math.hypot(wx - d.x, wy - d.y) <= d.radius;
}

export function findLockedDistrictAt(map: CityMap, wx: number, wy: number): DistrictInfo | null {
  for (const d of map.districts) {
    if (d.unlocked && pointInDistrict(d, wx, wy)) {
      return null;
    }
  }
  for (const d of map.districts) {
    if (!d.unlocked && pointInDistrict(d, wx, wy)) {
      return d;
    }
  }
  return null;
}

function distToPolylineWorld(px: number, py: number, pts: { x: number; y: number }[]): number {
  let minD = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const x1 = pts[i].x;
    const y1 = pts[i].y;
    const x2 = pts[i + 1].x;
    const y2 = pts[i + 1].y;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    if (d < minD) minD = d;
  }
  return minD;
}

export function isWaterAt(
  map: CityMap,
  wx: number,
  wy: number
): { isWater: boolean; reason: 'sea' | 'river' | 'land' } {
  // 1. Outside all official municipal land/island boundaries => Sea / Yangtze Estuary / Hangzhou Bay
  if (map.districts.length > 0) {
    const onLandDistrict = map.districts.some((d) => pointInDistrict(d, wx, wy));
    if (!onLandDistrict) {
      return { isWater: true, reason: 'sea' };
    }
  }

  // 2. Inland lake polygons (Dianshan Lake, Dishui Lake, Taihu Lake, Hongze, Gaoyou, Qiandao)
  if (map.waterPolygons) {
    for (const lake of map.waterPolygons) {
      if (lake.points.length >= 3 && pointInPolygon(wx, wy, lake.points)) {
        return { isWater: true, reason: 'river' };
      }
    }
  }

  // 3. Major rivers & creeks (Suzhou Creek, Qiantang River, Yangtze River)
  for (const rv of map.rivers) {
    if (rv.skipPolylineWaterCheck) continue;
    if (rv.points.length >= 2 && distToPolylineWorld(wx, wy, rv.points) <= rv.width * 0.5) {
      return { isWater: true, reason: 'river' };
    }
  }

  return { isWater: false, reason: 'land' };
}

export function pixelsToKm(px: number, map?: CityMap): number {
  if (map?.geoBounds) {
    // At zoom 12.5 (~31 deg lat), ~105 world px ≈ 1 km
    const latCos = Math.cos((map.geoBounds.centerLat * Math.PI) / 180);
    const metersPerWorldPx =
      (156543.03 * latCos) / Math.pow(2, map.geoBounds.defaultZoom);
    return (px * metersPerWorldPx) / 1000;
  }
  return px * 0.011;
}

export function computeProgressiveFare(distanceKm: number, policy: FarePolicy): number {
  if (distanceKm <= policy.baseKm) return policy.baseFare;
  const extraSteps = Math.ceil((distanceKm - policy.baseKm) / Math.max(1, policy.stepKm));
  return Math.min(policy.maxFare, policy.baseFare + extraSteps * policy.stepFare);
}

export function evalQuadraticBezier(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  t: number
): { x: number; y: number; angle: number } {
  const mt = 1 - t;
  const x = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
  const y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;

  const dx = 2 * mt * (cx - x0) + 2 * t * (x1 - cx);
  const dy = 2 * mt * (cy - y0) + 2 * t * (y1 - cy);
  const angle = Math.atan2(dy, dx);
  return { x, y, angle };
}

export function splitQuadraticBezier(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  t: number
) {
  const mt = 1 - t;
  const c1x = mt * x0 + t * cx;
  const c1y = mt * y0 + t * cy;
  const c2x = mt * cx + t * x1;
  const c2y = mt * cy + t * y1;
  const mx = mt * c1x + t * c2x;
  const my = mt * c1y + t * c2y;
  return {
    mx,
    my,
    leftCtrl: { x: c1x, y: c1y },
    rightCtrl: { x: c2x, y: c2y },
  };
}

export function findNearestTrackSegment(
  px: number,
  py: number,
  stations: Station[],
  segments: TrackSegment[],
  maxDist = 18
): { segment: TrackSegment; t: number; point: { x: number; y: number }; dist: number } | null {
  const stationMap = new Map(stations.map((s) => [s.id, s]));
  let best: { segment: TrackSegment; t: number; point: { x: number; y: number }; dist: number } | null = null;

  for (const seg of segments) {
    const a = stationMap.get(seg.fromStationId);
    const b = stationMap.get(seg.toStationId);
    if (!a || !b) continue;
    for (let i = 1; i <= 23; i++) {
      const t = i / 24;
      const p = evalQuadraticBezier(a.x, a.y, seg.controlX, seg.controlY, b.x, b.y, t);
      const d = Math.hypot(px - p.x, py - p.y);
      if (d < maxDist && (!best || d < best.dist)) {
        best = { segment: seg, t, point: { x: p.x, y: p.y }, dist: d };
      }
    }
  }
  return best;
}

export function estimateQuadraticLength(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number
): number {
  let len = 0;
  let px = x0;
  let py = y0;
  const steps = 16;
  for (let i = 1; i <= steps; i++) {
    const p = evalQuadraticBezier(x0, y0, cx, cy, x1, y1, i / steps);
    len += Math.hypot(p.x - px, p.y - py);
    px = p.x;
    py = p.y;
  }
  return len;
}

/**
 * Computes realistic track capex in 萬元 (e.g. ~8,000–35,000 萬 = 0.8–3.5 億元 per segment)
 */
export function analyzeTrackCrossing(
  map: CityMap,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  depth: TrackDepth,
  difficulty: DifficultyConfig,
  _forDisplayEstimate = false
): { isUnderwater: boolean; isBridge: boolean; length: number; cost: number } {
  const steps = 24;
  let waterHits = 0;
  let hillHits = 0;

  for (let i = 0; i <= steps; i++) {
    const p = evalQuadraticBezier(x0, y0, cx, cy, x1, y1, i / steps);
    if (isWaterAt(map, p.x, p.y).isWater) {
      waterHits++;
    }
    const gx = Math.min(map.cols - 1, Math.max(0, Math.floor(p.x / map.cellSize)));
    const gy = Math.min(map.rows - 1, Math.max(0, Math.floor(p.y / map.cellSize)));
    const cell = map.cells[gy * map.cols + gx];
    if (cell && cell.terrain === 'hill') {
      hillHits++;
    }
  }

  const crossesWater = waterHits > 0;
  const isBridge = crossesWater && depth === 'EL';
  const isUnderwater = crossesWater && depth !== 'EL';

  const length = estimateQuadraticLength(x0, y0, cx, cy, x1, y1);
  const km = pixelsToKm(length, map);
  const depthCfg = DEPTH_LEVELS.find((d) => d.id === depth) ?? DEPTH_LEVELS[1];

  // ~6,500 萬元 / km base cost for underground B1 (~0.65億/km)
  const baseCostPerKmWan = 6500;
  let multiplier = depthCfg.costMult;
  if (isUnderwater) multiplier *= 1.85;
  if (isBridge) multiplier *= 1.45;
  if (hillHits > 0 && depth !== 'EL') multiplier *= 1.25;

  const cost = Math.round(km * baseCostPerKmWan * multiplier * difficulty.costMultiplier);

  return { isUnderwater, isBridge, length, cost };
}

export function getStationBuildCost(
  size: StationSize,
  depth: TrackDepth,
  isOnWater: boolean,
  difficulty: DifficultyConfig,
  _forDisplayEstimate = false
): number {
  const cfg = STATION_CONFIGS[size];
  const depthCfg = DEPTH_LEVELS.find((d) => d.id === depth) ?? DEPTH_LEVELS[1];
  const waterMult = isOnWater ? 1.65 : 1.0;
  return Math.round(cfg.cost * depthCfg.costMult * waterMult * difficulty.costMultiplier);
}

export function getTimeOfDayDemand(minutesOfDay: number): {
  multiplier: number;
  periodLabel: string;
  flowBias: 'to_work' | 'to_home' | 'balanced';
} {
  const hour = minutesOfDay / 60;
  if (hour >= 7 && hour < 9.5) {
    return { multiplier: 2.35, periodLabel: '早高峰通勤', flowBias: 'to_work' };
  }
  if (hour >= 17 && hour < 19.8) {
    return { multiplier: 2.45, periodLabel: '晚高峰返家', flowBias: 'to_home' };
  }
  if (hour >= 1 && hour < 4.5) {
    return { multiplier: 0.18, periodLabel: '深夜維修時段', flowBias: 'balanced' };
  }
  if (hour >= 9.5 && hour < 17) {
    return { multiplier: 1.05, periodLabel: '日間平峰', flowBias: 'balanced' };
  }
  return { multiplier: 0.72, periodLabel: '夜間離峰', flowBias: 'balanced' };
}

export interface TickResult {
  ridershipDelta: number; // scaled city-scale passenger trips
  revenueDelta: number; // in 萬元
  satisfaction: number;
  avgFare: number;
}

export function stepSimulation(
  dtSimMinutes: number,
  dtRealSeconds: number,
  gameMinutesOfDay: number,
  map: CityMap,
  stations: Station[],
  segments: TrackSegment[],
  lines: TransitLine[],
  router: TransitRouter,
  difficulty: DifficultyConfig,
  farePolicy: FarePolicy
): TickResult {
  const liveStations = stations.filter((s) => !s.isDraft);
  const liveLines = lines.filter((l) => !l.isDraft);
  const stationMap = new Map(liveStations.map((s) => [s.id, s]));
  const segMap = new Map<string, TrackSegment>();
  for (const seg of segments) {
    if (seg.isDraft) continue;
    segMap.set(`${seg.fromStationId}_${seg.toStationId}`, seg);
    segMap.set(`${seg.toStationId}_${seg.fromStationId}`, seg);
  }

  const demandInfo = getTimeOfDayDemand(gameMinutesOfDay);
  const hour = gameMinutesOfDay / 60;
  const isNightWindow = hour >= 1 && hour < 4.5;

  // Each simulated agent represents ~480 real daily commuters for city-scale metrics
  const AGENT_TO_CITY_PAX = 480;
  let ridershipDelta = 0;
  let revenueDeltaWan = 0;
  let fareSum = 0;
  let fareCount = 0;

  // 1. Spawn commuters into stations
  if (liveStations.length >= 2 && dtSimMinutes > 0) {
    const residentialStations: Station[] = [];
    const jobStations: Station[] = [];

    for (const st of liveStations) {
      const gx = Math.min(map.cols - 1, Math.max(0, Math.floor(st.x / map.cellSize)));
      const gy = Math.min(map.rows - 1, Math.max(0, Math.floor(st.y / map.cellSize)));
      let localPop = 0;
      let localJobs = 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cx = gx + dx;
          const cy = gy + dy;
          if (cx >= 0 && cx < map.cols && cy >= 0 && cy < map.rows) {
            const c = map.cells[cy * map.cols + cx];
            localPop += c.population * c.landValue;
            localJobs += c.jobs * c.landValue;
          }
        }
      }

      if (localPop > 320) residentialStations.push(st);
      if (localJobs > 320) jobStations.push(st);

      const intensity =
        demandInfo.flowBias === 'to_work'
          ? localPop * 0.00048 + localJobs * 0.0001
          : demandInfo.flowBias === 'to_home'
          ? localJobs * 0.00048 + localPop * 0.0001
          : (localPop + localJobs) * 0.00022;

      const expectedNew = intensity * demandInfo.multiplier * dtSimMinutes;
      const count = Math.floor(expectedNew) + (Math.random() < expectedNew % 1 ? 1 : 0);

      for (let i = 0; i < Math.min(count, 6); i++) {
        if (st.waiting.length >= st.throughputCapacity * 0.35 + 80) break;
        const pool =
          demandInfo.flowBias === 'to_work' && jobStations.length > 0
            ? jobStations
            : demandInfo.flowBias === 'to_home' && residentialStations.length > 0
            ? residentialStations
            : liveStations;
        const target = pool[Math.floor(Math.random() * pool.length)];
        if (!target || target.id === st.id) continue;

        const route = router.findRoute(st.id, target.id);
        if (!route.reachable) continue;

        // Price elasticity against progressive fare
        const distKm = pixelsToKm(Math.hypot(target.x - st.x, target.y - st.y), map);
        const estFare = computeProgressiveFare(distKm, farePolicy);
        const farePenalty = Math.max(0, (estFare - 3) * 0.08);
        if (
          (route.totalCost > 48 * difficulty.passengerTolerance || farePenalty > 0.35) &&
          Math.random() < (0.28 + farePenalty) * difficulty.roadCompetition
        ) {
          continue;
        }

        st.waiting.push({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          originId: st.id,
          destinationId: target.id,
          nextHopStationId: route.firstHopStationId,
          spawnTime: gameMinutesOfDay,
          patience: 100,
        });
      }
    }
  }

  // 2. Update passenger patience & congestion load at stations
  let waitPenaltySum = 0;
  let waitingTotal = 0;

  for (const st of liveStations) {
    const kept = [];
    for (const p of st.waiting) {
      p.patience -= dtSimMinutes * (1.2 / difficulty.passengerTolerance);
      if (p.patience > 0) {
        kept.push(p);
      } else {
        waitPenaltySum += 1;
      }
    }
    st.waiting = kept;
    waitingTotal += st.waiting.length;
    st.congestionLoad = Math.min(1.5, st.waiting.length / Math.max(40, st.throughputCapacity * 0.18));
  }

  // 3. Dispatch & Move trains on each line
  for (const line of liveLines) {
    const activeLineStations = line.stationIds.filter((id) => stationMap.has(id));
    if (activeLineStations.length < 2) continue;
    const isClosedForNight = line.nightMaintenance && isNightWindow;
    const [shortStartIdx, shortEndIdx] = getShortTurnRange(line, activeLineStations);
    const shortZoneSet = new Set(activeLineStations.slice(shortStartIdx, shortEndIdx + 1));

    const getRoleForTrainIndex = (idx: number): 'local' | 'express' | 'short_turn' => {
      if (line.serviceMode === 'express') {
        if (line.expressPattern === 'express_only') return 'express';
        return idx % 2 === 0 ? 'express' : 'local';
      }
      if (line.serviceMode === 'short_turn' && shortEndIdx > shortStartIdx) {
        if (line.shortTurnMode === 'short_only') return 'short_turn';
        return idx % 2 === 1 ? 'short_turn' : 'local';
      }
      return 'local';
    };

    const baseDesired = Math.max(
      1,
      Math.min(14, Math.round((activeLineStations.length * 6) / Math.max(2, line.headwayMin)))
    );
    const dualPatternBonus =
      (line.serviceMode === 'express' && line.expressPattern !== 'express_only') ||
      (line.serviceMode === 'short_turn' && line.shortTurnMode !== 'short_only')
        ? 1
        : 0;
    const desiredTrains = isClosedForNight ? 0 : Math.min(16, baseDesired + dualPatternBonus);

    line.dispatchTimer += dtSimMinutes;
    if (!isClosedForNight && line.trains.length < desiredTrains && line.dispatchTimer >= line.headwayMin * 0.42) {
      line.dispatchTimer = 0;
      const role = getRoleForTrainIndex(line.trains.length);
      const spawnStIdx = role === 'short_turn' ? shortStartIdx : 0;
      const spawnSegIdx = Math.min(activeLineStations.length - 2, spawnStIdx);
      const startSt = stationMap.get(activeLineStations[spawnStIdx]);
      if (startSt) {
        const newTrain: Train = {
          id: `tr_${line.id}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          lineId: line.id,
          segmentIndex: spawnSegIdx,
          direction: 1,
          t: 0,
          speed: role === 'express' ? 225 : role === 'short_turn' ? 155 : 145,
          state: 'dwelling',
          dwellTimer: 0.4,
          passengers: [],
          capacity: line.carCount * 45,
          x: startSt.x,
          y: startSt.y,
          angle: 0,
          serviceRole: role,
        };
        line.trains.push(newTrain);
      }
    } else if (line.trains.length > desiredTrains && line.trains.length > 0) {
      line.trains.pop();
    }

    for (let tIdx = 0; tIdx < line.trains.length; tIdx++) {
      const train = line.trains[tIdx];
      const expectedRole = getRoleForTrainIndex(tIdx);
      if (train.serviceRole !== expectedRole) {
        train.serviceRole = expectedRole;
      }
      const role = train.serviceRole ?? 'local';
      train.speed = role === 'express' ? 225 : role === 'short_turn' ? 155 : 145;

      const minSegIdx = role === 'short_turn' && shortEndIdx > shortStartIdx ? shortStartIdx : 0;
      const maxSegIdx =
        role === 'short_turn' && shortEndIdx > shortStartIdx
          ? Math.max(minSegIdx, shortEndIdx - 1)
          : activeLineStations.length - 2;

      const segIdx = Math.max(minSegIdx, Math.min(maxSegIdx, train.segmentIndex));
      if (train.segmentIndex !== segIdx) {
        train.segmentIndex = segIdx;
      }

      const aId = activeLineStations[segIdx];
      const bId = activeLineStations[segIdx + 1];
      const stA = stationMap.get(aId);
      const stB = stationMap.get(bId);
      if (!stA || !stB) continue;

      const seg = segMap.get(`${aId}_${bId}`);
      const segLen = seg ? seg.length : Math.hypot(stB.x - stA.x, stB.y - stA.y);

      if (train.state === 'dwelling') {
        train.dwellTimer -= dtRealSeconds;
        if (train.dwellTimer <= 0) {
          train.state = 'moving';
        }
      } else {
        const deltaT = ((train.speed * dtRealSeconds) / Math.max(40, segLen)) * train.direction;
        train.t += deltaT;

        if (train.t >= 1 || train.t <= 0) {
          const arrivedAtEnd = train.t >= 1;
          train.t = arrivedAtEnd ? 1 : 0;
          const arrivedStationId = arrivedAtEnd ? bId : aId;
          const arrivedStationIdx = arrivedAtEnd ? segIdx + 1 : segIdx;
          const arrivedStation = stationMap.get(arrivedStationId);

          const isTerminal =
            (arrivedAtEnd && segIdx >= maxSegIdx) || (!arrivedAtEnd && segIdx <= minSegIdx);
          const shouldStop =
            role !== 'express' ||
            isTerminal ||
            isStationExpressStop(arrivedStation, arrivedStationIdx, activeLineStations.length);

          if (arrivedStation && shouldStop) {
            train.state = 'dwelling';
            train.dwellTimer = arrivedStation.size === 'hub' || arrivedStation.size === 'mall' ? 0.55 : 0.75;

            const remainingPax = [];
            for (const pax of train.passengers) {
              if (pax.destinationId === arrivedStationId) {
                arrivedStation.alightedTotal += AGENT_TO_CITY_PAX;
                ridershipDelta += AGENT_TO_CITY_PAX;
                line.dailyRidership += AGENT_TO_CITY_PAX;
                const revWan = (AGENT_TO_CITY_PAX * pax.fareAmount) / 10000;
                revenueDeltaWan += revWan;
                line.dailyRevenue += revWan;
                fareSum += pax.fareAmount;
                fareCount++;
              } else {
                const destIdx = activeLineStations.indexOf(pax.destinationId);
                const reachableOnThisTrain =
                  destIdx !== -1 &&
                  (role !== 'short_turn' || shortZoneSet.has(pax.destinationId)) &&
                  (role !== 'express' ||
                    isStationExpressStop(
                      stationMap.get(pax.destinationId),
                      destIdx,
                      activeLineStations.length
                    ));
                const throughLine = liveLines.find((l) => l.id === line.throughTargetLineId);
                const canStayViaThrough =
                  role !== 'short_turn' && throughLine
                    ? throughLine.stationIds.includes(pax.destinationId)
                    : false;

                if (reachableOnThisTrain || canStayViaThrough) {
                  remainingPax.push(pax);
                } else {
                  const route = router.findRoute(arrivedStationId, pax.destinationId);
                  if (route.reachable && arrivedStation.waiting.length < 300) {
                    arrivedStation.waiting.push({
                      id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                      originId: arrivedStationId,
                      destinationId: pax.destinationId,
                      nextHopStationId: route.firstHopStationId,
                      spawnTime: gameMinutesOfDay,
                      patience: 90,
                    });
                  }
                }
              }
            }
            train.passengers = remainingPax;

            const nextStationInDir = arrivedAtEnd
              ? segIdx < maxSegIdx
                ? activeLineStations[segIdx + 2]
                : undefined
              : segIdx > minSegIdx
              ? activeLineStations[segIdx - 1]
              : undefined;

            const canTrainServeStation = (stationId: string | null): boolean => {
              if (!stationId) return false;
              const idx = activeLineStations.indexOf(stationId);
              if (idx === -1) return false;
              if (role === 'short_turn' && !shortZoneSet.has(stationId)) return false;
              if (
                role === 'express' &&
                !isStationExpressStop(stationMap.get(stationId), idx, activeLineStations.length)
              ) {
                return false;
              }
              return true;
            };

            const stillWaiting = [];
            for (const wp of arrivedStation.waiting) {
              if (train.passengers.length >= train.capacity) {
                stillWaiting.push(wp);
                continue;
              }
              const route = router.findRoute(arrivedStationId, wp.destinationId);
              const wantsThisLine =
                canTrainServeStation(wp.destinationId) ||
                canTrainServeStation(route.firstHopStationId) ||
                (nextStationInDir &&
                  route.firstHopStationId === nextStationInDir &&
                  canTrainServeStation(nextStationInDir));

              if (wantsThisLine) {
                const destSt = stationMap.get(wp.destinationId);
                const distKm = destSt
                  ? pixelsToKm(Math.hypot(destSt.x - arrivedStation.x, destSt.y - arrivedStation.y), map)
                  : 5;
                const fareAmt = computeProgressiveFare(distKm * 1.15, farePolicy);
                train.passengers.push({
                  originId: wp.originId,
                  destinationId: wp.destinationId,
                  boardedAt: gameMinutesOfDay,
                  fareAmount: fareAmt,
                });
                arrivedStation.boardedTotal += AGENT_TO_CITY_PAX;
              } else {
                stillWaiting.push(wp);
              }
            }
            arrivedStation.waiting = stillWaiting;
          }

          if (arrivedAtEnd) {
            if (segIdx < maxSegIdx) {
              train.segmentIndex = segIdx + 1;
              train.t = 0;
            } else {
              train.direction = -1;
              train.t = 1;
            }
          } else {
            if (segIdx > minSegIdx) {
              train.segmentIndex = segIdx - 1;
              train.t = 1;
            } else {
              train.direction = 1;
              train.t = 0;
            }
          }
        }

        const curSegIdx = Math.max(minSegIdx, Math.min(maxSegIdx, train.segmentIndex));
        const ca = stationMap.get(activeLineStations[curSegIdx]);
        const cb = stationMap.get(activeLineStations[curSegIdx + 1]);
        if (ca && cb) {
          const cseg = segMap.get(`${ca.id}_${cb.id}`);
          const ctrlX = cseg ? cseg.controlX : (ca.x + cb.x) / 2;
          const ctrlY = cseg ? cseg.controlY : (ca.y + cb.y) / 2;
          const pos = evalQuadraticBezier(ca.x, ca.y, ctrlX, ctrlY, cb.x, cb.y, train.t);
          train.x = pos.x;
          train.y = pos.y;
          train.angle = train.direction === 1 ? pos.angle : pos.angle + Math.PI;
        }
      }
    }
  }

  // 4. Compute satisfaction & dynamic road congestion feedback
  const avgLoad =
    liveStations.length > 0
      ? liveStations.reduce((acc, s) => acc + s.congestionLoad, 0) / liveStations.length
      : 0;
  const rawSatisfaction = Math.max(
    15,
    Math.min(100, 92 - avgLoad * 24 - waitPenaltySum * 1.5 - (waitingTotal > 400 ? 8 : 0))
  );

  if (dtSimMinutes > 0) {
    for (const cell of map.cells) {
      if (cell.terrain === 'water') continue;
      const baseTraffic = Math.min(1, ((cell.population + cell.jobs) / 1050) * demandInfo.multiplier * 0.55);
      const targetCongestion = cell.coveredByMetro ? baseTraffic * 0.42 : Math.min(1, baseTraffic * 1.15);
      cell.roadCongestion += (targetCongestion - cell.roadCongestion) * Math.min(1, dtSimMinutes * 0.04);
    }
    for (const road of map.roads) {
      const mx = (road.x1 + road.x2) / 2;
      const my = (road.y1 + road.y2) / 2;
      const gx = Math.min(map.cols - 1, Math.max(0, Math.floor(mx / map.cellSize)));
      const gy = Math.min(map.rows - 1, Math.max(0, Math.floor(my / map.cellSize)));
      const cell = map.cells[gy * map.cols + gx];
      if (cell) {
        const target = Math.min(1.2, cell.roadCongestion * (road.isArterial ? 0.85 : 0.65) + 0.02);
        road.saturation += (target - road.saturation) * Math.min(1, dtSimMinutes * 0.05);
      }
    }
  }

  return {
    ridershipDelta,
    revenueDelta: revenueDeltaWan,
    satisfaction: Math.round(rawSatisfaction),
    avgFare: fareCount > 0 ? Number((fareSum / fareCount).toFixed(2)) : farePolicy.baseFare + 0.35,
  };
}

export function applyDailyUrbanEvolution(map: CityMap, day: number, _year: number) {
  for (const cell of map.cells) {
    if (cell.terrain !== 'land') continue;
    if (cell.coveredByMetro) {
      cell.landValue = Math.min(2.6, cell.landValue + 0.015);
      if (cell.zone === 'residential' && cell.population < 950) {
        cell.population = Math.min(950, Math.round(cell.population + 3 + (day % 3)));
      } else if (cell.zone === 'commercial' && cell.jobs < 980) {
        cell.jobs = Math.min(980, Math.round(cell.jobs + 4));
      } else if (cell.zone === 'none' && Math.random() < 0.018) {
        cell.zone = Math.random() < 0.65 ? 'residential' : 'commercial';
        cell.population = cell.zone === 'residential' ? 140 : 40;
        cell.jobs = cell.zone === 'commercial' ? 160 : 20;
      }
    } else if (cell.roadCongestion > 0.75 && cell.population > 120) {
      cell.population = Math.max(80, cell.population - 1);
    }
  }
}
