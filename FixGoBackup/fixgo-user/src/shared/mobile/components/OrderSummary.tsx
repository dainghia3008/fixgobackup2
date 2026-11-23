import React from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Card, Info, Row } from '../ui';
import { colors, font, radius } from '../theme';
import { incidentLabel } from '../../core/constants';
import { publicUrl } from '../media';
import type { Media } from '../../core/types';

export interface RequestLike {
  address: string; incident_types: string[]; vehicle_model: string; license_plate: string; description: string; media: Media[];
}

export function MediaStrip({ media }: { media: Media[] }) {
  if (!media?.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
      {media.map((m) => {
        const url = publicUrl('request-media', m.path);
        if (!url) return null;
        return m.type === 'image' ? (
          <Pressable key={m.path} onPress={() => Linking.openURL(url)}>
            <Image source={{ uri: url }} style={{ width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.line }} />
          </Pressable>
        ) : (
          <Pressable key={m.path} onPress={() => Linking.openURL(url)} style={{ width: 84, height: 84, borderRadius: radius.md, backgroundColor: '#101828', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="play-circle" size={34} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 10 }}>Video</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Nội dung yêu cầu của khách (U-07, M-05, M-08, M-15, U-18)
export function OrderSummary({ order, extra }: { order: RequestLike; extra?: React.ReactNode }) {
  return (
    <Card>
      <Row style={{ flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {order.incident_types.map((c) => <Badge key={c} text={incidentLabel(c)} tone="info" />)}
      </Row>
      <Info icon="location-outline" label="Vị trí cứu hộ" value={order.address} />
      <Info icon="bicycle-outline" label="Xe" value={`${order.vehicle_model} · ${order.license_plate}`} />
      <Info icon="document-text-outline" label="Mô tả" value={order.description} />
      {order.media.length > 0 && <Info icon="images-outline" label="Ảnh / video" value={<MediaStrip media={order.media} />} />}
      {extra}
    </Card>
  );
}
