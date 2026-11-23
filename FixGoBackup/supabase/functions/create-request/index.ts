// Tạo yêu cầu cứu hộ và PHÂN PHỐI MỘT LẦN cho thợ đủ điều kiện (BR-01, BR-12, BR-14, mục 5.1).
// 1 request từ app → tạo đơn (RPC) → lọc chim bay < 5 km (PostGIS) → Mapbox Matrix (1 request / 24 thợ)
// → giữ thợ có TUYẾN ĐƯỜNG < 5 km → dispatch_insert (phát real-time).
import { adminClient, env, handle, HttpError, json, requireUser } from '../_shared/http.ts';
import {
  chunk, fallbackRoute, matrixUrl, parseMatrixDistances, pickWithinRoute, MATRIX_SOURCES_PER_CALL, ROUTE_LIMIT_M,
  type Candidate, type DispatchOut,
} from '../_shared/dispatch-logic.ts';

async function routeDistances(token: string, dest: { lat: number; lng: number }, cands: Candidate[]): Promise<DispatchOut[]> {
  const batches = chunk(cands, MATRIX_SOURCES_PER_CALL);
  const results = await Promise.all(batches.map(async (batch) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(matrixUrl(token, dest, batch), { signal: ctrl.signal });
      if (!res.ok) throw new Error(`Mapbox Matrix ${res.status}`);
      const distances = parseMatrixDistances(await res.json(), batch.length);
      return pickWithinRoute(batch, distances, ROUTE_LIMIT_M);
    } finally {
      clearTimeout(timer);
    }
  }));
  return results.flat();
}

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED');
  const { client } = await requireUser(req);
  const b = await req.json().catch(() => null);
  if (!b) throw new HttpError(400, 'INVALID_INPUT');

  // 1) Tạo đơn (kiểm tra BR-12 nằm trong RPC + unique index)
  const { data: order, error } = await client.rpc('create_rescue_request', {
    p_lat: b.lat, p_lng: b.lng, p_address: b.address, p_incident_types: b.incident_types,
    p_vehicle_model: b.vehicle_model, p_license_plate: b.license_plate, p_description: b.description, p_media: b.media ?? [],
  });
  if (error) {
    const code = (error.message ?? '').match(/^[A-Z_]+/)?.[0] ?? 'INTERNAL';
    throw new HttpError(code === 'ACTIVE_ORDER_EXISTS' ? 409 : 400, code);
  }

  // 2) Phân phối đúng một lần
  const admin = adminClient();
  let dispatched = 0;
  let method: 'route' | 'fallback' | 'none' = 'none';
  try {
    const { data: cands, error: cErr } = await admin.rpc('get_dispatch_candidates', { p_order_id: order.id, p_radius_m: ROUTE_LIMIT_M, p_limit: 96 });
    if (cErr) throw cErr;
    const candidates = (cands ?? []) as Candidate[];
    let items: DispatchOut[] = [];
    if (candidates.length > 0) {
      try {
        items = await routeDistances(env('MAPBOX_TOKEN'), { lat: order.lat, lng: order.lng }, candidates);
        method = 'route';
      } catch (e) {
        console.warn('Mapbox Matrix lỗi, dùng ước lượng dự phòng:', e);
        if (Deno.env.get('ALLOW_ROUTE_FALLBACK') === 'false') throw e;
        items = fallbackRoute(candidates);
        method = 'fallback';
      }
    }
    const { data: n, error: dErr } = await admin.rpc('dispatch_insert', { p_order_id: order.id, p_items: items });
    if (dErr && !/DISPATCH_SKIPPED/.test(dErr.message)) throw dErr;
    dispatched = (n as number) ?? 0;
  } catch (e) {
    // Đơn đã tạo; lỗi phân phối không làm mất yêu cầu của khách (khách ở lại U-06).
    console.error('Phân phối thất bại', e);
  }
  return json({ order, dispatched, method });
}));
