<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue';
import BottomNav from '@/components/BottomNav.vue';
import Button from '@/components/base/Button.vue';
import GoogleMap from '@/components/common/GoogleMap.vue';
import ReportIcon from '@/assets/navicons/Report.png';
import TreeIcon from '@/assets/reporticon/tree.png';
import FallenIcon from '@/assets/reporticon/fallen.png';
import AccidentIcon from '@/assets/reporticon/accident.png';
import OthersIcon from '@/assets/reporticon/others.png';
import {
  getObstacleReportData,
  reverseGeocode,
  submitObstacleReport,
  fetchObstacleIssuesByStatus,
  updateObstacleIssueStatus,
  geocodeAddress
} from '@/utils/api';
import type { ObstacleTypeOption, ObstacleIssueRecord } from '@/utils/api';
import type { LatLng, MapMarkerDescriptor } from '@/types/maps';
import { useUserInfo } from '@/utils/global';

const { obstacleTypes, mapEmbedUrl: defaultMapEmbed, helperText } = getObstacleReportData();

const selectedType = ref<ObstacleTypeOption['id'] | null>(null);
const description = ref('');
const isSubmitting = ref(false);
const toastState = ref<{ message: string; variant: 'success' | 'error' } | null>(null);
const defaultCenter: LatLng = { lat: 25.033964, lng: 121.564468 };
const mapCenter = ref<LatLng>(defaultCenter);
const userCoords = ref<LatLng | null>(null);
const locationInput = ref('');
const isLocating = ref(false);
const locationError = ref<string | null>(null);
const issues = ref<ObstacleIssueRecord[]>([]);
const isIssueLoading = ref(false);
const issueError = ref<string | null>(null);
const updatingIssueId = ref<string | null>(null);
const issueCoordinates = ref<Record<string, LatLng>>({});
const activeIssue = ref<ObstacleIssueRecord | null>(null);
const canUseGeolocation = typeof window !== 'undefined' && 'geolocation' in navigator;

const normalizeAddress = (value?: string | null) => (value ?? '').replace(/\s+/g, '');

const extractLocationKeyword = (value?: string | null) => {
  if (!value) return '';
  const normalized = normalizeAddress(value);
  if (!normalized) return '';
  const match = normalized.match(/(.+?(?:縣|市|區))/);
  if (match) {
    return match[0];
  }
  return normalized.slice(0, 4);
};

const toggleType = (typeId: ObstacleTypeOption['id']) => {
  selectedType.value = selectedType.value === typeId ? null : typeId;
};

const isSelected = (typeId: ObstacleTypeOption['id']) => selectedType.value === typeId;

const selectedTypeLabel = computed(() => {
  if (!selectedType.value) {
    return null;
  }
  const target = obstacleTypes.find(item => item.id === selectedType.value);
  return target?.label ?? null;
});

const canSubmit = computed(
  () =>
    Boolean(selectedType.value) &&
    description.value.trim().length >= 8 &&
    locationInput.value.trim().length > 0
);

const locationKeyword = computed(() => extractLocationKeyword(locationInput.value));

const nearbyIssues = computed(() => {
  if (!issues.value.length) {
    return [];
  }
  const keyword = locationKeyword.value;
  if (!keyword) {
    return issues.value.slice(0, 5);
  }
  const filtered = issues.value.filter((issue) =>
    normalizeAddress(issue.address).includes(keyword)
  );
  return (filtered.length ? filtered : issues.value).slice(0, 5);
});

const mapMarkers = computed<MapMarkerDescriptor[]>(() => {
  const markers: MapMarkerDescriptor[] = [];
  if (userCoords.value) {
    markers.push({
      id: 'user-location',
      position: userCoords.value,
      color: '#1F8A70',
      label: '目前定位',
      zIndex: 10
    });
  }
  nearbyIssues.value.forEach((issue) => {
    const coords = issueCoordinates.value[issue.id];
    if (!coords) return;
    markers.push({
      id: `issue-${issue.id}`,
      position: coords,
      color: '#1D7FBF',
      label: issue.type,
      zIndex: 5,
      meta: { issue }
    });
  });
  return markers;
});

const isReportPanelOpen = ref(false);

const toggleReportPanel = () => {
  isReportPanelOpen.value = !isReportPanelOpen.value;
};

const handleMarkerClick = (marker: MapMarkerDescriptor) => {
  const issue = marker.meta?.issue as ObstacleIssueRecord | undefined;
  if (issue) {
    activeIssue.value = issue;
  }
};

