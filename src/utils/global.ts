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
      alert('收到來自 App 的用戶資訊回應');
      
      if (response.name === 'userinfo') {
        userInfo.value = response.data;
        userId.value = response.data?.id || '';  // 安全取值
        isLoading.value = false;
      }
    } catch (err) {
      alert('解析用戶資訊失敗');
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
      alert('flutterObject 不存在，可能不在 App 環境中');
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

/**
 * @param name - 傳送給 app 讓 app 知道 web 需要什麼類型的溝通
 * @param data - 需要傳送給 app 的資料
 *
 * <strong>重要提醒：</strong>建議都在 /views 呼叫此 hook，為了方便跟 useHandleConnectionData 管理。
 */
export const useConnectionMessage = <T>(name: string, data: T) => {
  // @ts-ignore
  if (typeof flutterObject !== 'undefined' && flutterObject) {
    const postInfo = JSON.stringify({ name, data });

    // @ts-ignore
    flutterObject.postMessage(postInfo);
  }
};