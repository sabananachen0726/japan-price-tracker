import {masterSearchKeys} from '../../shared/master-search.js';
// shell: product-management. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "product-management",
  "owns": [{
    "name": "renderMappingTable",
    "kind": "function"
  }, {
    "name": "normalizeItemCode",
    "kind": "function"
  }, {
    "name": "migrateBarcodeReferences",
    "kind": "function"
  }, {
    "name": "rebuildItemToBarcode",
    "kind": "function"
  }, {
    "name": "updateMasterSelectionUI",
    "kind": "function"
  }, {
    "name": "renderMasterTable",
    "kind": "function"
  }],
  "imports": ["cleanBarcode", "escapeHtml", "masterCurrentPage", "masterSearchTerm", "masterSelectedProducts", "saveFirebaseData"],
  "writes": ["masterCurrentPage", "migrateBarcodeReferences", "normalizeItemCode", "rebuildItemToBarcode", "renderMappingTable", "renderMasterTable", "updateMasterSelectionUI"]
};
export function register(context) {
  context.renderMappingTable = function renderMappingTable() {
    const tbody = document.getElementById("mappingTableBody");
    if (!tbody) return;
    tbody.innerHTML = '';
    const mappings = window.appData.mappings || {};
    const primaryBarcodes = Object.keys(mappings);
    if (primaryBarcodes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">目前尚無條碼綁定紀錄。</td></tr>';
      return;
    }
    primaryBarcodes.forEach(mainB => {
      const aliases = mappings[mainB] || [];
      const p = window.appData.products[mainB] || {};
      const aliasBadges = aliases.map(a => `<span class="badge badge-alias m-1">${a} <i class="fa-solid fa-xmark text-danger ms-1 btn-remove-alias" data-main="${mainB}" data-alias="${a}" style="cursor:pointer;"></i></span>`).join('');
      tbody.innerHTML += `
            <tr>
                <td class="fw-bold">${mainB}</td>
                <td>${p.itemCode || '-'}</td>
                <td>${p.name || '-'}</td>
                <td>${aliasBadges}</td>
                <td>
                    <button class="btn btn-sm btn-outline-danger btn-delete-mapping-all" data-main="${mainB}">解開全部綁定</button>
                </td>
            </tr>
        `;
    });
    document.querySelectorAll(".btn-remove-alias").forEach(icon => {
      icon.onclick = function () {
        const mainB = this.getAttribute("data-main");
        const alias = this.getAttribute("data-alias");
        if (confirm(`確定解除 ${mainB} 與 ${alias} 的綁定？`)) {
          window.appData.mappings[mainB] = window.appData.mappings[mainB].filter(a => a !== alias);
          if (window.appData.mappings[mainB].length === 0) {
            delete window.appData.mappings[mainB];
          }
          context.saveFirebaseData();
        }
      };
    });
    document.querySelectorAll(".btn-delete-mapping-all").forEach(btn => {
      btn.onclick = function () {
        const mainB = this.getAttribute("data-main");
        if (confirm(`確定解除 ${mainB} 的所有條碼綁定？`)) {
          delete window.appData.mappings[mainB];
          context.saveFirebaseData();
        }
      };
    });
  };
  context.normalizeItemCode = function normalizeItemCode(v) {
    return String(v || '').trim().toUpperCase();
  };
  context.migrateBarcodeReferences = function migrateBarcodeReferences(oldBc, newBc) {
    oldBc = context.cleanBarcode(oldBc);
    newBc = context.cleanBarcode(newBc);
    if (!oldBc || !newBc || oldBc === newBc) return;
    (window.appData.quotes || []).forEach(q => {
      if (context.cleanBarcode(q.barcode) === oldBc) q.barcode = newBc;
    });
    const m = window.appData.mappings || {};
    if (m[oldBc]) {
      m[newBc] = [...new Set([...(m[newBc] || []), ...m[oldBc].filter(x => context.cleanBarcode(x) !== newBc)])];
      delete m[oldBc];
    }
    Object.keys(m).forEach(k => {
      m[k] = (m[k] || []).map(x => context.cleanBarcode(x) === oldBc ? newBc : x).filter((x, i, a) => x && context.cleanBarcode(x) !== context.cleanBarcode(k) && a.indexOf(x) === i);
      if (!m[k].length) delete m[k];
    });
    Object.values(window.appData.finalPiContainers || {}).forEach(c => (c.rows || []).forEach(r => {
      if (context.cleanBarcode(r.barcode) === oldBc) r.barcode = newBc;
    }));
  };
  context.rebuildItemToBarcode = function rebuildItemToBarcode() {
    window.appData.itemToBarcode = {};
    Object.entries(window.appData.products || {}).forEach(([bc, p]) => {
      const ic = String(p?.itemCode || '').trim();
      if (ic) window.appData.itemToBarcode[ic] = bc;
    });
  };
  context.updateMasterSelectionUI = function updateMasterSelectionUI() {
    const btn = document.getElementById('btnDeleteSelectedMaster');
    if (btn) {
      btn.disabled = context.masterSelectedProducts.size === 0;
      btn.innerHTML = `<i class="fa-solid fa-trash me-1"></i>刪除選取 (${context.masterSelectedProducts.size})`;
    }
  };
  context.renderMasterTable = function renderMasterTable() {
    const tbody = document.getElementById("masterTableBody");
    const countHeader = document.getElementById("masterCountHeader");
    const pageSizeSelect = document.getElementById("masterPageSize");
    const pageInfo = document.getElementById("masterPageInfo");
    const prevBtn = document.getElementById("btnMasterPrev");
    const nextBtn = document.getElementById("btnMasterNext");
    if (!tbody) return;
    const products = window.appData.products || {};
    const term = (context.masterSearchTerm || '').trim().toLowerCase();
    const allKeys = Object.keys(products);
    const keys = masterSearchKeys(products, window.appData.mappings, term);
    const pageSize = Math.max(1, parseInt(pageSizeSelect?.value || '50', 10));
    const totalPages = Math.max(1, Math.ceil(keys.length / pageSize));
    context.masterCurrentPage = Math.min(Math.max(1, context.masterCurrentPage), totalPages);
    if (countHeader) countHeader.innerText = term ? `商品主檔：搜尋到 ${keys.length} / 共 ${allKeys.length} 項` : `已存在的主檔商品 (${allKeys.length} 項)`;
    if (pageInfo) pageInfo.innerText = keys.length ? `第 ${context.masterCurrentPage} / ${totalPages} 頁` : '';
    if (prevBtn) prevBtn.disabled = context.masterCurrentPage <= 1;
    if (nextBtn) nextBtn.disabled = context.masterCurrentPage >= totalPages || keys.length === 0;
    if (keys.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">${term ? '找不到符合的商品。' : '目前商品主檔為空。'}</td></tr>`;
      return;
    }
    const startIndex = (context.masterCurrentPage - 1) * pageSize;
    const pageKeys = keys.slice(startIndex, startIndex + pageSize);
    tbody.innerHTML = pageKeys.map(mainB => {
      const p = products[mainB] || {};
      const imgHtml = p.imgUrl ? `<img src="${p.imgUrl}" loading="lazy" decoding="async" class="product-img-thumb img-preview" data-src="${p.imgUrl}" style="width:40px;height:40px;">` : `<span class="text-muted small">無圖片</span>`;
      return `
        <tr>
          <td><input class="form-check-input master-row-check" type="checkbox" data-barcode="${mainB}" ${context.masterSelectedProducts.has(mainB) ? 'checked' : ''}></td>
          <td>${imgHtml}</td>
          <td class="fw-bold">${context.escapeHtml(p.sourceBarcode || mainB)}${p.barcodeConflict ? '<div class="small text-warning">條碼重複・依 Item Code 分開保留</div>' : ''}${p.missingBarcode ? '<div class="small text-warning">條碼待補</div>' : ''}</td>
          <td>${context.escapeHtml(p.itemCode || '-')}</td>
          <td>${context.escapeHtml(p.name || '-')}${p.placeOfProduction ? '<div class="small text-muted">' + context.escapeHtml(p.placeOfProduction) + '</div>' : ''}</td>
          <td class="small text-truncate" style="max-width:150px;">${p.imgUrl || '-'}</td>
          <td class="text-center">
            <button class="btn btn-sm btn-outline-primary btn-edit-master me-1" data-barcode="${mainB}"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-sm btn-outline-danger btn-delete-master" data-barcode="${mainB}"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>
      `;
    }).join('');
    tbody.querySelectorAll(".master-row-check").forEach(cb => {
      cb.onchange = function () {
        const bc = this.getAttribute("data-barcode");
        if (this.checked) context.masterSelectedProducts.add(bc);else context.masterSelectedProducts.delete(bc);
        context.updateMasterSelectionUI();
      };
    });
    const pageAll = document.getElementById('masterPageSelectAll');
    if (pageAll) {
      pageAll.checked = pageKeys.length > 0 && pageKeys.every(k => context.masterSelectedProducts.has(k));
      pageAll.onchange = () => {
        pageKeys.forEach(k => pageAll.checked ? context.masterSelectedProducts.add(k) : context.masterSelectedProducts.delete(k));
        context.renderMasterTable();
        context.updateMasterSelectionUI();
      };
    }
    tbody.querySelectorAll(".btn-edit-master").forEach(btn => {
      btn.onclick = function () {
        const bc = this.getAttribute("data-barcode");
        const p = window.appData.products[bc] || {};
        document.getElementById("editMasterPrimaryBarcode").value = bc;
        document.getElementById("editMasterBarcodeDisplay").value = p.sourceBarcode || bc;
        document.getElementById("editMasterItemCode").value = p.itemCode || '';
        document.getElementById("editMasterName").value = p.name || '';
        document.getElementById("editMasterImgUrl").value = p.imgUrl || '';
        new bootstrap.Modal(document.getElementById('editMasterModal')).show();
      };
    });
    tbody.querySelectorAll(".btn-delete-master").forEach(btn => {
      btn.onclick = function () {
        const bc = this.getAttribute("data-barcode");
        if (confirm(`確定從主檔刪除商品 ${bc} ？`)) {
          delete window.appData.products[bc];
          context.masterSelectedProducts.delete(bc);
          context.rebuildItemToBarcode();
          context.saveFirebaseData();
        }
      };
    });
  };
}
export function initialize(context) {}
