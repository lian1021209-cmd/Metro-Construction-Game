import type { StyleSpecification } from 'maplibre-gl';
import { BuildingModel, CityCell, CityMap, CityPoi, RiverPath, RoadSegment } from '../types/game';
import {
  getWorldPopCellQ,
  WORLDPOP_CELL_COLS,
  WORLDPOP_CELL_ROWS,
  WORLDPOP_HI_HEIGHT,
  WORLDPOP_HI_WIDTH,
} from './worldpopBaseline';

export type OpenMapStyleId = 'esri_light_gray' | 'canvas_vector' | 'esri_dark_gray';

export function lonToNormX(lon: number): number {
  return (lon + 180) / 360;
}

export function latToNormY(lat: number): number {
  const rad = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

export function normXToLon(nx: number): number {
  return nx * 360 - 180;
}

export function normYToLat(ny: number): number {
  const n = Math.PI - 2 * Math.PI * ny;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export interface GeoBounds {
  centerLat: number;
  centerLon: number;
  defaultZoom: number;
  minNx: number;
  maxNx: number;
  minNy: number;
  maxNy: number;
}

export function createGeoBounds(
  centerLat: number,
  centerLon: number,
  defaultZoom: number,
  mapWidth: number,
  mapHeight: number
): GeoBounds {
  const cx = lonToNormX(centerLon);
  const cy = latToNormY(centerLat);
  const worldPxAtDefault = 256 * Math.pow(2, defaultZoom);
  const halfSpanX = mapWidth / (2 * worldPxAtDefault);
  const halfSpanY = mapHeight / (2 * worldPxAtDefault);
  return {
    centerLat,
    centerLon,
    defaultZoom,
    minNx: cx - halfSpanX,
    maxNx: cx + halfSpanX,
    minNy: cy - halfSpanY,
    maxNy: cy + halfSpanY,
  };
}

export function latLonToWorld(
  lat: number,
  lon: number,
  bounds: GeoBounds,
  mapWidth: number,
  mapHeight: number
): { x: number; y: number } {
  const nx = lonToNormX(lon);
  const ny = latToNormY(lat);
  return {
    x: ((nx - bounds.minNx) / (bounds.maxNx - bounds.minNx)) * mapWidth,
    y: ((ny - bounds.minNy) / (bounds.maxNy - bounds.minNy)) * mapHeight,
  };
}

export function worldToLatLon(
  wx: number,
  wy: number,
  bounds: GeoBounds,
  mapWidth: number,
  mapHeight: number
): { lat: number; lon: number } {
  const nx = bounds.minNx + (wx / mapWidth) * (bounds.maxNx - bounds.minNx);
  const ny = bounds.minNy + (wy / mapHeight) * (bounds.maxNy - bounds.minNy);
  return {
    lat: normYToLat(ny),
    lon: normXToLon(nx),
  };
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Free, API-keyless Esri World Light Gray Base Raster Style for MapLibre GL
 */
export function getEsriLightGrayStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      esri_light_gray: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 14,
        attribution: 'Tiles © Esri — Esri, DeLorme, NAVTEQ',
      },
    },
    layers: [
      {
        id: 'esri-light-gray-bg',
        type: 'background',
        paint: {
          'background-color': '#EEF1F4',
        },
      },
      {
        id: 'esri-light-gray-base',
        type: 'raster',
        source: 'esri_light_gray',
        paint: {
          'raster-contrast': 0.06,
          'raster-saturation': -0.05,
        },
      },
    ],
  };
}

/**
 * Free, API-keyless Esri World Dark Gray Base Raster Style for MapLibre GL
 */
export function getEsriDarkGrayStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      esri_dark_gray: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 14,
        attribution: 'Tiles © Esri — Esri, DeLorme, NAVTEQ',
      },
    },
    layers: [
      {
        id: 'esri-dark-gray-bg',
        type: 'background',
        paint: {
          'background-color': '#09111E',
        },
      },
      {
        id: 'esri-dark-gray-base',
        type: 'raster',
        source: 'esri_dark_gray',
        paint: {
          'raster-brightness-min': 0.02,
          'raster-contrast': 0.14,
          'raster-saturation': 0.1,
        },
      },
    ],
  };
}

/**
 * Pure GeoJSON vector river & crisp light cartographic background fallback style (zero external tile dependencies)
 */
export function getPureCanvasGeoStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'pure-light-bg',
        type: 'background',
        paint: {
          'background-color': '#DCE9F5',
        },
      },
    ],
  };
}

function closeWorldRingToLonLat(
  ring: { x: number; y: number }[],
  geo: GeoBounds,
  mapWidth: number,
  mapHeight: number
): number[][] | null {
  if (ring.length < 3) return null;
  const coords: number[][] = [];
  for (const pt of ring) {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    const ll = worldToLatLon(pt.x, pt.y, geo, mapWidth, mapHeight);
    if (!Number.isFinite(ll.lon) || !Number.isFinite(ll.lat)) continue;
    coords.push([ll.lon, ll.lat]);
  }
  if (coords.length < 3) return null;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coords.push([first[0], first[1]]);
  }
  return coords.length >= 4 ? coords : null;
}

/**
 * Converts a RiverPath centerline into a closed GeoJSON-compatible polygon ring in world coordinates
 * so river channels (Yangtze, Qiantang, Suzhou Creek, etc.) render smoothly as filled vector polygons.
 */
export function riverPathToPolygonRing(river: RiverPath): { x: number; y: number }[] {
  const pts = river.points;
  if (pts.length < 2) return [];
  const leftSide: { x: number; y: number }[] = [];
  const rightSide: { x: number; y: number }[] = [];

  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.max(0.001, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    const halfW = Math.max(0.7, (river.widths?.[i] ?? river.width) * 0.5);
    leftSide.push({ x: pts[i].x + nx * halfW, y: pts[i].y + ny * halfW });
    rightSide.push({ x: pts[i].x - nx * halfW, y: pts[i].y - ny * halfW });
  }

  return [...leftSide, ...rightSide.reverse()];
}

