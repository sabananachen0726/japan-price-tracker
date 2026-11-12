const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=({test,reportFile})=>{
 const MAIN='app_data/main_config',QUOTES='app_data/quotes_v1',PIS='app_data/pi_containers_v1';
 // Seed quotes and a PI into the legacy single document and let the listener pick them up.
 async function seedLegacy(s){await s.page.locator('#add-tab').click();await s.page.evaluate(([MAIN])=>{const m=window.__store[MAIN];m.quotes=[{id:'q1',barcode:'4901071404000',itemCode:'ACE005',supplier:'SilkRoad',price:100,container:'JSR27B0102',date:'2026-11-01'}];m.finalPiContainers={JSR27B0102:{container:'JSR27B0102',supplier:'SilkRoad',rows:[{itemCode:'ACE005',barcode:'4901071404000',qty:10}]}};for(const cb of window.__listeners[MAIN]||[])cb({exists:()=>true,data:()=>structuredClone(m),metadata:{}})},[MAIN]);await s.page.waitForFunction(()=>appData.quotes.length===1&&Object.keys(appData.finalPiContainers).length===1);}
 async function upgrade(s){await s.page.locator('[data-storage-upgrade]').click();}
 test('STORAGE-01','儲存升級','舊規則下升級被擋且資料不變；新規則下一次搬移報價與 PI，主文件不再保存',async s=>{
  await seedLegacy(s);const banner=s.page.locator('#storageNotice');await banner.filter({hasText:'需要升級儲存方式'}).waitFor();await s.page.screenshot({path:path.join(path.dirname(reportFile),'V423-storage-banner.png')});
  await upgrade(s);await banner.filter({hasText:'Firebase 規則尚未更新'}).waitFor();
  let main=await s.page.evaluate(MAIN=>window.__store[MAIN],MAIN);assert.equal(main.quotes.length,1);assert.ok(!main.storageVersion);
  await s.page.evaluate(()=>window.__rulesV2=true);
  await upgrade(s);await s.page.waitForFunction(()=>Number(window.__store['app_data/main_config'].storageVersion)===2);
  main=await s.page.evaluate(MAIN=>window.__store[MAIN],MAIN);
  assert.ok(!('quotes' in main));assert.ok(!('finalPiContainers' in main));
  assert.equal((await s.page.evaluate(Q=>window.__store[Q].quotes,QUOTES)).length,1);
  assert.deepEqual(Object.keys(await s.page.evaluate(P=>window.__store[P].finalPiContainers,PIS)),['JSR27B0102']);
  assert.deepEqual(main.itemToBarcode,{},'derivable item index is no longer stored');
  await s.page.waitForFunction(()=>appData.quotes.length===1&&appData.finalPiContainers.JSR27B0102&&appData.itemToBarcode.ACE005==='4901071404000');
  await banner.waitFor({state:'hidden'});
  await s.page.screenshot({path:path.join(path.dirname(reportFile),'V423-storage-upgraded.png')});
 });
 test('STORAGE-02','儲存升級','升級後儲存、刪除 PI 都寫到正確文件；舊式寫入被規則擋下',async s=>{
  await seedLegacy(s);await s.page.evaluate(()=>window.__rulesV2=true);await s.page.locator('#storageNotice').filter({hasText:'需要升級'}).waitFor();await upgrade(s);
  await s.page.waitForFunction(()=>appData.finalPiContainers.JSR27B0102&&document.getElementById('storageNotice').hidden);
  // Ordinary save: a new PI and a new quote land in their own documents.
  assert.equal(await s.page.evaluate(async()=>{appData.finalPiContainers.JTC27B0101={container:'JTC27B0101',supplier:'Tencho',rows:[{itemCode:'ACE005',barcode:'4901071404000',qty:4}]};appData.quotes.push({id:'q2',barcode:'4901071404000',itemCode:'ACE005',supplier:'Tencho',price:90,container:'JTC27B0101',date:'2026-11-12'});return window.saveFirebaseData()}),true);
  const stored=await s.page.evaluate(()=>window.__store);
  assert.ok(stored['app_data/pi_containers_v1'].finalPiContainers.JTC27B0101);assert.equal(stored['app_data/quotes_v1'].quotes.length,2);
  assert.ok(!('quotes' in stored[MAIN])&&!('finalPiContainers' in stored[MAIN]));
  // Data deletion of one container's PI and quotes goes to their own documents.
  await s.imports('manage');await s.page.locator('#manageContainer').fill('JTC27B0101');
  await s.page.locator('[data-delete-type=pi]').check();await s.page.locator('[data-delete-type=quotes]').check();
  await s.page.locator('#previewContainerDeletion').click();await s.page.locator('#dataDeletionDialog').waitFor();await s.page.locator('#confirmDataDeletion').click();await s.page.locator('#dataDeletionDialog').waitFor({state:'detached'});
  const after=await s.page.evaluate(()=>window.__store);
  assert.ok(!after['app_data/pi_containers_v1'].finalPiContainers.JTC27B0101);assert.ok(after['app_data/pi_containers_v1'].finalPiContainers.JSR27B0102);
  assert.deepEqual(after['app_data/quotes_v1'].quotes.map(q=>q.id),['q1']);
  assert.ok(!('quotes' in after[MAIN])&&!('finalPiContainers' in after[MAIN]));
  // A stale page writing quotes back into main_config is refused and changes nothing.
  const denied=await s.page.evaluate(async()=>{const fs=await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js');const before=JSON.stringify(window.__store['app_data/main_config']);try{await fs.setDoc(fs.doc(null,'app_data','main_config'),{quotes:[{id:'stale'}]},{merge:true});return 'written'}catch(e){return e.code+(JSON.stringify(window.__store['app_data/main_config'])===before?':unchanged':':changed')}});
  assert.equal(denied,'permission-denied:unchanged');
 });
 test('STORAGE-03','儲存升級','任一文件超過 80% 時提醒 Admin',async s=>{
  await seedLegacy(s);await s.page.evaluate(()=>window.__rulesV2=true);await s.page.locator('#storageNotice').filter({hasText:'需要升級'}).waitFor();await upgrade(s);
  await s.page.waitForFunction(()=>document.getElementById('storageNotice').hidden);
  await s.page.evaluate(()=>{const q=window.__store['app_data/quotes_v1'];q.quotes=Array.from({length:6000},(_,i)=>({id:'big'+i,barcode:'4901071404000',itemCode:'ACE005',supplier:'SilkRoad',price:i,note:'x'.repeat(120),date:'2026-11-01'}));for(const cb of window.__listeners['app_data/quotes_v1']||[])cb({exists:()=>true,data:()=>structuredClone(q),metadata:{}})});
  await s.page.locator('#storageNotice').filter({hasText:'報價文件已用'}).waitFor();
 });
};
