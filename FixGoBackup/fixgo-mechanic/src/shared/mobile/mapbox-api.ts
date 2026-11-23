import { ENV } from './env';
import type { LatLng } from '../core/types';
import type { Route } from '../core/geo';

export interface GeoResult { id: string; title: string; address: string; lat: number; lng: number }

// Mapbox Search – Geocoding v6
export async function geocodeSearch(q: string, near?: LatLng | null, signal?: AbortSignal): Promise<GeoResult[]> {
  if (q.trim().length < 3) return [];
  const prox = near ? `&proximity=${near.lng},${near.lat}` : '';
  const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q)}&country=vn&language=vi&limit=6&autocomplete=true${prox}&access_token=${ENV.MAPBOX_TOKEN}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const j = await res.json();
  return (j.features ?? []).map((f: any) => ({
    id: f.id,
    title: f.properties?.name ?? f.properties?.full_address ?? '',
    address: f.properties?.full_address ?? f.properties?.place_formatted ?? '',
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
}

export async function reverseGeocode(p: LatLng, signal?: AbortSignal): Promise<string | null> {
  const url = `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${p.lng}&latitude=${p.lat}&language=vi&limit=1&access_token=${ENV.MAPBOX_TOKEN}`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const j = await res.json();
    const f = j.features?.[0];
    return f?.properties?.full_address ?? f?.properties?.place_formatted ?? null;
  } catch {
    return null;
  }
}

// Mapbox Directions: tuyến + chỉ dẫn từng chặng (M-09). Gọi 1 lần khi bắt đầu và chỉ gọi lại khi lệch tuyến.
export async function fetchRoute(from: LatLng, to: LatLng, signal?: AbortSignal): Promise<Route | null> {
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&overview=full&steps=true&language=vi&access_token=${ENV.MAPBOX_TOKEN}`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const j = await res.json();
    const r = j.routes?.[0];
    if (!r) return null;
    return {
      distance: r.distance,
      duration: r.duration,
      coordinates: r.geometry.coordinates,
      steps: (r.legs?.[0]?.steps ?? []).map((s: any) => ({
        instruction: s.maneuver?.instruction ?? '',
        distance: s.distance,
        duration: s.duration,
        type: s.maneuver?.type ?? '',
        modifier: s.maneuver?.modifier,
        location: s.maneuver?.location,
      })),
    };
  } catch {
    return null;
  }
}
