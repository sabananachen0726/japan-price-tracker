// planner: sales-view. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "sales-view",
  "owns": [{
    "name": "monthlyCell",
    "kind": "function"
  }, {
    "name": "monthlyManagement",
    "kind": "function"
  }, {
    "name": "salesMonthCells",
    "kind": "function"
  }, {
    "name": "renderSalesHeads",
    "kind": "function"
  }, {
    "name": "refreshSalesUI",
    "kind": "function"
  }, {
    "name": "salesStatus",
    "kind": "function"
  }],
  "imports": ["$", "SalesCore", "esc", "fmt", "monthlyInfo", "plannerRole", "salesBusy", "salesDecoded", "salesError", "salesLoading", "salesPending", "salesSummary", "state", "today"],
  "writes": ["monthlyCell", "monthlyManagement", "refreshSalesUI", "renderSalesHeads", "salesMonthCells", "salesStatus"]
};
export function register(context) {
  context.monthlyCell = function monthlyCell(item) {
    const m = context.monthlyInfo(item),
      body = `<strong>${m.value === null ? '—' : context.fmt(m.value)}</strong><span class="sales-source ${m.manual ? 'manual' : ''}">${context.esc(m.source)}${m.row?.count ? ' · ' + m.row.count + '個出貨月' : ''}</span>`;
    return context.plannerRole === 'viewer' ? body : `<button type="button" class="sales-edit" data-monthly-open="${context.esc(item.code)}" title="設定手動月銷或恢復自動">${body}</button>`;
  };
  context.monthlyManagement = function monthlyManagement(item) {
    const m = context.monthlyInfo(item);
    return `<input type="number" min="0" step="any" data-edit="monthly" data-code="${context.esc(item.code)}" value="${m.value ?? ''}" placeholder="無銷售資料" ${context.plannerRole === 'viewer' ? 'disabled' : ''}><span class="sales-source ${m.manual ? 'manual' : ''}">${context.esc(m.source)}</span>${m.manual && context.plannerRole !== 'viewer' ? `<button type="button" data-monthly-auto="${context.esc(item.code)}">恢復自動</button>` : ''}`;
  };
  context.salesMonthCells = function salesMonthCells(item) {
    const m = context.monthlyInfo(item);
    return Array.from({
      length: 4
    }, (_, i) => {
      const covered = context.salesSummary?.coverage[i + 2],
        net = m.row?.net[i + 2] || 0,
        gross = m.row?.gross[i + 2] || 0,
        value = covered && m.f ? net / m.f : null;
      const title = !covered ? '該月份無來源資料' : !m.f ? '缺少 Factor，無法換算' : `原始淨銷量 ${context.fmt(net)} ÷ Factor ${context.fmt(m.f)}${gross > 0 ? '；有出貨，計入平均' : '；無正數出貨，排除月份（負數仍扣回總量）'}`;
      return `<td class="sales-month ${gross > 0 ? '' : 'sales-zero'} ${net < 0 ? 'sales-negative' : ''}" title="${context.esc(title)}">${value === null ? '—' : context.fmt(value)}${covered && gross <= 0 ? '<span class="sales-source">排除月份</span>' : ''}</td>`;
    }).join('');
  };
  context.renderSalesHeads = function renderSalesHeads() {
    const row = context.$('plan').querySelector('.product-table thead tr');
    row.querySelectorAll('.sales-month').forEach(el => el.remove());
    const months = context.salesSummary?.months || context.SalesCore.range(context.SalesCore.monthShift(context.today().slice(0, 7), -1));
    const anchor = row.querySelector('[data-column="pi"]');
    let previous = anchor;
    for (const m of months.slice(-4)) {
      const th = document.createElement('th');
      th.className = 'sales-month';
      th.textContent = m.slice(5) + '月';
      th.title = m + ' 銷量（箱）';
      previous.after(th);
      previous = th;
    }
  };
  context.refreshSalesUI = function refreshSalesUI() {
    const pending = !!context.salesPending;
    document.querySelectorAll('[data-sales-admin]').forEach(el => {
      el.hidden = context.plannerRole !== 'admin';
      el.disabled = context.salesBusy || context.salesLoading;
    });
    for (const [slot, id] of [['history', 'salesHistoryInfo'], ['current', 'salesCurrentInfo']]) {
      const s = (context.salesPending?.sources || context.salesDecoded)[slot];
      context.$(id).textContent = s ? `${s.label || ''}${context.salesPending ? '（待確認）' : ''} · ${s.stats.minDate}～${s.stats.maxDate} · 保留 ${Object.keys(s.months).length} 個月份` : '尚未匯入';
    }
    if (!pending && !context.salesBusy) {
      const s = context.salesSummary;
      const missing = s?.months.filter((_, i) => !s.coverage[i]) || [];
      context.$('salesImportStatus').textContent = context.salesError || (!s ? '尚未匯入銷售資料。' : `${s.months[0]}～${s.end} · ${Object.keys(s.rows).length} 款 · ${missing.length ? '缺少月份：' + missing.join('、') : '六個月資料已齊全'}${s.overlap.length ? '；' + s.overlap.join('、') + ' 使用 XLSM 來源' : ''}${context.state.sourceDirty?.sales ? ' · 尚未成功共用，請查看儲存狀態' : ''}`);
    }
    if (document.activeElement !== context.$('salesEndMonth') && !pending) context.$('salesEndMonth').value = context.state.salesV1?.periodEnd || context.SalesCore.defaultEnd(context.salesDecoded, context.today());
    context.$('salesEndMonth').max = context.SalesCore.monthShift(context.today().slice(0, 7), -1);
    const s = context.salesSummary;
    context.$('salesPlanSummary').textContent = context.salesError || (s ? `${s.months[0]}～${s.end}｜銷量與月銷皆為採購單位｜無正數出貨月份排除｜${s.complete ? '手動值保留至恢復自動' : '資料不足六個月，依現有月份計算'}` : '尚未匯入銷售資料；可到資料匯入中心更新。');
    context.$('salesShowMonths').checked = context.$('plan').classList.contains('sales-expanded');
  };
  context.salesStatus = function salesStatus(text) {
    context.$('salesImportStatus').textContent = text;
  };
}
export function initialize(context) {}
