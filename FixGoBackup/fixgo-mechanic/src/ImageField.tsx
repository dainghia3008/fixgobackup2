import React, { useEffect, useState } from 'react';
import { Alert, Image, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { pickFromLibrary, publicUrl, signedUrl, takePhoto, type Picked } from '@/shared/mobile/media';
import { colors, font, radius } from '@/shared/mobile/theme';

export interface ImgValue { path: string | null; local: Picked | null }
export const emptyImg: ImgValue = { path: null, local: null };

// Ô chọn ảnh (chụp hoặc chọn từ thư viện). bucket 'faces' hiển thị công khai; 'cccd' dùng signed URL (chỉ chủ sở hữu/admin xem được).
export function ImageField({ label, value, onChange, bucket, error, round }: {
  label: string; value: ImgValue; onChange: (v: ImgValue) => void; bucket: 'faces' | 'cccd'; error?: string; round?: boolean;
}) {
  const [remote, setRemote] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (value.local || !value.path) { setRemote(null); return; }
    if (bucket === 'faces') setRemote(publicUrl('faces', value.path));
    else signedUrl('cccd', value.path).then((u) => alive && setRemote(u));
    return () => { alive = false; };
  }, [value.path, value.local, bucket]);

  const choose = () => Alert.alert(label, 'Chọn nguồn ảnh', [
    { text: 'Chụp ảnh', onPress: async () => { const p = await takePhoto(); if (p) onChange({ path: value.path, local: p }); } },
    { text: 'Thư viện', onPress: async () => { const [p] = await pickFromLibrary(); if (p) onChange({ path: value.path, local: p }); } },
    { text: 'Hủy', style: 'cancel' },
  ]);
  const uri = value.local?.uri ?? remote;
  return (
    <View style={{ marginBottom: 14, flex: 1 }}>
      <Text style={[font.label, { marginBottom: 6 }]}>{label}</Text>
      <Pressable onPress={choose} style={{ height: round ? 120 : 110, width: round ? 120 : undefined, borderRadius: round ? 60 : radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: error ? colors.danger : colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : (
          <View style={{ alignItems: 'center', gap: 4 }}><Ionicons name="camera-outline" size={28} color={colors.sub} /><Text style={font.sub}>Chạm để chọn ảnh</Text></View>
        )}
      </Pressable>
      {!!error && <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>{error}</Text>}
    </View>
  );
}
