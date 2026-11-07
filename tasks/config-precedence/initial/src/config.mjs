import { defaults, deepMerge, isKnownLeaf, getPath, setPath } from './schema.mjs';
import { parseEnv } from './env.mjs';

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

/**
 * Resolve configuration.
 * @param {{ file?: object, env?: Record<string,string>, argv?: string[] }} sources
 */
export function loadConfig({ file = {}, env = {}, argv = [] } = {}) {
  let cfg = deepMerge({}, defaults);
  cfg = deepMerge(cfg, pickKnown(file));
  cfg = deepMerge(cfg, parseEnv(env));
  return cfg;
}
