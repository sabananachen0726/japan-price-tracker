import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePasteDate, parseProtectionPaste, planProtectionBatch} from '../src/shared/protection-batch.js';

test('bulk paste accepts a column, comma lists and three-column rows', () => {
  const rows = parseProtectionPaste('Item Code\nace005\nACE006, ACE007\nACE008\tSunnybank\t20/01/2027\nACE009\t\t', {store: 'Lara', confirmedOn: '2026-11-12'});
  assert.deepEqual(rows.map(r => r.code), ['ACE005', 'ACE006', 'ACE007', 'ACE008', 'ACE009']);
  assert.equal(rows[3].store, 'Sunnybank'); assert.equal(rows[3].confirmedOn, '2027-01-20');
  assert.equal(rows[4].store, 'Lara'); assert.equal(rows[4].confirmedOn, '2026-11-12');
  assert.equal(parsePasteDate('31/02/2027'), null);
  assert.equal(parsePasteDate('2027/1/5'), '2027-01-05');
});

test('bulk plan follows the confirmed protection rules row by row', () => {
  const today = '2026-11-12';
  const protections = {
    HELD: {store: 'Lara', confirmedOn: '2026-10-01', expiresOn: '2027-02-01', history: []},
    OTHER: {store: 'Sunnybank', confirmedOn: '2026-10-01', expiresOn: '2027-02-01', history: []},
    OLD: {store: 'Lara', confirmedOn: '2026-01-01', expiresOn: '2026-05-01', history: []}};
  const rows = parseProtectionPaste('NEW1\nHELD\nOTHER\nOLD\nNEW1\nbad!\n__X', {store: 'Lara', confirmedOn: '2026-11-12'});
  const plan = planProtectionBatch(rows, protections, today, 'register');
  assert.deepEqual(plan.map(r => r.ok), [true, false, false, true, false, false, false]);
  assert.equal(plan[0].next.expiresOn, '2027-03-12');
  assert.match(plan[1].message, /續訂/); assert.match(plan[2].message, /Sunnybank/);
  assert.match(plan[4].message, /重複/);
  const renew = planProtectionBatch(parseProtectionPaste('HELD\nNEW2', {confirmedOn: '2026-11-12'}), protections, today, 'renew');
  assert.equal(renew[0].ok, true); assert.equal(renew[0].store, 'Lara'); assert.equal(renew[0].next.expiresOn, '2027-03-12');
  assert.equal(renew[1].ok, false);
  const future = planProtectionBatch(parseProtectionPaste('NEW3', {store: 'Lara', confirmedOn: '2026-12-01'}), {}, today);
  assert.match(future[0].message, /未來/);
});
