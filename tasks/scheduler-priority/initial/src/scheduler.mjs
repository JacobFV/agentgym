import { MinHeap } from './heap.mjs';

// Cooperative job scheduler driven by tick(). Uses an injected clock.
// Log entries: { t, name, status: 'ok' } or { t, name, status: 'error', message }
export class Scheduler {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.seq = 0;
    // earliest runAt first; seq breaks ties so equal-time jobs run in submission order
    this.heap = new MinHeap((a, b) => a.runAt - b.runAt || a.seq - b.seq);
    this.pending = new Set();
    this.log = [];
  }

  schedule(name, fn, { delayMs = 0 } = {}) {
    if (typeof fn !== 'function') throw new TypeError('job must be a function');
    const seq = ++this.seq;
    const job = { id: seq, seq, name, fn, runAt: this.now() + delayMs };
    this.heap.push(job);
    this.pending.add(job.id);
    return job.id;
  }

  /** Cancel a job that has not started yet. Returns true if it was pending. */
  cancel(id) {
    return this.pending.delete(id);
  }

  /**
   * Run every job that is due now. Jobs scheduled while this tick runs wait for a later tick.
   * Returns the number of jobs run.
   */
  async tick() {
    const t = this.now();
    const due = [];
    while (this.heap.size && this.heap.peek().runAt <= t) {
      const job = this.heap.pop();
      if (this.pending.delete(job.id)) due.push(job);
    }
    for (const job of due) {
      try {
        await job.fn();
        this.log.push({ t, name: job.name, status: 'ok' });
      } catch (err) {
        this.log.push({ t, name: job.name, status: 'error', message: err.message });
      }
    }
    return due.length;
  }
}
