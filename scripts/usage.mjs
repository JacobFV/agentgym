// Summarize every logged model call by role/provider/model — verifiable sponsor usage.
import { readFileSync } from "node:fs";
const rows = readFileSync(new URL("../results/llm-calls.jsonl", import.meta.url), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const agg = {};
for (const r of rows) {
  const k = `${r.role} | ${r.provider} | ${r.model}`;
  const a = (agg[k] ??= { calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, ms: 0 });
  if (r.error) { a.errors++; continue; }
  a.calls++; a.inputTokens += r.usage?.inputTokens ?? 0; a.outputTokens += r.usage?.outputTokens ?? 0; a.ms += r.latencyMs ?? 0;
}
console.table(Object.fromEntries(Object.entries(agg).map(([k, a]) => [k, { ...a, avgLatencyMs: Math.round(a.ms / Math.max(1, a.calls)), ms: undefined }])));
