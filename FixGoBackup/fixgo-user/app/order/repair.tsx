import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Screen } from '@/shared/mobile/ui';
import { MechanicCard } from '@/shared/mobile/components/MechanicCard';
import { useChatUnread } from '@/shared/mobile/chat';
import { colors, font } from '@/shared/mobile/theme';
import { formatVND } from '@/shared/core/format';
import { useCustomer } from '@/store';

// U-14: đang sửa chữa – không có nút hủy
export default function Repair() {
  const router = useRouter();
  const order = useCustomer((s) => s.order);
  const quotes = useCustomer((s) => s.quotes);
  const unread = useChatUnread((s) => s.count);
  if (!order || !order.mechanic) return null;
  const current = quotes.find((q) => q.status === 'confirmed');
  return (
    <Screen title="Đang sửa chữa" footer={<>
      <Button title={unread ? `Nhắn tin (${unread} mới)` : 'Nhắn tin'} icon="chatbubble-ellipses" onPress={() => router.push('/order/chat')} />
      <Button title="Chi tiết phiếu đề xuất" variant="secondary" icon="receipt-outline" onPress={() => router.push('/order/quote-detail')} />
      <Button title="Báo cáo vấn đề cứu hộ" variant="ghost" icon="flag-outline" onPress={() => router.push({ pathname: '/report', params: { orderId: order.id, kind: 'rescue_issue' } })} />
    </>}>
      <View style={{ alignItems: 'center', paddingVertical: 28 }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="construct" size={50} color={colors.primary} />
        </View>
        <Text style={[font.h1, { marginTop: 16 }]}>Thợ đang sửa xe</Text>
        <Text style={[font.sub, { textAlign: 'center', marginTop: 8 }]}>Khi sửa xong, thợ sẽ xác nhận hoàn tất và bạn có thể đánh giá dịch vụ.</Text>
        {current && <Text style={[font.h3, { marginTop: 14, color: colors.primaryDark }]}>Tổng chi phí đã xác nhận: {formatVND(current.total)}</Text>}
      </View>
      <Card><MechanicCard mechanic={order.mechanic} /></Card>
    </Screen>
  );
}
