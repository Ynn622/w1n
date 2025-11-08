<script setup lang="ts">
import { ref } from 'vue';
import BottomNav from '@/components/BottomNav.vue';
import Button from '@/components/base/Button.vue';
import Input from '@/components/base/Input.vue';
import Radio from '@/components/base/Radio.vue';

interface SavedRoute {
  id: number;
  name: string;
  from: string;
  to: string;
}

const savedRoutes = ref<SavedRoute[]>([
  { id: 1, name: '上班路線', from: '家', to: '公司' },
  { id: 2, name: '回家路線', from: '公司', to: '家' }
]);

const newRouteName = ref('');
const newRouteFrom = ref('');
const newRouteTo = ref('');
const showAddForm = ref(false);

const notifications = ref(true);
const mapPreference = ref('google');
const theme = ref('light');

const addRoute = () => {
  if (!newRouteName.value || !newRouteFrom.value || !newRouteTo.value) {
    alert('請填寫完整路線資訊');
    return;
  }

  const newRoute: SavedRoute = {
    id: Date.now(),
    name: newRouteName.value,
    from: newRouteFrom.value,
    to: newRouteTo.value
  };

  savedRoutes.value.push(newRoute);

  // 重置表單
  newRouteName.value = '';
  newRouteFrom.value = '';
  newRouteTo.value = '';
  showAddForm.value = false;
};

const deleteRoute = (id: number) => {
  if (confirm('確定要刪除此路線嗎？')) {
    savedRoutes.value = savedRoutes.value.filter(route => route.id !== id);
  }
};

const saveSettings = () => {
  alert('設定已儲存！');
};
</script>

<template>
  <div class="min-h-screen bg-grey-50 pb-24 flex flex-col">
    <!-- 上方標題列 -->
    <header class="bg-secondary-500 text-white shadow-lg px-4 py-10 sm:py-12">
      <div class="flex items-center justify-center">
        <h1 class="text-3xl font-bold">偏好設定</h1>
      </div>
    </header>

    <!-- 中間設定區 -->
    <main class="flex-1 overflow-y-auto px-4 py-6">
      <div class="max-w-4xl mx-auto space-y-6">

        <!-- 常用路徑設定 -->
        <section class="bg-white rounded-xl shadow-md p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold text-grey-800 flex items-center">
              <span class="mr-2">🚗</span>
              常用路徑
            </h2>
            <Button
              @click="showAddForm = !showAddForm"
              class="bg-primary-500 text-white text-sm px-4 py-2"
            >
              {{ showAddForm ? '取消' : '+ 新增' }}
            </Button>
          </div>

          <!-- 新增路線表單 -->
          <div v-if="showAddForm" class="bg-grey-50 rounded-lg p-4 mb-4 space-y-3">
            <Input
              v-model="newRouteName"
              placeholder="路線名稱 (例：上班路線)"
              class="w-full"
            />
            <Input
              v-model="newRouteFrom"
              placeholder="起點"
              class="w-full"
            />
            <Input
              v-model="newRouteTo"
              placeholder="終點"
              class="w-full"
            />
            <Button
              @click="addRoute"
              class="w-full bg-green-500 text-white"
            >
              確定新增
            </Button>
          </div>

          <!-- 路線列表 -->
          <div class="space-y-3">
            <div
              v-for="route in savedRoutes"
              :key="route.id"
              class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-grey-50 rounded-lg p-4 hover:bg-grey-100 transition-colors"
            >
              <div class="flex-1">
                <h3 class="font-bold text-grey-800 mb-1">{{ route.name }}</h3>
                <p class="text-sm text-grey-600">
                  <span class="inline-flex items-center">
                    <span class="mr-1">📍</span>
                    {{ route.from }}
                  </span>
                  <span class="mx-2">→</span>
                  <span class="inline-flex items-center">
                    <span class="mr-1">🎯</span>
                    {{ route.to }}
                  </span>
                </p>
              </div>
              <button
                @click="deleteRoute(route.id)"
                class="text-red-500 hover:text-red-300 ml-4 p-2"
              >
                🗑️
              </button>
            </div>

            <div v-if="savedRoutes.length === 0" class="text-center py-8 text-grey-400">
              <span class="text-4xl mb-2 block">📭</span>
              <p>尚無常用路線</p>
            </div>
          </div>
        </section>

        <!-- 通知設定 -->
        <section class="bg-white rounded-xl shadow-md p-6">
          <h2 class="text-xl font-bold text-grey-800 mb-4 flex items-center">
            <span class="mr-2">🔔</span>
            通知設定
          </h2>
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span class="text-grey-700">接收天氣警報通知</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                v-model="notifications"
                type="checkbox"
                class="sr-only peer"
              >
              <div class="toggle-switch"></div>
            </label>
          </div>
        </section>

        <!-- 地圖顯示偏好 -->
        <section class="bg-white rounded-xl shadow-md p-6">
          <h2 class="text-xl font-bold text-grey-800 mb-4 flex items-center">
            <span class="mr-2">🗺️</span>
            地圖顯示偏好
          </h2>
          <div class="space-y-3">
            <Radio
              v-model="mapPreference"
              radioName="mapPreference"
              radioId="google"
              radioText="Google Maps"
            />
            <Radio
              v-model="mapPreference"
              radioName="mapPreference"
              radioId="apple"
              radioText="Apple Maps"
            />
            <Radio
              v-model="mapPreference"
              radioName="mapPreference"
              radioId="osm"
              radioText="OpenStreetMap"
            />
          </div>
        </section>

        <!-- 介面主題選擇 -->
        <section class="bg-white rounded-xl shadow-md p-6">
          <h2 class="text-xl font-bold text-grey-800 mb-4 flex items-center">
            <span class="mr-2">🎨</span>
            介面主題
          </h2>
          <div class="space-y-3">
            <Radio
              v-model="theme"
              radioName="theme"
              radioId="light"
              radioText="☀️ 亮色模式"
            />
            <Radio
              v-model="theme"
              radioName="theme"
              radioId="dark"
              radioText="🌙 暗色模式"
            />
            <Radio
              v-model="theme"
              radioName="theme"
              radioId="auto"
              radioText="🔄 自動切換"
            />
          </div>
        </section>

        <!-- 儲存按鈕 -->
        <div class="pb-4">
          <Button
            @click="saveSettings"
            class="w-full bg-secondary-500 text-white font-bold py-4 text-lg hover:bg-secondary-600"
          >
            💾 儲存設定
          </Button>
        </div>
      </div>
    </main>

    <!-- 底部導航 (15%) -->
    <BottomNav />
  </div>
</template>

<style scoped>
/* 隱藏預設的 checkbox */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

/* Toggle Switch 樣式 */
.toggle-switch {
  @apply w-11 h-6 bg-grey-200 rounded-full relative transition-colors;
}

.toggle-switch::after {
  content: '';
  @apply absolute top-[2px] left-[2px] bg-white border border-grey-300 rounded-full h-5 w-5 transition-all;
}

.peer:checked ~ .toggle-switch {
  @apply bg-primary-500;
}

.peer:checked ~ .toggle-switch::after {
  @apply translate-x-full border-white;
}

.peer:focus ~ .toggle-switch {
  @apply outline-none ring-4 ring-primary-300;
}
</style>
