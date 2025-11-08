<script setup lang="ts">
import { ref, computed } from 'vue';
import BottomNav from '@/components/BottomNav.vue';
import Select from '@/components/base/Select.vue';

interface NewsItem {
  id: number;
  title: string;
  summary: string;
  time: string;
  source: string;
}

const selectedDate = ref('today');
const selectedTime = ref('now');
const selectedRegion = ref('taipei');

const dateOptions = [
  { label: '今天', value: 'today' },
  { label: '明天', value: 'tomorrow' },
  { label: '後天', value: 'day-after' }
];

const timeOptions = [
  { label: '現在', value: 'now' },
  { label: '早上', value: 'morning' },
  { label: '中午', value: 'noon' },
  { label: '傍晚', value: 'evening' },
  { label: '晚上', value: 'night' }
];

const regionOptions = [
  { label: '台北', value: 'taipei' },
  { label: '新北', value: 'new-taipei' },
  { label: '桃園', value: 'taoyuan' },
  { label: '台中', value: 'taichung' },
  { label: '台南', value: 'tainan' },
  { label: '高雄', value: 'kaohsiung' }
];

const windData = computed(() => ({
  speed: '15',
  direction: '東北風',
  temperature: '25',
  humidity: '65',
  pressure: '1013'
}));

const news = ref<NewsItem[]>([
  {
    id: 1,
    title: '東北季風增強 北部轉涼有雨',
    summary: '受東北季風影響，北部地區氣溫下降3-5度，並有局部陣雨...',
    time: '2小時前',
    source: '中央氣象署'
  },
  {
    id: 2,
    title: '強風特報 沿海地區需注意',
    summary: '今日午後東北風持續增強，沿海空曠地區陣風可達8-9級...',
    time: '5小時前',
    source: '氣象局'
  },
  {
    id: 3,
    title: '週末天氣轉好 適合戶外活動',
    summary: '預計週末東北季風減弱，各地多雲到晴，溫度回升...',
    time: '1天前',
    source: '天氣風險公司'
  },
  {
    id: 4,
    title: '空氣品質預報 中南部需注意',
    summary: '受風向影響，中南部地區空氣品質可能達到橘色提醒等級...',
    time: '1天前',
    source: '環保署'
  }
]);

const openNewsDetail = (newsItem: NewsItem) => {
  alert(`新聞詳情：\n${newsItem.title}\n\n${newsItem.summary}`);
};
</script>

