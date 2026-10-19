// shell/dom: workbench-events. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "workbench-events",
  "owns": [],
  "imports": ["copySupplierOrders", "downloadMasterTemplate", "downloadQuoteTemplate", "exportPurchaseDecisionCSV", "renderCompareList", "renderPurchaseWorkbench", "updateWorkbenchTotals"],
  "writes": []
};
export function register(context) {}
export function initialize(context) {
  document.getElementById("btnClearBatchSearch").onclick = function () {
    document.getElementById("batchSearchInput").value = '';
    context.renderCompareList();
  };
  document.getElementById("btnExportPurchase").onclick = context.exportPurchaseDecisionCSV;
  document.getElementById("btnOpenWorkbench").onclick = context.renderPurchaseWorkbench;
  document.getElementById("purchaseWorkbenchContainer").addEventListener("change", e => {
    if (e.target.matches('.wb-qty,.wb-supplier')) context.updateWorkbenchTotals();
  });
  document.getElementById("purchaseWorkbenchContainer").addEventListener("input", e => {
    if (e.target.matches('.wb-qty')) context.updateWorkbenchTotals();
  });
  document.getElementById("purchaseWorkbenchContainer").addEventListener("click", e => {
    if (e.target.closest('#btnCopySupplierOrders')) context.copySupplierOrders();
    if (e.target.closest('#btnCloseWorkbench')) document.getElementById('purchaseWorkbenchContainer').innerHTML = '';
  });
  document.getElementById("btnDownloadTemplate").onclick = context.downloadQuoteTemplate;
  document.getElementById("btnDownloadMasterTemplate").onclick = context.downloadMasterTemplate;
}
