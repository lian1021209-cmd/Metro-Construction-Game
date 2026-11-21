import {
  CityMap,
  CityPoi,
  CityRegionInfo,
  DistrictInfo,
  ProvinceRegionInfo,
} from '../types/game';
import { latLonToWorld } from './geo';
import type { NeighborCityGeo, NeighborDistrictGeo, NeighborUrbanCenter } from './neighborGeoData';

export interface NationalProvinceMeta {
  id: string;
  adcode: string;
  name: string;
  gatewayCenter: [number, number];
  unlockCostWan: number;
  closestCityId: string;
  closestCityName: string;
  closestDistrictName: string;
  provincePopulation: number;
  cityCount: number;
  districtCount: number;
  isTaiwan?: boolean;
  description: string;
  rings: [number, number][][];
}

export interface ProvinceChunkPayload {
  adcode: string;
  provinceId: string;
  isTaiwan?: boolean;
  cities: Array<NeighborCityGeo & { isTaiwan?: boolean }>;
  districts: Array<NeighborDistrictGeo & { isTaiwan?: boolean }>;
  urbanCenters?: NeighborUrbanCenter[];
  pois?: Array<{
    id: string;
    name: string;
    kind: CityPoi['kind'];
    lat: number;
    lon: number;
  }>;
}

export interface ProjectedUrbanCore {
  wx: number;
  wy: number;
  radiusPx: number;
  type: 'cbd' | 'res' | 'ind';
}

const extraUrbanCoresByMap = new WeakMap<CityMap, ProjectedUrbanCore[]>();

export function getLoadedUrbanCores(map: CityMap): ProjectedUrbanCore[] {
  return extraUrbanCoresByMap.get(map) ?? [];
}

let mainlandProvincesPromise: Promise<NationalProvinceMeta[]> | null = null;
let taiwanProvincePromise: Promise<NationalProvinceMeta | null> | null = null;
const chunkCache = new Map<string, Promise<ProvinceChunkPayload | null>>();

export function fetchMainlandProvincesMeta(): Promise<NationalProvinceMeta[]> {
  if (typeof window === 'undefined') return Promise.resolve([]);
  if (!mainlandProvincesPromise) {
    mainlandProvincesPromise = fetch('/geo/china_provinces.json')
      .then((res) => (res.ok ? (res.json() as Promise<NationalProvinceMeta[]>) : []))
      .catch(() => []);
  }
  return mainlandProvincesPromise;
}

export function fetchTaiwanProvinceMeta(): Promise<NationalProvinceMeta | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!taiwanProvincePromise) {
    taiwanProvincePromise = fetch('/geo/province_tw.json')
      .then((res) => (res.ok ? (res.json() as Promise<NationalProvinceMeta>) : null))
      .catch(() => null);
  }
  return taiwanProvincePromise;
}

export function fetchProvinceChunk(adcode: string): Promise<ProvinceChunkPayload | null> {
  if (typeof window === 'undefined' || !adcode) return Promise.resolve(null);
  const existing = chunkCache.get(adcode);
  if (existing) return existing;
  const p = fetch(`/geo/prov/${adcode}.json`)
    .then((res) => (res.ok ? (res.json() as Promise<ProvinceChunkPayload>) : null))
    .catch(() => null);
  chunkCache.set(adcode, p);
  return p;
}

function projectProvinceMeta(src: NationalProvinceMeta, map: CityMap): ProvinceRegionInfo {
  const geo = map.geoBounds!;
  const pt = latLonToWorld(src.gatewayCenter[0], src.gatewayCenter[1], geo, map.width, map.height);
  const polygons = src.rings.map((ring) =>
    ring.map(([la, lo]) => latLonToWorld(la, lo, geo, map.width, map.height))
  );
  return {
    id: src.id,
    adcode: src.adcode,
    name: src.name,
    x: pt.x,
    y: pt.y,
    lat: src.gatewayCenter[0],
    lon: src.gatewayCenter[1],
    polygons,
    unlockCostWan: src.unlockCostWan,
    unlocked: false,
    closestCityId: src.closestCityId,
    closestCityName: src.closestCityName,
    closestDistrictName: src.closestDistrictName,
    provincePopulation: src.provincePopulation,
    cityCount: src.cityCount,
    districtCount: src.districtCount,
    loaded: false,
    isTaiwan: Boolean(src.isTaiwan || src.adcode === '710000' || src.id === 'prov_710000'),
    description: src.description,
  };
}

