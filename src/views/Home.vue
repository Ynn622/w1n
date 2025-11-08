<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import BottomNav from '@/components/BottomNav.vue';
import WindIcon from '@/assets/navicons/Wind.png';
import {
  fetchPoliceNews,
  getHomeOverview,
  getMapEmbedUrlFromCoords,
  reverseGeocode,
  fetchWindStations,
  pickNearestStation,
  buildWindReadingFromStation,
  fetchFutureWindForecast,
  extractFutureWindForecast,
  mapSpeedToRisk,
  type WindStation,
  type WindInfo,
  type FutureWindEntry
} from '@/utils/api';

const router = useRouter();

const homeOverview = getHomeOverview();

const {
  location,
  advisory,
  services,
  mapPreview,
  googleMapEmbed,
  streetInfo,
} = homeOverview;

const ensureWindDirectionWord = (value?: string | null) => {
  if (!value) {
    return '風向更新中';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '風向更新中';
  }
  return trimmed.includes('風') ? trimmed : `${trimmed}風`;
};

const fallbackWindInfo: WindInfo = {
  speed: '更新中',
  unit: 'm/s',
  direction: '風向更新中',
  intensity: 0,
  temperature: '--',
  humidity: '--',
  pressure: '--'
};

const windInfo = ref<WindInfo | null>(null);

const windInfoDisplay = computed<WindInfo>(() => {
  if (!windInfo.value) {
    return fallbackWindInfo;
  }
  return {
    ...windInfo.value,
    direction: ensureWindDirectionWord(windInfo.value.direction)
  };
});

const newsList = ref(homeOverview.newsList);
const previewNews = computed(() => newsList.value.slice(0, 2));
const expandedNewsDescriptions = ref<Set<number>>(new Set());
const locationLabel = ref(location);
const isLocating = ref(false);
const locationError = ref<string | null>(null);
const userCoords = ref<{ lat: number; lng: number } | null>(null);
const mapEmbedUrl = ref(googleMapEmbed);
const canUseGeolocation = typeof window !== 'undefined' && 'geolocation' in navigator;

const navigateTo = (routeName: string) => {
  router.push({ name: routeName });
};

const isWindModalOpen = ref(false);
const isNewsModalOpen = ref(false);
const isRefreshingWind = ref(false);
const lastUpdated = ref(new Date());
const isNewsLoading = ref(false);
const newsError = ref<string | null>(null);
const windStations = ref<WindStation[]>([]);
const isWindStationLoading = ref(false);
const windStationError = ref<string | null>(null);
const nearestStation = ref<WindStation | null>(null);
const isWindDataReady = computed(() => Boolean(windInfo.value));
const futureForecastEntries = ref<FutureWindEntry[]>([]);
const futureForecastDistrict = ref('');
const isFutureForecastLoading = ref(false);
const futureForecastError = ref<string | null>(null);
const futureSourceLabel = computed(() =>
  futureForecastDistrict.value ? `資料來源：${futureForecastDistrict.value} 預報` : '資料來源：更新中'
);

const selectedForecastEntry = computed(() => futureForecastEntries.value[0] ?? null);
const forecastRisk = computed(() => mapSpeedToRisk(selectedForecastEntry.value?.windSpeedValue ?? 0));

const formattedUpdatedAt = computed(() => selectedForecastEntry.value?.displayTime ?? '更新中');

const isWindStale = computed(
  () => Date.now() - lastUpdated.value.getTime() > 10 * 60 * 1000
);

const riskSegments = computed(() =>
  Array.from({ length: 5 }).map((_, index) => index < forecastRisk.value.level)
);
const forecastRiskLabel = computed(() => forecastRisk.value.label);

const windIntensitySegments = computed(() => {
  const segments = 5;
  const value = Number(windInfoDisplay.value.intensity) || 0;
  const step = 100 / segments;
  return Array.from({ length: segments }, (_, index) => value >= (index + 1) * step);
});

