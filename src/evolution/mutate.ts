import { basename } from "node:path";
import type { AgentConfig } from "../agent/config.js";
import { MUTABLE_FIELDS, nextVersionId } from "../agent/config.js";
import type { CodingTask } from "../benchmark/tasks.js";
import type { Diagnosis } from "./analyze.js";
import { callLLM, parseJsonLoose } from "../providers/index.js";
import type { Provider } from "../providers/types.js";

export interface ConfigPatch {
  systemPrompt?: string;
  skills?: Record<string, string | null>;
  toolPolicy?: { planFirst?: boolean; selfReview?: boolean; fullTestOutputOnRetry?: boolean };
}

export interface MutationProposal {
  id: string;
  parentVersion: string;
  candidateVersion: string;
  target: string;
  diagnosis: string;
  rationale: string;
  proposedChange: string;
  expectedImpact: string;
  supportingTraceIds: string[];
  patch: ConfigPatch;
  generator: { provider: string; model: string; latencyMs: number; usage: unknown };
  guard: { ok: boolean; violations: string[] };
  createdAt: string;
}

/** Hard guard: mutations may only touch MUTABLE_FIELDS, and must not smuggle in benchmark-specific knowledge. */
export function guardPatch(patch: any, allTasks: CodingTask[]): string[] {
  const v: string[] = [];
  const allowedTop = new Set(["systemPrompt", "skills", "toolPolicy"]);
  for (const k of Object.keys(patch ?? {})) if (!allowedTop.has(k)) v.push(`field not mutable: ${k}`);
  for (const k of Object.keys(patch?.toolPolicy ?? {})) if (!MUTABLE_FIELDS.includes(`toolPolicy.${k}` as any)) v.push(`field not mutable: toolPolicy.${k}`);
  for (const [k, val] of Object.entries(patch?.toolPolicy ?? {})) if (typeof val !== "boolean") v.push(`toolPolicy.${k} must be boolean`);
  if (patch?.systemPrompt !== undefined && (typeof patch.systemPrompt !== "string" || patch.systemPrompt.length > 6000)) v.push("systemPrompt must be a string ≤6000 chars");
  for (const [k, val] of Object.entries(patch?.skills ?? {})) if (val !== null && (typeof val !== "string" || (val as string).length > 3000)) v.push(`skill ${k} must be string ≤3000 or null`);
  // anti-overfitting: no task ids or task file names in the new behavior text
  const text = JSON.stringify(patch ?? {}).toLowerCase();
  const leaks = new Set<string>();
  for (const t of allTasks) {
    leaks.add(t.id.toLowerCase());
    for (const p of Object.keys(t.initialFiles)) if (p.startsWith("src/")) leaks.add(basename(p).toLowerCase());
  }
  for (const l of leaks) if (text.includes(l)) v.push(`patch references benchmark-specific identifier "${l}" (overfitting guard)`);
  return v;
}

export function applyPatch(parent: AgentConfig, patch: ConfigPatch, version: string, mutationId: string): AgentConfig {
  const skills = { ...parent.skills };
  for (const [k, val] of Object.entries(patch.skills ?? {})) if (val === null) delete skills[k]; else skills[k] = val;
  return {
    ...parent,
    version, parent: parent.version, createdAt: new Date().toISOString(), createdBy: `mutation:${mutationId}`,
    systemPrompt: patch.systemPrompt ?? parent.systemPrompt,
    skills,
    toolPolicy: { ...parent.toolPolicy, ...(patch.toolPolicy ?? {}), maxAttempts: parent.toolPolicy.maxAttempts },
  };
}

export async function generateMutations(
  diagnosis: Diagnosis, parent: AgentConfig, evidence: string, n: number, mutator: Provider, allTasks: CodingTask[], history: unknown[], ctx: Record<string, unknown>,
): Promise<MutationProposal[]> {
  const system =
    "You are the mutation engine of a self-improving coding agent. You propose bounded, general changes to the agent's configuration " +
    "that fix systemic weaknesses in its software-engineering methodology. Changes must generalize to unseen tickets: never mention specific tasks, files, function names, or test names.";
  const user = `# Current agent configuration (${parent.version})
${JSON.stringify({ systemPrompt: parent.systemPrompt, skills: parent.skills, toolPolicy: parent.toolPolicy }, null, 2)}

# Mutable fields (ONLY these may change)
- systemPrompt: string (full replacement)
- skills: { name: string | null }   (add/replace a skill; null deletes it)
- toolPolicy.planFirst: boolean   (agent writes an explicit plan of interfaces/invariants/edge cases before editing; costs one extra LLM call)
- toolPolicy.selfReview: boolean  (after visible tests pass, one extra self-review pass against the full ticket)
- toolPolicy.fullTestOutputOnRetry: boolean
toolPolicy.maxAttempts is FROZEN at ${parent.toolPolicy.maxAttempts}. Tests, grading, and promotion rules are not yours to change.

# Failure diagnosis from Subquadratic SubQ Snap (long-context analysis across all development traces)
${JSON.stringify({ summary: diagnosis.summary, recurring: diagnosis.recurring, prevalence: diagnosis.prevalence, systemicProbability: diagnosis.systemicProbability, overclaimProbability: diagnosis.overclaimProbability, suggestedLever: diagnosis.lever, perTrace: diagnosis.perTrace }, null, 2)}

# Evidence excerpts (development traces only)
${evidence}

# Prior mutations and their outcomes
${JSON.stringify(history, null, 2)}

Propose ${n} DIFFERENT candidate mutations (different levers or materially different wording). Return JSON:
{"proposals": [{
  "target": "<which field(s) you change>",
  "diagnosis": "<the weakness this addresses, in your words>",
  "rationale": "<why this change fixes it in general>",
  "proposedChange": "<one-sentence human summary of the change>",
  "expectedImpact": "<predicted behavioral effect and any cost/risk>",
  "supportingTraceIds": ["<trace ids from the diagnosis>"],
  "patch": { "systemPrompt"?: "...", "skills"?: {"name": "..."}, "toolPolicy"?: {"planFirst"?: true, "selfReview"?: true, "fullTestOutputOnRetry"?: true} }
}]}`;
  const r = await callLLM("mutator", mutator, { system, user, json: true, maxTokens: 8000, temperature: 0.7 }, ctx);
  const parsed = parseJsonLoose<{ proposals: any[] }>(r.text);
  let nextIdx = 0;
  return (parsed.proposals ?? []).slice(0, n).map((p, i) => {
    const violations = guardPatch(p.patch, allTasks);
    const id = `mut-${Date.now().toString(36)}-${i}`;
    // allocate unique version ids without writing yet
    const base = nextVersionId(parent.version);
    const [stem, num] = [base.slice(0, base.lastIndexOf(".")), Number(base.slice(base.lastIndexOf(".") + 1))];
    const candidateVersion = `${stem}.${num + nextIdx++}`;
    return {
      id, parentVersion: parent.version, candidateVersion,
      target: String(p.target ?? ""), diagnosis: String(p.diagnosis ?? ""), rationale: String(p.rationale ?? ""),
      proposedChange: String(p.proposedChange ?? ""), expectedImpact: String(p.expectedImpact ?? ""),
      supportingTraceIds: Array.isArray(p.supportingTraceIds) ? p.supportingTraceIds.map(String) : [],
      patch: p.patch ?? {}, generator: { provider: r.provider, model: r.model, latencyMs: r.latencyMs, usage: r.usage },
      guard: { ok: violations.length === 0, violations }, createdAt: new Date().toISOString(),
    };
  });
}
