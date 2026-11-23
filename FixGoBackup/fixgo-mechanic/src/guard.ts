import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useMechanic } from '@/store';

// M-05/M-06/M-07: yêu cầu biến mất (khách hủy / chốt thợ khác / thợ bị khóa) → về M-04. Thông báo do store phát.
export function useRequestGuard(orderId: string, doneRef?: { current: boolean }) {
  const router = useRouter();
  const exists = useMechanic((s) => s.dispatches.some((d) => d.order_id === orderId));
  useEffect(() => {
    if (!exists && !doneRef?.current) router.replace('/(tabs)/home');
  }, [exists]);
  return exists;
}
