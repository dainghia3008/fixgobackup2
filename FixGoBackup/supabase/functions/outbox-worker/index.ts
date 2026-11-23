// Xử lý hàng đợi outbox (được kích hoạt bởi Database Webhook khi INSERT):
//  - push:       gửi thông báo đẩy qua Expo Push (app ở chế độ nền vẫn nhận được)
//  - chat_close: đóng băng kênh Stream khi đơn hoàn tất sửa chữa / bị hủy (BR-15)
import { StreamChat } from 'npm:stream-chat@9';
import { adminClient, env, handle, HttpError, json } from '../_shared/http.ts';

Deno.serve(handle(async (req) => {
  if (req.headers.get('x-webhook-secret') !== env('OUTBOX_SECRET')) throw new HttpError(401, 'BAD_SECRET');
  const payload = await req.json();
  const row = payload.record;
  if (!row?.id) return json({ ok: true, skipped: true });

  const admin = adminClient();
  let error: string | null = null;
  try {
    if (row.kind === 'push') {
      const table = row.role === 'mechanic' ? 'mechanics' : 'customers';
      const { data: u } = await admin.from(table).select('push_token').eq('id', row.user_id).maybeSingle();
      const token = u?.push_token as string | undefined;
      if (token && token.startsWith('ExponentPushToken')) {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ to: token, title: row.title, body: row.body, data: row.data, sound: 'default', priority: 'high', channelId: 'default' }),
        });
        if (!res.ok) error = `expo ${res.status}`;
      }
    } else if (row.kind === 'chat_close') {
      const server = StreamChat.getInstance(env('STREAM_API_KEY'), env('STREAM_API_SECRET'));
      const channel = server.channel('messaging', row.data?.order_id);
      await channel.updatePartial({ set: { frozen: true } });
    }
  } catch (e) {
    error = String((e as Error)?.message ?? e);
  }
  await admin.from('outbox').update({ processed_at: new Date().toISOString(), error }).eq('id', row.id);
  return json({ ok: !error, error });
}));
