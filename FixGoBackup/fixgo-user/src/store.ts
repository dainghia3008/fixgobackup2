import { create } from 'zustand';
import { applyCustomerEvent, hydrateCustomer, initialCustomer, makeNotice, type CustomerLocal } from '@/shared/core/reducers';
import type { CustomerSelf, CustomerState, LatLng, OrderDTO } from '@/shared/core/types';

interface Store extends CustomerLocal {
  profile: CustomerSelf | null;
  mechanicPos: (LatLng & { t: number }) | null;
  setProfile: (p: CustomerSelf | null) => void;
  hydrate: (s: CustomerState) => void;
  handle: (event: string, payload: any) => void;
  setOrder: (o: OrderDTO) => void;
  endOrder: (notice?: string) => void;
  setMechanicPos: (p: (LatLng & { t: number }) | null) => void;
  reset: () => void;
}

export const useCustomer = create<Store>((set) => ({
  ...initialCustomer,
  profile: null,
  mechanicPos: null,
  setProfile: (profile) => set({ profile }),
  hydrate: (s) => set((st) => hydrateCustomer(st, s)),
  handle: (event, payload) => set((st) => applyCustomerEvent(st, event, payload)),
  setOrder: (order) => set({ order, proposals: [], acceptedCount: 0, quotes: [], mechanicPos: null }),
  endOrder: (text) => set((st) => ({
    order: null, proposals: [], acceptedCount: 0, quotes: [], mechanicPos: null,
    historyDirty: st.historyDirty + 1, notice: text ? makeNotice(text) : st.notice,
  })),
  setMechanicPos: (mechanicPos) => set({ mechanicPos }),
  reset: () => set({ ...initialCustomer, profile: null, mechanicPos: null }),
}));
