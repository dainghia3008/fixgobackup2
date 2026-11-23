import { describe, it, expect } from 'vitest';
import { customerTarget, mechanicTarget } from '../../shared/core/routing';

const base = { authed: true, profileLoaded: true, needsName: false, hasProposals: false };
describe('Điều hướng app Khách theo trạng thái đơn', () => {
  it('chưa đăng nhập → U-01', () => expect(customerTarget({ ...base, authed: false, order: null })).toBe('/(auth)/login'));
  it('chưa tải hồ sơ → chờ', () => expect(customerTarget({ ...base, profileLoaded: false, order: null })).toBeNull());
  it('email lần đầu chưa có họ tên → U-02', () => expect(customerTarget({ ...base, needsName: true, order: null })).toBe('/(auth)/name'));
  it('không có đơn → U-03', () => expect(customerTarget({ ...base, order: null })).toBe('/(tabs)/home'));
  it('đang tìm thợ: U-06 khi chưa có đề xuất, U-08 khi có', () => {
    const order = { status: 'searching' as const, review_status: 'none' as const };
    expect(customerTarget({ ...base, order })).toBe('/order/searching');
    expect(customerTarget({ ...base, order, hasProposals: true })).toBe('/order/proposals');
  });
  it.each([
    ['selected', '/order/tracking'], ['traveling', '/order/tracking'], ['arrived', '/order/arrived'],
    ['quote_pending', '/order/quote'], ['repairing', '/order/repair'],
  ] as const)('%s → %s', (status, route) => {
    expect(customerTarget({ ...base, order: { status, review_status: 'none' } })).toBe(route);
  });
  it('chờ thanh toán: chưa đánh giá → U-16; đã bỏ qua/đã gửi → U-03 (BR-12)', () => {
    expect(customerTarget({ ...base, order: { status: 'awaiting_payment', review_status: 'none' } })).toBe('/order/review');
    expect(customerTarget({ ...base, order: { status: 'awaiting_payment', review_status: 'skipped' } })).toBe('/(tabs)/home');
    expect(customerTarget({ ...base, order: { status: 'awaiting_payment', review_status: 'submitted' } })).toBe('/(tabs)/home');
  });
  it('thợ xác nhận thanh toán khi khách đang ở U-16 → vẫn ở U-16', () => {
    expect(customerTarget({ ...base, order: { status: 'completed', review_status: 'none' } })).toBe('/order/review');
  });
});

describe('Điều hướng app Thợ', () => {
  const m = { authed: true, loaded: true, profileStatus: 'approved' as const, accountStatus: 'active' as const, orderStatus: null };
  it('chưa có hồ sơ → M-02; chờ duyệt/bị từ chối → M-03; đã duyệt → M-04', () => {
    expect(mechanicTarget({ ...m, profileStatus: 'none' })).toBe('/register');
    expect(mechanicTarget({ ...m, profileStatus: 'pending' })).toBe('/pending');
    expect(mechanicTarget({ ...m, profileStatus: 'rejected' })).toBe('/pending');
    expect(mechanicTarget(m)).toBe('/(tabs)/home');
  });
  it('bị khóa và không có đơn → thông báo khóa', () => {
    expect(mechanicTarget({ ...m, accountStatus: 'locked' })).toBe('/locked');
  });
  it('đơn đã chốt được ưu tiên, kể cả khi bị khóa', () => {
    expect(mechanicTarget({ ...m, accountStatus: 'locked', orderStatus: 'traveling' })).toBe('/order/travel');
  });
  it.each([
    ['selected', '/order/selected'], ['traveling', '/order/travel'], ['arrived', '/order/quote'],
    ['quote_pending', '/order/quote'], ['repairing', '/order/repair'], ['awaiting_payment', '/order/payment'],
  ] as const)('%s → %s', (orderStatus, route) => expect(mechanicTarget({ ...m, orderStatus })).toBe(route));
});
