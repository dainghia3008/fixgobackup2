import React, { useState } from 'react';
import { Text } from 'react-native';
import { Button, Field, Screen, toast } from '@/shared/mobile/ui';
import { rpc } from '@/shared/mobile/supabase';
import { font } from '@/shared/mobile/theme';
import { validateName } from '@/shared/core/validation';
import { errorMessage } from '@/shared/core/errors';
import type { CustomerSelf } from '@/shared/core/types';
import { useCustomer } from '@/store';

// U-02: nhập họ tên (đăng nhập Email lần đầu)
export default function NameScreen() {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const e = validateName(name);
    if (e.full_name) { setError(e.full_name); return; }
    setBusy(true);
    try {
      const p = await rpc<CustomerSelf>('update_customer_name', { p_name: name });
      useCustomer.getState().setProfile(p);
    } catch (err) { toast(errorMessage(err), 'error'); } finally { setBusy(false); }
  };
  return (
    <Screen title="Chào mừng bạn!" footer={<Button title="Tiếp tục" onPress={submit} loading={busy} />}>
      <Text style={[font.body, { marginBottom: 16 }]}>Vui lòng cho chúng tôi biết tên của bạn để thợ có thể liên lạc.</Text>
      <Field label="Họ và tên" value={name} onChangeText={(t) => { setName(t); setError(''); }} error={error} placeholder="Nguyễn Văn A" autoFocus />
    </Screen>
  );
}
