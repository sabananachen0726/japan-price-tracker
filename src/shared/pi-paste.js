// Excel clipboard TSV and CSV both allow quoted cells containing line breaks.
export function readPiGrid(value, {singleColumn = false} = {}) {
  const text = String(value || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  let quoted = false, delimiter = singleColumn ? '\t' : ',';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') {if (quoted && text[i + 1] === '"') i++; else quoted = !quoted;}
    if (!quoted && text[i] === '\t') {delimiter = '\t'; break;}
  }
  const records = [], invalid = [];
  let cells = [], cell = '', inside = false, closed = false, line = 1, startLine = 1, start = 0, blankRows = 0, multilineCells = 0;
  const endCell = () => {if (cell.includes('\n')) multilineCells++; cells.push(cell); cell = ''; closed = false;};
  const endRow = end => {
    endCell();
    if (!singleColumn && cells.every(v => !v.trim())) {blankRows++;}
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
export function parsePiExpiry(value) {
  const s = cleanPiIdentifier(value).normalize('NFKC').replace(/\s*([/.\-])\s*/g, '$1');
  if (!s) return {iso: '', monthOnly: false};
  const sep = String.raw`[/.\-]`;
  let m, year, month, day;
  if ((m = s.match(new RegExp(`^(\\d{4})${sep}(\\d{1,2})${sep}(\\d{1,2})$`)))) [, year, month, day] = m;
  else if ((m = s.match(new RegExp(`^(\\d{1,2})${sep}(\\d{1,2})${sep}(\\d{4})$`)))) [, day, month, year] = m;
  else if ((m = s.match(new RegExp(`^(\\d{4})${sep}(\\d{1,2})$`)))) [, year, month] = m;
  else if ((m = s.match(new RegExp(`^(\\d{1,2})${sep}(\\d{4})$`)))) [, month, year] = m;
  else if ((m = s.match(/^(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?$/))) [, year, month, day] = m;
  else return null;
  if (+year < 1000 || +month < 1 || +month > 12) return null;
  const lastDay = new Date(Date.UTC(+year, +month, 0)).getUTCDate();
  if (day !== undefined && (+day < 1 || +day > lastDay)) return null;
  return {iso: `${year}-${month.padStart(2,'0')}-${String(day ?? lastDay).padStart(2,'0')}`, monthOnly: day === undefined};
}
export function formatPiExpiry(value) {
  const iso = parsePiExpiry(value)?.iso;
  return iso ? iso.split('-').reverse().join('/') : String(value ?? '');
}
const containerHeader = /^(?:container(?:no|number|#)?|貨櫃(?:號碼|編號)?|櫃號)$/i;
const barcodeHeader = /^(?:jancode|jan|barcode(?:jan)?|條碼|jan碼|バーコード)$/i;
export const piFields = [
  ['barcode','JAN／條碼',barcodeHeader], ['qty','箱數',/^(?:qty(?:ctn|cartons?)?|quantity(?:ctn|cartons?)?|ctns?|cartons?|箱數|箱数|數量|数量)$/i],
  ['itemCode','品號',/^(?:item(?:code|no|number)|sku|productcode|品號|品番|商品編號|商品コード)$/i],
  ['unitPrice','單包價',/^(?:unitprice(?:jpy)?|price|單包價|單價|単価)$/i],
  ['expiry','效期',/^(?:expiry(?:date)?|expiration(?:date)?|bestbefore(?:date)?|bbd|效期|有效期限|到期日|賞味期限|消費期限)$/i],
  ['shelf','保存期限（月）',/^(?:shelflife(?:months)?|(?:固定)?保存期限(?:月|月份)?)$/i]
];
export const piMultiFields = [['container','貨櫃號碼',containerHeader], ['supplier','廠商',/^(?:supplier(?:name)?|vendor(?:name)?|廠商|供應商)$/i], ...piFields];
const headerKey = value => cleanPiIdentifier(value).normalize('NFKC').replace(/[\s_./\-()（）:：]/g, '');
export function suggestPiColumns(cells, multi) {
  return (multi ? piMultiFields : piFields).map(([, , pattern]) => {
    const matches = cells.map((value, index) => pattern.test(headerKey(value)) ? index : -1).filter(index => index >= 0);
    return matches.length === 1 ? matches[0] : -1;
  });
}
export function parsePiPaste(value, multi = false, options = {}) {
  const grid = typeof value === 'string' ? readPiGrid(value) : value, invalid = [...grid.invalid], warnings = [], rows = [], groups = new Map();
  const first = grid.records[0]?.cells || [];
  const suggested = suggestPiColumns(first, multi);
  const offset = multi ? 2 : 0;
  const startsWithData = /^\d{8,14}$/.test(cleanPiIdentifier(first[offset]).replace(/[ -]/g, ''));
  const hasHeader = options.hasHeader ?? (!startsWithData && (suggested[offset] >= 0 || suggested.filter(index => index >= 0).length >= 2));
  const mapping = options.mapping ?? (hasHeader ? suggested : null);
  if (mapping && [...(multi ? [0, 1] : []), offset, offset + 1].some(i => mapping[i] < 0)) {
    invalid.push({line: grid.records[0]?.line ?? 1, raw: grid.records[0]?.raw || '', reason: '未辨認所有必填欄位，請使用「自訂欄位」指定'});
    return {rows, groups: [], invalid, warnings, stats: grid.stats};
  }
  if (hasHeader && !options.mapping) {
    const assigned = new Set(mapping);
    const skipped = first.filter((_, index) => !assigned.has(index));
    if (skipped.length) warnings.push({line: grid.records[0].line, field:'未匯入欄位（可返回使用「自訂欄位」）', before:skipped.map(v => v.trim() || '無欄名').join('、'), after:'略過'});
  }
  for (const record of grid.records) {
    if (hasHeader && record === grid.records[0]) continue;
    const cols = mapping ? mapping.map(index => record.cells[index] ?? '') : record.cells;
    const values = {itemCode: cols[offset + 2] || '', barcode: cols[offset] || '', qty: cols[offset + 1] || '', unitPrice: cols[offset + 3] || ''};
    const fail = reason => invalid.push({line: record.line, raw: record.raw, values, reason});
    if (hasHeader && !options.mapping && record.cells.length > first.length) {fail('資料列比欄名多，請核對欄位是否錯位或使用「自訂欄位」'); continue;}
    if (!mapping && (cols.length < offset + 2 || cols.length > offset + 6)) {fail(`欄位數異常：讀到 ${cols.length} 欄，請核對 Excel 是否有錯位或漏欄`); continue;}
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
    const expiry = parsePiExpiry(cols[offset + 4]);
    if (!expiry) {fail('效期不是有效日期，請核對是否錯位'); continue;}
    const expiryDate = expiry.iso;
    if (expiry.monthOnly) warnings.push({line: record.line, field: '效期（已補月底）', before: cols[offset + 4], after: formatPiExpiry(expiryDate)});
    const shelfRaw = cleanPiIdentifier(cols[offset + 5]);
    const legacyDate = !mapping && /^\d{4}[/.\-]\d{1,2}[/.\-]\d{1,2}$/.test(shelfRaw);
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
  const [container, supplier] = suggestPiColumns(first, true);
  if (container >= 0 && (supplier >= 0 || container === 0)) return true;
  return first.length >= 4 && !!first[1]?.trim() && /^\d{8,14}$/.test(String(first[2]).trim().replace(/[ -]/g, '')) && !/^\d{8,14}$/.test(String(first[0]).trim()) && Number(first[3]) > 0;
}

export function readPiColumns(values) {
  const invalid = [];
  const columns = values.map((value, i) => {
    const grid = readPiGrid(value, {singleColumn: true});
    const label = piFields[i][1];
    for (const issue of grid.invalid) invalid.push({...issue, reason: `${label}：${issue.reason}`});
    for (const r of grid.records) if (r.cells.length > 1) invalid.push({line:r.line, raw:r.raw, reason:`${label}一次只能貼一欄`});
    const rows = grid.records.map(r => r.cells[0]);
    if (piFields[i][2].test(headerKey(rows[0]))) rows.shift();
    return rows;
  });
  const size = Math.max(...columns.map(c => c.length));
  for (const [i, column] of columns.entries()) if (column.length && column.length !== size) invalid.push({
    line: Math.min(size, column.length) + 1, raw: '', reason: `${piFields[i][1]}有 ${column.length} 列，其他欄最多有 ${size} 列。請複製相同的 Excel 列範圍（包含空白格），或將整個選填欄留空。`
  });
  const records = Array.from({length: size}, (_, i) => {
    const cells = columns.map(c => c[i] ?? '');
    return {cells, line: i + 1, raw: cells.join('｜')};
  }).filter(r => r.cells.some(v => v.trim()));
  return {records, invalid, stats:{blankRows:size - records.length, multilineCells:columns.flat().filter(v => v.includes('\n')).length, cleanedIdentifiers:0}};
}
