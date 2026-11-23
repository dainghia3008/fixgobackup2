import { callFunction, rpc } from '@/shared/mobile/supabase';
import { getCurrentPoint } from '@/shared/mobile/location';
import { attachChat } from '@/shared/mobile/chat';
import { confirmAsync, toast } from '@/shared/mobile/ui';
import { errorCode, errorMessage } from '@/shared/core/errors';
import type { AiResult, MechanicProfileInput, MechanicSelf, MechanicState, OrderDTO, ProposalDraft, QuoteDTO } from '@/shared/core/types';
import type { DraftLine } from '@/shared/core/quote';
import { useMechanic, useQuoteDrafts } from '@/store';

const S = () => useMechanic.getState();

export async function resync() {
  try { S().hydrate(await rpc<MechanicState>('mechanic_state')); } catch { /* bỏ qua */ }
}

// M-04: bật/tắt Online (BR-14)
export async function goOnline(): Promise<boolean> {
  const p = await getCurrentPoint();
  if (!p) { toast('Không lấy được vị trí. Hãy bật định vị rồi thử lại.', 'warn'); return false; }
  try {
    await rpc('set_presence', { p_online: true, p_lat: p.lat, p_lng: p.lng });
    S().setPresence('online');
    return true;
  } catch (e) { toast(errorMessage(e), 'error'); return false; }
}
export async function goOffline(): Promise<boolean> {
  try { await rpc('set_presence', { p_online: false }); S().setPresence('offline'); return true; }
  catch (e) { toast(errorMessage(e), 'error'); return false; }
}

// M-05
export async function acceptRequest(orderId: string): Promise<boolean> {
  const d = S().dispatches.find((x) => x.order_id === orderId);
  if (d?.status === 'accepted') return true; // đã chấp nhận: không gọi lại, không tăng số (U-06)
  try {
    await rpc('accept_dispatch', { p_order_id: orderId });
    S().patchDispatch(orderId, { status: 'accepted' });
    return true;
  } catch (e) {
    toast(errorMessage(e), 'warn');
    if (errorCode(e) === 'REQUEST_UNAVAILABLE') S().dropDispatch(orderId);
    return false;
  }
}
export async function declineRequest(orderId: string): Promise<boolean> {
  try { await rpc('decline_dispatch', { p_order_id: orderId }); S().dropDispatch(orderId); return true; }
  catch (e) { toast(errorMessage(e), 'warn'); if (errorCode(e) === 'REQUEST_UNAVAILABLE') S().dropDispatch(orderId); return errorCode(e) === 'REQUEST_UNAVAILABLE'; }
}

// M-06
export async function askAi(orderId: string): Promise<AiResult> {
  const r = await callFunction<{ result: AiResult }>('ai-assistant', { order_id: orderId });
  S().patchDispatch(orderId, { ai_result: r.result });
  return r.result;
}

// M-07
export async function saveDraft(orderId: string, draft: ProposalDraft) {
  S().patchDispatch(orderId, { draft });
  try { await rpc('save_dispatch_draft', { p_order_id: orderId, p_draft: draft }); } catch { /* giữ bản nháp cục bộ */ }
}
export async function sendProposal(orderId: string, p: { assessment: string; min: number; max: number; eta: number }) {
  await rpc('submit_proposal', { p_order_id: orderId, p_assessment: p.assessment, p_price_min: p.min, p_price_max: p.max, p_eta_minutes: p.eta });
  S().dropDispatch(orderId); // gửi xong: gỡ khỏi danh sách sự cố
}

// M-08 … M-13
export async function startTravel(orderId: string) { S().setOrder(await rpc<OrderDTO>('start_travel', { p_order_id: orderId })); }
export async function markArrived(orderId: string) { S().setOrder(await rpc<OrderDTO>('mark_arrived', { p_order_id: orderId })); }
export async function completeRepair(orderId: string) { S().setOrder(await rpc<OrderDTO>('complete_repair', { p_order_id: orderId })); }
export async function confirmPayment(orderId: string) {
  await rpc('confirm_payment', { p_order_id: orderId });
  useQuoteDrafts.getState().clear(orderId);
  S().endOrder();
}

export async function cancelByMechanic(orderId: string): Promise<boolean> {
  const ok = await confirmAsync('Hủy đơn cứu hộ?', 'Khách sẽ được thông báo và đơn sẽ kết thúc. Bạn chắc chắn muốn hủy?', 'Hủy đơn', true);
  if (!ok) return false;
  try {
    await rpc('cancel_order_by_mechanic', { p_order_id: orderId });
    useQuoteDrafts.getState().clear(orderId);
    S().endOrder();
    toast('Đã hủy đơn');
    return true;
  } catch (e) {
    toast(errorMessage(e), 'error');
    if (['CANNOT_CANCEL', 'INVALID_STATE'].includes(errorCode(e))) resync();
    return false;
  }
}

export async function submitQuote(orderId: string, diagnosis: string, lines: DraftLine[]) {
  const r = await rpc<{ quote: QuoteDTO; previous: QuoteDTO | null }>('submit_quote', { p_order_id: orderId, p_diagnosis: diagnosis, p_lines: lines });
  const o = S().order;
  if (o) S().setOrder({ ...o, status: 'quote_pending', current_quote_version: r.quote.version }, [r.quote, ...(r.previous ? [r.previous] : [])]);
  useQuoteDrafts.getState().clear(orderId);
}

// Tin nhắn mẫu "Đang tới ngay" (M-08)
export async function sendQuickMessage(userId: string, orderId: string, text: string) {
  const ch = await attachChat(userId, orderId, 'mechanic');
  await ch.sendMessage({ text });
}

export async function submitProfile(p: MechanicProfileInput): Promise<MechanicSelf> {
  const m = await rpc<MechanicSelf>('submit_mechanic_profile', { p_payload: p });
  S().setMechanic(m);
  return m;
}
