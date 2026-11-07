import { ROLE_PERMS, principalMatches } from './roles.mjs';

/**
 * Nodes whose ACLs apply to `node`, nearest first: the node itself, then ancestors,
 * stopping after the first node with inherit === false.
 */
export function aclChain(node) {
  const chain = [];
  for (let cur = node; cur; cur = cur.parent) {
    chain.push(cur);
    if (cur.inherit === false) break;
  }
  return chain;
}

/** Sorted list of permissions `user` has on `node`. Deny entries anywhere on the chain win over allows. */
export function effectivePermissions(node, user) {
  const allowed = new Set();
  const denied = new Set();
  for (const n of aclChain(node)) {
    for (const entry of n.acl) {
      if (!principalMatches(entry.principal, user)) continue;
      const target = entry.effect === 'deny' ? denied : allowed;
      for (const p of ROLE_PERMS[entry.role] ?? []) target.add(p);
    }
  }
  return [...allowed].filter((p) => !denied.has(p)).sort();
}

export function can(node, user, perm) {
  return effectivePermissions(node, user).includes(perm);
}
