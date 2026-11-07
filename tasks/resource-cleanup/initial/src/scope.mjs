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

  async close() {
    this.closed = true;
    for (const cb of this.callbacks) {
      await cb();
    }
  }
}
