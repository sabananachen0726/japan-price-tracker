import test from 'node:test';
import assert from 'node:assert/strict';
import {createPiQuantityLookup, applyPiQuantityDefaults} from '../src/planner/pi-quantity-defaults.js';
test('current container PI quantities sum exact item codes and match container exactly',()=>{
 const lookup=createPiQuantityLookup();const source=[{container:'JSR27B0102',rows:[{code:'ORI010',qty:20},{code:'ori010',qty:40},{code:'__JAN_123',qty:10},{code:'BAD',qty:-5}]}];
 assert.deepEqual(lookup(source,' jsr27b0102 '),{ORI010:60});assert.deepEqual(lookup(source,'JSR27B010'),{});
 const replaced=[...source,{container:'JSR27B0102',rows:[{code:'ORI010',qty:80}]}];assert.deepEqual(lookup(replaced,'JSR27B0102'),{ORI010:80});
 assert.deepEqual(lookup([{container:'JSR27B0102',received:true,rows:[{code:'ORI010',qty:60}]}],'JSR27B0102'),{},'已到倉 PI 不自動加回未到倉訂量');
});
test('explicit saved zero and edits take priority; missing items use PI without mutating either source',()=>{
 const work={rows:{ORI010:0,OTHER:7},notes:[{text:'Keep'}]},pi={ORI010:60,NEW:10};const result=applyPiQuantityDefaults(work,pi);
 assert.deepEqual(result.rows,{ORI010:0,NEW:10,OTHER:7});result.rows.NEW=99;assert.equal(pi.NEW,10);assert.equal(work.rows.NEW,undefined);assert.deepEqual(result.notes,work.notes);
});
test('PI refresh remains current until a quantity has been edited or saved',()=>{
 const lookup=createPiQuantityLookup();const before=lookup([{container:'X',rows:[{code:'A',qty:60}]}],'X');const after=lookup([{container:'X',rows:[{code:'A',qty:80}]}],'X');
 assert.equal(applyPiQuantityDefaults({rows:{}},before).rows.A,60);assert.equal(applyPiQuantityDefaults({rows:{}},after).rows.A,80);assert.equal(applyPiQuantityDefaults({rows:{A:15}},after).rows.A,15);
});
