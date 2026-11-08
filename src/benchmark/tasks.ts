import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT } from "../trace/recorder.js";

export type Split = "dev" | "val" | "test" | "final";

export interface CodingTask {
  id: string;
  split: Split;
  title: string;
  description: string;
  initialFiles: Record<string, string>; // visible to the solver (src + visible tests)
  testCommand: string;
  timeoutMs: number;
  /** private grading assets — never given to the solver or the mutation generator */
  hiddenDir: string;
}

export const TASKS_DIR = join(ROOT, "tasks");

export function readTree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out[relative(dir, p)] = readFileSync(p, "utf8");
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

export function loadTasks(split?: Split | "all"): CodingTask[] {
  const ids = readdirSync(TASKS_DIR).filter((d) => existsSync(join(TASKS_DIR, d, "task.json"))).sort();
  return ids
    .map((id) => {
      const meta = JSON.parse(readFileSync(join(TASKS_DIR, id, "task.json"), "utf8"));
      return {
        id: meta.id,
        split: meta.split,
        title: meta.title ?? meta.id,
        description: meta.description,
        initialFiles: readTree(join(TASKS_DIR, id, "initial")),
        testCommand: "node --test test/",
        timeoutMs: meta.timeoutMs ?? 20000,
        hiddenDir: join(TASKS_DIR, id, "hidden"),
      } as CodingTask;
    })
    .filter((t) => !split || split === "all" || t.split === split);
}
