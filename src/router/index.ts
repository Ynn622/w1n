import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/Home.vue'),
    meta: {
      title: '首頁 - 即時風況'
    }
  },
  {
    path: '/traffic',
    name: 'traffic',
    component: () => import('@/views/Traffic.vue'),
    meta: {
      title: '即時路況'
    }
  },
  {
    path: '/wind',
    name: 'wind',
    component: () => import('@/views/Wind.vue'),
    meta: {
      title: '風況資訊'
    }
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/Settings.vue'),
    meta: {
      title: '偏好設定'
    }
  },
  {
    path: '/test',
    name: 'test',
    component: () => import('@/views/test.vue'),
    meta: {
      title: '組件測試頁面'
    }
  }
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    // 如果有保存的位置（例如使用瀏覽器的返回按鈕），則返回到該位置
    if (savedPosition) {
      return savedPosition;
    }
    // 如果路由有 hash，則滾動到該元素
    if (to.hash) {
      return {
        el: to.hash,
        behavior: 'smooth'
      };
    }
    // 否則滾動到頁面頂部
    return { top: 0, behavior: 'smooth' };
  }
});

// 全局前置守衛
router.beforeEach((to, from, next) => {
  // 設置頁面標題
  if (to.meta.title) {
    document.title = `${to.meta.title} - 即時風況`;
  } else {
    document.title = '即時風況';
  }

  next();
});

// 全局後置鉤子
router.afterEach((to) => {
  // 可以在這裡添加頁面訪問追蹤等邏輯
  console.log(`導航至: ${to.path}`);
});

// 錯誤處理
router.onError((error) => {
  console.error('路由錯誤:', error);
});

export default router;

