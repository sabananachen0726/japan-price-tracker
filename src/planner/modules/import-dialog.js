// planner: import-dialog. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "import-dialog",
  "owns": [{
    "name": "pick",
    "kind": "function"
  }, {
    "name": "previewImport",
    "kind": "function"
  }, {
    "name": "fileHandler",
    "kind": "function"
  }],
  "imports": ["$", "exportSettings412", "importPreview", "meaningfulNumber", "norm", "openPlannerDialog", "parseSheetGrid412", "previewUnified", "renderAll", "sourceSave", "state", "today", "unifiedImportGrid"],
  "writes": ["fileHandler", "importPreview", "pick", "previewImport"]
};
export function register(context) {
  context.pick = function pick(r, keys) {
    for (const key of keys) if (Object.hasOwn(r, key)) return r[key];
    return undefined;
  };
  context.previewImport = function previewImport(title, counts, details, apply) {
    context.importPreview = apply;
    context.$('importTitle').textContent = title;
    context.$('importSummary').textContent = counts;
    context.$('importDetails').textContent = details.join('\n');
    context.openPlannerDialog(context.$('importDialog'));
  };
  context.fileHandler = function fileHandler(id, handler) {
    context.$(id).onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await handler(file);
      } catch (err) {
        alert('匯入失敗：' + err.message);
      }
      e.target.value = '';
    };
  };
}
export function initialize(context) {
  context.$('applyImport').onclick = async () => {
    const run = context.importPreview;
    context.importPreview = null;
    context.$('importDialog').close();
    if (run) await run();
  };
  context.fileHandler('monthlyFile', async file => {
    context.previewUnified(context.unifiedImportGrid(await context.parseSheetGrid412(file), file.name), file.name);
    context.openPlannerDialog(context.$('unifiedDialog'));
  });
  context.fileHandler('ordersFile', async file => {
    const raw = JSON.parse(await file.text()),
      arr = Array.isArray(raw) ? raw : Array.isArray(raw.rows) ? raw.rows : Array.isArray(raw.orders) ? raw.orders : null;
    if (!arr) throw Error('找不到客訂陣列');
    const orders = arr.map((r, k) => {
      let o = r.values ? {
        id: r.id || `import-${k}`,
        code: context.norm(r.values[2]),
        customer: r.values[1],
        qty: r.values[6],
        unit: r.values[7],
        status: r.values[8],
        container: r.values[9],
        note: r.values[10]
      } : {
        ...r,
        code: context.norm(r.code)
      };
      o.qty = context.meaningfulNumber(o.qty);
      return o;
    });
    context.previewImport('更新客訂快照', `以 ${orders.length} 筆客訂取代目前匯入的客訂快照，供訂貨同事共用。`, orders.filter(o => !context.state.items.some(i => i.code === o.code)).map(o => `${o.code || '空白品號'}：未配對商品庫，需核對`), () => {
      context.state.orders = orders;
      context.state.meta.orders = `${file.name} · ${context.today()} · ${orders.length} 筆`;
      context.sourceSave('orders', {
        orders,
        label: context.state.meta.orders
      });
      context.renderAll();
    });
  });
  context.$('importOrders').onclick = () => window.parent.postMessage({
    type: 'KAISI_CUSTOMER_REFRESH'
  }, '*');
  context.$('importMonthly').onclick = () => context.$('monthlyFile').click();
  context.$('downloadMonthlyTemplate').onclick = context.exportSettings412;
  context.$('exportCatalog').onclick = () => window.parent.postMessage({
    type: 'KAISI_OPEN_SYSTEM',
    view: 'backup'
  }, '*');
}
