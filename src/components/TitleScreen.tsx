import React, { useEffect, useRef } from 'react';
import { ArrowRight, Play, Volume2, VolumeX } from 'lucide-react';

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

        // Crisp daylight studio background
        ctx.fillStyle = '#F5F7FA';
        ctx.fillRect(0, 0, w, h);

        const tileW = Math.max(28, Math.min(46, w * 0.032));
        const tileH = tileW * 0.5;
        const originX = w * 0.7;
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
              ctx.fillStyle = '#CFE2F0';
              ctx.fill();
            } else if (isRoad) {
              ctx.fillStyle = '#FFFFFF';
              ctx.fill();
              ctx.strokeStyle = 'rgba(148, 163, 184, 0.24)';
              ctx.lineWidth = 0.6;
              ctx.stroke();
            } else {
              ctx.fillStyle = '#E8EDF3';
              ctx.fill();
              ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
              ctx.lineWidth = 0.7;
              ctx.stroke();
            }
          }
        }

        // 2. Transit Viaducts, Station Nodes & Train Consists
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

          for (let i = 1; i < screenPts.length - 1; i++) {
            ctx.fillStyle = '#FFFFFF';
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(screenPts[i].x, screenPts[i].y, 4.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }

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

          ctx.fillStyle =
            b.hue === 'cool' ? '#E4EAF2' : b.hue === 'warm' ? '#ECEEEF' : '#F2F4F7';
          ctx.beginPath();
          ctx.moveTo(bTop3.x, bTop3.y);
          ctx.lineTo(bTop2.x, bTop2.y);
          ctx.lineTo(bBot2.x, bBot2.y);
          ctx.lineTo(bBot3.x, bBot3.y);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle =
            b.hue === 'cool' ? '#CBD5E1' : b.hue === 'warm' ? '#D6DCE5' : '#DDE3EB';
          ctx.beginPath();
          ctx.moveTo(bTop1.x, bTop1.y);
          ctx.lineTo(bTop2.x, bTop2.y);
          ctx.lineTo(bBot2.x, bBot2.y);
          ctx.lineTo(bBot1.x, bBot1.y);
          ctx.closePath();
          ctx.fill();

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
    <div className="relative w-screen h-screen overflow-hidden bg-[#F5F7FA] text-slate-900 select-none flex flex-col">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#F5F7FA] via-[#F5F7FA]/85 to-transparent pointer-events-none" />

      {/* Clean 3-Zone Top Header matching In-Game HUD */}
      <header className="relative z-20 h-12 px-6 md:px-12 border-b border-slate-200/80 bg-white/85 backdrop-blur-sm flex items-center justify-between gap-8">
        <span className="text-sm font-bold tracking-tight text-slate-950 whitespace-nowrap shrink-0">
          地鐵構築者
        </span>

        <nav className="hidden sm:flex items-center gap-6 text-xs font-medium text-slate-600">
          <button
            onClick={onQuickDemo}
            className="hover:text-slate-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            示範路網
          </button>
          <button
            onClick={onOpenGdd}
            className="hover:text-slate-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            設計文件
          </button>
          <button
            onClick={onToggleMute}
            className="hover:text-slate-950 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            <span>{muted ? '靜音中' : '音效開'}</span>
          </button>
        </nav>

        <button
          onClick={onContinueGame}
          className="px-3.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          繼續運行
        </button>
      </header>

      {/* Main Asymmetric Editorial Hero */}
      <main className="relative z-10 flex-1 flex flex-col justify-center px-6 md:px-12 max-w-2xl">
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>上海啟航 · 全國省市區分級實景邊界</span>
              <span aria-hidden="true">·</span>
              <span>無網格自由軌道工程模擬</span>
            </div>

            <h1 className="text-5xl md:text-[56px] font-bold tracking-tight text-slate-950 leading-[1.06] text-balance">
              構築都市的軌道脈絡
            </h1>

            <p className="text-sm md:text-[15px] text-slate-600 max-w-lg leading-relaxed">
              從 1990 年人民廣場核心出發，跨越黃浦江與長三角劃設地下 B1–B5 與高架路網，逐步解鎖全國各省、直轄市、自治區及港澳都市圈與高鐵轉乘樞紐。
            </p>
          </div>

          {/* Primary + Quiet Secondary Action (Zero Button Stack Clutter) */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onStartNewGame}
              className="px-5 py-2.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-white text-sm font-semibold flex items-center gap-2.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>開始新規劃</span>
            </button>

            <button
              onClick={onContinueGame}
              className="px-5 py-2.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
            >
              進入目前都市 ({currentCityLabel})
            </button>
          </div>

          {/* Unboxed Architectural Specifications & Quick Demo Link */}
          <div className="pt-6 border-t border-slate-200/90 space-y-4 max-w-lg">
            <div className="grid grid-cols-3 gap-6">
              <div>
                <div className="text-lg font-bold font-mono-tabular text-slate-950">全國聯網</div>
                <div className="text-xs text-slate-500 mt-0.5">省市區三級實景疆域</div>
              </div>
              <div>
                <div className="text-lg font-bold font-mono-tabular text-slate-950">EL / B1–B5</div>
                <div className="text-xs text-slate-500 mt-0.5">多層隧道貫通</div>
              </div>
              <div>
                <div className="text-lg font-bold font-mono-tabular text-slate-950">即時模擬</div>
                <div className="text-xs text-slate-500 mt-0.5">道路分流與票務</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-5 pt-1">
              <button
                onClick={onQuickDemo}
                className="text-xs font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
              >
                <span>載入多線示範路網並立即觀察列車運行</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={onOpenGdd}
                className="sm:hidden text-xs font-medium text-slate-600 hover:text-slate-950 transition-colors whitespace-nowrap cursor-pointer"
              >
                系統設計文件
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
