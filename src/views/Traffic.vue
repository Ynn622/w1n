<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import BottomNav from '@/components/BottomNav.vue';
import GoogleMap from '@/components/common/GoogleMap.vue';
import {
  fetchRoadRiskSegments,
  getTrafficLayerPresets,
  getTrafficMapEmbedUrl,
  getTrafficTabs,
  reverseGeocode
} from '@/utils/api';
import type { SafeRouteSegment, TrafficTab } from '@/utils/api';
import type { LatLng, MapMarkerDescriptor, MapPolylineDescriptor } from '@/types/maps';

const filters = getTrafficTabs();
const layerPresets = getTrafficLayerPresets();
const defaultTrafficCenter: LatLng = { lat: 25.045193, lng: 121.541269 };
const mapEmbedUrl = getTrafficMapEmbedUrl();
const mapCenter = ref<LatLng>(defaultTrafficCenter);
const userCoords = ref<LatLng | null>(null);
const isLocating = ref(false);
const locationError = ref<string | null>(null);
const canUseGeolocation = typeof window !== 'undefined' && 'geolocation' in navigator;

const selectedFilters = ref<TrafficTab['id'][]>(
  filters.filter((filter) => filter.id !== 'safe').map((filter) => filter.id)
);

const detailLayerId = ref<TrafficTab['id'] | null>(null);
const categoryLevelMap: Record<TrafficTab['id'], number[]> = {
  safe: [1, 2],
  avoid: [3, 4],
  danger: [5]
};

const categorySegments = ref<Record<TrafficTab['id'], SafeRouteSegment[]>>({
  safe: [],
  danger: [],
  avoid: []
});
const isSegmentLoading = ref(false);
const segmentError = ref<string | null>(null);
const lastUpdatedLabel = ref('資料更新中…');
const riskLevelCache = new Map<number, SafeRouteSegment[]>();

const pullRiskSegments = async () => {
  if (!filters.length) {
    return;
  }
  const levels = Array.from(
    new Set(filters.flatMap((filter) => categoryLevelMap[filter.id] ?? []))
  ).sort((a, b) => a - b);
  if (!levels.length) {
    return;
  }
  isSegmentLoading.value = true;
  segmentError.value = null;
  try {
    await Promise.all(
      levels.map(async (level) => {
        if (riskLevelCache.has(level)) {
          return;
        }
        const segments = await fetchRoadRiskSegments(level);
        riskLevelCache.set(level, segments);
      })
    );
    const snapshot: Record<TrafficTab['id'], SafeRouteSegment[]> = { safe: [], danger: [], avoid: [] };
    (Object.keys(categoryLevelMap) as TrafficTab['id'][]).forEach((categoryId) => {
      const categoryLevels = categoryLevelMap[categoryId] ?? [];
      snapshot[categoryId] = categoryLevels.flatMap((level) => riskLevelCache.get(level) ?? []);
    });
    categorySegments.value = snapshot;
    const latestUpdate = Array.from(riskLevelCache.values())
      .flat()
      .filter((segment) => segment?.updatedAt)
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0]?.updatedAt;
    if (latestUpdate) {
      lastUpdatedLabel.value = `更新：${new Date(latestUpdate).toLocaleString()}`;
    } else {
      lastUpdatedLabel.value = '更新時間：資料來源提供中';
    }
  } catch (error) {
    console.warn('[Traffic] 無法取得道路風險資料', error);
    segmentError.value = '無法載入道路風險資料，請稍後再試。';
  } finally {
    isSegmentLoading.value = false;
  }
};

const toggleFilter = (filterId: TrafficTab['id']) => {
  const currentIndex = selectedFilters.value.indexOf(filterId);
  if (currentIndex > -1) {
    selectedFilters.value.splice(currentIndex, 1);
  } else {
    selectedFilters.value.push(filterId);
  }
  // TODO: 根據 selectedFilters 的陣列呼叫地圖 Layer API 顯示對應圖層
};

watch(selectedFilters, (filters) => {
  if (detailLayerId.value && !filters.includes(detailLayerId.value)) {
    detailLayerId.value = null;
  }
});

const hasSelection = computed(() => selectedFilters.value.length > 0);

const activeLayers = computed(() =>
  selectedFilters.value.map((id) => ({
    id,
    ...layerPresets[id]
  }))
);

const detailLayer = computed(() => {
  if (!detailLayerId.value) {
    return null;
  }
  const preset = layerPresets[detailLayerId.value];
  if (!preset) {
    return null;
  }
  return {
    id: detailLayerId.value,
    ...preset
  };
});

