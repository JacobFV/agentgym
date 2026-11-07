export const ROLE_PERMS = {
  viewer: ['read'],
  commenter: ['read', 'comment'],
  editor: ['read', 'comment', 'write'],
  owner: ['read', 'comment', 'write', 'share', 'delete'],
};

/** user: { name: string, groups: string[] } */
export function principalMatches(principal, user) {
  if (principal === `user:${user.name}`) return true;
  if (principal.startsWith('group:')) return user.groups.includes(principal.slice(6));
  return false;
}
