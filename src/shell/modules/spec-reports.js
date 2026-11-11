const CATEGORIES=new Set(['每箱入數不對','單位不對','克數／容量不對','廠商換包裝','品名與規格對不上','其他']);
const TEST_KEY='jpt.test.spec-reports.v1';
export const definition={
  id:'spec-reports',owns:[],
  imports:['auth','canPlan','currentDataMode','isAdmin','db','ORDER_PLANNER_REF','runTransaction','getDoc','events','showAppToast'],
  writes:[]
};
export function register(){}
export function initialize(context){
  const list=document.getElementById('specReportList'), status=document.getElementById('specReportStatus');
  let loadToken=0, working=false;
  const session=()=>[context.currentDataMode,context.auth.currentUser?.uid||''].join('|');
  const local=()=>JSON.parse(localStorage.getItem(TEST_KEY)||'{}');
  function change(next, access){
    const initial=session(), ref=context.ORDER_PLANNER_REF;
    if(!access())throw Error('目前帳號沒有操作權限');
    if(context.currentDataMode==='test'){
      const reports=local();
      next(reports);
      localStorage.setItem(TEST_KEY,JSON.stringify(reports));
      return Promise.resolve();
    }
    return context.runTransaction(context.db, async transaction=>{
      const snap=await transaction.get(ref);
      if(initial!==session()||!access())throw Error('帳號或模式已變更');
      const reports={...snap.data()?.specReports};
      next(reports);
      transaction.set(ref,{specReports:reports},{mergeFields:['specReports']});
    });
  }
  async function load(){
    const token=++loadToken, initial=session();
    list.replaceChildren();
    if(!context.isAdmin()){status.textContent='';return;}
    status.textContent='讀取規格回報中…';
    try{
      const data=context.currentDataMode==='test'?local():(await context.getDoc(context.ORDER_PLANNER_REF)).data()?.specReports||{};
      if(token!==loadToken||initial!==session()||!context.isAdmin())return;
      const pending=Object.entries(data).filter(([,r])=>!r.reviewedAt).sort((a,b)=>b[1].at.localeCompare(a[1].at));
      status.textContent=pending.length?`待處理 ${pending.length} 筆`:'目前沒有待處理的規格回報。';
      for(const [id,r] of pending){
        const row=document.createElement('li'), title=document.createElement('strong'), body=document.createElement('div'), mark=document.createElement('button');
        row.className='list-group-item';
        title.textContent=`${r.code} · ${r.name} · ${r.category}`;
        body.className='small my-2';
        body.style.whiteSpace='pre-wrap';
        const date=new Date(r.at);
        const when=Number.isNaN(+date)?'':date.toLocaleString('zh-TW',{timeZone:'Australia/Brisbane'});
        body.textContent=`回報時採購單位：${r.unit||'未提供'}\n${r.note}\n${r.by} · ${when}`;
        mark.type='button';mark.className='btn btn-outline-success btn-sm';
        mark.dataset.specReviewed=id;mark.textContent='標記已處理';
        row.append(title,body,mark);list.append(row);
      }
    }catch(error){
      if(token===loadToken&&initial===session())status.textContent='讀取失敗：'+error.message;
    }
  }
  document.getElementById('refreshSpecReports').addEventListener('click',load);
  document.addEventListener('click',e=>{if(e.target.closest('[data-import-view=issues]'))void load();});
  new MutationObserver(()=>{
    if(document.body.dataset.importView==='issues')void load();
    else {++loadToken;list.replaceChildren();status.textContent='';}
  }).observe(document.body,{attributes:true,attributeFilter:['data-import-view']});
  list.addEventListener('click',async e=>{
    const button=e.target.closest('[data-spec-reviewed]');
    if(!button||working||!context.isAdmin())return;
    working=true;button.disabled=true;
    try{
      await change(reports=>{
        const r=reports[button.dataset.specReviewed];
        if(r&&!r.reviewedAt)reports[button.dataset.specReviewed]={...r,reviewedAt:new Date().toISOString(),reviewedBy:context.auth.currentUser.uid};
      },context.isAdmin);
      await load();
    }catch(error){status.textContent='儲存失敗：'+error.message;button.disabled=false;}
    finally{working=false;}
  });
  context.events.onMessage(async e=>{
    const frame=document.getElementById('plannerFrame')?.contentWindow;
    if(!frame||e.source!==frame||e.origin!==location.origin||e.data?.type!=='KAISI_SPEC_REPORT')return;
    const {id}=e.data, initial=session();
    const reply=(ok,message)=>{if(initial===session())frame.postMessage({type:'KAISI_SPEC_REPORT_RESULT',id,ok,message},location.origin);};
    const clean=(x,n)=>typeof x==='string'?x.trim().slice(0,n):'';
    const code=clean(e.data.code,100).toUpperCase(), note=clean(e.data.note,500), category=e.data.category;
    const product=Object.values(window.appData.products||{}).find(p=>String(p.itemCode||'').trim().toUpperCase()===code);
    if(!context.auth.currentUser||!context.canPlan()||!product||!note||!CATEGORIES.has(category)||!/^[-a-f0-9]{36}$/.test(id||'')){
      reply(false,'回報資料不完整、商品不在主檔，或沒有送出權限。');return;
    }
    try{
      const r={code,name:clean(product.name,200),note,category,unit:clean(e.data.unit,100),
        at:new Date().toISOString(),by:clean(context.auth.currentUser.displayName||context.auth.currentUser.email,120)};
      await change(reports=>{
        if(Object.hasOwn(reports,id))return;
        if(Object.values(reports).filter(x=>!x.reviewedAt).length>=200)throw Error('待處理回報已滿，請由 Admin 先處理舊回報');
        const reviewed=Object.entries(reports).filter(([,x])=>x.reviewedAt).sort((a,b)=>b[1].reviewedAt.localeCompare(a[1].reviewedAt));
        for(const [key] of reviewed.slice(100))delete reports[key];
        reports[id]=r;
      },()=>!!context.auth.currentUser&&context.canPlan());
      reply(true,'已送出規格回報');
      if(initial===session())context.showAppToast('規格回報已送到待確認資料');
      if(document.body.dataset.importView==='issues')void load();
    }catch(error){reply(false,'送出失敗：'+error.message);}
  });
}
