const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=({test,reportFile})=>{
 test('SALES-ROLL-01','月銷滾動六個月','銷售檔到 10/11 時，月銷算 11/05～10/11，最新月份已有的天數也計入',async s=>{
  const {frame,handle}=await s.planner();
  await s.page.locator('#add-tab').click();await s.page.locator('.import-switcher [data-import-view="planner"]').click();await frame.locator('#imports:not(.hidden)').waitFor();
  // 30 units on the 15th of each month from April to October, then 40 units in the first ten days of November.
  const lines=['Date,Number,Customer.Name,ItemNo,Qty'];
  for(const m of ['04','05','06','07','08','09','10'])lines.push(`2026-${m}-15,${m},Normal,ACE005,30`);
  lines.push('2026-11-05,N1,Normal,ACE005,25','2026-11-10,N2,Normal,ACE005,15');
  await frame.locator('#salesHistoryFile').setInputFiles({name:'rolling.csv',mimeType:'text/csv',buffer:Buffer.from(lines.join('\n')+'\n')});
  await handle.waitForFunction(()=>!!salesPending?.summary,{},{timeout:30000});
  const sum=await handle.evaluate(()=>({start:salesPending.summary.start,end:salesPending.summary.end,months:salesPending.summary.months,raw:salesPending.summary.rows.ACE005.raw,count:salesPending.summary.rows.ACE005.count}));
  assert.equal(sum.end,'2026-11-10');assert.equal(sum.start,'2026-05-11');assert.equal(sum.months.at(-1),'2026-11');
  // May's sale on the 15th is inside the window: 21/31 of May counts; November counts 10/30 of a month.
  const expected=(30*21/31+150+40)/(21/31+5+10/30);
  assert.ok(Math.abs(sum.raw-expected)<1e-9,`raw ${sum.raw} vs ${expected}`);
  assert((await frame.locator('#salesPreviewSummary').innerText()).includes('2026-05-11～2026-11-10（往回六個月）'));
  assert((await frame.locator('#salesPreviewBody').innerText()).includes('10/30 天'));
  await frame.locator('#salesApply').click();await handle.waitForFunction(()=>!salesPending&&salesSummary?.end==='2026-11-10');
  assert.equal(await frame.locator('#salesEndMonth').inputValue(),'2026-11-10');
  await handle.waitForFunction(()=>document.getElementById('salesPlanSummary').textContent.includes('2026-05-11～2026-11-10'));
  await s.page.screenshot({path:path.join(path.dirname(reportFile),'V424-sales-rolling.png'),fullPage:true});
 });
};
