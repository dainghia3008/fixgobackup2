import type { LineKind, QuoteLine } from './types';

export interface DraftLine {
  line_key: string;
  kind: LineKind;
  name: string;
  quantity: number;
  unit_price: number;
}
export interface QuoteDraft { diagnosis: string; lines: DraftLine[] }
export interface QuoteLike { diagnosis: string; lines: Pick<QuoteLine, 'line_key' | 'kind' | 'name' | 'quantity' | 'unit_price'>[] }

export function newLineKey(): string {
  const h = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
    else if (i === 14) s += '4';
    else if (i === 19) s += h[(Math.random() * 4) | 8];
    else s += h[(Math.random() * 16) | 0];
  }
  return s;
}

// Hạng mục công việc: số lượng = 1, đơn giá = chi phí (mô hình dữ liệu mục 7)
export function lineAmount(l: Pick<DraftLine, 'kind' | 'quantity' | 'unit_price'>): number {
  const q = l.kind === 'task' ? 1 : l.quantity;
  return Math.round(q * l.unit_price);
}
export function quoteTotal(lines: Pick<DraftLine, 'kind' | 'quantity' | 'unit_price'>[]): number {
  return lines.reduce((sum, l) => sum + lineAmount(l), 0);
}

export function validateQuoteDraft(d: QuoteDraft): { ok: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!d.diagnosis.trim()) errors.diagnosis = 'Vui lòng nhập chẩn đoán';
  const tasks = d.lines.filter((l) => l.kind === 'task');
  if (tasks.length < 1) errors.tasks = 'Cần ít nhất 1 hạng mục công việc';
  d.lines.forEach((l, i) => {
    if (!l.name.trim()) errors[`line_${i}_name`] = 'Nhập tên';
    if (!Number.isFinite(l.unit_price) || l.unit_price < 0) errors[`line_${i}_price`] = 'Giá không hợp lệ';
    if (l.kind === 'part' && (!Number.isInteger(l.quantity) || l.quantity < 1)) errors[`line_${i}_qty`] = 'Số lượng không hợp lệ';
  });
  return { ok: Object.keys(errors).length === 0, errors };
}

export type LineDiffState = 'new' | 'changed' | 'unchanged';
export interface QuoteDiff {
  lines: { line: QuoteLine; state: LineDiffState }[];
  removed: QuoteLine[];
  diagnosisChanged: boolean;
  hasChanges: boolean;
}

// Highlight so sánh với phiên bản liền trước đã gửi cho khách (U-13)
export function diffQuote(
  prev: { diagnosis: string; lines: QuoteLine[] } | null,
  next: { diagnosis: string; lines: QuoteLine[] },
): QuoteDiff {
  if (!prev) {
    return { lines: next.lines.map((line) => ({ line, state: 'unchanged' as const })), removed: [], diagnosisChanged: false, hasChanges: false };
  }
  const prevByKey = new Map(prev.lines.map((l) => [l.line_key, l]));
  const nextKeys = new Set(next.lines.map((l) => l.line_key));
  const lines = next.lines.map((line) => {
    const old = prevByKey.get(line.line_key);
    let state: LineDiffState = 'unchanged';
    if (!old) state = 'new';
    else if (old.name !== line.name || old.quantity !== line.quantity || old.unit_price !== line.unit_price || old.kind !== line.kind) state = 'changed';
    return { line, state };
  });
  const removed = prev.lines.filter((l) => !nextKeys.has(l.line_key));
  const diagnosisChanged = prev.diagnosis.trim() !== next.diagnosis.trim();
  const hasChanges = diagnosisChanged || removed.length > 0 || lines.some((l) => l.state !== 'unchanged');
  return { lines, removed, diagnosisChanged, hasChanges };
}

export function toDraft(q: { diagnosis: string; lines: QuoteLine[] }): QuoteDraft {
  return {
    diagnosis: q.diagnosis,
    lines: q.lines.map((l) => ({ line_key: l.line_key, kind: l.kind, name: l.name, quantity: l.quantity, unit_price: l.unit_price })),
  };
}

// Có thay đổi so với phiếu đã gửi hay không (bản nháp M-11)
export function draftDiffers(draft: QuoteDraft, base: QuoteDraft | null): boolean {
  if (!base) return true;
  if (draft.diagnosis.trim() !== base.diagnosis.trim()) return true;
  if (draft.lines.length !== base.lines.length) return true;
  return draft.lines.some((l, i) => {
    const b = base.lines[i];
    return l.line_key !== b.line_key || l.name !== b.name || l.quantity !== b.quantity || l.unit_price !== b.unit_price || l.kind !== b.kind;
  });
}
