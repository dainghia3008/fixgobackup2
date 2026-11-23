import React from 'react';
import { Text, View } from 'react-native';
import { Badge, Card, Row } from '../ui';
import { colors, font, radius } from '../theme';
import { diffQuote } from '../../core/quote';
import { formatVND } from '../../core/format';
import type { QuoteDTO } from '../../core/types';

// Phiếu đề xuất (U-13, U-15, M-11, M-15). Truyền previous để làm nổi bật phần thay đổi (BR-07).
export function QuoteView({ quote, previous, showStatus }: { quote: QuoteDTO; previous?: QuoteDTO | null; showStatus?: boolean }) {
  const diff = diffQuote(previous ?? null, quote);
  const tasks = diff.lines.filter((l) => l.line.kind === 'task');
  const parts = diff.lines.filter((l) => l.line.kind === 'part');
  const hl = (state: string) => (state === 'unchanged' ? undefined : { backgroundColor: colors.highlight });
  const tag = (state: string) => (state === 'new' ? <Badge text="Mới" tone="warn" /> : state === 'changed' ? <Badge text="Đã sửa" tone="warn" /> : null);

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={font.h3}>Phiếu đề xuất · Phiên bản {quote.version}</Text>
        {showStatus && <Badge text={quote.status === 'confirmed' ? 'Đã xác nhận' : quote.status === 'sent' ? 'Chờ xác nhận' : 'Đã thay thế'} tone={quote.status === 'confirmed' ? 'success' : 'neutral'} />}
      </Row>
      <View style={[{ marginTop: 10, borderRadius: radius.md, padding: 10, backgroundColor: colors.bg }, diff.diagnosisChanged && { backgroundColor: colors.highlight }]}>
        <Text style={font.label}>Chẩn đoán {diff.diagnosisChanged ? '· Đã sửa' : ''}</Text>
        <Text style={font.body}>{quote.diagnosis}</Text>
      </View>

      <Text style={[font.label, { marginTop: 14, marginBottom: 4 }]}>Hạng mục công việc</Text>
      {tasks.map(({ line, state }) => (
        <Row key={line.line_key} style={[{ justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8 }, hl(state)]}>
          <Row style={{ flex: 1 }} gap={8}><Text style={[font.body, { flexShrink: 1 }]}>{line.name}</Text>{tag(state)}</Row>
          <Text style={[font.body, { fontWeight: '700' }]}>{formatVND(line.amount)}</Text>
        </Row>
      ))}
      {parts.length > 0 && <Text style={[font.label, { marginTop: 10, marginBottom: 4 }]}>Phụ tùng thay thế</Text>}
      {parts.map(({ line, state }) => (
        <Row key={line.line_key} style={[{ justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8 }, hl(state)]}>
          <View style={{ flex: 1 }}>
            <Row gap={8}><Text style={[font.body, { flexShrink: 1 }]}>{line.name}</Text>{tag(state)}</Row>
            <Text style={font.sub}>{line.quantity} × {formatVND(line.unit_price)}</Text>
          </View>
          <Text style={[font.body, { fontWeight: '700' }]}>{formatVND(line.amount)}</Text>
        </Row>
      ))}
      {diff.removed.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <Text style={font.label}>Đã loại bỏ so với phiên bản trước</Text>
          {diff.removed.map((l) => (
            <Row key={l.line_key} style={{ justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 8 }}>
              <Text style={[font.sub, { textDecorationLine: 'line-through' }]}>{l.name}</Text>
              <Text style={[font.sub, { textDecorationLine: 'line-through' }]}>{formatVND(l.amount)}</Text>
            </Row>
          ))}
        </View>
      )}
      <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 10 }} />
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={font.h3}>Tổng chi phí</Text>
        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.primaryDark }}>{formatVND(quote.total)}</Text>
      </Row>
    </Card>
  );
}
