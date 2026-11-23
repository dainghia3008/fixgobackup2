import React, { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppMap } from '@/shared/mobile/maps';
import { Button, Card, Row, Screen, Spinner, confirmAsync } from '@/shared/mobile/ui';
import { OrderSummary } from '@/shared/mobile/components/OrderSummary';
import { colors, font } from '@/shared/mobile/theme';
import { formatDistance } from '@/shared/core/format';
import { useMechanic } from '@/store';
import { useRequestGuard } from '@/guard';
import { acceptRequest, declineRequest } from '@/actions';

// M-05: yêu cầu cứu hộ mới. Quay lại → M-04, yêu cầu vẫn trong danh sách.
export default function RequestDetail() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const done = useRef(false);
  const exists = useRequestGuard(orderId, done);
  const d = useMechanic((s) => s.dispatches.find((x) => x.order_id === orderId));
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  if (!exists || !d) return <Spinner />;

  const accept = async () => {
    setBusy('accept');
    const ok = await acceptRequest(orderId);
    setBusy(null);
    if (ok) router.push({ pathname: '/request/[orderId]/proposal', params: { orderId } });
  };
  const decline = async () => {
    if (!(await confirmAsync('Từ chối yêu cầu?', 'Yêu cầu sẽ được gỡ khỏi danh sách của bạn.', 'Từ chối', true))) return;
    setBusy('decline');
    done.current = true;
    const ok = await declineRequest(orderId);
    setBusy(null);
    if (ok) router.replace('/(tabs)/home'); else done.current = false;
  };

  return (
    <Screen title="Yêu cầu cứu hộ mới" subtitle={`Cách bạn ${formatDistance(d.route_distance_m)} theo tuyến đường`} onBack={() => router.back()} footer={<>
      <Button title="Trợ lý AI" variant="secondary" icon="sparkles" onPress={() => router.push({ pathname: '/request/[orderId]/ai', params: { orderId } })} />
      <Row gap={10}>
        <Button title="Từ chối" variant="dangerSoft" style={{ flex: 1 }} onPress={decline} loading={busy === 'decline'} disabled={!!busy} />
        <Button title={d.status === 'accepted' ? 'Tiếp tục đề xuất' : 'Chấp nhận'} style={{ flex: 2 }} onPress={accept} loading={busy === 'accept'} disabled={!!busy} />
      </Row>
    </>}>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <View style={{ height: 160 }}>
          <AppMap center={d.order} zoom={15} markers={[{ id: 'c', lat: d.order.lat, lng: d.order.lng, kind: 'customer' }]} />
        </View>
      </Card>
      <OrderSummary order={d.order} />
      {d.status === 'accepted' && <Text style={[font.sub, { color: colors.primaryDark }]}>Bạn đã chấp nhận yêu cầu này. Hãy gửi đề xuất sơ bộ cho khách.</Text>}
    </Screen>
  );
}
