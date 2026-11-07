import { LRU } from './lru.mjs';
import { BackingStore } from './backingStore.mjs';

// Sessions live in an in-memory LRU; the backing store is the overflow.
export class SessionStore {
  constructor({ maxInMemory = 1000, backing = new BackingStore() } = {}) {
    this.backing = backing;
    this.lru = new LRU({
      max: maxInMemory,
      onEvict: (id, session, reason) => {
        // Only capacity pressure spills to the backing store; delete/clear are intentional removals.
        if (reason === 'capacity') this.backing.save(id, session);
      },
    });
  }

  create(id, data = {}) {
    const session = { id, data };
    this.lru.set(id, session);
    return session;
  }

  get(id) {
    const hot = this.lru.get(id);
    if (hot !== undefined) return hot;
    const cold = this.backing.load(id);
    if (cold === undefined) return undefined;
    this.backing.remove(id);
    this.lru.set(id, cold);
    return cold;
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
