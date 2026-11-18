import React, { useEffect, useRef } from 'react';
import {
  Play,
  Clock,
  SlidersHorizontal,
  FileText,
  ChevronRight,
  Volume2,
  VolumeX,
  Compass,
} from 'lucide-react';

interface TitleScreenProps {
  currentCityLabel: string;
  muted: boolean;
  onToggleMute: () => void;
  onStartNewGame: () => void;
  onContinueGame: () => void;
  onQuickDemo: () => void;
  onOpenGdd: () => void;
}

interface IsoBuilding {
  gx: number;
  gy: number;
  w: number;
  d: number;
  h: number;
  kind: 'tower' | 'mid' | 'spire';
  hue: 'stone' | 'warm' | 'cool';
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  currentCityLabel,
  muted,
  onToggleMute,
  onStartNewGame,
  onContinueGame,
  onQuickDemo,
  onOpenGdd,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let rafId = 0;

    // Deterministic daylight architectural paper-model city diorama (18x18 grid)
    const buildings: IsoBuilding[] = [];
    for (let gy = 0; gy < 18; gy++) {
      for (let gx = 0; gx < 18; gx++) {
        const riverDist = Math.abs(gx - gy + 2);
        if (riverDist < 1.6) continue;
        if (gx % 4 === 0 || gy % 4 === 0) continue;

        const distCenter = Math.hypot(gx - 9.5, gy - 8.5);
        if (distCenter > 8.5 && Math.sin(gx * 3.1 + gy * 2.7) < 0.1) continue;

        const seed = Math.abs(Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453) % 1;
        const isCore = distCenter < 4.5;
        const h = isCore
          ? 36 + seed * 78
          : distCenter < 7.5
          ? 16 + seed * 32
          : 9 + seed * 14;

        buildings.push({
          gx,
          gy,
          w: 0.72,
          d: 0.72,
          h,
          kind: isCore && seed > 0.78 ? 'spire' : isCore ? 'tower' : 'mid',
          hue: isCore ? (seed > 0.5 ? 'cool' : 'warm') : 'stone',
        });
      }
    }
    buildings.sort((a, b) => a.gx + a.gy - (b.gx + b.gy));

    let trainT1 = 0;
    let trainT2 = 0.45;
    let lastTs = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      trainT1 = (trainT1 + dt * 0.085) % 1;
      trainT2 = (trainT2 + dt * 0.07) % 1;

      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Crisp daylight studio paper background
        ctx.fillStyle = '#F4F6F9';
        ctx.fillRect(0, 0, w, h);

        const tileW = Math.max(28, Math.min(46, w * 0.032));
        const tileH = tileW * 0.5;
        const originX = w * 0.69;
        const originY = h * 0.16;

        const iso = (gx: number, gy: number, z = 0) => ({
          x: originX + (gx - gy) * tileW,
          y: originY + (gx + gy) * tileH - z,
        });

        // 1. Base City Ground & River Channel (Clean daylight cartographic palette)
        for (let gy = 0; gy < 18; gy++) {
          for (let gx = 0; gx < 18; gx++) {
            const p0 = iso(gx, gy);
            const p1 = iso(gx + 1, gy);
            const p2 = iso(gx + 1, gy + 1);
            const p3 = iso(gx, gy + 1);

            const isRiver = Math.abs(gx - gy + 2) < 1.6;
            const isRoad = !isRiver && (gx % 4 === 0 || gy % 4 === 0);

            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.lineTo(p3.x, p3.y);
            ctx.closePath();

            if (isRiver) {
              ctx.fillStyle = '#CFE2F0';
              ctx.fill();
            } else if (isRoad) {
              ctx.fillStyle = '#FFFFFF';
              ctx.fill();
              ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
              ctx.lineWidth = 0.6;
              ctx.stroke();
            } else {
              ctx.fillStyle = '#E8EDF3';
              ctx.fill();
              ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
              ctx.lineWidth = 0.7;
              ctx.stroke();
            }
          }
        }

