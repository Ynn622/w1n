const {
  VITE_GOOGLE_MAPS_API_KEY,
  VITE_GOOGLE_MAPS_EMBED_HOME,
  VITE_GOOGLE_MAPS_EMBED_TRAFFIC,
  VITE_GOOGLE_MAPS_EMBED_SAFE,
  VITE_GOOGLE_MAPS_EMBED_OBSTACLE
} = import.meta.env;

const HOME_MAP_EMBED_FALLBACK =
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3615.022253974696!2d121.56235021214552!3d25.03396498397207!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3442abbf0c93418d%3A0x64db763b69ad2b6!2z5Y-w5YyXIDEwMQ!5e0!3m2!1szh-TW!2stw!4v1717132800000!5m2!1szh-TW!2stw';

const TRAFFIC_MAP_EMBED_FALLBACK =
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3614.568581001418!2d121.54126917607693!3d25.045193677804056!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3442a97a5ddeea4f%3A0x1dea53c58d32e848!2z5paw5YyX6Y6u5Lit5b-DIOWPsOmdmOaWsOWMl-W6lw!5e0!3m2!1szh-TW!2stw!4v1717136400000!5m2!1szh-TW!2stw';

const SAFE_NAV_MAP_EMBED_FALLBACK =
  'https://www.google.com/maps/embed?pb=!1m28!1m12!1m3!1d115730.42421285012!2d121.46760245590318!3d25.082775829333334!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!4m13!3e0!4m5!1s0x3442abbf4a4e1fbf%3A0xc8a2434d0491d738!2z5Y-w5YyX5biC5p2x5Y2A!3m2!1d25.0375198!2d121.5636796!4m5!1s0x3442ae91fa777e5b%3A0xfb393137f6741c0f!2z5ZyL56uL5bqt5rOV5Zyf5Z-O!3m2!1d25.1023988!2d121.5493648!5e0!3m2!1szh-TW!2stw!4v1717140000000!5m2!1szh-TW!2stw';

const OBSTACLE_MAP_EMBED_FALLBACK =
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3614.7267283102656!2d121.56151497607821!3d25.04027698397505!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3442abb1d22d4daf%3A0xe8a20c95d5fd8755!2z5Y-w5YyX5biC5Y-w5YyXIE1STiDliIbkuKrmloflpKc!5e0!3m2!1szh-TW!2stw!4v1717240800000!5m2!1szh-TW!2stw';

export interface ServiceItem {
  id: string;
  name: string;
  icon: string;
  route?: string;
  disabled?: boolean;
}

export interface MapPreview {
  title: string;
  addressHint: string;
  road: string;
  landmark: string;
  updatedAt: string;
}

export interface StreetInfo {
  intersection: string;
  status: string;
  source: string;
}

export interface NewsItem {
  id: number;
  title: string;
  description: string;
  time?: string;
  source?: string;
  thumbnail?: string;
}

const POLICE_NEWS_ENDPOINT = 'https://ynn22-standing-backend.hf.space/news/police_local';
const WIND_STATION_ENDPOINT = 'https://ynn22-standing-backend.hf.space/wind/';
const GOOGLE_GEOCODE_ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';

type PoliceNewsRecord = {
  roadtype?: string;
  comment?: string;
  happentime?: string;
  image?: string;
};

type PoliceNewsResponse = {
  data?: PoliceNewsRecord[];
};

export interface WindInfo {
  speed: string;
  unit: string;
  direction: string;
  intensity: number;
  temperature: string;
  humidity: string;
  pressure: string;
}

export interface HomeOverview {
  location: string;
  advisory: string;
  windInfo: WindInfo;
  drivingAdvice: string;
  services: ServiceItem[];
  mapPreview: MapPreview;
  googleMapEmbed: string;
  streetInfo: StreetInfo;
  newsList: NewsItem[];
}