const handleLayerClick = (layerId: TrafficTab['id']) => {
  if (!selectedFilters.value.includes(layerId)) {
    return;
  }
  detailLayerId.value = layerId;
  // TODO: 接上地圖 click 事件後可在此觸發
};

const currentAddress = ref('尚未鎖定地址');

const locationLabel = computed(() => currentAddress.value);
const categoryCounts = computed<Record<TrafficTab['id'], number>>(() => {
  const record: Record<TrafficTab['id'], number> = {
    safe: categorySegments.value.safe.length,
    danger: categorySegments.value.danger.length,
    avoid: categorySegments.value.avoid.length
  };
  return record;
});

const categoryLegends = computed(() =>
  filters.map((filter) => ({
    ...layerPresets[filter.id],
    id: filter.id,
    levels: categoryLevelMap[filter.id],
    count: categoryCounts.value[filter.id]
  }))
);

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
      const coords = { lat: latitude, lng: longitude };
      userCoords.value = coords;
      mapCenter.value = coords;
      try {
        const address = await reverseGeocode(latitude, longitude);
        currentAddress.value = address || '無法取得地址名稱';
      } catch (error) {
        console.warn('reverse geocode failed', error);
        currentAddress.value = '無法取得地址名稱';
      }
      isLocating.value = false;
    },
    (error) => {
      isLocating.value = false;
      switch (error.code) {
        case error.PERMISSION_DENIED:
          locationError.value = '使用者拒絕定位授權';
          break;
        case error.POSITION_UNAVAILABLE:
          locationError.value = '定位資訊不可用';
          break;
        case error.TIMEOUT:
          locationError.value = '定位逾時，請重新嘗試';
          break;
        default:
          locationError.value = '無法取得定位資訊';
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
};

const trafficMapMarkers = computed<MapMarkerDescriptor[]>(() => {
  if (!userCoords.value) {
    return [];
  }
  return [
    {
      id: 'traffic-user',
      position: userCoords.value,
      color: '#1F8A70',
      label: '目前位置',
      zIndex: 10
    }
  ];
});

const trafficPolylines = computed<MapPolylineDescriptor[]>(() => {
  const polylines: MapPolylineDescriptor[] = [];
  selectedFilters.value.forEach((categoryId) => {
    const color = layerPresets[categoryId]?.color ?? '#111827';
    const weight = categoryId === 'danger' ? 6 : categoryId === 'avoid' ? 5 : 4;
    const opacity = categoryId === 'safe' ? 0.8 : 0.95;
    const dashed = categoryId === 'safe';
    const zIndex = categoryId === 'danger' ? 50 : categoryId === 'avoid' ? 40 : 35;
    categorySegments.value[categoryId]
      ?.filter((segment) => segment.start && segment.end)
      .forEach((segment, index) => {
        polylines.push({
          id: `traffic-${categoryId}-${segment.id ?? index}`,
          path: [segment.start!, segment.end!],
          color,
          weight,
          opacity,
          zIndex,
          dashed,
          dashSpacing: dashed ? '24px' : undefined
        });
      });
  });
  return polylines;
});

const totalVisibleSegments = computed(() =>
  selectedFilters.value.reduce(
    (sum, categoryId) => sum + (categoryCounts.value[categoryId] ?? 0),
    0
  )
);

const detailSegments = computed(() => {
  if (!detailLayerId.value) {
    return [];
  }
  return categorySegments.value[detailLayerId.value] ?? [];
});

const detailSegmentPreview = computed(() => detailSegments.value.slice(0, 4));
const remainingDetailCount = computed(() =>
  Math.max(0, detailSegments.value.length - detailSegmentPreview.value.length)
);

watch(
  () => trafficPolylines.value,
  (polylines) => {
    if (userCoords.value || !polylines.length) {
      return;
    }
    const firstPath = polylines[0].path;
    if (firstPath?.length) {
      mapCenter.value = firstPath[0];
    }
  },
  { immediate: true }
);

onMounted(() => {
  pullRiskSegments();
});

const openTrafficMap = () => {
  if (!mapEmbedUrl) {
    return;
  }
  window.open(mapEmbedUrl, '_blank', 'noopener,noreferrer');
};
</script>

<template>
  <div class="min-h-screen bg-white pb-24">
    <main class="mx-auto flex max-w-5xl flex-col gap-3 px-4 pt-4">
      <!-- 分類標籤列 -->
      <section class="rounded-2xl border border-grey-100 px-3 py-3 shadow-sm">
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="filter in filters"
            :key="filter.id"
            type="button"
            class="w-full rounded-full border px-3 py-1.5 text-center text-xs font-medium transition-all"
            :class="
              selectedFilters.includes(filter.id)
                ? 'shadow-sm text-white'
                : ''
            "
            :style="selectedFilters.includes(filter.id)
              ? {
                borderColor: layerPresets[filter.id].color,
                backgroundColor: layerPresets[filter.id].color,
                boxShadow: `0 4px 12px ${layerPresets[filter.id].color}33`
              }
              : {
                borderColor: `${layerPresets[filter.id].color}66`,
                color: layerPresets[filter.id].color,
                backgroundColor: `${layerPresets[filter.id].color}10`
              }"
            @click="toggleFilter(filter.id)"
          >
            <div class="flex items-center justify-center text-base text-center font-semibold">
              <span>{{ filter.label }}</span>
            </div>

          </button>
        </div>
        <p class="mt-2 text-xs text-grey-400">
          可複選路段類型，自訂顯示的地圖圖層
        </p>
        <div class="mt-2 flex flex-wrap items-center gap-3 text-xs text-grey-500">
          <span>{{ lastUpdatedLabel }}</span>
          <button
            type="button"
            class="text-primary-500 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-grey-300"
            :disabled="isSegmentLoading"
            @click="pullRiskSegments"
          >
            {{ isSegmentLoading ? '同步中...' : '重新整理' }}
          </button>
          <span v-if="segmentError" class="text-rose-500">{{ segmentError }}</span>
        </div>
      </section>

      <!-- 地圖顯示區 -->
      <section class="flex-1 rounded-3xl border border-grey-100 shadow-lg overflow-hidden">
        <div class="map-embed map-embed--tall h-full min-h-[360px]">
          <GoogleMap
            :center="mapCenter"
            :markers="trafficMapMarkers"
            :polylines="trafficPolylines"
            :zoom="14"
          />
          <div class="map-embed__badge">
            即時路況 · {{ totalVisibleSegments }} 筆
          </div>
          <div class="map-embed__actions">
            <button
              type="button"
              class="map-action-btn"
              :disabled="isLocating"
              @click="requestUserLocation"
            >
              {{ isLocating ? '定位中...' : '重新定位' }}
            </button>
          </div>
          <div
            v-if="isSegmentLoading"
            class="absolute inset-0 z-40 flex items-center justify-center bg-white/70 text-sm font-semibold text-grey-500 backdrop-blur-[2px]"
          >
            載入路段資料中…
          </div>





          <!-- 圖例
          <div
            class="absolute right-4 bottom-24 z-30 flex w-48 flex-col gap-2 rounded-2xl bg-white/90 p-3 shadow-lg"
          >
            <div
              v-for="legend in categoryLegends"
              :key="legend.id"
              class="border-b border-grey-100 pb-2 last:border-none last:pb-0"
            >
              <div class="flex items-center justify-between text-xs font-semibold text-grey-700">
                <span class="flex items-center gap-2">
                  <span
                    class="inline-flex h-2 w-6 rounded-full"
                    :style="{ backgroundColor: legend.color }"
                  />
                  {{ legend.title }}
                </span>
                <span>{{ legend.count }}</span>
              </div>
              <p class="mt-1 text-[11px] text-grey-500">Lv.{{ legend.levels.join(' / ') }}</p>
            </div>
          </div> -->

          <p
            v-if="segmentError && !isSegmentLoading"
            class="absolute inset-x-4 bottom-4 z-30 rounded-xl bg-rose-50/95 px-3 py-2 text-center text-xs font-semibold text-rose-600 shadow"
          >
            {{ segmentError }}
          </p>
        </div>
      </section>

      <section class="rounded-2xl border border-dashed border-primary-100 bg-white/90 px-4 py-4 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-[0.3em] text-grey-500">定位資訊</p>
        <div class="mt-3 rounded-xl border border-grey-100 bg-white/80 px-3 py-2 text-xs text-grey-600">
          <p class="font-semibold text-grey-800">目前鎖定：{{ locationLabel }}</p>
          <p v-if="locationError" class="mt-1 text-rose-500">{{ locationError }}</p>
          <p v-else class="mt-1 text-grey-400">若未跳出定位授權提示，請確認 App 已開啟 GPS 權限。</p>
        </div>
      </section>
    </main>

    <!-- 底部導航 -->
    <BottomNav />
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-0.5rem);
}
</style>
