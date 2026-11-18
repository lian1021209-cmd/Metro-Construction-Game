import { CityMap, Station, TrackSegment, TransitLine } from '../types/game';

interface GraphEdge {
  toStationId: string;
  lineId: string;
  cost: number; // generalized minutes
}

export function isStationExpressStop(
  station: Station | undefined,
  indexOnLine: number,
  totalStationsOnLine: number
): boolean {
  if (indexOnLine === 0 || indexOnLine === totalStationsOnLine - 1) return true;
  if (!station) return false;
  return station.isExpressStop || station.size === 'hub' || station.size === 'mall';
}

export function getShortTurnRange(
  line: TransitLine,
  orderedStationIds: string[]
): [number, number] {
  const len = orderedStationIds.length;
  if (len < 2) return [0, Math.max(0, len - 1)];

  if (line.shortTurnStartId && line.shortTurnEndId) {
    const iStart = orderedStationIds.indexOf(line.shortTurnStartId);
    const iEnd = orderedStationIds.indexOf(line.shortTurnEndId);
    if (iStart !== -1 && iEnd !== -1 && iStart !== iEnd) {
      return [Math.min(iStart, iEnd), Math.max(iStart, iEnd)];
    }
  }

  if (len >= 4) {
    const start = Math.floor(len * 0.2);
    const end = Math.min(len - 1, Math.max(start + 1, Math.ceil(len * 0.8) - 1));
    return [start, end];
  }

  return [0, len - 1];
}

/**
 * Builds a transit routing graph where edges belong to specific lines.
 * Supports:
 * - Local (all stations on line)
 * - Express (mixed Express+Local co-dispatch, or Express-only skip-stop)
 * - Short-turn (mixed main+short-turn core frequency boost, or short-turn only)
 * - Through-Service (zero transfer penalty between linked lines)
 */
export function getActiveStationIdsForLine(line: TransitLine, stationsMap: Map<string, Station>): string[] {
  const ids = line.stationIds.filter((id) => stationsMap.has(id));
  if (ids.length < 2) return ids;

  if (line.serviceMode === 'express' && line.expressPattern === 'express_only' && ids.length >= 3) {
    return ids.filter((id, idx) => isStationExpressStop(stationsMap.get(id), idx, ids.length));
  }

  if (line.serviceMode === 'short_turn' && line.shortTurnMode === 'short_only' && ids.length >= 3) {
    const [start, end] = getShortTurnRange(line, ids);
    return ids.slice(start, end + 1);
  }

  return ids;
}

export interface RouteResult {
  reachable: boolean;
  totalCost: number;
  firstHopStationId: string | null;
  transfers: number;
}

export class TransitRouter {
  // key: `${originId}->${destId}` -> nextHopStationId
  private nextHopCache = new Map<string, RouteResult>();
  private adjacency = new Map<string, GraphEdge[]>();
  private throughLinks = new Map<string, Set<string>>();

  public rebuild(
    stations: Station[],
    segments: TrackSegment[],
    lines: TransitLine[]
  ) {
    this.nextHopCache.clear();
    this.adjacency.clear();
    this.throughLinks.clear();

    const stationMap = new Map(stations.map((s) => [s.id, s]));
    const segMap = new Map<string, TrackSegment>();
    for (const seg of segments) {
      segMap.set(`${seg.fromStationId}_${seg.toStationId}`, seg);
      segMap.set(`${seg.toStationId}_${seg.fromStationId}`, seg);
    }

    // Track bidirectional through-service pairs
    for (const line of lines) {
      if (line.throughTargetLineId) {
        if (!this.throughLinks.has(line.id)) this.throughLinks.set(line.id, new Set());
        if (!this.throughLinks.has(line.throughTargetLineId)) {
          this.throughLinks.set(line.throughTargetLineId, new Set());
        }
        this.throughLinks.get(line.id)!.add(line.throughTargetLineId);
        this.throughLinks.get(line.throughTargetLineId)!.add(line.id);
      }
    }

    const addBiEdge = (a: string, b: string, lineId: string, cost: number) => {
      if (!this.adjacency.has(a)) this.adjacency.set(a, []);
      if (!this.adjacency.has(b)) this.adjacency.set(b, []);
      this.adjacency.get(a)!.push({ toStationId: b, lineId, cost });
      this.adjacency.get(b)!.push({ toStationId: a, lineId, cost });
    };

    for (const line of lines) {
      const fullIds = line.stationIds.filter((id) => stationMap.has(id));
      if (fullIds.length < 2) continue;

      const headwayPenalty = line.headwayMin * 0.45;

      if (line.serviceMode === 'express') {
        const expressIds = fullIds.filter((id, idx) =>
          isStationExpressStop(stationMap.get(id), idx, fullIds.length)
        );
        // Add fast skip-stop express corridor edges
        for (let i = 0; i < expressIds.length - 1; i++) {
          const a = expressIds[i];
          const b = expressIds[i + 1];
          const stA = stationMap.get(a);
          const stB = stationMap.get(b);
          if (!stA || !stB) continue;
          const dist = Math.hypot(stB.x - stA.x, stB.y - stA.y);
          const expressCost = (dist / 140) * 0.65 + 0.55 + headwayPenalty * 0.14;
          addBiEdge(a, b, line.id, expressCost);
        }

        // In mixed 快慢車 mode (default), slow local service still serves all intermediate stops
        if (line.expressPattern !== 'express_only') {
          for (let i = 0; i < fullIds.length - 1; i++) {
            const a = fullIds[i];
            const b = fullIds[i + 1];
            const stA = stationMap.get(a);
            const stB = stationMap.get(b);
            if (!stA || !stB) continue;
            const seg = segMap.get(`${a}_${b}`);
            const dist = seg ? seg.length : Math.hypot(stB.x - stA.x, stB.y - stA.y);
            const localCost = dist / 140 + 0.7 + headwayPenalty * 0.18;
            addBiEdge(a, b, line.id, localCost);
          }
        }
        continue;
      }

      if (line.serviceMode === 'short_turn') {
        const [stStart, stEnd] = getShortTurnRange(line, fullIds);
        const isShortOnly = line.shortTurnMode === 'short_only';
        const iterStart = isShortOnly ? stStart : 0;
        const iterEnd = isShortOnly ? stEnd - 1 : fullIds.length - 2;

        for (let i = iterStart; i <= iterEnd; i++) {
          const a = fullIds[i];
          const b = fullIds[i + 1];
          const stA = stationMap.get(a);
          const stB = stationMap.get(b);
          if (!stA || !stB) continue;
          const seg = segMap.get(`${a}_${b}`);
          const dist = seg ? seg.length : Math.hypot(stB.x - stA.x, stB.y - stA.y);
          const inShortZone = i >= stStart && i + 1 <= stEnd;
          const waitFactor = inShortZone ? 0.08 : 0.18;
          const travelMinutes = dist / 140 + 0.6 + headwayPenalty * waitFactor;
          addBiEdge(a, b, line.id, travelMinutes);
        }
        continue;
      }

      // Local or Through-Service
      for (let i = 0; i < fullIds.length - 1; i++) {
        const a = fullIds[i];
        const b = fullIds[i + 1];
        const stA = stationMap.get(a);
        const stB = stationMap.get(b);
        if (!stA || !stB) continue;

        const seg = segMap.get(`${a}_${b}`);
        const dist = seg ? seg.length : Math.hypot(stB.x - stA.x, stB.y - stA.y);
        const travelMinutes = dist / 140 + 0.6 + headwayPenalty * 0.15;
        addBiEdge(a, b, line.id, travelMinutes);
      }
    }
  }

