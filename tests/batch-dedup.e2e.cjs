const assert=require('node:assert/strict');
module.exports=({test})=>{
 test('BATCH-DEDUP-01','批次條碼去重','重複條碼和唯一關聯只顯示一次，工作台與 CSV 保留第一次箱數',async s=>{
 await s.page.evaluate(()=>{appData.mappings={'4901071404000':['4909999999999']}});
 await s.page.locator('#compare-tab').click();await s.page.locator('#btnBatchMode').click();
 await s.page.locator('#batchSearchInput').fill('4901071404000\t2\n4901071404000\t9\n4909999999999\t7\n4900000000002\t3\n4900000000002\t8');
 await s.page.locator('#batchSummaryContainer').filter({hasText:'已忽略 3 筆重複資料'}).waitFor();
 assert.equal(await s.page.locator('#compareResultsContainer > .card').count(),2);
 assert.deepEqual(await s.page.locator('.purchase-copy-qty').evaluateAll(nodes=>nodes.map(n=>n.value)),['2','3']);
 await s.page.locator('#btnOpenWorkbench').click();assert.equal(await s.page.locator('#purchaseWorkbenchContainer tbody tr').count(),2);
 assert.deepEqual(await s.page.locator('.wb-qty').evaluateAll(nodes=>nodes.map(n=>n.value)),['2','3']);
 await s.page.evaluate(()=>{const original=URL.createObjectURL;URL.createObjectURL=function(blob){blob.text().then(text=>window.__batchCsv=text);return original.call(this,blob)}});
 await s.page.locator('#btnExportPurchase').click();await s.page.waitForFunction(()=>!!window.__batchCsv);
 const csv=await s.page.evaluate(()=>window.__batchCsv);const lines=csv.trim().split(/\r?\n/);assert.equal(lines.length,3);assert.match(lines[1],/4901071404000.*2/);assert.match(lines[2],/4900000000002.*3/);
 assert.equal(await s.page.evaluate(()=>window.__writes.length),0);
 });
};
