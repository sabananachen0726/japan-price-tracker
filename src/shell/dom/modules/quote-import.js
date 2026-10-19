// shell/dom: quote-import. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "quote-import",
  "owns": [{
    "name": "renderMasterImportHistory",
    "kind": "function"
  }],
  "imports": ["cleanBarcode", "escapeHtml", "getTimestampString", "resolveToPrimaryBarcode", "saveFirebaseData", "upsertContainerQuote"],
  "writes": ["renderMasterImportHistory"]
};
export function register(context) {
  context.renderMasterImportHistory = function renderMasterImportHistory() {
    const box = document.getElementById('masterImportHistory');
    if (!box) return;
    const batches = window.appData.masterImportBatches || [];
    if (!batches.length) {
      box.innerHTML = '<span class="text-muted">尚無可復原的匯入紀錄。</span>';
      return;
    }
    box.innerHTML = batches.slice().reverse().map(b => `
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 border-top py-2">
            <div><b>${context.escapeHtml(b.fileName || '未命名檔案')}</b><br><span class="text-muted">${context.escapeHtml(b.importedAt || '')}｜新增 ${b.addCount || 0}｜更新 ${b.updateCount || 0}</span></div>
            <button class="btn btn-sm btn-outline-danger btnRollbackMasterBatch" data-batch-id="${b.id}"><i class="fa-solid fa-rotate-left me-1"></i>復原此批匯入</button>
          </div>`).join('');
  };
}
export function initialize(context) {
  // 批次匯入報價 (CSV / TXT)

  document.getElementById("btnImportBatchCSV").onclick = function () {
    const fileInput = document.getElementById("batchQuoteCSVFile");
    const encoding = document.getElementById("quoteEncodingSelect").value;
    if (!fileInput.files.length) {
      alert("請先選擇要匯入的 CSV 或 TXT 檔案！");
      return;
    }
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function (e) {
      const text = e.target.result;
      const lines = text.split(/\r?\n/);
      const previewRows = [];
      lines.forEach((line, idx) => {
        if (idx === 0 && (line.includes("JAN") || line.includes("Barcode") || line.includes("條碼"))) return;
        if (!line.trim()) return;
        const cols = line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(c => c.replace(/^\"|\"$/g, '').trim());
        if (cols.length >= 4) previewRows.push(cols);
      });
      const badBarcode = previewRows.filter(c => !context.cleanBarcode(c[0])).length;
      const unknownSupplier = previewRows.filter(c => c[3] && !(window.appData.suppliers || []).includes(c[3])).length;
      const zeroPrice = previewRows.filter(c => (parseFloat(c[4]) || 0) === 0).length;
      const msg = `匯入預覽：\n總列數：${previewRows.length}\nBarcode 空白：${badBarcode}\n未登記廠商：${unknownSupplier}\n¥0 / Pending / 停產：${zeroPrice}\n\n確認要繼續匯入嗎？`;
      if (!confirm(msg)) return;
      let addedCount = 0,
        updatedCount = 0,
        skippedCount = 0;
      lines.forEach((line, idx) => {
        if (idx === 0 && (line.includes("JAN") || line.includes("Barcode") || line.includes("條碼"))) return;
        const cols = line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(c => c.replace(/^"|"$/g, '').trim());
        if (cols.length >= 4) {
          const bc = context.cleanBarcode(cols[0]);
          const ic = cols[1] || '';
          const nm = cols[2] || '';
          const sup = cols[3] || window.appData.suppliers[0] || 'SilkRoad';
          const pr = parseFloat(cols[4]) || 0;
          const ctn = cols[5] || 'BATCH_' + context.getTimestampString();
          const note = cols[6] || '';
          if (bc) {
            let primaryB = context.resolveToPrimaryBarcode(bc);
            if (!window.appData.products[primaryB]) {
              window.appData.products[primaryB] = {
                itemCode: ic,
                name: nm,
                imgUrl: ''
              };
            } else {
              if (ic && !window.appData.products[primaryB].itemCode) window.appData.products[primaryB].itemCode = ic;
              if (nm && !window.appData.products[primaryB].name) window.appData.products[primaryB].name = nm;
            }
            if (ic) window.appData.itemToBarcode[ic] = primaryB;
            const result = context.upsertContainerQuote({
              barcode: bc,
              itemCode: ic,
              supplier: sup,
              price: pr,
              container: ctn,
              note,
              date: new Date().toISOString().split('T')[0]
            });
            if (result.action === 'added') addedCount++;else if (result.action === 'updated') updatedCount++;else skippedCount++;
          }
        }
      });
      context.saveFirebaseData();
      alert(`匯入完成！\n新增：${addedCount} 筆\n價格更新：${updatedCount} 筆（自動備註「價錢更新」）\n重複跳過：${skippedCount} 筆`);
      fileInput.value = '';
    };
    if (encoding === 'auto' || encoding === 'utf-8') {
      reader.readAsText(file, 'UTF-8');
    } else {
      reader.readAsText(file, encoding);
    }
  };
}
