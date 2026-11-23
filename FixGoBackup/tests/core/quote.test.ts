import { describe, it, expect } from 'vitest';
import { diffQuote, quoteTotal, lineAmount, validateQuoteDraft, newLineKey, draftDiffers } from '../../shared/core/quote';
import type { QuoteLine } from '../../shared/core/types';

const L = (key: string, kind: 'task' | 'part', name: string, quantity: number, unit_price: number): QuoteLine => ({
  line_key: key, kind, name, quantity, unit_price, amount: kind === 'task' ? unit_price : quantity * unit_price,
});

describe('Phiếu đề xuất – tính tiền', () => {
  it('hạng mục công việc luôn có số lượng = 1', () => {
    expect(lineAmount({ kind: 'task', quantity: 5, unit_price: 50000 })).toBe(50000);
  });
  it('phụ tùng = số lượng × đơn giá', () => {
    expect(lineAmount({ kind: 'part', quantity: 2, unit_price: 120000 })).toBe(240000);
  });
  it('tổng chi phí cộng hạng mục và phụ tùng', () => {
    expect(quoteTotal([
      { kind: 'task', quantity: 1, unit_price: 80000 },
      { kind: 'part', quantity: 2, unit_price: 45000 },
    ])).toBe(170000);
  });
  it('sinh khóa dòng khác nhau, đúng định dạng uuid', () => {
    const a = newLineKey(); const b = newLineKey();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('Phiếu đề xuất – kiểm tra hợp lệ (M-11)', () => {
  it('cần chẩn đoán và ít nhất 1 hạng mục', () => {
    const r = validateQuoteDraft({ diagnosis: ' ', lines: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.diagnosis).toBeTruthy();
    expect(r.errors.tasks).toBeTruthy();
  });
  it('chỉ có phụ tùng mà không có hạng mục vẫn lỗi', () => {
    const r = validateQuoteDraft({ diagnosis: 'Hỏng bugi', lines: [{ line_key: 'a', kind: 'part', name: 'Bugi', quantity: 1, unit_price: 1 }] });
    expect(r.errors.tasks).toBeTruthy();
  });
  it('hợp lệ khi đủ thông tin', () => {
    const r = validateQuoteDraft({ diagnosis: 'Thủng săm', lines: [{ line_key: 'a', kind: 'task', name: 'Vá săm', quantity: 1, unit_price: 30000 }] });
    expect(r.ok).toBe(true);
  });
  it('số lượng phụ tùng phải là số nguyên ≥ 1', () => {
    const r = validateQuoteDraft({ diagnosis: 'x', lines: [
      { line_key: 'a', kind: 'task', name: 'Công', quantity: 1, unit_price: 1 },
      { line_key: 'b', kind: 'part', name: 'Săm', quantity: 0, unit_price: 1 },
    ] });
    expect(r.errors.line_1_qty).toBeTruthy();
  });
});

describe('Phiếu đề xuất – highlight (BR-07, U-13)', () => {
  const v1 = { diagnosis: 'Thủng săm', lines: [L('t1', 'task', 'Vá săm', 1, 30000), L('p1', 'part', 'Săm', 1, 60000)] };
  it('phiên bản đầu không có highlight', () => {
    const d = diffQuote(null, v1);
    expect(d.hasChanges).toBe(false);
    expect(d.lines.every((x) => x.state === 'unchanged')).toBe(true);
  });
  it('đánh dấu dòng mới, dòng sửa, dòng xóa', () => {
    const v2 = { diagnosis: 'Thủng săm, hỏng van', lines: [L('t1', 'task', 'Vá săm', 1, 35000), L('p2', 'part', 'Van', 1, 20000)] };
    const d = diffQuote(v1, v2);
    expect(d.lines.find((x) => x.line.line_key === 't1')?.state).toBe('changed');
    expect(d.lines.find((x) => x.line.line_key === 'p2')?.state).toBe('new');
    expect(d.removed.map((x) => x.line_key)).toEqual(['p1']);
    expect(d.diagnosisChanged).toBe(true);
    expect(d.hasChanges).toBe(true);
  });
  it('không đổi gì thì không có thay đổi', () => {
    expect(diffQuote(v1, { ...v1 }).hasChanges).toBe(false);
  });
  it('dòng đã xóa không tính vào tổng của phiên bản mới', () => {
    const v2 = { diagnosis: 'a', lines: [L('t1', 'task', 'Vá săm', 1, 30000)] };
    const d = diffQuote(v1, v2);
    expect(quoteTotal(d.lines.map((x) => x.line))).toBe(30000);
  });
  it('nhận biết bản nháp khác phiếu gốc', () => {
    const base = { diagnosis: 'a', lines: [{ line_key: 'x', kind: 'task' as const, name: 'n', quantity: 1, unit_price: 5 }] };
    expect(draftDiffers(base, base)).toBe(false);
    expect(draftDiffers({ ...base, diagnosis: 'b' }, base)).toBe(true);
    expect(draftDiffers({ ...base, lines: [{ ...base.lines[0], unit_price: 6 }] }, base)).toBe(true);
  });
});
