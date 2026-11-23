'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { useAdminRefresh } from '@/lib/events';
import { OrderBadge, PageHead } from '@/components/Bits';
import { formatDateTime, shortCode } from '@/shared/core/format';
import { incidentLabel } from '@/shared/core/constants';

const LIVE = ['searching', 'selected', 'traveling', 'arrived', 'quote_pending', 'repairing', 'awaiting_payment'];

// A-05: giám sát đơn đang diễn ra (cập nhật real-time qua kênh admin)
export default function Orders() {
  const router = useRouter();
  const [all, setAll] = useState(false);
  const { data, error, reload } = useLoad(async () => {
    let q = supabase.from('orders')
      .select('id, status, created_at, incident_types, license_plate, customer:customers!orders_customer_id_fkey(full_name), mechanic:mechanics!orders_mechanic_id_fkey(full_name)')
      .order('created_at', { ascending: false }).limit(100);
    if (!all) q = q.in('status', LIVE);
    const { data, error } = await q;
    if (error) throw error;
    return data as any[];
  }, [all]);
  useAdminRefresh(['ORDER_CHANGED'], reload);

  return (
    <>
      <PageHead title="Giám sát đơn" sub="Đơn cứu hộ theo thời gian thực" right={
        <div className="tabs" style={{ margin: 0 }}><span className={`tab ${!all ? 'on' : ''}`} onClick={() => setAll(false)}>Đang diễn ra</span><span className={`tab ${all ? 'on' : ''}`} onClick={() => setAll(true)}>Tất cả</span></div>
      } />
      <div className="card">
        {error && <p className="error">{error}</p>}
        <table>
          <thead><tr><th>Mã đơn</th><th>Khách</th><th>Thợ</th><th>Sự cố</th><th>Trạng thái</th><th>Thời gian</th></tr></thead>
          <tbody>
            {data?.map((o) => (
              <tr key={o.id} className="click" onClick={() => router.push(`/orders/${o.id}`)}>
                <td><b>{shortCode(o.id)}</b><div className="muted small">{o.license_plate}</div></td>
                <td>{o.customer?.full_name ?? '—'}</td><td>{o.mechanic?.full_name ?? <span className="muted">Chưa chốt</span>}</td>
                <td className="small">{(o.incident_types as string[]).map(incidentLabel).join(', ')}</td>
                <td><OrderBadge status={o.status} /></td><td>{formatDateTime(o.created_at)}</td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 32 }}>Không có đơn nào.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
