import test from 'node:test';
import assert from 'node:assert/strict';
import {productIndicators} from '../src/planner/domain/product-indicators.js';
import {indexContainerCustomerOrders} from '../src/shared/customer-demand.js';

test('stale stock counts from the later of last shipment and actual receipt',()=>{
  const details={cutoff:'2026-11-12',lastSales:{A:'2026-08-12'}};
  const item={code:'A',stock:5};
  const pi={arrival:'2026-11-05',rows:[{code:'A',qty:12}]};
  assert.equal(productIndicators(item,details,[pi]).weeks,13);
  assert.equal(productIndicators(item,details,[{...pi,received:true}]).weeks,1);
  assert.equal(productIndicators({...item,stock:0},details).weeks,0);
});

test('上批出清 uses sales between the previous and latest received arrivals',()=>{
  const item={code:'A',stock:5};
  const pis=[
    {received:true,arrival:'2026-03-01',rows:[{code:'A',qty:10}]},
    {received:true,arrival:'2026-07-01',rows:[{code:'A',qty:10}]},
    {received:false,arrival:'2026-10-01',rows:[{code:'A',qty:10}]},
    {received:true,arrival:'2026-09-01',rows:[{code:'B',qty:10}]}];
  // Mar–Jun belong to the previous batch: 100 sold, 40 cleared. July onward is the current batch.
  const details={cutoff:'2026-11-12',lastSales:{A:'2026-11-01'},dailyStart:'2026-08-01',
    series:{A:{'2026-02':[50,50],'2026-03':[25,10],'2026-04':[25,10],'2026-05':[25,10],'2026-06':[25,10],'2026-07':[30,30],'2026-08':[30,30]}},
    daily:{A:{'2026-08-05':[30,30]}}};
  const f=productIndicators(item,details,pis);
  assert.equal(f.batch.start,'2026-03-01');assert.equal(f.batch.end,'2026-07-01');
  assert.equal(f.batch.gross,100);assert.equal(f.clear,40);assert.equal(f.clearance,true);
  // Clearing the current batch does not label the previous one.
  const calm={...details,series:{A:{...details.series.A,'2026-03':[25,0],'2026-04':[25,0],'2026-05':[25,0],'2026-06':[25,0]}}};
  assert.equal(productIndicators(item,calm,pis).clearance,false);
  // Below 30% stays unlabelled.
  const low={...details,series:{A:{'2026-03':[100,29]}}};
  assert.equal(productIndicators(item,low,pis).clearance,false);
});

test('上批出清 with one arrival looks at the six months before it, and needs an arrival',()=>{
  const item={code:'A',stock:0};
  const details={cutoff:'2026-11-12',dailyStart:'2026-09-01',series:{A:{'2026-02':[10,10],'2026-05':[10,5]}},daily:{A:{'2026-09-15':[4,4]}}};
  const pis=[{received:true,arrival:'2026-08-16',rows:[{code:'A',qty:1}]}];
  const f=productIndicators(item,details,pis);
  assert.equal(f.batch.basis,'before');assert.equal(f.batch.start,'2026-02-16');
  // Half of February (13/28 of the month) is prorated; May counts in full.
  assert.ok(Math.abs(f.batch.gross-(10*13/28+10))<1e-9);assert.equal(f.batch.estimated,true);
  assert.equal(productIndicators(item,details,[]).batch.basis,'none');
  assert.equal(productIndicators(item,details,[]).clearance,false);
});

test('sales details expose monthly and daily series with the latest file winning overlaps',async()=>{
  const {SalesCore}=await import('../src/planner/domain/sales-core.js');
  const sources={
    history:{stats:{maxDate:'2026-08-31'},months:{'2026-07':[['A',10,10,2]],'2026-08':[['A',99,99,99]]},daily:{'2026-08-10':[['A',99,99]]}},
    current:{stats:{minDate:'2026-08-01',maxDate:'2026-10-31'},months:{'2026-08':[['A',5,5,1]],'2026-09':[['A',6,6,0]]},daily:{'2026-08-10':[['A',5,1]],'2026-09-03':[['A',6,0]]}}};
  const d=SalesCore.details(sources);
  assert.deepEqual(d.series.A,{'2026-07':[10,2],'2026-08':[5,1],'2026-09':[6,0]});
  assert.deepEqual(d.daily.A,{'2026-08-10':[5,1],'2026-09-03':[6,0]});
  assert.equal(d.dailyStart,'2026-08-01');
});

test('customer orders match container and item, separate units, and preserve store totals',()=>{
  const order={code:'a',container:' x 1 ',customer:'Lara',qty:20,unit:'CTN',status:'Final'};
  const rows=indexContainerCustomerOrders([order,{...order,qty:2,unit:'箱'},
    {...order,customer:'Sunnybank',qty:6,unit:'EA'},
    {...order,qty:999,status:'已取消'},{...order,qty:999,container:'X2'},
    {...order,qty:999,container:''},{...order,qty:null}], 'X1');
  assert.deepEqual([...rows.get('A').totals],[['箱',22],['EA',6]]);
  assert.equal(rows.get('A').stores.get('Lara').get('箱'),22);
  assert.equal(rows.get('A').unknown,1);
});
