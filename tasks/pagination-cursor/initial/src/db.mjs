// In-memory stand-in for the items table.
// Row: { id: number, createdAt: number, title: string }
export class ItemsDb {
  constructor(rows = []) {
    this.rows = rows.map((r) => ({ ...r }));
  }

  insert(row) {
    this.rows.push({ ...row });
  }

  /** All rows, newest first: createdAt desc, then id desc. Returns copies. */
  listAll() {
    return this.rows
      .map((r) => ({ ...r }))
      .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);
  }
}
