import {barcodeKey,validItemCode} from './product-identity.js';
// Resolve the whole relationship, independent of which end was bound first.
// The index is presentation only: never rewrite master records or quote history.
export function buildBarcodeGroups(data={}) {
 const products=data.products||{},graph=new Map(),entries=new Map(),roots=[];
 const node=v=>{const k=barcodeKey(v);if(k&&!graph.has(k))graph.set(k,new Set());return k};
 const edge=(a,b)=>{a=node(a);b=node(b);if(a&&b){graph.get(a).add(b);graph.get(b).add(a)}};
 for(const [key,p] of Object.entries(products)){const k=node(key);entries.set(k,{key,p});if(p.sourceBarcode)edge(k,p.sourceBarcode)}
 for(const [main,list] of Object.entries(data.mappings||{})){roots.push(node(main));for(const alias of Array.isArray(list)?list:[])edge(main,alias)}
 const primaryByBarcode=new Map(),productsByPrimary=new Map(),aliasesByPrimary=new Map(),ambiguousPrimaries=new Set(),visited=new Set();
 const quality=p=>(validItemCode(p.itemCode)&&!p.pendingProduct?100:0)+(p.name&&!/待補商品/.test(p.name)?10:0)+(p.imgUrl?1:0);
 for(const start of graph.keys()){
  if(visited.has(start))continue;
  const component=[],queue=[start];while(queue.length){const k=queue.pop();if(visited.has(k))continue;visited.add(k);component.push(k);for(const next of graph.get(k))queue.push(next)}
  const found=component.map(k=>entries.get(k)).filter(Boolean).sort((a,b)=>quality(b.p)-quality(a.p)||a.key.localeCompare(b.key));
  const formal=found.filter(e=>validItemCode(e.p.itemCode)&&!e.p.pendingProduct);
  const codes=new Set(formal.map(e=>String(e.p.itemCode).trim().toUpperCase()));
  if(codes.size>1){
   for(const k of component){primaryByBarcode.set(k,k);ambiguousPrimaries.add(k);aliasesByPrimary.set(k,[]);if(entries.has(k))productsByPrimary.set(k,entries.get(k).p)}
   continue;
  }
  const chosen=formal[0]||found[0],primary=chosen?.key||roots.find(k=>component.includes(k))||component.slice().sort()[0];
  for(const k of component)primaryByBarcode.set(k,primary);
  productsByPrimary.set(primary,chosen?.p||{});
  aliasesByPrimary.set(primary,component.filter(k=>k!==barcodeKey(primary)&&!k.startsWith('__')).sort());
 }
 return {primaryByBarcode,productsByPrimary,aliasesByPrimary,ambiguousPrimaries};
}
