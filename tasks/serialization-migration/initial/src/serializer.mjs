// Wire format for user profiles.
//
// v1 (current): { "v": 1, "name": "Ada", "email": "ada@x.io", "tags": "admin,beta" }
//   - Records written before 2023 have no "v" field at all; treat them as v1.
//   - An empty tags string means no tags.
//   - Unknown top-level fields are preserved: they are kept on the deserialized
//     object and written back out by serialize().
//
// In-memory profile: { name: string, email: string, tags: string[], ...unknownFields }

export const CURRENT_VERSION = 1;

const KNOWN_V1 = new Set(['v', 'name', 'email', 'tags']);

export function serialize(profile) {
  const { name, email, tags = [], ...rest } = profile;
  return JSON.stringify({ ...rest, v: 1, name, email, tags: tags.join(',') });
}

export function deserialize(text) {
  const data = JSON.parse(text);
  const version = data.v ?? 1;
  if (version !== 1) throw new Error(`unsupported version: ${version}`);
  const extra = {};
  for (const [k, val] of Object.entries(data)) if (!KNOWN_V1.has(k)) extra[k] = val;
  return {
    ...extra,
    name: data.name,
    email: data.email,
    tags: data.tags ? data.tags.split(',') : [],
  };
}
