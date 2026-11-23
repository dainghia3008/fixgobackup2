import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  admin, baseLocation, call, cleanupAll, configured, purgeLeftovers, dispatchOrder, expectFail, goodQuote, makeAdmin, makeCustomer, makeMechanic,
  offset, requestArgs, setupSelected,
} from './helpers';

// Các bài kiểm thử tích hợp chạy trên dự án Supabase DÙNG THỬ (xem README → "Chạy kiểm thử").
const d = configured ? describe : describe.skip;

beforeAll(async () => { if (configured) await purgeLeftovers(); });
afterEach(async () => { if (configured) await cleanupAll(); }); // mỗi bài kiểm thử dọn dữ liệu của mình

d('BR-12 – tạo yêu cầu', () => {
  it('tạo yêu cầu hợp lệ → trạng thái "searching"; yêu cầu thứ hai bị chặn; hủy xong tạo lại được', async () => {
    const at = baseLocation();
    const c = await makeCustomer();
    const o = await call(c.client, 'create_rescue_request', requestArgs(at));
    expect(o.status).toBe('searching');
    expect(o.license_plate).toBe('59X1-123.45');
    await expectFail(c.client, 'create_rescue_request', requestArgs(at), 'ACTIVE_ORDER_EXISTS');
    await call(c.client, 'cancel_order_by_customer', { p_order_id: o.id });
    const o2 = await call(c.client, 'create_rescue_request', requestArgs(at));
    expect(o2.id).not.toBe(o.id);
  });

  it('từ chối dữ liệu không hợp lệ', async () => {
    const c = await makeCustomer();
    await expectFail(c.client, 'create_rescue_request', requestArgs(baseLocation(), { p_incident_types: [] }), 'INVALID_INPUT');
    await expectFail(c.client, 'create_rescue_request', requestArgs(baseLocation(), { p_incident_types: ['xyz'] }), 'INVALID_INPUT');
    await expectFail(c.client, 'create_rescue_request', requestArgs(baseLocation(), { p_description: '  ' }), 'INVALID_INPUT');
  });

  it('khách khác không đọc được đơn của người này (RLS)', async () => {
    const a = await makeCustomer();
    const b = await makeCustomer();
    const o = await call(a.client, 'create_rescue_request', requestArgs(baseLocation()));
    const { data } = await b.client.from('orders').select('id').eq('id', o.id);
    expect(data).toEqual([]);
  });
});

d('Phân phối (BR-01, BR-14)', () => {
  it('chỉ thợ Online + đã duyệt + chưa khóa + trong bán kính nhận yêu cầu; thợ Online sau đó không nhận', async () => {
    const at = baseLocation();
    const customer = await makeCustomer();
    const near = await makeMechanic({ at: offset(at, 400, 0), online: true });
    const offline = await makeMechanic({ at: offset(at, 300, 0), online: false });
    const pending = await makeMechanic({ at: offset(at, 300, 0), approved: false });
    const locked = await makeMechanic({ at: offset(at, 300, 0), online: true });
    const far = await makeMechanic({ at: offset(at, 9000, 0), online: true });
    await admin.from('mechanics').update({ presence: 'online', location: `SRID=4326;POINT(${at.lng} ${at.lat})`, location_at: new Date().toISOString() }).eq('id', pending.id);
    await call((await makeAdmin()).client, 'admin_set_lock', { p_mechanic_id: locked.id, p_locked: true });

    const order = await call(customer.client, 'create_rescue_request', requestArgs(at));
    const n = await dispatchOrder(order.id);
    expect(n).toBe(1);

    const { data: rows } = await admin.from('dispatches').select('mechanic_id').eq('order_id', order.id);
    expect(rows?.map((r) => r.mechanic_id)).toEqual([near.id]);
    for (const m of [offline, pending, locked, far]) expect(rows?.some((r) => r.mechanic_id === m.id)).toBe(false);

    // BR-14: thợ bật Online sau thời điểm phát không nhận yêu cầu này
    const late = await makeMechanic({ at: offset(at, 200, 0), online: true });
    const st = await call(late.client, 'mechanic_state');
    expect(st.dispatches).toEqual([]);

    // chỉ phát một lần
    await expectFail(admin, 'dispatch_insert', { p_order_id: order.id, p_items: [] }, 'DISPATCH_SKIPPED');

    const nearState = await call(near.client, 'mechanic_state');
    expect(nearState.dispatches.map((x: any) => x.order_id)).toEqual([order.id]);
    expect(nearState.dispatches[0].order.vehicle_model).toBe('Honda Vision');
  });

  it('thợ đã được chốt (BR-13) không nhận yêu cầu mới', async () => {
    const s = await setupSelected();
    const other = await makeCustomer();
    const o2 = await call(other.client, 'create_rescue_request', requestArgs(s.at));
    await dispatchOrder(o2.id);
    const { data } = await admin.from('dispatches').select('mechanic_id').eq('order_id', o2.id);
    expect(data?.some((r) => r.mechanic_id === s.mechanic.id)).toBe(false);
  });
});

