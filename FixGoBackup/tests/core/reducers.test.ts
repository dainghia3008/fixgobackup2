import { describe, it, expect } from 'vitest';
import {
  applyCustomerEvent, applyMechanicEvent, hydrateCustomer, hydrateMechanic, initialCustomer, initialMechanic,
} from '../../shared/core/reducers';
import type { OrderDTO, ProposalDTO, QuoteDTO, DispatchItem, MechanicSelf } from '../../shared/core/types';

const order = (o: Partial<OrderDTO> = {}): OrderDTO => ({
  id: 'o1', status: 'searching', customer_id: 'c1', mechanic_id: null, lat: 1, lng: 1, address: 'x', incident_types: ['flat_tire'],
  vehicle_model: 'Vision', license_plate: '59X1', description: 'd', media: [], created_at: '', selected_at: null, completed_at: null,
  cancelled_by: null, cancel_reason: null, review_status: 'none', current_quote_version: 0, customer: null, mechanic: null, proposal: null, ...o,
});
const prop = (id: string, mid: string): ProposalDTO => ({
  id, order_id: 'o1', mechanic: { id: mid, full_name: mid, face_photo: null, rating_avg: 5, rating_count: 1, completed_count: 1 },
  assessment: 'a', price_min: 1, price_max: 2, eta_minutes: 5, status: 'available', created_at: '',
});
const quote = (version: number): QuoteDTO => ({ id: 'q' + version, order_id: 'o1', version, diagnosis: 'd', status: 'sent', total: 10, sent_at: '', confirmed_at: null, lines: [] });
const start = { ...initialCustomer, order: order() };

