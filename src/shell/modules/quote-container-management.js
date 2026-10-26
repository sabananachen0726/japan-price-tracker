// shell: quote-container-management. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "quote-container-management",
  "owns": [{
    "name": "renderContainerDeleteOptions",
    "kind": "function"
  }, {
    "name": "activeManagedContainer",
    "kind": "let"
  }, {
    "name": "escapeContainerText",
    "kind": "function"
  }, {
    "name": "getManagedContainerQuotes",
    "kind": "function"
  }, {
    "name": "updateContainerSelectionInfo",
    "kind": "function"
  }, {
    "name": "renderContainerManager",
    "kind": "function"
  }],
  "imports": ["ensureSearchCache", "resolveToPrimaryBarcode", "compareContainerNo", "frozenBadgeHtml", "isFrozenContainer", "normalizeContainerNo", "quoteStatusLabel"],
  "writes": ["activeManagedContainer", "escapeContainerText", "getManagedContainerQuotes", "renderContainerDeleteOptions", "renderContainerManager", "updateContainerSelectionInfo"]
};
export function register(context) {
  context.renderContainerDeleteOptions = function renderContainerDeleteOptions() {
    const select = document.getElementById("selectContainerToDelete");
    if (!select) return;
    select.innerHTML = '<option value="">請選擇要刪除的貨櫃號碼...</option>';
    const containers = [...new Set((window.appData.quotes || []).map(q => context.normalizeContainerNo(q.container)).filter(Boolean))].sort(context.compareContainerNo);
    containers.forEach(c => {
      select.innerHTML += `<option value="${c}">${context.isFrozenContainer(c) ? '❄️ ' : ''}${c}${context.isFrozenContainer(c) ? ' — FROZEN' : ''}</option>`;
    });
  };
  context.escapeContainerText = function escapeContainerText(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[ch]);
  };
  context.getManagedContainerQuotes = function getManagedContainerQuotes() {
    if (!context.activeManagedContainer) return [];
    return (window.appData.quotes || []).filter(q => q.container === context.activeManagedContainer);
  };
  context.updateContainerSelectionInfo = function updateContainerSelectionInfo() {
    const checks = [...document.querySelectorAll('.container-item-check')];
    const selected = checks.filter(c => c.checked).length;
    const info = document.getElementById('containerSelectionInfo');
    const delBtn = document.getElementById('btnDeleteSelectedContainerItems');
    if (info) info.textContent = `已選 ${selected} 筆`;
    if (delBtn) delBtn.disabled = selected === 0;
  };
  context.renderContainerManager = function renderContainerManager() {
    const panel = document.getElementById('containerManagerPanel');
    const body = document.getElementById('containerManagerBody');
    if (!panel || !body || !context.activeManagedContainer) return;
    panel.classList.remove('d-none');
    const allRows = context.getManagedContainerQuotes();
    const keyword = (document.getElementById('containerItemSearch')?.value || '').trim().toLowerCase();
    const rows = allRows.filter(q => {
      const product = context.ensureSearchCache().productsByPrimary?.get(context.resolveToPrimaryBarcode(q.barcode)) || (window.appData.products || {})[q.barcode] || {};
      return [q.itemCode, product.itemCode, q.barcode, product.name, q.supplier, q.note].some(v => String(v || '').toLowerCase().includes(keyword));
    });
    document.getElementById('containerManagerTitle').innerHTML = `貨櫃 ${context.escapeContainerText(context.activeManagedContainer)} ${context.frozenBadgeHtml(context.activeManagedContainer)}`;
    document.getElementById('containerManagerCount').textContent = `${allRows.length} 筆`;
    body.innerHTML = rows.length ? rows.map(q => {
      const product = context.ensureSearchCache().productsByPrimary?.get(context.resolveToPrimaryBarcode(q.barcode)) || (window.appData.products || {})[q.barcode] || {};
      return `<tr>
        <td><input class="form-check-input container-item-check" type="checkbox" data-quote-id="${context.escapeContainerText(q.id)}"></td>
        <td>${context.escapeContainerText(product.itemCode || q.itemCode || '-')}</td>
        <td class="small">${context.escapeContainerText(q.barcode || '-')}</td>
        <td>${context.escapeContainerText(product.name || '-')}</td>
        <td>${context.escapeContainerText(q.supplier || '-')}</td>
        <td class="text-end">${Number(q.price) > 0 ? '¥' + Number(q.price).toLocaleString() : context.escapeContainerText(context.quoteStatusLabel(q))}</td>
        <td>${context.escapeContainerText(q.date || '-')}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="7" class="text-center text-muted py-4">沒有符合的項目</td></tr>';
    body.querySelectorAll('.container-item-check').forEach(cb => cb.addEventListener('change', context.updateContainerSelectionInfo));
    context.updateContainerSelectionInfo();
  };
}
export function initialize(context) {
  context.activeManagedContainer = '';
}
