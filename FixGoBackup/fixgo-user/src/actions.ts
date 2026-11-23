import { callFunction, rpc } from '@/shared/mobile/supabase';
import { useCustomer } from '@/store';
import { confirmAsync, toast } from '@/shared/mobile/ui';
import { errorCode, errorMessage } from '@/shared/core/errors';
import type { CustomerState, Media, OrderDTO } from '@/shared/core/types';

export interface RequestForm {
  lat: number; lng: number; address: string; incident_types: string[];
  vehicle_model: string; license_plate: string; description: string; media: Media[];
}

// Tạo yêu cầu + phân phối: chỉ 1 request tới Edge Function
export async function createRequest(f: RequestForm): Promise<OrderDTO> {
  const res = await callFunction<{ order: OrderDTO }>('create-request', f);
  useCustomer.getState().setOrder(res.order);
  return res.order;
}

export async function cancelOrder(orderId: string, reason?: string) {
  await rpc('cancel_order_by_customer', { p_order_id: orderId, p_reason: reason ?? null });
  useCustomer.getState().endOrder();
}

export async function selectMechanic(orderId: string, proposalId: string) {
  const order = await rpc<OrderDTO>('select_mechanic', { p_order_id: orderId, p_proposal_id: proposalId });
  useCustomer.getState().handle('MECHANIC_SELECTED', { order });
}

export async function confirmQuote(orderId: string, version: number) {
  await rpc('confirm_quote', { p_order_id: orderId, p_version: version });
  useCustomer.getState().handle('QUOTE_CONFIRMED', { order_id: orderId, version });
}

export async function submitReview(orderId: string, stars: number, comment: string) {
  await rpc('submit_review', { p_order_id: orderId, p_stars: stars, p_comment: comment || null });
  const s = useCustomer.getState();
  if (s.order?.id === orderId) s.endOrder(); else useCustomer.setState({ historyDirty: s.historyDirty + 1 });
}

export async function skipReview(orderId: string) {
  await rpc('skip_review', { p_order_id: orderId });
  const s = useCustomer.getState();
  if (s.order?.id === orderId) s.endOrder(); else useCustomer.setState({ historyDirty: s.historyDirty + 1 });
}

export async function sendReport(orderId: string, kind: 'mechanic' | 'rescue_issue', content: string) {
  await rpc('create_report', { p_order_id: orderId, p_kind: kind, p_content: content });
}

export async function resync() {
  try { useCustomer.getState().hydrate(await rpc<CustomerState>('customer_state')); } catch { /* bỏ qua */ }
}

// Hủy yêu cầu có xác nhận (U-06, U-08, U-10, U-12, U-13)
export async function askAndCancel(orderId: string) {
  const ok = await confirmAsync('Hủy yêu cầu cứu hộ?', 'Các thợ liên quan sẽ được thông báo. Bạn có chắc chắn muốn hủy?', 'Hủy yêu cầu', true);
  if (!ok) return;
  try {
    await cancelOrder(orderId);
    toast('Đã hủy yêu cầu cứu hộ');
  } catch (e) {
    toast(errorMessage(e), 'error');
    if (['CANNOT_CANCEL', 'INVALID_STATE', 'ORDER_NOT_FOUND'].includes(errorCode(e))) resync();
  }
}
