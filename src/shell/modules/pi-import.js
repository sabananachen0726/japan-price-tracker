import {parsePiPaste, isMultiPiPaste} from '../../shared/pi-paste.js';
import {reviewPiPaste} from '../pi-paste-preview.js';
import {reviewPiProducts} from '../pi-review.js';
// shell: pi-import. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "pi-import",
  "owns": [{
    "name": "downloadFinalPiTemplate",
    "kind": "function"
  }, {
    "name": "parseFinalPiMultiPaste",
    "kind": "function"
  }, {
    "name": "looksLikeFinalPiMulti",
    "kind": "function"
  }, {
    "name": "invalidFinalPiHtml",
    "kind": "function"
  }, {
    "name": "invalidFinalPiText",
    "kind": "function"
  }, {
    "name": "importFinalPiMulti",
    "kind": "function"
  }, {
    "name": "importFinalPi",
    "kind": "function"
  }],
  "imports": ["catalogData", "cleanBarcode", "currentDataMode", "escapeFinalPiText", "findPiShelfColumn", "normalizeContainerNo", "normalizeFinalPiDate", "parseFinalPiLine", "parseFinalPiPaste", "piShelfPreviewText", "planPiShelf", "readPiShelfCell", "renderFinalPiContainerList", "renderFinalPiSearch", "requestPlannerBackup412", "savePiAndShelf", "showAppToast"],
  "writes": ["downloadFinalPiTemplate", "importFinalPi", "importFinalPiMulti", "invalidFinalPiHtml", "invalidFinalPiText", "looksLikeFinalPiMulti", "parseFinalPiMultiPaste"]
};
export function register(context) {
  context.downloadFinalPiTemplate = function downloadFinalPiTemplate() {
    const rows = [['Container No.', 'Supplier', 'JAN Code', 'Qty(CTN)', 'Item Code', 'Unit Price', 'Expiry Date', 'Shelf Life (Months)'], ['JSR26B1201', 'SilkRoad', '4901234567890', '20', 'ASA001', '125', '2027/06/30'], ['JSR26B1201', 'SilkRoad', '4901234567891', '30', '', '', ''], ['JTC26B1202', 'Tencho', '4901234567892', '15', 'ASA003', '118', '2027/08/31']];
    const csv = '\uFEFF' + rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Final_PI_Multi_Container_Template.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  context.parseFinalPiMultiPaste = function parseFinalPiMultiPaste(text) {
    return parsePiPaste(text, true);
  };
  context.looksLikeFinalPiMulti = isMultiPiPaste;
  context.invalidFinalPiHtml = function invalidFinalPiHtml(invalid) {
    if (!invalid?.length) return '';
    return `<div class="alert alert-warning mt-2 mb-0"><div class="fw-bold mb-1">⚠️ 需要確認 ${invalid.length} 列：</div>${invalid.map(x => `<div class="small mb-2"><strong>第 ${x.line} 列：</strong>${context.escapeFinalPiText(x.reason)}<br><code class="text-wrap">${context.escapeFinalPiText(x.raw || '')}</code></div>`).join('')}</div>`;
  };
  context.invalidFinalPiText = function invalidFinalPiText(invalid) {
    if (!invalid?.length) return '';
    return '\n\n⚠️ 格式錯誤 / 跳過明細：\n' + invalid.map(x => `第 ${x.line} 列：${x.reason}\n  ${x.raw || ''}`).join('\n');
  };
  context.importFinalPiMulti = async function importFinalPiMulti() {
    const parsed = context.parseFinalPiMultiPaste(document.getElementById('finalPiMultiPaste')?.value || '');
    if (parsed.invalid.length) {await reviewPiPaste(parsed, parsed.groups); return;}
    if (!parsed.groups.length) {
      alert('沒有可匯入的多櫃 Final PI 資料。');
      return;
    }
    const existing = parsed.groups.filter(g => (window.appData.finalPiContainers || {})[g.container]);
    const totalRows = parsed.groups.reduce((n, g) => n + g.rows.length, 0),
      totalQty = parsed.groups.reduce((n, g) => n + g.rows.reduce((a, r) => a + (Number(r.qty) || 0), 0), 0);
    let msg = `本次辨識：${parsed.groups.length} 條貨櫃\n商品明細：${totalRows} 列\n總箱數：${totalQty} CTN`;
    if (existing.length) msg += `\n\n⚠️ ${existing.length} 條貨櫃已存在，將以本次 Final PI 完整覆蓋：\n${existing.map(g => g.container).join(', ')}\n重新匯入的貨櫃會自動取消 FINAL 狀態，請確認新版後重新標記。`;
    if (parsed.invalid.length) msg += context.invalidFinalPiText(parsed.invalid);
    const shelfContext = context.currentDataMode === 'test' ? (await context.requestPlannerBackup412()).catalog.overrides : context.catalogData?.overrides;
    const shelfPlan = context.planPiShelf(parsed.groups, shelfContext);
    msg += context.piShelfPreviewText(shelfPlan);
    if (!await reviewPiPaste(parsed, parsed.groups, msg)) return;
    const review = await reviewPiProducts(window.appData,context.currentDataMode === 'test' ? (await context.requestPlannerBackup412()).catalog : context.catalogData,parsed.groups || [{container,rows:parsed.rows}]);
    if (!review) return;
    shelfPlan.review = review;
    const previousPiData = structuredClone(window.appData);
    window.appData.finalPiContainers ||= {};
    parsed.groups.forEach(g => {
      const old = window.appData.finalPiContainers[g.container];
      window.appData.finalPiContainers[g.container] = {
        container: g.container,
        supplier: g.supplier,
        receivedDate: old?.receivedDate || '',
        isFinal: false,
        importedAt: new Date().toISOString(),
        rows: g.rows
      };
    });
    const ok = await context.savePiAndShelf(shelfPlan, previousPiData);
    if (!ok) return;
    context.renderFinalPiContainerList();
    context.renderFinalPiSearch();
    const hint = document.getElementById('finalPiMultiHint');
    if (hint) hint.innerHTML = `<span class="text-success fw-bold">✓ 已匯入 ${parsed.groups.length} 條貨櫃 / ${totalRows} 列 / ${totalQty.toLocaleString()} CTN</span>${context.invalidFinalPiHtml(parsed.invalid)}`;
    context.showAppToast(`多櫃 Final PI 已儲存：${parsed.groups.length} 條貨櫃`, 'success');
  };
  context.importFinalPi = async function importFinalPi() {
    const pastedText = document.getElementById('finalPiPaste')?.value || '';
    if (context.looksLikeFinalPiMulti(pastedText)) {
      document.getElementById('finalPiMultiPaste').value = pastedText;
      document.getElementById('finalPiPaste').value = '';
      document.getElementById('finalPiImportHint').innerHTML = '<span class="text-primary fw-bold">✓ 已自動辨識為多櫃格式，改用多櫃匯入。</span>';
      return context.importFinalPiMulti();
    }
    const container = context.normalizeContainerNo(document.getElementById('finalPiContainer')?.value);
    const supplier = document.getElementById('finalPiSupplier')?.value || '';
    const parsed = context.parseFinalPiPaste(pastedText);
    if (!container) {
      alert('請先填寫貨櫃號碼。');
      return;
    }
    if (!supplier) {
      alert('請選擇廠商。');
      return;
    }
    if (parsed.invalid.length) {await reviewPiPaste(parsed, [{container, rows: parsed.rows}]); return;}
    if (!parsed.rows.length) {
      alert('沒有可匯入的 Final PI 資料。請確認 JAN／箱數與選填欄位格式。');
      return;
    }
    const existing = (window.appData.finalPiContainers || {})[container];
    const total = parsed.rows.reduce((n, r) => n + (Number(r.qty) || 0), 0);
    let msg = `準備匯入貨櫃 ${container}\n\n有效資料：${parsed.rows.length} 列\n總箱數：${total} CTN\n廠商：${supplier}`;
    if (parsed.invalid.length) msg += context.invalidFinalPiText(parsed.invalid);
    if (existing) msg += `\n\n⚠️ 此貨櫃已有 Final PI（${(existing.rows || []).length} 列）。確認後會完整覆蓋原 Final PI 商品內容。${existing.isFinal ? '\n原 FINAL 狀態將自動取消，請確認新版後重新標記。' : ''}`;
    const shelfContext = context.currentDataMode === 'test' ? (await context.requestPlannerBackup412()).catalog.overrides : context.catalogData?.overrides;
    const shelfPlan = context.planPiShelf([{
      container,
      rows: parsed.rows
    }], shelfContext);
    msg += context.piShelfPreviewText(shelfPlan);
    if (!await reviewPiPaste(parsed, [{container, rows: parsed.rows}], msg)) return;
    const review = await reviewPiProducts(window.appData,context.currentDataMode === 'test' ? (await context.requestPlannerBackup412()).catalog : context.catalogData,[{container,rows:parsed.rows}]);
    if (!review) return;
    shelfPlan.review = review;
    const previousPiData = structuredClone(window.appData);
    window.appData.finalPiContainers ||= {};
    window.appData.finalPiContainers[container] = {
      container,
      supplier,
      receivedDate: existing?.receivedDate || '',
      isFinal: false,
      importedAt: new Date().toISOString(),
      rows: parsed.rows
    };
    const ok = await context.savePiAndShelf(shelfPlan, previousPiData);
    if (!ok) return;
    context.renderFinalPiContainerList();
    context.renderFinalPiSearch();
    document.getElementById('finalPiImportHint').innerHTML = `<span class="text-success fw-bold">✓ ${context.escapeFinalPiText(container)} 已匯入 ${parsed.rows.length} 列 / ${total.toLocaleString()} CTN</span>${context.invalidFinalPiHtml(parsed.invalid)}`;
    context.showAppToast(`${container} Final PI 已儲存`, 'success');
  };
}
export function initialize(context) {}
