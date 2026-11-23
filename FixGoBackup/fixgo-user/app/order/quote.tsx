import React, { useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Screen, Spinner, toast } from '@/shared/mobile/ui';
import { QuoteView } from '@/shared/mobile/components/QuoteView';
import { useChatUnread } from '@/shared/mobile/chat';
import { colors, font } from '@/shared/mobile/theme';
import { errorCode, errorMessage } from '@/shared/core/errors';
import { useCustomer } from '@/store';
import { askAndCancel, confirmQuote, resync } from '@/actions';

// U-13: kiểm tra và xác nhận phiếu – chỉ có [Xác nhận] hoặc [Hủy yêu cầu cứu hộ]
export default function QuoteScreen() {
  const router = useRouter();
  const order = useCustomer((s) => s.order);
  const quotes = useCustomer((s) => s.quotes);
  const unread = useChatUnread((s) => s.count);
  const [busy, setBusy] = useState(false);
  if (!order) return null;
  const latest = quotes[0];
  if (!latest) return <Spinner text="Đang tải phiếu đề xuất…" />;
  const previous = quotes.find((q) => q.version === latest.version - 1) ?? null;

  const confirm = async () => {
    setBusy(true);
    try { await confirmQuote(order.id, latest.version); }
    catch (e) {
      toast(errorMessage(e), 'warn');
      if (['QUOTE_SUPERSEDED', 'INVALID_STATE'].includes(errorCode(e))) await resync(); // hiển thị phiên bản mới nhất
    } finally { setBusy(false); }
  };

  return (
    <Screen title="Xác nhận phiếu đề xuất" subtitle={`Phiên bản ${latest.version}`} footer={<>
      <Button title="Xác nhận phiếu" icon="checkmark-circle" onPress={confirm} loading={busy} />
      <Button title={unread ? `Nhắn tin với thợ (${unread} mới)` : 'Nhắn tin với thợ'} variant="secondary" icon="chatbubble-ellipses" onPress={() => router.push('/order/chat')} />
      <Button title="Hủy yêu cầu cứu hộ" variant="dangerSoft" onPress={() => askAndCancel(order.id)} />
    </>}>
      {latest.version > 1 && <Text style={[font.sub, { color: colors.warn, marginBottom: 10 }]}>Thợ đã gửi lại phiếu. Phần được tô vàng là nội dung mới hoặc đã thay đổi so với phiên bản trước.</Text>}
      <QuoteView quote={latest} previous={previous} />
    </Screen>
  );
}
