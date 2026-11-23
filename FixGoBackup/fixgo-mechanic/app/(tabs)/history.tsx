import React from 'react';
import { useRouter } from 'expo-router';
import { Screen } from '@/shared/mobile/ui';
import { HistoryList } from '@/shared/mobile/components/History';
import { useMechanic } from '@/store';

// M-14
export default function History() {
  const router = useRouter();
  const dirty = useMechanic((s) => s.historyDirty);
  return (
    <Screen title="Lịch sử" scroll={false} padded={false}>
      <HistoryList role="mechanic" refreshKey={dirty} onOpen={(id) => router.push({ pathname: '/history/[id]', params: { id } })} />
    </Screen>
  );
}
