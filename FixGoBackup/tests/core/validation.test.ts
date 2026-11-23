import { describe, it, expect } from 'vitest';
import {
  validateRequestForm, validateMechanicProfile, validateProposal, validateReview, validateReport, validateName,
  isUpperVietnamese, normalizePlate, parseMoney, ageOn,
} from '../../shared/core/validation';

describe('U-04 – form yêu cầu cứu hộ', () => {
  const ok = { lat: 10.77, lng: 106.7, incident_types: ['flat_tire'], vehicle_model: 'Honda Vision', license_plate: '59X1-123.45', description: 'Xe bị xì lốp sau' };
  it('hợp lệ', () => expect(validateRequestForm(ok)).toEqual({}));
  it('thiếu vị trí', () => expect(validateRequestForm({ ...ok, lat: null, lng: null }).location).toBeTruthy());
  it('cần chọn ít nhất 1 loại sự cố', () => expect(validateRequestForm({ ...ok, incident_types: [] }).incident_types).toBeTruthy());
  it('loại sự cố lạ bị từ chối', () => expect(validateRequestForm({ ...ok, incident_types: ['xyz'] }).incident_types).toBeTruthy());
  it('thiếu dòng xe / biển số / mô tả báo lỗi đúng trường', () => {
    const e = validateRequestForm({ ...ok, vehicle_model: ' ', license_plate: '', description: '' });
    expect(Object.keys(e).sort()).toEqual(['description', 'license_plate', 'vehicle_model']);
  });
  it('chuẩn hóa biển số', () => expect(normalizePlate('  59x1   123.45 ')).toBe('59X1 123.45'));
});

describe('M-02 – hồ sơ thợ', () => {
  const today = new Date('2026-11-18T00:00:00');
  const ok = {
    face_photo: 'u/a.jpg', full_name: 'Nguyễn Văn A', phone: '0901234567', birth_date: '1995-05-20',
    skills: ['tires', 'engine'], experience: '', id_full_name: 'NGUYỄN VĂN A', id_number: '079095001234', id_front: 'u/f.jpg', id_back: 'u/b.jpg',
  };
  it('hợp lệ (kinh nghiệm không bắt buộc)', () => expect(validateMechanicProfile(ok, today)).toEqual({}));
  it('họ tên trên CCCD phải viết in hoa có dấu', () => {
    expect(validateMechanicProfile({ ...ok, id_full_name: 'Nguyễn Văn A' }, today).id_full_name).toBeTruthy();
    expect(isUpperVietnamese('NGUYỄN VĂN A')).toBe(true);
    expect(isUpperVietnamese('nguyễn văn a')).toBe(false);
    expect(isUpperVietnamese('')).toBe(false);
  });
  it('số CCCD gồm đúng 12 chữ số', () => {
    expect(validateMechanicProfile({ ...ok, id_number: '12345' }, today).id_number).toBeTruthy();
    expect(validateMechanicProfile({ ...ok, id_number: '07909500123A' }, today).id_number).toBeTruthy();
    expect(validateMechanicProfile({ ...ok, id_number: '0790950012345' }, today).id_number).toBeTruthy();
  });
  it('cần ảnh khuôn mặt và ảnh hai mặt CCCD', () => {
    const e = validateMechanicProfile({ ...ok, face_photo: '', id_front: null, id_back: '' }, today);
    expect(e.face_photo && e.id_front && e.id_back).toBeTruthy();
  });
  it('cần ít nhất 1 kỹ năng hợp lệ', () => {
    expect(validateMechanicProfile({ ...ok, skills: [] }, today).skills).toBeTruthy();
    expect(validateMechanicProfile({ ...ok, skills: ['magic'] }, today).skills).toBeTruthy();
  });
  it('số điện thoại và tuổi', () => {
    expect(validateMechanicProfile({ ...ok, phone: '123' }, today).phone).toBeTruthy();
    expect(validateMechanicProfile({ ...ok, phone: '+84901234567' }, today).phone).toBeUndefined();
    expect(validateMechanicProfile({ ...ok, birth_date: '2015-01-01' }, today).birth_date).toBeTruthy();
    expect(ageOn('2008-11-19', today)).toBe(17);
    expect(ageOn('2008-11-18', today)).toBe(18);
  });
});

describe('M-07 – đề xuất sơ bộ', () => {
  const ok = { assessment: 'Có thể thủng săm', price_min: '50000', price_max: '120000', eta_minutes: '15' };
  it('hợp lệ', () => expect(validateProposal(ok)).toEqual({}));
  it('giá thấp nhất không được lớn hơn giá cao nhất', () => expect(validateProposal({ ...ok, price_min: '200000' }).price_max).toBeTruthy());
  it('bằng nhau là hợp lệ', () => expect(validateProposal({ ...ok, price_min: '100000', price_max: '100000' })).toEqual({}));
  it('thời gian phải là số nguyên dương', () => {
    expect(validateProposal({ ...ok, eta_minutes: '0' }).eta_minutes).toBeTruthy();
    expect(validateProposal({ ...ok, eta_minutes: '1.5' }).eta_minutes).toBeTruthy();
    expect(validateProposal({ ...ok, eta_minutes: '' }).eta_minutes).toBeTruthy();
  });
  it('đọc số tiền có dấu chấm ngăn cách', () => expect(parseMoney('120.000')).toBe(120000));
});

describe('Đánh giá / báo cáo / họ tên', () => {
  it('số sao 1–5 bắt buộc', () => {
    expect(validateReview(0).stars).toBeTruthy();
    expect(validateReview(6).stars).toBeTruthy();
    expect(validateReview(3)).toEqual({});
  });
  it('báo cáo cần nội dung', () => {
    expect(validateReport('  ').content).toBeTruthy();
    expect(validateReport('Thợ thu thêm tiền')).toEqual({});
  });
  it('họ tên bắt buộc (U-02)', () => {
    expect(validateName('').full_name).toBeTruthy();
    expect(validateName('An')).toEqual({});
  });
});
