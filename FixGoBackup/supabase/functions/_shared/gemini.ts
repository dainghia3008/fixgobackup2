export interface AiResult {
  summary: string;
  diagnosis: string[];
  toolkit: { tools: string[]; equipment: string[]; parts: string[] };
}

export class AiError extends Error {
  constructor(public status: number, code: string) { super(code); }
}

const schema = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING', description: 'Tóm tắt và giải thích sự cố bằng tiếng Việt, 2-4 câu' },
    diagnosis: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Các nguyên nhân khả dĩ, sắp xếp từ khả năng cao đến thấp' },
    toolkit: {
      type: 'OBJECT',
      properties: {
        tools: { type: 'ARRAY', items: { type: 'STRING' } },
        equipment: { type: 'ARRAY', items: { type: 'STRING' } },
        parts: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['tools', 'equipment', 'parts'],
    },
  },
  required: ['summary', 'diagnosis', 'toolkit'],
};

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && !!item.trim());
}

// Không lưu JSON thiếu trường/rỗng vào cache: màn hình cần đủ các danh sách để render.
function parseResult(body: any): AiResult {
  const candidate = body?.candidates?.[0];
  if (body?.promptFeedback?.blockReason || ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'RECITATION'].includes(candidate?.finishReason)) {
    throw new AiError(422, 'AI_BLOCKED');
  }
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw new AiError(502, 'AI_INVALID_RESPONSE');
  const text = candidate?.content?.parts
    ?.filter((part: { thought?: boolean; text?: string }) => !part.thought && typeof part.text === 'string')
    .map((part: { text: string }) => part.text).join('') ?? '';
  let result;
  try { result = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); }
  catch { throw new AiError(502, 'AI_INVALID_RESPONSE'); }
  if (!result || typeof result.summary !== 'string' || !result.summary.trim()
    || !stringList(result.diagnosis) || !result.diagnosis.length
    || !stringList(result.toolkit?.tools) || !stringList(result.toolkit?.equipment) || !stringList(result.toolkit?.parts)) {
    throw new AiError(502, 'AI_INVALID_RESPONSE');
  }
  return {
    summary: result.summary.trim(), diagnosis: result.diagnosis,
    toolkit: { tools: result.toolkit.tools, equipment: result.toolkit.equipment, parts: result.toolkit.parts },
  };
}

export async function generateAdvice(options: {
  apiKey: string;
  prompt: string;
  model?: string;
  fallbackModel?: string;
}): Promise<AiResult> {
  if (!options.apiKey.trim()) throw new AiError(503, 'AI_NOT_CONFIGURED');
  const primary = options.model?.trim() || 'gemini-flash-latest';
  const fallback = options.fallbackModel?.trim() || 'gemini-flash-lite-latest';
  // Quá tải một model không được làm hỏng toàn bộ tính năng; tối đa 3 lượt/45 giây.
  const models = [primary, fallback, primary];
  const deadline = Date.now() + 45_000;
  let lastError = new AiError(503, 'AI_UNAVAILABLE');
  for (let attempt = 0; attempt < models.length; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const model = models[attempt].replace(/^models\//, '');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.min(15_000, remaining));
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': options.apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: options.prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 4096, responseMimeType: 'application/json', responseSchema: schema },
        }),
      });
      if (!response.ok) {
        // Chỉ log metadata, không log key hay dữ liệu khách hàng từ phản hồi nhà cung cấp.
        console.warn('Gemini request failed', { model, status: response.status, attempt: attempt + 1 });
        await response.body?.cancel();
        if ([400, 401, 403].includes(response.status)) throw new AiError(503, 'AI_NOT_CONFIGURED');
        if (response.status === 404) throw new AiError(503, 'AI_MODEL_UNAVAILABLE');
        if (response.status === 429) throw new AiError(429, 'AI_RATE_LIMITED');
        throw new AiError(503, 'AI_UNAVAILABLE');
      }
      return parseResult(await response.json());
    } catch (error) {
      lastError = error instanceof AiError ? error : new AiError(ctrl.signal.aborted ? 504 : 503, ctrl.signal.aborted ? 'AI_TIMEOUT' : 'AI_UNAVAILABLE');
      if (['AI_NOT_CONFIGURED', 'AI_BLOCKED'].includes(lastError.message)) throw lastError;
    } finally {
      // Bao gồm cả thời gian tải/đọc JSON, tránh treo sau khi đã nhận response headers.
      clearTimeout(timer);
    }
    if (attempt < models.length - 1) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }
  throw lastError;
}
