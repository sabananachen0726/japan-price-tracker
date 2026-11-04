// shell/dom: container-quote-events. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "container-quote-events",
  "owns": [],
  "imports": ["requestDataDeletion","activeManagedContainer", "renderContainerManager", "saveFirebaseData", "updateContainerSelectionInfo"],
  "writes": ["activeManagedContainer"]
};
export function register(context) {}
export function initialize(context) {
  // 查看 / 管理特定貨櫃內容

  document.getElementById("btnManageContainer").onclick = function () {
    const ctn = document.getElementById("selectContainerToDelete").value;
    if (!ctn) {
      alert("請先選擇貨櫃號碼！");
      return;
    }
    context.activeManagedContainer = ctn;
    document.getElementById('containerItemSearch').value = '';
    context.renderContainerManager();
  };
  document.getElementById('containerItemSearch').addEventListener('input', context.renderContainerManager);
  document.getElementById('btnSelectAllContainerItems').onclick = function () {
    document.querySelectorAll('.container-item-check').forEach(c => c.checked = true);
    context.updateContainerSelectionInfo();
  };
  document.getElementById('btnClearContainerSelection').onclick = function () {
    document.querySelectorAll('.container-item-check').forEach(c => c.checked = false);
    context.updateContainerSelectionInfo();
  };
  document.getElementById('btnDeleteSelectedContainerItems').onclick = function () {
    const ids = [...document.querySelectorAll('.container-item-check:checked')].map(c => c.dataset.quoteId);
    if (!ids.length) return;
    context.requestDataDeletion({container:context.activeManagedContainer,quoteIds:ids});
  };
  document.getElementById('selectContainerToDelete').addEventListener('change', function () {
    context.activeManagedContainer = '';
    document.getElementById('containerManagerPanel').classList.add('d-none');
  });
  // 批次刪除特定貨櫃報價

  document.getElementById("btnDeleteByContainer").onclick = function () {
    const ctn = document.getElementById("selectContainerToDelete").value;
    if (!ctn) {
      alert("請選擇要刪除的貨櫃號碼！");
      return;
    }
    context.requestDataDeletion({container:ctn,types:['quotes']});
  };
}
