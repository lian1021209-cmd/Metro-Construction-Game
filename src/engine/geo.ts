import type { StyleSpecification } from 'maplibre-gl';
import { BuildingModel, CityMap, CityPoi, RiverPath, RoadSegment } from '../types/game';

export type OpenMapStyleId = 'esri_dark_gray' | 'canvas_vector';

export function lonToNormX(lon: number): number {
  return (lon + 180) / 360;
}

export function latToNormY(lat: number): number {
  const rad = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

export function normXToLon(nx: number): number {
  return nx * 360 - 180;
}

export function normYToLat(ny: number): number {
  const n = Math.PI - 2 * Math.PI * ny;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export interface GeoBounds {
  centerLat: number;
  centerLon: number;
  defaultZoom: number;
  minNx: number;
  maxNx: number;
  minNy: number;
  maxNy: number;
}

export function createGeoBounds(
  centerLat: number,
  centerLon: number,
  defaultZoom: number,
  mapWidth: number,
  mapHeight: number
): GeoBounds {
  const cx = lonToNormX(centerLon);
  const cy = latToNormY(centerLat);
  const worldPxAtDefault = 256 * Math.pow(2, defaultZoom);
  const halfSpanX = mapWidth / (2 * worldPxAtDefault);
  const halfSpanY = mapHeight / (2 * worldPxAtDefault);
  return {
    centerLat,
    centerLon,
    defaultZoom,
    minNx: cx - halfSpanX,
    maxNx: cx + halfSpanX,
    minNy: cy - halfSpanY,
    maxNy: cy + halfSpanY,
  };
}

export function latLonToWorld(
  lat: number,
  lon: number,
  bounds: GeoBounds,
  mapWidth: number,
  mapHeight: number
): { x: number; y: number } {
  const nx = lonToNormX(lon);
  const ny = latToNormY(lat);
  return {
    x: ((nx - bounds.minNx) / (bounds.maxNx - bounds.minNx)) * mapWidth,
    y: ((ny - bounds.minNy) / (bounds.maxNy - bounds.minNy)) * mapHeight,
  };
}

export function worldToLatLon(
  wx: number,
  wy: number,
  bounds: GeoBounds,
  mapWidth: number,
  mapHeight: number
): { lat: number; lon: number } {
  const nx = bounds.minNx + (wx / mapWidth) * (bounds.maxNx - bounds.minNx);
  const ny = bounds.minNy + (wy / mapHeight) * (bounds.maxNy - bounds.minNy);
  return {
    lat: normYToLat(ny),
    lon: normXToLon(nx),
  };
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Free, API-keyless Esri World Dark Gray Base Raster Style for MapLibre GL
 */
export function getEsriDarkGrayStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      esri_dark_gray: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 16,
        attribution: 'Tiles © Esri — Esri, DeLorme, NAVTEQ',
      },
    },
    layers: [
      {
        id: 'esri-dark-gray-bg',
        type: 'background',
        paint: {
          'background-color': '#09111E',
        },
      },
      {
        id: 'esri-dark-gray-base',
        type: 'raster',
        source: 'esri_dark_gray',
        paint: {
          'raster-brightness-min': 0.02,
          'raster-contrast': 0.14,
          'raster-saturation': 0.1,
        },
      },
    ],
  };
}

/**
 * Pure GeoJSON vector river & dark background fallback style (zero external tile dependencies)
 */
export function getPureCanvasGeoStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'pure-dark-bg',
        type: 'background',
        paint: {
          'background-color': '#091322',
        },
      },
    ],
  };
}

/**
 * Converts a RiverPath centerline into a closed GeoJSON-compatible polygon ring in world coordinates
 * so river channels (Huangpu River, Tamsui River, etc.) render smoothly as filled vector polygons.
 */
export function riverPathToPolygonRing(river: RiverPath): { x: number; y: number }[] {
  const pts = river.points;
  if (pts.length < 2) return [];
  const halfW = Math.max(0.7, river.width * 0.5);
  const leftSide: { x: number; y: number }[] = [];
  const rightSide: { x: number; y: number }[] = [];

  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.max(0.001, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    leftSide.push({ x: pts[i].x + nx * halfW, y: pts[i].y + ny * halfW });
    rightSide.push({ x: pts[i].x - nx * halfW, y: pts[i].y - ny * halfW });
  }

  return [...leftSide, ...rightSide.reverse()];
}

