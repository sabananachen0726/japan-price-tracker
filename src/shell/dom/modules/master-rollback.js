// shell/dom: master-rollback. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "master-rollback",
  "owns": [],
  "imports": ["currentDataMode", "decompressMasterUndo", "isAdmin", "masterCurrentPage", "masterSelectedProducts", "migrateBarcodeReferences", "normalizeItemCode", "rebuildItemToBarcode", "refreshUI", "renderMasterImportHistory", "saveFirebaseData", "sendPlannerSnapshot"],
  "writes": ["masterCurrentPage"]
};
export function register(context) {}
export function initialize(context) {
  document.addEventListener('click', async e => {
    const btn = e.target.closest('.btnRollbackMasterBatch');
    if (!btn || !context.isAdmin()) return;
    const id = btn.dataset.batchId,
      previous = window.appData,
      batches = previous.masterImportBatches || [],
      idx = batches.findIndex(b => b.id === id);
    if (idx < 0) return;
    const b = batches[idx];
    if (idx < batches.length - 1 && !confirm('這不是最新匯入批次，復原可能影響後續相同品號的更新。仍要繼續嗎？')) return;
    if (!confirm(`確定復原「${b.fileName}」？新增 ${b.addCount || 0} 款將移除，被更新的商品會恢復匯入前內容。`)) return;
    btn.disabled = true;
    const scope = context.currentDataMode;
    try {
      const undo = b.undoGzip ? await context.decompressMasterUndo(b.undoGzip) : null,
        candidate = structuredClone(previous),
        products = candidate.products || {};
      if (window.appData !== previous || scope !== context.currentDataMode) throw Error('資料或模式已變更，請重新操作');
      if (undo) {
        for (const [key, value] of Object.entries(undo.beforeByKey)) {
          if (value === null) delete products[key];else products[key] = value;
        }
        if (undo.previousJapanCodes === null) delete candidate.masterJapanCodes;else candidate.masterJapanCodes = undo.previousJapanCodes;
      } else {
        for (const x of b.added || []) {
          const key = Object.keys(products).find(k => context.normalizeItemCode(products[k]?.itemCode) === x.itemNorm);
          if (key) delete products[key];
        }
        for (const x of b.updatedBefore || []) {
          for (const key of Object.keys(products)) if (context.normalizeItemCode(products[key]?.itemCode) === x.itemNorm) delete products[key];
          products[x.barcode] = x.product;
        }
      }
      candidate.products = products;
      candidate.masterImportBatches = batches.filter(x => x.id !== id);
      window.appData = candidate;
      for (const move of [...(undo?.moves || [])].reverse()) context.migrateBarcodeReferences(move.to, move.from);
      context.rebuildItemToBarcode();
      if (!(await context.saveFirebaseData())) {
        window.appData = previous;
        context.rebuildItemToBarcode();
        throw Error('儲存失敗，未完成復原，原有資料已保留');
      }
      context.masterSelectedProducts.clear();
      context.masterCurrentPage = 1;
      context.refreshUI();
      context.renderMasterImportHistory();
      context.sendPlannerSnapshot();
      alert('已復原「' + b.fileName + '」');
    } catch (err) {
      alert('復原未完成：' + err.message);
    } finally {
      btn.disabled = false;
    }
  });
}
