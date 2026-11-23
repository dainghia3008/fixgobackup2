import React from 'react';
import { useRouter } from 'expo-router';
import { ChatScreen } from '@/shared/mobile/chat';
import { useAuth } from '@/shared/mobile/auth';
import { chatOpen } from '@/shared/core/orderState';
import { useCustomer } from '@/store';

// U-11
export default function Chat() {
  const router = useRouter();
  const { session } = useAuth();
  const order = useCustomer((s) => s.order);
  if (!order?.mechanic_id || !session) return null;
  return <ChatScreen orderId={order.id} userId={session.user.id} role="customer" peerId={order.mechanic_id} peerName={order.mechanic?.full_name ?? 'Thợ'} readOnly={!chatOpen(order.status)} onBack={() => router.back()} />;
}
