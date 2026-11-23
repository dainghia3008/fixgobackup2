import type { LatLng } from './types';

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

export function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Có nên gửi vị trí mới lên server không (giảm số request): đủ xa hoặc đủ lâu
export function shouldSendLocation(
  last: { p: LatLng; t: number } | null,
  now: { p: LatLng; t: number },
  minMeters: number,
  minMs: number,
): boolean {
  if (!last) return true;
  const dt = now.t - last.t;
  if (dt >= minMs * 4) return true; // heartbeat
  if (dt < minMs) return false;
  return haversine(last.p, now.p) >= minMeters;
}

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  type: string;
  modifier?: string;
  location: [number, number]; // [lng, lat] của điểm rẽ
}
export interface Route {
  distance: number;
  duration: number;
  coordinates: [number, number][]; // [lng, lat]
  steps: RouteStep[];
}

export interface RouteProgress {
  offRouteM: number;
  remainingM: number;
  remainingS: number;
  stepIndex: number;
  next: RouteStep | null;
  distanceToNext: number;
}

// Chiếu vị trí lên tuyến, trả về quãng đường còn lại và chặng kế tiếp.
export function progressOnRoute(route: Route, pos: LatLng): RouteProgress {
  const pts = route.coordinates;
  if (pts.length < 2) {
    return { offRouteM: 0, remainingM: route.distance, remainingS: route.duration, stepIndex: 0, next: route.steps[0] ?? null, distanceToNext: route.distance };
  }
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + haversine({ lat: pts[i - 1][1], lng: pts[i - 1][0] }, { lat: pts[i][1], lng: pts[i][0] }));
  }
  const total = cum[cum.length - 1] || 1;
  let best = Infinity;
  let along = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = { lat: pts[i][1], lng: pts[i][0] };
    const b = { lat: pts[i + 1][1], lng: pts[i + 1][0] };
    // chiếu phẳng cục bộ (đủ chính xác trong vài km)
    const kx = Math.cos(rad(a.lat));
    const ax = a.lng * kx, ay = a.lat, bx = b.lng * kx, by = b.lat, px = pos.lng * kx, py = pos.lat;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const proj = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    const d = haversine(pos, proj);
    if (d < best) {
      best = d;
      along = cum[i] + (cum[i + 1] - cum[i]) * t;
    }
  }
  const frac = Math.min(1, along / total);
  const remainingM = Math.max(0, route.distance * (1 - frac));
  const remainingS = Math.max(0, route.duration * (1 - frac));
  // vị trí bắt đầu của từng step theo khoảng cách tích lũy (tỉ lệ theo tổng route.distance)
  let acc = 0;
  let stepIndex = 0;
  const alongScaled = along * (route.distance / total);
  for (let i = 0; i < route.steps.length; i++) {
    if (acc <= alongScaled) stepIndex = i;
    acc += route.steps[i].distance;
  }
  const cur = route.steps[stepIndex];
  const next = route.steps[stepIndex + 1] ?? null;
  let startOfCur = 0;
  for (let i = 0; i < stepIndex; i++) startOfCur += route.steps[i].distance;
  const distanceToNext = Math.max(0, startOfCur + (cur?.distance ?? 0) - alongScaled);
  return { offRouteM: best, remainingM, remainingS, stepIndex, next, distanceToNext };
}
