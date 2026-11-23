import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Screen } from '@/shared/mobile/ui';
import { MechanicCard } from '@/shared/mobile/components/MechanicCard';
import { useChatUnread } from '@/shared/mobile/chat';
import { colors, font } from '@/shared/mobile/theme';
import { useCustomer } from '@/store';
import { askAndCancel } from '@/actions';

// U-12
export default function Arrived() {
  const router = useRouter();
  const order = useCustomer((s) => s.order);
  const unread = useChatUnread((s) => s.count);
  if (!order || !order.mechanic) return null;
  return (
    <Screen title="Thợ đã đến nơi" footer={<>
      <Button title={unread ? `Nhắn tin (${unread} mới)` : 'Nhắn tin'} icon="chatbubble-ellipses" onPress={() => router.push('/order/chat')} />
      <Button title="Xem lại yêu cầu cứu hộ" variant="secondary" onPress={() => router.push('/order/view')} />
      <Button title="Hủy yêu cầu cứu hộ" variant="dangerSoft" onPress={() => askAndCancel(order.id)} />
    </>}>
      <View style={{ alignItems: 'center', paddingVertical: 28 }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="checkmark-circle" size={60} color={colors.primary} />
        </View>
        <Text style={[font.h1, { marginTop: 16 }]}>Thợ đã đến nơi</Text>
        <Text style={[font.sub, { textAlign: 'center', marginTop: 8, paddingHorizontal: 12 }]}>
          Thợ đang kiểm tra xe và sẽ gửi phiếu đề xuất sửa chữa chính xác để bạn xác nhận. Bạn chưa phải trả gì ở bước này.
        </Text>
      </View>
      <Card><MechanicCard mechanic={order.mechanic} /></Card>
    </Screen>
  );
}
