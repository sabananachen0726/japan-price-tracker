import {splitContainerCustomerOrders, finalAddOn} from '../../shared/customer-demand.js';
import {brisbaneDate} from '../../shared/customer-protection.js';
// planner: work-orders. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "work-orders",
  "owns": [{
    "name": "renderContainers",
    "kind": "function"
  }, {
    "name": "download",
    "kind": "function"
  }, {
    "name": "csvCell",
    "kind": "function"
  }, {
    "name": "exportCsv",
    "kind": "function"
  }, {
    "name": "saveDraft",
    "kind": "function"
  }, {
    "name": "renderAll",
    "kind": "function"
  }],
  "imports": ["renderProductHub", "renderPurchaseOverview", "renderInventorySync", "getItems", "currentPiQuantities", "$", "allPis", "autosaveLabel", "calc", "compareContainerIds", "currentKey", "customerSourceReady", "deferredDrafts", "dirtyDrafts", "draft", "draftFingerprint", "esc", "flushRecovery", "fmt", "persist", "plannerRole", "refreshRetryStatus", "renderCatalogSources", "renderManagement", "renderNotes", "renderPending", "renderPlan", "renderSourceReview", "saveFingerprints", "stageLocalDraft", "state", "trackedItem", "trackerFeed", "orderBaselines", "orderConflicts", "orderPending", "orderSyncReady", "refreshOrderSync", "rememberOrderBase"],
  "writes": ["csvCell", "download", "exportCsv", "renderAll", "renderContainers", "saveDraft"]
};
export function register(context) {
  // 採購單總覽: drafts, 處理中, PIs in transit and arrived (purchase-overview.js).
  context.renderContainers = function renderContainers() {
    context.renderPurchaseOverview();
  };
  context.download = function download(name, content, type = 'text/plain') {
    let a = document.createElement('a'),
      u = URL.createObjectURL(new Blob([content], {
        type
      }));
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1500);
  };
  context.csvCell = function csvCell(x) {
    return '"' + String(x ?? '').replaceAll('"', '""') + '"';
  };
  context.exportCsv = function exportCsv(key) {
    let d = context.state.drafts[key];
    if (!d) {
      alert('請先儲存這條貨櫃');
      return;
    }
    // Quantity is the container's own amount plus the Final customer orders submitted with it.
    const final = context.deferredDrafts[key]?.customerFinal || {};
    const finalOf = code => Object.values(final[code] || {}).reduce((n, q) => n + (+q || 0), 0);
    let rows = [...new Set([...Object.keys(d.rows || {}), ...Object.keys(final)])].map(code => [code, +d.rows?.[code] || 0, finalOf(code)]).filter(([, own, add]) => own + add > 0).map(([code, own, add]) => {
      let i = context.state.items.find(x => x.code === code);
      return [code, i && context.trackedItem(i)?.barcode || i?.barcode || '', own + add, key, own, add];
    });
    if (!rows.length) {
      alert('請先輸入訂貨量');
      return;
    }
    context.download(`${key}_Supplier_Order.csv`, '\ufeff' + [['Item Code', 'Barcode', 'Quantity', 'Container No.', '本櫃訂量', 'Final 客訂'], ...rows].map(r => r.map(context.csvCell).join(',')).join('\r\n'), 'text/csv');
  };
  context.saveDraft = function saveDraft() {
    if (context.plannerRole === 'viewer') {
      alert('唯讀帳號無法儲存');
      return false;
    }
    const workCode = context.currentKey();
    if (context.orderPending.has(workCode)) return false;
    if (context.trackerFeed?.mode === 'live' && (!context.orderSyncReady || context.orderConflicts.has(workCode))) {
      alert(context.orderConflicts.has(workCode) ? '雲端已有更新，請先比較並處理版本差異。' : '尚未確認雲端版本，請稍後再提交。');
      return false;
    }
    context.rememberOrderBase(workCode);
    if (Object.entries(context.draft().rows || {}).some(([code, q]) => q > 0 && !Object.hasOwn(context.currentPiQuantities(),code) && (code.startsWith('__') || !context.state.items.some(i => i.code === code && i.kind !== 'unknown')))) {
      alert('本櫃有品號或貨別尚未確認的商品，請先補資料');
      return false;
    }
    let key = context.currentKey();
    if (key.startsWith('__')) {
      alert('請填寫貨櫃號碼');
      return false;
    }
    const over = context.state.items.filter(i => Number(context.draft().rows?.[i.code]) > 0).map(i => ({i,c:context.calc(i)})).filter(x => x.c.excess > 0);
    if (over.length && !confirm(over.map(({i,c}) => i.code + '：預計庫存 ' + context.fmt(c.projected) + '，超過上限 ' + context.fmt(c.maxStock) + '，多出 ' + context.fmt(c.excess)).join('\n') + '\n仍要提交？')) return false;
    // Final customer orders for this container are submitted on top of its own
    // quantities, straight from the customer-order sheet (never edited here).
    const liveFeed = context.trackerFeed?.mode === 'live';
    const customerReady = context.customerSourceReady || context.state.orders.length > 0;
    if (liveFeed && !customerReady && !confirm('客訂尚未取得，這次提交不會加入 Final 客訂。\n仍要提交？')) return false;
    const customerFinal = customerReady ? finalAddOn(splitContainerCustomerOrders(context.state.orders, workCode,
      {protections: context.trackerFeed?.protections || {}, today: brisbaneDate()})) : {};
    const customerSource = !customerReady ? 'none' : context.customerSourceReady ? 'live' : 'cache';
    let d = context.draft();
    d.kind = context.$('kind').value;
    d.arrival = context.$('arrival').value;
    d.coverage = +context.$('coverage').value;
    context.state.drafts[key] = d;
    context.stageLocalDraft();
    context.flushRecovery();
    context.persist();
    context.saveFingerprints.set(key, context.draftFingerprint(d));
    const requestId = crypto.randomUUID(), revision = crypto.randomUUID();
    const expectedVersion = context.orderBaselines.get(key) ?? null;
    context.orderPending.set(key, {requestId, revision, expectedVersion});
    context.refreshOrderSync();
    window.parent.postMessage({
      type: 'KAISI_ORDER_SAVE',
      code: key,
      requestId, revision, expectedVersion,
      draft: d, customerFinal, customerSource
    }, '*');
    context.autosaveLabel('已送出 Firebase 儲存請求 · 本機草稿保留至確認成功');
    context.renderPlan();
    return true;
  };
  context.renderAll = function renderAll() {
    if (!context.$('plan').classList.contains('hidden')) context.renderPlan();
    if (!context.$('settings').classList.contains('hidden')) {
      context.renderManagement();
      context.renderSourceReview();
    }
    if (!context.$('productHub').classList.contains('hidden')) context.renderProductHub();
    if (!context.$('containers').classList.contains('hidden')) {
      context.renderContainers();
      document.querySelectorAll('#containerCards .admin-only').forEach(b => b.hidden = context.plannerRole !== 'admin');
    }
    context.$('savePreset').hidden = context.plannerRole !== 'admin';
    context.$('deleteWork').hidden = context.plannerRole !== 'admin' || !Object.hasOwn(context.state.drafts, context.currentKey()) || context.currentKey().startsWith('__');
    context.renderNotes();
    context.renderCatalogSources();
    context.$('resetMYOBStock').hidden = context.plannerRole !== 'admin';
    context.renderInventorySync();
    context.renderPending();
    context.refreshRetryStatus();
    context.refreshOrderSync();
    context.$('sourceBadge').textContent = context.trackerFeed ? `商品庫 ${context.state.items.length} 款 · ${context.trackerFeed.mode.toUpperCase()} · ${context.trackerFeed.mode === 'test' ? '本機客訂' : context.customerSourceReady ? '客訂已讀取' : '客訂待連線'}` : '等待資料連動';
  };
}
export function initialize(context) {}
