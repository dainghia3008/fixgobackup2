import React from 'react';
import { useRouter } from 'expo-router';
import { Screen, EmptyState } from '@/shared/mobile/ui';
import { QuoteView } from '@/shared/mobile/components/QuoteView';
import { useCustomer } from '@/store';

// U-15: phiếu hiện hành (phiên bản đã xác nhận), chỉ đọc
export default function QuoteDetail() {
  const router = useRouter();
  const quotes = useCustomer((s) => s.quotes);
  const current = quotes.find((q) => q.status === 'confirmed') ?? quotes[0];
  return (
    <Screen title="Chi tiết phiếu đề xuất" onBack={() => router.back()}>
      {current ? <QuoteView quote={current} showStatus /> : <EmptyState icon="receipt-outline" title="Chưa có phiếu" />}
    </Screen>
  );
}
