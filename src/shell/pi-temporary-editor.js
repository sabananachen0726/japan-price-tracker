import {validateTemporaryProduct} from '../shared/product-identity.js';
export function editTemporaryProduct({barcode,value={},save}) {
  const dialog=document.createElement('dialog');dialog.className='pi-temporary-dialog';
  dialog.style.cssText='max-width:560px;width:90%;max-height:85vh;overflow:auto;padding:24px;border:1px solid #cbd5e1;border-radius:12px';
  const heading=document.createElement('h3');heading.textContent='暫填名稱／圖片';
  const code=document.createElement('p');code.textContent='條碼：'+barcode;
  const help=document.createElement('p');help.textContent='主檔唯一配對成功後，這裡的暫填資料會自動刪除，改用主檔；訂量與備註會保留。';help.style.color='#52627a';
  const field=(labelText,type,max,val)=>{const label=document.createElement('label');label.style.cssText='display:block;margin:16px 0';label.append(document.createTextNode(labelText));const input=document.createElement('input');input.type=type;input.maxLength=max;input.value=val;input.style.cssText='display:block;width:100%;padding:10px;margin-top:6px;border:1px solid #cbd5e1;border-radius:6px';label.append(input);return {label,input}};
  const name=field('商品名稱','text',200,value.name||''),image=field('圖片網址','url',2048,value.imgUrl||'');image.input.placeholder='https://…';
  const preview=document.createElement('img');preview.alt='暫填圖片預覽';preview.style.cssText='max-width:140px;max-height:140px;object-fit:contain;display:block';preview.hidden=true;
  const previewStatus=document.createElement('div');previewStatus.style.color='#65748b';
  const showPreview=()=>{preview.hidden=true;preview.removeAttribute('src');previewStatus.textContent='';try{const v=validateTemporaryProduct({imgUrl:image.input.value});if(v.imgUrl){preview.src=v.imgUrl;preview.hidden=false}}catch{}};
  preview.onerror=()=>{preview.hidden=true;previewStatus.textContent='圖片無法載入，請確認網址是否可以直接開啟圖片。'};
  image.input.addEventListener('change',showPreview);
  const error=document.createElement('div');error.setAttribute('role','alert');error.style.color='#b42318';
  const actions=document.createElement('div');actions.style.cssText='display:flex;justify-content:flex-end;gap:12px;margin-top:20px';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';cancel.className='btn btn-outline-secondary';
  const submit=document.createElement('button');submit.type='button';submit.textContent='儲存暫填資料';submit.className='btn btn-primary';
  let saving=false;
  const close=()=>{if(!saving){dialog.close();dialog.remove()}};cancel.onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close()});
  submit.onclick=async()=>{error.textContent='';let next;try{next=validateTemporaryProduct({name:name.input.value,imgUrl:image.input.value})}catch(e){error.textContent=e.message;return}
    saving=true;submit.disabled=cancel.disabled=true;submit.textContent='儲存中…';
    try{const ok=await save(next);if(!ok)throw Error('儲存失敗，輸入已保留，請重試');saving=false;close()}
    catch(e){error.textContent=e.message||'儲存失敗，請重試'}finally{saving=false;submit.disabled=cancel.disabled=false;submit.textContent='儲存暫填資料'};
  };
  actions.append(cancel,submit);dialog.append(heading,code,help,name.label,image.label,preview,previewStatus,error,actions);document.body.append(dialog);dialog.showModal();showPreview();name.input.focus();
}
