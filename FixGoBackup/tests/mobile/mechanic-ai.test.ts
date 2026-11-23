import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  askAi: vi.fn(), state: { dispatches: [] as any[] }, exists: true,
}));
vi.mock('react-native', () => ({
  Text: 'Text', View: 'View', StyleSheet: { create: (styles: any) => styles },
  Platform: { select: (options: any) => options.default },
}));
vi.mock('expo-router', () => ({ useLocalSearchParams: () => ({ orderId: 'order-1' }), useRouter: () => ({ back: vi.fn() }) }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/store', () => ({ useMechanic: (selector: any) => selector(mocks.state) }));
vi.mock('@/guard', () => ({ useRequestGuard: () => mocks.exists }));
vi.mock('@/actions', () => ({ askAi: mocks.askAi }));
vi.mock('@/shared/mobile/ui', () => ({ Button: 'Button', Card: 'Card', H: 'H', Screen: 'Screen', Spinner: 'Spinner' }));

import Ai from '../../fixgo-mechanic/app/request/[orderId]/ai';

const advice = { summary: 'Kết quả từ Gemini', diagnosis: ['Thủng săm'], toolkit: { tools: ['Móc lốp'], equipment: ['Bơm'], parts: ['Săm'] } };
let tree: ReturnType<typeof create>;
const rendered = () => JSON.stringify(tree.toJSON());
async function mount() { await act(async () => { tree = create(React.createElement(Ai)); }); }

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mocks.exists = true;
  mocks.state.dispatches = [{ order_id: 'order-1', ai_result: null, order: { incident_types: ['flat_tire'] } }];
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); });

describe('Màn hình trợ lý AI của thợ', () => {
  it('render kết quả Gemini khi thành công', async () => {
    mocks.askAi.mockResolvedValue(advice);
    await mount();
    expect(rendered()).toContain('Kết quả từ Gemini');
    expect(rendered()).not.toContain('Gợi ý có sẵn');
  });

  it('Gemini 503: báo quá tải và vẫn hiện danh sách kiểm tra đúng loại sự cố', async () => {
    mocks.askAi.mockRejectedValue(new Error('AI_UNAVAILABLE'));
    await mount();
    expect(rendered()).toContain('Dịch vụ AI đang quá tải');
    expect(rendered()).toContain('Gợi ý có sẵn (không phải AI)');
    expect(rendered()).toContain('Bơm và đồng hồ đo áp suất');
    expect(mocks.state.dispatches[0].ai_result).toBeNull();
  });

  it('thử lại thành công: thay danh mục tĩnh bằng kết quả AI', async () => {
    mocks.askAi.mockRejectedValueOnce(new Error('AI_TIMEOUT')).mockResolvedValueOnce(advice);
    await mount();
    expect(rendered()).toContain('Gợi ý có sẵn');
    await act(async () => { await tree.root.findByType('Button').props.onPress(); });
    expect(rendered()).toContain('Kết quả từ Gemini');
    expect(rendered()).not.toContain('Gợi ý có sẵn');
    expect(rendered()).not.toContain('AI phản hồi quá lâu');
  });

  it('mở kết quả đã lưu không gọi Gemini lại', async () => {
    mocks.state.dispatches[0].ai_result = advice;
    await mount();
    expect(rendered()).toContain('Kết quả từ Gemini');
    expect(mocks.askAi).not.toHaveBeenCalled();
  });

  it('không che lỗi quyền truy cập bằng danh mục tĩnh', async () => {
    mocks.askAi.mockRejectedValue(new Error('FORBIDDEN'));
    await mount();
    expect(rendered()).toContain('Bạn không có quyền');
    expect(rendered()).not.toContain('Gợi ý có sẵn');
  });

  it('không gọi AI khi yêu cầu không còn khả dụng', async () => {
    mocks.exists = false;
    mocks.state.dispatches = [];
    await mount();
    expect(tree.toJSON()).toBeNull();
    expect(mocks.askAi).not.toHaveBeenCalled();
  });
});
