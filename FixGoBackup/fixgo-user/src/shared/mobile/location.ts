import * as Location from 'expo-location';
import type { LatLng } from '../core/types';

export async function ensureLocationPermission(): Promise<boolean> {
  const cur = await Location.getForegroundPermissionsAsync();
  if (cur.granted) return true;
  return (await Location.requestForegroundPermissionsAsync()).granted;
}

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

// Trả về null nếu chưa cấp quyền hoặc tắt định vị (U-04: yêu cầu bật hoặc chọn thủ công)
export async function getCurrentPoint(): Promise<LatLng | null> {
  if (!(await ensureLocationPermission())) return null;
  if (!(await Location.hasServicesEnabledAsync())) return null;
  try {
    const p = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 12000);
    return { lat: p.coords.latitude, lng: p.coords.longitude };
  } catch {
    const last = await Location.getLastKnownPositionAsync();
    return last ? { lat: last.coords.latitude, lng: last.coords.longitude } : null;
  }
}

export async function watchPoints(
  opts: { accuracy: 'balanced' | 'high'; timeInterval: number; distanceInterval: number },
  cb: (p: LatLng & { heading?: number }) => void,
): Promise<() => void> {
  if (!(await ensureLocationPermission())) return () => {};
  const sub = await Location.watchPositionAsync(
    {
      accuracy: opts.accuracy === 'high' ? Location.Accuracy.High : Location.Accuracy.Balanced,
      timeInterval: opts.timeInterval,
      distanceInterval: opts.distanceInterval,
    },
    (loc) => cb({ lat: loc.coords.latitude, lng: loc.coords.longitude, heading: loc.coords.heading ?? undefined }),
  );
  return () => sub.remove();
}
