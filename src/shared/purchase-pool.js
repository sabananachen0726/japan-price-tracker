// 處理中 (purchase pool): submitted sales requests that have no PI yet.
// Lives in app_data/order_planner_v1 under `pool.requests.<name>`. Lines are keyed
// by item code, never by container, because the request name (JXX26B0301) is not
// the container a PI later arrives under (JSR26B0301, JTC26B0302 ...).
import {activeCustomerOrder, allocationContainer, normalizeCode} from './customer-demand.js';

export const POOL_STALE_DAYS = 60;
export const POOL_PRUNE_DAYS = 120;
export const CANCEL_REASONS = {moq: 'MOQ 不足', discontinued: '停產', seasonal: '季節結束'};

const num = value => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
export const poolKey = normalizeCode;

export function coveredQty(line) {
  return Object.values(line?.covered || {}).reduce((n, q) => n + num(q), 0);
}
export function lineRemaining(line) {
  return Math.max(0, num(line?.qty) - coveredQty(line) - num(line?.cancelled?.qty));
}
export function requestRemaining(request) {
  return Object.values(request?.lines || {}).reduce((n, line) => n + lineRemaining(line), 0);
}
export function requestLines(request) {
  return Object.entries(request?.lines || {}).map(([code, line]) => ({
    code, ...line, covered: line.covered || {}, coveredQty: coveredQty(line), remaining: lineRemaining(line)
  }));
}
// Boxes sent to the supplier for each item: own quantity plus Final customer orders.
export function submissionTotals(work = {}) {
  const totals = {};
  for (const [code, q] of Object.entries(work.rows || {})) if (num(q)) totals[poolKey(code)] = (totals[poolKey(code)] || 0) + num(q);
  for (const [code, stores] of Object.entries(work.customerFinal || {})) {
    const add = Object.values(stores || {}).reduce((n, q) => n + num(q), 0);
    if (add) totals[poolKey(code)] = (totals[poolKey(code)] || 0) + add;
  }
  return totals;
}
// Create or refresh a request from a submitted work order. Coverage and
// cancellations already recorded are kept; removed items with no history go.
export function requestFromSubmission(existing, work, {name, at, by}) {
  const totals = submissionTotals(work), lines = {};
  const old = existing?.lines || {};
  for (const code of new Set([...Object.keys(old), ...Object.keys(totals)])) {
    const before = old[code] || {}, qty = totals[code] || 0;
    if (!qty && !coveredQty(before) && !num(before.cancelled?.qty)) continue;
    const line = {qty};
    const label = String(work.snapshot?.[code]?.name || before.name || '').slice(0, 80);
    if (label) line.name = label;
    if (Object.keys(before.covered || {}).length) line.covered = {...before.covered};
    if (before.cancelled) line.cancelled = {...before.cancelled};
    if (before.carried) line.carried = before.carried;
    lines[code] = line;
  }
  const request = {name: poolKey(name), submittedAt: existing?.submittedAt || at, submittedBy: existing?.submittedBy || by || '', updatedAt: at, lines};
  return request;
}
// Pending boxes for one item, excluding the request currently being edited.
export function pendingFor(pool, code, exclude = '') {
  const key = poolKey(code), skip = poolKey(exclude), out = [];
  for (const [name, request] of Object.entries(pool?.requests || {})) {
    if (poolKey(name) === skip) continue;
    const remaining = lineRemaining(request.lines?.[key]);
    if (remaining > 0) out.push({request: poolKey(name), qty: remaining, submittedAt: request.submittedAt || ''});
  }
  return out.sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)) || a.request.localeCompare(b.request));
}
const clone = value => JSON.parse(JSON.stringify(value ?? null));
// Undo whatever a PI container covered (re-import or PI deletion).
export function revertContainer(request, container) {
  const key = poolKey(container), next = clone(request);
  let changed = false;
  for (const line of Object.values(next.lines || {})) {
    if (line.covered && Object.hasOwn(line.covered, key)) {
      delete line.covered[key];
      if (!Object.keys(line.covered).length) delete line.covered;
      changed = true;
    }
  }
  return changed ? next : null;
}
// Match one PI container (totals by item code) against open lines, oldest
// request first. A PI short of the request leaves the difference pending.
export function planPiCoverage(pool, container, piTotals, {at} = {}) {
  const key = poolKey(container), requests = {}, touched = new Set();
  for (const [name, request] of Object.entries(pool?.requests || {})) {
    const reverted = revertContainer(request, key);
    requests[name] = reverted || clone(request);
    if (reverted) touched.add(name);
  }
  const order = Object.keys(requests).sort((a, b) => String(requests[a].submittedAt || '').localeCompare(String(requests[b].submittedAt || '')) || a.localeCompare(b));
  const matches = [];
  for (const [rawCode, qty] of Object.entries(piTotals || {})) {
    const code = poolKey(rawCode);
    let left = num(qty);
    for (const name of order) {
      if (left <= 0) break;
      const line = requests[name].lines?.[code];
      const take = Math.min(left, lineRemaining(line));
      if (take <= 0) continue;
      line.covered = {...(line.covered || {}), [key]: take};
      left -= take;
      touched.add(name);
      matches.push({request: name, code, qty: take});
    }
  }
  const updates = {};
  for (const name of touched) {
    updates[name] = {...requests[name], ...(at ? {updatedAt: at} : {})};
    if (requestRemaining(updates[name]) > 0) delete updates[name].completedAt;
    else updates[name].completedAt ||= at || '';
  }
  return {updates, matches};
}
export function summarizeMatches(matches) {
  const by = new Map();
  for (const m of matches) {
    const row = by.get(m.request) || {request: m.request, items: 0, qty: 0};
    row.items += 1; row.qty += m.qty;
    by.set(m.request, row);
  }
  return [...by.values()];
}
// 結案: each still-pending line is carried to next time or cancelled with a reason.
export function closeRequest(request, decisions, {at, by}) {
  const next = clone(request);
  for (const [code, line] of Object.entries(next.lines || {})) {
    const remaining = lineRemaining(line);
    if (remaining <= 0) continue;
    const choice = decisions?.[code] || 'carry';
    if (choice === 'carry') line.carried = at;
    else if (CANCEL_REASONS[choice]) {
      line.cancelled = {qty: num(line.cancelled?.qty) + remaining, reason: choice, at, by: by || ''};
      delete line.carried;
    }
  }
  next.closedAt = at;
  next.closedBy = by || '';
  next.updatedAt = at;
  if (requestRemaining(next) <= 0) next.completedAt ||= at;
  return next;
}
const dayNumber = value => {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null;
};
export function ageDays(from, today) {
  const a = dayNumber(from), b = dayNumber(today);
  return a === null || b === null ? null : Math.max(0, Math.round(b - a));
}
// Finished requests drop out of the document after a while to keep it small.
export function prunable(pool, today) {
  return Object.entries(pool?.requests || {}).filter(([, r]) => requestRemaining(r) <= 0 && ageDays(r.completedAt || r.updatedAt, today) >= POOL_PRUNE_DAYS).map(([name]) => name);
}
// Customer orders still written against the request name for items a PI already took.
export function staleCustomerOrders(request, orders) {
  const key = allocationContainer(request?.name);
  if (!key || !Array.isArray(orders)) return [];
  return orders.filter(o => activeCustomerOrder(o) && allocationContainer(o.container) === key && coveredQty(request.lines?.[poolKey(o.code)]) > 0);
}
