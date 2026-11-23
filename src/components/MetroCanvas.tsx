import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  CityMap,
  DifficultyConfig,
  Language,
  LayerVisibility,
  RiverPath,
  RoadSegment,
  SpawnConfig,
  Station,
  StationSize,
  STATION_CONFIGS,
  ToolMode,
  TrackDepth,
  TrackSegment,
  TransitLine,
} from '../types/game';
import {
  analyzeTrackCrossing,
  evalQuadraticBezier,
  findLockedDistrictAt,
  findNearestTrackSegment,
  getCityUnlockCost,
  getCityUnlockPrereq,
  getDistrictUnlockCost,
  getDistrictUnlockPrereq,
  getProvinceUnlockCost,
  getStationBuildCost,
  isWaterAt,
  pixelsToKm,
  validateProposedTrackSegment,
} from '../engine/simulation';
import {
  buildCityRiversGeoJson,
  buildCityRoadsGeoJson,
  buildPopulationHeatmapCanvas,
  buildPureLandGeoJson,
  buildTieredRegionsGeoJson,
  buildWaterPolygonsGeoJson,
  fetchLocalOverpassStreets,
  GeoBounds,
  getCellsPopulationChecksum,
  getEsriDarkGrayStyle,
  getEsriLightGrayStyle,
  getPureCanvasGeoStyle,
  haversineKm,
  isWorldPopHiResReady,
  latLonToWorld,
  normXToLon,
  normYToLat,
  OpenMapStyleId,
  prefetchReverseGeocodePlace,
  preloadWorldPopHiRes,
  WORLDPOP_CHINA_MAIN_BOUNDS,
  WORLDPOP_TW_BOUNDS,
  worldToLatLon,
} from '../engine/geo';
import { suggestStationName } from '../engine/noise';
import { formatCurrencyWan } from '../i18n/translations';

if (typeof window !== 'undefined' && maplibreWorkerUrl) {
  maplibregl.setWorkerUrl(maplibreWorkerUrl);
}

const NATIONAL_CHINA_BOUNDS: [[number, number], [number, number]] = [
  [75.5, 18.5],
  [134.0, 53.0],
];

function getGeoFitBounds(geo: GeoBounds, map?: CityMap): [[number, number], [number, number]] {
  if (map && map.districts.length > 0) {
    let minLat = 90;
    let maxLat = -90;
    let minLon = 180;
    let maxLon = -180;
    let hasPoly = false;
    // Frame the player's actual starter / spawn districts first, then unlocked, then prov_sh
    const starterDists = map.districts.filter((d) => d.isStarter);
    const unlockedDists =
      starterDists.length > 0 ? starterDists : map.districts.filter((d) => d.unlocked);
    const shanghaiOrCore =
      unlockedDists.length > 0
        ? unlockedDists
        : map.districts.filter((d) => !d.provinceId || d.provinceId === 'prov_sh');
    const targets = shanghaiOrCore.length > 0 ? shanghaiOrCore : map.districts;
    for (const d of targets) {
      const rings = d.polygons ?? (d.polygon ? [d.polygon] : []);
      for (const ring of rings) {
        for (const pt of ring) {
          const ll = worldToLatLon(pt.x, pt.y, geo, map.width, map.height);
          if (ll.lat < minLat) minLat = ll.lat;
          if (ll.lat > maxLat) maxLat = ll.lat;
          if (ll.lon < minLon) minLon = ll.lon;
          if (ll.lon > maxLon) maxLon = ll.lon;
          hasPoly = true;
        }
      }
    }
    if (hasPoly) {
      return [
        [minLon - 0.03, minLat - 0.03],
        [maxLon + 0.03, maxLat + 0.03],
      ];
    }
  }
  if (map?.spawnConfig) {
    return [
      [map.spawnConfig.lon - 0.18, map.spawnConfig.lat - 0.14],
      [map.spawnConfig.lon + 0.18, map.spawnConfig.lat + 0.14],
    ];
  }
  return [
    [normXToLon(geo.minNx), normYToLat(geo.maxNy)],
    [normXToLon(geo.maxNx), normYToLat(geo.minNy)],
  ];
}

export interface MetroCanvasHandle {
  zoomBy: (factor: number) => void;
  resetView: () => void;
  focusAt: (wx: number, wy: number, targetZoom?: number) => void;
  flyToLatLon: (lat: number, lon: number, zoom?: number) => void;
  fitNationalView: () => void;
}

interface MetroCanvasProps {
  simDataRef: React.MutableRefObject<{
    map: CityMap;
    stations: Station[];
    segments: TrackSegment[];
    lines: TransitLine[];
  }>;
  lang: Language;
  openMapStyle: OpenMapStyleId;
  mapSeedKey: string;
  mapVersion: number;
  mapWidth: number;
  mapHeight: number;
  tool: ToolMode;
  stationSize: StationSize;
  activeDepth: TrackDepth;
  activeLineId: string;
  selectedStationId: string | null;
  trackStartStationId: string | null;
  trackWaypoint: { x: number; y: number } | null;
  layers: LayerVisibility;
  difficulty: DifficultyConfig;
  is25D: boolean;
  includeTaiwan?: boolean;
  selectingSpawn?: boolean;
  spawnPreview?: SpawnConfig | null;
  onSelectSpawnPoint?: (wx: number, wy: number) => void;
  onPlaceStation: (x: number, y: number) => void;
  onInsertStationOnSegment: (segmentId: string, t: number, wx: number, wy: number) => void;
  onSelectStation: (id: string | null) => void;
  onTrackClickStation: (stationId: string) => void;
  onTrackSetWaypoint: (x: number, y: number) => void;
  onDemolishAt: (worldX: number, worldY: number) => void;
  onUnlockDistrict: (districtId: string) => void;
  onUnlockRegion?: (kind: 'province' | 'city' | 'district', id: string) => void;
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function drawSmoothRiver(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const xc = (pts[i].x + pts[i + 1].x) / 2;
    const yc = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

function traceRoadPoints(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
    return;
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const xc = (pts[i].x + pts[i + 1].x) / 2;
    const yc = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

function traceVariableRiverPolygon(ctx: CanvasRenderingContext2D, rv: RiverPath, extraWidth = 0) {
  const pts = rv.points;
  if (pts.length < 2) return;
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];

  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.max(0.001, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    const halfW = Math.max(3, ((rv.widths?.[i] ?? rv.width) + extraWidth) * 0.5);
    left.push({ x: pts[i].x + nx * halfW, y: pts[i].y + ny * halfW });
    right.push({ x: pts[i].x - nx * halfW, y: pts[i].y - ny * halfW });
  }

  const ring = [...left, ...right.reverse()];
  ctx.beginPath();
  ctx.moveTo(ring[0].x, ring[0].y);
  for (let i = 1; i < ring.length; i++) {
    ctx.lineTo(ring[i].x, ring[i].y);
  }
  ctx.closePath();
}

/**
 * Cartographic vector canvas fallback — clean daylight architectural atlas or dark gray parity
 */
function buildBaseMapCanvas(map: CityMap, isDark = false): HTMLCanvasElement {
  const off = document.createElement('canvas');
  off.width = map.width;
  off.height = map.height;
  const ctx = off.getContext('2d');
  if (!ctx) return off;

  // 1. Matte land base
  ctx.fillStyle = isDark ? '#2B2F35' : '#F3F5F8';
  ctx.fillRect(0, 0, map.width, map.height);

  // 2. Subtle organic urban fabric & park greenbelts
  const cs = map.cellSize;
  let hasWaterCells = false;
  for (const cell of map.cells) {
    if (cell.terrain === 'water') {
      hasWaterCells = true;
      continue;
    }
    const cx = (cell.gx + 0.5) * cs;
    const cy = (cell.gy + 0.5) * cs;
    const density = cell.population + cell.jobs;
    if (cell.zone === 'park') {
      ctx.fillStyle = isDark ? '#26312E' : '#E3EFE7';
      ctx.beginPath();
      ctx.arc(cx, cy, cs * 0.78, 0, Math.PI * 2);
      ctx.fill();
    } else if (density > 65 || cell.zone !== 'none') {
      ctx.fillStyle = isDark
        ? density > 480 ? '#363A41' : '#31353C'
        : density > 480 ? '#E8ECEF' : '#EDEFF3';
      ctx.beginPath();
      ctx.arc(cx, cy, cs * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 3. Subtle topographic contour hills
  for (const hill of map.hills) {
    for (let ring = 0; ring < 3; ring++) {
      const scale = 1 - ring * 0.26;
      ctx.save();
      ctx.translate(hill.cx, hill.cy);
      ctx.rotate(hill.rotation);
      ctx.beginPath();
      ctx.ellipse(0, 0, hill.rx * scale, hill.ry * scale, 0, 0, Math.PI * 2);
      ctx.fillStyle = isDark
        ? ring === 0 ? '#272B30' : ring === 1 ? '#24282D' : '#21252A'
        : ring === 0 ? '#E9EDF2' : ring === 1 ? '#E3E8EE' : '#DDE3EA';
      ctx.fill();
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(15, 23, 42, 0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  // 4. Smooth organic coastlines and bays via blurred-alpha threshold mask
  if (hasWaterCells) {
    const scaleDown = 6;
    const mw = Math.max(1, Math.round(map.width / scaleDown));
    const mh = Math.max(1, Math.round(map.height / scaleDown));
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = mw;
    maskCanvas.height = mh;
    const maskCtx = maskCanvas.getContext('2d');

    const blurCanvas = document.createElement('canvas');
    blurCanvas.width = mw;
    blurCanvas.height = mh;
    const blurCtx = blurCanvas.getContext('2d');

    if (maskCtx && blurCtx) {
      maskCtx.fillStyle = '#ffffff';
      for (const cell of map.cells) {
        if (cell.terrain !== 'water') continue;
        const cx = ((cell.gx + 0.5) * cs) / scaleDown;
        const cy = ((cell.gy + 0.5) * cs) / scaleDown;
        maskCtx.beginPath();
        maskCtx.arc(cx, cy, (cs * 0.76) / scaleDown, 0, Math.PI * 2);
        maskCtx.fill();
      }

      blurCtx.filter = 'blur(4.5px)';
      blurCtx.drawImage(maskCanvas, 0, 0);
      blurCtx.filter = 'none';

      const img = blurCtx.getImageData(0, 0, mw, mh);
      const data = img.data;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a >= 126) {
          data[i] = isDark ? 22 : 200;
          data[i + 1] = isDark ? 25 : 222;
          data[i + 2] = isDark ? 29 : 238;
          data[i + 3] = 255;
        } else if (a >= 88) {
          data[i] = isDark ? 33 : 182;
          data[i + 1] = isDark ? 37 : 209;
          data[i + 2] = isDark ? 43 : 228;
          data[i + 3] = 255;
        } else {
          data[i + 3] = 0;
        }
      }
      blurCtx.putImageData(img, 0, 0);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(blurCanvas, 0, 0, map.width, map.height);
      ctx.restore();
    }
  }

  // 5. Two-Pass Seamless Smooth Rivers (Pass 1: all shorelines, Pass 2: all water channels -> zero junction seams)
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const rv of map.rivers) {
    traceVariableRiverPolygon(ctx, rv, 6);
    ctx.fillStyle = isDark ? '#22262C' : '#B7D3E6';
    ctx.fill();
    drawSmoothRiver(ctx, rv.points);
    ctx.strokeStyle = isDark ? '#22262C' : '#B7D3E6';
    ctx.lineWidth = rv.width + 6;
    ctx.stroke();
  }

  for (const rv of map.rivers) {
    traceVariableRiverPolygon(ctx, rv, 0);
    ctx.fillStyle = isDark ? '#16191D' : '#CBE0F0';
    ctx.fill();
    drawSmoothRiver(ctx, rv.points);
    ctx.strokeStyle = isDark ? '#16191D' : '#CBE0F0';
    ctx.lineWidth = rv.width;
    ctx.stroke();
  }

  for (const rv of map.rivers) {
    if (rv.points.length >= 2) {
      const midIdx = Math.floor(rv.points.length * 0.52);
      const mid = rv.points[midIdx];
      const next = rv.points[Math.min(rv.points.length - 1, midIdx + 1)];
      const prev = rv.points[Math.max(0, midIdx - 1)];
      let ang = Math.atan2(next.y - prev.y, next.x - prev.x);
      if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
      ctx.save();
      ctx.translate(mid.x, mid.y);
      ctx.rotate(ang);
      ctx.font = '500 12px "Noto Sans TC", sans-serif';
      ctx.fillStyle = isDark ? 'rgba(148, 163, 184, 0.36)' : 'rgba(51, 65, 85, 0.48)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(rv.name, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();

  // 6. Multi-tier curved street hierarchy (local -> secondary -> arterial -> expressways)
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const getPts = (road: RoadSegment) =>
    road.points && road.points.length >= 2
      ? road.points
      : [
          { x: road.x1, y: road.y1 },
          { x: road.x2, y: road.y2 },
        ];

  // Local capillary streets
  ctx.strokeStyle = isDark ? 'rgba(51, 65, 85, 0.82)' : 'rgba(71, 85, 105, 0.84)';
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  for (const road of map.roads) {
    const tier = road.tier ?? (road.isArterial ? 'arterial' : road.capacity >= 600 ? 'secondary' : 'local');
    if (tier !== 'local') continue;
    traceRoadPoints(ctx, getPts(road));
  }
  ctx.stroke();

  // Secondary urban avenues
  ctx.strokeStyle = isDark ? 'rgba(71, 85, 105, 0.92)' : 'rgba(51, 65, 85, 0.92)';
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  for (const road of map.roads) {
    const tier = road.tier ?? (road.isArterial ? 'arterial' : road.capacity >= 600 ? 'secondary' : 'local');
    if (tier !== 'secondary') continue;
    traceRoadPoints(ctx, getPts(road));
  }
  ctx.stroke();

  // Primary arterials: casing + core
  ctx.strokeStyle = isDark ? '#020617' : '#0F172A';
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  for (const road of map.roads) {
    const tier = road.tier ?? (road.isArterial ? 'arterial' : 'secondary');
    if (tier !== 'arterial') continue;
    traceRoadPoints(ctx, getPts(road));
  }
  ctx.stroke();

  ctx.strokeStyle = isDark ? '#475569' : '#334155';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (const road of map.roads) {
    const tier = road.tier ?? (road.isArterial ? 'arterial' : 'secondary');
    if (tier !== 'arterial') continue;
    traceRoadPoints(ctx, getPts(road));
  }
  ctx.stroke();

  // Ring roads & expressways
  ctx.strokeStyle = isDark ? '#020617' : '#451A03';
  ctx.lineWidth = 6.0;
  ctx.beginPath();
  for (const road of map.roads) {
    if (road.tier !== 'highway') continue;
    traceRoadPoints(ctx, getPts(road));
  }
  ctx.stroke();

  ctx.strokeStyle = isDark ? '#B45309' : '#D97706';
  ctx.lineWidth = 3.1;
  ctx.beginPath();
  for (const road of map.roads) {
    if (road.tier !== 'highway') continue;
    traceRoadPoints(ctx, getPts(road));
  }
  ctx.stroke();

  ctx.restore();

  return off;
}

const exactRingBBoxCache = new WeakMap<
  object,
  { minX: number; maxX: number; minY: number; maxY: number }
>();

function getExactRingBBox(ring: { x: number; y: number }[]) {
  const cached = exactRingBBoxCache.get(ring);
  if (cached) return cached;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < ring.length; i++) {
    const pt = ring[i];
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }
  const box = { minX, maxX, minY, maxY };
  exactRingBBoxCache.set(ring, box);
  return box;
}

function getStyleForMapMode(styleId: OpenMapStyleId) {
  if (styleId === 'canvas_vector') return getPureCanvasGeoStyle();
  if (styleId === 'esri_dark_gray') return getEsriDarkGrayStyle();
  return getEsriLightGrayStyle();
}

function upsertGeoJsonSource(
  mlMap: maplibregl.Map,
  sourceId: string,
  data: unknown,
  opts?: { promoteId?: string; tolerance?: number; buffer?: number; maxzoom?: number }
): boolean {
  const existing = mlMap.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (existing && typeof existing.setData === 'function') {
    existing.setData(data as maplibregl.GeoJSONSourceSpecification['data']);
    return false;
  }
  mlMap.addSource(sourceId, {
    type: 'geojson',
    data: data as maplibregl.GeoJSONSourceSpecification['data'],
    ...(opts?.promoteId ? { promoteId: opts.promoteId } : {}),
    tolerance: opts?.tolerance ?? 0,
    buffer: opts?.buffer ?? 128,
    maxzoom: opts?.maxzoom ?? 19,
  });
  return true;
}

const uploadedHeatmapUrlByMap = new WeakMap<maplibregl.Map, string>();
const pureLandDistCountByMap = new WeakMap<maplibregl.Map, number>();
const uploadedRoadCountByMap = new WeakMap<maplibregl.Map, number>();

function syncMapLibreRoadsOnly(
  mlMap: maplibregl.Map,
  cityMap: CityMap,
  styleId: OpenMapStyleId
) {
  if (!cityMap.geoBounds || !mlMap.getStyle() || cityMap.roads.length === 0) return;

  const isDark = styleId === 'esri_dark_gray';
  if (!mlMap.getSource('city-roads-geojson') || uploadedRoadCountByMap.get(mlMap) !== cityMap.roads.length) {
    const roadsData = buildCityRoadsGeoJson(cityMap);
    if (roadsData.features.length === 0) return;
    upsertGeoJsonSource(mlMap, 'city-roads-geojson', roadsData, {
      tolerance: 0.2,
      buffer: 128,
      maxzoom: 19,
    });
    uploadedRoadCountByMap.set(mlMap, cityMap.roads.length);
  }

  const beforeRoadsTarget = mlMap.getLayer('city-water-polygons-fill')
    ? 'city-water-polygons-fill'
    : mlMap.getLayer('city-rivers-casing')
    ? 'city-rivers-casing'
    : mlMap.getLayer('city-regions-fill')
    ? 'city-regions-fill'
    : undefined;

  if (!mlMap.getLayer('city-roads-casing')) {
    mlMap.addLayer(
      {
        id: 'city-roads-casing',
        type: 'line',
        source: 'city-roads-geojson',
        minzoom: 9,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': [
            'match',
            ['get', 'tier'],
            'highway',
            isDark ? '#020617' : '#451A03',
            'arterial',
            isDark ? '#020617' : '#0F172A',
            'secondary',
            isDark ? '#090F1D' : '#1E293B',
            isDark ? '#0B1120' : '#334155',
          ],
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            9,
            ['match', ['get', 'tier'], 'highway', 2.2, 'arterial', 1.4, 'secondary', 0.8, 0],
            12,
            ['match', ['get', 'tier'], 'highway', 4.6, 'arterial', 3.2, 'secondary', 2.0, 0.9],
            15,
            ['match', ['get', 'tier'], 'highway', 8.2, 'arterial', 6.2, 'secondary', 4.2, 2.4],
            18,
            ['match', ['get', 'tier'], 'highway', 15, 'arterial', 11.5, 'secondary', 8.2, 5.2],
          ],
          'line-opacity': [
            'match',
            ['get', 'tier'],
            'local',
            ['interpolate', ['linear'], ['zoom'], 12, 0, 13.5, 0.80, 16, 0.92],
            'secondary',
            ['interpolate', ['linear'], ['zoom'], 9.5, 0, 11.5, 0.85, 15, 0.95],
            0.95,
          ],
        },
      },
      beforeRoadsTarget
    );
  }

  if (!mlMap.getLayer('city-roads-core')) {
    mlMap.addLayer(
      {
        id: 'city-roads-core',
        type: 'line',
        source: 'city-roads-geojson',
        minzoom: 9,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': [
            'match',
            ['get', 'tier'],
            'highway',
            isDark ? '#B45309' : '#D97706',
            'arterial',
            isDark ? '#64748B' : '#334155',
            'secondary',
            isDark ? '#475569' : '#475569',
            isDark ? '#334155' : '#64748B',
          ],
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            9,
            ['match', ['get', 'tier'], 'highway', 1.1, 'arterial', 0.65, 'secondary', 0.35, 0],
            12,
            ['match', ['get', 'tier'], 'highway', 2.5, 'arterial', 1.7, 'secondary', 1.0, 0.4],
            15,
            ['match', ['get', 'tier'], 'highway', 5.0, 'arterial', 3.8, 'secondary', 2.4, 1.3],
            18,
            ['match', ['get', 'tier'], 'highway', 10.5, 'arterial', 7.8, 'secondary', 5.4, 3.3],
          ],
          'line-opacity': [
            'match',
            ['get', 'tier'],
            'local',
            ['interpolate', ['linear'], ['zoom'], 12, 0, 13.5, 0.90, 16, 0.98],
            'secondary',
            ['interpolate', ['linear'], ['zoom'], 9.5, 0, 11.5, 0.90, 15, 0.98],
            1,
          ],
        },
      },
      beforeRoadsTarget
    );
  }
}