const drivingAdviceBlock = computed(() => {
  const parsedSpeed = Number(windInfo.value?.speed);
  if (Number.isNaN(parsedSpeed)) {
    return {
      title: '行車建議載入中',
      body: '風速資料尚未更新，請稍後重新整理。'
    };
  }

  const direction = windInfo.value?.direction
    ? ensureWindDirectionWord(windInfo.value.direction)
    : '當前風向';
  const stationLabel = nearestStation.value ? `${nearestStation.value.station_name}測站` : '最新測站';

  if (parsedSpeed < 4) {
    return {
      title: '風勢平穩，可正常行駛',
      body: `${stationLabel} 風速約 ${parsedSpeed.toFixed(1)} m/s，${direction} 輕微，保持一般速限並留意路面濕滑即可。`
    };
  }

  if (parsedSpeed < 8) {
    return {
      title: '輕度側風，放慢車速',
      body: `${stationLabel} 風速約 ${parsedSpeed.toFixed(1)} m/s，${direction} 偶有陣風，建議降低 10 km/h 並拉大跟車距離。`
    };
  }

  if (parsedSpeed < 12) {
    return {
      title: '陣風明顯，避免高速',
      body: `${stationLabel} 風速達 ${parsedSpeed.toFixed(1)} m/s，${direction} 持續，請減少上高架或空曠路段並注意機車穩定。`
    };
  }

  if (parsedSpeed < 16) {
    return {
      title: '強側風警示，建議改道',
      body: `${stationLabel} 風速約 ${parsedSpeed.toFixed(1)} m/s，${direction} 風牆明顯，請改走避風路線並提醒乘客系好安全帶。`
    };
  }

  return {
    title: '劇烈風勢，暫緩出行',
    body: `${stationLabel} 偵測到 ${parsedSpeed.toFixed(1)} m/s 強風，${direction} 風向劇烈變化，如非必要請暫停出門並密切注意交通封閉資訊。`
  };
});

const chartWidth = 320;
const chartHeight = 140;
const chartPadding = 12;

const formatChartLabel = (entry: FutureWindEntry) => {
  const date = new Date(entry.timestamp);
  const hour = date.getHours().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return {
    time: `${hour}:00`,
    date: `${month}/${day}`
  };
};

const forecastChartEntries = computed(() => {
  const limitMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const withinRange = futureForecastEntries.value.filter((entry) => {
    const time = new Date(entry.timestamp).getTime();
    return time - now <= limitMs;
  });
  return withinRange.length ? withinRange : futureForecastEntries.value.slice(0, 8);
});

const forecastTrendPoints = computed(() => {
  const entries = forecastChartEntries.value;
  if (!entries.length) {
    return [];
  }
  const values = entries.map((entry) => entry.windSpeedValue);
  const maxValue = Math.max(...values, 1);
  return entries.map((entry, index) => {
    const x =
      (index / Math.max(entries.length - 1, 1)) * (chartWidth - chartPadding * 2) + chartPadding;
    const normalized = entry.windSpeedValue / maxValue;
    const y = chartPadding + (1 - normalized) * (chartHeight - chartPadding * 2);
    const label = formatChartLabel(entry);
    return {
      x,
      y,
      label,
      value: entry.windSpeedValue
    };
  });
});

const trendLinePath = computed(() => {
  const points = forecastTrendPoints.value;
  if (!points.length) {
    return '';
  }
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
});

const refreshWindDetail = async () => {
  if (isRefreshingWind.value) {
    return;
  }
  isRefreshingWind.value = true;
  try {
    await loadWindStations();
  } finally {
    isRefreshingWind.value = false;
    lastUpdated.value = new Date();
  }
};

const openWindModal = () => {
  isWindModalOpen.value = true;
};

const closeWindModal = () => {
  isWindModalOpen.value = false;
};

const openNewsModal = () => {
  isNewsModalOpen.value = true;
};

const closeNewsModal = () => {
  isNewsModalOpen.value = false;
  expandedNewsDescriptions.value = new Set();
};

const splitLines = (value?: string) => {
  if (!value) return [];
  const normalized = value.replace(/\\n/g, '\n');
  return normalized
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);
};

const getVisibleDescriptionLines = (id: number, description?: string) => {
  const lines = splitLines(description);
  return expandedNewsDescriptions.value.has(id) ? lines : lines.slice(0, 2);
};

const canShowMoreDescription = (id: number, description?: string) =>
  !expandedNewsDescriptions.value.has(id) && splitLines(description).length > 2;

const expandDescription = (id: number) => {
  if (expandedNewsDescriptions.value.has(id)) {
    return;
  }
  const next = new Set(expandedNewsDescriptions.value);
  next.add(id);
  expandedNewsDescriptions.value = next;
};

