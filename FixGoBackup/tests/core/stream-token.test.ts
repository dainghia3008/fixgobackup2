import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userId: 'customer',
  order: { id: 'order-1', status: 'selected', customer_id: 'customer', mechanic_id: 'mechanic' },
  upsertUsers: vi.fn(), query: vi.fn(), channel: vi.fn(), addMembers: vi.fn(), removeMembers: vi.fn(),
  existingMembers: null as string[] | null,
  serve: vi.fn(),
}));
vi.mock('npm:stream-chat@9', () => ({
  StreamChat: { getInstance: () => ({
    createToken: (id: string) => `token-${id}`,
    upsertUsers: mocks.upsertUsers,
    channel: mocks.channel,
  }) },
}));
vi.mock('../../supabase/functions/_shared/http.ts', () => {
  class HttpError extends Error {
    constructor(public status: number, message: string) { super(message); }
  }
  return {
    HttpError, env: () => 'stream-key', json: Response.json,
    requireUser: async () => ({ user: { id: mocks.userId } }),
    handle: (fn: (req: Request) => Promise<Response>) => async (req: Request) => {
      try { return await fn(req); }
      catch (error) {
        if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
        throw error;
      }
    },
    adminClient: () => ({ from: (table: string) => ({ select: () => ({ eq: () => ({
      maybeSingle: async () => ({ data: table === 'orders' ? mocks.order : { full_name: table } }),
    }) }) }) }),
  };
});

let handler: (req: Request) => Promise<Response>;
beforeAll(async () => {
  vi.stubGlobal('Deno', { serve: mocks.serve });
  try {
    await import('../../supabase/functions/stream-token/index');
    handler = mocks.serve.mock.calls[0][0];
  } finally { vi.unstubAllGlobals(); }
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId = 'customer';
  mocks.existingMembers = null;
  mocks.order = { id: 'order-1', status: 'selected', customer_id: 'customer', mechanic_id: 'mechanic' };
  mocks.query.mockImplementation(async (data) => {
    if (new Set(data.members).size !== data.members.length) throw new Error('Duplicate members');
    return { members: (mocks.existingMembers ?? data.members).map((user_id: string) => ({ user_id })) };
  });
  mocks.channel.mockImplementation((_type, _id, data) => ({
    query: () => mocks.query(data), addMembers: mocks.addMembers, removeMembers: mocks.removeMembers,
  }));
});

const request = (body: unknown = { order_id: 'order-1', role: 'customer' }) =>
  handler(new Request('https://example.test/stream-token', { method: 'POST', body: JSON.stringify(body) }));

describe('Cấp kênh Stream Chat', () => {
  it('cùng UUID vẫn cấp hai danh tính và token khác nhau theo vai trò', async () => {
    mocks.order.mechanic_id = 'customer';
    const res = await request();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ channel_id: 'order-1', user_id: 'customer_customer', token: 'token-customer_customer' });
    expect(mocks.upsertUsers.mock.calls[0][0]).toEqual([
      { id: 'customer_customer', name: 'customers', role: 'user' },
      { id: 'mechanic_customer', name: 'mechanics', role: 'user' },
    ]);
    expect(mocks.channel).toHaveBeenCalledWith('messaging', 'order-1', { members: ['customer_customer', 'mechanic_customer'], created_by_id: 'customer_customer' });
    const mechanic = await request({ order_id: 'order-1', role: 'mechanic' });
    expect(await mechanic.json()).toMatchObject({ user_id: 'mechanic_customer', token: 'token-mechanic_customer' });
  });

  it.each(['customer', 'mechanic'])('cho phép %s mở kênh gồm hai tài khoản khác nhau', async (userId) => {
    mocks.userId = userId;
    expect((await request({ order_id: 'order-1', role: userId })).status).toBe(200);
    expect(mocks.upsertUsers.mock.calls[0][0]).toHaveLength(2);
    expect(mocks.channel.mock.calls[0][2].members).toEqual(['customer_customer', 'mechanic_mechanic']);
  });

  it('không cấp kênh cho người ngoài đơn', async () => {
    mocks.userId = 'outsider';
    const res = await request();
    expect(res.status).toBe(403);
    expect(mocks.channel).not.toHaveBeenCalled();
  });

  it('không mở lại kênh khi đơn đã kết thúc', async () => {
    mocks.order.status = 'completed';
    const res = await request();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'CHAT_CLOSED' });
    expect(mocks.channel).not.toHaveBeenCalled();
  });

  it('vẫn cấp token để SDK có thể làm mới kết nối', async () => {
    const res = await request({ role: 'customer' });
    expect(await res.json()).toMatchObject({ token: 'token-customer_customer', user_id: 'customer_customer' });
    expect(mocks.channel).not.toHaveBeenCalled();
  });

  it('không cho khách xin token vai trò thợ của người khác', async () => {
    const res = await request({ order_id: 'order-1', role: 'mechanic' });
    expect(res.status).toBe(403);
    expect(mocks.channel).not.toHaveBeenCalled();
  });

  it.each([undefined, 'admin', 'user'])('từ chối vai trò thiếu hoặc sai: %s', async (role) => {
    expect((await request({ order_id: 'order-1', role })).status).toBe(400);
    expect(mocks.channel).not.toHaveBeenCalled();
  });

  it('nâng cấp kênh cũ: thêm hai danh tính theo vai trò, xóa thành viên UUID thuần', async () => {
    mocks.order.mechanic_id = 'customer';
    mocks.existingMembers = ['customer'];
    expect((await request()).status).toBe(200);
    expect(mocks.addMembers).toHaveBeenCalledWith(['customer_customer', 'mechanic_customer']);
    expect(mocks.removeMembers).toHaveBeenCalledWith(['customer']);
  });

  it('kênh đã nâng cấp không cập nhật thành viên lại', async () => {
    mocks.existingMembers = ['customer_customer', 'mechanic_mechanic'];
    expect((await request()).status).toBe(200);
    expect(mocks.addMembers).not.toHaveBeenCalled();
    expect(mocks.removeMembers).not.toHaveBeenCalled();
  });
});
