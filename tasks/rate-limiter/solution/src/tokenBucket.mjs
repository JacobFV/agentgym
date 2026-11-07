// Token bucket. `capacity` is the maximum burst size; tokens refill at
// `refillPerSec` tokens per second, measured with the injected clock `now()` (ms).
export class TokenBucket {
  constructor({ capacity, refillPerSec, now = () => Date.now() }) {
    if (!(capacity > 0)) throw new RangeError('capacity must be > 0');
    if (!(refillPerSec >= 0)) throw new RangeError('refillPerSec must be >= 0');
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.now = now;
    this._tokens = capacity;
    this.last = now();
  }

  _refill() {
    const t = this.now();
    const elapsed = t - this.last;
    if (elapsed > 0) {
      this._tokens = Math.min(this.capacity, this._tokens + (elapsed / 1000) * this.refillPerSec);
    }
    // Clock going backwards: re-anchor without changing tokens.
    this.last = t;
  }

  /** Current (possibly fractional) token count. */
  get tokens() {
    this._refill();
    return this._tokens;
  }

  /** Try to take n tokens. Returns true if allowed. A rejected call consumes nothing. */
  tryRemove(n = 1) {
    this._refill();
    if (n > this._tokens) return false;
    this._tokens -= n;
    return true;
  }
}
