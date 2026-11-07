// Minimal async connection pool used in tests and by withConnection.
export class Pool {
  constructor({ create = (n) => ({ id: n }), max = 2 } = {}) {
    this.create = create;
    this.max = max;
    this.idle = [];
    this.active = new Set();
    this.created = 0;
    this.waiters = [];
  }

  get stats() {
    return { active: this.active.size, idle: this.idle.length, created: this.created };
  }

  async acquire() {
    let conn = this.idle.pop();
    if (!conn && this.created < this.max) conn = await this.create(++this.created);
    if (!conn) conn = await new Promise((resolve) => this.waiters.push(resolve));
    this.active.add(conn);
    return conn;
  }

  release(conn) {
    if (!this.active.has(conn)) throw new Error('release of a connection that is not active (double release?)');
    this.active.delete(conn);
    const waiter = this.waiters.shift();
    if (waiter) waiter(conn);
    else this.idle.push(conn);
  }
}
