'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

const NAV = [
  { href: '/profiles', label: 'Hồ sơ chờ duyệt', icon: '🪪' },
  { href: '/mechanics', label: 'Quản lý thợ', icon: '🛠️' },
  { href: '/orders', label: 'Giám sát đơn', icon: '📍' },
  { href: '/reports', label: 'Khiếu nại', icon: '🚩' },
];

export function Shell({ children, email }: { children: ReactNode; email: string }) {
  const path = usePathname();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="logo sm">F</span> FixGo Admin</div>
        <nav>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={path.startsWith(n.href) ? 'active' : ''}>
              <span>{n.icon}</span> {n.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="muted small">{email}</div>
          <button className="btn ghost small" onClick={() => supabase.auth.signOut()}>Đăng xuất</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
