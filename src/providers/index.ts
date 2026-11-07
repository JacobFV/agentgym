import { createHash } from "node:crypto";
import type { ChatRequest, ChatResponse, Provider, Role } from "./types.js";
import { claudeCli } from "./claude-cli.js";
import { metaProvider } from "./meta.js";
import { subqProvider } from "./subquadratic.js";
import { geminiProvider } from "./gemini.js";
import { appendJsonl, emit, LLM_LOG } from "../trace/recorder.js";

const DEFAULT_ROLE_PROVIDER: Record<Role, string> = {
  coder: "meta",
  analyzer: "subquadratic",
  mutator: "meta",
  verifier: "gemini",
};

function build(name: string): Provider | null {
  switch (name) {
    case "meta":
      return metaProvider();
    case "subquadratic":
      return subqProvider();
    case "gemini":
      return geminiProvider();
    case "claude-cli":
      return claudeCli();
    case "none":
      return null;
    default:
      throw new Error(`unknown provider "${name}"`);
  }
}

/**
 * Resolve the provider for a role. Explicit env (e.g. CODER_PROVIDER=claude-cli) wins.
 * If the sponsor default has no credentials we fall back to the dev adapter ONLY when
 * ALLOW_DEV_FALLBACK=1, and the fallback is loudly labeled — never silently presented as a sponsor.
 */
export function providerFor(role: Role): Provider | null {
  const explicit = process.env[`${role.toUpperCase()}_PROVIDER`];
  const name = explicit || DEFAULT_ROLE_PROVIDER[role];
  const p = build(name);
  if (p) return p;
  if (role === "verifier") return null; // optional
  if (process.env.ALLOW_DEV_FALLBACK === "1") {
    console.warn(`[providers] ${role}: "${name}" has no credentials → using claude-cli DEV ADAPTER (not a sponsor)`);
    return claudeCli();
  }
  throw new Error(
    `[providers] role "${role}" wants provider "${name}" but it has no credentials. ` +
      `set the key in .env (see .env.example), or set ${role.toUpperCase()}_PROVIDER=claude-cli / ALLOW_DEV_FALLBACK=1 for dev.`,
  );
}

export function describeProviders() {
  return (["coder", "analyzer", "mutator", "verifier"] as Role[]).map((r) => {
    try {
      const p = providerFor(r);
      return { role: r, provider: p?.id ?? "none", model: p?.model ?? "-", label: p?.label ?? "disabled" };
    } catch (e) {
      return { role: r, provider: "MISSING", model: "-", label: (e as Error).message };
    }
  });
}

/** Call a provider with logging. Every call lands in results/llm-calls.jsonl. */
export async function callLLM(role: Role, p: Provider, req: ChatRequest, ctx: Record<string, unknown> = {}): Promise<ChatResponse> {
  const t = new Date().toISOString();
  const promptHash = createHash("sha256").update(req.system + "\n" + req.user).digest("hex").slice(0, 16);
  emit({ type: "llm_start", role, provider: p.id, model: p.model, ...ctx });
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await p.chat(req);
      appendJsonl(LLM_LOG, {
        t, role, provider: r.provider, model: r.model, usage: r.usage, latencyMs: r.latencyMs,
        promptChars: req.system.length + req.user.length, responseChars: r.text.length, promptHash, ...ctx,
      });
      emit({ type: "llm_end", role, provider: r.provider, model: r.model, usage: r.usage, latencyMs: r.latencyMs, ...ctx });
      return r;
    } catch (e) {
      lastErr = e;
      appendJsonl(LLM_LOG, { t, role, provider: p.id, model: p.model, error: String(e), attempt: i, ...ctx });
      await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
    }
  }
  throw lastErr;
}

/** Extract a JSON object from model output (tolerates fences / leading prose). */
export function parseJsonLoose<T = any>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [text, fenced?.[1]];
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    if (!c) continue;
    try {
      return JSON.parse(c.trim());
    } catch {}
  }
  throw new Error(`could not parse JSON from model output: ${text.slice(0, 200)}`);
}
