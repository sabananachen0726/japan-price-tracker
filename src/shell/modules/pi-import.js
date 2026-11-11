import {parsePiPaste, isMultiPiPaste, piFields, readPiColumns, readPiGrid, piMultiFields, suggestPiColumns} from '../../shared/pi-paste.js';
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
    const rows = [['Container No.', 'Supplier', 'JAN Code', 'Qty(CTN)', 'Item Code', 'Unit Price', 'Expiry Date', 'Shelf Life (Months)'], ['JSR26B1201', 'SilkRoad', '4901234567890', '20', 'ASA001', '125', '30/06/2027'], ['JSR26B1201', 'SilkRoad', '4901234567891', '30', '', '', ''], ['JTC26B1202', 'Tencho', '4901234567892', '15', 'ASA003', '118', '31/08/2027']];
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
    const parsed = parseInputTable('finalPiMulti', true);
    if (!parsed) return;
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
    const useColumns = document.getElementById('finalPiPasteMode').value === 'columns';
    if (!useColumns && !document.getElementById('finalPiMapping').open && context.looksLikeFinalPiMulti(pastedText)) {
      document.getElementById('finalPiMultiMapping').open = false;
      document.getElementById('finalPiMultiPaste').value = pastedText;
      document.getElementById('finalPiPaste').value = '';
      document.getElementById('finalPiImportHint').innerHTML = '<span class="text-primary fw-bold">✓ 已自動辨識為多櫃格式，改用多櫃匯入。</span>';
      return context.importFinalPiMulti();
    }
    const container = context.normalizeContainerNo(document.getElementById('finalPiContainer')?.value);
    const supplier = document.getElementById('finalPiSupplier')?.value || '';
    const parsed = useColumns
      ? parsePiPaste(readPiColumns([...document.querySelectorAll('#finalPiColumns textarea')].map(input => input.value)), false, {hasHeader:false, mapping:piFields.map((_, i) => i)})
      : parseInputTable('finalPi', false);
    if (!parsed) return;
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
function mappingUI(prefix, multi) {
  const details = document.getElementById(prefix + 'Mapping');
  const input = document.getElementById(prefix + 'Paste');
  const panel = details.querySelector('[data-pi-mapping]');
  const fields = multi ? piMultiFields : piFields;
  const requiredCount = multi ? 4 : 2;
  function refresh() {
    panel.replaceChildren();
    const grid = readPiGrid(input.value), first = grid.records[0]?.cells || [];
    if (!first.length) {panel.textContent = '請先貼上整表，再指定欄位。'; return;}
    const width = grid.records.reduce((max, r) => Math.max(max, r.cells.length), 0);
    const suggested = suggestPiColumns(first, multi);
    const header = document.createElement('input'); header.type = 'checkbox'; header.id = prefix + 'HasHeader';
    header.checked = suggested.some(i => i >= 0) || !first.some(v => /^\d{8,14}$/.test(v.trim()));
    const headerLabel = document.createElement('label'); headerLabel.className = 'd-flex align-items-center gap-2 mb-2';
    headerLabel.append(header, '第一列是欄名'); panel.append(headerLabel);
    const layout = document.createElement('div'); layout.className = 'row g-2'; panel.append(layout);
    function renderOptions() {
      layout.replaceChildren();
      for (const [i, [key, name]] of fields.entries()) {
        const label = document.createElement('label'); label.className = 'col-6 col-md-4';
        label.append(name + (i < requiredCount ? '（必填）' : ''));
        const select = document.createElement('select'); select.className = 'form-select'; select.dataset.piField = key;
        select.add(new Option(i < requiredCount ? '請選擇' : '不匯入', '-1'));
        for (let j = 0; j < width; j++) {
          const sample = (first[j] ?? '').trim().slice(0, 60);
          select.add(new Option(`第 ${j + 1} 欄${sample ? '：' + sample : ''}`, String(j)));
        }
        select.value = String(header.checked ? suggested[i] : i < width ? i : -1);
        label.append(select); layout.append(label);
      }
    }
    header.addEventListener('change', renderOptions);
    renderOptions();
  }
  details.addEventListener('toggle', () => {if (details.open) refresh();});
  input.addEventListener('input', () => {if (details.open) refresh();});
}
function parseInputTable(prefix, multi) {
  const text = document.getElementById(prefix + 'Paste').value;
  const details = document.getElementById(prefix + 'Mapping');
  if (!details.open || !details.querySelector('[data-pi-field]')) return parsePiPaste(text, multi);
  const mapping = [...details.querySelectorAll('[data-pi-field]')].map(select => Number(select.value));
  const assigned = mapping.filter(i => i >= 0);
  if (new Set(assigned).size !== assigned.length) {
    alert('同一個來源欄位不能指定給兩個不同的欄位，請核對自訂欄位。'); return null;
  }
  return parsePiPaste(text, multi, {mapping, hasHeader:document.getElementById(prefix + 'HasHeader').checked});
}
export function initialize() {
  mappingUI('finalPi', false);
  mappingUI('finalPiMulti', true);
  const mode = document.getElementById('finalPiPasteMode');
  const columns = document.getElementById('finalPiColumns');
  const hint = document.createElement('p'); hint.className = 'form-text';
  hint.textContent = '每個框貼 Excel 的一整欄。各欄請選相同的列範圍（包含空白格）；不需要的選填欄可整欄留空。';
  const grid = document.createElement('div'); grid.className = 'row g-2';
  for (const [i, [key, title]] of piFields.entries()) {
    const label = document.createElement('label'); label.className = 'col-6 col-md-4';
    label.append(title + (i < 2 ? '（必填）' : '（選填）'));
    const input = document.createElement('textarea'); input.id = 'finalPiColumn-' + key; input.className = 'form-control font-monospace'; input.rows = 5;
    label.append(input); grid.append(label);
  }
  columns.append(hint, grid);
  const toggle = () => {
    const show = mode.value === 'columns';
    columns.hidden = !show; document.getElementById('finalPiTableInput').hidden = show;
  };
  mode.addEventListener('change', toggle); toggle();
}
