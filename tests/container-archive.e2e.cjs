const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=({test,reportFile})=>{
 test('CTR-ARCHIVE-01','貨櫃封存條件','列表與詳細畫面寫出還差哪些條件才能移入 Archive',async s=>{
  const checklist=['Invoice','Packing List','B/L','Certificate','Customs','Delivery'];
  await s.page.evaluate(list=>{window.__store['app_data/container_tracker_v1']={settings:{checklist:list,suppliers:['SilkRoad']},containers:[{id:'jsr',code:'JSR26B1102',supplier:'SilkRoad',type:'Normal',status:'Shipping',expectedMonth:'2026-11',dateSchemaV2:true,portDate:'2026-11-17',unloadDate:'2026-11-20',unloadConfirmed:false,depositPaid:true,balancePaid:true,finalListReceived:false,checks:Object.fromEntries(list.map(x=>[x,true])),history:[]}]};for(const cb of window.__listeners['app_data/container_tracker_v1']||[])cb({exists:()=>true,data:()=>structuredClone(window.__store['app_data/container_tracker_v1']),metadata:{}})},checklist);
  const {frame}=await s.container();
  const card=frame.locator('.card').filter({hasText:'JSR26B1102'});await card.waitFor();
  assert((await card.innerText()).includes('封存還差：未勾「已確認拆櫃」、未勾「Final Container List Received」'));
  await frame.locator('#viewList').click();
  const row=frame.locator('tr').filter({hasText:'JSR26B1102'});
  const text=await row.innerText();
  assert(text.includes('拆櫃日（未確認）'),text);assert(text.includes('Final List 未收到'),text);assert(text.includes('封存還差'),text);
  await row.click();const drawer=frame.locator('#drawerBody');await drawer.filter({hasText:'移入 Archive 條件'}).waitFor();
  assert((await drawer.innerText()).includes('還差：未勾「已確認拆櫃」、未勾「Final Container List Received」'));await s.page.waitForTimeout(400);await frame.locator('.archive-section').scrollIntoViewIfNeeded();
  await s.page.screenshot({path:path.join(path.dirname(reportFile),'V425-archive-blockers.png')});
 });
};
