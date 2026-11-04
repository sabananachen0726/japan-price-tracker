import {piRowsVersion as version} from './pi-audit.js';
export const containerKey = value => String(value || '').trim().toUpperCase();
const fieldVersion=(doc,path,value)=>version(doc==='main'&&path[0]==='products'&&path.length===2&&value?{...value,name:typeof value.name==='string'?value.name.replace(/^O\/S\s*-\s*/i,'').trim():value.name}:value);
const get = (data,path) => path.reduce((v,k)=>v?.[k],data);
const set = (data,path,value,remove) => {let target=data;for(const k of path.slice(0,-1)) target=target[k] ||= {};if(remove)delete target[path.at(-1)];else target[path.at(-1)]=value;};
export function deletionContainers({main={},tracker={},planner={}}) {
 return [...new Set([...Object.entries(main.finalPiContainers||{}).map(([k,p])=>p.container||k),...(main.quotes||[]).map(q=>q.container),...(tracker.containers||[]).map(c=>c.code),...Object.keys(planner.drafts||{})].map(containerKey).filter(k=>k&&!k.startsWith('__')))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}
export function buildDeletionPlan(snapshot,request) {
 const {main={},tracker={},planner={}}=snapshot, code=containerKey(request.container), types=new Set(request.types||[]), operations=[], summary=[];
 const add=(doc,path,after,remove=false)=>operations.push({doc,path,before:fieldVersion(doc,path,get(snapshot[doc]||{},path)),after,remove});
 const pi=Object.entries(main.finalPiContainers||{}).filter(([k,p])=>containerKey(p.container||k)===code);
 const containers=(tracker.containers||[]).filter(c=>containerKey(c.code)===code), quotes=(main.quotes||[]).filter(q=>containerKey(q.container)===code), proposals=Object.entries(planner.drafts||{}).filter(([k])=>containerKey(k)===code);
 if(types.has('pi'))for(const [k,p]of pi){add('main',['finalPiContainers',k],null,true);summary.push(`PI ${p.container||k}：${(p.rows||[]).length} 列／${(p.rows||[]).reduce((n,r)=>n+(Number(r.qty)||0),0)} 箱`);}
 if(types.has('tracker')&&containers.length){add('tracker',['containers'],(tracker.containers||[]).filter(c=>containerKey(c.code)!==code));summary.push(`物流貨櫃 ${code}：${containers.length} 筆（含物流日期、付款、待辦及檢查清單）`);}
 if(types.has('proposal'))for(const [k,p]of proposals){add('planner',['drafts',k],null,true);summary.push(`採購工作單 ${k}：${Object.keys(p.rows||{}).length} 項／${Object.values(p.rows||{}).reduce((n,q)=>n+(Number(q)||0),0)} 箱，含備註及 ${(p.notes||[]).length} 則留言`);}
 const quoteIds=new Set((request.quoteIds||[]).map(String));
 const removingQuotes=(main.quotes||[]).filter(q=>types.has('quotes')&&containerKey(q.container)===code || quoteIds.has(String(q.id)));
 if(removingQuotes.length){const selected=new Set(removingQuotes);add('main',['quotes'],(main.quotes||[]).filter(q=>!selected.has(q)));summary.push(`廠商報價：${removingQuotes.length} 筆`);}
 const products=[...new Set(request.products||[])].filter(k=>Object.hasOwn(main.products||{},k));
 if(products.length){for(const k of products){const p=main.products[k];add('main',['products',k],null,true);summary.push(`商品主檔 ${p.itemCode||k}：${p.name||'未命名'}`);}const selected=new Set(products);const index={};for(const [bc,p]of Object.entries(main.products||{}))if(!selected.has(bc)&&String(p?.itemCode||'').trim())index[String(p.itemCode).trim()]=bc;add('main',['itemToBarcode'],index);}
 const productCodes=new Set(products.map(k=>containerKey(main.products[k]?.itemCode)));
 const relatedPI=products.length?Object.values(main.finalPiContainers||{}).reduce((n,p)=>n+(p.rows||[]).filter(r=>products.includes(String(r.barcode))||productCodes.has(containerKey(r.itemCode))).length,0):pi.length;
 const relatedQuotes=products.length?(main.quotes||[]).filter(q=>products.includes(String(q.barcode))||productCodes.has(containerKey(q.itemCode))).length:quotes.length;
 const warnings=code?[`同櫃現有資料：PI ${pi.length} 份、物流 ${containers.length} 筆、報價 ${quotes.length} 筆、採購工作單 ${proposals.length} 份。只刪除上方選取的資料。`]:['只刪除上方選取的資料，未選取資料保留。'];
 if(types.has('tracker')&&!types.has('pi')&&pi.length)warnings.push('只刪物流而保留 PI，會失去該櫃物流入倉日期的判定來源，可能影響 PI 是否計入在途；請核對是否也需刪除舊 PI。');
 if(products.length)warnings.push(`選取商品仍關聯 ${relatedPI} 列 PI、${relatedQuotes} 筆報價。刪除主檔後可能顯示待配對；歷史紀錄保留。`);
 if(request.localWork){summary.push(`本機採購草稿 ${code}（含本機數量及備註）`);}
 return {operations,summary,warnings,code,localWork:!!request.localWork};
}
export function applyDeletionPlan(snapshot,plan) {
 const next=structuredClone(snapshot);
 for(const op of plan.operations){if(fieldVersion(op.doc,op.path,get(snapshot[op.doc]||{},op.path))!==op.before)throw Error('資料已更新，未刪除任何資料。請取消並重新預覽。');next[op.doc] ||= {};set(next[op.doc],op.path,structuredClone(op.after),op.remove);}
 return next;
}
export async function commitDeletionPlan({plan,refs,db,runTransaction,FieldPath,deleteField}) {
 if(!plan.operations.length)return;
 return runTransaction(db,async tx=>{
  const docs=[...new Set(plan.operations.map(op=>op.doc))],snapshot={};
  for(const key of docs){const snap=await tx.get(refs[key]);snapshot[key]=snap.exists()?snap.data():{};}
  applyDeletionPlan(snapshot,plan);
  for(const key of docs){const patch={},fields=[];for(const op of plan.operations.filter(o=>o.doc===key)){set(patch,op.path,op.remove?deleteField():op.after,false);fields.push(new FieldPath(...op.path));}tx.set(refs[key],patch,{mergeFields:fields});}
 });
}
