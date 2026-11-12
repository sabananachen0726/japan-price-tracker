const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=({test,reportFile})=>{
 const orders=[
  {code:'ACE005',customer:'Formosa',qty:10,unit:'CTN',status:'已分配貨櫃',container:'JTC26B-1101',note:''},
  {code:'ACE005',customer:'Lara',qty:5,unit:'CTN',status:'Final',container:'JTC26B1101',note:''},
  {code:'ACE005',customer:'Kim',qty:2,unit:'CTN',status:'待處理',container:'JTC26B1101',note:''},
  {code:'ACE005',customer:'Old',qty:9,unit:'CTN',status:'女孩兒自己取消',container:'JTC26B1101',note:''}];
 async function connect(s){await s.planner();await s.page.locator('#customerSourceEmail').fill('customer@example.com');await s.page.locator('#customerSourcePassword').fill('fixture-password');await s.page.locator('#customerSourceConnect').click();await s.page.locator('#customerSourceStatus').filter({hasText:'最後取得'}).waitFor();}
 test('CUSTFINAL-01','客訂 Final 加訂','客訂欄唯讀：Final 加在本櫃上、已分配含在內、處理中只計數；提交帶入 Final 並分欄顯示',async s=>{
  await connect(s);const {frame}=await s.planner();
  await frame.locator('#container').fill('JTC26B1101');await frame.locator('#container').press('Tab');
  const row=frame.locator('#productRows tr').filter({has:frame.locator('[data-qty="ACE005"]')});
  const cell=row.locator('td.planner-customer');await cell.locator('.cust-final').waitFor();
  const text=await cell.innerText();
  assert(text.includes('Final ＋5 箱'),text);assert(text.includes('已分配 10 箱'),text);
  assert.equal(await cell.locator('input').count(),0,'customer quantities must not be editable');
  assert.equal(await cell.locator('details').getAttribute('open'),null,'details start collapsed');
  assert(text.includes('超過本櫃訂量'),'allocated over own qty warns');
  await row.locator('[data-qty="ACE005"]').fill('12');
  assert((await row.locator('[data-qty-total]').innerText()).includes('合計提交 17 箱'));
  assert(await row.locator('[data-alloc-warn]').isHidden(),'warning clears once own qty covers allocation');
  await cell.locator('summary').click();await row.screenshot({path:path.join(path.dirname(reportFile),'V422-customer-cell.png')});
  await frame.locator('#savePlan').click();
  await s.page.waitForFunction(()=>window.__store['app_data/order_planner_v1']?.drafts?.JTC26B1101?.customerFinal?.ACE005);
  const saved=await s.page.evaluate(()=>window.__store['app_data/order_planner_v1'].drafts.JTC26B1101);
  assert.deepEqual(saved.customerFinal,{ACE005:{Lara:5}});assert.equal(saved.rows.ACE005,12);assert.equal(saved.customerSource,'live');
  await s.page.locator('#container-tab').click();await s.page.locator('#sharedOrderList details > summary').first().click();
  const list=await s.page.locator('#sharedOrderList').innerText();
  assert(list.includes('含 Final 5 箱'),list);assert(list.includes('17'));
  await s.page.evaluate(()=>XLSX.writeFile=wb=>window.__exported=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1}));
  await s.page.locator('[data-proposal-export="JTC26B1101"]').click();
  const excel=await s.page.evaluate(()=>window.__exported);const line=excel.find(r=>r[0]==='ACE005');
  assert.equal(line[5],17);assert.equal(line[7],12);assert.equal(line[8],5);assert.equal(line[9],'Lara 5');
  await s.page.screenshot({path:path.join(path.dirname(reportFile),'V422-customer-final.png'),fullPage:true});
 },{customerUid:'gKYdE0pLAIUIIp6z1YDcZMJ3mTm1',customerOrders:orders});
};
