// shell/dom: system-settings-events. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "system-settings-events",
  "owns": [],
  "imports": ["cleanBarcode", "saveFirebaseData"],
  "writes": []
};
export function register(context) {}
export function initialize(context) {
  // 新增條碼綁定

  document.getElementById("btnAddMapping").onclick = function () {
    const primaryB = context.cleanBarcode(document.getElementById("mapPrimaryBarcode").value);
    const aliasB = context.cleanBarcode(document.getElementById("mapAliasBarcode").value);
    if (!primaryB || !aliasB) {
      alert("請填寫主要條碼與要綁定的關聯條碼！");
      return;
    }
    if (primaryB === aliasB) {
      alert("主要條碼與關聯條碼不能相同！");
      return;
    }
    if (!window.appData.mappings[primaryB]) {
      window.appData.mappings[primaryB] = [];
    }
    if (!window.appData.mappings[primaryB].includes(aliasB)) {
      window.appData.mappings[primaryB].push(aliasB);
      context.saveFirebaseData();
      document.getElementById("mapAliasBarcode").value = '';
      alert("關聯條碼綁定成功！");
    } else {
      alert("該關聯條碼已存在於綁定清單中！");
    }
  };
  // 儲存快速編輯商品主檔 Modal

  document.getElementById("btnSaveMasterEdit").onclick = function () {
    const bc = document.getElementById("editMasterPrimaryBarcode").value;
    const ic = document.getElementById("editMasterItemCode").value.trim();
    const nm = document.getElementById("editMasterName").value.trim();
    const img = document.getElementById("editMasterImgUrl").value.trim();
    if (!window.appData.products[bc]) {
      window.appData.products[bc] = {};
    }
    window.appData.products[bc].itemCode = ic;
    window.appData.products[bc].name = nm;
    window.appData.products[bc].imgUrl = img;
    if (ic) {
      window.appData.itemToBarcode[ic] = bc;
    }
    context.saveFirebaseData();
    bootstrap.Modal.getInstance(document.getElementById('editMasterModal')).hide();
  };
  // 新增廠商

  document.getElementById("btnAddSupplier").onclick = function () {
    const name = document.getElementById("newSupplierName").value.trim();
    if (!name) return;
    if (!window.appData.suppliers.includes(name)) {
      window.appData.suppliers.push(name);
      context.saveFirebaseData();
      document.getElementById("newSupplierName").value = '';
    } else {
      alert("該廠商名稱已存在！");
    }
  };
}
