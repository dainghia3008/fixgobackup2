import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Info, Screen, toast } from '@/shared/mobile/ui';
import { MechanicCard } from '@/shared/mobile/components/MechanicCard';
import { colors, font } from '@/shared/mobile/theme';
import { formatPriceRange } from '@/shared/core/format';
import { errorCode, errorMessage } from '@/shared/core/errors';
import { useCustomer } from '@/store';
import { resync, selectMechanic } from '@/actions';

// U-09: chi tiết đề xuất của thợ (không hiển thị CCCD/giấy tờ)
export default function ProposalDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const order = useCustomer((s) => s.order);
  const proposal = useCustomer((s) => s.proposals.find((p) => p.id === id));
  const [busy, setBusy] = useState(false);

  // Thợ biến mất (Offline / bị chốt / bị khóa) → báo và về U-08; nếu danh sách trống, useNavSync đưa về U-06.
  useEffect(() => {
    if (proposal) return;
    toast('Thợ này không còn khả dụng', 'warn');
    if (useCustomer.getState().proposals.length > 0 && router.canGoBack()) router.back();
  }, [!!proposal]);

  if (!order || !proposal) return null;
  const choose = async () => {
    setBusy(true);
    try { await selectMechanic(order.id, proposal.id); }
    catch (e) {
      toast(errorMessage(e), 'error');
      if (['PROPOSAL_UNAVAILABLE', 'MECHANIC_BUSY', 'MECHANIC_OFFLINE', 'MECHANIC_LOCKED', 'ORDER_NOT_SEARCHING'].includes(errorCode(e))) await resync();
    } finally { setBusy(false); }
  };

  return (
    <Screen title="Chi tiết đề xuất" onBack={() => router.back()} footer={<Button title="Xác nhận chọn thợ" icon="checkmark-circle" onPress={choose} loading={busy} />}>
      <Card><MechanicCard mechanic={proposal.mechanic} size={64} /></Card>
      <Card>
        <Info icon="chatbubble-ellipses-outline" label="Nhận định ban đầu" value={proposal.assessment} />
        <Info icon="time-outline" label="Thời gian có mặt dự kiến" value={`${proposal.eta_minutes} phút`} />
        <View>
          <Text style={font.label}>Khoảng giá dự kiến</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.primaryDark }}>{formatPriceRange(proposal.price_min, proposal.price_max)}</Text>
          <Text style={[font.sub, { marginTop: 4 }]}>Đây là giá tham khảo. Giá chính xác nằm trong phiếu đề xuất sau khi thợ kiểm tra xe — bạn chỉ trả khi đã xác nhận phiếu.</Text>
        </View>
      </Card>
    </Screen>
  );
}
