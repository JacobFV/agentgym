import { resolveDialect } from './dialects.mjs';

function needsQuoting(s, d) {
  return s.includes(d.delimiter) || s.includes(d.quote) || s.includes('\r') || s.includes('\n');
}

/** rows: any[][] -> CSV text (always ends with a line terminator). null/undefined -> empty field. */
export function stringify(rows, opts = {}) {
  const d = resolveDialect(opts);
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return needsQuoting(s, d) ? d.quote + s.split(d.quote).join(d.quote + d.quote) + d.quote : s;
  };
  return rows.map((r) => r.map(cell).join(d.delimiter)).join(d.lineTerminator) + d.lineTerminator;
}

/**
 * CSV text -> string[][]. Accepts CRLF or LF line endings regardless of dialect. Quoted fields
 * may contain the delimiter, doubled quotes and newlines. A trailing newline does not produce an empty row.
 */
export function parse(text, opts = {}) {
  const { delimiter, quote } = resolveDialect(opts);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === quote) {
        if (text[i + 1] === quote) { field += quote; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === quote && field === '') { inQuotes = true; i++; continue; }
    if (ch === delimiter) { row.push(field); field = ''; i++; continue; }
    if (ch === '\r' && text[i + 1] === '\n') { i++; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
