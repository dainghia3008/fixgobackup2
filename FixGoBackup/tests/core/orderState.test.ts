import { describe, it, expect } from 'vitest';
import { canTransition, customerCanCancel, mechanicCanCancel, blocksNewRequest, chatOpen, isFinal } from '../../shared/core/orderState';
import type { OrderStatus } from '../../shared/core/types';

describe('Vòng đời đơn (mục 2.2)', () => {
  it('đi đúng luồng chính', () => {
    const flow: OrderStatus[] = ['searching', 'selected', 'traveling', 'arrived', 'quote_pending', 'repairing', 'awaiting_payment', 'completed'];
    for (let i = 0; i < flow.length - 1; i++) expect(canTransition(flow[i], flow[i + 1])).toBe(true);
  });
  it('gửi lại phiếu khi đang sửa chữa → quay về chờ xác nhận', () => {
    expect(canTransition('repairing', 'quote_pending')).toBe(true);
  });
  it('không cho lùi trạng thái (sự kiện cũ không ghi đè trạng thái mới)', () => {
    expect(canTransition('repairing', 'arrived')).toBe(false);
    expect(canTransition('completed', 'awaiting_payment')).toBe(false);
    expect(canTransition('traveling', 'selected')).toBe(false);
  });
  it('trạng thái cuối không chuyển tiếp', () => {
    expect(canTransition('completed', 'cancelled')).toBe(false);
    expect(canTransition('cancelled', 'searching')).toBe(false);
    expect(isFinal('completed') && isFinal('cancelled')).toBe(true);
  });
  it('trạng thái 7 chỉ đi tới Hoàn thành, không hủy được', () => {
    expect(canTransition('awaiting_payment', 'cancelled')).toBe(false);
  });
});

describe('Ma trận hủy đơn (mục 2.3)', () => {
  it('khách', () => {
    expect(customerCanCancel('searching')).toBe(true);
    expect(customerCanCancel('selected')).toBe(true);
    expect(customerCanCancel('traveling')).toBe(true);
    expect(customerCanCancel('arrived')).toBe(true);
    expect(customerCanCancel('quote_pending')).toBe(true);
    expect(customerCanCancel('repairing')).toBe(false);
    expect(customerCanCancel('awaiting_payment')).toBe(false);
    expect(customerCanCancel('completed')).toBe(false);
  });
  it('thợ', () => {
    expect(mechanicCanCancel('searching')).toBe(false);
    expect(mechanicCanCancel('selected')).toBe(false);
    expect(mechanicCanCancel('traveling')).toBe(true);
    expect(mechanicCanCancel('arrived')).toBe(true);
    expect(mechanicCanCancel('quote_pending')).toBe(true);
    expect(mechanicCanCancel('repairing')).toBe(true);
    expect(mechanicCanCancel('awaiting_payment')).toBe(false);
  });
});

describe('BR-12 – đơn chặn tạo yêu cầu mới', () => {
  it('trạng thái 1–6 chặn', () => {
    for (const s of ['searching', 'selected', 'traveling', 'arrived', 'quote_pending', 'repairing'] as OrderStatus[]) {
      expect(blocksNewRequest(s, 'none')).toBe(true);
    }
  });
  it('trạng thái 7 chỉ chặn khi chưa gửi/bỏ qua đánh giá', () => {
    expect(blocksNewRequest('awaiting_payment', 'none')).toBe(true);
    expect(blocksNewRequest('awaiting_payment', 'skipped')).toBe(false);
    expect(blocksNewRequest('awaiting_payment', 'submitted')).toBe(false);
  });
  it('trạng thái 8 và Đã hủy không chặn', () => {
    expect(blocksNewRequest('completed', 'none')).toBe(false);
    expect(blocksNewRequest('cancelled', 'none')).toBe(false);
  });
});

describe('BR-15 – nhắn tin', () => {
  it('mở từ khi chốt thợ đến hết sửa chữa', () => {
    for (const s of ['selected', 'traveling', 'arrived', 'quote_pending', 'repairing'] as OrderStatus[]) expect(chatOpen(s)).toBe(true);
    for (const s of ['searching', 'awaiting_payment', 'completed', 'cancelled'] as OrderStatus[]) expect(chatOpen(s)).toBe(false);
  });
});