export interface RiverGeoJsonCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: { id: string; name: string };
    geometry: {
      type: 'Polygon';
      coordinates: number[][][];
    };
  }>;
}

export function buildCityRiversGeoJson(map: CityMap): RiverGeoJsonCollection {
  if (!map.geoBounds) {
    return { type: 'FeatureCollection', features: [] };
  }
  const geo = map.geoBounds;
  const features = map.rivers
    .filter((rv) => !rv.skipPolylineWaterCheck)
    .map((rv) => {
      const ringWorld = riverPathToPolygonRing(rv);
      const coords = closeWorldRingToLonLat(ringWorld, geo, map.width, map.height);
      if (!coords) return null;
      return {
        type: 'Feature' as const,
        properties: { id: rv.id, name: rv.name },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [coords],
        },
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  return { type: 'FeatureCollection', features };
}

export interface GeoJsonMultiPolygonFeature {
  type: 'Feature';
  properties: Record<string, string | number | boolean>;
  geometry: {
    type: 'MultiPolygon';
    coordinates: number[][][][];
  };
}

export interface GeoJsonMultiPolygonCollection {
  type: 'FeatureCollection';
  features: GeoJsonMultiPolygonFeature[];
}

export function buildPureLandGeoJson(map: CityMap): GeoJsonMultiPolygonCollection {
  if (!map.geoBounds) {
    return { type: 'FeatureCollection', features: [] };
  }
  const geo = map.geoBounds;
  const features: GeoJsonMultiPolygonFeature[] = [];
  for (const d of map.districts) {
    const rings = d.polygons ?? (d.polygon ? [d.polygon] : []);
    const polyCoords: number[][][][] = [];
    for (const r of rings) {
      const closed = closeWorldRingToLonLat(r, geo, map.width, map.height);
      if (closed) polyCoords.push([closed]);
    }
    if (polyCoords.length === 0) continue;
    features.push({
      type: 'Feature',
      properties: { id: d.id, name: d.name },
      geometry: {
        type: 'MultiPolygon',
        coordinates: polyCoords,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function buildWaterPolygonsGeoJson(map: CityMap): RiverGeoJsonCollection {
  if (!map.geoBounds || !map.waterPolygons) {
    return { type: 'FeatureCollection', features: [] };
  }
  const geo = map.geoBounds;
  const features: RiverGeoJsonCollection['features'] = [];
  for (const wp of map.waterPolygons) {
    const coords = closeWorldRingToLonLat(wp.points, geo, map.width, map.height);
    if (!coords) continue;
    features.push({
      type: 'Feature',
      properties: { id: wp.id, name: wp.id },
      geometry: {
        type: 'Polygon',
        coordinates: [coords],
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function buildTieredRegionsGeoJson(
  map: CityMap,
  canUnlockCity: (city: NonNullable<CityMap['cities']>[number]) => boolean,
  canUnlockDistrict: (district: CityMap['districts'][number]) => boolean
): GeoJsonMultiPolygonCollection {
  if (!map.geoBounds) {
    return { type: 'FeatureCollection', features: [] };
  }
  const geo = map.geoBounds;
  const features: GeoJsonMultiPolygonFeature[] = [];
  const provUnlockedMap = new Map<string, boolean>(
    (map.provinces ?? []).map((p) => [p.id, p.unlocked])
  );
  const cityUnlockedMap = new Map<string, boolean>(
    (map.cities ?? []).map((c) => [c.id, c.unlocked])
  );

  const toMultiPolygonCoords = (rings: { x: number; y: number }[][]): number[][][][] => {
    const out: number[][][][] = [];
    for (const r of rings) {
      const closed = closeWorldRingToLonLat(r, geo, map.width, map.height);
      if (closed) out.push([closed]);
    }
    return out;
  };

  // Tier 1: Locked Provinces
  for (const prov of map.provinces ?? []) {
    if (prov.unlocked) continue;
    const polyCoords = toMultiPolygonCoords(prov.polygons ?? []);
    if (polyCoords.length === 0) continue;
    features.push({
      type: 'Feature',
      properties: {
        regionId: prov.id,
        tier: 1,
        unlocked: false,
        isStarter: false,
        canUnlock: true,
      },
      geometry: { type: 'MultiPolygon', coordinates: polyCoords },
    });
  }

  // Tier 2: Locked Cities in Unlocked Provinces
  for (const city of map.cities ?? []) {
    if (city.unlocked) continue;
    if (!provUnlockedMap.get(city.provinceId)) continue;
    const polyCoords = toMultiPolygonCoords(city.polygons ?? []);
    if (polyCoords.length === 0) continue;
    features.push({
      type: 'Feature',
      properties: {
        regionId: city.id,
        tier: 2,
        unlocked: false,
        isStarter: false,
        canUnlock: canUnlockCity(city),
      },
      geometry: { type: 'MultiPolygon', coordinates: polyCoords },
    });
  }

  // Tier 3: Shanghai & Districts inside Unlocked Cities
  for (const d of map.districts) {
    const isShanghaiDist = !d.provinceId || d.provinceId === 'prov_sh';
    const provUnlocked = isShanghaiDist || Boolean(provUnlockedMap.get(d.provinceId!));
    const cityUnlocked = isShanghaiDist || !d.cityId || Boolean(cityUnlockedMap.get(d.cityId));
    if (!provUnlocked || !cityUnlocked) continue;
    const rings = d.polygons ?? (d.polygon ? [d.polygon] : []);
    const polyCoords = toMultiPolygonCoords(rings);
    if (polyCoords.length === 0) continue;
    features.push({
      type: 'Feature',
      properties: {
        regionId: d.id,
        tier: 3,
        unlocked: d.unlocked,
        isStarter: Boolean(d.isStarter),
        canUnlock: !d.unlocked && canUnlockDistrict(d),
      },
      geometry: { type: 'MultiPolygon', coordinates: polyCoords },
    });
  }

  return { type: 'FeatureCollection', features };
}

export interface OverpassGeoResult {
  roads: RoadSegment[];
  buildings: BuildingModel[];
  pois: CityPoi[];
}

const overpassCache = new Map<string, OverpassGeoResult>();

/**
 * Fetches real arterial roads, building footprints, and major landmarks around the city core
 * from OpenStreetMap Overpass API so 2.5D models, POIs, and road tooltips match real streets.
 */
export async function fetchOverpassCityGeometry(
  bounds: GeoBounds,
  mapWidth: number,
  mapHeight: number,
  focusCenter?: { lat: number; lon: number }
): Promise<OverpassGeoResult | null> {
  const cLat = focusCenter?.lat ?? 31.232;
  const cLon = focusCenter?.lon ?? 121.475;
  const key = `${cLat.toFixed(3)}_${cLon.toFixed(3)}`;
  const cached = overpassCache.get(key);
  if (cached) return cached;

  const dLatRoad = 0.14;
  const dLonRoad = 0.18;
  const dLatBld = 0.024;
  const dLonBld = 0.03;

  const query = `
[out:json][timeout:14];
(
  way["highway"~"motorway|trunk|primary|secondary|tertiary"]["name"](${cLat - dLatRoad},${cLon - dLonRoad},${cLat + dLatRoad},${cLon + dLonRoad});
  way["building"](${cLat - dLatBld},${cLon - dLonBld},${cLat + dLatBld},${cLon + dLonBld});
  node["amenity"~"university|hospital"]["name"](${cLat - dLatRoad},${cLon - dLonRoad},${cLat + dLatRoad},${cLon + dLonRoad});
  node["aeroway"="terminal"]["name"](${cLat - 0.35},${cLon - 0.45},${cLat + 0.35},${cLon + 0.45});
);
out body 4200;
>;
out skel qt;
`.trim();

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
  ];

  interface OverpassJsonPayload {
    elements: Array<{
      type: 'node' | 'way';
      id: number;
      lat?: number;
      lon?: number;
      nodes?: number[];
      tags?: Record<string, string>;
    }>;
  }

  try {
    let json: OverpassJsonPayload | null = null;

    for (const url of endpoints) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8500);
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) continue;
        json = (await res.json()) as OverpassJsonPayload;
        if (json?.elements) break;
      } catch {
        // try next Overpass mirror
      }
    }

    if (!json || !json.elements) return null;

    const nodeMap = new Map<number, { x: number; y: number }>();
    for (const el of json.elements) {
      if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
        nodeMap.set(el.id, latLonToWorld(el.lat, el.lon, bounds, mapWidth, mapHeight));
      }
    }

    const roads: RoadSegment[] = [];
    const buildings: BuildingModel[] = [];
    const pois: CityPoi[] = [];
    const seenPoiNames = new Set<string>();

    for (const el of json.elements) {
      if (el.type === 'node' && el.tags?.name && el.lat !== undefined && el.lon !== undefined) {
        const name = el.tags['name:zh-Hant'] || el.tags['name:zh-TW'] || el.tags['name:zh'] || el.tags.name;
        if (!seenPoiNames.has(name) && pois.length < 28) {
          seenPoiNames.add(name);
          const pt = latLonToWorld(el.lat, el.lon, bounds, mapWidth, mapHeight);
          const kind: CityPoi['kind'] =
            el.tags.aeroway === 'terminal'
              ? 'airport'
              : el.tags.amenity === 'hospital'
              ? 'hospital'
              : 'university';
          pois.push({ id: `osm_poi_${el.id}`, name, kind, x: Math.round(pt.x), y: Math.round(pt.y) });
        }
        continue;
      }

      if (el.type !== 'way' || !el.nodes || el.nodes.length < 2) continue;

      if (el.tags?.highway) {
        const roadName =
          el.tags['name:zh-Hant'] ||
          el.tags['name:zh-TW'] ||
          el.tags['name:zh'] ||
          el.tags.name ||
          el.tags.ref ||
          '城市主幹道';
        const isPrimary = el.tags.highway === 'motorway' || el.tags.highway === 'trunk' || el.tags.highway === 'primary';
        for (let i = 0; i < el.nodes.length - 1; i++) {
          const p1 = nodeMap.get(el.nodes[i]);
          const p2 = nodeMap.get(el.nodes[i + 1]);
          if (!p1 || !p2) continue;
          roads.push({
            id: `osm_rd_${el.id}_${i}`,
            name: roadName,
            x1: p1.x,
            y1: p1.y,
            x2: p2.x,
            y2: p2.y,
            tier: el.tags.highway === 'motorway' ? 'highway' : isPrimary ? 'arterial' : 'secondary',
            isArterial: isPrimary,
            capacity: el.tags.highway === 'motorway' ? 1800 : isPrimary ? 1200 : 800,
            saturation: 0.12 + ((el.id % 30) / 100),
          });
        }
      } else if (el.tags?.building && buildings.length < 480) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const nid of el.nodes) {
          const pt = nodeMap.get(nid);
          if (!pt) continue;
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        }
        const bw = Math.min(44, Math.max(5, maxX - minX));
        const bd = Math.min(44, Math.max(5, maxY - minY));
        if (isFinite(minX) && bw >= 4 && bd >= 4) {
          const levels = Number(el.tags['building:levels'] || 0);
          const height = levels > 0 ? Math.min(95, 10 + levels * 3.8) : 14 + (el.id % 26);
          const isTall = height > 40;
          buildings.push({
            id: `osm_bld_${el.id}`,
            x: Math.round(minX),
            y: Math.round(minY),
            w: Math.round(bw),
            d: Math.round(bd),
            h: Number.isFinite(height) ? Math.round(height) : 18,
            kind: isTall ? 'cbd' : el.tags.building === 'industrial' ? 'ind' : 'res',
            lit: 0.4 + ((el.id % 60) / 100),
          });
        }
      }
    }

    buildings.sort((a, b) => a.y + a.d - (b.y + b.d));
    const result = { roads, buildings, pois };
    overpassCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

const SIMP_CHARS =
  '东广园学医门华兴丰宝汇宁长闸静杨闵卢贤岛湾港泾黄龙凤万达国际铁车机体育电视楼厦旧红绿蓝银铜临滨边云阳阴枫树叶观庵阁台乡卫场厂铺号弄环线纵横复乐寿庆顺强胜永泰浅宽圆双单两头顶内后发飞跃进开闭启辉雾农术数经贸运输邮讯网络信息创新设规划务安环态旅游休闲娱乐购物餐饮宾馆饭茶商场百货中心基地社区花园别墅公寓家园庭府邸桥坝码航库变电钢铁机械纺织造船枢纽总分张赵刘陈吴孙马胡林罗郑谢韩冯邓曹萧袁潘蒋蔡余魏苏吕任姚沈钟姜崔谭陆汪廖韦贾傅邹颜倪温芦鲁葛毕聂齐庄沪粤闽豫鄂湘赣川渝贵陕辽联证券保险资进税务员会政法院检公消队邮动广报图博美展馆宫青职师医复济财语海电设研药诊福敬殡仪纪森植动物游乐迪欢世外豫庙佛真教圣堂思伦爱武康东明环国恒久港罗福凯梦象合百联八第新大悦万仲印松沪西藏河汉津京苏淀';
const TRAD_CHARS =
  '東廣園學醫門華興豐寶匯寧長閘靜楊閔盧賢島灣港涇黃龍鳳萬達國際鐵車機體育電視樓廈舊紅綠藍銀銅臨濱邊雲陽陰楓樹葉觀庵閣臺鄉衛場廠鋪號弄環線縱橫復樂壽慶順強勝永泰淺寬圓雙單兩頭頂內後發飛躍進開閉啟輝霧農術數經貿運輸郵訊網絡信息創新設規劃務安環態旅遊休閒娛樂購物餐飲賓館飯茶商場百貨中心基地社區花園別墅公寓家園庭府邸橋壩碼航庫變電鋼鐵機械紡織造船樞紐總分張趙劉陳吳孫馬胡林羅鄭謝韓馮鄧曹蕭袁潘蔣蔡餘魏蘇呂任姚沈鍾姜崔譚陸汪廖韋賈傅鄒顏倪溫蘆魯葛畢聶齊莊滬粵閩豫鄂湘贛川渝貴陝遼聯證券保險資進稅務員會政法院檢公消隊郵動廣報圖博美展館宮青職師醫復濟財語海電設研藥診福敬殯儀紀森植動物遊樂迪歡世外豫廟佛真教聖堂思倫愛武康東明環國恆久港羅福凱夢象合百聯八第新大悅萬仲印松滬西藏河漢津京蘇澱';

const S2T_MAP = (() => {
  const m = new Map<string, string>();
  const sArr = Array.from(SIMP_CHARS);
  const tArr = Array.from(TRAD_CHARS);
  for (let i = 0; i < Math.min(sArr.length, tArr.length); i++) {
    if (sArr[i] !== tArr[i]) m.set(sArr[i], tArr[i]);
  }
  // Essential extras that differ cleanly in place names
  const extras: [string, string][] = [
    ['区', '區'], ['镇', '鎮'], ['村', '村'], ['里', '里'], ['街', '街'], ['路', '路'],
    ['桥', '橋'], ['庙', '廟'], ['寺', '寺'], ['园', '園'], ['场', '場'], ['馆', '館'],
    ['学', '學'], ['院', '院'], ['医', '醫'], ['站', '站'], ['港', '港'], ['湾', '灣'],
    ['滩', '灘'], ['闸', '閘'], ['汇', '匯'], ['宁', '寧'], ['卢', '盧'], ['闵', '閔'],
    ['杨', '楊'], ['松', '松'], ['嘉', '嘉'], ['青', '青'], ['浦', '浦'], ['奉', '奉'],
    ['贤', '賢'], ['崇', '崇'], ['宝', '寶'], ['东', '東'], ['西', '西'], ['南', '南'],
    ['北', '北'], ['中', '中'], ['大', '大'], ['小', '小'], ['老', '老'], ['新', '新'],
    ['泽', '澤'], ['练', '練'], ['朱', '朱'], ['泾', '涇'], ['罗', '羅'], ['吴', '吳'],
    ['淞', '淞'], ['沪', '滬'], ['屿', '嶼'], ['鼓', '鼓'], ['浪', '浪'], ['寿', '壽'],
    ['宁', '寧'], ['屿', '嶼'], ['张', '張'], ['陈', '陳'], ['周', '周'], ['唐', '唐'],
    ['顾', '顧'], ['马', '馬'], ['陆', '陸'], ['万', '萬'], ['达', '達'], ['华', '華'],
    ['兴', '興'], ['丰', '豐'], ['隆', '隆'], ['盛', '盛'], ['联', '聯'], ['悦', '悅'],
    ['凯', '凱'], ['瑞', '瑞'], ['国', '國'], ['际', '際'], ['亚', '亞'], ['欧', '歐'],
    ['环', '環'], ['线', '線'], ['道', '道'], ['号', '號'], ['楼', '樓'], ['厦', '廈'],
    ['滨', '濱'], ['边', '邊'], ['临', '臨'], ['云', '雲'], ['阳', '陽'], ['阴', '陰'],
    ['铁', '鐵'], ['车', '車'], ['机', '機'], ['电', '電'], ['网', '網'], ['体', '體'],
    ['育', '育'], ['观', '觀'], ['圣', '聖'], ['堂', '堂'], ['宫', '宮'], ['阁', '閣'],
    ['亭', '亭'], ['台', '臺'], ['塔', '塔'], ['碑', '碑'], ['庄', '莊'], ['厂', '廠'],
    ['广', '廣'], ['开', '開'], ['关', '關'], ['门', '門'], ['卫', '衛'], ['乐', '樂'],
    ['庆', '慶'], ['顺', '順'], ['强', '強'], ['胜', '勝'], ['浅', '淺'], ['宽', '寬'],
    ['圆', '圓'], ['双', '雙'], ['单', '單'], ['头', '頭'], ['顶', '頂'], ['内', '內'],
    ['后', '後'], ['发', '發'], ['飞', '飛'], ['跃', '躍'], ['进', '進'], ['启', '啟'],
    ['辉', '輝'], ['雾', '霧'], ['农', '農'], ['术', '術'], ['数', '數'], ['经', '經'],
    ['贸', '貿'], ['运', '運'], ['输', '輸'], ['邮', '郵'], ['讯', '訊'], ['络', '絡'],
    ['创', '創'], ['设', '設'], ['规', '規'], ['划', '劃'], ['务', '務'], ['态', '態'],
    ['游', '遊'], ['闲', '閒'], ['娱', '娛'], ['购', '購'], ['饮', '飲'], ['宾', '賓'],
    ['饭', '飯'], ['商', '商'], ['货', '貨'], ['社', '社'], ['别', '別'], ['庭', '庭'],
    ['坝', '壩'], ['码', '碼'], ['库', '庫'], ['变', '變'], ['钢', '鋼'], ['织', '織'],
    ['枢', '樞'], ['纽', '紐'], ['总', '總'], ['赵', '趙'], ['刘', '劉'], ['孙', '孫'],
    ['谢', '謝'], ['韩', '韓'], ['冯', '馮'], ['邓', '鄧'], ['萧', '蕭'], ['蒋', '蔣'],
    ['苏', '蘇'], ['吕', '呂'], ['钟', '鍾'], ['谭', '譚'], ['韦', '韋'], ['贾', '賈'],
    ['邹', '鄒'], ['颜', '顏'], ['温', '溫'], ['芦', '蘆'], ['鲁', '魯'], ['毕', '畢'],
    ['聂', '聶'], ['齐', '齊'], ['粤', '粵'], ['闽', '閩'], ['赣', '贛'], ['贵', '貴'],
    ['陕', '陝'], ['辽', '遼'], ['证', '證'], ['险', '險'], ['资', '資'], ['税', '稅'],
    ['昆', '崑'], ['仓', '倉'], ['浔', '潯'], ['盐', '鹽'], ['钱', '錢'], ['余', '餘'],
    ['锡', '錫'], ['桐', '桐'], ['乡', '鄉'], ['越', '越'], ['柯', '柯'], ['萧', '蕭'],
    ['绍', '紹'], ['湖', '湖'], ['常', '常'], ['启', '啟'], ['吴', '吳'], ['娄', '婁'],
    ['员', '員'], ['会', '會'], ['检', '檢'], ['动', '動'], ['报', '報'], ['图', '圖'],
    ['展', '展'], ['览', '覽'], ['职', '職'], ['复', '復'], ['济', '濟'], ['财', '財'],
    ['语', '語'], ['研', '研'], ['药', '藥'], ['诊', '診'], ['仪', '儀'], ['纪', '紀'],
    ['欢', '歡'], ['伦', '倫'], ['爱', '愛'], ['梦', '夢'], ['淀', '澱'],
    ['无', '無'], ['浒', '滸'], ['诸', '諸'], ['缙', '縉'], ['瓯', '甌'], ['镇', '鎮'],
    ['扬', '揚'], ['淮', '淮'], ['盐', '鹽'], ['连', '連'], ['宿', '宿'], ['迁', '遷'],
    ['徐', '徐'], ['宁', '寧'], ['绍', '紹'], ['温', '溫'], ['丽', '麗'], ['义', '義'],
    ['乌', '烏'], ['兰', '蘭'], ['溪', '溪'], ['诸', '諸'], ['桐', '桐'], ['庐', '廬'],
  ];
  for (const [s, t] of extras) m.set(s, t);
  return m;
})();

export function toTraditionalPlaceName(text: string): string {
  return Array.from(text)
    .map((ch) => S2T_MAP.get(ch) ?? ch)
    .join('');
}

export interface ReverseGeocodePlace {
  road?: string;
  neighborhood?: string;
  subdistrict?: string;
  landmark?: string;
}

const reverseGeocodeCache = new Map<string, ReverseGeocodePlace | null>();
const reverseGeocodeCellCache = new Map<string, ReverseGeocodePlace | null>();
const reverseGeocodeInFlight = new Map<string, Promise<ReverseGeocodePlace | null>>();

export function getCachedReverseGeocodePlace(lat: number, lon: number): ReverseGeocodePlace | null {
  const exactKey = `${lat.toFixed(4)}_${lon.toFixed(4)}`;
  if (reverseGeocodeCache.has(exactKey)) {
    return reverseGeocodeCache.get(exactKey) ?? null;
  }
  const cellKey = `${lat.toFixed(3)}_${lon.toFixed(3)}`;
  if (reverseGeocodeCellCache.has(cellKey)) {
    return reverseGeocodeCellCache.get(cellKey) ?? null;
  }
  return null;
}

async function queryNominatimReverse(lat: number, lon: number): Promise<ReverseGeocodePlace | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3200);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&zoom=18&addressdetails=1&accept-language=zh-TW`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      }
    );
    clearTimeout(timer);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      category?: string;
      type?: string;
      name?: string;
      address?: Record<string, string>;
    };

    const addr = data.address ?? {};
    const road = addr.road || addr.pedestrian || addr.footway;
    const neighborhood =
      addr.quarter || addr.neighbourhood || addr.residential || addr.village || addr.hamlet;
    const subdistrict = addr.town || addr.suburb || addr.city_district;

    let landmark: string | undefined;
    const isMajorPoiCategory =
      data.category === 'tourism' ||
      data.category === 'leisure' ||
      data.category === 'historic' ||
      data.category === 'railway' ||
      data.category === 'aeroway' ||
      (data.category === 'amenity' &&
        (data.type === 'university' ||
          data.type === 'college' ||
          data.type === 'hospital' ||
          data.type === 'library' ||
          data.type === 'theatre' ||
          data.type === 'marketplace'));

    if (data.name && isMajorPoiCategory && data.name !== road) {
      landmark = data.name;
    }

    return {
      road: road ? toTraditionalPlaceName(road) : undefined,
      neighborhood: neighborhood ? toTraditionalPlaceName(neighborhood) : undefined,
      subdistrict: subdistrict ? toTraditionalPlaceName(subdistrict) : undefined,
      landmark: landmark ? toTraditionalPlaceName(landmark) : undefined,
    };
  } catch {
    return null;
  }
}

async function queryPhotonReverse(lat: number, lon: number): Promise<ReverseGeocodePlace | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3200);
    const res = await fetch(
      `https://photon.komoot.io/reverse?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      }
    );
    clearTimeout(timer);
    if (!res.ok) return null;

    const json = (await res.json()) as {
      features?: Array<{
        properties?: {
          name?: string;
          street?: string;
          district?: string;
          locality?: string;
          suburb?: string;
          osm_key?: string;
          osm_value?: string;
        };
      }>;
    };

    const props = json.features?.[0]?.properties;
    if (!props) return null;

    const road = props.street || (props.osm_key === 'highway' ? props.name : undefined);
    const neighborhood = props.locality || props.district;
    const subdistrict = props.suburb;
    const isPoi =
      props.osm_key === 'tourism' ||
      props.osm_key === 'leisure' ||
      props.osm_key === 'railway' ||
      props.osm_key === 'aeroway' ||
      props.osm_key === 'amenity';
    const landmark = isPoi && props.name && props.name !== road ? props.name : undefined;

    return {
      road: road ? toTraditionalPlaceName(road) : undefined,
      neighborhood: neighborhood ? toTraditionalPlaceName(neighborhood) : undefined,
      subdistrict: subdistrict ? toTraditionalPlaceName(subdistrict) : undefined,
      landmark: landmark ? toTraditionalPlaceName(landmark) : undefined,
    };
  } catch {
    return null;
  }
}

export async function reverseGeocodeStationPlace(
  lat: number,
  lon: number
): Promise<ReverseGeocodePlace | null> {
  const exactKey = `${lat.toFixed(4)}_${lon.toFixed(4)}`;
  const cellKey = `${lat.toFixed(3)}_${lon.toFixed(3)}`;
  if (reverseGeocodeCache.has(exactKey)) {
    return reverseGeocodeCache.get(exactKey) ?? null;
  }
  const existingFlight = reverseGeocodeInFlight.get(exactKey);
  if (existingFlight) return existingFlight;

  const task = (async (): Promise<ReverseGeocodePlace | null> => {
    const nom = await queryNominatimReverse(lat, lon);
    let merged: ReverseGeocodePlace | null = nom ? { ...nom } : null;

    if (!merged || (!merged.road && !merged.neighborhood && !merged.landmark)) {
      const photon = await queryPhotonReverse(lat, lon);
      if (photon) {
        merged = {
          road: merged?.road || photon.road,
          neighborhood: merged?.neighborhood || photon.neighborhood,
          subdistrict: merged?.subdistrict || photon.subdistrict,
          landmark: merged?.landmark || photon.landmark,
        };
      }
    }

    if (merged && !merged.road && !merged.neighborhood && !merged.subdistrict && !merged.landmark) {
      merged = null;
    }

    reverseGeocodeCache.set(exactKey, merged);
    if (merged || !reverseGeocodeCellCache.has(cellKey)) {
      reverseGeocodeCellCache.set(cellKey, merged);
    }
    reverseGeocodeInFlight.delete(exactKey);
    return merged;
  })();

  reverseGeocodeInFlight.set(exactKey, task);
  return task;
}

export function prefetchReverseGeocodePlace(
  lat: number,
  lon: number,
  onReady?: () => void
): void {
  const exactKey = `${lat.toFixed(4)}_${lon.toFixed(4)}`;
  if (reverseGeocodeCache.has(exactKey) || reverseGeocodeInFlight.has(exactKey)) return;
  reverseGeocodeStationPlace(lat, lon).then((res) => {
    if (res && onReady) onReady();
  });
}

const localStreetsCache = new Map<string, RoadSegment[]>();
const localStreetsInFlight = new Map<string, Promise<RoadSegment[]>>();

/**
 * Loads dense local OSM roads for a quantized 0.06° (~6.6km) tile anywhere in Shanghai/Jiangsu/Zhejiang
 * so dense urban and county streets are immediately available for station auto-naming.
 */
export async function fetchLocalOverpassStreets(
  lat: number,
  lon: number,
  bounds: GeoBounds,
  mapWidth: number,
  mapHeight: number
): Promise<RoadSegment[]> {
  const qLat = Math.round(lat / 0.06) * 0.06;
  const qLon = Math.round(lon / 0.06) * 0.06;
  const key = `${qLat.toFixed(2)}_${qLon.toFixed(2)}`;
  const cached = localStreetsCache.get(key);
  if (cached) return cached;
  const inflight = localStreetsInFlight.get(key);
  if (inflight) return inflight;

  const dLat = 0.045;
  const dLon = 0.055;
  const query = `
[out:json][timeout:10];
(
  way["highway"~"motorway|trunk|primary|secondary|tertiary|residential"]["name"](${qLat - dLat},${qLon - dLon},${qLat + dLat},${qLon + dLon});
);
out body 2200;
>;
out skel qt;
`.trim();

  const task = (async (): Promise<RoadSegment[]> => {
    const endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://lz4.overpass-api.de/api/interpreter',
    ];
    for (const url of endpoints) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 7000);
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) continue;

        const json = (await res.json()) as {
          elements: Array<{
            type: 'node' | 'way';
            id: number;
            lat?: number;
            lon?: number;
            nodes?: number[];
            tags?: Record<string, string>;
          }>;
        };

        const nodeMap = new Map<number, { x: number; y: number }>();
        for (const el of json.elements) {
          if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
            nodeMap.set(el.id, latLonToWorld(el.lat, el.lon, bounds, mapWidth, mapHeight));
          }
        }

        const roads: RoadSegment[] = [];
        for (const el of json.elements) {
          if (el.type !== 'way' || !el.nodes || el.nodes.length < 2 || !el.tags?.highway) continue;
          const rawName =
            el.tags['name:zh-Hant'] ||
            el.tags['name:zh-TW'] ||
            el.tags['name:zh'] ||
            el.tags.name ||
            el.tags.ref ||
            '';
          if (!rawName) continue;
          const roadName = toTraditionalPlaceName(rawName);
          const isPrimary =
            el.tags.highway === 'motorway' ||
            el.tags.highway === 'trunk' ||
            el.tags.highway === 'primary';
          for (let i = 0; i < el.nodes.length - 1; i++) {
            const p1 = nodeMap.get(el.nodes[i]);
            const p2 = nodeMap.get(el.nodes[i + 1]);
            if (!p1 || !p2) continue;
            roads.push({
              id: `osm_loc_${el.id}_${i}`,
              name: roadName,
              x1: p1.x,
              y1: p1.y,
              x2: p2.x,
              y2: p2.y,
              tier:
                el.tags.highway === 'motorway'
                  ? 'highway'
                  : isPrimary
                  ? 'arterial'
                  : el.tags.highway === 'residential'
                  ? 'local'
                  : 'secondary',
              isArterial: isPrimary,
              capacity: el.tags.highway === 'motorway' ? 1800 : isPrimary ? 1200 : 800,
              saturation: 0.14 + ((el.id % 25) / 100),
            });
          }
        }

        localStreetsCache.set(key, roads);
        localStreetsInFlight.delete(key);
        return roads;
      } catch {
        // try fallback mirror
      }
    }
    localStreetsInFlight.delete(key);
    return [];
  })();

  localStreetsInFlight.set(key, task);
  return task;
}

