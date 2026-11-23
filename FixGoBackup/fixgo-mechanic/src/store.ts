import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyMechanicEvent, hydrateMechanic, initialMechanic, removeDispatch, type MechanicLocal } from '@/shared/core/reducers';
import type { DispatchItem, MechanicSelf, MechanicState, OrderDTO, ProposalDraft, QuoteDTO } from '@/shared/core/types';
import type { QuoteDraft } from '@/shared/core/quote';

interface Store extends MechanicLocal {
  hydrate: (s: MechanicState) => void;
  handle: (event: string, payload: any) => boolean; // true = cần tải lại trạng thái từ server
  setMechanic: (m: MechanicSelf) => void;
  setPresence: (p: 'online' | 'offline') => void;
  patchDispatch: (orderId: string, patch: Partial<DispatchItem>) => void;
  dropDispatch: (orderId: string) => void;
  setOrder: (o: OrderDTO, quotes?: QuoteDTO[]) => void;
  endOrder: () => void;
  reset: () => void;
}

export const useMechanic = create<Store>((set) => ({
  ...initialMechanic,
  hydrate: (s) => set((st) => hydrateMechanic(st, s)),
  handle: (event, payload) => {
    let refresh = false;
    set((st) => { const r = applyMechanicEvent(st, event, payload); refresh = !!r.refresh; return r.state; });
    return refresh;
  },
  setMechanic: (mechanic) => set({ mechanic }),
  setPresence: (presence) => set((st) => ({ mechanic: st.mechanic ? { ...st.mechanic, presence } : st.mechanic })),
  patchDispatch: (orderId, patch) => set((st) => ({ dispatches: st.dispatches.map((d) => (d.order_id === orderId ? { ...d, ...patch } : d)) })),
  dropDispatch: (orderId) => set((st) => removeDispatch(st, orderId)),
  setOrder: (order, quotes) => set((st) => ({ order, quotes: quotes ?? st.quotes, dispatches: [] })),
  endOrder: () => set((st) => ({ order: null, quotes: [], historyDirty: st.historyDirty + 1 })),
  reset: () => set({ ...initialMechanic }),
}));

// Bản nháp phiếu đề xuất chưa gửi (lưu tạm, bền vững) – chưa có số phiên bản, không tự có hiệu lực
export const useQuoteDrafts = create<{ drafts: Record<string, QuoteDraft>; setDraft: (id: string, d: QuoteDraft) => void; clear: (id: string) => void }>()(
  persist(
    (set) => ({
      drafts: {},
      setDraft: (id, d) => set((s) => ({ drafts: { ...s.drafts, [id]: d } })),
      clear: (id) => set((s) => { const { [id]: _drop, ...rest } = s.drafts; return { drafts: rest }; }),
    }),
    { name: 'fixgo-quote-drafts', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export type { ProposalDraft };
