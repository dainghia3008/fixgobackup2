'use client';
import { useParams, useRouter } from 'next/navigation';
import { rpc } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { useAdminRefresh } from '@/lib/events';
import { PageHead } from '@/components/Bits';
import { OrderLog, type OrderLogData } from '@/components/OrderLog';

// A-05: chi tiết đơn (vị trí, hành trình, trạng thái, phiếu hiện hành và các phiên bản)
export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, reload } = useLoad(() => rpc<OrderLogData>('admin_order_log', { p_order_id: id }), [id]);
  useAdminRefresh(['ORDER_CHANGED'], reload);
  return (
    <>
      <PageHead title="Chi tiết đơn" right={<button className="btn ghost" onClick={() => router.back()}>← Quay lại</button>} />
      {loading && <p className="muted">Đang tải…</p>}
      {error && <p className="error">{error}</p>}
      {data && <OrderLog d={data} />}
    </>
  );
}
