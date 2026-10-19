// shell: purchase-workbench. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "purchase-workbench",
  "owns": [{
    "name": "buildPurchaseWorkbenchRows",
    "kind": "function"
  }, {
    "name": "renderPurchaseWorkbench",
    "kind": "function"
  }, {
    "name": "updateWorkbenchTotals",
    "kind": "function"
  }, {
    "name": "copySupplierOrders",
    "kind": "function"
  }],
  "imports": ["STALE_QUOTE_DAYS", "cleanBarcode", "ensureSearchCache", "isQuoteStale", "parseBatchInputLines", "quoteStatusLabel", "resolveToPrimaryBarcode"],
  "writes": ["buildPurchaseWorkbenchRows", "copySupplierOrders", "renderPurchaseWorkbench", "updateWorkbenchTotals"]
};
export function register(context) {
  context.buildPurchaseWorkbenchRows = function buildPurchaseWorkbenchRows() {
    const input = document.getElementById('batchSearchInput');
    const items = context.parseBatchInputLines(input ? input.value : '');
    const suppliers = window.appData.suppliers || [];
    return items.map(item => {
      const query = context.cleanBarcode(item.barcode);
      const primary = context.resolveToPrimaryBarcode(query);
      const p = window.appData.products[primary] || {};
      const bundle = context.ensureSearchCache().quoteBundlesByPrimary.get(primary) || {
        latestBySupplier: {}
      };
      const quotes = suppliers.map(supplier => ({
        supplier,
        q: bundle.latestBySupplier[supplier]
      }));
      const valid = quotes.filter(x => x.q && Number(x.q.price) > 0 && !context.isQuoteStale(x.q)).sort((a, b) => Number(a.q.price) - Number(b.q.price));
      const fallback = quotes.filter(x => x.q && Number(x.q.price) > 0).sort((a, b) => Number(a.q.price) - Number(b.q.price));
      const best = valid[0] || fallback[0] || null;
      return {
        query,
        primary,
        itemCode: p.itemCode || '',
        name: p.name || '查無品名',
        qty: Math.max(1, Number(item.qty) || 1),
        quotes,
        selected: best?.supplier || '',
        bestPrice: best ? Number(best.q.price) : 0
      };
    });
  };
  context.renderPurchaseWorkbench = function renderPurchaseWorkbench() {
    const box = document.getElementById('purchaseWorkbenchContainer');
    if (!box) return;
    const rows = context.buildPurchaseWorkbenchRows();
    if (!rows.length) {
      box.innerHTML = '<div class="alert alert-warning">請先貼入 Barcode + 數量，再開啟採購工作台。</div>';
      return;
    }
    const suppliers = window.appData.suppliers || [];
    const supplierHeads = suppliers.map(s => `<th class="text-end">${s}</th>`).join('');
    const body = rows.map((r, i) => {
      const quoteCells = r.quotes.map(x => {
        if (!x.q) return '<td class="text-end text-muted">—</td>';
        const stale = context.isQuoteStale(x.q);
        return `<td class="text-end ${stale ? 'text-warning' : ''}">${Number(x.q.price) > 0 ? '¥' + Number(x.q.price).toLocaleString() : '<span class="badge bg-light text-dark border">' + context.quoteStatusLabel(x.q) + '</span>'}${stale ? '<div class="small">過舊</div>' : ''}</td>`;
      }).join('');
      const opts = ['<option value="">Pending</option>', ...suppliers.map(s => `<option value="${s}" ${s === r.selected ? 'selected' : ''}>${s}</option>`)].join('');
      return `<tr data-row="${i}" data-primary="${r.primary}" data-itemcode="${r.itemCode}" data-qty="${r.qty}">
        <td><div class="fw-bold">${r.itemCode || '-'}</div><div class="small text-muted">${r.name}</div><div class="small">${r.primary}</div></td>
        <td style="width:90px"><input class="form-control form-control-sm wb-qty" type="number" min="1" value="${r.qty}"></td>
        ${quoteCells}
        <td style="min-width:145px"><select class="form-select form-select-sm wb-supplier">${opts}</select></td>
        <td class="text-end wb-price">${r.bestPrice ? '¥' + r.bestPrice.toLocaleString() : 'Pending'}</td>
        </tr>`;
    }).join('');
    box.innerHTML = `<div class="card p-3 mb-4 border-primary"><div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><div><h4 class="mb-1"><i class="fa-solid fa-cart-shopping me-2 text-primary"></i>採購工作台</h4><div class="small text-muted">預設避開超過 ${context.STALE_QUOTE_DAYS} 天的舊報價；你仍可人工改選廠商。</div></div><div><button id="btnCopySupplierOrders" class="btn btn-success btn-sm me-2"><i class="fa-regular fa-copy me-1"></i>依廠商整批複製</button><button id="btnCloseWorkbench" class="btn btn-outline-secondary btn-sm">收起</button></div></div><div class="table-responsive"><table class="table table-sm table-hover workbench-table"><thead><tr><th>商品</th><th>箱數</th>${supplierHeads}<th>實際採購</th><th class="text-end">單包價</th></tr></thead><tbody>${body}</tbody></table></div></div>`;
    context.updateWorkbenchTotals();
  };
  context.updateWorkbenchTotals = function updateWorkbenchTotals() {
    // V4.1.3: 報價是「單包價」，採購數量是「箱數」，兩者不能直接相乘。
    // 工作台只更新所選廠商的單包價，不再計算小計或總金額。
    const box = document.getElementById('purchaseWorkbenchContainer');
    if (!box) return;
    box.querySelectorAll('tbody tr').forEach(tr => {
      const primary = tr.dataset.primary,
        supplier = tr.querySelector('.wb-supplier').value;
      const bundle = context.ensureSearchCache().quoteBundlesByPrimary.get(primary) || {
        latestBySupplier: {}
      };
      const q = bundle.latestBySupplier[supplier];
      const price = q && Number(q.price) > 0 ? Number(q.price) : 0;
      tr.querySelector('.wb-price').textContent = price ? '¥' + price.toLocaleString() : 'Pending';
    });
  };
  context.copySupplierOrders = function copySupplierOrders() {
    const box = document.getElementById('purchaseWorkbenchContainer');
    if (!box) return;
    const groups = {};
    box.querySelectorAll('tbody tr').forEach(tr => {
      const supplier = tr.querySelector('.wb-supplier').value;
      if (!supplier) return;
      const qty = Math.max(1, Number(tr.querySelector('.wb-qty').value) || 1),
        primary = tr.dataset.primary,
        itemCode = tr.dataset.itemcode || '-';
      const q = (context.ensureSearchCache().quoteBundlesByPrimary.get(primary) || {
        latestBySupplier: {}
      }).latestBySupplier[supplier];
      if (!q || Number(q.price) <= 0) return;
      (groups[supplier] ||= []).push(`${itemCode}\t${primary}\t${qty}\t¥${Number(q.price)}`);
    });
    const textOut = Object.entries(groups).map(([s, lines]) => `【${s}】\nItem Code\tJAN Code\t箱數\t單包價\n${lines.join('\n')}`).join('\n\n');
    if (!textOut) {
      alert('目前沒有可複製的採購項目。');
      return;
    }
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = textOut;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(textOut).catch(fallback);else fallback();
    alert('已依廠商整理並複製採購資訊！');
  };
}
export function initialize(context) {}
