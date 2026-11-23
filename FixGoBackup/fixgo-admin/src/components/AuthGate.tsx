'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { EventsCtx } from '@/lib/events';
import { Shell } from './Shell';

type Listener = (event: string, payload: any) => void;

// A-01: đăng nhập email + mật khẩu; chỉ tài khoản có trong bảng admins mới vào được trang quản trị
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const listeners = useRef(new Set<Listener>());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setIsAdmin(null); return; }
    supabase.from('admins').select('id').eq('id', session.user.id).maybeSingle().then(({ data }) => setIsAdmin(!!data));
  }, [session?.user.id]);

  // Kênh real-time riêng tư dành cho admin
  useEffect(() => {
    if (!isAdmin) return;
    let ch: ReturnType<typeof supabase.channel> | null = null;
    let stopped = false;
    (async () => {
      await supabase.realtime.setAuth();
      if (stopped) return;
      ch = supabase.channel('admin', { config: { private: true } });
      ch.on('broadcast', { event: '*' }, (m: any) => listeners.current.forEach((l) => l(m.event, m.payload)));
      ch.subscribe();
    })();
    return () => { stopped = true; if (ch) supabase.removeChannel(ch); };
  }, [isAdmin]);

  const subscribe = useCallback((l: Listener) => { listeners.current.add(l); return () => { listeners.current.delete(l); }; }, []);

  if (!ready) return <div className="center muted">Đang tải…</div>;
  if (!session) return <Login />;
  if (isAdmin === null) return <div className="center muted">Đang kiểm tra quyền…</div>;
  if (!isAdmin) {
    return (
      <div className="center">
        <div className="card narrow">
          <h2>Không có quyền truy cập</h2>
          <p className="muted">Tài khoản {session.user.email} không phải quản trị viên.</p>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Đăng xuất</button>
        </div>
      </div>
    );
  }
  return <EventsCtx.Provider value={{ subscribe }}><Shell email={session.user.email ?? ''}>{children}</Shell></EventsCtx.Provider>;
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError('Email hoặc mật khẩu không đúng.');
    setBusy(false);
  };
  return (
    <div className="center">
      <form className="card narrow" onSubmit={submit}>
        <div className="logo">F</div>
        <h1>FixGo Admin</h1>
        <p className="muted">Đăng nhập hệ thống quản trị</p>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
        <label>Mật khẩu<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      </form>
    </div>
  );
}
