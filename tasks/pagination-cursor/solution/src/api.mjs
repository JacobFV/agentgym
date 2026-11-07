import { ApiError } from './errors.mjs';
import { encodeCursor, decodeCursor } from './cursor.mjs';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function parsePageSize(raw) {
  if (raw === undefined) return DEFAULT_PAGE_SIZE;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PAGE_SIZE) {
    throw new ApiError(400, `pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}`);
  }
  return n;
}

function parseCursor(raw) {
  if (raw === '') return null; // first page
  let c;
  try {
    c = decodeCursor(raw);
  } catch {
    throw new ApiError(400, 'invalid cursor');
  }
  if (!Number.isFinite(c.createdAt) || !Number.isFinite(c.id)) throw new ApiError(400, 'invalid cursor');
  return { createdAt: c.createdAt, id: c.id };
}

/** true if row sorts strictly after the cursor position (createdAt desc, id desc). */
const isAfter = (row, c) => row.createdAt < c.createdAt || (row.createdAt === c.createdAt && row.id < c.id);

function listByCursor(db, rawCursor, pageSize) {
  const after = parseCursor(rawCursor);
  const all = db.listAll();
  const rest = after ? all.filter((r) => isAfter(r, after)) : all;
  const items = rest.slice(0, pageSize);
  const hasMore = rest.length > pageSize;
  const last = items.at(-1);
  return { items, nextCursor: hasMore ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null };
}

/**
 * GET /items
 * @param {import('./db.mjs').ItemsDb} db
 * @param {Record<string, string>} query  raw query-string values
 */
export function listItems(db, query = {}) {
  const pageSize = parsePageSize(query.pageSize);
  if (query.cursor !== undefined) {
    if (query.page !== undefined) throw new ApiError(400, 'page and cursor are mutually exclusive');
    return listByCursor(db, query.cursor, pageSize);
  }
  const page = query.page === undefined ? 1 : Number(query.page);
  if (!Number.isInteger(page) || page < 1) throw new ApiError(400, 'page must be a positive integer');
  const all = db.listAll();
  const start = (page - 1) * pageSize;
  return { items: all.slice(start, start + pageSize), page, pageSize, total: all.length };
}
