import { describe, expect, it } from 'vitest';
import { incidentChecklist } from '../../shared/core/incidentChecklist';
import { INCIDENT_TYPES } from '../../shared/core/constants';

describe('Danh sách chuẩn bị khi AI gián đoạn', () => {
  it('ghi rõ nguồn là danh mục có sẵn, không phải kết quả AI', () => {
    expect(incidentChecklist(['flat_tire']).summary).toContain('không phải kết quả phân tích AI');
  });
  it('sự cố lốp không đưa gợi ý thay ắc quy hay sửa động cơ', () => {
    const result = incidentChecklist(['flat_tire']);
    expect(result.toolkit.equipment).toContain('Bơm và đồng hồ đo áp suất');
    expect(result.toolkit.parts.join(' ')).not.toMatch(/ắc quy|bugi/i);
  });
  it('kết hợp nhiều sự cố và bỏ các mục trùng', () => {
    const result = incidentChecklist(['wont_start', 'hard_start', 'wont_start']);
    expect(result.toolkit.tools.filter((tool) => tool === 'Đồng hồ vạn năng')).toHaveLength(1);
    expect(result.diagnosis.join(' ')).toContain('khó nổ');
    expect(result.diagnosis.join(' ')).toContain('khởi động');
  });
  it('loại sự cố trống hoặc không nhận diện vẫn có mục kiểm tra chung', () => {
    expect(incidentChecklist([])).toEqual(incidentChecklist(['unknown', 'other']));
    expect(incidentChecklist([]).diagnosis.length).toBeGreaterThan(0);
  });
  it.each(INCIDENT_TYPES.map((incident) => incident.code))('hiển thị được cho loại sự cố %s', (code) => {
    const result = incidentChecklist([code]);
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.diagnosis.length).toBeGreaterThan(0);
    expect(result.toolkit.tools.length).toBeGreaterThan(0);
  });
});
