import {customerBucket, activeCustomerOrder, customerBoxes, allocationContainer} from '../../shared/customer-demand.js';
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
    return customerBucket(s);
  };
  context.activeOrders = function activeOrders(item) {
    return context.state.orders.filter(o => context.norm(o.code) === item.code && activeCustomerOrder(o));
  };
  // Orders for the container being written are not extra demand: Final orders are
  // submitted on top of its quantity and 已分配貨櫃 comes out of it.
  context.orderNeed = function orderNeed(item, current = '') {
    const own = allocationContainer(current);
    const orders = context.activeOrders(item).filter(o => !own || allocationContainer(o.container) !== own),
      lines = [];
    let total = 0,
      unknown = 0;
    for (const o of orders) {
      if (customerBoxes(o) === null) {
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
