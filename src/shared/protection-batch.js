import {registerProtection} from './customer-protection.js';

const CODE = /^[A-Z0-9_-]{1,60}$/;
const HEADER = /^(品號|料號|item\s*code|item\s*no|itemno|code|sku)$/i;

// Accepts DD/MM/YYYY (Australian order), D/M/YYYY, DD.MM.YYYY, YYYY-MM-DD and YYYY/MM/DD.
export function parsePasteDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  let y, m, d, hit;
  if ((hit = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) [, y, m, d] = hit;
  else if ((hit = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) [, d, m, y] = hit;
  else return null;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const date = new Date(iso + 'T00:00:00Z');
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

// One item code per line, a whole Excel column, or several codes separated by
// commas/spaces. Tab-separated rows may add a store and a confirmation date.
export function parseProtectionPaste(text, defaults = {}) {
  const rows = [];
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    if (!raw.trim() || HEADER.test(raw.split('\t')[0].trim())) continue;
    if (raw.includes('\t')) {
      const [code = '', store = '', date = ''] = raw.split('\t').map(x => x.trim());
      if (!code || HEADER.test(code)) continue;
      const parsed = parsePasteDate(date);
      rows.push({code: code.toUpperCase(), store: store || defaults.store || '',
        confirmedOn: date ? parsed : defaults.confirmedOn || '', dateText: date});
    } else {
      for (const code of raw.split(/[\s,，、;；]+/).filter(Boolean)) {
        if (HEADER.test(code)) continue;
        rows.push({code: code.toUpperCase(), store: defaults.store || '', confirmedOn: defaults.confirmedOn || '', dateText: ''});
      }
    }
  }
  return rows;
}

const dmy = iso => iso ? iso.split('-').reverse().join('/') : '';

// Decide, row by row, what saving would do. Nothing here writes; rows marked
// ok carry the exact record that will be stored for that item code.
export function planProtectionBatch(rows, protections = {}, today, action = 'register') {
  const seen = new Set();
  return rows.map(row => {
    const out = {...row, ok: false, message: ''};
    if (!CODE.test(row.code) || row.code.startsWith('__')) return {...out, message: '品號格式不正確'};
    if (seen.has(row.code)) return {...out, message: '重複，已在上面出現'};
    seen.add(row.code);
    if (row.confirmedOn === null) return {...out, message: `確認日「${row.dateText}」無法辨識`};
    const prior = protections?.[row.code];
    const active = prior && prior.expiresOn > today;
    try {
      if (action === 'renew') {
        if (!prior) return {...out, message: '尚未登記保護，請改用「新登記」'};
        if (row.store && row.store !== prior.store) return {...out, message: `原保護店家是「${prior.store}」，續訂不能改店家`};
        const next = registerProtection(prior, {store: prior.store, confirmedOn: row.confirmedOn}, today);
        return {...out, store: prior.store, ok: true, kind: 'renew', next, expiresOn: next.expiresOn,
          message: `續訂：${dmy(prior.expiresOn)} → ${dmy(next.expiresOn)} 可訂`};
      }
      if (active) return {...out, message: prior.store === row.store
        ? `已由同店保護至 ${dmy(prior.expiresOn)}，若是新一批請改用「續訂」`
        : `已由「${prior.store}」保護至 ${dmy(prior.expiresOn)}，同時只能保護一家店`};
      const next = registerProtection(prior, {store: row.store, confirmedOn: row.confirmedOn}, today);
      return {...out, ok: true, kind: 'register', next, expiresOn: next.expiresOn,
        message: `${dmy(next.expiresOn)} 起可訂${prior ? '（之前的保護已到期）' : ''}`};
    } catch (err) {
      return {...out, message: err.message};
    }
  });
}
