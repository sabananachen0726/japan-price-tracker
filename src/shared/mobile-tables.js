// Shared presentation only: preserve the real table, inputs and event handlers.
export function installMobileTables() {
 const expanded=new Set();let queued=false;
 const scan=()=>{queued=false;for(const table of document.querySelectorAll('table')){
  const heads=[...table.querySelectorAll('thead tr:first-child th')].filter(th=>th.closest('table')===table);if(!heads.length)continue;
  table.classList.add('mobile-record-table');
  for(const row of table.querySelectorAll('tbody tr')){if(row.closest('table')!==table)continue;for(const [i,cell]of [...row.cells].entries()){
   const head=heads[i];if(!head||cell.colSpan>1)continue;const label=head.textContent.replace(/[↕▽↑↓]/g,'').replace(/\s+/g,' ').trim();if(cell.dataset.mobileLabel!==label)cell.dataset.mobileLabel=label;
   cell.dataset.mobileCol=head.dataset.column|| (head.classList.contains('sales-month')?'sales':'field-'+i);
  }
  if(table.classList.contains('product-table')){const key=row.querySelector('[data-qty]')?.dataset.qty;if(!key)continue;row.classList.toggle('mobile-expanded',expanded.has(key));if(!row.querySelector('[data-mobile-expand]')){const b=document.createElement('button');b.type='button';b.className='mobile-expand';b.dataset.mobileExpand=key;b.textContent=expanded.has(key)?'收合資料':'更多資料';b.setAttribute('aria-expanded',String(expanded.has(key)));row.cells[0].append(b);}}
 }
 }};
 const start=()=>{scan();new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(scan);}}).observe(document.body,{childList:true,subtree:true});const toggle=b=>{const key=b.dataset.mobileExpand;expanded.has(key)?expanded.delete(key):expanded.add(key);b.closest('tr').classList.toggle('mobile-expanded',expanded.has(key));b.setAttribute('aria-expanded',String(expanded.has(key)));b.textContent=expanded.has(key)?'收合資料':'更多資料';};document.addEventListener('pointerdown',e=>{const b=e.target.closest('[data-mobile-expand]');if(b){e.preventDefault();toggle(b);}},{capture:true});document.addEventListener('click',e=>{const b=e.target.closest('[data-mobile-expand]');if(b&&e.detail===0)toggle(b);});};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
}
