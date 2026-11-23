import type { OrderStatus } from './types';

// Bảng chuyển trạng thái hợp lệ (mục 2.2). Dùng chung cho reducer phía app và kiểm thử;
// bản SQL tương ứng nằm trong các hàm RPC.
const NEXT: Record<OrderStatus, OrderStatus[]> = {
  searching: ['selected', 'cancelled'],
  selected: ['traveling', 'arrived', 'cancelled'],
  traveling: ['arrived', 'cancelled'],
  arrived: ['quote_pending', 'cancelled'],
  quote_pending: ['repairing', 'cancelled'],
  repairing: ['quote_pending', 'awaiting_payment', 'cancelled'],
  awaiting_payment: ['completed'],
  completed: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return from === to ? true : NEXT[from].includes(to);
}

export const isFinal = (s: OrderStatus): boolean => s === 'completed' || s === 'cancelled';

// Ma trận hủy đơn (mục 2.3)
export function customerCanCancel(s: OrderStatus): boolean {
  return ['searching', 'selected', 'traveling', 'arrived', 'quote_pending'].includes(s);
}
export function mechanicCanCancel(s: OrderStatus): boolean {
  return ['traveling', 'arrived', 'quote_pending', 'repairing'].includes(s);
}

// BR-12: đơn nào chặn khách tạo yêu cầu mới
export function blocksNewRequest(s: OrderStatus, review: 'none' | 'skipped' | 'submitted'): boolean {
  if (['searching', 'selected', 'traveling', 'arrived', 'quote_pending', 'repairing'].includes(s)) return true;
  return s === 'awaiting_payment' && review === 'none';
}

// BR-15: nhắn tin được trong khoảng này
export function chatOpen(s: OrderStatus): boolean {
  return ['selected', 'traveling', 'arrived', 'quote_pending', 'repairing'].includes(s);
}
