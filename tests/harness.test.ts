import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { guardPatch, applyPatch } from "../src/evolution/mutate.js";
import { decide } from "../src/evolution/promote.js";
import { SEED } from "../src/agent/config.js";
import { runTests } from "../src/benchmark/executor.js";
import { loadTasks } from "../src/benchmark/tasks.js";
import { parseJsonLoose } from "../src/providers/index.js";

const tasks = loadTasks("all");

function evalOf(version: string, passes: Record<string, number>, reps = 1, model = "m"): any {
  const perTask = Object.fromEntries(Object.entries(passes).map(([k, v]) => [k, { passes: v, reps, runs: [] }]));
  const runPasses = Object.values(passes).reduce((a, b) => a + b, 0);
  return { version, taskIds: Object.keys(passes), perTask, coder: { model }, totals: { runPasses, runs: Object.keys(passes).length * reps, policyViolations: 0, tokens: 0 } };
}

describe("mutation guard", () => {
  it("rejects edits to frozen / non-mutable fields", () => {
    expect(guardPatch({ toolPolicy: { maxAttempts: 9 } }, tasks)).toContain("field not mutable: toolPolicy.maxAttempts");
    expect(guardPatch({ promotionGate: "always" }, tasks)[0]).toMatch(/not mutable/);
  });
  it("rejects benchmark-specific leakage (overfitting guard)", () => {
    const id = tasks[0].id;
    expect(guardPatch({ systemPrompt: `when you see ${id} do X` }, tasks).join()).toMatch(/overfitting/);
  });
  it("accepts a general methodology change", () => {
    expect(guardPatch({ systemPrompt: "enumerate invariants before editing", toolPolicy: { planFirst: true } }, tasks)).toEqual([]);
  });
  it("applyPatch keeps maxAttempts frozen and records lineage", () => {
    const c = applyPatch(SEED, { toolPolicy: { selfReview: true } } as any, "v0.1", "mut-x");
    expect(c.parent).toBe("v0");
    expect(c.toolPolicy.maxAttempts).toBe(SEED.toolPolicy.maxAttempts);
    expect(c.createdBy).toBe("mutation:mut-x");
  });
});

describe("promotion gate", () => {
  it("promotes strict improvement with no regressions", () => {
    expect(decide(evalOf("v0", { a: 1, b: 0 }), evalOf("v0.1", { a: 1, b: 1 }), []).decision).toBe("PROMOTE");
  });
  it("rejects ties", () => {
    expect(decide(evalOf("v0", { a: 1, b: 0 }), evalOf("v0.1", { a: 1, b: 0 }), []).decision).toBe("REJECT");
  });
  it("rejects net improvement that carries a regression", () => {
    const d = decide(evalOf("v0", { a: 1, b: 0, c: 0 }), evalOf("v0.1", { a: 0, b: 1, c: 1 }), []);
    expect(d.decision).toBe("REJECT");
    expect(d.regressions).toEqual(["a"]);
  });
  it("rejects when coder model differs (not comparable)", () => {
    expect(decide(evalOf("v0", { a: 0 }), evalOf("v0.1", { a: 1 }, 1, "other"), []).decision).toBe("REJECT");
  });
});

describe("sandboxed executor", () => {
  it("scrubs secrets and blocks fs reads outside the workspace", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ag-"));
    mkdirSync(join(dir, "test"));
    writeFileSync(join(dir, "test", "x.test.mjs"), `import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs";
test("no env secrets", () => assert.equal(process.env.SUBQ_API_KEY, undefined));
test("no escape", () => assert.throws(() => fs.readFileSync("/etc/hosts")));`);
    process.env.SUBQ_API_KEY ??= "test-secret";
    const r = await runTests(dir, 10000);
    expect(r.pass).toBe(2);
    expect(r.passed).toBe(true);
  });
  it("times out runaway code", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ag-"));
    mkdirSync(join(dir, "test"));
    writeFileSync(join(dir, "test", "x.test.mjs"), `import test from "node:test"; test("spin", () => { while (true) {} });`);
    const r = await runTests(dir, 1500);
    expect(r.timedOut).toBe(true);
    expect(r.passed).toBe(false);
  });
});

describe("json parsing", () => {
  it("tolerates fences and prose", () => {
    expect(parseJsonLoose('here:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
});
