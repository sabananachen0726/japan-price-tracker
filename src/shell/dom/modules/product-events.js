import {masterSearchKeys} from '../../../shared/master-search.js';
// shell/dom: product-events. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "product-events",
  "owns": [{
    "name": "masterSearchInput",
    "kind": "const"
  }, {
    "name": "btnSelectAllMasterFiltered",
    "kind": "const"
  }, {
    "name": "btnClearMasterSelection",
    "kind": "const"
  }, {
    "name": "btnDeleteSelectedMaster",
    "kind": "const"
  }, {
    "name": "masterPageSize",
    "kind": "const"
  }, {
    "name": "btnMasterPrev",
    "kind": "const"
  }, {
    "name": "btnMasterNext",
    "kind": "const"
  }],
  "imports": ["masterCurrentPage", "masterSearchTerm", "masterSelectedProducts", "rebuildItemToBarcode", "renderMasterTable", "saveFirebaseData", "updateMasterSelectionUI"],
  "writes": ["btnClearMasterSelection", "btnDeleteSelectedMaster", "btnMasterNext", "btnMasterPrev", "btnSelectAllMasterFiltered", "masterCurrentPage", "masterPageSize", "masterSearchInput", "masterSearchTerm"]
};
export function register(context) {}
export function initialize(context) {
  context.masterSearchInput = document.getElementById('masterSearchInput');
  if (context.masterSearchInput) context.masterSearchInput.oninput = () => {
    context.masterSearchTerm = context.masterSearchInput.value;
    context.masterCurrentPage = 1;
    context.renderMasterTable();
    context.updateMasterSelectionUI();
  };
  context.btnSelectAllMasterFiltered = document.getElementById('btnSelectAllMasterFiltered');
  if (context.btnSelectAllMasterFiltered) context.btnSelectAllMasterFiltered.onclick = () => {
    const term = (context.masterSearchTerm || '').trim().toLowerCase();
    masterSearchKeys(window.appData.products, window.appData.mappings, term).forEach(bc => context.masterSelectedProducts.add(bc));
    context.renderMasterTable();
    context.updateMasterSelectionUI();
  };
  context.btnClearMasterSelection = document.getElementById('btnClearMasterSelection');
  if (context.btnClearMasterSelection) context.btnClearMasterSelection.onclick = () => {
    context.masterSelectedProducts.clear();
    context.renderMasterTable();
    context.updateMasterSelectionUI();
  };
  context.btnDeleteSelectedMaster = document.getElementById('btnDeleteSelectedMaster');
  if (context.btnDeleteSelectedMaster) context.btnDeleteSelectedMaster.onclick = () => {
    const selected = [...context.masterSelectedProducts].filter(bc => window.appData.products?.[bc]);
    if (!selected.length) return;
    if (!confirm(`即將刪除 ${selected.length} 個商品主檔。\n\n只刪除商品主檔，不刪除歷史報價、Final PI 或 Container Tracker 資料。\n確定繼續？`)) return;
    selected.forEach(bc => delete window.appData.products[bc]);
    context.masterSelectedProducts.clear();
    context.rebuildItemToBarcode();
    context.saveFirebaseData();
    context.updateMasterSelectionUI();
  };
  context.masterPageSize = document.getElementById("masterPageSize");
  if (context.masterPageSize) {
    context.masterPageSize.onchange = () => {
      context.masterCurrentPage = 1;
      context.renderMasterTable();
    };
  }
  context.btnMasterPrev = document.getElementById("btnMasterPrev");
  if (context.btnMasterPrev) context.btnMasterPrev.onclick = () => {
    if (context.masterCurrentPage > 1) {
      context.masterCurrentPage--;
      context.renderMasterTable();
    }
  };
  context.btnMasterNext = document.getElementById("btnMasterNext");
  if (context.btnMasterNext) context.btnMasterNext.onclick = () => {
    context.masterCurrentPage++;
    context.renderMasterTable();
  };
}
