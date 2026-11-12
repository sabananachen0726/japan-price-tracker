// Where the shared price-tracker data lives in Firestore.
// Storage v1: everything in app_data/main_config (one 1 MiB document).
// Storage v2: quotes and Final PI containers each get their own document, so the
// main document keeps products, mappings, suppliers and customer protection.
export const STORAGE_VERSION = 2;
export const DOC_LIMIT = 1048576;            // Firestore's per-document maximum
export const DOC_STOP = 950000;              // refuse writes above ~90 % (same limit as before)
export const DOC_WARN = Math.round(DOC_LIMIT * 0.8);
export const SPLIT_PARTS = {
  quotes: {doc: 'quotes_v1', key: 'quotes', label: '報價', empty: () => []},
  pis: {doc: 'pi_containers_v1', key: 'finalPiContainers', label: 'PI', empty: () => ({})}
};
const PART_OF_KEY = Object.fromEntries(Object.entries(SPLIT_PARTS).map(([part, s]) => [s.key, part]));

export const bytes = value => new TextEncoder().encode(JSON.stringify(value ?? null)).length;
export const isSplit = main => Number(main?.storageVersion) >= STORAGE_VERSION;

// item code → barcode can be rebuilt from products; only odd extras are stored.
export function derivedItemIndex(products = {}) {
  const index = {};
  for (const [barcode, p] of Object.entries(products || {})) {
    const code = String(p?.itemCode || '').trim();
    if (code) index[code] = barcode;
  }
  return index;
}
export function compactItemIndex(data = {}) {
  const derived = derivedItemIndex(data.products);
  return Object.fromEntries(Object.entries(data.itemToBarcode || {}).filter(([code, barcode]) => derived[code] !== barcode));
}

// One in-memory appData from the stored documents (either storage version).
export function mergeAppData(main = {}, quotesDoc = null, pisDoc = null) {
  const base = {...(main || {})};
  if (isSplit(base)) {
    base.quotes = Array.isArray(quotesDoc?.quotes) ? quotesDoc.quotes : [];
    base.finalPiContainers = pisDoc?.finalPiContainers && typeof pisDoc.finalPiContainers === 'object' ? pisDoc.finalPiContainers : {};
  }
  base.itemToBarcode = {...derivedItemIndex(base.products), ...(base.itemToBarcode || {})};
  return base;
}

// The documents a full save writes. customerProtection is never part of an
// ordinary save: it is changed only by its own transactions.
export function splitAppData(data = {}) {
  const {customerProtection, quotes, finalPiContainers, itemToBarcode, ...rest} = data || {};
  void customerProtection; void itemToBarcode;
  return {
    main: {...rest, storageVersion: STORAGE_VERSION, itemToBarcode: compactItemIndex(data)},
    quotes: {quotes: Array.isArray(quotes) ? quotes : []},
    pis: {finalPiContainers: finalPiContainers && typeof finalPiContainers === 'object' ? finalPiContainers : {}}
  };
}

// [refKey, payload, options] for a full save. refKey is main | quotes | pis.
// v1 keeps the old single-document write; v2 writes the three documents.
export function appDataWrites(data, {split, FieldPath, now = new Date().toISOString()}) {
  if (!split) {
    // Storage markers never travel back into a v1 document (e.g. from a newer backup).
    const {customerProtection, storageVersion, storageMigratedAt, ...payload} = data || {};
    void customerProtection; void storageVersion; void storageMigratedAt;
    return [['main', payload, {mergeFields: Object.keys(payload).map(key => new FieldPath(key))}]];
  }
  const parts = splitAppData(data);
  return [
    ['main', parts.main, {mergeFields: Object.keys(parts.main).map(key => new FieldPath(key))}],
    ['quotes', {...parts.quotes, updatedAt: now}, {}],
    ['pis', {...parts.pis, updatedAt: now}, {}]
  ];
}

// Size of each stored document, for checks before writing and for warnings.
export function capacityReport(data, {split}) {
  if (!split) {
    const {customerProtection, ...rest} = data || {};
    return [{part: 'main', label: '共享主文件', bytes: bytes({...rest, customerProtection})}];
  }
  const parts = splitAppData(data);
  return [
    {part: 'main', label: '商品主文件', bytes: bytes({...parts.main, customerProtection: data?.customerProtection})},
    {part: 'quotes', label: '報價文件', bytes: bytes(parts.quotes)},
    {part: 'pis', label: 'PI 文件', bytes: bytes(parts.pis)}
  ].map(r => ({...r, ratio: r.bytes / DOC_LIMIT}));
}
export function assertCapacity(data, {split}) {
  const over = capacityReport(data, {split}).filter(r => r.bytes > DOC_STOP);
  if (over.length) throw Error(`${over.map(r => `${r.label} ${Math.round(r.bytes / 1024)} KB`).join('、')} 超過安全上限（約 ${Math.round(DOC_STOP / 1024)} KB），本次未儲存`);
}

// Field-level operations written against the merged view ("main") are moved to
// the document that now holds that field.
export function storageDocFor(doc, path, split) {
  if (doc !== 'main' || !split) return doc;
  return PART_OF_KEY[path?.[0]] || 'main';
}

// The one-time move from v1 to v2, built from the current server documents.
export function migrationWrites(main, {FieldPath, deleteField, now = new Date().toISOString()}) {
  if (isSplit(main)) throw Error('已經是新的儲存方式');
  const parts = splitAppData(main);
  const mainPayload = {storageVersion: STORAGE_VERSION, itemToBarcode: parts.main.itemToBarcode, quotes: deleteField(), finalPiContainers: deleteField(), storageMigratedAt: now};
  return [
    ['quotes', {...parts.quotes, updatedAt: now}, {}],
    ['pis', {...parts.pis, updatedAt: now}, {}],
    ['main', mainPayload, {mergeFields: Object.keys(mainPayload).map(key => new FieldPath(key))}]
  ];
}

// Adds a full appData save to a Firestore write batch (or transaction).
export function addAppDataWrites(batch, data, {split, refs, FieldPath}) {
  for (const [key, payload, options] of appDataWrites(data, {split, FieldPath})) batch.set(refs[key], payload, options);
}
