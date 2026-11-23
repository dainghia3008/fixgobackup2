// Webhook Stream (event "message.new"): lưu nhật ký chat vào CSDL (BR-11, mục 5.5) và đẩy thông báo cho bên còn lại.
// Cấu hình trong Stream Dashboard → Chat → Webhook URL: https://<project>.supabase.co/functions/v1/stream-webhook
import { adminClient, env, handle, HttpError, json } from '../_shared/http.ts';
import { resolveChatSender } from '../../../shared/core/chatIdentity.ts';

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(handle(async (req) => {
  const raw = await req.text();
  const signature = req.headers.get('x-signature') ?? '';
  if (signature !== (await hmacHex(env('STREAM_API_SECRET'), raw))) throw new HttpError(401, 'BAD_SIGNATURE');

  const ev = JSON.parse(raw);
  if (ev.type !== 'message.new' || ev.channel_type !== 'messaging' || !ev.message || ev.message.type === 'system') return json({ ok: true, skipped: true });

  const orderId: string = ev.channel_id;
  const senderId: string = ev.message.user?.id ?? ev.user?.id;
  const admin = adminClient();
  const { data: o } = await admin.from('orders').select('customer_id, mechanic_id').eq('id', orderId).maybeSingle();
  const sender = o ? resolveChatSender(senderId, o) : null;
  if (!o || !sender) return json({ ok: true, skipped: true });
  const { role, userId } = sender;

  await admin.from('chat_messages').upsert({
    order_id: orderId, sender_id: userId, sender_role: role,
    content: String(ev.message.text ?? ''), stream_message_id: ev.message.id,
    created_at: ev.message.created_at ?? new Date().toISOString(),
  }, { onConflict: 'stream_message_id' });

  const recipient = role === 'customer' ? o.mechanic_id : o.customer_id;
  await admin.from('outbox').insert({
    kind: 'push', user_id: recipient, role: role === 'customer' ? 'mechanic' : 'customer',
    title: ev.message.user?.name ?? 'Tin nhắn mới', body: String(ev.message.text ?? '').slice(0, 140),
    data: { type: 'CHAT_MESSAGE', order_id: orderId },
  });
  return json({ ok: true });
}));
