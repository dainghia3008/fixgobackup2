import { AppState } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface HubHandlers {
  onEvent: (event: string, payload: any) => void;
  onResync: () => void;
}

// MỘT kênh riêng tư user:<uid> nhận mọi sự kiện (mục 5.3) → 1 kết nối WebSocket, không polling.
// Broadcast không đảm bảo giao khi mất mạng, nên mỗi lần (kết nối lại / mở app) gọi onResync() để đồng bộ trạng thái.
export function startHub(userId: string, h: HubHandlers): () => void {
  let channel: RealtimeChannel | null = null;
  let stopped = false;
  let lastSync = 0;
  const resync = (force: boolean) => {
    const now = Date.now();
    if (!force && now - lastSync < 4000) return;
    lastSync = now;
    h.onResync();
  };
  (async () => {
    await supabase.realtime.setAuth();
    if (stopped) return;
    channel = supabase.channel(`user:${userId}`, { config: { private: true } });
    channel.on('broadcast', { event: '*' }, (m: any) => h.onEvent(m.event, m.payload));
    channel.subscribe((status) => { if (status === 'SUBSCRIBED') resync(true); });
  })();
  const sub = AppState.addEventListener('change', (s) => { if (s === 'active') resync(false); });
  return () => {
    stopped = true;
    sub.remove();
    if (channel) supabase.removeChannel(channel);
  };
}

export interface LocationPayload { lat: number; lng: number; t: number; heading?: number }

// Khách nghe vị trí thợ trên order:<id> (U-10)
export function listenMechanicLocation(orderId: string, cb: (p: LocationPayload) => void): () => void {
  let ch: RealtimeChannel | null = null;
  let stopped = false;
  (async () => {
    await supabase.realtime.setAuth();
    if (stopped) return;
    ch = supabase.channel(`order:${orderId}`, { config: { private: true } });
    ch.on('broadcast', { event: 'MECHANIC_LOCATION' }, (m: any) => cb(m.payload as LocationPayload));
    ch.subscribe();
  })();
  return () => { stopped = true; if (ch) supabase.removeChannel(ch); };
}

// Thợ phát vị trí trực tiếp qua Broadcast (không ghi DB mỗi lần → rất nhẹ)
export function openLocationSender(orderId: string) {
  let ch: RealtimeChannel | null = null;
  let ready = false;
  let closed = false;
  (async () => {
    await supabase.realtime.setAuth();
    if (closed) return;
    ch = supabase.channel(`order:${orderId}`, { config: { private: true } });
    ch.subscribe((s) => { ready = s === 'SUBSCRIBED'; });
  })();
  return {
    send(p: LocationPayload) { if (ready && ch) ch.send({ type: 'broadcast', event: 'MECHANIC_LOCATION', payload: p }); },
    close() { closed = true; if (ch) supabase.removeChannel(ch); },
  };
}
