import React from 'react';
import { Text, View } from 'react-native';
import { Avatar, Row, Stars } from '../ui';
import { font } from '../theme';
import { formatRating } from '../../core/format';
import { publicUrl } from '../media';
import type { MechanicPublic } from '../../core/types';

export function MechanicCard({ mechanic, size = 52, right }: { mechanic: MechanicPublic; size?: number; right?: React.ReactNode }) {
  return (
    <Row>
      <Avatar uri={publicUrl('faces', mechanic.face_photo)} name={mechanic.full_name} size={size} />
      <View style={{ flex: 1 }}>
        <Text style={font.h3} numberOfLines={1}>{mechanic.full_name ?? 'Thợ'}</Text>
        <Row gap={6}>
          <Stars value={mechanic.rating_avg} size={14} />
          <Text style={font.sub}>{formatRating(mechanic.rating_avg, mechanic.rating_count)}</Text>
        </Row>
        <Text style={font.sub}>{mechanic.completed_count} đơn đã hoàn thành</Text>
      </View>
      {right}
    </Row>
  );
}
