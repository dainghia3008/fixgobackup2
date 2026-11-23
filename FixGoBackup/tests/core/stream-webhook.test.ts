import { createHmac } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  serve: vi.fn(), upsert: vi.fn(), insert: vi.fn(),
  order: { customer_id: 'shared-uuid', mechanic_id: 'shared-uuid' },
}));
vi.mock('../../supabase/functions/_shared/http.ts', () => ({
  env: () => 'test-secret', json: Response.json, handle: (fn: any) => fn,
  HttpError: class extends Error {},
  adminClient: () => ({ from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.order }) }) }),
    upsert: mocks.upsert, insert: mocks.insert,
  }) }),
}));

let handler: (req: Request) => Promise<Response>;
beforeAll(async () => {
  vi.stubGlobal('Deno', { serve: mocks.serve });
  try {
    await import('../../supabase/functions/stream-webhook/index');
    handler = mocks.serve.mock.calls[0][0];
  } finally { vi.unstubAllGlobals(); }
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.order = { customer_id: 'shared-uuid', mechanic_id: 'shared-uuid' };
});

function request(senderId: string) {
  const body = JSON.stringify({ type: 'message.new', channel_type: 'messaging', channel_id: 'order-1',
    message: { id: 'msg-1', text: 'Xin chào', user: { id: senderId }, created_at: '2026-11-24T00:00:00Z' },
  });
  const signature = createHmac('sha256', 'test-secret').update(body).digest('hex');
  return handler(new Request('https://example.test/stream-webhook', { method: 'POST', body, headers: { 'x-signature': signature } }));
}

describe('Danh tính người gửi trong webhook chat', () => {
  it.each(['customer', 'mechanic'])('lưu đúng vai trò %s và UUID, gửi thông báo tới vai trò đối phương', async (role) => {
    expect((await request(`${role}_shared-uuid`)).status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ sender_id: 'shared-uuid', sender_role: role }), expect.anything());
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'shared-uuid', role: role === 'customer' ? 'mechanic' : 'customer' }));
  });

  it.each(['outsider', 'mechanic_outsider', 'customer_shared-uuid_extra', 'shared-uuid'])('không ghi sai người gửi cho ID %s', async (id) => {
    expect(await (await request(id)).json()).toEqual({ ok: true, skipped: true });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('vẫn xử lý tin cũ khi hai tài khoản khác UUID', async () => {
    mocks.order.mechanic_id = 'other-uuid';
    await request('other-uuid');
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ sender_id: 'other-uuid', sender_role: 'mechanic' }), expect.anything());
  });
});
