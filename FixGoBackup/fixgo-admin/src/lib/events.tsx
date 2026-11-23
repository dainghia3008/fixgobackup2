'use client';
import { createContext, useContext, useEffect, useRef } from 'react';

type Listener = (event: string, payload: any) => void;
export const EventsCtx = createContext<{ subscribe: (l: Listener) => () => void }>({ subscribe: () => () => {} });

// Gọi lại `refresh` (debounce 600 ms) mỗi khi có sự kiện admin liên quan (một kênh Broadcast riêng tư "admin")
export function useAdminRefresh(events: string[], refresh: () => void) {
  const { subscribe } = useContext(EventsCtx);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef(refresh);
  cb.current = refresh;
  useEffect(() => subscribe((event) => {
    if (!events.includes(event)) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => cb.current(), 600);
  }), [subscribe, events.join('|')]);
}
