import React from 'react';
import { X } from 'lucide-react';

interface GddModalProps {
  open: boolean;
  onClose: () => void;
}

export const GddModal: React.FC<GddModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-xl shadow-[0_20px_50px_rgba(15,23,42,0.16)] overflow-hidden flex flex-col max-h-[85vh] text-slate-900">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900">MetroForge 系統架構設計文件</h2>
            <p className="text-xs text-slate-500 mt-0.5">無網格幾何路網 · 廣義成本尋路 · 城市動力學模型</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-600 leading-relaxed">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">01. 圖層與向量地理架構</h3>
            <p>
              採用 <strong className="text-slate-900">React 19 + TypeScript + MapLibre GL + High-DPI 2D Canvas</strong>。模擬核心與介面狀態分離，Canvas 維持流暢平移縮放，並支援高架 (EL) 與 B1–B5 地下六層深度過濾。
            </p>
          </section>

          <section className="space-y-2 border-t border-slate-200 pt-5">
            <h3 className="text-sm font-semibold text-slate-900">02. 核心演算法：人流尋路 (Transit Dijkstra)</h3>
            <p>
              將路網建模為狀態圖 <code className="text-blue-700 font-mono-tabular">(StationId, LineId)</code>，對每筆起訖點 (O-D) 需求計算廣義通勤成本：
            </p>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono-tabular text-[11px] text-slate-800">
              Cost = Σ(區間行駛時間 × 快車係數 + 0.15 × 班距懲罰) + 轉乘懲罰(3.5分) × (1 - 是否貫通)
            </div>
            <p>
              當兩條路線設定為<strong className="text-slate-900">貫通運轉 (Through-Service)</strong> 時，交會站的轉乘懲罰降為 0，乘客無需下車轉乘，系統自動將長程旅次導向聯運走廊。
            </p>
          </section>

          <section className="space-y-2 border-t border-slate-200 pt-5">
            <h3 className="text-sm font-semibold text-slate-900">03. 人口、交通密集度與 TOD 動態連動</h3>
            <p>
              系統根據時段曲線（07:00–09:30 早高峰向商辦通勤、17:00–19:45 晚高峰返家、01:00–04:30 深夜維修）動態生成需求。地鐵覆蓋區內的地面壅塞度會顯著下降，且每日觸發 <strong className="text-slate-900">TOD 地價增值與人口聚集</strong>；反之覆蓋不足且高壅塞區域會使市民滿意度下滑並產生外移壓力。
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
