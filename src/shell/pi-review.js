import {createProductResolver} from '../shared/product-identity.js';
export async function reviewPiProducts(data,catalog,groups,{chooseOnly=false}={}) {
  const resolve=createProductResolver(data), identities=new Map();
  for(const g of groups)for(const row of g.rows||[]){const i=resolve(row);if(i.ambiguous||['paused','discontinued'].includes(catalog?.items?.[i.code]?.availability))identities.set(i.barcode,i)}
  if(!identities.size)return {links:{},reactivate:[]};
  return new Promise(done=>{
    const dialog=document.createElement('dialog');dialog.className='pi-review-dialog';
    const title=document.createElement('h3');title.textContent='確認 PI 商品';dialog.append(title);
    const info=document.createElement('p');info.textContent='PI 商品都會保留在本櫃工作單。勾選恢復的商品，會在所有工作單變成可訂購；不勾選則維持 Inactive。多個品號的條碼請選擇正確商品，未選則保留待確認。';dialog.append(info);
    const checks=[],selects=[];
    for(const i of identities.values()){
      const box=document.createElement('div');box.style.cssText='padding:12px 0;border-top:1px solid #ddd';
      const label=document.createElement('strong');label.textContent=i.barcode+' · '+i.name;box.append(label);
      if(i.ambiguous){const select=document.createElement('select');select.setAttribute('aria-label',i.barcode+' 對應商品');select.style.cssText='display:block;width:100%;padding:8px;margin-top:8px';select.add(new Option('暫不配對，保留待確認',''));for(const c of i.candidates)select.add(new Option(c.code+' · '+c.name,c.code));box.append(select);selects.push([i,select])}
      else if(!chooseOnly){const line=document.createElement('label'),check=document.createElement('input');check.type='checkbox';line.style.display='block';line.append(check,document.createTextNode(' 恢復 '+i.code+' 為可訂購'));box.append(line);checks.push([i.code,check])}
      dialog.append(box);
    }
    const actions=document.createElement('div');actions.style.cssText='display:flex;justify-content:flex-end;gap:12px;margin-top:16px';
    const finish=value=>{dialog.close();dialog.remove();done(value)};
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';cancel.onclick=()=>finish(null);
    const apply=document.createElement('button');apply.type='button';apply.textContent=chooseOnly?'儲存配對':'確認並繼續匯入';apply.className='btn btn-primary';apply.onclick=()=>finish({links:Object.fromEntries(selects.filter(([,s])=>s.value).map(([i,s])=>[i.barcode,s.value])),reactivate:checks.filter(([,c])=>c.checked).map(([c])=>c)});
    actions.append(cancel,apply);dialog.append(actions);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null)});dialog.style.cssText='max-width:680px;width:90%;max-height:80vh;overflow:auto;padding:24px;border:1px solid #cbd5e1;border-radius:12px';document.body.append(dialog);dialog.showModal();
  });
}
