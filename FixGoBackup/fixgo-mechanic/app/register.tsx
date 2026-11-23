import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Chip, Field, H, Row, Screen, toast } from '@/shared/mobile/ui';
import { uploadToBucket } from '@/shared/mobile/media';
import { useAuth } from '@/shared/mobile/auth';
import { colors, font } from '@/shared/mobile/theme';
import { SKILLS } from '@/shared/core/constants';
import { validateMechanicProfile, type Errors } from '@/shared/core/validation';
import { errorMessage } from '@/shared/core/errors';
import type { MechanicProfileInput } from '@/shared/core/types';
import { useMechanic } from '@/store';
import { submitProfile } from '@/actions';
import { ImageField, type ImgValue } from '@/ImageField';

// M-02 đăng ký hồ sơ · M-16 (?edit=1) chỉnh sửa hồ sơ → gửi admin duyệt (BR-16)
export default function Register() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const mech = useMechanic((s) => s.mechanic);
  const src: Partial<MechanicProfileInput> = (edit && mech?.pending_changes ? mech.pending_changes : (mech as any)) ?? {};

  const [face, setFace] = useState<ImgValue>({ path: src.face_photo ?? null, local: null });
  const [name, setName] = useState(src.full_name ?? '');
  const [phone, setPhone] = useState(src.phone ?? '');
  const [birth, setBirth] = useState(src.birth_date ?? '');
  const [skills, setSkills] = useState<string[]>(src.skills ?? []);
  const [exp, setExp] = useState(src.experience ?? '');
  const [idName, setIdName] = useState(src.id_full_name ?? '');
  const [idNum, setIdNum] = useState(src.id_number ?? '');
  const [front, setFront] = useState<ImgValue>({ path: src.id_front ?? null, local: null });
  const [back, setBack] = useState<ImgValue>({ path: src.id_back ?? null, local: null });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const has = (v: ImgValue) => (v.local ? 'local' : v.path ?? '');
  const submit = async () => {
    const e = validateMechanicProfile({
      face_photo: has(face), full_name: name, phone, birth_date: birth, skills, experience: exp,
      id_full_name: idName, id_number: idNum, id_front: has(front), id_back: has(back),
    });
    setErrors(e);
    if (Object.keys(e).length || !session) { if (Object.keys(e).length) toast('Vui lòng kiểm tra các trường báo đỏ', 'warn'); return; }
    setBusy(true);
    try {
      const up = async (v: ImgValue, bucket: 'faces' | 'cccd') => (v.local ? uploadToBucket(bucket, session.user.id, v.local) : (v.path as string));
      const [face_photo, id_front, id_back] = await Promise.all([up(face, 'faces'), up(front, 'cccd'), up(back, 'cccd')]);
      await submitProfile({
        face_photo, full_name: name.trim(), phone: phone.replace(/\s/g, ''), birth_date: birth.trim(), skills,
        experience: exp.trim() || null, id_full_name: idName.trim(), id_number: idNum.trim(), id_front, id_back,
      });
      toast(edit ? 'Đã gửi thay đổi, chờ admin duyệt' : 'Đã gửi hồ sơ, chờ admin duyệt');
      if (router.canGoBack()) router.back(); // đăng ký mới: useNavSync tự chuyển sang M-03
    } catch (err) { toast(errorMessage(err), 'error'); } finally { setBusy(false); }
  };

  return (
    <Screen
      title={edit ? 'Chỉnh sửa hồ sơ' : 'Đăng ký hồ sơ thợ'}
      onBack={router.canGoBack() ? () => router.back() : undefined}
      footer={<Button title={edit ? 'Gửi thay đổi' : 'Gửi hồ sơ'} icon="send" onPress={submit} loading={busy} />}
    >
      {!edit && <Text style={[font.sub, { marginBottom: 12 }]}>Hồ sơ của bạn sẽ được quản trị viên duyệt thủ công. Chỉ chấp nhận CCCD để xác minh danh tính.</Text>}
      <H>Ảnh khuôn mặt</H>
      <View style={{ alignItems: 'center' }}><ImageField label="Ảnh chân dung (chụp rõ mặt)" value={face} onChange={setFace} bucket="faces" error={errors.face_photo} round /></View>

      <H>Thông tin cá nhân</H>
      <Field label="Họ tên" value={name} onChangeText={setName} error={errors.full_name} placeholder="Nguyễn Văn A" />
      <Field label="Số điện thoại" value={phone} onChangeText={setPhone} error={errors.phone} keyboardType="phone-pad" placeholder="0901234567" />
      <Field label="Ngày sinh (YYYY-MM-DD)" value={birth} onChangeText={setBirth} error={errors.birth_date} keyboardType="numbers-and-punctuation" placeholder="1995-05-20" />

      <H>Kỹ năng (chọn ít nhất 1)</H>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {SKILLS.map((k) => <Chip key={k.code} label={k.label} selected={skills.includes(k.code)} onPress={() => setSkills((s) => (s.includes(k.code) ? s.filter((x) => x !== k.code) : [...s, k.code]))} />)}
      </View>
      {!!errors.skills && <Text style={{ color: colors.danger, marginBottom: 8 }}>{errors.skills}</Text>}
      <Field label="Kinh nghiệm (không bắt buộc)" value={exp} onChangeText={setExp} multiline placeholder="VD: 5 năm sửa xe máy tại tiệm…" style={{ marginTop: 8 }} />

      <H>Xác minh danh tính bằng CCCD</H>
      <Field label="Họ tên trên giấy tờ (IN HOA có dấu)" value={idName} onChangeText={(t) => setIdName(t.toLocaleUpperCase('vi-VN'))} error={errors.id_full_name} autoCapitalize="characters" placeholder="NGUYỄN VĂN A" />
      <Field label="Số CCCD (12 chữ số)" value={idNum} onChangeText={(t) => setIdNum(t.replace(/\D/g, '').slice(0, 12))} error={errors.id_number} keyboardType="number-pad" placeholder="079095001234" />
      <Row style={{ alignItems: 'flex-start' }} gap={10}>
        <ImageField label="Mặt trước CCCD" value={front} onChange={setFront} bucket="cccd" error={errors.id_front} />
        <ImageField label="Mặt sau CCCD" value={back} onChange={setBack} bucket="cccd" error={errors.id_back} />
      </Row>
    </Screen>
  );
}
