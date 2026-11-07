// Applies stream events to some state via the `apply` callback.
// Event shape: { id: string, seq: number, type: string, payload?: any }

export class EventProcessor {
  /**
   * @param {(event: object) => void} apply
   * @param {{ startSeq?: number }} [opts]
   */
  constructor(apply, { startSeq = 1 } = {}) {
    this.apply = apply;
    this.startSeq = startSeq;
    this.lastSeq = startSeq - 1;
    /** @type {Map<number, object>} buffered events keyed by seq */
    this.buffer = new Map();
    /** ids of events already applied or buffered */
    this.seenIds = new Set();
  }

  /** Number of events received but not yet applied. */
  get pendingCount() {
    return this.buffer.size;
  }

  /**
   * Handle one delivered event.
   * @returns {object[]} events applied as a result of this call, in order
   */
  process(event) {
    if (this.seenIds.has(event.id)) return [];
    if (event.seq <= this.lastSeq) return [];
    if (this.buffer.has(event.seq)) return [];

    this.seenIds.add(event.id);
    this.buffer.set(event.seq, event);

    const applied = [];
    while (this.buffer.has(this.lastSeq + 1)) {
      const next = this.buffer.get(this.lastSeq + 1);
      this.buffer.delete(this.lastSeq + 1);
      this.apply(next);
      this.lastSeq = next.seq;
      applied.push(next);
    }
    return applied;
  }
}
