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
  "imports": ["$", "calc", "closeColumnFilter", "closePhotoPreview", "closePiTip", "dayDiff", "draft", "esc", "fmt", "factorInfo", "getItems", "monthlyCell", "passesColumnFilters", "photo", "plannerRole", "renderSalesHeads", "renderSortMarks", "projectedCell", "salesMonthCells", "shelfLife", "sortRows", "state", "today", "updateTableHeader"],
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
    let filtered = [];
    for (const i of list) {
      const c = context.calc(i),
        chosen = +d.rows?.[i.code] || 0;
      if (q && !`${i.code} ${i.name} ${i.barcode}`.toLowerCase().includes(q)) continue;
      if (filter === 'written' && !chosen && !String(d.itemNotes?.[i.code] || '').trim()) continue;
      if (filter === 'need' && !(c.suggest > 0) || filter === 'chosen' && !chosen || filter === 'issues' && !c.issues.length || filter === 'orders' && !c.ord.count) continue;
      const row = {
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
      chosen
    }) => `<tr>
 <td class="name"><div class="product-flex"><div class="photo-wrap" ${context.photo(i) ? `role="button" tabindex="0" data-zoom="${context.esc(i.code)}" title="移入預覽大圖，點擊開啟縮放"` : ''}>${context.photo(i) ? `<img src="${context.esc(context.photo(i))}" loading="lazy" alt="${context.esc(i.name)}" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>無圖</span>` : '<span>無圖</span>'}</div><div><div class="code">${context.esc(i.code)} <span class="tag">${i.kind === 'dry' ? '乾' : i.kind === 'frozen' ? '凍' : '待分類'}</span></div><div>${context.esc(i.name)}</div>${context.plannerRole !== 'viewer' ? `<button type="button" class="inactive-action" data-inactive="${context.esc(i.code)}" title="在所有訂貨工作單中隱藏此商品；可在資料管理恢復">設為 Inactive</button>` : ''}${context.plannerRole === 'viewer' ? d.itemNotes?.[i.code] ? `<div class="item-note-readonly">備註：${context.esc(d.itemNotes[i.code])}</div>` : '' : `<input class="item-note-inline" type="text" data-item-note="${context.esc(i.code)}" maxlength="250" value="${context.esc(d.itemNotes?.[i.code] || '')}" aria-label="${context.esc(i.code)} 本櫃備註" placeholder="單品備註（只存這份工作單）" autocomplete="off" title="留缺貨、採購重點等備註給 Admin">`}</div></div></td>
 <td><strong>${context.fmt(i.stock)}</strong></td>
 <td class="purchase-unit">${context.esc(context.factorInfo(i).raw || '未匯入')}</td>
 <td><strong>${context.fmt(c.stock)}</strong></td>
 <td>${context.monthlyCell(i)}</td>
 <td>${c.available !== null && (c.pi.sum !== 0 || c.ord.total !== 0) ? `<button type="button" class="pi-link" data-pi="${context.esc(i.code)}" aria-label="滑鼠移入或聚焦查看在途 PI 和客訂明細" aria-describedby="piHoverTip" title="">${context.fmt(c.available)} 箱</button>` : c.available === null ? '待更新' : '—'}</td>
 ${context.salesMonthCells(i)}
 <td><input class="maxStock-field" type="number" min="0" step="1" data-max-stock="${context.esc(i.code)}" value="${c.maxStock ?? ''}" placeholder="未設" aria-label="${context.esc(i.code)} 最高庫存" ${context.plannerRole === 'viewer' ? 'disabled' : ''}></td>
 <td><input class="shelf-field" type="number" min="1" max="120" step="1" data-shelf="${context.esc(i.code)}" value="${context.shelfLife(i) ?? ''}" placeholder="未設" aria-label="${context.esc(i.code)} 固定保存期限（月）" ${context.plannerRole === 'viewer' || context.shelfLife(i) !== null ? 'disabled' : ''}></td>
 <td><strong>${c.suggest === null ? '<span class="missing-data">資料不足，無法計算</span>' : context.fmt(c.suggest)}</strong>${c.issues.length ? `<div><button class="mini" data-explain="${context.esc(i.code)}" title="查看計算原因">計算說明</button></div>` : ''}</td>
 <td><div class="qty-picker"><input type="number" min="0" step="1" value="${chosen}" ${i.code.startsWith('__') || i.kind === 'unknown' ? 'disabled' : ''} data-qty="${context.esc(i.code)}" aria-label="${context.esc(i.code)} 訂貨量"><button data-use="${context.esc(i.code)}" type="button" title="填入建議箱數" ${c.suggest == null ? 'disabled' : ''}>採用</button></div></td>
 <td class="projected-stock" data-projected="${context.esc(i.code)}">${context.projectedCell(i, c)}</td></tr>`).join('') || '<tr><td colspan="15" class="empty">沒有符合的商品</td></tr>';
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
    context.updateTableHeader();
  };
  context.updateDraftTotal = function updateDraftTotal(changedCode) {
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
