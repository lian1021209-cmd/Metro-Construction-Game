import {
  BuildingModel,
  CityCell,
  CityMap,
  CityPoi,
  CityRegionInfo,
  DistrictInfo,
  HillContour,
  MapMode,
  ProvinceRegionInfo,
  RealCityId,
  RiverPath,
  Station,
  TerrainType,
  ZoneType,
} from '../types/game';
import {
  createGeoBounds,
  GeoBounds,
  getCachedReverseGeocodePlace,
  latLonToWorld,
  registerCityCellsBaseline,
  ReverseGeocodePlace,
  toTraditionalPlaceName,
  worldToLatLon,
} from './geo';
import { getWorldPopCellQ } from './worldpopBaseline';
import {
  SHANGHAI_DIANSHAN_LAKE_WGS84,
  SHANGHAI_DISHUI_LAKE_WGS84,
  SHANGHAI_DISTRICTS_WGS84,
  SHANGHAI_HUANGPU_POLY_WGS84,
  SHANGHAI_HUANGPU_WGS84,
  SHANGHAI_SUZHOU_WGS84,
} from './shanghaiGeoData';
import { SHANGHAI_PLACES_WGS84 } from './shanghaiPlaces';
import {
  GAOYOU_LAKE_POLY_WGS84,
  HONGZE_LAKE_POLY_WGS84,
  NEIGHBOR_CITIES_WGS84,
  NEIGHBOR_DISTRICTS_WGS84,
  NEIGHBOR_PLACES_WGS84,
  NEIGHBOR_POIS_WGS84,
  NEIGHBOR_PROVINCES_WGS84,
  NEIGHBOR_URBAN_CENTERS_WGS84,
  QIANDAO_LAKE_POLY_WGS84,
  QIANTANG_RIVER_WGS84,
  TAIHU_LAKE_POLY_WGS84,
  YANGCHENG_LAKE_POLY_WGS84,
  YANGTZE_RIVER_WGS84,
} from './neighborGeoData';

function hash2D(ix: number, iy: number, seed: number): number {
  let n = ix * 374761393 + iy * 668265263 + seed * 1442695041;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function valueNoise2D(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smoothstep(x - ix);
  const fy = smoothstep(y - iy);

  const v00 = hash2D(ix, iy, seed);
  const v10 = hash2D(ix + 1, iy, seed);
  const v01 = hash2D(ix, iy + 1, seed);
  const v11 = hash2D(ix + 1, iy + 1, seed);

  const i1 = v00 + (v10 - v00) * fx;
  const i2 = v01 + (v11 - v01) * fx;
  return i1 + (i2 - i1) * fy;
}

export function fbm2D(x: number, y: number, seed: number, octaves = 4): number {
  let total = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    total += valueNoise2D(x * freq, y * freq, seed + i * 97) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.02;
  }
  return total / norm;
}

interface ProjectedShanghaiPlace {
  name: string;
  x: number;
  y: number;
  kind: 'landmark' | 'road' | 'neighborhood';
}

const projectedPlacesCache = new WeakMap<GeoBounds, ProjectedShanghaiPlace[]>();

function getProjectedShanghaiPlaces(map: CityMap): ProjectedShanghaiPlace[] {
  const geo = map.geoBounds;
  if (!geo) return [];
  const cached = projectedPlacesCache.get(geo);
  if (cached) return cached;
  const allPlaces = [...SHANGHAI_PLACES_WGS84, ...NEIGHBOR_PLACES_WGS84];
  const projected = allPlaces.map((p) => {
    const pt = latLonToWorld(p.lat, p.lon, geo, map.width, map.height);
    return { name: p.name, x: pt.x, y: pt.y, kind: p.kind };
  });
  projectedPlacesCache.set(geo, projected);
  return projected;
}

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function compassDirection(dx: number, dy: number): string {
  if (Math.hypot(dx, dy) < 1e-3) return '東';
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180, +x=East, +y=South
  if (angle >= -22.5 && angle < 22.5) return '東';
  if (angle >= 22.5 && angle < 67.5) return '東南';
  if (angle >= 67.5 && angle < 112.5) return '南';
  if (angle >= 112.5 && angle < 157.5) return '西南';
  if (angle >= 157.5 || angle < -157.5) return '西';
  if (angle >= -157.5 && angle < -112.5) return '西北';
  if (angle >= -112.5 && angle < -67.5) return '北';
  return '東北';
}

function cardinalDirection(dx: number, dy: number): string {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? '東' : '西';
  return dy >= 0 ? '南' : '北';
}

function isValidStreetName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length < 2) return false;
  if (
    trimmed === '城市主幹道' ||
    trimmed === '城市主干道' ||
    trimmed === '無名路' ||
    trimmed === 'unnamed'
  ) {
    return false;
  }
  return true;
}

function isHighwayCode(name: string): boolean {
  return /^[GSX]\d+/i.test(name.trim());
}

function cleanPlaceLabel(raw: string): string {
  let s = toTraditionalPlaceName(raw.trim());
  if (s.endsWith('街道') && s.length > 3) {
    s = s.slice(0, -2);
  }
  return s;
}

