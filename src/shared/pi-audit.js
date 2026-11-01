import {parseMYOBFactor} from '../planner/domain/units.js';
import {createProductResolver, validItemCode} from './product-identity.js';
import {cleanPiIdentifier} from './pi-paste.js';
export function auditPiData(data, inventory = {}) {
  const issues = [], resolve = createProductResolver(data), hasInventory = Object.keys(inventory).length > 0;
  for (const [key, pi] of Object.entries(data.finalPiContainers || {})) {
    const seen = new Set();
    for (const [index, row] of (pi.rows || []).entries()) {
      const add = (field, reason, suggestion) => issues.push({id: `${key}:${index}:${field}`, key, container: pi.container || key, index, field, reason, before: row[field], suggestion, row: structuredClone(row), baseline: JSON.stringify(pi.rows)});
      const clean = {};
      for (const field of ['itemCode', 'barcode']) {
        const original = String(row[field] ?? ''), trimmed = cleanPiIdentifier(original), after = cleanPiIdentifier(trimmed.replace(/^"+|"+$/g, ''));
        clean[field] = after;
        if (original !== after) {
          const valid = field === 'itemCode' ? validItemCode(after) : /^\d{8,14}$/.test(after);
          const fromBarcode = resolve({barcode: field === 'barcode' ? after : cleanPiIdentifier(String(row.barcode ?? '').replace(/^"+|"+$/g, ''))});
          const conflict = field === 'itemCode' && fromBarcode.code && fromBarcode.code !== after.toUpperCase();
          add(field, conflict ? '清理後品號與條碼配對衝突，須原 Excel 核對' : '前後有空白、換行或引號', valid && !conflict ? after : undefined);
        } else if (after && (field === 'itemCode' ? !validItemCode(after) : !/^\d{8,14}$/.test(after))) add(field, '格式異常，可能含中間換行或欄位錯位；不可猜測修正');
      }
      if (!clean.barcode) add('barcode', '缺少條碼，須原 Excel 核對');
      if (typeof row.qty !== 'number' || !Number.isFinite(row.qty) || row.qty <= 0) add('qty', '箱數不是有效正數，須核對原 Excel；不自動改數量');
      if (row.unitPrice !== null && row.unitPrice !== undefined && row.unitPrice !== '' && (typeof row.unitPrice !== 'number' || !Number.isFinite(row.unitPrice) || row.unitPrice < 0)) add('unitPrice', '單價格式異常，須核對原 Excel；不自動改價格');
      if (row.expiryDate) {
        const v = String(row.expiryDate).replace(/\//g, '-');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0,10) !== v) add('expiryDate', '效期格式異常，請人工核對');
      }
      const identity = resolve({...row, ...clean});
      if (identity.pending) add('identity', identity.ambiguous ? '條碼對到多個品號，請選擇對應商品' : '商品尚未配對主檔，請補入主檔或暫填資料');
      if (hasInventory && identity.code && parseMYOBFactor(inventory[identity.code]?.custom) === null) add('unit', '缺少或無法辨識 MYOB 採購單位，請到訂貨資料設定匯入核對');
      const duplicate = JSON.stringify([clean.itemCode, clean.barcode, row.qty, row.unitPrice, row.expiryDate]);
      if (seen.has(duplicate)) add('duplicate', '與本櫃另一列完全相同，可能重複；不自動刪除，請核對效期與原檔');
      seen.add(duplicate);
    }
  }
  return issues;
}
export function planPiRepairs(data, selected) {
  const changes = new Map();
  for (const issue of selected) {
    if (typeof issue.suggestion !== 'string' || !['itemCode', 'barcode'].includes(issue.field)) continue;
    const pi = data.finalPiContainers?.[issue.key];
    if (!pi || JSON.stringify(pi.rows) !== issue.baseline) throw Error('檢查後 PI 已有變更，請重新執行排查');
    if (!changes.has(issue.key)) changes.set(issue.key, {key: issue.key, baseline: issue.baseline, rows: structuredClone(pi.rows)});
    changes.get(issue.key).rows[issue.index][issue.field] = issue.suggestion;
  }
  return [...changes.values()];
}
export async function commitPiRepairs({runTransaction, db, ref, FieldPath, changes}) {
  if (!changes.length) return;
  await runTransaction(db, async tx => {
    const snapshot = await tx.get(ref), data = snapshot.exists() ? snapshot.data() : {};
    for (const c of changes) if (JSON.stringify(data.finalPiContainers?.[c.key]?.rows) !== c.baseline) throw Error('雲端 PI 已更新，已取消全部修正。請重新排查');
    const fields = changes.map(c => new FieldPath('finalPiContainers', c.key, 'rows'));
    tx.set(ref, {finalPiContainers: Object.fromEntries(changes.map(c => [c.key, {rows: c.rows}]))}, {mergeFields: fields});
  });
}
