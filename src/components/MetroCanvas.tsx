import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  CityMap,
  DifficultyConfig,
  Language,
  LayerVisibility,
  RiverPath,
  RoadSegment,
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
  getDistrictUnlockCost,
  getStationBuildCost,
  isWaterAt,
  pixelsToKm,
} from '../engine/simulation';
import {
  buildCityRiversGeoJson,
  GeoBounds,
  getEsriDarkGrayStyle,
  getPureCanvasGeoStyle,
  haversineKm,
  latLonToWorld,
  normXToLon,
  normYToLat,
  OpenMapStyleId,
  riverPathToPolygonRing,
  worldToLatLon,
} from '../engine/geo';
import { suggestStationName } from '../engine/noise';
import { formatCurrencyWan } from '../i18n/translations';

function getGeoFitBounds(geo: GeoBounds, map?: CityMap): [[number, number], [number, number]] {
  if (map && map.districts.length > 0) {
    let minLat = 90;
    let maxLat = -90;
    let minLon = 180;
    let maxLon = -180;
    let hasPoly = false;
    for (const d of map.districts) {
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
        [minLon - 0.02, minLat - 0.02],
        [maxLon + 0.02, maxLat + 0.02],
      ];
    }
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
  onPlaceStation: (x: number, y: number) => void;
  onInsertStationOnSegment: (segmentId: string, t: number, wx: number, wy: number) => void;
  onSelectStation: (id: string | null) => void;
  onTrackClickStation: (stationId: string) => void;
  onTrackSetWaypoint: (x: number, y: number) => void;
  onDemolishAt: (worldX: number, worldY: number) => void;
  onUnlockDistrict: (districtId: string) => void;
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
 * Cartographic vector canvas fallback — Esri World Dark Gray Base cartographic parity
 */
function buildBaseMapCanvas(map: CityMap): HTMLCanvasElement {
  const off = document.createElement('canvas');
  off.width = map.width;
  off.height = map.height;
  const ctx = off.getContext('2d');
  if (!ctx) return off;

  // 1. Matte dark charcoal-gray cartographic land matching Esri World Dark Gray Base
  ctx.fillStyle = '#2B2F35';
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
      ctx.fillStyle = '#26312E';
      ctx.beginPath();
      ctx.arc(cx, cy, cs * 0.78, 0, Math.PI * 2);
      ctx.fill();
    } else if (density > 65 || cell.zone !== 'none') {
      ctx.fillStyle = density > 480 ? '#363A41' : '#31353C';
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
      ctx.fillStyle = ring === 0 ? '#272B30' : ring === 1 ? '#24282D' : '#21252A';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
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
          data[i] = 22;
          data[i + 1] = 25;
          data[i + 2] = 29;
          data[i + 3] = 255;
        } else if (a >= 88) {
          data[i] = 33;
          data[i + 1] = 37;
          data[i + 2] = 43;
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
    ctx.fillStyle = '#22262C';
    ctx.fill();
    drawSmoothRiver(ctx, rv.points);
    ctx.strokeStyle = '#22262C';
    ctx.lineWidth = rv.width + 6;
    ctx.stroke();
  }

  for (const rv of map.rivers) {
    traceVariableRiverPolygon(ctx, rv, 0);
    ctx.fillStyle = '#16191D';
    ctx.fill();
    drawSmoothRiver(ctx, rv.points);
    ctx.strokeStyle = '#16191D';
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
      ctx.fillStyle = 'rgba(148, 163, 184, 0.36)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(rv.name, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();

  // 6. Multi-tier Esri-style curved street hierarchy (local -> secondary -> arterial -> expressways)
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
  ctx.strokeStyle = 'rgba(78, 84, 93, 0.56)';
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  for (const road of map.roads) {
    const tier = road.tier ?? (road.isArterial ? 'arterial' : road.capacity >= 600 ? 'secondary' : 'local');
    if (tier !== 'local') continue;
    traceRoadPoints(ctx, getPts(road));
  }
  ctx.stroke();

  // Secondary urban avenues
  ctx.strokeStyle = 'rgba(98, 105, 115, 0.72)';
  ctx.lineWidth = 1.65;
  ctx.beginPath();
  for (const road of map.roads) {
    const tier = road.tier ?? (road.isArterial ? 'arterial' : road.capacity >= 600 ? 'secondary' : 'local');
    if (tier !== 'secondary') continue;
    traceRoadPoints(ctx, getPts(road));
  }
  ctx.stroke();

  // Primary arterials: dark casing + mid-gray core
  ctx.strokeStyle = '#1D2025';
  ctx.lineWidth = 3.8;
  ctx.beginPath();
  for (const road of map.roads) {
    const tier = road.tier ?? (road.isArterial ? 'arterial' : 'secondary');
    if (tier !== 'arterial') continue;
    traceRoadPoints(ctx, getPts(road));
  }
  ctx.stroke();

  ctx.strokeStyle = '#6B727D';
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  for (const road of map.roads) {
    const tier = road.tier ?? (road.isArterial ? 'arterial' : 'secondary');
    if (tier !== 'arterial') continue;
    traceRoadPoints(ctx, getPts(road));
  }
  ctx.stroke();

  // Ring roads & expressways: deep casing + bright cartographic slate-gray core + subtle center sheen
  ctx.strokeStyle = '#171A1E';
  ctx.lineWidth = 5.6;
  ctx.beginPath();
  for (const road of map.roads) {
    if (road.tier !== 'highway') continue;
    traceRoadPoints(ctx, getPts(road));
  }
  ctx.stroke();

  ctx.strokeStyle = '#7E8591';
  ctx.lineWidth = 2.7;
  ctx.beginPath();
  for (const road of map.roads) {
    if (road.tier !== 'highway') continue;
    traceRoadPoints(ctx, getPts(road));
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(203, 213, 225, 0.24)';
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  for (const road of map.roads) {
    if (road.tier !== 'highway') continue;
    traceRoadPoints(ctx, getPts(road));
  }
  ctx.stroke();

  ctx.restore();

  return off;
}

/**
 * Adds GeoJSON polygon layers for city rivers (Huangpu, Suzhou Creek, Tamsui, Keelung, etc.)
 * directly inside MapLibre GL as pure vector water polygons when Esri tiles fail or pure canvas mode is selected.
 */
function attachGeoJsonRiversToMapLibre(mlMap: maplibregl.Map, cityMap: CityMap) {
  if (!cityMap.geoBounds) return;
  const geoJson = buildCityRiversGeoJson(cityMap);
  if (geoJson.features.length === 0) return;

  if (!mlMap.getSource('city-rivers-geojson')) {
    mlMap.addSource('city-rivers-geojson', {
      type: 'geojson',
      data: geoJson as unknown as maplibregl.GeoJSONSourceSpecification['data'],
    });
  }
  if (!mlMap.getLayer('city-rivers-casing')) {
    mlMap.addLayer({
      id: 'city-rivers-casing',
      type: 'line',
      source: 'city-rivers-geojson',
      paint: {
        'line-color': '#18385E',
        'line-width': 2.5,
      },
    });
  }
  if (!mlMap.getLayer('city-rivers-fill')) {
    mlMap.addLayer({
      id: 'city-rivers-fill',
      type: 'fill',
      source: 'city-rivers-geojson',
      paint: {
        'fill-color': '#061830',
        'fill-opacity': 0.96,
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
      onPlaceStation,
      onInsertStationOnSegment,
      onSelectStation,
      onTrackClickStation,
      onTrackSetWaypoint,
      onDemolishAt,
      onUnlockDistrict,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mlMapRef = useRef<maplibregl.Map | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const baseMapCanvasRef = useRef<HTMLCanvasElement | null>(null);
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
      { id: string; x1: number; y1: number; x2: number; y2: number }[]
    >([]);
    const hoveredDistrictRef = useRef<string | null>(null);
    const [isHoveringDistrict, setIsHoveringDistrict] = useState(false);
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
      const initialStyle =
        uiRef.current.openMapStyle === 'canvas_vector'
          ? getPureCanvasGeoStyle()
          : getEsriDarkGrayStyle();

      const mlMap = new maplibregl.Map({
        container: mapEl,
        style: initialStyle,
        bounds: getGeoFitBounds(geo, simDataRef.current.map),
        fitBoundsOptions: {
          padding: 28,
          pitch: uiRef.current.is25D ? 44 : 0,
          bearing: uiRef.current.is25D ? -10 : 0,
        },
        minZoom: 7.5,
        maxZoom: 16.0,
        maxPitch: 60,
        interactive: false,
        attributionControl: false,
      });

      let tileErrorCount = 0;
      let switchedToFallback = false;

      mlMap.on('load', () => {
        mlMap.resize();
      });

      mlMap.on('style.load', () => {
        if (pureVectorFallbackRef.current || uiRef.current.openMapStyle === 'canvas_vector') {
          attachGeoJsonRiversToMapLibre(mlMap, simDataRef.current.map);
        }
      });

      mlMap.on('error', () => {
        tileErrorCount += 1;
        if (!switchedToFallback && tileErrorCount >= 3) {
          switchedToFallback = true;
          pureVectorFallbackRef.current = true;
          mlMap.setStyle(getPureCanvasGeoStyle());
        }
      });

      mlMapRef.current = mlMap;

      return () => {
        mlMap.remove();
        mlMapRef.current = null;
      };
    }, [mapSeedKey]);

    // Switch between Esri Dark Gray Base and Pure GeoJSON Vector River style dynamically
    useEffect(() => {
      const mlMap = mlMapRef.current;
      if (!mlMap || !simDataRef.current.map.geoBounds) return;
      if (openMapStyle === 'canvas_vector') {
        pureVectorFallbackRef.current = true;
        mlMap.setStyle(getPureCanvasGeoStyle());
      } else {
        pureVectorFallbackRef.current = false;
        mlMap.setStyle(getEsriDarkGrayStyle());
      }
    }, [openMapStyle]);

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
        baseMapCanvasRef.current = buildBaseMapCanvas(simDataRef.current.map);
      }
    }, [mapSeedKey, mapVersion]);

    useImperativeHandle(ref, () => ({
      zoomBy: (factor: number) => {
        const mlMap = mlMapRef.current;
        if (mlMap && simDataRef.current.map.geoBounds) {
          const nextZ = Math.min(16.0, Math.max(7.5, mlMap.getZoom() + Math.log2(factor)));
          mlMap.easeTo({ zoom: nextZ, duration: 220 });
          return;
        }
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const cam = cameraRef.current;
        const nextZoom = Math.min(2.8, Math.max(0.25, cam.zoom * factor));
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
              16.0,
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

            if (isGeoActive) {
              ctx.clearRect(0, 0, w, h);
            } else {
              ctx.fillStyle = '#2B2F35';
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
              const p0 = proj(st.map.width * 0.5, st.map.height * 0.5);
              const p1 = proj(st.map.width * 0.5 + 100, st.map.height * 0.5);
              pxScale = Math.max(0.14, Math.hypot(p1.x - p0.x, p1.y - p0.y) / 100);
              zoomRatio = Math.pow(2, mlMap.getZoom() - geo.defaultZoom);

              const corners = [
                mlMap.unproject([0, 0]),
                mlMap.unproject([w, 0]),
                mlMap.unproject([0, h]),
                mlMap.unproject([w, h]),
              ].map((ll) => latLonToWorld(ll.lat, ll.lng, geo, st.map.width, st.map.height));
              visMinX = Math.min(...corners.map((c) => c.x)) - 220;
              visMaxX = Math.max(...corners.map((c) => c.x)) + 220;
              visMinY = Math.min(...corners.map((c) => c.y)) - 220;
              visMaxY = Math.max(...corners.map((c) => c.y)) + 220;
            }

            // 1. Non-geo base terrain canvas OR Pure Canvas GeoJSON River Polygon fallback (if Esri fails / offline)
            if (!isGeoActive && baseMapCanvasRef.current) {
              ctx.save();
              ctx.translate(cam.x, cam.y);
              ctx.scale(cam.zoom, cam.zoom);
              ctx.drawImage(baseMapCanvasRef.current, 0, 0);
              ctx.restore();
            } else if (isGeoActive && pureVectorFallbackRef.current) {
              // Pure canvas land silhouette + GeoJSON river & lake polygons (guaranteed 0 watermarks!)
              ctx.save();
              for (const d of st.map.districts) {
                const rings = d.polygons ?? (d.polygon ? [d.polygon] : []);
                for (const ring of rings) {
                  if (ring.length < 3) continue;
                  ctx.beginPath();
                  ring.forEach((pt, idx) => {
                    const sp = proj(pt.x, pt.y);
                    if (idx === 0) ctx.moveTo(sp.x, sp.y);
                    else ctx.lineTo(sp.x, sp.y);
                  });
                  ctx.closePath();
                  ctx.fillStyle = '#1E2530';
                  ctx.fill();
                }
              }
              if (st.map.waterPolygons) {
                for (const lake of st.map.waterPolygons) {
                  if (lake.points.length < 3) continue;
                  ctx.beginPath();
                  lake.points.forEach((pt, idx) => {
                    const sp = proj(pt.x, pt.y);
                    if (idx === 0) ctx.moveTo(sp.x, sp.y);
                    else ctx.lineTo(sp.x, sp.y);
                  });
                  ctx.closePath();
                  ctx.fillStyle = '#091322';
                  ctx.fill();
                }
              }
              ctx.restore();

              for (const rv of st.map.rivers) {
                if (rv.skipPolylineWaterCheck) {
                  const mid = rv.points[Math.floor(rv.points.length / 2)];
                  if (mid) {
                    const msp = proj(mid.x, mid.y);
                    ctx.save();
                    ctx.font = '500 12px "Noto Sans TC", sans-serif';
                    ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(rv.name, msp.x, msp.y);
                    ctx.restore();
                  }
                  continue;
                }
                const poly = riverPathToPolygonRing(rv);
                if (poly.length >= 4) {
                  ctx.save();
                  ctx.beginPath();
                  poly.forEach((pt, idx) => {
                    const sp = proj(pt.x, pt.y);
                    if (idx === 0) ctx.moveTo(sp.x, sp.y);
                    else ctx.lineTo(sp.x, sp.y);
                  });
                  ctx.closePath();
                  ctx.fillStyle = 'rgba(11, 20, 34, 0.96)';
                  ctx.fill();
                  ctx.strokeStyle = 'rgba(34, 48, 68, 0.9)';
                  ctx.lineWidth = 1.5;
                  ctx.stroke();

                  const mid = rv.points[Math.floor(rv.points.length / 2)];
                  const msp = proj(mid.x, mid.y);
                  ctx.font = '500 12px "Noto Sans TC", sans-serif';
                  ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(rv.name, msp.x, msp.y);
                  ctx.restore();
                }
              }

              // Draw Overpass real streets cleanly on fallback dark background
              ctx.save();
              ctx.strokeStyle = 'rgba(98, 105, 115, 0.55)';
              ctx.lineWidth = 1.4;
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
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
              }
              ctx.restore();
            }

            // 2. Smooth Soft Radial Population / Metro Coverage / Zoning Overlays (zero checkerboard dot grid)
            if (
              st.layers.populationHeatmap ||
              st.layers.zones ||
              st.layers.metroCoverageOverlay
            ) {
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

                if (st.layers.populationHeatmap) {
                  const density = Math.min(1, (cell.population + cell.jobs) / 900);
                  if (density > 0.2) {
                    const rgb = cell.jobs > cell.population ? '251, 146, 60' : '244, 63, 94';
                    const alpha = cell.jobs > cell.population ? density * 0.14 : density * 0.11;
                    drawSoftGlow(p.x, p.y, cs * 1.3 * pxScale, `rgba(${rgb}, ${alpha})`, `rgba(${rgb}, 0)`);
                  }
                }

                if (st.layers.metroCoverageOverlay) {
                  const demandWeight = cell.population + cell.jobs;
                  if (cell.coveredByMetro) {
                    drawSoftGlow(p.x, p.y, cs * 1.2 * pxScale, 'rgba(16, 185, 129, 0.17)', 'rgba(16, 185, 129, 0)');
                  } else if (demandWeight > 180) {
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
                  ctx.strokeStyle = 'rgba(255, 255, 255, 0.055)';
                  for (const b of st.map.buildings) {
                    if (b.x + b.w < visMinX || b.x > visMaxX || b.y + b.d < visMinY || b.y > visMaxY) {
                      continue;
                    }
                    ctx.save();
                    ctx.translate(b.x + b.w * 0.5, b.y + b.d * 0.5);
                    if (b.angle) ctx.rotate(b.angle);
                    ctx.fillStyle =
                      b.kind === 'landmark'
                        ? 'rgba(72, 78, 88, 0.72)'
                        : b.kind === 'cbd'
                        ? 'rgba(62, 67, 76, 0.66)'
                        : 'rgba(54, 58, 66, 0.58)';
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

                  ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
                  ctx.fillRect(b.x + 3, b.y + 3, b.w, b.d);

                  ctx.fillStyle =
                    b.kind === 'landmark'
                      ? '#3A4352'
                      : b.kind === 'cbd'
                      ? '#333A46'
                      : b.kind === 'ind'
                      ? '#2D323B'
                      : '#2B3038';
                  ctx.beginPath();
                  ctx.moveTo(b.x, b.y + b.d);
                  ctx.lineTo(b.x + b.w, b.y + b.d);
                  ctx.lineTo(b.x + b.w + ox, b.y + b.d + oy);
                  ctx.lineTo(b.x + ox, b.y + b.d + oy);
                  ctx.closePath();
                  ctx.fill();

                  ctx.fillStyle =
                    b.kind === 'landmark' ? '#4C5667' : b.kind === 'cbd' ? '#414856' : '#373D47';
                  ctx.fillRect(b.x + ox, b.y + oy, b.w, b.d);
                  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
                  ctx.lineWidth = 0.6;
                  ctx.strokeRect(b.x + ox, b.y + oy, b.w, b.d);
                }
              }
              ctx.restore();
            } else if (st.is25D && zoomRatio > 0.7) {
              ctx.save();
              ctx.globalAlpha = 0.72;
              for (const b of st.map.buildings) {
                if (b.x < visMinX || b.x > visMaxX || b.y < visMinY || b.y > visMaxY) continue;
                const sp = proj(b.x, b.y);
                if (sp.x < -30 || sp.x > w + 30 || sp.y < -30 || sp.y > h + 30) continue;
                const bw = Math.max(3, b.w * pxScale);
                const bd = Math.max(3, b.d * pxScale);
                const bh = b.h * 0.48 * pxScale;
                ctx.fillStyle = b.kind === 'cbd' ? '#333A46' : '#2B3038';
                ctx.fillRect(sp.x, sp.y - bh, bw, bd + bh);
                ctx.fillStyle = b.kind === 'cbd' ? '#414856' : '#373D47';
                ctx.fillRect(sp.x, sp.y - bh, bw, bd);
              }
              ctx.restore();
            }

            // 5. Administrative District Polygons (Darkened Locked Regions, Borders & Unlock Badges)
            const nextLockedHitboxes: {
              id: string;
              x1: number;
              y1: number;
              x2: number;
              y2: number;
            }[] = [];

            // 5A. Darken entire locked district polygons + draw district administrative boundaries
            for (const d of st.map.districts) {
              const rings = d.polygons ?? (d.polygon ? [d.polygon] : []);
              if (rings.length === 0) continue;

              const isHovered = hoveredDistrictRef.current === d.id;
              ctx.save();
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

              if (!d.unlocked) {
                ctx.fillStyle = isHovered
                  ? 'rgba(18, 24, 34, 0.44)'
                  : 'rgba(4, 7, 13, 0.62)';
                ctx.fill();
              }

              ctx.setLineDash(isHovered ? [] : [7, 5]);
              ctx.strokeStyle = !d.unlocked
                ? isHovered
                  ? 'rgba(251, 191, 36, 0.78)'
                  : 'rgba(148, 163, 184, 0.24)'
                : d.isStarter
                ? 'rgba(148, 163, 184, 0.26)'
                : 'rgba(56, 189, 248, 0.28)';
              ctx.lineWidth = isHovered ? 1.7 : 1.05;
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.restore();
            }

            // 5B. District Labels, Starting Spawn Tags & Clickable Unlock Badges
            for (const d of st.map.districts) {
              const p = proj(d.x, d.y);
              if (p.x < -220 || p.x > w + 220 || p.y < -220 || p.y > h + 220) continue;
              ctx.save();

              if (d.unlocked) {
                const fontSize = zoomRatio < 0.55 ? 10.5 : 12.5;
                ctx.font = `600 ${fontSize}px "Noto Sans TC", "Plus Jakarta Sans", sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.lineWidth = 3;
                ctx.strokeStyle = 'rgba(6, 11, 20, 0.85)';
                ctx.strokeText(d.name, p.x, p.y);
                ctx.fillStyle = d.isStarter
                  ? 'rgba(226, 232, 240, 0.88)'
                  : 'rgba(186, 230, 253, 0.86)';
                ctx.fillText(d.name, p.x, p.y);

                if (d.isStarter && zoomRatio >= 0.65) {
                  ctx.font = '500 9.5px "Noto Sans TC", sans-serif';
                  ctx.strokeStyle = 'rgba(6, 11, 20, 0.85)';
                  ctx.lineWidth = 2.5;
                  ctx.strokeText('開局出生點', p.x, p.y + 13);
                  ctx.fillStyle = 'rgba(110, 231, 183, 0.82)';
                  ctx.fillText('開局出生點', p.x, p.y + 13);
                }
              } else {
                const unlockCost = getDistrictUnlockCost(d, ui.difficulty);
                const label =
                  zoomRatio < 0.52
                    ? `🔒 ${d.name} · ${formatCurrencyWan(unlockCost, ui.lang)}`
                    : `🔒 ${d.name} · ${formatCurrencyWan(unlockCost, ui.lang)} 解鎖`;
                ctx.font = zoomRatio < 0.52 ? '500 10px "Noto Sans TC", sans-serif' : '500 11px "Noto Sans TC", sans-serif';
                const tw = ctx.measureText(label).width + (zoomRatio < 0.52 ? 14 : 18);
                const bh = zoomRatio < 0.52 ? 22 : 26;
                const bx = p.x - tw / 2;
                const by = p.y - bh / 2;
                const isHovered = hoveredDistrictRef.current === d.id;
                nextLockedHitboxes.push({ id: d.id, x1: bx, y1: by, x2: bx + tw, y2: by + bh });

                ctx.fillStyle = isHovered
                  ? 'rgba(120, 53, 15, 0.92)'
                  : 'rgba(9, 15, 26, 0.88)';
                ctx.beginPath();
                ctx.roundRect(bx, by, tw, bh, 6);
                ctx.fill();
                ctx.strokeStyle = isHovered
                  ? 'rgba(251, 191, 36, 0.9)'
                  : 'rgba(251, 191, 36, 0.36)';
                ctx.lineWidth = isHovered ? 1.4 : 1;
                ctx.stroke();
                ctx.fillStyle = isHovered
                  ? 'rgba(254, 243, 199, 0.98)'
                  : 'rgba(226, 232, 240, 0.9)';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, p.x, p.y);
              }
              ctx.restore();
            }
            lockedDistrictHitboxesRef.current = nextLockedHitboxes;

            // 5.5 Real City POIs & Landmarks (◆ markers)
            if (st.map.pois && st.map.pois.length > 0 && zoomRatio > 0.5) {
              for (const poi of st.map.pois) {
                const p = proj(poi.x, poi.y);
                if (p.x < -50 || p.x > w + 50 || p.y < -50 || p.y > h + 50) continue;
                ctx.save();
                ctx.translate(p.x, p.y);
                const diamondColor =
                  poi.kind === 'hospital'
                    ? '#F43F5E'
                    : poi.kind === 'airport' || poi.kind === 'rail'
                    ? '#38BDF8'
                    : poi.kind === 'park'
                    ? '#10B981'
                    : '#F59E0B';
                ctx.fillStyle = diamondColor;
                ctx.beginPath();
                ctx.moveTo(0, -4.5);
                ctx.lineTo(4.5, 0);
                ctx.lineTo(0, 4.5);
                ctx.lineTo(-4.5, 0);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = '#07101D';
                ctx.lineWidth = 1;
                ctx.stroke();

                if (zoomRatio > 0.72) {
                  ctx.font = '500 10.5px "Noto Sans TC", "Noto Sans SC", sans-serif';
                  ctx.fillStyle = 'rgba(226, 232, 240, 0.84)';
                  ctx.textAlign = 'left';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(poi.name, 7, 0);
                }
                ctx.restore();
              }
            }

            // 6. Station Catchment Rings
            if (st.layers.catchmentRings) {
              for (const station of st.stations) {
                const p = proj(station.x, station.y);
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

                const curveSamples = 12;
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

                ctx.save();
                ctx.globalAlpha = dimmed ? 0.14 : seg?.isDraft ? 0.78 : 1;
                ctx.shadowColor = line.color;
                ctx.shadowBlur = line.id === st.activeLineId ? 10 : 6;
                if (seg?.isDraft) ctx.setLineDash([8, 6]);

                ctx.beginPath();
                screenPts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
                ctx.strokeStyle = line.color;
                ctx.lineWidth = (line.id === st.activeLineId ? 4.8 : 3.8) * Math.min(1.35, Math.max(0.8, zoomRatio * 0.9));
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.shadowBlur = 0;

                if (seg?.isUnderwater) {
                  ctx.setLineDash([6, 6]);
                  ctx.strokeStyle = 'rgba(224, 242, 254, 0.6)';
                  ctx.lineWidth = 1.4;
                  ctx.stroke();
                  ctx.setLineDash([]);
                } else if (line.serviceMode === 'express') {
                  ctx.setLineDash([10, 8]);
                  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
                  ctx.lineWidth = 1.5;
                  ctx.stroke();
                  ctx.setLineDash([]);
                }

                if ((zoomRatio > 0.85 || st.layers.depthFilter !== 'ALL') && seg && !dimmed) {
                  const mid = screenPts[Math.floor(screenPts.length / 2)];
                  ctx.fillStyle = 'rgba(9, 15, 28, 0.92)';
                  ctx.beginPath();
                  ctx.roundRect(mid.x - 12, mid.y - 8, 24, 15, 3);
                  ctx.fill();
                  ctx.strokeStyle = line.color;
                  ctx.lineWidth = 0.9;
                  ctx.stroke();
                  ctx.fillStyle = '#E2E8F0';
                  ctx.font = '600 9px "JetBrains Mono", monospace';
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
                ctx.save();
                ctx.beginPath();
                for (let s = 0; s <= 12; s++) {
                  const pW = evalQuadraticBezier(startSt.x, startSt.y, ctrlX, ctrlY, endX, endY, s / 12);
                  const sp = proj(pW.x, pW.y);
                  if (s === 0) ctx.moveTo(sp.x, sp.y);
                  else ctx.lineTo(sp.x, sp.y);
                }
                ctx.setLineDash([8, 6]);
                ctx.strokeStyle = activeLine ? activeLine.color : '#38BDF8';
                ctx.lineWidth = 4;
                ctx.stroke();
                ctx.setLineDash([]);

                if (st.trackWaypoint) {
                  const cp = proj(ctrlX, ctrlY);
                  ctx.beginPath();
                  ctx.arc(cp.x, cp.y, 5, 0, Math.PI * 2);
                  ctx.fillStyle = '#FACC15';
                  ctx.fill();
                }
                ctx.restore();
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

                ctx.save();
                ctx.translate(sp.x, sp.y);
                ctx.rotate(screenAngle);

                const trainLen = Math.min(26, 11 + line.carCount * 1.4);
                const trainW = 6.8;

                ctx.shadowColor = line.color;
                ctx.shadowBlur = 8;
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.roundRect(-trainLen / 2, -trainW / 2, trainLen, trainW, 3);
                ctx.fill();
                ctx.shadowBlur = 0;

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

              if (zoomRatio > 0.62 || isSelected || isHovered || servingLines.length >= 2 || station.isDraft) {
                ctx.font = '500 10.5px "Noto Sans TC", "Plus Jakarta Sans", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                const labelY = sy + rad + 4;
                const displayName = station.isDraft ? `${station.name} *` : station.name;
                const metrics = ctx.measureText(displayName);
                const labelW = metrics.width + 10;
                ctx.fillStyle = station.isDraft
                  ? 'rgba(14, 116, 144, 0.85)'
                  : 'rgba(7, 15, 28, 0.88)';
                ctx.beginPath();
                ctx.roundRect(sx - labelW / 2, labelY - 1, labelW, 16, 4);
                ctx.fill();

                ctx.fillStyle = '#E2E8F0';
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
                    true
                  );
                  const km = pixelsToKm(info.length, st.map).toFixed(2);
                  const crossingTag = info.isUnderwater
                    ? ' · 潛盾過江'
                    : info.isBridge
                    ? ' · 跨河橋'
                    : '';
                  badgeText = `${st.activeDepth} (${km} km)${crossingTag} · ${formatCurrencyWan(
                    info.cost,
                    st.lang
                  )}`;
                }
              }

              if (badgeText) {
                ctx.font = '500 11px "Noto Sans TC", "JetBrains Mono", sans-serif';
                const tw = ctx.measureText(badgeText).width + 18;
                const bx = Math.min(w - tw - 12, hw.screenX + 18);
                const by = Math.max(76, hw.screenY - 30);
                ctx.fillStyle = isBlockedTooltip ? 'rgba(69, 10, 24, 0.94)' : 'rgba(11, 20, 34, 0.92)';
                ctx.beginPath();
                ctx.roundRect(bx, by, tw, 26, 8);
                ctx.fill();
                ctx.strokeStyle = isBlockedTooltip
                  ? 'rgba(244, 63, 94, 0.72)'
                  : 'rgba(56, 189, 248, 0.25)';
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.fillStyle = isBlockedTooltip ? '#FECDD3' : '#F1F5F9';
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
                kmPerScreenPx = Math.max(0.0001, haversineKm(ll1.lat, ll1.lng, ll2.lat, ll2.lng) / 100);
              } else {
                kmPerScreenPx = Math.max(0.0001, pixelsToKm(1, st.map) / cam.zoom);
              }
              const rawKm = 96 * kmPerScreenPx;
              const niceStepsKm = [0.2, 0.5, 1, 2, 5, 10, 20];
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

      let hitLockedBadge: { id: string; x1: number; y1: number; x2: number; y2: number } | undefined;
      for (let i = lockedDistrictHitboxesRef.current.length - 1; i >= 0; i--) {
        const b = lockedDistrictHitboxesRef.current[i];
        if (sx >= b.x1 && sx <= b.x2 && sy >= b.y1 && sy <= b.y2) {
          hitLockedBadge = b;
          break;
        }
      }
      if (hitLockedBadge && (tool === 'select' || tool === 'station' || tool === 'track')) {
        onUnlockDistrict(hitLockedBadge.id);
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
          const p0 = projectWorldToScreen(mapWidth * 0.5, mapHeight * 0.5);
          const p1 = projectWorldToScreen(mapWidth * 0.5 + 100, mapHeight * 0.5);
          const pxScale = Math.max(0.2, Math.hypot(p1.x - p0.x, p1.y - p0.y) / 100);
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
      hoveredDistrictRef.current = hitLockedBadge ? hitLockedBadge.id : null;
      const hoveringDist = Boolean(hitLockedBadge);
      setIsHoveringDistrict((prev) => (prev === hoveringDist ? prev : hoveringDist));

      if (!hit && tool === 'select' && !isPanningRef.current) {
        let bestRoad: RoadSegment | null = null;
        let bestDist = 10;
        for (const r of simDataRef.current.map.roads) {
          if (!r.isArterial) continue;
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
    };

    const handlePointerUp = () => {
      if (isPanningRef.current && !panStartRef.current.moved && tool === 'select') {
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
        const nextZoom = Math.min(16.0, Math.max(7.5, mlMap.getZoom() + (e.deltaY < 0 ? 0.35 : -0.35)));
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

    return (
      <div
        ref={containerRef}
        className={`absolute inset-0 w-full h-full overflow-hidden ${hasGeo ? 'bg-[#091322]' : 'bg-[#2B2F35]'}`}
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
          {/* MapLibre GL Raster Base (Esri World Dark Gray Base) or Pure GeoJSON Vector River Fallback */}
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
              isHoveringDistrict
                ? 'cursor-pointer'
                : tool === 'station' || tool === 'track' || tool === 'demolish'
                ? 'cursor-crosshair'
                : 'cursor-grab active:cursor-grabbing'
            }`}
          />
        </div>

        {hoveredRoadTooltip && (
          <div
            className="pointer-events-none absolute z-20 px-3.5 py-2.5 rounded-xl bg-[#0B1422]/90 backdrop-blur-xl border border-white/10 shadow-2xl min-w-[205px]"
            style={{
              left: Math.min(window.innerWidth - 230, hoveredRoadTooltip.sx + 16),
              top: Math.max(76, hoveredRoadTooltip.sy - 68),
            }}
          >
            <div className="text-xs font-semibold text-slate-100">{hoveredRoadTooltip.name}</div>
            <div className="text-[11px] text-slate-300 mt-1 font-mono-tabular">
              當前飽和度 (流量/通行能力)：
              <span
                className={
                  hoveredRoadTooltip.saturationPct > 65
                    ? 'text-rose-400 font-semibold'
                    : hoveredRoadTooltip.saturationPct > 40
                    ? 'text-amber-300 font-semibold'
                    : 'text-emerald-400 font-semibold'
                }
              >
                {hoveredRoadTooltip.saturationPct}%
              </span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">點擊地鐵站點可規劃分流路線</div>
          </div>
        )}

        {/* Dynamic Scale Bar */}
        <div className="pointer-events-none fixed bottom-7 left-20 z-20 px-1.5">
          <div
            ref={scaleTextRef}
            className="text-[11px] font-mono-tabular font-semibold text-slate-200 mb-1 drop-shadow"
          >
            1 km
          </div>
          <div
            ref={scaleLineRef}
            style={{ width: '96px' }}
            className="h-1.5 border-l-2 border-r-2 border-b-2 border-slate-200/85"
          />
        </div>

        {hasGeo && (
          <div className="pointer-events-none fixed bottom-2.5 left-20 z-10 text-[10px] text-slate-400/80 font-mono-tabular">
            Tiles © Esri World Dark Gray · Vector © OpenStreetMap / MapLibre GL
          </div>
        )}
      </div>
    );
  }
);
