'use client';
import dynamic from 'next/dynamic';
import { Badge, KV, OrderBadge } from './Bits';
import { diffQuote } from '@/shared/core/quote';
import { incidentLabel } from '@/shared/core/constants';
import { formatDateTime, formatPriceRange, formatVND, shortCode } from '@/shared/core/format';
import type { OrderDTO, ProposalDTO, QuoteDTO } from '@/shared/core/types';

const RouteMap = dynamic(() => import('./RouteMap'), { ssr: false, loading: () => <div className="map muted center">Đang tải bản đồ…</div> });

export interface OrderLogData {
  order: OrderDTO;
  customer: { id: string; full_name: string | null; email: string | null } | null;
  mechanic: { id: string; full_name: string | null; phone: string | null } | null;
  proposals: ProposalDTO[];
  quotes: QuoteDTO[];
  messages: { sender_role: 'customer' | 'mechanic'; content: string; created_at: string }[];
  locations: { lat: number; lng: number; at: string }[];
  events: { from: string | null; to: string; actor: string; at: string }[];
}

// Nhật ký đơn dùng cho A-05 (giám sát) và A-07 (xử lý khiếu nại)
export function OrderLog({ d }: { d: OrderLogData }) {
  const o = d.order;
  return (
    <>
      <div className="card">
        <div className="row between"><h2>Đơn {shortCode(o.id)}</h2><OrderBadge status={o.status} /></div>
        <KV rows={[
          ['Khách hàng', d.customer?.full_name ? `${d.customer.full_name} (${d.customer.email ?? ''})` : '—'],
          ['Thợ', d.mechanic ? `${d.mechanic.full_name ?? ''} · ${d.mechanic.phone ?? ''}` : 'Chưa chốt thợ'],
          ['Tạo lúc', formatDateTime(o.created_at)],
          ['Sự cố', o.incident_types.map(incidentLabel).join(', ')],
          ['Xe', `${o.vehicle_model} · ${o.license_plate}`],
          ['Mô tả', o.description],
          ['Địa chỉ', o.address],
          ['Hủy bởi', o.status === 'cancelled' ? `${o.cancelled_by === 'customer' ? 'Khách' : 'Thợ'}${o.cancel_reason ? ` — ${o.cancel_reason}` : ''}` : '—'],
          ['Đánh giá của khách', o.review_status === 'submitted' ? 'Đã gửi' : o.review_status === 'skipped' ? 'Đã bỏ qua' : 'Chưa đánh giá'],
        ]} />
      </div>

      <div className="grid2">
        <div className="card">
          <h3>Vị trí và hành trình ({d.locations.length} điểm)</h3>
          <RouteMap customer={{ lat: o.lat, lng: o.lng }} points={d.locations} />
        </div>
        <div className="card">
          <h3>Thay đổi trạng thái</h3>
          <ul className="timeline">
            {d.events.map((e, i) => (
              <li key={i}><b>{e.from ? `${e.from} → ${e.to}` : `Tạo (${e.to})`}</b> <span className="muted small">· {e.actor} · {formatDateTime(e.at)}</span></li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card">
        <h3>Đề xuất sơ bộ ({d.proposals.length})</h3>
        <table>
          <thead><tr><th>Thợ</th><th>Nhận định</th><th>Giá</th><th>ETA</th><th>Trạng thái</th></tr></thead>
          <tbody>
            {d.proposals.map((p) => (
              <tr key={p.id} className={o.proposal?.id === p.id ? 'tr-hl' : ''}>
                <td>{p.mechanic.full_name}{o.proposal?.id === p.id && <> <Badge tone="green">Được chọn</Badge></>}</td>
                <td>{p.assessment}</td><td>{formatPriceRange(p.price_min, p.price_max)}</td><td>{p.eta_minutes} phút</td>
                <td><Badge tone={p.status === 'available' ? 'green' : ''}>{p.status === 'available' ? 'Khả dụng' : 'Không còn khả dụng'}</Badge></td>
              </tr>
            ))}
            {d.proposals.length === 0 && <tr><td colSpan={5} className="muted">Chưa có đề xuất.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Lịch sử sửa chữa — các phiên bản phiếu đề xuất ({d.quotes.length})</h3>
        {d.quotes.length === 0 && <p className="muted">Chưa có phiếu.</p>}
        {d.quotes.map((q, i) => {
          const diff = diffQuote(i > 0 ? d.quotes[i - 1] : null, q);
          return (
            <div key={q.id} style={{ marginBottom: 18 }}>
              <div className="row"><b>Phiên bản {q.version}</b><Badge tone={q.status === 'confirmed' ? 'green' : q.status === 'sent' ? 'orange' : ''}>{q.status === 'confirmed' ? 'Đã xác nhận' : q.status === 'sent' ? 'Đã gửi' : 'Bị thay thế'}</Badge><span className="muted small">gửi {formatDateTime(q.sent_at)}{q.confirmed_at ? ` · xác nhận ${formatDateTime(q.confirmed_at)}` : ''}</span></div>
              <p className={diff.diagnosisChanged ? 'diff-new' : ''} style={{ margin: '6px 0' }}>Chẩn đoán: {q.diagnosis}</p>
              <table>
                <tbody>
                  {diff.lines.map(({ line, state }) => (
                    <tr key={line.line_key} className={state === 'unchanged' ? '' : 'tr-hl'}>
                      <td>{line.kind === 'task' ? 'Hạng mục' : 'Phụ tùng'}</td><td>{line.name}{state !== 'unchanged' && <> <Badge tone="orange">{state === 'new' ? 'Mới' : 'Đã sửa'}</Badge></>}</td>
                      <td>{line.kind === 'part' ? `${line.quantity} × ${formatVND(line.unit_price)}` : ''}</td><td style={{ textAlign: 'right' }}>{formatVND(line.amount)}</td>
                    </tr>
                  ))}
                  {diff.removed.map((l) => (<tr key={l.line_key} className="strike"><td>Đã xóa</td><td>{l.name}</td><td /><td style={{ textAlign: 'right' }}>{formatVND(l.amount)}</td></tr>))}
                  <tr><td colSpan={3}><b>Tổng</b></td><td style={{ textAlign: 'right' }}><b>{formatVND(q.total)}</b></td></tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h3>Lịch sử chat ({d.messages.length})</h3>
        <div className="chat">
          {d.messages.map((m, i) => (<div key={i} className={`bubble ${m.sender_role}`}><div className="small muted">{m.sender_role === 'customer' ? 'Khách' : 'Thợ'} · {formatDateTime(m.created_at)}</div>{m.content}</div>))}
          {d.messages.length === 0 && <span className="muted">Chưa có tin nhắn.</span>}
        </div>
      </div>
    </>
  );
}
