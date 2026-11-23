import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Screen } from '@/shared/mobile/ui';
import { useAuth } from '@/shared/mobile/auth';
import { colors, font } from '@/shared/mobile/theme';

// Thông báo tài khoản bị khóa (M-01, M-04, A-04)
export default function Locked() {
  const { signOut } = useAuth();
  return (
    <Screen title="Tài khoản bị khóa" scroll={false} footer={<Button title="Đăng xuất" variant="ghost" onPress={signOut} />}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 12 }}>
        <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="lock-closed" size={52} color={colors.danger} />
        </View>
        <Text style={font.h1}>Tài khoản đã bị khóa</Text>
        <Text style={[font.sub, { textAlign: 'center' }]}>Bạn không thể nhận yêu cầu mới. Vui lòng liên hệ quản trị viên FixGo để được hỗ trợ.</Text>
      </View>
    </Screen>
  );
}
