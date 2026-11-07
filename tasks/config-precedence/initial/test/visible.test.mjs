import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.mjs';

test('cli flags override env, file and defaults', () => {
  const cfg = loadConfig({
    file: { logLevel: 'warn' },
    env: { APP_LOG_LEVEL: 'error' },
    argv: ['--logLevel=debug'],
  });
  assert.equal(cfg.logLevel, 'debug');
});
