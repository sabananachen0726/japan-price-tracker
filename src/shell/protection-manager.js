import {brisbaneDate,registerProtection} from '../shared/customer-protection.js';

export function installProtectionManager(context) {
  const target=document.querySelector('[data-import-section="manage"]');
  if(!target)return;
  const button=document.createElement('button');
  button.type='button'; button.className='btn btn-outline-primary mb-3'; button.textContent='客找商品保護';
  target.prepend(button);
  const dialog=document.createElement('dialog');
  dialog.className='pi-paste-preview';
  dialog.innerHTML=`<h3>客找商品保護</h3><p>從店家確認日算四個曆月；續訂由新確認日重新計算。</p>
    <form class="d-grid gap-2"><label>操作 <select name="action" class="form-select">
    <option value="register">登記保護</option><option value="renew">登記續訂</option><option value="pass">單次放行</option></select></label>
    <label>品號 <input name="code" class="form-control" required maxlength="60"></label>
    <label>店家名稱 <input name="store" class="form-control" maxlength="120"></label>
    <label>確認日 <input name="date" type="date" class="form-control"></label>
    <label>放行櫃號 <input name="container" class="form-control" maxlength="60"></label>
    <label>核准箱數 <input name="boxes" type="number" min="1" step="1" class="form-control"></label>
    <label>放行理由 <input name="reason" class="form-control" maxlength="300"></label>
    <button type="submit" class="btn btn-primary">儲存</button></form>
    <p role="status" aria-live="polite"></p><div data-records></div>
    <button type="button" data-close class="btn btn-outline-secondary">關閉</button>`;
  document.body.append(dialog);
  const form=dialog.querySelector('form'), status=dialog.querySelector('[role=status]');
  let data={}, busy=false;
  const permitted=()=>context.isAdmin() && context.currentDataMode==='live';
  const code=()=>form.elements.code.value.trim().toUpperCase();
  function fields(){
    const action=form.elements.action.value;
    for(const [field,show] of Object.entries({store:action!=='pass',date:action!=='pass',
      container:action==='pass',boxes:action==='pass',reason:action==='pass'})){
      const el=form.elements[field];el.parentElement.hidden=!show;el.disabled=!show;el.required=show;
    }
    form.elements.store.readOnly=action==='renew';
    if(action==='renew')form.elements.store.value=data.protections?.[code()]?.store || '';
  }
  function list(){
    const root=dialog.querySelector('[data-records]'); root.replaceChildren();
    const today=brisbaneDate();
    const records=Object.entries(data.protections||{});
    for(const active of [true,false]){
      const section=document.createElement('details');section.open=active;
      const summary=document.createElement('summary');summary.textContent=active?'保護中':'已到期';section.append(summary);
      for(const [item,p] of records.filter(([,p])=>(p.expiresOn>today)===active)){
        const row=document.createElement('p');
        row.textContent=`${item} · ${p.store} · ${p.expiresOn.split('-').reverse().join('/')} 可訂`;
        const renew=document.createElement('button');renew.type='button';renew.className='btn btn-sm btn-outline-primary ms-2';renew.textContent='登記續訂';
        renew.onclick=()=>{form.elements.code.value=item;form.elements.action.value='renew';fields();form.elements.date.focus();};row.append(renew);
        const history=document.createElement('details'), heading=document.createElement('summary');heading.textContent='確認與放行紀錄';history.append(heading);
        for(const event of p.history||[]){const line=document.createElement('div');line.textContent=`${event.store} · 確認 ${event.confirmedOn} · 到期 ${event.expiresOn}`;history.append(line);}
        for(const pass of Object.values(data.passes||{}).filter(x=>x.code===item)){const line=document.createElement('div');line.textContent=`${pass.store} · ${pass.container} · ${pass.boxes} 箱 · ${pass.usedAt?'已核銷':'未核銷'} · ${pass.reason}`;history.append(line);}
        section.append(row,history);
      }
      root.append(section);
    }
    fields();
  }
  async function refresh(){
    const snap=await context.getDoc(context.PROD_DOC_REF);
    if(!permitted())return;
    data=snap.data()?.customerProtection || {};list();
  }
  button.onclick=async()=>{
    if(!permitted()) {status.textContent='請在 LIVE 模式使用 Admin 帳號管理。';dialog.showModal();return;}
    form.reset();form.elements.date.value=brisbaneDate();fields();status.textContent='讀取中…';dialog.showModal();
    try{await refresh();status.textContent='';}catch(err){status.textContent=err.message;}
  };
  dialog.querySelector('[data-close]').onclick=()=>{if(!busy)dialog.close();};
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  form.elements.action.onchange=fields;form.elements.code.oninput=()=>{if(form.elements.action.value==='renew')fields();};
  form.onsubmit=async e=>{
    e.preventDefault();if(busy||!permitted())return;
    const f=new FormData(form), item=code(), uid=context.auth.currentUser.uid, today=brisbaneDate();
    if(!/^[A-Z0-9_-]{1,60}$/.test(item)||item.startsWith('__')){status.textContent='品號格式不正確';return;}
    const action=f.get('action'), id=crypto.randomUUID();
    busy=true;form.querySelector('[type=submit]').disabled=true;status.textContent='儲存中…';
    try{
      await context.runTransaction(context.db,async tx=>{
        const snap=await tx.get(context.PROD_DOC_REF);
        if(!permitted()||context.auth.currentUser?.uid!==uid)throw Error('帳號或模式已變更');
        const d=snap.data()?.customerProtection||{}, prior=d.protections?.[item];
        let key,next,entry;
        if(action==='pass'){
          const container=context.normalizeContainerNo(f.get('container')), boxes=Number(f.get('boxes')),reason=String(f.get('reason')||'').trim();
          if(!prior||prior.expiresOn<=today)throw Error('該品號沒有生效中的保護');
          if(!container||!Number.isSafeInteger(boxes)||boxes<1||!reason)throw Error('請確認櫃號、箱數和放行理由');
          if(Object.values(d.passes||{}).some(p=>!p.usedAt&&p.code===item&&p.container===container&&p.confirmedOn===prior.confirmedOn))throw Error('此品號和櫃號已有未使用的放行');
          key='passes';entry=id;next={id,code:item,container,boxes,reason,store:prior.store,confirmedOn:prior.confirmedOn,issuedBy:uid};
        }else{
          if(action==='renew'&&!prior)throw Error('找不到原保護，請先登記');
          if(action==='register'&&prior?.expiresOn>today)throw Error('品號已有生效中的保護，請用登記續訂');
          key='protections';entry=item;next=registerProtection(prior,{store:action==='renew'?prior.store:f.get('store'),confirmedOn:f.get('date')},today);
        }
        tx.set(context.PROD_DOC_REF,{customerProtection:{[key]:{[entry]:next}}},{mergeFields:[new context.FieldPath('customerProtection',key,entry)]});
      });
      status.textContent='已儲存';await refresh();
    }catch(err){status.textContent=err.message;}
    finally{busy=false;form.querySelector('[type=submit]').disabled=false;}
  };
}
