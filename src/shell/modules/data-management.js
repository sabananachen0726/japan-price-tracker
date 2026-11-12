import {storageDocFor} from '../../shared/app-storage.js';
import {buildDeletionPlan,commitDeletionPlan,applyDeletionPlan,deletionContainers,containerKey} from '../../shared/data-deletion.js';
export const definition={id:'data-management',owns:['openDataManager','renderDataManager','requestDataDeletion'].map(name=>({name,kind:'function'})),imports:['QUOTES_REF','PI_REF','storageState','isAdmin','auth','currentDataMode','chooseImportView','containerTrackerData','sharedOrderDrafts','customerRows','customerStatus','PROD_DOC_REF','CONTAINER_TRACKER_REF','ORDER_PLANNER_REF','db','runTransaction','FieldPath','deleteField','saveFirebaseData','refreshUI','sendPlannerSnapshot','sendContainerSnapshot','sendSharedOrderDrafts','masterSelectedProducts','requestPlannerBackup412','storeTestPlanner412','TEST_LOCAL_KEY'],writes:['containerTrackerData','sharedOrderDrafts','openDataManager','renderDataManager','requestDataDeletion']};
let controller;
export function register(context){
 context.openDataManager=options=>controller?.open(options||{});
 context.renderDataManager=()=>controller?.render();
 context.requestDataDeletion=request=>controller?controller.review(request):Promise.resolve(false);
}
export function initialize(context){
 const section=document.getElementById('hub-manage'), status=document.getElementById('dataManagerStatus');let busy=false;
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const snapshot=()=>({main:window.appData,tracker:context.containerTrackerData,planner:{drafts:context.sharedOrderDrafts}});
 const render=()=>{
  if(!context.isAdmin()||busy)return;
  const old=document.getElementById('manageContainer').value,codes=deletionContainers(snapshot());document.getElementById('manageContainerOptions').innerHTML=codes.map(c=>`<option value="${escape(c)}"></option>`).join('');document.getElementById('manageContainer').value=old;
  const code=containerKey(old),s=snapshot();
  const counts={pi:Object.entries(s.main.finalPiContainers||{}).filter(([k,p])=>containerKey(p.container||k)===code).length,tracker:(s.tracker.containers||[]).filter(c=>containerKey(c.code)===code).length,quotes:(s.main.quotes||[]).filter(q=>containerKey(q.container)===code).length,proposal:Object.keys(s.planner.drafts||{}).filter(k=>containerKey(k)===code).length};
  for(const type of Object.keys(counts)){const input=section.querySelector(`[data-delete-type=${type}]`);input.disabled=!code||!counts[type]||context.currentDataMode==='test'&&['tracker','proposal'].includes(type);if(input.disabled)input.checked=false;section.querySelector(`[data-delete-count=${type}]`).textContent=counts[type];}
  document.getElementById('manageTestTools').hidden=context.currentDataMode!=='test';
  document.getElementById('manageMode').textContent=context.currentDataMode==='live'?'LIVE：刪除後所有同事共用結果。':'TEST：只清理本機資料；物流及共享工作單請在 LIVE 管理。';
 };
 const open=(options={})=>{if(!context.isAdmin())return;document.getElementById('systemTools412')?.close();bootstrap.Tab.getOrCreateInstance(document.getElementById('add-tab')).show();context.chooseImportView('manage');if(options.container)document.getElementById('manageContainer').value=options.container;section.querySelectorAll('[data-delete-type]').forEach(i=>i.checked=false);render();section.scrollIntoView({block:'start'});};
 const review=async request=>{
  if(busy||!context.isAdmin()||!context.auth.currentUser)return false;
  const mode=context.currentDataMode,uid=context.auth.currentUser.uid;
  if(mode==='test'&&(request.types||[]).some(t=>['tracker','proposal'].includes(t))){status.textContent='TEST 不刪除正式物流或共享工作單。';return false;}
  const plan=buildDeletionPlan(snapshot(),request);if(!plan.summary.length&&!request.clearTest){status.textContent='請先選擇要刪除的資料。';return false;}
  if(document.getElementById('dataDeletionDialog'))return false;
  return new Promise(resolve=>{
   const dialog=document.createElement('dialog');dialog.id='dataDeletionDialog';dialog.className='data-deletion-dialog';
   const customer=context.currentDataMode==='live'?context.customerRows:null;
   const selectedCodes=new Set((request.products||[]).map(k=>containerKey(window.appData.products?.[k]?.itemCode)));
   const related=(customer||[]).filter(o=>selectedCodes.size?selectedCodes.has(containerKey(o.code)):!!plan.code&&containerKey(o.container)===plan.code);
   dialog.innerHTML=`<h3>確認刪除資料</h3><p class="fw-bold">${escape(mode.toUpperCase())} · ${escape(plan.code||'選取資料')}</p><ul>${plan.summary.map(s=>`<li>${escape(s)}</li>`).join('')}${request.clearTest?'<li>本機 TEST 商品、條碼綁定、報價、PI、訂貨設定、庫存、銷售與工作單。</li>':''}</ul><div class="alert alert-warning">${plan.warnings.map(escape).join('<br>')}<br>客訂不會被刪除或搬移。${Array.isArray(customer)?`目前已取得 ${related.length} 筆相關客訂（以最後同步資料為準）。`:'客訂尚未取得，無法完整檢查關聯。'}${related.length?'<details><summary>查看相關客訂</summary>'+related.map(o=>escape(`${o.customer||'店名未填'} · ${o.code} · ${o.qty??'待確認'} ${o.unit||''}`)).join('<br>')+'</details>':''}</div><p>只刪選取內容，無法直接復原。請先確認已保存所需檔案。</p><p id="dataDeletionStatus" role="status" aria-live="polite"></p><div class="deletion-actions"><button type="button" class="btn btn-outline-secondary" data-delete-cancel>取消</button><button type="button" class="btn btn-danger" id="confirmDataDeletion">確認刪除</button></div>`;
   const feedback=dialog.querySelector('#dataDeletionStatus'),apply=dialog.querySelector('#confirmDataDeletion'),cancel=dialog.querySelector('[data-delete-cancel]');
   const finish=result=>{dialog.close();dialog.remove();resolve(result);};cancel.onclick=()=>finish(false);dialog.addEventListener('cancel',e=>{e.preventDefault();if(!busy)finish(false);});
   apply.onclick=async()=>{
    if(busy)return;if(!context.isAdmin()||mode!==context.currentDataMode||uid!==context.auth.currentUser?.uid){feedback.textContent='帳號或模式已變更，請取消並重新預覽。';return;}
    busy=true;apply.disabled=cancel.disabled=true;feedback.textContent='正在核對版本並刪除…';
    try{
     if(request.clearTest){
      if(mode!=='test')throw Error('LIVE 不提供清空');
      const backup=await context.requestPlannerBackup412();if(mode!==context.currentDataMode||uid!==context.auth.currentUser?.uid)throw Error('帳號或模式已變更');
      const before=structuredClone(window.appData);
      try{window.appData={suppliers:[],mappings:{},products:{},itemToBarcode:{},quotes:[],masterImportBatches:[],finalPiContainers:{}};
       if(!await context.saveFirebaseData())throw Error('TEST 儲存失敗，請重試');
       if(mode!==context.currentDataMode||uid!==context.auth.currentUser?.uid)throw Error('帳號或模式已變更');
       context.storeTestPlanner412({catalog:{},inventory:{},sources:{},orders:{drafts:{}}});const verify=await context.requestPlannerBackup412();
       if(Object.keys(verify.orders?.drafts||{}).length||Object.keys(verify.catalog?.items||{}).length||Object.keys(verify.inventory?.rows||{}).length||verify.sources?.salesV1)throw Error('TEST 尚未完成清空');
      }catch(err){localStorage.setItem(context.TEST_LOCAL_KEY,JSON.stringify(before));if(mode===context.currentDataMode&&uid===context.auth.currentUser?.uid){window.appData=before;context.storeTestPlanner412(backup);}throw err;}
     }else if(plan.operations.length){
      if(mode==='live'){
       const split=context.storageState.split,stored={...plan,operations:plan.operations.map(op=>({...op,doc:storageDocFor(op.doc,op.path,split)}))};
       await commitDeletionPlan({plan:stored,refs:{main:context.PROD_DOC_REF,quotes:context.QUOTES_REF,pis:context.PI_REF,tracker:context.CONTAINER_TRACKER_REF,planner:context.ORDER_PLANNER_REF},db:context.db,runTransaction:context.runTransaction,FieldPath:context.FieldPath,deleteField:context.deleteField});
      }else{
       const next=applyDeletionPlan(snapshot(),plan);window.appData=next.main;if(!await context.saveFirebaseData())throw Error('TEST 本機儲存失敗');
      }
     }
     if(mode!==context.currentDataMode||uid!==context.auth.currentUser?.uid){finish(true);return;}
     if(mode==='live'&&mode===context.currentDataMode&&uid===context.auth.currentUser?.uid){try{const next=applyDeletionPlan(snapshot(),plan);window.appData=next.main;context.containerTrackerData=next.tracker;context.sharedOrderDrafts=next.planner.drafts||{};}catch{/* A listener may already have applied the server result. */}}
     context.masterSelectedProducts.clear();context.refreshUI();context.sendPlannerSnapshot();context.sendContainerSnapshot();context.sendSharedOrderDrafts();
     for(const op of plan.operations.filter(o=>o.doc==='planner'&&o.path[0]==='drafts'))document.getElementById('plannerFrame')?.contentWindow?.postMessage({type:'KAISI_ORDER_DELETE_RESULT',code:op.path[1],ok:true},'*');
     status.textContent='✓ 已完成選取資料的刪除；其他資料保留。';busy=false;render();finish(true);
    }catch(err){feedback.textContent='未完成刪除：'+(err.code?'['+err.code+'] ':'')+err.message;apply.disabled=cancel.disabled=false;apply.textContent='重試刪除';}
    finally{busy=false;}
   };document.body.append(dialog);dialog.showModal();
  });
 };
 controller={open,render,review};
 document.getElementById('manageContainer').addEventListener('input',()=>{section.querySelectorAll('[data-delete-type]').forEach(i=>i.checked=false);render();});
 document.getElementById('previewContainerDeletion').onclick=()=>review({container:document.getElementById('manageContainer').value,types:[...section.querySelectorAll('[data-delete-type]:checked')].map(i=>i.dataset.deleteType)});
 document.getElementById('manageProducts').onclick=()=>{document.getElementById('settings-tab').click();};
 document.getElementById('manageQuotes').onclick=()=>{const select=document.getElementById('selectContainerToDelete'),code=containerKey(document.getElementById('manageContainer').value),option=[...select.options].find(o=>containerKey(o.value)===code);if(option&&code){select.value=option.value;document.getElementById('btnManageContainer').click();}document.getElementById('manageQuoteTools').open=true;document.getElementById('manageQuoteTools').scrollIntoView({block:'start'});};
 document.addEventListener('DOMContentLoaded',()=>{const card=document.getElementById('containerManagerBody').closest('.card');document.getElementById('manageQuoteTools').append(card);document.getElementById('manageTestTools').append(document.getElementById('btnLoadDemo'));});
 document.getElementById('clearTestData').onclick=()=>review({clearTest:true});
 document.addEventListener('click',e=>{const button=e.target.closest('[data-manage-container]');if(button)open({container:button.dataset.manageContainer});});
}
