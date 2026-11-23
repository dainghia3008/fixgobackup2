import React from 'react';
import { useRouter } from 'expo-router';
import { Screen } from '@/shared/mobile/ui';
import { HistoryList } from '@/shared/mobile/components/History';
import { useCustomer } from '@/store';

// U-17
export default function History() {
  const router = useRouter();
  const dirty = useCustomer((s) => s.historyDirty);
  return (
    <Screen title="Lịch sử" scroll={false} padded={false}>
      <HistoryList role="customer" refreshKey={dirty} onOpen={(id) => router.push({ pathname: '/history/[id]', params: { id } })} />
    </Screen>
  );
}
