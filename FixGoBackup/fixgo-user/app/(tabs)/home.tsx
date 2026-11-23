import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppMap } from '@/shared/mobile/maps';
import { Button, Row, Sheet } from '@/shared/mobile/ui';
import { getCurrentPoint } from '@/shared/mobile/location';
import { colors, font } from '@/shared/mobile/theme';
import type { LatLng } from '@/shared/core/types';
import { useCustomer } from '@/store';
import { useDraft } from '@/draft';

const HCMC: LatLng = { lat: 10.7769, lng: 106.7009 };

// U-03
export default function Home() {
  const router = useRouter();
  const name = useCustomer((s) => s.profile?.full_name);
  const [pos, setPos] = useState<LatLng | null>(null);
  useEffect(() => { getCurrentPoint().then(setPos); }, []);

  return (
    <View style={{ flex: 1 }}>
      <AppMap center={pos ?? HCMC} zoom={pos ? 15.5 : 12} showUser={!!pos} />
      <View style={{ position: 'absolute', top: 56, left: 16, right: 16, backgroundColor: colors.card, borderRadius: 20, padding: 14, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 }}>
        <Text style={font.sub}>Xin chào,</Text>
        <Text style={font.h2}>{name ?? 'bạn'} 👋</Text>
      </View>
      <Sheet>
        <Text style={font.h2}>Xe của bạn gặp sự cố?</Text>
        <Text style={[font.sub, { marginTop: 4, marginBottom: 16 }]}>Thợ gần bạn sẽ phản hồi trong vài phút. Bạn chọn thợ và theo dõi trực tiếp trên bản đồ.</Text>
        <Button title="Tạo yêu cầu cứu hộ" icon="construct" onPress={() => { useDraft.getState().setLoc(null); router.push('/request/new'); }} />
        <Row style={{ marginTop: 12, justifyContent: 'center' }} gap={6}>
          <Text style={font.sub}>Bảng giá minh bạch · Phiếu đề xuất rõ ràng trước khi sửa</Text>
        </Row>
      </Sheet>
    </View>
  );
}
