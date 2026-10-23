import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductResolver,remapPiWork,clearResolvedTemporaryProducts,validateTemporaryProduct} from '../src/shared/product-identity.js';
const products={111:{itemCode:'ITEM01',name:'A'},222:{itemCode:'ITEM02',name:'B'},333:{name:'待補商品資料'},444:{itemCode:'PENDING_ITEM_444"'}};
test('unique aliases resolve consistently; placeholders and corrupt reverse indexes cannot create SKUs',()=>{
 const resolve=createProductResolver({products,mappings:{111:['555']},itemToBarcode:{'444"':'444'}});
 assert.equal(resolve({barcode:'555'}).code,'ITEM01');assert.equal(resolve({barcode:'333'}).key,'__JAN_333');assert.equal(resolve({barcode:'444'}).pending,true);
});
test('ambiguous alias keeps quantity under its own barcode until an explicit valid choice',()=>{
 const data={products,mappings:{111:['222']}};
 assert.equal(createProductResolver(data)({barcode:'222'}).ambiguous,true);
 assert.equal(createProductResolver(data)({barcode:'222'}).key,'__JAN_222');
 assert.equal(createProductResolver({...data,piProductLinks:{222:'ITEM02'}})({barcode:'222'}).code,'ITEM02');
 assert.equal(createProductResolver({...data,piProductLinks:{222:'OTHER'}})({barcode:'222'}).ambiguous,true);
 assert.equal(createProductResolver(data)({barcode:'222',itemCode:'ITEM01'}).code,'ITEM01');
});
test('new master identity merges saved quantity zero and notes without doubling PI or mutating saved data',()=>{
 const work={rows:{__JAN_333:0},itemNotes:{__JAN_333:'新品備註'}};
 const result=remapPiWork(work,[{barcode:'333',code:'NEW03'}]);
 assert.deepEqual(result.rows,{NEW03:0});assert.deepEqual(result.itemNotes,{NEW03:'新品備註'});assert.equal(work.rows.__JAN_333,0);
 const both=remapPiWork({rows:{__JAN_333:9,NEW03:0},itemNotes:{__JAN_333:'Old',NEW03:'New'}},[{barcode:'333',code:'NEW03'}]);
 assert.deepEqual(both.rows,{NEW03:0});assert.equal(both.itemNotes.NEW03,'New / Old');
});

test('temporary names and images never override master, even master blank fields; unique import deletes only temporary metadata',()=>{
 const data={products:{},piTemporaryProducts:{555:{name:'Temporary',imgUrl:'https://example.com/temp.png'}},finalPiContainers:{X:{rows:[{barcode:'555',qty:9}]}},inventory:{A:3}};
 assert.equal(createProductResolver(data)({barcode:'555'}).name,'Temporary');
 data.products['555']={itemCode:'NEW01',name:'Formal',imgUrl:''};
 const formal=createProductResolver(data)({barcode:'555'});assert.equal(formal.name,'Formal');assert.equal(formal.imgUrl,'');
 clearResolvedTemporaryProducts(data);assert.deepEqual(data.piTemporaryProducts,{});assert.equal(data.finalPiContainers.X.rows[0].qty,9);assert.equal(data.inventory.A,3);
});
test('no match and ambiguous master retain temporary records; unsafe image URL is rejected',()=>{
 const data={products,mappings:{111:['222']},piTemporaryProducts:{222:{name:'Unresolved'},999:{name:'New'}}};
 clearResolvedTemporaryProducts(data);assert.equal(data.piTemporaryProducts[222].name,'Unresolved');assert.equal(data.piTemporaryProducts[999].name,'New');
 assert.throws(()=>validateTemporaryProduct({imgUrl:'javascript:alert(1)'}));assert.throws(()=>validateTemporaryProduct({imgUrl:'data:image/png;base64,AAAA'}));assert.throws(()=>validateTemporaryProduct({name:'a'.repeat(201)}));assert.deepEqual(validateTemporaryProduct({name:' Name ',imgUrl:'https://example.com/p.png'}),{name:'Name',imgUrl:'https://example.com/p.png'});
});