function findDistrictAt(map: CityMap, wx: number, wy: number): DistrictInfo | null {
  for (const d of map.districts) {
    const rings = d.polygons ?? (d.polygon ? [d.polygon] : []);
    for (const ring of rings) {
      if (ring.length < 3) continue;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of ring) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      if (wx >= minX && wx <= maxX && wy >= minY && wy <= maxY && isPointInRing(wx, wy, ring)) {
        return d;
      }
    }
  }
  return null;
}

function shortDistrictName(name: string): string {
  const firstPart = name.split('·')[0].trim();
  if (firstPart.endsWith('工業園區')) return '蘇州園區';
  if (firstPart.endsWith('經開區')) return firstPart.slice(0, -3);
  if (firstPart.endsWith('新區') && firstPart.length > 2) return firstPart.slice(0, -2);
  if (
    (firstPart.endsWith('區') || firstPart.endsWith('縣') || firstPart.endsWith('市')) &&
    firstPart.length > 2
  ) {
    return firstPart.slice(0, -1);
  }
  return firstPart;
}

function findNearestRoads(
  map: CityMap,
  wx: number,
  wy: number,
  maxDistPx: number
): { name: string; dist: number; isCode: boolean }[] {
  const bestByName = new Map<string, number>();
  for (const r of map.roads) {
    if (!isValidStreetName(r.name)) continue;
    const minSegX = Math.min(r.x1, r.x2) - maxDistPx;
    const maxSegX = Math.max(r.x1, r.x2) + maxDistPx;
    const minSegY = Math.min(r.y1, r.y2) - maxDistPx;
    const maxSegY = Math.max(r.y1, r.y2) + maxDistPx;
    if (wx < minSegX || wx > maxSegX || wy < minSegY || wy > maxSegY) continue;

    const d = distToSegment(wx, wy, r.x1, r.y1, r.x2, r.y2);
    if (d <= maxDistPx) {
      const cleaned = cleanPlaceLabel(r.name);
      const prev = bestByName.get(cleaned);
      if (prev === undefined || d < prev) {
        bestByName.set(cleaned, d);
      }
    }
  }

  return Array.from(bestByName.entries())
    .map(([name, dist]) => ({ name, dist, isCode: isHighwayCode(name) }))
    .sort((a, b) => {
      // Strongly prefer named streets over bare expressway ref codes like G15/S20
      if (a.isCode !== b.isCode) {
        if (!a.isCode && a.dist <= maxDistPx * 0.9) return -1;
        if (!b.isCode && b.dist <= maxDistPx * 0.9) return 1;
      }
      return a.dist - b.dist;
    });
}

function ensureUniqueStationName(
  baseName: string,
  existingStations: Station[],
  wx: number,
  wy: number,
  secondaryHints: string[] = []
): string {
  const used = new Set(existingStations.map((s) => s.name.trim()));
  const base = baseName.trim();
  if (!used.has(base)) return base;

  // 1. Try combining with a distinct local cross street, neighborhood, or landmark
  for (const hint of secondaryHints) {
    const cleanHint = hint.trim();
    if (!cleanHint || cleanHint === base || base.includes(cleanHint) || cleanHint.includes(base)) {
      continue;
    }
    const combo = `${base}·${cleanHint}`;
    if (!used.has(combo)) return combo;
  }

  // 2. Try directional suffix relative to the nearest colliding station
  const sameNamed = existingStations.filter(
    (s) => s.name.trim() === base || s.name.trim().startsWith(base)
  );
  if (sameNamed.length > 0) {
    let nearest = sameNamed[0];
    let bestD = Infinity;
    for (const s of sameNamed) {
      const d = Math.hypot(wx - s.x, wy - s.y);
      if (d < bestD) {
        bestD = d;
        nearest = s;
      }
    }
    const dir = cardinalDirection(wx - nearest.x, wy - nearest.y);
    const dirCandidate = base.endsWith(dir) ? `${base}站` : `${base}${dir}`;
    if (!used.has(dirCandidate)) return dirCandidate;
  }

  for (const dir of ['東', '西', '南', '北']) {
    const candidate = `${base}${dir}`;
    if (!used.has(candidate)) return candidate;
  }

  let n = 2;
  while (used.has(`${base}${n}站`)) {
    n++;
  }
  return `${base}${n}站`;
}

/**
 * Deterministically derives a realistic Shanghai station name from the coordinate's
 * nearest landmark/special building, Overpass street/cross-street, neighborhood/subdistrict,
 * or administrative district — never using random names.
 */
