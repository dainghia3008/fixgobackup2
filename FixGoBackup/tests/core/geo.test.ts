import { describe, it, expect } from 'vitest';
import { haversine, shouldSendLocation, progressOnRoute, type Route } from '../../shared/core/geo';

const A = { lat: 10.7769, lng: 106.7009 };
describe('Khoảng cách và gửi vị trí', () => {
  it('haversine ≈ 0 với cùng điểm', () => expect(haversine(A, A)).toBeCloseTo(0, 5));
  it('1° kinh độ ở xích đạo ≈ 111 km', () => {
    expect(haversine({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeGreaterThan(111000);
    expect(haversine({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeLessThan(111400);
  });
  it('đối xứng', () => {
    const B = { lat: 10.8231, lng: 106.6297 };
    expect(haversine(A, B)).toBeCloseTo(haversine(B, A), 6);
  });
  it('gửi lần đầu luôn được phép', () => expect(shouldSendLocation(null, { p: A, t: 0 }, 15, 4000)).toBe(true));
  it('không gửi nếu chưa đủ thời gian', () => {
    expect(shouldSendLocation({ p: A, t: 0 }, { p: { lat: A.lat + 0.01, lng: A.lng }, t: 1000 }, 15, 4000)).toBe(false);
  });
  it('không gửi nếu đủ thời gian nhưng chưa di chuyển', () => {
    expect(shouldSendLocation({ p: A, t: 0 }, { p: A, t: 5000 }, 15, 4000)).toBe(false);
  });
  it('gửi khi đủ thời gian và đã di chuyển đủ xa', () => {
    expect(shouldSendLocation({ p: A, t: 0 }, { p: { lat: A.lat + 0.001, lng: A.lng }, t: 5000 }, 15, 4000)).toBe(true);
  });
  it('gửi nhịp tim sau thời gian dài dù đứng yên', () => {
    expect(shouldSendLocation({ p: A, t: 0 }, { p: A, t: 20000 }, 15, 4000)).toBe(true);
  });
});

// Tuyến thẳng về phía bắc ~2 km, 2 chặng
const route: Route = {
  distance: 2000,
  duration: 300,
  coordinates: [[106.7, 10.7], [106.7, 10.709], [106.7, 10.718]],
  steps: [
    { instruction: 'Đi thẳng', distance: 1000, duration: 150, type: 'depart', location: [106.7, 10.7] },
    { instruction: 'Rẽ phải vào đường A', distance: 1000, duration: 150, type: 'turn', modifier: 'right', location: [106.7, 10.709] },
    { instruction: 'Bạn đã đến nơi', distance: 0, duration: 0, type: 'arrive', location: [106.7, 10.718] },
  ],
};
describe('Tiến độ trên tuyến (M-09)', () => {
  it('ở điểm đầu: còn ~toàn bộ tuyến, chặng kế tiếp là rẽ phải', () => {
    const p = progressOnRoute(route, { lat: 10.7, lng: 106.7 });
    expect(p.remainingM).toBeGreaterThan(1900);
    expect(p.stepIndex).toBe(0);
    expect(p.next?.instruction).toContain('Rẽ phải');
    expect(p.offRouteM).toBeLessThan(5);
  });
  it('đi được nửa tuyến: còn ~1 km', () => {
    const p = progressOnRoute(route, { lat: 10.709, lng: 106.7 });
    expect(p.remainingM).toBeGreaterThan(900);
    expect(p.remainingM).toBeLessThan(1100);
  });
  it('lệch tuyến được phát hiện', () => {
    const p = progressOnRoute(route, { lat: 10.709, lng: 106.7 + 0.002 });
    expect(p.offRouteM).toBeGreaterThan(150);
  });
  it('gần cuối tuyến: còn rất ít', () => {
    const p = progressOnRoute(route, { lat: 10.7179, lng: 106.7 });
    expect(p.remainingM).toBeLessThan(60);
  });
});
