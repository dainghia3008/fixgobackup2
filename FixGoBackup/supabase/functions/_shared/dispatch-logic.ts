// Logic thuần phục vụ phân phối yêu cầu (BR-01, mục 5.1). Không import gì để chạy được cả trên Deno lẫn Node (kiểm thử).

export interface Candidate { mechanic_id: string; lat: number; lng: number; straight_m: number }
export interface DispatchOut { mechanic_id: string; route_m: number }

export const ROUTE_LIMIT_M = 5000;
// Mapbox Matrix (profile driving) cho tối đa 25 toạ độ mỗi request: 1 điểm đến + 24 nguồn.
export const MATRIX_MAX_COORDS = 25;
export const MATRIX_SOURCES_PER_CALL = MATRIX_MAX_COORDS - 1;

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function matrixUrl(token: string, dest: { lat: number; lng: number }, sources: { lat: number; lng: number }[]): string {
  const coords = [dest, ...sources].map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const src = sources.map((_, i) => i + 1).join(';');
  return `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coords}?sources=${src}&destinations=0&annotations=distance&access_token=${encodeURIComponent(token)}`;
}

// distances[i][0] = quãng đường theo tuyến từ nguồn i đến điểm đến (m); null nếu không có đường đi.
export function parseMatrixDistances(json: any, n: number): (number | null)[] {
  const d = json?.distances;
  if (!Array.isArray(d) || d.length !== n) throw new Error('INVALID_MATRIX');
  return d.map((row: any) => (typeof row?.[0] === 'number' ? row[0] : null));
}

export function pickWithinRoute(cands: Candidate[], distances: (number | null)[], maxM = ROUTE_LIMIT_M): DispatchOut[] {
  const out: DispatchOut[] = [];
  cands.forEach((c, i) => {
    const d = distances[i];
    if (d != null && d < maxM) out.push({ mechanic_id: c.mechanic_id, route_m: Math.round(d) });
  });
  return out;
}

// Dự phòng khi Mapbox lỗi: ước lượng tuyến = đường chim bay × hệ số.
export function fallbackRoute(cands: Candidate[], factor = 1.35, maxM = ROUTE_LIMIT_M): DispatchOut[] {
  return pickWithinRoute(cands, cands.map((c) => c.straight_m * factor), maxM);
}
