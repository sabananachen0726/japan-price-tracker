const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=({test,reportFile})=>{
 const shot=(s,name)=>s.page.screenshot({path:path.join(path.dirname(reportFile),name)});
 async function open(s){await s.planner();await s.page.locator('#settings-tab').click();const frame=s.page.frameLocator('#plannerFrame');await frame.locator('#productHub:not(.hidden)').waitFor();await frame.locator('#hubRows tr').first().waitFor();return frame;}
 test('HUB-01','商品清單','商品管理預設打開商品清單，待補依原因篩選，月銷不算待補',async s=>{
  const frame=await open(s);
  assert(await s.page.locator('[data-product-view="hub"].active').isVisible());
  assert((await frame.locator('[data-hub-dim="need"][data-hub-val="pending"]').getAttribute('class')).includes('active'));
  assert.equal(await frame.locator('[data-hub-dim="need"][data-hub-val="月銷待設定"]').count(),0);
  await frame.locator('[data-hub-dim="need"][data-hub-val="缺圖片"]').click();
  const tags=await frame.locator('#hubRows tr').evaluateAll(rows=>rows.map(r=>r.innerText));
  assert(tags.length>0&&tags.every(t=>t.includes('缺圖片')));
  await frame.locator('[data-hub-dim="need"][data-hub-val="all"]').click();
  assert((await frame.locator('#hubRows').innerText()).includes('ACE005'));
 });
 test('HUB-02','商品清單','補名稱和圖片，Enter 儲存並跳到下一個待補；標成暫填',async s=>{
  const frame=await open(s);
  await frame.locator('[data-hub-open="ACE005"]').click();
  await frame.locator('#hubDrawer:not([hidden])').waitFor();
  await frame.locator('[data-fill="name"]').fill('Acecook 泡麵');
  await frame.locator('[data-fill="imgUrl"]').fill('https://example.com/ace.png');
  await shot(s,'V4270-hub-drawer.png');
  await frame.locator('[data-fill="imgUrl"]').press('Enter');
  await s.page.waitForFunction(()=>window.__store['app_data/main_config']?.products?.['4901071404000']?.imgUrl==='https://example.com/ace.png');
  const p=await s.page.evaluate(()=>window.__store['app_data/main_config'].products['4901071404000']);
  assert.equal(p.name,'Acecook 泡麵');assert(p.manualFields.name&&p.manualFields.imgUrl);
  // Moved on to the next product that still needs data.
  await frame.locator('[data-hub-open="TEST002"].hub-selected').waitFor();
  await frame.locator('.hub-status.ok').waitFor();
  // Back on ACE005 the filled fields show as 暫填.
  await frame.locator('[data-hub-dim="need"][data-hub-val="all"]').click();await frame.locator('[data-hub-open="ACE005"]').click();
  assert.equal(await frame.locator('#hubDrawer .hub-temp').count(),2);
 });
 test('HUB-03','商品清單','PI 新品（主檔沒有）列在待補；填 Item Code 後建立主檔並出現在訂貨規劃',async s=>{
  await s.page.evaluate(async()=>{appData.finalPiContainers={JSR27B0202F:{container:'JSR27B0202F',rows:[{barcode:'4901005022461',qty:12}]}};await saveFirebaseData()});
  const frame=await open(s);
  await frame.locator('[data-hub-dim="need"][data-hub-val="缺 Item Code"]').click();
  await frame.locator('[data-hub-open="__JAN_4901005022461"]').click();
  assert((await frame.locator('#hubDrawer').innerText()).includes('缺 Item Code'));
  assert.equal(await frame.locator('#hubDrawerSettings select[data-field="kind"]').inputValue(),'frozen');
  assert((await frame.locator('#hubDrawerSettings').innerText()).includes('依貨櫃號碼判斷'));
  await frame.locator('[data-fill="itemCode"]').fill('akag050');
  await frame.locator('[data-fill="name"]').fill('Akagi 新品');
  await frame.locator('[data-hub-save="stay"]').click();
  await s.page.waitForFunction(()=>window.__store['app_data/main_config']?.products?.['4901005022461']?.itemCode==='AKAG050');
  await frame.locator('[data-hub-dim="need"][data-hub-val="all"]').click();
  await frame.locator('[data-hub-open="AKAG050"]').waitFor();
 });
 test('HUB-04','商品清單','抽屜裡改貨別會寫入訂貨設定',async s=>{
  const frame=await open(s);
  await frame.locator('[data-hub-dim="need"][data-hub-val="all"]').click();
  await frame.locator('[data-hub-open="ACE005"]').click();
  await frame.locator('#hubDrawerSettings select[data-field="kind"]').selectOption('frozen');
  await s.page.waitForFunction(()=>window.__store['app_data/order_catalog_v1']?.items?.ACE005?.kind==='frozen');
 });
 test('HUB-05','商品清單','Admin 可把內建清單商品隱藏，在「已隱藏」取消',async s=>{
  await s.page.evaluate(async()=>{delete appData.products['4901071404000'];delete appData.itemToBarcode.ACE005;await saveFirebaseData()});
  const frame=await open(s);
  await frame.locator('[data-hub-dim="need"][data-hub-val="all"]').click();
  await frame.locator('[data-hub-open="ACE005"]').click();
  assert((await frame.locator('#hubDrawerExtra').innerText()).includes('隱藏後就不會出現在訂貨規劃'));
  await frame.locator('[data-hub-hide="ACE005"]').click();
  await s.page.waitForFunction(()=>window.__store['app_data/order_catalog_v1']?.items?.ACE005?.hiddenSeed===true);
  assert(s.dialogs.some(d=>d.includes('從內建清單隱藏')));
  await frame.locator('[data-hub-open="ACE005"]').waitFor({state:'detached'});
  await frame.locator('[data-hub-dim="special"][data-hub-val="hidden"]').click();
  await frame.locator('[data-hub-open="HIDDEN:ACE005"]').click();
  await frame.locator('[data-hub-unhide="ACE005"]').click();
  await s.page.waitForFunction(()=>window.__store['app_data/order_catalog_v1']?.items?.ACE005?.hiddenSeed===false);
  await frame.locator('[data-hub-dim="special"][data-hub-val="hidden"]').click();
  await frame.locator('[data-hub-open="ACE005"]').waitFor();
 });
 test('HUB-06','商品清單','PI 新品沒 Item Code 時，名稱和圖片網址直接存成暫填，清單不再顯示缺圖片',async s=>{
  await s.page.evaluate(async()=>{appData.finalPiContainers={JSR27B0202F:{container:'JSR27B0202F',rows:[{barcode:'4571365752980',qty:6}]}};await saveFirebaseData()});
  const frame=await open(s);
  await frame.locator('[data-hub-open="__JAN_4571365752980"]').click();
  await frame.locator('[data-fill="name"]').fill('札幌焦糖布蕾');
  await frame.locator('[data-fill="imgUrl"]').fill('https://example.com/brulee.png');
  await frame.locator('[data-hub-save="stay"]').click();
  await s.page.waitForFunction(()=>window.__store['app_data/main_config']?.piTemporaryProducts?.['4571365752980']?.imgUrl==='https://example.com/brulee.png');
  await frame.locator('.hub-status.ok').waitFor();
  const row=await frame.locator('[data-hub-open="__JAN_4571365752980"]').innerText();
  assert(!row.includes('缺圖片'),row);assert(row.includes('札幌焦糖布蕾'),row);
  assert(row.includes('缺 Item Code'));
  assert(!(await frame.locator('#hubDrawer').innerText()).includes('缺圖片'));
 });
 test('HUB-07','商品清單','PI 新品在其他同貨別工作單也看得到；條碼和內建商品相同時不重複',async s=>{
  await s.page.evaluate(async()=>{delete appData.products['4901071404000'];delete appData.itemToBarcode.ACE005;appData.finalPiContainers={JSR27B0202F:{container:'JSR27B0202F',rows:[{barcode:'4571365752980',qty:6},{barcode:'4901071404000',qty:4}]}};await saveFirebaseData()});
  const {frame,handle}=await s.planner();
  await frame.locator('#kind').selectOption('frozen');
  await frame.locator('#container').fill('JXX27B0301F');await frame.locator('#container').press('Tab');
  await frame.locator('[data-qty="__JAN_4571365752980"]').waitFor();
  const codes=await handle.evaluate(()=>getItems().map(i=>i.code));
  assert(!codes.includes('__JAN_4901071404000'),codes.join());
  assert.equal(await handle.evaluate(()=>state.items.filter(i=>i.barcode==='4901071404000').length),1);
  assert.equal(await handle.evaluate(()=>calc(state.items.find(i=>i.code==='ACE005')).pi.sum),4);
 });
 test('HUB-08','商品清單','只在內建清單的商品補名稱圖片時，以原品號建立主檔',async s=>{
  await s.page.evaluate(async()=>{delete appData.products['4901071404000'];delete appData.itemToBarcode.ACE005;await saveFirebaseData()});
  const frame=await open(s);
  await frame.locator('[data-hub-dim="need"][data-hub-val="all"]').click();
  await frame.locator('[data-hub-open="ACE005"]').click();
  await frame.locator('[data-fill="imgUrl"]').fill('https://example.com/ace.png');
  await frame.locator('[data-hub-save="stay"]').click();
  await s.page.waitForFunction(()=>window.__store['app_data/main_config']?.products?.['4901071404000']?.itemCode==='ACE005');
  assert.equal(await s.page.evaluate(()=>window.__store['app_data/main_config'].products['4901071404000'].imgUrl),'https://example.com/ace.png');
  await frame.locator('.hub-status.ok').waitFor();
 });
 test('HUB-09','商品清單','篩選可以疊加：冷凍 × 缺圖片，數字跟著其他篩選變',async s=>{
  await s.page.evaluate(async()=>{appData.finalPiContainers={JSR27B0202F:{container:'JSR27B0202F',rows:[{barcode:'4571365752980',qty:6}]}};await saveFirebaseData()});
  const frame=await open(s);
  await frame.locator('[data-hub-dim="kind"][data-hub-val="frozen"]').click();
  await frame.locator('[data-hub-dim="need"][data-hub-val="缺圖片"]').click();
  const rows=await frame.locator('#hubRows tr[data-hub-open]').evaluateAll(r=>r.map(x=>x.dataset.hubOpen));
  assert.deepEqual(rows,['__JAN_4571365752980']);
  assert((await frame.locator('[data-hub-dim="kind"][data-hub-val="dry"]').innerText()).match(/\d+/));
  assert((await frame.locator('[data-hub-dim="need"][data-hub-val="缺圖片"]').getAttribute('class')).includes('active'));
  await shot(s,'V4275-hub-filters.png');
 });
};
