import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { appendJsonl, ROOT, writeJson } from "../trace/recorder.js";

export interface AgentConfig {
  version: string;
  parent: string | null;
  createdAt: string;
  createdBy: string; // "human:seed" | "mutation:<id>"
  systemPrompt: string;
  skills: Record<string, string>;
  toolPolicy: {
    /** FROZEN — set by the benchmark, not mutable, so candidates get identical budgets. */
    maxAttempts: number;
    /** agent writes an explicit plan (invariants / interfaces / edge cases) before editing. mutable. */
    planFirst: boolean;
    /** after visible tests pass, agent does one self-review pass hunting for unhandled requirements. mutable. */
    selfReview: boolean;
    /** include full test output (vs first failure only) when retrying. mutable. */
    fullTestOutputOnRetry: boolean;
  };
}

/** The ONLY fields a mutation may touch. Everything else (tests, scoring, gate, budgets) is off-limits. */
export const MUTABLE_FIELDS = ["systemPrompt", "skills", "toolPolicy.planFirst", "toolPolicy.selfReview", "toolPolicy.fullTestOutputOnRetry"] as const;

export const VERSIONS_DIR = join(ROOT, "versions");
export const HISTORY = join(VERSIONS_DIR, "history.jsonl");

export const SEED: AgentConfig = {
  version: "v0",
  parent: null,
  createdAt: new Date(0).toISOString(),
  createdBy: "human:seed",
  systemPrompt:
    "You are a coding agent. Implement the requested change described in the ticket so that the tests pass. " +
    "Return the full contents of every file you modify.",
  skills: {},
  toolPolicy: { maxAttempts: 2, planFirst: false, selfReview: false, fullTestOutputOnRetry: false },
};

export function loadVersion(v: string): AgentConfig {
  return JSON.parse(readFileSync(join(VERSIONS_DIR, `${v}.json`), "utf8"));
}

export function saveVersion(c: AgentConfig) {
  writeJson(join(VERSIONS_DIR, `${c.version}.json`), c);
}

export function currentVersion(): AgentConfig {
  const ptr = join(VERSIONS_DIR, "current.json");
  if (!existsSync(ptr)) {
    if (!existsSync(join(VERSIONS_DIR, "v0.json"))) saveVersion({ ...SEED, createdAt: new Date().toISOString() });
    setCurrent("v0", "seed");
  }
  return loadVersion(JSON.parse(readFileSync(ptr, "utf8")).version);
}

export function setCurrent(version: string, reason: string) {
  writeJson(join(VERSIONS_DIR, "current.json"), { version, updatedAt: new Date().toISOString(), reason });
  appendJsonl(HISTORY, { t: new Date().toISOString(), event: "set_current", version, reason });
}

export function nextVersionId(parent: string): string {
  const existing = new Set(readdirSync(VERSIONS_DIR).map((f) => f.replace(/\.json$/, "")));
  for (let i = 1; ; i++) {
    const id = `${parent}.${i}`;
    if (!existing.has(id)) return id;
  }
}

export function renderSystemPrompt(c: AgentConfig): string {
  const skills = Object.entries(c.skills);
  return (
    c.systemPrompt +
    (skills.length ? "\n\n# Skills\n" + skills.map(([k, v]) => `## ${k}\n${v}`).join("\n\n") : "")
  );
}
