#!/usr/bin/env node
// Validates every task fixture in this directory.
//
// For each task:
//   (a) initial/                        -> tests must FAIL
//   (b) initial/ + hidden test          -> tests must FAIL
//   (h) initial/ + hidden test ONLY     -> hidden test alone must FAIL (stronger check)
//   (c) initial/ + solution/ + hidden   -> tests must PASS
//   (s) task.json sanity (id matches dir, split valid, required fields)
//
// Tests are run with the same command line the agentgym runner uses.
// Usage: node tasks/validate-fixtures.mjs [taskId ...]

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, unlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TASKS_DIR = dirname(fileURLToPath(import.meta.url));
const SPLITS = new Set(['dev', 'val', 'test']);

function runTests(ws, pattern = 'test/**/*.test.mjs', timeoutMs = 20000) {
  const args = [
    '--permission',
    `--allow-fs-read=${ws}`,
    `--allow-fs-write=${ws}`,
    '--test-isolation=none',
    '--test',
    '--test-reporter=tap',
    pattern,
  ];
  const res = spawnSync(process.execPath, args, {
    cwd: ws,
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  const num = (k) => Number(out.match(new RegExp(`^# ${k} (\\d+)`, 'm'))?.[1] ?? NaN);
  return { code: res.status ?? (res.signal ? 124 : 1), pass: num('pass'), fail: num('fail'), out };
}

function makeWorkspace(taskDir, { solution = false, hidden = false, visible = true } = {}) {
  // realpath matters: on macOS tmpdir() is a /var symlink and --allow-fs-read needs the real path.
  const ws = realpathSync(mkdtempSync(join(tmpdir(), 'agentgym-fixture-')));
  cpSync(join(taskDir, 'initial'), ws, { recursive: true });
  if (solution) cpSync(join(taskDir, 'solution'), ws, { recursive: true });
  mkdirSync(join(ws, 'test'), { recursive: true });
  if (hidden) cpSync(join(taskDir, 'hidden', 'hidden.test.mjs'), join(ws, 'test', 'hidden.test.mjs'));
  if (!visible) unlinkSync(join(ws, 'test', 'visible.test.mjs'));
  return ws;
}

function checkMeta(taskDir, id) {
  const problems = [];
  let meta;
  try {
    meta = JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8'));
  } catch (e) {
    return [`task.json unreadable: ${e.message}`];
  }
  if (meta.id !== id) problems.push(`id ${meta.id} != dir ${id}`);
  if (!SPLITS.has(meta.split)) problems.push(`bad split ${meta.split}`);
  for (const k of ['title', 'description']) if (typeof meta[k] !== 'string' || !meta[k]) problems.push(`missing ${k}`);
  if (!Number.isInteger(meta.timeoutMs)) problems.push('missing timeoutMs');
  for (const p of ['initial/src', 'initial/test/visible.test.mjs', 'hidden/hidden.test.mjs', 'solution/src']) {
    if (!existsSync(join(taskDir, p))) problems.push(`missing ${p}`);
  }
  return problems;
}

const only = process.argv.slice(2);
const taskIds = readdirSync(TASKS_DIR)
  .filter((d) => statSync(join(TASKS_DIR, d)).isDirectory() && existsSync(join(TASKS_DIR, d, 'task.json')))
  .filter((d) => only.length === 0 || only.includes(d))
  .sort();

const rows = [];
let failures = 0;

for (const id of taskIds) {
  const taskDir = join(TASKS_DIR, id);
  const meta = JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8'));
  const metaProblems = checkMeta(taskDir, id);
  const timeout = meta.timeoutMs ?? 20000;

  const scenarios = [
    { name: 'a', opts: {}, expectPass: false },
    { name: 'b', opts: { hidden: true }, expectPass: false },
    { name: 'h', opts: { hidden: true, visible: false }, expectPass: false },
    { name: 'c', opts: { hidden: true, solution: true }, expectPass: true },
  ];
  const cells = {};
  const details = [];
  for (const s of scenarios) {
    const ws = makeWorkspace(taskDir, s.opts);
    try {
      const r = runTests(ws, 'test/**/*.test.mjs', timeout);
      // An expected failure must be a real assertion failure (fail > 0), not a crash/loader error.
      const ok = s.expectPass
        ? r.code === 0 && r.fail === 0 && r.pass > 0
        : r.code !== 0 && r.fail > 0;
      cells[s.name] = `${ok ? 'OK' : 'XX'} ${r.pass}/${r.pass + r.fail}`;
      if (!ok) {
        failures++;
        details.push(`--- ${id} (${s.name}) expected ${s.expectPass ? 'pass' : 'fail'}, exit=${r.code}\n${r.out.split('\n').filter((l) => /^not ok|^\s+(error|expected|actual|message):|Error/.test(l)).slice(0, 40).join('\n')}`);
      }
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  }
  if (metaProblems.length) failures++;
  rows.push({ id, split: meta.split, meta: metaProblems.length ? 'XX' : 'OK', ...cells, details, metaProblems });
}

const headers = ['task', 'split', 'meta', '(a) initial fails', '(b) init+hidden fails', '(h) hidden-only fails', '(c) solution passes'];
const table = rows.map((r) => [r.id, r.split, r.meta, r.a, r.b, r.h, r.c]);
const widths = headers.map((h, i) => Math.max(h.length, ...table.map((row) => String(row[i]).length)));
const line = (cols) => cols.map((c, i) => String(c).padEnd(widths[i])).join(' | ');
console.log(line(headers));
console.log(widths.map((w) => '-'.repeat(w)).join('-+-'));
for (const row of table) console.log(line(row));
console.log('\ncells show "OK|XX passed/total tests"');

for (const r of rows) {
  for (const p of r.metaProblems) console.log(`meta ${r.id}: ${p}`);
  for (const d of r.details) console.log(d);
}
console.log(failures ? `\n${failures} check(s) FAILED` : `\nall ${rows.length} tasks valid`);
process.exit(failures ? 1 : 0);
