'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { rpc, supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { Badge, KV, PageHead } from '@/components/Bits';
import { OrderLog, type OrderLogData } from '@/components/OrderLog';
import { formatDateTime } from '@/shared/core/format';

// A-07: chi tiết và xử lý khiếu nại – nhật ký đơn: chat, các phiên bản phiếu, vị trí
export default function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, reload } = useLoad(async () => {
    const { data: report, error } = await supabase.from('reports').select('*').eq('id', id).single();
    if (error) throw error;
    const log = await rpc<OrderLogData>('admin_order_log', { p_order_id: report.order_id });
    return { report: report as any, log };
  }, [id]);
  const [resolution, setResolution] = useState('');
  const [lock, setLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const resolve = async () => {
    if (!resolution.trim()) { setMsg('Vui lòng nhập kết quả xử lý.'); return; }
    if (lock && !confirm('Khóa tài khoản thợ bị báo cáo?')) return;
    setBusy(true); setMsg('');
    try { await rpc('admin_resolve_report', { p_report_id: id, p_resolution: resolution, p_lock_mechanic: lock }); await reload(); }
    catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };

  if (loading) return <p className="muted">Đang tải…</p>;
  if (error || !data) return <p className="error">{error}</p>;
  const { report, log } = data;
  return (
    <>
      <PageHead title="Xử lý khiếu nại" right={<button className="btn ghost" onClick={() => router.back()}>← Quay lại</button>} />
      <div className="card">
        <div className="row between"><h2>{report.kind === 'mechanic' ? 'Báo cáo thợ' : 'Báo cáo vấn đề cứu hộ'}</h2>{report.status === 'open' ? <Badge tone="orange">Chưa xử lý</Badge> : <Badge tone="green">Đã xử lý</Badge>}</div>
        <KV rows={[['Gửi lúc', formatDateTime(report.created_at)], ['Khách', log.customer?.full_name ?? '—'], ['Thợ bị báo cáo', log.mechanic?.full_name ?? '—']]} />
        <h3 style={{ marginTop: 16 }}>Nội dung báo cáo của khách</h3>
        <p style={{ background: 'var(--bg)', padding: 14, borderRadius: 12, whiteSpace: 'pre-wrap' }}>{report.content}</p>
      </div>
      <div className="card">
        {report.status === 'resolved' ? (
          <><h3>Kết quả xử lý</h3><p style={{ whiteSpace: 'pre-wrap' }}>{report.resolution}</p><p className="muted small">Xử lý lúc {formatDateTime(report.resolved_at)}</p></>
        ) : (
          <>
            <h3>Ghi nhận kết quả xử lý</h3>
            <label>Kết quả xử lý / giải quyết tranh chấp<textarea value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="VD: Đã đối chiếu chat và phiếu, thợ thu thêm chi phí chưa được khách xác nhận → nhắc nhở và khóa tài khoản." /></label>
            {log.mechanic && <label className="row" style={{ color: 'var(--text)' }}><input type="checkbox" style={{ width: 18, margin: 0 }} checked={lock} onChange={(e) => setLock(e.target.checked)} /> Đồng thời khóa tài khoản thợ (A-04)</label>}
            {msg && <p className="error">{msg}</p>}
            <button className="btn primary" disabled={busy} onClick={resolve}>Ghi nhận kết quả</button>
          </>
        )}
      </div>
      <OrderLog d={log} />
    </>
  );
}
