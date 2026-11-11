import assert from 'node:assert/strict';
import test from 'node:test';
import {SalesCore} from '../src/planner/domain/sales-core.js';
import {salesImportWorker} from '../src/planner/domain/sales-worker.js';

test('an all-clearance month stays in the average while actual sales stay visible',()=>{
  const current={months:{'2026-07':[['ABC',10,10,0]],'2026-08':[['ABC',20,20,20]]},stats:{minDate:'2026-07-01',maxDate:'2026-08-31'}};
  const r=SalesCore.summarize({current},'2026-08').rows.ABC;
  assert.equal(r.raw,5);assert.equal(r.count,2);assert.equal(r.net[5],20);assert.equal(r.clear[5],20);
});
test('boundary transaction matching consumes occurrences, keeping both sources’ unique lines',()=>{
  const date='2026-07-01';
  const history={months:{'2026-07':[['ABC',5,5,5]]},edges:{[date]:[['same','ABC',2,2],['old','ABC',3,3]]},stats:{minDate:'2026-06-01',maxDate:date}};
  const current={months:{'2026-07':[['ABC',11,11,4]]},edges:{[date]:[['same','ABC',2,2],['same','ABC',2,2],['new','ABC',7,0]]},stats:{minDate:date,maxDate:'2026-07-31'}};
  const r=SalesCore.summarize({history,current},'2026-07').rows.ABC;
  assert.equal(r.net[5],14);assert.equal(r.clear[5],7);assert.equal(r.raw,7);
});
test('worker uses discounted unit price, exact threshold, and excludes internal customers',async()=>{
  const file=new File([`Date,Number,Customer.Name,ItemNo,Qty,Price,Disc%,Lines.Total
2026-10-01,1,External,ABC,2,10,30,14
2026-10-02,2,External,ABC,4,10,29,28.4
2026-10-03,3,KAISI (MEL) PTY LTD,ABC,25,10,35,162.5
2026-10-04,4,External,ABC,-1,10,0,-10
`],'test.csv');
  const messages=[];globalThis.self={postMessage:m=>messages.push(m)};
  try{
    salesImportWorker();
    await self.onmessage({data:{file,slot:'history',allowed:['ABC'],prices:{ABC:10}}});
    const msg=messages.at(-1);
    assert.equal(msg.type,'done',msg.message);
    assert.deepEqual(msg.data.months['2026-10'],[['ABC',6,5,2]]);
    assert.equal(msg.data.lastSales.ABC,'2026-10-02');
    assert.deepEqual(SalesCore.details({history:msg.data}).clearance.ABC,[6,2]);
  }finally{delete globalThis.self;}
});
