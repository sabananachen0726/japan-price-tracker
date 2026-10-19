import { SalesCore } from "../domain/sales-core.js";
// planner: sales-core. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "sales-core",
  "owns": [{
    "name": "SalesCore",
    "kind": "const"
  }],
  "imports": [],
  "writes": ["SalesCore"]
};
export function register(context) {}
export function initialize(context) {
  context.SalesCore = SalesCore;
}
