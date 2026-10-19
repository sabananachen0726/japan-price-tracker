// planner: customer-orders. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "customer-orders",
  "owns": [{
    "name": "bucket",
    "kind": "function"
  }, {
    "name": "activeOrders",
    "kind": "function"
  }, {
    "name": "orderNeed",
    "kind": "function"
  }],
  "imports": ["norm", "round", "state"],
  "writes": ["activeOrders", "bucket", "orderNeed"]
};
export function register(context) {
  context.bucket = function bucket(s) {
    let x = String(s ?? '').trim();
    if (/已出貨|已出舊貨/.test(x)) return 'hidden';
    if (/取消|不[須需]預[定訂]/.test(x)) return 'cancelled';
    return /^final$/i.test(x) ? 'final' : 'processing';
  };
  context.activeOrders = function activeOrders(item) {
    return context.state.orders.filter(o => context.norm(o.code) === item.code && !['hidden', 'cancelled'].includes(context.bucket(o.status)) && (o.qty === null || o.qty > 0));
  };
  context.orderNeed = function orderNeed(item) {
    const orders = context.activeOrders(item),
      lines = [];
    let total = 0,
      unknown = 0;
    for (const o of orders) {
      if (o.qty === null || !/^(CTN|箱|捆)$/i.test(String(o.unit || ''))) {
        unknown++;
        continue;
      }
      const qty = Number(o.qty);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      total += qty;
      lines.push({
        qty,
        container: context.norm(o.container),
        id: String(o.id || '')
      });
    }
    return {
      total: context.round(total),
      count: orders.length,
      unknown,
      lines
    };
  };
}
export function initialize(context) {}
