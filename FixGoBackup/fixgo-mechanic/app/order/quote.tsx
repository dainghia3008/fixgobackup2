import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Field, H, Row, Screen, toast } from '@/shared/mobile/ui';
import { useChatUnread } from '@/shared/mobile/chat';
import { colors, font } from '@/shared/mobile/theme';
import { draftDiffers, newLineKey, quoteTotal, toDraft, validateQuoteDraft, lineAmount, type DraftLine, type QuoteDraft } from '@/shared/core/quote';
import { formatVND } from '@/shared/core/format';
import { errorCode, errorMessage } from '@/shared/core/errors';
import { useMechanic, useQuoteDrafts } from '@/store';
import { cancelByMechanic, resync, submitQuote } from '@/actions';

const blankTask = (): DraftLine => ({ line_key: newLineKey(), kind: 'task', name: '', quantity: 1, unit_price: 0 });
const blankPart = (): DraftLine => ({ line_key: newLineKey(), kind: 'part', name: '', quantity: 1, unit_price: 0 });
const num = (t: string) => Number(t.replace(/\D/g, '') || 0);

// M-11: 2. Chẩn đoán lỗi và báo giá – lập, gửi, gửi lại phiếu. Bản nháp lưu tạm, chỉ có hiệu lực khi gửi.
export default function QuoteEditor() {
  const router = useRouter();
  const order = useMechanic((s) => s.order);
  const quotes = useMechanic((s) => s.quotes);
  const unread = useChatUnread((s) => s.count);
  const stored = useQuoteDrafts((s) => (order ? s.drafts[order.id] : undefined));
  const editMode = order?.status === 'repairing'; // vào từ M-12 để chỉnh sửa

  const base: QuoteDraft | null = useMemo(() => {
    const q = editMode ? (quotes.find((x) => x.status === 'confirmed') ?? quotes[0]) : quotes[0];
    return q ? toDraft(q) : null;
  }, [quotes, editMode]);

  const [draft, setDraft] = useState<QuoteDraft>(() => stored ?? base ?? { diagnosis: '', lines: [blankTask()] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // lưu tạm (debounce) để mở lại được khi bị chuyển sang M-12 hoặc thoát app
  useEffect(() => {
    if (!order) return;
    const t = setTimeout(() => useQuoteDrafts.getState().setDraft(order.id, draft), 500);
    return () => clearTimeout(t);
  }, [draft, order?.id]);

  if (!order) return null;
  const changed = draftDiffers(draft, base);
  const waiting = order.status === 'quote_pending';
  const total = quoteTotal(draft.lines);
  const patch = (i: number, p: Partial<DraftLine>) => setDraft((d) => ({ ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) }));
  const remove = (i: number) => setDraft((d) => ({ ...d, lines: d.lines.filter((_, j) => j !== i) }));
  const resetToBase = () => { setDraft(base ?? { diagnosis: '', lines: [blankTask()] }); setErrors({}); };

  const send = async () => {
    const clean: QuoteDraft = { diagnosis: draft.diagnosis.trim(), lines: draft.lines.map((l) => ({ ...l, name: l.name.trim(), quantity: l.kind === 'task' ? 1 : l.quantity })) };
    const v = validateQuoteDraft(clean);
    setErrors(v.errors);
    if (!v.ok) { toast(v.errors.tasks ?? 'Vui lòng kiểm tra các trường báo đỏ', 'warn'); return; }
    setBusy(true);
    try {
      await submitQuote(order.id, clean.diagnosis, clean.lines);
      setDraft(clean);
      toast(order.current_quote_version > 0 ? 'Đã gửi lại phiếu cho khách' : 'Đã gửi phiếu đề xuất cho khách');
    } catch (e) {
      toast(errorMessage(e), 'error');
      if (['INVALID_STATE', 'ORDER_NOT_FOUND'].includes(errorCode(e))) resync();
    } finally { setBusy(false); }
  };

  const index = draft.lines.map((l, i) => ({ l, i }));
  return (
    <Screen
      title="Chẩn đoán & báo giá"
      subtitle={editMode ? 'Chỉnh sửa phiếu đang thực hiện' : 'Lập phiếu đề xuất chính xác'}
      onBack={editMode ? () => router.back() : undefined}
      footer={<>
        <Button title={order.current_quote_version > 0 ? 'Gửi lại phiếu đề xuất' : 'Gửi phiếu đề xuất'} icon="send" onPress={send} loading={busy} disabled={(waiting || editMode) && !changed} />
        <Row gap={10}>
          <Button title={unread ? `Nhắn tin (${unread})` : 'Nhắn tin'} variant="secondary" icon="chatbubble-ellipses" style={{ flex: 1 }} onPress={() => router.push('/order/chat')} />
          {editMode
            ? <Button title="Hủy chỉnh sửa" variant="ghost" style={{ flex: 1 }} onPress={() => { useQuoteDrafts.getState().clear(order.id); router.back(); }} />
            : <Button title="Hủy đơn" variant="dangerSoft" style={{ flex: 1 }} onPress={() => cancelByMechanic(order.id)} />}
        </Row>
      </>}
    >
      {waiting && (
        <Card style={{ backgroundColor: changed ? colors.warnSoft : colors.primarySoft }}>
          <Text style={font.body}>{changed ? `Bạn có thay đổi chưa gửi. Khách vẫn đang thấy phiên bản ${order.current_quote_version}; hãy bấm “Gửi lại” để khách xác nhận.` : `Đã gửi phiên bản ${order.current_quote_version}, đang chờ khách xác nhận.`}</Text>
        </Card>
      )}
      {editMode && <Card style={{ backgroundColor: colors.warnSoft }}><Text style={font.body}>Phiếu đã xác nhận vẫn có hiệu lực cho đến khi khách xác nhận bản mới. Không thực hiện hạng mục mới hoặc thu thêm chi phí chưa được khách xác nhận.</Text></Card>}

      <Field label="Chẩn đoán từ thợ" value={draft.diagnosis} onChangeText={(t) => setDraft((d) => ({ ...d, diagnosis: t }))} multiline error={errors.diagnosis} placeholder="VD: Thủng săm sau do đinh, van bị hở nhẹ." />

      <H>Hạng mục công việc</H>
      {index.filter(({ l }) => l.kind === 'task').map(({ l, i }) => (
        <Row key={l.line_key} style={{ alignItems: 'flex-start' }} gap={8}>
          <Field style={{ flex: 1 }} value={l.name} onChangeText={(t) => patch(i, { name: t })} placeholder="Tên hạng mục" error={errors[`line_${i}_name`]} />
          <Field style={{ width: 118 }} value={l.unit_price ? String(l.unit_price) : ''} onChangeText={(t) => patch(i, { unit_price: num(t) })} keyboardType="number-pad" placeholder="Chi phí" error={errors[`line_${i}_price`]} />
          <Pressable onPress={() => remove(i)} hitSlop={8} style={{ height: 50, justifyContent: 'center' }}><Ionicons name="trash-outline" size={22} color={colors.danger} /></Pressable>
        </Row>
      ))}
      {!!errors.tasks && <Text style={{ color: colors.danger, marginBottom: 6 }}>{errors.tasks}</Text>}
      <Button title="Thêm hạng mục" variant="secondary" small icon="add" onPress={() => setDraft((d) => ({ ...d, lines: [...d.lines, blankTask()] }))} style={{ alignSelf: 'flex-start', marginBottom: 12 }} />

      <H>Phụ tùng và vật tư thay thế</H>
      {index.filter(({ l }) => l.kind === 'part').map(({ l, i }) => (
        <Card key={l.line_key} style={{ padding: 12, marginBottom: 8 }}>
          <Row style={{ alignItems: 'flex-start' }} gap={8}>
            <Field style={{ flex: 1, marginBottom: 8 }} value={l.name} onChangeText={(t) => patch(i, { name: t })} placeholder="Tên phụ tùng" error={errors[`line_${i}_name`]} />
            <Pressable onPress={() => remove(i)} hitSlop={8} style={{ height: 50, justifyContent: 'center' }}><Ionicons name="trash-outline" size={22} color={colors.danger} /></Pressable>
          </Row>
          <Row style={{ alignItems: 'flex-start' }} gap={8}>
            <Field style={{ width: 80, marginBottom: 0 }} value={String(l.quantity)} onChangeText={(t) => patch(i, { quantity: num(t) })} keyboardType="number-pad" placeholder="SL" error={errors[`line_${i}_qty`]} />
            <Field style={{ flex: 1, marginBottom: 0 }} value={l.unit_price ? String(l.unit_price) : ''} onChangeText={(t) => patch(i, { unit_price: num(t) })} keyboardType="number-pad" placeholder="Đơn giá" error={errors[`line_${i}_price`]} />
            <View style={{ height: 50, justifyContent: 'center', minWidth: 96, alignItems: 'flex-end' }}><Text style={font.h3}>{formatVND(lineAmount(l))}</Text></View>
          </Row>
        </Card>
      ))}
      <Button title="Thêm phụ tùng" variant="secondary" small icon="add" onPress={() => setDraft((d) => ({ ...d, lines: [...d.lines, blankPart()] }))} style={{ alignSelf: 'flex-start', marginBottom: 16 }} />

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={font.h3}>Tổng chi phí (tự tính)</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.primaryDark }}>{formatVND(total)}</Text>
        </Row>
      </Card>
      {changed && base && <Button title="Bỏ bản nháp, quay về phiếu đã gửi" variant="ghost" small onPress={resetToBase} />}
    </Screen>
  );
}
