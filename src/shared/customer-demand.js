export const normalizeCode = value => String(value ?? '').trim().toUpperCase();
export function customerBucket(status) {
  const value = String(status ?? '').trim();
  if (/已出貨|已出舊貨/.test(value)) return 'hidden';
  if (/取消/.test(value)) return 'cancelled';
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
export const allocationContainer = value => normalizeCode(value).replace(/\s/g, '');
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
