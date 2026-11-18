import React, { useMemo, useState } from 'react';
import {
  X,
  Home,
  Users,
  Smile,
  Search,
  MessageCircle,
  Repeat2,
  Heart,
  BarChart2,
  MapPin,
  TrainFront,
} from 'lucide-react';
import {
  CityMap,
  Language,
  SimulationStats,
  Station,
  TransitLine,
} from '../types/game';
import { t } from '../i18n/translations';

interface MetroCircleModalProps {
  open: boolean;
  onClose: () => void;
  lang: Language;
  map: CityMap;
  year: number;
  day: number;
  stats: SimulationStats;
  stations: Station[];
  lines: TransitLine[];
  onLocateWorld: (x: number, y: number) => void;
  onInspectLine: (lineId: string) => void;
}

interface CitizenPost {
  id: string;
  author: string;
  handle: string;
  badgeColor: string;
  badgeChar: string;
  category: 'complaint' | 'praise' | 'suggestion';
  tag: string;
  body: string;
  replies: number;
  reposts: number;
  likes: number;
  views: string;
  targetXY?: { x: number; y: number };
  targetLineId?: string;
}

export const MetroCircleModal: React.FC<MetroCircleModalProps> = ({
  open,
  onClose,
  lang,
  map,
  year,
  day,
  stats,
  stations,
  lines,
  onLocateWorld,
  onInspectLine,
}) => {
  const [nav, setNav] = useState<'home' | 'following' | 'satisfaction'>('home');
  const [catTab, setCatTab] = useState<'all' | 'complaint' | 'praise' | 'suggestion'>('all');
  const [query, setQuery] = useState('');
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  const posts = useMemo<CitizenPost[]>(() => {
    const liveStations = stations.filter((s) => !s.isDraft);
    const liveLines = lines.filter((l) => !l.isDraft && l.stationIds.length >= 2);
    const list: CitizenPost[] = [];

    let bestUncovered = { x: map.width * 0.5, y: map.height * 0.35, pop: 0 };
    for (const c of map.cells) {
      if (!c.coveredByMetro && c.population + c.jobs > bestUncovered.pop) {
        bestUncovered = {
          x: (c.gx + 0.5) * map.cellSize,
          y: (c.gy + 0.5) * map.cellSize,
          pop: c.population + c.jobs,
        };
      }
    }

    const nearestPoi = map.pois[0]?.name ?? map.districts[0]?.name ?? map.name;
    list.push({
      id: 'post_cov_gap',
      author: lang === 'en' ? 'Morning Commuter' : `${nearestPoi}附近居民`,
      handle: '@home_5059 · 4d',
      badgeColor: '#EA580C',
      badgeChar: '上',
      category: 'complaint',
      tag: lang === 'en' ? '#Coverage' : '#覆蓋',
      body:
        lang === 'en'
          ? `So many residents live around here, yet the nearest metro station is over a 20-minute walk! When will a line reach our neighborhood?`
          : `這帶住了這麼多人，最近的地鐵站還要走二十多分鐘，什麼時候能修到我們這兒？`,
      replies: 70,
      reposts: 139,
      likes: 630,
      views: '1.7萬',
      targetXY: { x: bestUncovered.x, y: bestUncovered.y },
    });

    const topLine = liveLines[liveLines.length - 1] ?? liveLines[0];
    if (topLine) {
      list.push({
        id: 'post_line_praise',
        author: lang === 'en' ? 'Daily Rider' : '通勤族',
        handle: '@commuter_7276 · 2d',
        badgeColor: '#059669',
        badgeChar: '通',
        category: 'praise',
        tag: `#${topLine.name.split(' ')[0]}`,
        body:
          lang === 'en'
            ? `Taking ${topLine.name} every morning is far more reliable than driving in peak traffic!`
            : `每天坐 ${topLine.name} 通勤，比以前開車穩定多了，尖峰準點又省時。`,
        replies: 66,
        reposts: 111,
        likes: 567,
        views: '1.4萬',
        targetLineId: topLine.id,
      });
    }

    const busyStation = [...liveStations].sort((a, b) => b.waiting.length - a.waiting.length)[0];
    if (busyStation) {
      list.push({
        id: 'post_crowded_st',
        author: lang === 'en' ? 'Station Watcher' : '換乘觀察員',
        handle: '@transit_fan_1614 · 6h',
        badgeColor: '#D97706',
        badgeChar: '站',
        category: busyStation.congestionLoad > 0.75 ? 'complaint' : 'suggestion',
        tag: lang === 'en' ? '#Transfer' : '#換乘',
        body:
          busyStation.congestionLoad > 0.75
            ? lang === 'en'
              ? `${busyStation.name} platform feels packed during peak hours—consider upgrading station size or shortening headway!`
              : `${busyStation.name} 尖峰候車人潮爆滿，建議擴建月台規模或縮短發車班距疏運！`
            : lang === 'en'
            ? `If ${busyStation.name} adds express-stop service or through-running connections, cross-city transfers would be even faster.`
            : `如果在 ${busyStation.name} 開設快車或貫通直通運轉，跨區轉乘會方便許多。`,
        replies: 42,
        reposts: 58,
        likes: 312,
        views: '9.2千',
        targetXY: { x: busyStation.x, y: busyStation.y },
      });
    }

    list.push({
      id: 'post_suggestion_tod',
      author: lang === 'en' ? 'Urban Planner' : '軌道規劃迷',
      handle: '@tod_planner · 1d',
      badgeColor: '#2563EB',
      badgeChar: '規',
      category: 'suggestion',
      tag: lang === 'en' ? '#NewStation' : '#新站',
      body:
        lang === 'en'
          ? `Adding infill stations directly along busy existing corridors boosts 15-min walk access without building a brand new tunnel.`
          : `在既有骨幹軌道中段直接插入加密車站，能立刻把步行 15 分鐘覆蓋率推高一大截！`,
      replies: 29,
      reposts: 44,
      likes: 284,
      views: '7.5千',
    });

    return list;
  }, [stations, lines, map, lang]);

  if (!open) return null;

  const satisfiedPct = Math.min(85, Math.max(15, Math.round(stats.satisfaction * 0.72)));
  const neutralPct = Math.min(60, Math.max(10, 90 - satisfiedPct));
  const unhappyPct = Math.max(5, 100 - satisfiedPct - neutralPct);
  const month = Math.min(12, Math.floor((day - 1) / 30) + 1);

  const visiblePosts = posts.filter((p) => {
    if (catTab !== 'all' && p.category !== catTab) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return (
        p.body.toLowerCase().includes(q) ||
        p.tag.toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="w-full max-w-6xl h-[86vh] bg-white border border-slate-200 rounded-xl shadow-xl flex overflow-hidden text-slate-900">
        {/* Left Nav */}
        <aside className="w-48 shrink-0 bg-slate-50 border-r border-slate-200 p-4 flex flex-col justify-between">
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-base font-bold text-slate-900">
              <TrainFront className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{t(lang, 'metroCircleTitle')}</span>
            </div>

            <nav className="space-y-1 text-xs">
              {(
                [
                  { id: 'home', label: t(lang, 'mcFeedHome'), icon: <Home className="w-4 h-4" /> },
                  { id: 'following', label: t(lang, 'mcFeedFollowing'), icon: <Users className="w-4 h-4" /> },
                  { id: 'satisfaction', label: t(lang, 'mcFeedSatisfaction'), icon: <Smile className="w-4 h-4" /> },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  onClick={() => setNav(item.id)}
                  className={`w-full px-3 py-2.5 rounded-lg flex items-center gap-2.5 font-semibold transition-colors ${
                    nav === item.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </div>

          <button
            onClick={onClose}
            className="w-full py-2 px-3 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-xs font-medium text-slate-800 transition-colors"
          >
            {t(lang, 'backToCity')}
          </button>
        </aside>

        {/* Center Feed */}
        <section className="flex-1 flex flex-col border-r border-slate-200 overflow-hidden bg-white">
          <div className="px-6 py-4 border-b border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2.5">
                <h2 className="text-base font-bold text-slate-900">{t(lang, 'mcFeedHome')}</h2>
                <span className="text-xs text-slate-500 font-mono-tabular">
                  {map.name} · {year}/{month}
                </span>
              </div>
              <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg lg:hidden">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1 text-xs">
              {(
                [
                  { id: 'all', label: t(lang, 'tabForYou') },
                  { id: 'complaint', label: t(lang, 'tabComplaints') },
                  { id: 'praise', label: t(lang, 'tabPraise') },
                  { id: 'suggestion', label: t(lang, 'tabSuggestions') },
                ] as const
              ).map((tb) => (
                <button
                  key={tb.id}
                  onClick={() => setCatTab(tb.id)}
                  className={`py-2 text-center font-semibold border-b-2 transition-colors ${
                    catTab === tb.id
                      ? 'border-blue-600 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {tb.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
            {/* Official Monthly Poll */}
            {nav !== 'following' && (
              <div className="p-5 space-y-3 bg-blue-50/40">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center text-white shrink-0">
                    <TrainFront className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      {lang === 'en' ? 'Metro Official' : '都市地鐵官方'} ·{' '}
                      <span className="text-slate-500 font-normal">@metro_official</span>
                    </div>
                    <div className="text-xs text-slate-700 mt-0.5">
                      {lang === 'en'
                        ? `How satisfied are you with this month's service? Current rating: ${stats.satisfaction}/100.`
                        : `你對本月的地鐵服務滿意嗎？本月乘客滿意度 ${stats.satisfaction} 分，感謝每一位乘客的反饋！`}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs font-mono-tabular pl-12">
                  {[
                    { label: lang === 'en' ? 'Satisfied' : '滿意', pct: satisfiedPct, cls: 'bg-blue-100' },
                    { label: lang === 'en' ? 'Neutral' : '一般', pct: neutralPct, cls: 'bg-slate-200/80' },
                    { label: lang === 'en' ? 'Unsatisfied' : '不滿意', pct: unhappyPct, cls: 'bg-slate-100' },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="relative h-8 rounded-lg bg-white border border-slate-200 overflow-hidden flex items-center justify-between px-3"
                    >
                      <div className={`absolute inset-y-0 left-0 ${row.cls}`} style={{ width: `${row.pct}%` }} />
                      <span className="relative z-10 text-slate-800 font-sans font-medium">{row.label}</span>
                      <span className="relative z-10 text-slate-900 font-semibold">{row.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dynamic Citizen Posts */}
            {visiblePosts.map((post) => {
              const liked = likedIds.has(post.id);
              return (
                <div key={post.id} className="p-5 flex gap-3.5 hover:bg-slate-50/70 transition-colors">
                  <div
                    className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: post.badgeColor }}
                  >
                    {post.badgeChar}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs">
                        <span className="font-semibold text-slate-900">{post.author}</span>{' '}
                        <span className="text-slate-500">{post.handle}</span>
                      </div>
                      <span
                        className={`text-[11px] font-semibold ${
                          post.category === 'complaint'
                            ? 'text-rose-600'
                            : post.category === 'praise'
                            ? 'text-emerald-700'
                            : 'text-blue-700'
                        }`}
                      >
                        {post.tag}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed">{post.body}</p>
                    <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 font-mono-tabular">
                      <div className="flex items-center gap-5">
                        <span className="flex items-center gap-1">
                          <MessageCircle className="w-3.5 h-3.5" />
                          {post.replies}
                        </span>
                        <span className="flex items-center gap-1">
                          <Repeat2 className="w-3.5 h-3.5" />
                          {post.reposts}
                        </span>
                        <button
                          onClick={() =>
                            setLikedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(post.id)) next.delete(post.id);
                              else next.add(post.id);
                              return next;
                            })
                          }
                          className={`flex items-center gap-1 transition-colors ${
                            liked ? 'text-rose-600 font-semibold' : 'hover:text-rose-600'
                          }`}
                        >
                          <Heart className={`w-3.5 h-3.5 ${liked ? 'fill-current' : ''}`} />
                          {post.likes + (liked ? 1 : 0)}
                        </button>
                        <span className="flex items-center gap-1">
                          <BarChart2 className="w-3.5 h-3.5" />
                          {post.views}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 font-sans">
                        {post.targetXY && (
                          <button
                            onClick={() => {
                              onLocateWorld(post.targetXY!.x, post.targetXY!.y);
                              onClose();
                            }}
                            className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-medium flex items-center gap-1 transition-colors"
                          >
                            <MapPin className="w-3 h-3 text-blue-600" />
                            <span>{t(lang, 'locateBtn')}</span>
                          </button>
                        )}
                        {post.targetLineId && (
                          <button
                            onClick={() => {
                              onClose();
                              onInspectLine(post.targetLineId!);
                            }}
                            className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-medium flex items-center gap-1 transition-colors"
                          >
                            <TrainFront className="w-3 h-3 text-emerald-600" />
                            <span>{t(lang, 'viewLineBtn')}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right Sidebar: Satisfaction + Trending Topics */}
        <aside className="hidden lg:flex w-72 shrink-0 flex-col p-4 space-y-4 bg-slate-50">
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={lang === 'en' ? 'Search #topics...' : '搜尋動態或 #話題'}
                className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
              />
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-200/70 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2">
            <div className="text-xs text-slate-500 font-medium">{t(lang, 'residentSatisfaction')}</div>
            <div className="flex items-center gap-3">
              <Smile className="w-6 h-6 text-emerald-600 shrink-0" />
              <div className="text-2xl font-bold font-mono-tabular text-slate-900">
                {stats.satisfaction} <span className="text-xs text-slate-400 font-normal">/ 100</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3 flex-1">
            <div className="text-sm font-semibold text-slate-900">{t(lang, 'trendingTopics')}</div>
            <div className="space-y-1.5 text-xs">
              {[
                { rank: 1, tag: lang === 'en' ? '#Coverage' : '#覆蓋', meta: '3 · 1,326' },
                { rank: 2, tag: lang === 'en' ? '#NewStation' : '#新站', meta: '3 · 998' },
                { rank: 3, tag: lang === 'en' ? '#Transfer' : '#換乘', meta: '2 · 698' },
                { rank: 4, tag: lang === 'en' ? '#Traffic' : '#堵車', meta: '2 · 652' },
                { rank: 5, tag: `#${lines[0]?.name.split(' ')[0] ?? 'L1'}`, meta: '3 · 610' },
              ].map((item) => (
                <button
                  key={item.rank}
                  onClick={() => setQuery(item.tag.replace('#', ''))}
                  className="w-full text-left hover:bg-slate-50 p-2 rounded-lg transition-colors"
                >
                  <div className="text-[10px] text-slate-400">{item.rank}. {lang === 'en' ? 'Trending' : '地鐵熱議'}</div>
                  <div className="font-semibold text-slate-900 mt-0.5">{item.tag}</div>
                  <div className="text-[10px] text-slate-500 font-mono-tabular">{item.meta}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
