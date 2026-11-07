import { resolveDialect } from './dialects.mjs';
function needsQuoting(s) { return /[",\r\n]/.test(s); }
export function stringify(rows, opts = {}) {
  const d = resolveDialect(opts);
  const cell = (v) => { const s = v == null ? '' : String(v); return needsQuoting(s) ? d.quote + s.split(d.quote).join(d.quote + d.quote) + d.quote : s; };
  return rows.map((r) => r.map(cell).join(d.delimiter)).join(d.lineTerminator) + d.lineTerminator;
}
export function parse(text, opts = {}) {
  const { delimiter } = resolveDialect(opts);
  const rows = []; let row = []; let field = ''; let inQuotes = false; let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQuotes = false; i++; continue; } field += ch; i++; continue; }
    if (ch === '"' && field === '') { inQuotes = true; i++; continue; }
    if (ch === delimiter) { row.push(field); field = ''; i++; continue; }
    if (ch === '\r' && text[i + 1] === '\n') { i++; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
