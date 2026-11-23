import { Platform, type TextStyle, type ViewStyle } from 'react-native';

// Bảng màu & kiểu chữ lấy cảm hứng từ Grab: xanh lá chủ đạo, nền sáng, thẻ bo tròn lớn, nút to dễ bấm.
export const colors = {
  primary: '#00B14F',
  primaryDark: '#008F3F',
  primarySoft: '#E5F7EC',
  bg: '#F3F5F4',
  card: '#FFFFFF',
  text: '#101828',
  sub: '#667085',
  line: '#E4E7EC',
  danger: '#E5484D',
  dangerSoft: '#FDECEC',
  warn: '#E8890C',
  warnSoft: '#FFF3DD',
  info: '#2563EB',
  infoSoft: '#E8EFFE',
  highlight: '#FFF1B8',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(16,24,40,0.45)',
};

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };
export const sp = (n: number) => n * 4;

export const shadow: ViewStyle = Platform.select({
  android: { elevation: 6 },
  default: { shadowColor: '#101828', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } },
}) as ViewStyle;
export const shadowSm: ViewStyle = Platform.select({
  android: { elevation: 2 },
  default: { shadowColor: '#101828', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
}) as ViewStyle;

export const font = {
  h1: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.3 } as TextStyle,
  h2: { fontSize: 20, fontWeight: '700', color: colors.text } as TextStyle,
  h3: { fontSize: 16, fontWeight: '700', color: colors.text } as TextStyle,
  body: { fontSize: 15, fontWeight: '400', color: colors.text, lineHeight: 21 } as TextStyle,
  sub: { fontSize: 13, fontWeight: '400', color: colors.sub, lineHeight: 18 } as TextStyle,
  label: { fontSize: 13, fontWeight: '600', color: colors.sub } as TextStyle,
};
