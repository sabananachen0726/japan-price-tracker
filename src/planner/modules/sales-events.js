// planner: sales-events. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "sales-events",
  "owns": [{
    "name": "showMonthlyDialog",
    "kind": "function"
  }, {
    "name": "restoreMonthly",
    "kind": "function"
  }, {
    "name": "renderAllBeforeSales",
    "kind": "const"
  }],
  "imports": ["$", "csvCell", "download", "events", "fmt", "hydrateSales", "monthlyInfo", "openPlannerDialog", "plannerRole", "prepareSales", "refreshSalesUI", "renderAll", "renderPlan", "salesBusy", "salesDecoded", "salesLoadGeneration", "salesLoading", "salesPending", "salesSignature", "salesSummary", "saveCatalogPatch", "selectSalesFile", "sourceSave", "state", "trackerFeed", "updateTableHeader"],
  "writes": ["renderAll", "renderAllBeforeSales", "restoreMonthly", "salesDecoded", "salesLoadGeneration", "salesLoading", "salesPending", "salesSignature", "salesSummary", "showMonthlyDialog"]
};
export function register(context) {
  context.showMonthlyDialog = function showMonthlyDialog(code) {
    if (context.plannerRole === 'viewer') return;
    const item = context.state.items.find(i => i.code === code);
    if (!item) return;
    const m = context.monthlyInfo(item);
    context.$('monthlyOverrideDialog').dataset.code = code;
    context.$('monthlyOverrideTitle').textContent = code + ' · 平均月銷';
    context.$('monthlyOverrideInfo').textContent = `${m.source}｜自動計算：${m.auto === null ? '無可用自動值' : context.fmt(m.auto) + ' 採購單位／月'}。手動值維持採購單位，不隨 Factor 改變。`;
    context.$('monthlyOverrideValue').value = m.value ?? '';
    context.openPlannerDialog(context.$('monthlyOverrideDialog'));
  };
  context.restoreMonthly = function restoreMonthly(code) {
    if (context.plannerRole === 'viewer') return;
    context.saveCatalogPatch({
      overrides: {
        [code]: {
          monthly: null
        }
      }
    });
  };
}
export function initialize(context) {
  context.renderAllBeforeSales = context.renderAll;
  context.renderAll = function () {
    context.renderAllBeforeSales();
    context.refreshSalesUI();
  };
  document.addEventListener('click', e => {
    const open = e.target.closest('[data-monthly-open]'),
      reset = e.target.closest('[data-monthly-auto]');
    if (open) context.showMonthlyDialog(open.dataset.monthlyOpen);
    if (reset) context.restoreMonthly(reset.dataset.monthlyAuto);
  });
  context.$('salesShowMonths').onchange = () => {
    context.$('plan').classList.toggle('sales-expanded', context.$('salesShowMonths').checked);
    try {
      localStorage.setItem('kaisi_sales_show_months', String(context.$('salesShowMonths').checked));
    } catch {}
    context.renderPlan();
    context.updateTableHeader();
  };
  context.$('salesShowMonths').checked = false;
  context.$('plan').classList.remove('sales-expanded');
  for (const [slot, prefix] of [['history', 'salesHistory'], ['current', 'salesCurrent']]) {
    context.$(prefix + 'Choose').onclick = () => context.$(prefix + 'File').click();
    context.$(prefix + 'File').onchange = e => {
      context.selectSalesFile(e.target.files[0], slot);
      e.target.value = '';
    };
  }
  context.$('salesPeriodPreview').onclick = async () => {
    try {
      if (!Object.keys(context.salesDecoded).length) throw Error('請先匯入銷售資料');
      await context.prepareSales(context.salesPending?.sources || context.salesDecoded, context.$('salesEndMonth').value);
    } catch (err) {
      alert(err.message);
    }
  };
  context.$('salesCancel').onclick = () => {
    context.salesPending = null;
    context.$('salesPreview').classList.add('hidden');
    context.refreshSalesUI();
  };
  context.$('salesApply').onclick = () => {
    if (context.plannerRole !== 'admin' || !context.salesPending) return;
    const p = context.salesPending;
    if (p.scope !== String(context.trackerFeed?.mode || 'test')) return alert('資料模式已改變，請重新預覽');
    context.salesLoadGeneration++;
    context.salesLoading = false;
    context.salesDecoded = p.sources;
    context.salesSummary = p.summary;
    context.state.salesV1 = p.payload;
    context.salesSignature = JSON.stringify(p.payload);
    context.salesPending = null;
    context.$('salesPreview').classList.add('hidden');
    context.sourceSave('sales', p.payload);
    context.renderAll();
  };
  context.$('monthlyOverrideSave').onclick = () => {
    if (context.plannerRole === 'viewer') return;
    const raw = context.$('monthlyOverrideValue').value.trim(),
      n = Number(raw);
    if (raw === '' || !Number.isFinite(n) || n < 0) return alert('請輸入非負數字；要使用自動值請按「恢復自動」');
    context.saveCatalogPatch({
      overrides: {
        [context.$('monthlyOverrideDialog').dataset.code]: {
          monthly: n
        }
      }
    });
    context.$('monthlyOverrideDialog').close();
  };
  context.$('monthlyOverrideAuto').onclick = () => {
    context.restoreMonthly(context.$('monthlyOverrideDialog').dataset.code);
    context.$('monthlyOverrideDialog').close();
  };
  context.$('salesExport').onclick = () => {
    if (!context.salesSummary) return alert('尚無銷售資料');
    const rows = [['Item Code', '商品名稱', '採購單位Factor', ...context.salesSummary.months, '六個月原始淨量', '出貨月份數', '自動月銷(採購)', '使用中月銷(採購)', '來源', '排除月份']];
    for (const i of context.state.items) {
      const m = context.monthlyInfo(i),
        r = m.row;
      rows.push([i.code, i.name, m.f ?? '', ...Array.from({
        length: 6
      }, (_, n) => context.salesSummary.coverage[n] && m.f ? (r?.net[n] || 0) / m.f : ''), r?.total ?? '', r?.count ?? 0, m.auto ?? '', m.value ?? '', m.source, context.salesSummary.months.filter((_, n) => !((r?.gross[n] || 0) > 0)).join('、')]);
    }
    context.download('Kaisi_Monthly_Sales_' + context.salesSummary.end + '.csv', '\ufeff' + rows.map(r => r.map(context.csvCell).join(',')).join('\r\n'), 'text/csv');
  };
  context.events.onMessage(event => {
    if (event.source !== window.parent) return;
    const m = event.data || {};
    if (m.type === 'KAISI_SOURCES_SNAPSHOT' && context.trackerFeed && m.mode === context.trackerFeed.mode && !context.state.sourceDirty.sales && !context.salesBusy && !context.salesPending) context.hydrateSales(m.data?.salesV1 || null);
    if (m.type === 'KAISI_CATALOG_SAVE_RESULT' && m.ok) {
      context.refreshSalesUI();
    }
  });
}
