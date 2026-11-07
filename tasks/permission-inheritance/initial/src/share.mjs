// "Who has access" list in the share dialog. One line per allow entry, sorted.
export function listAccess(node) {
  return node.acl
    .filter((e) => e.effect === 'allow')
    .map((e) => `${e.principal}: ${e.role}`)
    .sort();
}
