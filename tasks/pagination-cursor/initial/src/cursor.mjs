// Opaque cursor helpers. A cursor is base64url(JSON).

export function encodeCursor(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

/** Decode a cursor string. Throws Error('bad cursor') on anything that is not base64url JSON object. */
export function decodeCursor(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]+$/.test(str)) throw new Error('bad cursor');
  let value;
  try {
    value = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
  } catch {
    throw new Error('bad cursor');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('bad cursor');
  return value;
}
