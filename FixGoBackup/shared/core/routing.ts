import type { AccountStatus, OrderStatus, ProfileStatus, ReviewStatus } from './types';

// Màn hình đích của app Khách theo trạng thái đơn (mục 2.2, BR-12). Trả về null = chờ tải dữ liệu.
export function customerTarget(i: {
  authed: boolean;
  profileLoaded: boolean;
  needsName: boolean;
  order: { status: OrderStatus; review_status: ReviewStatus } | null;
  hasProposals: boolean;
}): string | null {
  if (!i.authed) return '/(auth)/login';
  if (!i.profileLoaded) return null;
  if (i.needsName) return '/(auth)/name';
  const o = i.order;
  if (!o) return '/(tabs)/home';
  switch (o.status) {
    case 'searching': return i.hasProposals ? '/order/proposals' : '/order/searching';
    case 'selected':
    case 'traveling': return '/order/tracking';
    case 'arrived': return '/order/arrived';
    case 'quote_pending': return '/order/quote';
    case 'repairing': return '/order/repair';
    case 'awaiting_payment':
    case 'completed': return o.review_status === 'none' ? '/order/review' : '/(tabs)/home';
    default: return '/(tabs)/home';
  }
}

// Màn hình đích của app Thợ (mục 4.1). Đơn đã chốt luôn được ưu tiên, kể cả khi tài khoản bị khóa (M-01).
export function mechanicTarget(i: {
  authed: boolean;
  loaded: boolean;
  profileStatus: ProfileStatus | null;
  accountStatus: AccountStatus | null;
  orderStatus: OrderStatus | null;
}): string | null {
  if (!i.authed) return '/(auth)/login';
  if (!i.loaded) return null;
  switch (i.orderStatus) {
    case 'selected': return '/order/selected';
    case 'traveling': return '/order/travel';
    case 'arrived':
    case 'quote_pending': return '/order/quote';
    case 'repairing': return '/order/repair';
    case 'awaiting_payment': return '/order/payment';
    default: break;
  }
  if (i.accountStatus === 'locked') return '/locked';
  if (i.profileStatus === 'none' || i.profileStatus == null) return '/register';
  if (i.profileStatus === 'pending' || i.profileStatus === 'rejected') return '/pending';
  return '/(tabs)/home';
}
