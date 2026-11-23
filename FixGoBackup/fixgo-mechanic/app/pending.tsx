import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Screen } from '@/shared/mobile/ui';
import { useAuth } from '@/shared/mobile/auth';
import { colors, font } from '@/shared/mobile/theme';
import { useMechanic } from '@/store';

// M-03: chờ duyệt / bị từ chối
export default function Pending() {
  const router = useRouter();
  const { signOut } = useAuth();
  const mech = useMechanic((s) => s.mechanic);
  const rejected = mech?.profile_status === 'rejected';
  return (
    <Screen title="Trạng thái hồ sơ" scroll={false} footer={<Button title="Đăng xuất" variant="ghost" onPress={signOut} />}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 12 }}>
        <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: rejected ? colors.dangerSoft : colors.warnSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={rejected ? 'close-circle' : 'hourglass'} size={56} color={rejected ? colors.danger : colors.warn} />
        </View>
        <Text style={font.h1}>{rejected ? 'Hồ sơ bị từ chối' : 'Hồ sơ đang chờ duyệt'}</Text>
        <Text style={[font.sub, { textAlign: 'center' }]}>
          {rejected ? (mech?.review_note ? `Lý do: ${mech.review_note}` : 'Quản trị viên không nêu lý do. Vui lòng kiểm tra lại thông tin và giấy tờ.') : 'Quản trị viên đang đối chiếu ảnh khuôn mặt và CCCD của bạn. Bạn sẽ nhận thông báo ngay khi có kết quả.'}
        </Text>
        {rejected && <Button title="Chỉnh sửa và gửi lại hồ sơ" icon="create-outline" onPress={() => router.push('/register')} style={{ alignSelf: 'stretch', marginTop: 12 }} />}
      </View>
    </Screen>
  );
}
