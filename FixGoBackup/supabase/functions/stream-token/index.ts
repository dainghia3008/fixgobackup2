// Cấp token Stream Chat và (khi có order_id) tạo kênh chat cho đơn – chỉ 2 bên của đơn, chỉ khi chat còn mở (BR-15).
import { StreamChat } from 'npm:stream-chat@9';
import { adminClient, env, handle, HttpError, json, requireUser } from '../_shared/http.ts';
import { chatUserId } from '../../../shared/core/chatIdentity.ts';

const CHAT_STATUSES = ['selected', 'traveling', 'arrived', 'quote_pending', 'repairing'];

Deno.serve(handle(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED');
  const { user } = await requireUser(req);
  const { order_id, role } = await req.json().catch(() => ({}));
  if (role !== 'customer' && role !== 'mechanic') throw new HttpError(400, 'CHAT_ROLE_REQUIRED');
  const apiKey = env('STREAM_API_KEY');
  const server = StreamChat.getInstance(apiKey, env('STREAM_API_SECRET'));
  const streamUserId = chatUserId(user.id, role);
  const token = server.createToken(streamUserId, Math.floor(Date.now() / 1000) + 3600);
  const admin = adminClient();

  if (!order_id) {
    const { data: profile, error } = await admin.from(role === 'customer' ? 'customers' : 'mechanics').select('id').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (!profile) throw new HttpError(403, 'FORBIDDEN');
    return json({ token, api_key: apiKey, user_id: streamUserId });
  }

  const { data: o, error } = await admin.from('orders').select('id, status, customer_id, mechanic_id').eq('id', order_id).maybeSingle();
  if (error) throw error;
  if (!o || !o.mechanic_id || o[`${role}_id`] !== user.id) throw new HttpError(403, 'FORBIDDEN');
  if (!CHAT_STATUSES.includes(o.status)) throw new HttpError(409, 'CHAT_CLOSED');

  const [{ data: c }, { data: m }] = await Promise.all([
    admin.from('customers').select('full_name').eq('id', o.customer_id).maybeSingle(),
    admin.from('mechanics').select('full_name, face_photo').eq('id', o.mechanic_id).maybeSingle(),
  ]);
  // Hai vai trò luôn là hai danh tính Stream, kể cả khi chung UUID đăng nhập.
  const users = [
    { id: chatUserId(o.customer_id, 'customer'), name: c?.full_name ?? 'Khách hàng', role: 'user' },
    { id: chatUserId(o.mechanic_id, 'mechanic'), name: m?.full_name ?? 'Thợ', role: 'user' },
  ];
  await server.upsertUsers(users);
  const members = users.map((u) => u.id);
  const channel = server.channel('messaging', o.id, { members, created_by_id: members[0] } as Record<string, unknown>);
  const state = await channel.query({ watch: false, state: true, messages: { limit: 1 } });
  // Nâng cấp thành viên của kênh đã tồn tại, giữ nguyên toàn bộ lịch sử.
  const existing = new Set(state.members.map((m) => m.user_id ?? m.user?.id));
  const missing = members.filter((id) => !existing.has(id));
  if (missing.length) await channel.addMembers(missing);
  const legacy = [...new Set([o.customer_id, o.mechanic_id])].filter((id) => existing.has(id));
  if (legacy.length) await channel.removeMembers(legacy);
  return json({ token, api_key: apiKey, user_id: streamUserId, channel_id: o.id });
}));