export const POP_HEATMAP_STOPS: Array<{ t: number; r: number; g: number; b: number; a: number }> = [
  { t: 0.0, r: 255, g: 248, b: 224, a: 158 }, // #FFF8E0 Warm Ivory-White (0 density — zero blank land gaps)
  { t: 0.16, r: 254, g: 240, b: 138, a: 174 }, // #FEF08A Soft Luminous Yellow
  { t: 0.32, r: 250, g: 204, b: 21, a: 192 }, // #FACC15 Golden Yellow
  { t: 0.48, r: 249, g: 115, b: 22, a: 208 }, // #F97316 Vibrant Orange
  { t: 0.64, r: 239, g: 68, b: 68, a: 222 }, // #EF4444 Crimson Red
  { t: 0.8, r: 192, g: 38, b: 211, a: 236 }, // #C026D3 Magenta-Violet
  { t: 0.92, r: 126, g: 34, b: 206, a: 246 }, // #7E22CE Royal Purple
  { t: 1.0, r: 76, g: 29, b: 149, a: 254 }, // #4C1D95 Deepest Imperial Purple (60k+/km²)
];

function buildPopHeatmapLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let lo = POP_HEATMAP_STOPS[0];
    let hi = POP_HEATMAP_STOPS[POP_HEATMAP_STOPS.length - 1];
    for (let s = 0; s < POP_HEATMAP_STOPS.length - 1; s++) {
      if (t >= POP_HEATMAP_STOPS[s].t && t <= POP_HEATMAP_STOPS[s + 1].t) {
        lo = POP_HEATMAP_STOPS[s];
        hi = POP_HEATMAP_STOPS[s + 1];
        break;
      }
    }
    const span = Math.max(1e-6, hi.t - lo.t);
    const k = Math.max(0, Math.min(1, (t - lo.t) / span));
    const idx = i * 4;
    lut[idx] = Math.round(lo.r + (hi.r - lo.r) * k);
    lut[idx + 1] = Math.round(lo.g + (hi.g - lo.g) * k);
    lut[idx + 2] = Math.round(lo.b + (hi.b - lo.b) * k);
    lut[idx + 3] = Math.round(lo.a + (hi.a - lo.a) * k);
  }
  return lut;
}

