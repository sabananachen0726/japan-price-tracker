import {brisbaneDate} from '../../shared/customer-protection.js';
import {productIndicators} from '../domain/product-indicators.js';
import {splitContainerCustomerOrders} from '../../shared/customer-demand.js';
// planner: planning-view. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "planning-view",
  "owns": [{
    "name": "projectedCell",
    "kind": "function"
  }, {
    "name": "renderPlan",
    "kind": "function"
  }, {
    "name": "updateDraftTotal",
    "kind": "function"
  }],
  "imports": ["customerSourceReady", "salesSummary", "trackerFeed", "refreshQuantityComparison", "refreshOrderSync", "currentPiQuantities", "$", "calc", "closeColumnFilter", "closePhotoPreview", "closePiTip", "dayDiff", "draft", "esc", "fmt", "factorInfo", "getItems", "monthlyCell", "passesColumnFilters", "photo", "plannerRole", "renderSalesHeads", "renderSortMarks", "projectedCell", "salesMonthCells", "shelfLife", "sortRows", "state", "today", "updateTableHeader"],
  "writes": ["projectedCell", "renderPlan", "updateDraftTotal"]
};
export function register(context) {
  context.projectedCell = function projectedCell(item, c = context.calc(item)) {
    return c.projected === null ? '<span class="missing-data">資料不足，無法計算</span>' : '<strong>' + context.fmt(c.projected) + '</strong>' + (c.excess > 0 ? '<span class="over-limit">超過上限 ' + context.fmt(c.excess) + '</span>' : '');
  };
  context.renderPlan = function renderPlan(preserveInputs = false) {
    const reviewing = context.$('filter').value === 'written';
    context.$('reviewWritten').setAttribute('aria-pressed', String(reviewing));
    context.$('reviewWritten').textContent = reviewing ? '▴ 返回全部商品' : '▾ 只看已填寫';
    context.renderSalesHeads();
    context.closePiTip();
    context.closePhotoPreview();
    context.closeColumnFilter();
    let list = context.getItems(),
      q = context.$('search').value.trim().toLowerCase(),
      filter = context.$('filter').value,
      d = context.draft();
    const container = context.$('container').value.trim();
    const today = brisbaneDate();
    const customer = splitContainerCustomerOrders(context.state.orders, container, {protections: context.trackerFeed?.protections || {}, today});
    const customerStatus = context.state.meta.orders || '';
    const customerError = /失敗|錯誤|無法|權限不足|額度已用完/.test(customerStatus);
    const boxes = n => context.fmt(n) + ' 箱';
    const storeLines = (title, map) => map.size ? `<div class="cust-group"><b>${title}</b>${[...map].map(([store, n]) => `<div>${context.esc(store)} · ${boxes(n)}</div>`).join('')}</div>` : '';
    // Read-only by design: quantities come from the customer-order sheet, never typed here.
    const customerCell = (code, chosen) => {
      if (!container) return '—';
      if (customerError && !context.state.orders.length) return '讀取失敗';
      if (!context.customerSourceReady && !context.state.orders.length) return '待讀取';
      const row = customer.get(code);
      if (!row) return customerError ? '讀取失敗' : '—';
      const head = [
        row.final.boxes ? `<span class="cust-final">Final ＋${boxes(row.final.boxes)}</span>` : '',
        row.allocated.boxes ? `<span class="cust-alloc">已分配 ${boxes(row.allocated.boxes)}</span>` : '',
        !row.final.boxes && !row.allocated.boxes && row.processing.count ? `<span class="cust-proc">處理中 ${row.processing.count} 筆</span>` : '',
        !row.final.boxes && !row.allocated.boxes && !row.processing.count ? '<span class="cust-proc">數量待確認</span>' : ''
      ].join('');
      const nonBox = [...row.final.nonBox.map(x => ({...x, kind: 'Final'})), ...row.allocated.nonBox.map(x => ({...x, kind: '已分配'})), ...row.blocked.nonBox.map(x => ({...x, kind: '保護中'}))];
      const warn = [
        row.allocated.boxes ? `<div class="cust-warn" data-alloc-warn="${context.esc(code)}" data-alloc="${row.allocated.boxes}"${row.allocated.boxes > chosen ? '' : ' hidden'}>已分配 ${boxes(row.allocated.boxes)}，超過本櫃訂量</div>` : '',
        row.blocked.boxes || row.blocked.nonBox.length ? `<div class="cust-warn">客找保護中：其他店家 Final ${row.blocked.boxes ? boxes(row.blocked.boxes) : ''}未計入</div>` : ''
      ].join('');
      return `<div class="cust-head">${head}</div>${warn}<details><summary>明細</summary>${customerError ? '<small>上次資料 · 更新失敗</small>' : ''}<div class="customer-stores">${storeLines('Final（加在本櫃訂量上）', row.final.stores)}${storeLines('已分配貨櫃（含在本櫃訂量內）', row.allocated.stores)}${storeLines('客找保護中，未計入', row.blocked.stores)}${nonBox.length ? `<div class="cust-group"><b>非箱單位，未加入合計</b>${nonBox.map(x => `<div>${x.kind} · ${context.esc(x.store)} · ${context.fmt(x.qty)} ${context.esc(x.unit)}</div>`).join('')}</div>` : ''}${row.processing.count ? `<div class="cust-group"><b>另有 ${row.processing.count} 筆處理中，未計入</b><div>${[...row.processing.stores].map(context.esc).join('、')}</div></div>` : ''}${row.unknown ? `<div>另有 ${row.unknown} 筆數量待確認</div>` : ''}</div></details>`;
    };
    let filtered = [];
    for (const i of list) {
      const c = context.calc(i),
        chosen = +d.rows?.[i.code] || 0;
      if (q && !`${i.code} ${i.name} ${i.barcode}`.toLowerCase().includes(q)) continue;
      if (filter === 'written' && !chosen && !String(d.itemNotes?.[i.code] || '').trim()) continue;
      if (filter === 'need' && !(c.suggest > 0) || filter === 'chosen' && !chosen || filter === 'issues' && !c.issues.length || filter === 'orders' && !c.ord.count) continue;
      const flags = productIndicators(i, context.salesSummary?.details, context.trackerFeed?.pis);
      const entry = context.trackerFeed?.protections?.[i.code];
      const protection = entry?.expiresOn > today ? entry : null;
      if (filter === 'flags' && !flags.clearance && !(flags.weeks >= 4) && !protection) continue;
      const row = {
        flags, protection,
        i,
        c,
        chosen
      };
      if (!context.passesColumnFilters(row)) continue;
      filtered.push(row);
    }
    context.sortRows(filtered);
    context.renderSortMarks();
    context.updateTableHeader();
    const rowsHtml = filtered.map(({
      i,
      c,
      chosen, flags, protection
    }) => `<tr class="${[flags.clearance ? 'row-clearance' : '', flags.weeks >= 4 ? 'row-stale' : '', protection ? 'row-protect' : ''].filter(Boolean).join(' ')}">
 <td class="name"><div class="product-flex"><div class="photo-wrap" ${context.photo(i) ? `role="button" tabindex="0" data-zoom="${context.esc(i.code)}" title="移入預覽大圖，點擊開啟縮放"` : ''}>${context.photo(i) ? `<img src="${context.esc(context.photo(i))}" loading="lazy" alt="${context.esc(i.name)}" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>無圖</span>` : '<span>無圖</span>'}</div><div><div class="code">${context.esc(i.code.startsWith('__JAN_') ? i.barcode : i.code)} <span class="tag">${i.kind === 'dry' ? '乾' : i.kind === 'frozen' ? '凍' : '待分類'}</span></div><button class="product-title product-info-trigger" type="button" aria-expanded="false" data-product-info="${context.esc(i.code)}" aria-label="${context.esc(i.name)}：查看銷售明細">${context.esc(i.name)}</button>${protection || flags.clearance || flags.weeks >= 4 ? `<div class="product-indicators">${protection ? `<span class="flag-protect">客找保護 · ${context.esc(protection.expiresOn.split("-").reverse().join("/"))} 可訂</span>` : ""}${flags.clearance ? `<span class="flag-clearance" title="上一批貨有 ${Math.round(flags.clearanceShare * 100)}% 以低於售價 7 折賣出">上批出清 <b>${Math.round(flags.clearanceShare * 100)}%</b></span>` : ''}${flags.weeks >= 4 ? `<span class="flag-stale" title="有庫存但已 ${flags.weeks} 週沒有對外出貨">滯銷 <b>${flags.weeks}</b> 週</span>` : ''}</div>` : ''}${i.pending ? `<div class="mini">${i.ambiguous ? '條碼有多個品號，請確認配對' : (i.temporary ? '暫填資料 · 等待主檔' : '新品／待補主檔')}</div>` : ''}${i.pending && context.plannerRole === 'admin' ? `<button type="button" data-temp-pi="${context.esc(i.barcode)}">暫填名稱／圖片</button>` : ''}${i.ambiguous && context.plannerRole === 'admin' ? `<button type="button" data-match-pi="${context.esc(i.barcode)}">選擇對應商品</button>` : ''}${i.availability !== 'active' ? '<span class="tag">Inactive · 本櫃 PI 保留</span>' : ''}${context.plannerRole !== 'viewer' && i.availability === 'active' && !i.pending ? `<button type="button" class="inactive-action" data-inactive="${context.esc(i.code)}" title="在所有訂貨工作單中隱藏此商品；可在資料管理恢復">設為 Inactive</button>` : ''}</div></div></td>
 <td>${i.stock == null ? '<span class="cell-missing">未取得</span>' : `<strong>${context.fmt(i.stock)}</strong>`}</td>
 <td class="purchase-unit"><div class="unit-value">${context.esc(context.factorInfo(i).raw || '未匯入')}</div><div class="unit-note">${context.plannerRole === 'viewer' ? d.itemNotes?.[i.code] ? `<div class="item-note-readonly">備註：${context.esc(d.itemNotes[i.code])}</div>` : '' : `<input class="item-note-inline" type="text" data-item-note="${context.esc(i.code)}" maxlength="250" value="${context.esc(d.itemNotes?.[i.code] || '')}" aria-label="${context.esc(i.code)} 本櫃備註" placeholder="單品備註" autocomplete="off" title="留缺貨、採購重點等備註給 Admin">`}</div></td>
 <td><strong>${context.fmt(c.stock)}</strong></td>
 <td class="sellable-months">${c.sellableMonths === null ? '—' : c.sellableMonths.toFixed(1) + ' 月'}</td>
 <td>${context.monthlyCell(i)}</td>
 <td>${c.available !== null && (c.pi.sum !== 0 || c.ord.total !== 0) ? `<button type="button" class="pi-link" data-pi="${context.esc(i.code)}" aria-label="滑鼠移入或聚焦查看在途 PI 和客訂明細" aria-describedby="piHoverTip" title="">${context.fmt(c.available)} 箱</button>` : c.available === null ? '<span class="cell-missing">待更新</span>' : '—'}</td>
 <td><input class="shelf-field" type="number" min="1" max="120" step="1" data-shelf="${context.esc(i.code)}" value="${context.shelfLife(i) ?? ''}" placeholder="未設" aria-label="${context.esc(i.code)} 固定保存期限（月）" ${context.plannerRole === 'viewer' || context.shelfLife(i) !== null ? 'disabled' : ''}></td>
 ${context.salesMonthCells(i)}
 <td><input class="maxStock-field" type="number" min="0" step="1" data-max-stock="${context.esc(i.code)}" value="${c.maxStock ?? ''}" placeholder="未設" aria-label="${context.esc(i.code)} 最高庫存" ${context.plannerRole === 'viewer' ? 'disabled' : ''}></td>
 <td>${c.suggest === null ? '<span class="missing-data" title="資料不足，無法計算建議量">資料不足</span>' : `<strong>${context.fmt(c.suggest)}</strong>`}${c.issues.length ? `<div><button class="mini explain-btn" data-explain="${context.esc(i.code)}" title="查看計算原因">說明</button></div>` : ''}</td>
 <td class="planner-customer">${customerCell(i.code, chosen)}</td>
 <td><div class="qty-picker"><input type="number" min="0" step="1" ${protection && context.plannerRole !== "admin" ? `max="${chosen}"` : ""} value="${chosen}" ${!i.piItem && (i.code.startsWith('__') || i.kind === 'unknown') || protection && context.plannerRole !== 'admin' && !chosen ? 'disabled' : ''} data-qty="${context.esc(i.code)}" aria-label="${context.esc(i.code)} 訂貨量"><button data-use="${context.esc(i.code)}" type="button" title="填入建議箱數" ${c.suggest == null || protection ? 'disabled' : ''}>採用</button></div><small class="qty-comparison" data-qty-comparison="${context.esc(i.code)}" hidden></small>${customer.get(i.code)?.final.boxes ? `<small class="qty-total" data-qty-total="${context.esc(i.code)}" data-final="${customer.get(i.code).final.boxes}">合計提交 ${context.fmt(chosen + customer.get(i.code).final.boxes)} 箱<br><span>本櫃 ${context.fmt(chosen)}＋Final ${context.fmt(customer.get(i.code).final.boxes)}</span></small>` : ''}</td>
 <td class="projected-stock" data-projected="${context.esc(i.code)}">${context.projectedCell(i, c)}</td></tr>`).join('') || '<tr><td colspan="19" class="empty">沒有符合的商品</td></tr>';
    const body = context.$('productRows');
    if (preserveInputs) {
      // Blur from the code field may be focusing an existing quantity input.
      // Keep those input nodes alive while recalculating PI and suggestions.
      const next = document.createElement('tbody');
      next.innerHTML = rowsHtml;
      for (const attribute of ['data-qty', 'data-item-note', 'data-shelf', 'data-max-stock']) {
        const existing = new Map([...body.querySelectorAll('[' + attribute + ']')].map(el => [el.getAttribute(attribute), el]));
        for (const fresh of next.querySelectorAll('[' + attribute + ']')) {
          const old = existing.get(fresh.getAttribute(attribute));
          if (old) {
            old.value = fresh.value;
            old.disabled = fresh.disabled;
            fresh.replaceWith(old);
          }
        }
      }
      body.replaceChildren(...next.childNodes);
    } else body.innerHTML = rowsHtml;
    context.$('shown').textContent = `顯示 ${filtered.length} / ${list.length} 筆`;
    const allChosen = Object.values(d.rows || {}).filter(x => Number(x) > 0);
    context.$('draftTotal').textContent = `目前 ${allChosen.length} 款 · ${allChosen.reduce((n, x) => n + Number(x), 0).toLocaleString()} 箱`;
    const arrive = context.$('arrival').value || '未設定';
    context.$('timeline').textContent = `預計到倉 ${arrive} · 從今天起約 ${context.fmt(context.dayDiff(context.today(), arrive) / 30.44)} 個月需求 · 到倉後再備 ${context.$('coverage').value || 0} 個月 · 最高庫存以銷售單位計算，超過時會提醒。`;
    const source = context.$('piQuantitySource');
    source.hidden = !Object.keys(context.currentPiQuantities()).length;
    source.textContent = '本櫃 PI 商品完整保留（含新品、Inactive 與未分類）；已填數量優先。搜尋與篩選仍可縮小顯示範圍。按提交才會共用。';
    context.updateTableHeader();
    context.refreshOrderSync();
  };
  context.updateDraftTotal = function updateDraftTotal(changedCode) {
    context.refreshQuantityComparison(changedCode);
    const values = Object.values(context.draft().rows || {}).filter(x => Number(x) > 0);
    context.$('draftTotal').textContent = `目前 ${values.length} 款 · ${values.reduce((sum, x) => sum + Number(x), 0).toLocaleString()} 箱`;
    const items = new Map(context.state.items.map(i => [i.code, i]));
    context.$('productRows').querySelectorAll('[data-projected]').forEach(el => {
      if (changedCode && el.dataset.projected !== changedCode) return;
      const item = items.get(el.dataset.projected);
      if (item) el.innerHTML = context.projectedCell(item);
    });
  };
}
export function initialize(context) {}
