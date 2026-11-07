// Small TTL + size-bounded cache used by service layers.
// Values are stored with an expiry timestamp computed from the injected clock.
// When maxSize is exceeded the oldest inserted entry is evicted.

export class TtlCache {
  /**
   * @param {{ ttlMs?: number, maxSize?: number, now?: () => number }} [opts]
   */
  constructor({ ttlMs = 60_000, maxSize = 1000, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
    this.now = now;
    /** @type {Map<string, { value: unknown, expiresAt: number }>} */
    this.entries = new Map();
    /** In-flight loads, kept separate so get()/size only see settled values. */
    /** @type {Map<string, Promise<unknown>>} */
    this.inflight = new Map();
  }

  get size() {
    return this.entries.size;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  /** Synchronous lookup. Returns the stored value or undefined. */
  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value) {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxSize) {
      const oldest = this.entries.keys().next().value;
      this.entries.delete(oldest);
    }
  }

  delete(key) {
    return this.entries.delete(key);
  }

  /**
   * Return the cached value for key, or call loader(key), store and return its result.
   * Concurrent callers for the same key share one in-flight load. Failed loads are not cached.
   */
  getOrLoad(key, loader) {
    const hit = this.get(key);
    if (hit !== undefined) return Promise.resolve(hit);
    const pending = this.inflight.get(key);
    if (pending) return pending;

    const p = (async () => {
      try {
        const value = await loader(key);
        this.set(key, value);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }
}
