<script setup lang="ts">
import { useRouter } from 'vue-router';
import BottomNav from '@/components/BottomNav.vue';

const router = useRouter();

const mainFeatures = [
  {
    id: 'wind',
    title: '即時風況',
    icon: '🌪️',
    color: 'bg-primary-500',
    route: 'wind'
  },
  {
    id: 'traffic',
    title: '即時路況',
    icon: '🚗',
    color: 'bg-green-500',
    route: 'traffic'
  },
  {
    id: 'news',
    title: '新聞',
    icon: '📰',
    color: 'bg-orange-500',
    route: 'wind'
  }
];

const navigateTo = (routeName: string) => {
  router.push({ name: routeName });
};
</script>

<template>
  <div class="min-h-screen bg-primary-50 pb-24 flex flex-col">
    <!-- 上方標題區 -->
    <header class="bg-primary-500 text-white shadow-lg px-4 py-10 sm:py-12 md:py-16">
      <div class="text-center">
        <h1 class="text-3xl md:text-4xl font-bold mb-2">即時風況</h1>
        <p class="text-sm opacity-90">Real-time Wind Conditions</p>
      </div>
    </header>

    <!-- 中間功能區 -->
    <main class="flex-1 flex items-center justify-center px-4 py-10">
      <div class="w-full max-w-4xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <button
          v-for="feature in mainFeatures"
          :key="feature.id"
          @click="navigateTo(feature.route)"
          class="group relative overflow-hidden rounded-2xl shadow-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl"
          :class="feature.color"
        >
          <div class="flex flex-col items-center justify-center h-40 sm:h-48 xl:h-56 text-white p-6">
            <span class="text-6xl mb-4 transform transition-transform duration-300 group-hover:scale-110">
              {{ feature.icon }}
            </span>
            <h2 class="text-xl sm:text-2xl font-bold text-center">{{ feature.title }}</h2>
          </div>
        </button>
      </div>
    </main>

    <!-- 底部導航 (20%) -->
    <BottomNav />
  </div>
</template>

<style scoped>
button {
  -webkit-tap-highlight-color: transparent;
}
</style>