export function suggestStationName(
  map: CityMap,
  wx: number,
  wy: number,
  existingStations: Station[] = []
): string {
  // 0. Check synchronous reverse-geocode cache first (populated by hover prefetch or prior calls)
  if (map.geoBounds) {
    const ll = worldToLatLon(wx, wy, map.geoBounds, map.width, map.height);
    const cachedGeo = getCachedReverseGeocodePlace(ll.lat, ll.lon);
    if (cachedGeo) {
      const geoResolved = resolveNominatimStationName(cachedGeo, map, wx, wy, existingStations);
      if (geoResolved) return geoResolved;
    }
  }

  // World scale ~49.5 m/px: 4.2 px ≈ 210 m, 8.5 px ≈ 420 m, 10 px ≈ 500 m
  const places = getProjectedShanghaiPlaces(map);
  const nearestPois = map.pois
    .map((p) => ({ name: cleanPlaceLabel(p.name), dist: Math.hypot(wx - p.x, wy - p.y) }))
    .sort((a, b) => a.dist - b.dist);

  const nearestPlaces = places
    .map((p) => ({ ...p, dist: Math.hypot(wx - p.x, wy - p.y) }))
    .sort((a, b) => a.dist - b.dist);

  const nearestLandmarkPlace = nearestPlaces.find((p) => p.kind === 'landmark');
  const nearestSubPlace = nearestPlaces.find((p) => p.kind !== 'landmark') ?? nearestPlaces[0];
  const nearbyRoads = findNearestRoads(map, wx, wy, 12);
  const containingDist = findDistrictAt(map, wx, wy);

  const hints: string[] = [];
  for (const r of nearbyRoads.slice(1, 4)) hints.push(r.name);
  for (const np of nearestPlaces.slice(0, 3)) {
    if (np.dist < 42) hints.push(np.name);
  }
  if (containingDist) hints.push(shortDistrictName(containingDist.name));

  let primaryCandidate: string | null = null;

  // Tier 1: Direct landmark/POI right at the station site (~200m = 4.2px)
  // Anything 500m (~10px) away will NOT steal a distant hub/landmark name.
  if (nearestPois[0] && nearestPois[0].dist <= 4.2) {
    primaryCandidate = nearestPois[0].name;
  } else if (nearestLandmarkPlace && nearestLandmarkPlace.dist <= 4.2) {
    primaryCandidate = nearestLandmarkPlace.name;
  }

  // Tier 2: Pick the closest local street (Overpass) or local neighborhood/road (Gazetteer) within ~420m (8.5px)
  if (!primaryCandidate) {
    const roadBest = nearbyRoads[0] && !nearbyRoads[0].isCode && nearbyRoads[0].dist <= 6.5 ? nearbyRoads[0] : null;
    const placeBest = nearestSubPlace && nearestSubPlace.dist <= 8.5 ? nearestSubPlace : null;

    if (roadBest && placeBest) {
      primaryCandidate = roadBest.dist <= placeBest.dist + 1.2 ? roadBest.name : placeBest.name;
    } else if (roadBest) {
      primaryCandidate = roadBest.name;
    } else if (placeBest) {
      primaryCandidate = placeBest.name;
    }

    // If that road name already has a station, try forming a real street intersection first
    if (
      primaryCandidate &&
      nearbyRoads[0] &&
      primaryCandidate === nearbyRoads[0].name &&
      existingStations.some((s) => s.name === primaryCandidate) &&
      nearbyRoads[1] &&
      nearbyRoads[1].dist <= 6.5 &&
      !nearbyRoads[1].isCode
    ) {
      const intersection = `${nearbyRoads[0].name}·${nearbyRoads[1].name}`;
      if (!existingStations.some((s) => s.name === intersection)) {
        primaryCandidate = intersection;
      }
    }
  }

  // Tier 3: Medium-range Overpass road (~550m) or nearest local street/neighborhood (~1.4km)
  if (!primaryCandidate && nearbyRoads[0] && nearbyRoads[0].dist <= 11) {
    primaryCandidate = nearbyRoads[0].name;
  }
  if (!primaryCandidate && nearestSubPlace && nearestSubPlace.dist <= 28) {
    primaryCandidate = nearestSubPlace.name;
  }
  if (!primaryCandidate && nearestPlaces[0] && nearestPlaces[0].dist <= 28) {
    primaryCandidate = nearestPlaces[0].name;
  }

  // Tier 4: Containing administrative district + compass quadrant (triggered at >400m from center so 500m moves differ)
  if (!primaryCandidate && containingDist) {
    const shortName = shortDistrictName(containingDist.name);
    const distFromCenter = Math.hypot(wx - containingDist.x, wy - containingDist.y);
    if (distFromCenter > 8.5) {
      const comp = compassDirection(wx - containingDist.x, wy - containingDist.y);
      const outerTag = distFromCenter > 45 ? '新城' : '';
      primaryCandidate = `${shortName}${comp}${outerTag}`;
    } else {
      primaryCandidate = shortName;
    }
  }

  // Tier 5: Nearest district fallback (should only happen on narrow coastal edge)
  if (!primaryCandidate) {
    let closestDist: DistrictInfo | null = null;
    let minD = Infinity;
    for (const d of map.districts) {
      const dist = Math.hypot(wx - d.x, wy - d.y);
      if (dist < minD) {
        minD = dist;
        closestDist = d;
      }
    }
    primaryCandidate = closestDist ? shortDistrictName(closestDist.name) : '上海新站';
  }

  return ensureUniqueStationName(primaryCandidate, existingStations, wx, wy, hints);
}