export const getHomeOverview = (): HomeOverview => ({
  location: '臺北市信義區莊敬路391巷22號',
  advisory: '行車建議：盡可能減少外出',
  windInfo: {
    speed: '10.5',
    unit: 'm/s',
    direction: '東北風',
    intensity: 70,
    temperature: '25',
    humidity: '65',
    pressure: '1013'
  },
  drivingAdvice: '持續有強陣風與短暫大雨，建議非必要不要駕車上路。',
  services: [
    { id: 'traffic', name: '路況檢視', icon: '🚗', route: 'traffic' },
    { id: 'safe-nav', name: '安全導航', icon: '🧭', route: 'safeNavigation' },
    { id: 'report', name: '障礙回報', icon: '⚠️', route: 'wind' },
    { id: 'wind', name: '風況詳情', icon: '🌪️', disabled: true },
    { id: 'settings', name: '個人設定', icon: '⚙️', disabled: true }
  ],
  mapPreview: {
    title: '路況查看',
    addressHint: '顯示詳細地址 >',
    road: '信義路五段',
    landmark: '台北101',
    updatedAt: '更新於 2 分鐘前'
  },
  googleMapEmbed: VITE_GOOGLE_MAPS_EMBED_HOME ?? HOME_MAP_EMBED_FALLBACK,
  streetInfo: {
    intersection: '莊敬路391巷 x 信義路五段',
    status: '街口資料讀取中，等待 API 注入',
    source: '資料來源：智慧交通 API（預留）'
  },
  newsList: [
    {
      id: 1,
      title: '北部持續豪大雨 勿強行涉水',
      description: '台北一名大學生於返家路上遭遇颱風外圍環流，雨勢造成能見度低，駕駛須減速慢行。',
      time: '剛剛更新'
    },
    {
      id: 2,
      title: '東部山區出現落石 須注意',
      description: '花蓮天祥路段傳出落石，公路總局籲民眾暫勿前往並密切關注最新路況資訊。',
      time: '3 分鐘前'
    }
  ]
});

const normalizePoliceNews = (records: PoliceNewsRecord[]): NewsItem[] =>
  records.map((record, index) => ({
    id: index + 1,
    title: record.roadtype?.trim() || '最新路況資訊',
    description: record.comment?.trim() || '暫無補充說明。',
    time: record.happentime?.trim() || '剛剛更新',
    thumbnail: record.image
  }));

export const fetchPoliceNews = async (): Promise<NewsItem[]> => {
  try {
    const response = await fetch(POLICE_NEWS_ENDPOINT);
    if (!response.ok) {
      throw new Error(`News API 回應異常：${response.status}`);
    }
    const payload = (await response.json()) as PoliceNewsResponse | PoliceNewsRecord[];
    const records = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
        ? payload.data
        : [];
    if (!records.length) {
      return [];
    }
    return normalizePoliceNews(records);
  } catch (error) {
    console.warn('[API] 無法取得警政即時訊息', error);
    return [];
  }
};

export interface TrafficTab {
  id: 'avoid' | 'danger' | 'safe';
  label: string;
}

export interface TrafficLayerPreset {
  title: string;
  description: string;
  highlight: string;
  color: string;
}

export const getTrafficTabs = (): TrafficTab[] => [
  { id: 'avoid', label: '迴避路段' },
  { id: 'danger', label: '危險路段' },
  { id: 'safe', label: '安全路段' }
];

export const getTrafficLayerPresets = (): Record<TrafficTab['id'], TrafficLayerPreset> => ({
  avoid: {
    title: '請迴避：忠孝復興圓環',
    description: '目前車流壅塞，陣風達 10 m/s，建議改道至敦化南路。',
    highlight: '灰色虛線顯示可能封閉路段',
    color: '#6B7280'
  },
  danger: {
    title: '危險路段：仁愛路三段',
    description: '路樹傾倒仍在處理，局部區域有積水，進入前請放慢速度。',
    highlight: '紅色警示標記顯示事故熱點',
    color: '#D45251'
  },
  safe: {
    title: '安全路段：市民大道高架',
    description: '路況順暢且視線良好，系統建議優先通過該路段。',
    highlight: '綠色線段顯示建議路徑',
    color: '#62A3A6'
  }
});

