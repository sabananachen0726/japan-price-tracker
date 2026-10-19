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
  "imports": ["$", "allPis", "autosaveLabel", "compareContainerIds", "currentKey", "customerSourceReady", "draft", "draftFingerprint", "esc", "flushRecovery", "fmt", "persist", "plannerRole", "refreshRetryStatus", "renderCatalogSources", "renderManagement", "renderNotes", "renderPending", "renderPlan", "renderSourceReview", "saveFingerprints", "stageLocalDraft", "state", "trackedItem", "trackerFeed"],
  "writes": ["csvCell", "download", "exportCsv", "renderAll", "renderContainers", "saveDraft"]
};
export function register(context) {
  context.renderContainers = function renderContainers() {
    let entries = Object.entries(context.state.drafts).filter(([k, d]) => k !== '__未命名草稿__' && (d.preparedAt || Object.values(d.rows || {}).some(x => +x > 0))),
      pis = context.allPis().sort((a, b) => context.compareContainerIds(a.container, b.container));
    context.$('containerCards').innerHTML = `<h3>採購工作單 (${entries.length})</h3>` + (entries.map(([k, d]) => `<div class="panel"><div class="row between"><div><b>${context.esc(k)}</b> · ${context.esc(d.kind === 'dry' ? '乾貨' : '冷凍')} · 到倉 ${context.esc(d.arrival || '未設定')}<br><span class="muted">${Object.values(d.rows || {}).filter(x => +x > 0).length} 款 · ${context.fmt(Object.values(d.rows || {}).reduce((n, x) => n + (+x || 0), 0))} 採購單位</span></div><div class="row"><button data-open="${context.esc(k)}">開啟</button><button data-delete="${context.esc(k)}" class="admin-only" hidden>刪除</button></div></div></div>`).join('') || '<p class="muted">尚無已儲存草稿。</p>') + `<h3>匯入的 PI (${pis.length})</h3>` + (pis.map(p => `<div class="panel"><b>${context.esc(p.container)}</b> · ${p.rows.length} 款 · 到倉 ${context.esc(p.arrival || '待填')} · ${context.esc(p.source === 'tracker' ? 'Price Tracker 同步' : '手動匯入')} · 更新 ${context.esc(p.updated || '')}&nbsp; <button data-pidate="${context.esc(p.container)}">設定到倉日</button><p class="mini muted">不限制 Final；同櫃重新匯入會以新版本完整取代明細。</p></div>`).join('') || '<p class="muted">尚未匯入 PI。起始快照中的歷史欄位不會直接算作在途貨。</p>');
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
    let rows = Object.entries(d.rows || {}).filter(([, n]) => +n > 0).map(([code, qty]) => {
      let i = context.state.items.find(x => x.code === code);
      return [code, i && context.trackedItem(i)?.barcode || i?.barcode || '', qty, key];
    });
    if (!rows.length) {
      alert('請先輸入訂貨量');
      return;
    }
    context.download(`${key}_Supplier_Order.csv`, '\ufeff' + [['Item Code', 'Barcode', 'Quantity', 'Container No.'], ...rows].map(r => r.map(context.csvCell).join(',')).join('\r\n'), 'text/csv');
  };
  context.saveDraft = function saveDraft() {
    if (context.plannerRole === 'viewer') {
      alert('唯讀帳號無法儲存');
      return false;
    }
    if (Object.entries(context.draft().rows || {}).some(([code, q]) => q > 0 && (code.startsWith('__') || !context.state.items.some(i => i.code === code && i.kind !== 'unknown')))) {
      alert('本櫃有品號或貨別尚未確認的商品，請先補資料');
      return false;
    }
    let key = context.currentKey();
    if (key.startsWith('__')) {
      alert('請填寫貨櫃號碼');
      return false;
    }
    let d = context.draft();
    d.kind = context.$('kind').value;
    d.arrival = context.$('arrival').value;
    d.coverage = +context.$('coverage').value;
    context.state.drafts[key] = d;
    context.stageLocalDraft();
    context.flushRecovery();
    context.persist();
    context.saveFingerprints.set(key, context.draftFingerprint(d));
    window.parent.postMessage({
      type: 'KAISI_ORDER_SAVE',
      code: key,
      draft: d
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
    if (!context.$('containers').classList.contains('hidden')) {
      context.renderContainers();
      document.querySelectorAll('#containerCards .admin-only').forEach(b => b.hidden = context.plannerRole !== 'admin');
    }
    context.$('savePreset').hidden = context.plannerRole !== 'admin';
    context.$('deleteWork').hidden = context.plannerRole !== 'admin' || !Object.hasOwn(context.state.drafts, context.currentKey()) || context.currentKey().startsWith('__');
    context.renderNotes();
    context.renderCatalogSources();
    context.renderPending();
    context.refreshRetryStatus();
    context.$('sourceBadge').textContent = context.trackerFeed ? `商品庫 ${context.state.items.length} 款 · ${context.trackerFeed.mode.toUpperCase()} · ${context.trackerFeed.mode === 'test' ? '本機客訂' : context.customerSourceReady ? '客訂已讀取' : '客訂待連線'}` : '等待資料連動';
  };
}
export function initialize(context) {}
