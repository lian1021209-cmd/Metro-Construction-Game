import React, { useEffect, useMemo, useState } from 'react';
import { X, Play, MapPin, Compass, Search } from 'lucide-react';
import {
  CityRegionInfo,
  DIFFICULTIES,
  DifficultyLevel,
  Language,
  ProvinceRegionInfo,
  RealCityId,
  SpawnConfig,
} from '../types/game';
import { formatCurrencyWan, formatPop } from '../i18n/translations';

interface SetupModalProps {
  open: boolean;
  lang?: Language;
  currentRealCity: RealCityId;
  currentDifficulty: DifficultyLevel;
  provinces?: ProvinceRegionInfo[];
  cities?: CityRegionInfo[];
  includeTaiwan?: boolean;
  currentSpawn?: SpawnConfig | null;
  onPreloadProvinceChunk?: (provinceId: string) => void | Promise<void>;
  onClose: () => void;
  onApply: (
    realCity: RealCityId,
    difficulty: DifficultyLevel,
    seed: number,
    spawn?: SpawnConfig
  ) => void;
  onEnterMapSpawnPicker?: (difficulty: DifficultyLevel) => void;
}

export const SetupModal: React.FC<SetupModalProps> = ({
  open,
  lang = 'zh-Hant',
  currentDifficulty,
  provinces = [],
  cities = [],
  includeTaiwan = false,
  currentSpawn,
  onPreloadProvinceChunk,
  onClose,
  onApply,
  onEnterMapSpawnPicker,
}) => {
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(currentDifficulty);
  const [selectedProvId, setSelectedProvId] = useState<string>(
    currentSpawn?.provinceId ?? 'prov_sh'
  );
  const [selectedCityId, setSelectedCityId] = useState<string>(
    currentSpawn?.cityId ?? 'city_sh'
  );
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    setDifficulty(currentDifficulty);
    if (currentSpawn?.provinceId) {
      setSelectedProvId(currentSpawn.provinceId);
    }
    if (currentSpawn?.cityId) {
      setSelectedCityId(currentSpawn.cityId);
    }
  }, [open, currentDifficulty, currentSpawn?.provinceId, currentSpawn?.cityId]);

  const visibleProvinces = useMemo(() => {
    const q = query.trim();
    return provinces.filter((p) => {
      if (!includeTaiwan && (p.isTaiwan || p.id === 'prov_710000' || p.adcode === '710000')) {
        return false;
      }
      if (!q) return true;
      const matchCity = cities.some((c) => c.provinceId === p.id && c.name.includes(q));
      return p.name.includes(q) || matchCity;
    });
  }, [cities, includeTaiwan, provinces, query]);

  const activeProv = useMemo(
    () =>
      provinces.find((p) => p.id === selectedProvId) ??
      visibleProvinces[0] ??
      provinces.find((p) => p.id === 'prov_sh'),
    [provinces, selectedProvId, visibleProvinces]
  );

  const provCities = useMemo(() => {
    if (!activeProv) return [];
    const list = cities.filter((c) => c.provinceId === activeProv.id);
    return [...list].sort((a, b) => a.distanceKmFromShanghai - b.distanceKmFromShanghai);
  }, [activeProv, cities]);

  const activeCity = useMemo(
    () => provCities.find((c) => c.id === selectedCityId) ?? provCities[0],
    [provCities, selectedCityId]
  );

  if (!open) return null;

  const handleSelectProv = (prov: ProvinceRegionInfo) => {
    setSelectedProvId(prov.id);
    if (!prov.loaded) {
      void onPreloadProvinceChunk?.(prov.id);
    }
    const nextCities = cities.filter((c) => c.provinceId === prov.id);
    if (nextCities.length > 0) {
      setSelectedCityId(nextCities[0].id);
    } else {
      setSelectedCityId('');
    }
  };

  const handleStartWithSelection = () => {
    let spawn: SpawnConfig | undefined;
    if (activeProv) {
      spawn = {
        provinceId: activeProv.id,
        provinceAdcode: activeProv.adcode,
        provinceName: activeProv.name,
        cityId: activeCity?.id ?? activeProv.closestCityId ?? '',
        cityName: activeCity?.name ?? activeProv.name,
        lat: activeCity?.lat ?? activeProv.lat ?? 31.232,
        lon: activeCity?.lon ?? activeProv.lon ?? 121.475,
        wx: activeCity?.x ?? activeProv.x,
        wy: activeCity?.y ?? activeProv.y,
      };
    }
    onApply('shanghai', difficulty, Math.floor(Math.random() * 100000), spawn);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl shadow-[0_20px_50px_rgba(15,23,42,0.16)] overflow-hidden text-slate-900">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">新建規劃 · 選擇出生點與財政難度</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              可於此快速擇城開局，或直接進入全國實景地圖點選任意省市區作為初始都市圈
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[76vh] overflow-y-auto">
          {/* Interactive Map Spawn Picker Callout */}
          {onEnterMapSpawnPicker && (
            <div className="p-4 rounded-xl bg-emerald-50/75 border border-emerald-200 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-950">
                  <Compass className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>在全國地圖上自由點選出生點</span>
                </div>
                <p className="text-xs text-emerald-800/85">
                  縮放平移瀏覽全國 WorldPop 人口熱力與實景省市區邊界，點擊任意地點即時定點開局
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onEnterMapSpawnPicker(difficulty);
                  onClose();
                }}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>進入全國地圖自選出生點</span>
              </button>
            </div>
          )}

          {/* Quick Province & City Selector */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-700">
                快速選擇啟航省市 · 目前選中：
                <span className="text-blue-700 ml-1">
                  {activeProv?.name ?? '上海市'}
                  {activeCity && activeCity.name !== activeProv?.name ? ` · ${activeCity.name}` : ''}
                </span>
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜尋省份或城市..."
                  className="pl-7 pr-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500 w-44"
                />
              </div>
            </div>

            {visibleProvinces.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Provinces List */}
                <div className="border border-slate-200 rounded-lg max-h-44 overflow-y-auto divide-y divide-slate-100 bg-white">
                  {visibleProvinces.map((prov) => {
                    const selected = activeProv?.id === prov.id;
                    return (
                      <button
                        key={prov.id}
                        type="button"
                        onClick={() => handleSelectProv(prov)}
                        className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          selected
                            ? 'bg-blue-50 text-blue-900 font-semibold'
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <span className="truncate">{prov.name}</span>
                        <span className="text-[11px] font-mono-tabular text-slate-400 shrink-0">
                          {prov.provincePopulation ? formatPop(prov.provincePopulation, lang) : `${prov.cityCount ?? 0} 市`}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Cities in Selected Province */}
                <div className="border border-slate-200 rounded-lg max-h-44 overflow-y-auto divide-y divide-slate-100 bg-white">
                  {provCities.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">
                      {activeProv && !activeProv.loaded
                        ? `正在載入 ${activeProv.name} 城市清單...`
                        : '將以該省核心都會區自動開局'}
                    </div>
                  ) : (
                    provCities.map((city) => {
                      const selected = activeCity?.id === city.id;
                      return (
                        <button
                          key={city.id}
                          type="button"
                          onClick={() => setSelectedCityId(city.id)}
                          className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                            selected
                              ? 'bg-emerald-50 text-emerald-900 font-semibold'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span className="truncate">{city.name}</span>
                          <span className="text-[11px] font-mono-tabular text-slate-400 shrink-0">
                            {city.distanceKmFromShanghai > 0 ? `${city.distanceKmFromShanghai} km` : '核心市'}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
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
                    type="button"
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
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-200/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleStartWithSelection}
            className="px-5 py-2 text-xs font-semibold text-white bg-slate-950 hover:bg-slate-800 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>以此城市開局</span>
          </button>
        </div>
      </div>
    </div>
  );
};
