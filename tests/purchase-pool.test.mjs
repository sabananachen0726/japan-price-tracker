import test from 'node:test';
import assert from 'node:assert/strict';
import {requestFromSubmission, pendingFor, planPiCoverage, closeRequest, requestRemaining, lineRemaining, prunable, staleCustomerOrders, revertContainer, ageDays, summarizeMatches} from '../src/shared/purchase-pool.js';

const at = '2026-11-26T01:00:00.000Z';
const work = {rows: {ACE005: 10, BBB001: 4, ZERO: 0}, customerFinal: {ACE005: {'Store A': 2}}, snapshot: {ACE005: {name: 'Ace'}}};

test('a submitted request pools own boxes plus Final customer boxes by item code', () => {
  const r = requestFromSubmission(null, work, {name: 'jxx26b0301', at, by: 'sales@x'});
  assert.equal(r.name, 'JXX26B0301');
  assert.deepEqual(Object.keys(r.lines).sort(), ['ACE005', 'BBB001']);
  assert.equal(r.lines.ACE005.qty, 12);
  assert.equal(r.lines.ACE005.name, 'Ace');
  assert.equal(r.submittedBy, 'sales@x');
});

test('resubmitting keeps coverage and the first submission date; removed untouched items go', () => {
  const first = requestFromSubmission(null, work, {name: 'JXX26B0301', at: '2026-11-01', by: 'a'});
  first.lines.ACE005.covered = {JSR26B0301: 5};
  const again = requestFromSubmission(first, {rows: {ACE005: 8}}, {name: 'JXX26B0301', at: '2026-11-20', by: 'b'});
  assert.equal(again.submittedAt, '2026-11-01');
  assert.equal(again.submittedBy, 'a');
  assert.deepEqual(again.lines.ACE005.covered, {JSR26B0301: 5});
  assert.equal(lineRemaining(again.lines.ACE005), 3);
  assert.equal(again.lines.BBB001, undefined);
});

test('PI coverage: oldest request first, a short PI leaves the difference pending (option B)', () => {
  const pool = {requests: {
    JXX26B0301: requestFromSubmission(null, {rows: {ACE005: 10, BBB001: 4}}, {name: 'JXX26B0301', at: '2026-11-01'}),
    JXX26B0302: requestFromSubmission(null, {rows: {ACE005: 5}}, {name: 'JXX26B0302', at: '2026-11-10'})
  }};
  const {updates, matches} = planPiCoverage(pool, 'JSR26B0301', {ACE005: 12, CCC: 9}, {at});
  assert.deepEqual(matches, [{request: 'JXX26B0301', code: 'ACE005', qty: 10}, {request: 'JXX26B0302', code: 'ACE005', qty: 2}]);
  assert.equal(lineRemaining(updates.JXX26B0302.lines.ACE005), 3);
  assert.equal(requestRemaining(updates.JXX26B0301), 4);
  assert.deepEqual(summarizeMatches(matches), [{request: 'JXX26B0301', items: 1, qty: 10}, {request: 'JXX26B0302', items: 1, qty: 2}]);
  // The same request split into a second container covers what is left.
  const after = {requests: {...pool.requests, ...updates}};
  const second = planPiCoverage(after, 'JTC26B0301', {BBB001: 4}, {at});
  assert.equal(requestRemaining(second.updates.JXX26B0301), 0);
  assert.equal(second.updates.JXX26B0301.completedAt, at);
});

test('re-importing the same PI replaces its earlier coverage instead of adding to it', () => {
  const pool = {requests: {JXX26B0301: requestFromSubmission(null, {rows: {ACE005: 10}}, {name: 'JXX26B0301', at: '2026-11-01'})}};
  const once = planPiCoverage(pool, 'JSR26B0301', {ACE005: 6}, {at});
  const twice = planPiCoverage({requests: once.updates}, 'JSR26B0301', {ACE005: 4}, {at});
  assert.deepEqual(twice.updates.JXX26B0301.lines.ACE005.covered, {JSR26B0301: 4});
  // Removing the PI puts the boxes back to pending.
  assert.equal(lineRemaining(revertContainer(twice.updates.JXX26B0301, 'JSR26B0301').lines.ACE005), 10);
});

test('pending excludes the request being edited and closed lines', () => {
  const pool = {requests: {JXX26B0301: requestFromSubmission(null, {rows: {ACE005: 10}}, {name: 'JXX26B0301', at: '2026-11-01'})}};
  assert.deepEqual(pendingFor(pool, 'ace005'), [{request: 'JXX26B0301', qty: 10, submittedAt: '2026-11-01'}]);
  assert.deepEqual(pendingFor(pool, 'ACE005', 'jxx26b0301'), []);
});

test('closing carries or cancels each pending line with a reason', () => {
  const r = requestFromSubmission(null, {rows: {A: 5, B: 3, C: 2}}, {name: 'JXX26B0301', at: '2026-11-01'});
  r.lines.A.covered = {JSR26B0301: 5};
  const closed = closeRequest(r, {B: 'moq', C: 'carry'}, {at, by: 'admin@x'});
  assert.equal(closed.lines.B.cancelled.reason, 'moq');
  assert.equal(lineRemaining(closed.lines.B), 0);
  assert.equal(lineRemaining(closed.lines.C), 2);
  assert.equal(closed.lines.C.carried, at);
  assert.equal(closed.closedAt, at);
  assert.equal(closed.completedAt, undefined);
  const done = closeRequest(closed, {C: 'seasonal'}, {at, by: 'admin@x'});
  assert.equal(requestRemaining(done), 0);
  assert.equal(done.completedAt, at);
});

test('finished requests are pruned after 120 days; ages count calendar days', () => {
  const pool = {requests: {OLD: {completedAt: '2026-06-01', lines: {A: {qty: 1, covered: {X: 1}}}}, OPEN: {submittedAt: '2026-01-01', lines: {A: {qty: 1}}}}};
  assert.deepEqual(prunable(pool, '2026-11-26'), ['OLD']);
  assert.equal(ageDays('2026-09-27T10:00:00Z', '2026-11-26'), 60);
});

test('customer orders still written on the request name are flagged once a PI took the item', () => {
  const r = requestFromSubmission(null, {rows: {A: 5, B: 3}}, {name: 'JXX26B0301', at: '2026-11-01'});
  r.lines.A.covered = {JSR26B0301: 5};
  const orders = [{code: 'A', container: 'JXX26B-0301', status: 'Final', qty: 2, unit: 'CTN'}, {code: 'B', container: 'JXX26B0301', status: 'Final', qty: 1, unit: 'CTN'}, {code: 'A', container: 'JXX26B0301', status: '已出貨', qty: 1, unit: 'CTN'}];
  assert.deepEqual(staleCustomerOrders(r, orders).map(o => o.code), ['A']);
});
