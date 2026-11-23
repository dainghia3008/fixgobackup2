import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../.env.test') });

export const URL = process.env.SUPABASE_URL ?? '';
export const KEY = process.env.SUPABASE_KEY ?? '';
export const SERVICE = process.env.SUPABASE_SERVICE_KEY ?? '';
export const configured = !!(URL && KEY && SERVICE);

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
export const admin: SupabaseClient = createClient(URL || 'http://localhost', SERVICE || 'x', opts);

export interface TestUser { id: string; email: string; client: SupabaseClient }
const created: TestUser[] = [];
const rnd = () => Math.random().toString(36).slice(2, 10);

export async function createUser(prefix: string): Promise<TestUser> {
  const email = `fixgo-test-${prefix}-${rnd()}@example.com`;
  const password = `Tt-${rnd()}-${rnd()}!1`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(URL, KEY, opts);
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  await client.realtime.setAuth();
  const u = { id: data.user.id, email, client };
  created.push(u);
  return u;
}

export async function call<T = any>(c: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await c.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export async function expectFail(c: SupabaseClient, fn: string, args: Record<string, unknown>, code: string) {
  const { error } = await c.rpc(fn, args);
  if (!error) throw new Error(`Mong đợi lỗi ${code} nhưng ${fn} đã thành công`);
  if (!error.message.startsWith(code)) throw new Error(`Mong đợi ${code}, nhận được: ${error.message}`);
}

// Vị trí cơ sở ngẫu nhiên trong TP.HCM để các nhóm kiểm thử không gây nhiễu lẫn nhau
export function baseLocation() {
  return { lat: 10.70 + Math.random() * 0.16, lng: 106.60 + Math.random() * 0.16 };
}
export const offset = (p: { lat: number; lng: number }, dLatM: number, dLngM: number) => ({
  lat: p.lat + dLatM / 111_000, lng: p.lng + dLngM / (111_000 * Math.cos((p.lat * Math.PI) / 180)),
});

export async function makeCustomer(name = 'Khách Thử'): Promise<TestUser> {
  const u = await createUser('c');
  await call(u.client, 'ensure_customer');
  await call(u.client, 'update_customer_name', { p_name: name });
  return u;
}

export const profilePayload = (over: Record<string, unknown> = {}) => ({
  face_photo: 'x/face.jpg', full_name: 'Nguyễn Văn Thợ', phone: '0901234567', birth_date: '1990-01-01',
  skills: ['tires', 'engine'], experience: '5 năm', id_full_name: 'NGUYỄN VĂN THỢ', id_number: '079090001234',
  id_front: 'x/front.jpg', id_back: 'x/back.jpg', ...over,
});

export async function makeMechanic(opts: { at?: { lat: number; lng: number }; approved?: boolean; online?: boolean; name?: string } = {}): Promise<TestUser> {
  const u = await createUser('m');
  await call(u.client, 'ensure_mechanic');
  const approved = opts.approved ?? true;
  await admin.from('mechanics').update({
    profile_status: approved ? 'approved' : 'pending', full_name: opts.name ?? 'Thợ Thử', phone: '0901234567', birth_date: '1990-01-01',
    skills: ['tires'], id_full_name: 'THỢ THỬ', id_number: '079090001234', face_photo: 'x/f.jpg', id_front: 'x/a.jpg', id_back: 'x/b.jpg',
  }).eq('id', u.id);
  if (opts.online && opts.at) await call(u.client, 'set_presence', { p_online: true, p_lat: opts.at.lat, p_lng: opts.at.lng });
  return u;
}

export async function makeAdmin(): Promise<TestUser> {
  const u = await createUser('a');
  await admin.from('admins').insert({ id: u.id });
  return u;
}

export function requestArgs(at: { lat: number; lng: number }, over: Record<string, unknown> = {}) {
  return {
    p_lat: at.lat, p_lng: at.lng, p_address: '1 Đường Thử, Quận 1', p_incident_types: ['flat_tire'],
    p_vehicle_model: 'Honda Vision', p_license_plate: '59x1-123.45', p_description: 'Xe bị xì lốp sau', p_media: [], ...over,
  };
}

// Mô phỏng Edge Function create-request nhưng KHÔNG gọi Mapbox: lọc bằng khoảng cách đường chim bay
export async function dispatchOrder(orderId: string): Promise<number> {
  const { data: cands, error } = await admin.rpc('get_dispatch_candidates', { p_order_id: orderId, p_radius_m: 5000, p_limit: 96 });
  if (error) throw new Error(error.message);
  const items = (cands ?? []).map((c: any) => ({ mechanic_id: c.mechanic_id, route_m: Math.round(c.straight_m * 1.3) }));
  const { data, error: e2 } = await admin.rpc('dispatch_insert', { p_order_id: orderId, p_items: items });
  if (e2) throw new Error(e2.message);
  return data as number;
}

export const goodQuote = () => ({
  diagnosis: 'Thủng săm sau, hở van',
  lines: [
    { line_key: crypto.randomUUID(), kind: 'task', name: 'Vá săm', quantity: 1, unit_price: 80000 },
    { line_key: crypto.randomUUID(), kind: 'part', name: 'Van mới', quantity: 2, unit_price: 45000 },
  ],
});

// Đưa đơn tới trạng thái "đã chốt thợ" nhanh
export async function setupSelected() {
  const at = baseLocation();
  const customer = await makeCustomer();
  const mechanic = await makeMechanic({ at: offset(at, 300, 200), online: true });
  const order = await call(customer.client, 'create_rescue_request', requestArgs(at));
  await dispatchOrder(order.id);
  await call(mechanic.client, 'accept_dispatch', { p_order_id: order.id });
  const proposal = await call(mechanic.client, 'submit_proposal', { p_order_id: order.id, p_assessment: 'Thủng săm', p_price_min: 50000, p_price_max: 150000, p_eta_minutes: 10 });
  const selected = await call(customer.client, 'select_mechanic', { p_order_id: order.id, p_proposal_id: proposal.id });
  return { at, customer, mechanic, orderId: order.id as string, proposal, selected };
}

export async function cleanupAll() {
  const ids = created.map((u) => u.id);
  if (ids.length) {
    await admin.from('orders').delete().in('customer_id', ids);
    await admin.from('reports').delete().in('customer_id', ids);
  }
  for (const u of created) { await admin.auth.admin.deleteUser(u.id).catch(() => {}); }
  created.length = 0;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Dọn dư lượng của các lần chạy trước (thợ test còn Online sẽ làm sai lệch phép đếm phân phối)
export async function purgeLeftovers() {
  await admin.from('mechanics').update({ presence: 'offline' }).like('email', 'fixgo-test-%');
}
