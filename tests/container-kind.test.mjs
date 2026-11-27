import test from 'node:test';
import assert from 'node:assert/strict';
import {kindFromContainer, inferKind} from '../src/shared/container-kind.js';
test('container numbers ending in F are frozen, others dry; other names say nothing', () => {
  assert.equal(kindFromContainer('JSR27B0202F'), 'frozen');
  assert.equal(kindFromContainer('jtc26b-1101'), 'dry');
  assert.equal(kindFromContainer('AUDIT-VIEW'), '');
  assert.equal(inferKind(['JSR27B0202F', 'JSR27B0101F', 'JTC26B1101']), 'frozen');
  assert.equal(inferKind(['JSR27B0202F', 'JTC26B1101']), '');
  assert.equal(inferKind(['QUOTE-1']), '');
});