/**
 * Syncs WebGL GeoJSON layers for pure vector land/water fallback AND 3-tier progressive
 * administrative boundaries/masks directly inside MapLibre GL (zero zoom/pitch polygon tearing).
 */
function syncMapLibreVectorLayers(
  mlMap: maplibregl.Map,
  cityMap: CityMap,
  styleId: OpenMapStyleId,
  isFallback: boolean,
  showPopHeatmap: boolean,
  popHeatmapDataUrl: string | null,
  includeTaiwan: boolean,
  spawnOptions?: {
    selectingSpawn?: boolean;
    selectedProvinceId?: string;
    selectedCityId?: string;
    selectedDistrictId?: string;
  }
) {
  if (!cityMap.geoBounds || !mlMap.getStyle()) return;

  const isDark = styleId === 'esri_dark_gray';
  const useVectorBase = isFallback || styleId === 'canvas_vector';

  if (useVectorBase) {
    const needsLandUpload =
      !mlMap.getSource('pure-land-geojson') ||
      pureLandDistCountByMap.get(mlMap) !== cityMap.districts.length;
    if (needsLandUpload) {
      const landData = buildPureLandGeoJson(cityMap);
      if (landData.features.length > 0) {
        upsertGeoJsonSource(mlMap, 'pure-land-geojson', landData, {
          tolerance: 0,
          buffer: 128,
          maxzoom: 19,
        });
        pureLandDistCountByMap.set(mlMap, cityMap.districts.length);
      }
    }
    if (mlMap.getSource('pure-land-geojson')) {
      if (!mlMap.getLayer('pure-land-fill')) {
        mlMap.addLayer({
          id: 'pure-land-fill',
          type: 'fill',
          source: 'pure-land-geojson',
          paint: {
            'fill-color': isDark ? '#1E2530' : '#FFFFFF',
            'fill-opacity': 1,
          },
        });
      }
      if (!mlMap.getLayer('pure-land-coast')) {
        mlMap.addLayer({
          id: 'pure-land-coast',
          type: 'line',
          source: 'pure-land-geojson',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': isDark ? 'rgba(51, 65, 85, 0.55)' : 'rgba(148, 163, 184, 0.35)',
            'line-width': 0.9,
          },
        });
      }
    }
  }

  // Smooth White -> Yellow -> Orange -> Red -> Magenta -> Purple WorldPop 2020 density raster (YRD + Nationwide + Conditional Taiwan)
  const beforeHeatmapTarget = mlMap.getLayer('city-water-polygons-fill')
    ? 'city-water-polygons-fill'
    : mlMap.getLayer('city-rivers-casing')
    ? 'city-rivers-casing'
    : mlMap.getLayer('city-regions-fill')
    ? 'city-regions-fill'
    : undefined;

  if (popHeatmapDataUrl) {
    const geo = cityMap.geoBounds;
    const tl = worldToLatLon(0, 0, geo, cityMap.width, cityMap.height);
    const br = worldToLatLon(cityMap.width, cityMap.height, geo, cityMap.width, cityMap.height);
    const coords: [[number, number], [number, number], [number, number], [number, number]] = [
      [tl.lon, tl.lat],
      [br.lon, tl.lat],
      [br.lon, br.lat],
      [tl.lon, br.lat],
    ];
    const existingImgSrc = mlMap.getSource('population-heatmap-source') as
      | maplibregl.ImageSource
      | undefined;
    if (existingImgSrc && typeof existingImgSrc.updateImage === 'function') {
      if (uploadedHeatmapUrlByMap.get(mlMap) !== popHeatmapDataUrl) {
        existingImgSrc.updateImage({ url: popHeatmapDataUrl, coordinates: coords });
        uploadedHeatmapUrlByMap.set(mlMap, popHeatmapDataUrl);
      }
    } else if (!existingImgSrc) {
      mlMap.addSource('population-heatmap-source', {
        type: 'image',
        url: popHeatmapDataUrl,
        coordinates: coords,
      });
      uploadedHeatmapUrlByMap.set(mlMap, popHeatmapDataUrl);
    }

    if (!mlMap.getLayer('population-heatmap-layer')) {
      mlMap.addLayer(
        {
          id: 'population-heatmap-layer',
          type: 'raster',
          source: 'population-heatmap-source',
          layout: {
            visibility: showPopHeatmap ? 'visible' : 'none',
          },
          paint: {
            'raster-opacity': isDark ? 0.68 : 0.7,
            'raster-resampling': 'linear',
            'raster-fade-duration': 0,
          },
        },
        beforeHeatmapTarget
      );
    } else {
      mlMap.setPaintProperty('population-heatmap-layer', 'raster-opacity', isDark ? 0.68 : 0.7);
      mlMap.setLayoutProperty(
        'population-heatmap-layer',
        'visibility',
        showPopHeatmap ? 'visible' : 'none'
      );
    }
  }

  // Nationwide China mainland + HK/Macau smooth density raster
  const cnBoundsCoords: [[number, number], [number, number], [number, number], [number, number]] = [
    [WORLDPOP_CHINA_MAIN_BOUNDS.minLon, WORLDPOP_CHINA_MAIN_BOUNDS.maxLat],
    [WORLDPOP_CHINA_MAIN_BOUNDS.maxLon, WORLDPOP_CHINA_MAIN_BOUNDS.maxLat],
    [WORLDPOP_CHINA_MAIN_BOUNDS.maxLon, WORLDPOP_CHINA_MAIN_BOUNDS.minLat],
    [WORLDPOP_CHINA_MAIN_BOUNDS.minLon, WORLDPOP_CHINA_MAIN_BOUNDS.minLat],
  ];
  if (!mlMap.getSource('population-china-heatmap-source')) {
    mlMap.addSource('population-china-heatmap-source', {
      type: 'image',
      url: '/assets/worldpop_china_main_2020.png',
      coordinates: cnBoundsCoords,
    });
  }
  const chinaBefore = mlMap.getLayer('population-heatmap-layer')
    ? 'population-heatmap-layer'
    : beforeHeatmapTarget;
  if (!mlMap.getLayer('population-china-heatmap-layer')) {
    mlMap.addLayer(
      {
        id: 'population-china-heatmap-layer',
        type: 'raster',
        source: 'population-china-heatmap-source',
        layout: {
          visibility: showPopHeatmap ? 'visible' : 'none',
        },
        paint: {
          'raster-opacity': isDark ? 0.65 : 0.68,
          'raster-resampling': 'linear',
          'raster-fade-duration': 0,
        },
      },
      chinaBefore
    );
  } else {
    mlMap.setPaintProperty('population-china-heatmap-layer', 'raster-opacity', isDark ? 0.65 : 0.68);
    mlMap.setLayoutProperty(
      'population-china-heatmap-layer',
      'visibility',
      showPopHeatmap ? 'visible' : 'none'
    );
  }

  // Conditional Taiwan density raster (strictly only when includeTaiwan === true)
  if (includeTaiwan) {
    const twBoundsCoords: [[number, number], [number, number], [number, number], [number, number]] = [
      [WORLDPOP_TW_BOUNDS.minLon, WORLDPOP_TW_BOUNDS.maxLat],
      [WORLDPOP_TW_BOUNDS.maxLon, WORLDPOP_TW_BOUNDS.maxLat],
      [WORLDPOP_TW_BOUNDS.maxLon, WORLDPOP_TW_BOUNDS.minLat],
      [WORLDPOP_TW_BOUNDS.minLon, WORLDPOP_TW_BOUNDS.minLat],
    ];
    if (!mlMap.getSource('population-tw-heatmap-source')) {
      mlMap.addSource('population-tw-heatmap-source', {
        type: 'image',
        url: '/assets/worldpop_tw_2020.png',
        coordinates: twBoundsCoords,
      });
    }
    if (!mlMap.getLayer('population-tw-heatmap-layer')) {
      mlMap.addLayer(
        {
          id: 'population-tw-heatmap-layer',
          type: 'raster',
          source: 'population-tw-heatmap-source',
          layout: {
            visibility: showPopHeatmap ? 'visible' : 'none',
          },
          paint: {
            'raster-opacity': isDark ? 0.65 : 0.68,
            'raster-resampling': 'linear',
            'raster-fade-duration': 0,
          },
        },
        chinaBefore
      );
    } else {
      mlMap.setPaintProperty('population-tw-heatmap-layer', 'raster-opacity', isDark ? 0.65 : 0.68);
      mlMap.setLayoutProperty(
        'population-tw-heatmap-layer',
        'visibility',
        showPopHeatmap ? 'visible' : 'none'
      );
    }
  } else {
    if (mlMap.getLayer('population-tw-heatmap-layer')) {
      mlMap.removeLayer('population-tw-heatmap-layer');
    }
    if (mlMap.getSource('population-tw-heatmap-source')) {
      mlMap.removeSource('population-tw-heatmap-source');
    }
  }

  // Crisp multi-tier OSM WebGL road vectors positioned above heatmap and beneath rivers/locked masks
  syncMapLibreRoadsOnly(mlMap, cityMap, styleId);

  if (useVectorBase) {
    if (!mlMap.getSource('city-water-polygons-geojson')) {
      const waterPolys = buildWaterPolygonsGeoJson(cityMap);
      if (waterPolys.features.length > 0) {
        upsertGeoJsonSource(mlMap, 'city-water-polygons-geojson', waterPolys, {
          tolerance: 0,
          buffer: 128,
          maxzoom: 19,
        });
      }
    }
    if (mlMap.getSource('city-water-polygons-geojson')) {
      if (!mlMap.getLayer('city-water-polygons-fill')) {
        mlMap.addLayer({
          id: 'city-water-polygons-fill',
          type: 'fill',
          source: 'city-water-polygons-geojson',
          paint: {
            'fill-color': isDark ? '#091322' : '#CBE0F0',
            'fill-opacity': 0.98,
          },
        });
      }
      if (!mlMap.getLayer('city-water-polygons-line')) {
        mlMap.addLayer({
          id: 'city-water-polygons-line',
          type: 'line',
          source: 'city-water-polygons-geojson',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': isDark ? '#18385E' : '#9EC1DC',
            'line-width': 1.2,
          },
        });
      }
    }

    if (!mlMap.getSource('city-rivers-geojson')) {
      const riversData = buildCityRiversGeoJson(cityMap);
      if (riversData.features.length > 0) {
        upsertGeoJsonSource(mlMap, 'city-rivers-geojson', riversData, {
          tolerance: 0,
          buffer: 128,
          maxzoom: 19,
        });
      }
    }
    if (mlMap.getSource('city-rivers-geojson')) {
      if (!mlMap.getLayer('city-rivers-casing')) {
        mlMap.addLayer({
          id: 'city-rivers-casing',
          type: 'line',
          source: 'city-rivers-geojson',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': isDark ? '#18385E' : '#9EC1DC',
            'line-width': 2.0,
          },
        });
      }
      if (!mlMap.getLayer('city-rivers-fill')) {
        mlMap.addLayer({
          id: 'city-rivers-fill',
          type: 'fill',
          source: 'city-rivers-geojson',
          paint: {
            'fill-color': isDark ? '#061830' : '#CBE0F0',
            'fill-opacity': 0.96,
          },
        });
      }
    }
  }

  const regionsData = buildTieredRegionsGeoJson(
    cityMap,
    (city) => getCityUnlockPrereq(cityMap, city).canUnlock,
    (dist) => getDistrictUnlockPrereq(cityMap, dist).canUnlock,
    spawnOptions
  );

  upsertGeoJsonSource(mlMap, 'city-regions-geojson', regionsData, {
    promoteId: 'regionId',
    tolerance: 0,
    buffer: 128,
    maxzoom: 19,
  });

  if (!mlMap.getLayer('city-regions-fill')) {
    mlMap.addLayer({
      id: 'city-regions-fill',
      type: 'fill',
      source: 'city-regions-geojson',
      paint: {
        'fill-color': [
          'case',
          ['==', ['get', 'selectingSpawn'], true],
          [
            'case',
            ['all', ['==', ['get', 'tier'], 3], ['==', ['get', 'isSpawnSelected'], true]],
            isDark ? 'rgba(16, 185, 129, 0.30)' : 'rgba(16, 185, 129, 0.22)',
            ['all', ['==', ['get', 'tier'], 2], ['==', ['get', 'isSpawnSelected'], true]],
            isDark ? 'rgba(56, 189, 248, 0.16)' : 'rgba(37, 99, 235, 0.12)',
            ['all', ['==', ['get', 'tier'], 1], ['==', ['get', 'isSpawnSelected'], true]],
            isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(37, 99, 235, 0.06)',
            'rgba(0, 0, 0, 0)',
          ],
          ['==', ['get', 'tier'], 1],
          [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            isDark ? 'rgba(15, 23, 42, 0.56)' : 'rgba(15, 23, 42, 0.22)',
            isDark ? 'rgba(3, 6, 12, 0.74)' : 'rgba(15, 23, 42, 0.32)',
          ],
          ['==', ['get', 'tier'], 2],
          [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            isDark ? 'rgba(18, 26, 40, 0.48)' : 'rgba(15, 23, 42, 0.16)',
            ['==', ['get', 'canUnlock'], true],
            isDark ? 'rgba(4, 8, 16, 0.62)' : 'rgba(15, 23, 42, 0.20)',
            isDark ? 'rgba(4, 8, 16, 0.62)' : 'rgba(15, 23, 42, 0.28)',
          ],
          [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            isDark ? 'rgba(18, 24, 34, 0.44)' : 'rgba(15, 23, 42, 0.14)',
            isDark ? 'rgba(4, 7, 13, 0.56)' : 'rgba(15, 23, 42, 0.20)',
          ],
        ],
        'fill-opacity': [
          'case',
          ['==', ['get', 'selectingSpawn'], true],
          1,
          ['==', ['get', 'unlocked'], true],
          0,
          1,
        ],
      },
    });
  }

  if (!mlMap.getLayer('city-regions-line-unlocked')) {
    mlMap.addLayer({
      id: 'city-regions-line-unlocked',
      type: 'line',
      source: 'city-regions-geojson',
      filter: ['==', ['get', 'unlocked'], true],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': [
          'case',
          ['==', ['get', 'selectingSpawn'], true],
          [
            'case',
            ['==', ['get', 'isSpawnSelected'], true],
            '#059669',
            ['==', ['get', 'tier'], 1],
            isDark ? 'rgba(148, 163, 184, 0.44)' : 'rgba(15, 23, 42, 0.34)',
            isDark ? 'rgba(56, 189, 248, 0.38)' : 'rgba(37, 99, 235, 0.32)',
          ],
          ['==', ['get', 'isStarter'], true],
          isDark ? 'rgba(148, 163, 184, 0.34)' : 'rgba(15, 23, 42, 0.30)',
          isDark ? 'rgba(56, 189, 248, 0.52)' : 'rgba(37, 99, 235, 0.54)',
        ],
        'line-width': [
          'case',
          ['all', ['==', ['get', 'selectingSpawn'], true], ['==', ['get', 'isSpawnSelected'], true]],
          2.4,
          ['interpolate', ['linear'], ['zoom'], 4, 1.1, 8, 1.45, 14, 1.85],
        ],
      },
    });
  }

  if (!mlMap.getLayer('city-regions-line-locked-dashed')) {
    mlMap.addLayer({
      id: 'city-regions-line-locked-dashed',
      type: 'line',
      source: 'city-regions-geojson',
      filter: ['==', ['get', 'unlocked'], false],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-dasharray': [6, 4],
        'line-color': [
          'case',
          ['==', ['get', 'tier'], 1],
          isDark ? 'rgba(148, 163, 184, 0.48)' : 'rgba(15, 23, 42, 0.50)',
          ['==', ['get', 'tier'], 2],
          [
            'case',
            ['==', ['get', 'canUnlock'], true],
            isDark ? 'rgba(251, 191, 36, 0.65)' : 'rgba(217, 119, 6, 0.72)',
            isDark ? 'rgba(148, 163, 184, 0.34)' : 'rgba(15, 23, 42, 0.38)',
          ],
          isDark ? 'rgba(148, 163, 184, 0.42)' : 'rgba(15, 23, 42, 0.44)',
        ],
        'line-width': [
          'case',
          ['==', ['get', 'tier'], 1],
          1.8,
          ['all', ['==', ['get', 'tier'], 2], ['==', ['get', 'canUnlock'], true]],
          1.65,
          1.35,
        ],
        'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0, 1],
      },
    });
  }

  if (!mlMap.getLayer('city-regions-line-locked-hover')) {
    mlMap.addLayer({
      id: 'city-regions-line-locked-hover',
      type: 'line',
      source: 'city-regions-geojson',
      filter: ['==', ['get', 'unlocked'], false],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': [
          'case',
          ['==', ['get', 'tier'], 3],
          isDark ? 'rgba(251, 191, 36, 0.92)' : '#D97706',
          '#D97706',
        ],
        'line-width': [
          'case',
          ['==', ['get', 'tier'], 1],
          2.6,
          ['==', ['get', 'tier'], 2],
          2.3,
          2.1,
        ],
        'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0],
      },
    });
  }
}

