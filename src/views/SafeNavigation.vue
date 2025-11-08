<script setup lang="ts">
import { computed, ref } from 'vue';
import BottomNav from '@/components/BottomNav.vue';
import Input from '@/components/base/Input.vue';
import Button from '@/components/base/Button.vue';
import { getSafeNavigationData } from '@/utils/api';
import type { SafeRouteSegment } from '@/utils/api';

const {
  defaultStart,
  defaultEnd,
  segments,
  mapEmbedUrl
} = getSafeNavigationData();

const origin = ref(defaultStart);
const destination = ref(defaultEnd);
const selectedSegment = ref<SafeRouteSegment | null>(null);

const canNavigate = computed(() => Boolean(origin.value && destination.value));

const resetNavigation = () => {
  origin.value = '';
  destination.value = '';
  selectedSegment.value = null;
};

const startNavigation = () => {
  if (!canNavigate.value) {
    return;
  }
  const url = `https://www.google.com/maps/dir/${encodeURIComponent(origin.value)}/${encodeURIComponent(destination.value)}`;
  window.open(url, '_blank');
};

const selectSegment = (segment: SafeRouteSegment) => {
  selectedSegment.value = segment;
};

const getWindSegments = (speed: number) => {
  const segments = 5;
  const maxSpeed = 15;
  const ratio = Math.min(speed, maxSpeed) / maxSpeed;
  return Array.from({ length: segments }, (_, index) => ratio >= (index + 1) / segments);
};

const openSafeMap = () => {
  if (!mapEmbedUrl) {
    return;
  }
  window.open(mapEmbedUrl, '_blank', 'noopener');
};
</script>

<template>
  <div class="min-h-screen bg-white pb-24">
    <main class="mx-auto flex max-w-5xl flex-col gap-4 px-4 pt-6">
      <!--  輸入區 -->
      <section class="rounded-2xl border border-grey-100 px-4 py-4 shadow-sm">
        <div class="space-y-4">
          <label class="flex items-center gap-3 rounded-xl border border-grey-200 px-4 py-3">
            <span class="text-2xl text-primary-500">📍</span>
            <Input
              v-model="origin"
              placeholder="輸入出發點"
              class="w-full border-0 bg-transparent p-0 text-base text-grey-900 focus:ring-0"
            />
          </label>
          <label class="flex items-center gap-3 rounded-xl border border-grey-200 px-4 py-3">
            <span class="text-2xl text-primary-500">🎯</span>
            <Input
              v-model="destination"
              placeholder="輸入目的地"
              class="w-full border-0 bg-transparent p-0 text-base text-grey-900 focus:ring-0"
            />
          </label>
        </div>
      </section>

      <!-- 迴避路徑建議區 -->
      <section class="rounded-2xl border border-grey-100 px-4 py-4 shadow-sm">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-lg font-bold text-grey-900">建議路段風速</h2>
          <p class="text-xs text-grey-500">長按路段可在地圖中高亮</p>
        </div>
        <div class="max-h-48 space-y-3 overflow-y-auto pr-2">
          <button
            v-for="segment in segments"
            :key="segment.id"
            class="w-full rounded-2xl border px-3 py-3 text-left transition hover:border-primary-300"
            :class="selectedSegment?.id === segment.id ? 'border-primary-500 bg-[#E6F1F2]' : 'border-grey-100 bg-white'"
            @click="selectSegment(segment)"
          >
            <div class="flex items-center justify-between">
              <p class="text-sm font-semibold text-grey-800">{{ segment.name }}</p>
              <span class="text-sm font-bold text-primary-600">
                {{ segment.windSpeed.toFixed(1) }} m/s
              </span>
            </div>
            <div class="segment-track mt-2">
              <span
                v-for="(active, index) in getWindSegments(segment.windSpeed)"
                :key="`${segment.id}-meter-${index}`"
                class="segment-track__item"
                :class="{ 'segment-track__item--active': active }"
              ></span>
            </div>
            <p class="mt-2 text-xs text-grey-500">{{ segment.note }}</p>
          </button>
        </div>
      </section>

      <!-- 路線規劃地圖區 -->
      <section class="rounded-3xl border border-grey-100 shadow-lg">
        <div class="map-embed">
          <iframe
            :src="mapEmbedUrl"
            title="Safe navigation map"
            loading="lazy"
            allowfullscreen
            referrerpolicy="no-referrer-when-downgrade"
          ></iframe>
          <div class="map-embed__badge">導航預覽</div>
          <div class="map-embed__actions">
            <button type="button" class="map-action-btn" @click="resetNavigation">
              清除輸入
            </button>
            <button type="button" class="map-action-btn map-action-btn--primary" @click="openSafeMap">
              Google Maps
            </button>
          </div>
          <div class="absolute inset-x-4 top-4 rounded-2xl bg-white/95 p-4 shadow">
            <div v-if="selectedSegment">
              <p class="text-xs uppercase tracking-widest text-grey-500">已選路段</p>
              <h3 class="mt-1 text-lg font-bold text-primary-600">{{ selectedSegment.name }}</h3>
              <p class="text-sm text-grey-600">
                {{ selectedSegment.direction }}，風速 {{ selectedSegment.windSpeed.toFixed(1) }} m/s
              </p>
              <p class="mt-1 text-xs text-grey-500">{{ selectedSegment.note }}</p>
            </div>
            <div v-else>
              <p class="text-sm font-semibold text-grey-800">點擊上方風速列表以查看詳情</p>
              <p class="text-xs text-grey-500">地圖顯示建議路線，起終點已標記。</p>
            </div>
          </div>
        </div>
      </section>

      <!-- 功能按鈕區 -->
      <section class="grid grid-cols-2 gap-3">
        <Button
          outline
          class="w-full rounded-2xl border-2 border-primary-500 bg-white py-4 text-primary-500 shadow"
          @click="resetNavigation"
        >
          重新設定
        </Button>
        <Button
          class="w-full rounded-2xl bg-primary-500 py-4 text-white shadow"
          :class="{ 'opacity-60': !canNavigate }"
          :disabled="!canNavigate"
          @click="startNavigation"
        >
          開始導航
        </Button>
      </section>
    </main>

    <BottomNav />
  </div>
</template>

<style scoped>
label input:focus {
  outline: none;
  box-shadow: none;
}
</style>
