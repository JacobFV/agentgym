import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

export interface TestResult {
  passed: boolean;
  exitCode: number | null;
  timedOut: boolean;
  pass: number;
  fail: number;
  failingTests: string[];
  output: string; // truncated
  durationMs: number;
}

export function materialize(dir: string, files: Record<string, string>) {
  rmSync(dir, { recursive: true, force: true });
  for (const [rel, content] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
}

/**
 * Run `node --test test/` inside dir as a constrained subprocess:
 *  - scrubbed environment (no API keys, no secrets: only PATH + a temp HOME)
 *  - Node permission model: fs read/write limited to the workspace (+ node's own install for reads)
 *  - hard timeout, killed with SIGKILL
 * Optional: ISOLATION=docker runs in `node:22-alpine` with --network none.
 */
export function runTests(dirIn: string, timeoutMs: number): Promise<TestResult> {
  const dir = realpathSync(dirIn);
  const t0 = Date.now();
  const useDocker = process.env.ISOLATION === "docker";
  const cmd = useDocker ? "docker" : process.execPath;
  const args = useDocker
    ? ["run", "--rm", "--network", "none", "--memory", "512m", "-v", `${dir}:/w`, "-w", "/w", "node:22-alpine",
       "node", "--test", "--test-reporter=tap", "test/**/*.test.mjs"]
    : ["--permission", `--allow-fs-read=${dir}`, `--allow-fs-write=${dir}`, "--test-isolation=none",       "--test", "--test-reporter=tap", "test/**/*.test.mjs"];
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: dir,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: dir, NODE_OPTIONS: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => {
      clearTimeout(timer);
      const pass = Number(out.match(/^# pass (\d+)/m)?.[1] ?? 0);
      const fail = Number(out.match(/^# fail (\d+)/m)?.[1] ?? 0);
      const failingTests = [...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((m) => m[1].trim())
        .filter((n) => !n.endsWith(".mjs") && !n.startsWith("test/"));
      resolve({
        passed: code === 0 && !timedOut && fail === 0,
        exitCode: code, timedOut, pass, fail, failingTests,
        output: out.length > 6000 ? out.slice(0, 2500) + "\n...[truncated]...\n" + out.slice(-3000) : out,
        durationMs: Date.now() - t0,
      });
    });
  });
}
