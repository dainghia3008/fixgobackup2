import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { HistoryDetail } from '@/shared/mobile/components/History';

// M-15 (không hiển thị đánh giá của khách – BR-17; RPC order_detail không trả về cho thợ)
export default function HistoryItem() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  return <HistoryDetail orderId={id} onBack={() => router.back()} />;
}
