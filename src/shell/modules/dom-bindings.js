// shell: dom-bindings. Declare dependencies here when adding cross-feature calls.
import { initializeDomFeatures } from "../dom/bootstrap.js";
export const definition = {
  "id": "dom-bindings",
  "owns": [],
  "imports": ["CONTAINER_TRACKER_REF", "activeManagedContainer", "auth", "cleanBarcode", "containerTrackerData", "copySupplierOrders", "currentDataMode", "downloadFinalPiTemplate", "downloadMasterTemplate", "downloadQuoteTemplate", "escapeFinalPiText", "escapeHtml", "events", "exportFinalPiBatch", "exportMasterProductsToCSV", "exportPurchaseDecisionCSV", "exportToCSV", "finalPiBatchSnapshot", "getTimestampString", "importFinalPi", "importFinalPiMulti", "isAdmin", "looksLikeFinalPiMulti", "masterCurrentPage", "masterSearchTerm", "masterSelectedProducts", "migrateBarcodeReferences", "normalizeAppData", "normalizeContainerNo", "normalizeItemCode", "readFinalPiBatchFile", "rebuildItemToBarcode", "refreshUI", "renderCompareList", "renderContainerIntegrationCheck", "renderContainerManager", "renderFinalPiBatchSearch", "renderFinalPiSearch", "renderMasterTable", "renderPurchaseWorkbench", "resolveToPrimaryBarcode", "restoreCompleteBackup412", "saveFirebaseData", "sendContainerSnapshot", "sendPlannerSnapshot", "setDoc", "showAppToast", "updateContainerSelectionInfo", "updateMasterSelectionUI", "updateWorkbenchTotals", "upsertContainerQuote"],
  "writes": ["activeManagedContainer", "containerTrackerData", "finalPiBatchSnapshot", "masterCurrentPage", "masterSearchTerm"]
};
export function register(context) {}
export function initialize(context) {
  // 事件監聽綁定
  document.addEventListener("DOMContentLoaded", () => {
    initializeDomFeatures(context);
  });
}
