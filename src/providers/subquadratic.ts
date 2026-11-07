import { appendJsonl, emit, LLM_LOG } from "../trace/recorder.js";
import { postJson } from "./http.js";

/**
 * Subquadratic SubQ Snap — Decisions API (POST https://api.subq.ai/v1/systemone).
 * Contract per https://docs.subq.ai/endpoints/decisions-api/ : `state` (text/object, ≤384K tokens total)
 * + up to 128 named typed questions (noul | choice | score) → typed answers with probabilities.
 */
export type SnapQuestion =
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string | null> }
  | { type: "score"; instructions: string; criteria: string[] };

export type SnapAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: "score"; score: number; legend: Record<string, string>; probabilities: Record<string, number>; confidence: number };

export interface SnapResult {
  model: string;
  answers: Record<string, SnapAnswer>;
  usage: { input_tokens: number; output_tokens: number };
  latencyMs: number;
}

export function subqConfigured() {
  return !!process.env.SUBQ_API_KEY;
}

export async function snapDecide(state: unknown, questions: Record<string, SnapQuestion>, ctx: Record<string, unknown> = {}): Promise<SnapResult> {
  const key = process.env.SUBQ_API_KEY;
  if (!key) throw new Error("SUBQ_API_KEY missing — set it in .env (https://console.subq.ai)");
  const model = process.env.SUBQ_SNAP_MODEL || "subq-snap-1.1";
  const base = (process.env.SUBQ_BASE_URL || "https://api.subq.ai/v1").replace(/\/$/, "");
  const names = Object.keys(questions);
  if (names.length < 1 || names.length > 128) throw new Error(`snap: 1-128 questions required, got ${names.length}`);
  const t0 = Date.now();
  emit({ type: "llm_start", role: "analyzer", provider: "subquadratic", model, questions: names.length, ...ctx });
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const raw = await postJson(`${base}/systemone`, { authorization: `Bearer ${key}` }, { model, state, questions }, 240_000);
      const r: SnapResult = { model: raw.model ?? model, answers: raw.answers, usage: raw.usage, latencyMs: Date.now() - t0 };
      appendJsonl(LLM_LOG, {
        t: new Date().toISOString(), role: "analyzer", provider: "subquadratic", endpoint: "/v1/systemone", model: r.model,
        usage: { inputTokens: r.usage?.input_tokens, outputTokens: r.usage?.output_tokens }, latencyMs: r.latencyMs,
        questions: names.length, stateChars: JSON.stringify(state).length, ...ctx,
      });
      emit({ type: "llm_end", role: "analyzer", provider: "subquadratic", model: r.model, usage: r.usage, latencyMs: r.latencyMs, ...ctx });
      return r;
    } catch (e) {
      lastErr = e;
      appendJsonl(LLM_LOG, { t: new Date().toISOString(), role: "analyzer", provider: "subquadratic", model, error: String(e), attempt: i, ...ctx });
      if (/HTTP (400|401|402|403|422)/.test(String(e))) break;
      await new Promise((res) => setTimeout(res, 3000 * (i + 1)));
    }
  }
  throw lastErr;
}

// legacy chat-provider hook (SubQ chat model is per-org early access; not enabled for our key)
export function subqProvider() {
  return null;
}
