// Collects cleanup callbacks and runs them on close().
export class Scope {
  constructor() {
    this.callbacks = [];
    this.closed = false;
  }

  /** Register a cleanup callback (may be async). */
  defer(cb) {
    if (this.closed) throw new Error('scope already closed');
    this.callbacks.push(cb);
  }

  /**
   * Run callbacks in LIFO order. All callbacks run even if some fail.
   * Rejects with the error if one failed, or an AggregateError if several did.
   * A second call is a no-op.
   */
  async close() {
    if (this.closed) return;
    this.closed = true;
    const errors = [];
    while (this.callbacks.length) {
      const cb = this.callbacks.pop();
      try {
        await cb();
      } catch (err) {
        errors.push(err);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, `${errors.length} cleanup callbacks failed`);
  }
}
