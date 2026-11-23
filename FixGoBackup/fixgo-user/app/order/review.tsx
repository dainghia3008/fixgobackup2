import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Field, Screen, Spinner, Stars, toast } from '@/shared/mobile/ui';
import { MechanicCard } from '@/shared/mobile/components/MechanicCard';
import { rpc } from '@/shared/mobile/supabase';
import { font } from '@/shared/mobile/theme';
import { validateReview } from '@/shared/core/validation';
import { errorMessage } from '@/shared/core/errors';
import type { MechanicPublic, OrderDetail } from '@/shared/core/types';
import { useCustomer } from '@/store';
import { skipReview, submitReview } from '@/actions';

// U-16: đánh giá thợ. Mở tự động sau sửa chữa (đơn hiện tại) hoặc từ U-18 (?orderId=…)
export default function Review() {
  const { orderId: paramId } = useLocalSearchParams<{ orderId?: string }>();
  const router = useRouter();
  const current = useCustomer((s) => s.order);
  const orderId = paramId ?? current?.id;
  const fromHistory = !!paramId && paramId !== current?.id;
  const [mechanic, setMechanic] = useState<MechanicPublic | null>(current?.mechanic ?? null);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'send' | 'skip' | null>(null);

  useEffect(() => {
    if (!fromHistory || !paramId) return;
    rpc<OrderDetail>('order_detail', { p_order_id: paramId }).then((d) => setMechanic(d.order.mechanic)).catch(() => {});
  }, [paramId]);

  if (!orderId) return null;
  const done = () => { if (fromHistory) router.back(); }; // đơn hiện tại: useNavSync tự về U-03

  const send = async () => {
    const e = validateReview(stars);
    if (e.stars) { setError(e.stars); return; }
    setBusy('send');
    try { await submitReview(orderId, stars, comment.trim()); toast('Cảm ơn bạn đã đánh giá!'); done(); }
    catch (err) { toast(errorMessage(err), 'error'); } finally { setBusy(null); }
  };
  const skip = async () => {
    setBusy('skip');
    try { await skipReview(orderId); done(); }
    catch (err) { toast(errorMessage(err), 'error'); } finally { setBusy(null); }
  };

  return (
    <Screen title="Đánh giá thợ" onBack={fromHistory ? () => router.back() : undefined} footer={<>
      <Button title="Gửi đánh giá" onPress={send} loading={busy === 'send'} disabled={!!busy} />
      <Button title="Bỏ qua" variant="ghost" onPress={skip} loading={busy === 'skip'} disabled={!!busy} />
    </>}>
      <Text style={[font.body, { textAlign: 'center', marginVertical: 8 }]}>Thợ đã hoàn tất sửa chữa. Bạn thấy dịch vụ thế nào?</Text>
      {mechanic ? <Card><MechanicCard mechanic={mechanic} /></Card> : <Spinner />}
      <Card style={{ alignItems: 'center' }}>
        <Stars value={stars} size={44} onChange={(n) => { setStars(n); setError(''); }} />
        {!!error && <Text style={{ color: '#E5484D', marginTop: 6 }}>{error}</Text>}
      </Card>
      <Field label="Nhận xét (không bắt buộc)" value={comment} onChangeText={setComment} multiline placeholder="Chia sẻ trải nghiệm của bạn…" />
    </Screen>
  );
}
