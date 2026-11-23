'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { useAdminRefresh } from '@/lib/events';
import { Badge, PageHead } from '@/components/Bits';
import { formatDateTime, shortCode } from '@/shared/core/format';

// A-06: danh sách khiếu nại
export default function Reports() {
  const router = useRouter();
  const [tab, setTab] = useState<'open' | 'resolved' | 'all'>('open');
  const { data, error, reload } = useLoad(async () => {
    let q = supabase.from('reports')
      .select('id, kind, status, created_at, order_id, customer:customers!reports_customer_id_fkey(full_name), mechanic:mechanics!reports_mechanic_id_fkey(full_name)')
      .order('created_at', { ascending: false }).limit(200);
    if (tab !== 'all') q = q.eq('status', tab);
    const { data, error } = await q;
    if (error) throw error;
    return data as any[];
  }, [tab]);
  useAdminRefresh(['REPORT_CREATED'], reload);

  return (
    <>
      <PageHead title="Khiếu nại" sub="Báo cáo do khách gửi" />
      <div className="tabs">
        {([['open', 'Chưa xử lý'], ['resolved', 'Đã xử lý'], ['all', 'Tất cả']] as const).map(([k, l]) => <span key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</span>)}
      </div>
      <div className="card">
        {error && <p className="error">{error}</p>}
        <table>
          <thead><tr><th>Đơn</th><th>Loại</th><th>Khách</th><th>Thợ bị báo cáo</th><th>Thời gian</th><th>Trạng thái</th></tr></thead>
          <tbody>
            {data?.map((r) => (
              <tr key={r.id} className="click" onClick={() => router.push(`/reports/${r.id}`)}>
                <td><b>{shortCode(r.order_id)}</b></td>
                <td>{r.kind === 'mechanic' ? 'Báo cáo thợ' : 'Vấn đề cứu hộ'}</td>
                <td>{r.customer?.full_name ?? '—'}</td><td>{r.mechanic?.full_name ?? '—'}</td><td>{formatDateTime(r.created_at)}</td>
                <td>{r.status === 'open' ? <Badge tone="orange">Chưa xử lý</Badge> : <Badge tone="green">Đã xử lý</Badge>}</td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 32 }}>Không có khiếu nại.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
