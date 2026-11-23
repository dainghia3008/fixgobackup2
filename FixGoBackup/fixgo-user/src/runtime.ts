import { useEffect } from 'react';
import { useAuth } from '@/shared/mobile/auth';
import { rpc } from '@/shared/mobile/supabase';
import { startHub, listenMechanicLocation } from '@/shared/mobile/hub';
import { attachChat, detachChat } from '@/shared/mobile/chat';
import { registerForPush } from '@/shared/mobile/push';
import { useNavSync } from '@/shared/mobile/nav';
import { customerTarget } from '@/shared/core/routing';
import { chatOpen } from '@/shared/core/orderState';
import type { CustomerSelf, CustomerState, LatLng } from '@/shared/core/types';
import { useCustomer } from '@/store';

// Toàn bộ vòng đời real-time của app Khách: hồ sơ → kênh user:<uid> → đồng bộ → chat → điều hướng
export function useCustomerRuntime() {
  const { ready, session } = useAuth();
  const uid = session?.user.id ?? null;
  const profile = useCustomer((s) => s.profile);
  const order = useCustomer((s) => s.order);
  const hasProposals = useCustomer((s) => s.proposals.length > 0);

  useEffect(() => {
    if (!uid) { useCustomer.getState().reset(); detachChat(); return; }
    let alive = true;
    rpc<CustomerSelf>('ensure_customer').then((p) => alive && useCustomer.getState().setProfile(p)).catch(() => {});
    return () => { alive = false; };
  }, [uid]);

  useEffect(() => {
    if (!uid || !profile?.id) return;
    const st = useCustomer.getState();
    const stop = startHub(uid, {
      onEvent: st.handle,
      onResync: () => { rpc<CustomerState>('customer_state').then(useCustomer.getState().hydrate).catch(() => {}); },
    });
    registerForPush('customer');
    return stop;
  }, [uid, profile?.id]);

  // BR-15: chat chỉ tồn tại từ lúc chốt thợ đến hết sửa chữa
  useEffect(() => {
    if (uid && order?.mechanic_id && chatOpen(order.status)) attachChat(uid, order.id, 'customer').catch(() => {});
    else detachChat();
  }, [uid, order?.id, order?.status]);

  // Vị trí thợ: nghe Broadcast khi đã chốt thợ và chưa đến nơi; lấy vị trí gần nhất 1 lần
  const trackId = order && order.mechanic_id && (order.status === 'selected' || order.status === 'traveling') ? order.id : null;
  useEffect(() => {
    if (!trackId) return;
    let alive = true;
    rpc<(LatLng & { at: string }) | null>('get_mechanic_location', { p_order_id: trackId }).then((p) => {
      if (alive && p) useCustomer.getState().setMechanicPos({ lat: p.lat, lng: p.lng, t: Date.parse(p.at) || Date.now() });
    }).catch(() => {});
    const stop = listenMechanicLocation(trackId, (p) => useCustomer.getState().setMechanicPos({ lat: p.lat, lng: p.lng, t: p.t }));
    return () => { alive = false; stop(); };
  }, [trackId]);

  const target = !ready ? null : customerTarget({
    authed: !!session,
    profileLoaded: !!profile,
    needsName: !!profile && !profile.full_name,
    order: order ? { status: order.status, review_status: order.review_status } : null,
    hasProposals,
  });
  useNavSync(target);
}
