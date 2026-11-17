import {
  BuildingModel,
  CityCell,
  CityMap,
  CityPoi,
  DistrictInfo,
  HillContour,
  MapMode,
  RealCityId,
  RiverPath,
  Station,
  TerrainType,
  ZoneType,
} from '../types/game';
import {
  createGeoBounds,
  GeoBounds,
  latLonToWorld,
  ReverseGeocodePlace,
  toTraditionalPlaceName,
} from './geo';
import {
  SHANGHAI_DIANSHAN_LAKE_WGS84,
  SHANGHAI_DISTRICTS_WGS84,
  SHANGHAI_HUANGPU_WGS84,
  SHANGHAI_SUZHOU_WGS84,
} from './shanghaiGeoData';
import { SHANGHAI_PLACES_WGS84 } from './shanghaiPlaces';

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
  const projected = SHANGHAI_PLACES_WGS84.map((p) => {
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
    if (rings.some((ring) => isPointInRing(wx, wy, ring))) {
      return d;
    }
  }
  return null;
}

function shortDistrictName(name: string): string {
  if (name.endsWith('新區') && name.length > 2) return name.slice(0, -2);
  if (name.endsWith('區') && name.length > 2) return name.slice(0, -1);
  return name;
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
  const places = getProjectedShanghaiPlaces(map);
  const nearestPois = map.pois
    .map((p) => ({ name: cleanPlaceLabel(p.name), dist: Math.hypot(wx - p.x, wy - p.y) }))
    .sort((a, b) => a.dist - b.dist);

  const nearestPlaces = places
    .map((p) => ({ ...p, dist: Math.hypot(wx - p.x, wy - p.y) }))
    .sort((a, b) => a.dist - b.dist);

  const nearestLandmarkPlace = nearestPlaces.find((p) => p.kind === 'landmark');
  const nearestSubPlace = nearestPlaces[0];
  const nearbyRoads = findNearestRoads(map, wx, wy, 11);
  const containingDist = findDistrictAt(map, wx, wy);

  const hints: string[] = [];
  for (const r of nearbyRoads.slice(1, 3)) hints.push(r.name);
  if (nearestSubPlace && nearestSubPlace.dist < 55) hints.push(nearestSubPlace.name);
  if (containingDist) hints.push(shortDistrictName(containingDist.name));

  let primaryCandidate: string | null = null;

  // Tier 1: Special building / university / hospital / rail hub / park directly at coordinate (~600m)
  if (nearestPois[0] && nearestPois[0].dist <= 12) {
    primaryCandidate = nearestPois[0].name;
  } else if (nearestLandmarkPlace && nearestLandmarkPlace.dist <= 14) {
    primaryCandidate = nearestLandmarkPlace.name;
  }

  // Tier 2: Actual street / avenue from Overpass road network (~450m)
  if (!primaryCandidate && nearbyRoads.length > 0 && nearbyRoads[0].dist <= 9) {
    primaryCandidate = nearbyRoads[0].name;
    // If that road name already has a station, try forming a real street intersection first
    if (
      existingStations.some((s) => s.name === primaryCandidate) &&
      nearbyRoads[1] &&
      nearbyRoads[1].dist <= 8 &&
      !nearbyRoads[1].isCode
    ) {
      const intersection = `${nearbyRoads[0].name}·${nearbyRoads[1].name}`;
      if (!existingStations.some((s) => s.name === intersection)) {
        primaryCandidate = intersection;
      }
    }
  }

  // Tier 3: Nearest real Shanghai road, neighborhood, or town/subdistrict (~2.8km)
  if (!primaryCandidate && nearestSubPlace && nearestSubPlace.dist <= 56) {
    primaryCandidate = nearestSubPlace.name;
  }

  // Tier 4: Containing administrative district + compass quadrant if far from district center
  if (!primaryCandidate && containingDist) {
    const shortName = shortDistrictName(containingDist.name);
    const distFromCenter = Math.hypot(wx - containingDist.x, wy - containingDist.y);
    primaryCandidate =
      distFromCenter > 42
        ? `${shortName}${compassDirection(wx - containingDist.x, wy - containingDist.y)}`
        : shortName;
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

  // Preserve iconic nearby map POI (~350m) if player clicked straight onto a major landmark
  // unless Nominatim itself identified a specific landmark right there
  const veryClosePoi = map.pois
    .map((p) => ({ name: cleanPlaceLabel(p.name), dist: Math.hypot(wx - p.x, wy - p.y) }))
    .filter((p) => p.dist <= 7)
    .sort((a, b) => a.dist - b.dist)[0];

  const places = getProjectedShanghaiPlaces(map);
  const veryCloseLandmark = places
    .filter((p) => p.kind === 'landmark')
    .map((p) => ({ name: p.name, dist: Math.hypot(wx - p.x, wy - p.y) }))
    .filter((p) => p.dist <= 7)
    .sort((a, b) => a.dist - b.dist)[0];

  let base: string | null = null;
  if (landmark && landmark.length >= 2 && landmark.length <= 16) {
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

function getDistrictAngle(
  wx: number,
  wy: number,
  w: number,
  h: number,
  centers: { x: number; y: number; radius: number; type: 'cbd' | 'res' | 'ind' }[],
  seed: number
): number {
  let bestDist = Infinity;
  let bestAngle = 0;
  centers.forEach((c, idx) => {
    const d = Math.hypot(wx - c.x * w, wy - c.y * h);
    if (d < bestDist) {
      bestDist = d;
      bestAngle = (hash2D(idx, 77, seed) - 0.5) * 0.62;
    }
  });
  return bestAngle;
}

export function generateBuildingsFromCells(
  cols: number,
  rows: number,
  cellSize: number,
  cells: CityCell[],
  seed: number,
  centers: { x: number; y: number; radius: number; type: 'cbd' | 'res' | 'ind' }[] = []
): BuildingModel[] {
  const wTotal = cols * cellSize;
  const hTotal = rows * cellSize;
  const buildings: BuildingModel[] = [];
  let bIdx = 0;

  for (const cell of cells) {
    if (cell.terrain !== 'land') continue;
    const density = cell.population + cell.jobs;
    if (density < 180 || cell.zone === 'park') continue;

    const count = density > 720 ? 2 : 1;
    const baseX = cell.gx * cellSize;
    const baseY = cell.gy * cellSize;
    const angle = getDistrictAngle(baseX + cellSize * 0.5, baseY + cellSize * 0.5, wTotal, hTotal, centers, seed);

    for (let k = 0; k < count; k++) {
      const r1 = hash2D(cell.gx * 7 + k, cell.gy * 11, seed + 41);
      const r2 = hash2D(cell.gx * 13, cell.gy * 5 + k, seed + 73);
      const r3 = hash2D(cell.gx + k * 3, cell.gy + k * 5, seed + 109);

      if (count === 1 && r1 < 0.48) continue;

      let kind: BuildingModel['kind'] = 'res';
      let w = 10 + r1 * 8;
      let d = 9 + r2 * 8;
      let h = 10 + (density / 1000) * 26 + r3 * 10;

      if (cell.zone === 'commercial') {
        kind = density > 820 && r3 > 0.85 ? 'landmark' : 'cbd';
        w = kind === 'landmark' ? 16 : 11 + r1 * 9;
        d = kind === 'landmark' ? 15 : 10 + r2 * 8;
        h = kind === 'landmark' ? 66 + r3 * 36 : 24 + (density / 1000) * 50 + r3 * 16;
      } else if (cell.zone === 'industrial') {
        kind = 'ind';
        w = 17 + r1 * 9;
        d = 13 + r2 * 8;
        h = 7 + r3 * 8;
      }

      const ox = baseX + 5 + r1 * Math.max(2, cellSize - w - 10);
      const oy = baseY + 5 + r2 * Math.max(2, cellSize - d - 10);

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
  // 90x90 grid at 40px = 3600x3600 world covering all 16 official districts of Shanghai
  // from Jinshan (30.678°N) to Chongming (31.875°N) and Qingpu (120.85°E) to Hengsha/East China Sea (122.24°E)
  const cols = 90;
  const rows = 90;
  const cellSize = 40;
  const w = cols * cellSize; // 3600
  const h = rows * cellSize; // 3600
  const cells: CityCell[] = [];
  const hills: HillContour[] = [];
  const pois: CityPoi[] = [];

  const mapName = '上海全市 · 1990年';
  const subtitle = '黃浦江 / 蘇州河 / 長江口 · 16個行政區全精度實景';
  const startYear = 1990;
  const geoBounds: GeoBounds = createGeoBounds(31.275, 121.545, 11.4, w, h);

  const toWorld = (lat: number, lon: number) => latLonToWorld(lat, lon, geoBounds, w, h);

  const centers: { x: number; y: number; radius: number; type: 'cbd' | 'res' | 'ind' }[] = [];
  const addGeoCenter = (lat: number, lon: number, radiusNorm: number, type: 'cbd' | 'res' | 'ind') => {
    const p = toWorld(lat, lon);
    centers.push({ x: p.x / w, y: p.y / h, radius: radiusNorm, type });
  };

  const addGeoPoi = (id: string, name: string, kind: CityPoi['kind'], lat: number, lon: number) => {
    const p = toWorld(lat, lon);
    pois.push({ id, name, kind, x: Math.round(p.x), y: Math.round(p.y) });
  };

  // 1. Survey-grade real administrative boundaries for all 16 official districts of Shanghai (WGS-84)
  const districts: DistrictInfo[] = SHANGHAI_DISTRICTS_WGS84.map((src) => {
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
    };
  });

  // 2. High-precision Huangpu River & Suzhou Creek centerlines (aligned to Esri / GIS boundary)
  const huangpuPoints = SHANGHAI_HUANGPU_WGS84.map(([la, lo]) => toWorld(la, lo));
  const suzhouPoints = SHANGHAI_SUZHOU_WGS84.map(([la, lo]) => toWorld(la, lo));

  const rivers: RiverPath[] = [
    {
      id: 'rv_hp',
      name: '黃浦江',
      width: 12,
      points: huangpuPoints,
    },
    {
      id: 'rv_sz',
      name: '蘇州河',
      width: 6,
      points: suzhouPoints,
    },
  ];

  // 3. Inland water bodies (Dianshan Lake in Qingpu)
  const waterPolygons = [
    {
      id: 'lake_dianshan',
      name: '澱山湖',
      points: SHANGHAI_DIANSHAN_LAKE_WGS84.map(([la, lo]) => toWorld(la, lo)),
    },
  ];

  // 4. Urban population & employment centers across all 16 districts
  addGeoCenter(31.232, 121.475, 0.08, 'cbd'); // People's Square / Huangpu
  addGeoCenter(31.224, 121.446, 0.07, 'cbd'); // Jing'an
  addGeoCenter(31.195, 121.438, 0.08, 'res'); // Xuhui
  addGeoCenter(31.238, 121.505, 0.09, 'cbd'); // Lujiazui
  addGeoCenter(31.268, 121.482, 0.07, 'res'); // Hongkou
  addGeoCenter(31.218, 121.416, 0.07, 'res'); // Changning
  addGeoCenter(31.256, 121.410, 0.07, 'res'); // Putuo
  addGeoCenter(31.296, 121.525, 0.08, 'ind'); // Yangpu / Wujiaochang
  addGeoCenter(31.112, 121.385, 0.09, 'res'); // Minhang
  addGeoCenter(31.385, 121.465, 0.09, 'ind'); // Baoshan
  addGeoCenter(31.375, 121.255, 0.09, 'res'); // Jiading
  addGeoCenter(31.028, 121.225, 0.09, 'res'); // Songjiang
  addGeoCenter(31.148, 121.125, 0.08, 'res'); // Qingpu
  addGeoCenter(31.192, 121.695, 0.09, 'ind'); // Pudong Chuansha
  addGeoCenter(31.032, 121.755, 0.08, 'res'); // Huinan / Lingang
  addGeoCenter(30.925, 121.465, 0.08, 'res'); // Fengxian Nanqiao
  addGeoCenter(30.745, 121.335, 0.08, 'ind'); // Jinshan Petrochemical / Jinshanwei
  addGeoCenter(31.622, 121.410, 0.08, 'res'); // Chongming Chengqiao

  // 5. Real Shanghai Landmarks & Transport Hubs
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

  // 6. Grid terrain & urban demographics strictly masked to real land polygons (sea/estuary/rivers/lake = water)
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const wx = (gx + 0.5) * cellSize;
      const wy = (gy + 0.5) * cellSize;
      const nx = gx / cols;
      const ny = gy / rows;

      const insideLandDistrict = districts.some((d) =>
        (d.polygons ?? []).some((ring) => isPointInRing(wx, wy, ring))
      );

      let isWater = !insideLandDistrict;
      if (!isWater) {
        for (const lake of waterPolygons) {
          if (isPointInRing(wx, wy, lake.points)) {
            isWater = true;
            break;
          }
        }
      }
      if (!isWater) {
        for (const rv of rivers) {
          if (distToPolyline(wx, wy, rv.points) <= Math.max(4.5, rv.width * 0.52)) {
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
        let bestScore = 0;
        let bestType: 'cbd' | 'res' | 'ind' = 'res';
        const localJitter = valueNoise2D(nx * 14, ny * 14, seed + 55);

        for (const c of centers) {
          const d = Math.hypot(nx - c.x, ny - c.y);
          if (d < c.radius) {
            const score = (1 - d / c.radius) * (0.75 + localJitter * 0.4);
            if (score > bestScore) {
              bestScore = score;
              bestType = c.type;
            }
          }
        }

        if (bestScore > 0.14) {
          if (bestType === 'cbd') {
            zone = localJitter > 0.78 ? 'park' : 'commercial';
            if (zone === 'commercial') {
              jobs = Math.round(bestScore * 880);
              population = Math.round(bestScore * 240);
            }
          } else if (bestType === 'ind') {
            zone = 'industrial';
            jobs = Math.round(bestScore * 640);
            population = Math.round(bestScore * 90);
          } else {
            zone = localJitter > 0.85 ? 'commercial' : 'residential';
            if (zone === 'residential') {
              population = Math.round(bestScore * 820);
              jobs = Math.round(bestScore * 100);
            } else {
              jobs = Math.round(bestScore * 380);
              population = Math.round(bestScore * 240);
            }
          }
        } else if (localJitter > 0.68) {
          zone = 'residential';
          population = Math.round(70 + localJitter * 90);
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
        roadCongestion: Math.min(1, (population + jobs) / 1100),
        coveredByMetro: false,
        lightSeed: hash2D(gx, gy, seed + 303),
      });
    }
  }

  const roads: CityMap['roads'] = []; // Loaded asynchronously via OpenStreetMap Overpass
  const buildings = generateBuildingsFromCells(cols, rows, cellSize, cells, seed, centers);

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
    roads,
    rivers,
    waterPolygons,
    hills,
    buildings,
    pois,
    geoBounds,
  };
}
