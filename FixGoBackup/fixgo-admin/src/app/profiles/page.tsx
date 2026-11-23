'use client';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { useAdminRefresh } from '@/lib/events';
import { Badge, PageHead } from '@/components/Bits';
import { formatDateTime } from '@/shared/core/format';

// A-02: hồ sơ thợ chờ duyệt (gồm cả "Thay đổi hồ sơ" – BR-16)
export default function Profiles() {
  const router = useRouter();
  const { data, error, loading, reload } = useLoad(async () => {
    const { data, error } = await supabase.from('mechanics')
      .select('id, full_name, email, profile_status, submitted_at, pending_changes_at, pending_changes')
      .or('profile_status.eq.pending,pending_changes.not.is.null');
    if (error) throw error;
    return (data ?? []).map((m: any) => ({ ...m, change: !!m.pending_changes, at: m.pending_changes ? m.pending_changes_at : m.submitted_at }))
      .sort((a: any, b: any) => String(a.at).localeCompare(String(b.at)));
  });
  useAdminRefresh(['PROFILE_SUBMITTED'], reload);

  return (
    <>
      <PageHead title="Hồ sơ thợ chờ duyệt" sub="Đăng ký mới và thay đổi hồ sơ từ thợ đã duyệt" />
      <div className="card">
        {error && <p className="error">{error}</p>}
        <table>
          <thead><tr><th>Họ tên</th><th>Email</th><th>Loại</th><th>Thời gian gửi</th></tr></thead>
          <tbody>
            {data?.map((m: any) => (
              <tr key={m.id} className="click" onClick={() => router.push(`/profiles/${m.id}`)}>
                <td><b>{m.full_name ?? '(chưa có tên)'}</b></td><td className="muted">{m.email}</td>
                <td>{m.change ? <Badge tone="orange">Thay đổi hồ sơ</Badge> : <Badge tone="blue">Đăng ký mới</Badge>}</td>
                <td>{formatDateTime(m.at)}</td>
              </tr>
            ))}
            {!loading && data?.length === 0 && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 32 }}>Không có hồ sơ nào đang chờ duyệt 🎉</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
