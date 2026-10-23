import {isUploadedImage} from './temporary-image.js';
const upper = v => String(v ?? '').trim().toUpperCase();
export const barcodeKey = v => String(v ?? '').trim().replace(/[\s-]/g, '');
export const validItemCode = v => /^(?=.*[A-Z])[A-Z0-9][A-Z0-9_-]*$/.test(upper(v)) && !/^(?:PENDING_ITEM|__)/.test(upper(v));
// Keep ambiguous aliases unresolved: a relationship is not permission to choose a SKU.
export function createProductResolver(data = {}) {
  const byCode = new Map(), graph = new Map(), byBarcode = new Map();
  const add = (bc, code) => {if (!bc) return; if (!byBarcode.has(bc)) byBarcode.set(bc,new Set()); byBarcode.get(bc).add(code)};
  for (const [key,p] of Object.entries(data.products || {})) {
    const code=upper(p.itemCode); if (!validItemCode(code)) continue;
    byCode.set(code,{...p,itemCode:code,primaryBarcode:key}); add(barcodeKey(key),code); add(barcodeKey(p.sourceBarcode),code);
  }
  for (const [primary,aliases] of Object.entries(data.mappings || {})) for (const alias of Array.isArray(aliases)?aliases:[]) {
    const a=barcodeKey(primary),b=barcodeKey(alias); if(!a||!b)continue;
    if(!graph.has(a))graph.set(a,new Set());if(!graph.has(b))graph.set(b,new Set());graph.get(a).add(b);graph.get(b).add(a);
  }
  return row => {
    const barcode=barcodeKey(row.barcode), explicit=upper(row.itemCode), seen=new Set(), queue=[barcode], codes=new Set();
    while(queue.length){const bc=queue.pop();if(seen.has(bc))continue;seen.add(bc);for(const c of byBarcode.get(bc)||[])codes.add(c);for(const next of graph.get(bc)||[])queue.push(next)}
    const candidates=[...codes].sort().map(code=>({code,name:byCode.get(code).name||code}));
    const selected=upper(data.piProductLinks?.[barcode]);
    const code=byCode.has(explicit)?explicit:codes.has(selected)?selected:codes.size===1?[...codes][0]:'';
    const product=byCode.get(code)||{};
    const temporary = !code ? data.piTemporaryProducts?.[barcode] || {} : {};
    const key=code || (validItemCode(explicit) && !candidates.length ? explicit : '__JAN_'+barcode.replace(/[^A-Z0-9_-]/gi,''));
    return {key,code:code||(!candidates.length&&validItemCode(explicit)?explicit:''),barcode,product,candidates,
      pending:!code,ambiguous:!code&&candidates.length>1,temporary:!code&&!!(temporary.name||temporary.imgUrl||temporary.imageRevision||temporary.imageData),imgUrl:code ? product.imgUrl || '' : (isUploadedImage(temporary.imageData) ? temporary.imageData : temporary.imgUrl || ''),name:product.name||temporary.name||row.name||('待補商品資料 · '+barcode)};
  };
}
// Remap only uniquely resolved identities. An explicit canonical quantity (even 0)
// wins over an older provisional quantity; notes from both identities are retained.
export function remapPiWork(work, piRows) {
  const links=new Map();
  for(const row of piRows||[]) {const old='__JAN_'+barcodeKey(row.barcode).replace(/[^A-Z0-9_-]/gi,''); if(row.code&&!row.code.startsWith('__'))links.set(old,row.code)}
  const rows={...(work.rows||{})}, itemNotes={...(work.itemNotes||{})};
  for(const [old,code] of links){if(Object.hasOwn(rows,old)){if(!Object.hasOwn(rows,code))rows[code]=rows[old];delete rows[old]}
    if(itemNotes[old]){itemNotes[code]=[itemNotes[code],itemNotes[old]].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' / ');delete itemNotes[old]}}
  return {...work,rows,itemNotes};
}

// Called in the same save as a master import: temporary fields are removed only
// after a unique formal match. No inventory, PI rows or work notes are touched.
export function clearResolvedTemporaryProducts(data) {
  const resolve=createProductResolver(data);
  for(const barcode of Object.keys(data.piTemporaryProducts || {})) {
    const identity=resolve({barcode});
    if(!identity.pending && identity.candidates.length===1)delete data.piTemporaryProducts[barcode];
  }
  return data;
}
export function validateTemporaryProduct(value) {
  const name=String(value.name||'').trim(), imgUrl=String(value.imgUrl||'').trim();
  if(name.length>200)throw Error('名稱最多 200 字');
  if(imgUrl.length>2048)throw Error('圖片網址過長');
  if(imgUrl){let url;try{url=new URL(imgUrl)}catch{throw Error('請填寫完整的 https 圖片網址')}
    if(url.protocol!=='https:'||url.username||url.password)throw Error('請使用 https 圖片網址');}
  return {name,imgUrl};
}
