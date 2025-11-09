<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useUserInfo } from '@/utils/global';

const USER_INFO_STORAGE_KEY = 'app_user_info';
const canUseStorage = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
const { userInfo, requestUserInfo } = useUserInfo();

onMounted(() => {
  requestUserInfo();
});

watch(
  userInfo,
  (value) => {
    if (!value || !canUseStorage) {
      return;
    }
    try {
      localStorage.setItem(USER_INFO_STORAGE_KEY, JSON.stringify(value));
    } catch (error) {
      console.warn('[App] 無法寫入 userInfo 至 localStorage', error);
    }
  },
  { deep: true }
);
</script>

<template>
  <div class="app-shell">
    <Transition name="page-slide" mode="out-in">
      <RouterView />
    </Transition>
  </div>
</template>