<template>
  <div class="min-h-screen bg-primary-50 pb-24 flex flex-col">
    <!-- 上方功能列 -->
    <header class="bg-primary-500 text-white shadow-lg px-4 py-10 sm:py-12">
      <div class="flex items-center justify-center">
        <h1 class="text-3xl font-bold">即時風況</h1>
      </div>
    </header>

    <!-- 中間風況與篩選 -->
    <main class="flex-1 overflow-y-auto px-4 py-6">
      <!-- 篩選功能 -->
      <div class="max-w-4xl mx-auto mb-6">
        <div class="bg-white rounded-xl shadow-md p-4">
          <h2 class="text-lg font-bold text-grey-800 mb-4">篩選條件</h2>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="block text-sm text-grey-600 mb-1">日期</label>
              <Select
                v-model="selectedDate"
                :options="dateOptions"
                selectId="date-select"
                defaultSelected="選擇日期"
              />
            </div>
            <div>
              <label class="block text-sm text-grey-600 mb-1">時間</label>
              <Select
                v-model="selectedTime"
                :options="timeOptions"
                selectId="time-select"
                defaultSelected="選擇時間"
              />
            </div>
            <div>
              <label class="block text-sm text-grey-600 mb-1">地區</label>
              <Select
                v-model="selectedRegion"
                :options="regionOptions"
                selectId="region-select"
                defaultSelected="選擇地區"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 風況詳細資訊 -->
      <div class="max-w-4xl mx-auto">
        <div class="bg-white rounded-xl shadow-lg p-6">
          <h2 class="text-xl font-bold text-grey-800 mb-6 text-center">當前風況</h2>

          <!-- 風向指示器 -->
          <div class="flex justify-center mb-8">
            <div class="relative w-32 h-32">
              <div class="absolute inset-0 rounded-full border-4 border-primary-200"></div>
              <div class="absolute inset-0 flex items-center justify-center">
                <div class="text-5xl transform rotate-45 text-primary-500">
                  ➤
                </div>
              </div>
              <div class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-6 text-xs text-grey-500">N</div>
              <div class="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-6 text-xs text-grey-500">S</div>
              <div class="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-6 text-xs text-grey-500">W</div>
              <div class="absolute right-0 top-1/2 transform -translate-y-1/2 translate-x-6 text-xs text-grey-500">E</div>
            </div>
          </div>

          <!-- 風況數據 -->
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div class="bg-primary-100 rounded-lg p-4 text-center">
              <div class="text-sm text-grey-600 mb-1">風速</div>
              <div class="text-2xl font-bold text-primary-600">{{ windData.speed }}</div>
              <div class="text-xs text-grey-500">m/s</div>
            </div>
            <div class="bg-green-500 bg-opacity-10 rounded-lg p-4 text-center">
              <div class="text-sm text-grey-600 mb-1">風向</div>
              <div class="text-lg font-bold text-green-500">{{ windData.direction }}</div>
            </div>
            <div class="bg-orange-300 bg-opacity-20 rounded-lg p-4 text-center">
              <div class="text-sm text-grey-600 mb-1">溫度</div>
              <div class="text-2xl font-bold text-orange-500">{{ windData.temperature }}</div>
              <div class="text-xs text-grey-500">°C</div>
            </div>
            <div class="bg-primary-200 rounded-lg p-4 text-center">
              <div class="text-sm text-grey-600 mb-1">濕度</div>
              <div class="text-2xl font-bold text-primary-600">{{ windData.humidity }}</div>
              <div class="text-xs text-grey-500">%</div>
            </div>
            <div class="bg-secondary-100 rounded-lg p-4 text-center">
              <div class="text-sm text-grey-600 mb-1">氣壓</div>
              <div class="text-2xl font-bold text-secondary-600">{{ windData.pressure }}</div>
              <div class="text-xs text-grey-500">hPa</div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- 下方新聞牆 -->
    <section class="bg-white border-t-2 border-grey-200 overflow-y-auto md:overflow-visible max-h-[45vh] md:max-h-none px-4 py-4">
      <div class="max-w-4xl mx-auto">
        <h2 class="text-xl font-bold text-grey-800 mb-4 flex items-center">
          <span class="mr-2">📰</span>
          氣象新聞
        </h2>

        <div class="space-y-3">
          <div
            v-for="item in news"
            :key="item.id"
            @click="openNewsDetail(item)"
            class="bg-grey-50 rounded-lg p-4 hover:bg-grey-100 cursor-pointer transition-colors border border-grey-200 hover:border-primary-300"
          >
            <div class="flex justify-between items-start mb-2">
              <h3 class="font-bold text-grey-800 flex-1">{{ item.title }}</h3>
              <span class="text-xs text-grey-500 ml-2">{{ item.time }}</span>
            </div>
            <p class="text-sm text-grey-600 mb-2">{{ item.summary }}</p>
            <div class="flex items-center text-xs text-grey-500">
              <span class="px-2 py-1 bg-primary-100 text-primary-600 rounded">{{ item.source }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 底部導航 -->
    <BottomNav />
  </div>
</template>

<style scoped>
/* 自訂滾動條 */
section::-webkit-scrollbar {
  width: 6px;
}

section::-webkit-scrollbar-track {
  background: #f1f1f1;
}

section::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 3px;
}

section::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>
