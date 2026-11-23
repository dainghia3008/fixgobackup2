import React, { useState } from 'react';
import { FlatList, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Card, EmptyState, Row, Screen, confirmAsync } from '@/shared/mobile/ui';
import { colors, font } from '@/shared/mobile/theme';
import { incidentLabel } from '@/shared/core/constants';
import { formatDistance, formatDateTime } from '@/shared/core/format';
import { useMechanic } from '@/store';
import { goOffline, goOnline, resync } from '@/actions';

// M-04: bật/tắt hoạt động + danh sách sự cố (cập nhật real-time, không tự mở M-05)
export default function Home() {
  const router = useRouter();
  const mech = useMechanic((s) => s.mechanic);
  const dispatches = useMechanic((s) => s.dispatches);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const online = mech?.presence === 'online';

  const toggle = async (v: boolean) => {
    setBusy(true);
    try {
      if (v) await goOnline();
      else if (await confirmAsync('Chuyển sang Offline?', 'Các đề xuất đã gửi và còn chờ khách chọn sẽ không còn khả dụng và không tự khôi phục khi bạn bật Online lại.', 'Chuyển Offline')) await goOffline();
    } finally { setBusy(false); }
  };

  return (
    <Screen title="Sự cố gần bạn" scroll={false} padded={false}>
      <View style={{ padding: 16, paddingBottom: 4 }}>
        <Card style={{ backgroundColor: online ? colors.primary : colors.card }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={[font.h2, { color: online ? '#fff' : colors.text }]}>{online ? 'Bạn đang Online' : 'Bạn đang Offline'}</Text>
              <Text style={[font.sub, { color: online ? '#E5F7EC' : colors.sub }]}>{online ? 'Đang nhận yêu cầu cứu hộ trong bán kính 5 km' : 'Bật Online để nhận yêu cầu cứu hộ mới'}</Text>
            </View>
            <Switch value={online} onValueChange={toggle} disabled={busy} trackColor={{ true: '#7EDCA5', false: colors.line }} thumbColor="#fff" />
          </Row>
        </Card>
      </View>
      <FlatList
        data={dispatches}
        keyExtractor={(d) => d.order_id}
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        refreshing={refreshing}
        onRefresh={async () => { setRefreshing(true); await resync(); setRefreshing(false); }}
        ListEmptyComponent={<EmptyState icon="checkmark-done-outline" title="Chưa có sự cố cần xử lý" text={online ? 'Yêu cầu mới sẽ xuất hiện ngay tại đây.' : 'Bật Online để bắt đầu nhận yêu cầu.'} />}
        renderItem={({ item }) => (
          <Card onPress={() => router.push({ pathname: '/request/[orderId]', params: { orderId: item.order_id } })}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row style={{ flexWrap: 'wrap', flex: 1, gap: 6 }}>{item.order.incident_types.map((c) => <Badge key={c} text={incidentLabel(c)} tone="info" />)}</Row>
              {item.status === 'accepted' && <Badge text="Đã chấp nhận" tone="success" />}
            </Row>
            <Text style={[font.h3, { marginTop: 10 }]}>{item.order.vehicle_model} · {item.order.license_plate}</Text>
            <Text style={[font.sub, { marginTop: 4 }]} numberOfLines={2}>{item.order.address}</Text>
            <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={[font.label, { color: colors.primaryDark }]}>Cách {formatDistance(item.route_distance_m)}</Text>
              <Text style={font.sub}>{formatDateTime(item.created_at)}</Text>
            </Row>
          </Card>
        )}
      />
    </Screen>
  );
}
