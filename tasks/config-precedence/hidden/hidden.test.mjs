import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.mjs';
import { defaults } from '../src/schema.mjs';

test('hidden: full precedence chain defaults < file < env < cli', () => {
  const cfg = loadConfig({
    file: { port: 4000, logLevel: 'warn', debug: true },
    env: { APP_PORT: '5000', APP_LOG_LEVEL: 'error' },
    argv: ['--port=6000'],
  });
  assert.equal(cfg.port, 6000);
  assert.equal(cfg.logLevel, 'error');
  assert.equal(cfg.debug, true);
});

test('hidden: cli numbers and booleans are coerced', () => {
  const cfg = loadConfig({ argv: ['--port=8080', '--db.pool=20', '--debug', '--db.ssl=true'] });
  assert.equal(cfg.port, 8080);
  assert.equal(cfg.db.pool, 20);
  assert.equal(cfg.debug, true);
  assert.equal(cfg.db.ssl, true);
});

test('hidden: --flag=false sets boolean false over env true', () => {
  const cfg = loadConfig({ env: { APP_DEBUG: 'true' }, argv: ['--debug=false'] });
  assert.equal(cfg.debug, false);
});

test('hidden: uncoercible cli value is ignored, lower layer wins', () => {
  const cfg = loadConfig({ env: { APP_PORT: '5000' }, argv: ['--port=abc'] });
  assert.equal(cfg.port, 5000);
});

test('hidden: dotted cli flags merge into nested section', () => {
  const cfg = loadConfig({
    file: { db: { port: 6543 } },
    env: { APP_DB_POOL: '9' },
    argv: ['--db.host=db1.internal'],
  });
  assert.deepEqual(cfg.db, { host: 'db1.internal', port: 6543, pool: 9, ssl: false });
});

test('hidden: env still coerces and still overrides file', () => {
  const cfg = loadConfig({ file: { db: { port: 1 } }, env: { APP_DB_PORT: '7777', APP_DB_SSL: '1' } });
  assert.equal(cfg.db.port, 7777);
  assert.equal(cfg.db.ssl, true);
  assert.equal(cfg.db.host, 'localhost');
});

test('hidden: unknown flags, env vars and file keys are ignored', () => {
  const cfg = loadConfig({
    file: { bogus: 1, db: { nope: 2 } },
    env: { APP_WHATEVER: 'x', PATH: '/bin' },
    argv: ['--foo=bar', '--db.nope=3', '--db=oops', 'positional', '-x'],
  });
  assert.deepEqual(cfg, {
    port: 3000, debug: false, logLevel: 'info',
    db: { host: 'localhost', port: 5432, pool: 5, ssl: false },
  });
});

test('hidden: defaults and inputs are not mutated', () => {
  const file = { db: { host: 'f' } };
  const argv = ['--db.port=1'];
  const a = loadConfig({ file, argv });
  a.db.host = 'mutated';
  assert.deepEqual(file, { db: { host: 'f' } });
  assert.deepEqual(argv, ['--db.port=1']);
  assert.equal(defaults.db.host, 'localhost');
  assert.equal(loadConfig().db.port, 5432);
  assert.equal(loadConfig().db.host, 'localhost');
});
