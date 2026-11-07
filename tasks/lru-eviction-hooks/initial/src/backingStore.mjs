// Slow persistent store (fake). Values are deep-copied to mimic serialization.
export class BackingStore {
  constructor() {
    this.data = new Map();
    this.writes = 0;
  }
  save(id, value) {
    this.writes++;
    this.data.set(id, structuredClone(value));
  }
  load(id) {
    const v = this.data.get(id);
    return v === undefined ? undefined : structuredClone(v);
  }
  has(id) {
    return this.data.has(id);
  }
  remove(id) {
    return this.data.delete(id);
  }
}
