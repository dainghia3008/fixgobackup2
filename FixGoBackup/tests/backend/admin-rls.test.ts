import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  admin, baseLocation, call, cleanupAll, configured, purgeLeftovers, dispatchOrder, expectFail, makeAdmin, makeCustomer, makeMechanic,
  offset, profilePayload, requestArgs, setupSelected, createUser,
} from './helpers';

const d = configured ? describe : describe.skip;
beforeAll(async () => { if (configured) await purgeLeftovers(); });
afterEach(async () => { if (configured) await cleanupAll(); }); // mỗi bài kiểm thử dọn dữ liệu của mình

d('Hồ sơ thợ & duyệt hồ sơ (BR-16)', () => {
  it('đăng ký → chờ duyệt → admin duyệt; thay đổi hồ sơ chỉ có hiệu lực sau khi duyệt', async () => {
    const m = await createUser('m');
    await call(m.client, 'ensure_mechanic');
    const a = await makeAdmin();

    await expectFail(m.client, 'submit_mechanic_profile', { p_payload: profilePayload({ id_number: '12345' }) }, 'INVALID_PROFILE');
    await expectFail(m.client, 'submit_mechanic_profile', { p_payload: profilePayload({ id_full_name: 'nguyễn văn a' }) }, 'INVALID_PROFILE');
    await expectFail(m.client, 'submit_mechanic_profile', { p_payload: profilePayload({ skills: [] }) }, 'INVALID_PROFILE');
    await expectFail(m.client, 'submit_mechanic_profile', { p_payload: profilePayload({ birth_date: '2015-01-01' }) }, 'INVALID_PROFILE');

    const s1 = await call(m.client, 'submit_mechanic_profile', { p_payload: profilePayload() });
    expect(s1.profile_status).toBe('pending');
    await expectFail(m.client, 'set_presence', { p_online: true, p_lat: 10.77, p_lng: 106.7 }, 'NOT_APPROVED');

    await expectFail(m.client, 'admin_review_profile', { p_mechanic_id: m.id, p_approve: true }, 'FORBIDDEN'); // thợ không tự duyệt
    await call(a.client, 'admin_review_profile', { p_mechanic_id: m.id, p_approve: false, p_reason: 'Ảnh mờ' });
    let st = await call(m.client, 'mechanic_state');
    expect(st.mechanic.profile_status).toBe('rejected');
    expect(st.mechanic.review_note).toBe('Ảnh mờ');

    await call(m.client, 'submit_mechanic_profile', { p_payload: profilePayload() }); // gửi lại sau khi bị từ chối
    await call(a.client, 'admin_review_profile', { p_mechanic_id: m.id, p_approve: true });
    st = await call(m.client, 'mechanic_state');
    expect(st.mechanic.profile_status).toBe('approved');
    await call(m.client, 'set_presence', { p_online: true, p_lat: 10.77, p_lng: 106.7 });

    // thay đổi hồ sơ: thông tin cũ vẫn hiện hành, bản mới chờ duyệt
    await call(m.client, 'submit_mechanic_profile', { p_payload: profilePayload({ full_name: 'Tên Mới', phone: '0912345678' }) });
    st = await call(m.client, 'mechanic_state');
    expect(st.mechanic.profile_status).toBe('approved');
    expect(st.mechanic.full_name).toBe('Nguyễn Văn Thợ');
    expect(st.mechanic.pending_changes.full_name).toBe('Tên Mới');

    await call(a.client, 'admin_review_profile', { p_mechanic_id: m.id, p_approve: false, p_reason: 'Không rõ' }); // từ chối thay đổi
    st = await call(m.client, 'mechanic_state');
    expect(st.mechanic.full_name).toBe('Nguyễn Văn Thợ');
    expect(st.mechanic.pending_changes).toBeNull();

    await call(m.client, 'submit_mechanic_profile', { p_payload: profilePayload({ full_name: 'Tên Mới' }) });
    await call(a.client, 'admin_review_profile', { p_mechanic_id: m.id, p_approve: true }); // duyệt thay đổi
    st = await call(m.client, 'mechanic_state');
    expect(st.mechanic.full_name).toBe('Tên Mới');
    expect(st.mechanic.pending_changes).toBeNull();
  });
});

