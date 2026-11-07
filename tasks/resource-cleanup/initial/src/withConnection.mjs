import { Scope } from './scope.mjs';

/**
 * Acquire a connection, run fn(conn, scope), then clean up.
 * Callbacks deferred on `scope` by fn run before the connection is released.
 */
export async function withConnection(pool, fn) {
  const conn = await pool.acquire();
  const scope = new Scope();
  scope.defer(() => pool.release(conn));
  const result = await fn(conn, scope);
  await scope.close();
  return result;
}
