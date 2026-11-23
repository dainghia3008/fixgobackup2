import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator, Alert, Animated, Image, Pressable, ScrollView, StyleSheet, Text, TextInput,
  View, type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { create } from 'zustand';
import { colors, font, radius, shadow, shadowSm } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ───────────── Toast ─────────────
interface ToastState { msg: { id: number; text: string; tone: 'info' | 'warn' | 'error' } | null; show: (t: string, tone?: 'info' | 'warn' | 'error') => void }
let toastSeq = 0;
export const useToast = create<ToastState>((set) => ({ msg: null, show: (text, tone = 'info') => set({ msg: { id: ++toastSeq, text, tone } }) }));
export const toast = (text: string, tone: 'info' | 'warn' | 'error' = 'info') => useToast.getState().show(text, tone);

export function ToastHost() {
  const msg = useToast((s) => s.msg);
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!msg) return;
    opacity.setValue(0);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(2800),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [msg?.id]);
  if (!msg) return null;
  const bg = msg.tone === 'error' ? colors.danger : msg.tone === 'warn' ? colors.warn : colors.text;
  return (
    <Animated.View pointerEvents="none" style={[s.toast, { top: insets.top + 8, opacity, backgroundColor: bg }]}>
      <Text style={s.toastText}>{msg.text}</Text>
    </Animated.View>
  );
}

// Hiện toast mỗi khi có thông báo mới (theo id) từ store
export function useNoticeToast(notice: { id: number; text: string; tone: 'info' | 'warn' | 'error' } | null) {
  useEffect(() => { if (notice) toast(notice.text, notice.tone); }, [notice?.id]);
}

export function confirmAsync(title: string, message: string, okText = 'Đồng ý', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Không', style: 'cancel', onPress: () => resolve(false) },
      { text: okText, style: danger ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

// ───────────── Bố cục ─────────────
export function Screen(props: {
  children?: React.ReactNode; title?: string; onBack?: () => void; right?: React.ReactNode;
  scroll?: boolean; padded?: boolean; footer?: React.ReactNode; bg?: string; subtitle?: string;
}) {
  const { children, title, onBack, right, scroll = true, padded = true, footer, bg = colors.bg, subtitle } = props;
  const body = scroll ? (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[padded && { padding: 16 }, { paddingBottom: 28 }]} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padded && { padding: 16 }]}>{children}</View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={['top', 'left', 'right', 'bottom']}>
      {(title || onBack || right) && (
        <View style={s.header}>
          {onBack ? (
            <Pressable onPress={onBack} hitSlop={12} style={s.backBtn}><Ionicons name="chevron-back" size={22} color={colors.text} /></Pressable>
          ) : <View style={{ width: 8 }} />}
          <View style={{ flex: 1 }}>
            <Text style={font.h2} numberOfLines={1}>{title}</Text>
            {!!subtitle && <Text style={font.sub} numberOfLines={1}>{subtitle}</Text>}
          </View>
          {right}
        </View>
      )}
      <View style={{ flex: 1 }}>{body}</View>
      {footer && <View style={s.footer}>{footer}</View>}
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const inner = <View style={[s.card, style]}>{children}</View>;
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.85 }}>{inner}</Pressable> : inner;
}

export function Row({ children, style, gap = 12 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}
export const Divider = () => <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 12 }} />;
export const H = ({ children }: { children: React.ReactNode }) => <Text style={[font.h3, { marginBottom: 8, marginTop: 4 }]}>{children}</Text>;
export const Sub = ({ children, style }: { children: React.ReactNode; style?: any }) => <Text style={[font.sub, style]}>{children}</Text>;
export const Body = ({ children, style, numberOfLines }: { children: React.ReactNode; style?: any; numberOfLines?: number }) => (
  <Text style={[font.body, style]} numberOfLines={numberOfLines}>{children}</Text>
);

// ───────────── Nút / nhập liệu ─────────────
export function Button(props: {
  title: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'dangerSoft';
  loading?: boolean; disabled?: boolean; icon?: IconName; style?: StyleProp<ViewStyle>; small?: boolean;
}) {
  const { title, onPress, variant = 'primary', loading, disabled, icon, style, small } = props;
  const palette = {
    primary: { bg: colors.primary, fg: colors.white, bd: colors.primary },
    secondary: { bg: colors.primarySoft, fg: colors.primaryDark, bd: colors.primarySoft },
    danger: { bg: colors.danger, fg: colors.white, bd: colors.danger },
    dangerSoft: { bg: colors.dangerSoft, fg: colors.danger, bd: colors.dangerSoft },
    ghost: { bg: 'transparent', fg: colors.text, bd: colors.line },
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [s.btn, small && s.btnSm, { backgroundColor: palette.bg, borderColor: palette.bd }, off && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.98 }] }, style]}
    >
      {loading ? <ActivityIndicator color={palette.fg} /> : (
        <Row gap={8}>
          {icon && <Ionicons name={icon} size={small ? 16 : 20} color={palette.fg} />}
          <Text style={[s.btnText, small && { fontSize: 14 }, { color: palette.fg }]}>{title}</Text>
        </Row>
      )}
    </Pressable>
  );
}

