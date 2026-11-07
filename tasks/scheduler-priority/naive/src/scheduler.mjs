import { MinHeap } from './heap.mjs';
export class Scheduler {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now; this.seq = 0;
    this.heap = new MinHeap((a, b) => b.priority - a.priority || a.runAt - b.runAt || a.seq - b.seq);
    this.pending = new Set(); this.log = [];
  }
  schedule(name, fn, { delayMs = 0, priority } = {}) {
    if (typeof fn !== 'function') throw new TypeError('job must be a function');
    const seq = ++this.seq;
    const job = { id: seq, seq, name, fn, runAt: this.now() + delayMs, priority: priority || 5 };
    this.heap.push(job); this.pending.add(job.id); return job.id;
  }
  cancel(id) { return this.pending.delete(id); }
  async tick() {
    const t = this.now(); const due = [];
    while (this.heap.size && this.heap.peek().runAt <= t) { const job = this.heap.pop(); if (this.pending.delete(job.id)) due.push(job); }
    for (const job of due) {
      try { await job.fn(); this.log.push({ t, name: job.name, status: 'ok', priority: job.priority }); }
      catch (err) { this.log.push({ t, name: job.name, status: 'error', message: err.message, priority: job.priority }); }
    }
    return due.length;
  }
}
