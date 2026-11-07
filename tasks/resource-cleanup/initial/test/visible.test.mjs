import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from '../src/pool.mjs';
import { withConnection } from '../src/withConnection.mjs';

test('connection is released when fn throws', async () => {
  const pool = new Pool();
  await assert.rejects(
    withConnection(pool, async () => { throw new Error('query failed'); }),
    /query failed/,
  );
  assert.equal(pool.stats.active, 0);
  assert.equal(pool.stats.idle, 1);
});
