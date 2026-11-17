import {
  CityMap,
  DEPTH_LEVELS,
  DifficultyConfig,
  DistrictInfo,
  FarePolicy,
  Station,
  StationSize,
  STATION_CONFIGS,
  TrackDepth,
  TrackSegment,
  Train,
  TransitLine,
} from '../types/game';
import { TransitRouter } from './pathfinding';

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

export function pointInDistrict(d: DistrictInfo, wx: number, wy: number): boolean {
  const rings = d.polygons ?? (d.polygon ? [d.polygon] : null);
  if (rings && rings.length > 0) {
    for (const r of rings) {
      if (r.length >= 3 && pointInPolygon(wx, wy, r)) return true;
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

  // 2. Inland lake polygons (e.g. Dianshan Lake)
  if (map.waterPolygons) {
    for (const lake of map.waterPolygons) {
      if (lake.points.length >= 3 && pointInPolygon(wx, wy, lake.points)) {
        return { isWater: true, reason: 'river' };
      }
    }
  }

  // 3. Major rivers & creeks (e.g. Suzhou Creek; Huangpu River uses exact riverbank polygon in waterPolygons)
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

      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const cx = gx + dx;
          const cy = gy + dy;
          if (cx >= 0 && cx < map.cols && cy >= 0 && cy < map.rows) {
            const c = map.cells[cy * map.cols + cx];
            localPop += c.population * c.landValue;
            localJobs += c.jobs * c.landValue;
          }
        }
      }

      if (localPop > 120) residentialStations.push(st);
      if (localJobs > 120) jobStations.push(st);

      const intensity =
        demandInfo.flowBias === 'to_work'
          ? localPop * 0.00055 + localJobs * 0.0001
          : demandInfo.flowBias === 'to_home'
          ? localJobs * 0.00055 + localPop * 0.0001
          : (localPop + localJobs) * 0.00024;

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
          (route.totalCost > 26 * difficulty.passengerTolerance || farePenalty > 0.25) &&
          Math.random() < (0.3 + farePenalty) * difficulty.roadCompetition
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

    const desiredTrains = isClosedForNight
      ? 0
      : Math.max(1, Math.min(14, Math.round((activeLineStations.length * 6) / Math.max(2, line.headwayMin))));

    line.dispatchTimer += dtSimMinutes;
    if (!isClosedForNight && line.trains.length < desiredTrains && line.dispatchTimer >= line.headwayMin * 0.45) {
      line.dispatchTimer = 0;
      const startSt = stationMap.get(activeLineStations[0]);
      if (startSt) {
        const newTrain: Train = {
          id: `tr_${line.id}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          lineId: line.id,
          segmentIndex: 0,
          direction: 1,
          t: 0,
          speed: line.serviceMode === 'express' ? 210 : 145,
          state: 'dwelling',
          dwellTimer: 0.4,
          passengers: [],
          capacity: line.carCount * 45,
          x: startSt.x,
          y: startSt.y,
          angle: 0,
        };
        line.trains.push(newTrain);
      }
    } else if (line.trains.length > desiredTrains && line.trains.length > 0) {
      line.trains.pop();
    }

    for (const train of line.trains) {
      const segIdx = Math.max(0, Math.min(activeLineStations.length - 2, train.segmentIndex));
      const aId = activeLineStations[segIdx];
      const bId = activeLineStations[segIdx + 1];
      const stA = stationMap.get(aId);
      const stB = stationMap.get(bId);
      if (!stA || !stB) continue;

      const seg = segMap.get(`${aId}_${bId}`);
      const cx = seg ? seg.controlX : (stA.x + stB.x) / 2;
      const cy = seg ? seg.controlY : (stA.y + stB.y) / 2;
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
          const arrivedStation = stationMap.get(arrivedStationId);

          const isTerminal =
            (arrivedAtEnd && segIdx === activeLineStations.length - 2) ||
            (!arrivedAtEnd && segIdx === 0);
          const shouldStop =
            line.serviceMode !== 'express' ||
            isTerminal ||
            (arrivedStation
              ? arrivedStation.isExpressStop || arrivedStation.size === 'hub' || arrivedStation.size === 'mall'
              : true);

          if (arrivedStation && shouldStop) {
            train.state = 'dwelling';
            train.dwellTimer = arrivedStation.size === 'hub' || arrivedStation.size === 'mall' ? 0.55 : 0.75;

            const remainingPax = [];
            for (const pax of train.passengers) {
              if (pax.destinationId === arrivedStationId) {
                arrivedStation.alightedTotal += AGENT_TO_CITY_PAX;
                ridershipDelta += AGENT_TO_CITY_PAX;
                line.dailyRidership += AGENT_TO_CITY_PAX;
                // Ticket revenue in 萬元 = (AGENT_TO_CITY_PAX * fare) / 10,000
                const revWan = (AGENT_TO_CITY_PAX * pax.fareAmount) / 10000;
                revenueDeltaWan += revWan;
                line.dailyRevenue += revWan;
                fareSum += pax.fareAmount;
                fareCount++;
              } else {
                const canStayOnLine = activeLineStations.includes(pax.destinationId);
                const throughLine = liveLines.find((l) => l.id === line.throughTargetLineId);
                const canStayViaThrough = throughLine
                  ? throughLine.stationIds.includes(pax.destinationId)
                  : false;

                if (canStayOnLine || canStayViaThrough) {
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
              ? activeLineStations[segIdx + 2]
              : activeLineStations[segIdx - 1];

            const stillWaiting = [];
            for (const wp of arrivedStation.waiting) {
              if (train.passengers.length >= train.capacity) {
                stillWaiting.push(wp);
                continue;
              }
              const route = router.findRoute(arrivedStationId, wp.destinationId);
              const wantsThisLine =
                activeLineStations.includes(wp.destinationId) ||
                (route.firstHopStationId && activeLineStations.includes(route.firstHopStationId)) ||
                (nextStationInDir && route.firstHopStationId === nextStationInDir);

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
            if (segIdx < activeLineStations.length - 2) {
              train.segmentIndex = segIdx + 1;
              train.t = 0;
            } else {
              train.direction = -1;
              train.t = 1;
            }
          } else {
            if (segIdx > 0) {
              train.segmentIndex = segIdx - 1;
              train.t = 1;
            } else {
              train.direction = 1;
              train.t = 0;
            }
          }
        }

        const curSegIdx = Math.max(0, Math.min(activeLineStations.length - 2, train.segmentIndex));
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
