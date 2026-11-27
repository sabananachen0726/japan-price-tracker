import test from 'node:test';
import assert from 'node:assert/strict';
import {applyMasterFill} from '../src/shell/master-fill.js';
import {JapanMasterImport} from '../src/shell/dom/domain/master-import.js';

const now = '2026-11-27T04:00:00.000Z';

test('filling name and image marks them as temporary', () => {
  const products = {'4901071404000': {itemCode: 'ACE005', sourceBarcode: '4901071404000', name: '', imgUrl: ''}};
  const r = applyMasterFill(products, {masterKey: '4901071404000', fields: {name: ' 泡麵 ', imgUrl: 'https://x.test/a.png'}}, {now});
  assert.deepEqual(r.changed, ['name', 'imgUrl']);
  assert.equal(products['4901071404000'].name, '泡麵');
  assert.deepEqual(products['4901071404000'].manualFields, {name: now, imgUrl: now});
});

test('rejects non-https images, duplicate item codes and changing an existing barcode or code', () => {
  const products = {A: {itemCode: 'ACE005', sourceBarcode: '4901071404000'}, B: {itemCode: '', sourceBarcode: '4900000000009', name: 'x'}};
  assert.throws(() => applyMasterFill(products, {masterKey: 'A', fields: {imgUrl: 'http://x.test/a.png'}}), /https/);
  assert.throws(() => applyMasterFill(products, {masterKey: 'B', fields: {itemCode: 'ace005'}}), /已被其他商品使用/);
  assert.throws(() => applyMasterFill(products, {masterKey: 'A', fields: {barcode: '4900000000001'}}), /不能在這裡改條碼/);
  assert.throws(() => applyMasterFill(products, {masterKey: 'A', fields: {itemCode: 'NEW01'}}), /不能在這裡改品號/);
});

test('a product with no barcode can get one; a code-less product can get an Item Code', () => {
  const products = {PENDING_ITEM_X1: {itemCode: 'X1', sourceBarcode: '', missingBarcode: true}, '4900000000009': {sourceBarcode: '4900000000009', name: 'n'}};
  applyMasterFill(products, {masterKey: 'PENDING_ITEM_X1', fields: {barcode: '4900000000016'}}, {now});
  assert.equal(products.PENDING_ITEM_X1.sourceBarcode, '4900000000016');
  assert.equal(products.PENDING_ITEM_X1.missingBarcode, false);
  assert.equal(products.PENDING_ITEM_X1.manualFields.barcode, now);
  applyMasterFill(products, {masterKey: '4900000000009', fields: {itemCode: 'new02'}}, {now});
  assert.equal(products['4900000000009'].itemCode, 'NEW02');
});

test('a PI-only new product becomes a master record once it has an Item Code', () => {
  const products = {};
  assert.throws(() => applyMasterFill(products, {barcode: '4901005022461', create: true, fields: {name: 'x'}}), /Item Code/);
  const r = applyMasterFill(products, {barcode: '4901005022461', create: true, fields: {itemCode: 'akag050', name: '新品'}}, {now});
  assert.equal(r.key, '4901005022461');
  assert.equal(products['4901005022461'].itemCode, 'AKAG050');
  assert.equal(products['4901005022461'].sourceBarcode, '4901005022461');
});

const parsed = rows => ({rows: rows.map(r => ({origin: 'JAPAN', itemKind: '', kind: 'unknown', sourceActive: true, name: '', imgUrl: '', barcode: '', ...r}))});

test('master import replaces temporary fills whenever it has a value', () => {
  const existing = {'4901071404000': {itemCode: 'ACE005', sourceBarcode: '4901071404000', name: '我補的名', imgUrl: 'https://x.test/mine.png', manualFields: {name: now, imgUrl: now}}};
  const plan = JapanMasterImport.plan(parsed([{code: 'ACE005', barcode: '4901071404000', name: '主檔名稱', imgUrl: ''}]), existing);
  const p = plan.products['4901071404000'];
  assert.equal(p.name, '主檔名稱');
  assert.equal(p.imgUrl, 'https://x.test/mine.png');
  assert.deepEqual(p.manualFields, {imgUrl: now});
  const again = JapanMasterImport.plan(parsed([{code: 'ACE005', barcode: '4901071404000', name: '主檔名稱', imgUrl: 'https://x.test/master.png'}]), plan.products);
  assert.equal(again.products['4901071404000'].imgUrl, 'https://x.test/master.png');
  assert.equal(again.products['4901071404000'].manualFields, undefined);
});

test('a filled barcode survives an import with a blank barcode and is replaced by a real one', () => {
  const existing = {PENDING_ITEM_X1: {itemCode: 'X1', sourceBarcode: '4900000000016', missingBarcode: false, manualFields: {barcode: now}}};
  const keep = JapanMasterImport.plan(parsed([{code: 'X1', name: 'n'}]), existing);
  const kept = Object.values(keep.products).find(p => p.itemCode === 'X1');
  assert.equal(kept.sourceBarcode, '4900000000016');
  assert.equal(kept.missingBarcode, false);
  const replaced = JapanMasterImport.plan(parsed([{code: 'X1', name: 'n', barcode: '4900000000023'}]), keep.products);
  const r = Object.values(replaced.products).find(p => p.itemCode === 'X1');
  assert.equal(r.sourceBarcode, '4900000000023');
  assert.equal(r.manualFields, undefined);
});