const POP_HEATMAP_LUT = buildPopHeatmapLut();

const baselineCellTotalsMap = new WeakMap<CityCell[], Float32Array>();

export function registerCityCellsBaseline(cells: CityCell[]): Float32Array {
  const arr = new Float32Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    arr[i] = cells[i].population + cells[i].jobs;
  }
  baselineCellTotalsMap.set(cells, arr);
  return arr;
}

let worldpopHiResCache: Float32Array | null = null;
let worldpopHiResPromise: Promise<Float32Array | null> | null = null;

export function isWorldPopHiResReady(): boolean {
  return worldpopHiResCache !== null;
}

function smoothGrid5Tap(src: Float32Array, width: number, height: number, passes: number): Float32Array {
  const a = new Float32Array(src);
  const b = new Float32Array(src.length);
  const w0 = 0.44;
  const w1 = 0.2;
  const w2 = 0.08;

  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < height; y++) {
      const rowOff = y * width;
      for (let x = 0; x < width; x++) {
        const xm2 = x >= 2 ? x - 2 : 0;
        const xm1 = x >= 1 ? x - 1 : 0;
        const xp1 = x + 1 < width ? x + 1 : width - 1;
        const xp2 = x + 2 < width ? x + 2 : width - 1;
        b[rowOff + x] =
          a[rowOff + xm2] * w2 +
          a[rowOff + xm1] * w1 +
          a[rowOff + x] * w0 +
          a[rowOff + xp1] * w1 +
          a[rowOff + xp2] * w2;
      }
    }
    for (let y = 0; y < height; y++) {
      const ym2 = (y >= 2 ? y - 2 : 0) * width;
      const ym1 = (y >= 1 ? y - 1 : 0) * width;
      const y0 = y * width;
      const yp1 = (y + 1 < height ? y + 1 : height - 1) * width;
      const yp2 = (y + 2 < height ? y + 2 : height - 1) * width;
      for (let x = 0; x < width; x++) {
        a[y0 + x] =
          b[ym2 + x] * w2 +
          b[ym1 + x] * w1 +
          b[y0 + x] * w0 +
          b[yp1 + x] * w1 +
          b[yp2 + x] * w2;
      }
    }
  }
  return a;
}

