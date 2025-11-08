<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import BottomNav from '@/components/BottomNav.vue';
import WindIcon from '@/assets/navicons/Wind.png';
import { getHomeOverview, getWindDetail } from '@/utils/api';

const router = useRouter();

const {
  location,
  advisory,
  windInfo,
  drivingAdvice,
  services,
  mapPreview,
  googleMapEmbed,
  streetInfo,
  newsList
} = getHomeOverview();

const navigateTo = (routeName: string) => {
  router.push({ name: routeName });
};

const windDetail = ref(getWindDetail());
const isWindModalOpen = ref(false);
const isRefreshingWind = ref(false);
const lastUpdated = ref(new Date(windDetail.value.updatedAt));

const formatTime = (date: Date) =>
  `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

const formattedUpdatedAt = computed(() => formatTime(lastUpdated.value));

const isWindStale = computed(
  () => Date.now() - lastUpdated.value.getTime() > 10 * 60 * 1000
);

const riskSegments = computed(() =>
  Array.from({ length: 5 }).map((_, index) => index < windDetail.value.riskLevel)
);

const refreshWindDetail = () => {
  if (isRefreshingWind.value) {
    return Promise.resolve();
  }
  isRefreshingWind.value = true;
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      windDetail.value = getWindDetail();
      lastUpdated.value = new Date(windDetail.value.updatedAt);
      isRefreshingWind.value = false;
      resolve();
    }, 700);
  });
};

const openWindModal = async () => {
  await refreshWindDetail();
  isWindModalOpen.value = true;
};

const closeWindModal = () => {
  isWindModalOpen.value = false;
};

let fabHoldTimer: number | null = null;
const fabLongPressTriggered = ref(false);

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
</script>

<template>
  <div class="min-h-screen bg-[#F8F8F8] pb-24">
    <main class="mx-auto flex max-w-5xl flex-col gap-2 px-4 pt-6">
      <!-- ① 標題區 -->
      <section class="rounded-2xl bg-white px-5 py-4 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
        <div class="flex flex-col gap-1.5 text-center md:text-left">
          <div>
            <h1 class="text-3xl font-bold text-grey-900">即時風況</h1>
          </div>
          <p class="text-base font-semibold text-grey-700">目前位址：{{ location }}</p>
        </div>
      </section>

      <!-- ② 即時資訊卡片區 -->
      <section class="info-grid">
        <div
          class="info-card rounded-2xl bg-white p-4 shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
        >
          <div class="mb-3 flex items-center justify-between">
            <div>
              <p class="text-sm text-grey-500">即時風速</p>
              <div class="flex items-end gap-2">
                <span class="text-2xl font-bold text-grey-900">{{ windInfo.speed }}</span>
                <span class="text-lg text-grey-500">{{ windInfo.unit }}</span>
              </div>
            </div>
            <div class="text-2xl">🧭</div>
          </div>
          <div class="mb-2 flex items-center justify-between text-sm text-grey-600">
            <span>{{ windInfo.direction }}</span>
            <span>{{ windInfo.intensity }}%</span>
          </div>
          <div class="h-2 rounded-full bg-grey-100">
            <div
              class="h-full rounded-full bg-primary-500 transition-all"
              :style="{ width: `${windInfo.intensity}%` }"
            ></div>
          </div>
        </div>

        <div class="info-card rounded-2xl bg-white p-4 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
          <p class="text-sm text-grey-500">行車建議</p>
          <h2 class="mb-3 text-xl font-bold text-grey-900">盡可能減少外出</h2>
          <p class="text-sm text-grey-600 leading-relaxed">
            {{ drivingAdvice }}
          </p>
        </div>
      </section>

      <!-- ③ 服務列表區 -->
      <section class="rounded-2xl bg-white px-3 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
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
      </section>

      <!-- ④ 路況查看區 -->
      <section class="rounded-2xl bg-white px-3 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
        <div class="mb-3">
          <h2 class="text-lg font-bold text-grey-900">{{ mapPreview.title }}</h2>
          <p class="text-sm text-grey-500">{{ mapPreview.updatedAt }}</p>
        </div>
        <div class="route-card flex flex-col gap-3 rounded-2xl bg-gradient-to-br from-primary-100 to-blue-100 p-3">
          <!-- <div class="flex items-center justify-between text-sm text-grey-700">
            <span>{{ mapPreview.road }}</span>
            <span>{{ mapPreview.landmark }}</span>
          </div> -->
          <div class="h-48 overflow-hidden rounded-xl bg-white shadow-inner">
            <iframe
              :src="googleMapEmbed"
              title="Google Maps"
              class="h-full w-full border-0"
              loading="lazy"
              allowfullscreen
              referrerpolicy="no-referrer-when-downgrade"
            ></iframe>
          </div>
          <div
            class="rounded-xl border border-dashed border-primary-300 bg-white/70 p-3 text-sm text-grey-700"
          >
            <div class="font-semibold text-grey-900">街口資訊 (API 預留)</div>
            <div class="text-base text-grey-800">{{ streetInfo.intersection }}</div>
            <div class="text-grey-600">{{ streetInfo.status }}</div>
            <div class="text-[12px] text-grey-500">{{ streetInfo.source }}</div>
          </div>
          <div class="mt-auto flex justify-end pt-1">
            <button class="text-sm font-semibold text-primary-500">
              {{ mapPreview.addressHint }}
            </button>
          </div>
        </div>
      </section>

      <!-- ⑤ 即時訊息區 -->
      <section class="rounded-2xl bg-white px-3 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
        <div class="mb-3 flex flex-col gap-2">
          <h2 class="text-lg font-bold text-grey-900">即時訊息</h2>
        </div>
        <div class="space-y-3">
          <article
            v-for="item in newsList"
            :key="item.id"
            class="flex gap-3 rounded-2xl bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
          >
            <div class="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-grey-100">
              <img
                v-if="item.thumbnail"
                :src="item.thumbnail"
                alt="news thumbnail"
                class="h-full w-full object-cover"
              />
              <div
                v-else
                class="h-full w-full bg-gradient-to-br from-primary-100 to-secondary-100"
              ></div>
            </div>
            <div class="flex flex-col">
              <h3 class="mb-2 text-base font-semibold text-grey-900">{{ item.title }}</h3>
              <p class="text-sm text-grey-600">
                {{ item.summary }}
              </p>
            </div>
          </article>
        </div>
        <div class="mt-2 flex justify-end">
          <button class="text-sm font-semibold text-primary-500">查看更多 ></button>
        </div>
      </section>
    </main>

    <!-- 風況 FAB -->
    <button
      v-if="!isWindModalOpen"
      class="wind-fab"
      :class="{ 'wind-fab--stale': isWindStale }"
      @pointerdown="handleFabPointerDown"
      @pointerup="handleFabPointerUp"
      @pointerleave="handleFabPointerLeave"
      @pointercancel="handleFabPointerLeave"
    >
      <img :src="WindIcon" alt="風況詳情" class="h-10 w-10 object-contain" />
      <span class="wind-fab__dot" v-if="isWindStale"></span>
    </button>

    <!-- 風況詳情 Modal -->
    <Transition name="wind-modal">
      <div
        v-if="isWindModalOpen"
        class="wind-modal__overlay"
        @click.self="closeWindModal"
      >
        <section class="wind-modal__panel" @click.stop>
          <header class="wind-modal__header">
            <div class="flex items-center gap-2">
              <img :src="WindIcon" alt="風況 icon" class="h-8 w-8 object-contain" />
              <div>
                <p class="text-xs uppercase tracking-[0.4em] text-primary-400">Wind</p>
                <h2 class="text-xl font-bold text-grey-900">風況詳情</h2>
              </div>
            </div>
            <button class="wind-modal__close" @click="closeWindModal">✕</button>
          </header>

          <section class="wind-modal__snapshot">
            <div class="flex items-center gap-4">
              <div class="rounded-full bg-primary-50 p-4 text-4xl">🌀</div>
              <div>
                <p class="text-xs text-grey-500">{{ windDetail.source }}</p>
                <p class="text-xs text-grey-500">更新：{{ formattedUpdatedAt }}</p>
                <p class="mt-2 text-5xl font-bold text-grey-900">
                  {{ windDetail.windSpeed.toFixed(1) }}
                  <span class="text-lg font-medium">{{ windDetail.unit }}</span>
                </p>
                <p class="text-sm font-semibold text-grey-700">{{ windDetail.location }}</p>
              </div>
            </div>
          </section>

          <section class="wind-modal__table">
            <div class="wind-info-row">
              <span>最大風速</span>
              <strong>{{ windDetail.maxWind.toFixed(1) }} {{ windDetail.unit }}</strong>
            </div>
            <div class="wind-info-row">
              <span>平均風速</span>
              <strong>{{ windDetail.avgWind.toFixed(1) }} {{ windDetail.unit }}</strong>
            </div>
            <div class="wind-info-row">
              <span>風向</span>
              <strong>{{ windDetail.direction }}</strong>
            </div>
            <div class="wind-info-row wind-info-row--risk">
              <div>
                <span>風險等級</span>
                <p class="text-xs text-grey-500">{{ windDetail.riskLabel }}</p>
              </div>
              <div class="risk-bars">
                <span
                  v-for="(filled, index) in riskSegments"
                  :key="index"
                  class="risk-bars__item"
                  :class="{ 'risk-bars__item--active': filled }"
                ></span>
              </div>
            </div>
          </section>

          <section class="wind-modal__actions">
            <button class="trend-button">風級趨勢圖 →</button>
          </section>
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
  bottom: 6.5rem;
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

.wind-modal__overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: clamp(2rem, 8vh, 4rem) 1rem 1rem;
  z-index: 50;
}

.wind-modal__panel {
  width: 100%;
  max-width: 520px;
  background: #fff;
  border-radius: 24px;
  padding: 1.5rem;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
}

.wind-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
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

.wind-modal__actions {
  margin-top: 1.5rem;
  display: flex;
  justify-content: center;
}

.trend-button {
  width: 100%;
  border: none;
  border-radius: 14px;
  background: #e0f0f1;
  color: #0f4c5c;
  padding: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease;
}

.trend-button:hover {
  background: #d2ebed;
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
