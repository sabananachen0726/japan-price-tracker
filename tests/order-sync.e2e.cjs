const assert=require('node:assert/strict');
async function submitted(s,code='SYNC-ONE',qty='20'){
 const p=await s.planner();await p.frame.locator('#container').fill(code);await p.frame.locator('[data-qty="ACE005"]').fill(qty);await p.frame.locator('#savePlan').click();await p.handle.waitForFunction(()=>orderPending.size===0&&!dirtyDrafts.size);return p;
}
async function remote(s,code,patch,notify=true){
 await s.page.evaluate(({code,patch,notify})=>{
  const path='app_data/order_planner_v1',data=window.__store[path]||={drafts:{}};
  if(patch===null)delete data.drafts[code];else data.drafts[code]={...data.drafts[code],...patch};
  if(notify)for(const cb of window.__listeners[path]||[])cb({exists:()=>true,data:()=>structuredClone(data)});
 },{code,patch,notify});
}
module.exports=({test})=>{
 test('SYNC-01','版本同步','未修改工作單自動顯示其他同事最新箱數與提交時間',async s=>{
  const {frame}=await submitted(s);await remote(s,'SYNC-ONE',{rows:{ACE005:30},updatedAt:'2026-11-02T00:00:00Z',submittedBy:'colleague@example.com',revision:'remote-30',arrival:'2027-02-01'});await frame.locator('[data-qty="ACE005"]').filter({visible:true}).waitFor();await s.page.waitForTimeout(100);assert.equal(await frame.locator('[data-qty="ACE005"]').inputValue(),'30');assert.equal(await frame.locator('#arrival').inputValue(),'2027-02-01');assert((await frame.locator('#orderVersionStatus').innerText()).includes('colleague@example.com'));assert(await frame.locator('#orderConflictBanner').isHidden());
 });
 test('SYNC-02','版本衝突','本機草稿遇到遠端更新會鎖定提交、逐項比較並保留備份',async s=>{
  const {frame,handle}=await submitted(s);await frame.locator('[data-qty="ACE005"]').fill('25');await remote(s,'SYNC-ONE',{rows:{ACE005:30},itemNotes:{ACE005:'remote reminder'},updatedAt:'2026-11-02T00:00:00Z',revision:'remote-30'});await frame.locator('#orderConflictBanner').waitFor();assert.equal(await frame.locator('[data-qty="ACE005"]').inputValue(),'25');assert(await frame.locator('#savePlan').isDisabled());
  await frame.locator('#showSubmittedQuantity').check();assert.equal(await frame.locator('[data-qty-comparison="ACE005"]').innerText(),'已提交 30 · −5');
  await frame.locator('#reviewOrderConflict').click();const dialogBounds=await handle.evaluate(()=>{const r=document.querySelector('#orderConflictDialog').getBoundingClientRect(),f=window.frameElement.getBoundingClientRect();return {bottom:r.bottom+f.top,height:window.parent.innerHeight}});assert(dialogBounds.bottom<=dialogBounds.height);assert.equal(await frame.locator('#orderConflictRows input:checked').count(),0);await frame.locator('#orderConflictRows input[aria-label="採用本機 箱數 ACE005"]').check();await frame.locator('#orderConflictApply').click();assert.equal(await frame.locator('[data-qty="ACE005"]').inputValue(),'25');assert.equal(await frame.locator('[data-item-note="ACE005"]').inputValue(),'remote reminder');assert(!(await frame.locator('#savePlan').isDisabled()));assert.equal(await handle.evaluate(()=>localRecovery.archives.at(-1).draft.rows.ACE005),25);
  await frame.locator('#savePlan').click();await handle.waitForFunction(()=>orderPending.size===0&&!dirtyDrafts.size);assert.equal(await s.page.evaluate(()=>window.__store['app_data/order_planner_v1'].drafts['SYNC-ONE'].rows.ACE005),25);assert(await frame.locator('[data-qty-comparison="ACE005"]').isHidden());
 });
 test('SYNC-03','提交防覆蓋','即使背景監聽尚未收到更新，交易仍拒絕舊版本且保留本機數字',async s=>{
  const {frame,handle}=await submitted(s);await frame.locator('[data-qty="ACE005"]').fill('25');await remote(s,'SYNC-ONE',{rows:{ACE005:99},revision:'server-only-99'},false);await frame.locator('#savePlan').click();await frame.locator('#orderConflictBanner').waitFor();assert.equal(await s.page.evaluate(()=>window.__store['app_data/order_planner_v1'].drafts['SYNC-ONE'].rows.ACE005),99);assert.equal(await frame.locator('[data-qty="ACE005"]').inputValue(),'25');assert.equal(await handle.evaluate(()=>orderPending.size),0);await frame.locator('#reviewOrderConflict').click();await frame.locator('#orderConflictApply').click();assert.equal(await frame.locator('[data-qty="ACE005"]').inputValue(),'99');assert(await frame.locator('#orderConflictBanner').isHidden());
 });
 test('SYNC-04','版本比較','比較期間雲端再更新時不可套用過期比較',async s=>{
  const {frame}=await submitted(s);await frame.locator('[data-qty="ACE005"]').fill('25');await remote(s,'SYNC-ONE',{rows:{ACE005:30},revision:'r30'});await frame.locator('#reviewOrderConflict').click();await remote(s,'SYNC-ONE',{rows:{ACE005:40},revision:'r40'});await frame.locator('#orderConflictApply').click();assert(s.dialogs.some(x=>x.includes('比較期間雲端又有更新')));assert(await frame.locator('#savePlan').isDisabled());await frame.locator('#orderConflictApply').click();assert.equal(await frame.locator('[data-qty="ACE005"]').inputValue(),'40');
 });
 test('SYNC-05','輸入差異','同欄位顯示加減與歸零，成功提交後提示消失且可關閉',async s=>{
  const {frame,handle}=await submitted(s);assert(!(await frame.locator('#showSubmittedQuantity').isChecked()));await frame.locator('#showSubmittedQuantity').check();assert(await frame.locator('[data-qty-comparison="ACE005"]').isHidden());for(const [n,label]of [['30','已提交 20 · +10'],['15','已提交 20 · −5'],['0','已提交 20 · −20']]){await frame.locator('[data-qty="ACE005"]').fill(n);assert.equal(await frame.locator('[data-qty-comparison="ACE005"]').innerText(),label)}await frame.locator('#showSubmittedQuantity').uncheck();assert(await frame.locator('[data-qty-comparison="ACE005"]').isHidden());await frame.locator('#showSubmittedQuantity').check();await frame.locator('#savePlan').click();await handle.waitForFunction(()=>orderPending.size===0&&!dirtyDrafts.size);assert(await frame.locator('[data-qty-comparison="ACE005"]').isHidden());
 });
 test('SYNC-06','獨立留言','留言變更不觸發箱數衝突，提交失敗可重試且保留留言',async s=>{
  const {frame,handle}=await submitted(s);await frame.locator('[data-qty="ACE005"]').fill('25');await remote(s,'SYNC-ONE',{notes:[{text:'new comment'}]});assert(await frame.locator('#orderConflictBanner').isHidden());await s.page.evaluate(()=>window.__failWrites=true);await frame.locator('#savePlan').click();await handle.waitForFunction(()=>orderPending.size===0);assert(await frame.locator('#autosaveStatus').filter({hasText:'提交失敗'}).isVisible());assert.equal(await frame.locator('[data-qty="ACE005"]').inputValue(),'25');await s.page.evaluate(()=>window.__failWrites=false);await frame.locator('#savePlan').click();await handle.waitForFunction(()=>orderPending.size===0&&!dirtyDrafts.size);assert.equal(await s.page.evaluate(()=>window.__store['app_data/order_planner_v1'].drafts['SYNC-ONE'].notes[0].text),'new comment');
 });
 test('SYNC-07','雲端刪除','同事刪除後舊草稿不能直接重建工作單',async s=>{
  const {frame}=await submitted(s);await frame.locator('[data-qty="ACE005"]').fill('25');await remote(s,'SYNC-ONE',null);await frame.locator('#orderConflictBanner').waitFor();assert(await frame.locator('#savePlan').isDisabled());await frame.locator('#reviewOrderConflict').click();await frame.locator('#orderConflictApply').click();assert(!await s.page.evaluate(()=>window.__store['app_data/order_planner_v1'].drafts['SYNC-ONE']));
 });
 test('SYNC-08','舊草稿保護','缺少比較基準的舊本機草稿必須先確認，不能直接覆蓋',async s=>{
  const {frame,handle}=await submitted(s);await handle.evaluate(()=>{state.drafts['SYNC-ONE'].rows.ACE005=12;dirtyDrafts.add('SYNC-ONE');orderBaselines.delete('SYNC-ONE');receiveOrderDrafts();renderAll()});await frame.locator('#orderConflictBanner').waitFor();assert(await frame.locator('#savePlan').isDisabled());assert.equal(await frame.locator('[data-qty="ACE005"]').inputValue(),'12');
 });
 test('SYNC-09','草稿恢復','重新載入小草稿保留原基準，舊格式不繼承雲端新版本',async s=>{
  const {frame,handle}=await submitted(s);await frame.locator('[data-qty="ACE005"]').fill('25');await frame.locator('#search').click();await handle.evaluate(()=>{flushRecovery();const saved=JSON.parse(localStorage.getItem(localRecoveryScope));if(typeof saved.works['SYNC-ONE'].baseVersion!=='string')throw Error('missing persisted baseline');orderBaselines.clear();localRecoveryScope='';loadLocalRecovery();receiveOrderDrafts();renderAll()});assert(await frame.locator('#orderConflictBanner').isHidden());
  await handle.evaluate(()=>{const raw=JSON.parse(localStorage.getItem(localRecoveryScope));delete raw.works['SYNC-ONE'].baseVersion;localStorage.setItem(localRecoveryScope,JSON.stringify(raw));localRecoveryScope='';loadLocalRecovery();receiveOrderDrafts();renderAll()});assert(await frame.locator('#savePlan').isDisabled());assert(await frame.locator('#orderConflictBanner').isVisible());
 });
 test('NOTICE-EXPORT','停用通知','匯出清單包含全部通知、操作者及讀取狀態',async s=>{
  const {frame}=await s.planner();await frame.locator('[data-inactive="ACE005"]').click();await s.page.locator('#inactiveNoticeButton').click();await s.page.locator('#inactiveNoticeRows .notice-entry').waitFor();await s.page.evaluate(()=>XLSX.writeFile=book=>window.__noticeExcel=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1}));await s.page.locator('[data-export-notices]').click();const rows=await s.page.evaluate(()=>window.__noticeExcel);assert.equal(rows[1][0],'ACE005');assert.equal(rows[1][4],'未讀');assert(rows[1][2]);
 });
 test('PI-SEARCH-DELAY','PI查詢效能','快速輸入只查完整文字、Enter立即查詢、清空立即清除',async s=>{
  await s.page.locator('#container-tab').click();await s.page.locator('[data-container-view-button=pi]').click();const input=s.page.locator('#finalPiSearch');await input.fill('ACE');await input.press('Enter');await s.page.locator('#finalPiSearchResults').filter({hasText:'找到'}).waitFor();await input.fill('NOTFOUND');assert((await s.page.locator('#finalPiSearchResults').innerText()).includes('找到'));await s.page.locator('#finalPiSearchResults').filter({hasText:'找不到'}).waitFor();await input.fill('ACE005');await input.press('Enter');assert((await s.page.locator('#finalPiSearchResults').innerText()).includes('找到'));await input.fill('');assert((await s.page.locator('#finalPiSearchResults').innerText()).includes('輸入商品資料'));
 });
};
