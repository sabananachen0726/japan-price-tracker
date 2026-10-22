export const ETA_SHEET='1ETPrKZThp9vG1GOa6FacMYJ30SSj_7HKJYZvPXLcyB8';
export const ETA_VIEW=`https://docs.google.com/spreadsheets/d/${ETA_SHEET}/htmlview?gid=0`;
export function parseEtaTable(data){
 if(data?.status!=='ok'||!Array.isArray(data.table?.cols)||!Array.isArray(data.table?.rows))throw Error('ETA 表格讀取失敗');
 const cols=data.table.cols.map(c=>String(c.label||'').trim());const code=cols.indexOf('Item #'),eta=cols.indexOf('ETA Brisbane'),source=cols.indexOf('ETA source'),checked=cols.indexOf('Last checked');
 if(code<0||eta<0)throw Error('ETA 表格缺少 Item # 或 ETA Brisbane');
 const result=new Map();for(const row of data.table.rows){const cells=row.c||[],key=String(cells[code]?.v||'').trim().toUpperCase();if(!key)continue;
 const v=String(cells[eta]?.v||'');const m=v.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})(?:,.*)?\)$/);let date='';
 if(m){const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]),dt=new Date(Date.UTC(y,mo,d));if(dt.getUTCFullYear()===y&&dt.getUTCMonth()===mo&&dt.getUTCDate()===d)date=`${m[1]}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
 if(result.has(key)){result.set(key,{duplicate:true});continue}result.set(key,{date,source:String(cells[source]?.v||''),checked:String(cells[checked]?.v||'')});}
 return result;
}
export function mergeEtas(data,rows,at){const next=structuredClone(data),summary={matched:0,changed:0,locked:0,invalid:0};
 const counts=new Map();for(const c of next.containers||[])counts.set(String(c.code||'').trim().toUpperCase(),(counts.get(String(c.code||'').trim().toUpperCase())||0)+1);
 for(const c of next.containers||[]){const key=String(c.code||'').trim().toUpperCase(),r=rows.get(key);if(!r)continue;if(r.duplicate||!r.date||counts.get(key)!==1){summary.invalid++;continue}summary.matched++;if(c.etaLocked){summary.locked++;continue}if(c.portDate!==r.date){c.history=[{date:at.slice(0,10),text:'到港日自動更新：'+(c.portDate||'—')+' → '+r.date+'（Container ETAs）'},...(c.history||[])];c.etaHistory=[{at,date:at.slice(0,10),from:c.portDate||'',to:r.date,source:'Container ETAs'},...(c.etaHistory||[])];c.portDate=r.date;summary.changed++}c.etaSource='Container ETAs · '+r.source;c.etaCheckedAt=at;c.etaSourceChecked=r.checked;}
 next.settings||={};next.settings.etaSync={at,summary};return {data:next,summary};}
export function loadEtaJsonp(){return new Promise((resolve,reject)=>{const name='jptEta_'+crypto.randomUUID().replaceAll('-',''),s=document.createElement('script');let timer;
 const clean=()=>{clearTimeout(timer);s.remove();delete window[name]};window[name]=data=>{clean();resolve(data)};s.onerror=()=>{clean();reject(Error('ETA 來源無法連線，保留原日期'))};timer=setTimeout(()=>{clean();reject(Error('ETA 讀取逾時，保留原日期'))},20000);
 s.src=`https://docs.google.com/spreadsheets/d/${ETA_SHEET}/gviz/tq?gid=0&range=A7:W1001&headers=1&tqx=out:json;responseHandler:${name}`;document.head.append(s);
 });}
