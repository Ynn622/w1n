// composable 或 component 中
import { ref, onMounted, onBeforeUnmount } from 'vue';

export function useUserInfo() {
  const userId = ref<string>('');
  const userInfo = ref<any>(null);
  const isLoading = ref<boolean>(false);
  const error = ref<string | null>(null);

  // 定義監聽器函數，這樣才能在 unmount 時移除
  const messageHandler = (event: MessageEvent) => {
    try {
      const response = JSON.parse(event.data);
      
      if (response.name === 'userinfo') {
        userInfo.value = response.data;
        userId.value = response.data?.id || '';  // 安全取值
        isLoading.value = false;
      }
    } catch (err) {
      console.error('解析用戶資訊失敗:', err);
      error.value = '解析用戶資訊失敗';
      isLoading.value = false;
    }
  };

  const requestUserInfo = () => {
    // @ts-ignore
    if (window.flutterObject) {
      isLoading.value = true;
      error.value = null;

      // 先移除舊的監聽器（如果存在）
      // @ts-ignore
      window.flutterObject.removeEventListener('message', messageHandler);
      
      // 添加新的監聽器
      // @ts-ignore
      window.flutterObject.addEventListener('message', messageHandler);

      // 請求用戶資訊
      // @ts-ignore
      window.flutterObject.postMessage(JSON.stringify({
        name: 'userinfo',
        data: null
      }));
    } else {
      console.warn('flutterObject 不存在，可能不在 App 環境中');
      error.value = '不在 App 環境中';
    }
  };

  onMounted(() => {
    requestUserInfo();
  });

  // 🔥 重要：組件卸載時移除監聽器
  onBeforeUnmount(() => {
    // @ts-ignore
    if (window.flutterObject) {
      // @ts-ignore
      window.flutterObject.removeEventListener('message', messageHandler);
    }
  });

  return {
    userId,
    userInfo,
    isLoading,
    error,
    requestUserInfo
  };
}