d('Khóa tài khoản thợ (A-04) & khiếu nại (A-07)', () => {
  it('khóa: Offline, gỡ đề xuất, không bật Online được, không ảnh hưởng đơn đã chốt; mở khóa', async () => {
    const at = baseLocation();
    const a = await makeAdmin();
    const customer = await makeCustomer();
    const m = await makeMechanic({ at: offset(at, 300, 0), online: true });
    const order = await call(customer.client, 'create_rescue_request', requestArgs(at));
    await dispatchOrder(order.id);
    await call(m.client, 'accept_dispatch', { p_order_id: order.id });
    await call(m.client, 'submit_proposal', { p_order_id: order.id, p_assessment: 'ok', p_price_min: 1, p_price_max: 2, p_eta_minutes: 5 });
    expect((await call(customer.client, 'customer_state')).proposals).toHaveLength(1);

    await expectFail(customer.client, 'admin_set_lock', { p_mechanic_id: m.id, p_locked: true }, 'FORBIDDEN');
    await call(a.client, 'admin_set_lock', { p_mechanic_id: m.id, p_locked: true });
    expect((await call(customer.client, 'customer_state')).proposals).toEqual([]);
    const st = await call(m.client, 'mechanic_state');
    expect(st.mechanic.account_status).toBe('locked');
    expect(st.mechanic.presence).toBe('offline');
    await expectFail(m.client, 'set_presence', { p_online: true, p_lat: at.lat, p_lng: at.lng }, 'ACCOUNT_LOCKED');
    expect((await call(customer.client, 'customer_state')).order.status).toBe('searching'); // yêu cầu của khách vẫn tiếp tục

    await call(a.client, 'admin_set_lock', { p_mechanic_id: m.id, p_locked: false });
    await call(m.client, 'set_presence', { p_online: true, p_lat: at.lat, p_lng: at.lng });
  });

  it('khóa thợ đang có đơn đã chốt: đơn vẫn tiếp tục', async () => {
    const s = await setupSelected();
    const a = await makeAdmin();
    await call(a.client, 'admin_set_lock', { p_mechanic_id: s.mechanic.id, p_locked: true });
    expect((await call(s.mechanic.client, 'start_travel', { p_order_id: s.orderId })).status).toBe('traveling');
  });

  it('khách báo cáo thợ → admin xem nhật ký đơn và ghi nhận kết quả (BR-10, BR-11)', async () => {
    const s = await setupSelected();
    const a = await makeAdmin();
    const rid = await call(s.customer.client, 'create_report', { p_order_id: s.orderId, p_kind: 'rescue_issue', p_content: 'Thợ đòi thêm tiền' });
    await expectFail(s.mechanic.client, 'create_report', { p_order_id: s.orderId, p_kind: 'mechanic', p_content: 'x' }, 'ORDER_NOT_FOUND'); // chỉ khách được báo cáo
    await expectFail(s.customer.client, 'create_report', { p_order_id: s.orderId, p_kind: 'mechanic', p_content: '  ' }, 'INVALID_INPUT');

    const log = await call(a.client, 'admin_order_log', { p_order_id: s.orderId });
    expect(log.order.id).toBe(s.orderId);
    expect(log.proposals).toHaveLength(1);
    expect(log.events.map((e: any) => e.to)).toEqual(['searching', 'selected']);
    await expectFail(s.customer.client, 'admin_order_log', { p_order_id: s.orderId }, 'FORBIDDEN');

    await call(a.client, 'admin_resolve_report', { p_report_id: rid, p_resolution: 'Đã nhắc nhở thợ', p_lock_mechanic: true });
    const { data: r } = await admin.from('reports').select('status, resolution').eq('id', rid).single();
    expect(r).toEqual({ status: 'resolved', resolution: 'Đã nhắc nhở thợ' });
    const { data: m } = await admin.from('mechanics').select('account_status').eq('id', s.mechanic.id).single();
    expect(m?.account_status).toBe('locked');
  });
});

d('Bảo mật dữ liệu (RLS & quyền hàm)', () => {
  it('khách không đọc được bảng mechanics (CCCD) và không gọi được hàm nội bộ / phân phối', async () => {
    const s = await setupSelected();
    const { data } = await s.customer.client.from('mechanics').select('id_number, id_front');
    expect(data).toEqual([]);
    const { error } = await s.customer.client.rpc('dispatch_insert', { p_order_id: s.orderId, p_items: [] });
    expect(error).toBeTruthy();
    const { error: e2 } = await s.customer.client.rpc('_emit', { p_user: s.customer.id, p_event: 'X', p_payload: {} });
    expect(error && e2).toBeTruthy();
  });

  it('không ghi trực tiếp được vào bảng; thợ khác không đụng được đơn của thợ được chọn', async () => {
    const s = await setupSelected();
    const upd = await s.customer.client.from('orders').update({ status: 'completed' }).eq('id', s.orderId).select();
    expect(upd.error || (upd.data ?? []).length === 0).toBeTruthy();
    const other = await makeMechanic({ at: s.at, online: true });
    await expectFail(other.client, 'start_travel', { p_order_id: s.orderId }, 'FORBIDDEN');
    await expectFail(other.client, 'submit_quote', { p_order_id: s.orderId, p_diagnosis: 'x', p_lines: [] }, 'FORBIDDEN');
    const stranger = await makeCustomer();
    await expectFail(stranger.client, 'order_detail', { p_order_id: s.orderId }, 'FORBIDDEN');
    await expectFail(stranger.client, 'select_mechanic', { p_order_id: s.orderId, p_proposal_id: s.proposal.id }, 'FORBIDDEN');
  });
});
