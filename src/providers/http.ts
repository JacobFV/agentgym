import type { ChatRequest, ChatResponse, Provider } from "./types.js";

export async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs = 180_000) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}: ${text.slice(0, 500)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`non-JSON response from ${new URL(url).host}: ${text.slice(0, 300)}`);
  }
}

/** OpenAI-compatible /chat/completions adapter (used for any provider exposing that contract). */
export function openAICompatible(opts: {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  jsonMode?: boolean;
}): Provider {
  return {
    id: opts.id,
    label: opts.label,
    model: opts.model,
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const t0 = Date.now();
      const body: Record<string, unknown> = {
        model: opts.model,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
        max_tokens: req.maxTokens ?? 8000,
        temperature: req.temperature ?? 0.2,
      };
      if (req.json && opts.jsonMode !== false) body.response_format = { type: "json_object" };
      const raw = await postJson(`${opts.baseUrl.replace(/\/$/, "")}/chat/completions`, { authorization: `Bearer ${opts.apiKey}` }, body);
      const text = raw?.choices?.[0]?.message?.content ?? "";
      const u = raw?.usage ?? {};
      return {
        text,
        provider: opts.id,
        model: raw?.model ?? opts.model,
        usage: { inputTokens: u.prompt_tokens, outputTokens: u.completion_tokens, totalTokens: u.total_tokens },
        latencyMs: Date.now() - t0,
        raw: { id: raw?.id, model: raw?.model, usage: raw?.usage },
      };
    },
  };
}
