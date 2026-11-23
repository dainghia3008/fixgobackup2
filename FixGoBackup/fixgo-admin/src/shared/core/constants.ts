import type { OrderStatus } from './types';

export const DISPATCH_RADIUS_M = 5000; // BR-01: tuyến đường dưới 5 km

export const INCIDENT_TYPES = [
  { code: 'flat_tire', label: 'Thủng lốp hoặc xì lốp', icon: 'disc-outline' },
  { code: 'wont_start', label: 'Không khởi động', icon: 'power-outline' },
  { code: 'dead_battery', label: 'Hết bình ắc quy', icon: 'battery-dead-outline' },
  { code: 'chain', label: 'Tuột hoặc đứt xích', icon: 'link-outline' },
  { code: 'brakes', label: 'Hỏng hệ thống phanh', icon: 'hand-left-outline' },
  { code: 'hard_start', label: 'Khó nổ, hụt ga', icon: 'speedometer-outline' },
  { code: 'spark_plug', label: 'Hỏng bugi, đánh lửa', icon: 'flash-outline' },
  { code: 'other', label: 'Sự cố khác (Không rõ nguyên nhân)', icon: 'help-circle-outline' },
] as const;

export const SKILLS = [
  { code: 'starter', label: 'Hệ thống khởi động (cần, đề, đạp)' },
  { code: 'battery', label: 'Ắc quy điện và xe' },
  { code: 'tires', label: 'Lốp và bánh xe (vá, thay săm)' },
  { code: 'chain', label: 'Xích & truyền động (nhông sên, curoa)' },
  { code: 'brakes', label: 'Hệ thống phanh (đĩa, phanh cơ)' },
  { code: 'engine', label: 'Động cơ và bugi' },
  { code: 'maintenance', label: 'Bảo dưỡng cơ bản (thay nhớt, lọc gió, nồi xe)' },
] as const;

export const incidentLabel = (code: string): string =>
  INCIDENT_TYPES.find((i) => i.code === code)?.label ?? code;
export const skillLabel = (code: string): string =>
  SKILLS.find((i) => i.code === code)?.label ?? code;

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  searching: 'Đang tìm thợ',
  selected: 'Đã chốt thợ',
  traveling: 'Đang di chuyển',
  arrived: 'Thợ đã đến nơi',
  quote_pending: 'Chờ khách xác nhận phiếu',
  repairing: 'Đang sửa chữa',
  awaiting_payment: 'Chờ xác nhận thanh toán',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

export const ACTIVE_STATUSES: OrderStatus[] = [
  'searching', 'selected', 'traveling', 'arrived', 'quote_pending', 'repairing',
];
export const CHAT_STATUSES: OrderStatus[] = ['selected', 'traveling', 'arrived', 'quote_pending', 'repairing'];

export const QUICK_REPLIES = ['Đang tới ngay', 'Tôi sẽ có mặt trong ít phút', 'Bạn gửi giúp tôi vị trí chính xác nhé'];

export const STALE_LOCATION_MINUTES = 30;
