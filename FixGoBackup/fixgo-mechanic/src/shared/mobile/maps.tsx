import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import { Ionicons } from '@expo/vector-icons';
import { ENV } from './env';
import { colors, shadowSm } from './theme';
import type { LatLng } from '../core/types';

Mapbox.setAccessToken(ENV.MAPBOX_TOKEN);

export interface MapMarker { id: string; lat: number; lng: number; kind: 'customer' | 'mechanic' | 'pin'; pulsing?: boolean }

const PULSE_SIZE = 120;
const PULSE_MAX_SCALE = 2.6;

const ICON: Record<MapMarker['kind'], { name: React.ComponentProps<typeof Ionicons>['name']; bg: string }> = {
  customer: { name: 'location', bg: colors.danger },
  mechanic: { name: 'construct', bg: colors.primary },
  pin: { name: 'flag', bg: colors.info },
};

export function MarkerBubble({ kind }: { kind: MapMarker['kind'] }) {
  const i = ICON[kind];
  return (
    <View style={[st.bubble, { backgroundColor: i.bg }]}>
      <Ionicons name={i.name} size={18} color="#fff" />
    </View>
  );
}

function PulsingMarkerBubble({ kind }: { kind: MapMarker['kind'] }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.timing(pulse, {
      toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }));
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    // Keep the annotation bounds fixed while the ring scales around the marker.
    <View pointerEvents="none" style={st.pulsingMarker}>
      <Animated.View style={[st.pulseRing, {
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, PULSE_MAX_SCALE] }) }],
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
      }]} />
      <MarkerBubble kind={kind} />
    </View>
  );
}

// Một bản đồ dùng cho mọi màn hình: chọn vị trí, theo dõi thợ, xem tuyến.
export function AppMap(props: {
  center?: LatLng | null;
  zoom?: number;
  markers?: MapMarker[];
  route?: [number, number][] | null;
  fit?: boolean;                       // tự canh khung theo các marker
  fitPadding?: { top: number; bottom: number; left?: number; right?: number };
  showUser?: boolean;
  onIdle?: (c: LatLng) => void;        // dùng cho chọn vị trí (kéo bản đồ, ghim cố định giữa)
  onCenterChange?: (c: LatLng) => void; // theo thao tác kéo, kể cả khi Android không phát onMapIdle
  centerPin?: boolean;
  style?: any;
}) {
  const { center, zoom = 15, markers = [], route, fit, fitPadding, showUser, onIdle, onCenterChange, centerPin, style } = props;
  const movingFromGesture = useRef(false);
  // Bỏ qua các tọa độ trung gian khi tìm địa chỉ/GPS chủ động di chuyển camera.
  useEffect(() => { movingFromGesture.current = false; }, [center]);
  // Giữ nguyên camera khi màn hình chỉ cập nhật địa chỉ hoặc kết quả tìm kiếm.
  const centerCoordinate = useMemo(
    () => center ? [center.lng, center.lat] : undefined,
    [center],
  );
  const shape = useMemo(
    () => (route && route.length > 1 ? ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route } } as any) : null),
    [route],
  );
  const bounds = useMemo(() => {
    if (!fit || markers.length === 0) return undefined;
    const lats = markers.map((m) => m.lat);
    const lngs = markers.map((m) => m.lng);
    const pad = 0.0006;
    return {
      ne: [Math.max(...lngs) + pad, Math.max(...lats) + pad] as [number, number],
      sw: [Math.min(...lngs) - pad, Math.min(...lats) - pad] as [number, number],
      paddingTop: fitPadding?.top ?? 100, paddingBottom: fitPadding?.bottom ?? 260,
      paddingLeft: fitPadding?.left ?? 60, paddingRight: fitPadding?.right ?? 60,
    };
  }, [fit, markers.map((m) => `${m.id}:${m.lat.toFixed(4)}:${m.lng.toFixed(4)}`).join('|'), fitPadding?.top, fitPadding?.bottom]);

  return (
    <View style={[{ flex: 1 }, style]}>
      <Mapbox.MapView
        style={{ flex: 1 }}
        styleURL={Mapbox.StyleURL.Street}
        logoEnabled={false}
        scaleBarEnabled={false}
        compassEnabled={false}
        rotateEnabled={false}
        onCameraChanged={onCenterChange ? (e) => {
          if (e.gestures.isGestureActive) movingFromGesture.current = true;
          const c = e.properties.center;
          // Tiếp tục lấy tọa độ khi bản đồ trượt theo quán tính sau khi thả tay.
          if (movingFromGesture.current) onCenterChange({ lat: c[1], lng: c[0] });
        } : undefined}
        onMapIdle={onIdle ? (e: any) => {
          const c = e?.properties?.center;
          if (c) onIdle({ lat: c[1], lng: c[0] });
        } : undefined}
      >
        {bounds ? (
          <Mapbox.Camera bounds={bounds} animationMode="easeTo" animationDuration={700} />
        ) : center ? (
          <Mapbox.Camera centerCoordinate={centerCoordinate} zoomLevel={zoom} animationMode="easeTo" animationDuration={600} />
        ) : null}
        {showUser && <Mapbox.LocationPuck puckBearingEnabled pulsing={{ isEnabled: true }} />}
        {shape && (
          <Mapbox.ShapeSource id="route" shape={shape}>
            <Mapbox.LineLayer id="route-casing" style={{ lineColor: '#ffffff', lineWidth: 9, lineCap: 'round', lineJoin: 'round' }} />
            <Mapbox.LineLayer id="route-line" style={{ lineColor: colors.primary, lineWidth: 5.5, lineCap: 'round', lineJoin: 'round' }} />
          </Mapbox.ShapeSource>
        )}
        {markers.map((m) => (
          <Mapbox.MarkerView key={m.id} id={m.id} coordinate={[m.lng, m.lat]} anchor={{ x: 0.5, y: 0.5 }} allowOverlap={m.pulsing} pointerEvents={m.pulsing ? 'none' : undefined}>
            {m.pulsing ? <PulsingMarkerBubble kind={m.kind} /> : <MarkerBubble kind={m.kind} />}
          </Mapbox.MarkerView>
        ))}
      </Mapbox.MapView>
      {centerPin && (
        <View pointerEvents="none" style={st.centerPin}>
          <View style={[st.bubble, { backgroundColor: colors.danger, width: 40, height: 40, borderRadius: 20 }]}>
            <Ionicons name="location" size={22} color="#fff" />
          </View>
          <View style={st.pinTail} />
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  pulsingMarker: { width: PULSE_SIZE * PULSE_MAX_SCALE, height: PULSE_SIZE * PULSE_MAX_SCALE, alignItems: 'center', justifyContent: 'center' },
  pulseRing: { position: 'absolute', top: '50%', left: '50%', marginTop: -PULSE_SIZE / 2, marginLeft: -PULSE_SIZE / 2, width: PULSE_SIZE, height: PULSE_SIZE, borderRadius: PULSE_SIZE / 2, backgroundColor: colors.primary },
  bubble: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff', ...shadowSm },
  centerPin: { position: 'absolute', top: '50%', left: '50%', marginLeft: -20, marginTop: -58, alignItems: 'center' },
  pinTail: { width: 3, height: 16, backgroundColor: colors.danger, borderRadius: 2 },
});
