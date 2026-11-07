import { aclChain } from './acl.mjs';

// "Who has access" list in the share dialog. One line per allow entry, sorted.
// Inherited entries are suffixed with their source; only the nearest grant of a principal+role is shown.
export function listAccess(node) {
  const seen = new Set();
  const lines = [];
  for (const n of aclChain(node)) {
    for (const e of n.acl) {
      if (e.effect !== 'allow') continue;
      const key = `${e.principal}: ${e.role}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(n === node ? key : `${key} (inherited from ${n.path()})`);
    }
  }
  return lines.sort();
}
