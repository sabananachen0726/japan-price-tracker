import {isUploadedImage,validImageBarcode,validateImageRecord} from '../shared/temporary-image.js';
const cache=new Map(),pending=new Map();
const key=(bc,meta)=>bc+':'+meta.imageRevision;
export function cacheTemporaryImage(barcode,meta,dataUrl){if(isUploadedImage(dataUrl))cache.set(key(barcode,meta),dataUrl)}
export function withTemporaryImages(data,mode){return {...data,piTemporaryProducts:Object.fromEntries(Object.entries(data.piTemporaryProducts||{}).map(([bc,meta])=>[bc,{...meta,imageData:mode==='test'?meta.imageData:cache.get(key(bc,meta))||''}]))}}
export async function loadTemporaryImages(data,{getDoc,doc,db}){
 let changed=false;
 await Promise.all(Object.entries(data.piTemporaryProducts||{}).filter(([bc,m])=>validImageBarcode(bc)&&m.imageRevision&&!cache.has(key(bc,m))).map(async([bc,m])=>{
  const k=key(bc,m);if(!pending.has(k))pending.set(k,(async()=>{const snap=await getDoc(doc(db,'pi_temporary_images',bc));if(!snap.exists())throw Error('暫用圖片不存在');const record=validateImageRecord(bc,snap.data());if(record.updatedAt!==m.imageRevision)throw Error('圖片已更新，請重新整理');cache.set(k,record.dataUrl);return true})().finally(()=>pending.delete(k)));
  changed=(await pending.get(k))||changed;
 }));return changed;
}
export async function exportTemporaryImages(data,io){
 const entries=Object.entries(data.piTemporaryProducts||{}).filter(([bc,m])=>validImageBarcode(bc)&&m.imageRevision);
 const images={};await Promise.all(entries.map(async([bc,m])=>{const snap=await io.getDoc(io.doc(io.db,'pi_temporary_images',bc));if(!snap.exists())throw Error('暫用圖片 '+bc+' 不存在，備份未完成');const r=validateImageRecord(bc,snap.data());if(r.updatedAt!==m.imageRevision)throw Error('暫用圖片已改變，請重試');images[bc]=r}));return images;
}
export function removedTemporaryImages(before,after){return Object.entries(before.piTemporaryProducts||{}).filter(([bc,m])=>validImageBarcode(bc)&&m.imageRevision&&!after.piTemporaryProducts?.[bc]?.imageRevision).map(([bc])=>bc)}
