import type {
  CustomerState, DispatchItem, MechanicState, OrderDTO, OrderStatus, ProposalDTO, QuoteDTO,
} from './types';
import { canTransition } from './orderState';

export interface Notice { id: number; text: string; tone: 'info' | 'warn' | 'error' }
let seq = 0;
export const makeNotice = (text: string, tone: Notice['tone'] = 'info'): Notice => ({ id: ++seq, text, tone });

function advance(o: OrderDTO, to: OrderStatus): OrderDTO {
  return canTransition(o.status, to) ? { ...o, status: to } : o;
}

// ───────────────────────── Khách hàng ─────────────────────────
export interface CustomerLocal {
  order: OrderDTO | null;
  proposals: ProposalDTO[];
  acceptedCount: number;
  quotes: QuoteDTO[];
  notice: Notice | null;
  historyDirty: number;
}
export const initialCustomer: CustomerLocal = { order: null, proposals: [], acceptedCount: 0, quotes: [], notice: null, historyDirty: 0 };

export function hydrateCustomer(prev: CustomerLocal, s: CustomerState): CustomerLocal {
  // Đang ở U-16 sau khi thợ xác nhận thanh toán: giữ nguyên để khách gửi/bỏ qua đánh giá.
  if (!s.order && prev.order && prev.order.status === 'completed' && prev.order.review_status === 'none') return prev;
  return {
    ...prev,
    order: s.order,
    proposals: s.proposals,
    acceptedCount: s.accepted_count,
    quotes: s.quotes,
    historyDirty: prev.order && !s.order ? prev.historyDirty + 1 : prev.historyDirty,
  };
}

export function applyCustomerEvent(s: CustomerLocal, event: string, p: any): CustomerLocal {
  const cur = s.order;
  const same = (id: string | undefined) => !!cur && cur.id === id;
  switch (event) {
    case 'ACCEPTANCE_COUNT_CHANGED':
      return same(p.order_id) ? { ...s, acceptedCount: p.count } : s;
    case 'PROPOSAL_NEW': {
      if (!cur || cur.id !== p.order_id || cur.status !== 'searching') return s;
      const proposal = p.proposal as ProposalDTO;
      const others = s.proposals.filter((x) => x.id !== proposal.id && x.mechanic.id !== proposal.mechanic.id);
      return { ...s, proposals: [...others, proposal] };
    }
    case 'MECHANIC_TAKEN':
    case 'MECHANIC_OFFLINE':
    case 'ACCOUNT_LOCKED': {
      if (!same(p.order_id)) return s;
      return { ...s, proposals: s.proposals.filter((x) => x.id !== p.proposal_id && x.mechanic.id !== p.mechanic_id) };
    }
    case 'MECHANIC_SELECTED': {
      const o = p.order as OrderDTO;
      if (cur && cur.id !== o.id) return s;
      return { ...s, order: o, proposals: [], acceptedCount: 0, quotes: [] };
    }
    case 'TRAVEL_STARTED':
      return same(p.order_id) ? { ...s, order: advance(cur!, 'traveling') } : s;
    case 'ORDER_CANCELLED_BY_MECHANIC':
      return same(p.order_id)
        ? { ...s, order: null, proposals: [], quotes: [], acceptedCount: 0, historyDirty: s.historyDirty + 1, notice: makeNotice('Thợ đã hủy đơn cứu hộ. Bạn có thể tạo yêu cầu mới.', 'warn') }
        : { ...s, historyDirty: s.historyDirty + 1 };
    case 'MECHANIC_ARRIVED':
      return same(p.order_id) ? { ...s, order: advance(cur!, 'arrived'), notice: makeNotice('Thợ đã đến nơi') } : s;
    case 'QUOTE_SUBMITTED': {
      if (!same(p.order_id)) return s;
      const q = p.quote as QuoteDTO;
      const quotes = [q, ...(p.previous ? [p.previous as QuoteDTO] : [])];
      return {
        ...s,
        order: { ...advance(cur!, 'quote_pending'), current_quote_version: q.version },
        quotes,
        notice: q.version > 1 ? makeNotice('Thợ đã gửi lại phiếu đề xuất. Phần thay đổi được làm nổi bật.', 'warn') : s.notice,
      };
    }
    case 'QUOTE_CONFIRMED':
      return same(p.order_id)
        ? { ...s, order: advance(cur!, 'repairing'), quotes: s.quotes.map((q) => (q.version === p.version ? { ...q, status: 'confirmed' as const } : q)) }
        : s;
    case 'REPAIR_COMPLETED':
      return same(p.order_id) ? { ...s, order: advance(cur!, 'awaiting_payment') } : s;
    case 'PAYMENT_CONFIRMED':
      return same(p.order_id) ? { ...s, order: advance(cur!, 'completed'), historyDirty: s.historyDirty + 1 } : { ...s, historyDirty: s.historyDirty + 1 };
    default:
      return s;
  }
}

