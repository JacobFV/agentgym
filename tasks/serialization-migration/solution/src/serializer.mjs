// Wire format for user profiles.
//
// v1 (legacy): { "v": 1, "name": "Ada", "email": "ada@x.io", "tags": "admin,beta" }
//   - Records written before 2023 have no "v" field at all; treat them as v1.
//   - An empty tags string means no tags.
// v2 (current): { "v": 2, "name": "Ada", "contact": { "email": "ada@x.io" }, "tags": ["admin", "beta"] }
//
// In both versions unknown top-level fields are preserved: they are kept on the
// deserialized object and written back out by serialize().
//
// In-memory profile: { name: string, email: string, tags: string[], ...unknownFields }

export const CURRENT_VERSION = 2;

const KNOWN_V1 = new Set(['v', 'name', 'email', 'tags']);
const KNOWN_V2 = new Set(['v', 'name', 'contact', 'tags']);

function extras(data, known) {
  const out = {};
  for (const [k, val] of Object.entries(data)) if (!known.has(k)) out[k] = val;
  return out;
}

export function serialize(profile) {
  const { name, email, tags = [], ...rest } = profile;
  return JSON.stringify({ ...rest, v: 2, name, contact: { email }, tags: [...tags] });
}

export function deserialize(text) {
  const data = JSON.parse(text);
  const version = data.v ?? 1;
  if (version === 1) {
    return {
      ...extras(data, KNOWN_V1),
      name: data.name,
      email: data.email,
      tags: data.tags ? data.tags.split(',') : [],
    };
  }
  if (version === 2) {
    return {
      ...extras(data, KNOWN_V2),
      name: data.name,
      email: data.contact?.email,
      tags: Array.isArray(data.tags) ? [...data.tags] : [],
    };
  }
  throw new Error(`unsupported version: ${version}`);
}
