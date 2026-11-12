// Use the same sales window and shipment cutoff for both the row and popover.
const DAY = 86400000;
const iso = t => new Date(t).toISOString().slice(0, 10);
const shiftMonths = (date, n) => {
  const [y, m, d] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return iso(Date.UTC(y, m - 1 + n, Math.min(d, last)));
};

// Arrival dates of actually received containers that carried this item, newest first.
export function receivedArrivals(code, pis = [], cutoff = '') {
  const dates = new Set();
  for (const pi of pis || [])
    if (pi?.received && pi.arrival && (!cutoff || pi.arrival <= cutoff) &&
        pi.rows?.some(r => r.code === code && r.qty > 0)) dates.add(pi.arrival);
  return [...dates].sort().reverse();
}

// Sum [positive qty, clearance qty] for one item over [start, end).
// Days covered by daily detail are exact; older days are prorated from their month.
export function salesBetween(details, code, start, end) {
  const total = [0, 0];
  if (!details || !start || !end || start >= end) return {gross: 0, clear: 0, estimated: false};
  const dailyStart = details.dailyStart || '';
  const daily = details.daily?.[code] || {};
  let estimated = false;
  const exactFrom = dailyStart && dailyStart > start ? dailyStart : start;
  if (dailyStart && exactFrom < end)
    for (const [date, [gross, clear]] of Object.entries(daily))
      if (date >= exactFrom && date < end) { total[0] += gross; total[1] += clear; }
  const monthlyEnd = dailyStart ? (dailyStart < end ? dailyStart : end) : end;
  if (start < monthlyEnd) {
    const months = details.series?.[code] || {};
    for (const [month, [gross, clear]] of Object.entries(months)) {
      const first = month + '-01', next = shiftMonths(first, 1);
      const from = first > start ? first : start, to = next < monthlyEnd ? next : monthlyEnd;
      if (from >= to) continue;
      const share = (Date.parse(to) - Date.parse(from)) / (Date.parse(next) - Date.parse(first));
      if (share < 1) estimated = true;
      total[0] += gross * share; total[1] += clear * share;
    }
  }
  return {gross: total[0], clear: total[1], estimated};
}

// 上批出清: the stock sold between the previous received arrival and the latest one.
// With a single arrival on record, the previous batch is what sold in the six months before it.
export function batchClearance(item, details, pis = []) {
  const cutoff = details?.cutoff || '';
  const arrivals = receivedArrivals(item.code, pis, cutoff);
  if (!cutoff || !arrivals.length) return {basis: 'none', arrivals};
  const end = arrivals[0];
  const start = arrivals[1] || shiftMonths(end, -6);
  const {gross, clear, estimated} = salesBetween(details, item.code, start, end);
  const share = gross > 0 ? clear / gross : null;
  return {basis: arrivals[1] ? 'between' : 'before', arrivals, start, end, gross, clear, share, estimated};
}

export function productIndicators(item, details, pis = []) {
  const batch = batchClearance(item, details, pis);
  const clearanceShare = batch.share ?? null;
  const clear = batch.clear || 0;
  const last = details?.lastSales?.[item.code] || '';
  const cutoff = details?.cutoff || '';
  const receipt = batch.arrivals?.[0] || '';
  const since = last > receipt ? last : receipt;
  const weeks = item.stock > 0 && since && cutoff
    ? Math.max(0, Math.floor((Date.parse(cutoff) - Date.parse(since)) / (7 * DAY))) : 0;
  return {clearanceShare, clearance: clearanceShare !== null && clearanceShare >= .3 - 1e-9, clear, batch, last, cutoff, since, weeks};
}