describe('Khách – sự kiện real-time (mục 5.3)', () => {
  it('PROPOSAL_NEW thêm thợ vào danh sách, không trùng lặp một thợ', () => {
    let s = applyCustomerEvent(start, 'PROPOSAL_NEW', { order_id: 'o1', proposal: prop('p1', 'm1') });
    s = applyCustomerEvent(s, 'PROPOSAL_NEW', { order_id: 'o1', proposal: prop('p1', 'm1') });
    s = applyCustomerEvent(s, 'PROPOSAL_NEW', { order_id: 'o1', proposal: prop('p2', 'm2') });
    expect(s.proposals.map((p) => p.id)).toEqual(['p1', 'p2']);
  });
  it('sự kiện của đơn khác bị bỏ qua (BR-12: đơn cũ không ảnh hưởng yêu cầu mới)', () => {
    const s = applyCustomerEvent(start, 'PROPOSAL_NEW', { order_id: 'OLD', proposal: prop('p1', 'm1') });
    expect(s).toBe(start);
    expect(applyCustomerEvent(start, 'MECHANIC_ARRIVED', { order_id: 'OLD' })).toBe(start);
  });
  it('MECHANIC_TAKEN / MECHANIC_OFFLINE / ACCOUNT_LOCKED gỡ thợ khỏi danh sách', () => {
    const withProps = { ...start, proposals: [prop('p1', 'm1'), prop('p2', 'm2'), prop('p3', 'm3')] };
    let s = applyCustomerEvent(withProps, 'MECHANIC_TAKEN', { order_id: 'o1', mechanic_id: 'm1', proposal_id: 'p1' });
    s = applyCustomerEvent(s, 'MECHANIC_OFFLINE', { order_id: 'o1', mechanic_id: 'm2', proposal_id: 'p2' });
    expect(s.proposals.map((p) => p.id)).toEqual(['p3']);
    s = applyCustomerEvent(s, 'ACCOUNT_LOCKED', { order_id: 'o1', mechanic_id: 'm3', proposal_id: 'p3' });
    expect(s.proposals).toEqual([]);
  });
  it('ACCEPTANCE_COUNT_CHANGED cập nhật số thợ đã chấp nhận', () => {
    expect(applyCustomerEvent(start, 'ACCEPTANCE_COUNT_CHANGED', { order_id: 'o1', count: 3 }).acceptedCount).toBe(3);
  });
  it('MECHANIC_SELECTED chuyển đơn sang đã chốt và xóa danh sách đề xuất', () => {
    const s = applyCustomerEvent({ ...start, proposals: [prop('p1', 'm1')] }, 'MECHANIC_SELECTED', { order: order({ status: 'selected', mechanic_id: 'm1' }) });
    expect(s.order?.status).toBe('selected');
    expect(s.proposals).toEqual([]);
  });
  it('luồng đầy đủ: đến nơi → gửi phiếu → xác nhận → hoàn tất → thanh toán', () => {
    let s = applyCustomerEvent(start, 'MECHANIC_SELECTED', { order: order({ status: 'selected', mechanic_id: 'm1' }) });
    s = applyCustomerEvent(s, 'TRAVEL_STARTED', { order_id: 'o1' });
    expect(s.order?.status).toBe('traveling');
    s = applyCustomerEvent(s, 'MECHANIC_ARRIVED', { order_id: 'o1' });
    expect(s.order?.status).toBe('arrived');
    s = applyCustomerEvent(s, 'QUOTE_SUBMITTED', { order_id: 'o1', quote: quote(1), previous: null });
    expect(s.order?.status).toBe('quote_pending');
    expect(s.order?.current_quote_version).toBe(1);
    expect(s.notice?.text ?? '').not.toMatch(/gửi lại phiếu/); // phiên bản đầu không cần thông báo "gửi lại"
    s = applyCustomerEvent(s, 'QUOTE_CONFIRMED', { order_id: 'o1', version: 1 });
    expect(s.order?.status).toBe('repairing');
    expect(s.quotes[0].status).toBe('confirmed');
    s = applyCustomerEvent(s, 'REPAIR_COMPLETED', { order_id: 'o1' });
    expect(s.order?.status).toBe('awaiting_payment');
    s = applyCustomerEvent(s, 'PAYMENT_CONFIRMED', { order_id: 'o1' });
    expect(s.order?.status).toBe('completed');
  });
  it('gửi lại phiếu khi đang sửa: về chờ xác nhận, có thông báo, giữ phiên bản trước để highlight', () => {
    const repairing = { ...start, order: order({ status: 'repairing', current_quote_version: 1 }), quotes: [{ ...quote(1), status: 'confirmed' as const }] };
    const s = applyCustomerEvent(repairing, 'QUOTE_SUBMITTED', { order_id: 'o1', quote: quote(2), previous: repairing.quotes[0] });
    expect(s.order?.status).toBe('quote_pending');
    expect(s.quotes.map((q) => q.version)).toEqual([2, 1]);
    expect(s.notice?.text).toMatch(/gửi lại phiếu/);
  });
  it('sự kiện cũ không ghi đè trạng thái mới', () => {
    const repairing = { ...start, order: order({ status: 'repairing' }) };
    expect(applyCustomerEvent(repairing, 'MECHANIC_ARRIVED', { order_id: 'o1' }).order?.status).toBe('repairing');
    expect(applyCustomerEvent(repairing, 'TRAVEL_STARTED', { order_id: 'o1' }).order?.status).toBe('repairing');
  });
  it('thợ hủy đơn → xóa đơn hiện tại và báo cho khách', () => {
    const s = applyCustomerEvent({ ...start, order: order({ status: 'traveling' }) }, 'ORDER_CANCELLED_BY_MECHANIC', { order_id: 'o1' });
    expect(s.order).toBeNull();
    expect(s.notice?.tone).toBe('warn');
  });
  it('PAYMENT_CONFIRMED của đơn cũ không đổi đơn hiện tại', () => {
    const s = applyCustomerEvent(start, 'PAYMENT_CONFIRMED', { order_id: 'OLD' });
    expect(s.order?.id).toBe('o1');
    expect(s.order?.status).toBe('searching');
    expect(s.historyDirty).toBe(1);
  });
  it('đồng bộ lại không đá khách khỏi U-16 khi đơn đã Hoàn thành mà chưa đánh giá', () => {
    const inReview = { ...initialCustomer, order: order({ status: 'completed', review_status: 'none' }) };
    expect(hydrateCustomer(inReview, { order: null, proposals: [], accepted_count: 0, quotes: [] })).toBe(inReview);
  });
  it('đồng bộ lại thay thế toàn bộ trạng thái bằng dữ liệu server', () => {
    const s = hydrateCustomer(start, { order: order({ status: 'arrived' }), proposals: [], accepted_count: 0, quotes: [] });
    expect(s.order?.status).toBe('arrived');
  });
});

const dispatch = (id: string): DispatchItem => ({
  order_id: id, status: 'sent', route_distance_m: 1200, draft: null, ai_result: null, created_at: '',
  order: { id, lat: 1, lng: 1, address: 'a', incident_types: ['flat_tire'], vehicle_model: 'v', license_plate: 'p', description: 'd', media: [], created_at: '' },
});
const me = { id: 'm1', profile_status: 'approved', account_status: 'active', presence: 'online' } as MechanicSelf;
const mstart = { ...initialMechanic, loaded: true, mechanic: me };

