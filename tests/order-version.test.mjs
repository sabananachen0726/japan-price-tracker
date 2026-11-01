import test from 'node:test';
import assert from 'node:assert/strict';
import {orderVersion, sameOrder, orderDifferences, reconcileOrder, commitOrderDraft} from '../src/shared/order-version.js';
import {quantityComparison} from '../src/planner/quantity-comparison.js';
import {inactiveNotices, noticeExportRows} from '../src/shell/inactive-notices.js';
import {bindDeferredSearch} from '../src/shared/deferred-search.js';
const work = {kind:'dry',arrival:'2027-01-01',coverage:1,rows:{A:20,B:5},itemNotes:{A:'keep'},updatedAt:'2026-11-01T00:00:00Z',submittedBy:'a@example.com'};
test('proposal version is deterministic and excludes independent comments, but detects edits, deletion and preset changes',()=>{
 assert.equal(orderVersion(work),orderVersion({...work,rows:{B:5,A:20},notes:[{text:'new comment'}],snapshot:{A:{name:'new name'}}}));
 for(const patch of [{rows:{A:21}},{itemNotes:{}},{coverage:2},{revision:'next'},{preparedAt:'new'},{updatedAt:'later'}])assert.notEqual(orderVersion(work),orderVersion({...work,...patch}));
 assert.notEqual(orderVersion(work),orderVersion(null));assert(sameOrder(work,{...work,updatedAt:'later'}));
});
test('comparison defaults to cloud and selectively takes local zero, deletion and notes without mutating input',()=>{
 const local={...work,rows:{A:0},itemNotes:{B:'local'}};
 const differences=orderDifferences(local,work);assert.equal(differences.length,4);
 const base=reconcileOrder(local,work,new Set());assert.deepEqual(base.rows,work.rows);assert.deepEqual(base.itemNotes,work.itemNotes);
 const all=reconcileOrder(local,work,new Set(differences.map((_,i)=>i)));assert.deepEqual(all.rows,{A:0});assert.deepEqual(all.itemNotes,{B:'local'});assert.deepEqual(work.rows,{A:20,B:5});
});
test('atomic submit rejects stale or missing baselines, preserves comments and independent works, replaces editable maps',async()=>{
 let cloud={drafts:{ONE:{...structuredClone(work),notes:[{text:'comment'}],preparedAt:'preset'},OTHER:{rows:{C:9}}}},writes=0;
 class FieldPath{constructor(...parts){this.parts=parts}}
 const ref={};const runTransaction=async(_db,fn)=>fn({get:async()=>({exists:()=>true,data:()=>structuredClone(cloud)}),set:(_ref,data,opts)=>{writes++;for(const field of opts.mergeFields){const [,code,name]=field.parts;cloud.drafts[code][name]=data.drafts[code][name]}}});
 const args={runTransaction,ref,code:'ONE',cleaned:{...work,rows:{A:30},itemNotes:{},revision:'new'},FieldPath};
 await assert.rejects(commitOrderDraft({...args,expectedVersion:orderVersion(work)}),e=>e.code==='order-conflict');assert.equal(writes,0);
 await assert.rejects(commitOrderDraft(args),e=>e.code==='order-conflict');assert.equal(writes,0);
 const saved=await commitOrderDraft({...args,expectedVersion:orderVersion(cloud.drafts.ONE)});assert.equal(saved.rows.A,30);assert.equal(cloud.drafts.ONE.notes[0].text,'comment');assert.equal(cloud.drafts.ONE.preparedAt,'preset');assert.deepEqual(cloud.drafts.ONE.itemNotes,{});assert.equal(cloud.drafts.OTHER.rows.C,9);
 await assert.rejects(commitOrderDraft({...args,expectedVersion:orderVersion(work)}),e=>e.code==='order-conflict');assert.equal(writes,1);
});
test('a transaction retry checks the version again after a competing submit',async()=>{
 let cloud=structuredClone(work),writes=0;
 const runTransaction=async(_db,fn)=>{let staged;const tx={get:async()=>({exists:()=>true,data:()=>({drafts:{ONE:cloud}})}),set:()=>{staged=true}};await fn(tx);assert(staged);cloud={...work,rows:{A:99},revision:'competing'};await fn({...tx,set:()=>writes++})};
 await assert.rejects(commitOrderDraft({runTransaction,ref:{},code:'ONE',cleaned:{rows:{A:30}},expectedVersion:orderVersion(work),FieldPath:class{}}),e=>e.code==='order-conflict');assert.equal(writes,0);assert.equal(cloud.rows.A,99);
});
test('quantity comparison uses the latest committed version, handles zero and negative deltas, and hides identical or unsubmitted values',()=>{
 assert.equal(quantityComparison(30,work,'A').text,'已提交 20 · +10');assert.equal(quantityComparison(0,work,'A').text,'已提交 20 · −20');assert.equal(quantityComparison(15,work,'A').delta,-5);assert.equal(quantityComparison(20,work,'A'),null);assert.equal(quantityComparison(20,{rows:{A:5}},'A'),null);assert.equal(quantityComparison(3,work,'NEW').previous,0);assert.equal(quantityComparison(-1,work,'A'),null);
});
test('inactive notice export contains all notifications, operator names, per-account read status and Brisbane time',()=>{
 const entries=inactiveNotices({items:{A:{name:'Product',inactiveNotices:{one:{id:'one',uid:'person',by:'mail',at:'2026-11-01T00:00:00Z'},two:{id:'two',by:'other',at:'2026-10-01T00:00:00Z'}}}}},{},{person:{name:'Sabrina'}},{admin:{one:true}},'admin');
 const rows=noticeExportRows(entries);assert.equal(rows.length,3);assert.equal(rows[1][2],'Sabrina');assert.equal(rows[1][4],'已讀');assert.equal(rows[2][4],'未讀');assert(rows[1][3].includes('10:00:00'));
});
test('PI search coalesces typing, handles IME, clears immediately and Enter cancels the pending search',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const input=new EventTarget();input.value='A';let calls=0;const dispose=bindDeferredSearch(input,()=>calls++);
 input.dispatchEvent(new Event('input'));t.mock.timers.tick(200);input.value='ACE005';input.dispatchEvent(new Event('input'));t.mock.timers.tick(349);assert.equal(calls,0);t.mock.timers.tick(1);assert.equal(calls,1);
 input.value='B';input.dispatchEvent(new Event('input'));const enter=new Event('keydown');Object.defineProperty(enter,'key',{value:'Enter'});input.dispatchEvent(enter);assert.equal(calls,2);t.mock.timers.tick(500);assert.equal(calls,2);
 input.dispatchEvent(new Event('compositionstart'));input.value='日本';input.dispatchEvent(new Event('input'));t.mock.timers.tick(500);assert.equal(calls,2);input.dispatchEvent(new Event('compositionend'));t.mock.timers.tick(350);assert.equal(calls,3);
 input.value='';input.dispatchEvent(new Event('input'));assert.equal(calls,4);dispose();input.dispatchEvent(new Event('input'));assert.equal(calls,4);
});
