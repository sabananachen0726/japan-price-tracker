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
