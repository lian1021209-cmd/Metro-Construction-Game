import { CityMap, Station, TrackSegment, TransitLine } from '../types/game';

interface GraphEdge {
  toStationId: string;
  lineId: string;
  cost: number; // generalized minutes
}

/**
 * Builds a transit routing graph where edges belong to specific lines.
 * Supports:
 * - Local (all stations on line)
 * - Express (only stations flagged isExpressStop, or terminals)
 * - Short-turn (middle 60% subset of stations on line)
 * - Through-Service (zero transfer penalty between linked lines)
 */
export function getActiveStationIdsForLine(line: TransitLine, stationsMap: Map<string, Station>): string[] {
  const ids = line.stationIds.filter((id) => stationsMap.has(id));
  if (ids.length < 2) return ids;

  if (line.serviceMode === 'express' && ids.length >= 3) {
    return ids.filter((id, idx) => {
      if (idx === 0 || idx === ids.length - 1) return true;
      const st = stationsMap.get(id);
      return st ? st.isExpressStop || st.size === 'hub' || st.size === 'mall' : true;
    });
  }

  if (line.serviceMode === 'short_turn' && ids.length >= 4) {
    const start = Math.floor(ids.length * 0.2);
    const end = Math.ceil(ids.length * 0.8);
    return ids.slice(start, Math.max(start + 2, end));
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

    for (const line of lines) {
      const activeIds = getActiveStationIdsForLine(line, stationMap);
      if (activeIds.length < 2) continue;

      const headwayPenalty = line.headwayMin * 0.45;
      const speedFactor = line.serviceMode === 'express' ? 0.72 : 1.0;

      for (let i = 0; i < activeIds.length - 1; i++) {
        const a = activeIds[i];
        const b = activeIds[i + 1];
        const stA = stationMap.get(a);
        const stB = stationMap.get(b);
        if (!stA || !stB) continue;

        const seg = segMap.get(`${a}_${b}`);
        const dist = seg ? seg.length : Math.hypot(stB.x - stA.x, stB.y - stA.y);
        const travelMinutes = (dist / 140) * speedFactor + 0.6 + headwayPenalty * 0.15;

        if (!this.adjacency.has(a)) this.adjacency.set(a, []);
        if (!this.adjacency.has(b)) this.adjacency.set(b, []);
        this.adjacency.get(a)!.push({ toStationId: b, lineId: line.id, cost: travelMinutes });
        this.adjacency.get(b)!.push({ toStationId: a, lineId: line.id, cost: travelMinutes });
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
      // Pop smallest cost
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
            transferPenalty = 3.5; // transfer walking + wait penalty
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
