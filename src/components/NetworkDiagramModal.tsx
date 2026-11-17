import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Play,
  Pause,
  Plus,
  Minus,
  Maximize2,
  Download,
} from 'lucide-react';
import {
  CityMap,
  HistorySnapshot,
  Language,
  Station,
  TrackSegment,
  TransitLine,
} from '../types/game';
import { pixelsToKm } from '../engine/simulation';
import { t } from '../i18n/translations';

interface NetworkDiagramModalProps {
  open: boolean;
  onClose: () => void;
  lang: Language;
  map: CityMap;
  year: number;
  day: number;
  stations: Station[];
  segments: TrackSegment[];
  lines: TransitLine[];
  history: HistorySnapshot[];
}

export const NetworkDiagramModal: React.FC<NetworkDiagramModalProps> = ({
  open,
  onClose,
  lang,
  map,
  year,
  day,
  stations,
  segments,
  lines,
  history,
}) => {
  const [viewMode, setViewMode] = useState<'geo' | 'schematic'>('geo');
  const [includeDrafts, setIncludeDrafts] = useState(true);
  const [highlightedLineId, setHighlightedLineId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ active: boolean; sx: number; sy: number; px: number; py: number }>({
    active: false,
    sx: 0,
    sy: 0,
    px: 0,
    py: 0,
  });

  const activeData = useMemo(() => {
    if (replayIndex !== null && history[replayIndex]) {
      const snap = history[replayIndex].topologyPreview;
      return {
        stations: snap.stations.map((s) => ({
          id: s.id,
          name: s.name,
          x: s.x,
          y: s.y,
          isHub: s.isHub,
          elevationMode: 'underground' as const,
        })),
        lines: snap.lines,
        label: history[replayIndex].label,
      };
    }
    const filteredStations = stations.filter((s) => includeDrafts || !s.isDraft);
    const stationSet = new Set(filteredStations.map((s) => s.id));
    const filteredLines = lines
      .filter((l) => (includeDrafts || !l.isDraft) && l.stationIds.filter((id) => stationSet.has(id)).length >= 2)
      .map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
        stationIds: l.stationIds.filter((id) => stationSet.has(id)),
      }));

    return {
      stations: filteredStations.map((s) => ({
        id: s.id,
        name: s.name,
        x: s.x,
        y: s.y,
        isHub: s.size === 'hub' || s.size === 'mall',
        elevationMode: s.elevationMode,
      })),
      lines: filteredLines,
      label: `${year}/${Math.min(12, Math.floor((day - 1) / 30) + 1)}`,
    };
  }, [replayIndex, history, stations, lines, includeDrafts, year, day]);

  // Compute octilinear schematic positions by snapping station coordinates onto a clean 48px schematic lattice
  const schematicPositions = useMemo(() => {
    const mapPos = new Map<string, { x: number; y: number }>();
    if (activeData.stations.length === 0) return mapPos;
    const minX = Math.min(...activeData.stations.map((s) => s.x));
    const maxX = Math.max(...activeData.stations.map((s) => s.x));
    const minY = Math.min(...activeData.stations.map((s) => s.y));
    const maxY = Math.max(...activeData.stations.map((s) => s.y));
    const spanX = Math.max(100, maxX - minX);
    const spanY = Math.max(100, maxY - minY);

    for (const s of activeData.stations) {
      if (viewMode === 'geo') {
        mapPos.set(s.id, { x: s.x, y: s.y });
      } else {
        // Snap onto octilinear metro-map grid inside map bounds
        const gx = Math.round(((s.x - minX) / spanX) * 18) * 95 + map.width * 0.16;
        const gy = Math.round(((s.y - minY) / spanY) * 12) * 85 + map.height * 0.16;
        mapPos.set(s.id, { x: gx, y: gy });
      }
    }
    return mapPos;
  }, [activeData.stations, viewMode, map.width, map.height]);

  const lineMetrics = useMemo(() => {
    const segMap = new Map<string, TrackSegment>();
    for (const seg of segments) {
      segMap.set(`${seg.fromStationId}_${seg.toStationId}`, seg);
      segMap.set(`${seg.toStationId}_${seg.fromStationId}`, seg);
    }
    const stMap = new Map(stations.map((s) => [s.id, s]));
    let totalKm = 0;

    const perLine = activeData.lines.map((l) => {
      let pxLen = 0;
      for (let i = 0; i < l.stationIds.length - 1; i++) {
        const a = l.stationIds[i];
        const b = l.stationIds[i + 1];
        const seg = segMap.get(`${a}_${b}`);
        if (seg) {
          pxLen += seg.length;
        } else {
          const sA = stMap.get(a);
          const sB = stMap.get(b);
          if (sA && sB) pxLen += Math.hypot(sB.x - sA.x, sB.y - sA.y);
        }
      }
      const km = pixelsToKm(pxLen, map);
      totalKm += km;
      return { ...l, count: l.stationIds.length, km };
    });

    return { perLine, totalKm };
  }, [activeData.lines, segments, stations, map]);

  // Growth Replay timer
  useEffect(() => {
    if (!isReplaying || history.length === 0) return;
    const timer = setInterval(() => {
      setReplayIndex((prev) => {
        if (prev === null) return 0;
        if (prev >= history.length - 1) {
          setIsReplaying(false);
          return null;
        }
        return prev + 1;
      });
    }, 900);
    return () => clearInterval(timer);
  }, [isReplaying, history.length]);

  // Render Network Canvas
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = viewMode === 'schematic' ? '#0B121D' : '#101824';
    ctx.fillRect(0, 0, rect.width, rect.height);

    const baseScale = Math.min(rect.width / map.width, rect.height / map.height) * 0.92 * zoom;
    const ox = (rect.width - map.width * baseScale) / 2 + pan.x;
    const oy = (rect.height - map.height * baseScale) / 2 + pan.y;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(baseScale, baseScale);

    // Subtle schematic grid or geographic rivers & roads
    if (viewMode === 'schematic') {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.04)';
      ctx.lineWidth = 1;
      for (let x = 0; x < map.width; x += 95) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, map.height);
        ctx.stroke();
      }
      for (let y = 0; y < map.height; y += 85) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(map.width, y);
        ctx.stroke();
      }
    } else {
      // Water rivers
      for (const rv of map.rivers) {
        if (rv.points.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(rv.points[0].x, rv.points[0].y);
        for (let i = 1; i < rv.points.length; i++) {
          ctx.lineTo(rv.points[i].x, rv.points[i].y);
        }
        ctx.strokeStyle = 'rgba(30, 74, 108, 0.55)';
        ctx.lineWidth = rv.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
      // Subtle roads
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
      ctx.lineWidth = 1.4;
      for (const rd of map.roads) {
        if (!rd.isArterial) continue;
        ctx.beginPath();
        ctx.moveTo(rd.x1, rd.y1);
        ctx.lineTo(rd.x2, rd.y2);
        ctx.stroke();
      }
    }

    // Draw lines
    const stServeCount = new Map<string, number>();
    for (const l of activeData.lines) {
      for (const sid of l.stationIds) {
        stServeCount.set(sid, (stServeCount.get(sid) ?? 0) + 1);
      }
    }

    for (const line of activeData.lines) {
      const dimmed = highlightedLineId && highlightedLineId !== line.id;
      ctx.save();
      ctx.globalAlpha = dimmed ? 0.18 : 1;
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 7 / Math.max(0.5, zoom);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      let started = false;
      for (let i = 0; i < line.stationIds.length; i++) {
        const pt = schematicPositions.get(line.stationIds[i]);
        if (!pt) continue;
        if (!started) {
          ctx.moveTo(pt.x, pt.y);
          started = true;
        } else if (viewMode === 'schematic') {
          // Octilinear 45-degree elbow connector
          const prev = schematicPositions.get(line.stationIds[i - 1]);
          if (prev) {
            const dx = pt.x - prev.x;
            const dy = pt.y - prev.y;
            const adx = Math.abs(dx);
            const ady = Math.abs(dy);
            const diag = Math.min(adx, ady);
            const midX = prev.x + Math.sign(dx) * diag;
            const midY = prev.y + Math.sign(dy) * diag;
            ctx.lineTo(midX, midY);
            ctx.lineTo(pt.x, pt.y);
          } else {
            ctx.lineTo(pt.x, pt.y);
          }
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    // Draw station nodes & clean labels
    for (const st of activeData.stations) {
      const pt = schematicPositions.get(st.id);
      if (!pt) continue;
      const isTransfer = (stServeCount.get(st.id) ?? 0) >= 2 || st.isHub;
      const r = isTransfer ? 9 : 6;

      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (isTransfer) {
        ctx.fillStyle = '#0F172A';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (zoom >= 0.75 || isTransfer) {
        ctx.font = '600 13px "Noto Sans TC", "Noto Sans SC", sans-serif';
        ctx.fillStyle = 'rgba(241, 245, 249, 0.9)';
        ctx.textAlign = 'center';
        ctx.fillText(st.name, pt.x, pt.y - r - 6);
      }
    }

    ctx.restore();
  }, [open, viewMode, activeData, schematicPositions, zoom, pan, highlightedLineId, map]);

  if (!open) return null;

  const handleExportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `metroforge-network-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0A111D] flex flex-col">
      {/* Top Bar */}
      <div className="px-6 py-3.5 bg-[#0F1726]/95 border-b border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-100">
              {map.name} · {t(lang, 'networkMap')}
            </h2>
            <div className="text-xs text-slate-400 font-mono-tabular">
              {activeData.label} · {activeData.lines.length} {t(lang, 'lines')} ·{' '}
              {activeData.stations.length} {t(lang, 'stations')} · {lineMetrics.totalKm.toFixed(1)} km
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950 border border-white/10">
            <button
              onClick={() => setViewMode('geo')}
              className={`px-3 py-1 text-xs rounded-lg font-medium ${
                viewMode === 'geo' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t(lang, 'geoNetwork')}
            </button>
            <button
              onClick={() => setViewMode('schematic')}
              className={`px-3 py-1 text-xs rounded-lg font-medium ${
                viewMode === 'schematic' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t(lang, 'schematicMap')}
            </button>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950 border border-white/10">
            <button
              onClick={() => setIncludeDrafts(false)}
              className={`px-3 py-1 text-xs rounded-lg font-medium ${
                !includeDrafts ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t(lang, 'officialNetwork')}
            </button>
            <button
              onClick={() => setIncludeDrafts(true)}
              className={`px-3 py-1 text-xs rounded-lg font-medium ${
                includeDrafts ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t(lang, 'withDraft')}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (history.length > 0) {
                if (isReplaying) {
                  setIsReplaying(false);
                } else {
                  setReplayIndex(0);
                  setIsReplaying(true);
                }
              }
            }}
            disabled={history.length === 0}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-slate-100 flex items-center gap-1.5 disabled:opacity-40"
          >
            {isReplaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{t(lang, 'growthReplay')}</span>
          </button>

          <div className="flex items-center bg-white/8 rounded-xl border border-white/10">
            <button
              onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
              className="p-1.5 text-slate-300 hover:text-white"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(0.5, z / 1.2))}
              className="p-1.5 text-slate-300 hover:text-white"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="p-1.5 text-slate-300 hover:text-white"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleExportPng}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-slate-100 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t(lang, 'exportPng')}</span>
          </button>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Interactive Diagram Canvas */}
      <div className="relative flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          onPointerDown={(e) => {
            dragRef.current = {
              active: true,
              sx: e.clientX,
              sy: e.clientY,
              px: pan.x,
              py: pan.y,
            };
          }}
          onPointerMove={(e) => {
            if (!dragRef.current.active) return;
            setPan({
              x: dragRef.current.px + (e.clientX - dragRef.current.sx),
              y: dragRef.current.py + (e.clientY - dragRef.current.sy),
            });
          }}
          onPointerUp={() => {
            dragRef.current.active = false;
          }}
          onWheel={(e) => {
            setZoom((z) => Math.min(3, Math.max(0.5, z * (e.deltaY < 0 ? 1.1 : 0.9))));
          }}
          className="w-full h-full block cursor-grab active:cursor-grabbing"
        />

        {/* Line Chips Filter Strip */}
        <div className="absolute top-4 left-4 flex flex-wrap items-center gap-2 max-w-[85vw]">
          {lineMetrics.perLine.map((l) => (
            <button
              key={l.id}
              onClick={() => setHighlightedLineId((prev) => (prev === l.id ? null : l.id))}
              className={`px-3 py-1.5 rounded-full backdrop-blur-xl border text-xs font-medium flex items-center gap-2 transition-colors ${
                highlightedLineId === l.id
                  ? 'bg-white/20 border-sky-400 text-white'
                  : 'bg-[#0B1422]/85 border-white/12 text-slate-200 hover:border-white/30'
              }`}
            >
              <span className="w-3 h-1.5 rounded-full" style={{ backgroundColor: l.color }} />
              <span>{l.name}</span>
              <span className="font-mono-tabular text-slate-400">
                {l.count}
                {lang === 'en' ? 'st' : '站'} · {l.km.toFixed(1)} km
              </span>
            </button>
          ))}
        </div>

        {/* Replay Timeline Scrubber when active */}
        {replayIndex !== null && history.length > 0 && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-[#0B1422]/90 backdrop-blur-xl border border-white/15 rounded-2xl px-4 py-2.5 flex items-center gap-3 w-[min(460px,90vw)]">
            <span className="text-xs font-mono-tabular text-sky-300 whitespace-nowrap">
              {history[replayIndex]?.label}
            </span>
            <input
              type="range"
              min={0}
              max={history.length - 1}
              value={replayIndex}
              onChange={(e) => {
                setIsReplaying(false);
                setReplayIndex(Number(e.target.value));
              }}
              className="flex-1 accent-sky-400"
            />
            <button
              onClick={() => {
                setIsReplaying(false);
                setReplayIndex(null);
              }}
              className="text-xs text-slate-300 hover:text-white whitespace-nowrap"
            >
              {lang === 'en' ? 'Exit' : '退出回放'}
            </button>
          </div>
        )}

        {/* Bottom Legend */}
        <div className="absolute bottom-4 left-4 bg-[#0B1422]/85 backdrop-blur-xl border border-white/10 rounded-full px-4 py-1.5 flex flex-wrap items-center gap-4 text-[11px] text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-1 bg-slate-200 rounded-full" />
            <span>{t(lang, 'legendUnderground')}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-1 border-b-2 border-dashed border-slate-200" />
            <span>{t(lang, 'legendElevated')}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-1 border-b-2 border-dotted border-slate-200" />
            <span>{t(lang, 'legendGround')}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-white border-2 border-slate-900 inline-block" />
            <span>{t(lang, 'legendTransfer')}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full border border-dashed border-slate-300 inline-block" />
            <span>{t(lang, 'legendWalkTransfer')}</span>
          </span>
        </div>
      </div>
    </div>
  );
};
