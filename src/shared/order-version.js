import {brisbaneDate, checkProtectedOrder, checkProtectedFinal} from './customer-protection.js';
// Comments and product snapshots are independent of the editable purchase proposal.
const canonical = value => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export function editableOrder(work = {}) {
  work ||= {};
  return {kind: work.kind || 'dry', arrival: work.arrival || '', coverage: Number(work.coverage) || 0,
    rows: {...(work.rows || {})}, itemNotes: {...(work.itemNotes || {})}};
}
export function orderVersion(work) {
  if (!work) return 'missing';
  return JSON.stringify(canonical({...editableOrder(work), revision: work.revision || '',
    updatedAt: work.updatedAt || '', submittedBy: work.submittedBy || '',
    preparedAt: work.preparedAt || '', preparedBy: work.preparedBy || ''}));
}
export function sameOrder(a, b) {
  return JSON.stringify(canonical(editableOrder(a))) === JSON.stringify(canonical(editableOrder(b)));
}
export function orderDifferences(local, remote) {
  const a = editableOrder(local), b = editableOrder(remote), rows = [];
  for (const key of ['kind', 'arrival', 'coverage']) if (a[key] !== b[key]) rows.push({field: key, key, local: a[key], remote: b[key]});
  for (const field of ['rows', 'itemNotes']) for (const key of [...new Set([...Object.keys(a[field]), ...Object.keys(b[field])])].sort()) {
    if (a[field][key] !== b[field][key]) rows.push({field, key, local: a[field][key], remote: b[field][key]});
  }
  return rows;
}
export function reconcileOrder(local, remote, selected) {
  const next = {...(remote || {}), ...editableOrder(remote)};
  for (const [index, row] of orderDifferences(local, remote).entries()) if (selected.has(index)) {
    if (row.field === 'rows' || row.field === 'itemNotes') {
      if (row.local === undefined) delete next[row.field][row.key];
      else next[row.field][row.key] = row.local;
    } else next[row.field] = row.local;
  }
  return next;
}
export async function commitOrderDraft({runTransaction, db, ref, code, cleaned, expectedVersion, FieldPath, protection}) {
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    const current = (snapshot.exists() ? snapshot.data().drafts?.[code] : null) || null;
    if (typeof expectedVersion !== 'string' || expectedVersion !== orderVersion(current)) {
      throw Object.assign(new Error('此工作單已有更新，請先比較版本；本機草稿仍保留'), {code: 'order-conflict', latest: current});
    }
    if (protection) {
      const guard = await transaction.get(protection.ref);
      if (!guard.exists()) throw new Error('尚未取得客找保護設定，請稍後再提交');
      const {protections, passes} = protection.field ? guard.data()[protection.field] || {} : guard.data();
      const now = protection.now ?? new Date();
      checkProtectedFinal({protections, customerFinal: cleaned.customerFinal, today: brisbaneDate(now)});
      const redeemed = checkProtectedOrder({
        protections, passes, container:code, rows:cleaned.rows,
        today:brisbaneDate(now), isAdmin:protection.isAdmin
      });
      if (redeemed.length) {
        const used = Object.fromEntries(redeemed.map(id => [id, {
          usedAt:now.toISOString(), usedBy:protection.uid, revision:cleaned.revision
        }]));
        transaction.set(protection.ref, protection.field ? {[protection.field]:{passes:used}} : {passes:used}, {
          mergeFields:redeemed.flatMap(id => Object.keys(used[id]).map(field => new FieldPath(...(protection.field ? [protection.field] : []),'passes',id,field)))
        });
      }
    }
    transaction.set(ref, {drafts: {[code]: cleaned}}, {
      mergeFields: Object.keys(cleaned).map(field => new FieldPath('drafts', code, field))
    });
    return {...(current || {}), ...cleaned};
  });
}