export interface RiverGeoJsonCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: { id: string; name: string };
    geometry: {
      type: 'Polygon';
      coordinates: number[][][];
    };
  }>;
}

export function buildCityRiversGeoJson(map: CityMap): RiverGeoJsonCollection {
  if (!map.geoBounds) {
    return { type: 'FeatureCollection', features: [] };
  }
  const geo = map.geoBounds;
  const features = map.rivers
    .map((rv) => {
      const ringWorld = riverPathToPolygonRing(rv);
      if (ringWorld.length < 4) return null;
      const coords = ringWorld.map((p) => {
        const ll = worldToLatLon(p.x, p.y, geo, map.width, map.height);
        return [ll.lon, ll.lat];
      });
      coords.push(coords[0]);
      return {
        type: 'Feature' as const,
        properties: { id: rv.id, name: rv.name },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [coords],
        },
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  return { type: 'FeatureCollection', features };
}

export interface OverpassGeoResult {
  roads: RoadSegment[];
  buildings: BuildingModel[];
  pois: CityPoi[];
}

const overpassCache = new Map<string, OverpassGeoResult>();

/**
 * Fetches real arterial roads, building footprints, and major landmarks around the city core
 * from OpenStreetMap Overpass API so 2.5D models, POIs, and road tooltips match real streets.
 */
export async function fetchOverpassCityGeometry(
  bounds: GeoBounds,
  mapWidth: number,
  mapHeight: number
): Promise<OverpassGeoResult | null> {
  const key = `${bounds.centerLat.toFixed(3)}_${bounds.centerLon.toFixed(3)}`;
  const cached = overpassCache.get(key);
  if (cached) return cached;

  const dLatRoad = 0.14;
  const dLonRoad = 0.18;
  const dLatBld = 0.024;
  const dLonBld = 0.03;

  const query = `
[out:json][timeout:14];
(
  way["highway"~"motorway|trunk|primary|secondary"](${bounds.centerLat - dLatRoad},${bounds.centerLon - dLonRoad},${bounds.centerLat + dLatRoad},${bounds.centerLon + dLonRoad});
  way["building"](${bounds.centerLat - dLatBld},${bounds.centerLon - dLonBld},${bounds.centerLat + dLatBld},${bounds.centerLon + dLonBld});
  node["amenity"~"university|hospital"]["name"](${bounds.centerLat - dLatRoad},${bounds.centerLon - dLonRoad},${bounds.centerLat + dLatRoad},${bounds.centerLon + dLonRoad});
  node["aeroway"="terminal"]["name"](${bounds.centerLat - 0.35},${bounds.centerLon - 0.45},${bounds.centerLat + 0.35},${bounds.centerLon + 0.45});
);
out body 1800;
>;
out skel qt;
`.trim();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const json = (await res.json()) as {
      elements: Array<{
        type: 'node' | 'way';
        id: number;
        lat?: number;
        lon?: number;
        nodes?: number[];
        tags?: Record<string, string>;
      }>;
    };

    const nodeMap = new Map<number, { x: number; y: number }>();
    for (const el of json.elements) {
      if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
        nodeMap.set(el.id, latLonToWorld(el.lat, el.lon, bounds, mapWidth, mapHeight));
      }
    }

    const roads: RoadSegment[] = [];
    const buildings: BuildingModel[] = [];
    const pois: CityPoi[] = [];
    const seenPoiNames = new Set<string>();

    for (const el of json.elements) {
      if (el.type === 'node' && el.tags?.name && el.lat !== undefined && el.lon !== undefined) {
        const name = el.tags['name:zh-Hant'] || el.tags['name:zh-TW'] || el.tags['name:zh'] || el.tags.name;
        if (!seenPoiNames.has(name) && pois.length < 28) {
          seenPoiNames.add(name);
          const pt = latLonToWorld(el.lat, el.lon, bounds, mapWidth, mapHeight);
          const kind: CityPoi['kind'] =
            el.tags.aeroway === 'terminal'
              ? 'airport'
              : el.tags.amenity === 'hospital'
              ? 'hospital'
              : 'university';
          pois.push({ id: `osm_poi_${el.id}`, name, kind, x: Math.round(pt.x), y: Math.round(pt.y) });
        }
        continue;
      }

      if (el.type !== 'way' || !el.nodes || el.nodes.length < 2) continue;

      if (el.tags?.highway) {
        const roadName =
          el.tags['name:zh-Hant'] ||
          el.tags['name:zh-TW'] ||
          el.tags['name:zh'] ||
          el.tags.name ||
          el.tags.ref ||
          '城市主幹道';
        const isPrimary = el.tags.highway === 'motorway' || el.tags.highway === 'trunk' || el.tags.highway === 'primary';
        for (let i = 0; i < el.nodes.length - 1; i++) {
          const p1 = nodeMap.get(el.nodes[i]);
          const p2 = nodeMap.get(el.nodes[i + 1]);
          if (!p1 || !p2) continue;
          roads.push({
            id: `osm_rd_${el.id}_${i}`,
            name: roadName,
            x1: p1.x,
            y1: p1.y,
            x2: p2.x,
            y2: p2.y,
            tier: el.tags.highway === 'motorway' ? 'highway' : isPrimary ? 'arterial' : 'secondary',
            isArterial: isPrimary,
            capacity: el.tags.highway === 'motorway' ? 1800 : isPrimary ? 1200 : 800,
            saturation: 0.12 + ((el.id % 30) / 100),
          });
        }
      } else if (el.tags?.building && buildings.length < 480) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const nid of el.nodes) {
          const pt = nodeMap.get(nid);
          if (!pt) continue;
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        }
        const bw = Math.min(44, Math.max(5, maxX - minX));
        const bd = Math.min(44, Math.max(5, maxY - minY));
        if (isFinite(minX) && bw >= 4 && bd >= 4) {
          const levels = Number(el.tags['building:levels'] || 0);
          const height = levels > 0 ? Math.min(95, 10 + levels * 3.8) : 14 + (el.id % 26);
          const isTall = height > 40;
          buildings.push({
            id: `osm_bld_${el.id}`,
            x: Math.round(minX),
            y: Math.round(minY),
            w: Math.round(bw),
            d: Math.round(bd),
            h: Number.isFinite(height) ? Math.round(height) : 18,
            kind: isTall ? 'cbd' : el.tags.building === 'industrial' ? 'ind' : 'res',
            lit: 0.4 + ((el.id % 60) / 100),
          });
        }
      }
    }

    buildings.sort((a, b) => a.y + a.d - (b.y + b.d));
    const result = { roads, buildings, pois };
    overpassCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