export function purgeTaiwanFromMap(map: CityMap): boolean {
  let changed = false;
  if (map.provinces) {
    const nextProvs = map.provinces.filter(
      (p) => !p.isTaiwan && p.id !== 'prov_710000' && p.adcode !== '710000'
    );
    if (nextProvs.length !== map.provinces.length) {
      map.provinces = nextProvs;
      changed = true;
    }
  }
  if (map.cities) {
    const nextCities = map.cities.filter(
      (c) => !c.isTaiwan && c.provinceId !== 'prov_710000'
    );
    if (nextCities.length !== map.cities.length) {
      map.cities = nextCities;
      changed = true;
    }
  }
  const nextDists = map.districts.filter(
    (d) => !d.isTaiwan && d.provinceId !== 'prov_710000'
  );
  if (nextDists.length !== map.districts.length) {
    map.districts = nextDists;
    changed = true;
  }
  const nextPois = map.pois.filter((p) => !p.id.startsWith('p_tw_'));
  if (nextPois.length !== map.pois.length) {
    map.pois = nextPois;
    changed = true;
  }
  return changed;
}

export async function loadNationalProvinces(
  map: CityMap,
  includeTaiwan: boolean
): Promise<boolean> {
  if (!map.geoBounds) return false;
  let changed = false;

  if (!includeTaiwan) {
    if (purgeTaiwanFromMap(map)) changed = true;
  }

  const mainlandList = await fetchMainlandProvincesMeta();
  const twMeta = includeTaiwan ? await fetchTaiwanProvinceMeta() : null;
  const incoming = twMeta ? [...mainlandList, twMeta] : mainlandList;

  if (!map.provinces) map.provinces = [];
  const existingIds = new Set(map.provinces.map((p) => p.id));

  for (const src of incoming) {
    if (!includeTaiwan && (src.isTaiwan || src.adcode === '710000')) continue;
    if (existingIds.has(src.id)) continue;
    map.provinces.push(projectProvinceMeta(src, map));
    existingIds.add(src.id);
    changed = true;
  }

  return changed;
}

export async function ensureProvinceChunkLoaded(
  map: CityMap,
  provinceId: string
): Promise<boolean> {
  if (!map.geoBounds) return false;
  const prov = map.provinces?.find((p) => p.id === provinceId);
  if (!prov) return false;
  if (prov.loaded) return true;
  const adcode = prov.adcode;
  if (!adcode) return true;

  const chunk = await fetchProvinceChunk(adcode);
  if (!chunk) return false;

  const geo = map.geoBounds;
  const isTw = Boolean(chunk.isTaiwan || prov.isTaiwan || adcode === '710000');

  if (!map.cities) map.cities = [];
  const existingCityIds = new Set(map.cities.map((c) => c.id));
  for (const src of chunk.cities) {
    if (existingCityIds.has(src.id)) continue;
    const pt = latLonToWorld(src.center[0], src.center[1], geo, map.width, map.height);
    const polygons = src.rings.map((ring) =>
      ring.map(([la, lo]) => latLonToWorld(la, lo, geo, map.width, map.height))
    );
    const cityInfo: CityRegionInfo = {
      id: src.id,
      adcode: src.adcode,
      name: src.name,
      provinceId: src.provinceId,
      x: pt.x,
      y: pt.y,
      lat: src.center[0],
      lon: src.center[1],
      polygons,
      adjacentCityIds: src.adjacentCityIds,
      unlockCostWan: src.unlockCostWan,
      unlocked: false,
      isClosestToShanghai: src.isClosestToShanghai,
      closestDistrictId: src.closestDistrictId,
      distanceKmFromShanghai: src.distanceKmFromShanghai,
      isTaiwan: isTw || Boolean(src.isTaiwan),
    };
    map.cities.push(cityInfo);
    existingCityIds.add(src.id);
  }

  const existingDistIds = new Set(map.districts.map((d) => d.id));
  for (const src of chunk.districts) {
    if (existingDistIds.has(src.id)) continue;
    const centerWorld = latLonToWorld(src.center[0], src.center[1], geo, map.width, map.height);
    const polygons = src.rings.map((ring) =>
      ring.map(([la, lo]) => latLonToWorld(la, lo, geo, map.width, map.height))
    );
    const distInfo: DistrictInfo = {
      id: src.id,
      adcode: src.adcode,
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
      isTaiwan: isTw || Boolean(src.isTaiwan),
    };
    map.districts.push(distInfo);
    existingDistIds.add(src.id);
  }

  if (chunk.pois && chunk.pois.length > 0) {
    const existingPoiIds = new Set(map.pois.map((p) => p.id));
    for (const np of chunk.pois) {
      if (existingPoiIds.has(np.id)) continue;
      const p = latLonToWorld(np.lat, np.lon, geo, map.width, map.height);
      map.pois.push({
        id: np.id,
        name: np.name,
        kind: np.kind,
        x: p.x,
        y: p.y,
      });
      existingPoiIds.add(np.id);
    }
  }

  if (chunk.urbanCenters && chunk.urbanCenters.length > 0) {
    const cores = extraUrbanCoresByMap.get(map) ?? [];
    for (const nc of chunk.urbanCenters) {
      const p = latLonToWorld(nc.lat, nc.lon, geo, map.width, map.height);
      cores.push({
        wx: p.x,
        wy: p.y,
        radiusPx: nc.radiusNorm * 13120,
        type: nc.type,
      });
    }
    extraUrbanCoresByMap.set(map, cores);
  }

  prov.loaded = true;
  return true;
}
