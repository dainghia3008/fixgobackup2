import { describe, it, expect } from 'vitest';
import { formatVND, formatPriceRange, formatDistance, formatDuration, shortCode, formatRating } from '../../shared/core/format';
import { errorCode, errorMessage } from '../../shared/core/errors';
import { averageRating } from '../../shared/core/rating';
import { incidentLabel, INCIDENT_TYPES, SKILLS, ORDER_STATUS_LABEL } from '../../shared/core/constants';

describe('Định dạng', () => {
  it('tiền VNĐ', () => {
    expect(formatVND(0)).toBe('0 đ');
    expect(formatVND(1500000)).toBe('1.500.000 đ');
    expect(formatPriceRange(50000, 120000)).toBe('50.000 đ – 120.000 đ');
    expect(formatPriceRange(80000, 80000)).toBe('80.000 đ');
  });
  it('khoảng cách và thời gian', () => {
    expect(formatDistance(450)).toBe('450 m');
    expect(formatDistance(1530)).toBe('1.5 km');
    expect(formatDuration(30)).toBe('1 phút');
    expect(formatDuration(3600 + 600)).toBe('1 giờ 10 phút');
  });
  it('mã đơn rút gọn và điểm đánh giá', () => {
    expect(shortCode('1234abcd-0000-0000-0000-000000000000')).toBe('FG-1234AB');
    expect(formatRating(4.666, 3)).toBe('4.7 (3)');
    expect(formatRating(0, 0)).toBe('Chưa có đánh giá');
  });
});

describe('Lỗi RPC', () => {
  it('tách mã lỗi từ message', () => {
    expect(errorCode({ message: 'PROPOSAL_UNAVAILABLE' })).toBe('PROPOSAL_UNAVAILABLE');
    expect(errorCode({ message: 'INVALID_PROFILE:id_number' })).toBe('INVALID_PROFILE');
    expect(errorCode(new Error('QUOTE_SUPERSEDED'))).toBe('QUOTE_SUPERSEDED');
  });
  it('trả thông báo tiếng Việt', () => {
    expect(errorMessage({ message: 'ACTIVE_ORDER_EXISTS' })).toMatch(/yêu cầu cứu hộ/);
    expect(errorMessage({ message: 'Network request failed' })).toMatch(/kết nối/);
  });
});

describe('BR-17 – điểm trung bình', () => {
  it('trung bình cộng, chưa có đánh giá thì 0', () => {
    expect(averageRating([])).toEqual({ avg: 0, count: 0 });
    expect(averageRating([5, 4, 4])).toEqual({ avg: 4.33, count: 3 });
    expect(averageRating([1, 2, 3, 4, 5])).toEqual({ avg: 3, count: 5 });
  });
});

describe('Hằng số theo đặc tả', () => {
  it('có đủ 8 loại sự cố và 7 kỹ năng', () => {
    expect(INCIDENT_TYPES).toHaveLength(8);
    expect(SKILLS).toHaveLength(7);
    expect(incidentLabel('chain')).toBe('Tuột hoặc đứt xích');
  });
  it('đủ nhãn cho 9 trạng thái đơn', () => expect(Object.keys(ORDER_STATUS_LABEL)).toHaveLength(9));
});
