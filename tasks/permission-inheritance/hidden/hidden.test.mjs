import test from 'node:test';
import assert from 'node:assert/strict';
import { Node } from '../src/tree.mjs';
import { effectivePermissions, can } from '../src/acl.mjs';
import { listAccess } from '../src/share.mjs';

const allow = (principal, role) => ({ principal, role, effect: 'allow' });
const deny = (principal, role) => ({ principal, role, effect: 'deny' });
const ann = { name: 'ann', groups: ['eng'] };
const bob = { name: 'bob', groups: [] };

function fixture() {
  const root = new Node('root', { acl: [allow('group:eng', 'viewer')] });
  const proj = root.child('proj', { acl: [allow('user:bob', 'editor')] });
  const secret = proj.child('secret', { inherit: false, acl: [allow('user:ann', 'owner')] });
  const inner = secret.child('inner.txt');
  const notes = proj.child('notes.md', { acl: [allow('user:ann', 'commenter'), allow('user:bob', 'editor')] });
  return { root, proj, secret, inner, notes };
}

test('hidden: union across multiple levels and groups', () => {
  const { notes } = fixture();
  assert.deepEqual(effectivePermissions(notes, ann), ['comment', 'read']);
  assert.deepEqual(effectivePermissions(notes, bob), ['comment', 'read', 'write']);
});

test('hidden: inherit:false stops at that node but keeps its own entries', () => {
  const { secret, inner } = fixture();
  assert.deepEqual(effectivePermissions(secret, bob), []);
  assert.deepEqual(effectivePermissions(inner, bob), []);
  assert.deepEqual(effectivePermissions(inner, ann), ['comment', 'delete', 'read', 'share', 'write']);
});

test('hidden: deny on an ancestor beats allow on the node', () => {
  const root = new Node('root', { acl: [deny('user:ann', 'editor')] });
  const f = root.child('f', { acl: [allow('user:ann', 'owner')] });
  assert.deepEqual(effectivePermissions(f, ann), ['delete', 'share']);
  assert.equal(can(f, ann, 'write'), false);
});

test('hidden: deny on the node beats inherited allow', () => {
  const root = new Node('root', { acl: [allow('group:eng', 'editor')] });
  const f = root.child('f', { acl: [deny('user:ann', 'viewer')] });
  assert.deepEqual(effectivePermissions(f, ann), ['comment', 'write']);
});

test('hidden: deny above an inherit:false boundary does not apply', () => {
  const root = new Node('root', { acl: [deny('user:ann', 'owner')] });
  const f = root.child('f', { inherit: false, acl: [allow('user:ann', 'viewer')] });
  assert.deepEqual(effectivePermissions(f, ann), ['read']);
});

test('hidden: direct-only behaviour unchanged for root nodes', () => {
  const r = new Node('root', { acl: [allow('user:bob', 'commenter'), allow('group:ops', 'owner')] });
  assert.deepEqual(effectivePermissions(r, bob), ['comment', 'read']);
  assert.deepEqual(effectivePermissions(r, { name: 'x', groups: ['ops'] }), ['comment', 'delete', 'read', 'share', 'write']);
});

test('hidden: share dialog lists inherited entries with their source path', () => {
  const { notes } = fixture();
  assert.deepEqual(listAccess(notes), [
    'group:eng: viewer (inherited from /)',
    'user:ann: commenter',
    'user:bob: editor',
  ]);
});

test('hidden: share dialog shows nearest grant only and respects inherit:false', () => {
  const root = new Node('root', { acl: [allow('user:cy', 'viewer'), allow('user:dee', 'editor')] });
  const a = root.child('a', { acl: [allow('user:cy', 'viewer'), deny('user:x', 'owner')] });
  const b = a.child('b');
  assert.deepEqual(listAccess(b), [
    'user:cy: viewer (inherited from /a)',
    'user:dee: editor (inherited from /)',
  ]);
  const { inner } = fixture();
  assert.deepEqual(listAccess(inner), ['user:ann: owner (inherited from /proj/secret)']);
});

test('hidden: share dialog unchanged for nodes without inherited entries', () => {
  const r = new Node('root', { acl: [allow('user:zed', 'viewer'), allow('group:a', 'owner'), deny('user:q', 'viewer')] });
  assert.deepEqual(listAccess(r), ['group:a: owner', 'user:zed: viewer']);
});

test('hidden: acl arrays are not mutated', () => {
  const { root, proj, notes } = fixture();
  const snap = [root, proj, notes].map((n) => structuredClone(n.acl));
  effectivePermissions(notes, ann);
  listAccess(notes);
  can(notes, bob, 'write');
  assert.deepEqual([root, proj, notes].map((n) => n.acl), snap);
});
