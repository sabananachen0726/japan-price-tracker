// planner: purchase-calculation. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "purchase-calculation",
  "owns": [{
    "name": "calc",
    "kind": "function"
  }, {
    "name": "currentKey",
    "kind": "function"
  }, {
    "name": "draft",
    "kind": "function"
  }, {
    "name": "getItems",
    "kind": "function"
  }],
  "imports": ["$", "customerSourceReady", "dayDiff", "factor", "incoming", "norm", "orderNeed", "round", "state", "today", "trackerFeed", "val"],
  "writes": ["calc", "currentKey", "draft", "getItems"]
};
export function register(context) {
  context.calc = function calc(item) {
    let f = context.factor(item),
      stock = typeof item.stock === 'number' && f ? item.stock / f : null,
      monthly = context.val(item, 'monthly'),
      safety = context.val(item, 'safety'),
      arrival = context.$('arrival').value || context.today(),
      months = context.dayDiff(context.today(), arrival) / 30.44,
      coverage = Math.max(0, +context.$('coverage').value || 0),
      ord = context.orderNeed(item),
      pi = context.incoming(item, arrival, context.$('container').value);
    let valid = f !== null && stock !== null && typeof monthly === 'number' && monthly >= 0;
    let before = valid ? monthly * months : null,
      after = valid ? monthly * coverage : null;
    let available = context.trackerFeed?.mode !== 'live' || context.customerSourceReady ? context.round(pi.sum - ord.total) : null;
    let raw = valid && available !== null ? Math.max(0, before + after + (typeof safety === 'number' ? safety : 0) - stock - available) : null;
    let issues = [context.trackerFeed?.mode === 'live' && !context.customerSourceReady ? '客訂尚未取得（建議量暫不計算）' : null, stock === null ? 'MYOB 庫存待確認' : null, item.kind === 'unknown' ? '貨別待確認' : null, !f ? '換算待確認' : null, monthly == null ? '月銷待設定' : null, safety == null ? '安全庫存待設定' : null, ord.unknown ? '客訂單位待確認' : null, null].filter(Boolean);
    return {
      f,
      stock,
      monthly,
      safety,
      months,
      before,
      after,
      ord,
      pi,
      available,
      suggest: raw === null ? null : Math.ceil(raw - 1e-9),
      issues
    };
  };
  context.currentKey = function currentKey() {
    return context.norm(context.$('container').value) || '__未命名草稿__';
  };
  context.draft = function draft() {
    return context.state.drafts[context.currentKey()] || {
      kind: context.$('kind').value,
      arrival: context.$('arrival').value,
      coverage: +context.$('coverage').value,
      rows: {}
    };
  };
  context.getItems = function getItems() {
    return context.state.items.filter(i => i.availability === 'active' && i.kind === context.$('kind').value);
  };
}
export function initialize(context) {}