export const MetroCanvas = React.forwardRef<MetroCanvasHandle, MetroCanvasProps>(
  (
    {
      simDataRef,
      lang,
      openMapStyle,
      mapSeedKey,
      mapVersion,
      mapWidth,
      mapHeight,
      tool,
      stationSize,
      activeDepth,
      activeLineId,
      selectedStationId,
      trackStartStationId,
      trackWaypoint,
      layers,
      difficulty,
      is25D,
      includeTaiwan = false,
      selectingSpawn = false,
      spawnPreview = null,
      onSelectSpawnPoint,
      onPlaceStation,
      onInsertStationOnSegment,
      onSelectStation,
      onTrackClickStation,
      onTrackSetWaypoint,
      onDemolishAt,
      onUnlockDistrict,
      onUnlockRegion,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mlMapRef = useRef<maplibregl.Map | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const baseMapCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const popHeatmapRef = useRef<{ key: string; canvas: HTMLCanvasElement; dataUrl: string } | null>(null);
    const mapVersionRef = useRef(mapVersion);
    mapVersionRef.current = mapVersion;
    const pureVectorFallbackRef = useRef(false);
    const scaleTextRef = useRef<HTMLDivElement>(null);
    const scaleLineRef = useRef<HTMLDivElement>(null);

    const cameraRef = useRef({ x: -160, y: -90, zoom: 0.78 });
    const hoverWorldRef = useRef<{ x: number; y: number; screenX: number; screenY: number } | null>(
      null
    );
    const hoveredStationRef = useRef<string | null>(null);
    const hoveredRoadRef = useRef<RoadSegment | null>(null);
    const lockedDistrictHitboxesRef = useRef<
      { kind: 'province' | 'city' | 'district'; id: string; x1: number; y1: number; x2: number; y2: number }[]
    >([]);
    const hoveredDistrictRef = useRef<string | null>(null);
    const prevHoveredRegionRef = useRef<string | null>(null);
    const prevMapStyleRef = useRef<OpenMapStyleId>(openMapStyle);
    const [isHoveringDistrict, setIsHoveringDistrict] = useState(false);
    const hoverPrefetchTimerRef = useRef<number | null>(null);
    const lastPrefetchKeyRef = useRef<string>('');
    const isPanningRef = useRef(false);
    const panStartRef = useRef({
      x: 0,
      y: 0,
      lastX: 0,
      lastY: 0,
      camX: 0,
      camY: 0,
      moved: false,
    });

    const [hoveredRoadTooltip, setHoveredRoadTooltip] = useState<{
      name: string;
      saturationPct: number;
      sx: number;
      sy: number;
    } | null>(null);

    const uiRef = useRef({
      lang,
      openMapStyle,
      tool,
      stationSize,
      activeDepth,
      activeLineId,
      selectedStationId,
      trackStartStationId,
      trackWaypoint,
      layers,
      difficulty,
      is25D,
      includeTaiwan,
      selectingSpawn,
      spawnPreview,
    });

    uiRef.current = {
      lang,
      openMapStyle,
      tool,
      stationSize,
      activeDepth,
      activeLineId,
      selectedStationId,
      trackStartStationId,
      trackWaypoint,
      layers,
      difficulty,
      is25D,
      includeTaiwan,
      selectingSpawn,
      spawnPreview,
    };

    const hasGeo = Boolean(simDataRef.current.map.geoBounds);

    // Initialize MapLibre GL with Esri World Dark Gray Base (free, keyless raster) or Pure GeoJSON River Vector Fallback
    useEffect(() => {
      const geo = simDataRef.current.map.geoBounds;
      const mapEl = mapContainerRef.current;

      if (!geo || !mapEl) {
        if (mlMapRef.current) {
          mlMapRef.current.remove();
          mlMapRef.current = null;
        }
        pureVectorFallbackRef.current = false;
        return;
      }

      pureVectorFallbackRef.current = uiRef.current.openMapStyle === 'canvas_vector';
      const initialStyle = getStyleForMapMode(uiRef.current.openMapStyle);

      const mlMap = new maplibregl.Map({
        container: mapEl,
        style: initialStyle,
        bounds: getGeoFitBounds(geo, simDataRef.current.map),
        fitBoundsOptions: {
          padding: 28,
          pitch: uiRef.current.is25D ? 44 : 0,
          bearing: uiRef.current.is25D ? -10 : 0,
        },
        minZoom: 3.2,
        maxZoom: 19.5,
        maxPitch: 60,
        interactive: false,
        attributionControl: false,
      });

      let tileErrorCount = 0;
      let switchedToFallback = false;

      prevMapStyleRef.current = uiRef.current.openMapStyle;

      const ensurePopHeatmap = () => {
        const resTag = isWorldPopHiResReady() ? 'hi' : 'sync';
        const cellsSig = getCellsPopulationChecksum(simDataRef.current.map.cells);
        const key = `${mapSeedKey}_${resTag}_${cellsSig}`;
        if (popHeatmapRef.current && popHeatmapRef.current.key === key) {
          return popHeatmapRef.current;
        }
        const hmCanvas = buildPopulationHeatmapCanvas(simDataRef.current.map);
        if (!hmCanvas) return null;
        const entry = {
          key,
          canvas: hmCanvas,
          dataUrl: hmCanvas.toDataURL('image/png'),
        };
        popHeatmapRef.current = entry;
        return entry;
      };

      const getSpawnOpts = () =>
        uiRef.current.selectingSpawn
          ? {
              selectingSpawn: true,
              selectedProvinceId: uiRef.current.spawnPreview?.provinceId,
              selectedCityId: uiRef.current.spawnPreview?.cityId,
              selectedDistrictId: uiRef.current.spawnPreview?.districtId,
            }
          : undefined;

      mlMap.on('load', () => {
        mlMap.resize();
        const hm = ensurePopHeatmap();
        syncMapLibreVectorLayers(
          mlMap,
          simDataRef.current.map,
          uiRef.current.openMapStyle,
          pureVectorFallbackRef.current,
          uiRef.current.layers.populationHeatmap,
          hm?.dataUrl ?? null,
          Boolean(uiRef.current.includeTaiwan),
          getSpawnOpts()
        );
      });

      mlMap.on('style.load', () => {
        prevHoveredRegionRef.current = null;
        uploadedHeatmapUrlByMap.delete(mlMap);
        pureLandDistCountByMap.delete(mlMap);
        uploadedRoadCountByMap.delete(mlMap);
        const hm = ensurePopHeatmap();
        syncMapLibreVectorLayers(
          mlMap,
          simDataRef.current.map,
          uiRef.current.openMapStyle,
          pureVectorFallbackRef.current,
          uiRef.current.layers.populationHeatmap,
          hm?.dataUrl ?? null,
          Boolean(uiRef.current.includeTaiwan),
          getSpawnOpts()
        );
      });

      let movePrefetchTimer: number | null = null;
      let lastMoveRoadKey = '';
      mlMap.on('moveend', () => {
        if (uiRef.current.selectingSpawn || mlMap.getZoom() < 12.2) return;
        const center = mlMap.getCenter();
        const sim = simDataRef.current;
        if (!sim.map.geoBounds) return;
        const rKey = `${center.lat.toFixed(2)}_${center.lng.toFixed(2)}`;
        if (rKey === lastMoveRoadKey) return;
        lastMoveRoadKey = rKey;
        if (movePrefetchTimer) window.clearTimeout(movePrefetchTimer);
        movePrefetchTimer = window.setTimeout(() => {
          const curMap = simDataRef.current.map;
          if (!curMap.geoBounds) return;
          const pt = latLonToWorld(center.lat, center.lng, curMap.geoBounds, curMap.width, curMap.height);
          if (isWaterAt(curMap, pt.x, pt.y).isWater || findLockedDistrictAt(curMap, pt.x, pt.y)) {
            return;
          }
          fetchLocalOverpassStreets(center.lat, center.lng, curMap.geoBounds, curMap.width, curMap.height).then(
            (extraRoads) => {
              if (!extraRoads || extraRoads.length === 0 || simDataRef.current.map !== curMap) return;
              const existingIds = new Set(curMap.roads.map((r) => r.id));
              const newOnes = extraRoads.filter((r) => !existingIds.has(r.id));
              if (newOnes.length > 0) {
                curMap.roads = [...curMap.roads, ...newOnes];
                if (mlMapRef.current === mlMap) {
                  try {
                    syncMapLibreRoadsOnly(mlMap, curMap, uiRef.current.openMapStyle);
                  } catch {
                    // ignore if style reloading
                  }
                }
              }
            }
          );
        }, 260);
      });

      mlMap.on('error', (ev) => {
        const srcId = (ev as unknown as { sourceId?: string }).sourceId;
        if (srcId === 'esri_light_gray' || srcId === 'esri_dark_gray') {
          tileErrorCount += 1;
          if (!switchedToFallback && tileErrorCount >= 3) {
            switchedToFallback = true;
            pureVectorFallbackRef.current = true;
            mlMap.setStyle(getPureCanvasGeoStyle());
          }
        }
      });

      mlMapRef.current = mlMap;

      let resizeObserver: ResizeObserver | null = null;
      if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
        resizeObserver = new ResizeObserver(() => {
          mlMap.resize();
        });
        resizeObserver.observe(containerRef.current);
      }

      return () => {
        if (movePrefetchTimer) window.clearTimeout(movePrefetchTimer);
        if (resizeObserver) resizeObserver.disconnect();
        mlMap.remove();
        mlMapRef.current = null;
      };
    }, [mapSeedKey]);

    // Switch dynamically between Esri Light Gray, Pure GeoJSON Vector, and Esri Dark Gray
    useEffect(() => {
      const mlMap = mlMapRef.current;
      if (!mlMap || !simDataRef.current.map.geoBounds) return;
      if (prevMapStyleRef.current === openMapStyle) return;
      prevMapStyleRef.current = openMapStyle;
      pureVectorFallbackRef.current = openMapStyle === 'canvas_vector';
      mlMap.setStyle(getStyleForMapMode(openMapStyle));
    }, [openMapStyle]);

    // Preload 636x936 WorldPop 2020 UN-adjusted raster and seamlessly upgrade the heatmap when decoded
    useEffect(() => {
      let cancelled = false;
      preloadWorldPopHiRes(() => {
        if (cancelled) return;
        const cellsSig = getCellsPopulationChecksum(simDataRef.current.map.cells);
        const key = `${mapSeedKey}_hi_${cellsSig}`;
        if (popHeatmapRef.current?.key === key) return;
        const hmCanvas = buildPopulationHeatmapCanvas(simDataRef.current.map);
        if (!hmCanvas) return;
        const dataUrl = hmCanvas.toDataURL('image/png');
        popHeatmapRef.current = { key, canvas: hmCanvas, dataUrl };
        const mlMap = mlMapRef.current;
        if (mlMap && simDataRef.current.map.geoBounds && mlMap.getStyle()) {
          try {
            syncMapLibreVectorLayers(
              mlMap,
              simDataRef.current.map,
              uiRef.current.openMapStyle,
              pureVectorFallbackRef.current,
              uiRef.current.layers.populationHeatmap,
              dataUrl,
              Boolean(uiRef.current.includeTaiwan),
              uiRef.current.selectingSpawn
                ? {
                    selectingSpawn: true,
                    selectedProvinceId: uiRef.current.spawnPreview?.provinceId,
                    selectedCityId: uiRef.current.spawnPreview?.cityId,
                    selectedDistrictId: uiRef.current.spawnPreview?.districtId,
                  }
                : undefined
            );
          } catch {
            // style not loaded yet; style.load will pick up popHeatmapRef
          }
        }
      });
      return () => {
        cancelled = true;
      };
    }, [mapSeedKey]);

    // Sync MapLibre 3-tier administrative GeoJSON polygons & smoothed population heatmap whenever map updates
    useEffect(() => {
      const resTag = isWorldPopHiResReady() ? 'hi' : 'sync';
      const cellsSig = getCellsPopulationChecksum(simDataRef.current.map.cells);
      const key = `${mapSeedKey}_${resTag}_${cellsSig}`;
      if (!popHeatmapRef.current || popHeatmapRef.current.key !== key) {
        const hmCanvas = buildPopulationHeatmapCanvas(simDataRef.current.map);
        if (hmCanvas) {
          popHeatmapRef.current = {
            key,
            canvas: hmCanvas,
            dataUrl: hmCanvas.toDataURL('image/png'),
          };
        }
      }

      const mlMap = mlMapRef.current;
      if (!mlMap || !simDataRef.current.map.geoBounds) return;
      prevHoveredRegionRef.current = null;
      const dataUrl = popHeatmapRef.current?.dataUrl ?? null;
      const spawnOpts = selectingSpawn
        ? {
            selectingSpawn: true,
            selectedProvinceId: spawnPreview?.provinceId,
            selectedCityId: spawnPreview?.cityId,
            selectedDistrictId: spawnPreview?.districtId,
          }
        : undefined;
      if (mlMap.getSource('city-regions-geojson')) {
        try {
          syncMapLibreVectorLayers(
            mlMap,
            simDataRef.current.map,
            uiRef.current.openMapStyle,
            pureVectorFallbackRef.current,
            uiRef.current.layers.populationHeatmap,
            dataUrl,
            Boolean(includeTaiwan),
            spawnOpts
          );
          return;
        } catch {
          // fall through to style.load wait
        }
      }
      const onStyleReady = () => {
        syncMapLibreVectorLayers(
          mlMap,
          simDataRef.current.map,
          uiRef.current.openMapStyle,
          pureVectorFallbackRef.current,
          uiRef.current.layers.populationHeatmap,
          popHeatmapRef.current?.dataUrl ?? null,
          Boolean(includeTaiwan),
          spawnOpts
        );
      };
      mlMap.once('style.load', onStyleReady);
      return () => {
        mlMap.off('style.load', onStyleReady);
      };
    }, [
      mapSeedKey,
      mapVersion,
      includeTaiwan,
      selectingSpawn,
      spawnPreview?.provinceId,
      spawnPreview?.cityId,
      spawnPreview?.districtId,
    ]);

    // Toggle GPU population heatmap visibility immediately without rebuilding layers
    useEffect(() => {
      const mlMap = mlMapRef.current;
      if (!mlMap || !simDataRef.current.map.geoBounds) return;
      const vis = layers.populationHeatmap ? 'visible' : 'none';
      for (const lid of [
        'population-heatmap-layer',
        'population-china-heatmap-layer',
        'population-tw-heatmap-layer',
      ]) {
        if (mlMap.getLayer(lid)) {
          mlMap.setLayoutProperty(lid, 'visibility', vis);
        }
      }
    }, [layers.populationHeatmap]);

    // Sync 2D / 2.5D pitch & bearing
    useEffect(() => {
      const mlMap = mlMapRef.current;
      if (!mlMap || !simDataRef.current.map.geoBounds) return;
      mlMap.easeTo({
        pitch: is25D ? 44 : 0,
        bearing: is25D ? -10 : 0,
        duration: 420,
      });
    }, [is25D]);

    const centerView = () => {
      const geo = simDataRef.current.map.geoBounds;
      const mlMap = mlMapRef.current;
      if (geo && mlMap) {
        mlMap.resize();
        mlMap.fitBounds(getGeoFitBounds(geo, simDataRef.current.map), {
          padding: 28,
          pitch: uiRef.current.is25D ? 44 : 0,
          bearing: uiRef.current.is25D ? -10 : 0,
          duration: 420,
        });
        return;
      }

      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const fitZoom = Math.min(rect.width / mapWidth, rect.height / mapHeight);
      const z = Math.min(1.0, Math.max(0.25, fitZoom * 0.92));
      cameraRef.current = {
        x: (rect.width - mapWidth * z) / 2,
        y: (rect.height - mapHeight * z) / 2,
        zoom: z,
      };
    };

    useEffect(() => {
      if (!simDataRef.current.map.geoBounds) {
        baseMapCanvasRef.current = buildBaseMapCanvas(
          simDataRef.current.map,
          openMapStyle === 'esri_dark_gray'
        );
      }
    }, [mapSeedKey, mapVersion, openMapStyle]);

    useImperativeHandle(ref, () => ({
      zoomBy: (factor: number) => {
        const mlMap = mlMapRef.current;
        if (mlMap && simDataRef.current.map.geoBounds) {
          const nextZ = Math.min(19.5, Math.max(3.2, mlMap.getZoom() + Math.log2(factor)));
          mlMap.easeTo({ zoom: nextZ, duration: 220 });
          return;
        }
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const cam = cameraRef.current;
        const nextZoom = Math.min(4.0, Math.max(0.25, cam.zoom * factor));
        cam.x = cx - ((cx - cam.x) / cam.zoom) * nextZoom;
        cam.y = cy - ((cy - cam.y) / cam.zoom) * nextZoom;
        cam.zoom = nextZoom;
      },
      resetView: () => centerView(),
      focusAt: (wx: number, wy: number, targetZoom?: number) => {
        const geo = simDataRef.current.map.geoBounds;
        const mlMap = mlMapRef.current;
        if (geo && mlMap) {
          const ll = worldToLatLon(wx, wy, geo, mapWidth, mapHeight);
          mlMap.easeTo({
            center: [ll.lon, ll.lat],
            zoom: Math.min(
              19.5,
              Math.max(mlMap.getZoom(), targetZoom ? geo.defaultZoom + Math.log2(targetZoom) : 13.5)
            ),
            duration: 500,
          });
          return;
        }
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const z = Math.min(2.4, Math.max(0.55, targetZoom ?? Math.max(cameraRef.current.zoom, 1.15)));
        cameraRef.current = {
          x: rect.width / 2 - wx * z,
          y: rect.height / 2 - wy * z,
          zoom: z,
        };
      },
      flyToLatLon: (lat: number, lon: number, zoom = 9.2) => {
        const geo = simDataRef.current.map.geoBounds;
        const mlMap = mlMapRef.current;
        if (mlMap && geo) {
          mlMap.easeTo({
            center: [lon, lat],
            zoom: Math.min(19.5, Math.max(3.4, zoom)),
            pitch: 0,
            bearing: 0,
            duration: 560,
          });
          return;
        }
        if (geo) {
          const pt = latLonToWorld(lat, lon, geo, mapWidth, mapHeight);
          const el = containerRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const z = 0.65;
          cameraRef.current = {
            x: rect.width / 2 - pt.x * z,
            y: rect.height / 2 - pt.y * z,
            zoom: z,
          };
        }
      },
      fitNationalView: () => {
        const mlMap = mlMapRef.current;
        if (mlMap && simDataRef.current.map.geoBounds) {
          mlMap.resize();
          mlMap.fitBounds(NATIONAL_CHINA_BOUNDS, {
            padding: { top: 88, bottom: 132, left: 36, right: 36 },
            pitch: 0,
            bearing: 0,
            duration: 580,
          });
        }
      },
    }));

    useEffect(() => {
      centerView();
    }, [mapSeedKey, mapWidth, mapHeight]);

    const screenToWorld = (clientX: number, clientY: number) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      const geo = simDataRef.current.map.geoBounds;
      const mlMap = mlMapRef.current;

      if (geo && mlMap) {
        const ll = mlMap.unproject([sx, sy]);
        const wPos = latLonToWorld(ll.lat, ll.lng, geo, mapWidth, mapHeight);
        return { wx: wPos.x, wy: wPos.y, sx, sy };
      }

      const cam = cameraRef.current;
      return {
        wx: (sx - cam.x) / cam.zoom,
        wy: (sy - cam.y) / cam.zoom,
        sx,
        sy,
      };
    };

    const projectWorldToScreen = (wx: number, wy: number): { x: number; y: number } => {
      const geo = simDataRef.current.map.geoBounds;
      const mlMap = mlMapRef.current;
      if (geo && mlMap) {
        const ll = worldToLatLon(wx, wy, geo, mapWidth, mapHeight);
        const p = mlMap.project([ll.lon, ll.lat]);
        return { x: p.x, y: p.y };
      }
      const cam = cameraRef.current;
      return {
        x: wx * cam.zoom + cam.x,
        y: wy * cam.zoom + cam.y,
      };
    };

    const findStationNearScreen = (sx: number, sy: number, maxScreenDist = 18): Station | null => {
      let best: Station | null = null;
      let bestD = maxScreenDist;
      for (const st of simDataRef.current.stations) {
        const p = projectWorldToScreen(st.x, st.y);
        const d = Math.hypot(p.x - sx, p.y - sy);
        if (d < bestD) {
          bestD = d;
          best = st;
        }
      }
      return best;
    };

    useEffect(() => {
      let rafId = 0;

      const render = () => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (canvas && container) {
          const dpr = window.devicePixelRatio || 1;
          const w = container.clientWidth;
          const h = container.clientHeight;
          if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
          }

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const sim = simDataRef.current;
            const ui = uiRef.current;
            const st = { ...sim, ...ui };
            const geo = st.map.geoBounds;
            const mlMap = mlMapRef.current;
            const isGeoActive = Boolean(geo && mlMap);

            const isDarkMap = st.openMapStyle === 'esri_dark_gray';

            if (isGeoActive) {
              ctx.clearRect(0, 0, w, h);
            } else {
              ctx.fillStyle = isDarkMap ? '#2B2F35' : '#F3F5F8';
              ctx.fillRect(0, 0, w, h);
            }

            const cam = cameraRef.current;
            const proj = (wx: number, wy: number) => {
              if (geo && mlMap) {
                const ll = worldToLatLon(wx, wy, geo, st.map.width, st.map.height);
                const pt = mlMap.project([ll.lon, ll.lat]);
                return { x: pt.x, y: pt.y };
              }
              return { x: wx * cam.zoom + cam.x, y: wy * cam.zoom + cam.y };
            };

            let pxScale = cam.zoom;
            let zoomRatio = cam.zoom;
            let visMinX = -cam.x / cam.zoom - 160;
            let visMaxX = (w - cam.x) / cam.zoom + 160;
            let visMinY = -cam.y / cam.zoom - 160;
            let visMaxY = (h - cam.y) / cam.zoom + 160;

            if (geo && mlMap) {
              const centerLL = mlMap.unproject([w * 0.5, h * 0.5]);
              const centerW =
                Number.isFinite(centerLL.lat) && Number.isFinite(centerLL.lng)
                  ? latLonToWorld(centerLL.lat, centerLL.lng, geo, st.map.width, st.map.height)
                  : { x: st.map.width * 0.5, y: st.map.height * 0.5 };
              const p0 = proj(centerW.x, centerW.y);
              const p1 = proj(centerW.x + 0.25, centerW.y);
              const stepDist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
              pxScale = Number.isFinite(stepDist) ? Math.max(0.14, stepDist / 0.25) : 1;
              zoomRatio = Math.pow(2, mlMap.getZoom() - geo.defaultZoom);

              const maxSpan = Math.max(
                st.map.width * 1.4,
                (Math.max(w, h) / Math.max(0.08, pxScale)) * 2.6
              );

              const corners = [
                mlMap.unproject([0, 0]),
                mlMap.unproject([w, 0]),
                mlMap.unproject([0, h]),
                mlMap.unproject([w, h]),
              ]
                .filter((ll) => Number.isFinite(ll.lat) && Number.isFinite(ll.lng))
                .map((ll) => latLonToWorld(ll.lat, ll.lng, geo, st.map.width, st.map.height))
                .map((c) => ({
                  x: Math.max(centerW.x - maxSpan, Math.min(centerW.x + maxSpan, c.x)),
                  y: Math.max(centerW.y - maxSpan, Math.min(centerW.y + maxSpan, c.y)),
                }));

              if (corners.length > 0) {
                visMinX = Math.min(...corners.map((c) => c.x)) - 220;
                visMaxX = Math.max(...corners.map((c) => c.x)) + 220;
                visMinY = Math.min(...corners.map((c) => c.y)) - 220;
                visMaxY = Math.max(...corners.map((c) => c.y)) + 220;
              } else {
                visMinX = centerW.x - maxSpan;
                visMaxX = centerW.x + maxSpan;
                visMinY = centerW.y - maxSpan;
                visMaxY = centerW.y + maxSpan;
              }
            }

            const isSaneScreenPt = (pt: { x: number; y: number }) =>
              Number.isFinite(pt.x) &&
              Number.isFinite(pt.y) &&
              Math.abs(pt.x) < w * 6 + 4000 &&
              Math.abs(pt.y) < h * 6 + 4000;

            // 1. Non-geo base terrain canvas OR Pure Canvas GeoJSON River Labels + High-Detail OSM Streets (1:1000)
            const currentMlZoom = mlMap ? mlMap.getZoom() : 11;
            if (!isGeoActive && baseMapCanvasRef.current) {
              ctx.save();
              ctx.translate(cam.x, cam.y);
              ctx.scale(cam.zoom, cam.zoom);
              ctx.drawImage(baseMapCanvasRef.current, 0, 0);
              ctx.restore();
            } else if (isGeoActive && (pureVectorFallbackRef.current || currentMlZoom >= 15.2)) {
              if (pureVectorFallbackRef.current) {
                for (const rv of st.map.rivers) {
                  const mid = rv.points[Math.floor(rv.points.length / 2)];
                  if (!mid) continue;
                  const msp = proj(mid.x, mid.y);
                  if (!isSaneScreenPt(msp) || msp.x < -120 || msp.x > w + 120 || msp.y < -120 || msp.y > h + 120) {
                    continue;
                  }
                  ctx.save();
                  ctx.font = '500 12px "Noto Sans TC", sans-serif';
                  ctx.fillStyle = isDarkMap ? 'rgba(148, 163, 184, 0.45)' : 'rgba(51, 65, 85, 0.55)';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(rv.name, msp.x, msp.y);
                  ctx.restore();
                }
              }

              // Crisp OSM streets fallback only if MapLibre WebGL road layer isn't mounted yet
              if (!mlMap || !mlMap.getLayer('city-roads-core')) {
                ctx.save();
                ctx.strokeStyle = pureVectorFallbackRef.current
                  ? isDarkMap ? 'rgba(71, 85, 105, 0.85)' : 'rgba(51, 65, 85, 0.88)'
                  : isDarkMap ? 'rgba(71, 85, 105, 0.78)' : 'rgba(30, 41, 59, 0.78)';
                ctx.lineWidth = currentMlZoom >= 17.5 ? 2.2 : 1.5;
                for (const road of st.map.roads) {
                  if (
                    Math.max(road.x1, road.x2) < visMinX ||
                    Math.min(road.x1, road.x2) > visMaxX ||
                    Math.max(road.y1, road.y2) < visMinY ||
                    Math.min(road.y1, road.y2) > visMaxY
                  ) {
                    continue;
                  }
                  const p1 = proj(road.x1, road.y1);
                  const p2 = proj(road.x2, road.y2);
                  if (!isSaneScreenPt(p1) || !isSaneScreenPt(p2)) continue;
                  ctx.beginPath();
                  ctx.moveTo(p1.x, p1.y);
                  ctx.lineTo(p2.x, p2.y);
                  ctx.stroke();
                }
                ctx.restore();
              }
            }

            // 2. Smooth Population Surface (Canvas2D fallback when WebGL MapLibre inactive) + Metro Coverage / Zoning Overlays
            if (!isGeoActive && st.layers.populationHeatmap && popHeatmapRef.current?.canvas) {
              ctx.save();
              ctx.translate(cam.x, cam.y);
              ctx.scale(cam.zoom, cam.zoom);
              ctx.imageSmoothingEnabled = true;
              ctx.globalAlpha = isDarkMap ? 0.68 : 0.7;
              ctx.drawImage(popHeatmapRef.current.canvas, 0, 0, st.map.width, st.map.height);
              ctx.restore();
            }

            if (st.layers.zones || st.layers.metroCoverageOverlay) {
              const cs = st.map.cellSize;
              const drawSoftGlow = (sx: number, sy: number, r: number, rgbaInner: string, rgbaOuter: string) => {
                const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
                grad.addColorStop(0, rgbaInner);
                grad.addColorStop(0.55, rgbaInner);
                grad.addColorStop(1, rgbaOuter);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(sx, sy, r, 0, Math.PI * 2);
                ctx.fill();
              };

              for (const cell of st.map.cells) {
                if (cell.terrain === 'water') continue;
                const wx = (cell.gx + 0.5) * cs;
                const wy = (cell.gy + 0.5) * cs;
                if (wx < visMinX || wx > visMaxX || wy < visMinY || wy > visMaxY) continue;
                const p = proj(wx, wy);
                if (p.x < -100 || p.x > w + 100 || p.y < -100 || p.y > h + 100) continue;

                if (st.layers.zones && cell.zone !== 'none') {
                  const zRgb =
                    cell.zone === 'residential'
                      ? '56, 189, 248'
                      : cell.zone === 'commercial'
                      ? '245, 158, 11'
                      : cell.zone === 'industrial'
                      ? '139, 92, 246'
                      : '16, 185, 129';
                  const zAlpha = cell.zone === 'commercial' ? 0.11 : 0.085;
                  drawSoftGlow(p.x, p.y, cs * 1.15 * pxScale, `rgba(${zRgb}, ${zAlpha})`, `rgba(${zRgb}, 0)`);
                }

                if (st.layers.metroCoverageOverlay) {
                  const demandWeight = cell.population + cell.jobs;
                  if (cell.coveredByMetro) {
                    drawSoftGlow(p.x, p.y, cs * 1.2 * pxScale, 'rgba(16, 185, 129, 0.17)', 'rgba(16, 185, 129, 0)');
                  } else if (demandWeight > 460) {
                    drawSoftGlow(p.x, p.y, cs * 1.2 * pxScale, 'rgba(244, 63, 94, 0.17)', 'rgba(244, 63, 94, 0)');
                  }
                }
              }
            }

            // 3. Smooth Arterial Road Saturation Overlay (subtly tinted — never neon green lasers)
            for (const road of st.map.roads) {
              if (!road.isArterial) continue;
              const pts =
                road.points && road.points.length >= 2
                  ? road.points
                  : [
                      { x: road.x1, y: road.y1 },
                      { x: road.x2, y: road.y2 },
                    ];
              let rMinX = Infinity;
              let rMaxX = -Infinity;
              let rMinY = Infinity;
              let rMaxY = -Infinity;
              for (const pt of pts) {
                if (pt.x < rMinX) rMinX = pt.x;
                if (pt.x > rMaxX) rMaxX = pt.x;
                if (pt.y < rMinY) rMinY = pt.y;
                if (pt.y > rMaxY) rMaxY = pt.y;
              }
              if (rMaxX < visMinX || rMinX > visMaxX || rMaxY < visMinY || rMinY > visMaxY) {
                continue;
              }
              const isHovered = hoveredRoadRef.current?.id === road.id;
              const isCongested = road.saturation > 0.45;
              const showFreeFlowHint = st.layers.congestionOverlay && isGeoActive;
              if (!isHovered && !isCongested && !showFreeFlowHint) continue;

              const screenPts = pts.map((pt) => proj(pt.x, pt.y));
              if (screenPts.some((p) => !isSaneScreenPt(p))) continue;
              ctx.beginPath();
              traceRoadPoints(ctx, screenPts);

              if (isHovered) {
                ctx.strokeStyle = '#38BDF8';
                ctx.lineWidth = 3.8;
              } else if (road.saturation > 0.68) {
                ctx.strokeStyle = 'rgba(244, 63, 94, 0.68)';
                ctx.lineWidth = 2.6;
              } else if (road.saturation > 0.45) {
                ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
                ctx.lineWidth = 2.1;
              } else {
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
                ctx.lineWidth = 1.6;
              }
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.stroke();
            }

            // 4. Cartographic Building Footprints (2D matte district-aligned footprints) & Extrusions (2.5D)
            if (!isGeoActive) {
              ctx.save();
              ctx.translate(cam.x, cam.y);
              ctx.scale(cam.zoom, cam.zoom);

              if (!st.is25D) {
                if (zoomRatio > 0.45) {
                  ctx.lineWidth = 0.5;
                  ctx.strokeStyle = isDarkMap ? 'rgba(255, 255, 255, 0.055)' : 'rgba(15, 23, 42, 0.08)';
                  for (const b of st.map.buildings) {
                    if (b.x + b.w < visMinX || b.x > visMaxX || b.y + b.d < visMinY || b.y > visMaxY) {
                      continue;
                    }
                    ctx.save();
                    ctx.translate(b.x + b.w * 0.5, b.y + b.d * 0.5);
                    if (b.angle) ctx.rotate(b.angle);
                    ctx.fillStyle = isDarkMap
                      ? b.kind === 'landmark'
                        ? 'rgba(72, 78, 88, 0.72)'
                        : b.kind === 'cbd'
                        ? 'rgba(62, 67, 76, 0.66)'
                        : 'rgba(54, 58, 66, 0.58)'
                      : b.kind === 'landmark'
                      ? 'rgba(203, 213, 225, 0.72)'
                      : b.kind === 'cbd'
                      ? 'rgba(214, 222, 232, 0.7)'
                      : 'rgba(226, 232, 240, 0.68)';
                    ctx.fillRect(-b.w * 0.5, -b.d * 0.5, b.w, b.d);
                    ctx.strokeRect(-b.w * 0.5, -b.d * 0.5, b.w, b.d);
                    ctx.restore();
                  }
                }
              } else {
                const extrudeScale = 0.82;
                const skewX = 0.28;
                for (const b of st.map.buildings) {
                  if (b.x + b.w + 40 < visMinX || b.x - 40 > visMaxX || b.y + b.d + 40 < visMinY || b.y - 60 > visMaxY) {
                    continue;
                  }
                  const bh = b.h * extrudeScale;
                  const ox = bh * skewX;
                  const oy = -bh;

                  ctx.fillStyle = isDarkMap ? 'rgba(0, 0, 0, 0.36)' : 'rgba(15, 23, 42, 0.1)';
                  ctx.fillRect(b.x + 3, b.y + 3, b.w, b.d);

                  ctx.fillStyle = isDarkMap
                    ? b.kind === 'landmark'
                      ? '#3A4352'
                      : b.kind === 'cbd'
                      ? '#333A46'
                      : b.kind === 'ind'
                      ? '#2D323B'
                      : '#2B3038'
                    : b.kind === 'landmark'
                    ? '#CBD5E1'
                    : b.kind === 'cbd'
                    ? '#D4DCE6'
                    : '#DCE3EC';
                  ctx.beginPath();
                  ctx.moveTo(b.x, b.y + b.d);
                  ctx.lineTo(b.x + b.w, b.y + b.d);
                  ctx.lineTo(b.x + b.w + ox, b.y + b.d + oy);
                  ctx.lineTo(b.x + ox, b.y + b.d + oy);
                  ctx.closePath();
                  ctx.fill();

                  ctx.fillStyle = isDarkMap
                    ? b.kind === 'landmark' ? '#4C5667' : b.kind === 'cbd' ? '#414856' : '#373D47'
                    : b.kind === 'landmark' ? '#E2E8F0' : b.kind === 'cbd' ? '#EEF2F6' : '#F8FAFC';
                  ctx.fillRect(b.x + ox, b.y + oy, b.w, b.d);
                  ctx.strokeStyle = isDarkMap ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.12)';
                  ctx.lineWidth = 0.6;
                  ctx.strokeRect(b.x + ox, b.y + oy, b.w, b.d);
                }
              }
              ctx.restore();
            } else if (st.is25D && zoomRatio > 0.7) {
              ctx.save();
              ctx.globalAlpha = isDarkMap ? 0.72 : 0.78;
              for (const b of st.map.buildings) {
                if (b.x < visMinX || b.x > visMaxX || b.y < visMinY || b.y > visMaxY) continue;
                const sp = proj(b.x, b.y);
                if (sp.x < -30 || sp.x > w + 30 || sp.y < -30 || sp.y > h + 30) continue;
                const bw = Math.max(3, b.w * pxScale);
                const bd = Math.max(3, b.d * pxScale);
                const bh = b.h * 0.48 * pxScale;
                ctx.fillStyle = isDarkMap
                  ? b.kind === 'cbd' ? '#333A46' : '#2B3038'
                  : b.kind === 'cbd' ? '#CBD5E1' : '#DCE3EC';
                ctx.fillRect(sp.x, sp.y - bh, bw, bd + bh);
                ctx.fillStyle = isDarkMap
                  ? b.kind === 'cbd' ? '#414856' : '#373D47'
                  : b.kind === 'cbd' ? '#F1F5F9' : '#FFFFFF';
                ctx.fillRect(sp.x, sp.y - bh, bw, bd);
              }
              ctx.restore();
            }

            // 5. True 3-Tier Administrative Region Masking (Locked Province -> Locked City -> City Districts)
            const nextLockedHitboxes: {
              kind: 'province' | 'city' | 'district';
              id: string;
              x1: number;
              y1: number;
              x2: number;
              y2: number;
            }[] = [];

            const provUnlockedMap = new Map<string, boolean>(
              (st.map.provinces ?? []).map((p) => [p.id, p.unlocked])
            );
            const cityUnlockedMap = new Map<string, boolean>(
              (st.map.cities ?? []).map((c) => [c.id, c.unlocked])
            );

            const ringsIntersectView = (rings: { x: number; y: number }[][]): boolean => {
              let minX = Infinity;
              let maxX = -Infinity;
              let minY = Infinity;
              let maxY = -Infinity;
              for (const ring of rings) {
                if (ring.length === 0) continue;
                const box = getExactRingBBox(ring);
                if (box.minX < minX) minX = box.minX;
                if (box.maxX > maxX) maxX = box.maxX;
                if (box.minY < minY) minY = box.minY;
                if (box.maxY > maxY) maxY = box.maxY;
              }
              return !(maxX < visMinX || minX > visMaxX || maxY < visMinY || minY > visMaxY);
            };

            const traceWorldRings = (rings: { x: number; y: number }[][]) => {
              ctx.beginPath();
              for (const ring of rings) {
                if (ring.length < 3) continue;
                for (let i = 0; i < ring.length; i++) {
                  const sp = proj(ring[i].x, ring[i].y);
                  if (i === 0) ctx.moveTo(sp.x, sp.y);
                  else ctx.lineTo(sp.x, sp.y);
                }
                ctx.closePath();
              }
            };

            // When MapLibre WebGL is active, city-regions-geojson renders all Tier 1/2/3 fills & strokes with zero zoom tearing.
            // Keep Canvas 2D polygon rendering only for non-geo procedural cities (with exact bboxes & full stride=1 precision).
            if (!isGeoActive) {
              // Tier 1: Locked Provinces
              for (const prov of st.map.provinces ?? []) {
                if (prov.unlocked) continue;
                const rings = prov.polygons ?? [];
                if (rings.length === 0 || !ringsIntersectView(rings)) continue;
                const isHovered = hoveredDistrictRef.current === prov.id;

                ctx.save();
                traceWorldRings(rings);
                ctx.fillStyle = isDarkMap
                  ? isHovered
                    ? 'rgba(15, 23, 42, 0.56)'
                    : 'rgba(3, 6, 12, 0.74)'
                  : isHovered
                  ? 'rgba(15, 23, 42, 0.22)'
                  : 'rgba(15, 23, 42, 0.32)';
                ctx.fill();
                ctx.setLineDash(isHovered ? [] : [9, 6]);
                ctx.strokeStyle = isHovered
                  ? '#D97706'
                  : isDarkMap
                  ? 'rgba(148, 163, 184, 0.36)'
                  : 'rgba(15, 23, 42, 0.42)';
                ctx.lineWidth = isHovered ? 2.2 : 1.5;
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
              }

              // Tier 2: Unlocked Province + Locked Cities
              for (const city of st.map.cities ?? []) {
                if (city.unlocked) continue;
                if (!provUnlockedMap.get(city.provinceId)) continue;
                const rings = city.polygons ?? [];
                if (rings.length === 0 || !ringsIntersectView(rings)) continue;
                const isHovered = hoveredDistrictRef.current === city.id;
                const prereq = getCityUnlockPrereq(st.map, city);

                ctx.save();
                traceWorldRings(rings);
                ctx.fillStyle = isDarkMap
                  ? isHovered
                    ? 'rgba(18, 26, 40, 0.48)'
                    : 'rgba(4, 8, 16, 0.62)'
                  : isHovered
                  ? 'rgba(15, 23, 42, 0.16)'
                  : prereq.canUnlock
                  ? 'rgba(15, 23, 42, 0.20)'
                  : 'rgba(15, 23, 42, 0.28)';
                ctx.fill();
                ctx.setLineDash(isHovered ? [] : [7, 5]);
                ctx.strokeStyle = isHovered
                  ? '#D97706'
                  : prereq.canUnlock
                  ? isDarkMap
                    ? 'rgba(251, 191, 36, 0.45)'
                    : 'rgba(217, 119, 6, 0.55)'
                  : isDarkMap
                  ? 'rgba(148, 163, 184, 0.24)'
                  : 'rgba(15, 23, 42, 0.30)';
                ctx.lineWidth = isHovered ? 2.0 : prereq.canUnlock ? 1.4 : 1.05;
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
              }

              // Tier 3: Districts inside Unlocked Provinces & Cities
              for (const d of st.map.districts) {
                const provUnlocked = d.provinceId ? Boolean(provUnlockedMap.get(d.provinceId)) : true;
                const cityUnlocked = d.cityId ? Boolean(cityUnlockedMap.get(d.cityId)) : true;
                if (!provUnlocked || !cityUnlocked) continue;

                const rings = d.polygons ?? (d.polygon ? [d.polygon] : []);
                if (rings.length === 0 || !ringsIntersectView(rings)) continue;

                const isHovered = hoveredDistrictRef.current === d.id;

                ctx.save();
                traceWorldRings(rings);

                if (!d.unlocked) {
                  ctx.fillStyle = isDarkMap
                    ? isHovered
                      ? 'rgba(18, 24, 34, 0.44)'
                      : 'rgba(4, 7, 13, 0.56)'
                    : isHovered
                    ? 'rgba(15, 23, 42, 0.14)'
                    : 'rgba(15, 23, 42, 0.20)';
                  ctx.fill();
                }

                ctx.setLineDash(isHovered ? [] : [6, 4]);
                ctx.strokeStyle = !d.unlocked
                  ? isHovered
                    ? isDarkMap ? 'rgba(251, 191, 36, 0.85)' : '#D97706'
                    : isDarkMap ? 'rgba(148, 163, 184, 0.32)' : 'rgba(15, 23, 42, 0.34)'
                  : d.isStarter
                  ? isDarkMap ? 'rgba(148, 163, 184, 0.28)' : 'rgba(15, 23, 42, 0.24)'
                  : isDarkMap ? 'rgba(56, 189, 248, 0.36)' : 'rgba(37, 99, 235, 0.40)';
                ctx.lineWidth = isHovered ? 1.8 : 1.1;
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
              }
            }

            const drawLockBadge = (
              kind: 'province' | 'city' | 'district',
              id: string,
              px: number,
              py: number,
              label: string,
              opts: { ready: boolean; prominent?: boolean }
            ) => {
              const isHovered = hoveredDistrictRef.current === id;
              const fontSize = opts.prominent ? 12 : zoomRatio < 0.52 ? 10 : 11;
              ctx.font = `${opts.prominent ? '700' : '600'} ${fontSize}px "Noto Sans TC", sans-serif`;
              const padX = opts.prominent ? 22 : zoomRatio < 0.52 ? 14 : 18;
              const tw = ctx.measureText(label).width + padX;
              const bh = opts.prominent ? 30 : zoomRatio < 0.52 ? 22 : 26;
              const bx = px - tw / 2;
              const by = py - bh / 2;
              nextLockedHitboxes.push({ kind, id, x1: bx, y1: by, x2: bx + tw, y2: by + bh });

              if (!opts.ready) {
                ctx.fillStyle = isDarkMap ? 'rgba(15, 23, 42, 0.72)' : 'rgba(241, 245, 249, 0.88)';
              } else if (opts.prominent) {
                ctx.fillStyle = isDarkMap
                  ? isHovered ? 'rgba(180, 83, 9, 0.96)' : 'rgba(15, 23, 42, 0.94)'
                  : isHovered ? 'rgba(254, 243, 199, 0.99)' : 'rgba(255, 255, 255, 0.98)';
              } else {
                ctx.fillStyle = isDarkMap
                  ? isHovered ? 'rgba(120, 53, 15, 0.92)' : 'rgba(9, 15, 26, 0.88)'
                  : isHovered ? 'rgba(254, 243, 199, 0.98)' : 'rgba(255, 255, 255, 0.96)';
              }
              ctx.beginPath();
              ctx.roundRect(bx, by, tw, bh, opts.prominent ? 8 : 6);
              ctx.fill();

              ctx.strokeStyle = !opts.ready
                ? isDarkMap ? 'rgba(100, 116, 139, 0.35)' : 'rgba(148, 163, 184, 0.55)'
                : opts.prominent
                ? isHovered ? '#D97706' : '#0EA5E9'
                : isDarkMap
                ? isHovered ? 'rgba(251, 191, 36, 0.9)' : 'rgba(251, 191, 36, 0.36)'
                : isHovered ? '#D97706' : 'rgba(148, 163, 184, 0.72)';
              ctx.lineWidth = opts.prominent ? 1.6 : isHovered ? 1.4 : 1;
              ctx.stroke();

              ctx.fillStyle = !opts.ready
                ? isDarkMap ? 'rgba(148, 163, 184, 0.85)' : '#64748B'
                : isDarkMap
                ? isHovered ? 'rgba(254, 243, 199, 0.98)' : 'rgba(226, 232, 240, 0.94)'
                : isHovered ? '#92400E' : '#0F172A';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(label, px, py);
            };

            if (st.selectingSpawn) {
              // Interactive On-Map Spawn Selection Mode: clean labels & pulsing spawn beacon without lock fog
              const selProvId = st.spawnPreview?.provinceId;
              const selCityId = st.spawnPreview?.cityId;
              for (const prov of st.map.provinces ?? []) {
                const p = proj(prov.x, prov.y);
                if (!isSaneScreenPt(p) || p.x < -120 || p.x > w + 120 || p.y < -120 || p.y > h + 120) continue;
                const isSel = prov.id === selProvId;
                ctx.save();
                ctx.font = `${isSel ? '700' : '600'} ${isSel ? 13 : 11.5}px "Noto Sans TC", sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.lineWidth = 3.2;
                ctx.strokeStyle = isDarkMap ? 'rgba(6, 11, 20, 0.9)' : 'rgba(255, 255, 255, 0.96)';
                ctx.strokeText(prov.name, p.x, p.y);
                ctx.fillStyle = isSel
                  ? '#059669'
                  : isDarkMap ? 'rgba(226, 232, 240, 0.9)' : '#0F172A';
                ctx.fillText(prov.name, p.x, p.y);
                ctx.restore();
              }

              if (selProvId && zoomRatio >= 0.06) {
                for (const c of st.map.cities ?? []) {
                  if (c.provinceId !== selProvId) continue;
                  const p = proj(c.x, c.y);
                  if (!isSaneScreenPt(p) || p.x < -120 || p.x > w + 120 || p.y < -120 || p.y > h + 120) continue;
                  const isSel = c.id === selCityId;
                  ctx.save();
                  ctx.font = `${isSel ? '700' : '600'} ${isSel ? 12.5 : 11}px "Noto Sans TC", sans-serif`;
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.lineWidth = 3;
                  ctx.strokeStyle = isDarkMap ? 'rgba(6, 11, 20, 0.9)' : 'rgba(255, 255, 255, 0.95)';
                  ctx.strokeText(c.name, p.x, p.y);
                  ctx.fillStyle = isSel ? '#059669' : isDarkMap ? '#BAE6FD' : '#1D4ED8';
                  ctx.fillText(c.name, p.x, p.y);
                  ctx.restore();
                }
              }

              if (selCityId && zoomRatio >= 0.25) {
                for (const d of st.map.districts) {
                  if (d.cityId !== selCityId) continue;
                  const p = proj(d.x, d.y);
                  if (!isSaneScreenPt(p) || p.x < -120 || p.x > w + 120 || p.y < -120 || p.y > h + 120) continue;
                  const isSel = d.id === st.spawnPreview?.districtId;
                  ctx.save();
                  ctx.font = `${isSel ? '700' : '500'} ${isSel ? 12 : 10.5}px "Noto Sans TC", sans-serif`;
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.lineWidth = 2.8;
                  ctx.strokeStyle = isDarkMap ? 'rgba(6, 11, 20, 0.88)' : 'rgba(255, 255, 255, 0.94)';
                  ctx.strokeText(d.name, p.x, p.y);
                  ctx.fillStyle = isSel ? '#047857' : isDarkMap ? '#E2E8F0' : '#334155';
                  ctx.fillText(d.name, p.x, p.y);
                  ctx.restore();
                }
              }

              if (st.spawnPreview) {
                const sp = proj(st.spawnPreview.wx, st.spawnPreview.wy);
                if (isSaneScreenPt(sp)) {
                  const pulse = (Math.sin(performance.now() * 0.006) + 1) * 0.5;
                  ctx.save();
                  ctx.beginPath();
                  ctx.arc(sp.x, sp.y, 16 + pulse * 14, 0, Math.PI * 2);
                  ctx.fillStyle = `rgba(16, 185, 129, ${(0.28 - pulse * 0.18).toFixed(2)})`;
                  ctx.fill();

                  ctx.beginPath();
                  ctx.arc(sp.x, sp.y, 10, 0, Math.PI * 2);
                  ctx.fillStyle = '#059669';
                  ctx.fill();
                  ctx.lineWidth = 3;
                  ctx.strokeStyle = '#FFFFFF';
                  ctx.stroke();

                  const badgeText = `出生點 · ${st.spawnPreview.cityName}${
                    st.spawnPreview.districtName ? `（${st.spawnPreview.districtName}）` : ''
                  }`;
                  ctx.font = '700 12px "Noto Sans TC", sans-serif';
                  const tw = ctx.measureText(badgeText).width + 20;
                  const bx = sp.x - tw / 2;
                  const by = sp.y - 40;
                  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
                  ctx.beginPath();
                  ctx.roundRect(bx, by, tw, 24, 6);
                  ctx.fill();
                  ctx.fillStyle = '#FFFFFF';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(badgeText, sp.x, by + 12);
                  ctx.restore();
                }
              }
              lockedDistrictHitboxesRef.current = [];
            } else {
              // 5B. Unlocked District Labels & Progressive District Unlock Badges (only inside unlocked cities)
              for (const d of st.map.districts) {
                const provUnlocked = d.provinceId ? Boolean(provUnlockedMap.get(d.provinceId)) : true;
                const cityUnlocked = d.cityId ? Boolean(cityUnlockedMap.get(d.cityId)) : true;
                if (!provUnlocked || !cityUnlocked) continue;

                const p = proj(d.x, d.y);
                if (!isSaneScreenPt(p) || p.x < -260 || p.x > w + 260 || p.y < -260 || p.y > h + 260) continue;
                ctx.save();

                if (d.unlocked) {
                  const fontSize = zoomRatio < 0.55 ? 10.5 : 12.5;
                  ctx.font = `600 ${fontSize}px "Noto Sans TC", "Manrope", sans-serif`;
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.lineWidth = 3.2;
                  ctx.strokeStyle = isDarkMap ? 'rgba(6, 11, 20, 0.85)' : 'rgba(255, 255, 255, 0.94)';
                  ctx.strokeText(d.name, p.x, p.y);
                  ctx.fillStyle = isDarkMap
                    ? d.isStarter ? 'rgba(226, 232, 240, 0.88)' : 'rgba(186, 230, 253, 0.86)'
                    : d.isStarter ? '#0F172A' : '#1E40AF';
                  ctx.fillText(d.name, p.x, p.y);

                  if (d.isStarter && zoomRatio >= 0.65) {
                    ctx.font = '600 9.5px "Noto Sans TC", sans-serif';
                    ctx.strokeStyle = isDarkMap ? 'rgba(6, 11, 20, 0.85)' : 'rgba(255, 255, 255, 0.94)';
                    ctx.lineWidth = 2.8;
                    ctx.strokeText('開局出生點', p.x, p.y + 13);
                    ctx.fillStyle = isDarkMap ? 'rgba(110, 231, 183, 0.82)' : '#047857';
                    ctx.fillText('開局出生點', p.x, p.y + 13);
                  } else if (d.cityName && d.cityId !== 'city_sh' && zoomRatio >= 0.45) {
                    const subTag = `${d.provinceName ?? ''} · ${d.cityName}`;
                    ctx.font = '500 9.5px "Noto Sans TC", sans-serif';
                    ctx.strokeStyle = isDarkMap ? 'rgba(6, 11, 20, 0.85)' : 'rgba(255, 255, 255, 0.94)';
                    ctx.lineWidth = 2.6;
                    ctx.strokeText(subTag, p.x, p.y + 13);
                    ctx.fillStyle = isDarkMap ? 'rgba(148, 163, 184, 0.85)' : '#475569';
                    ctx.fillText(subTag, p.x, p.y + 13);
                  }
                } else {
                  const prereq = getDistrictUnlockPrereq(st.map, d);
                  const unlockCost = getDistrictUnlockCost(d, ui.difficulty);
                  if (prereq.canUnlock) {
                    const label =
                      zoomRatio < 0.52
                        ? `🔒 ${d.name} · ${formatCurrencyWan(unlockCost, ui.lang)}`
                        : `🔒 ${d.name} · ${formatCurrencyWan(unlockCost, ui.lang)} 解鎖`;
                    drawLockBadge('district', d.id, p.x, p.y, label, { ready: true });
                  } else if (zoomRatio >= 0.44) {
                    const label = `🔒 ${d.name}（需先解鎖${prereq.blockedByName ?? ''}）`;
                    drawLockBadge('district', d.id, p.x, p.y, label, { ready: false });
                  }
                }
                ctx.restore();
              }

              // 5C. Locked City Gateway Badges (inside Unlocked Provinces)
              for (const c of st.map.cities ?? []) {
                if (c.unlocked) continue;
                if (!provUnlockedMap.get(c.provinceId)) continue;
                const p = proj(c.x, c.y);
                if (!isSaneScreenPt(p) || p.x < -260 || p.x > w + 260 || p.y < -260 || p.y > h + 260) continue;

                ctx.save();
                const prereq = getCityUnlockPrereq(st.map, c);
                const unlockCost = getCityUnlockCost(c, ui.difficulty);
                const closestDist = st.map.districts.find((d) => d.id === c.closestDistrictId);
                if (prereq.canUnlock) {
                  const label = closestDist
                    ? `🔒 ${c.name}（含${closestDist.name}）· ${formatCurrencyWan(unlockCost, ui.lang)}`
                    : `🔒 ${c.name} · ${formatCurrencyWan(unlockCost, ui.lang)} 解鎖`;
                  drawLockBadge('city', c.id, p.x, p.y, label, { ready: true, prominent: true });
                } else if (zoomRatio >= 0.14) {
                  const label = `🔒 ${c.name}（需先解鎖${prereq.blockedByName ?? ''}）`;
                  drawLockBadge('city', c.id, p.x, p.y, label, { ready: false });
                }
                ctx.restore();
              }

              // 5D. Locked Province Gateway Badges
              for (const prov of st.map.provinces ?? []) {
                if (prov.unlocked) continue;
                const p = proj(prov.x, prov.y);
                if (!isSaneScreenPt(p) || p.x < -280 || p.x > w + 280 || p.y < -280 || p.y > h + 280) continue;

                ctx.save();
                const unlockCost = getProvinceUnlockCost(prov, ui.difficulty);
                const closestCity = st.map.cities?.find((c) => c.id === prov.closestCityId);
                const closestDist = closestCity
                  ? st.map.districts.find((d) => d.id === closestCity.closestDistrictId)
                  : undefined;
                const cName = closestCity?.name ?? prov.closestCityName;
                const dName = closestDist?.name ?? prov.closestDistrictName;
                const chainHint =
                  cName && dName && zoomRatio >= 0.08
                    ? `（解鎖含${cName}→${dName}）`
                    : '';
                const label =
                  zoomRatio < 0.04
                    ? `🔒 ${prov.name}`
                    : `🔒 ${prov.name}${chainHint} · ${formatCurrencyWan(unlockCost, ui.lang)}`;
                drawLockBadge('province', prov.id, p.x, p.y, label, {
                  ready: true,
                  prominent: zoomRatio >= 0.08,
                });
                ctx.restore();
              }

              lockedDistrictHitboxesRef.current = nextLockedHitboxes;
            }

            // 5.5 Real City POIs & Landmarks (◆ markers)
            if (st.map.pois && st.map.pois.length > 0 && zoomRatio > 0.5) {
              for (const poi of st.map.pois) {
                const p = proj(poi.x, poi.y);
                if (!isSaneScreenPt(p) || p.x < -50 || p.x > w + 50 || p.y < -50 || p.y > h + 50) continue;
                ctx.save();
                ctx.translate(p.x, p.y);
                const diamondColor =
                  poi.kind === 'hospital'
                    ? '#E11D48'
                    : poi.kind === 'airport' || poi.kind === 'rail'
                    ? '#0284C7'
                    : poi.kind === 'park'
                    ? '#059669'
                    : '#D97706';
                ctx.fillStyle = diamondColor;
                ctx.beginPath();
                ctx.moveTo(0, -4.5);
                ctx.lineTo(4.5, 0);
                ctx.lineTo(0, 4.5);
                ctx.lineTo(-4.5, 0);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = isDarkMap ? '#07101D' : '#FFFFFF';
                ctx.lineWidth = 1.2;
                ctx.stroke();

                if (zoomRatio > 0.72) {
                  ctx.font = '500 10.5px "Noto Sans TC", "Noto Sans SC", sans-serif';
                  ctx.textAlign = 'left';
                  ctx.textBaseline = 'middle';
                  if (!isDarkMap) {
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                    ctx.lineWidth = 2.6;
                    ctx.strokeText(poi.name, 7, 0);
                  }
                  ctx.fillStyle = isDarkMap ? 'rgba(226, 232, 240, 0.84)' : '#334155';
                  ctx.fillText(poi.name, 7, 0);
                }
                ctx.restore();
              }
            }

            // 6. Station Catchment Rings
            if (st.layers.catchmentRings) {
              for (const station of st.stations) {
                const p = proj(station.x, station.y);
                if (!isSaneScreenPt(p)) continue;
                const rPx = station.catchmentRadius * pxScale;
                ctx.beginPath();
                ctx.arc(p.x, p.y, rPx, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(56, 189, 248, 0.03)';
                ctx.fill();
                ctx.setLineDash([4, 5]);
                ctx.strokeStyle =
                  station.id === st.selectedStationId
                    ? 'rgba(56, 189, 248, 0.75)'
                    : 'rgba(56, 189, 248, 0.2)';
                ctx.lineWidth = 1.1;
                ctx.stroke();
                ctx.setLineDash([]);
              }
            }

            // 7. Track Segments & Glowing Metro Lines
            const stationMap = new Map(st.stations.map((s) => [s.id, s]));
            const segMap = new Map<string, TrackSegment>();
            for (const seg of st.segments) {
              segMap.set(`${seg.fromStationId}_${seg.toStationId}`, seg);
              segMap.set(`${seg.toStationId}_${seg.fromStationId}`, seg);
            }

            const getDepthShiftScreenY = (depth: TrackDepth) => {
              if (!st.is25D) return 0;
              if (depth === 'EL') return -10;
              if (depth === 'B1') return 3;
              if (depth === 'B2') return 7;
              if (depth === 'B3') return 11;
              if (depth === 'B4') return 15;
              return 19;
            };

            const segmentLineCount = new Map<string, number>();
            for (const line of st.lines) {
              for (let i = 0; i < line.stationIds.length - 1; i++) {
                const aId = line.stationIds[i];
                const bId = line.stationIds[i + 1];
                const stA = stationMap.get(aId);
                const stB = stationMap.get(bId);
                if (!stA || !stB) continue;
                const seg = segMap.get(`${aId}_${bId}`);
                const segDepth = seg ? seg.depth : 'B1';
                const dimmed =
                  st.layers.depthFilter !== 'ALL' && st.layers.depthFilter !== segDepth;

                const pairKey = aId < bId ? `${aId}_${bId}` : `${bId}_${aId}`;
                const idxOnPair = segmentLineCount.get(pairKey) ?? 0;
                segmentLineCount.set(pairKey, idxOnPair + 1);

                const offsetWorld =
                  idxOnPair === 0
                    ? 0
                    : ((idxOnPair % 2 === 1 ? 1 : -1) * Math.ceil(idxOnPair / 2) * 4.5) /
                      Math.max(0.45, pxScale);
                const dx = stB.x - stA.x;
                const dy = stB.y - stA.y;
                const len = Math.max(1, Math.hypot(dx, dy));
                const nx = (-dy / len) * offsetWorld;
                const ny = (dx / len) * offsetWorld;
                const zOff = getDepthShiftScreenY(segDepth);

                const cx = (seg ? seg.controlX : (stA.x + stB.x) / 2) + nx;
                const cy = (seg ? seg.controlY : (stA.y + stB.y) / 2) + ny;

                const curveSamples = 36;
                const screenPts: { x: number; y: number }[] = [];
                for (let s = 0; s <= curveSamples; s++) {
                  const ptW = evalQuadraticBezier(
                    stA.x + nx,
                    stA.y + ny,
                    cx,
                    cy,
                    stB.x + nx,
                    stB.y + ny,
                    s / curveSamples
                  );
                  const sp = proj(ptW.x, ptW.y);
                  screenPts.push({ x: sp.x, y: sp.y + zOff });
                }
                if (screenPts.some((p) => !isSaneScreenPt(p))) continue;

                ctx.save();
                ctx.globalAlpha = dimmed ? 0.14 : seg?.isDraft ? 0.78 : 1;
                if (isDarkMap) {
                  ctx.shadowColor = line.color;
                  ctx.shadowBlur = line.id === st.activeLineId ? 10 : 6;
                } else {
                  ctx.shadowBlur = 0;
                }
                if (seg?.isDraft) ctx.setLineDash([8, 6]);

                const coreWidth =
                  (line.id === st.activeLineId ? 5.0 : 3.8) *
                  Math.min(1.35, Math.max(0.8, zoomRatio * 0.9));

                ctx.beginPath();
                screenPts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
                if (!isDarkMap) {
                  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
                  ctx.lineWidth = coreWidth + 2.4;
                  ctx.lineCap = 'round';
                  ctx.lineJoin = 'round';
                  ctx.stroke();
                }

                ctx.strokeStyle = line.color;
                ctx.lineWidth = coreWidth;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.shadowBlur = 0;

                if (seg?.isUnderwater) {
                  ctx.setLineDash([6, 6]);
                  ctx.strokeStyle = isDarkMap ? 'rgba(224, 242, 254, 0.6)' : 'rgba(255, 255, 255, 0.85)';
                  ctx.lineWidth = 1.4;
                  ctx.stroke();
                  ctx.setLineDash([]);
                } else if (line.serviceMode === 'express') {
                  ctx.setLineDash([10, 8]);
                  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
                  ctx.lineWidth = 1.5;
                  ctx.stroke();
                  ctx.setLineDash([]);
                }

                if ((zoomRatio > 0.85 || st.layers.depthFilter !== 'ALL') && seg && !dimmed) {
                  const mid = screenPts[Math.floor(screenPts.length / 2)];
                  ctx.fillStyle = isDarkMap ? 'rgba(9, 15, 28, 0.92)' : 'rgba(255, 255, 255, 0.96)';
                  ctx.beginPath();
                  ctx.roundRect(mid.x - 12, mid.y - 8, 24, 15, 3);
                  ctx.fill();
                  ctx.strokeStyle = line.color;
                  ctx.lineWidth = 1.1;
                  ctx.stroke();
                  ctx.fillStyle = isDarkMap ? '#E2E8F0' : '#0F172A';
                  ctx.font = '600 9px "IBM Plex Mono", monospace';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(seg.depth, mid.x, mid.y);
                }

                ctx.restore();
              }
            }

            // 8. Track Drawing Preview
            if (st.tool === 'track' && st.trackStartStationId && hoverWorldRef.current) {
              const startSt = stationMap.get(st.trackStartStationId);
              if (startSt) {
                const targetHover = hoveredStationRef.current
                  ? stationMap.get(hoveredStationRef.current)
                  : null;
                const endX = targetHover ? targetHover.x : hoverWorldRef.current.x;
                const endY = targetHover ? targetHover.y : hoverWorldRef.current.y;
                const ctrlX = st.trackWaypoint ? st.trackWaypoint.x : (startSt.x + endX) / 2;
                const ctrlY = st.trackWaypoint ? st.trackWaypoint.y : (startSt.y + endY) / 2;

                const activeLine = st.lines.find((l) => l.id === st.activeLineId);
                const endTargetSt: Station = targetHover ?? {
                  ...startSt,
                  id: '__preview_end__',
                  x: endX,
                  y: endY,
                };
                const curvePreviewCheck = validateProposedTrackSegment(
                  st.map,
                  activeLine,
                  st.stations,
                  st.segments,
                  startSt,
                  endTargetSt,
                  ctrlX,
                  ctrlY
                );
                const previewPts: { x: number; y: number }[] = [];
                for (let s = 0; s <= 36; s++) {
                  const pW = evalQuadraticBezier(startSt.x, startSt.y, ctrlX, ctrlY, endX, endY, s / 36);
                  previewPts.push(proj(pW.x, pW.y));
                }
                if (!previewPts.some((p) => !isSaneScreenPt(p))) {
                  ctx.save();
                  ctx.beginPath();
                  previewPts.forEach((sp, s) => {
                    if (s === 0) ctx.moveTo(sp.x, sp.y);
                    else ctx.lineTo(sp.x, sp.y);
                  });
                  ctx.setLineDash([8, 6]);
                  ctx.strokeStyle = !curvePreviewCheck.ok
                    ? '#EF4444'
                    : activeLine
                    ? activeLine.color
                    : '#38BDF8';
                  ctx.lineWidth = !curvePreviewCheck.ok ? 4.5 : 4;
                  ctx.stroke();
                  ctx.setLineDash([]);

                  if (st.trackWaypoint) {
                    const cp = proj(ctrlX, ctrlY);
                    if (isSaneScreenPt(cp)) {
                      ctx.beginPath();
                      ctx.arc(cp.x, cp.y, 5, 0, Math.PI * 2);
                      ctx.fillStyle = !curvePreviewCheck.ok ? '#EF4444' : '#FACC15';
                      ctx.fill();
                    }
                  }
                  ctx.restore();
                }
              }
            }

            // 9. Trains
            for (const line of st.lines) {
              for (const train of line.trains) {
                const sp = proj(train.x, train.y);
                if (sp.x < -40 || sp.x > w + 40 || sp.y < -40 || sp.y > h + 40) continue;
                const ahead = proj(
                  train.x + Math.cos(train.angle) * 6,
                  train.y + Math.sin(train.angle) * 6
                );
                const screenAngle = Math.atan2(ahead.y - sp.y, ahead.x - sp.x);

                const role = train.serviceRole ?? 'local';
                const trainLen = Math.min(26, 11 + line.carCount * 1.4);
                const trainW = role === 'short_turn' ? 6.2 : 7.0;

                ctx.save();
                ctx.translate(sp.x, sp.y);
                ctx.rotate(screenAngle);

                if (isDarkMap) {
                  ctx.shadowColor = line.color;
                  ctx.shadowBlur = 8;
                } else {
                  ctx.shadowBlur = 0;
                }
                ctx.fillStyle = role === 'express' ? '#FEF3C7' : role === 'short_turn' ? '#E0F2FE' : '#FFFFFF';
                ctx.beginPath();
                ctx.roundRect(-trainLen / 2, -trainW / 2, trainLen, trainW, 3);
                ctx.fill();
                ctx.shadowBlur = 0;

                ctx.strokeStyle =
                  role === 'express'
                    ? '#D97706'
                    : role === 'short_turn'
                    ? '#0284C7'
                    : isDarkMap
                    ? 'rgba(255,255,255,0.4)'
                    : 'rgba(15, 23, 42, 0.45)';
                ctx.lineWidth = role === 'local' ? 0.9 : 1.3;
                ctx.stroke();

                const loadRatio = Math.min(1, train.passengers.length / Math.max(1, train.capacity));
                ctx.fillStyle = line.color;
                ctx.beginPath();
                ctx.roundRect(
                  -trainLen / 2 + 1.5,
                  -trainW / 2 + 1.5,
                  (trainLen - 3) * Math.max(0.28, loadRatio),
                  trainW - 3,
                  2
                );
                ctx.fill();
                ctx.restore();

                if (zoomRatio > 0.85 && (role === 'express' || role === 'short_turn')) {
                  ctx.save();
                  ctx.font = '700 8px "Noto Sans TC", sans-serif';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillStyle = role === 'express' ? '#B45309' : '#0369A1';
                  ctx.fillText(role === 'express' ? '快' : '區', sp.x, sp.y - 9);
                  ctx.restore();
                }
              }
            }

            // 10. Stations
            for (const station of st.stations) {
              const p = proj(station.x, station.y);
              if (p.x < -60 || p.x > w + 60 || p.y < -60 || p.y > h + 60) continue;
              const zOff = getDepthShiftScreenY(station.depth) * 0.6;
              const sx = p.x;
              const sy = p.y + zOff;

              const cfg = STATION_CONFIGS[station.size];
              const rScale = Math.min(1.25, Math.max(0.75, zoomRatio * 0.92));
              const rad = cfg.radiusPx * rScale;

              const isSelected = station.id === st.selectedStationId;
              const isHovered = station.id === hoveredStationRef.current;
              const isTrackOrigin = station.id === st.trackStartStationId;

              const servingLines = st.lines.filter((l) => l.stationIds.includes(station.id));
              const primaryColor = servingLines[0]?.color ?? '#38BDF8';
              const hasExpressLine = servingLines.some((l) => l.serviceMode === 'express');

              if (hasExpressLine && (station.isExpressStop || station.size === 'hub' || station.size === 'mall')) {
                ctx.beginPath();
                ctx.arc(sx, sy, rad + 3, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(217, 119, 6, 0.85)';
                ctx.lineWidth = 1.6;
                ctx.stroke();
              }

              if (station.congestionLoad > 0.85) {
                ctx.beginPath();
                ctx.arc(sx, sy, rad + 6, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(244, 63, 94, 0.85)';
                ctx.lineWidth = 1.8;
                ctx.stroke();
              }

              if (isSelected || isHovered || isTrackOrigin || station.isDraft) {
                ctx.beginPath();
                if (station.isDraft) ctx.setLineDash([3, 3]);
                ctx.arc(sx, sy, rad + 4.5, 0, Math.PI * 2);
                ctx.strokeStyle =
                  st.tool === 'demolish'
                    ? '#F43F5E'
                    : isTrackOrigin
                    ? '#FACC15'
                    : '#38BDF8';
                ctx.lineWidth = 2.2;
                ctx.stroke();
                ctx.setLineDash([]);
              }

              ctx.fillStyle = station.isDraft ? 'rgba(255,255,255,0.75)' : '#FFFFFF';
              ctx.strokeStyle = '#07101D';
              ctx.lineWidth = 2;

              if (servingLines.length >= 2 || station.size === 'hub' || station.size === 'mall') {
                ctx.beginPath();
                ctx.arc(sx, sy, rad, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(sx, sy, rad * 0.55, 0, Math.PI * 2);
                ctx.fillStyle = station.size === 'mall' ? '#F59E0B' : primaryColor;
                ctx.fill();
              } else {
                ctx.beginPath();
                ctx.arc(sx, sy, rad * 0.85, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(sx, sy, rad * 0.44, 0, Math.PI * 2);
                ctx.fillStyle = primaryColor;
                ctx.fill();
              }

              const paxCount = station.waiting.length;
              if (paxCount > 0) {
                const dots = Math.min(10, Math.ceil(paxCount / 5));
                for (let d = 0; d < dots; d++) {
                  const col = d % 5;
                  const row = Math.floor(d / 5);
                  ctx.fillStyle = paxCount > 45 ? '#FB7185' : '#38BDF8';
                  ctx.beginPath();
                  ctx.arc(sx + rad + 5 + col * 4.5, sy - 5 + row * 5, 1.8, 0, Math.PI * 2);
                  ctx.fill();
                }
              }

              if (station.todProperty && zoomRatio > 0.65) {
                const tod = station.todProperty;
                const badgeText = tod.kind === 'retail' ? '商' : tod.kind === 'office' ? '辦' : '住';
                const badgeBg = tod.kind === 'retail' ? '#D97706' : tod.kind === 'office' ? '#1D4ED8' : '#047857';
                const bx = sx - rad - 13;
                const by = sy - rad - 5;
                ctx.save();
                ctx.fillStyle = badgeBg;
                ctx.beginPath();
                ctx.roundRect(bx, by, 14, 13, 3);
                ctx.fill();
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '700 8.5px "Noto Sans TC", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(badgeText, bx + 7, by + 6.5);
                ctx.restore();
              }

              if (zoomRatio > 0.62 || isSelected || isHovered || servingLines.length >= 2 || station.isDraft) {
                ctx.font = '600 10.5px "Noto Sans TC", "Manrope", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                const labelY = sy + rad + 4;
                const displayName = station.isDraft ? `${station.name} *` : station.name;
                const metrics = ctx.measureText(displayName);
                const labelW = metrics.width + 10;
                ctx.fillStyle = isDarkMap
                  ? station.isDraft ? 'rgba(14, 116, 144, 0.85)' : 'rgba(7, 15, 28, 0.88)'
                  : station.isDraft ? 'rgba(239, 246, 255, 0.96)' : 'rgba(255, 255, 255, 0.95)';
                ctx.beginPath();
                ctx.roundRect(sx - labelW / 2, labelY - 1, labelW, 16, 4);
                ctx.fill();
                if (!isDarkMap) {
                  ctx.strokeStyle = station.isDraft ? 'rgba(59, 130, 246, 0.55)' : 'rgba(203, 213, 225, 0.95)';
                  ctx.lineWidth = 0.9;
                  ctx.stroke();
                }

                ctx.fillStyle = isDarkMap
                  ? '#E2E8F0'
                  : station.isDraft ? '#1D4ED8' : '#0F172A';
                ctx.fillText(displayName, sx, labelY + 1.5);
              }
            }

            // 11. Ghost Station Preview + Mid-Track Snap (blocks water & locked districts visually)
            let trackSnapPoint: { x: number; y: number; segmentId: string } | null = null;
            let stationBlockedReason: string | null = null;
            if (st.tool === 'station' && hoverWorldRef.current) {
              const { x: wx, y: wy } = hoverWorldRef.current;
              const snap = findNearestTrackSegment(
                wx,
                wy,
                st.stations,
                st.segments,
                18 / Math.max(0.35, pxScale)
              );
              const gx = snap ? snap.point.x : wx;
              const gy = snap ? snap.point.y : wy;
              if (snap) {
                trackSnapPoint = { x: snap.point.x, y: snap.point.y, segmentId: snap.segment.id };
              }
              const waterCheck = isWaterAt(st.map, gx, gy);
              const lockedDist = !waterCheck.isWater ? findLockedDistrictAt(st.map, gx, gy) : null;
              if (waterCheck.isWater) {
                stationBlockedReason =
                  waterCheck.reason === 'sea' ? '海上 / 市界水域不可設站' : '江河 / 湖泊水面不可設站';
              } else if (lockedDist) {
                stationBlockedReason = `未解鎖「${lockedDist.name}」`;
              }

              const isBlocked = Boolean(stationBlockedReason);
              const sp = proj(gx, gy);
              const cfg = STATION_CONFIGS[st.stationSize];
              ctx.save();
              ctx.beginPath();
              ctx.arc(sp.x, sp.y, cfg.catchment * pxScale, 0, Math.PI * 2);
              ctx.fillStyle = isBlocked
                ? 'rgba(244, 63, 94, 0.14)'
                : snap
                ? 'rgba(16, 185, 129, 0.1)'
                : 'rgba(56, 189, 248, 0.08)';
              ctx.fill();
              ctx.setLineDash([4, 4]);
              ctx.strokeStyle = isBlocked
                ? 'rgba(244, 63, 94, 0.85)'
                : snap
                ? 'rgba(52, 211, 153, 0.85)'
                : 'rgba(56, 189, 248, 0.65)';
              ctx.lineWidth = 1.3;
              ctx.stroke();
              ctx.setLineDash([]);

              ctx.beginPath();
              ctx.arc(sp.x, sp.y, cfg.radiusPx + (snap ? 2 : 0), 0, Math.PI * 2);
              ctx.fillStyle = isBlocked ? '#F43F5E' : snap ? '#34D399' : 'rgba(255, 255, 255, 0.9)';
              ctx.fill();
              ctx.restore();
            }

            // 12. Floating Cost / Status Tooltip
            if (
              hoverWorldRef.current &&
              (st.tool === 'station' || (st.tool === 'track' && st.trackStartStationId))
            ) {
              const hw = hoverWorldRef.current;
              let badgeText = '';
              let isBlockedTooltip = false;
              if (st.tool === 'station') {
                if (stationBlockedReason) {
                  badgeText = stationBlockedReason;
                  isBlockedTooltip = true;
                } else {
                  const gx = trackSnapPoint ? trackSnapPoint.x : hw.x;
                  const gy = trackSnapPoint ? trackSnapPoint.y : hw.y;
                  const previewName = suggestStationName(st.map, gx, gy, st.stations);
                  const cost = getStationBuildCost(
                    st.stationSize,
                    st.activeDepth,
                    false,
                    st.difficulty,
                    true
                  );
                  const insertTag = trackSnapPoint ? ' · 插入軌道' : '';
                  badgeText = `「${previewName}」· ${STATION_CONFIGS[st.stationSize].label} (${st.activeDepth})${insertTag} · ${formatCurrencyWan(
                    cost,
                    st.lang
                  )}`;
                }
              } else if (st.tool === 'track' && st.trackStartStationId) {
                const startSt = st.stations.find((s) => s.id === st.trackStartStationId);
                if (startSt) {
                  const targetHover = hoveredStationRef.current
                    ? st.stations.find((s) => s.id === hoveredStationRef.current)
                    : null;
                  const ex = targetHover ? targetHover.x : hw.x;
                  const ey = targetHover ? targetHover.y : hw.y;
                  const cx = st.trackWaypoint ? st.trackWaypoint.x : (startSt.x + ex) / 2;
                  const cy = st.trackWaypoint ? st.trackWaypoint.y : (startSt.y + ey) / 2;
                  const activeLine = st.lines.find((l) => l.id === st.activeLineId);
                  const speedKmh = activeLine?.speedKmh ?? 60;
                  const endTargetSt: Station = targetHover ?? {
                    ...startSt,
                    id: '__preview_end__',
                    x: ex,
                    y: ey,
                  };
                  const curveCheck = validateProposedTrackSegment(
                    st.map,
                    activeLine,
                    st.stations,
                    st.segments,
                    startSt,
                    endTargetSt,
                    cx,
                    cy
                  );
                  const info = analyzeTrackCrossing(
                    st.map,
                    startSt.x,
                    startSt.y,
                    cx,
                    cy,
                    ex,
                    ey,
                    st.activeDepth,
                    st.difficulty,
                    true,
                    speedKmh
                  );
                  const km = pixelsToKm(info.length, st.map).toFixed(2);
                  const radiusTag = Number.isFinite(curveCheck.minRadiusM)
                    ? `R=${Math.round(curveCheck.minRadiusM)}m`
                    : '直線';
                  if (!curveCheck.ok) {
                    isBlockedTooltip = true;
                    badgeText = `轉彎半徑 ${Math.round(curveCheck.minRadiusM)} m < ${
                      curveCheck.speedKmh
                    } km/h 最低需求 ${curveCheck.requiredMinRadiusM} m`;
                  } else {
                    const crossingTag = info.isUnderwater
                      ? ' · 潛盾過江'
                      : info.isBridge
                      ? ' · 跨河橋'
                      : '';
                    badgeText = `${st.activeDepth} (${km} km · ${radiusTag} ≥ ${
                      curveCheck.requiredMinRadiusM
                    }m)${crossingTag} · ${formatCurrencyWan(info.cost, st.lang)}`;
                  }
                }
              }

              if (badgeText) {
                ctx.font = '500 11px "Noto Sans TC", "IBM Plex Mono", sans-serif';
                const tw = ctx.measureText(badgeText).width + 18;
                const bx = Math.min(w - tw - 12, hw.screenX + 18);
                const by = Math.max(76, hw.screenY - 30);
                ctx.fillStyle = isDarkMap
                  ? isBlockedTooltip ? 'rgba(69, 10, 24, 0.94)' : 'rgba(11, 20, 34, 0.92)'
                  : isBlockedTooltip ? 'rgba(254, 242, 242, 0.97)' : 'rgba(255, 255, 255, 0.97)';
                ctx.beginPath();
                ctx.roundRect(bx, by, tw, 26, 6);
                ctx.fill();
                ctx.strokeStyle = isDarkMap
                  ? isBlockedTooltip ? 'rgba(244, 63, 94, 0.72)' : 'rgba(56, 189, 248, 0.25)'
                  : isBlockedTooltip ? 'rgba(220, 38, 38, 0.65)' : 'rgba(203, 213, 225, 0.95)';
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.fillStyle = isDarkMap
                  ? isBlockedTooltip ? '#FECDD3' : '#F1F5F9'
                  : isBlockedTooltip ? '#991B1B' : '#0F172A';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(badgeText, bx + 9, by + 13);
              }
            }

            // 13. Dynamic Metric Scale Bar
            if (scaleTextRef.current && scaleLineRef.current) {
              let kmPerScreenPx = 0.01;
              if (geo && mlMap) {
                const ll1 = mlMap.unproject([w * 0.5, h * 0.5]);
                const ll2 = mlMap.unproject([w * 0.5 + 100, h * 0.5]);
                if (
                  Number.isFinite(ll1.lat) &&
                  Number.isFinite(ll1.lng) &&
                  Number.isFinite(ll2.lat) &&
                  Number.isFinite(ll2.lng)
                ) {
                  kmPerScreenPx = Math.max(0.00001, haversineKm(ll1.lat, ll1.lng, ll2.lat, ll2.lng) / 100);
                }
              } else {
                kmPerScreenPx = Math.max(0.00001, pixelsToKm(1, st.map) / cam.zoom);
              }
              const rawKm = 96 * kmPerScreenPx;
              const niceStepsKm = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
              let bestKm = 1;
              for (const sKm of niceStepsKm) {
                if (sKm <= rawKm * 1.35) bestKm = sKm;
              }
              const barPx = Math.max(44, Math.min(140, Math.round(bestKm / kmPerScreenPx)));
              scaleTextRef.current.textContent =
                bestKm < 1 ? `${Math.round(bestKm * 1000)} m` : `${bestKm} km`;
              scaleLineRef.current.style.width = `${barPx}px`;
            }
          }
        }
        rafId = requestAnimationFrame(render);
      };

      rafId = requestAnimationFrame(render);
      return () => cancelAnimationFrame(rafId);
    }, []);

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const { wx, wy, sx, sy } = screenToWorld(e.clientX, e.clientY);

      if (e.button === 1 || e.button === 2) {
        isPanningRef.current = true;
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          lastX: e.clientX,
          lastY: e.clientY,
          camX: cameraRef.current.x,
          camY: cameraRef.current.y,
          moved: false,
        };
        return;
      }

      if (e.button !== 0) return;

      if (selectingSpawn) {
        isPanningRef.current = true;
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          lastX: e.clientX,
          lastY: e.clientY,
          camX: cameraRef.current.x,
          camY: cameraRef.current.y,
          moved: false,
        };
        return;
      }

      let hitLockedBadge:
        | { kind: 'province' | 'city' | 'district'; id: string; x1: number; y1: number; x2: number; y2: number }
        | undefined;
      for (let i = lockedDistrictHitboxesRef.current.length - 1; i >= 0; i--) {
        const b = lockedDistrictHitboxesRef.current[i];
        if (sx >= b.x1 && sx <= b.x2 && sy >= b.y1 && sy <= b.y2) {
          hitLockedBadge = b;
          break;
        }
      }
      if (hitLockedBadge && (tool === 'select' || tool === 'station' || tool === 'track')) {
        if (onUnlockRegion) {
          onUnlockRegion(hitLockedBadge.kind, hitLockedBadge.id);
        } else if (hitLockedBadge.kind === 'district') {
          onUnlockDistrict(hitLockedBadge.id);
        }
        return;
      }

      if (tool === 'demolish') {
        onDemolishAt(wx, wy);
        return;
      }

      if (tool === 'select') {
        const hit = findStationNearScreen(sx, sy, 20);
        if (hit) {
          onSelectStation(hit.id);
        } else {
          isPanningRef.current = true;
          panStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            lastX: e.clientX,
            lastY: e.clientY,
            camX: cameraRef.current.x,
            camY: cameraRef.current.y,
            moved: false,
          };
        }
        return;
      }

      if (tool === 'station') {
        const near = findStationNearScreen(sx, sy, 13);
        if (near) {
          onSelectStation(near.id);
        } else {
          const p0 = projectWorldToScreen(wx, wy);
          const p1 = projectWorldToScreen(wx + 0.25, wy);
          const pxScale = Math.max(0.2, Math.hypot(p1.x - p0.x, p1.y - p0.y) / 0.25);
          const snap = findNearestTrackSegment(
            wx,
            wy,
            simDataRef.current.stations,
            simDataRef.current.segments,
            18 / pxScale
          );
          if (snap) {
            onInsertStationOnSegment(snap.segment.id, snap.t, snap.point.x, snap.point.y);
          } else {
            onPlaceStation(wx, wy);
          }
        }
        return;
      }

      if (tool === 'track') {
        const hit = findStationNearScreen(sx, sy, 22);
        if (hit) {
          onTrackClickStation(hit.id);
        } else if (trackStartStationId) {
          onTrackSetWaypoint(wx, wy);
        }
      }

      hoverWorldRef.current = { x: wx, y: wy, screenX: sx, screenY: sy };
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const { wx, wy, sx, sy } = screenToWorld(e.clientX, e.clientY);
      hoverWorldRef.current = { x: wx, y: wy, screenX: sx, screenY: sy };

      const hit = findStationNearScreen(sx, sy, 20);
      hoveredStationRef.current = hit ? hit.id : null;

      let hitLockedBadge: { id: string; x1: number; y1: number; x2: number; y2: number } | undefined;
      if (!hit) {
        for (let i = lockedDistrictHitboxesRef.current.length - 1; i >= 0; i--) {
          const b = lockedDistrictHitboxesRef.current[i];
          if (sx >= b.x1 && sx <= b.x2 && sy >= b.y1 && sy <= b.y2) {
            hitLockedBadge = b;
            break;
          }
        }
      }
      const nextHoveredId = hitLockedBadge ? hitLockedBadge.id : null;
      hoveredDistrictRef.current = nextHoveredId;
      if (prevHoveredRegionRef.current !== nextHoveredId) {
        const mlMap = mlMapRef.current;
        if (mlMap && mlMap.getSource('city-regions-geojson')) {
          try {
            if (prevHoveredRegionRef.current) {
              mlMap.setFeatureState(
                { source: 'city-regions-geojson', id: prevHoveredRegionRef.current },
                { hover: false }
              );
            }
            if (nextHoveredId) {
              mlMap.setFeatureState(
                { source: 'city-regions-geojson', id: nextHoveredId },
                { hover: true }
              );
            }
          } catch {
            // ignore transient style reload
          }
        }
        prevHoveredRegionRef.current = nextHoveredId;
      }
      const hoveringDist = Boolean(hitLockedBadge);
      setIsHoveringDistrict((prev) => (prev === hoveringDist ? prev : hoveringDist));

      if (!hit && tool === 'select' && !isPanningRef.current) {
        let bestRoad: RoadSegment | null = null;
        let bestDist = 10;
        for (const r of simDataRef.current.map.roads) {
          if (!r.isArterial || !r.name) continue;
          const pts =
            r.points && r.points.length >= 2
              ? r.points
              : [
                  { x: r.x1, y: r.y1 },
                  { x: r.x2, y: r.y2 },
                ];
          for (let i = 0; i < pts.length - 1; i++) {
            const p1 = projectWorldToScreen(pts[i].x, pts[i].y);
            const p2 = projectWorldToScreen(pts[i + 1].x, pts[i + 1].y);
            const d = distToSegment(sx, sy, p1.x, p1.y, p2.x, p2.y);
            if (d < bestDist) {
              bestDist = d;
              bestRoad = r;
            }
          }
        }
        hoveredRoadRef.current = bestRoad;
        if (bestRoad) {
          setHoveredRoadTooltip({
            name: bestRoad.name,
            saturationPct: Math.min(120, Math.round(bestRoad.saturation * 100)),
            sx,
            sy,
          });
        } else if (hoveredRoadTooltip) {
          setHoveredRoadTooltip(null);
        }
      } else {
        hoveredRoadRef.current = null;
        if (hoveredRoadTooltip) setHoveredRoadTooltip(null);
      }

      if (isPanningRef.current) {
        const totalDx = e.clientX - panStartRef.current.x;
        const totalDy = e.clientY - panStartRef.current.y;
        if (Math.hypot(totalDx, totalDy) > 4) panStartRef.current.moved = true;

        const stepDx = e.clientX - panStartRef.current.lastX;
        const stepDy = e.clientY - panStartRef.current.lastY;
        panStartRef.current.lastX = e.clientX;
        panStartRef.current.lastY = e.clientY;

        const mlMap = mlMapRef.current;
        if (mlMap && simDataRef.current.map.geoBounds) {
          mlMap.panBy([-stepDx, -stepDy], { animate: false });
        } else {
          cameraRef.current.x = panStartRef.current.camX + totalDx;
          cameraRef.current.y = panStartRef.current.camY + totalDy;
        }
        return;
      }

      // Debounced hover prefetch: automatically warms OSM local streets + Nominatim/Photon for unlocked land
      const geo = simDataRef.current.map.geoBounds;
      if (tool === 'station' && geo && !hitLockedBadge) {
        const ll = worldToLatLon(wx, wy, geo, mapWidth, mapHeight);
        const qKey = `${ll.lat.toFixed(3)}_${ll.lon.toFixed(3)}`;
        if (qKey !== lastPrefetchKeyRef.current) {
          lastPrefetchKeyRef.current = qKey;
          if (hoverPrefetchTimerRef.current) {
            window.clearTimeout(hoverPrefetchTimerRef.current);
          }
          hoverPrefetchTimerRef.current = window.setTimeout(() => {
            const sim = simDataRef.current;
            if (isWaterAt(sim.map, wx, wy).isWater || findLockedDistrictAt(sim.map, wx, wy)) return;
            prefetchReverseGeocodePlace(ll.lat, ll.lon);
            fetchLocalOverpassStreets(ll.lat, ll.lon, geo, mapWidth, mapHeight).then((extraRoads) => {
              if (!extraRoads || extraRoads.length === 0 || simDataRef.current.map !== sim.map) return;
              const existingIds = new Set(sim.map.roads.map((r) => r.id));
              const newOnes = extraRoads.filter((r) => !existingIds.has(r.id));
              if (newOnes.length > 0) {
                sim.map.roads = [...sim.map.roads, ...newOnes];
                const liveMl = mlMapRef.current;
                if (liveMl) {
                  try {
                    syncMapLibreRoadsOnly(liveMl, sim.map, uiRef.current.openMapStyle);
                  } catch {
                    // ignore if style reloading
                  }
                }
              }
            });
          }, 180);
        }
      }
    };

    const handlePointerUp = (e?: React.PointerEvent<HTMLCanvasElement>) => {
      if (selectingSpawn && isPanningRef.current && !panStartRef.current.moved && e && e.button === 0) {
        const { wx, wy } = screenToWorld(e.clientX, e.clientY);
        onSelectSpawnPoint?.(wx, wy);
      } else if (isPanningRef.current && !panStartRef.current.moved && tool === 'select') {
        onSelectStation(null);
      }
      isPanningRef.current = false;
    };

    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const mlMap = mlMapRef.current;
      if (mlMap && simDataRef.current.map.geoBounds) {
        const around = mlMap.unproject([sx, sy]);
        const nextZoom = Math.min(19.5, Math.max(3.2, mlMap.getZoom() + (e.deltaY < 0 ? 0.35 : -0.35)));
        mlMap.zoomTo(nextZoom, { around, duration: 0 });
        return;
      }

      const cam = cameraRef.current;
      const factor = e.deltaY < 0 ? 1.1 : 0.91;
      const nextZoom = Math.min(2.8, Math.max(0.25, cam.zoom * factor));

      cam.x = sx - ((sx - cam.x) / cam.zoom) * nextZoom;
      cam.y = sy - ((sy - cam.y) / cam.zoom) * nextZoom;
      cam.zoom = nextZoom;
    };

    const isDarkMapStyle = openMapStyle === 'esri_dark_gray';

    return (
      <div
        ref={containerRef}
        className={`absolute inset-0 w-full h-full overflow-hidden ${
          hasGeo
            ? isDarkMapStyle
              ? 'bg-[#091322]'
              : 'bg-[#EEF1F4]'
            : isDarkMapStyle
            ? 'bg-[#2B2F35]'
            : 'bg-[#F3F5F8]'
        }`}
        style={{
          perspective: !hasGeo && is25D ? '1400px' : undefined,
        }}
      >
        <div
          className="relative w-full h-full transition-transform duration-300 ease-out origin-center"
          style={{
            transform: !hasGeo && is25D ? 'rotateX(24deg) scale(1.06)' : 'none',
          }}
        >
          {/* MapLibre GL Raster Base or Pure GeoJSON Vector Fallback */}
          <div
            ref={mapContainerRef}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              display: hasGeo ? 'block' : 'none',
              pointerEvents: 'none',
            }}
          />

          {/* Interactive Transit, Trains & Simulation Overlay Canvas */}
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => {
              handlePointerUp();
              hoveredDistrictRef.current = null;
              if (prevHoveredRegionRef.current && mlMapRef.current?.getSource('city-regions-geojson')) {
                try {
                  mlMapRef.current.setFeatureState(
                    { source: 'city-regions-geojson', id: prevHoveredRegionRef.current },
                    { hover: false }
                  );
                } catch {
                  // ignore
                }
              }
              prevHoveredRegionRef.current = null;
              setIsHoveringDistrict(false);
              setHoveredRoadTooltip(null);
            }}
            onWheel={handleWheel}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
            }}
            className={`z-10 block ${
              selectingSpawn
                ? 'cursor-pointer active:cursor-grabbing'
                : isHoveringDistrict
                ? 'cursor-pointer'
                : tool === 'station' || tool === 'track' || tool === 'demolish'
                ? 'cursor-crosshair'
                : 'cursor-grab active:cursor-grabbing'
            }`}
          />
        </div>

        {hoveredRoadTooltip && (
          <div
            className={`pointer-events-none absolute z-20 px-3.5 py-2.5 rounded-lg border shadow-lg min-w-[205px] ${
              isDarkMapStyle
                ? 'bg-[#0B1422]/92 border-white/10 text-slate-100'
                : 'bg-white/97 border-slate-200 text-slate-900'
            }`}
            style={{
              left: Math.min(window.innerWidth - 230, hoveredRoadTooltip.sx + 16),
              top: Math.max(60, hoveredRoadTooltip.sy - 68),
            }}
          >
            <div className="text-xs font-semibold">{hoveredRoadTooltip.name}</div>
            <div
              className={`text-[11px] mt-1 font-mono-tabular ${
                isDarkMapStyle ? 'text-slate-300' : 'text-slate-600'
              }`}
            >
              當前飽和度 (流量/通行能力)：
              <span
                className={
                  hoveredRoadTooltip.saturationPct > 65
                    ? isDarkMapStyle
                      ? 'text-rose-400 font-semibold'
                      : 'text-rose-600 font-semibold'
                    : hoveredRoadTooltip.saturationPct > 40
                    ? isDarkMapStyle
                      ? 'text-amber-300 font-semibold'
                      : 'text-amber-600 font-semibold'
                    : isDarkMapStyle
                    ? 'text-emerald-400 font-semibold'
                    : 'text-emerald-700 font-semibold'
                }
              >
                {hoveredRoadTooltip.saturationPct}%
              </span>
            </div>
            <div className={`text-[10px] mt-0.5 ${isDarkMapStyle ? 'text-slate-500' : 'text-slate-400'}`}>
              點擊地鐵站點可規劃分流路線
            </div>
          </div>
        )}

        {/* Dynamic Scale Bar */}
        <div className="pointer-events-none fixed bottom-7 left-5 z-20 px-1.5">
          <div
            ref={scaleTextRef}
            className={`text-[11px] font-mono-tabular font-semibold mb-1 ${
              isDarkMapStyle ? 'text-slate-200 drop-shadow' : 'text-slate-800'
            }`}
          >
            1 km
          </div>
          <div
            ref={scaleLineRef}
            style={{ width: '96px' }}
            className={`h-1.5 border-l-2 border-r-2 border-b-2 ${
              isDarkMapStyle ? 'border-slate-200/85' : 'border-slate-800/85'
            }`}
          />
        </div>

        {hasGeo && (
          <div
            className={`pointer-events-none fixed bottom-2.5 left-5 z-10 text-[10px] font-mono-tabular ${
              isDarkMapStyle ? 'text-slate-400/80' : 'text-slate-500'
            }`}
          >
            {openMapStyle === 'canvas_vector'
              ? 'Pure GeoJSON Vector Atlas · OpenStreetMap Geography'
              : openMapStyle === 'esri_dark_gray'
              ? 'Tiles © Esri World Dark Gray · Vector © OpenStreetMap / MapLibre GL'
              : 'Tiles © Esri World Light Gray · Vector © OpenStreetMap / MapLibre GL'}
          </div>
        )}
      </div>
    );
  }
);
