import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from './supabase';
import { Button, Field, toast } from './ui';
import { colors, font, radius } from './theme';
import { missingEnv } from './env';

WebBrowser.maybeCompleteAuthSession();

interface AuthCtx {
  ready: boolean;
  session: Session | null;
  sendOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, code: string) => Promise<void>;
  oauth: (provider: 'google' | 'facebook', scheme: string) => Promise<void>;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

async function sessionFromUrl(url: string) {
  const u = new URL(url);
  const q = new URLSearchParams(u.search);
  const h = new URLSearchParams(u.hash.replace(/^#/, ''));
  const err = q.get('error_description') ?? h.get('error_description');
  if (err) throw new Error(err);
  const code = q.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }
  const at = h.get('access_token');
  const rt = h.get('refresh_token');
  if (at && rt) {
    const { error } = await supabase.auth.setSession({ access_token: at, refresh_token: rt });
    if (error) throw error;
    return;
  }
  throw new Error('Không nhận được phiên đăng nhập');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const sendOtp = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
    if (error) throw error;
  }, []);
  const verifyOtp = useCallback(async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    if (error) throw error;
  }, []);
  const oauth = useCallback(async (provider: 'google' | 'facebook', scheme: string) => {
    const redirectTo = Linking.createURL('auth-callback', { scheme });
    const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
    if (error || !data?.url) throw error ?? new Error('Không mở được trang đăng nhập');
    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (res.type !== 'success') throw new Error('CANCELLED');
    await sessionFromUrl(res.url);
  }, []);
  const signOut = useCallback(async () => { await supabase.auth.signOut(); }, []);

  const value = useMemo(() => ({ ready, session, sendOtp, verifyOtp, oauth, signOut }), [ready, session, sendOtp, verifyOtp, oauth, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ───────────── U-01 / M-01: màn hình đăng nhập dùng chung ─────────────
export function LoginScreen({ appName, tagline, scheme, icon }: { appName: string; tagline: string; scheme: string; icon: React.ComponentProps<typeof Ionicons>['name'] }) {
  const { sendOtp, verifyOtp, oauth } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  const missing = missingEnv();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const send = async () => {
    setError('');
    if (!validEmail) { setError('Email không hợp lệ'); return; }
    setBusy('send');
    try {
      await sendOtp(email);
      setStep('code');
      setCooldown(60);
      toast('Đã gửi mã xác thực tới email của bạn');
    } catch (e: any) {
      setError(/rate|limit|seconds/i.test(e?.message ?? '') ? 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.' : 'Không gửi được mã. Kiểm tra email và kết nối mạng.');
    } finally { setBusy(null); }
  };
  const verify = async () => {
    setError('');
    if (!/^\d{6,8}$/.test(code.trim())) { setError('Mã gồm 6–8 chữ số'); return; }
    setBusy('verify');
    try {
      await verifyOtp(email, code);
    } catch {
      setError('Mã không đúng hoặc đã hết hạn. Hãy nhận mã mới.');
    } finally { setBusy(null); }
  };
  const social = async (p: 'google' | 'facebook') => {
    setError('');
    setBusy(p);
    try {
      await oauth(p, scheme);
    } catch (e: any) {
      if (e?.message !== 'CANCELLED') setError('Đăng nhập không thành công. Vui lòng thử lại.');
    } finally { setBusy(null); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginTop: 28, marginBottom: 28 }}>
            <View style={{ width: 88, height: 88, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={icon} size={46} color="#fff" />
            </View>
            <Text style={[font.h1, { marginTop: 16 }]}>{appName}</Text>
            <Text style={[font.sub, { marginTop: 4, textAlign: 'center' }]}>{tagline}</Text>
          </View>

          {missing.length > 0 && (
            <View style={{ backgroundColor: colors.dangerSoft, padding: 12, borderRadius: radius.md, marginBottom: 16 }}>
              <Text style={{ color: colors.danger, fontWeight: '700' }}>Thiếu cấu hình môi trường:</Text>
              <Text style={{ color: colors.danger }}>{missing.join(', ')}</Text>
            </View>
          )}

          {step === 'email' ? (
            <>
              <Field label="Email" value={email} onChangeText={setEmail} placeholder="ban@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
              <Button title="Tiếp tục với Email" onPress={send} loading={busy === 'send'} />
            </>
          ) : (
            <>
              <Text style={[font.body, { marginBottom: 12 }]}>Nhập mã xác thực đã gửi tới <Text style={{ fontWeight: '700' }}>{email}</Text></Text>
              <Field label="Mã xác thực" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 8))} placeholder="••••••" keyboardType="number-pad" maxLength={8} style={{ marginBottom: 10 }} />
              <Button title="Xác nhận" onPress={verify} loading={busy === 'verify'} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
                <Pressable onPress={() => { setStep('email'); setCode(''); setError(''); }}><Text style={{ color: colors.sub, fontWeight: '600' }}>Đổi email</Text></Pressable>
                <Pressable disabled={cooldown > 0 || busy === 'send'} onPress={send}>
                  <Text style={{ color: cooldown > 0 ? colors.sub : colors.primaryDark, fontWeight: '700' }}>{cooldown > 0 ? `Gửi lại mã (${cooldown}s)` : 'Gửi lại mã'}</Text>
                </Pressable>
              </View>
            </>
          )}

          {!!error && <Text style={{ color: colors.danger, marginTop: 12, textAlign: 'center' }}>{error}</Text>}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 24 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
            <Text style={font.sub}>hoặc</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
          </View>

          <View style={{ gap: 12 }}>
            <Button title="Tiếp tục với Google" icon="logo-google" variant="ghost" onPress={() => social('google')} loading={busy === 'google'} />
            <Button title="Tiếp tục với Facebook" icon="logo-facebook" variant="ghost" onPress={() => social('facebook')} loading={busy === 'facebook'} />
          </View>
          <Text style={[font.sub, { textAlign: 'center', marginTop: 24 }]}>Bằng việc tiếp tục, bạn đồng ý với Điều khoản sử dụng của FixGo.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
