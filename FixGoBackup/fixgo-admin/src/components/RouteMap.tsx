'use client';
import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Hành trình của thợ (nhật ký vị trí) + điểm cứu hộ của khách
export default function RouteMap({ customer, points }: { customer: { lat: number; lng: number }; points: { lat: number; lng: number }[] }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
    const map = new mapboxgl.Map({ container: el.current, style: 'mapbox://styles/mapbox/streets-v12', center: [customer.lng, customer.lat], zoom: 13 });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }));
    new mapboxgl.Marker({ color: '#e5484d' }).setLngLat([customer.lng, customer.lat]).setPopup(new mapboxgl.Popup().setText('Vị trí cứu hộ')).addTo(map);
    map.on('load', () => {
      if (points.length > 1) {
        const coords = points.map((p) => [p.lng, p.lat]);
        map.addSource('trail', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } } });
        map.addLayer({ id: 'trail', type: 'line', source: 'trail', paint: { 'line-color': '#00b14f', 'line-width': 5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
        new mapboxgl.Marker({ color: '#00b14f' }).setLngLat(coords[0]).setPopup(new mapboxgl.Popup().setText('Điểm xuất phát của thợ')).addTo(map);
        const b = new mapboxgl.LngLatBounds(coords[0], coords[0]);
        coords.forEach((c: number[]) => b.extend(c as [number, number]));
        b.extend([customer.lng, customer.lat]);
        map.fitBounds(b, { padding: 50, duration: 0 });
      }
    });
    return () => map.remove();
  }, [customer.lat, customer.lng, points.length]);
  return <div ref={el} className="map" />;
}
