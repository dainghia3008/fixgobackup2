import { describe, it, expect } from 'vitest';
import {
  chunk, matrixUrl, parseMatrixDistances, pickWithinRoute, fallbackRoute, MATRIX_SOURCES_PER_CALL, type Candidate,
} from '../../supabase/functions/_shared/dispatch-logic';

const cand = (id: string, straight: number): Candidate => ({ mechanic_id: id, lat: 10.77, lng: 106.7, straight_m: straight });

describe('Phân phối yêu cầu (BR-01, mục 5.1)', () => {
  it('chia lô tối đa 24 nguồn/lần gọi Matrix để tiết kiệm request', () => {
    const arr = Array.from({ length: 50 }, (_, i) => i);
    const c = chunk(arr, MATRIX_SOURCES_PER_CALL);
    expect(c.map((x) => x.length)).toEqual([24, 24, 2]);
    expect(MATRIX_SOURCES_PER_CALL).toBe(24);
  });
  it('URL Matrix: điểm đến là toạ độ đầu, nguồn đánh số từ 1', () => {
    const url = matrixUrl('pk.test', { lat: 10.1, lng: 106.1 }, [{ lat: 10.2, lng: 106.2 }, { lat: 10.3, lng: 106.3 }]);
    expect(url).toContain('/driving/106.100000,10.100000;106.200000,10.200000;106.300000,10.300000');
    expect(url).toContain('sources=1;2');
    expect(url).toContain('destinations=0');
    expect(url).toContain('annotations=distance');
  });
  it('đọc ma trận khoảng cách, null nếu không có đường', () => {
    expect(parseMatrixDistances({ distances: [[1200], [null], [4999]] }, 3)).toEqual([1200, null, 4999]);
    expect(() => parseMatrixDistances({ distances: [[1]] }, 2)).toThrow();
    expect(() => parseMatrixDistances({}, 1)).toThrow();
  });
  it('chỉ giữ thợ có TUYẾN ĐƯỜNG dưới 5 km (không dùng đường chim bay)', () => {
    const cands = [cand('a', 900), cand('b', 2000), cand('c', 3000), cand('d', 4000)];
    // b gần theo đường chim bay nhưng tuyến thực tế vòng xa 6 km
    const out = pickWithinRoute(cands, [1100, 6000, 4999.4, null]);
    expect(out).toEqual([{ mechanic_id: 'a', route_m: 1100 }, { mechanic_id: 'c', route_m: 4999 }]);
  });
  it('đúng 5000 m là không đạt (dưới 5 km)', () => {
    expect(pickWithinRoute([cand('a', 1)], [5000])).toEqual([]);
  });
  it('dự phòng khi Mapbox lỗi: ước lượng tuyến = chim bay × 1.35', () => {
    const out = fallbackRoute([cand('a', 3000), cand('b', 3800)]);
    expect(out.map((o) => o.mechanic_id)).toEqual(['a']);
  });
});
