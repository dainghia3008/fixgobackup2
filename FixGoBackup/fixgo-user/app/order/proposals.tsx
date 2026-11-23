import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Row, Screen, Info, toast } from '@/shared/mobile/ui';
import { MechanicCard } from '@/shared/mobile/components/MechanicCard';
import { colors, font } from '@/shared/mobile/theme';
import { formatPriceRange } from '@/shared/core/format';
import { errorCode, errorMessage } from '@/shared/core/errors';
import { useCustomer } from '@/store';
import { askAndCancel, resync, selectMechanic } from '@/actions';

// U-08: danh sách thợ phản hồi – thợ Offline / bị chốt / bị khóa tự biến mất (real-time)
export default function Proposals() {
  const router = useRouter();
  const order = useCustomer((s) => s.order);
  const proposals = useCustomer((s) => s.proposals);
  const [busyId, setBusyId] = useState<string | null>(null);
  if (!order) return null;

  const choose = async (proposalId: string) => {
    setBusyId(proposalId);
    try {
      await selectMechanic(order.id, proposalId); // thành công → useNavSync chuyển sang U-10
    } catch (e) {
      toast(errorMessage(e), 'error');
      if (['PROPOSAL_UNAVAILABLE', 'MECHANIC_BUSY', 'MECHANIC_OFFLINE', 'MECHANIC_LOCKED', 'ORDER_NOT_SEARCHING'].includes(errorCode(e))) await resync();
    } finally { setBusyId(null); }
  };

  return (
    <Screen
      title="Thợ đã phản hồi" subtitle={`${proposals.length} đề xuất`}
      footer={<>
        <Button title="Xem lại yêu cầu cứu hộ" variant="secondary" icon="document-text-outline" onPress={() => router.push('/order/view')} />
        <Button title="Hủy yêu cầu cứu hộ" variant="dangerSoft" onPress={() => askAndCancel(order.id)} />
      </>}
    >
      {[...proposals].sort((a, b) => a.price_min - b.price_min).map((p) => (
        <Card key={p.id}>
          <MechanicCard mechanic={p.mechanic} />
          <View style={{ backgroundColor: colors.bg, borderRadius: 14, padding: 12, marginVertical: 12 }}>
            <Text style={font.label}>Nhận định ban đầu</Text>
            <Text style={font.body} numberOfLines={3}>{p.assessment}</Text>
          </View>
          <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <Info icon="cash-outline" label="Khoảng giá" value={<Text style={[font.h3, { color: colors.primaryDark }]}>{formatPriceRange(p.price_min, p.price_max)}</Text>} />
            <Info icon="time-outline" label="Có mặt sau" value={<Text style={font.h3}>{p.eta_minutes} phút</Text>} />
          </Row>
          <Row>
            <Button title="Xem chi tiết" variant="ghost" small style={{ flex: 1 }} onPress={() => router.push({ pathname: '/order/proposal/[id]', params: { id: p.id } })} />
            <Button title="Chọn thợ này" small style={{ flex: 1 }} loading={busyId === p.id} disabled={!!busyId} onPress={() => choose(p.id)} />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