/**
 * Asynchronously loads and pre-smooths the real WorldPop 2020 1km UN-adjusted spatial raster
 * (/assets/worldpop_yrd_2020.png, 636x936) in Web Mercator game coordinates.
 */
export function preloadWorldPopHiRes(onLoaded?: () => void): Float32Array | null {
  if (worldpopHiResCache) return worldpopHiResCache;
  if (typeof window === 'undefined' || typeof Image === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  if (!worldpopHiResPromise) {
    worldpopHiResPromise = new Promise<Float32Array | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = WORLDPOP_HI_WIDTH;
          c.height = WORLDPOP_HI_HEIGHT;
          const ctx = c.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, WORLDPOP_HI_WIDTH, WORLDPOP_HI_HEIGHT);
          const rgba = ctx.getImageData(0, 0, WORLDPOP_HI_WIDTH, WORLDPOP_HI_HEIGHT).data;
          const raw = new Float32Array(WORLDPOP_HI_WIDTH * WORLDPOP_HI_HEIGHT);
          for (let i = 0; i < raw.length; i++) {
            raw[i] = rgba[i * 4] / 255;
          }
          worldpopHiResCache = smoothGrid5Tap(raw, WORLDPOP_HI_WIDTH, WORLDPOP_HI_HEIGHT, 2);
          resolve(worldpopHiResCache);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = '/assets/worldpop_yrd_2020.png';
    });
  }

  if (onLoaded) {
    worldpopHiResPromise.then((res) => {
      if (res) onLoaded();
    });
  }
  return null;
}

