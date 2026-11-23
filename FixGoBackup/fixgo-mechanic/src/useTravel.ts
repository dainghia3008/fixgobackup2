import { useEffect, useRef, useState } from 'react';
import { rpc } from '@/shared/mobile/supabase';
import { openLocationSender } from '@/shared/mobile/hub';
import { watchPoints } from '@/shared/mobile/location';
import { fetchRoute } from '@/shared/mobile/mapbox-api';
import { progressOnRoute, shouldSendLocation, type Route, type RouteProgress } from '@/shared/core/geo';
import type { LatLng } from '@/shared/core/types';

// M-09: theo dõi vị trí khi di chuyển – tối ưu số request:
//  • Phát vị trí qua Broadcast (không ghi DB) tối đa 1 lần/4 s hoặc khi đi ≥15 m
//  • Gom điểm ghi nhật ký vào DB mỗi ~30 s bằng 1 RPC
//  • Chỉ gọi Mapbox Directions khi chưa có tuyến hoặc lệch tuyến >60 m (tối đa mỗi 20 s)
export function useTravel(orderId: string, target: LatLng) {
  const [me, setMe] = useState<LatLng | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [progress, setProgress] = useState<RouteProgress | null>(null);
  const routeRef = useRef<Route | null>(null);
  const fetching = useRef(false);
  const lastRouteAt = useRef(0);

  useEffect(() => {
    const sender = openLocationSender(orderId);
    let last: { p: LatLng; t: number } | null = null;
    let buffer: { lat: number; lng: number; t: number }[] = [];
    let stop: (() => void) | null = null;
    let cancelled = false;

    const flush = () => {
      if (!buffer.length) return;
      const pts = buffer; buffer = [];
      rpc('log_locations', { p_order_id: orderId, p_points: pts }).catch(() => { buffer = [...pts, ...buffer].slice(-200); });
    };
    const timer = setInterval(flush, 30000);

    watchPoints({ accuracy: 'high', timeInterval: 3000, distanceInterval: 8 }, (p) => {
      setMe({ lat: p.lat, lng: p.lng });
      const now = { p: { lat: p.lat, lng: p.lng }, t: Date.now() };
      if (shouldSendLocation(last, now, 15, 4000)) {
        last = now;
        sender.send({ lat: p.lat, lng: p.lng, t: now.t, heading: p.heading });
        buffer.push({ lat: p.lat, lng: p.lng, t: now.t });
      }
      const r = routeRef.current;
      const prog = r ? progressOnRoute(r, p) : null;
      if (prog) setProgress(prog);
      const needRoute = !r || (prog && prog.offRouteM > 60);
      if (needRoute && !fetching.current && Date.now() - lastRouteAt.current > 20000) {
        fetching.current = true; lastRouteAt.current = Date.now();
        fetchRoute({ lat: p.lat, lng: p.lng }, target).then((nr) => {
          if (nr) { routeRef.current = nr; setRoute(nr); setProgress(progressOnRoute(nr, p)); }
        }).finally(() => { fetching.current = false; });
      }
    }).then((s) => { if (cancelled) s(); else stop = s; });

    return () => { cancelled = true; stop?.(); clearInterval(timer); flush(); sender.close(); };
  }, [orderId, target.lat, target.lng]);

  return { me, route, progress };
}