export const getTrafficMapEmbedUrl = (): string =>
  VITE_GOOGLE_MAPS_EMBED_TRAFFIC ?? TRAFFIC_MAP_EMBED_FALLBACK;

export interface SafeRouteSegment {
  id: string;
  name: string;
  windSpeed: number;
  direction: string;
  note: string;
}

export interface SafeNavigationData {
  defaultStart: string;
  defaultEnd: string;
  segments: SafeRouteSegment[];
  mapEmbedUrl: string;
}

export const getSafeNavigationData = (): SafeNavigationData => ({
  defaultStart: '臺北市政府',
  defaultEnd: '國立故宮博物院',
  segments: [
    {
      id: 'sec-1',
      name: '信義路五段 → 敦化大道',
      windSpeed: 8.5,
      direction: '東北風',
      note: '建議保持 40km/h 以下，注意側風'
    },
    {
      id: 'sec-2',
      name: '民權東路 → 建國北路',
      windSpeed: 6.2,
      direction: '東風',
      note: '風速穩定，可保持行車間距'
    },
    {
      id: 'sec-3',
      name: '承德路三段 → 至善路',
      windSpeed: 10.1,
      direction: '東北風',
      note: '靠山邊風切較強，請降低車速'
    },
    {
      id: 'sec-4',
      name: '外雙溪橋段',
      windSpeed: 5.1,
      direction: '東風',
      note: '路面濕滑，建議開啟霧燈'
    }
  ],
  mapEmbedUrl: VITE_GOOGLE_MAPS_EMBED_SAFE ?? SAFE_NAV_MAP_EMBED_FALLBACK
});

export interface ObstacleTypeOption {
  id: 'tree' | 'sign' | 'accident' | 'others';
  label: string;
  icon: string;
  color: string;
}

export interface ObstacleReportData {
  mapEmbedUrl: string;
  obstacleTypes: ObstacleTypeOption[];
  helperText: string;
}

export const getObstacleReportData = (): ObstacleReportData => ({
  mapEmbedUrl: VITE_GOOGLE_MAPS_EMBED_OBSTACLE ?? OBSTACLE_MAP_EMBED_FALLBACK,
  helperText: '街口資料即將串接交通局 API，將顯示障礙狀態、回報人與時間。',
  obstacleTypes: [
    { id: 'tree', label: '路樹傾倒', icon: '🌳', color: '#4AA37D' },
    { id: 'sign', label: '招牌掉落', icon: '🪧', color: '#F3A530' },
    { id: 'accident', label: '交通事故', icon: '🚨', color: '#D45251' },
    { id: 'others', label: '其他情況', icon: '⚠️', color: '#5B8DEF' }
  ]
});

export interface WindDetail {
  location: string;
  windSpeed: number;
  unit: string;
  updatedAt: string;
  source: string;
  maxWind: number;
  avgWind: number;
  direction: string;
  riskLevel: number; // 0-5
  riskLabel: string;
  trend: { hour: number; value: number }[];
}

export const getWindDetail = (): WindDetail => ({
  location: '台北市大安區',
  windSpeed: 10.5,
  unit: 'm/s',
  updatedAt: new Date().toISOString(),
  source: '資料來源：中央氣象局',
  maxWind: 11.8,
  avgWind: 10.3,
  direction: '北北東',
  riskLevel: 3,
  riskLabel: '中度風險',
  trend: [
    { hour: 0, value: 8.4 },
    { hour: 3, value: 8.9 },
    { hour: 6, value: 9.8 },
    { hour: 9, value: 10.6 },
    { hour: 12, value: 11.2 },
    { hour: 15, value: 11.8 },
    { hour: 18, value: 10.9 },
    { hour: 21, value: 10.2 },
    { hour: 24, value: 9.5 }
  ]
});