/**
 * Refines a station's name using real-time OpenStreetMap Nominatim reverse-geocode details
 * (exact building/landmark, street/road, neighborhood/里/小區, or subdistrict/鎮).
 */
export function resolveNominatimStationName(
  place: ReverseGeocodePlace,
  map: CityMap,
  wx: number,
  wy: number,
  otherStations: Station[]
): string | null {
  const landmark = place.landmark ? cleanPlaceLabel(place.landmark) : '';
  const road = place.road && isValidStreetName(place.road) ? cleanPlaceLabel(place.road) : '';
  const neighborhood = place.neighborhood ? cleanPlaceLabel(place.neighborhood) : '';
  const subdistrict = place.subdistrict ? cleanPlaceLabel(place.subdistrict) : '';

  const hints: string[] = [];
  if (neighborhood) hints.push(neighborhood);
  if (subdistrict) hints.push(subdistrict);
  if (road) hints.push(road);

  // Only snap to a map POI/landmark if player clicked directly at it (~180m = 3.6px)
  const veryClosePoi = map.pois
    .map((p) => ({ name: cleanPlaceLabel(p.name), dist: Math.hypot(wx - p.x, wy - p.y) }))
    .filter((p) => p.dist <= 3.6)
    .sort((a, b) => a.dist - b.dist)[0];

  const places = getProjectedShanghaiPlaces(map);
  const veryCloseLandmark = places
    .filter((p) => p.kind === 'landmark')
    .map((p) => ({ name: p.name, dist: Math.hypot(wx - p.x, wy - p.y) }))
    .filter((p) => p.dist <= 3.6)
    .sort((a, b) => a.dist - b.dist)[0];

  // Prevent huge railway/airport polygon tags from hijacking nearby city streets 400-500m away
  const isMajorHubTag =
    landmark.includes('火車站') ||
    (landmark.includes('站') && (landmark.includes('上海') || landmark.includes('虹橋'))) ||
    landmark.includes('機場');
  const distToNearestRailPoi = map.pois
    .filter((p) => p.kind === 'rail' || p.kind === 'airport')
    .reduce((min, p) => Math.min(min, Math.hypot(wx - p.x, wy - p.y)), Infinity);

  let base: string | null = null;
  if (
    landmark &&
    landmark.length >= 2 &&
    landmark.length <= 16 &&
    (!isMajorHubTag || distToNearestRailPoi <= 4.2 || (!road && !neighborhood))
  ) {
    base = landmark;
  } else if (veryClosePoi) {
    base = veryClosePoi.name;
  } else if (veryCloseLandmark) {
    base = veryCloseLandmark.name;
  } else if (road) {
    base = road;
  } else if (neighborhood) {
    base = neighborhood;
  } else if (subdistrict) {
    base = subdistrict;
  }

  if (!base) return null;
  return ensureUniqueStationName(base, otherStations, wx, wy, hints);
}

