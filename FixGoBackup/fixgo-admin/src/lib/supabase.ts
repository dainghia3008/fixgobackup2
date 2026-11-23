import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://missing.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_KEY ?? 'missing',
  { auth: { persistSession: true, autoRefreshToken: true } },
);

export async function rpc<T = any>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const publicFace = (path?: string | null) => (path ? supabase.storage.from('faces').getPublicUrl(path).data.publicUrl : null);
export async function signedCccd(path?: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from('cccd').createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}