describe('Thợ – sự kiện real-time', () => {
  it('REQUEST_NEW thêm vào danh sách sự cố, không trùng', () => {
    let { state } = applyMechanicEvent(mstart, 'REQUEST_NEW', { dispatch: dispatch('a') });
    ({ state } = applyMechanicEvent(state, 'REQUEST_NEW', { dispatch: dispatch('a') }));
    ({ state } = applyMechanicEvent(state, 'REQUEST_NEW', { dispatch: dispatch('b') }));
    expect(state.dispatches.map((d) => d.order_id)).toEqual(['b', 'a']);
  });
  it('BR-13: thợ đã được chốt không nhận yêu cầu mới', () => {
    const busy = { ...mstart, order: order({ status: 'traveling' }) };
    expect(applyMechanicEvent(busy, 'REQUEST_NEW', { dispatch: dispatch('a') }).state.dispatches).toEqual([]);
  });
  it('tài khoản bị khóa không nhận yêu cầu mới', () => {
    const locked = { ...mstart, mechanic: { ...me, account_status: 'locked' as const } };
    expect(applyMechanicEvent(locked, 'REQUEST_NEW', { dispatch: dispatch('a') }).state.dispatches).toEqual([]);
  });
  it('REQUEST_CLOSED / REQUEST_CANCELLED gỡ yêu cầu khỏi danh sách (BR-06)', () => {
    const s0 = { ...mstart, dispatches: [dispatch('a'), dispatch('b')] };
    expect(applyMechanicEvent(s0, 'REQUEST_CLOSED', { order_id: 'a' }).state.dispatches.map((d) => d.order_id)).toEqual(['b']);
    expect(applyMechanicEvent(s0, 'REQUEST_CANCELLED', { order_id: 'b', was_selected: false }).state.dispatches.map((d) => d.order_id)).toEqual(['a']);
  });
  it('MECHANIC_SELECTED ưu tiên tức thì: xóa mọi yêu cầu khác (M-08)', () => {
    const s0 = { ...mstart, dispatches: [dispatch('a'), dispatch('b')] };
    const { state } = applyMechanicEvent(s0, 'MECHANIC_SELECTED', { order: order({ id: 'a', status: 'selected', mechanic_id: 'm1' }) });
    expect(state.order?.id).toBe('a');
    expect(state.dispatches).toEqual([]);
  });
  it('khách hủy đơn đã chốt → thợ thoát khỏi đơn', () => {
    const s0 = { ...mstart, order: order({ status: 'traveling', mechanic_id: 'm1' }) };
    const { state } = applyMechanicEvent(s0, 'REQUEST_CANCELLED', { order_id: 'o1', was_selected: true });
    expect(state.order).toBeNull();
    expect(state.notice?.text).toMatch(/hủy/);
  });
  it('khách xác nhận phiếu → thợ sang đang sửa; hoàn tất → chờ thanh toán', () => {
    let { state } = applyMechanicEvent({ ...mstart, order: order({ status: 'quote_pending' }) }, 'QUOTE_CONFIRMED', { order_id: 'o1', version: 1 });
    expect(state.order?.status).toBe('repairing');
    ({ state } = applyMechanicEvent(state, 'REPAIR_COMPLETED', { order_id: 'o1' }));
    expect(state.order?.status).toBe('awaiting_payment');
  });
  it('ACCOUNT_LOCKED: Offline, xóa danh sách, nhưng không động đến đơn đã chốt', () => {
    const s0 = { ...mstart, dispatches: [dispatch('a')], order: order({ status: 'traveling' }) };
    const { state } = applyMechanicEvent(s0, 'ACCOUNT_LOCKED', {});
    expect(state.mechanic?.account_status).toBe('locked');
    expect(state.mechanic?.presence).toBe('offline');
    expect(state.dispatches).toEqual([]);
    expect(state.order?.status).toBe('traveling');
  });
  it('PROFILE_REVIEWED yêu cầu tải lại hồ sơ', () => {
    const r = applyMechanicEvent(mstart, 'PROFILE_REVIEWED', { approved: false, reason: 'Ảnh mờ' });
    expect(r.refresh).toBe(true);
    expect(r.state.notice?.text).toContain('Ảnh mờ');
  });
  it('hydrate đặt cờ loaded', () => {
    const s = hydrateMechanic(initialMechanic, { mechanic: me, dispatches: [], order: null, quotes: [] });
    expect(s.loaded).toBe(true);
  });
});
