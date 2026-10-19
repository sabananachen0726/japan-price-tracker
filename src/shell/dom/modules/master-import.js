import { JapanMasterImport } from "../domain/master-import.js";
// shell/dom: master-import. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "master-import",
  "owns": [{
    "name": "JapanMasterImport",
    "kind": "const"
  }, {
    "name": "japanMasterPending",
    "kind": "let"
  }, {
    "name": "compressMasterUndo",
    "kind": "function"
  }, {
    "name": "decompressMasterUndo",
    "kind": "function"
  }, {
    "name": "previewJapanMaster",
    "kind": "function"
  }],
  "imports": ["auth", "currentDataMode", "escapeHtml", "isAdmin", "masterCurrentPage", "masterSelectedProducts", "migrateBarcodeReferences", "rebuildItemToBarcode", "refreshUI", "renderMasterImportHistory", "saveFirebaseData", "sendPlannerSnapshot"],
  "writes": ["JapanMasterImport", "compressMasterUndo", "decompressMasterUndo", "japanMasterPending", "masterCurrentPage", "previewJapanMaster"]
};
export function register(context) {
  context.compressMasterUndo = async function compressMasterUndo(value) {
    const bytes = new Uint8Array(await new Response(new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(s);
  };
  context.decompressMasterUndo = async function decompressMasterUndo(value) {
    const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
    return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
  };
  context.previewJapanMaster = async function previewJapanMaster(file) {
    if (!context.isAdmin()) throw Error('只有 Admin 可匯入商品主檔');
    if (!file) throw Error('請先選擇 Product Data Export Excel');
    if (!/\.xlsx?$/i.test(file.name)) throw Error('請匯入 Onsight Product Data Export 的 .xlsx／.xls 原始檔');
    const scope = context.currentDataMode,
      uid = context.auth.currentUser?.uid || '';
    if (typeof XLSX === 'undefined') throw Error('Excel 解析元件尚未載入，請稍後再試');
    const wb = XLSX.read(await file.arrayBuffer(), {
      type: 'array',
      cellDates: false,
      dense: true
    });
    const name = wb.SheetNames.find(n => n.toLowerCase().includes('product data export')) || wb.SheetNames[0];
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false
    });
    const parsed = context.JapanMasterImport.parse(grid),
      plan = context.JapanMasterImport.plan(parsed, window.appData.products || {});
    if (scope !== context.currentDataMode || uid !== (context.auth.currentUser?.uid || '')) throw Error('帳號或模式已改變，請重新預覽');
    context.japanMasterPending = {
      fileName: file.name,
      parsed,
      plan,
      scope,
      uid,
      baseProducts: JSON.stringify(window.appData.products || {})
    };
    const s = parsed.stats;
    document.getElementById('japanMasterSummary').textContent = `檔案 ${s.total.toLocaleString()} 筆 → 日本貨 ${parsed.rows.length.toLocaleString()} 款｜新增 ${plan.added}｜更新 ${plan.updated}｜略過非日本貨 ${s.skipped.toLocaleString()} 筆`;
    document.getElementById('japanMasterDetails').innerHTML = `<p>包含分類：${Object.entries(parsed.origins).map(([k, v]) => context.escapeHtml(k) + '（' + v + '）').join('、')}</p><p>Barcode 空白改用 Barcode Value：${s.fallback} 款；無可用條碼：${s.missingBarcode} 款（保留品號並標註）；來源 Is Active＝No：${s.inactive} 款（仍匯入，不改訂貨狀態）。</p><p>同條碼商品分開保存，不合併銷量、不互相覆蓋。原有未列出商品保留；月銷計算範圍採本檔的日本貨 Item Code 清單。庫存、Factor、月銷與價格不從此檔更新。空白品名／圖片保留舊值。</p>` + (plan.conflicts.length ? `<div class="alert alert-warning"><b>${plan.conflicts.length} 組重複條碼，全部保留並標註：</b><br>${plan.conflicts.map(c => context.escapeHtml(c.barcode) + '：' + c.codes.map(context.escapeHtml).join('、')).join('<br>')}</div>` : '') + `<div style="max-height:42vh;overflow:auto"><table class="table table-sm"><thead><tr><th>Item Code</th><th>條碼</th><th>商品名稱</th><th>產地分類</th><th>貨別</th></tr></thead><tbody>${parsed.rows.slice(0, 80).map(r => `<tr><td>${context.escapeHtml(r.code)}</td><td>${context.escapeHtml(r.barcode || '待補')}</td><td>${context.escapeHtml(r.name)}</td><td>${context.escapeHtml(r.origin)}</td><td>${r.kind === 'frozen' ? '冷凍' : r.kind === 'dry' ? '乾貨' : '待確認'}</td></tr>`).join('')}</tbody></table></div><p class="small text-muted">顯示前80款；確認後匯入全部 ${parsed.rows.length} 款日本貨。新增或變更品號清單後，請重新匯入銷售檔補齊月銷。</p>`;
    document.getElementById('japanMasterStatus').textContent = '請核對預覽後確認匯入。';
    document.getElementById('japanMasterApply').disabled = false;
    document.getElementById('japanMasterPreview').showModal();
  };
}
export function initialize(context) {
  context.JapanMasterImport = JapanMasterImport;
  context.japanMasterPending = null;
  document.getElementById('btnImportMasterCSV').onclick = async () => {
    const button = document.getElementById('btnImportMasterCSV');
    button.disabled = true;
    try {
      await context.previewJapanMaster(document.getElementById('masterCSVFile').files[0]);
    } catch (err) {
      context.japanMasterPending = null;
      document.getElementById('japanMasterStatus').textContent = '匯入失敗：' + err.message;
      alert(err.message);
    } finally {
      button.disabled = false;
    }
  };
  document.getElementById('japanMasterApply').onclick = async () => {
    const p = context.japanMasterPending;
    if (!p || !context.isAdmin()) return;
    if (p.scope !== context.currentDataMode || p.uid !== (context.auth.currentUser?.uid || '') || p.baseProducts !== JSON.stringify(window.appData.products || {})) {
      document.getElementById('japanMasterStatus').textContent = '主檔、帳號或模式已變更，請關閉後重新預覽。';
      return;
    }
    const button = document.getElementById('japanMasterApply');
    button.disabled = true;
    document.getElementById('japanMasterStatus').textContent = '正在儲存日本貨主檔…';
    const previous = window.appData;
    try {
      const undo = {
        beforeByKey: p.plan.beforeByKey,
        moves: p.plan.moves,
        previousJapanCodes: previous.masterJapanCodes ?? null
      };
      const undoGzip = await context.compressMasterUndo(undo);
      if (p.scope !== context.currentDataMode || p.uid !== (context.auth.currentUser?.uid || '') || p.baseProducts !== JSON.stringify(window.appData.products || {})) throw Error('資料已改變，請重新預覽');
      const candidate = structuredClone(previous);
      candidate.products = p.plan.products;
      candidate.masterJapanCodes = p.plan.japanCodes;
      const batch = {
        id: 'master_' + Date.now(),
        fileName: p.fileName,
        importedAt: new Date().toLocaleString('zh-TW'),
        addCount: p.plan.added,
        updateCount: p.plan.updated,
        undoGzip,
        undoSchema: 2
      };
      candidate.masterImportBatches = [...(candidate.masterImportBatches || []), batch].slice(-5);
      while (candidate.masterImportBatches.length > 1 && new TextEncoder().encode(JSON.stringify(candidate)).length > 900000) candidate.masterImportBatches.shift();
      if (new TextEncoder().encode(JSON.stringify(candidate)).length > 950000) throw Error('主檔與既有報價超過目前共享文件容量，本次未套用；請先匯出完整備份。');
      window.appData = candidate;
      for (const move of p.plan.moves) context.migrateBarcodeReferences(move.from, move.to);
      context.rebuildItemToBarcode();
      const ok = await context.saveFirebaseData();
      if (!ok) {
        window.appData = previous;
        context.rebuildItemToBarcode();
        throw Error('儲存失敗，原有主檔已保留，請重新預覽後再試');
      }
      context.masterSelectedProducts.clear();
      context.masterCurrentPage = 1;
      context.refreshUI();
      context.renderMasterImportHistory();
      context.sendPlannerSnapshot();
      document.getElementById('japanMasterPreview').close();
      document.getElementById('japanMasterStatus').textContent = `已匯入 ${p.parsed.rows.length} 款日本貨，重複條碼全部保留。`;
      document.getElementById('masterCSVFile').value = '';
      context.japanMasterPending = null;
    } catch (err) {
      document.getElementById('japanMasterStatus').textContent = '未完成：' + err.message;
      button.disabled = false;
    }
  };
}
