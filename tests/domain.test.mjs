import test from 'node:test';import assert from 'node:assert/strict';
import {SalesCore} from '../src/planner/domain/sales-core.js';
import {parseMYOBFactor} from '../src/planner/domain/units.js';
import * as utilities from '../src/shell/modules/utilities.js';
import * as piQuery from '../src/shell/modules/pi-query.js';
import * as piImport from '../src/shell/modules/pi-import.js';
import * as shelf from '../src/shell/modules/pi-shelf-life.js';
test('partial six-month coverage divides by shipment months, returns deducted, current source wins',()=>{
 const sources={history:{months:{'2026-04':[['A',10,10]],'2026-07':[['A',99,99]]}},current:{months:{'2026-07':[['A',20,18]],'2026-08':[['A',0,-2]],'2026-09':[]}}};
 const result=SalesCore.summarize(sources,'2026-09',new Set(['A']));assert.equal(result.complete,false);assert.equal(result.rows.A.count,2);assert.equal(result.rows.A.raw,13);assert.equal(result.rows.A.total,26);assert.deepEqual(result.overlap,['2026-07']);
});
test('latest completed-month selection excludes current month and supports sparse data',()=>{
 assert.equal(SalesCore.defaultEnd({current:{stats:{maxDate:'2026-10-19'}}},'2026-10-19'),'2026-09');assert.equal(SalesCore.defaultEnd({history:{stats:{maxDate:'2026-07-01'}}},'2026-10-19'),'2026-07');
});
test('reimport replaces covered months without losing older history or scope limits',()=>{
 const old={months:{'2026-06':[['A',5,5]],'2026-07':[['A',10,10]]},stats:{minDate:'2026-06-01',maxDate:'2026-07-31'}};
 const next={months:{'2026-07':[['A',20,20]],'2026-08':[['OTHER',9,9]]},stats:{minDate:'2026-07-01',maxDate:'2026-08-31'}};
 const merged=SalesCore.mergeSource(old,next);assert.equal(merged.months['2026-06'][0][1],5);assert.equal(merged.months['2026-07'][0][1],20);assert.deepEqual(SalesCore.restrict(merged,new Set(['A'])).months['2026-08'],[]);
});
test('Factor parses MYOB units and rejects invalid conversion',()=>{assert.equal(parseMYOBFactor('CTN'),1);assert.equal(parseMYOBFactor('5Unit/CTN'),5);assert.equal(parseMYOBFactor('0Unit/CTN'),null);assert.equal(parseMYOBFactor('unknown'),null);});
function piContext(){const context={};for(const module of [utilities,piQuery,piImport,shelf])module.register(context);return context;}
test('PI single/multi formats preserve expiry and optional shelf months',()=>{
 const c=piContext();const one=c.parseFinalPiPaste('JAN Code\tQty\tItem Code\tUnit Price\tExpiry Date\t保存期限（月）\n4901071404000\t20\tACE005\t100\t2027/06/30\t12');assert.equal(one.rows[0].shelfLifeMonths,12);assert.equal(one.rows[0].expiryDate,'2027-06-30');
 const multi=c.parseFinalPiMultiPaste('Container No.\tSupplier\tJAN Code\tQty\tItem Code\tUnit Price\tExpiry Date\tShelf Life (Months)\nJSR26B1201\tSilkRoad\t4901071404000\t20\tACE005\t100\t2027/06/30\t18');assert.equal(multi.groups[0].rows[0].shelfLifeMonths,18);assert.equal(c.parseFinalPiPaste('4901071404000\t20\tACE005\t100\t2027/06/30\t0').rows.length,0);
});
import {JapanMasterImport} from '../src/shell/dom/domain/master-import.js';
test('Japan master keeps same-barcode products separate and removes only O/S prefix',()=>{
 const parsed=JapanMasterImport.parse([['Product Code','Product Name','Place of Production Value','Image URL','Barcode'],['A','O/S - One','JAPAN-PET-Clear','','4900000000001'],['B','Two','JAPAN','','4900000000001'],['C','Other','TAIWAN','','4900000000002']]);
 assert.equal(parsed.rows.length,2);assert.equal(parsed.rows[0].name,'One');const plan=JapanMasterImport.plan(parsed,{});assert.equal(Object.keys(plan.products).length,2);assert.equal(plan.conflicts.length,1);assert.equal(Object.values(plan.products).filter(p=>p.barcodeConflict).length,2);
});
