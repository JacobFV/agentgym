import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const ROOT = new URL("../../", import.meta.url).pathname;
export const RESULTS = join(ROOT, "results");

export function appendJsonl(path: string, record: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(record) + "\n");
}

export function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

export const LLM_LOG = join(RESULTS, "llm-calls.jsonl");

/** Live event bus for UI streaming (optional). */
type Listener = (e: Record<string, unknown>) => void;
const listeners = new Set<Listener>();
export function onEvent(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function emit(e: Record<string, unknown>) {
  const ev = { t: new Date().toISOString(), ...e };
  for (const l of listeners) l(ev);
}
