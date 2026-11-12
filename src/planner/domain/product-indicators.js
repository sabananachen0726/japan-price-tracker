// Use the same sales window and shipment cutoff for both the row and popover.
export function productIndicators(item, details, pis = []) {
  const [gross, clear] = details?.clearance?.[item.code] || [];
  const clearanceShare = gross > 0 ? clear / gross : null;
  const last = details?.lastSales?.[item.code] || '';
  const cutoff = details?.cutoff || '';
  let receipt = '';
  if (cutoff) for (const pi of pis)
    if (pi.received && pi.arrival && pi.arrival <= cutoff && pi.arrival > receipt &&
        pi.rows?.some(r => r.code === item.code && r.qty > 0)) receipt = pi.arrival;
  const since = last > receipt ? last : receipt;
  const weeks = item.stock > 0 && since && cutoff
    ? Math.max(0, Math.floor((Date.parse(cutoff) - Date.parse(since)) / 604800000)) : 0;
  return {clearanceShare, clearance: clearanceShare !== null && clearanceShare >= .3 - 1e-9, clear, last, cutoff, since, weeks};
}
