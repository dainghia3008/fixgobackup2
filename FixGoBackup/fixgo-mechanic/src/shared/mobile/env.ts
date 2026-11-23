// Biến EXPO_PUBLIC_* được Expo "nướng" vào bản build; phải truy cập theo dạng process.env.TÊN (không dùng động).
export const ENV = {
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  SUPABASE_KEY: process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '',
  MAPBOX_TOKEN: process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '',
  STREAM_KEY: process.env.EXPO_PUBLIC_STREAM_API_KEY ?? '',
};

export function missingEnv(): string[] {
  const names: Record<string, string> = {
    SUPABASE_URL: 'EXPO_PUBLIC_SUPABASE_URL',
    SUPABASE_KEY: 'EXPO_PUBLIC_SUPABASE_KEY',
    MAPBOX_TOKEN: 'EXPO_PUBLIC_MAPBOX_TOKEN',
    STREAM_KEY: 'EXPO_PUBLIC_STREAM_API_KEY',
  };
  return Object.entries(ENV).filter(([, v]) => !v).map(([k]) => names[k]);
}
