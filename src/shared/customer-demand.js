export const normalizeCode = value => String(value ?? '').trim().toUpperCase();
export function customerBucket(status) {
  const value = String(status ?? '').trim();
  if (/已出貨|已出舊貨/.test(value)) return 'hidden';
  if (/取消/.test(value)) return 'cancelled';
  // 已分配貨櫃: stock from the container's own order handed to a store, not extra demand.
  if (/已分配貨櫃/.test(value)) return 'allocated';
  return /^final$/i.test(value) ? 'final' : 'processing';
}
export function activeCustomerOrder(order) {
  return !['hidden', 'cancelled'].includes(customerBucket(order.status)) &&
    (order.qty === null || order.qty === undefined || !Number.isFinite(Number(order.qty)) || Number(order.qty) > 0);
}
export function customerBoxes(order) {
  if (order.qty === null || order.qty === undefined || String(order.qty).trim() === '' || !/^(CTN|箱|捆)$/i.test(String(order.unit || '').trim())) return null;
  const qty = Number(order.qty);
  return Number.isFinite(qty) && qty >= 0 ? qty : null;
}
export function summarizeDemand(rows, codes) {
  if (!Array.isArray(rows)) return {rows: [], total: null, unknown: 0};
  const wanted = new Set([...codes].map(normalizeCode));
  const selected = rows.filter(order => wanted.has(normalizeCode(order.code)) && activeCustomerOrder(order));
  return {rows: selected, total: selected.reduce((sum, order) => sum + (customerBoxes(order) ?? 0), 0), unknown: selected.filter(order => customerBoxes(order) === null).length};
}
// Container numbers match on letters and digits only: JSR27B-0101 is JSR27B0101.
export const allocationContainer = value => normalizeCode(value).replace(/[^A-Z0-9]/g, '');
export function allocatePiDemand(rows, codes, containers) {
  const selected = summarizeDemand(rows, codes), assigned = new Map(containers.map(c => [allocationContainer(c), []])), unassigned = [], other = [];
  for (const order of selected.rows) {
    const key = allocationContainer(order.container);
    if (!key) unassigned.push(order);
    else if (assigned.has(key)) assigned.get(key).push(order);
    else other.push(order);
  }
  const summarize = list => ({rows: list, total: list.reduce((n, o) => n + (customerBoxes(o) ?? 0), 0), unknown: list.filter(o => customerBoxes(o) === null).length});
  return {ready: Array.isArray(rows), assigned: new Map([...assigned].map(([key, list]) => [key, summarize(list)])), unassigned: summarize(unassigned), other: summarize(other)};
}

// This display index is deliberately separate from the planner's submitted quantities.
export function indexContainerCustomerOrders(orders, container) {
  const byCode = new Map(), key = allocationContainer(container);
  if (!key) return byCode;
  for (const order of orders || []) {
    if (allocationContainer(order.container) !== key || !activeCustomerOrder(order)) continue;
    const code = normalizeCode(order.code);
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, {totals:new Map(), stores:new Map(), unknown:0});
    const item = byCode.get(code);
    const unit = customerBoxes(order) !== null ? '箱' : normalizeCode(order.unit) || '單位未填';
    const qty = Number(order.qty);
    if (order.qty == null || !String(order.qty).trim() || !Number.isFinite(qty) || qty <= 0) {
      item.unknown++;
      continue;
    }
    const store = String(order.customer || '').trim() || '店家未填';
    if (!item.stores.has(store)) item.stores.set(store, new Map());
    const storeTotals = item.stores.get(store);
    storeTotals.set(unit, (storeTotals.get(unit) || 0) + qty);
    item.totals.set(unit, (item.totals.get(unit) || 0) + qty);
  }
  return byCode;
}

// The planner's customer column for one container. Final orders are added on top of
// the container's own quantity; 已分配貨櫃 is already part of it; anything else is
// still being processed and is only counted. During customer protection only the
// protected store's Final orders may be added.
export function splitContainerCustomerOrders(orders, container, {protections = {}, today = ''} = {}) {
  const byCode = new Map(), key = allocationContainer(container);
  if (!key) return byCode;
  const blank = () => ({boxes: 0, stores: new Map(), nonBox: []});
  for (const order of orders || []) {
    if (allocationContainer(order.container) !== key || !activeCustomerOrder(order)) continue;
    const code = normalizeCode(order.code);
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, {final: blank(), allocated: blank(), blocked: blank(), processing: {count: 0, stores: new Set()}, unknown: 0});
    const item = byCode.get(code), bucket = customerBucket(order.status);
    const store = String(order.customer || '').trim() || '店家未填';
    if (bucket === 'processing') { item.processing.count++; item.processing.stores.add(store); continue; }
    const qty = Number(order.qty);
    if (order.qty == null || !String(order.qty).trim() || !Number.isFinite(qty) || qty <= 0) { item.unknown++; continue; }
    const protection = protections?.[code];
    const held = bucket === 'final' && protection && protection.expiresOn > today && protection.store !== store;
    const group = held ? item.blocked : item[bucket];
    const boxes = customerBoxes(order);
    if (boxes === null) { group.nonBox.push({store, qty, unit: String(order.unit || '').trim() || '單位未填'}); continue; }
    group.boxes += boxes;
    group.stores.set(store, (group.stores.get(store) || 0) + boxes);
  }
  return byCode;
}

// What a submission adds on top of the container's own quantities: Final boxes by store.
export function finalAddOn(split) {
  const out = {};
  for (const [code, item] of split) if (item.final.boxes > 0) out[code] = Object.fromEntries(item.final.stores);
  return out;
}
