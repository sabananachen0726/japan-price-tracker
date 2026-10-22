import {customerBoxes, normalizeCode, summarizeDemand} from '../shared/customer-demand.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
const fmt = value => Number(value).toLocaleString('zh-TW', {maximumFractionDigits: 2});
export function renderCustomerDemand({rows, codes, incoming, fetchedAt, status, containers = []}) {
  const demand = summarizeDemand(rows, codes);
  const ready = Array.isArray(rows);
  const available = ready && !demand.unknown ? incoming - demand.total : null;
  const time = fetchedAt ? new Date(fetchedAt).toLocaleString('zh-TW', {timeZone:'Australia/Brisbane'}) : '尚未成功更新';
  const table = list => `<div class="table-responsive"><table class="table table-sm customer-demand-table"><colgroup><col style="width:100px"><col style="width:18%"><col style="width:115px"><col style="width:100px"><col style="width:150px"><col></colgroup><thead><tr><th>品號</th><th>客戶</th><th>數量</th><th>狀態</th><th>指定貨櫃</th><th>備註</th></tr></thead><tbody>${list.map(order => `<tr><td>${esc(order.code)}</td><td>${esc(order.customer || '未填')}</td><td>${order.qty == null ? '數量待確認' : esc(order.qty)} ${esc(order.unit)}${customerBoxes(order) === null ? '<div class="text-danger small">單位待確認</div>' : ''}</td><td>${esc(order.status || '處理中')}</td><td>${esc(order.container || '未指定')}</td><td>${esc(order.note || '—')}</td></tr>`).join('')}</tbody></table></div>`;
  const assigned = new Map();
  const unassigned = [];
  for (const order of demand.rows) {
    const key = normalizeCode(order.container).replace(/\s/g, '');
    if (!key) unassigned.push(order);
    else {if (!assigned.has(key)) assigned.set(key, []); assigned.get(key).push(order);}
  }
  const known = new Set(containers.map(value => normalizeCode(value).replace(/\s/g, '')));
  return `<section class="customer-demand-panel border rounded p-3 mb-3" aria-label="未履行客訂"><div class="d-flex flex-wrap gap-3 fw-bold"><span>未履行客訂：${ready ? fmt(demand.total) + ' 箱' + (demand.unknown ? `（另 ${demand.unknown} 筆待確認）` : '') : '尚未取得'}</span><span>在途可用箱數：${available === null ? '資料不足，無法計算' : fmt(available) + ' 箱'}</span></div><div class="small text-muted mt-2">最後成功更新：${esc(time)}（Brisbane） · ${esc(status || '尚未連線客訂')}</div>${ready ? `<div class="small mt-1">在途可用箱數＝未到貨箱數 − 未履行客訂；負數表示不足。${demand.unknown ? '有單位或數量待確認，暫不計算可用量。' : ''}</div><details class="mt-2"><summary>查看未履行客訂明細（${demand.rows.length} 筆）</summary>${[...assigned].map(([key, list]) => `<h6 class="mt-3">指定貨櫃 ${esc(key)}${known.has(key) ? '' : '（不在本次未到貨結果）'}</h6>${table(list)}`).join('')}<h6 class="mt-3">未指定貨櫃（${unassigned.length} 筆）</h6>${unassigned.length ? table(unassigned) : '<p class="text-muted">沒有未指定貨櫃的客訂。</p>'}<p class="small text-muted">每筆客訂只扣一次；未指定貨櫃不自動分配。</p></details>` : '<div class="mt-2 text-warning-emphasis">請先在訂貨規劃連線客訂；未取得資料不視為零。</div>'}</section>`;
}