export function Field({ label, error, style, ...rest }: TextInputProps & { label?: string; error?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginBottom: 14 }, style]}>
      {!!label && <Text style={[font.label, { marginBottom: 6 }]}>{label}</Text>}
      <TextInput
        placeholderTextColor="#98A2B3"
        {...rest}
        style={[s.input, rest.multiline && { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }, !!error && { borderColor: colors.danger }]}
      />
      {!!error && <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>{error}</Text>}
    </View>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, selected && { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}>
      <Row gap={6}>
        {icon && <Ionicons name={icon} size={16} color={selected ? colors.primaryDark : colors.sub} />}
        <Text style={{ color: selected ? colors.primaryDark : colors.text, fontWeight: selected ? '700' : '500', fontSize: 14, flexShrink: 1 }}>{label}</Text>
      </Row>
    </Pressable>
  );
}

export function Badge({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'success' | 'warn' | 'danger' | 'info' }) {
  const p = {
    neutral: [colors.bg, colors.sub], success: [colors.primarySoft, colors.primaryDark],
    warn: [colors.warnSoft, colors.warn], danger: [colors.dangerSoft, colors.danger], info: [colors.infoSoft, colors.info],
  }[tone];
  return (
    <View style={{ backgroundColor: p[0], paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' }}>
      <Text style={{ color: p[1], fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

export function Avatar({ uri, name, size = 44 }: { uri?: string | null; name?: string | null; size?: number }) {
  const initials = (name ?? '?').trim().split(/\s+/).slice(-2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.line }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.primaryDark, fontWeight: '800', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

export function Stars({ value, size = 16, onChange }: { value: number; size?: number; onChange?: (n: number) => void }) {
  return (
    <Row gap={2}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} disabled={!onChange} onPress={() => onChange?.(n)} hitSlop={6}>
          <Ionicons name={n <= Math.round(value) ? 'star' : 'star-outline'} size={size} color="#F5A524" />
        </Pressable>
      ))}
    </Row>
  );
}

export function Spinner({ text }: { text?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
      <ActivityIndicator size="large" color={colors.primary} />
      {!!text && <Text style={font.sub}>{text}</Text>}
    </View>
  );
}

export function EmptyState({ icon = 'file-tray-outline', title, text }: { icon?: IconName; title: string; text?: string }) {
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={32} color={colors.primary} />
      </View>
      <Text style={font.h3}>{title}</Text>
      {!!text && <Text style={[font.sub, { textAlign: 'center' }]}>{text}</Text>}
    </View>
  );
}

// Thẻ nổi ở đáy màn hình bản đồ (kiểu Grab)
export function Sheet({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  return <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 4 }, style]}>{children}</View>;
}

export function RoundButton({ icon, onPress, style, badge }: { icon: IconName; onPress: () => void; style?: StyleProp<ViewStyle>; badge?: number }) {
  return (
    <Pressable onPress={onPress} style={[s.round, style]}>
      <Ionicons name={icon} size={22} color={colors.text} />
      {!!badge && badge > 0 && (
        <View style={s.dot}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{badge > 9 ? '9+' : badge}</Text></View>
      )}
    </Pressable>
  );
}

export function Info({ icon, label, value }: { icon: IconName; label: string; value: React.ReactNode }) {
  return (
    <Row style={{ alignItems: 'flex-start', marginBottom: 10 }}>
      <Ionicons name={icon} size={18} color={colors.sub} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={font.label}>{label}</Text>
        {typeof value === 'string' ? <Text style={font.body}>{value}</Text> : value}
      </View>
    </Row>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', ...shadowSm },
  footer: { padding: 16, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line, gap: 10 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, marginBottom: 12, ...shadowSm },
  btn: { minHeight: 52, borderRadius: radius.pill, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  btnSm: { minHeight: 40, paddingHorizontal: 14 },
  btnText: { fontSize: 16, fontWeight: '700' },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, minHeight: 50, fontSize: 16, color: colors.text },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, marginRight: 8, marginBottom: 8 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingTop: 16, ...shadow },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', ...shadow },
  dot: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  toast: { position: 'absolute', left: 16, right: 16, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 16, zIndex: 999, ...shadow },
  toastText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
