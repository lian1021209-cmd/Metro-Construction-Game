import { CityPoi } from '../types/game';
import rawBundle from './neighborGeoBundle.json';
import { NEIGHBOR_PLACES_WGS84 } from './neighborPlaces';

export { NEIGHBOR_PLACES_WGS84 };

export interface NeighborProvinceGeo {
  id: string;
  adcode: string;
  name: string;
  gatewayCenter: [number, number];
  unlockCostWan: number;
  closestCityId: string;
  description: string;
  rings: [number, number][][];
}

export interface NeighborCityGeo {
  id: string;
  adcode: string;
  name: string;
  provinceId: string;
  center: [number, number];
  unlockCostWan: number;
  isClosestToShanghai: boolean;
  closestDistrictId: string;
  distanceKmFromShanghai: number;
  adjacentCityIds: string[];
  rings: [number, number][][];
}

export interface NeighborDistrictGeo {
  id: string;
  adcode: string;
  name: string;
  provinceId: string;
  provinceName: string;
  cityId: string;
  cityName: string;
  center: [number, number];
  radius: number;
  unlockCostWan: number;
  growthMultiplier: number;
  distanceOrder: number;
  prereqDistrictId?: string;
  adjacentDistrictIds: string[];
  isCityClosestToShanghai: boolean;
  rings: [number, number][][];
}

interface RawNeighborBundle {
  provinces: NeighborProvinceGeo[];
  cities: NeighborCityGeo[];
  districts: NeighborDistrictGeo[];
}

const bundle = rawBundle as RawNeighborBundle;

export const NEIGHBOR_PROVINCES_WGS84: NeighborProvinceGeo[] = bundle.provinces;
export const NEIGHBOR_CITIES_WGS84: NeighborCityGeo[] = bundle.cities;
export const NEIGHBOR_DISTRICTS_WGS84: NeighborDistrictGeo[] = bundle.districts;

// High-precision major lakes & rivers across Jiangsu & Zhejiang
export const TAIHU_LAKE_POLY_WGS84: [number, number][] = [
  [31.515, 120.165],
  [31.465, 120.285],
  [31.365, 120.385],
  [31.245, 120.435],
  [31.115, 120.475],
  [30.985, 120.425],
  [30.935, 120.295],
  [30.955, 120.125],
  [31.025, 119.995],
  [31.155, 119.965],
  [31.295, 119.945],
  [31.415, 120.035],
  [31.485, 120.115],
];

export const HONGZE_LAKE_POLY_WGS84: [number, number][] = [
  [33.485, 118.425],
  [33.465, 118.805],
  [33.245, 118.925],
  [33.095, 118.695],
  [33.145, 118.355],
  [33.345, 118.295],
];

export const GAOYOU_LAKE_POLY_WGS84: [number, number][] = [
  [32.985, 119.225],
  [32.945, 119.445],
  [32.725, 119.415],
  [32.715, 119.205],
  [32.865, 119.185],
];

export const QIANDAO_LAKE_POLY_WGS84: [number, number][] = [
  [29.665, 118.785],
  [29.645, 119.045],
  [29.485, 119.025],
  [29.455, 118.765],
  [29.565, 118.695],
];

export const QIANTANG_RIVER_WGS84: [number, number][] = [
  [29.885, 119.865],
  [30.085, 120.035],
  [30.145, 120.085],
  [30.195, 120.145],
  [30.225, 120.205],
  [30.265, 120.275],
  [30.315, 120.365],
  [30.345, 120.485],
  [30.345, 120.665],
  [30.385, 120.855],
];

export const YANGTZE_RIVER_WGS84: [number, number][] = [
  [31.825, 118.545],
  [32.065, 118.715],
  [32.165, 118.985],
  [32.225, 119.445],
  [32.245, 119.855],
  [32.015, 120.285],
  [31.985, 120.585],
  [31.845, 120.985],
  [31.695, 121.325],
];

export interface NeighborUrbanCenter {
  lat: number;
  lon: number;
  radiusNorm: number;
  type: 'cbd' | 'res' | 'ind';
}