d('Nhận yêu cầu, đề xuất sơ bộ, chốt thợ', () => {
  it('luồng đầy đủ: chấp nhận → đếm → đề xuất → khách thấy → chốt', async () => {
    const at = baseLocation();
    const customer = await makeCustomer();
    const m1 = await makeMechanic({ at: offset(at, 300, 0), online: true });
    const m2 = await makeMechanic({ at: offset(at, 500, 0), online: true });
    const order = await call(customer.client, 'create_rescue_request', requestArgs(at));
    await dispatchOrder(order.id);

    await expectFail(m1.client, 'submit_proposal', { p_order_id: order.id, p_assessment: 'x', p_price_min: 1, p_price_max: 2, p_eta_minutes: 5 }, 'NOT_ACCEPTED');
    await call(m1.client, 'accept_dispatch', { p_order_id: order.id });
    await call(m1.client, 'accept_dispatch', { p_order_id: order.id }); // mở lại không tăng số
    await call(m2.client, 'accept_dispatch', { p_order_id: order.id });
    let st = await call(customer.client, 'customer_state');
    expect(st.accepted_count).toBe(2);

    await call(m2.client, 'decline_dispatch', { p_order_id: order.id }); // từ chối sau khi chấp nhận → giảm
    st = await call(customer.client, 'customer_state');
    expect(st.accepted_count).toBe(1);

    await expectFail(m1.client, 'submit_proposal', { p_order_id: order.id, p_assessment: 'x', p_price_min: 200, p_price_max: 100, p_eta_minutes: 5 }, 'INVALID_INPUT');
    const prop = await call(m1.client, 'submit_proposal', { p_order_id: order.id, p_assessment: 'Thủng săm', p_price_min: 50000, p_price_max: 120000, p_eta_minutes: 12 });
    expect(prop.status).toBe('available');
    st = await call(customer.client, 'customer_state');
    expect(st.accepted_count).toBe(0); // đã gửi đề xuất → không còn "chờ đề xuất"
    expect(st.proposals).toHaveLength(1);
    expect(st.proposals[0].mechanic.full_name).toBe('Thợ Thử');
    expect(st.proposals[0].mechanic).not.toHaveProperty('id_number'); // không lộ CCCD

    const sel = await call(customer.client, 'select_mechanic', { p_order_id: order.id, p_proposal_id: prop.id });
    expect(sel.status).toBe('selected');
    expect(sel.mechanic_id).toBe(m1.id);
    const { data: mrow } = await admin.from('mechanics').select('current_order_id').eq('id', m1.id).single();
    expect(mrow?.current_order_id).toBe(order.id);
    await expectFail(customer.client, 'select_mechanic', { p_order_id: order.id, p_proposal_id: prop.id }, 'ORDER_NOT_SEARCHING');

    // thợ còn lại bị gỡ yêu cầu; thợ được chọn thấy đơn, không còn danh sách
    expect((await call(m2.client, 'mechanic_state')).dispatches).toEqual([]);
    const ms = await call(m1.client, 'mechanic_state');
    expect(ms.order.id).toBe(order.id);
    expect(ms.order.customer.full_name).toBe('Khách Thử');
    expect(ms.dispatches).toEqual([]);
  });

  it('đề xuất bị từ chối khi thợ Offline (chỉ gửi khi Online) và mất khả dụng khi thợ chuyển Offline', async () => {
    const at = baseLocation();
    const customer = await makeCustomer();
    const m = await makeMechanic({ at: offset(at, 300, 0), online: true });
    const order = await call(customer.client, 'create_rescue_request', requestArgs(at));
    await dispatchOrder(order.id);
    await call(m.client, 'accept_dispatch', { p_order_id: order.id });

    await call(m.client, 'set_presence', { p_online: false });
    await expectFail(m.client, 'submit_proposal', { p_order_id: order.id, p_assessment: 'x', p_price_min: 1, p_price_max: 2, p_eta_minutes: 5 }, 'MECHANIC_OFFLINE');
    // yêu cầu đã chấp nhận vẫn được giữ
    expect((await call(m.client, 'mechanic_state')).dispatches).toHaveLength(1);

    await call(m.client, 'set_presence', { p_online: true, p_lat: at.lat, p_lng: at.lng });
    const prop = await call(m.client, 'submit_proposal', { p_order_id: order.id, p_assessment: 'ok', p_price_min: 1, p_price_max: 2, p_eta_minutes: 5 });
    expect((await call(customer.client, 'customer_state')).proposals).toHaveLength(1);

    await call(m.client, 'set_presence', { p_online: false });
    expect((await call(customer.client, 'customer_state')).proposals).toHaveLength(0);
    await expectFail(customer.client, 'select_mechanic', { p_order_id: order.id, p_proposal_id: prop.id }, 'PROPOSAL_UNAVAILABLE');
    // bật Online lại không khôi phục đề xuất cũ
    await call(m.client, 'set_presence', { p_online: true, p_lat: at.lat, p_lng: at.lng });
    expect((await call(customer.client, 'customer_state')).proposals).toHaveLength(0);
  });
});

