import {allocationContainer, normalizeCode} from './customer-demand.js';

export const brisbaneDate = (now = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-AU', {
    timeZone:'Australia/Brisbane', year:'numeric', month:'2-digit', day:'2-digit'
  }).formatToParts(now).map(({type,value}) => [type,value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export function unlockDate(confirmedOn) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(confirmedOn)) throw Error('請填寫有效的確認日');
  const date = new Date(confirmedOn + 'T00:00:00Z');
  if (!Number.isFinite(+date) || date.toISOString().slice(0,10) !== confirmedOn) throw Error('請填寫有效的確認日');
  const year = date.getUTCFullYear(), month = date.getUTCMonth() + 4;
  const day = Math.min(date.getUTCDate(), new Date(Date.UTC(year,month+1,0)).getUTCDate());
  return new Date(Date.UTC(year,month,day)).toISOString().slice(0,10);
}

export function registerProtection(previous, {store, confirmedOn}, today) {
  store = String(store || '').trim();
  if (!store || store.length > 120) throw Error('請填寫店家名稱');
  const expiresOn = unlockDate(confirmedOn);
  if (confirmedOn > today) throw Error('確認日不能在未來');
  if (previous && previous.expiresOn > today && previous.store !== store) throw Error('同一品號已有其他店家的保護');
  if (previous && confirmedOn <= previous.confirmedOn) throw Error('續訂確認日須晚於上次確認日');
  return {store,confirmedOn,expiresOn,history:[...(previous?.history || []),{store,confirmedOn,expiresOn}]};
}

// The caller must read this state and persist the returned redemptions in the
// same trusted transaction as the order; failed writes must leave passes intact.
export function checkProtectedOrder({protections, passes, container, rows, today, isAdmin}) {
  const used = [];
  for (const [rawCode, qty] of Object.entries(rows || {})) {
    if (!(qty > 0)) continue;
    const code = normalizeCode(rawCode), protection = protections?.[code];
    if (!protection || protection.expiresOn <= today) continue;
    const pass = isAdmin && Object.values(passes || {}).find(p => p.id && !p.usedAt &&
      p.store === protection.store && p.confirmedOn === protection.confirmedOn &&
      normalizeCode(p.code) === code && allocationContainer(p.container) === allocationContainer(container) &&
      p.reason?.trim() && Number.isInteger(p.boxes) && p.boxes >= qty);
    if (!pass) throw Error(`${code}：客找保護中，${protection.expiresOn} 可訂。請移除訂量或由 Admin 核准此筆訂購。`);
    used.push(pass.id);
  }
  return used;
}

// Ordinary saves and restores must never replace the separately managed guard.
export function withoutProtection(data, FieldPath) {
  const {customerProtection, ...payload} = data;
  return [payload, {mergeFields:Object.keys(payload).map(key=>new FieldPath(key))}];
}
