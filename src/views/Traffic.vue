<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import BottomNav from '@/components/BottomNav.vue';
import {
  getTrafficLayerPresets,
  getTrafficMapEmbedUrl,
  getTrafficTabs
} from '@/utils/api';
import type { TrafficTab } from '@/utils/api';

const router = useRouter();

const filters = getTrafficTabs();
const layerPresets = getTrafficLayerPresets();
const mapEmbedUrl = getTrafficMapEmbedUrl();

const selectedFilters = ref<TrafficTab['id'][]>(
  filters.length ? [filters[0].id] : []
);

const detailLayerId = ref<TrafficTab['id'] | null>(null);

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
  selectedFilters.value.map(id => ({
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

const goHome = () => {
  router.push({ name: 'home' });
};

const openTrafficMap = () => {
  if (!mapEmbedUrl) {
    return;
  }
  window.open(mapEmbedUrl, '_blank', 'noopener');
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
            class="w-full rounded-full border px-3 py-1.5 text-center text-sm font-medium transition-all"
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
            {{ filter.label }}
          </button>
        </div>
        <p class="mt-2 text-xs text-grey-400">
          可複選路段類型，自訂顯示的地圖圖層
        </p>
      </section>

      <!-- 地圖顯示區 -->
      <section class="flex-1 rounded-3xl border border-grey-100 shadow-lg">
        <div class="map-embed map-embed--tall">
          <iframe
            :src="mapEmbedUrl"
            title="Taipei live traffic map"
            loading="lazy"
            allowfullscreen
            referrerpolicy="no-referrer-when-downgrade"
          ></iframe>
          <div class="map-embed__badge">即時路況</div>
          <div class="map-embed__actions">
            <button type="button" class="map-action-btn" @click="goHome">
              回首頁
            </button>
            <button
              type="button"
              class="map-action-btn map-action-btn--primary"
              @click="openTrafficMap"
            >
              開啟 Google Maps
            </button>
          </div>

          <!-- 浮動資訊卡 -->
          <Transition name="fade">
            <div
              v-if="detailLayer"
              class="absolute inset-x-4 top-4 rounded-2xl bg-white/95 p-4 shadow-lg"
            >
              <div class="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-grey-500">
                <span>路段詳情</span>
                <button class="text-xs font-semibold text-primary-500" @click="detailLayerId = null">
                  關閉
                </button>
              </div>
              <h2 class="mt-2 text-lg font-bold" :style="{ color: detailLayer.color }">
                {{ detailLayer.title }}
              </h2>
              <p class="mt-1 text-sm text-grey-600">
                {{ detailLayer.description }}
              </p>
              <p class="mt-2 text-xs font-medium text-grey-500">
                {{ detailLayer.highlight }}
              </p>
              <p class="mt-3 text-[11px] text-grey-400">雙指縮放地圖，點擊標記了解更多。</p>
            </div>
          </Transition>

          <!-- 選中路段徽章 -->
          <div
            v-if="hasSelection"
            class="absolute left-4 bottom-24 flex flex-wrap gap-2 rounded-2xl bg-white/90 px-3 py-2 shadow"
          >
            <button
              v-for="layer in activeLayers"
              :key="layer.id"
              class="rounded-full border px-3 py-1 text-xs font-semibold"
              :style="{ borderColor: layer.color, color: layer.color }"
              @click="handleLayerClick(layer.id)"
            >
              {{ layer.title }}
            </button>
          </div>
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
