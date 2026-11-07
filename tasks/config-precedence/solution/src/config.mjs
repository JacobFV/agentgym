import { defaults, deepMerge, isKnownLeaf, getPath, setPath, coerce } from './schema.mjs';
import { parseEnv } from './env.mjs';
import { parseArgs } from './cli.mjs';

/** Keep only keys from the config file that exist in the schema. */
function pickKnown(file, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(file ?? {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const def = getPath(defaults, path);
      if (def && typeof def === 'object') {
        const sub = pickKnown(v, path);
        if (Object.keys(sub).length) setPath(out, path.split('.').at(-1), sub);
      }
    } else if (isKnownLeaf(path)) {
      out[k] = v;
    }
  }
  return out;
}

/** Convert flat raw CLI flags into a nested, coerced partial config (unknown keys dropped). */
function fromArgs(argv) {
  const out = {};
  for (const [path, raw] of Object.entries(parseArgs(argv))) {
    if (!isKnownLeaf(path)) continue;
    const value = coerce(path, raw);
    if (value !== undefined) setPath(out, path, value);
  }
  return out;
}

/**
 * Resolve configuration. Precedence: defaults < file < env < cli.
 * @param {{ file?: object, env?: Record<string,string>, argv?: string[] }} sources
 */
export function loadConfig({ file = {}, env = {}, argv = [] } = {}) {
  let cfg = deepMerge({}, defaults);
  cfg = deepMerge(cfg, pickKnown(file));
  cfg = deepMerge(cfg, parseEnv(env));
  cfg = deepMerge(cfg, fromArgs(argv));
  return cfg;
}
