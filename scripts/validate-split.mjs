// Validate only tasks of a given split using the real runner command line. Usage: node scripts/validate-split.mjs final
import { readdirSync, readFileSync, existsSync, mkdtempSync, cpSync, realpathSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
const split = process.argv[2] || "final";
const T = new URL("../tasks/", import.meta.url).pathname;
const run = (ws) => {
  const r = spawnSync(process.execPath, ["--permission", `--allow-fs-read=${ws}`, `--allow-fs-write=${ws}`, "--test-isolation=none", "--test", "--test-reporter=tap", "test/**/*.test.mjs"], { cwd: ws, env: { PATH: process.env.PATH }, timeout: 30000, encoding: "utf8" });
  return { code: r.status, fail: Number((r.stdout || "").match(/^# fail (\d+)/m)?.[1] ?? -1), pass: Number((r.stdout || "").match(/^# pass (\d+)/m)?.[1] ?? -1) };
};
const mk = (id, withHidden, withSolution) => {
  const ws = realpathSync(mkdtempSync(join(tmpdir(), "vs-")));
  cpSync(join(T, id, "initial"), ws, { recursive: true });
  if (withSolution) cpSync(join(T, id, "solution"), ws, { recursive: true });
  if (withHidden) cpSync(join(T, id, "hidden", "hidden.test.mjs"), join(ws, "test", "hidden.test.mjs"));
  return ws;
};
let bad = 0;
for (const id of readdirSync(T).filter((d) => existsSync(join(T, d, "task.json")))) {
  const meta = JSON.parse(readFileSync(join(T, id, "task.json"), "utf8"));
  if (meta.split !== split) continue;
  const a = run(mk(id, false, false)), b = run(mk(id, true, false)), c = run(mk(id, true, true));
  const ok = a.fail > 0 && b.fail > 0 && c.fail === 0 && c.code === 0;
  if (!ok) bad++;
  console.log(`${ok ? "OK " : "BAD"} ${id}  initial-visible fail=${a.fail}  initial+hidden fail=${b.fail}  solution pass=${c.pass} fail=${c.fail}`);
}
process.exit(bad ? 1 : 0);
