# MetroForge — 上海地鐵構築與營運模擬

超高自由度的無網格地鐵建造、多層地下軌道規劃與動態城市人流營運模擬系統（以上海市 16 個行政區實景地理邊界為藍本）。

## 主要功能

- **全精度上海 16 區行政版圖**：基於真實 WGS-84 座標涵蓋黃浦、靜安、徐匯、長寧、普陀、虹口、楊浦（開局出生點）及浦東、閔行、寶山、嘉定、松江、青浦、奉賢、金山、崇明等外圍區域。
- **區域資金解鎖與地形限制**：未解鎖區域呈現暗化鎖定狀態，可花費資金逐步解鎖；嚴格阻擋海上、黃浦江、蘇州河與澱山湖水域設站，僅可透過跨河橋樑或潛盾隧道過江。
- **實地位置智慧命名**：依車站經緯度比對真實地標、OpenStreetMap 道路網（含交叉路口與重名消歧）、里弄／社區／鎮街道名稱，並以非同步 Nominatim 反查進行精準繁體命名。
- **無網格曲面軌道與多層深度**：支援 B1–B5 地下、地面與高架建造，支援軌道中段直接插站、草案規劃模式、列車調度與站點規模升級。
- **動態都市與客流模擬**：即時計算通勤起訖（OD）需求、換乘路徑、地鐵分擔率、擁擠指數、財務收支與年度城市演化。

## 技術架構

- **前端框架**：React 19 + TypeScript + Vite
- **樣式與圖示**：Tailwind CSS v4 + Lucide React + Motion
- **地圖與地理引擎**：MapLibre GL + Esri World Dark Gray Base + OpenStreetMap Overpass / Nominatim API

## 專案結構

```text
src/
├── App.tsx                  # 主模擬循環、狀態管理與建造互動邏輯
├── main.tsx                 # React 進入點
├── index.css                # 全域樣式與 Tailwind CSS v4 設定
├── components/              # 畫布與介面模組
│   ├── MetroCanvas.tsx      # 互動式地圖、軌道與列車渲染畫布
│   ├── FloatingHud.tsx      # 頂部指標與底部建置工具列
│   ├── TitleScreen.tsx      # 開局設定畫面
│   ├── SetupModal.tsx       # 營運難度與票價設定
│   ├── CityStatsModal.tsx   # 城市統計與分區儀表板
│   ├── NetworkDiagramModal.tsx # 地鐵路網拓撲圖
│   ├── MetroCoreModal.tsx   # 地鐵核心技術研發
│   ├── MetroCircleModal.tsx # 都市圈與跨區協同規劃
│   ├── KpiPopovers.tsx      # 資金、人口、分擔率、擁擠度即時浮窗
│   └── GddModal.tsx         # 系統設計說明
├── engine/                  # 地理資料、演算法與模擬引擎
│   ├── geo.ts               # 座標投影、Overpass 與 Nominatim 地理查詢
│   ├── noise.ts             # 地圖生成、實地位置站名推算與地形噪聲
│   ├── pathfinding.ts       # 多線換乘與通勤路徑搜尋
│   ├── simulation.ts        # 客流演化、工程成本與水域／行政區檢查
│   ├── shanghaiGeoData.ts   # 上海 16 區行政邊界與水系 WGS-84 向量資料
│   ├── shanghaiPlaces.ts    # 全上海 16 區地標、主幹道與街鎮座標集
│   └── audio.ts             # Web Audio 互動音效合成
├── i18n/
│   └── translations.ts      # 繁體／簡體／英文介面語系與金額格式化
└── types/
    └── game.ts              # 全域資料型別定義
```

## 本地開發與建置

```bash
# 安裝依賴
npm install

# 啟動開發伺服器（預設埠號 3000）
npm run dev

# TypeScript 型別檢查
npm run lint

# 建置正式環境靜態檔案
npm run build

# 預覽建置結果
npm run preview
```

## 環境變數

本專案主要為純前端模擬，若需自訂平台參數可複製 `.env.example` 為 `.env`：

```bash
cp .env.example .env
```

> 注意：`.env*`（除 `.env.example` 外）、`.aistudio/` 與未使用的暫存圖片已透過 `.gitignore` 排除，不會被提交至倉庫。
