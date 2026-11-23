import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppMap } from '@/shared/mobile/maps';
import { Button, Sheet } from '@/shared/mobile/ui';
import { colors, font } from '@/shared/mobile/theme';
import { useCustomer } from '@/store';
import { askAndCancel } from '@/actions';

// U-06: đang tìm thợ – số thợ đã chấp nhận cập nhật real-time
export default function Searching() {
  const router = useRouter();
  const order = useCustomer((s) => s.order);
  const accepted = useCustomer((s) => s.acceptedCount);
  if (!order) return null;

  return (
    <View style={{ flex: 1 }}>
      <AppMap center={order} zoom={15} markers={[{ id: 'me', lat: order.lat, lng: order.lng, kind: 'customer', pulsing: true }]} />
      <Sheet>
        <Text style={font.h2}>Đang tìm thợ…</Text>
        <Text style={[font.sub, { marginTop: 6, marginBottom: 14 }]}>
          {accepted > 0 ? `${accepted} thợ đã nhận yêu cầu và đang chuẩn bị đề xuất cho bạn.` : 'Yêu cầu của bạn đã được gửi tới các thợ gần đó. Vui lòng chờ trong giây lát.'}
        </Text>
        {accepted > 0 && (
          <View style={{ backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 26, fontWeight: '800', color: colors.primaryDark }}>{accepted}</Text>
            <Text style={[font.body, { flex: 1 }]}>thợ đã chấp nhận, chưa gửi đề xuất</Text>
          </View>
        )}
        <Button title="Xem lại yêu cầu cứu hộ" variant="secondary" icon="document-text-outline" onPress={() => router.push('/order/view')} style={{ marginBottom: 10 }} />
        <Button title="Hủy yêu cầu cứu hộ" variant="dangerSoft" onPress={() => askAndCancel(order.id)} />
      </Sheet>
    </View>
  );
}
