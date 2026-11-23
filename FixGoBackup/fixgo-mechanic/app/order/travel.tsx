import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppMap, type MapMarker } from '@/shared/mobile/maps';
import { Button, Row, Sheet, toast } from '@/shared/mobile/ui';
import { useChatUnread } from '@/shared/mobile/chat';
import { colors, font } from '@/shared/mobile/theme';
import { formatDistance, formatDuration } from '@/shared/core/format';
import { errorMessage } from '@/shared/core/errors';
import { useMechanic } from '@/store';
import { cancelByMechanic, markArrived } from '@/actions';
import { useTravel } from '@/useTravel';

// M-09: 1. Đến điểm cứu hộ – chỉ dẫn từng chặng
export default function Travel() {
  const router = useRouter();
  const order = useMechanic((s) => s.order);
  const unread = useChatUnread((s) => s.count);
  const target = useMemo(() => ({ lat: order?.lat ?? 0, lng: order?.lng ?? 0 }), [order?.lat, order?.lng]);
  const { me, route, progress } = useTravel(order?.id ?? '', target);
  const [busy, setBusy] = useState(false);
  if (!order) return null;

  const markers: MapMarker[] = [{ id: 'c', lat: order.lat, lng: order.lng, kind: 'customer' }];
  if (me) markers.push({ id: 'me', lat: me.lat, lng: me.lng, kind: 'mechanic' });
  const next = progress?.next;

  const arrived = async () => {
    setBusy(true);
    try { await markArrived(order.id); } // → useNavSync chuyển sang M-11
    catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1 }}>
      <AppMap center={me ?? target} zoom={15} markers={markers} route={route?.coordinates ?? null} fit={!!me} fitPadding={{ top: 170, bottom: 330 }} />
      <View style={{ position: 'absolute', top: 52, left: 14, right: 14, backgroundColor: colors.primaryDark, borderRadius: 20, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center', elevation: 6 }}>
        <Ionicons name="arrow-up-circle" size={40} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }} numberOfLines={2}>{next ? next.instruction : route ? 'Tiếp tục đi thẳng' : 'Đang tìm đường…'}</Text>
          {!!next && <Text style={{ color: '#D1F2DE' }}>sau {formatDistance(progress?.distanceToNext ?? 0)}</Text>}
        </View>
      </View>
      <Sheet>
        <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <View>
            <Text style={font.sub}>Còn lại</Text>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>{progress ? formatDistance(progress.remainingM) : '…'}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={font.sub}>Thời gian dự kiến</Text>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.primaryDark }}>{progress ? formatDuration(progress.remainingS) : '…'}</Text>
          </View>
        </Row>
        <Text style={[font.sub, { marginBottom: 12 }]} numberOfLines={1}>{order.address}</Text>
        <Button title="Xác nhận đã đến" icon="checkmark-circle" onPress={arrived} loading={busy} style={{ marginBottom: 10 }} />
        <Row gap={10}>
          <Button title={unread ? `Nhắn tin (${unread})` : 'Nhắn tin'} variant="secondary" icon="chatbubble-ellipses" style={{ flex: 1 }} onPress={() => router.push('/order/chat')} />
          <Button title="Hủy đơn" variant="dangerSoft" style={{ flex: 1 }} onPress={() => cancelByMechanic(order.id)} />
        </Row>
      </Sheet>
    </View>
  );
}
