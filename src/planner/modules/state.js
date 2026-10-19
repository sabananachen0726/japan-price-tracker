// planner: state. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "state",
  "owns": [{
    "name": "SEED",
    "kind": "const"
  }, {
    "name": "IMAGE_MAP",
    "kind": "const"
  }, {
    "name": "KEY",
    "kind": "const"
  }, {
    "name": "ELIGIBLE_SOURCE_ORDER",
    "kind": "const"
  }, {
    "name": "REVIEW_SEED_LOOKUP",
    "kind": "const"
  }, {
    "name": "$",
    "kind": "const"
  }, {
    "name": "esc",
    "kind": "const"
  }, {
    "name": "initial",
    "kind": "const"
  }, {
    "name": "plannerRole",
    "kind": "let"
  }, {
    "name": "trackerFeed",
    "kind": "let"
  }, {
    "name": "state",
    "kind": "let"
  }, {
    "name": "dirtyDrafts",
    "kind": "let"
  }, {
    "name": "scopedKey",
    "kind": "const"
  }, {
    "name": "loadScoped",
    "kind": "function"
  }],
  "imports": [],
  "writes": ["$", "ELIGIBLE_SOURCE_ORDER", "IMAGE_MAP", "KEY", "REVIEW_SEED_LOOKUP", "SEED", "dirtyDrafts", "esc", "initial", "loadScoped", "plannerRole", "scopedKey", "state", "trackerFeed"]
};
export function register(context) {
  context.loadScoped = function loadScoped(mode) {
    try {
      let s = JSON.parse(localStorage.getItem(context.scopedKey(mode)));
      return Array.isArray(s?.items) ? s : context.initial();
    } catch {
      return context.initial();
    }
  };
}
export function initialize(context) {
  context.SEED = JSON.parse(document.getElementById('seed').textContent);
  context.IMAGE_MAP = Object.fromEntries(context.SEED.items.map(x => [x.code, x.imgUrl]));
  context.KEY = 'kaisi_order_planner_prototype_v1';
  context.ELIGIBLE_SOURCE_ORDER = ['整理 Excel', 'Final PI', '商品主檔'];
  context.REVIEW_SEED_LOOKUP = new Map(context.SEED.items.map(item => [item.code, item]));
  context.$ = id => document.getElementById(id);
  context.esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
  context.initial = () => ({
    items: structuredClone(context.SEED.items),
    orders: structuredClone(context.SEED.orders),
    pis: [],
    drafts: {},
    overrides: {},
    meta: {
      myob: 'MYOB 提供的快照',
      orders: 'HTML 內附的 421 筆快照',
      pi: '尚未匯入 PI'
    },
    rules: {
      dry: 1,
      frozen: 6,
      coverage: 1
    }
  });
  context.plannerRole = 'viewer';
  context.trackerFeed = null;
  context.state = context.initial();
  context.dirtyDrafts = new Set();
  context.scopedKey = mode => context.KEY + '_tracker_' + mode;
}
