import { coerce, isKnownLeaf, setPath } from './schema.mjs';

// APP_DB_HOST -> db.host, APP_LOG_LEVEL -> logLevel, APP_PORT -> port
const ENV_MAP = {
  APP_PORT: 'port',
  APP_DEBUG: 'debug',
  APP_LOG_LEVEL: 'logLevel',
  APP_DB_HOST: 'db.host',
  APP_DB_PORT: 'db.port',
  APP_DB_POOL: 'db.pool',
  APP_DB_SSL: 'db.ssl',
};

/** Returns a partial, nested, type-coerced config from environment variables. Unknown vars ignored. */
export function parseEnv(env = {}) {
  const out = {};
  for (const [name, raw] of Object.entries(env)) {
    const path = ENV_MAP[name];
    if (!path || !isKnownLeaf(path)) continue;
    const value = coerce(path, raw);
    if (value !== undefined) setPath(out, path, value);
  }
  return out;
}