export interface WindStation {
  station_name: string;
  station_id: string;
  county: string;
  town: string;
  latitude: number;
  longitude: number;
  weather?: string;
  wind_speed: number;
  wind_direction_degree?: number;
  wind_direction?: string;
  air_temperature?: number;
  relative_humidity?: number | null;
}

const toRadians = (value: number) => (value * Math.PI) / 180;

const normalizeWindDirection = (value?: string | null) => {
  if (!value) {
    return '風向更新中';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '風向更新中';
  }
  return trimmed.includes('風') ? trimmed : `${trimmed}風`;
};

const mapSpeedToRisk = (speed: number) => {
  if (speed < 4) {
    return { level: 1, label: '低風險' };
  }
  if (speed < 8) {
    return { level: 2, label: '低中風險' };
  }
  if (speed < 12) {
    return { level: 3, label: '中度風險' };
  }
  if (speed < 16) {
    return { level: 4, label: '中高風險' };
  }
  return { level: 5, label: '高風險' };
};

export const fetchWindStations = async (): Promise<WindStation[]> => {
  const response = await fetch(WIND_STATION_ENDPOINT);
  if (!response.ok) {
    throw new Error('無法取得風況資料');
  }
  return response.json();
};

export const pickNearestStation = (
  userLat: number,
  userLng: number,
  stations: WindStation[]
): { station: WindStation; distance: number } | null => {
  if (!stations.length) {
    return null;
  }
  let best: { station: WindStation; distance: number } | null = null;
  stations.forEach((station) => {
    const dLat = toRadians(station.latitude - userLat);
    const dLng = toRadians(station.longitude - userLng);
    const originLat = toRadians(userLat);
    const targetLat = toRadians(station.latitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(originLat) * Math.cos(targetLat) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = 6371000 * c;

    if (!best || distance < best.distance) {
      best = { station, distance };
    }
  });
  return best;
};

export const buildWindReadingFromStation = (station: WindStation) => {
  const windSpeed = Number(station.wind_speed ?? 0);
  const temperature = station.air_temperature ?? null;
  const humidity = station.relative_humidity ?? null;
  const { level, label } = mapSpeedToRisk(windSpeed);
  const intensity = Math.min(100, Math.max(0, Math.round((windSpeed / 20) * 100)));

  const directionLabel = normalizeWindDirection(station.wind_direction);

  const windInfo: WindInfo = {
    speed: windSpeed.toFixed(1),
    unit: 'm/s',
    direction: directionLabel,
    intensity,
    temperature: temperature !== null ? temperature.toFixed(1) : '--',
    humidity: humidity !== null ? `${humidity}%` : '--',
    pressure: '—'
  };

  const detail: Partial<WindDetail> = {
    location: `${station.station_name}（${station.county}${station.town ? `·${station.town}` : ''}）`,
    source: `資料來源：${station.station_name}測站`,
    windSpeed,
    direction: directionLabel,
    avgWind: windSpeed,
    riskLevel: level,
    riskLabel: label,
    updatedAt: new Date().toISOString()
  };

  return { windInfo, detail };
};

export const getMapEmbedUrlFromCoords = (lat: number, lng: number): string => {
  if (VITE_GOOGLE_MAPS_API_KEY) {
    const base = 'https://www.google.com/maps/embed/v1/view';
    return `${base}?key=${VITE_GOOGLE_MAPS_API_KEY}&center=${lat},${lng}&zoom=15&maptype=roadmap`;
  }
  return `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
};

export const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
  if (!VITE_GOOGLE_MAPS_API_KEY) {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
  const url = `${GOOGLE_GEOCODE_ENDPOINT}?latlng=${lat},${lng}&key=${VITE_GOOGLE_MAPS_API_KEY}&language=zh-TW`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Geocode request failed: ${response.status}`);
    }
    const payload = await response.json();
    if (payload.status !== 'OK' || !payload.results?.length) {
      return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }
    return payload.results[0].formatted_address as string;
  } catch (error) {
    console.warn('[API] reverse geocode failed', error);
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
};
