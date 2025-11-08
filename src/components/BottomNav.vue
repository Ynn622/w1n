<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router';
import HomeIcon from '@/assets/navicons/Setting.png';
import TrafficIcon from '@/assets/navicons/Traffic.png';
import SafeIcon from '@/assets/navicons/SafeNavigation.png';
import ReportIcon from '@/assets/navicons/Report.png';

const router = useRouter();
const route = useRoute();

const navItems = [
  { name: 'home', label: '首頁', icon: HomeIcon },
  { name: 'traffic', label: '即時路況', icon: TrafficIcon },
  { name: 'safeNavigation', label: '安全導航', icon: SafeIcon },
  { name: 'report', label: '障礙回報', icon: ReportIcon }
];

const navigateTo = (name: string) => {
  router.push({ name });
};
</script>

<template>
  <nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-grey-200 shadow-lg z-50 pb-safe">
    <div class="flex justify-around items-center h-16 md:h-20">
      <button
        v-for="item in navItems"
        :key="item.name"
        @click="navigateTo(item.name)"
        class="flex flex-col items-center justify-center flex-1 h-full transition-colors duration-200 rounded-2xl mx-1"
        :class="{
          'text-primary-500 bg-primary-50': route.name === item.name,
          'text-grey-500 hover:text-primary-400 hover:bg-grey-50': route.name !== item.name
        }"
      >
        <span class="mb-1 h-10 w-10e">
          <img :src="item.icon" :alt="item.label" class="h-10 w-10 object-contain" />
        </span>
        <span class="text-xs font-medium">{{ item.label }}</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
button {
  -webkit-tap-highlight-color: transparent;
}

/* 支援 iOS 安全區域 */
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
