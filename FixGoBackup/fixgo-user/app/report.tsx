import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Field, Info, Screen, toast } from '@/shared/mobile/ui';
import { rpc } from '@/shared/mobile/supabase';
import { font } from '@/shared/mobile/theme';
import { shortCode } from '@/shared/core/format';
import { validateReport } from '@/shared/core/validation';
import { errorMessage } from '@/shared/core/errors';
import type { OrderDetail } from '@/shared/core/types';
import { sendReport } from '@/actions';

// U-19: báo cáo thợ (từ U-18) hoặc vấn đề cứu hộ (từ U-14). Không đổi trạng thái đơn.
export default function Report() {
  const { orderId, kind } = useLocalSearchParams<{ orderId: string; kind: 'mechanic' | 'rescue_issue' }>();
  const router = useRouter();
  const [mechanicName, setMechanicName] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { rpc<OrderDetail>('order_detail', { p_order_id: orderId }).then((d) => setMechanicName(d.order.mechanic?.full_name ?? '')).catch(() => {}); }, [orderId]);

  const submit = async () => {
    const e = validateReport(content);
    if (e.content) { setError(e.content); return; }
    setBusy(true);
    try { await sendReport(orderId, kind ?? 'mechanic', content); toast('Đã gửi báo cáo tới quản trị viên'); router.back(); }
    catch (err) { toast(errorMessage(err), 'error'); } finally { setBusy(false); }
  };

  return (
    <Screen title={kind === 'rescue_issue' ? 'Báo cáo vấn đề cứu hộ' : 'Báo cáo thợ'} onBack={() => router.back()} footer={<Button title="Gửi báo cáo" icon="send" onPress={submit} loading={busy} />}>
      <Card>
        <Info icon="receipt-outline" label="Đơn liên quan" value={orderId ? shortCode(orderId) : ''} />
        <Info icon="person-outline" label="Thợ" value={mechanicName || '—'} />
      </Card>
      <Text style={[font.sub, { marginBottom: 10 }]}>Quản trị viên sẽ xem xét dựa trên nhật ký đơn, tin nhắn và phiếu đề xuất. Việc gửi báo cáo không làm thay đổi trạng thái đơn.</Text>
      <Field label="Nội dung báo cáo" value={content} onChangeText={(t) => { setContent(t); setError(''); }} multiline error={error} placeholder="Mô tả vấn đề bạn gặp phải…" />
    </Screen>
  );
}
