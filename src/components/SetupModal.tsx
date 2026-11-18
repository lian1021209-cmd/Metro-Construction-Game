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
    <div className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl shadow-[0_20px_50px_rgba(15,23,42,0.16)] overflow-hidden text-slate-900">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">開局設定與財政難度 · 上海全市</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              16 行政區真實地理邊界、黃浦江與蘇州河實景路網
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Dedicated Shanghai Map Briefing */}
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Globe2 className="w-4 h-4 text-blue-600" />
                <span>上海全市 · 1990 年無地鐵時代</span>
              </div>
              <span className="text-xs font-mono-tabular text-slate-500">
                16 個區級行政區
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>開局出生點：黃浦、徐匯、長寧、靜安、普陀、虹口、楊浦；其餘 9 區採資金解鎖制</span>
              </div>
              <div className="flex items-start gap-2">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>海域與江河湖面禁止設站，僅限陸地設站與軌道跨河</span>
              </div>
            </div>
          </div>

          {/* Difficulty Selection */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold text-slate-700 block">選擇財政難度設定</label>
            <div className="space-y-2">
              {(Object.keys(DIFFICULTIES) as DifficultyLevel[]).map((lvl) => {
                const cfg = DIFFICULTIES[lvl];
                const active = difficulty === lvl;
                return (
                  <button
                    key={lvl}
                    onClick={() => setDifficulty(lvl)}
                    className={`w-full px-4 py-3 rounded-lg border flex items-center justify-between gap-4 text-left transition-colors cursor-pointer ${
                      active
                        ? 'bg-blue-50/70 border-blue-600 text-slate-950'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-900">{cfg.label}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{cfg.subtitle}</div>
                    </div>
                    <div className="text-right shrink-0 font-mono-tabular text-xs">
                      <div className="text-emerald-700 font-semibold">
                        {formatCurrencyWan(cfg.startingMoney, lang)}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        造價 {cfg.costMultiplier}x
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-200/70 transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => {
              onApply('shanghai', difficulty, Math.floor(Math.random() * 100000));
              onClose();
            }}
            className="px-5 py-2 text-xs font-semibold text-white bg-slate-950 hover:bg-slate-800 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>進入上海地圖</span>
          </button>
        </div>
      </div>
    </div>
  );
};
