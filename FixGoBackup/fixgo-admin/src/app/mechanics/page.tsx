'use client';
import { useState } from 'react';
import { rpc, supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { useAdminRefresh } from '@/lib/events';
import { Badge, PageHead } from '@/components/Bits';
import { formatRating } from '@/shared/core/format';

const PROFILE: Record<string, [string, 'green' | 'orange' | 'red' | '']> = {
  approved: ['Đã duyệt', 'green'], pending: ['Chờ duyệt', 'orange'], rejected: ['Từ chối', 'red'], none: ['Chưa có hồ sơ', ''],
};

// A-04: quản lý tài khoản thợ – khóa / mở khóa
export default function Mechanics() {
  const [q, setQ] = useState('');
  const { data, error, reload } = useLoad(async () => {
    const { data, error } = await supabase.from('mechanics')
      .select('id, full_name, email, profile_status, account_status, presence, rating_avg, rating_count, completed_count, current_order_id').order('created_at', { ascending: false });
    if (error) throw error;
    return data as any[];
  });
  useAdminRefresh(['PROFILE_SUBMITTED', 'ORDER_CHANGED'], reload);
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (m: any) => {
    const lock = m.account_status !== 'locked';
    if (!confirm(lock ? `Khóa tài khoản ${m.full_name ?? m.email}? Thợ sẽ bị chuyển Offline và không nhận yêu cầu mới.` : 'Mở khóa tài khoản này?')) return;
    setBusy(m.id);
    try { await rpc('admin_set_lock', { p_mechanic_id: m.id, p_locked: lock }); await reload(); } catch (e: any) { alert(e.message); }
    setBusy(null);
  };
  const list = (data ?? []).filter((m) => !q || `${m.full_name ?? ''} ${m.email ?? ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHead title="Quản lý thợ" sub="Trạng thái hồ sơ và tài khoản" right={<input style={{ width: 260, margin: 0 }} placeholder="Tìm theo tên / email…" value={q} onChange={(e) => setQ(e.target.value)} />} />
      <div className="card">
        {error && <p className="error">{error}</p>}
        <table>
          <thead><tr><th>Thợ</th><th>Hồ sơ</th><th>Tài khoản</th><th>Hoạt động</th><th>Đánh giá</th><th>Đơn xong</th><th /></tr></thead>
          <tbody>
            {list.map((m) => {
              const [label, tone] = PROFILE[m.profile_status] ?? ['', ''];
              return (
                <tr key={m.id}>
                  <td><b>{m.full_name ?? '(chưa có tên)'}</b><div className="muted small">{m.email}</div></td>
                  <td><Badge tone={tone}>{label}</Badge></td>
                  <td>{m.account_status === 'locked' ? <Badge tone="red">Bị khóa</Badge> : <Badge tone="green">Bình thường</Badge>}</td>
                  <td>{m.presence === 'online' ? <Badge tone="green">Online</Badge> : <span className="muted">Offline</span>}{m.current_order_id && <> <Badge tone="blue">Đang có đơn</Badge></>}</td>
                  <td>{formatRating(m.rating_avg, m.rating_count)}</td><td>{m.completed_count}</td>
                  <td style={{ textAlign: 'right' }}><button className={`btn small ${m.account_status === 'locked' ? '' : 'danger-soft'}`} disabled={busy === m.id} onClick={() => toggle(m)}>{m.account_status === 'locked' ? 'Mở khóa' : 'Khóa tài khoản'}</button></td>
                </tr>
              );
            })}
            {list.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 32 }}>Không có thợ nào.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
