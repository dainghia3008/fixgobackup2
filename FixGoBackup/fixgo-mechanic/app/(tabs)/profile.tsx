import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Avatar, Badge, Button, Card, Info, Row, Screen, Stars, confirmAsync } from '@/shared/mobile/ui';
import { useAuth } from '@/shared/mobile/auth';
import { publicUrl } from '@/shared/mobile/media';
import { font } from '@/shared/mobile/theme';
import { skillLabel } from '@/shared/core/constants';
import { formatRating } from '@/shared/core/format';
import { useMechanic } from '@/store';
import { goOffline } from '@/actions';

// M-16: hồ sơ thợ – chỉ hiển thị điểm trung bình + số lượt (BR-17)
export default function Profile() {
  const router = useRouter();
  const { signOut } = useAuth();
  const m = useMechanic((s) => s.mechanic);
  if (!m) return null;
  return (
    <Screen title="Hồ sơ thợ">
      <View style={{ alignItems: 'center', marginVertical: 12, gap: 6 }}>
        <Avatar uri={publicUrl('faces', m.face_photo)} name={m.full_name} size={92} />
        <Text style={font.h2}>{m.full_name}</Text>
        <Row gap={6}><Stars value={m.rating_avg} /><Text style={font.sub}>{formatRating(m.rating_avg, m.rating_count)}</Text></Row>
        <Text style={font.sub}>{m.completed_count} đơn đã hoàn thành</Text>
        <Row gap={8}>
          <Badge text="Đã duyệt" tone="success" />
          {m.pending_changes && <Badge text="Thay đổi chờ duyệt" tone="warn" />}
        </Row>
      </View>
      <Card>
        <Info icon="call-outline" label="Số điện thoại" value={m.phone ?? ''} />
        <Info icon="calendar-outline" label="Ngày sinh" value={m.birth_date ?? ''} />
        <Info icon="construct-outline" label="Kỹ năng" value={(m.skills ?? []).map(skillLabel).join(' · ')} />
        {!!m.experience && <Info icon="briefcase-outline" label="Kinh nghiệm" value={m.experience} />}
      </Card>
      <Card>
        <Info icon="id-card-outline" label="Họ tên trên CCCD" value={m.id_full_name ?? ''} />
        <Info icon="keypad-outline" label="Số CCCD" value={m.id_number ?? ''} />
        <Text style={font.sub}>Giấy tờ chỉ bạn và quản trị viên xem được.</Text>
      </Card>
      {m.pending_changes && <Text style={[font.sub, { marginBottom: 10 }]}>Thông tin hiển thị ở trên là bản đã duyệt. Các thay đổi bạn vừa gửi sẽ có hiệu lực sau khi admin duyệt.</Text>}
      <Button title="Chỉnh sửa hồ sơ" icon="create-outline" onPress={() => router.push({ pathname: '/register', params: { edit: '1' } })} style={{ marginBottom: 10 }} />
      <Button title="Đăng xuất" variant="dangerSoft" icon="log-out-outline" onPress={async () => { if (await confirmAsync('Đăng xuất?', 'Bạn sẽ chuyển sang Offline nếu đang hoạt động.', 'Đăng xuất', true)) { if (m.presence === 'online') await goOffline(); signOut(); } }} />
    </Screen>
  );
}
