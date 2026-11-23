import { useEffect } from 'react';
import { useAuth } from '@/shared/mobile/auth';
import { rpc } from '@/shared/mobile/supabase';
import { startHub } from '@/shared/mobile/hub';
import { attachChat, detachChat } from '@/shared/mobile/chat';
import { registerForPush } from '@/shared/mobile/push';
import { watchPoints } from '@/shared/mobile/location';
import { useNavSync } from '@/shared/mobile/nav';
import { mechanicTarget } from '@/shared/core/routing';
import { chatOpen } from '@/shared/core/orderState';
import { shouldSendLocation } from '@/shared/core/geo';
import type { LatLng, MechanicState } from '@/shared/core/types';
import { useMechanic } from '@/store';
import { resync } from '@/actions';

export function useMechanicRuntime() {
  const { ready, session } = useAuth();
  const uid = session?.user.id ?? null;
  const loaded = useMechanic((s) => s.loaded);
  const mech = useMechanic((s) => s.mechanic);
  const order = useMechanic((s) => s.order);

  // 1) Tạo/đọc hồ sơ rồi đồng bộ trạng thái
  useEffect(() => {
    if (!uid) { useMechanic.getState().reset(); detachChat(); return; }
    let alive = true;
    (async () => {
      try {
        await rpc('ensure_mechanic');
        const s = await rpc<MechanicState>('mechanic_state');
        if (alive) useMechanic.getState().hydrate(s);
      } catch { /* màn hình đăng nhập sẽ xử lý */ }
    })();
    return () => { alive = false; };
  }, [uid]);

  // 2) Kênh real-time duy nhất user:<uid>
  useEffect(() => {
    if (!uid || !loaded) return;
    const stop = startHub(uid, {
      onEvent: (ev, payload) => { if (useMechanic.getState().handle(ev, payload)) resync(); },
      onResync: () => { resync(); },
    });
    registerForPush('mechanic');
    return stop;
  }, [uid, loaded]);

  // 3) Online: gửi vị trí để phân phối (ít request: ≥100 m hoặc ≥60 s, nhịp tim mỗi 4 phút)
  const online = mech?.presence === 'online' && mech.account_status === 'active';
  useEffect(() => {
    if (!online) return;
    let last: { p: LatLng; t: number } | null = null;
    let stop: (() => void) | null = null;
    let cancelled = false;
    watchPoints({ accuracy: 'balanced', timeInterval: 30000, distanceInterval: 50 }, (p) => {
      const now = { p, t: Date.now() };
      if (!shouldSendLocation(last, now, 100, 60000)) return;
      last = now;
      rpc('update_location', { p_lat: p.lat, p_lng: p.lng }).catch(() => {});
    }).then((s) => { if (cancelled) s(); else stop = s; });
    return () => { cancelled = true; stop?.(); };
  }, [online]);

  // 4) Chat chỉ mở trong lúc xử lý đơn (BR-15)
  useEffect(() => {
    if (uid && order && chatOpen(order.status)) attachChat(uid, order.id, 'mechanic').catch(() => {});
    else detachChat();
  }, [uid, order?.id, order?.status]);

  const target = !ready ? null : mechanicTarget({
    authed: !!session,
    loaded,
    profileStatus: mech?.profile_status ?? null,
    accountStatus: mech?.account_status ?? null,
    orderStatus: order?.status ?? null,
  });
  useNavSync(target);
}
