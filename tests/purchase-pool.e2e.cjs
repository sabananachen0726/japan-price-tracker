const assert=require('node:assert/strict');
const path=require('node:path');
const pool=()=>window.__store['app_data/order_planner_v1']?.pool?.requests||{};
module.exports=({test,reportFile})=>{
 async function submit(s,code,qty){const {frame,handle}=await s.planner();await frame.locator('#container').fill(code);await frame.locator('#search').fill('ACE005');await frame.locator('input[data-qty="ACE005"]').fill(String(qty));await frame.locator('#savePlan').click();await s.page.waitForFunction(code=>!!window.__store['app_data/order_planner_v1']?.drafts?.[code]?.updatedAt,code);return {frame,handle};}
 async function importPi(s,container,qty){await s.imports('pi');await s.page.locator('#finalPiPaste').evaluate(e=>e.closest('details').open=true);await s.page.locator('#finalPiContainer').fill(container);await s.page.locator('#finalPiSupplier').selectOption('SilkRoad');await s.page.locator('#finalPiPaste').fill(`4901071404000\t${qty}\tACE005\t100\t2027-01-01`);await s.page.locator('#btnImportFinalPi').click();await s.page.locator('#piPastePreviewApply').click();}
 test('POOL-01','處理中','沒有 PI 的業務單提交後進入處理中，其他工作單的在途會算進去',async s=>{
  const {frame,handle}=await submit(s,'JXX26B0301',10);
  const r=await s.page.evaluate(()=>window.__store['app_data/order_planner_v1'].pool.requests.JXX26B0301);
  assert.equal(r.lines.ACE005.qty,10);assert.equal(r.submittedBy,'audit@example.com');
  await s.page.waitForFunction(()=>document.querySelector('#plannerFrame').contentWindow.purchasePool?.requests?.JXX26B0301);
  // Editing the request itself does not count its own boxes; another work order does.
  assert.equal(await handle.evaluate(()=>calc(state.items.find(i=>i.code==='ACE005')).pi.sum),0);
  await frame.locator('#container').fill('JXX26B0302');
  const other=await handle.evaluate(()=>{const c=calc(state.items.find(i=>i.code==='ACE005'));return {sum:c.pi.sum,pending:c.pi.details.filter(d=>d.pending).map(d=>[d.container,d.qty])}});
  assert.deepEqual(other,{sum:10,pending:[['JXX26B0301',10]]});
 });
 test('POOL-02','處理中','匯入 PI 時確認劃掉；PI 少於業務單，差額留在處理中',async s=>{
  await submit(s,'JXX26B0301',10);
  await importPi(s,'JSR26B0301',6);
  await s.page.locator('#piPoolDialog').waitFor();
  assert((await s.page.locator('#piPoolDialog').innerText()).includes('JXX26B0301 1 項／6 箱'));
  await s.page.screenshot({path:path.join(path.dirname(reportFile),'V4260-pi-pool-dialog.png')});
  await s.page.locator('[data-pool="apply"]').click();
  await s.page.waitForFunction(()=>window.__store['app_data/order_planner_v1']?.pool?.requests?.JXX26B0301?.lines?.ACE005?.covered?.JSR26B0301===6);
  assert(await s.page.evaluate(()=>!!appData.finalPiContainers.JSR26B0301));
  // Re-importing the same container recalculates instead of adding.
  await importPi(s,'JSR26B0301',8);await s.page.locator('#piPoolDialog').waitFor();await s.page.locator('[data-pool="apply"]').click();
  await s.page.waitForFunction(()=>window.__store['app_data/order_planner_v1']?.pool?.requests?.JXX26B0301?.lines?.ACE005?.covered?.JSR26B0301===8);
 });
 test('POOL-03','處理中','只匯入 PI 不劃掉；取消匯入則什麼都不寫',async s=>{
  await submit(s,'JXX26B0301',10);
  await importPi(s,'JSR26B0301',6);await s.page.locator('#piPoolDialog').waitFor();await s.page.locator('[data-pool="cancel"]').click();
  await s.page.waitForTimeout(300);assert(!await s.page.evaluate(()=>!!appData.finalPiContainers.JSR26B0301));
  await importPi(s,'JSR26B0301',6);await s.page.locator('#piPoolDialog').waitFor();await s.page.locator('[data-pool="skip"]').click();
  await s.page.waitForFunction(()=>!!window.__store['app_data/pi_containers_v1']?.finalPiContainers?.JSR26B0301||!!window.__store['app_data/main_config']?.finalPiContainers?.JSR26B0301);
  assert.equal(await s.page.evaluate(()=>window.__store['app_data/order_planner_v1'].pool.requests.JXX26B0301.lines.ACE005.covered),undefined);
 });
 test('POOL-04','採購單總覽','總覽分頁顯示處理中；Admin 結案可取消並記錄原因',async s=>{
  const {frame}=await submit(s,'JXX26B0301',10);
  await frame.locator('[data-tab="containers"]').click();await frame.locator('[data-ov-tab="pending"]').click();
  await frame.locator('[data-pool-request="JXX26B0301"]').waitFor();
  assert((await frame.locator('[data-ov-tab="pending"]').innerText()).includes('1'));
  await frame.locator('[data-pool-close="JXX26B0301"]').click();
  await frame.locator('select[data-close-choice="ACE005"]').selectOption('moq');
  await s.page.screenshot({path:path.join(path.dirname(reportFile),'V4260-overview-close.png'),fullPage:false});
  await frame.locator('[data-pool-close-confirm="JXX26B0301"]').click();
  await s.page.waitForFunction(()=>window.__store['app_data/order_planner_v1'].pool.requests.JXX26B0301.lines.ACE005.cancelled?.reason==='moq');
  assert(s.dialogs.some(d=>d.includes('1 項取消')));
  await frame.locator('.pool-status.ok').waitFor();
  assert((await frame.locator('[data-ov-tab="pending"]').innerText()).includes('0'));
 });
 test('POOL-05','採購單總覽','已提交但未加入的工作單可勾選加入處理中；有同名 PI 的不列出',async s=>{
  await s.page.evaluate(async()=>{appData.finalPiContainers={JSR26B0399:{container:'JSR26B0399',rows:[{itemCode:'ACE005',barcode:'4901071404000',qty:3}]}};await saveFirebaseData();window.__store['app_data/order_planner_v1']={drafts:{OLD26B0101:{kind:'dry',arrival:'',coverage:1,rows:{ACE005:4},updatedAt:'2026-11-01T00:00:00.000Z',submittedBy:'sales@example.com'},JSR26B0399:{kind:'dry',arrival:'',coverage:1,rows:{ACE005:3},updatedAt:'2026-11-02T00:00:00.000Z'}}};for(const cb of window.__listeners['app_data/order_planner_v1']||[])cb({exists:()=>true,data:()=>structuredClone(window.__store['app_data/order_planner_v1'])})});
  const {frame}=await s.planner();await frame.locator('[data-tab="containers"]').click();await frame.locator('[data-ov-tab="pending"]').click();
  await frame.locator('[data-pool-pick="OLD26B0101"]').waitFor();
  assert.equal(await frame.locator('[data-pool-pick="JSR26B0399"]').count(),0);
  await frame.locator('[data-pool-add]').click();
  await s.page.waitForFunction(()=>window.__store['app_data/order_planner_v1'].pool?.requests?.OLD26B0101?.lines?.ACE005?.qty===4);
  assert.equal(await s.page.evaluate(()=>window.__store['app_data/order_planner_v1'].pool.requests.OLD26B0101.submittedBy),'sales@example.com');
 });
 test('POOL-06','處理中','Editor 看得到處理中但不能結案',async s=>{
  await s.page.evaluate(async()=>{window.__store['app_data/order_planner_v1']={drafts:{JXX26B0301:{kind:'dry',coverage:1,rows:{ACE005:10},updatedAt:'2026-11-20T00:00:00.000Z'}},pool:{requests:{JXX26B0301:{name:'JXX26B0301',submittedAt:'2026-11-20T00:00:00.000Z',lines:{ACE005:{qty:10}}}}}};for(const cb of window.__listeners['app_data/order_planner_v1']||[])cb({exists:()=>true,data:()=>structuredClone(window.__store['app_data/order_planner_v1'])})});
  const {frame,handle}=await s.planner();await handle.waitForFunction(()=>plannerRole==='editor');await frame.locator('[data-tab="containers"]').click();await frame.locator('[data-ov-tab="pending"]').click();await frame.locator('[data-pool-request="JXX26B0301"]').waitFor();
  assert.equal(await frame.locator('[data-pool-close]').count(),0);
 },{role:'editor'});
 test('POOL-07','處理中','刪除業務單會一併移出處理中；刪除 PI 會把箱數還回處理中',async s=>{
  await submit(s,'JXX26B0301',10);await importPi(s,'JSR26B0301',6);await s.page.locator('#piPoolDialog').waitFor();await s.page.locator('[data-pool="apply"]').click();
  await s.page.waitForFunction(()=>window.__store['app_data/order_planner_v1']?.pool?.requests?.JXX26B0301?.lines?.ACE005?.covered?.JSR26B0301===6);
  const remove=async(code,type)=>{await s.imports('manage');await s.page.locator('#manageContainer').fill(code);await s.page.locator('#manageContainer').dispatchEvent('input');await s.page.locator(`[data-delete-type=${type}]`).check();await s.page.locator('#previewContainerDeletion').click();await s.page.locator('#dataDeletionDialog').waitFor();};
  await remove('JSR26B0301','pi');
  assert((await s.page.locator('#dataDeletionDialog').innerText()).includes('6 箱回到處理中'));
  await s.page.locator('#confirmDataDeletion').click();await s.page.locator('#dataDeletionDialog').waitFor({state:'detached'});
  assert.equal(await s.page.evaluate(()=>window.__store['app_data/order_planner_v1'].pool.requests.JXX26B0301.lines.ACE005.covered),undefined);
  await remove('JXX26B0301','proposal');
  await s.page.locator('#confirmDataDeletion').click();await s.page.locator('#dataDeletionDialog').waitFor({state:'detached'});
  assert.equal(await s.page.evaluate(()=>window.__store['app_data/order_planner_v1'].pool.requests.JXX26B0301),undefined);
 });
};
