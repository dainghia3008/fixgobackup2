'use client';
import type { ReactNode } from 'react';
import { ORDER_STATUS_LABEL } from '@/shared/core/constants';
import type { OrderStatus } from '@/shared/core/types';

export function OrderBadge({ status }: { status: OrderStatus }) {
  const tone = status === 'completed' ? 'green' : status === 'cancelled' ? 'red' : status === 'searching' ? 'blue' : 'orange';
  return <span className={`badge ${tone}`}>{ORDER_STATUS_LABEL[status]}</span>;
}
export const Badge = ({ tone = '', children }: { tone?: 'green' | 'red' | 'orange' | 'blue' | ''; children: ReactNode }) => <span className={`badge ${tone}`}>{children}</span>;
export const PageHead = ({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) => (
  <div className="row between" style={{ marginBottom: 20 }}>
    <div><h1>{title}</h1>{sub && <div className="muted">{sub}</div>}</div>{right}
  </div>
);
export const KV = ({ rows }: { rows: [string, ReactNode][] }) => (
  <dl className="kv">{rows.map(([k, v]) => (<div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v ?? '—'}</dd></div>))}</dl>
);
