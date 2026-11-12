import {piFields, piMultiFields} from './pi-paste.js';

// What each dropped file is, decided from its name, sheet names and header row.
export const IMPORT_TYPES = {
  master: '商品主檔（Onsight）',
  salesHistory: '歷史銷售（CSV／CSV.GZ）',
  salesCurrent: '最新銷售（XLSM／XLSX）',
  myob: 'MYOB 庫存與採購單位',
  settings: '商品訂貨設定',
  shelf: '固定保存期限',
  status: 'Active／Inactive 狀態',
  pi: '廠商 PI（單櫃）',
  piMulti: '廠商 PI（多櫃）',
  quotes: '廠商報價 CSV',
  backup: '完整備份 JSON',
  unknown: '無法辨識'
};

const key = v => String(v ?? '').normalize('NFKC').trim().toLowerCase().replace(/[\s_/\-()（）:：]/g, '');
const piKey = v => String(v ?? '').normalize('NFKC').trim().replace(/[\s_./\-()（）:：]/g, '');
const ITEM = new Set(['itemcode', 'itemno', 'itemnumber', '品號', '商品編號', '商品代碼', '貨號', 'productcode', 'sku']);
const BARCODE = new Set(['barcode', 'barcodejan', 'jancode', 'jan', 'ean', 'ean13', 'gtin', '條碼', '商品條碼', '國際條碼']);
// Same column names the existing settings, shelf-life and status importers accept.
const SETTING = {
  monthly: /^(monthlysales|monthly|月銷|月均銷量|monthlysource|月銷來源)$/,
  maxStock: /^(maxstock|maximumstock|最高庫存)$/,
  shelf: /^(shelflife(months)?|保存期限|有效期限|固定保存期限|保質期)(月)?$/,
  status: /^(status|availability|activeinactive|狀態|商品狀態|訂貨狀態|是否訂購)$/
};

// The header may sit below a title line; try the first few non-empty rows.
function candidateRows(rows) {
  return (rows || []).slice(0, 12).filter(row => row?.some(v => String(v ?? '').trim())).map(row => row.map(v => String(v ?? '').trim()));
}

export function detectHeaders(cells) {
  const keys = cells.map(key), has = name => keys.includes(name), any = re => keys.some(k => re.test(k));
  if (has('placeofproductionvalue')) return 'master';
  if (['date', 'number', 'customer.name', 'itemno', 'qty'].every(has)) return 'sales';
  if (has('itemnumber') && has('onhand')) return 'myob';
  if (keys.some(k => k.includes('廠商名稱') || k.includes('報價金額'))) return 'quotes';
  const piCols = fields => fields.map(([, , re]) => cells.findIndex(c => re.test(piKey(c))));
  const multi = piCols(piMultiFields), single = piCols(piFields);
  if (multi[0] >= 0 && multi[2] >= 0 && multi[3] >= 0) return 'piMulti';
  if (single[0] >= 0 && single[1] >= 0) return 'pi';
  const settings = Object.entries(SETTING).filter(([, re]) => any(re)).map(([name]) => name);
  const idCol = keys.some(k => ITEM.has(k)), barcodeCol = keys.some(k => BARCODE.has(k));
  if ((idCol || barcodeCol) && settings.length) {
    if (settings.length === 1 && settings[0] === 'shelf') return 'shelf';
    if (settings.length === 1 && settings[0] === 'status' && idCol) return 'status';
    if (idCol) return 'settings';
  }
  return 'unknown';
}

// sheets: [{name, rows}] read from the file (first rows are enough).
export function detectImport({name = '', sheets = [], json = null} = {}) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.json')) return json && (json.backupVersion || json.planner || json.appData) ? 'backup' : 'unknown';
  if (lower.endsWith('.gz')) return 'salesHistory';
  const workbook = /\.(xlsx|xlsm|xls)$/.test(lower);
  if (workbook && sheets.some(s => /^(saleshist|sales)$/i.test(String(s.name).trim()))) return 'salesCurrent';
  for (const sheet of sheets) for (const cells of candidateRows(sheet.rows)) {
    const found = detectHeaders(cells);
    if (found === 'sales') return workbook ? 'salesCurrent' : 'salesHistory';
    if (found !== 'unknown') return found;
  }
  return 'unknown';
}
