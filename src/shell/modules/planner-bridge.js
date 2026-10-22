// shell: planner-bridge. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "planner-bridge",
  "owns": [{
    "name": "ORDER_PLANNER_URL",
    "kind": "const"
  }, {
    "name": "plannerLoaded",
    "kind": "let"
  }, {
    "name": "sendPlannerSnapshot",
    "kind": "function"
  }, {
    "name": "chooseImportView",
    "kind": "function"
  }, {
    "name": "loadEmbeddedOrderPlanner",
    "kind": "function"
  }],
  "imports": ["auth", "containerTrackerData", "currentDataMode", "currentRole", "getContainerDates", "legacySafeDate", "normalizeContainerNo", "sendCatalogSources", "sendCustomerSource"],
  "writes": ["ORDER_PLANNER_URL", "chooseImportView", "loadEmbeddedOrderPlanner", "plannerLoaded", "sendPlannerSnapshot"]
};
export function register(context) {
  context.sendPlannerSnapshot = function sendPlannerSnapshot() {
    const frame = document.getElementById('plannerFrame');
    if (!frame?.contentWindow || !context.plannerLoaded || !context.auth.currentUser) return;
    const products = {},
      itemMap = window.appData.itemToBarcode || {},
      historyRows = [];
    const reverseCodes = new Map(Object.entries(itemMap).map(([code, bc]) => [String(bc), String(code).trim().toUpperCase()]));
    Object.entries(window.appData.products || {}).forEach(([barcode, p]) => {
      const code = String(p.itemCode || reverseCodes.get(String(barcode)) || '').trim().toUpperCase(),
        key = code || '__JAN_' + String(barcode).replace(/[^A-Z0-9_-]/gi, '');
      products[key] = {
        code,
        barcode: String(p.sourceBarcode || barcode),
        name: p.name || '',
        imgUrl: p.imgUrl || '',
        kind: ['dry', 'frozen'].includes(p.kind) ? p.kind : 'unknown',
        prices: []
      };
    });
    const quotesByCode = new Map();
    (window.appData.quotes || []).forEach(q => {
      const raw = String(q.itemCode || '').trim().toUpperCase();
      const key = raw || String(window.appData.products?.[q.barcode]?.itemCode || '').trim().toUpperCase();
      if (q.container) {
        const bc = String(q.barcode || '').replace(/[^0-9]/g, ''),
          product = window.appData.products?.[q.barcode] || {};
        historyRows.push({
          code: key,
          barcode: bc,
          name: product.name || '',
          container: context.normalizeContainerNo(q.container),
          qty: null,
          price: Number.isFinite(+q.price) && +q.price > 0 ? +q.price : null,
          source: '貨櫃報價',
          version: q.date || ''
        });
      }
      if (!key || !products[key] || !Number.isFinite(+q.price) || +q.price <= 0) return;
      const sup = String(q.supplier || '').trim(),
        old = quotesByCode.get(key + '|' + sup);
      if (!old || String(q.date || '') > String(old.date || '')) quotesByCode.set(key + '|' + sup, {
        code: key,
        supplier: sup,
        price: +q.price,
        date: q.date || ''
      });
    });
    quotesByCode.forEach(q => products[q.code]?.prices.push({
      supplier: q.supplier,
      price: q.price
    }));
    const barcodeToCode = new Map(Object.entries(window.appData.products || {}).map(([bc, p]) => [String(bc).replace(/[^0-9]/g, ''), String(p.itemCode || '').trim().toUpperCase()]));
    const trackerByCode = new Map((context.containerTrackerData.containers || []).map(c => [context.normalizeContainerNo(c.code), c]));
    const pis = Object.values(window.appData.finalPiContainers || {}).map(p => {
      const code = context.normalizeContainerNo(p.container),
        track = trackerByCode.get(code);
      const todayString = new Date().toLocaleDateString('en-CA', {
        timeZone: 'Australia/Brisbane'
      });
      const dates = context.getContainerDates(track);
      const oldPiReceived = !track ? context.legacySafeDate(p.receivedDate) : '';
      const received = dates.unloaded || !track && !!oldPiReceived && oldPiReceived <= todayString;
      const arrival = dates.unloadDate;
      const eta = dates.eta,
        etaEstimated = dates.etaEstimated;
      const rows = (p.rows || []).map(r => {
        const barcode = String(r.barcode || '').replace(/[^0-9]/g, ''),
          mapped = itemMap[String(r.itemCode || '').trim().toUpperCase()] || itemMap[String(r.itemCode || '').trim()] || '';
        const product = window.appData.products?.[barcode] || window.appData.products?.[mapped] || {};
        const itemCode = String(r.itemCode || product.itemCode || barcodeToCode.get(barcode) || '').trim().toUpperCase();
        historyRows.push({
          code: itemCode,
          barcode,
          name: r.name || product.name || '',
          container: code,
          qty: +r.qty || 0,
          kind: track?.type === 'Frozen' ? 'frozen' : track?.type === 'Dry' ? 'dry' : 'unknown',
          source: 'PI',
          version: p.importedAt || ''
        });
        return {
          code: itemCode || '__JAN_' + barcode,
          barcode,
          name: r.name || product.name || '',
          kind: track?.type === 'Frozen' ? 'frozen' : track?.type === 'Dry' ? 'dry' : 'unknown',
          qty: +r.qty || 0
        };
      }).filter(r => r.code && r.qty > 0);
      return {
        container: code,
        arrival,
        eta,
        etaEstimated,
        received,
        version: p.isFinal ? 'Final' : '未 Final',
        isFinal: p.isFinal === true,
        rows,
        updated: p.importedAt || '',
        source: 'tracker'
      };
    }).filter(p => p.container);
    frame.contentWindow.postMessage({
      type: 'KAISI_TRACKER_SNAPSHOT',
      payload: {
        mode: context.currentDataMode,
        products,
        pis,
        historyRows,
        japanCodes: Array.isArray(window.appData.masterJapanCodes) ? window.appData.masterJapanCodes : null
      }
    }, '*');
    context.sendCatalogSources();
    context.sendCustomerSource();
  };
  context.chooseImportView = function chooseImportView(view) {
    const role = context.currentRole || 'viewer';
    if (role !== 'admin' && view !== 'planner') view = 'planner';
    if (!['master', 'quotes', 'pi', 'planner', 'backup'].includes(view)) view = role === 'admin' ? 'master' : 'planner';
    document.body.dataset.importView = view;
    document.querySelectorAll('.import-switcher [data-import-view]').forEach(b => b.classList.toggle('active', b.dataset.importView === view));
    if (view === 'planner' && document.getElementById('add-tab').classList.contains('active')) {
      context.loadEmbeddedOrderPlanner();
      document.getElementById('plannerFrame')?.contentWindow?.postMessage({
        type: 'KAISI_OPEN_IMPORT_CENTER'
      }, '*');
    }
  };
  context.loadEmbeddedOrderPlanner = function loadEmbeddedOrderPlanner() {
    const frame = document.getElementById('plannerFrame');
    if (!frame || context.plannerLoaded || !context.auth.currentUser) return;
    frame.addEventListener('load', context.sendPlannerSnapshot);
    frame.src = context.ORDER_PLANNER_URL;
    context.plannerLoaded = true;
  };
}
export function initialize(context) {
  context.ORDER_PLANNER_URL = './planner.html?v=20261022-v4150';
  context.plannerLoaded = false;
  document.addEventListener('click', e => {
    const dest = e.target.closest('[data-open-import],.import-switcher [data-import-view]');
    if (!dest) return;
    const view = dest.dataset.openImport || dest.dataset.importView;
    if (dest.hasAttribute('data-open-import')) bootstrap.Tab.getOrCreateInstance(document.getElementById('add-tab')).show();
    context.chooseImportView(view);
  });
  document.addEventListener('shown.bs.tab', e => {
    if (e.target?.id === 'add-tab' && document.getElementById('add-tab').classList.contains('active')) context.chooseImportView(document.body.dataset.importView || (context.currentRole === 'admin' ? 'master' : 'planner'));
    if (e.target?.id === 'planner-tab' && document.getElementById('planner-tab').classList.contains('active')) {
      document.body.dataset.productView = 'master';
      context.loadEmbeddedOrderPlanner();
      document.getElementById('plannerFrame')?.contentWindow?.postMessage({
        type: 'KAISI_OPEN_PLAN'
      }, '*');
    }
  });
}
