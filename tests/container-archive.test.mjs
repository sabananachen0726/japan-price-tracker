import test from 'node:test';
import assert from 'node:assert/strict';
import {register as registerWorkflow} from '../src/container/modules/workflow.js';
import {register as registerDates} from '../src/container/modules/logistics-dates.js';

test('archive blockers name exactly what keeps a shipped container out of Archive', () => {
  const context = {D: {settings: {checklist: ['A', 'B']}, containers: []}, today: () => '2026-11-24', log() {}, piStats: () => ({}), $: () => null};
  registerDates(context); registerWorkflow(context);
  const base = {dateSchemaV2: true, unloadDate: '2026-11-20', unloadConfirmed: true, balancePaid: true, finalListReceived: true, checks: {A: true, B: true}, status: 'Shipping'};
  assert.deepEqual(context.archiveBlockers(base), []);
  // JSR26B1102-like: everything visible is ticked, but unload and Final List are not confirmed.
  assert.deepEqual(context.archiveBlockers({...base, unloadConfirmed: false, finalListReceived: false}), ['未勾「已確認拆櫃」', '未勾「Final Container List Received」']);
  assert.deepEqual(context.archiveBlockers({...base, unloadDate: '2026-11-30'}), ['拆櫃日還沒到']);
  assert.deepEqual(context.archiveBlockers({...base, unloadDate: '', balancePaid: false, checks: {A: true}}), ['拆櫃日未填', '尾款未付', 'Checklist 還差 1 項']);
  assert.deepEqual(context.archiveBlockers({...base, archived: true}), []);
  // Same conditions as the automatic move.
  const c = {...base, id: 'x', history: []}; context.uid = () => 'u'; assert.equal(context.complete(c), true); assert.equal(c.archived, true);
});
