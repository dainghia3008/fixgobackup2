import React, { useRef, useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Field, Row, Screen, Spinner, toast } from '@/shared/mobile/ui';
import { colors, font } from '@/shared/mobile/theme';
import { parseMoney, validateProposal, type Errors } from '@/shared/core/validation';
import { errorCode, errorMessage } from '@/shared/core/errors';
import { useMechanic } from '@/store';
import { useRequestGuard } from '@/guard';
import { goOnline, saveDraft, sendProposal } from '@/actions';

// M-07: gửi đề xuất sơ bộ (chỉ khi Online). Quay lại → M-05, giữ nguyên trạng thái đã chấp nhận + bản nháp.
export default function Proposal() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const done = useRef(false);
  const exists = useRequestGuard(orderId, done);
  const d = useMechanic((s) => s.dispatches.find((x) => x.order_id === orderId));
  const online = useMechanic((s) => s.mechanic?.presence === 'online');
  const [assessment, setAssessment] = useState(d?.draft?.assessment ?? '');
  const [min, setMin] = useState(d?.draft?.price_min ?? '');
  const [max, setMax] = useState(d?.draft?.price_max ?? '');
  const [eta, setEta] = useState(d?.draft?.eta_minutes ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  if (!exists || !d) return <Spinner />;

  const goBack = () => {
    const draft = { assessment, price_min: min, price_max: max, eta_minutes: eta };
    if (assessment || min || max || eta) saveDraft(orderId, draft); // lưu nháp 1 request khi rời màn hình
    router.back();
  };

  const submit = async () => {
    const e = validateProposal({ assessment, price_min: min, price_max: max, eta_minutes: eta });
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    done.current = true;
    try {
      await sendProposal(orderId, { assessment: assessment.trim(), min: parseMoney(min), max: parseMoney(max), eta: Number(eta) });
      toast('Đã gửi đề xuất cho khách');
      router.replace('/(tabs)/home');
    } catch (err) {
      done.current = false;
      toast(errorMessage(err), 'error');
      if (['REQUEST_UNAVAILABLE'].includes(errorCode(err))) useMechanic.getState().dropDispatch(orderId);
    } finally { setBusy(false); }
  };

  return (
    <Screen title="Đề xuất sơ bộ" subtitle="Gửi cho khách để được chọn" onBack={goBack} footer={<Button title="Gửi đề xuất" icon="send" onPress={submit} loading={busy} disabled={!online} />}>
      {!online && (
        <Card style={{ backgroundColor: colors.warnSoft }}>
          <Text style={[font.body, { marginBottom: 10 }]}>Bạn đang Offline. Hãy bật Online trước khi gửi đề xuất (các yêu cầu đã chấp nhận vẫn được giữ).</Text>
          <Button title="Bật Online" small onPress={() => goOnline()} />
        </Card>
      )}
      <Field label="Nhận định ban đầu" value={assessment} onChangeText={setAssessment} multiline error={errors.assessment} placeholder="VD: Nhiều khả năng thủng săm sau, tôi sẽ vá hoặc thay tại chỗ." />
      <Row style={{ alignItems: 'flex-start' }} gap={10}>
        <Field style={{ flex: 1 }} label="Giá thấp nhất (đ)" value={min} onChangeText={(t) => setMin(t.replace(/\D/g, ''))} keyboardType="number-pad" error={errors.price_min} placeholder="50000" />
        <Field style={{ flex: 1 }} label="Giá cao nhất (đ)" value={max} onChangeText={(t) => setMax(t.replace(/\D/g, ''))} keyboardType="number-pad" error={errors.price_max} placeholder="150000" />
      </Row>
      <Field label="Thời gian có mặt dự kiến (phút)" value={eta} onChangeText={(t) => setEta(t.replace(/\D/g, ''))} keyboardType="number-pad" error={errors.eta_minutes} placeholder="15" />
      <Text style={font.sub}>Giá chính xác sẽ do bạn lập trong phiếu đề xuất sau khi kiểm tra xe tại hiện trường.</Text>
    </Screen>
  );
}