const openMapInGoogle = () => {
  let externalUrl = mapEmbedUrl.value;
  if (userCoords.value) {
    const { lat, lng } = userCoords.value;
    externalUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  window.open(externalUrl, '_blank', 'noopener');
};

const coordsToLabel = (lat: number, lng: number) =>
  `緯度 ${lat.toFixed(5)}, 經度 ${lng.toFixed(5)}`;

const isCoordinateLabel = (value?: string | null) => {
  if (!value) {
    return false;
  }
  const trimmed = value.trim();
  return trimmed.startsWith('緯度') || /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(trimmed);
};

const updateLocationByCoords = async (lat: number, lng: number) => {
  userCoords.value = { lat, lng };
  mapEmbedUrl.value = getMapEmbedUrlFromCoords(lat, lng);
  const address = await reverseGeocode(lat, lng);
  if (address && !isCoordinateLabel(address)) {
    locationLabel.value = address;
  }
  applyNearestStation();
};

const requestUserLocation = () => {
  if (!canUseGeolocation || typeof navigator === 'undefined') {
    locationError.value = '此裝置不支援定位功能';
    return;
  }
  isLocating.value = true;
  locationError.value = null;
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      try {
        await updateLocationByCoords(latitude, longitude);
      } catch (error) {
        console.warn('更新定位失敗', error);
        locationError.value = '無法取得地址名稱';
      } finally {
        isLocating.value = false;
      }
    },
    (error) => {
      isLocating.value = false;
      switch (error.code) {
        case error.PERMISSION_DENIED:
          locationError.value = '使用者拒絕授權定位';
          break;
        case error.POSITION_UNAVAILABLE:
          locationError.value = '定位資訊不可用';
          break;
        case error.TIMEOUT:
          locationError.value = '定位逾時，請重試';
          break;
        default:
          locationError.value = '無法取得定位資訊';
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
};

const loadPoliceNews = async () => {
  try {
    isNewsLoading.value = true;
    newsError.value = null;
    const latest = await fetchPoliceNews();
    if (latest.length) {
      newsList.value = latest;
    }
  } catch (error) {
    console.warn('載入即時訊息失敗', error);
    newsError.value = '無法取得最新訊息';
  } finally {
    isNewsLoading.value = false;
  }
};

let fabHoldTimer: number | null = null;
const fabLongPressTriggered = ref(false);

const loadWindStations = async () => {
  try {
    isWindStationLoading.value = true;
    windStationError.value = null;
    const stations = await fetchWindStations();
    windStations.value = stations;
    applyNearestStation();
  } catch (error) {
    console.warn('載入風況測站失敗', error);
    windStationError.value = '無法取得風況測站資料';
  } finally {
    isWindStationLoading.value = false;
  }
};

const loadFutureForecastForTown = async (townHint?: string | null) => {
  try {
    isFutureForecastLoading.value = true;
    futureForecastError.value = null;
    const raw = await fetchFutureWindForecast();
    const forecast = extractFutureWindForecast(raw, townHint ?? undefined);
    if (forecast) {
      futureForecastDistrict.value = forecast.district;
      futureForecastEntries.value = forecast.entries;
      lastUpdated.value = new Date();
    } else {
      futureForecastEntries.value = [];
      futureForecastDistrict.value = '';
      futureForecastError.value = '找不到對應預報資料';
    }
  } catch (error) {
    console.warn('載入風況預報失敗', error);
    futureForecastEntries.value = [];
    futureForecastDistrict.value = '';
    futureForecastError.value = '無法取得未來風況資料';
  } finally {
    isFutureForecastLoading.value = false;
  }
};

const applyNearestStation = () => {
  if (!userCoords.value || !windStations.value.length) {
    return;
  }
  const nearest = pickNearestStation(
    userCoords.value.lat,
    userCoords.value.lng,
    windStations.value
  );
  if (!nearest) {
    return;
  }
  nearestStation.value = nearest.station;
  const reading = buildWindReadingFromStation(nearest.station);
  windInfo.value = reading.windInfo;
  lastUpdated.value = new Date();
  loadFutureForecastForTown(nearest.station.town);
};

const handleFabPointerDown = () => {
  fabLongPressTriggered.value = false;
  fabHoldTimer = window.setTimeout(() => {
    fabLongPressTriggered.value = true;
    refreshWindDetail();
  }, 600);
};

const clearFabTimer = () => {
  if (fabHoldTimer) {
    clearTimeout(fabHoldTimer);
    fabHoldTimer = null;
  }
};

const handleFabPointerUp = () => {
  if (fabLongPressTriggered.value) {
    clearFabTimer();
    return;
  }
  clearFabTimer();
  openWindModal();
};

const handleFabPointerLeave = () => {
  clearFabTimer();
};

onMounted(() => {
  loadPoliceNews();
  loadWindStations();
  loadFutureForecastForTown();
});
</script>

<template>
  <div class="page-shell min-h-screen bg-[#F8F8F8] pb-24" :class="{ 'modal-open': isWindModalOpen || isNewsModalOpen }">
    <main class="mx-auto flex max-w-5xl flex-col gap-2 px-4 pt-6">
      <!-- ① 標題區 -->
      <h2 class="text-3xl font-bold text-grey-900 ml-2">總覽</h2>
      <p class="text-sm font-bold text-grey-500 ml-2">目前位址：</p>

      <section class="rounded-2xl bg-white px-4 py-4 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex-1 min-w-[200px]">
            <p class="text-base font-semibold text-grey-900 break-words text-left">
              {{ locationLabel }}
            </p>
            <p v-if="userCoords" class="text-xs text-grey-500 text-left">
              經緯度：{{ userCoords.lat.toFixed(4) }}, {{ userCoords.lng.toFixed(4) }}
            </p>
            <p v-if="locationError" class="text-xs text-rose-500 text-left">
              {{ locationError }}
            </p>
          </div>
          <button
            class="rounded-full border border-primary-500 px-6 py-1.5 text-xs font-semibold text-primary-500 shadow-sm"
            @click="requestUserLocation"
            :disabled="isLocating"
          >
            {{ isLocating ? '定位中...' : '更新定位' }}
          </button>
        </div>
        <p class="mt-2 text-xs text-grey-400">
          若 Android 裝置未跳出定位授權提示，請點擊「更新定位」並確認 App 已獲得 GPS 權限。
        </p>
      </section>

      <!-- ② 即時資訊卡片區 -->
      <div class="flex mt-2">
        <p class="flex-none basis-1/2 font-bold text-sm text-grey-500 ml-2">即時風速</p>
        <p class="flex-none basis-1/2 font-bold text-sm text-grey-500">行車建議</p>
      </div>
      <section class="info-grid">
        <div class="info-card rounded-2xl bg-white p-4 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
          <div class="mb-3 flex items-center justify-between">
            <div>
              <div class="flex items-end gap-2">
                <span class="text-2xl font-bold text-grey-900">{{ windInfoDisplay.speed }}</span>
                <span class="text-lg text-grey-500">{{ windInfoDisplay.unit }}</span>
              </div>
            </div>
            <div class="text-2xl">🧭</div>
          </div>
          <div class="mb-2 flex items-center justify-between text-sm text-grey-600">
            <span>{{ windInfoDisplay.direction }}</span>
            <span>
              {{ isWindDataReady ? `${windInfoDisplay.intensity}%` : '更新中' }}
            </span>
          </div>
          <div class="segment-track mt-1.5">
            <span v-for="(active, idx) in windIntensitySegments" :key="`wind-intensity-${idx}`"
              class="segment-track__item" :class="{ 'segment-track__item--active': active }"></span>
          </div>
          <p v-if="nearestStation" class="mt-2 text-[11px] text-grey-500">
            來源測站：{{ nearestStation.station_name }}
          </p>
          <p v-else-if="isWindStationLoading" class="mt-2 text-[11px] text-grey-400">
            載入測站資料中...
          </p>
          <p v-else-if="windStationError" class="mt-2 text-[11px] text-rose-500">
            {{ windStationError }}
          </p>
        </div>
        <div class="info-card rounded-2xl bg-white p-4 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
          <h2 class="mb-3 text-xl font-bold text-grey-900">
            {{ drivingAdviceBlock.title }}
          </h2>
          <p class="text-sm text-grey-600 leading-relaxed">
            {{ drivingAdviceBlock.body }}
          </p>
        </div>
      </section>

      <!-- ③ 服務列表區 -->
      <!-- <section class="rounded-2xl bg-white px-3 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
        <h2 class="mb-3 text-lg font-bold text-grey-900">服務列表</h2>
        <div
          class="service-scroll flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-5 sm:gap-2.5 sm:pb-0"
        >
          <button
            v-for="service in services"
            :key="service.id"
            :disabled="service.disabled"
            @click="!service.disabled && service.route && navigateTo(service.route)"
            class="flex min-w-[90px] flex-col items-center rounded-xl border px-2.5 py-2 text-[11px] transition sm:min-w-0"
            :class="service.disabled ? 'cursor-not-allowed border-grey-200 bg-white text-grey-400 opacity-70' : 'border-[#62A3A6] bg-white text-grey-700 hover:bg-primary-50'"
          >
            <span class="mb-1 text-xl text-[#62A3A6]">{{ service.icon }}</span>
            <span class="text-[11px] font-medium text-grey-700">{{ service.name }}</span>
            <span v-if="service.disabled" class="text-[10px] text-grey-400">即將推出</span>
          </button>
        </div>
      </section> -->

      <!-- ④ 路況查看區 -->
      <p class="text-sm font-bold text-grey-500 ml-2 mt-2">{{ mapPreview.title }}</p>

      <section class="rounded-2xl bg-white px-3 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
        <div class="mb-3 flex items-start justify-between gap-4">
          <div>
            <p class="text-sm text-grey-500">{{ mapPreview.updatedAt }}</p>
          </div>
          <button
            type="button"
            class="text-sm font-semibold text-primary-500"
            @click="navigateTo('traffic')"
          >
            {{ mapPreview.addressHint }}
          </button>
        </div>
        <div class="route-card flex flex-col gap-3 rounded-2xl bg-gradient-to-br from-primary-100 to-blue-100 p-3">
          <div class="map-embed map-embed--compact">
            <iframe
              :src="mapEmbedUrl"
              title="Google Maps"
              class="map-embed__iframe"
              loading="lazy"
              allowfullscreen
              referrerpolicy="no-referrer-when-downgrade"
            ></iframe>
            <div class="map-embed__badge">
              {{ mapPreview.road }}・{{ mapPreview.landmark }}
            </div>
            <div class="map-embed__actions">
              <button
                type="button"
                class="map-action-btn"
                @click="requestUserLocation"
              >
                重新定位
              </button>
              <button
                type="button"
                class="map-action-btn map-action-btn--primary"
                @click="openMapInGoogle"
              >
                開啟 Google Maps
              </button>
            </div>
          </div>
          <div class="rounded-xl border border-dashed border-primary-300 bg-white/70 p-3 text-sm text-grey-700">
            <div class="font-semibold text-grey-900">街口資訊 (API 預留)</div>
            <div class="text-base text-grey-800">{{ streetInfo.intersection }}</div>
            <div class="text-grey-600">{{ streetInfo.status }}</div>
            <div class="text-[12px] text-grey-500">{{ streetInfo.source }}</div>
          </div>
        </div>
      </section>

      <!-- ⑤ 即時訊息區 -->
      <p class="text-sm font-bold text-grey-500 ml-3 mt-2">即時訊息</p>
      <section class="rounded-2xl bg-white px-3 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
        <div class="mb-3 flex items-center justify-end">
          <button class="text-sm font-semibold text-primary-500" @click="openNewsModal">
            查看更多 >
          </button>
        </div>
        <div v-if="isNewsLoading" class="py-6 text-center text-sm text-grey-500">即時訊息更新中...</div>
        <template v-else>
          <div class="space-y-3">
            <article
              v-for="item in previewNews"
              :key="item.id"
              class="rounded-2xl bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
            >
              <h3 class="mb-2 text-base font-semibold text-grey-900">{{ item.title }}</h3>
              <p
                v-for="(line, idx) in splitLines(item.description)"
                :key="`preview-line-${item.id}-${idx}`"
                class="text-sm text-grey-600 leading-relaxed"
              >
                {{ line }}
              </p>
              <p class="mt-2 text-xs text-grey-400">{{ item.time || '剛剛更新' }}</p>
            </article>
          </div>
          <p v-if="newsError" class="pt-3 text-center text-xs text-rose-500">{{ newsError }}</p>
        </template>
      </section>
    </main>

    <!-- 風況 FAB -->
    <button v-if="!isWindModalOpen" class="wind-fab" :class="{ 'wind-fab--stale': isWindStale }"
      @pointerdown="handleFabPointerDown" @pointerup="handleFabPointerUp" @pointerleave="handleFabPointerLeave"
      @pointercancel="handleFabPointerLeave">
      <img :src="WindIcon" alt="風況詳情" class="h-10 w-10 object-contain" />
      <span class="wind-fab__dot" v-if="isWindStale"></span>
    </button>

    <!-- 即時訊息 Modal -->
    <Transition name="news-modal">
      <div v-if="isNewsModalOpen" class="news-modal__overlay" @click.self="closeNewsModal">
        <section class="news-modal__panel" @click.stop>
          <header class="news-modal__header">
            <div>
              <p class="text-xs uppercase tracking-[0.3em] text-primary-400">News</p>
              <h2 class="text-xl font-bold text-grey-900">即時訊息</h2>
            </div>
            <button class="news-modal__close" @click="closeNewsModal">✕</button>
          </header>
          <div class="news-modal__body">
            <article
              v-for="item in newsList"
              :key="`news-modal-${item.id}`"
              class="news-modal__item"
            >
              <div class="news-modal__content">
                <h3 class="news-modal__title">
                  {{ item.title }}
                </h3>
                <p
                  v-for="(line, idx) in getVisibleDescriptionLines(item.id, item.description)"
                  :key="`modal-line-${item.id}-${idx}`"
                  class="news-modal__summary"
                >
                  {{ line }}
                </p>
                <button
                  v-if="canShowMoreDescription(item.id, item.description)"
                  class="news-modal__more"
                  @click="expandDescription(item.id)"
                >
                  更多內容
                </button>
                <p class="news-modal__meta">
                  {{ item.time || '剛剛更新' }}
                </p>
              </div>
            </article>
          </div>
        </section>
      </div>
    </Transition>

    <!-- 未來 48 小時風況 Modal -->
    <Transition name="wind-modal">
      <div v-if="isWindModalOpen" class="wind-modal__overlay" @click.self="closeWindModal">
        <section class="wind-modal__panel" @click.stop>
          <header class="wind-modal__header">
            <div class="flex items-center gap-2">
              <img :src="WindIcon" alt="風況 icon" class="h-8 w-8 object-contain" />
              <div>
                <p class="text-xs uppercase tracking-[0.4em] text-primary-400">Wind</p>
                <h2 class="text-xl font-bold text-grey-900">風況情形預測</h2>
              </div>
            </div>
            <button class="wind-modal__close" @click="closeWindModal">✕</button>
          </header>

          <div class="wind-modal__body">
            <div v-if="isFutureForecastLoading" class="wind-modal__state">預報資料更新中...</div>
            <div v-else-if="futureForecastError" class="wind-modal__state">
              {{ futureForecastError }}
            </div>
            <div v-else-if="!futureForecastEntries.length" class="wind-modal__state">
              暫無預報資料
            </div>
            <template v-else>
              <section class="wind-modal__snapshot">
                <div class="flex items-center gap-4">
                  <div class="rounded-full bg-primary-50 p-4 text-4xl">🌀</div>
                  <div>
                    <p class="text-xs text-grey-500">{{ futureSourceLabel }}</p>
                    <p class="text-xs text-grey-500">最新時段：{{ formattedUpdatedAt }}</p>
                    <p class="mt-2 text-5xl font-bold text-grey-900">
                      {{ selectedForecastEntry?.windSpeedValue.toFixed(1) ?? '—' }}
                      <span class="text-lg font-medium">m/s</span>
                    </p>
                    <p class="text-sm font-semibold text-grey-700">
                      {{ futureForecastDistrict || nearestStation?.town || '位置更新中' }}
                    </p>
                    <p class="text-sm text-grey-600">
                      {{ selectedForecastEntry?.weather ?? '天氣資訊更新中' }}
                    </p>
                  </div>
                </div>
              </section>

              <section class="wind-modal__table">
                <div class="wind-info-row">
                  <span>天氣預報</span>
                  <strong>{{ selectedForecastEntry?.weather ?? '—' }}</strong>
                </div>
                <div class="wind-info-row">
                  <span>風向</span>
                  <strong>{{ selectedForecastEntry?.windDirection ?? '—' }}</strong>
                </div>
                <div class="wind-info-row">
                  <span>風速</span>
                  <strong>{{ selectedForecastEntry?.windSpeedText ?? '—' }}</strong>
                </div>
                <div class="wind-info-row">
                  <span>3 小時降雨機率</span>
                  <strong>{{ selectedForecastEntry?.rainProbability ?? '—' }}</strong>
                </div>
                <div class="wind-info-row">
                  <span>溫度</span>
                  <strong>{{ selectedForecastEntry?.temperature ?? '—' }}</strong>
                </div>
                <div class="wind-info-row">
                  <span>體感溫度</span>
                  <strong>{{ selectedForecastEntry?.apparentTemperature ?? '—' }}</strong>
                </div>
                <div class="wind-info-row">
                  <span>相對濕度</span>
                  <strong>{{ selectedForecastEntry?.humidity ?? '—' }}</strong>
                </div>
                <div class="wind-info-row wind-info-row--risk">
                  <div>
                    <span>風險等級</span>
                    <p class="text-xs text-grey-500">{{ forecastRiskLabel }}</p>
                  </div>
                  <div class="risk-bars">
                    <span v-for="(filled, index) in riskSegments" :key="index" class="risk-bars__item"
                      :class="{ 'risk-bars__item--active': filled }"></span>
                  </div>
                </div>
              </section>

              <section class="wind-modal__chart">
                <div class="mb-2 flex items-center justify-between">
                  <h3 class="text-base font-semibold text-grey-900">風速趨勢圖（未來 24 小時）</h3>
                  <p class="text-xs text-grey-500">單位：m/s</p>
                </div>
                <div class="trend-chart">
                  <svg :viewBox="`0 0 ${chartWidth} ${chartHeight}`" xmlns="http://www.w3.org/2000/svg">
                    <line v-for="tick in 4" :key="tick" :x1="chartPadding" :x2="chartWidth - chartPadding"
                      :y1="chartPadding + (tick * (chartHeight - chartPadding * 2)) / 4"
                      :y2="chartPadding + (tick * (chartHeight - chartPadding * 2)) / 4" stroke="#E5E7EB" stroke-width="1"
                      stroke-dasharray="4 6" />
                    <path :d="trendLinePath" fill="none" stroke="#31949A" stroke-width="3" stroke-linecap="round"
                      stroke-linejoin="round" />
                    <circle v-for="(point, index) in forecastTrendPoints" :key="`dot-${index}`" :cx="point.x"
                      :cy="point.y" r="4" fill="#fff" stroke="#31949A" stroke-width="2" />
                  </svg>
                  <div
                    class="trend-chart__labels"
                    :style="{ gridTemplateColumns: `repeat(${forecastTrendPoints.length}, minmax(0, 1fr))` }"
                  >
                    <span v-for="(point, index) in forecastTrendPoints" :key="`label-${index}`">
                      <span class="trend-chart__label-time">{{ point.label.time }}</span>
                      <span class="trend-chart__label-date">{{ point.label.date }}</span>
                    </span>
                  </div>
                </div>
              </section>

              <section class="wind-modal__timeline">
                <h3 class="text-base font-semibold text-grey-900">時段列表</h3>
                <div class="wind-timeline">
                  <div v-for="entry in futureForecastEntries" :key="entry.timestamp" class="wind-timeline__item">
                    <p class="wind-timeline__time">{{ entry.displayTime }}</p>
                    <p class="wind-timeline__speed">{{ entry.windSpeedValue.toFixed(1) }} m/s</p>
                    <p class="wind-timeline__meta">{{ entry.windDirection }}</p>
                    <p class="wind-timeline__rain">{{ entry.rainProbability }}</p>
                  </div>
                </div>
              </section>
            </template>
          </div>
        </section>
      </div>
    </Transition>

    <!-- 底部導航 -->
    <BottomNav />
  </div>
</template>

<style scoped>
.service-scroll {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.service-scroll::-webkit-scrollbar {
  display: none;
}

.info-grid {
  display: flex;
  gap: 0.5rem;
}

.info-card {
  flex: 1 1 0;
  min-width: 0;
}

@media (max-width: 640px) {
  .info-grid {
    gap: 0.25rem;
  }

  .info-card {
    flex: 0 0 calc(50% - 0.25rem);
  }
}

.route-card {
  min-height: 18rem;
}

@media (min-width: 768px) {
  .route-card {
    min-height: 22rem;
  }
}

.wind-fab {
  position: fixed;
  right: 1.5rem;
  bottom: 7rem;
  width: 64px;
  height: 64px;
  border-radius: 999px;
  border: 2px solid #5AB4C5;
  background: #fff;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  z-index: 60;
}

.wind-fab__dot {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #f97316;
  animation: pulse 1.2s infinite;
}

.page-shell.modal-open {
  overflow: hidden;
}

.wind-modal__overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: clamp(1rem, 6vh, 2.5rem) 0.85rem 1.25rem;
  z-index: 80;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.wind-modal__overlay::-webkit-scrollbar {
  display: none;
}

.wind-modal__panel {
  width: 100%;
  max-width: 520px;
  max-height: calc(100vh - clamp(1rem, 5vh, 2rem));
  background: #fff;
  border-radius: 24px;
  padding: 1.5rem;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
}

.wind-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  position: sticky;
  top: 0;
  background: #fff;
  padding-bottom: 0.5rem;
  z-index: 5;
}

.wind-modal__close {
  border: none;
  background: transparent;
  font-size: 1.2rem;
  color: #888;
  cursor: pointer;
  padding: 0.25rem;
  transition: color 0.2s ease;
}

.wind-modal__close:hover {
  color: #444;
}

.wind-modal__body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding-right: 0.25rem;
  padding-bottom: 2.5rem;
}

.wind-modal__body::-webkit-scrollbar {
  display: none;
}

.wind-modal__state {
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.95rem;
  color: #6b7280;
}

.wind-modal__snapshot {
  margin-bottom: 1.5rem;
}

.wind-modal__table {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.wind-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.95rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #eee;
}

.wind-info-row--risk {
  align-items: flex-start;
}

.risk-bars {
  display: flex;
  gap: 0.3rem;
}

.risk-bars__item {
  width: 32px;
  height: 8px;
  border-radius: 999px;
  background: #dadada;
}

.risk-bars__item--active {
  background: #62a3a6;
}

.wind-modal__chart {
  margin-top: 1.5rem;
}

.trend-chart {
  background: #f8fafa;
  border-radius: 16px;
  padding: 1rem;
}

.trend-chart__labels {
  display: grid;
  gap: 0.4rem;
  font-size: 0.7rem;
  color: #6b7280;
  margin-top: 0.5rem;
  text-align: center;
}

.trend-chart__labels span {
  white-space: nowrap;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-weight: 600;
}

.trend-chart__label-time {
  font-size: 0.75rem;
  color: #0f172a;
}

.trend-chart__label-date {
  font-size: 0.65rem;
  color: #6b7280;
}

.wind-modal__timeline {
  margin-top: 1.5rem;
}

.wind-timeline {
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-right: 0.5rem;
}

.wind-timeline::-webkit-scrollbar {
  width: 4px;
}

.wind-timeline::-webkit-scrollbar-thumb {
  background: #cbd5f5;
  border-radius: 999px;
}

.wind-timeline__item {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.85rem;
  background: #f8fafa;
  font-size: 0.8rem;
  color: #374151;
}

.wind-timeline__time {
  font-weight: 600;
  color: #0f172a;
}

.wind-timeline__speed {
  font-weight: 600;
  color: #31949a;
}

.wind-timeline__rain {
  text-align: right;
  color: #6b7280;
}

.wind-modal-enter-active,
.wind-modal-leave-active {
  transition: opacity 0.25s ease;
}

.wind-modal-enter-from,
.wind-modal-leave-to {
  opacity: 0;
}

.wind-modal__panel {
  animation: slide-up 0.3s ease;
}

.news-modal__overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: clamp(2rem, 10vh, 4rem) clamp(0.75rem, 3vw, 1.5rem) calc(1.5rem + 64px);
  z-index: 85;
}