const SIMP_CHARS =
  '东广园学医门华兴丰宝汇宁长闸静杨闵卢贤岛湾港泾黄龙凤万达国际铁车机体育电视楼厦旧红绿蓝银铜临滨边云阳阴枫树叶观庵阁台乡卫场厂铺号弄环线纵横复乐寿庆顺强胜永泰浅宽圆双单两头顶内后发飞跃进开闭启辉雾农术数经贸运输邮讯网络信息创新设规划务安环态旅游休闲娱乐购物餐饮宾馆饭茶商场百货中心基地社区花园别墅公寓家园庭府邸桥坝码航库变电钢铁机械纺织造船枢纽总分张赵刘陈吴孙马胡林罗郑谢韩冯邓曹萧袁潘蒋蔡余魏苏吕任姚沈钟姜崔谭陆汪廖韦贾傅邹颜倪温芦鲁葛毕聂齐庄沪粤闽豫鄂湘赣川渝贵陕辽联证券保险资进税务员会政法院检公消队邮动广报图博美展馆宫青职师医复济财语海电设研药诊福敬殡仪纪森植动物游乐迪欢世外豫庙佛真教圣堂思伦爱武康东明环国恒久港罗福凯梦象合百联八第新大悦万仲印松沪西藏河汉津京苏淀';
const TRAD_CHARS =
  '東廣園學醫門華興豐寶匯寧長閘靜楊閔盧賢島灣港涇黃龍鳳萬達國際鐵車機體育電視樓廈舊紅綠藍銀銅臨濱邊雲陽陰楓樹葉觀庵閣臺鄉衛場廠鋪號弄環線縱橫復樂壽慶順強勝永泰淺寬圓雙單兩頭頂內後發飛躍進開閉啟輝霧農術數經貿運輸郵訊網絡信息創新設規劃務安環態旅遊休閒娛樂購物餐飲賓館飯茶商場百貨中心基地社區花園別墅公寓家園庭府邸橋壩碼航庫變電鋼鐵機械紡織造船樞紐總分張趙劉陳吳孫馬胡林羅鄭謝韓馮鄧曹蕭袁潘蔣蔡餘魏蘇呂任姚沈鍾姜崔譚陸汪廖韋賈傅鄒顏倪溫蘆魯葛畢聶齊莊滬粵閩豫鄂湘贛川渝貴陝遼聯證券保險資進稅務員會政法院檢公消隊郵動廣報圖博美展館宮青職師醫復濟財語海電設研藥診福敬殯儀紀森植動物遊樂迪歡世外豫廟佛真教聖堂思倫愛武康東明環國恆久港羅福凱夢象合百聯八第新大悅萬仲印松滬西藏河漢津京蘇澱';

