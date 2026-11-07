// Config schema: the defaults object defines every known key and its type.
export const defaults = Object.freeze({
  port: 3000,
  debug: false,
  logLevel: 'info',
  db: Object.freeze({ host: 'localhost', port: 5432, pool: 5, ssl: false }),
});

export function getPath(obj, path) {
  let cur = obj;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object' || !(part in cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

export function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (const part of parts.slice(0, -1)) {
    if (cur[part] == null || typeof cur[part] !== 'object') cur[part] = {};
    cur = cur[part];
  }
  cur[parts.at(-1)] = value;
}

/** True if `path` names a leaf (non-object) key in the defaults schema. */
export function isKnownLeaf(path) {
  const v = getPath(defaults, path);
  return v !== undefined && (v === null || typeof v !== 'object');
}

/**
 * Coerce a raw value (string from env/argv, or boolean) to the type of the default at `path`.
 * Returns undefined when the value cannot be coerced.
 */
export function coerce(path, raw) {
  const def = getPath(defaults, path);
  if (typeof def === 'number') {
    if (typeof raw === 'number') return raw;
    if (typeof raw !== 'string' || raw.trim() === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof def === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    return undefined;
  }
  if (typeof def === 'string') return typeof raw === 'string' ? raw : undefined;
  return undefined;
}

/** Deep merge plain objects; `src` wins. Returns a new object. */
export function deepMerge(base, src) {
  const out = { ...base };
  for (const [k, v] of Object.entries(src ?? {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base?.[k] && typeof base[k] === 'object') {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}
