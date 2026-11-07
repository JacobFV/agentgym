import test from 'node:test';
import assert from 'node:assert/strict';
import { Node } from '../src/tree.mjs';
import { effectivePermissions } from '../src/acl.mjs';

test('permissions granted on a folder apply to its children', () => {
  const root = new Node('root');
  const docs = root.child('docs', { acl: [{ principal: 'user:ann', role: 'viewer', effect: 'allow' }] });
  const file = docs.child('plan.txt');
  assert.deepEqual(effectivePermissions(file, { name: 'ann', groups: [] }), ['read']);
});