function distToPolyline(px: number, py: number, pts: { x: number; y: number }[]): number {
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

function isPointInRing(px: number, py: number, ring: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x;
    const yi = ring[i].y;
    const xj = ring[j].x;
    const yj = ring[j].y;
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}


export function generateBuildingsFromCells(
  _cols: number,
  _rows: number,
  cellSize: number,
  cells: CityCell[],
  seed: number,
  _centers: { x: number; y: number; radius: number; type: 'cbd' | 'res' | 'ind' }[] = []
): BuildingModel[] {
  const buildings: BuildingModel[] = [];
  let bIdx = 0;

  // Pick dense urban cells first so megaregion rendering remains crisp at 60 FPS across all 201 districts
  const denseCells = cells
    .filter((c) => c.terrain === 'land' && c.zone !== 'park' && c.population + c.jobs >= 520)
    .sort((a, b) => b.population + b.jobs - (a.population + a.jobs));

  const MAX_BUILDINGS = 6500;

  for (const cell of denseCells) {
    if (buildings.length >= MAX_BUILDINGS) break;
    const density = cell.population + cell.jobs;
    const count = density > 2100 ? 4 : density > 1400 ? 3 : density > 850 ? 2 : 1;
    const baseX = cell.gx * cellSize;
    const baseY = cell.gy * cellSize;
    const angle = (hash2D(cell.gx >> 2, cell.gy >> 2, seed + 17) - 0.5) * 0.45;

    for (let k = 0; k < count; k++) {
      if (buildings.length >= MAX_BUILDINGS) break;
      const r1 = hash2D(cell.gx * 7 + k * 3, cell.gy * 11 + k, seed + 41);
      const r2 = hash2D(cell.gx * 13 + k, cell.gy * 5 + k * 7, seed + 73);
      const r3 = hash2D(cell.gx + k * 3, cell.gy + k * 5, seed + 109);

      if (count === 1 && density < 720 && r1 < 0.35) continue;

      let kind: BuildingModel['kind'] = 'res';
      let w = 8 + r1 * 6;
      let d = 7 + r2 * 6;
      let h = 10 + (density / 2600) * 24 + r3 * 10;

      if (cell.zone === 'commercial') {
        kind = density > 2100 && r3 > 0.84 ? 'landmark' : 'cbd';
        w = kind === 'landmark' ? 14 : 9 + r1 * 7;
        d = kind === 'landmark' ? 13 : 8 + r2 * 7;
        h = kind === 'landmark' ? 68 + r3 * 36 : 24 + (density / 2600) * 48 + r3 * 16;
      } else if (cell.zone === 'industrial') {
        kind = 'ind';
        w = 14 + r1 * 8;
        d = 11 + r2 * 7;
        h = 7 + r3 * 8;
      }

      // Spread multiple buildings cleanly inside the 64x64px block
      const slotX = k % 2;
      const slotY = Math.floor(k / 2) % 2;
      const cellHalf = cellSize * 0.5;
      const ox = baseX + slotX * (cellHalf - 4) + 4 + r1 * Math.max(2, cellHalf - w - 6);
      const oy = baseY + slotY * (cellHalf - 4) + 4 + r2 * Math.max(2, cellHalf - d - 6);

      buildings.push({
        id: `bld_${bIdx++}`,
        x: Math.round(ox),
        y: Math.round(oy),
        w: Math.round(w),
        d: Math.round(d),
        h: Math.round(h),
        angle,
        kind,
        lit: 0.35 + r3 * 0.65,
      });
    }
  }

  buildings.sort((a, b) => a.y + a.d - (b.y + b.d));
  return buildings;
}

export function generateCityMap(
  mode: MapMode,
  seed: number,
  _realCityId: RealCityId = 'shanghai'
): CityMap {
  // 212x312 grid at 64px = 13568x19968 world covering all of Shanghai (16 districts),
  // ALL 13 cities / 95 districts of Jiangsu, and ALL 11 cities / 90 districts of Zhejiang
  // at Shanghai's 1:11.4 zoom scale (~49.5 m/px).
  const cols = 212;
  const rows = 312;
  const cellSize = 64;
  const w = cols * cellSize; // 13568
  const h = rows * cellSize; // 19968
  const cells: CityCell[] = [];
  const hills: HillContour[] = [];
  const pois: CityPoi[] = [];

  const mapName = '上海及江浙跨省都市圈 · 1990年';
  const subtitle = '黃浦江 / 太湖 / 錢塘江 / 長江 · 上海市16區 + 江蘇13市·浙江11市（185縣區）層級解鎖';
  const startYear = 1990;
  const geoBounds: GeoBounds = createGeoBounds(31.10, 119.65, 11.4, w, h);

  const toWorld = (lat: number, lon: number) => latLonToWorld(lat, lon, geoBounds, w, h);

  const worldCenters: { wx: number; wy: number; radiusPx: number; type: 'cbd' | 'res' | 'ind' }[] = [];
  const addGeoCenterPx = (lat: number, lon: number, radiusPx: number, type: 'cbd' | 'res' | 'ind') => {
    const p = toWorld(lat, lon);
    worldCenters.push({ wx: p.x, wy: p.y, radiusPx, type });
  };

  const addGeoPoi = (id: string, name: string, kind: CityPoi['kind'], lat: number, lon: number) => {
    const p = toWorld(lat, lon);
    pois.push({ id, name, kind, x: Math.round(p.x), y: Math.round(p.y) });
  };

  // 1A. Neighboring Provinces & Progressive Cities Metadata with Survey-Grade Boundaries
  const provinces: ProvinceRegionInfo[] = NEIGHBOR_PROVINCES_WGS84.map((src) => {
    const pt = toWorld(src.gatewayCenter[0], src.gatewayCenter[1]);
    const polygons = src.rings.map((ring) => ring.map(([la, lo]) => toWorld(la, lo)));
    return {
      id: src.id,
      name: src.name,
      x: pt.x,
      y: pt.y,
      lat: src.gatewayCenter[0],
      lon: src.gatewayCenter[1],
      unlockCostWan: src.unlockCostWan,
      unlocked: false,
      closestCityId: src.closestCityId,
      description: src.description,
      polygons,
    };
  });

  const cities: CityRegionInfo[] = NEIGHBOR_CITIES_WGS84.map((src) => {
    const pt = toWorld(src.center[0], src.center[1]);
    const polygons = src.rings.map((ring) => ring.map(([la, lo]) => toWorld(la, lo)));
    return {
      id: src.id,
      name: src.name,
      provinceId: src.provinceId,
      x: pt.x,
      y: pt.y,
      lat: src.center[0],
      lon: src.center[1],
      unlockCostWan: src.unlockCostWan,
      unlocked: false,
      isClosestToShanghai: src.isClosestToShanghai,
      closestDistrictId: src.closestDistrictId,
      distanceKmFromShanghai: src.distanceKmFromShanghai,
      adjacentCityIds: src.adjacentCityIds,
      polygons,
    };
  });

  // 1B. Administrative boundaries for all 16 Shanghai districts + all 185 Jiangsu & Zhejiang districts
  const shanghaiDistricts: DistrictInfo[] = SHANGHAI_DISTRICTS_WGS84.map((src) => {
    const centerWorld = toWorld(src.center[0], src.center[1]);
    const polygons = src.rings.map((ring) => ring.map(([la, lo]) => toWorld(la, lo)));
    const isStarter = startYear >= src.unlockYear;
    return {
      id: src.id,
      name: src.name,
      x: centerWorld.x,
      y: centerWorld.y,
      radius: src.radius,
      polygon: polygons[0],
      polygons,
      unlockYear: src.unlockYear,
      unlockCostWan: isStarter ? 0 : src.unlockCostWan,
      isStarter,
      unlocked: isStarter,
      growthMultiplier: src.growthMultiplier,
      realPopulation: src.realPopulation,
      provinceId: 'prov_sh',
      provinceName: '上海市',
      cityId: 'city_sh',
      cityName: '上海市',
    };
  });

  const neighborDistricts: DistrictInfo[] = NEIGHBOR_DISTRICTS_WGS84.map((src) => {
    const centerWorld = toWorld(src.center[0], src.center[1]);
    const polygons = src.rings.map((ring) => ring.map(([la, lo]) => toWorld(la, lo)));
    return {
      id: src.id,
      name: src.name,
      x: centerWorld.x,
      y: centerWorld.y,
      radius: src.radius,
      polygon: polygons[0],
      polygons,
      unlockYear: 1995,
      unlockCostWan: src.unlockCostWan,
      isStarter: false,
      unlocked: false,
      growthMultiplier: src.growthMultiplier,
      realPopulation: src.realPopulation,
      provinceId: src.provinceId,
      provinceName: src.provinceName,
      cityId: src.cityId,
      cityName: src.cityName,
      distanceOrder: src.distanceOrder,
      prereqDistrictId: src.prereqDistrictId,
      adjacentDistrictIds: src.adjacentDistrictIds,
      isCityClosestToShanghai: src.isCityClosestToShanghai,
    };
  });

  const districts: DistrictInfo[] = [...shanghaiDistricts, ...neighborDistricts];

  // 2. High-precision Huangpu River, Suzhou Creek, Qiantang River & Yangtze River centerlines
  const huangpuPoints = SHANGHAI_HUANGPU_WGS84.map(([la, lo]) => toWorld(la, lo));
  const suzhouPoints = SHANGHAI_SUZHOU_WGS84.map(([la, lo]) => toWorld(la, lo));
  const qiantangPoints = QIANTANG_RIVER_WGS84.map(([la, lo]) => toWorld(la, lo));
  const yangtzePoints = YANGTZE_RIVER_WGS84.map(([la, lo]) => toWorld(la, lo));

  const rivers: RiverPath[] = [
    {
      id: 'rv_hp',
      name: '黃浦江',
      width: 7,
      skipPolylineWaterCheck: true,
      points: huangpuPoints,
    },
    {
      id: 'rv_sz',
      name: '蘇州河',
      width: 1.4,
      points: suzhouPoints,
    },
    {
      id: 'rv_qt',
      name: '錢塘江',
      width: 12,
      points: qiantangPoints,
    },
    {
      id: 'rv_cj',
      name: '長江',
      width: 16,
      points: yangtzePoints,
    },
  ];

  // 3. Exact inland water bodies (Huangpu bank polygon, Dianshan, Dishui, Taihu, Hongze, Gaoyou, Qiandao)
  const waterPolygons = [
    {
      id: 'river_huangpu_poly',
      name: '黃浦江',
      points: SHANGHAI_HUANGPU_POLY_WGS84.map(([la, lo]) => toWorld(la, lo)),
    },
    {
      id: 'lake_dianshan',
      name: '澱山湖',
      points: SHANGHAI_DIANSHAN_LAKE_WGS84.map(([la, lo]) => toWorld(la, lo)),
    },
    {
      id: 'lake_dishui',
      name: '滴水湖',
      points: SHANGHAI_DISHUI_LAKE_WGS84.map(([la, lo]) => toWorld(la, lo)),
    },
    {
      id: 'lake_taihu',
      name: '太湖',
      points: TAIHU_LAKE_POLY_WGS84.map(([la, lo]) => toWorld(la, lo)),
    },
    {
      id: 'lake_hongze',
      name: '洪澤湖',
      points: HONGZE_LAKE_POLY_WGS84.map(([la, lo]) => toWorld(la, lo)),
    },
    {
      id: 'lake_gaoyou',
      name: '高郵湖',
      points: GAOYOU_LAKE_POLY_WGS84.map(([la, lo]) => toWorld(la, lo)),
    },
    {
      id: 'lake_qiandao',
      name: '千島湖',
      points: QIANDAO_LAKE_POLY_WGS84.map(([la, lo]) => toWorld(la, lo)),
    },
    {
      id: 'lake_yangcheng',
      name: '陽澄湖',
      points: YANGCHENG_LAKE_POLY_WGS84.map(([la, lo]) => toWorld(la, lo)),
    },
  ];

  // 4. Urban population & employment centers across Shanghai + all 185 neighbor districts
  addGeoCenterPx(31.232, 121.475, 320, 'cbd'); // People's Square / Huangpu
  addGeoCenterPx(31.224, 121.446, 280, 'cbd'); // Jing'an
  addGeoCenterPx(31.195, 121.438, 310, 'res'); // Xuhui
  addGeoCenterPx(31.238, 121.505, 360, 'cbd'); // Lujiazui
  addGeoCenterPx(31.268, 121.482, 280, 'res'); // Hongkou
  addGeoCenterPx(31.218, 121.416, 280, 'res'); // Changning
  addGeoCenterPx(31.256, 121.410, 280, 'res'); // Putuo
  addGeoCenterPx(31.296, 121.525, 310, 'ind'); // Yangpu / Wujiaochang
  addGeoCenterPx(31.112, 121.385, 340, 'res'); // Minhang
  addGeoCenterPx(31.385, 121.465, 340, 'ind'); // Baoshan
  addGeoCenterPx(31.375, 121.255, 340, 'res'); // Jiading
  addGeoCenterPx(31.028, 121.225, 340, 'res'); // Songjiang
  addGeoCenterPx(31.148, 121.125, 310, 'res'); // Qingpu
  addGeoCenterPx(31.192, 121.695, 340, 'ind'); // Pudong Chuansha
  addGeoCenterPx(31.032, 121.755, 310, 'res'); // Huinan / Lingang
  addGeoCenterPx(30.925, 121.465, 310, 'res'); // Fengxian Nanqiao
  addGeoCenterPx(30.745, 121.335, 310, 'ind'); // Jinshan
  addGeoCenterPx(31.622, 121.410, 310, 'res'); // Chongming
  for (const nc of NEIGHBOR_URBAN_CENTERS_WGS84) {
    addGeoCenterPx(nc.lat, nc.lon, nc.radiusNorm * 13120, nc.type);
  }

  // 5. Real Shanghai & Neighboring Intercity Landmarks & Transport Hubs
  addGeoPoi('p_sjtu', '上海交通大學 (徐匯)', 'university', 31.2010, 121.4342);
  addGeoPoi('p_sjtu_mh', '上海交通大學 (閔行)', 'university', 31.0258, 121.4368);
  addGeoPoi('p_fudan', '復旦大學 (邯鄲)', 'university', 31.2975, 121.5035);
  addGeoPoi('p_zs', '中山醫院', 'hospital', 31.1965, 121.4547);
  addGeoPoi('p_rj', '瑞金醫院', 'hospital', 31.2116, 121.4682);
  addGeoPoi('p_sha', '虹橋國際機場', 'airport', 31.1979, 121.3363);
  addGeoPoi('p_pvg', '浦東國際機場', 'airport', 31.1443, 121.8083);
  addGeoPoi('p_shs', '上海火車站', 'rail', 31.2494, 121.4557);
  addGeoPoi('p_shhq', '虹橋火車站', 'rail', 31.1942, 121.3204);
  addGeoPoi('p_shs_south', '上海南站', 'rail', 31.1544, 121.4295);
  addGeoPoi('p_sec', '上海展覽中心', 'park', 31.2255, 121.4525);
  addGeoPoi('p_ds_lake', '朱家角 · 澱山湖', 'park', 31.1112, 121.0535);
  addGeoPoi('p_dishui', '滴水湖 · 臨港新片區', 'park', 30.8965, 121.9380);
  for (const np of NEIGHBOR_POIS_WGS84) {
    addGeoPoi(np.id, np.name, np.kind, np.lat, np.lon);
  }

  // Precompute bounding boxes for O(1) culling across 66k cells x 201 districts / water / centers
  const computeRingBbox = (ring: { x: number; y: number }[]) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of ring) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { ring, minX, maxX, minY, maxY };
  };

  const districtChecks = districts.map((d) => {
    const rings = (d.polygons ?? []).filter((r) => r.length >= 3).map(computeRingBbox);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const rb of rings) {
      if (rb.minX < minX) minX = rb.minX;
      if (rb.maxX > maxX) maxX = rb.maxX;
      if (rb.minY < minY) minY = rb.minY;
      if (rb.maxY > maxY) maxY = rb.maxY;
    }
    return { rings, minX, maxX, minY, maxY };
  });

  const waterChecks = waterPolygons.map((lake) => ({
    ...computeRingBbox(lake.points),
  }));

  const riverChecks = rivers
    .filter((rv) => !rv.skipPolylineWaterCheck)
    .map((rv) => {
      const bb = computeRingBbox(rv.points);
      const pad = rv.width * 0.6;
      return {
        points: rv.points,
        threshold: rv.width * 0.55,
        minX: bb.minX - pad,
        maxX: bb.maxX + pad,
        minY: bb.minY - pad,
        maxY: bb.maxY + pad,
      };
    });

  // 6. Grid terrain & urban demographics strictly masked to real land polygons & grounded in WorldPop 2020
  const wpQGrid = getWorldPopCellQ();
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const wx = (gx + 0.5) * cellSize;
      const wy = (gy + 0.5) * cellSize;
      const nx = gx / cols;
      const ny = gy / rows;

      let insideLandDistrict = false;
      for (const dc of districtChecks) {
        if (wx < dc.minX || wx > dc.maxX || wy < dc.minY || wy > dc.maxY) continue;
        for (const rb of dc.rings) {
          if (wx >= rb.minX && wx <= rb.maxX && wy >= rb.minY && wy <= rb.maxY && isPointInRing(wx, wy, rb.ring)) {
            insideLandDistrict = true;
            break;
          }
        }
        if (insideLandDistrict) break;
      }

      let isWater = !insideLandDistrict;
      if (!isWater) {
        for (const wc of waterChecks) {
          if (wx >= wc.minX && wx <= wc.maxX && wy >= wc.minY && wy <= wc.maxY && isPointInRing(wx, wy, wc.ring)) {
            isWater = true;
            break;
          }
        }
      }
      if (!isWater) {
        for (const rc of riverChecks) {
          if (wx >= rc.minX && wx <= rc.maxX && wy >= rc.minY && wy <= rc.maxY && distToPolyline(wx, wy, rc.points) <= rc.threshold) {
            isWater = true;
            break;
          }
        }
      }

      const n = fbm2D(nx * 4.5, ny * 4.5, seed, 3);
      const terrain: TerrainType = isWater ? 'water' : 'land';
      const elevation = isWater ? 0.12 : 0.36 + n * 0.22;

      let zone: ZoneType = 'none';
      let population = 0;
      let jobs = 0;

      if (terrain === 'land') {
        const wpQ = wpQGrid[gy * cols + gx] ?? 0;
        const wpRatio = wpQ / 255;

        let bestScore = 0;
        let bestType: 'cbd' | 'res' | 'ind' = 'res';
        const localJitter = valueNoise2D(nx * 24, ny * 24, seed + 55);

        for (const c of worldCenters) {
          if (Math.abs(wx - c.wx) > c.radiusPx || Math.abs(wy - c.wy) > c.radiusPx) continue;
          const d = Math.hypot(wx - c.wx, wy - c.wy);
          if (d < c.radiusPx) {
            const score = (1 - d / c.radiusPx) * (0.78 + localJitter * 0.38);
            if (score > bestScore) {
              bestScore = score;
              bestType = c.type;
            }
          }
        }

        const wpScalar = Math.round(Math.max(60, Math.pow(wpRatio, 1.35) * 2450 + bestScore * 180));

        if (bestScore > 0.14 || wpRatio >= 0.26) {
          if (bestType === 'cbd' && bestScore > 0.35) {
            if (wpRatio < 0.32 || localJitter > 0.86) {
              zone = 'park';
              population = Math.max(45, Math.round(wpScalar * 0.65));
              jobs = Math.max(15, Math.round(wpScalar * 0.35));
            } else {
              zone = 'commercial';
              jobs = Math.max(60, Math.round(wpScalar * 0.72));
              population = Math.max(45, Math.round(wpScalar * 0.28));
            }
          } else if (bestType === 'ind' && bestScore > 0.25) {
            zone = 'industrial';
            jobs = Math.max(45, Math.round(wpScalar * 0.76));
            population = Math.max(45, Math.round(wpScalar * 0.24));
          } else {
            zone = localJitter > 0.85 && wpRatio > 0.42 ? 'commercial' : 'residential';
            if (zone === 'residential') {
              population = Math.max(45, Math.round(wpScalar * 0.82));
              jobs = Math.max(15, Math.round(wpScalar * 0.18));
            } else {
              jobs = Math.max(30, Math.round(wpScalar * 0.6));
              population = Math.max(45, Math.round(wpScalar * 0.4));
            }
          }
        } else {
          zone = localJitter > 0.68 || wpRatio > 0.18 ? 'residential' : 'none';
          population = Math.max(45, Math.round(wpScalar * 0.78));
          jobs = Math.max(15, Math.round(wpScalar * 0.22));
        }
      }

      cells.push({
        gx,
        gy,
        elevation,
        terrain,
        zone,
        population,
        jobs,
        landValue: zone === 'commercial' ? 1.5 : 1.0,
        roadCongestion: Math.min(1, (population + jobs) / 2800),
        coveredByMetro: false,
        lightSeed: hash2D(gx, gy, seed + 303),
      });
    }
  }

  registerCityCellsBaseline(cells);
  const roads: CityMap['roads'] = []; // Loaded asynchronously via OpenStreetMap Overpass
  const buildings = generateBuildingsFromCells(cols, rows, cellSize, cells, seed);

  return {
    cols,
    rows,
    cellSize,
    width: w,
    height: h,
    seed,
    name: mapName,
    subtitle,
    startYear,
    mode,
    cells,
    districts,
    provinces,
    cities,
    roads,
    rivers,
    waterPolygons,
    hills,
    buildings,
    pois,
    geoBounds,
  };
}