d('Chốt thợ đồng thời (mục 5.2, BR-03, BR-04)', () => {
  it('hai khách cùng chốt một thợ: đúng một người thành công; yêu cầu của người kia vẫn tiếp tục tìm thợ', async () => {
    const at = baseLocation();
    const mech = await makeMechanic({ at: offset(at, 200, 0), online: true });
    const c1 = await makeCustomer('Khách 1');
    const c2 = await makeCustomer('Khách 2');
    const o1 = await call(c1.client, 'create_rescue_request', requestArgs(at));
    const o2 = await call(c2.client, 'create_rescue_request', requestArgs(offset(at, 100, 100)));
    await dispatchOrder(o1.id);
    await dispatchOrder(o2.id);
    const p = (o: any) => call(mech.client, 'accept_dispatch', { p_order_id: o.id })
      .then(() => call(mech.client, 'submit_proposal', { p_order_id: o.id, p_assessment: 'ok', p_price_min: 1, p_price_max: 2, p_eta_minutes: 5 }));
    const [p1, p2] = await Promise.all([p(o1), p(o2)]);

    const results = await Promise.allSettled([
      call(c1.client, 'select_mechanic', { p_order_id: o1.id, p_proposal_id: p1.id }),
      call(c2.client, 'select_mechanic', { p_order_id: o2.id, p_proposal_id: p2.id }),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const bad = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(1);
    expect(bad[0].reason.message).toMatch(/^(MECHANIC_BUSY|PROPOSAL_UNAVAILABLE)/);

    const { data: orders } = await admin.from('orders').select('id, status, mechanic_id').in('id', [o1.id, o2.id]);
    expect(orders?.filter((o) => o.status === 'selected')).toHaveLength(1);
    expect(orders?.filter((o) => o.status === 'searching')).toHaveLength(1);
    const { data: m } = await admin.from('mechanics').select('current_order_id').eq('id', mech.id).single();
    expect(orders?.find((o) => o.status === 'selected')?.id).toBe(m?.current_order_id);

    const loser = orders?.find((o) => o.status === 'searching')!;
    const loserClient = loser.id === o1.id ? c1.client : c2.client;
    expect((await call(loserClient, 'customer_state')).proposals).toEqual([]); // đã bị gỡ (BR-03)
  });
});

d('Phiếu đề xuất, thanh toán, đánh giá (BR-07, BR-08, BR-09, BR-12, BR-15, BR-17)', () => {
  it('toàn bộ vòng đời đơn', async () => {
    const s = await setupSelected();
    const { customer, mechanic, orderId } = s;

    expect((await call(mechanic.client, 'start_travel', { p_order_id: orderId })).status).toBe('traveling');
    await call(mechanic.client, 'log_locations', { p_order_id: orderId, p_points: [{ lat: s.at.lat, lng: s.at.lng, t: Date.now() }] });
    expect((await call(mechanic.client, 'mark_arrived', { p_order_id: orderId })).status).toBe('arrived');

    // BR: server tự tính tiền, không tin client
    const q1 = goodQuote();
    const r1 = await call(mechanic.client, 'submit_quote', { p_order_id: orderId, p_diagnosis: q1.diagnosis, p_lines: q1.lines });
    expect(r1.quote.version).toBe(1);
    expect(r1.quote.total).toBe(170000);
    expect((await call(customer.client, 'customer_state')).order.status).toBe('quote_pending');

    await expectFail(mechanic.client, 'submit_quote', { p_order_id: orderId, p_diagnosis: 'x', p_lines: [] }, 'INVALID_QUOTE');
    await expectFail(mechanic.client, 'submit_quote', { p_order_id: orderId, p_diagnosis: 'x', p_lines: [{ ...q1.lines[1] }] }, 'INVALID_QUOTE'); // thiếu hạng mục công việc

    // thợ gửi lại trước khi khách xác nhận → v2; xác nhận v1 phải thất bại
    const q2 = { ...q1, lines: [q1.lines[0], { ...q1.lines[1], quantity: 3 }] };
    const r2 = await call(mechanic.client, 'submit_quote', { p_order_id: orderId, p_diagnosis: q2.diagnosis, p_lines: q2.lines });
    expect(r2.quote.version).toBe(2);
    expect(r2.previous.version).toBe(1);
    expect(r2.quote.total).toBe(80000 + 3 * 45000);
    await expectFail(customer.client, 'confirm_quote', { p_order_id: orderId, p_version: 1 }, 'QUOTE_SUPERSEDED');
    const st = await call(customer.client, 'customer_state');
    expect(st.quotes.map((q: any) => q.version)).toEqual([2, 1]);

    await call(customer.client, 'confirm_quote', { p_order_id: orderId, p_version: 2 });
    expect((await call(customer.client, 'customer_state')).order.status).toBe('repairing');
    await expectFail(customer.client, 'cancel_order_by_customer', { p_order_id: orderId }, 'CANNOT_CANCEL'); // trạng thái 6: khách không hủy được

    // chỉnh sửa trong lúc sửa: phiếu v2 vẫn là phiếu hiện hành tới khi khách xác nhận v3
    const q3 = { ...q2, lines: [...q2.lines, { line_key: crypto.randomUUID(), kind: 'task', name: 'Cân chỉnh vành', quantity: 1, unit_price: 20000 }] };
    const r3 = await call(mechanic.client, 'submit_quote', { p_order_id: orderId, p_diagnosis: q3.diagnosis, p_lines: q3.lines });
    expect(r3.quote.version).toBe(3);
    const { data: qs } = await admin.from('quotes').select('version, status').eq('order_id', orderId).order('version');
    expect(qs).toEqual([{ version: 1, status: 'superseded' }, { version: 2, status: 'confirmed' }, { version: 3, status: 'sent' }]);
    await expectFail(mechanic.client, 'complete_repair', { p_order_id: orderId }, 'INVALID_STATE'); // đang chờ khách xác nhận v3
    await call(customer.client, 'confirm_quote', { p_order_id: orderId, p_version: 3 });
    const { data: qs2 } = await admin.from('quotes').select('version, status').eq('order_id', orderId).order('version');
    expect(qs2?.map((q) => q.status)).toEqual(['superseded', 'superseded', 'confirmed']);

    // hoàn tất sửa chữa → khách sang trạng thái 7
    expect((await call(mechanic.client, 'complete_repair', { p_order_id: orderId })).status).toBe('awaiting_payment');
    await expectFail(customer.client, 'create_rescue_request', requestArgs(s.at), 'ACTIVE_ORDER_EXISTS'); // BR-12: 7 + chưa đánh giá
    const cs = await call(customer.client, 'customer_state');
    expect(cs.order.id).toBe(orderId);

    // thợ xác nhận thanh toán khi khách chưa đánh giá: đơn Hoàn thành, thợ được giải phóng
    await call(mechanic.client, 'confirm_payment', { p_order_id: orderId });
    const { data: mrow } = await admin.from('mechanics').select('current_order_id, completed_count').eq('id', mechanic.id).single();
    expect(mrow).toEqual({ current_order_id: null, completed_count: 1 });

    // khách vào lại: đơn 8 chưa đánh giá không chặn tạo yêu cầu mới (BR-12) và không còn là "đơn hiện tại"
    expect((await call(customer.client, 'customer_state')).order).toBeNull();
    const again = await call(customer.client, 'create_rescue_request', requestArgs(s.at));
    await call(customer.client, 'cancel_order_by_customer', { p_order_id: again.id });

    // đánh giá sau (từ lịch sử) – mỗi đơn một lần; điểm trung bình tính theo BR-17
    await call(customer.client, 'submit_review', { p_order_id: orderId, p_stars: 4, p_comment: 'Nhanh' });
    await expectFail(customer.client, 'submit_review', { p_order_id: orderId, p_stars: 5 }, 'ALREADY_REVIEWED');
    const { data: m2 } = await admin.from('mechanics').select('rating_avg, rating_count').eq('id', mechanic.id).single();
    expect(Number(m2?.rating_avg)).toBe(4);
    expect(m2?.rating_count).toBe(1);

    // thợ không đọc được đánh giá (BR-17) ; chi tiết đơn dành cho thợ không có review
    const { data: rv } = await mechanic.client.from('reviews').select('*');
    expect(rv).toEqual([]);
    const md = await call(mechanic.client, 'order_detail', { p_order_id: orderId });
    expect(md.review).toBeNull();
    expect(md.quote.status).toBe('confirmed');
    const cd = await call(customer.client, 'order_detail', { p_order_id: orderId });
    expect(cd.review.stars).toBe(4);

    // nhật ký trạng thái (BR-11)
    const { data: ev } = await admin.from('order_events').select('to_status').eq('order_id', orderId).order('id');
    expect(ev?.map((e) => e.to_status)).toEqual(['searching', 'selected', 'traveling', 'arrived', 'quote_pending', 'repairing', 'quote_pending', 'repairing', 'awaiting_payment', 'completed']);
    const { data: logs } = await admin.from('location_logs').select('id').eq('order_id', orderId);
    expect(logs?.length).toBeGreaterThan(0);
  });

  it('bỏ qua đánh giá ở trạng thái 7 cho phép tạo yêu cầu mới (BR-12)', async () => {
    const s = await setupSelected();
    await call(s.mechanic.client, 'start_travel', { p_order_id: s.orderId });
    await call(s.mechanic.client, 'mark_arrived', { p_order_id: s.orderId });
    const q = goodQuote();
    await call(s.mechanic.client, 'submit_quote', { p_order_id: s.orderId, p_diagnosis: q.diagnosis, p_lines: q.lines });
    await call(s.customer.client, 'confirm_quote', { p_order_id: s.orderId, p_version: 1 });
    await call(s.mechanic.client, 'complete_repair', { p_order_id: s.orderId });
    await call(s.customer.client, 'skip_review', { p_order_id: s.orderId });
    const o = await call(s.customer.client, 'create_rescue_request', requestArgs(s.at));
    expect(o.status).toBe('searching');
    // sự kiện của đơn cũ (thanh toán) không ảnh hưởng yêu cầu mới
    await call(s.mechanic.client, 'confirm_payment', { p_order_id: s.orderId });
    expect((await call(s.customer.client, 'customer_state')).order.id).toBe(o.id);
  });
});

d('Hủy đơn – ma trận hủy (mục 2.3)', () => {
  it('khách hủy ở "đã chốt": thợ được giải phóng; thợ không hủy được ở "đã chốt"', async () => {
    const s = await setupSelected();
    await expectFail(s.mechanic.client, 'cancel_order_by_mechanic', { p_order_id: s.orderId }, 'CANNOT_CANCEL');
    const o = await call(s.customer.client, 'cancel_order_by_customer', { p_order_id: s.orderId, p_reason: 'Tự sửa được' });
    expect(o.status).toBe('cancelled');
    expect(o.cancelled_by).toBe('customer');
    const { data } = await admin.from('mechanics').select('current_order_id').eq('id', s.mechanic.id).single();
    expect(data?.current_order_id).toBeNull();
    expect((await call(s.mechanic.client, 'mechanic_state')).order).toBeNull();
    const hist = await call(s.mechanic.client, 'mechanic_history');
    expect(hist[0].status).toBe('cancelled');
  });

  it('thợ hủy khi đang di chuyển: đơn hủy, khách tạo yêu cầu mới được', async () => {
    const s = await setupSelected();
    await call(s.mechanic.client, 'start_travel', { p_order_id: s.orderId });
    const o = await call(s.mechanic.client, 'cancel_order_by_mechanic', { p_order_id: s.orderId, p_reason: 'Xe hỏng' });
    expect(o.cancelled_by).toBe('mechanic');
    expect((await call(s.customer.client, 'customer_state')).order).toBeNull();
    const again = await call(s.customer.client, 'create_rescue_request', requestArgs(s.at));
    expect(again.status).toBe('searching');
  });

  it('khách hủy khi chưa chốt: thợ liên quan bị gỡ yêu cầu (BR-06)', async () => {
    const at = baseLocation();
    const c = await makeCustomer();
    const m = await makeMechanic({ at: offset(at, 300, 0), online: true });
    const o = await call(c.client, 'create_rescue_request', requestArgs(at));
    await dispatchOrder(o.id);
    expect((await call(m.client, 'mechanic_state')).dispatches).toHaveLength(1);
    await call(c.client, 'cancel_order_by_customer', { p_order_id: o.id });
    expect((await call(m.client, 'mechanic_state')).dispatches).toEqual([]);
    await expectFail(m.client, 'accept_dispatch', { p_order_id: o.id }, 'REQUEST_UNAVAILABLE');
  });
});

