// planner: workspace. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "workspace",
  "owns": [{
    "name": "notifyPlannerWidth412",
    "kind": "function"
  }, {
    "name": "parseSheetGrid412",
    "kind": "function"
  }, {
    "name": "exportSettings412",
    "kind": "function"
  }, {
    "name": "snapshotPlanner412",
    "kind": "function"
  }, {
    "name": "restorePlanner412",
    "kind": "function"
  }, {
    "name": "managementHead",
    "kind": "const"
  }, {
    "name": "hiddenSettingsPanel",
    "kind": "const"
  }, {
    "name": "advancedSettings",
    "kind": "const"
  }],
  "imports": ["$", "cloudJobs", "csvCell", "deferredDrafts", "dirtyDrafts", "download", "events", "factor", "flushRecovery", "hydrateSales", "importPreview", "localRecovery", "monthlyInfo", "pendingInventoryImport", "pendingShelfImport", "pendingStatusImport", "plannerRole", "rebuildCatalog", "renderAll", "salesBusy", "salesPending", "salesSignature", "salesWorker", "saveCatalogPatch", "saveFingerprints", "shelfLife", "state", "statusDelimitedRows", "storeLocal", "trackerFeed", "unifiedPending", "val"],
  "writes": ["advancedSettings", "deferredDrafts", "dirtyDrafts", "exportSettings412", "hiddenSettingsPanel", "importPreview", "localRecovery", "managementHead", "notifyPlannerWidth412", "parseSheetGrid412", "pendingInventoryImport", "pendingShelfImport", "pendingStatusImport", "restorePlanner412", "salesBusy", "salesPending", "salesSignature", "salesWorker", "snapshotPlanner412", "unifiedPending"]
};
export function register(context) {
  context.notifyPlannerWidth412 = function notifyPlannerWidth412() {
    window.parent.postMessage({
      type: 'KAISI_PLANNER_WIDTH',
      wide: !context.$('plan').classList.contains('hidden') && context.$('salesShowMonths').checked
    }, '*');
  };
  context.parseSheetGrid412 = async function parseSheetGrid412(file) {
    if (/\.(csv|txt|tsv)$/i.test(file.name)) return context.statusDelimitedRows(await file.text());
    if (typeof XLSX === 'undefined') throw Error('Excel 元件尚未載入');
    const wb = XLSX.read(await file.arrayBuffer(), {
      type: 'array'
    });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false
    });
  };
  context.exportSettings412 = function exportSettings412() {
    const rows = [['Item Code', 'Monthly Sales', 'Monthly Source', 'Max Stock', '採購單位（MYOB）', 'Shelf Life (Months)', 'Status'], ...context.state.items.filter(i => !i.code.startsWith('__')).map(i => [i.code, context.val(i, 'monthly') ?? '', context.monthlyInfo(i).manual ? 'Manual' : 'Auto', context.val(i, 'maxStock') ?? '', context.state.inventory?.[i.code]?.custom || '', context.shelfLife(i) ?? '', i.availability === 'active' ? 'Active' : 'Inactive'])];
    context.download('Kaisi_Order_Settings.csv', '\ufeff' + rows.map(row => row.map(context.csvCell).join(',')).join('\r\n'), 'text/csv');
  };
  context.snapshotPlanner412 = function snapshotPlanner412() {
    return {
      catalog: {
        items: structuredClone(context.state.catalog || {}),
        overrides: structuredClone(context.state.overrides || {}),
        rules: structuredClone(context.state.rules || {})
      },
      inventory: {
        rows: structuredClone(context.state.inventory || {}),
        resetAt: context.state.inventoryResetAt || '',
        factorBatchId: context.state.myobFactorBatchId || '',
        updatedAt: context.state.myobImportedAt || '',
        label: context.state.meta.myob || ''
      },
      sources: {
        salesV1: structuredClone(context.state.salesV1 || null),
        pis: structuredClone(context.state.pis || [])
      },
      orders: {
        drafts: structuredClone(context.state.drafts || {})
      }
    };
  };
  context.restorePlanner412 = function restorePlanner412(data) {
    context.dirtyDrafts = new Set();
    context.deferredDrafts = {};
    context.localRecovery = {
      works: {}
    };
    context.flushRecovery();
    context.saveFingerprints.clear();
    context.unifiedPending = null;
    context.pendingShelfImport = null;
    context.pendingStatusImport = null;
    context.pendingInventoryImport = null;
    context.importPreview = null;
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    if (context.salesWorker) context.salesWorker.terminate();
    context.salesWorker = null;
    context.salesBusy = false;
    const d = data || {};
    context.state.catalog = structuredClone(d.catalog?.items || {});
    context.state.overrides = structuredClone(d.catalog?.overrides || {});
    context.state.rules = {
      ...context.state.rules,
      ...(d.catalog?.rules || {})
    };
    context.state.inventory = structuredClone(d.inventory?.rows || {});
    context.state.myobFactorBatchId = d.inventory?.factorBatchId || '';
    context.state.inventoryResetAt = d.inventory?.resetAt || ''; 
    context.state.myobImportedAt = d.inventory?.updatedAt || '';
    context.state.meta.myob = d.inventory?.label || '';
    context.state.pis = structuredClone(d.sources?.pis || []);
    context.state.drafts = structuredClone(d.orders?.drafts || {});
    context.state.sourceDirty = {};
    context.state.dirtyCatalog = {
      items: {},
      overrides: {},
      rules: {}
    };
    context.state.legacyOverrides = {};
    context.cloudJobs.clear();
    context.state.salesV1 = d.sources?.salesV1 || null;
    context.salesPending = null;
    context.salesSignature = '';
    context.hydrateSales(context.state.salesV1);
    context.rebuildCatalog();
    context.storeLocal();
    context.renderAll();
  };
}
export function initialize(context) {
  context.events.onMessage(e => {
    if (e.source !== window.parent) return;
    const m = e.data || {};
    if (m.type === 'KAISI_PRODUCT_OPEN') {
      document.body.classList.add('product-management');
      document.body.classList.remove('hub-import-only');
      context.$('manageSearch').value = m.query || '';
      context.$('pendingSearch').value = m.query || '';
      context.$('sourceReviewSearch').value = m.query || '';
      document.querySelector(`[data-tab="${m.view === 'pending' ? 'pending' : 'settings'}"]`).click();
      context.notifyPlannerWidth412();
    }
    if (m.type === 'KAISI_OPEN_PLAN' || m.type === 'KAISI_OPEN_IMPORT_CENTER') {
      document.body.classList.remove('product-management');
      context.notifyPlannerWidth412();
    }
    if (m.type === 'KAISI_PRODUCT_SEARCH') {
      context.$('manageSearch').value = m.query || '';
      context.$('pendingSearch').value = m.query || '';
      context.renderAll();
    }
    if (m.type === 'KAISI_BACKUP_REQUEST') window.parent.postMessage({
      type: 'KAISI_BACKUP_RESPONSE',
      id: m.id,
      mode: context.trackerFeed?.mode,
      data: context.snapshotPlanner412()
    }, '*');
    if (m.type === 'KAISI_PI_SHELF_TEST' && context.trackerFeed?.mode === 'test' && context.plannerRole === 'admin') context.saveCatalogPatch({
      items: m.items || {},
      overrides: m.overrides || {}
    });
    if (m.type === 'KAISI_RESTORE_PLANNER' && m.mode === context.trackerFeed?.mode) context.restorePlanner412(m.data);
  });
  // A single export path and a compact advanced source review.
  context.managementHead = document.createElement('div');
  context.managementHead.id = 'managementHeader412';
  context.managementHead.innerHTML = '<strong>商品訂貨設定</strong><p class="mini muted">狀態、換算、月銷、最高庫存及保存期限集中維護；自動月銷可手動覆蓋或恢復自動。</p><div class="toolbar"><button type="button" id="settingsExport412">匯出商品與來源 Excel</button><button type="button" id="settingsTemplate412">匯出可重新匯入的設定範本</button><button type="button" id="settingsImport412">前往資料匯入中心</button></div>';
  context.$('settings').prepend(context.managementHead);
  context.$('settingsExport412').onclick = () => context.$('exportSourceAll').click();
  context.$('settingsTemplate412').onclick = context.exportSettings412;
  context.$('settingsImport412').onclick = () => window.parent.postMessage({
    type: 'KAISI_OPEN_HUB',
    view: 'planner'
  }, '*');
  context.$('settings').querySelector('.panel').style.display = 'none';
  // Legacy entry remains callable; the visible recommended path is unified.

  context.$('importMonthly').onclick = () => context.$('openUnifiedImport').click();
  context.hiddenSettingsPanel = context.$('settings').querySelector('.panel');
  context.advancedSettings = context.hiddenSettingsPanel?.querySelector('details:not(.source-review-panel)');
  if (context.advancedSettings) {
    context.advancedSettings.querySelector('summary').textContent = '進階：預設訂貨規則與同步狀態';
    context.managementHead.append(context.advancedSettings);
  }
  window.parent.postMessage({
    type: 'KAISI_PLANNER_READY'
  }, '*');
  context.renderAll();
}
