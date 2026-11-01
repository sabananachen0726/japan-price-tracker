import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePiPaste,readPiGrid,isMultiPiPaste} from '../src/shared/pi-paste.js';
import {auditPiData,planPiRepairs,commitPiRepairs} from '../src/shared/pi-audit.js';
import {allocatePiDemand} from '../src/shared/customer-demand.js';
import {renderPiContainerDemand,renderStoreOrders} from '../src/shell/customer-demand-view.js';
const row={barcode:'4901071404000',itemCode:'KR405',qty:4,unitPrice:100,expiryDate:'2027-01-01'};
const data=()=>({products:{'4901071404000':{itemCode:'KR405',name:'Test'}},finalPiContainers:{ONE:{isFinal:true,note:'keep',rows:[{...row,itemCode:'"KR405\n'}]},TWO:{rows:[{...row}]}}});
test('Excel quoted multiline cell remains one row; boundary newline is cleaned with a warning',()=>{
 const parsed=parsePiPaste('JAN Code\tQty\tItem Code\tUnit Price\tExpiry Date\tShelf Life (Months)\r\n4901071404000\t4\t"KR405\r\n"\t100\t2027/1/1\t12\r\n\r\n4901071404000\t2');
 assert.equal(parsed.invalid.length,0);assert.equal(parsed.rows.length,2);assert.equal(parsed.rows[0].itemCode,'KR405');assert.equal(parsed.rows[0].shelfLifeMonths,12);assert.equal(parsed.stats.multilineCells,1);assert.equal(parsed.stats.blankRows,1);assert.equal(parsed.warnings[0].before,'KR405\n');
});
test('CSV escaped quotes and thousands preserve cells; malformed and interior newlines block import',()=>{
 assert.deepEqual(readPiGrid('"A""B",2\n').records[0].cells,['A"B','2']);
 assert.equal(parsePiPaste('4901071404000,"1,200",KR405,"$1,000",2027-01-01').rows[0].qty,1200);
 for(const value of ['4901071404000\t4\t"KR\n405"','4901071404000\t4\t"KR405','4901071404000\t4\tKR405\twrong\t2027-01-01','4901071404000\t4\tKR405\t100\t2027-02-30','4901071404000\t4\tKR405\t100\t2027-01-01\t12\textra']) assert(parsePiPaste(value).invalid.length,value);
});
test('single and multi PI share cell parsing and reject conflicting suppliers',()=>{
 const text='Container\tSupplier\tJAN\tQty\tItem Code\nONE\tSupplier\t4901071404000\t4\t"KR405\n"\nTWO\tSupplier\t4901071404000\t2';
 assert(isMultiPiPaste(text));assert.equal(parsePiPaste('CONTAINER001\tSupplier\t4901071404000\t4',true).groups[0].container,'CONTAINER001');assert(parsePiPaste('BADBARCODE\t4\tKR405').invalid.length);const p=parsePiPaste(text,true);assert.equal(p.invalid.length,0);assert.equal(p.groups.length,2);assert.equal(p.groups[0].rows[0].itemCode,'KR405');
 assert(parsePiPaste(text+'\nONE\tOther\t4901071404000\t2',true).invalid.length);
});
test('historical audit is read-only and only selected identity cleanup is proposed',()=>{
 const d=data(),before=JSON.stringify(d),issues=auditPiData(d,{KR405:{custom:'CTN'}});assert.equal(JSON.stringify(d),before);assert(!issues.some(i=>i.field==='unit'));const selected=issues.filter(i=>i.field==='itemCode');assert.equal(selected[0].suggestion,'KR405');const changes=planPiRepairs(d,selected);assert.equal(changes[0].rows[0].itemCode,'KR405');assert.equal(JSON.stringify(d),before);d.finalPiContainers.ONE.rows[0].qty=9;assert.throws(()=>planPiRepairs(d,selected),/變更/);
 const bad=data();bad.finalPiContainers.ONE.rows[0].qty='wrong';bad.finalPiContainers.ONE.rows[0].unitPrice='100x';assert(auditPiData(bad).filter(i=>['qty','unitPrice'].includes(i.field)).every(i=>i.suggestion===undefined));
});
test('repair transaction preserves metadata and rejects stale remote PI before writing',async()=>{
 const d=data(),changes=planPiRepairs(d,auditPiData(d).filter(i=>i.suggestion));let wrote=0;class Path{constructor(...parts){this.parts=parts;}}
 const runTransaction=async(_,fn)=>fn({get:async()=>({exists:()=>true,data:()=>d}),set:(_,patch,options)=>{wrote++;assert.deepEqual(options.mergeFields[0].parts,['finalPiContainers','ONE','rows']);assert.deepEqual(Object.keys(patch.finalPiContainers.ONE),['rows']);}});
 await commitPiRepairs({runTransaction,FieldPath:Path,changes});assert.equal(wrote,1);assert(d.finalPiContainers.ONE.isFinal);d.finalPiContainers.ONE.rows[0].qty++;await assert.rejects(commitPiRepairs({runTransaction,FieldPath:Path,changes}),/雲端 PI 已更新/);assert.equal(wrote,1);
});
test('assigned demand is per container; unassigned and other containers are never deducted twice',()=>{
 const rows=[{code:'KR405',container:'one',qty:6,unit:'CTN',customer:'<Store>'},{code:'KR405',container:'TWO',qty:2,unit:'箱',customer:'B'},{code:'KR405',container:'',qty:3,unit:'CTN'},{code:'KR405',container:'OLD',qty:8,unit:'CTN'},{code:'KR405',container:'ONE',qty:99,unit:'CTN',status:'取消'}];
 const r=allocatePiDemand(rows,new Set(['KR405']),['ONE','TWO']);assert.equal(r.assigned.get('ONE').total,6);assert.equal(r.assigned.get('TWO').total,2);assert.equal(r.unassigned.total,3);assert.equal(r.other.total,8);const html=renderPiContainerDemand({allocation:r.assigned.get('ONE'),incoming:4,ready:true});assert(html.includes('超額分配 2 箱'));assert(html.includes('&lt;Store&gt;'));assert(!html.includes('<Store>'));assert(renderStoreOrders([...rows.slice(0,1),...rows.slice(0,1)]).includes('1 家／2 筆'));
});
test('PI cleanup version ignores map key order but retains row order and changed values',async()=>{
 const d=data(),changes=planPiRepairs(d,auditPiData(d).filter(i=>i.suggestion));const remote=structuredClone(d);remote.finalPiContainers.ONE.rows=remote.finalPiContainers.ONE.rows.map(r=>Object.fromEntries(Object.entries(r).reverse()));let writes=0;
 await commitPiRepairs({changes,FieldPath:class{},runTransaction:async(_,fn)=>fn({get:async()=>({exists:()=>true,data:()=>remote}),set:()=>writes++})});assert.equal(writes,1);
 remote.finalPiContainers.ONE.rows[0].qty=99;await assert.rejects(commitPiRepairs({changes,FieldPath:class{},runTransaction:async(_,fn)=>fn({get:async()=>({exists:()=>true,data:()=>remote}),set:()=>writes++})}),/已更新/);assert.equal(writes,1);
});
