// Minimal DeepSeek chat client (native fetch). Never logs or returns the key,
// request headers or the raw provider body: failures are reduced to a kind/status.
import { setTimeout as delay } from 'node:timers/promises';

export const DEFAULT_MODEL = 'deepseek-chat';
export const DEFAULT_BASE_URL = 'https://api.deepseek.com';
export const TIMEOUT_MS = 90_000;
const RETRY_DELAY_MS = 2_000;

export function resolveEndpoint(baseUrl) {
  let url;
  try { url = new URL(baseUrl || DEFAULT_BASE_URL); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}/chat/completions`;
}

function retryable(failure) {
  return failure.kind === 'network' || (failure.kind === 'http' && (failure.status === 429 || failure.status >= 500));
}

async function attempt({ endpoint, apiKey, body, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      return { ok: false, kind: controller.signal.aborted ? 'timeout' : 'network' };
    }
    if (!response.ok) {
      try { await response.body?.cancel(); } catch { /* ignore */ }
      return { ok: false, kind: 'http', status: response.status };
    }
    let payload;
    try { payload = await response.json(); } catch {
      return { ok: false, kind: controller.signal.aborted ? 'timeout' : 'invalid_response' };
    }
    const choice = payload?.choices?.[0];
    const content = choice?.message?.content;
    if (choice?.finish_reason !== 'stop' || typeof content !== 'string' || !content.trim()) return { ok: false, kind: 'invalid_response' };
    const model = typeof payload.model === 'string' ? payload.model.slice(0, 100) : null;
    return { ok: true, content, model };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @returns {Promise<{ ok: true, content: string, model: string|null, attempts: number } | { ok: false, kind: string, status?: number, attempts: number }>}
 */
export async function callDeepSeek({ apiKey, baseUrl, model, messages, fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS, sleep = delay }) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) return { ok: false, kind: 'not_configured', attempts: 0 };
  const endpoint = resolveEndpoint(baseUrl);
  if (!endpoint) return { ok: false, kind: 'invalid_base_url', attempts: 0 };
  const body = {
    model: model || DEFAULT_MODEL,
    messages,
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 4096,
    stream: false,
  };
  let result = await attempt({ endpoint, apiKey, body, fetchImpl, timeoutMs });
  let attempts = 1;
  if (!result.ok && retryable(result)) {
    await sleep(RETRY_DELAY_MS);
    result = await attempt({ endpoint, apiKey, body, fetchImpl, timeoutMs });
    attempts = 2;
  }
  return { ...result, attempts };
}

export function describeFailure(failure) {
  switch (failure.kind) {
    case 'not_configured': return 'DEEPSEEK_API_KEY não configurado';
    case 'invalid_base_url': return 'DEEPSEEK_BASE_URL inválido (exige https)';
    case 'timeout': return 'timeout na chamada ao DeepSeek';
    case 'network': return 'erro de rede na chamada ao DeepSeek';
    case 'http': return `DeepSeek respondeu HTTP ${Number(failure.status)}`;
    default: return 'resposta inválida do DeepSeek';
  }
}
