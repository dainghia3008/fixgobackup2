import { INCIDENT_TYPES, SKILLS } from './constants';

export type Errors = Record<string, string>;
const has = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

export function normalizePlate(p: string): string {
  return p.toUpperCase().replace(/\s+/g, ' ').trim();
}

// U-04: các trường bắt buộc (mục 3.3)
export function validateRequestForm(f: {
  lat: number | null; lng: number | null; incident_types: string[];
  vehicle_model: string; license_plate: string; description: string;
}): Errors {
  const e: Errors = {};
  if (f.lat == null || f.lng == null) e.location = 'Chưa có vị trí cứu hộ. Hãy bật định vị hoặc chọn vị trí thủ công.';
  if (!f.incident_types.length) e.incident_types = 'Chọn ít nhất 1 loại sự cố';
  else if (f.incident_types.some((c) => !INCIDENT_TYPES.some((i) => i.code === c))) e.incident_types = 'Loại sự cố không hợp lệ';
  if (!has(f.vehicle_model)) e.vehicle_model = 'Nhập dòng xe';
  if (!has(f.license_plate)) e.license_plate = 'Nhập biển số';
  if (!has(f.description)) e.description = 'Mô tả tình trạng xe';
  return e;
}

export const PHONE_RE = /^(0|\+84)\d{9,10}$/;
export const CCCD_RE = /^\d{12}$/;

export function isUpperVietnamese(s: string): boolean {
  const t = s.trim();
  return t.length > 0 && t === t.toLocaleUpperCase('vi-VN') && /\p{L}/u.test(t) && !/\d/.test(t);
}

export function ageOn(birthISO: string, today: Date): number {
  const b = new Date(birthISO + 'T00:00:00');
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

// M-02 / M-16
export function validateMechanicProfile(
  p: Partial<Record<'face_photo' | 'full_name' | 'phone' | 'birth_date' | 'experience' | 'id_full_name' | 'id_number' | 'id_front' | 'id_back', string | null>> & { skills?: string[] },
  today: Date = new Date(),
): Errors {
  const e: Errors = {};
  if (!has(p.face_photo)) e.face_photo = 'Cần ảnh khuôn mặt';
  if (!has(p.full_name)) e.full_name = 'Nhập họ tên';
  if (!has(p.phone)) e.phone = 'Nhập số điện thoại';
  else if (!PHONE_RE.test((p.phone ?? '').replace(/\s/g, ''))) e.phone = 'Số điện thoại không hợp lệ';
  if (!has(p.birth_date)) e.birth_date = 'Nhập ngày sinh (YYYY-MM-DD)';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(p.birth_date as string) || Number.isNaN(Date.parse(p.birth_date as string))) e.birth_date = 'Ngày sinh không hợp lệ (YYYY-MM-DD)';
  else if (ageOn(p.birth_date as string, today) < 18) e.birth_date = 'Thợ phải từ 18 tuổi trở lên';
  if (!p.skills || p.skills.length < 1) e.skills = 'Chọn ít nhất 1 kỹ năng';
  else if (p.skills.some((s) => !SKILLS.some((k) => k.code === s))) e.skills = 'Kỹ năng không hợp lệ';
  if (!has(p.id_full_name)) e.id_full_name = 'Nhập họ tên trên giấy tờ';
  else if (!isUpperVietnamese(p.id_full_name as string)) e.id_full_name = 'Viết IN HOA có dấu, ví dụ: NGUYỄN VĂN A';
  if (!has(p.id_number)) e.id_number = 'Nhập số CCCD';
  else if (!CCCD_RE.test((p.id_number ?? '').trim())) e.id_number = 'Số CCCD gồm đúng 12 chữ số';
  if (!has(p.id_front)) e.id_front = 'Cần ảnh mặt trước CCCD';
  if (!has(p.id_back)) e.id_back = 'Cần ảnh mặt sau CCCD';
  return e;
}

// M-07
export function validateProposal(p: { assessment: string; price_min: string; price_max: string; eta_minutes: string }): Errors {
  const e: Errors = {};
  const min = Number(p.price_min.replace(/[.,\s]/g, ''));
  const max = Number(p.price_max.replace(/[.,\s]/g, ''));
  const eta = Number(p.eta_minutes);
  if (!has(p.assessment)) e.assessment = 'Nhập nhận định ban đầu';
  if (!has(p.price_min) || !Number.isFinite(min) || min < 0) e.price_min = 'Nhập giá thấp nhất';
  if (!has(p.price_max) || !Number.isFinite(max) || max < 0) e.price_max = 'Nhập giá cao nhất';
  if (!e.price_min && !e.price_max && min > max) e.price_max = 'Giá thấp nhất không được lớn hơn giá cao nhất';
  if (!has(p.eta_minutes) || !Number.isInteger(eta) || eta <= 0) e.eta_minutes = 'Nhập số phút (số nguyên > 0)';
  return e;
}

export const parseMoney = (s: string): number => Number(s.replace(/[.,\s]/g, '')) || 0;

export function validateReview(stars: number): Errors {
  return Number.isInteger(stars) && stars >= 1 && stars <= 5 ? {} : { stars: 'Chọn số sao (1–5)' };
}
export function validateReport(content: string): Errors {
  return has(content) ? {} : { content: 'Nhập nội dung báo cáo' };
}
export function validateName(name: string): Errors {
  return has(name) ? {} : { full_name: 'Họ tên là bắt buộc' };
}