  public findRoute(originId: string, destId: string): RouteResult {
    if (originId === destId) {
      return { reachable: true, totalCost: 0, firstHopStationId: null, transfers: 0 };
    }
    const key = `${originId}->${destId}`;
    const cached = this.nextHopCache.get(key);
    if (cached) return cached;

    // Dijkstra over (stationId, lastLineId)
    interface NodeState {
      stationId: string;
      lineId: string | null;
      cost: number;
      firstHop: string | null;
      transfers: number;
    }

    const bestCost = new Map<string, number>();
    const queue: NodeState[] = [
      { stationId: originId, lineId: null, cost: 0, firstHop: null, transfers: 0 },
    ];

    let result: RouteResult = { reachable: false, totalCost: Infinity, firstHopStationId: null, transfers: 0 };

    while (queue.length > 0) {
      let minIdx = 0;
      for (let i = 1; i < queue.length; i++) {
        if (queue[i].cost < queue[minIdx].cost) minIdx = i;
      }
      const cur = queue.splice(minIdx, 1)[0];

      if (cur.stationId === destId) {
        result = {
          reachable: true,
          totalCost: cur.cost,
          firstHopStationId: cur.firstHop,
          transfers: cur.transfers,
        };
        break;
      }

      const stateKey = `${cur.stationId}|${cur.lineId ?? 'none'}`;
      const prev = bestCost.get(stateKey);
      if (prev !== undefined && prev < cur.cost) continue;

      const edges = this.adjacency.get(cur.stationId) || [];
      for (const edge of edges) {
        let transferPenalty = 0;
        let addedTransfer = 0;
        if (cur.lineId !== null && cur.lineId !== edge.lineId) {
          const isThrough = this.throughLinks.get(cur.lineId)?.has(edge.lineId) ?? false;
          if (!isThrough) {
            transferPenalty = 3.5;
            addedTransfer = 1;
          }
        }
        const nextCost = cur.cost + edge.cost + transferPenalty;
        const nextKey = `${edge.toStationId}|${edge.lineId}`;
        const existing = bestCost.get(nextKey);
        if (existing === undefined || nextCost < existing) {
          bestCost.set(nextKey, nextCost);
          queue.push({
            stationId: edge.toStationId,
            lineId: edge.lineId,
            cost: nextCost,
            firstHop: cur.firstHop ?? edge.toStationId,
            transfers: cur.transfers + addedTransfer,
          });
        }
      }
    }

    this.nextHopCache.set(key, result);
    return result;
  }
}

export function recomputeMapCoverage(map: CityMap, stations: Station[]): {
  coveragePercent: number;
  totalPopulation: number;
  totalJobs: number;
  avgCongestion: number;
} {
  let totalPop = 0;
  let totalJobs = 0;
  let coveredWeight = 0;
  let totalWeight = 0;
  let congestionSum = 0;
  let landCells = 0;

  for (const cell of map.cells) {
    const cx = (cell.gx + 0.5) * map.cellSize;
    const cy = (cell.gy + 0.5) * map.cellSize;
    let covered = false;

    for (const st of stations) {
      const dist = Math.hypot(cx - st.x, cy - st.y);
      if (dist <= st.catchmentRadius) {
        covered = true;
        break;
      }
    }
    cell.coveredByMetro = covered;

    const w = cell.population + cell.jobs;
    totalPop += cell.population;
    totalJobs += cell.jobs;
    totalWeight += w;
    if (covered) coveredWeight += w;

    if (cell.terrain !== 'water') {
      landCells++;
      congestionSum += cell.roadCongestion;
    }
  }

  return {
    coveragePercent: totalWeight > 0 ? Math.min(100, (coveredWeight / totalWeight) * 100) : 0,
    totalPopulation: totalPop,
    totalJobs: totalJobs,
    avgCongestion: landCells > 0 ? (congestionSum / landCells) * 100 : 0,
  };
}
