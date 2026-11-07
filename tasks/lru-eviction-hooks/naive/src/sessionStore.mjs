import { LRU } from './lru.mjs';
import { BackingStore } from './backingStore.mjs';
export class SessionStore {
  constructor({ maxInMemory = 1000, backing = new BackingStore() } = {}) {
    this.backing = backing;
    this.lru = new LRU({ max: maxInMemory, onEvict: (id, s) => this.backing.save(id, s) });
  }
  create(id, data = {}) { const session = { id, data }; this.lru.set(id, session); return session; }
  get(id) { return this.lru.get(id) ?? this.backing.load(id); }
  update(id, patch) {
    const s = this.get(id); if (!s) throw new Error(`no session ${id}`);
    const next = { ...s, data: { ...s.data, ...patch } }; this.lru.set(id, next); return next;
  }
  destroy(id) { this.lru.delete(id); this.backing.remove(id); }
}