// ───────────────────────── Thợ ─────────────────────────
export interface MechanicLocal {
  loaded: boolean;
  mechanic: MechanicState['mechanic'] | null;
  dispatches: DispatchItem[];
  order: OrderDTO | null;
  quotes: QuoteDTO[];
  notice: Notice | null;
  historyDirty: number;
}
export const initialMechanic: MechanicLocal = { loaded: false, mechanic: null, dispatches: [], order: null, quotes: [], notice: null, historyDirty: 0 };

export function hydrateMechanic(prev: MechanicLocal, s: MechanicState): MechanicLocal {
  return {
    ...prev,
    loaded: true,
    mechanic: s.mechanic,
    dispatches: s.dispatches,
    order: s.order,
    quotes: s.quotes,
    historyDirty: prev.order && !s.order ? prev.historyDirty + 1 : prev.historyDirty,
  };
}

export function applyMechanicEvent(s: MechanicLocal, event: string, p: any): { state: MechanicLocal; refresh?: boolean } {
  const cur = s.order;
  const same = (id: string | undefined) => !!cur && cur.id === id;
  switch (event) {
    case 'REQUEST_NEW': {
      if (cur || s.mechanic?.account_status === 'locked') return { state: s };
      const d = p.dispatch as DispatchItem;
      if (s.dispatches.some((x) => x.order_id === d.order_id)) return { state: s };
      return { state: { ...s, dispatches: [d, ...s.dispatches] } };
    }
    case 'REQUEST_CLOSED': {
      const had = s.dispatches.some((x) => x.order_id === p.order_id);
      return { state: { ...s, dispatches: s.dispatches.filter((x) => x.order_id !== p.order_id), notice: had ? makeNotice('Một yêu cầu đã được khách chọn thợ khác', 'info') : s.notice } };
    }
    case 'REQUEST_CANCELLED': {
      if (p.was_selected && same(p.order_id)) {
        return { state: { ...s, order: null, quotes: [], historyDirty: s.historyDirty + 1, notice: makeNotice('Khách đã hủy yêu cầu cứu hộ', 'warn') } };
      }
      const had = s.dispatches.some((x) => x.order_id === p.order_id);
      return { state: { ...s, dispatches: s.dispatches.filter((x) => x.order_id !== p.order_id), notice: had ? makeNotice('Một yêu cầu đã bị khách hủy', 'info') : s.notice } };
    }
    case 'MECHANIC_SELECTED': {
      const o = p.order as OrderDTO;
      return { state: { ...s, order: o, dispatches: [], quotes: [] } };
    }
    case 'QUOTE_CONFIRMED':
      return same(p.order_id)
        ? { state: { ...s, order: advance(cur!, 'repairing'), quotes: s.quotes.map((q) => (q.version === p.version ? { ...q, status: 'confirmed' as const } : q)) } }
        : { state: s };
    case 'REPAIR_COMPLETED':
      return same(p.order_id) ? { state: { ...s, order: advance(cur!, 'awaiting_payment') } } : { state: s };
    case 'PROFILE_REVIEWED':
      return { state: { ...s, notice: makeNotice(p.approved ? 'Hồ sơ của bạn đã được duyệt' : 'Hồ sơ của bạn bị từ chối' + (p.reason ? `: ${p.reason}` : ''), p.approved ? 'info' : 'warn') }, refresh: true };
    case 'ACCOUNT_LOCKED':
      return {
        state: {
          ...s,
          dispatches: [],
          mechanic: s.mechanic ? { ...s.mechanic, account_status: 'locked', presence: 'offline' } : s.mechanic,
          notice: makeNotice('Tài khoản của bạn đã bị khóa', 'error'),
        },
      };
    case 'ACCOUNT_UNLOCKED':
      return { state: { ...s, mechanic: s.mechanic ? { ...s.mechanic, account_status: 'active' } : s.mechanic, notice: makeNotice('Tài khoản đã được mở khóa') }, refresh: true };
    default:
      return { state: s };
  }
}

export function removeDispatch(s: MechanicLocal, orderId: string): MechanicLocal {
  return { ...s, dispatches: s.dispatches.filter((d) => d.order_id !== orderId) };
}
