import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Screen, confirmAsync, toast } from '@/shared/mobile/ui';
import { colors, font } from '@/shared/mobile/theme';
import { formatVND } from '@/shared/core/format';
import { errorMessage } from '@/shared/core/errors';
import { useMechanic } from '@/store';
import { confirmPayment } from '@/actions';

// M-13: xác nhận thanh toán (khách trả trực tiếp; không có chat – BR-15)
export default function Payment() {
  const order = useMechanic((s) => s.order);
  const quotes = useMechanic((s) => s.quotes);
  const [busy, setBusy] = useState(false);
  if (!order) return null;
  const current = quotes.find((q) => q.status === 'confirmed') ?? quotes[0];

  const confirm = async () => {
    if (!(await confirmAsync('Đã nhận đủ tiền?', `Xác nhận bạn đã nhận ${formatVND(current?.total ?? 0)} từ khách.`, 'Đã nhận'))) return;
    setBusy(true);
    try { await confirmPayment(order.id); toast('Đơn đã hoàn thành. Cảm ơn bạn!'); } // → về M-04 (hoặc thông báo khóa)
    catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <Screen title="Xác nhận thanh toán" footer={<Button title="Đã nhận thanh toán" icon="cash" onPress={confirm} loading={busy} />}>
      <View style={{ alignItems: 'center', paddingVertical: 24 }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="wallet" size={48} color={colors.primary} />
        </View>
        <Text style={[font.sub, { marginTop: 16 }]}>Số tiền khách cần thanh toán</Text>
        <Text style={{ fontSize: 40, fontWeight: '800', color: colors.primaryDark, marginTop: 4 }}>{formatVND(current?.total ?? 0)}</Text>
      </View>
      <Card><Text style={font.body}>Khách thanh toán trực tiếp cho bạn (tiền mặt hoặc chuyển khoản). Ứng dụng chỉ ghi nhận xác nhận của bạn.</Text></Card>
    </Screen>
  );
}
