// Least-recently-used map. Iteration order of `this.map` is oldest -> newest.
//
// onEvict(key, value, reason) is called after an entry has been removed:
//   'capacity' - pushed out by set() because the cache is full
//   'delete'   - explicit delete() of an existing key
//   'clear'    - clear(), once per entry, oldest first
// Overwriting a key via set() is an update and does not call onEvict.
export class LRU {
  constructor({ max = 100, onEvict } = {}) {
    if (!(max >= 1)) throw new RangeError('max must be >= 1');
    this.max = max;
    this.onEvict = onEvict;
    this.map = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  get size() {
    return this.map.size;
  }

  has(key) {
    return this.map.has(key);
  }

  /** Read without touching recency or stats. */
  peek(key) {
    return this.map.get(key);
  }

  get(key) {
    if (!this.map.has(key)) {
      this.misses++;
      return undefined;
    }
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    this.hits++;
    return value;
  }

  _remove(key, reason) {
    if (!this.map.has(key)) return false;
    const value = this.map.get(key);
    this.map.delete(key);
    this.onEvict?.(key, value, reason);
    return true;
  }

  set(key, value) {
    // reposition without treating it as an eviction
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      this._remove(this.map.keys().next().value, 'capacity');
    }
    return this;
  }

  delete(key) {
    return this._remove(key, 'delete');
  }

  clear() {
    const entries = [...this.map.entries()];
    this.map.clear();
    for (const [k, v] of entries) this.onEvict?.(k, v, 'clear');
  }

  /** Keys from least to most recently used. */
  keys() {
    return [...this.map.keys()];
  }

  stats() {
    return { size: this.map.size, max: this.max, hits: this.hits, misses: this.misses };
  }
}
