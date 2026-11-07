// Folder/file tree. Each node has an ACL: [{ principal, role, effect: 'allow' | 'deny' }]
// principal is 'user:<name>' or 'group:<name>'. `inherit` (default true) controls whether
// the node inherits its parent's permissions.
export class Node {
  constructor(name, { parent = null, acl = [], inherit = true } = {}) {
    this.name = name;
    this.parent = parent;
    this.acl = acl;
    this.inherit = inherit;
    this.children = [];
    if (parent) parent.children.push(this);
  }

  /** '/' for the root, '/a/b' below it. */
  path() {
    if (!this.parent) return '/';
    const parentPath = this.parent.path();
    return parentPath === '/' ? `/${this.name}` : `${parentPath}/${this.name}`;
  }

  child(name, opts = {}) {
    return new Node(name, { ...opts, parent: this });
  }
}
