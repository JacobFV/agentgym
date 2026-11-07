// Renders the scheduler log for the external log shipper.
// Format is parsed downstream as `key=value` pairs, one entry per line.
export function formatRunLog(log) {
  return log.map((entry) => Object.entries(entry).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')).join('\n');
}
