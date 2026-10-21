import { parseMYOBFactor } from "../domain/units.js";
// planner: units. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "units",
  "owns": [{
    "name": "persist",
    "kind": "function"
  }, {
    "name": "today",
    "kind": "const"
  }, {
    "name": "dayDiff",
    "kind": "const"
  }, {
    "name": "round",
    "kind": "const"
  }, {
    "name": "fmt",
    "kind": "const"
  }, {
    "name": "norm",
    "kind": "const"
  }, {
    "name": "trackedItem",
    "kind": "const"
  }, {
    "name": "photo",
    "kind": "const"
  }, {
    "name": "parseMYOBFactor",
    "kind": "function"
  }, {
    "name": "factorInfo",
    "kind": "function"
  }, {
    "name": "factor",
    "kind": "function"
  }, {
    "name": "val",
    "kind": "function"
  }, {
    "name": "shelfLife",
    "kind": "function"
  }],
  "imports": ["IMAGE_MAP", "monthlyInfo", "state", "storeLocal", "trackerFeed"],
  "writes": ["dayDiff", "factor", "factorInfo", "fmt", "norm", "parseMYOBFactor", "persist", "photo", "round", "shelfLife", "today", "trackedItem", "val"]
};
export function register(context) {
  context.persist = function persist() {
    context.storeLocal();
  };
  context.parseMYOBFactor = parseMYOBFactor;
  context.factorInfo = function factorInfo(item) {
    const raw = String(context.state.inventory?.[item.code]?.custom || '').trim();
    const value = context.parseMYOBFactor(raw);
    return {value, raw, source: value === null ? '缺少 MYOB 採購單位' : 'MYOB', updatedAt: context.state.myobImportedAt || ''};
  };
  context.factor = function factor(item) {
    return context.factorInfo(item).value;
  };
  context.val = function val(item, key) {
    if (key === 'monthly') return context.monthlyInfo(item).value;
    let o = context.state.overrides[item.code];
    return o && Object.prototype.hasOwnProperty.call(o, key) ? o[key] : item[key];
  };
  context.shelfLife = function shelfLife(item) {
    const n = context.val(item, 'shelfLifeMonths');
    return Number.isInteger(n) && n > 0 && n <= 120 ? n : null;
  };
}
export function initialize(context) {
  context.today = () => new Date().toLocaleDateString('en-CA', {
    timeZone: 'Australia/Brisbane'
  });
  context.dayDiff = (a, b) => Math.max(0, (new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
  context.round = n => Math.round(n * 100) / 100;
  context.fmt = n => n == null ? '—' : Number(n).toLocaleString('en-AU', {
    maximumFractionDigits: 2
  });
  context.norm = x => String(x ?? '').trim().toUpperCase();
  context.trackedItem = i => context.trackerFeed?.products?.[i.code] || null;
  context.photo = i => {
    let u = context.trackedItem(i)?.imgUrl || i.imgUrl || context.IMAGE_MAP[i.code] || '';
    return /^https:\/\//i.test(u) ? u : '';
  };
}
