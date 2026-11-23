import React from 'react';
import { useRouter } from 'expo-router';
import { ChatScreen } from '@/shared/mobile/chat';
import { useAuth } from '@/shared/mobile/auth';
import { QUICK_REPLIES } from '@/shared/core/constants';
import { chatOpen } from '@/shared/core/orderState';
import { useMechanic } from '@/store';

// M-10: chat tới khi hoàn tất sửa chữa hoặc đơn bị hủy; từ M-13 không còn chat (BR-15)
export default function Chat() {
  const router = useRouter();
  const { session } = useAuth();
  const order = useMechanic((s) => s.order);
  if (!order || !session) return null;
  return <ChatScreen orderId={order.id} userId={session.user.id} role="mechanic" peerId={order.customer_id} peerName={order.customer?.full_name ?? 'Khách hàng'} quickReplies={QUICK_REPLIES} readOnly={!chatOpen(order.status)} onBack={() => router.back()} />;
}
