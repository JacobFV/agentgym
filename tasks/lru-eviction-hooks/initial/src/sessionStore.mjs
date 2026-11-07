import { LRU } from './lru.mjs';
import { BackingStore } from './backingStore.mjs';

// Sessions live in an in-memory LRU; the backing store is the overflow.
export class SessionStore {
  constructor({ maxInMemory = 1000, backing = new BackingStore() } = {}) {
    this.backing = backing;
    this.lru = new LRU({ max: maxInMemory });
  }

  create(id, data = {}) {
    const session = { id, data };
    this.lru.set(id, session);
    return session;
  }

  get(id) {
    return this.lru.get(id);
  }

  update(id, patch) {
    const s = this.get(id);
    if (!s) throw new Error(`no session ${id}`);
    const next = { ...s, data: { ...s.data, ...patch } };
    this.lru.set(id, next);
    return next;
  }

  /** Logout. */
  destroy(id) {
    this.lru.delete(id);
    this.backing.remove(id);
  }
}
