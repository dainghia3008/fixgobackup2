import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/shared/mobile/ui';
import { HistoryDetail } from '@/shared/mobile/components/History';
import { useCustomer } from '@/store';

// U-18
export default function HistoryItem() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const dirty = useCustomer((s) => s.historyDirty);
  return (
    <HistoryDetail
      orderId={id}
      refreshKey={dirty}
      onBack={() => router.back()}
      actions={(d) => (
        <>
          {d.order.mechanic_id && ['awaiting_payment', 'completed'].includes(d.order.status) && d.order.review_status !== 'submitted' && (
            <Button title="Đánh giá thợ" icon="star" onPress={() => router.push({ pathname: '/order/review', params: { orderId: d.order.id } })} style={{ marginBottom: 10 }} />
          )}
          {d.order.mechanic_id && (
            <Button title="Báo cáo thợ" variant="dangerSoft" icon="flag-outline" onPress={() => router.push({ pathname: '/report', params: { orderId: d.order.id, kind: 'mechanic' } })} />
          )}
        </>
      )}
    />
  );
}
