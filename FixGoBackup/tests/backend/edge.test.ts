import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseLocation, call, cleanupAll, configured, purgeLeftovers, makeCustomer, makeMechanic, offset } from './helpers';

// Chỉ chạy khi đã deploy Edge Function create-request và cấu hình MAPBOX_TOKEN (đặt TEST_EDGE=1 trong tests/.env.test)
const d = configured && process.env.TEST_EDGE === '1' ? describe : describe.skip;
beforeAll(async () => { if (configured) await purgeLeftovers(); });
afterEach(async () => { if (configured) await cleanupAll(); }); // mỗi bài kiểm thử dọn dữ liệu của mình

d('Edge Function create-request: phân phối theo TUYẾN ĐƯỜNG < 5 km qua Mapbox Matrix', () => {
  it('tạo đơn + phân phối trong 1 request; thợ xa bị loại; gọi lại bị chặn bởi BR-12', async () => {
    const at = baseLocation();
    const customer = await makeCustomer();
    const near = await makeMechanic({ at: offset(at, 500, 300), online: true });
    const far = await makeMechanic({ at: offset(at, 9000, 0), online: true });
    const body = { lat: at.lat, lng: at.lng, address: '1 Đường Thử', incident_types: ['flat_tire'], vehicle_model: 'Vision', license_plate: '59X1-123.45', description: 'Xì lốp', media: [] };

    const { data, error } = await customer.client.functions.invoke('create-request', { body });
    expect(error).toBeNull();
    expect(data.order.status).toBe('searching');
    expect(data.dispatched).toBe(1);
    expect(['route', 'fallback']).toContain(data.method);

    expect((await call(near.client, 'mechanic_state')).dispatches).toHaveLength(1);
    expect((await call(far.client, 'mechanic_state')).dispatches).toHaveLength(0);

    const again = await customer.client.functions.invoke('create-request', { body });
    expect(again.error).toBeTruthy();
  });
});
