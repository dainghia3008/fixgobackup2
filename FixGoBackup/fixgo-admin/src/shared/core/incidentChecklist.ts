import type { AiResult } from './types';

type Checklist = { checks: string[]; tools: string[]; equipment: string[]; parts: string[] };
const general: Checklist = {
  checks: ['Xác nhận triệu chứng với khách và kiểm tra trực tiếp xe trước khi kết luận.', 'Xác nhận dòng xe và thông số phụ tùng trước khi chuẩn bị thay thế.'],
  tools: ['Bộ dụng cụ sửa xe cơ bản', 'Đèn pin'], equipment: ['Găng tay bảo hộ'], parts: [],
};
const checklists: Record<string, Checklist> = {
  flat_tire: {
    checks: ['Kiểm tra lốp, van và vị trí mất hơi; xác nhận xe dùng săm hay lốp không săm.'],
    tools: ['Dụng cụ kiểm tra van, tháo lốp phù hợp'], equipment: ['Bơm và đồng hồ đo áp suất'],
    parts: ['Vật tư vá, van hoặc săm đúng loại sau khi xác nhận với khách'],
  },
  wont_start: {
    checks: ['Kiểm tra nguồn điện, đầu nối ắc quy, cầu chì và hệ thống khởi động.', 'Xác nhận tình trạng nhiên liệu và đánh lửa.'],
    tools: ['Đồng hồ vạn năng', 'Tuýp bugi đúng cỡ'], equipment: [], parts: ['Cầu chì đúng định mức sau khi xác nhận dòng xe'],
  },
  dead_battery: {
    checks: ['Kiểm tra tình trạng ắc quy, đầu nối và hệ thống sạc theo thông số của xe.'],
    tools: ['Đồng hồ vạn năng'], equipment: ['Thiết bị kiểm tra ắc quy'], parts: ['Ắc quy đúng thông số nếu xác nhận cần thay'],
  },
  chain: {
    checks: ['Kiểm tra xích, nhông và đĩa; xác nhận loại truyền động của xe.'],
    tools: ['Bộ dụng cụ kiểm tra và chỉnh xích'], equipment: [], parts: ['Xích và mắt nối đúng loại nếu cần thay'],
  },
  brakes: {
    checks: ['Xác nhận loại phanh, kiểm tra má phanh, dây phanh hoặc đường dầu.', 'Không chạy thử xe khi hệ thống phanh chưa được xác nhận an toàn.'],
    tools: ['Bộ dụng cụ kiểm tra phanh'], equipment: [], parts: ['Vật tư phanh đúng thông số sau khi kiểm tra'],
  },
  hard_start: {
    checks: ['Ghi nhận xe khó nổ khi nóng hay nguội; kiểm tra nguồn điện, bugi và lọc gió.'],
    tools: ['Đồng hồ vạn năng', 'Tuýp bugi đúng cỡ'], equipment: [], parts: ['Bugi đúng mã nếu cần thay'],
  },
  spark_plug: {
    checks: ['Kiểm tra bugi, chụp bugi và hệ thống đánh lửa theo hướng dẫn của dòng xe.'],
    tools: ['Tuýp bugi đúng cỡ', 'Đồng hồ vạn năng'], equipment: [], parts: ['Bugi đúng mã nếu cần thay'],
  },
};

// Danh mục tĩnh dùng khi dịch vụ AI gián đoạn, không phải kết quả Gemini và không lưu vào ai_result.
export function incidentChecklist(incidentTypes: readonly string[]): AiResult {
  const items = [general, ...[...new Set(incidentTypes)].flatMap((code) => checklists[code] ? [checklists[code]] : [])];
  const unique = (key: keyof Checklist) => [...new Set(items.flatMap((item) => item[key]))];
  return {
    summary: 'Danh sách chuẩn bị có sẵn theo loại sự cố khách đã chọn. Đây không phải kết quả phân tích AI; cần kiểm tra xe thực tế trước khi chẩn đoán hoặc báo giá.',
    diagnosis: unique('checks'),
    toolkit: { tools: unique('tools'), equipment: unique('equipment'), parts: unique('parts') },
  };
}
