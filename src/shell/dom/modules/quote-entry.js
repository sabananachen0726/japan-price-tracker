// shell/dom: quote-entry. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "quote-entry",
  "owns": [{
    "name": "fillManualProduct",
    "kind": "function"
  }, {
    "name": "autoFillManualFromBarcode",
    "kind": "function"
  }, {
    "name": "autoFillManualFromItemCode",
    "kind": "function"
  }],
  "imports": ["cleanBarcode", "resolveToPrimaryBarcode", "saveFirebaseData", "upsertContainerQuote"],
  "writes": ["autoFillManualFromBarcode", "autoFillManualFromItemCode", "fillManualProduct"]
};
export function register(context) {
  context.fillManualProduct = function fillManualProduct(primaryB) {
    const p = window.appData.products?.[primaryB];
    if (!p) return false;
    document.getElementById('inputBarcode').value = primaryB || '';
    document.getElementById('inputItemCode').value = p.itemCode || '';
    document.getElementById('inputName').value = p.name || '';
    document.getElementById('inputImgUrl').value = p.imgUrl || '';
    return true;
  };
  context.autoFillManualFromBarcode = function autoFillManualFromBarcode() {
    const raw = context.cleanBarcode(document.getElementById('inputBarcode').value);
    if (!raw) return;
    context.fillManualProduct(context.resolveToPrimaryBarcode(raw));
  };
  context.autoFillManualFromItemCode = function autoFillManualFromItemCode() {
    const raw = document.getElementById('inputItemCode').value.trim();
    if (!raw) return;
    const direct = window.appData.itemToBarcode?.[raw] || window.appData.itemToBarcode?.[raw.toUpperCase()] || '';
    if (direct) context.fillManualProduct(context.resolveToPrimaryBarcode(direct));
  };
}
export function initialize(context) {
  document.getElementById('inputBarcode')?.addEventListener('change', context.autoFillManualFromBarcode);
  document.getElementById('inputBarcode')?.addEventListener('blur', context.autoFillManualFromBarcode);
  document.getElementById('inputItemCode')?.addEventListener('change', context.autoFillManualFromItemCode);
  document.getElementById('inputItemCode')?.addEventListener('blur', context.autoFillManualFromItemCode);
  // 單筆新增報價表單

  document.getElementById("priceForm").onsubmit = function (e) {
    e.preventDefault();
    const barcode = context.cleanBarcode(document.getElementById("inputBarcode").value);
    const itemCode = document.getElementById("inputItemCode").value.trim();
    const name = document.getElementById("inputName").value.trim();
    const imgUrl = document.getElementById("inputImgUrl").value.trim();
    const supplier = document.getElementById("inputSupplier").value;
    const price = parseFloat(document.getElementById("inputPrice").value) || 0;
    const container = document.getElementById("inputContainer").value.trim();
    const note = document.getElementById("inputNote").value.trim();
    if (!barcode || !supplier || !container) {
      alert("請填寫必填欄位 (Barcode, 廠商, 貨櫃號碼)");
      return;
    }
    let primaryB = context.resolveToPrimaryBarcode(barcode);
    if (!window.appData.products[primaryB]) {
      window.appData.products[primaryB] = {
        itemCode: itemCode,
        name: name,
        imgUrl: imgUrl
      };
    } else {
      if (itemCode && !window.appData.products[primaryB].itemCode) window.appData.products[primaryB].itemCode = itemCode;
      if (name && !window.appData.products[primaryB].name) window.appData.products[primaryB].name = name;
      if (imgUrl && !window.appData.products[primaryB].imgUrl) window.appData.products[primaryB].imgUrl = imgUrl;
    }
    if (itemCode) {
      window.appData.itemToBarcode[itemCode] = primaryB;
    }
    const manualResult = context.upsertContainerQuote({
      barcode,
      itemCode,
      supplier,
      price,
      container,
      note,
      date: new Date().toISOString().split('T')[0]
    });
    context.saveFirebaseData();
    const status = document.getElementById('lastManualQuoteStatus');
    if (status) {
      const shownItem = itemCode || window.appData.products?.[primaryB]?.itemCode || barcode;
      status.innerHTML = `<i class="fa-solid fa-circle-check me-2"></i><strong>上一筆已錄入</strong>　${shownItem} ｜ ${supplier} ｜ ¥${price} ｜ 貨櫃 ${container}`;
      status.classList.remove('d-none');
    }
    // 連續錄入模式：留在本頁，並保留廠商與貨櫃號碼
    const keepSupplier = supplier;
    const keepContainer = container;
    document.getElementById("inputBarcode").value = '';
    document.getElementById("inputItemCode").value = '';
    document.getElementById("inputName").value = '';
    document.getElementById("inputImgUrl").value = '';
    document.getElementById("inputPrice").value = '';
    document.getElementById("inputNote").value = '';
    document.getElementById("inputSupplier").value = keepSupplier;
    document.getElementById("inputContainer").value = keepContainer;
    document.getElementById("inputBarcode").focus();
    const btn = this.querySelector('button[type="submit"]');
    const oldText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check me-1"></i>已新增，可繼續下一筆';
    btn.classList.remove('btn-secondary');
    btn.classList.add('btn-success');
    setTimeout(() => {
      btn.innerHTML = oldText;
      btn.classList.remove('btn-success');
      btn.classList.add('btn-secondary');
    }, 1200);
  };
}
