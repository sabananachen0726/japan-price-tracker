const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=({test,reportFile})=>{
 const options={customerUid:'gKYdE0pLAIUIIp6z1YDcZMJ3mTm1',customerOrders:[
  {code:'ACE005',customer:'Customer A',qty:3,unit:'CTN',status:'不需預訂',container:'JSR27B0102',note:'Keep note'},
  {code:'ACE005',customer:'Customer B',qty:2,unit:'箱',status:'Final',container:'',note:'Unassigned'},
  {code:'ACE005',qty:99,unit:'CTN',status:'取消'},
  {code:'ACE005',qty:99,unit:'CTN',status:'已出舊貨'}]};
 async function connect(s){await s.planner();await s.page.locator('#customerSourceEmail').fill('customer@example.com');await s.page.locator('#customerSourcePassword').fill('fixture-password');await s.page.locator('#customerSourceConnect').click();await s.page.locator('#customerSourceStatus').filter({hasText:'最後取得'}).waitFor();}
 async function search(s){await s.page.evaluate(()=>{appData.finalPiContainers={ONE:{container:'JSR27B0102',rows:[{itemCode:'ACE005',barcode:'4901071404000',qty:10}]},TWO:{container:'JTC27B0101',rows:[{itemCode:'ACE005',barcode:'4901071404000',qty:5,expiryDate:'2028-01-01',unitPrice:100}]}}});await s.page.locator('#container-tab').click();await s.page.locator('[data-container-view-button="pi"]').click();await s.page.locator('#finalPiSearch').fill('ACE005');}
 test('CUSTOMER-01','客訂與 PI','不需預訂計入、只扣一次、未指定分開、卡片欄寬相同',async s=>{
  await connect(s);await search(s);
  const panel=s.page.locator('.customer-demand-panel');assert((await panel.innerText()).includes('未履行客訂：5 箱'));assert((await panel.innerText()).includes('在途可用箱數：10 箱'));
  await panel.locator('summary').click();assert((await panel.innerText()).includes('Keep note'));assert((await panel.innerText()).includes('未指定貨櫃（1 筆）'));assert.equal(await panel.locator('tbody tr').count(),2);
  const columns=await s.page.locator('.pi-search-table').evaluateAll(tables=>tables.map(table=>[...table.querySelectorAll('th')].map(th=>Math.round(th.getBoundingClientRect().left))));assert.deepEqual(columns[0],columns[1]);
  await s.page.screenshot({path:path.join(path.dirname(reportFile),'V415-customer-pi-fixture.png'),fullPage:true});
 },options);
 test('CUSTOMER-02','客訂與 PI','沒有連線不當零，未知單位明細保留且不猜算',async s=>{
  await search(s);assert((await s.page.locator('.customer-demand-panel').innerText()).includes('尚未取得'));
  await connect(s);await search(s);const panel=s.page.locator('.customer-demand-panel');assert((await panel.innerText()).includes('資料不足，無法計算'));await panel.locator('summary').click();assert((await panel.innerText()).includes('單位待確認'));
 },{...options,customerOrders:[{code:'ACE005',qty:4,unit:'EA',status:'不須預定',note:'Check unit'}]});
 test('CUSTOMER-03','客訂與 PI','更新失敗保留上次成功資料與時間，沒有 PI 也能查客訂',async s=>{
  await connect(s);await search(s);await s.page.evaluate(()=>{window.__failCustomerRead=true;const now=Date.now();Date.now=()=>now+31000});
  await s.page.locator('#planner-tab').click();await s.page.locator('#customerSourceRefresh').click();await s.page.locator('#customerSourceStatus').filter({hasText:'更新失敗'}).waitFor();
  await s.page.locator('#container-tab').click();await s.page.locator('[data-container-view-button="pi"]').click();await s.page.locator('#finalPiSearch').fill('ACE005');let text=await s.page.locator('.customer-demand-panel').innerText();assert(text.includes('未履行客訂：5 箱'));assert(text.includes('更新失敗'));assert(text.includes('最後成功更新：'));
  await s.page.evaluate(()=>{appData.finalPiContainers={}});await s.page.locator('#finalPiSearch').fill('Acecook');text=await s.page.locator('.customer-demand-panel').innerText();assert(text.includes('未履行客訂：5 箱'));assert(text.includes('在途可用箱數：-5 箱'));
 },options);
};
