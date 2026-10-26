const text=value=>String(value??'').normalize('NFKC').trim().toLowerCase();
// Master maintenance uses contiguous matches within one field only.
export function masterSearchKeys(products={},mappings={},query='') {
 const q=text(query);
 return Object.entries(products).map(([key,p])=>{
  const code=text(p?.itemCode),barcode=text(p?.sourceBarcode||key),name=text(p?.name);
  const aliases=(Array.isArray(mappings[key])?mappings[key]:[]).map(text);
  const fields=[code,barcode,...aliases,name].filter(Boolean);
  const score=!q?0:code===q?100:barcode===q?99:aliases.includes(q)?98:name===q?97:fields.some(v=>v.startsWith(q))?80:fields.some(v=>v.includes(q))?60:0;
  return {key,score};
 }).filter(r=>!q||r.score>0).sort((a,b)=>b.score-a.score).map(r=>r.key);
}
