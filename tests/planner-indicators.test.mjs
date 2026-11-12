import test from 'node:test';
import assert from 'node:assert/strict';
import {productIndicators} from '../src/planner/domain/product-indicators.js';
import {indexContainerCustomerOrders} from '../src/shared/customer-demand.js';

test('clearance and stale stock indicators apply independently, using actual receipts',()=>{
  const details={cutoff:'2026-11-12',clearance:{A:[100,30]},lastSales:{A:'2026-08-12'}};
  const item={code:'A',stock:5};
  const pi={arrival:'2026-11-05',rows:[{code:'A',qty:12}]};
  assert.equal(productIndicators(item,details,[pi]).clearance,true);
  assert.equal(productIndicators(item,details,[pi]).weeks,13);
  assert.equal(productIndicators(item,details,[{...pi,received:true}]).weeks,1);
  assert.equal(productIndicators({...item,stock:0},details).weeks,0);
  assert.equal(productIndicators(item,{...details,clearance:{A:[100,29]}}).clearance,false);
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
