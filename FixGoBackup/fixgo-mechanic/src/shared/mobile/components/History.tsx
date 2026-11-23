import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { Badge, Card, EmptyState, Row, Screen, Spinner, Info, H, Stars } from '../ui';
import { colors, font } from '../theme';
import { rpc } from '../supabase';
import { incidentLabel, ORDER_STATUS_LABEL } from '../../core/constants';
import { formatDateTime, formatPriceRange, shortCode } from '../../core/format';
import { errorMessage } from '../../core/errors';
import type { HistoryItem, OrderDetail } from '../../core/types';
import { OrderSummary } from './OrderSummary';
import { QuoteView } from './QuoteView';
import { Avatar } from '../ui';
import { publicUrl } from '../media';

// U-17 / M-14: lịch sử đơn (phân trang theo con trỏ created_at)
export function HistoryList({ role, onOpen, refreshKey }: { role: 'customer' | 'mechanic'; onOpen: (id: string) => void; refreshKey?: number }) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [end, setEnd] = useState(false);
  const fn = role === 'customer' ? 'customer_history' : 'mechanic_history';

  const load = useCallback(async (reset: boolean) => {
    try {
      const before = reset || items.length === 0 ? null : items[items.length - 1].created_at;
      const data = await rpc<HistoryItem[]>(fn, { p_limit: 20, p_before: before });
      setItems((prev) => (reset ? data : [...prev, ...data]));
      setEnd(data.length < 20);
    } catch { /* giữ nguyên danh sách */ }
    setLoading(false); setRefreshing(false);
  }, [fn, items]);

  useEffect(() => { setLoading(true); load(true); }, [refreshKey]);

  if (loading) return <Spinner />;
  return (
    <FlatList
      data={items}
      keyExtractor={(i) => i.id}
      contentContainerStyle={{ padding: 16, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
      onEndReachedThreshold={0.4}
      onEndReached={() => { if (!end && items.length) load(false); }}
      ListEmptyComponent={<EmptyState icon="time-outline" title="Chưa có đơn nào" text="Các đơn cứu hộ đã kết thúc sẽ hiển thị ở đây." />}
      renderItem={({ item }) => (
        <Card onPress={() => onOpen(item.id)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={font.h3}>{shortCode(item.id)}</Text>
            <Badge
              text={item.status === 'cancelled' ? `Đã hủy${item.cancelled_by ? ` bởi ${item.cancelled_by === 'customer' ? 'khách' : 'thợ'}` : ''}` : ORDER_STATUS_LABEL[item.status]}
              tone={item.status === 'cancelled' ? 'danger' : item.status === 'completed' ? 'success' : 'warn'}
            />
          </Row>
          <Text style={[font.body, { marginTop: 6 }]} numberOfLines={1}>{item.incident_types.map(incidentLabel).join(', ')}</Text>
          <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <Text style={font.sub}>{formatDateTime(item.created_at)}</Text>
            <Text style={font.sub}>{role === 'customer' ? (item.mechanic_name ?? 'Chưa chốt thợ') : (item.customer_name ?? 'Khách hàng')}</Text>
          </Row>
          {role === 'customer' && item.needs_review && <View style={{ marginTop: 8 }}><Badge text="Chưa đánh giá" tone="info" /></View>}
        </Card>
      )}
    />
  );
}

// U-18 / M-15: chi tiết đơn – trình tự yêu cầu → đề xuất sơ bộ → phiếu hoàn chỉnh (+ đánh giá, chỉ khách)
export function HistoryDetail({ orderId, onBack, actions, refreshKey }: { orderId: string; onBack: () => void; actions?: (d: OrderDetail) => React.ReactNode; refreshKey?: number }) {
  const [d, setD] = useState<OrderDetail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { rpc<OrderDetail>('order_detail', { p_order_id: orderId }).then(setD).catch((e) => setError(errorMessage(e))); }, [orderId, refreshKey]);

  return (
    <Screen title="Chi tiết đơn" subtitle={shortCode(orderId)} onBack={onBack}>
      {!d && !error && <Spinner />}
      {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
      {d && (
        <>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <Badge text={ORDER_STATUS_LABEL[d.order.status]} tone={d.order.status === 'cancelled' ? 'danger' : d.order.status === 'completed' ? 'success' : 'warn'} />
              <Text style={font.sub}>{formatDateTime(d.order.created_at)}</Text>
            </Row>
            {d.order.status === 'cancelled' && (
              <Text style={[font.sub, { marginTop: 8 }]}>Hủy bởi {d.order.cancelled_by === 'customer' ? 'khách hàng' : 'thợ'}{d.order.cancel_reason ? ` · ${d.order.cancel_reason}` : ''}</Text>
            )}
          </Card>
          <H>1. Yêu cầu cứu hộ</H>
          <OrderSummary order={d.order} />
          {d.order.mechanic && d.order.proposal && (
            <>
              <H>2. Đề xuất sơ bộ của thợ</H>
              <Card>
                <Row>
                  <Avatar uri={publicUrl('faces', d.order.mechanic.face_photo)} name={d.order.mechanic.full_name} />
                  <View style={{ flex: 1 }}>
                    <Text style={font.h3}>{d.order.mechanic.full_name}</Text>
                    <Stars value={d.order.mechanic.rating_avg} size={14} />
                  </View>
                </Row>
                <Info icon="chatbubble-ellipses-outline" label="Nhận định ban đầu" value={d.order.proposal.assessment} />
                <Info icon="cash-outline" label="Khoảng giá" value={formatPriceRange(d.order.proposal.price_min, d.order.proposal.price_max)} />
                <Info icon="time-outline" label="Thời gian đến" value={`${d.order.proposal.eta_minutes} phút`} />
              </Card>
            </>
          )}
          {d.quote && (<><H>3. Phiếu đề xuất hoàn chỉnh</H><QuoteView quote={d.quote} showStatus /></>)}
          {d.review && (
            <>
              <H>Đánh giá của bạn</H>
              <Card><Stars value={d.review.stars} size={20} />{!!d.review.comment && <Text style={[font.body, { marginTop: 6 }]}>{d.review.comment}</Text>}</Card>
            </>
          )}
          {actions?.(d)}
        </>
      )}
    </Screen>
  );
}
