import { salesImportWorker } from "../domain/sales-worker.js";
// planner: sales-worker. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "sales-worker",
  "owns": [{
    "name": "salesImportWorker",
    "kind": "function"
  }],
  "imports": [],
  "writes": ["salesImportWorker"]
};
export function register(context) {
  context.salesImportWorker = salesImportWorker;
}
export function initialize(context) {}
