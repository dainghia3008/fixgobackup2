import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Avatar, Button, Card, Field, Info, Screen, confirmAsync, toast } from '@/shared/mobile/ui';
import { useAuth } from '@/shared/mobile/auth';
import { rpc } from '@/shared/mobile/supabase';
import { font } from '@/shared/mobile/theme';
import { validateName } from '@/shared/core/validation';
import { errorMessage } from '@/shared/core/errors';
import type { CustomerSelf } from '@/shared/core/types';
import { useCustomer } from '@/store';

const PROVIDER: Record<string, string> = { email: 'Email', google: 'Google', facebook: 'Facebook' };

// U-20
export default function Profile() {
  const { signOut } = useAuth();
  const profile = useCustomer((s) => s.profile);
  const [name, setName] = useState(profile?.full_name ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const e = validateName(name);
    if (e.full_name) { setError(e.full_name); return; }
    setBusy(true);
    try {
      useCustomer.getState().setProfile(await rpc<CustomerSelf>('update_customer_name', { p_name: name }));
      toast('Đã cập nhật họ tên');
    } catch (err) { toast(errorMessage(err), 'error'); } finally { setBusy(false); }
  };

  return (
    <Screen title="Hồ sơ cá nhân">
      <View style={{ alignItems: 'center', marginVertical: 16 }}>
        <Avatar name={profile?.full_name} size={84} />
        <Text style={[font.h2, { marginTop: 10 }]}>{profile?.full_name}</Text>
      </View>
      <Card>
        <Field label="Họ và tên" value={name} onChangeText={(t) => { setName(t); setError(''); }} error={error} />
        <Button title="Lưu thay đổi" onPress={save} loading={busy} disabled={name.trim() === (profile?.full_name ?? '')} />
      </Card>
      <Card>
        <Info icon="mail-outline" label="Email" value={profile?.email ?? '—'} />
        <Info icon="log-in-outline" label="Phương thức đăng nhập" value={PROVIDER[profile?.provider ?? 'email'] ?? profile?.provider ?? ''} />
      </Card>
      <Button title="Đăng xuất" variant="dangerSoft" icon="log-out-outline" onPress={async () => { if (await confirmAsync('Đăng xuất?', 'Bạn có chắc chắn muốn đăng xuất?', 'Đăng xuất', true)) signOut(); }} />
    </Screen>
  );
}
