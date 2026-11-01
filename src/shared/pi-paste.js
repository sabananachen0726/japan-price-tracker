// Excel clipboard TSV and CSV both allow quoted cells containing line breaks.
export function readPiGrid(value) {
  const text = String(value || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  let quoted = false, delimiter = ',';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') {if (quoted && text[i + 1] === '"') i++; else quoted = !quoted;}
    if (!quoted && text[i] === '\t') {delimiter = '\t'; break;}
  }
  const records = [], invalid = [];
  let cells = [], cell = '', inside = false, closed = false, line = 1, startLine = 1, start = 0, blankRows = 0, multilineCells = 0;
  const endCell = () => {if (cell.includes('\n')) multilineCells++; cells.push(cell); cell = ''; closed = false;};
  const endRow = end => {
    endCell();
    if (cells.every(v => !v.trim())) {blankRows++;}
    else records.push({cells, line: startLine, raw: text.slice(start, end)});
    cells = []; start = end + 1; startLine = line + 1;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inside) {
      if (ch === '"') {if (text[i + 1] === '"') {cell += '"'; i++;} else {inside = false; closed = true;}}
      else {cell += ch; if (ch === '\n') line++;}
    } else if (ch === delimiter) endCell();
    else if (ch === '\n') {endRow(i); line++;}
    else if (ch === '"' && !cell.trim() && !closed) {cell = ''; inside = true;}
    else if (closed && !/\s/.test(ch)) {
      invalid.push({line: startLine, raw: text.slice(start, text.indexOf('\n', i) < 0 ? text.length : text.indexOf('\n', i)), reason: '引號結束後有額外字元，可能有欄位錯位'});
      cell += ch; closed = false;
    } else cell += ch;
  }
  if (inside) invalid.push({line: startLine, raw: text.slice(start), reason: '儲存格引號未關閉，無法確認資料列邊界'});
  else if (cells.length || cell || closed) endRow(text.length);
  return {records, invalid, stats: {blankRows, multilineCells, cleanedIdentifiers: 0}};
}
export const cleanPiIdentifier = value => String(value ?? '').replace(/^[\s\u200B\uFEFF]+|[\s\u200B\uFEFF]+$/g, '');
const date = value => {
  const s = String(value || '').trim(), m = s.match(/^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})$/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : s;
};
const containerHeader = /^(?:container(?:\s*(?:no\.?|number|#))?|貨櫃(?:號碼|編號)?)$/i;
const barcodeHeader = /^(?:jan(?:\s*code)?|barcode(?:\s*\/\s*jan)?|條碼|jan碼)$/i;
export function parsePiPaste(value, multi = false) {
  const grid = readPiGrid(value), invalid = [...grid.invalid], warnings = [], rows = [], groups = new Map();
  let shelfColumn = -1, headerWidth = 0;
  for (const record of grid.records) {
    const cols = record.cells, first = cleanPiIdentifier(cols[0]).toLowerCase();
    if (record === grid.records[0] && (multi ? containerHeader.test(first) : barcodeHeader.test(first))) {
      shelfColumn = cols.findIndex(v => /^(shelflife(?:months)?|保存期限(?:月|月份)?|固定保存期限(?:月|月份)?)$/i.test(v.replace(/[\s_\-\/()（）]/g, '')));
      headerWidth = cols.length; continue;
    }
    const offset = multi ? 2 : 0, values = {itemCode: cols[offset + 2] || '', barcode: cols[offset] || '', qty: cols[offset + 1] || '', unitPrice: cols[offset + 3] || ''};
    const fail = reason => invalid.push({line: record.line, raw: record.raw, values, reason});
    const max = Math.max(multi ? 8 : 6, headerWidth);
    if (cols.length < (multi ? 4 : 2) || cols.length > max) {fail(`欄位數異常：讀到 ${cols.length} 欄，請核對 Excel 是否有錯位或漏欄`); continue;}
    const identifier = (index, field) => {
      const before = String(cols[index] || ''), after = cleanPiIdentifier(before);
      if (after !== before) {grid.stats.cleanedIdentifiers++; warnings.push({line: record.line, field, before, after});}
      return after;
    };
    const barcodeRaw = identifier(offset, '條碼'), barcode = barcodeRaw.replace(/[ -]/g, '');
    const itemCode = identifier(offset + 2, '品號');
    const qtyRaw = cleanPiIdentifier(cols[offset + 1]), qty = Number(qtyRaw.replace(/,/g, ''));
    const priceRaw = cleanPiIdentifier(cols[offset + 3]), unitPrice = priceRaw === '' ? null : Number(priceRaw.replace(/[¥￥$, ]/g, ''));
    if (!/^\d{8,14}$/.test(barcode)) {fail('條碼須為 8～14 位數字；可能有換行、引號或欄位錯位'); continue;}
    if (itemCode && (!/^(?=.*[A-Za-z])[A-Za-z0-9][A-Za-z0-9_-]*$/.test(itemCode))) {fail('品號中間含換行、空白或不明字元，請人工確認'); continue;}
    if (!qtyRaw || /[\n\t"']/.test(qtyRaw) || !Number.isFinite(qty) || qty <= 0) {fail('箱數必須是有效正數，不能包含換行或引號'); continue;}
    if (/[\n\t"']/.test(priceRaw) || unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice < 0)) {fail('單價格式無效，請核對欄位'); continue;}
    const expiryDate = date(cols[offset + 4]);
    if (expiryDate && (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) || !Number.isFinite(Date.parse(expiryDate)) || new Date(expiryDate).toISOString().slice(0,10) !== expiryDate)) {fail('效期不是有效日期，請核對是否錯位'); continue;}
    const shelfRaw = cleanPiIdentifier(cols[shelfColumn >= 0 ? shelfColumn : offset + 5]);
    const legacyDate = shelfColumn < 0 && /^\d{4}[/.\-]\d{1,2}[/.\-]\d{1,2}$/.test(shelfRaw);
    const shelfLifeMonths = !shelfRaw || legacyDate ? null : Number(shelfRaw);
    if (shelfLifeMonths !== null && (!/^\d+$/.test(shelfRaw) || shelfLifeMonths < 1 || shelfLifeMonths > 120)) {fail('保存期限（月）須為 1～120 的整數'); continue;}
    const row = {barcode, itemCode, qty, unitPrice, expiryDate, shelfLifeMonths};
    if (!multi) rows.push(row);
    else {
      const container = identifier(0, '貨櫃號碼').toUpperCase(), supplier = cleanPiIdentifier(cols[1]);
      if (!container || /[\s"']/.test(container) || !supplier || /[\n\t]/.test(supplier)) {fail('貨櫃或廠商欄位無效'); continue;}
      if (groups.has(container) && groups.get(container).supplier !== supplier) {fail('同一貨櫃出現不同廠商，請確認'); continue;}
      if (!groups.has(container)) groups.set(container, {container, supplier, rows: []});
      groups.get(container).rows.push(row);
    }
  }
  return {rows, groups: [...groups.values()], invalid, warnings, stats: grid.stats};
}
export function isMultiPiPaste(text) {
  const first = readPiGrid(text).records[0]?.cells || [];
  if (containerHeader.test(cleanPiIdentifier(first[0]))) return true;
  return first.length >= 4 && !!first[1]?.trim() && /^\d{8,14}$/.test(String(first[2]).trim().replace(/[ -]/g, '')) && !/^\d{8,14}$/.test(String(first[0]).trim()) && Number(first[3]) > 0;
}
