import {productIndicators} from '../domain/product-indicators.js';
// One reusable popover keeps the order table quiet and preserves its input nodes.
export const definition = {
  id:'product-info', owns:[],
  imports:['calc','esc','factorInfo','fmt','getItems','monthlyInfo','plannerRole','salesSummary','trackerFeed','events'],
  writes:[]
};
export function register(){}
export function initialize(context){
  const panel=document.createElement('section');
  panel.id='productInfoPanel';panel.className='product-info-panel';panel.hidden=true;
  panel.setAttribute('aria-label','商品銷售與訂貨資訊');
  document.body.append(panel);
  const dialog=document.createElement('dialog');
  dialog.className='product-info-panel spec-report-dialog';
  dialog.innerHTML=`<form><header><strong>規格回報</strong><button type="button" data-cancel>關閉</button></header>
    <p data-item></p><label>問題類型 <select name="category"><option>每箱入數不對</option><option>單位不對</option><option>克數／容量不對</option><option>廠商換包裝</option><option>品名與規格對不上</option><option>其他</option></select></label>
    <label>正確內容或說明<textarea name="note" rows="3" required maxlength="500" placeholder="例如：實際為 6 Unit／CTN"></textarea></label>
    <p role="status"></p><button type="submit">送出回報</button></form>`;
  document.body.append(dialog);
  let anchor, timer, pinned=false, reportItem, pendingId, replyTimer;
  const moneyFree=n=>n==null?'—':context.fmt(n);
  const esc=context.esc;
  function close(){
    clearTimeout(timer); anchor?.setAttribute('aria-expanded','false');
    anchor=null;pinned=false;panel.hidden=true;
  }
  function place(){
    if(!anchor?.isConnected)return close();
    const r=anchor.getBoundingClientRect(), frame=window.frameElement?.getBoundingClientRect();
    const top=Math.max(0,-(frame?.top||0)), bottom=Math.min(window.innerHeight,window.parent.innerHeight-(frame?.top||0));
    if(r.bottom<top||r.top>bottom)return close();
    const below=bottom-r.bottom-14, above=r.top-top-14;
    const upward=below<240&&above>below;
    panel.style.maxHeight=Math.max(75,Math.min(420,upward?above:below))+'px';
    const height=panel.offsetHeight;
    panel.style.left=Math.max(10,Math.min(r.left,window.innerWidth-panel.offsetWidth-10))+'px';
    panel.style.top=(upward?Math.max(top+8,r.top-height-6):r.bottom+6)+'px';
  }
  function show(button, keep=false){
    const item=context.getItems().find(i=>i.code===button.dataset.productInfo);
    if(!item)return;
    close();anchor=button;pinned=keep;anchor.setAttribute('aria-expanded','true');
    anchor.setAttribute('aria-controls',panel.id);
    const m=context.monthlyInfo(item), c=context.calc(item), s=context.salesSummary, details=s?.details;
    const notices=[];
    const flags=productIndicators(item,details,context.trackerFeed?.pis);
    const dmy=d=>d?d.split('-').reverse().join('/'):'';
    const b=flags.batch||{};
    if(b.basis==='none')
      notices.push(details?.cutoff?'上批出清：沒有實際到倉紀錄，無法判斷上一批。':'上批出清：尚未匯入銷售資料。');
    else if(flags.clearanceShare===null)
      notices.push(`上批出清：${dmy(b.start)}～${dmy(b.end)} 沒有對外銷售紀錄。`);
    else
      notices.push(`上批（${b.basis==='between'?`${dmy(b.start)} 到倉～${dmy(b.end)} 再到倉前`:`${dmy(b.end)} 到倉前 6 個月`}）低於售價 7 折賣出 ${moneyFree(b.clear)}／${moneyFree(b.gross)} 件，出清比例 ${context.fmt(flags.clearanceShare*100)}%${flags.clearance?'，達 30% 標示「上批出清」':'，未達 30%'}${b.estimated?'（較早月份按天數估算）':''}。`);
    if(flags.cutoff)
      notices.push(`最後對外出貨：${flags.last||'無紀錄'}；銷售資料截至 ${flags.cutoff}。`);
    if(flags.weeks>=4)
      notices.push(`有庫存，已 ${flags.weeks} 週無對外出貨（起算 ${flags.since}）。`);
    panel.innerHTML=`<header><strong>${esc(item.code)} · ${esc(item.name)}</strong><button type="button" data-info-close aria-label="關閉商品明細">×</button></header>
      <p>採用月銷：<strong>${moneyFree(m.value)}</strong> 箱／月 · ${esc(m.source)}</p>
      ${s?`<table><thead><tr><th>月份</th><th>實際淨銷量</th><th>出清</th><th>計入平均</th></tr></thead><tbody>${s.months.map((month,i)=>{
        const covered=s.coverage[i], factor=m.f, net=m.row?.net[i]||0, clearance=m.row?.clear?.[i]||0;
        return `<tr><td>${esc(month)}</td><td>${covered&&factor?moneyFree(net/factor):'—'}</td><td>${covered&&factor?moneyFree(clearance/factor):'—'}</td><td>${!covered?'無資料':m.row?.gross[i]>0?'是':'否'}</td></tr>`;
      }).join('')}</tbody></table>`:'<p>尚無每月銷售明細。</p>'}
      <p>尚可賣（含在途）：${c.sellableMonths===null?'—（月銷或庫存／在途資料不足）':`（庫存 ${moneyFree(c.stock)} 箱＋在途可用 ${moneyFree(c.available)} 箱）÷ ${moneyFree(c.monthly)} 箱／月＝<strong>${c.sellableMonths.toFixed(1)} 月</strong>`}</p>
      ${notices.map(n=>`<p class="info-note">${esc(n)}</p>`).join('')}
      ${context.plannerRole!=='viewer'&&!item.pending?`<button type="button" data-spec-open>規格回報</button>`:''}`;
    panel.hidden=false;place();
  }
  const rows=document.getElementById('productRows');
  const delayedClose=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!pinned&&!panel.matches(':hover')&&!panel.contains(document.activeElement)&&!anchor?.matches(':hover'))close();},180);};
  rows.addEventListener('pointerover',e=>{
    const b=e.target.closest('[data-product-info]');
    if(b&&e.pointerType==='mouse'&&!pinned&&anchor!==b)show(b);
  });
  rows.addEventListener('pointerout',e=>{if(e.target.closest('[data-product-info]')===anchor&&anchor)delayedClose();});
  rows.addEventListener('click',e=>{
    const b=e.target.closest('[data-product-info]');if(!b)return;
    if(pinned&&b===anchor){close();return;}show(b,true);
  });
  panel.addEventListener('pointerenter',()=>clearTimeout(timer));
  panel.addEventListener('pointerleave',delayedClose);
  panel.addEventListener('click',e=>{
    if(e.target.closest('[data-info-close]')){const a=anchor;close();a?.focus();return;}
    if(!e.target.closest('[data-spec-open]'))return;
    reportItem=context.getItems().find(i=>i.code===anchor?.dataset.productInfo);
    if(!reportItem)return;
    const unit=context.factorInfo(reportItem).raw||'未匯入';
    dialog.querySelector('[data-item]').textContent=`${reportItem.code} · ${reportItem.name} ｜採購單位：${unit}`;
    reportItem={code:reportItem.code,unit};
    dialog.querySelector('form').reset();dialog.querySelector('[role=status]').textContent='';
    close();dialog.showModal();
    const frame=window.frameElement?.getBoundingClientRect();
    const visibleTop=Math.max(0,-(frame?.top||0)), visibleBottom=Math.min(innerHeight,parent.innerHeight-(frame?.top||0));
    dialog.style.margin='0';dialog.style.inset='auto';dialog.style.left=Math.max(10,(innerWidth-dialog.offsetWidth)/2)+'px';
    dialog.style.maxHeight=Math.max(150,visibleBottom-visibleTop-24)+'px';
    dialog.style.top=Math.max(visibleTop+12,(visibleTop+visibleBottom-dialog.offsetHeight)/2)+'px';
  });
  document.addEventListener('pointerdown',e=>{if(anchor&&!anchor.contains(e.target)&&!panel.contains(e.target))close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){const a=anchor;close();a?.focus();}});
  window.addEventListener('resize',place);
  window.parent.addEventListener('scroll',()=>{if(anchor)place();},{passive:true});
  new MutationObserver(()=>{if(anchor&&!anchor.isConnected)close();}).observe(rows,{childList:true});
  const form=dialog.querySelector('form'), status=dialog.querySelector('[role=status]'), submit=form.querySelector('[type=submit]');
  dialog.querySelector('[data-cancel]').addEventListener('click',()=>{if(!pendingId)dialog.close();});
  dialog.addEventListener('cancel',e=>{if(pendingId)e.preventDefault();});
  const reply=(ok,message)=>{clearTimeout(replyTimer);pendingId=null;submit.disabled=false;status.textContent=message;if(ok){dialog.close();}};
  form.addEventListener('submit',e=>{
    e.preventDefault();if(pendingId||!reportItem)return;
    const f=new FormData(form), note=String(f.get('note')||'').trim();
    if(!note){status.textContent='請填寫正確內容或說明。';return;}
    pendingId=crypto.randomUUID();submit.disabled=true;status.textContent='送出中…';
    parent.postMessage({type:'KAISI_SPEC_REPORT',id:pendingId,...reportItem,note,category:f.get('category')},'*');
    replyTimer=setTimeout(()=>reply(false,'尚未收到儲存結果；請先確認待確認清單再重試。'),20000);
  });
  context.events.onMessage(e=>{
    if(e.source===parent&&e.data?.type==='KAISI_SPEC_REPORT_RESULT'&&pendingId&&e.data.id===pendingId)
      reply(e.data.ok,e.data.message||'');
  });
}
