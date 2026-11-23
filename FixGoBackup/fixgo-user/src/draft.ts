import { create } from 'zustand';
import type { LatLng } from '@/shared/core/types';

export interface DraftLocation extends LatLng { address: string }

// Giữ vị trí đang chọn khi chuyển giữa U-04 và U-05
export const useDraft = create<{ loc: DraftLocation | null; setLoc: (l: DraftLocation | null) => void }>((set) => ({
  loc: null,
  setLoc: (loc) => set({ loc }),
}));
