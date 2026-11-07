export class LRU {
  constructor({ max = 100, onEvict } = {}) {
    if (!(max >= 1)) throw new RangeError('max must be >= 1');
    this.max = max; this.onEvict = onEvict; this.map = new Map(); this.hits = 0; this.misses = 0;
  }
  get size() { return this.map.size; }
  has(key) { return this.map.has(key); }
  peek(key) { return this.map.get(key); }
  get(key) {
    if (!this.map.has(key)) { this.misses++; return undefined; }
    const value = this.map.get(key); this.map.delete(key); this.map.set(key, value); this.hits++; return value;
  }
  set(key, value) {
    if (this.map.has(key)) this.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) this.delete(this.map.keys().next().value);
    return this;
  }
  delete(key) {
    const value = this.map.get(key);
    const ok = this.map.delete(key);
    if (ok && this.onEvict) this.onEvict(key, value, 'capacity');
    return ok;
  }
  clear() { this.map.clear(); }
  keys() { return [...this.map.keys()]; }
  stats() { return { size: this.map.size, max: this.max, hits: this.hits, misses: this.misses }; }
}