// High-precision zoning across ALL 185 neighbor districts + major metropolitan CBDs & tech/port parks
const MAJOR_METRO_CORES: NeighborUrbanCenter[] = [
  // Suzhou & Kunshan
  { lat: 31.318, lon: 120.685, radiusNorm: 0.028, type: 'cbd' }, // Suzhou SIP Jinji Lake
  { lat: 31.312, lon: 120.618, radiusNorm: 0.028, type: 'cbd' }, // Suzhou Gusu
  { lat: 31.298, lon: 120.556, radiusNorm: 0.022, type: 'cbd' }, // Suzhou SND Shishan
  { lat: 31.385, lon: 120.965, radiusNorm: 0.024, type: 'cbd' }, // Kunshan Yushan
  { lat: 31.298, lon: 121.104, radiusNorm: 0.018, type: 'res' }, // Huaqiao
  { lat: 31.456, lon: 121.128, radiusNorm: 0.020, type: 'ind' }, // Taicang
  // Wuxi & Changzhou & Nantong
  { lat: 31.576, lon: 120.298, radiusNorm: 0.028, type: 'cbd' }, // Wuxi Liangxi CBD
  { lat: 31.522, lon: 120.365, radiusNorm: 0.022, type: 'ind' }, // Wuxi Xinwu
  { lat: 31.778, lon: 119.969, radiusNorm: 0.026, type: 'cbd' }, // Changzhou CBD
  { lat: 32.011, lon: 120.892, radiusNorm: 0.026, type: 'cbd' }, // Nantong Chongchuan
  // Nanjing & Central/North Jiangsu
  { lat: 32.041, lon: 118.784, radiusNorm: 0.036, type: 'cbd' }, // Nanjing Xinjiekou
  { lat: 32.008, lon: 118.725, radiusNorm: 0.024, type: 'cbd' }, // Nanjing Hexi
  { lat: 31.933, lon: 118.818, radiusNorm: 0.024, type: 'res' }, // Jiangning
  { lat: 32.078, lon: 118.678, radiusNorm: 0.024, type: 'ind' }, // Jiangbei New Area
  { lat: 32.204, lon: 119.448, radiusNorm: 0.022, type: 'cbd' }, // Zhenjiang
  { lat: 32.394, lon: 119.435, radiusNorm: 0.024, type: 'cbd' }, // Yangzhou
  { lat: 32.456, lon: 119.922, radiusNorm: 0.022, type: 'cbd' }, // Taizhou
  { lat: 33.385, lon: 120.138, radiusNorm: 0.024, type: 'cbd' }, // Yancheng
  { lat: 33.595, lon: 119.015, radiusNorm: 0.024, type: 'cbd' }, // Huai'an
  { lat: 34.262, lon: 117.185, radiusNorm: 0.030, type: 'cbd' }, // Xuzhou
  { lat: 34.596, lon: 119.222, radiusNorm: 0.022, type: 'ind' }, // Lianyungang
  // Jiaxing & Huzhou
  { lat: 30.842, lon: 120.922, radiusNorm: 0.020, type: 'res' }, // Jiashan
  { lat: 30.768, lon: 120.752, radiusNorm: 0.026, type: 'cbd' }, // Jiaxing Nanhu
  { lat: 30.892, lon: 120.088, radiusNorm: 0.024, type: 'cbd' }, // Huzhou
  // Hangzhou & Shaoxing & Ningbo & South Zhejiang
  { lat: 30.273, lon: 120.163, radiusNorm: 0.036, type: 'cbd' }, // Hangzhou Wulin
  { lat: 30.246, lon: 120.214, radiusNorm: 0.028, type: 'cbd' }, // Qianjiang New City
  { lat: 30.208, lon: 120.211, radiusNorm: 0.024, type: 'ind' }, // Binjiang Tech
  { lat: 30.281, lon: 120.015, radiusNorm: 0.024, type: 'ind' }, // Future Sci-Tech City
  { lat: 30.312, lon: 120.345, radiusNorm: 0.022, type: 'res' }, // Qiantang Xiasha
  { lat: 30.005, lon: 120.585, radiusNorm: 0.026, type: 'cbd' }, // Shaoxing
  { lat: 29.874, lon: 121.549, radiusNorm: 0.032, type: 'cbd' }, // Ningbo Tianyi
  { lat: 29.868, lon: 121.622, radiusNorm: 0.024, type: 'cbd' }, // Ningbo Eastern New City
  { lat: 29.318, lon: 120.095, radiusNorm: 0.022, type: 'cbd' }, // Yiwu
  { lat: 29.105, lon: 119.649, radiusNorm: 0.024, type: 'cbd' }, // Jinhua
  { lat: 28.015, lon: 120.656, radiusNorm: 0.028, type: 'cbd' }, // Wenzhou
  { lat: 28.656, lon: 121.421, radiusNorm: 0.024, type: 'cbd' }, // Taizhou ZJ
];

