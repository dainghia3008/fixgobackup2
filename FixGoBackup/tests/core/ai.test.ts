import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateAdvice } from '../../supabase/functions/_shared/gemini';

const advice = {
  summary: 'Xe bị xì lốp sau, cần kiểm tra săm và van.',
  diagnosis: ['Thủng săm', 'Hở van'],
  toolkit: { tools: ['Bộ móc lốp'], equipment: ['Bơm'], parts: ['Săm dự phòng'] },
};
const success = (value: unknown = advice) => Response.json({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }],
});
const options = { apiKey: 'test-key', prompt: 'Xe bị xì lốp sau' };
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Trợ lý AI: phục hồi khi Gemini quá tải', () => {
  it('trả kết quả ngay khi model chính hoạt động', async () => {
    fetchMock.mockResolvedValueOnce(success());
    expect(await generateAdvice(options)).toEqual(advice);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('503 giống lỗi thực tế: chuyển model dự phòng rồi trả kết quả', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(success());
    const pending = generateAdvice(options);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual(advice);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      expect.stringContaining('/gemini-flash-latest:generateContent'),
      expect.stringContaining('/gemini-flash-lite-latest:generateContent'),
    ]);
  });

  it('không thử lại vô hạn khi tất cả model đều quá tải', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('', { status: 503 })));
    const pending = expect(generateAdvice(options)).rejects.toMatchObject({ status: 503, message: 'AI_UNAVAILABLE' });
    await vi.runAllTimersAsync();
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([400, 401, 403])('không thử lại lỗi cấu hình HTTP %s', async (status) => {
    fetchMock.mockResolvedValueOnce(new Response('', { status }));
    await expect(generateAdvice(options)).rejects.toMatchObject({ message: 'AI_NOT_CONFIGURED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('phát hiện thiếu API key trước khi gửi request', async () => {
    await expect(generateAdvice({ ...options, apiKey: ' ' })).rejects.toMatchObject({ message: 'AI_NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('thử model dự phòng cấu hình riêng nếu model chính không còn tồn tại', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 })).mockResolvedValueOnce(success());
    const pending = generateAdvice({ ...options, model: 'models/custom-primary', fallbackModel: 'custom-fallback' });
    await vi.runAllTimersAsync();
    expect(await pending).toEqual(advice);
    expect(fetchMock.mock.calls[1][0]).toContain('/custom-fallback:generateContent');
  });

  it('trả mã giới hạn lượt dùng thay vì lỗi chung', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('', { status: 429 })));
    const pending = expect(generateAdvice(options)).rejects.toMatchObject({ message: 'AI_RATE_LIMITED' });
    await vi.runAllTimersAsync();
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([null, {}, { ...advice, toolkit: null }, { ...advice, diagnosis: [42] }])('không trả kết quả thiếu/sai cấu trúc: %j', async (value) => {
    fetchMock.mockImplementation(() => Promise.resolve(success(value)));
    const pending = expect(generateAdvice(options)).rejects.toMatchObject({ message: 'AI_INVALID_RESPONSE' });
    await vi.runAllTimersAsync();
    await pending;
  });

  it('không nối nội dung suy nghĩ vào JSON kết quả', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [
      { thought: true, text: 'internal reasoning' }, { text: JSON.stringify(advice) },
    ] } }] }));
    expect(await generateAdvice(options)).toEqual(advice);
  });

  it('không dùng hoặc lưu JSON bị cắt dù vẫn parse được', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(Response.json({ candidates: [{
      finishReason: 'MAX_TOKENS', content: { parts: [{ text: JSON.stringify(advice) }] },
    }] })));
    const pending = expect(generateAdvice(options)).rejects.toMatchObject({ message: 'AI_INVALID_RESPONSE' });
    await vi.runAllTimersAsync();
    await pending;
  });

  it('không thử lại nội dung bị Gemini chặn', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ promptFeedback: { blockReason: 'SAFETY' } }));
    await expect(generateAdvice(options)).rejects.toMatchObject({ status: 422, message: 'AI_BLOCKED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('hủy các request bị treo và kết thúc trong ngân sách thời gian', async () => {
    const start = Date.now();
    fetchMock.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const pending = expect(generateAdvice(options)).rejects.toMatchObject({ status: 504, message: 'AI_TIMEOUT' });
    await vi.runAllTimersAsync();
    await pending;
    expect(Date.now() - start).toBeLessThanOrEqual(45_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
