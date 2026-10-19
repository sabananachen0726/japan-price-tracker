// planner: incoming-stock. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "incoming-stock",
  "owns": [{
    "name": "allPis",
    "kind": "function"
  }, {
    "name": "containerNaturalCollator",
    "kind": "const"
  }, {
    "name": "parseContainerSortKey",
    "kind": "function"
  }, {
    "name": "compareContainerIds",
    "kind": "function"
  }, {
    "name": "incoming",
    "kind": "function"
  }, {
    "name": "allocationCode",
    "kind": "function"
  }, {
    "name": "piWithReservations",
    "kind": "function"
  }],
  "imports": ["norm", "round", "state", "trackerFeed"],
  "writes": ["allPis", "allocationCode", "compareContainerIds", "containerNaturalCollator", "incoming", "parseContainerSortKey", "piWithReservations"]
};
export function register(context) {
  context.allPis = function allPis() {
    const by = new Map();
    const source = Array.isArray(context.trackerFeed?.pis) ? context.trackerFeed.pis : context.state.pis || [];
    for (const p of source) if (context.norm(p.container)) by.set(context.norm(p.container), p);
    return [...by.values()];
  };
  context.parseContainerSortKey = function parseContainerSortKey(value) {
    const raw = String(value || '').trim().toUpperCase();
    const m = raw.match(/^(?:[A-Z]+)?(\d{2})B(\d{2})(\d{2})F?$/);
    if (m) return {
      year: Number(m[1]),
      month: Number(m[2]),
      seq: Number(m[3]),
      raw
    };
    const tail = raw.match(/(\d{2})(\d{2})(\d{2})F?$/);
    if (tail) return {
      year: Number(tail[1]),
      month: Number(tail[2]),
      seq: Number(tail[3]),
      raw
    };
    return null;
  };
  context.compareContainerIds = function compareContainerIds(a, b) {
    const pa = context.parseContainerSortKey(a),
      pb = context.parseContainerSortKey(b);
    if (pa && pb) return pa.year - pb.year || pa.month - pb.month || pa.seq - pb.seq || context.containerNaturalCollator.compare(String(a || '').trim(), String(b || '').trim());
    if (pa) return -1;
    if (pb) return 1;
    return context.containerNaturalCollator.compare(String(a || '').trim(), String(b || '').trim());
  };
  context.incoming = function incoming(item, arrival, current) {
    let sum = 0;
    const details = [];
    for (const p of context.allPis()) {
      if (p.received || context.norm(p.container) === context.norm(current)) continue;
      const amount = (p.rows || []).filter(r => context.norm(r.code) === item.code || context.norm(r.code).startsWith('__JAN_') && r.barcode && r.barcode === item.barcode).reduce((n, r) => n + (Number(r.qty) || 0), 0);
      if (amount <= 0) continue;
      const qty = context.round(amount);
      sum += qty;
      details.push({
        container: p.container,
        qty,
        version: p.version || p.versionLabel || (p.isFinal ? 'Final' : '未 Final'),
        eta: p.eta || '',
        etaEstimated: !!p.etaEstimated
      });
    }
    details.sort((a, b) => context.compareContainerIds(a.container, b.container));
    return {
      sum: context.round(sum),
      details,
      undated: 0,
      estimated: 0
    };
  };
  context.allocationCode = function allocationCode(value) {
    const raw = context.norm(value).replace(/\s+/g, '');
    return /^[A-Z]{3}\d{2}B\d{4}(?:F)?$/.test(raw) ? raw : '';
  };
  context.piWithReservations = function piWithReservations(pi, ord) {
    const groups = new Map(pi.details.map(d => [context.norm(d.container), {
      ...d,
      reserved: 0
    }]));
    let unallocated = 0,
      unmatched = 0;
    for (const o of ord.lines || []) {
      const code = context.allocationCode(o.container),
        target = code ? groups.get(code) : null;
      if (target) target.reserved += o.qty;else if (!code) unallocated += o.qty;else unmatched += o.qty;
    }
    return {
      details: [...groups.values()],
      unallocated: context.round(unallocated),
      unmatched: context.round(unmatched)
    };
  };
}
export function initialize(context) {
  context.containerNaturalCollator = new Intl.Collator('zh-Hant', {
    numeric: true,
    sensitivity: 'base'
  });
}
