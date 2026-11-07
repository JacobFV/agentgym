import { TokenBucket } from './tokenBucket.mjs';

// Per-key rate limiter (e.g. key = client id).
export class RateLimiter {
  constructor({ capacity, refillPerSec, now = () => Date.now() }) {
    this.opts = { capacity, refillPerSec, now };
    this.buckets = new Map();
  }

  _bucket(key) {
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = new TokenBucket(this.opts)));
    return b;
  }

  allow(key, cost = 1) {
    return this._bucket(key).tryRemove(cost);
  }

  /** Milliseconds until one token is available for key (rounded up); 0 if available now. */
  retryAfterMs(key) {
    const b = this._bucket(key);
    const missing = 1 - b.tokens;
    if (missing <= 0) return 0;
    return Math.ceil(missing * 1000 / b.refillPerSec);
  }
}
