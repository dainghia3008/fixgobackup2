'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { publicFace, rpc, signedCccd, supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/useLoad';
import { Badge, KV, PageHead } from '@/components/Bits';
import { skillLabel } from '@/shared/core/constants';
import type { MechanicProfileInput } from '@/shared/core/types';

const COLS = 'id, email, profile_status, account_status, face_photo, full_name, phone, birth_date, skills, experience, id_full_name, id_number, id_front, id_back, pending_changes, review_note';

function Images({ p }: { p: Partial<MechanicProfileInput> }) {
  const [front, setFront] = useState<string | null>(null);
  const [back, setBack] = useState<string | null>(null);
  useEffect(() => { signedCccd(p.id_front).then(setFront); signedCccd(p.id_back).then(setBack); }, [p.id_front, p.id_back]);
  return (
    <div className="grid3" style={{ marginTop: 12 }}>
      <div><div className="muted small">Ảnh khuôn mặt</div>{p.face_photo && <img className="photo" src={publicFace(p.face_photo)!} alt="Khuôn mặt" />}</div>
      <div><div className="muted small">CCCD mặt trước</div>{front ? <img className="photo" src={front} alt="CCCD trước" /> : '—'}</div>
      <div><div className="muted small">CCCD mặt sau</div>{back ? <img className="photo" src={back} alt="CCCD sau" /> : '—'}</div>
    </div>
  );
}

const rows = (p: Partial<MechanicProfileInput>): [string, string][] => [
  ['Họ tên', p.full_name ?? ''], ['Số điện thoại', p.phone ?? ''], ['Ngày sinh', p.birth_date ?? ''],
  ['Kỹ năng', (p.skills ?? []).map(skillLabel).join(' · ')], ['Kinh nghiệm', p.experience ?? ''],
  ['Họ tên trên CCCD', p.id_full_name ?? ''], ['Số CCCD', p.id_number ?? ''],
];

// A-03: chi tiết hồ sơ thợ; thay đổi hồ sơ được đối chiếu với thông tin hiện hành
export default function ProfileDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: m, error, loading } = useLoad(async () => {
    const { data, error } = await supabase.from('mechanics').select(COLS).eq('id', id).single();
    if (error) throw error;
    return data as any;
  }, [id]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const review = async (approve: boolean) => {
    if (!approve && !confirm('Từ chối hồ sơ này?')) return;
    setBusy(true); setMsg('');
    try { await rpc('admin_review_profile', { p_mechanic_id: id, p_approve: approve, p_reason: reason || null }); router.push('/profiles'); }
    catch (e: any) { setMsg(e.message === 'INVALID_STATE' ? 'Hồ sơ này đã được xử lý.' : e.message); setBusy(false); }
  };

  if (loading) return <p className="muted">Đang tải…</p>;
  if (error || !m) return <p className="error">{error || 'Không tìm thấy hồ sơ'}</p>;
  const change = m.pending_changes as MechanicProfileInput | null;
  const base = rows(m);
  const next = change ? rows(change) : null;
  return (
    <>
      <PageHead title={m.full_name ?? 'Hồ sơ thợ'} sub={m.email} right={<button className="btn ghost" onClick={() => router.back()}>← Quay lại</button>} />
      <div className="card">
        <div className="row"><h2 style={{ margin: 0 }}>{change ? 'Thay đổi hồ sơ' : 'Hồ sơ đăng ký mới'}</h2>{m.account_status === 'locked' && <Badge tone="red">Tài khoản bị khóa</Badge>}</div>
        {change ? (
          <table style={{ marginTop: 12 }}>
            <thead><tr><th>Trường</th><th>Hiện hành (đã duyệt)</th><th>Đề nghị thay đổi</th></tr></thead>
            <tbody>
              {base.map(([k, v], i) => {
                const nv = next![i][1]; const diff = v !== nv;
                return <tr key={k}><td className="muted">{k}</td><td className={diff ? 'diff-old' : ''}>{v || '—'}</td><td className={diff ? 'diff-new' : ''}>{nv || '—'}</td></tr>;
              })}
            </tbody>
          </table>
        ) : <div style={{ marginTop: 12 }}><KV rows={base} /></div>}
      </div>
      {change && <div className="card"><h3>Hiện hành</h3><Images p={m} /></div>}
      <div className="card"><h3>{change ? 'Ảnh đề nghị thay đổi' : 'Ảnh khuôn mặt & giấy tờ CCCD'}</h3><Images p={change ?? m} /></div>
      <div className="card">
        <h3>Quyết định</h3>
        <p className="muted small">Đối chiếu ảnh khuôn mặt, thông tin cá nhân, kỹ năng, kinh nghiệm và giấy tờ CCCD trước khi duyệt.</p>
        <label>Lý do từ chối (không bắt buộc)<textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Ảnh CCCD bị mờ, họ tên không khớp…" /></label>
        {msg && <p className="error">{msg}</p>}
        <div className="row"><button className="btn primary" disabled={busy} onClick={() => review(true)}>✓ Duyệt</button><button className="btn danger-soft" disabled={busy} onClick={() => review(false)}>✕ Từ chối</button></div>
      </div>
    </>
  );
}
