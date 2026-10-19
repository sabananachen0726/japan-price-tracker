// shell: search-index. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "search-index",
  "owns": [{
    "name": "searchCache",
    "kind": "let"
  }, {
    "name": "PRICE_ANOMALY_THRESHOLD",
    "kind": "const"
  }, {
    "name": "masterCurrentPage",
    "kind": "let"
  }, {
    "name": "masterSearchTerm",
    "kind": "let"
  }, {
    "name": "masterSelectedProducts",
    "kind": "const"
  }, {
    "name": "rebuildSearchCache",
    "kind": "function"
  }, {
    "name": "resolveToPrimaryBarcodeFromCache",
    "kind": "function"
  }, {
    "name": "ensureSearchCache",
    "kind": "function"
  }, {
    "name": "refreshUI",
    "kind": "function"
  }],
  "imports": ["cleanBarcode", "compareQuotesByContainerNewest", "renderCompareList", "renderContainerDeleteOptions", "renderFinalPiBatchSearch", "renderFinalPiContainerList", "renderFinalPiSearch", "renderMappingTable", "renderMasterTable", "renderSharedOrderDrafts", "renderSupplierOptions", "sendContainerSnapshot", "sendPlannerSnapshot"],
  "writes": ["PRICE_ANOMALY_THRESHOLD", "ensureSearchCache", "masterCurrentPage", "masterSearchTerm", "masterSelectedProducts", "rebuildSearchCache", "refreshUI", "resolveToPrimaryBarcodeFromCache", "searchCache"]
};
export function register(context) {
  context.rebuildSearchCache = function rebuildSearchCache() {
    const data = window.appData || {};
    const products = data.products || {};
    const mappings = data.mappings || {};
    const quotes = data.quotes || [];
    const aliasToPrimary = new Map();
    const productEntries = [];
    const allPrimarySet = new Set(Object.keys(products));
    const quoteByBarcode = new Map();
    const quoteBundlesByPrimary = new Map();
    for (const mainB of Object.keys(mappings)) {
      const aliases = Array.isArray(mappings[mainB]) ? mappings[mainB] : [];
      for (const alias of aliases) aliasToPrimary.set(context.cleanBarcode(alias), mainB);
    }
    for (const mainB of Object.keys(products)) {
      const p = products[mainB] || {};
      const aliases = Array.isArray(mappings[mainB]) ? mappings[mainB] : [];
      productEntries.push({
        barcode: context.cleanBarcode(p.sourceBarcode || mainB).toLowerCase(),
        itemCode: String(p.itemCode || '').trim().toLowerCase(),
        name: String(p.name || '').trim().toLowerCase(),
        aliases: aliases.map(a => context.cleanBarcode(a).toLowerCase()),
        primary: mainB
      });
    }
    // 報價一次整理成 barcode 索引 + primary 商品 bundle。
    // renderProductCard 之後直接取整理好的 latest/history，不再每張卡重做 group + sort。
    for (const q of quotes) {
      const bc = context.cleanBarcode(q.barcode);
      if (!bc) continue;
      if (!quoteByBarcode.has(bc)) quoteByBarcode.set(bc, []);
      quoteByBarcode.get(bc).push(q);
      const primary = context.resolveToPrimaryBarcodeFromCache(bc, aliasToPrimary, data.itemToBarcode || {});
      if (!primary) continue;
      allPrimarySet.add(primary);
      if (!quoteBundlesByPrimary.has(primary)) {
        quoteBundlesByPrimary.set(primary, {
          latestBySupplier: {},
          supplierHistory: {}
        });
      }
      const bundle = quoteBundlesByPrimary.get(primary);
      const sup = q.supplier || '';
      if (!bundle.supplierHistory[sup]) bundle.supplierHistory[sup] = [];
      bundle.supplierHistory[sup].push(q);
    }
    for (const bundle of quoteBundlesByPrimary.values()) {
      for (const sup of Object.keys(bundle.supplierHistory)) {
        bundle.supplierHistory[sup].sort(context.compareQuotesByContainerNewest);
        bundle.latestBySupplier[sup] = bundle.supplierHistory[sup][0];
      }
    }
    context.searchCache = {
      valid: true,
      aliasToPrimary,
      productEntries,
      quoteByBarcode,
      quoteBundlesByPrimary,
      allPrimaryBarcodes: [...allPrimarySet]
    };
  };
  context.resolveToPrimaryBarcodeFromCache = function resolveToPrimaryBarcodeFromCache(barcode, aliasToPrimary, itemToBarcode) {
    let value = context.cleanBarcode(barcode);
    if (!value) return '';
    if (itemToBarcode && itemToBarcode[value]) value = context.cleanBarcode(itemToBarcode[value]);
    return aliasToPrimary.get(value) || value;
  };
  context.ensureSearchCache = function ensureSearchCache() {
    if (!context.searchCache.valid) context.rebuildSearchCache();
    return context.searchCache;
  };
  context.refreshUI = function refreshUI() {
    // Firebase 資料更新後只重建一次搜尋索引。
    context.rebuildSearchCache();
    context.renderSupplierOptions();
    context.renderCompareList();
    context.renderMappingTable();
    context.renderMasterTable();
    // Import history renderer is initialized inside the DOM-ready workflow.
    // Do not call it here because TEST can load LIVE data before that local function exists.
    context.renderContainerDeleteOptions();
    context.renderFinalPiContainerList();
    context.renderFinalPiSearch();
    context.renderFinalPiBatchSearch();
    context.sendPlannerSnapshot();
    context.sendContainerSnapshot();
    context.renderSharedOrderDrafts();
  };
}
export function initialize(context) {
  context.searchCache = {
    valid: false,
    aliasToPrimary: new Map(),
    productEntries: [],
    quoteByBarcode: new Map(),
    quoteBundlesByPrimary: new Map(),
    allPrimaryBarcodes: []
  };
  context.PRICE_ANOMALY_THRESHOLD = 0.20;
  context.masterCurrentPage = 1;
  context.masterSearchTerm = '';
  context.masterSelectedProducts = new Set();
}