let worldpopSyncFallbackCache: Float32Array | null = null;
function getSmoothedWorldPopSyncFallback(): Float32Array {
  if (worldpopSyncFallbackCache) return worldpopSyncFallbackCache;
  const q = getWorldPopCellQ();
  const raw = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) raw[i] = q[i] / 255;
  worldpopSyncFallbackCache = smoothGrid5Tap(raw, WORLDPOP_CELL_COLS, WORLDPOP_CELL_ROWS, 2);
  return worldpopSyncFallbackCache;
}

function sampleBilinear(
  grid: Float32Array,
  gw: number,
  gh: number,
  uNorm: number,
  vNorm: number
): number {
  const gx = Math.max(0, Math.min(gw - 1.0001, uNorm * gw - 0.5));
  const gy = Math.max(0, Math.min(gh - 1.0001, vNorm * gh - 0.5));
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(gw - 1, x0 + 1);
  const y1 = Math.min(gh - 1, y0 + 1);
  const fx = gx - x0;
  const fy = gy - y0;
  const row0 = y0 * gw;
  const row1 = y1 * gw;
  return (
    (grid[row0 + x0] * (1 - fx) + grid[row0 + x1] * fx) * (1 - fy) +
    (grid[row1 + x0] * (1 - fx) + grid[row1 + x1] * fx) * fy
  );
}