const S2T_MAP = (() => {
  const m = new Map<string, string>();
  const sArr = Array.from(SIMP_CHARS);
  const tArr = Array.from(TRAD_CHARS);
  for (let i = 0; i < Math.min(sArr.length, tArr.length); i++) {
    if (sArr[i] !== tArr[i]) m.set(sArr[i], tArr[i]);
  }
  // Essential extras that differ cleanly in place names
  const extras: [string, string][] = [
    ['区', '區'], ['镇', '鎮'], ['村', '村'], ['里', '里'], ['街', '街'], ['路', '路'],
    ['桥', '橋'], ['庙', '廟'], ['寺', '寺'], ['园', '園'], ['场', '場'], ['馆', '館'],
    ['学', '學'], ['院', '院'], ['医', '醫'], ['站', '站'], ['港', '港'], ['湾', '灣'],
    ['滩', '灘'], ['闸', '閘'], ['汇', '匯'], ['宁', '寧'], ['卢', '盧'], ['闵', '閔'],
    ['杨', '楊'], ['松', '松'], ['嘉', '嘉'], ['青', '青'], ['浦', '浦'], ['奉', '奉'],
    ['贤', '賢'], ['崇', '崇'], ['宝', '寶'], ['东', '東'], ['西', '西'], ['南', '南'],
    ['北', '北'], ['中', '中'], ['大', '大'], ['小', '小'], ['老', '老'], ['新', '新'],
    ['泽', '澤'], ['练', '練'], ['朱', '朱'], ['泾', '涇'], ['罗', '羅'], ['吴', '吳'],
    ['淞', '淞'], ['沪', '滬'], ['屿', '嶼'], ['鼓', '鼓'], ['浪', '浪'], ['寿', '壽'],
    ['宁', '寧'], ['屿', '嶼'], ['张', '張'], ['陈', '陳'], ['周', '周'], ['唐', '唐'],
    ['顾', '顧'], ['马', '馬'], ['陆', '陸'], ['万', '萬'], ['达', '達'], ['华', '華'],
    ['兴', '興'], ['丰', '豐'], ['隆', '隆'], ['盛', '盛'], ['联', '聯'], ['悦', '悅'],
    ['凯', '凱'], ['瑞', '瑞'], ['国', '國'], ['际', '際'], ['亚', '亞'], ['欧', '歐'],
    ['环', '環'], ['线', '線'], ['道', '道'], ['号', '號'], ['楼', '樓'], ['厦', '廈'],
    ['滨', '濱'], ['边', '邊'], ['临', '臨'], ['云', '雲'], ['阳', '陽'], ['阴', '陰'],
    ['铁', '鐵'], ['车', '車'], ['机', '機'], ['电', '電'], ['网', '網'], ['体', '體'],
    ['育', '育'], ['观', '觀'], ['圣', '聖'], ['堂', '堂'], ['宫', '宮'], ['阁', '閣'],
    ['亭', '亭'], ['台', '臺'], ['塔', '塔'], ['碑', '碑'], ['庄', '莊'], ['厂', '廠'],
    ['广', '廣'], ['开', '開'], ['关', '關'], ['门', '門'], ['卫', '衛'], ['乐', '樂'],
    ['庆', '慶'], ['顺', '順'], ['强', '強'], ['胜', '勝'], ['浅', '淺'], ['宽', '寬'],
    ['圆', '圓'], ['双', '雙'], ['单', '單'], ['头', '頭'], ['顶', '頂'], ['内', '內'],
    ['后', '後'], ['发', '發'], ['飞', '飛'], ['跃', '躍'], ['进', '進'], ['启', '啟'],
    ['辉', '輝'], ['雾', '霧'], ['农', '農'], ['术', '術'], ['数', '數'], ['经', '經'],
    ['贸', '貿'], ['运', '運'], ['输', '輸'], ['邮', '郵'], ['讯', '訊'], ['络', '絡'],
    ['创', '創'], ['设', '設'], ['规', '規'], ['划', '劃'], ['务', '務'], ['态', '態'],
    ['游', '遊'], ['闲', '閒'], ['娱', '娛'], ['购', '購'], ['饮', '飲'], ['宾', '賓'],
    ['饭', '飯'], ['商', '商'], ['货', '貨'], ['社', '社'], ['别', '別'], ['庭', '庭'],
    ['坝', '壩'], ['码', '碼'], ['库', '庫'], ['变', '變'], ['钢', '鋼'], ['织', '織'],
    ['枢', '樞'], ['纽', '紐'], ['总', '總'], ['赵', '趙'], ['刘', '劉'], ['孙', '孫'],
    ['谢', '謝'], ['韩', '韓'], ['冯', '馮'], ['邓', '鄧'], ['萧', '蕭'], ['蒋', '蔣'],
    ['苏', '蘇'], ['吕', '呂'], ['钟', '鍾'], ['谭', '譚'], ['韦', '韋'], ['贾', '賈'],
    ['邹', '鄒'], ['颜', '顏'], ['温', '溫'], ['芦', '蘆'], ['鲁', '魯'], ['毕', '畢'],
    ['聂', '聶'], ['齐', '齊'], ['粤', '粵'], ['闽', '閩'], ['赣', '贛'], ['贵', '貴'],
    ['陕', '陝'], ['辽', '遼'], ['证', '證'], ['险', '險'], ['资', '資'], ['税', '稅'],
    ['员', '員'], ['会', '會'], ['检', '檢'], ['动', '動'], ['报', '報'], ['图', '圖'],
    ['展', '展'], ['览', '覽'], ['职', '職'], ['复', '復'], ['济', '濟'], ['财', '財'],
    ['语', '語'], ['研', '研'], ['药', '藥'], ['诊', '診'], ['仪', '儀'], ['纪', '紀'],
    ['欢', '歡'], ['伦', '倫'], ['爱', '愛'], ['梦', '夢'], ['淀', '澱'],
  ];
  for (const [s, t] of extras) m.set(s, t);
  return m;
})();

