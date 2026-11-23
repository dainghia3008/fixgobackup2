import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

export interface Picked { uri: string; type: 'image' | 'video'; mime: string }

const extOf = (mime: string) => (mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('quicktime') ? 'mov' : mime.includes('mp4') ? 'mp4' : 'jpg');

function toPicked(a: ImagePicker.ImagePickerAsset): Picked {
  const isVideo = a.type === 'video';
  return { uri: a.uri, type: isVideo ? 'video' : 'image', mime: a.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg') };
}

export async function pickFromLibrary(opts: { video?: boolean; multiple?: boolean } = {}): Promise<Picked[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return [];
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: opts.video ? ['images', 'videos'] : ['images'],
    allowsMultipleSelection: !!opts.multiple,
    selectionLimit: opts.multiple ? 5 : 1,
    quality: 0.6,
    videoMaxDuration: 30,
  });
  return res.canceled ? [] : res.assets.map(toPicked);
}

export async function takePhoto(): Promise<Picked | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
  return res.canceled ? null : toPicked(res.assets[0]);
}

export async function uploadToBucket(bucket: 'faces' | 'request-media' | 'cccd', userId: string, file: Picked): Promise<string> {
  const buf = await (await fetch(file.uri)).arrayBuffer();
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extOf(file.mime)}`;
  const { error } = await supabase.storage.from(bucket).upload(path, buf, { contentType: file.mime, upsert: false });
  if (error) throw error;
  return path;
}

export function publicUrl(bucket: 'faces' | 'request-media', path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function signedUrl(bucket: 'cccd', path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
