import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { AuthGate } from '@/components/AuthGate';

export const metadata: Metadata = { title: 'FixGo Admin', description: 'Hệ thống quản trị FixGo' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body><AuthGate>{children}</AuthGate></body>
    </html>
  );
}