export function toTraditionalPlaceName(text: string): string {
  return Array.from(text)
    .map((ch) => S2T_MAP.get(ch) ?? ch)
    .join('');
}

export interface ReverseGeocodePlace {
  road?: string;
  neighborhood?: string;
  subdistrict?: string;
  landmark?: string;
}

const reverseGeocodeCache = new Map<string, ReverseGeocodePlace | null>();

export async function reverseGeocodeStationPlace(
  lat: number,
  lon: number
): Promise<ReverseGeocodePlace | null> {
  const key = `${lat.toFixed(4)}_${lon.toFixed(4)}`;
  if (reverseGeocodeCache.has(key)) {
    return reverseGeocodeCache.get(key) ?? null;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&zoom=17&accept-language=zh-TW`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      category?: string;
      type?: string;
      name?: string;
      address?: Record<string, string>;
    };

    const addr = data.address ?? {};
    const road = addr.road || addr.pedestrian || addr.footway;
    const neighborhood =
      addr.quarter || addr.neighbourhood || addr.residential || addr.village || addr.hamlet;
    const subdistrict = addr.town || addr.suburb;

    let landmark: string | undefined;
    const isMajorPoiCategory =
      data.category === 'tourism' ||
      data.category === 'leisure' ||
      data.category === 'historic' ||
      data.category === 'railway' ||
      data.category === 'aeroway' ||
      (data.category === 'amenity' &&
        (data.type === 'university' ||
          data.type === 'college' ||
          data.type === 'hospital' ||
          data.type === 'library' ||
          data.type === 'theatre' ||
          data.type === 'marketplace'));

    if (data.name && isMajorPoiCategory && data.name !== road) {
      landmark = data.name;
    }

    const result: ReverseGeocodePlace = {
      road: road ? toTraditionalPlaceName(road) : undefined,
      neighborhood: neighborhood ? toTraditionalPlaceName(neighborhood) : undefined,
      subdistrict: subdistrict ? toTraditionalPlaceName(subdistrict) : undefined,
      landmark: landmark ? toTraditionalPlaceName(landmark) : undefined,
    };

    reverseGeocodeCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

