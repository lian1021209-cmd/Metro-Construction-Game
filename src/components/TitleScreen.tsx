import React, { useEffect, useRef } from 'react';
import {
  Play,
  Clock,
  Settings,
  FileText,
  HelpCircle,
  ChevronRight,
  Volume2,
  VolumeX,
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
  hue: 'sky' | 'amber' | 'slate';
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

    // Build deterministic 3D isometric city diorama (18x18 grid)
    const buildings: IsoBuilding[] = [];
    for (let gy = 0; gy < 18; gy++) {
      for (let gx = 0; gx < 18; gx++) {
        // Leave river diagonal channel around gx + gy ~ 17..19
        const riverDist = Math.abs(gx - gy + 2);
        if (riverDist < 1.6) continue;
        // Leave avenue corridors
        if (gx % 4 === 0 || gy % 4 === 0) continue;

        const distCenter = Math.hypot(gx - 9.5, gy - 8.5);
        if (distCenter > 8.5 && Math.sin(gx * 3.1 + gy * 2.7) < 0.1) continue;

        const seed = Math.abs(Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453) % 1;
        const isCore = distCenter < 4.5;
        const h = isCore
          ? 38 + seed * 86
          : distCenter < 7.5
          ? 18 + seed * 36
          : 10 + seed * 16;

        buildings.push({
          gx,
          gy,
          w: 0.72,
          d: 0.72,
          h,
          kind: isCore && seed > 0.78 ? 'spire' : isCore ? 'tower' : 'mid',
          hue: isCore ? (seed > 0.55 ? 'amber' : 'sky') : 'slate',
        });
      }
    }
    // Painter's sort back-to-front in isometric space (gx + gy ascending)
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

        const bg = ctx.createRadialGradient(w * 0.68, h * 0.48, 60, w * 0.4, h * 0.5, w * 0.9);
        bg.addColorStop(0, '#0F223D');
        bg.addColorStop(0.55, '#081426');
        bg.addColorStop(1, '#040914');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        const tileW = Math.max(28, Math.min(46, w * 0.032));
        const tileH = tileW * 0.5;
        const originX = w * 0.68;
        const originY = h * 0.16;

        const iso = (gx: number, gy: number, z = 0) => ({
          x: originX + (gx - gy) * tileW,
          y: originY + (gx + gy) * tileH - z,
        });

        // 1. Base City Ground & River Channel
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
              ctx.fillStyle = '#071B34';
              ctx.fill();
            } else if (isRoad) {
              ctx.fillStyle = '#15253B';
              ctx.fill();
            } else {
              ctx.fillStyle = '#0D192B';
              ctx.fill();
              ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
              ctx.lineWidth = 0.8;
              ctx.stroke();
            }
          }
        }

        // 2. Glowing Cross-River Metro Viaducts (2 crossing lines)
        const drawIsoRail = (
          pts: [number, number, number][],
          color: string,
          tPos: number
        ) => {
          const screenPts = pts.map(([gx, gy, z]) => iso(gx, gy, z));
          // Piers
          for (let i = 1; i < pts.length - 1; i++) {
            const top = screenPts[i];
            const bot = iso(pts[i][0], pts[i][1], 0);
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(top.x, top.y);
            ctx.lineTo(bot.x, bot.y);
            ctx.stroke();
          }

          ctx.save();
          ctx.shadowColor = color;
          ctx.shadowBlur = 10;
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          screenPts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.stroke();
          ctx.restore();

          // Articulated 3-car train gliding along rail
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

            ctx.fillStyle = car === 0 ? '#FFFFFF' : color;
            ctx.beginPath();
            ctx.arc(tx, ty, car === 0 ? 3.5 : 2.8, 0, Math.PI * 2);
            ctx.fill();
          }
        };

        drawIsoRail(
          [
            [0, 8.5, 10],
            [6, 8.5, 14],
            [12, 8.5, 14],
            [18, 8.5, 10],
          ],
          '#38BDF8',
          trainT1
        );

        // 3. 3D Isometric Extruded Building Models
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

          // Left-facing wall (x0..x1 at y1)
          ctx.fillStyle =
            b.hue === 'amber' ? '#1E2D45' : b.hue === 'sky' ? '#172943' : '#121E33';
          ctx.beginPath();
          ctx.moveTo(bTop3.x, bTop3.y);
          ctx.lineTo(bTop2.x, bTop2.y);
          ctx.lineTo(bBot2.x, bBot2.y);
          ctx.lineTo(bBot3.x, bBot3.y);
          ctx.closePath();
          ctx.fill();

          // Right-facing wall (y0..y1 at x1)
          ctx.fillStyle =
            b.hue === 'amber' ? '#142034' : b.hue === 'sky' ? '#101E33' : '#0C1626';
          ctx.beginPath();
          ctx.moveTo(bTop1.x, bTop1.y);
          ctx.lineTo(bTop2.x, bTop2.y);
          ctx.lineTo(bBot2.x, bBot2.y);
          ctx.lineTo(bBot1.x, bBot1.y);
          ctx.closePath();
          ctx.fill();

          // Roof face
          ctx.fillStyle =
            b.hue === 'amber' ? '#2A4062' : b.hue === 'sky' ? '#243C5E' : '#1A2B45';
          ctx.beginPath();
          ctx.moveTo(bTop0.x, bTop0.y);
          ctx.lineTo(bTop1.x, bTop1.y);
          ctx.lineTo(bTop2.x, bTop2.y);
          ctx.lineTo(bTop3.x, bTop3.y);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = 'rgba(147, 197, 253, 0.16)';
          ctx.lineWidth = 0.7;
          ctx.stroke();

          // Lit architectural window strips on tall towers
          if (b.h > 32) {
            ctx.fillStyle =
              b.hue === 'amber' ? 'rgba(251, 191, 36, 0.45)' : 'rgba(56, 189, 248, 0.35)';
            const floors = Math.floor(b.h / 11);
            for (let f = 1; f < floors; f++) {
              const wy = f * 10;
              const pL = iso(x0 + 0.12, y1, wy);
              const pR = iso(x1 - 0.12, y1, wy);
              ctx.beginPath();
              ctx.moveTo(pL.x, pL.y);
              ctx.lineTo(pR.x, pR.y);
              ctx.strokeStyle =
                b.hue === 'amber' ? 'rgba(251, 191, 36, 0.35)' : 'rgba(125, 211, 252, 0.28)';
              ctx.lineWidth = 1.1;
              ctx.stroke();
            }
          }

          // Spire beacon on landmark towers
          if (b.kind === 'spire') {
            const centerTop = iso((x0 + x1) / 2, (y0 + y1) / 2, b.h);
            ctx.strokeStyle = 'rgba(186, 230, 253, 0.7)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(centerTop.x, centerTop.y);
            ctx.lineTo(centerTop.x, centerTop.y - 22);
            ctx.stroke();
            ctx.fillStyle = '#38BDF8';
            ctx.beginPath();
            ctx.arc(centerTop.x, centerTop.y - 22, 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Second foreground rail corridor
        drawIsoRail(
          [
            [8.5, 0, 12],
            [8.5, 6, 12],
            [8.5, 12, 12],
            [8.5, 18, 12],
          ],
          '#F43F5E',
          trainT2
        );
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#040914] text-slate-100 select-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      <div className="absolute inset-0 bg-gradient-to-r from-[#040914]/92 via-[#061020]/55 to-transparent pointer-events-none" />

      {/* Top-Right Glass Icon Controls */}
      <div className="absolute top-6 right-7 z-20 flex items-center gap-2.5">
        <button
          onClick={onOpenGdd}
          title="系統架構設計文件"
          className="w-10 h-10 rounded-full bg-slate-900/65 backdrop-blur-xl border border-white/10 hover:border-sky-400/50 hover:bg-slate-800/80 flex items-center justify-center text-slate-300 hover:text-white transition-all"
        >
          <FileText className="w-4 h-4" />
        </button>
        <button
          onClick={onToggleMute}
          title={muted ? '開啟音效' : '靜音'}
          className="w-10 h-10 rounded-full bg-slate-900/65 backdrop-blur-xl border border-white/10 hover:border-sky-400/50 hover:bg-slate-800/80 flex items-center justify-center text-slate-300 hover:text-white transition-all"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Left-Aligned Architectural Hero & Menu Stack */}
      <div className="relative z-10 h-full flex flex-col justify-between px-10 md:px-16 py-10 max-w-xl">
        <div className="pt-4 space-y-6">
          <div>
            <h1 className="text-5xl md:text-[56px] font-bold tracking-tight text-[#93C5FD] leading-tight">
              地鐵構築者
            </h1>
            <p className="text-sm text-slate-400 mt-2 tracking-wide">
              MetroForge · 高自由度軌道工程與動態都市模擬
            </p>
          </div>

          <div className="flex items-center gap-0 py-2 w-80" aria-hidden="true">
            <div className="h-[2px] w-7 bg-sky-400/50" />
            <div className="w-2.5 h-2.5 rounded-full border-2 border-sky-300 bg-[#07111E]" />
            <div className="h-[2px] w-8 bg-sky-400/50" />
            <div className="w-2.5 h-2.5 rounded-full border-2 border-sky-300 bg-[#07111E]" />
            <div className="h-[2px] w-3 bg-sky-400/50" />
            <div className="flex items-end gap-1 px-1.5">
              <span className="w-1.5 h-4 bg-sky-300/80 rounded-t-xs" />
              <span className="w-1.5 h-6 bg-sky-200 rounded-t-xs" />
              <span className="w-1.5 h-8 bg-sky-100 rounded-t-xs" />
              <span className="w-1.5 h-5 bg-sky-200 rounded-t-xs" />
              <span className="w-1.5 h-3.5 bg-sky-300/80 rounded-t-xs" />
            </div>
            <div className="h-[2px] w-3 bg-sky-400/50" />
            <div className="w-2.5 h-2.5 rounded-full border-2 border-sky-300 bg-[#07111E]" />
            <div className="h-[2px] w-8 bg-sky-400/50" />
            <div className="w-2.5 h-2.5 rounded-full border-2 border-sky-300 bg-[#07111E]" />
            <div className="h-[2px] flex-1 bg-sky-400/50" />
          </div>

          <div className="space-y-3 w-full max-w-[390px]">
            <button
              onClick={onStartNewGame}
              className="w-full px-5 py-4 rounded-xl bg-gradient-to-r from-[#5EA0DF]/90 to-[#3B76B8]/80 hover:from-[#6FB0ED] hover:to-[#4785CA] border border-sky-300/30 shadow-xl shadow-sky-950/50 flex items-center justify-between text-white transition-all group cursor-pointer"
            >
              <span className="flex items-center gap-3.5 text-base font-semibold">
                <Play className="w-4 h-4 fill-white" />
                <span>開始遊戲</span>
              </span>
              <span className="flex items-center gap-1.5 text-xs text-sky-100/90 group-hover:translate-x-0.5 transition-transform">
                <span>選擇地圖與難度</span>
                <ChevronRight className="w-4 h-4" />
              </span>
            </button>

            <button
              onClick={onContinueGame}
              className="w-full px-5 py-3.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/75 backdrop-blur-xl border border-white/10 hover:border-white/20 flex items-center justify-between text-slate-100 transition-all group cursor-pointer"
            >
              <span className="flex items-center gap-3.5 text-sm font-medium">
                <Clock className="w-4 h-4 text-slate-300" />
                <span>進入目前都市</span>
              </span>
              <span className="flex items-center gap-1.5 text-xs text-slate-400 group-hover:text-slate-200 transition-colors">
                <span>{currentCityLabel}</span>
                <ChevronRight className="w-4 h-4" />
              </span>
            </button>

            <button
              onClick={onStartNewGame}
              className="w-full px-5 py-3.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/75 backdrop-blur-xl border border-white/10 hover:border-white/20 flex items-center justify-between text-slate-100 transition-all group cursor-pointer"
            >
              <span className="flex items-center gap-3.5 text-sm font-medium">
                <Settings className="w-4 h-4 text-slate-300" />
                <span>開局設定與財政難度</span>
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-200 transition-colors" />
            </button>

            <button
              onClick={onOpenGdd}
              className="w-full px-5 py-3.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/75 backdrop-blur-xl border border-white/10 hover:border-white/20 flex items-center justify-between text-slate-100 transition-all group cursor-pointer"
            >
              <span className="flex items-center gap-3.5 text-sm font-medium">
                <FileText className="w-4 h-4 text-slate-300" />
                <span>系統架構設計文件 (GDD)</span>
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-200 transition-colors" />
            </button>

            <button
              onClick={onQuickDemo}
              className="w-full px-5 py-3 rounded-xl bg-slate-900/35 hover:bg-slate-800/55 backdrop-blur-md border border-dashed border-slate-700/80 hover:border-sky-500/40 flex items-center justify-between text-slate-300 transition-all group cursor-pointer mt-2"
            >
              <span className="flex items-center gap-2.5 text-xs">
                <HelpCircle className="w-4 h-4 text-slate-400" />
                <span>第一次玩？</span>
                <span className="text-emerald-400 font-medium">載入示範路網 · 立即觀察列車</span>
              </span>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300" />
            </button>
          </div>
        </div>

        <div className="space-y-1 text-xs text-slate-500">
          <p className="text-slate-400">原創程序化建築模型 · 向量河道地圖 · 無網格自由軌道</p>
          <p>支援 B1–B5 深層立體分層、快慢車與貫通運轉即時模擬</p>
        </div>
      </div>
    </div>
  );
};