/**
 * Generates an ultra-smooth, WorldPop 2020-grounded continuous density heatmap canvas:
 * White/Cream (#FFF8E0, 0) -> Yellow -> Orange -> Red -> Magenta -> Deep Purple (#4C1D95, 60k+/km²).
 * Every non-water land pixel receives continuous color coverage (zero blank land holes),
 * while water pixels feather cleanly to transparent at coastlines and riverbanks.
 */
export function buildPopulationHeatmapCanvas(cityMap: CityMap): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const cols = cityMap.cols;
  const rows = cityMap.rows;
  if (cols <= 1 || rows <= 1 || cityMap.cells.length === 0) return null;

  const n = cols * rows;
  const baseline = baselineCellTotalsMap.get(cityMap.cells) ?? registerCityCellsBaseline(cityMap.cells);

  const landRaw = new Float32Array(n);
  const deltaRaw = new Float32Array(n);

  for (let i = 0; i < cityMap.cells.length && i < n; i++) {
    const c = cityMap.cells[i];
    if (c.terrain === 'water') {
      landRaw[i] = 0;
      deltaRaw[i] = 0;
    } else {
      landRaw[i] = 1;
      deltaRaw[i] = Math.max(0, c.population + c.jobs - (baseline[i] ?? 0));
    }
  }

  const landSmooth = smoothGrid5Tap(landRaw, cols, rows, 2);
  const deltaSmooth = smoothGrid5Tap(deltaRaw, cols, rows, 2);

  const useHiRes = worldpopHiResCache !== null;
  const baseGrid = useHiRes ? worldpopHiResCache! : getSmoothedWorldPopSyncFallback();
  const baseW = useHiRes ? WORLDPOP_HI_WIDTH : WORLDPOP_CELL_COLS;
  const baseH = useHiRes ? WORLDPOP_HI_HEIGHT : WORLDPOP_CELL_ROWS;

  const upScale = 4;
  const outW = cols * upScale;
  const outH = rows * upScale;
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const img = ctx.createImageData(outW, outH);
  const px = img.data;

  for (let oy = 0; oy < outH; oy++) {
    const vNorm = (oy + 0.5) / outH;
    for (let ox = 0; ox < outW; ox++) {
      const uNorm = (ox + 0.5) / outW;

      const landFrac = sampleBilinear(landSmooth, cols, rows, uNorm, vNorm);
      if (landFrac <= 0.02) continue;

      const baseNorm = sampleBilinear(baseGrid, baseW, baseH, uNorm, vNorm);
      const todDelta = sampleBilinear(deltaSmooth, cols, rows, uNorm, vNorm);
      const norm = Math.max(0, Math.min(1, baseNorm + Math.min(0.28, todDelta / 2600)));

      const lutIdx = Math.min(255, Math.max(0, Math.round(norm * 255))) * 4;
      const outIdx = (oy * outW + ox) * 4;

      const coastFade = Math.min(1, Math.max(0, (landFrac - 0.02) * 1.65));
      px[outIdx] = POP_HEATMAP_LUT[lutIdx];
      px[outIdx + 1] = POP_HEATMAP_LUT[lutIdx + 1];
      px[outIdx + 2] = POP_HEATMAP_LUT[lutIdx + 2];
      px[outIdx + 3] = Math.round(POP_HEATMAP_LUT[lutIdx + 3] * coastFade);
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

export const WORLDPOP_CHINA_MAIN_BOUNDS = {
  minLon: 73.0,
  maxLon: 135.5,
  minLat: 17.8,
  maxLat: 53.8,
} as const;

export const WORLDPOP_TW_BOUNDS = {
  minLon: 118.1,
  maxLon: 122.2,
  minLat: 21.7,
  maxLat: 26.5,
} as const;
