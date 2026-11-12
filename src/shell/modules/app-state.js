// shell: app-state. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "app-state",
  "owns": [{
    "name": "unsubscribeData",
    "kind": "let"
  }, {
    "name": "PROD_DOC_REF",
    "kind": "const"
  }, {
    "name": "CONTAINER_TRACKER_REF",
    "kind": "const"
  }, {
    "name": "ORDER_PLANNER_REF",
    "kind": "const"
  }, {
    "name": "sharedOrderDrafts",
    "kind": "let"
  }, {
    "name": "unsubscribeOrderPlanner",
    "kind": "let"
  }, {
    "name": "proposalListenerInitialized",
    "kind": "let"
  }, {
    "name": "containerTrackerData",
    "kind": "let"
  }, {
    "name": "unsubscribeContainerTracker",
    "kind": "let"
  }, {
    "name": "TEST_LOCAL_KEY",
    "kind": "const"
  }, {
    "name": "currentDataMode",
    "kind": "let"
  }, {
    "name": "QUOTES_REF",
    "kind": "const"
  }, {
    "name": "PI_REF",
    "kind": "const"
  }, {
    "name": "storageState",
    "kind": "const"
  }],
  "imports": ["db", "doc"],
  "writes": ["CONTAINER_TRACKER_REF", "ORDER_PLANNER_REF", "PROD_DOC_REF", "QUOTES_REF", "PI_REF", "storageState", "TEST_LOCAL_KEY", "containerTrackerData", "currentDataMode", "proposalListenerInitialized", "sharedOrderDrafts", "unsubscribeContainerTracker", "unsubscribeData", "unsubscribeOrderPlanner"]
};
export function register(context) {}
export function initialize(context) {
  context.unsubscribeData = null;
  window.appData = {
    suppliers: ["SilkRoad", "Tencho"],
    mappings: {},
    products: {},
    itemToBarcode: {},
    quotes: [],
    masterImportBatches: [],
    finalPiContainers: {}
  };
  window.searchMode = 'single';
  // ==================== LIVE / TEST MODE ====================
  // LIVE is the default production mode and reads/writes Firestore main_config.
  // TEST is an isolated local browser copy. TEST can be refreshed from LIVE, but TEST is never written back to LIVE.
  context.PROD_DOC_REF = context.doc(context.db, "app_data", "main_config");
  // Storage v2 keeps quotes and Final PIs in their own documents (see shared/app-storage.js).
  context.QUOTES_REF = context.doc(context.db, "app_data", "quotes_v1");
  context.PI_REF = context.doc(context.db, "app_data", "pi_containers_v1");
  // split: the LIVE server already uses storage v2. Updated by the LIVE listener only.
  context.storageState = {split: false, loaded: false, error: ''};
  context.CONTAINER_TRACKER_REF = context.doc(context.db, "app_data", "container_tracker_v1");
  context.ORDER_PLANNER_REF = context.doc(context.db, "app_data", "order_planner_v1");
  context.sharedOrderDrafts = {};
  context.unsubscribeOrderPlanner = null;
  context.proposalListenerInitialized = false;
  context.containerTrackerData = {
    containers: []
  };
  context.unsubscribeContainerTracker = null;
  context.TEST_LOCAL_KEY = "japan_price_tracker_v4_test_data";
  context.currentDataMode = 'live';
}