.news-modal__panel {
  width: 100%;
  max-width: 520px;
  max-height: calc(100vh - clamp(1.5rem, 6vh, 3rem));
  background: #fff;
  border-radius: 28px;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
}

.news-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #f0f0f0;
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 2;
}

.news-modal__close {
  border: none;
  background: transparent;
  font-size: 1.1rem;
  color: #888;
  cursor: pointer;
}

.news-modal__body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-top: 1rem;
  padding-bottom: calc(env(safe-area-inset-bottom) + 4rem);
  gap: 1rem;
  display: flex;
  flex-direction: column;
}

.news-modal__item {
  padding: 0.75rem;
  border-radius: 16px;
  background: #f9fbfb;
  border: 1px solid #e1f0f1;
}

.news-modal__content {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.news-modal__title {
  font-size: 1rem;
  font-weight: 600;
  color: #1f2937;
}

.news-modal__summary {
  font-size: 0.875rem;
  color: #4b5563;
  line-height: 1.4;
}

.news-modal__meta {
  font-size: 0.75rem;
  color: #9ca3af;
}

.news-modal__more {
  border: 1px solid #62a3a6;
  background: #fff;
  color: #31949a;
  border-radius: 999px;
  padding: 0.25rem 1rem;
  font-size: 0.8rem;
  font-weight: 600;
  width: fit-content;
  align-self: flex-start;
  margin-top: 0.25rem;
}

.news-modal-enter-active,
.news-modal-leave-active {
  transition: opacity 0.25s ease;
}

.news-modal-enter-from,
.news-modal-leave-to {
  opacity: 0;
}

.news-modal__panel {
  animation: slide-up 0.28s ease;
}

@keyframes slide-up {
  from {
    transform: translateY(40px);
  }

  to {
    transform: translateY(0);
  }
}

@keyframes pulse {
  0% {
    opacity: 0.6;
    transform: scale(1);
  }

  50% {
    opacity: 1;
    transform: scale(1.2);
  }

  100% {
    opacity: 0.6;
    transform: scale(1);
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
