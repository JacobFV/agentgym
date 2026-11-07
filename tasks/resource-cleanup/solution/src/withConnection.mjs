import { Scope } from './scope.mjs';

/**
 * Acquire a connection, run fn(conn, scope), then clean up.
 * Callbacks deferred on `scope` by fn run before the connection is released.
 * If fn throws, its error propagates even if cleanup also fails.
 */
export async function withConnection(pool, fn) {
  const conn = await pool.acquire();
  const scope = new Scope();
  scope.defer(() => pool.release(conn));
  let result;
  try {
    result = await fn(conn, scope);
  } catch (err) {
    try {
      await scope.close();
    } catch {
      // the original error is more useful than a cleanup failure
    }
    throw err;
  }
  await scope.close();
  return result;
}
