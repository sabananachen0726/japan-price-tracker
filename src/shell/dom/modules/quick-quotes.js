// shell/dom: quick-quotes. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "quick-quotes",
  "owns": [{
    "name": "btnQuickBatchImport",
    "kind": "const"
  }, {
    "name": "btnSaveQuickQuote",
    "kind": "const"
  }],
  "imports": ["cleanBarcode", "normalizeContainerNo", "renderCompareList", "resolveToPrimaryBarcode", "saveFirebaseData", "showAppToast", "upsertContainerQuote"],
  "writes": ["btnQuickBatchImport", "btnSaveQuickQuote"]
};
export function register(context) {}
export function initialize(context) {
  context.btnQuickBatchImport = document.getElementById('btnQuickBatchImport');
  if (context.btnQuickBatchImport) context.btnQuickBatchImport.onclick = async function () {
    const supplier = document.getElementById('quickBatchSupplier').value;
    const containerNo = document.getElementById('quickBatchContainer').value.trim();
    const raw = document.getElementById('quickBatchText').value.trim();
    if (!supplier || !containerNo || !raw) return alert('請先選廠商、填貨櫃號碼，再貼上報價資料。');
    const lines = raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const parsed = [],
      invalid = [];
    let newProductCount = 0;
    for (const line of lines) {
      let parts = line.includes('\t') ? line.split('\t') : line.includes(',') ? line.split(',') : line.split(/\s+/);
      parts = parts.map(x => String(x || '').trim());
      const key = parts[0] || '';
      const priceText = parts[1] || '';
      const note = parts.slice(2).join(' ').trim();
      if (!key || priceText === '') {
        invalid.push(line);
        continue;
      }
      const price = parseFloat(String(priceText).replace(/[¥$,]/g, ''));
      if (Number.isNaN(price)) {
        invalid.push(line);
        continue;
      }
      const cleanKey = context.cleanBarcode(key);
      const normalizedItem = key.trim().toUpperCase();
      let primaryB = context.resolveToPrimaryBarcode(cleanKey);
      if (!window.appData.products?.[primaryB]) {
        primaryB = window.appData.itemToBarcode?.[key] || window.appData.itemToBarcode?.[normalizedItem] || '';
      }
      let isNewProduct = false;
      if (!primaryB || !window.appData.products?.[primaryB]) {
        isNewProduct = true;
        const looksLikeJan = /^\d{8,14}$/.test(cleanKey);
        primaryB = looksLikeJan ? cleanKey : `PENDING_ITEM_${normalizedItem}`;
        if (!window.appData.products[primaryB]) {
          window.appData.products[primaryB] = {
            itemCode: looksLikeJan ? '' : key.trim(),
            name: '⚠️ 待補商品資料',
            imgUrl: '',
            pendingProduct: true
          };
          if (!looksLikeJan) window.appData.itemToBarcode[normalizedItem] = primaryB;
          newProductCount++;
        }
      }
      parsed.push({
        primaryB,
        key,
        price,
        note,
        isNewProduct
      });
    }
    if (!parsed.length) return alert('沒有可以匯入的有效資料。\n請確認第一欄是 Item Code 或 JAN、第二欄是價格。');
    const existingCount = parsed.length - newProductCount;
    let msg = `準備錄入 ${parsed.length} 筆報價\n✓ ${existingCount} 筆已存在商品\n🆕 ${newProductCount} 筆為新商品，將建立「待補商品資料」\n廠商：${supplier}\n貨櫃：${containerNo}`;
    if (invalid.length) msg += `\n\n⚠️ ${invalid.length} 筆格式或價格無效，將略過。`;
    if (!confirm(msg + '\n\n確定繼續？')) return;
    const today = new Date().toISOString().split('T')[0];
    let added = 0,
      updated = 0,
      skipped = 0;
    parsed.forEach(r => {
      const p = window.appData.products[r.primaryB] || {};
      const result = context.upsertContainerQuote({
        barcode: r.primaryB,
        itemCode: p.itemCode || '',
        supplier,
        price: r.price,
        container: containerNo,
        note: r.note,
        date: today
      });
      if (result.action === 'added') added++;else if (result.action === 'updated') updated++;else skipped++;
    });
    await context.saveFirebaseData();
    document.getElementById('quickBatchText').value = '';
    document.getElementById('quickBatchHint').innerHTML = `<span class="text-success fw-bold">✓ 新增報價 ${added} 筆｜更新價格 ${updated} 筆｜跳過重複 ${skipped} 筆｜建立新商品 ${newProductCount} 筆</span>` + (invalid.length ? `；另有 ${invalid.length} 筆格式無效` : '');
    context.renderCompareList();
  };
  // 商品價格比對頁：快速錄入 Modal，儲存後留在原頁

  context.btnSaveQuickQuote = document.getElementById('btnSaveQuickQuote');
  if (context.btnSaveQuickQuote) context.btnSaveQuickQuote.onclick = async function () {
    const barcode = document.getElementById('quickQuoteBarcode').value;
    const supplier = document.getElementById('quickQuoteSupplier').value;
    const priceRaw = document.getElementById('quickQuotePrice').value;
    const containerNo = document.getElementById('quickQuoteContainer').value.trim();
    const note = document.getElementById('quickQuoteNote').value.trim();
    if (!barcode || !supplier || priceRaw === '' || !containerNo) return alert('請填寫廠商、價格與貨櫃號碼。');
    const price = parseFloat(priceRaw) || 0;
    const primaryB = context.resolveToPrimaryBarcode(barcode);
    const p = window.appData.products?.[primaryB] || {};
    const quickResult = context.upsertContainerQuote({
      barcode,
      itemCode: p.itemCode || '',
      supplier,
      price,
      container: containerNo,
      note,
      date: new Date().toISOString().split('T')[0]
    });
    const keepScrollY = window.scrollY;
    const saveBtn = this;
    const oldBtnHtml = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>儲存中...';
    const ok = await context.saveFirebaseData();
    if (!ok) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = oldBtnHtml;
      context.showAppToast('✕ 報價儲存失敗，資料尚未成功寫入', 'danger');
      return;
    }
    const modalEl = document.getElementById('quickQuoteModal');
    const modal = bootstrap.Modal.getInstance(modalEl) || bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.hide();
    context.showAppToast(`${quickResult.action === 'skipped' ? '↷ 同品項同貨櫃同價格，已跳過' : quickResult.action === 'updated' ? '✓ 價格已更新（已加註價錢更新）' : '✓ 報價已成功儲存'}｜${p.itemCode || barcode}｜${supplier}｜¥${price}｜${context.normalizeContainerNo(containerNo)}`, quickResult.action === 'skipped' ? 'warning' : 'success');
    context.renderCompareList();
    requestAnimationFrame(() => window.scrollTo({
      top: keepScrollY,
      behavior: 'auto'
    }));
    setTimeout(() => {
      saveBtn.disabled = false;
      saveBtn.innerHTML = oldBtnHtml;
    }, 300);
  };
}
