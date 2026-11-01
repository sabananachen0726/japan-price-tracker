import {customerBoxes, normalizeCode, summarizeDemand, allocatePiDemand} from '../shared/customer-demand.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
const fmt = value => Number(value).toLocaleString('zh-TW', {maximumFractionDigits: 2});
export function renderStoreOrders(list) {
  const stores = new Map();
  for (const order of list) {const name = String(order.customer || '').trim() || '店名未填'; if (!stores.has(name)) stores.set(name, []); stores.get(name).push(order);}
  return `<details class="pi-store-orders mt-2" open><summary>店名與客訂箱數（${stores.size} 家／${list.length} 筆）</summary><table class="table table-sm"><thead><tr><th>客戶／店名</th><th class="text-end">客訂箱數</th><th>紀錄</th></tr></thead><tbody>${[...stores].map(([name, orders]) => {
    const qty = orders.reduce((n, o) => n + (customerBoxes(o) ?? 0), 0), unknown = orders.some(o => customerBoxes(o) === null);
    const details = orders.map(o => `${o.code} · ${o.qty ?? '數量待確認'} ${o.unit || '單位未填'} · ${o.status || '處理中'} · ${o.note || '無備註'}`).join('\n');
    return `<tr title="${esc(details)}"><td class="fw-bold">${esc(name)}</td><td class="text-end">${fmt(qty)} 箱${unknown ? '<div class="text-danger">另有數量／單位待確認</div>' : ''}</td><td><details><summary>${orders.length} 筆明細</summary><div class="pi-order-lines" style="white-space:pre-wrap">${esc(details)}</div></details></td></tr>`;
  }).join('')}</tbody></table></details>`;
}
export function renderPiContainerDemand({allocation, incoming, ready}) {
  if (!ready) return '<section class="pi-container-demand alert alert-warning mt-2">客訂尚未取得；已分配與剩餘可用量待確認，不視為零。</section>';
  const available = allocation.unknown ? null : incoming - allocation.total;
  return `<section class="pi-container-demand mt-2"><div class="d-flex flex-wrap gap-3 pi-allocation-summary"><span>PI 箱數：<b>${fmt(incoming)}</b></span><span>已分配客訂：<b>${fmt(allocation.total)}</b> 箱${allocation.unknown ? '（另有待確認）' : ''}</span><strong class="${available !== null && available < 0 ? 'text-danger' : 'text-success'}">剩餘可用：${available === null ? '資料不足，無法計算' : fmt(available) + ' 箱'}${available !== null && available < 0 ? ' · 超額分配 ' + fmt(-available) + ' 箱' : ''}</strong></div>${allocation.rows.length ? renderStoreOrders(allocation.rows) : '<p class="text-muted my-2">尚無已分配客訂。</p>'}</section>`;
}
export function renderPiAllocationOverview({rows, codes, incoming, containers, fetchedAt, status}) {
  const result = allocatePiDemand(rows, codes, containers);
  const assigned = [...result.assigned.values()], total = assigned.reduce((n, d) => n + d.total, 0), unknown = assigned.some(d => d.unknown);
  const available = result.ready && !unknown ? incoming - total : null;
  const time = fetchedAt ? new Date(fetchedAt).toLocaleString('zh-TW', {timeZone: 'Australia/Brisbane'}) : '尚未成功更新';
  return {allocation: result, html: `<section class="customer-demand-panel border rounded p-3 mb-3" aria-label="未履行客訂"><div class="d-flex flex-wrap gap-3 fw-bold"><span>未到貨 PI：${fmt(incoming)} 箱</span><span>已分配至本次未到貨櫃：${result.ready ? fmt(total) + ' 箱' + (unknown ? '（另有待確認）' : '') : '尚未取得'}</span><span>各櫃剩餘合計：${available === null ? '資料不足，無法計算' : fmt(available) + ' 箱'}</span></div><div class="small text-muted mt-2">最後成功更新：${esc(time)}（Brisbane） · ${esc(status || '尚未連線客訂')}</div><p class="small text-muted">各櫃剩餘＝該櫃 PI 箱數－指定該櫃的未履行客訂。未指定貨櫃及其他貨櫃的客訂另列，不重複扣除。</p>${result.ready ? `<div class="pi-unassigned"><h6>未指定貨櫃（${result.unassigned.rows.length} 筆／${fmt(result.unassigned.total)} 箱${result.unassigned.unknown ? '，另有待確認' : ''}）</h6>${result.unassigned.rows.length ? renderStoreOrders(result.unassigned.rows) : '<p class="text-muted">沒有未指定貨櫃的客訂。</p>'}</div>${result.other.rows.length ? `<div class="pi-other-orders"><h6>其他／不在本次未到貨結果的貨櫃客訂（${result.other.rows.length} 筆）</h6>${renderStoreOrders(result.other.rows)}</div>` : ''}` : '<p class="text-warning-emphasis">請先在訂貨規劃連線客訂；未取得資料不視為零。</p>'}</section>`};
}
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
