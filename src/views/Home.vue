<script setup lang="ts">
import { useRouter } from 'vue-router';
import BottomNav from '@/components/BottomNav.vue';
import { getHomeOverview } from '@/utils/api';

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
          <p class="text-sm font-medium text-primary-500">{{ advisory }}</p>
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
            class="flex min-w-[90px] flex-col items-center rounded-xl px-2.5 py-2 text-[11px] transition sm:min-w-0"
            :class="service.disabled ? 'cursor-not-allowed bg-grey-100 text-grey-400 opacity-70' : 'bg-[#F3FBFB] text-grey-700 hover:bg-[#e5f6f7]'"
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
          <div class="flex items-center justify-between text-sm text-grey-700">
            <span>{{ mapPreview.road }}</span>
            <span>{{ mapPreview.landmark }}</span>
          </div>
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
</style>
