import { serialize, deserialize } from './serializer.mjs';

// Key/value profile store over a raw string backend (Map-like: get/set/has/keys).
export class ProfileStore {
  constructor(backend = new Map()) {
    this.backend = backend;
  }

  save(id, profile) {
    this.backend.set(id, serialize(profile));
  }

  load(id) {
    const raw = this.backend.get(id);
    return raw === undefined ? undefined : deserialize(raw);
  }

  /** Read-modify-write helper. */
  update(id, fn) {
    const current = this.load(id);
    if (current === undefined) throw new Error(`no profile ${id}`);
    const next = fn(current);
    this.save(id, next);
    return next;
  }
}
