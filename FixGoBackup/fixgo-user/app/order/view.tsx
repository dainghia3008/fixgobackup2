import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Info, Screen, Card, H } from '@/shared/mobile/ui';
import { OrderSummary } from '@/shared/mobile/components/OrderSummary';
import { MechanicCard } from '@/shared/mobile/components/MechanicCard';
import { formatPriceRange } from '@/shared/core/format';
import { useCustomer } from '@/store';

// U-07: xem lại yêu cầu (dùng chung, chỉ đọc) – kèm đề xuất sơ bộ khi đã chốt thợ
export default function ViewRequest() {
  const router = useRouter();
  const order = useCustomer((s) => s.order);
  if (!order) return null;
  return (
    <Screen title="Yêu cầu cứu hộ của bạn" onBack={() => router.back()}>
      <OrderSummary order={order} />
      {order.mechanic && order.proposal && (
        <>
          <H>Đề xuất sơ bộ của thợ</H>
          <Card>
            <MechanicCard mechanic={order.mechanic} />
            <View style={{ height: 12 }} />
            <Info icon="chatbubble-ellipses-outline" label="Nhận định ban đầu" value={order.proposal.assessment} />
            <Info icon="cash-outline" label="Khoảng giá dự kiến" value={formatPriceRange(order.proposal.price_min, order.proposal.price_max)} />
            <Info icon="time-outline" label="Thời gian có mặt dự kiến" value={`${order.proposal.eta_minutes} phút`} />
          </Card>
        </>
      )}
    </Screen>
  );
}