export const NEIGHBOR_URBAN_CENTERS_WGS84: NeighborUrbanCenter[] = [
  ...MAJOR_METRO_CORES,
  ...bundle.districts.map((d) => {
    const isCore = d.name.endsWith('區') && !d.name.includes('新區') && d.growthMultiplier >= 1.45;
    const isInd =
      d.name.includes('經開') ||
      d.name.includes('園區') ||
      d.name.includes('港') ||
      d.name.includes('開發') ||
      d.name.includes('新吳') ||
      d.name.includes('錢塘') ||
      d.name.includes('鎮海') ||
      d.name.includes('北侖');
    return {
      lat: d.center[0],
      lon: d.center[1],
      radiusNorm: isCore ? 0.017 : 0.014,
      type: isCore ? ('cbd' as const) : isInd ? ('ind' as const) : ('res' as const),
    };
  }),
];

export const NEIGHBOR_POIS_WGS84: {
  id: string;
  name: string;
  kind: CityPoi['kind'];
  lat: number;
  lon: number;
}[] = [
  { id: 'p_js_ksn', name: '崑山南站', kind: 'rail', lat: 31.3535, lon: 120.9515 },
  { id: 'p_js_huaqiao', name: '花橋博覽中心', kind: 'park', lat: 31.2988, lon: 121.1045 },
  { id: 'p_js_tc', name: '太倉站', kind: 'rail', lat: 31.4915, lon: 121.1485 },
  { id: 'p_js_sip', name: '蘇州中心 · 金雞湖', kind: 'park', lat: 31.3185, lon: 120.6815 },
  { id: 'p_js_sz', name: '蘇州火車站', kind: 'rail', lat: 31.3302, lon: 120.6105 },
  { id: 'p_js_szn', name: '蘇州北站', kind: 'rail', lat: 31.4215, lon: 120.6425 },
  { id: 'p_js_wux', name: '無錫火車站', kind: 'rail', lat: 31.5882, lon: 120.3035 },
  { id: 'p_js_wux_ap', name: '碩放國際機場', kind: 'airport', lat: 31.4945, lon: 120.4295 },
  { id: 'p_js_cz', name: '常州站', kind: 'rail', lat: 31.7875, lon: 119.9745 },
  { id: 'p_js_nt', name: '南通西站', kind: 'rail', lat: 32.0445, lon: 120.7795 },
  { id: 'p_js_qd', name: '啟東站', kind: 'rail', lat: 31.8325, lon: 121.6625 },
  { id: 'p_js_njs', name: '南京南站', kind: 'rail', lat: 31.9695, lon: 118.7975 },
  { id: 'p_js_nj', name: '南京火車站', kind: 'rail', lat: 32.0875, lon: 118.7975 },
  { id: 'p_js_nkg', name: '南京祿口國際機場', kind: 'airport', lat: 31.7422, lon: 118.8620 },
  { id: 'p_js_zj', name: '鎮江站', kind: 'rail', lat: 32.2035, lon: 119.4365 },
  { id: 'p_js_yz', name: '揚州東站', kind: 'rail', lat: 32.3935, lon: 119.5285 },
  { id: 'p_js_xz', name: '徐州東站', kind: 'rail', lat: 34.2675, lon: 117.3025 },
  { id: 'p_js_yc', name: '鹽城站', kind: 'rail', lat: 33.3685, lon: 120.1945 },
  { id: 'p_zj_jsn', name: '嘉善南站', kind: 'rail', lat: 30.7935, lon: 120.9165 },
  { id: 'p_zj_jxn', name: '嘉興南站', kind: 'rail', lat: 30.6975, lon: 120.8115 },
  { id: 'p_zj_wuzhen', name: '烏鎮景區', kind: 'park', lat: 30.7465, lon: 120.4875 },
  { id: 'p_zj_hz_e', name: '杭州東站', kind: 'rail', lat: 30.2915, lon: 120.2125 },
  { id: 'p_zj_hz_w', name: '杭州西站', kind: 'rail', lat: 30.2965, lon: 119.9925 },
  { id: 'p_zj_xihu', name: '杭州西湖', kind: 'park', lat: 30.2545, lon: 120.1465 },
  { id: 'p_zj_hgh', name: '蕭山國際機場', kind: 'airport', lat: 30.2295, lon: 120.4345 },
  { id: 'p_zj_huz', name: '湖州站', kind: 'rail', lat: 30.8665, lon: 120.0365 },
  { id: 'p_zj_sxn', name: '紹興北站', kind: 'rail', lat: 30.1055, lon: 120.5315 },
  { id: 'p_zj_nb', name: '寧波站', kind: 'rail', lat: 29.8625, lon: 121.5365 },
  { id: 'p_zj_ngb', name: '寧波櫟社機場', kind: 'airport', lat: 29.8267, lon: 121.4619 },
  { id: 'p_zj_yw', name: '義烏站', kind: 'rail', lat: 29.3625, lon: 120.0355 },
  { id: 'p_zj_wz', name: '溫州南站', kind: 'rail', lat: 27.9675, lon: 120.5855 },
];
