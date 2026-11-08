/**
 * Optimization controls: baselines that produce candidate configs from a parent using the SAME
 * mutation schema + guardPatch as the main evolution loop, but WITHOUT diagnosis/trace feedback.
 *  - randomMutations: seeded random valid patches (no LLM).
 *  - oneShotRedesign: one Meta call that redesigns the config blind (no traces, no results).
 */
import type { AgentConfig } from "../agent/config.js";
import type { CodingTask } from "../benchmark/tasks.js";
import { callLLM, parseJsonLoose } from "../providers/index.js";
import type { Provider } from "../providers/types.js";
import { applyPatch, guardPatch, type ConfigPatch } from "./mutate.js";

export interface ControlCandidate {
  cfg: AgentConfig;
  patch: ConfigPatch;
  description: string;
}

export interface OneShotCandidate extends ControlCandidate {
  generator: { provider: string; model: string; latencyMs: number; usage: unknown };
}

/** mulberry32: tiny deterministic PRNG returning floats in [0,1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POLICY_KEYS = ["planFirst", "selfReview", "fullTestOutputOnRetry"] as const;

/** Fixed generic SE skill library (benchmark-agnostic). */
export const GENERIC_SKILLS: Record<string, string> = {
  "read-callers-first": "Before editing a function, read all of its callers and usages so your change keeps every call site working.",
  "error-and-cancellation-paths": "Handle error, rejection, timeout, and cancellation paths explicitly; do not only implement the happy path.",
  "backward-compatibility": "Preserve backward compatibility of existing public APIs, defaults, and return shapes unless the ticket explicitly asks to change them.",
  "test-edge-cases": "Consider edge cases (empty inputs, null/undefined, boundaries, duplicates, large values) and make sure the implementation handles them.",
  "minimal-changes": "Keep changes minimal and focused on the ticket; avoid unrelated refactors that could break existing behavior.",
  "reread-ticket": "Before finishing, re-read the ticket line by line and confirm every stated requirement is implemented.",
};

function safeId(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_");
}

/** Seeded random valid patches. Deterministic for a given (parent, n, seed). No LLM calls. */
export function randomMutations(parent: AgentConfig, n: number, seed: number, allTasks: CodingTask[]): ControlCandidate[] {
  const rand = mulberry32(seed);
  const skillNames = Object.keys(GENERIC_SKILLS);
  const out: ControlCandidate[] = [];
  for (let i = 0; i < n; i++) {
    let patch: ConfigPatch = {};
    const parts: string[] = [];
    // try a few times to get a non-empty, guard-clean patch
    for (let attempt = 0; attempt < 10; attempt++) {
      patch = {};
      parts.length = 0;
      const tp: NonNullable<ConfigPatch["toolPolicy"]> = {};
      for (const k of POLICY_KEYS) {
        if (rand() < 0.5) {
          tp[k] = !parent.toolPolicy[k];
          parts.push(`${k}=${tp[k]}`);
        }
      }
      if (Object.keys(tp).length) patch.toolPolicy = tp;
      if (rand() < 0.5) {
        const name = skillNames[Math.floor(rand() * skillNames.length)];
        patch.skills = { [name]: GENERIC_SKILLS[name] };
        parts.push(`+skill:${name}`);
      }
      if (parts.length && guardPatch(patch, allTasks).length === 0) break;
    }
    if (!parts.length || guardPatch(patch, allTasks).length) continue;
    const version = safeId(`${parent.version}.r${i + 1}-s${seed}`);
    const cfg = { ...applyPatch(parent, patch, version, `random-${seed}-${i + 1}`), version, createdBy: "control:random" };
    out.push({ cfg, patch, description: `random: ${parts.join(", ")}` });
  }
  return out;
}

/** One blind Meta call: redesign the harness config with no traces, diagnosis, or results. */
export async function oneShotRedesign(
  parent: AgentConfig, n: number, mutator: Provider, allTasks: CodingTask[], ctx: Record<string, unknown> = {},
): Promise<OneShotCandidate[]> {
  const system =
    "You are designing the configuration of an LLM coding agent harness. You propose bounded, general configurations " +
    "that make the agent good at its job. Changes must generalize to unseen tickets: never mention specific tasks, files, function names, or test names.";
  const user = `# Domain
LLM coding agents fixing maintenance tickets in JS repos with hidden tests (the agent sees the ticket, the repo files, and some visible tests; grading uses additional hidden tests).

# Current agent configuration (${parent.version})
${JSON.stringify({ systemPrompt: parent.systemPrompt, skills: parent.skills, toolPolicy: parent.toolPolicy }, null, 2)}

# Mutable fields (ONLY these may change)
- systemPrompt: string (full replacement)
- skills: { name: string | null }   (add/replace a skill; null deletes it)
- toolPolicy.planFirst: boolean   (agent writes an explicit plan of interfaces/invariants/edge cases before editing; costs one extra LLM call)
- toolPolicy.selfReview: boolean  (after visible tests pass, one extra self-review pass against the full ticket)
- toolPolicy.fullTestOutputOnRetry: boolean
toolPolicy.maxAttempts is FROZEN at ${parent.toolPolicy.maxAttempts}. Tests, grading, and promotion rules are not yours to change.

You have no traces, diagnosis, or results; redesign from first principles.

Propose ${n} DIFFERENT candidate redesigns (different levers or materially different wording). Return JSON:
{"proposals": [{
  "target": "<which field(s) you change>",
  "rationale": "<why this change helps in general>",
  "proposedChange": "<one-sentence human summary of the change>",
  "expectedImpact": "<predicted behavioral effect and any cost/risk>",
  "patch": { "systemPrompt"?: "...", "skills"?: {"name": "..."}, "toolPolicy"?: {"planFirst"?: true, "selfReview"?: true, "fullTestOutputOnRetry"?: true} }
}]}`;
  const r = await callLLM("mutator", mutator, { system, user, json: true, maxTokens: 8000, temperature: 0.7 }, ctx);
  const parsed = parseJsonLoose<{ proposals: any[] }>(r.text);
  const generator = { provider: r.provider, model: r.model, latencyMs: r.latencyMs, usage: r.usage };
  const out: OneShotCandidate[] = [];
  (parsed?.proposals ?? []).slice(0, n).forEach((p, i) => {
    const patch: ConfigPatch = p?.patch ?? {};
    if (guardPatch(patch, allTasks).length) return;
    const version = safeId(`${parent.version}.o${i + 1}`);
    const cfg = { ...applyPatch(parent, patch, version, `oneshot-${i + 1}`), version, createdBy: "control:oneshot" };
    out.push({ cfg, patch, description: String(p?.proposedChange ?? p?.rationale ?? "one-shot redesign"), generator });
  });
  return out;
}
