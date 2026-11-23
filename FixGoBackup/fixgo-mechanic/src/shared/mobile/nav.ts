import { useEffect, useRef } from 'react';
import { useRootNavigationState, useRouter, useSegments } from 'expo-router';

type AppRouter = ReturnType<typeof useRouter>;

// Quay về đầu ngăn xếp rồi thay bằng màn hình đích → luồng đơn luôn là [màn hình chính] + các màn phụ đẩy lên trên.
export function goTo(router: AppRouter, path: string) {
  try { if (router.canDismiss()) router.dismissAll(); } catch { /* không có gì để đóng */ }
  router.replace(path as any);
}

// Tự chuyển màn hình theo trạng thái đơn (mục 2.2). Chỉ điều hướng khi ĐÍCH thay đổi, nên các màn phụ
// (chat, xem lại yêu cầu...) không bị giật ra; riêng các màn tạm (index, auth-callback) luôn được đưa về đích.
export function useNavSync(target: string | null) {
  const router = useRouter();
  const segments = useSegments() as string[];
  const nav = useRootNavigationState();
  const last = useRef<string | null>(null);
  const transient = segments.length === 0 || segments[0] === 'index' || segments[0] === 'auth-callback';
  useEffect(() => {
    if (!nav?.key || !target) return;
    if (target !== last.current || transient) {
      last.current = target;
      goTo(router, target);
    }
  }, [nav?.key, target, transient]);
}
