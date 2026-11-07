import { ROLE_PERMS, principalMatches } from './roles.mjs';

/** Sorted list of permissions `user` has on `node`. Deny entries win over allows. */
export function effectivePermissions(node, user) {
  const allowed = new Set();
  const denied = new Set();
  for (const entry of node.acl) {
    if (!principalMatches(entry.principal, user)) continue;
    const target = entry.effect === 'deny' ? denied : allowed;
    for (const p of ROLE_PERMS[entry.role] ?? []) target.add(p);
  }
  return [...allowed].filter((p) => !denied.has(p)).sort();
}

export function can(node, user, perm) {
  return effectivePermissions(node, user).includes(perm);
}
