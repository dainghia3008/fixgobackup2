export type ChatRole = 'customer' | 'mechanic';

export const chatUserId = (userId: string, role: ChatRole): string => `${role}_${userId}`;

export interface ChatParticipants { customer_id: string; mechanic_id: string | null }

// UUID đăng nhập vẫn dùng cho CSDL; danh tính Stream luôn kèm vai trò.
// Tin cũ dùng UUID thuần chỉ xác định được người gửi nếu hai bên khác tài khoản.
export function resolveChatSender(senderId: string | undefined, order: ChatParticipants): { userId: string; role: ChatRole } | null {
  for (const role of ['customer', 'mechanic'] as const) {
    const userId = order[`${role}_id`];
    if (userId && senderId === chatUserId(userId, role)) return { userId, role };
  }
  if (order.customer_id !== order.mechanic_id) {
    if (senderId === order.customer_id) return { userId: order.customer_id, role: 'customer' };
    if (order.mechanic_id && senderId === order.mechanic_id) return { userId: order.mechanic_id, role: 'mechanic' };
  }
  return null;
}
