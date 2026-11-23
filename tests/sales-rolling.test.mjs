import test from 'node:test';
import assert from 'node:assert/strict';
import {SalesCore} from '../src/planner/domain/sales-core.js';

test('window runs six months back from the cutoff date; whole months when it is a month end', () => {
  assert.equal(SalesCore.windowStart('2026-11-10'), '2026-05-11');
  assert.deepEqual(SalesCore.range('2026-11-10'), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  assert.equal(SalesCore.windowStart('2026-10-31'), '2026-05-01');
  assert.equal(SalesCore.range('2026-10-31').length, 6);
  assert.equal(SalesCore.windowStart('2026-08-30'), '2026-03-01');
  assert.equal(SalesCore.endDate('2026-08'), '2026-08-31');
});

test('edge months count by days: the recorded part of the newest month and the window part of the oldest', () => {
  // Data runs 2026-01-01 … 2026-11-10. 30 units every whole month; November so far: 12 units in 10 days.
  const months = {};
  for (const m of ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) months[m] = [['A', 30, 30, 0]];
  months['2026-11'] = [['A', 12, 12, 0]];
  const s = SalesCore.summarize({current: {months, stats: {minDate: '2026-01-01', maxDate: '2026-11-10'}}}, '2026-11-10');
  const r = s.rows.A;
  assert.equal(s.start, '2026-05-11');
  const may = s.parts[0], nov = s.parts[6];
  assert.equal(may.inWindow, 21); assert.equal(nov.inWindow, 10); assert.equal(nov.share, 1);
  // May: 21/31 of 30; June–October: 150; November: all 12 recorded units.
  const total = 30 * 21 / 31 + 150 + 12, months6 = 21 / 31 + 5 + 10 / 30;
  assert.ok(Math.abs(r.total - total) < 1e-9); assert.ok(Math.abs(r.count - months6) < 1e-9);
  assert.ok(Math.abs(r.raw - total / months6) < 1e-9);
  assert.equal(s.complete, true);
  // The newest month raises the average when sales pick up, instead of waiting a month.
  months['2026-11'] = [['A', 40, 40, 0]];
  const faster = SalesCore.summarize({current: {months, stats: {minDate: '2026-01-01', maxDate: '2026-11-10'}}}, '2026-11-10').rows.A;
  assert.ok(faster.raw > r.raw);
});

test('an earlier cutoff inside the newest month prorates it; months without shipments still drop out by days', () => {
  const months = {'2026-05': [['A', 31, 31, 0]], '2026-06': [['A', 0, 0, 0]], '2026-07': [['A', 31, 31, 0]], '2026-08': [['A', 31, 31, 0]], '2026-09': [['A', 30, 30, 0]], '2026-10': [['A', 31, 31, 0]], '2026-11': [['A', 20, 20, 0]]};
  const s = SalesCore.summarize({current: {months, stats: {minDate: '2026-01-01', maxDate: '2026-11-20'}}}, '2026-11-10');
  const r = s.rows.A;
  assert.equal(s.parts[6].share, 0.5);                  // 10 of the 20 recorded November days
  const count = 21 / 31 + 4 + 10 / 30;                  // June had no shipments
  assert.ok(Math.abs(r.count - count) < 1e-9);
  assert.ok(Math.abs(r.total - (31 * 21 / 31 + 123 + 10)) < 1e-9);
  // Clearance stays out of demand.
  months['2026-11'] = [['A', 20, 20, 20]];
  const cleared = SalesCore.summarize({current: {months, stats: {minDate: '2026-01-01', maxDate: '2026-11-20'}}}, '2026-11-10').rows.A;
  assert.ok(Math.abs(cleared.total - (31 * 21 / 31 + 123)) < 1e-9);
});
