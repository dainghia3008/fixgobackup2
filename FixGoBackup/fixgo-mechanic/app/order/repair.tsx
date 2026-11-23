import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Row, Screen, confirmAsync, toast } from '@/shared/mobile/ui';
import { QuoteView } from '@/shared/mobile/components/QuoteView';
import { useChatUnread } from '@/shared/mobile/chat';
import { font } from '@/shared/mobile/theme';
import { errorCode, errorMessage } from '@/shared/core/errors';
import { useMechanic, useQuoteDrafts } from '@/store';
import { cancelByMechanic, completeRepair, resync } from '@/actions';

// M-12: 3. Tiến hành sửa chữa
export default function Repair() {
  const router = useRouter();
  const order = useMechanic((s) => s.order);
  const quotes = useMechanic((s) => s.quotes);
  const hasDraft = useQuoteDrafts((s) => (order ? !!s.drafts[order.id] : false));
  const unread = useChatUnread((s) => s.count);
  const [busy, setBusy] = useState(false);
  if (!order) return null;
  const current = quotes.find((q) => q.status === 'confirmed') ?? quotes[0];

  const finish = async () => {
    if (!(await confirmAsync('Hoàn tất sửa chữa?', 'Khách sẽ chuyển sang bước đánh giá và nhắn tin sẽ kết thúc.', 'Hoàn tất'))) return;
    setBusy(true);
    try { await completeRepair(order.id); } // → useNavSync chuyển sang M-13
    catch (e) { toast(errorMessage(e), 'error'); if (errorCode(e) === 'INVALID_STATE') resync(); } finally { setBusy(false); }
  };

  return (
    <Screen title="Tiến hành sửa chữa" footer={<>
      <Button title="Hoàn tất sửa chữa" icon="checkmark-done" onPress={finish} loading={busy} />
      <Row gap={10}>
        <Button title="Chỉnh sửa phiếu" variant="secondary" icon="create-outline" style={{ flex: 1 }} onPress={() => router.push('/order/quote')} />
        <Button title={unread ? `Nhắn tin (${unread})` : 'Nhắn tin'} variant="secondary" icon="chatbubble-ellipses" style={{ flex: 1 }} onPress={() => router.push('/order/chat')} />
      </Row>
      <Button title="Hủy đơn" variant="dangerSoft" onPress={() => cancelByMechanic(order.id)} />
    </>}>
      <Text style={[font.sub, { marginBottom: 10 }]}>Thực hiện đúng theo phiếu đã được khách xác nhận. Phát sinh thêm → chỉnh sửa phiếu và gửi khách xác nhận lại.</Text>
      {hasDraft && <View style={{ marginBottom: 10 }}><Badge text="Có bản nháp phiếu chưa gửi" tone="warn" /></View>}
      {current && <QuoteView quote={current} showStatus />}
    </Screen>
  );
}
