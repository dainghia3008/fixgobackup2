import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, H, Info, Row, Screen, toast } from '@/shared/mobile/ui';
import { OrderSummary } from '@/shared/mobile/components/OrderSummary';
import { useAuth } from '@/shared/mobile/auth';
import { useChatUnread } from '@/shared/mobile/chat';
import { colors, font } from '@/shared/mobile/theme';
import { formatPriceRange } from '@/shared/core/format';
import { errorMessage } from '@/shared/core/errors';
import { useMechanic } from '@/store';
import { sendQuickMessage, startTravel } from '@/actions';

// M-08: Bạn đã được chọn – không có nút hủy đơn
export default function Selected() {
  const router = useRouter();
  const { session } = useAuth();
  const order = useMechanic((s) => s.order);
  const unread = useChatUnread((s) => s.count);
  const [busy, setBusy] = useState<'go' | 'quick' | null>(null);
  if (!order || !session) return null;

  const quick = async () => {
    setBusy('quick');
    try { await sendQuickMessage(session.user.id, order.id, 'Đang tới ngay'); toast('Đã gửi “Đang tới ngay”'); }
    catch { toast('Gửi tin nhắn không thành công', 'error'); } finally { setBusy(null); }
  };
  const go = async () => {
    setBusy('go');
    try { await startTravel(order.id); } // → useNavSync chuyển sang M-09
    catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(null); }
  };

  return (
    <Screen title="Bạn đã được chọn!" footer={<>
      <Button title="Bắt đầu di chuyển ngay" icon="navigate" onPress={go} loading={busy === 'go'} disabled={!!busy} />
      <Row gap={10}>
        <Button title="Đang tới ngay" variant="secondary" style={{ flex: 1 }} onPress={quick} loading={busy === 'quick'} disabled={!!busy} />
        <Button title={unread ? `Nhắn tin (${unread})` : 'Nhắn tin'} variant="secondary" icon="chatbubble-ellipses" style={{ flex: 1 }} onPress={() => router.push('/order/chat')} />
      </Row>
    </>}>
      <View style={{ alignItems: 'center', paddingVertical: 16 }}>
        <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="trophy" size={46} color={colors.primary} />
        </View>
        <Text style={[font.sub, { textAlign: 'center', marginTop: 10 }]}>Khách {order.customer?.full_name ?? ''} đã chọn bạn. Xem lại yêu cầu rồi xuất phát nhé.</Text>
      </View>
      <H>Yêu cầu của khách</H>
      <OrderSummary order={order} />
      {order.proposal && (
        <>
          <H>Đề xuất sơ bộ của bạn</H>
          <Card>
            <Info icon="chatbubble-ellipses-outline" label="Nhận định ban đầu" value={order.proposal.assessment} />
            <Info icon="cash-outline" label="Khoảng giá" value={formatPriceRange(order.proposal.price_min, order.proposal.price_max)} />
            <Info icon="time-outline" label="Thời gian có mặt" value={`${order.proposal.eta_minutes} phút`} />
          </Card>
        </>
      )}
    </Screen>
  );
}
