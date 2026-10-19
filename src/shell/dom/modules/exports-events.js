// shell/dom: exports-events. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "exports-events",
  "owns": [],
  "imports": ["exportMasterProductsToCSV", "exportToCSV"],
  "writes": []
};
export function register(context) {}
export function initialize(context) {
  // 匯出完整系統備份與主檔

  document.getElementById("btnExportCSV").onclick = context.exportToCSV;
  document.getElementById("btnExportMasterCSV").onclick = context.exportMasterProductsToCSV;
}
