import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { baseLocation, call, cleanupAll, configured, purgeLeftovers, dispatchOrder, makeCustomer, makeMechanic, offset, requestArgs, setupSelected, sleep } from './helpers';

const d = configured ? describe : describe.skip;
beforeAll(async () => { if (configured) await purgeLeftovers(); });
afterEach(async () => { if (configured) await cleanupAll(); }); // mỗi bài kiểm thử dọn dữ liệu của mình

// Nghe một kênh riêng tư và gom các sự kiện nhận được
async function listen(client: SupabaseClient, topic: string) {
  await client.realtime.setAuth();
  const events: { event: string; payload: any }[] = [];
  const ch = client.channel(topic, { config: { private: true } });
  ch.on('broadcast', { event: '*' }, (m: any) => events.push({ event: m.event, payload: m.payload }));
  const status = await new Promise<string>((resolve) => {
    const t = setTimeout(() => resolve('TIMED_OUT'), 15000);
    ch.subscribe((s) => { if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(s)) { clearTimeout(t); resolve(s); } });
  });
  return { ch, events, status };
}
async function waitFor<T>(fn: () => T | undefined, ms = 10000): Promise<T | undefined> {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(150); }
  return undefined;
}

d('Real-time qua Broadcast từ CSDL (mục 5.3)', () => {
  it('REQUEST_NEW, PROPOSAL_NEW, ACCEPTANCE_COUNT_CHANGED, MECHANIC_SELECTED, REQUEST_CLOSED được đẩy tới đúng người', async () => {
    const at = baseLocation();
    const customer = await makeCustomer();
    const m1 = await makeMechanic({ at: offset(at, 300, 0), online: true });
    const m2 = await makeMechanic({ at: offset(at, 400, 0), online: true });
    const lc = await listen(customer.client, `user:${customer.id}`);
    const l1 = await listen(m1.client, `user:${m1.id}`);
    const l2 = await listen(m2.client, `user:${m2.id}`);
    expect([lc.status, l1.status, l2.status]).toEqual(['SUBSCRIBED', 'SUBSCRIBED', 'SUBSCRIBED']);

    const order = await call(customer.client, 'create_rescue_request', requestArgs(at));
    await dispatchOrder(order.id);
    expect(await waitFor(() => l1.events.find((e) => e.event === 'REQUEST_NEW'))).toBeTruthy();
    expect(await waitFor(() => l2.events.find((e) => e.event === 'REQUEST_NEW'))).toBeTruthy();

    await call(m1.client, 'accept_dispatch', { p_order_id: order.id });
    const cnt = await waitFor(() => lc.events.find((e) => e.event === 'ACCEPTANCE_COUNT_CHANGED'));
    expect(cnt?.payload.count).toBe(1);

    const prop = await call(m1.client, 'submit_proposal', { p_order_id: order.id, p_assessment: 'ok', p_price_min: 1, p_price_max: 2, p_eta_minutes: 5 });
    const pn = await waitFor(() => lc.events.find((e) => e.event === 'PROPOSAL_NEW'));
    expect(pn?.payload.proposal.id).toBe(prop.id);

    await call(customer.client, 'select_mechanic', { p_order_id: order.id, p_proposal_id: prop.id });
    expect(await waitFor(() => l1.events.find((e) => e.event === 'MECHANIC_SELECTED'))).toBeTruthy();
    expect(await waitFor(() => l2.events.find((e) => e.event === 'REQUEST_CLOSED'))).toBeTruthy();
    // người không liên quan không nhận được sự kiện của đơn này
    expect(l2.events.some((e) => e.event === 'MECHANIC_SELECTED')).toBe(false);
    for (const l of [lc, l1, l2]) await l.ch.unsubscribe();
  });

  it('không nghe được kênh của người khác; vị trí thợ đi qua kênh order:<id> chỉ cho 2 bên', async () => {
    const s = await setupSelected();
    const stranger = await makeCustomer();
    const spy = await listen(stranger.client, `user:${s.customer.id}`);
    expect(spy.status).not.toBe('SUBSCRIBED');
    const spy2 = await listen(stranger.client, `order:${s.orderId}`);
    expect(spy2.status).not.toBe('SUBSCRIBED');

    const lc = await listen(s.customer.client, `order:${s.orderId}`);
    const lm = await listen(s.mechanic.client, `order:${s.orderId}`);
    expect([lc.status, lm.status]).toEqual(['SUBSCRIBED', 'SUBSCRIBED']);
    await lm.ch.send({ type: 'broadcast', event: 'MECHANIC_LOCATION', payload: { lat: 10.77, lng: 106.7, t: Date.now() } });
    const got = await waitFor(() => lc.events.find((e) => e.event === 'MECHANIC_LOCATION'));
    expect(got?.payload.lat).toBe(10.77);
    // khách không được phát vị trí giả mạo
    await lc.ch.send({ type: 'broadcast', event: 'MECHANIC_LOCATION', payload: { lat: 0, lng: 0, t: 1 } });
    await sleep(1500);
    expect(lm.events.some((e) => e.event === 'MECHANIC_LOCATION')).toBe(false);
    for (const l of [lc, lm, spy, spy2]) await l.ch.unsubscribe();
  });
});
