<script setup lang="ts">
import { ref } from 'vue';
import BottomNav from '@/components/BottomNav.vue';
import Input from '@/components/base/Input.vue';
import Button from '@/components/base/Button.vue';

const departure = ref('');
const destination = ref('');
const routes = ref<Array<{ name: string; duration: string; distance: string }>>([]);
const isSearching = ref(false);

const searchRoute = () => {
  if (!departure.value || !destination.value) {
    alert('請輸入出發地和目的地');
    return;
  }

  isSearching.value = true;

  // 模擬搜尋
  setTimeout(() => {
    routes.value = [
      { name: '建議路線 1', duration: '25 分鐘', distance: '8.5 公里' },
      { name: '建議路線 2', duration: '30 分鐘', distance: '7.2 公里' },
      { name: '建議路線 3', duration: '35 分鐘', distance: '9.8 公里' }
    ];
    isSearching.value = false;
  }, 1000);
};

const openGoogleMaps = () => {
  if (!departure.value || !destination.value) {
    alert('請先輸入出發地和目的地');
    return;
  }
  const url = `https://www.google.com/maps/dir/${encodeURIComponent(departure.value)}/${encodeURIComponent(destination.value)}`;
  window.open(url, '_blank');
};
</script>

<template>
  <div class="min-h-screen bg-grey-50 pb-24 flex flex-col">
    <!-- 上方標題與搜尋欄 -->
    <header class="bg-green-500 text-white shadow-lg px-4 py-10 sm:py-12">
      <div class="max-w-3xl mx-auto">
        <h1 class="text-3xl font-bold mb-6 text-center">即時路況</h1>

        <div class="w-full space-y-3">
          <div class="bg-white rounded-lg p-1 shadow-md">
            <Input
              v-model="departure"
              placeholder="🚩 輸入出發地"
              class="bg-transparent border-0"
            />
          </div>
          <div class="bg-white rounded-lg p-1 shadow-md">
            <Input
              v-model="destination"
              placeholder="📍 輸入目的地"
              class="bg-transparent border-0"
            />
          </div>
          <Button
            @click="searchRoute"
            class="w-full bg-white text-green-500 font-bold hover:bg-grey-50"
          >
            {{ isSearching ? '搜尋中...' : '🔍 搜尋路線' }}
          </Button>
        </div>
      </div>
    </header>

    <!-- 中間路線顯示區 -->
    <main class="flex-1 overflow-y-auto px-4 py-6">
      <div v-if="routes.length === 0" class="flex flex-col items-center justify-center min-h-[40vh] text-grey-400">
        <span class="text-6xl mb-4">🗺️</span>
        <p class="text-lg">請輸入出發地和目的地以開始規劃路線</p>
      </div>

      <div v-else class="max-w-3xl mx-auto space-y-4">
        <h2 class="text-xl font-bold text-grey-800 mb-4">推薦路線</h2>

        <div
          v-for="(route, index) in routes"
          :key="index"
          class="bg-white rounded-xl shadow-md p-5 hover:shadow-lg transition-shadow cursor-pointer border-2 border-transparent hover:border-green-500"
        >
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <h3 class="text-lg font-bold text-grey-800 mb-2">{{ route.name }}</h3>
              <div class="flex items-center space-x-4 text-sm text-grey-600">
                <span class="flex items-center">
                  <span class="mr-1">⏱️</span>
                  {{ route.duration }}
                </span>
                <span class="flex items-center">
                  <span class="mr-1">📏</span>
                  {{ route.distance }}
                </span>
              </div>
            </div>
            <div class="text-3xl">
              {{ index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉' }}
            </div>
          </div>
        </div>

        <!-- Google Map 轉跳按鈕 -->
        <div class="mt-8 flex justify-center md:justify-end">
          <Button
            @click="openGoogleMaps"
            class="w-full md:w-auto bg-primary-500 text-white shadow-xl rounded-full px-6 py-4 hover:bg-primary-600"
          >
            <span class="flex items-center space-x-2">
              <span>🗺️</span>
              <span class="font-bold">Google Map</span>
            </span>
          </Button>
        </div>
      </div>
    </main>

    <!-- 底部導航 (15%) -->
    <BottomNav />
  </div>
</template>

<style scoped>
/* 移除 Input 組件的預設樣式 */
:deep(.base-input) {
  border: none;
  box-shadow: none;
}
</style>
