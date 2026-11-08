// Minimal async source helpers used by pump().
export function fromArray(items) {
  let i = 0;
  let closed = false;
  return {
    returned: 0,
    async next() {
      if (closed || i >= items.length) return { done: true, value: undefined };
      return { done: false, value: items[i++] };
    },
    async return() {
      this.returned++;
      closed = true;
      return { done: true, value: undefined };
    },
  };
}

export function collectSink() {
  return {
    chunks: [],
    closed: 0,
    aborted: [],
    async write(chunk) { this.chunks.push(chunk); },
    async close() { this.closed++; },
    async abort(err) { this.aborted.push(err); },
  };
}