        // 2. Crisp Transit Viaducts & Articulated Trains (Zero neon glow)
        const drawIsoRail = (
          pts: [number, number, number][],
          color: string,
          tPos: number
        ) => {
          const screenPts = pts.map(([gx, gy, z]) => iso(gx, gy, z));
          for (let i = 1; i < pts.length - 1; i++) {
            const top = screenPts[i];
            const bot = iso(pts[i][0], pts[i][1], 0);
            ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(top.x, top.y);
            ctx.lineTo(bot.x, bot.y);
            ctx.stroke();
          }

          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          screenPts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.stroke();

          ctx.strokeStyle = color;
          ctx.lineWidth = 2.8;
          ctx.beginPath();
          screenPts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.stroke();

          for (let car = 0; car < 3; car++) {
            const ct = (tPos - car * 0.022 + 1) % 1;
            const totalSegs = screenPts.length - 1;
            const scaled = ct * totalSegs;
            const segIdx = Math.min(totalSegs - 1, Math.floor(scaled));
            const localT = scaled - segIdx;
            const a = screenPts[segIdx];
            const b = screenPts[segIdx + 1];
            const tx = a.x + (b.x - a.x) * localT;
            const ty = a.y + (b.y - a.y) * localT;

            ctx.fillStyle = car === 0 ? '#0F172A' : color;
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(tx, ty, car === 0 ? 3.8 : 3.0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        };

        drawIsoRail(
          [
            [0, 8.5, 10],
            [6, 8.5, 14],
            [12, 8.5, 14],
            [18, 8.5, 10],
          ],
          '#2563EB',
          trainT1
        );

        // 3. Daylight Architectural Massing Models
        for (const b of buildings) {
          const pad = (1 - b.w) / 2;
          const x0 = b.gx + pad;
          const y0 = b.gy + pad;
          const x1 = x0 + b.w;
          const y1 = y0 + b.d;

          const bTop0 = iso(x0, y0, b.h);
          const bTop1 = iso(x1, y0, b.h);
          const bTop2 = iso(x1, y1, b.h);
          const bTop3 = iso(x0, y1, b.h);

          const bBot1 = iso(x1, y0, 0);
          const bBot2 = iso(x1, y1, 0);
          const bBot3 = iso(x0, y1, 0);

          // Left-facing wall (sunlit ivory)
          ctx.fillStyle =
            b.hue === 'cool' ? '#E4EAF2' : b.hue === 'warm' ? '#ECEEEF' : '#F2F4F7';
          ctx.beginPath();
          ctx.moveTo(bTop3.x, bTop3.y);
          ctx.lineTo(bTop2.x, bTop2.y);
          ctx.lineTo(bBot2.x, bBot2.y);
          ctx.lineTo(bBot3.x, bBot3.y);
          ctx.closePath();
          ctx.fill();

          // Right-facing wall (shaded architectural slate-gray)
          ctx.fillStyle =
            b.hue === 'cool' ? '#CBD5E1' : b.hue === 'warm' ? '#D6DCE5' : '#DDE3EB';
          ctx.beginPath();
          ctx.moveTo(bTop1.x, bTop1.y);
          ctx.lineTo(bTop2.x, bTop2.y);
          ctx.lineTo(bBot2.x, bBot2.y);
          ctx.lineTo(bBot1.x, bBot1.y);
          ctx.closePath();
          ctx.fill();

          // Roof face (crisp white)
          ctx.fillStyle =
            b.hue === 'cool' ? '#F8FAFC' : b.hue === 'warm' ? '#FFFFFF' : '#FAFBFD';
          ctx.beginPath();
          ctx.moveTo(bTop0.x, bTop0.y);
          ctx.lineTo(bTop1.x, bTop1.y);
          ctx.lineTo(bTop2.x, bTop2.y);
          ctx.lineTo(bTop3.x, bTop3.y);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = 'rgba(100, 116, 139, 0.28)';
          ctx.lineWidth = 0.7;
          ctx.stroke();

          if (b.h > 34) {
            const floors = Math.floor(b.h / 11);
            for (let f = 1; f < floors; f++) {
              const wy = f * 10;
              const pL = iso(x0 + 0.14, y1, wy);
              const pR = iso(x1 - 0.14, y1, wy);
              ctx.beginPath();
              ctx.moveTo(pL.x, pL.y);
              ctx.lineTo(pR.x, pR.y);
              ctx.strokeStyle = 'rgba(100, 116, 139, 0.22)';
              ctx.lineWidth = 0.9;
              ctx.stroke();
            }
          }

          if (b.kind === 'spire') {
            const centerTop = iso((x0 + x1) / 2, (y0 + y1) / 2, b.h);
            ctx.strokeStyle = '#64748B';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(centerTop.x, centerTop.y);
            ctx.lineTo(centerTop.x, centerTop.y - 20);
            ctx.stroke();
            ctx.fillStyle = '#E11D48';
            ctx.beginPath();
            ctx.arc(centerTop.x, centerTop.y - 20, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        drawIsoRail(
          [
            [8.5, 0, 12],
            [8.5, 6, 12],
            [8.5, 12, 12],
            [8.5, 18, 12],
          ],
          '#E11D48',
          trainT2
        );
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#F4F6F9] text-slate-900 select-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      <div className="absolute inset-0 bg-gradient-to-r from-[#F4F6F9] via-[#F4F6F9]/88 to-transparent pointer-events-none" />

      {/* Top-Right Minimal Icon Controls */}
      <div className="absolute top-6 right-7 z-20 flex items-center gap-2">
        <button
          onClick={onOpenGdd}
          title="系統架構設計文件"
          className="w-10 h-10 rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 shadow-xs flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <FileText className="w-4 h-4" />
        </button>
        <button
          onClick={onToggleMute}
          title={muted ? '開啟音效' : '靜音'}
          className="w-10 h-10 rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 shadow-xs flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Left-Aligned Daylight Studio Hero & Clean Menu */}
      <div className="relative z-10 h-full flex flex-col justify-between px-10 md:px-16 py-12 max-w-xl">
        <div className="pt-6 space-y-8">
          <div className="space-y-2.5">
            <div className="text-xs font-medium text-slate-500 tracking-wide">
              上海都市軌道交通模擬系統
            </div>
            <h1 className="text-5xl md:text-[54px] font-bold tracking-tight text-slate-950 leading-none">
              地鐵構築者
            </h1>
            <p className="text-sm text-slate-600 max-w-sm leading-relaxed">
              MetroForge · 無網格自由線路設計、跨江地下分層工程與動態通勤人流模擬
            </p>
          </div>

          <div className="space-y-2.5 w-full max-w-[360px]">
            <button
              onClick={onStartNewGame}
              className="w-full px-5 py-3.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-white shadow-sm flex items-center justify-between transition-colors group cursor-pointer"
            >
              <span className="flex items-center gap-3 text-sm font-semibold">
                <Play className="w-4 h-4 fill-current" />
                <span>開始遊戲</span>
              </span>
              <span className="flex items-center gap-1.5 text-xs text-slate-300 group-hover:translate-x-0.5 transition-transform">
                <span>選擇難度與開局</span>
                <ChevronRight className="w-4 h-4" />
              </span>
            </button>

            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200 shadow-[0_2px_10px_rgba(15,23,42,0.04)] overflow-hidden">
              <button
                onClick={onContinueGame}
                className="w-full px-4 py-3 hover:bg-slate-50 flex items-center justify-between text-slate-800 transition-colors group cursor-pointer"
              >
                <span className="flex items-center gap-3 text-sm font-medium">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <span>進入目前都市</span>
                </span>
                <span className="flex items-center gap-1 text-xs text-slate-500 group-hover:text-slate-900">
                  <span>{currentCityLabel}</span>
                  <ChevronRight className="w-4 h-4" />
                </span>
              </button>

              <button
                onClick={onStartNewGame}
                className="w-full px-4 py-3 hover:bg-slate-50 flex items-center justify-between text-slate-800 transition-colors group cursor-pointer"
              >
                <span className="flex items-center gap-3 text-sm font-medium">
                  <SlidersHorizontal className="w-4 h-4 text-slate-500" />
                  <span>開局設定與財政難度</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-900" />
              </button>

              <button
                onClick={onOpenGdd}
                className="w-full px-4 py-3 hover:bg-slate-50 flex items-center justify-between text-slate-800 transition-colors group cursor-pointer"
              >
                <span className="flex items-center gap-3 text-sm font-medium">
                  <FileText className="w-4 h-4 text-slate-500" />
                  <span>系統設計說明 (GDD)</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-900" />
              </button>
            </div>

            <button
              onClick={onQuickDemo}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300/90 bg-white/75 hover:bg-white hover:border-blue-600/40 flex items-center justify-between text-slate-700 transition-colors group cursor-pointer"
            >
              <span className="flex items-center gap-2 text-xs">
                <Compass className="w-3.5 h-3.5 text-blue-600" />
                <span>載入多線示範路網</span>
                <span className="text-slate-400">·</span>
                <span className="text-blue-700 font-medium">立即觀察列車運行</span>
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-800" />
            </button>
          </div>
        </div>

        <div className="space-y-1 text-xs text-slate-500">
          <p className="text-slate-600 font-medium">上海 16 區真實地理邊界 · 黃浦江／蘇州河／三島水陸實景</p>
          <p>支援 EL 高架與 B1–B5 深層軌道立體分層、快慢車及貫通運轉模擬</p>
        </div>
      </div>
    </div>
  );
};
