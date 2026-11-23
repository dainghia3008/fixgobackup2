import React, { useEffect, useState } from 'react';
import { Text, View, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppMap } from '@/shared/mobile/maps';
import { Button, Card, Chip, Field, H, Row, Screen, toast } from '@/shared/mobile/ui';
import { getCurrentPoint } from '@/shared/mobile/location';
import { reverseGeocode } from '@/shared/mobile/mapbox-api';
import { pickFromLibrary, takePhoto, uploadToBucket, type Picked } from '@/shared/mobile/media';
import { useAuth } from '@/shared/mobile/auth';
import { colors, font } from '@/shared/mobile/theme';
import { INCIDENT_TYPES } from '@/shared/core/constants';
import { normalizePlate, validateRequestForm, type Errors } from '@/shared/core/validation';
import { errorCode, errorMessage } from '@/shared/core/errors';
import type { Media } from '@/shared/core/types';
import { createRequest, resync } from '@/actions';
import { useDraft } from '@/draft';

// U-04: tạo yêu cầu cứu hộ
export default function NewRequest() {
  const router = useRouter();
  const { session } = useAuth();
  const loc = useDraft((s) => s.loc);
  const [locError, setLocError] = useState(false);
  const [types, setTypes] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [plate, setPlate] = useState('');
  const [desc, setDesc] = useState('');
  const [files, setFiles] = useState<Picked[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  // Mặc định: vị trí hiện tại (GPS)
  useEffect(() => {
    if (useDraft.getState().loc) return;
    let cancelled = false;
    const ctrl = new AbortController();
    (async () => {
      const p = await getCurrentPoint();
      if (cancelled || useDraft.getState().loc) return;
      if (!p) { setLocError(true); return; }
      const address = (await reverseGeocode(p, ctrl.signal)) ?? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
      // Người dùng có thể đã chọn thủ công trong lúc GPS/địa chỉ đang tải.
      if (cancelled || useDraft.getState().loc) return;
      useDraft.getState().setLoc({ ...p, address });
    })();
    return () => { cancelled = true; ctrl.abort(); };
  }, []);

  const toggle = (c: string) => { setTypes((t) => (t.includes(c) ? t.filter((x) => x !== c) : [...t, c])); setErrors((e) => ({ ...e, incident_types: '' })); };

  const addMedia = async (source: 'camera' | 'library') => {
    if (files.length >= 5) { toast('Tối đa 5 tệp'); return; }
    if (source === 'camera') { const p = await takePhoto(); if (p) setFiles((f) => [...f, p]); }
    else { const picked = await pickFromLibrary({ video: true, multiple: true }); setFiles((f) => [...f, ...picked].slice(0, 5)); }
  };

  const submit = async () => {
    const e = validateRequestForm({ lat: loc?.lat ?? null, lng: loc?.lng ?? null, incident_types: types, vehicle_model: model, license_plate: plate, description: desc });
    setErrors(e);
    if (Object.keys(e).length || !loc || !session) return;
    setBusy(true);
    try {
      const media: Media[] = [];
      for (const f of files) media.push({ path: await uploadToBucket('request-media', session.user.id, f), type: f.type });
      await createRequest({
        lat: loc.lat, lng: loc.lng, address: loc.address, incident_types: types,
        vehicle_model: model.trim(), license_plate: normalizePlate(plate), description: desc.trim(), media,
      });
      // điều hướng sang U-06 do useNavSync đảm nhiệm
    } catch (err) {
      toast(errorMessage(err), 'error');
      if (errorCode(err) === 'ACTIVE_ORDER_EXISTS') resync();
    } finally { setBusy(false); }
  };

  return (
    <Screen title="Yêu cầu cứu hộ" onBack={() => router.back()} footer={<Button title="Gửi yêu cầu cứu hộ" icon="send" onPress={submit} loading={busy} />}>
      <H>Vị trí cứu hộ</H>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <View style={{ height: 150 }}>
          {loc ? <AppMap center={loc} zoom={16} markers={[{ id: 'me', lat: loc.lat, lng: loc.lng, kind: 'customer' }]} /> : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 16 }}>
              <Text style={[font.sub, { textAlign: 'center' }]}>{locError ? 'Không lấy được vị trí. Hãy bật định vị / cấp quyền, hoặc chọn vị trí thủ công.' : 'Đang xác định vị trí…'}</Text>
            </View>
          )}
        </View>
        <Row style={{ padding: 14 }}>
          <Ionicons name="location" size={20} color={colors.danger} />
          <Text style={[font.body, { flex: 1 }]} numberOfLines={2}>{loc?.address ?? 'Chưa có vị trí'}</Text>
          <Button title="Đổi vị trí" variant="secondary" small onPress={() => router.push('/request/location')} />
        </Row>
      </Card>
      {!!errors.location && <Text style={{ color: colors.danger, marginBottom: 8 }}>{errors.location}</Text>}

      <H>Loại sự cố (chọn nhiều)</H>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {INCIDENT_TYPES.map((i) => <Chip key={i.code} label={i.label} icon={i.icon as any} selected={types.includes(i.code)} onPress={() => toggle(i.code)} />)}
      </View>
      {!!errors.incident_types && <Text style={{ color: colors.danger, marginBottom: 8 }}>{errors.incident_types}</Text>}

      <H>Thông tin xe máy</H>
      <Field label="Dòng xe" value={model} onChangeText={setModel} placeholder="VD: Honda Vision 2021" error={errors.vehicle_model} />
      <Field label="Biển số" value={plate} onChangeText={setPlate} placeholder="VD: 59X1-123.45" autoCapitalize="characters" error={errors.license_plate} />
      <Field label="Mô tả sự cố" value={desc} onChangeText={setDesc} placeholder="Mô tả chi tiết tình trạng xe (tiếng động, đèn báo, lần cuối hoạt động bình thường…)" multiline error={errors.description} />

      <H>Hình ảnh / Video (không bắt buộc)</H>
      <Row style={{ flexWrap: 'wrap' }}>
        {files.map((f, i) => (
          <View key={f.uri + i}>
            {f.type === 'image' ? <Image source={{ uri: f.uri }} style={{ width: 76, height: 76, borderRadius: 12 }} /> : (
              <View style={{ width: 76, height: 76, borderRadius: 12, backgroundColor: '#101828', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="videocam" size={26} color="#fff" /></View>
            )}
            <Pressable onPress={() => setFiles((x) => x.filter((_, j) => j !== i))} style={{ position: 'absolute', top: -6, right: -6, backgroundColor: colors.danger, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={13} color="#fff" />
            </Pressable>
          </View>
        ))}
        {files.length < 5 && (
          <>
            <Pressable onPress={() => addMedia('camera')} style={{ width: 76, height: 76, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="camera-outline" size={26} color={colors.sub} /></Pressable>
            <Pressable onPress={() => addMedia('library')} style={{ width: 76, height: 76, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="images-outline" size={26} color={colors.sub} /></Pressable>
          </>
        )}
      </Row>
    </Screen>
  );
}
