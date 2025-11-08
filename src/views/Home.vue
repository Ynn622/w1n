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
    <main class="mx-auto flex max-w-5xl flex-col gap-3 px-4 pt-8">
      <!-- ① 標題區 -->
      <section class="rounded-2xl bg-white px-6 py-5 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
        <div class="flex flex-col gap-2 text-center md:text-left">
          <div>
            <h1 class="text-3xl font-bold text-grey-900">即時風況</h1>
          </div>
          <p class="text-base font-semibold text-grey-700">目前位址：{{ location }}</p>
        </div>
      </section>

      <!-- ② 即時資訊卡片區 -->
      <section class="flex flex-row gap-2">
        <div
          class="flex-1 basis-1/2 min-w-0 rounded-2xl bg-white p-6 shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
        >
          <div class="mb-4 flex items-center justify-between">
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

        <div
          class="flex-1 basis-1/2 min-w-0 rounded-2xl bg-white p-6 shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
        >
          <p class="text-sm text-grey-500">行車建議</p>
          <h2 class="mb-3 text-xl font-bold text-grey-900">盡可能減少外出</h2>
          <p class="text-sm text-grey-600 leading-relaxed">
            {{ drivingAdvice }}
          </p>
        </div>
      </section>

      <!-- ③ 服務列表區 -->
      <section class="rounded-2xl bg-white px-3 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
        <h2 class="mb-4 text-lg font-bold text-grey-900">服務列表</h2>
        <div class="service-scroll flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-5 sm:gap-3 sm:pb-0">
          <button
            v-for="service in services"
            :key="service.id"
            @click="navigateTo(service.route)"
            class="flex min-w-[110px] flex-col items-center rounded-xl bg-[#F3FBFB] px-3 py-3 text-xs transition hover:bg-[#e5f6f7] sm:min-w-0"
          >
            <span class="mb-1 text-2xl text-[#62A3A6]">{{ service.icon }}</span>
            <span class="text-xs font-medium text-grey-700">{{ service.name }}</span>
          </button>
        </div>
      </section>

      <!-- ④ 路況查看區 -->
      <section class="rounded-2xl bg-white px-3 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
        <div class="mb-4">
          <h2 class="text-lg font-bold text-grey-900">{{ mapPreview.title }}</h2>
          <p class="text-sm text-grey-500">{{ mapPreview.updatedAt }}</p>
        </div>
        <div class="rounded-2xl bg-gradient-to-br from-primary-100 to-blue-100 p-3 space-y-3">
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
          <div class="rounded-xl border border-dashed border-primary-300 bg-white/70 p-3 text-sm text-grey-700">
            <div class="font-semibold text-grey-900">街口資訊 (API 預留)</div>
            <div class="text-base text-grey-800">{{ streetInfo.intersection }}</div>
            <div class="text-grey-600">{{ streetInfo.status }}</div>
            <div class="text-[12px] text-grey-500">{{ streetInfo.source }}</div>
          </div>
          <div class="flex justify-end">
            <button class="text-sm font-semibold text-primary-500">
              {{ mapPreview.addressHint }}
            </button>
          </div>
        </div>
      </section>

      <!-- ⑤ 即時訊息區 -->
      <section class="rounded-2xl bg-white px-3 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
        <div class="mb-4 flex flex-col gap-2">
          <h2 class="text-lg font-bold text-grey-900">即時訊息</h2>
        </div>
        <div class="space-y-4">
          <article
            v-for="item in newsList"
            :key="item.id"
            class="flex gap-4 rounded-2xl bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
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
        <div class="mt-4 flex justify-end">
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
</style>
