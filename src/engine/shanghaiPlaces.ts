export interface ShanghaiPlaceGeo {
  name: string;
  lat: number;
  lon: number;
  kind: 'landmark' | 'road' | 'neighborhood';
}

/**
 * Real-world Shanghai landmarks, famous streets, subdistricts (街道/鎮/里) and neighborhoods
 * across all 16 administrative districts in WGS-84 coordinates.
 */
export const SHANGHAI_PLACES_WGS84: ShanghaiPlaceGeo[] = [
  // 黃浦區 Huangpu
  { name: '人民廣場', lat: 31.2328, lon: 121.4754, kind: 'landmark' },
  { name: '外灘', lat: 31.2384, lon: 121.4878, kind: 'landmark' },
  { name: '南京東路', lat: 31.2368, lon: 121.4820, kind: 'road' },
  { name: '大世界', lat: 31.2275, lon: 121.4775, kind: 'landmark' },
  { name: '豫園', lat: 31.2272, lon: 121.4888, kind: 'landmark' },
  { name: '老西門', lat: 31.2186, lon: 121.4840, kind: 'neighborhood' },
  { name: '新天地', lat: 31.2195, lon: 121.4748, kind: 'neighborhood' },
  { name: '淮海中路', lat: 31.2202, lon: 121.4660, kind: 'road' },
  { name: '打浦橋', lat: 31.2065, lon: 121.4720, kind: 'neighborhood' },
  { name: '田子坊', lat: 31.2090, lon: 121.4685, kind: 'landmark' },
  { name: '五里橋', lat: 31.1975, lon: 121.4775, kind: 'neighborhood' },
  { name: '董家渡', lat: 31.2130, lon: 121.4985, kind: 'neighborhood' },
  { name: '南浦大橋', lat: 31.2072, lon: 121.4992, kind: 'landmark' },
  { name: '世博博物館', lat: 31.1935, lon: 121.4805, kind: 'landmark' },

  // 靜安區 Jing'an
  { name: '靜安寺', lat: 31.2236, lon: 121.4465, kind: 'landmark' },
  { name: '南京西路', lat: 31.2298, lon: 121.4602, kind: 'road' },
  { name: '上海展覽中心', lat: 31.2255, lon: 121.4525, kind: 'landmark' },
  { name: '自然博物館', lat: 31.2355, lon: 121.4622, kind: 'landmark' },
  { name: '曹家渡', lat: 31.2335, lon: 121.4342, kind: 'neighborhood' },
  { name: '上海火車站', lat: 31.2494, lon: 121.4557, kind: 'landmark' },
  { name: '漢中路', lat: 31.2412, lon: 121.4585, kind: 'road' },
  { name: '大寧國際', lat: 31.2788, lon: 121.4488, kind: 'neighborhood' },
  { name: '閘北公園', lat: 31.2738, lon: 121.4590, kind: 'landmark' },
  { name: '彭浦新村', lat: 31.3072, lon: 121.4480, kind: 'neighborhood' },
  { name: '市北高新', lat: 31.2950, lon: 121.4385, kind: 'neighborhood' },

  // 徐匯區 Xuhui
  { name: '徐家匯', lat: 31.1945, lon: 121.4368, kind: 'neighborhood' },
  { name: '徐家匯天主堂', lat: 31.1922, lon: 121.4335, kind: 'landmark' },
  { name: '上海交通大學', lat: 31.2010, lon: 121.4342, kind: 'landmark' },
  { name: '衡山路', lat: 31.2045, lon: 121.4465, kind: 'road' },
  { name: '上海圖書館', lat: 31.2088, lon: 121.4445, kind: 'landmark' },
  { name: '中山醫院', lat: 31.1965, lon: 121.4547, kind: 'landmark' },
  { name: '上海體育場', lat: 31.1842, lon: 121.4428, kind: 'landmark' },
  { name: '漕河涇', lat: 31.1685, lon: 121.4045, kind: 'neighborhood' },
  { name: '上海南站', lat: 31.1544, lon: 121.4295, kind: 'landmark' },
  { name: '龍華寺', lat: 31.1745, lon: 121.4505, kind: 'landmark' },
  { name: '徐匯濱江', lat: 31.1725, lon: 121.4605, kind: 'neighborhood' },
  { name: '上海植物園', lat: 31.1480, lon: 121.4455, kind: 'landmark' },
  { name: '華涇', lat: 31.1240, lon: 121.4480, kind: 'neighborhood' },

  // 長寧區 Changning
  { name: '中山公園', lat: 31.2185, lon: 121.4167, kind: 'landmark' },
  { name: '江蘇路', lat: 31.2205, lon: 121.4305, kind: 'road' },
  { name: '天山路', lat: 31.2108, lon: 121.3985, kind: 'road' },
  { name: '古北', lat: 31.1995, lon: 121.3965, kind: 'neighborhood' },
  { name: '仙霞', lat: 31.2085, lon: 121.3790, kind: 'neighborhood' },
  { name: '上海動物園', lat: 31.1945, lon: 121.3635, kind: 'landmark' },
  { name: '虹橋機場', lat: 31.1979, lon: 121.3363, kind: 'landmark' },
  { name: '新涇', lat: 31.2195, lon: 121.3655, kind: 'neighborhood' },

  // 普陀區 Putuo
  { name: '長壽路', lat: 31.2412, lon: 121.4385, kind: 'road' },
  { name: '玉佛寺', lat: 31.2422, lon: 121.4452, kind: 'landmark' },
  { name: '曹楊新村', lat: 31.2392, lon: 121.4085, kind: 'neighborhood' },
  { name: '長風公園', lat: 31.2265, lon: 121.3968, kind: 'landmark' },
  { name: '真如', lat: 31.2512, lon: 121.3988, kind: 'neighborhood' },
  { name: '甘泉新村', lat: 31.2695, lon: 121.4255, kind: 'neighborhood' },
  { name: '桃浦', lat: 31.2875, lon: 121.3580, kind: 'neighborhood' },

  // 虹口區 Hongkou
  { name: '北外灘', lat: 31.2505, lon: 121.4965, kind: 'neighborhood' },
  { name: '提籃橋', lat: 31.2535, lon: 121.5085, kind: 'neighborhood' },
  { name: '四川北路', lat: 31.2575, lon: 121.4840, kind: 'road' },
  { name: '虹口足球場', lat: 31.2715, lon: 121.4803, kind: 'landmark' },
  { name: '魯迅公園', lat: 31.2725, lon: 121.4848, kind: 'landmark' },
  { name: '曲陽', lat: 31.2810, lon: 121.4965, kind: 'neighborhood' },
  { name: '涼城', lat: 31.2945, lon: 121.4760, kind: 'neighborhood' },
  { name: '江灣鎮', lat: 31.3075, lon: 121.4775, kind: 'neighborhood' },

  // 楊浦區 Yangpu
  { name: '五角場', lat: 31.3005, lon: 121.5145, kind: 'neighborhood' },
  { name: '復旦大學', lat: 31.2975, lon: 121.5035, kind: 'landmark' },
  { name: '同濟大學', lat: 31.2825, lon: 121.5025, kind: 'landmark' },
  { name: '鞍山新村', lat: 31.2775, lon: 121.5070, kind: 'neighborhood' },
  { name: '控江路', lat: 31.2768, lon: 121.5270, kind: 'road' },
  { name: '楊浦公園', lat: 31.2835, lon: 121.5390, kind: 'landmark' },
  { name: '新江灣城', lat: 31.3295, lon: 121.5080, kind: 'neighborhood' },
  { name: '楊浦濱江', lat: 31.2610, lon: 121.5350, kind: 'neighborhood' },
  { name: '中原', lat: 31.3205, lon: 121.5335, kind: 'neighborhood' },

  // 浦東新區 Pudong
  { name: '陸家嘴', lat: 31.2395, lon: 121.5015, kind: 'neighborhood' },
  { name: '東方明珠', lat: 31.2397, lon: 121.4998, kind: 'landmark' },
  { name: '世紀大道', lat: 31.2292, lon: 121.5268, kind: 'road' },
  { name: '八佰伴', lat: 31.2295, lon: 121.5160, kind: 'landmark' },
  { name: '世紀公園', lat: 31.2155, lon: 121.5535, kind: 'landmark' },
  { name: '花木', lat: 31.2115, lon: 121.5450, kind: 'neighborhood' },
  { name: '龍陽路', lat: 31.2035, lon: 121.5578, kind: 'road' },
  { name: '世博園', lat: 31.1860, lon: 121.4920, kind: 'landmark' },
  { name: '前灘', lat: 31.1535, lon: 121.4775, kind: 'neighborhood' },
  { name: '三林', lat: 31.1425, lon: 121.5120, kind: 'neighborhood' },
  { name: '北蔡', lat: 31.1845, lon: 121.5585, kind: 'neighborhood' },
  { name: '張江高科', lat: 31.2015, lon: 121.5920, kind: 'neighborhood' },
  { name: '金橋', lat: 31.2615, lon: 121.6080, kind: 'neighborhood' },
  { name: '高橋', lat: 31.3450, lon: 121.5765, kind: 'neighborhood' },
  { name: '外高橋', lat: 31.3420, lon: 121.6010, kind: 'neighborhood' },
  { name: '曹路', lat: 31.2695, lon: 121.6620, kind: 'neighborhood' },
  { name: '唐鎮', lat: 31.2145, lon: 121.6565, kind: 'neighborhood' },
  { name: '川沙', lat: 31.1965, lon: 121.6980, kind: 'neighborhood' },
  { name: '上海迪士尼', lat: 31.1415, lon: 121.6620, kind: 'landmark' },
  { name: '周浦', lat: 31.1165, lon: 121.5750, kind: 'neighborhood' },
  { name: '康橋', lat: 31.1325, lon: 121.5895, kind: 'neighborhood' },
  { name: '航頭', lat: 31.0445, lon: 121.5880, kind: 'neighborhood' },
  { name: '新場', lat: 31.0310, lon: 121.6440, kind: 'neighborhood' },
  { name: '野生動物園', lat: 31.0550, lon: 121.7220, kind: 'landmark' },
  { name: '惠南', lat: 31.0510, lon: 121.7620, kind: 'neighborhood' },
  { name: '祝橋', lat: 31.1245, lon: 121.7510, kind: 'neighborhood' },
  { name: '浦東機場', lat: 31.1443, lon: 121.8083, kind: 'landmark' },
  { name: '臨港新片區', lat: 30.9035, lon: 121.9180, kind: 'neighborhood' },
  { name: '滴水湖', lat: 30.8965, lon: 121.9380, kind: 'landmark' },

  // 閔行區 Minhang
  { name: '虹橋火車站', lat: 31.1942, lon: 121.3204, kind: 'landmark' },
  { name: '華漕', lat: 31.2175, lon: 121.3055, kind: 'neighborhood' },
  { name: '七寶', lat: 31.1555, lon: 121.3515, kind: 'neighborhood' },
  { name: '莘莊', lat: 31.1105, lon: 121.3855, kind: 'neighborhood' },
  { name: '古美', lat: 31.1485, lon: 121.3920, kind: 'neighborhood' },
  { name: '梅隴', lat: 31.1155, lon: 121.4160, kind: 'neighborhood' },
  { name: '顓橋', lat: 31.0665, lon: 121.3990, kind: 'neighborhood' },
  { name: '馬橋', lat: 31.0415, lon: 121.3665, kind: 'neighborhood' },
  { name: '交大閔行校區', lat: 31.0258, lon: 121.4368, kind: 'landmark' },
  { name: '吳涇', lat: 31.0320, lon: 121.4615, kind: 'neighborhood' },
  { name: '浦江鎮', lat: 31.0765, lon: 121.5145, kind: 'neighborhood' },

  // 寶山區 Baoshan
  { name: '大場', lat: 31.3065, lon: 121.4105, kind: 'neighborhood' },
  { name: '上大寶山校區', lat: 31.3155, lon: 121.3935, kind: 'landmark' },
  { name: '廟行', lat: 31.3375, lon: 121.4425, kind: 'neighborhood' },
  { name: '顧村公園', lat: 31.3455, lon: 121.3715, kind: 'landmark' },
  { name: '楊行', lat: 31.3915, lon: 121.4390, kind: 'neighborhood' },
  { name: '吳淞口', lat: 31.3875, lon: 121.5015, kind: 'neighborhood' },
  { name: '淞濱路', lat: 31.3725, lon: 121.4925, kind: 'road' },
  { name: '友誼路', lat: 31.4045, lon: 121.4770, kind: 'road' },
  { name: '羅店', lat: 31.4145, lon: 121.3515, kind: 'neighborhood' },
  { name: '羅涇', lat: 31.4775, lon: 121.3545, kind: 'neighborhood' },

  // 嘉定區 Jiading
  { name: '江橋', lat: 31.2485, lon: 121.3240, kind: 'neighborhood' },
  { name: '南翔', lat: 31.2925, lon: 121.3125, kind: 'neighborhood' },
  { name: '馬陸', lat: 31.3350, lon: 121.2755, kind: 'neighborhood' },
  { name: '嘉定新城', lat: 31.3320, lon: 121.2535, kind: 'neighborhood' },
  { name: '嘉定老城', lat: 31.3835, lon: 121.2555, kind: 'neighborhood' },
  { name: '上海賽車場', lat: 31.3385, lon: 121.2205, kind: 'landmark' },
  { name: '安亭', lat: 31.2975, lon: 121.1635, kind: 'neighborhood' },
  { name: '徐行', lat: 31.4145, lon: 121.2885, kind: 'neighborhood' },

  // 松江區 Songjiang
  { name: '九亭', lat: 31.1375, lon: 121.3190, kind: 'neighborhood' },
  { name: '泗涇', lat: 31.1165, lon: 121.2615, kind: 'neighborhood' },
  { name: '佘山', lat: 31.0965, lon: 121.1965, kind: 'landmark' },
  { name: '松江大學城', lat: 31.0555, lon: 121.2195, kind: 'landmark' },
  { name: '松江新城', lat: 31.0285, lon: 121.2275, kind: 'neighborhood' },
  { name: '松江老城', lat: 31.0035, lon: 121.2255, kind: 'neighborhood' },
  { name: '車墩', lat: 31.0165, lon: 121.3205, kind: 'neighborhood' },
  { name: '葉榭', lat: 30.9465, lon: 121.3235, kind: 'neighborhood' },

  // 青浦區 Qingpu
  { name: '徐涇', lat: 31.1685, lon: 121.2665, kind: 'neighborhood' },
  { name: '國家會展中心', lat: 31.1915, lon: 121.3005, kind: 'landmark' },
  { name: '趙巷', lat: 31.1535, lon: 121.2025, kind: 'neighborhood' },
  { name: '華新', lat: 31.2425, lon: 121.2285, kind: 'neighborhood' },
  { name: '青浦新城', lat: 31.1495, lon: 121.1235, kind: 'neighborhood' },
  { name: '朱家角', lat: 31.1112, lon: 121.0535, kind: 'neighborhood' },
  { name: '金澤', lat: 31.0785, lon: 120.9225, kind: 'neighborhood' },
  { name: '練塘', lat: 30.9965, lon: 121.0385, kind: 'neighborhood' },

  // 奉賢區 Fengxian
  { name: '西渡', lat: 30.9965, lon: 121.4455, kind: 'neighborhood' },
  { name: '南橋新城', lat: 30.9185, lon: 121.4715, kind: 'neighborhood' },
  { name: '奉賢新城', lat: 30.9165, lon: 121.4985, kind: 'neighborhood' },
  { name: '莊行', lat: 30.9275, lon: 121.3915, kind: 'neighborhood' },
  { name: '青村', lat: 30.9245, lon: 121.5645, kind: 'neighborhood' },
  { name: '奉城', lat: 30.9155, lon: 121.6465, kind: 'neighborhood' },
  { name: '海灣旅遊區', lat: 30.8355, lon: 121.5225, kind: 'landmark' },

  // 金山區 Jinshan
  { name: '朱涇', lat: 30.8925, lon: 121.1635, kind: 'neighborhood' },
  { name: '楓涇古鎮', lat: 30.8925, lon: 121.0115, kind: 'landmark' },
  { name: '亭林', lat: 30.8785, lon: 121.3185, kind: 'neighborhood' },
  { name: '金山衛', lat: 30.7285, lon: 121.3455, kind: 'neighborhood' },
  { name: '金山城市沙灘', lat: 30.7135, lon: 121.3545, kind: 'landmark' },
  { name: '山陽', lat: 30.7445, lon: 121.3765, kind: 'neighborhood' },
  { name: '漕涇', lat: 30.7855, lon: 121.4425, kind: 'neighborhood' },

  // 崇明區 Chongming
  { name: '城橋', lat: 31.6225, lon: 121.3985, kind: 'neighborhood' },
  { name: '南門港', lat: 31.6115, lon: 121.3965, kind: 'landmark' },
  { name: '堡鎮', lat: 31.5425, lon: 121.6225, kind: 'neighborhood' },
  { name: '陳家鎮', lat: 31.5115, lon: 121.8255, kind: 'neighborhood' },
  { name: '東平森林公園', lat: 31.6855, lon: 121.4795, kind: 'landmark' },
  { name: '東灘濕地', lat: 31.5165, lon: 121.9585, kind: 'landmark' },
  { name: '廟鎮', lat: 31.6825, lon: 121.2815, kind: 'neighborhood' },
  { name: '長興島', lat: 31.3895, lon: 121.7015, kind: 'neighborhood' },
  { name: '橫沙島', lat: 31.3375, lon: 121.8425, kind: 'neighborhood' },
];