const closeIssuePanel = () => {
  activeIssue.value = null;
};

const resetForm = () => {
  selectedType.value = null;
  description.value = '';
};

const triggerToast = (message: string, variant: 'success' | 'error' = 'success') => {
  toastState.value = { message, variant };
  setTimeout(() => {
    toastState.value = null;
  }, 2400);
};

const formatIssueTime = (value?: string) => {
  if (!value) return '未知時間';
  const normalized = value.replace(' ', 'T');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(parsed);
};

const submitReport = async () => {
  if (!canSubmit.value || isSubmitting.value) {
    return;
  }
  isSubmitting.value = true;
  try {
    const payload = {
      address: locationInput.value.trim(),
      obstacleType: selectedTypeLabel.value ?? selectedType.value ?? '其他',
      description: description.value.trim()
    };
    const result = await submitObstacleReport(payload);
    if (!result.success) {
      throw new Error(result.message ?? '回報失敗，請稍後再試');
    }
    triggerToast('已完成回報', 'success');
    resetForm();
  } catch (error) {
    triggerToast(
      error instanceof Error ? `回報失敗：${error.message}` : '無法送出回報，請稍後再試',
      'error'
    );
  } finally {
    isSubmitting.value = false;
  }
};

const hexToRgba = (hexColor: string, alpha: number) => {
  const normalized = hexColor.replace('#', '');
  const r = parseInt(normalized.substring(0, 2), 16);
  const g = parseInt(normalized.substring(2, 4), 16);
  const b = parseInt(normalized.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const getTypeStyle = (type: ObstacleTypeOption, active: boolean) => {
  if (active) {
    return {
      borderColor: type.color,
      backgroundImage: `linear-gradient(120deg, ${hexToRgba(type.color, 0.15)}, ${hexToRgba(type.color, 0.05)})`,
      boxShadow: `inset 0 0 0 2px ${hexToRgba(type.color, 0.35)}`,
      transition: 'background 0.2s ease, box-shadow 0.2s ease'
    };
  }
  return {
    borderColor: hexToRgba(type.color, 0.35),
    backgroundColor: '#fff',
    transition: 'background 0.2s ease, box-shadow 0.2s ease'
  };
};

const getIconRingStyle = (type: ObstacleTypeOption, active: boolean) => {
  if (active) {
    return {
      background: '#fff',
      boxShadow: `inset 0 0 0 2px ${hexToRgba(type.color, 0.5)}`,
      transform: 'scale(1.05)'
    };
  }
  return {
    background: '#fff',
    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.05)'
  };
};

const obstacleIconMap: Record<ObstacleTypeOption['id'], string> = {
  tree: TreeIcon,
  sign: FallenIcon,
  accident: AccidentIcon,
  others: OthersIcon
};

const locationLabel = computed(() => {
  if (!userCoords.value) return '尚未鎖定座標';
  return `緯度 ${userCoords.value.lat.toFixed(5)}、經度 ${userCoords.value.lng.toFixed(5)}`;
});

const requestUserLocation = () => {
  if (!canUseGeolocation || typeof navigator === 'undefined') {
    locationError.value = '此裝置不支援定位功能';
    return;
  }
  isLocating.value = true;
  locationError.value = null;
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      const coords = { lat: latitude, lng: longitude };
      userCoords.value = coords;
      mapCenter.value = coords;
      try {
        const address = await reverseGeocode(latitude, longitude);
        locationInput.value = address;
      } catch (error) {
        console.warn('reverse geocode failed', error);
        locationInput.value = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      }
      isLocating.value = false;
    },
    (error) => {
      isLocating.value = false;
      switch (error.code) {
        case error.PERMISSION_DENIED:
          locationError.value = '使用者拒絕定位授權';
          break;
        case error.POSITION_UNAVAILABLE:
          locationError.value = '定位資訊不可用';
          break;
        case error.TIMEOUT:
          locationError.value = '定位逾時，請重新嘗試';
          break;
        default:
          locationError.value = '無法取得定位資訊';
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
};

const loadIssues = async (status: 'Unsolved' | 'Resolved' | 'InProgress' = 'Unsolved') => {
  isIssueLoading.value = true;
  issueError.value = null;
  try {
    const list = await fetchObstacleIssuesByStatus(status);
    issues.value = list;
  } catch (error) {
    console.warn('載入障礙清單失敗', error);
    issueError.value = '無法取得回報清單';
  } finally {
    isIssueLoading.value = false;
  }
};

const markIssueResolved = async (issue: ObstacleIssueRecord) => {
  if (issue.status === 'Resolved' || updatingIssueId.value === issue.id) {
    return;
  }
  updatingIssueId.value = issue.id;
  try {
    const result = await updateObstacleIssueStatus(issue.id, 'Resolved');
    if (!result.success) {
      throw new Error(result.message ?? '標記失敗');
    }
    issue.status = 'Resolved';
    triggerToast('已完成回報');
    await loadIssues();
  } catch (error) {
    triggerToast(
      error instanceof Error ? `標記失敗：${error.message}` : '無法更新狀態，請稍後再試',
      'error'
    );
  } finally {
    updatingIssueId.value = null;
  }
};

onMounted(() => {
  requestUserLocation();
  loadIssues();
});

watch(nearbyIssues, async (list) => {
  const candidates = list.slice(0, 5);
  for (const issue of candidates) {
    if (issueCoordinates.value[issue.id]) {
      continue;
    }
    const coords = await geocodeAddress(issue.address);
    if (coords) {
      issueCoordinates.value = {
        ...issueCoordinates.value,
        [issue.id]: coords
      };
    }
  }
}, { immediate: true });

watch(
  () => ({ user: userCoords.value, coords: issueCoordinates.value, list: nearbyIssues.value }),
  () => {
    if (userCoords.value) {
      mapCenter.value = userCoords.value;
      return;
    }
    const firstIssueId = nearbyIssues.value.find(issue => issueCoordinates.value[issue.id])?.id;
    if (firstIssueId) {
      mapCenter.value = issueCoordinates.value[firstIssueId];
    }
    if (activeIssue.value && !nearbyIssues.value.some(issue => issue.id === activeIssue.value?.id)) {
      activeIssue.value = null;
    }
  },
  { deep: true }
);
</script>

<template>
  <div class="min-h-screen bg-white pb-28">
    <main class="mx-auto flex max-w-5xl flex-col gap-4 px-4 pt-6">
      <!-- 標題區 -->
      <!-- <section class="rounded-2xl border border-grey-100 bg-white px-4 py-4 shadow-sm">
        <div class="flex items-center gap-4">
          <img :src="ReportIcon" alt="障礙回報 icon" class="h-14 w-14 object-contain" />
          <div class="flex flex-col gap-1">
            <p class="text-xs uppercase tracking-[0.4em] text-primary-400">Alert</p>
            <h1 class="text-2xl font-bold text-grey-900">障礙回報</h1>
            <p class="text-sm text-grey-600">回報路面落物、事故與特殊狀況，協助即時調度</p>
          </div>
        </div>
      </section> -->

      <!-- 地圖區 -->
      <section class="rounded-3xl border border-grey-100 shadow-lg overflow-hidden">
        <div class="map-embed map-embed--tall h-full min-h-[360px]">
          <GoogleMap :center="mapCenter" :markers="mapMarkers" :zoom="15" @marker-click="handleMarkerClick" />
          <div class="map-embed__actions">
            <button
              type="button"
              class="map-action-btn"
              :disabled="isLocating"
              @click="requestUserLocation"
            >
              {{ isLocating ? '定位中...' : '重新定位' }}
            </button>
          </div>
        </div>
      </section>

      <Transition name="issue-panel">
        <div
          v-if="activeIssue"
          class="fixed inset-x-4 top-20 z-40 rounded-2xl border border-primary-100 bg-white px-4 py-4 shadow-2xl"
        >
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs text-grey-500">{{ formatIssueTime(activeIssue.time) }}</p>
              <h3 class="text-lg font-bold text-grey-900">{{ activeIssue.type }}</h3>
              <p class="text-sm text-grey-600">{{ activeIssue.address }}</p>
            </div>
            <button type="button" class="text-grey-400 text-xl" @click="closeIssuePanel">✕</button>
          </div>
          <p class="mt-2 whitespace-pre-line text-sm text-grey-700">{{ activeIssue.description }}</p>
          <div class="mt-4 flex items-center justify-between">
            <span class="text-xs font-semibold" :class="activeIssue.status === 'Resolved' ? 'text-green-600' : 'text-amber-500'">
              {{ activeIssue.status === 'Resolved' ? '已解決' : '待處理' }}
            </span>
            <button
              type="button"
              class="issue-action-btn"
              :class="activeIssue.status === 'Resolved'
                ? 'issue-action-btn--resolved'
                : 'issue-action-btn--active'
              "
              :disabled="activeIssue.status === 'Resolved' || updatingIssueId === activeIssue.id"
              @click="markIssueResolved(activeIssue)"
            >
              <span v-if="activeIssue.status === 'Resolved'">已標記</span>
              <span v-else-if="updatingIssueId === activeIssue.id">標記中...</span>
              <span v-else>標記已解決</span>
            </button>
          </div>
        </div>
      </Transition>

      <!-- 附近障礙回報 -->
      <!-- <section class="rounded-2xl border border-grey-100 bg-white px-4 py-4 shadow-sm">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-lg font-bold text-grey-900">顯示附近障礙回報</h2>
          <button
            type="button"
            class="text-xs font-semibold text-primary-500"
            @click="loadIssues()"
            :disabled="isIssueLoading"
          >
            {{ isIssueLoading ? '更新中...' : '重新整理' }}
          </button>
        </div>
        <p class="text-xs text-grey-500">
          依目前輸入地址篩選最近回報，方便確認是否有人處理。
        </p>
        <div v-if="issueError" class="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-600">
          {{ issueError }}
        </div>
        <div v-else-if="isIssueLoading" class="mt-3 text-xs text-grey-500">
          載入回報中...
        </div>
        <div v-else-if="!nearbyIssues.length" class="mt-3 text-xs text-grey-500">
          目前沒有符合條件的回報，歡迎新增第一筆資料。
        </div>
        <ul v-else class="mt-3 space-y-3">
          <li
            v-for="issue in nearbyIssues"
            :key="issue.id"
            class="rounded-2xl border border-grey-100 bg-grey-50/80 px-3 py-3 text-sm text-grey-800"
          >
            <div class="flex items-center justify-between text-xs text-grey-500">
              <span>{{ issue.type }}</span>
              <span>{{ formatIssueTime(issue.time) }}</span>
            </div>
            <p class="mt-1 text-sm font-semibold text-grey-900">{{ issue.address }}</p>
            <p class="mt-1 whitespace-pre-line text-xs text-grey-600">{{ issue.description }}</p>
            <div class="mt-3 flex items-center justify-between">
              <span class="text-[11px] font-medium" :class="issue.status === 'Resolved' ? 'text-green-600' : 'text-amber-500'">
                {{ issue.status === 'Resolved' ? '已解決' : '待處理' }}
              </span>
              <button
                type="button"
                class="issue-action-btn"
                :class="issue.status === 'Resolved'
                  ? 'issue-action-btn--resolved'
                  : 'issue-action-btn--active'
                "
                :disabled="issue.status === 'Resolved' || updatingIssueId === issue.id"
                @click="markIssueResolved(issue)"
              >
                <span v-if="issue.status === 'Resolved'">已標記解決</span>
                <span v-else-if="updatingIssueId === issue.id">標記中...</span>
                <span v-else>標記已解決</span>
              </button>
            </div>
          </li>
        </ul>
      </section> -->

      <!-- 障礙位置 + 類型 + 問題描述 -->
      <section class="rounded-2xl border border-grey-100 bg-white px-4 py-4 shadow-sm">
        <button
          type="button"
          class="flex w-full items-center justify-between rounded-2xl bg-grey-50/80 px-4 py-3 text-left"
          @click="toggleReportPanel"
        >
          <div>
            <p class="text-lg font-bold text-grey-900">障礙回報區</p>
            <p class="text-xs text-grey-500">
              {{
                isReportPanelOpen
                  ? '填寫障礙位置、類型與描述，協助調度'
                  : '點擊展開以填寫障礙位置、類型與描述'
              }}
            </p>
          </div>
          <span
            class="text-sm font-semibold text-primary-500 transition-transform duration-200"
            :class="{ 'rotate-180': isReportPanelOpen }"
          >
            ⌃
          </span>
        </button>
        <Transition name="collapse">
          <div v-show="isReportPanelOpen" class="mt-5 space-y-6 overflow-hidden">
            <div>
              <div class="mb-2 flex items-center justify-between">
                <h2 class="text-lg font-bold text-grey-900">障礙位置</h2>
                <button
                  type="button"
                  class="text-xs font-semibold text-primary-500"
                  @click="requestUserLocation"
                  :disabled="isLocating"
                >
                  {{ isLocating ? '定位中...' : '重新取得位置' }}
                </button>
              </div>
              <input
                v-model="locationInput"
                type="text"
                class="w-full rounded-xl border border-grey-200 px-4 py-3 text-sm text-grey-800 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                placeholder="請輸入障礙所在地址或地標"
              />
              <p class="mt-1 text-xs text-grey-500">
                預設為目前定位；可自行調整以更精準描述位置。
              </p>
            </div>

            <div>
              <div class="mb-3 flex items-center justify-between">
                <h2 class="text-lg font-bold text-grey-900">障礙類型</h2>
                <span class="text-xs font-semibold text-primary-500">
                  請選擇一種類型
                </span>
              </div>
              <div class="type-scroll flex gap-3 overflow-x-auto pb-1">
                <button
                  v-for="type in obstacleTypes"
                  :key="type.id"
                  type="button"
                  class="flex min-w-[180px] flex-1 items-center gap-3 rounded-2xl border px-4 py-4 text-left shadow-sm transition"
                  :style="getTypeStyle(type, isSelected(type.id))"
                  @click="toggleType(type.id)"
                >
                  <span
                    class="h-12 w-12 flex items-center justify-center rounded-full shadow-inner transition-all duration-200"
                    :style="getIconRingStyle(type, isSelected(type.id))"
                  >
                    <img
                      :src="obstacleIconMap[type.id]"
                      :alt="type.label"
                      class="h-8 w-8 object-contain"
                    />
                  </span>
                  <div class="flex flex-col">
                    <p class="text-sm font-semibold text-grey-900">{{ type.label }}</p>
                    <p v-if="isSelected(type.id)" class="text-xs text-grey-600">已選取</p>
                    <p v-else class="text-xs text-grey-500">點擊選取</p>
                  </div>
                </button>
              </div>
            </div>

            <div class="rounded-2xl border border-dashed border-grey-200 p-4">
              <div class="mb-2 flex items-center justify-between">
                <h2 class="text-lg font-bold text-grey-900">問題描述</h2>
                <span class="text-xs text-grey-500">{{ description.length }}/200</span>
              </div>
              <textarea
                v-model="description"
                rows="5"
                maxlength="200"
                class="w-full rounded-xl border border-grey-200 p-3 text-sm text-grey-800 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                placeholder="請描述發生時間、影響範圍與目前狀態..."
              ></textarea>
              <p class="mt-2 text-xs text-grey-500">
                完整描述有助於研判處理順序，亦可補充現場聯絡方式。
              </p>
              <p class="text-xs font-semibold text-red-500">描述至少 8 個字才能送出。</p>
            </div>
          </div>
        </Transition>
      </section>

      <!-- 提交按鈕區 -->
      <section v-show="isReportPanelOpen" class="rounded-2xl bg-white px-4 py-4 shadow-sm">
        <div class="flex flex-col gap-3">
          <div class="grid grid-cols-2 gap-3">
            <Button
              outline
              class="w-full rounded-2xl border-2 border-primary-500 bg-white py-3 text-primary-500"
              @click="resetForm"
            >
              重新設定
            </Button>
            <Button
              class="w-full rounded-2xl bg-primary-500 py-4 text-white shadow-lg"
              :class="{ 'opacity-60 cursor-not-allowed': !canSubmit || isSubmitting }"
              :disabled="!canSubmit || isSubmitting"
              @click="submitReport"
            >
              {{ isSubmitting ? '送出中...' : '障礙回報' }}
            </Button>
          </div>
        </div>
      </section>
    </main>

    <Transition name="toast">
      <div
        v-if="toastState"
        class="fixed inset-x-6 bottom-28 z-50 rounded-2xl px-4 py-3 text-center text-sm font-semibold text-white shadow-xl"
        :class="toastState.variant === 'error' ? 'bg-rose-500' : 'bg-[#1F8A70]'"
      >
        {{ toastState.message }}
      </div>
    </Transition>

    <BottomNav />
  </div>
</template>

<style scoped>
.type-scroll {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.type-scroll::-webkit-scrollbar {
  display: none;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

.collapse-enter-active,
.collapse-leave-active {
  transition: max-height 0.3s ease, opacity 0.25s ease;
}

.collapse-enter-from,
.collapse-leave-to {
  max-height: 0;
  opacity: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  max-height: 2000px;
  opacity: 1;
}

.issue-panel-enter-active,
.issue-panel-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.issue-panel-enter-from,
.issue-panel-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

.issue-action-btn {
  @apply min-w-[120px] rounded-full border px-4 py-2 text-center text-xs font-semibold transition-all duration-200;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.08);
}

.issue-action-btn--active {
  @apply border-primary-300 text-primary-600 bg-white;
}

.issue-action-btn--active:active {
  transform: scale(0.97);
}

.issue-action-btn--resolved {
  @apply border-green-200 text-green-600 bg-green-50 cursor-default;
}
</style>
