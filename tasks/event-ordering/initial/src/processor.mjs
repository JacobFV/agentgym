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
  }

  /** Number of events received but not yet applied. */
  get pendingCount() {
    return 0;
  }

  /**
   * Handle one delivered event.
   * @returns {object[]} events applied as a result of this call, in order
   */
  process(event) {
    this.apply(event);
    this.lastSeq = event.seq;
    return [event];
  }
}
