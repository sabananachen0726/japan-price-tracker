import test from 'node:test';
import assert from 'node:assert/strict';
import {splitAppData, mergeAppData, appDataWrites, migrationWrites, storageDocFor, assertCapacity, capacityReport, compactItemIndex, isSplit} from '../src/shared/app-storage.js';

class FieldPath { constructor(...parts) { this.parts = parts; } }
const deleteField = () => ({__op: 'delete'});
const legacy = {suppliers: ['SilkRoad'], products: {B1: {itemCode: 'A1'}, B2: {itemCode: 'A2'}}, itemToBarcode: {A1: 'B1', A2: 'B2', ODD: 'B9'},
  quotes: [{id: 'q'}], finalPiContainers: {C1: {rows: []}}, customerProtection: {protections: {A1: {store: 'Lara'}}}};

test('split keeps quotes and PIs out of main and stores only non-derivable item links', () => {
  const parts = splitAppData(legacy);
  assert.ok(!('quotes' in parts.main) && !('finalPiContainers' in parts.main) && !('customerProtection' in parts.main));
  assert.equal(parts.main.storageVersion, 2);
  assert.deepEqual(parts.main.itemToBarcode, {ODD: 'B9'});
  assert.deepEqual(compactItemIndex(legacy), {ODD: 'B9'});
  const merged = mergeAppData({...parts.main, customerProtection: legacy.customerProtection}, parts.quotes, parts.pis);
  assert.deepEqual(merged.quotes, legacy.quotes); assert.deepEqual(merged.finalPiContainers, legacy.finalPiContainers);
  assert.deepEqual(merged.itemToBarcode, legacy.itemToBarcode);
  assert.ok(isSplit(merged));
});

test('v1 writes stay a single main_config write and never carry storage markers; v2 writes three documents', () => {
  const v1 = appDataWrites({...legacy, storageVersion: 2}, {split: false, FieldPath});
  assert.equal(v1.length, 1); assert.equal(v1[0][0], 'main');
  assert.ok(!('storageVersion' in v1[0][1]) && !('customerProtection' in v1[0][1]) && 'quotes' in v1[0][1]);
  const v2 = appDataWrites(legacy, {split: true, FieldPath, now: 'T'});
  assert.deepEqual(v2.map(w => w[0]), ['main', 'quotes', 'pis']);
  assert.deepEqual(v2[1][1], {quotes: legacy.quotes, updatedAt: 'T'});
  assert.ok(v2[0][2].mergeFields.every(f => f.parts[0] !== 'customerProtection'));
});

test('migration deletes the moved fields from main in the same write set', () => {
  const writes = migrationWrites(legacy, {FieldPath, deleteField, now: 'T'});
  const main = writes.find(w => w[0] === 'main')[1];
  assert.deepEqual(main.quotes, {__op: 'delete'}); assert.deepEqual(main.finalPiContainers, {__op: 'delete'});
  assert.equal(main.storageVersion, 2);
  assert.throws(() => migrationWrites({storageVersion: 2}, {FieldPath, deleteField}), /已經/);
});

test('field operations move to the document holding the field; capacity is checked per document', () => {
  assert.equal(storageDocFor('main', ['finalPiContainers', 'C1'], true), 'pis');
  assert.equal(storageDocFor('main', ['quotes'], true), 'quotes');
  assert.equal(storageDocFor('main', ['products', 'B1'], true), 'main');
  assert.equal(storageDocFor('main', ['quotes'], false), 'main');
  assert.equal(storageDocFor('tracker', ['containers'], true), 'tracker');
  const big = {...legacy, quotes: [{note: 'x'.repeat(600000)}], finalPiContainers: {C: {note: 'y'.repeat(600000)}}};
  assert.throws(() => assertCapacity(big, {split: false}), /共享主文件/);
  assert.doesNotThrow(() => assertCapacity(big, {split: true}));
  assert.deepEqual(capacityReport(big, {split: true}).map(r => r.part), ['main', 'quotes', 'pis']);
});
