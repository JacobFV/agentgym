import { ApiError } from './errors.mjs';

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

/**
 * GET /items
 * @param {import('./db.mjs').ItemsDb} db
 * @param {Record<string, string>} query  raw query-string values
 */
export function listItems(db, query = {}) {
  const pageSize = parsePageSize(query.pageSize);
  const page = query.page === undefined ? 1 : Number(query.page);
  if (!Number.isInteger(page) || page < 1) throw new ApiError(400, 'page must be a positive integer');
  const all = db.listAll();
  const start = (page - 1) * pageSize;
  return { items: all.slice(start, start + pageSize), page, pageSize, total: all.length };
}
