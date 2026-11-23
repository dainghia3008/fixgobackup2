import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppMap, type MapMarker } from '@/shared/mobile/maps';
import { Button, RoundButton, Row, Sheet } from '@/shared/mobile/ui';
import { MechanicCard } from '@/shared/mobile/components/MechanicCard';
import { useChatUnread } from '@/shared/mobile/chat';
import { colors, font } from '@/shared/mobile/theme';
import { formatDistance } from '@/shared/core/format';
import { haversine } from '@/shared/core/geo';
import { useCustomer } from '@/store';
import { askAndCancel } from '@/actions';

// U-10: theo dõi thợ trên bản đồ (vị trí thợ cập nhật qua Broadcast)
export default function Tracking() {
  const router = useRouter();
  const order = useCustomer((s) => s.order);
  const pos = useCustomer((s) => s.mechanicPos);
  const unread = useChatUnread((s) => s.count);
  if (!order || !order.mechanic) return null;

  const markers: MapMarker[] = [{ id: 'me', lat: order.lat, lng: order.lng, kind: 'customer' }];
  if (pos) markers.push({ id: 'mech', lat: pos.lat, lng: pos.lng, kind: 'mechanic' });
  const dist = pos ? haversine({ lat: order.lat, lng: order.lng }, pos) : null;
  const travelling = order.status === 'traveling';

  return (
    <View style={{ flex: 1 }}>
      <AppMap center={order} zoom={15} markers={markers} fit={!!pos} fitPadding={{ top: 120, bottom: 380 }} />
      <View style={{ position: 'absolute', top: 56, left: 16, right: 16, backgroundColor: colors.card, borderRadius: 20, padding: 14, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 }}>
        <Text style={font.h3}>{travelling ? 'Thợ đang trên đường đến bạn' : 'Đã chốt thợ'}</Text>
        <Text style={font.sub}>
          {travelling ? (dist != null ? `Còn khoảng ${formatDistance(dist)} · dự kiến ${order.proposal?.eta_minutes ?? '?'} phút` : 'Đang cập nhật vị trí của thợ…') : 'Thợ sẽ sớm xuất phát. Bạn có thể nhắn tin để trao đổi thêm.'}
        </Text>
      </View>
      <Sheet>
        <MechanicCard mechanic={order.mechanic} />
        <Row style={{ marginTop: 14, marginBottom: 10 }} gap={10}>
          <Button title="Nhắn tin" icon="chatbubble-ellipses" style={{ flex: 1 }} onPress={() => router.push('/order/chat')} />
          <View><RoundButton icon="document-text-outline" onPress={() => router.push('/order/view')} style={{ width: 52, height: 52, borderRadius: 26 }} /></View>
          {unread > 0 && <View style={{ position: 'absolute', left: 8, top: -6, backgroundColor: colors.danger, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{unread}</Text></View>}
        </Row>
        <Button title="Hủy yêu cầu cứu hộ" variant="dangerSoft" onPress={() => askAndCancel(order.id)} />
      </Sheet>
    </View>
  );
}
