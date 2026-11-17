import React, { useState } from 'react';
import { X, Globe2, Play, MapPin, ShieldAlert } from 'lucide-react';
import {
  DIFFICULTIES,
  DifficultyLevel,
  Language,
  RealCityId,
} from '../types/game';
import { formatCurrencyWan } from '../i18n/translations';

interface SetupModalProps {
  open: boolean;
  lang?: Language;
  currentRealCity: RealCityId;
  currentDifficulty: DifficultyLevel;
  onClose: () => void;
  onApply: (realCity: RealCityId, difficulty: DifficultyLevel, seed: number) => void;
}

export const SetupModal: React.FC<SetupModalProps> = ({
  open,
  lang = 'zh-Hant',
  currentDifficulty,
  onClose,
  onApply,
}) => {
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(currentDifficulty);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-[#0B1424]/92 backdrop-blur-2xl border border-white/12 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-100">開局設定與財政難度 · 上海全市</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              全精度 16 行政區真實地理邊界、黃浦江與蘇州河實景路網
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Dedicated Shanghai Map Briefing */}
          <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-400/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Globe2 className="w-4 h-4 text-sky-400" />
                <span>上海全市 · 1990年無地鐵時代</span>
              </div>
              <span className="text-[11px] font-mono-tabular text-sky-300">
                全 16 個區級行政區
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300">
              <div className="flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>開局出生點：黃浦、徐匯、長寧、靜安、普陀、虹口、楊浦；其餘 9 區採金錢解鎖制</span>
              </div>
              <div className="flex items-start gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>海域（東海／長江口／杭州灣）與江河湖面禁止設站，僅限陸地設站與軌道跨河</span>
              </div>
            </div>
          </div>

          {/* Difficulty Selection */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold text-slate-300">選擇財政難度設定</label>
            <div className="space-y-1.5">
              {(Object.keys(DIFFICULTIES) as DifficultyLevel[]).map((lvl) => {
                const cfg = DIFFICULTIES[lvl];
                const active = difficulty === lvl;
                return (
                  <button
                    key={lvl}
                    onClick={() => setDifficulty(lvl)}
                    className={`w-full px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-4 text-left transition-colors ${
                      active
                        ? 'bg-sky-500/20 border-sky-400 text-white'
                        : 'bg-slate-950/50 border-white/10 text-slate-300 hover:border-white/20'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold">{cfg.label}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{cfg.subtitle}</div>
                    </div>
                    <div className="text-right shrink-0 font-mono-tabular text-xs">
                      <div className="text-emerald-400 font-semibold">
                        {formatCurrencyWan(cfg.startingMoney, lang)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        造價 {cfg.costMultiplier}x
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/10 bg-slate-950/50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white rounded-xl hover:bg-white/10"
          >
            取消
          </button>
          <button
            onClick={() => {
              onApply('shanghai', difficulty, Math.floor(Math.random() * 100000));
              onClose();
            }}
            className="px-5 py-2 text-xs font-semibold text-white bg-sky-500 hover:bg-sky-400 rounded-xl flex items-center gap-1.5 shadow-lg shadow-sky-500/20"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>進入上海地圖</span>
          </button>
        </div>
      </div>
    </div>
  );
};
