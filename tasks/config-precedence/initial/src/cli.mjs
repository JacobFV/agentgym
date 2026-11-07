// Minimal flag parser. Returns a FLAT map of raw values:
//   ['--port=8080', '--db.host=x', '--debug'] -> { port: '8080', 'db.host': 'x', debug: true }
// Positional args and single-dash args are ignored. Later flags win.
export function parseArgs(argv = []) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--') || arg === '--') continue;
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    if (eq === -1) out[body] = true;
    else out[body.slice(0, eq)] = body.slice(eq + 1);
  }
  return out;
}
