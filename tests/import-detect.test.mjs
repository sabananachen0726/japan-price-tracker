import test from 'node:test';
import assert from 'node:assert/strict';
import {detectImport} from '../src/shared/import-detect.js';

const one = (name, rows, extra = {}) => detectImport({name, sheets: [{name: 'Sheet1', rows}], ...extra});

test('dropped files are recognised from names, sheets and header rows', () => {
  assert.equal(one('Product Data Export.xlsx', [['Product Code', 'Barcode', 'Product Name', 'Place of Production Value']]), 'master');
  assert.equal(one('sales-2025.csv', [['Date', 'Number', 'Customer.Name', 'ItemNo', 'Qty', 'Price']]), 'salesHistory');
  assert.equal(detectImport({name: 'history.csv.gz'}), 'salesHistory');
  assert.equal(detectImport({name: 'Sales Nov.xlsm', sheets: [{name: 'Summary', rows: []}, {name: 'SalesHist', rows: []}]}), 'salesCurrent');
  assert.equal(one('myob.xlsx', [['Item Number', 'Name', 'On Hand', 'Custom List 3']]), 'myob');
  assert.equal(one('settings.xlsx', [['Item Code', 'Monthly Sales', 'Max Stock', 'Shelf Life (Months)', 'Status']]), 'settings');
  assert.equal(one('shelf.csv', [['Barcode / JAN', 'Shelf Life (Months)']]), 'shelf');
  assert.equal(one('status.csv', [['Item Code', 'Status']]), 'status');
  assert.equal(one('pi.csv', [['JAN Code', 'Qty(CTN)', 'Item Code', 'Unit Price', 'Expiry Date']]), 'pi');
  assert.equal(one('pi-multi.xlsx', [['Container No.', 'Supplier', 'JAN Code', 'Qty(CTN)']]), 'piMulti');
  assert.equal(one('quotes.csv', [['JAN Code (Barcode)', 'Item Code (料號)', '商品名稱', '廠商名稱', '報價金額', '貨櫃號碼']]), 'quotes');
  assert.equal(detectImport({name: 'backup.json', json: {backupVersion: '4.12.0'}}), 'backup');
  assert.equal(one('random.csv', [['foo', 'bar']]), 'unknown');
  // A title row above the real header is skipped.
  assert.equal(one('pi.xlsx', [['Proforma Invoice JSR27B0101'], ['JAN', 'Qty']]), 'pi');
});
