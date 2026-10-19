// planner: product-exports. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "product-exports",
  "owns": [{
    "name": "sourceStatus",
    "kind": "function"
  }, {
    "name": "sourceExportRows",
    "kind": "function"
  }, {
    "name": "safeExcelText",
    "kind": "function"
  }, {
    "name": "exportSourceWorkbook",
    "kind": "function"
  }, {
    "name": "renderSourceReview",
    "kind": "function"
  }],
  "imports": ["$", "catalogReady", "esc", "monthlyInfo", "shelfLife", "state", "trackerFeed", "val"],
  "writes": ["exportSourceWorkbook", "renderSourceReview", "safeExcelText", "sourceExportRows", "sourceStatus"]
};
export function register(context) {
  context.sourceStatus = function sourceStatus(i) {
    return i.availability === 'active' ? 'Active' : i.availability === 'discontinued' ? 'Inactive / 停產' : 'Inactive / 暫停訂購';
  };
  context.sourceExportRows = function sourceExportRows(list) {
    return list.map(i => ({
      'Item Code': i.code,
      'Barcode / JAN': String(i.barcode || ''),
      'Product Name': i.name || '',
      'Shelf Life (Months)': context.shelfLife(i) ?? '',
      '貨別': i.kind === 'dry' ? '乾貨' : i.kind === 'frozen' ? '冷凍' : '待分類',
      '狀態': context.sourceStatus(i),
      '優先採用來源': i.primarySource || '',
      '全部來源': i.sources.join('、'),
      '安全庫存': context.val(i, 'safety') ?? '',
      '月銷': context.val(i, 'monthly') ?? '',
      'Monthly Source': context.monthlyInfo(i).manual ? 'Manual' : 'Auto'
    }));
  };
  context.safeExcelText = function safeExcelText(v) {
    const s = String(v ?? '');
    return /^[=+@\-\t\r]/.test(s) ? "'" + s : s;
  };
  context.exportSourceWorkbook = function exportSourceWorkbook(file, sheets) {
    if (typeof XLSX === 'undefined') {
      alert('Excel 匯出元件尚未載入，請確認網路連線後重試');
      return;
    }
    const book = XLSX.utils.book_new();
    for (const [name, rows] of sheets) {
      const keys = ['Item Code', 'Barcode / JAN', 'Product Name', 'Shelf Life (Months)', '貨別', '狀態', '優先採用來源', '全部來源', '安全庫存', '月銷', 'Monthly Source'];
      const safe = rows.map(row => Object.fromEntries(keys.map(k => [k, k === 'Barcode / JAN' ? String(row[k] || '') : typeof row[k] === 'string' ? context.safeExcelText(row[k]) : row[k]])));
      const sheet = XLSX.utils.json_to_sheet(safe, {
        header: keys
      });
      sheet['!cols'] = [{
        wch: 19
      }, {
        wch: 20
      }, {
        wch: 49
      }, {
        wch: 12
      }, {
        wch: 20
      }, {
        wch: 20
      }, {
        wch: 40
      }, {
        wch: 13
      }, {
        wch: 12
      }];
      // JAN/Barcode are identifiers, not Excel numbers.
      for (let r = 1; r <= safe.length; r++) {
        const cell = sheet['B' + (r + 1)];
        if (cell) {
          cell.t = 's';
          cell.v = String(cell.v || '');
          cell.z = '@';
        }
      }
      XLSX.utils.book_append_sheet(book, sheet, name);
    }
    XLSX.writeFile(book, file);
  };
  context.renderSourceReview = function renderSourceReview() {
    const q = context.$('sourceReviewSearch').value.trim().toLowerCase(),
      status = context.$('sourceReviewStatus').value,
      origin = context.$('sourceReviewOrigin').value;
    const list = context.state.items.filter(i => {
      if (status === 'active' && i.availability !== 'active') return false;
      if (status === 'inactive' && i.availability === 'active') return false;
      if (origin !== 'all' && !i.sources.includes(origin)) return false;
      return !q || `${i.code} ${i.name} ${i.barcode} ${i.sources.join(' ')}`.toLowerCase().includes(q);
    });
    context.$('sourceReviewCount').textContent = `符合 ${list.length} / ${context.state.items.length} 款；畫面最多顯示前 150 款，匯出仍包含完整清單。`;
    context.$('sourceReviewRows').innerHTML = list.slice(0, 150).map(i => `<tr><td><b>${context.esc(i.code)}</b></td><td>${context.esc(i.name)}</td><td>${context.esc(context.sourceStatus(i))}</td><td>${context.esc(i.primarySource)}</td><td>${context.esc(i.sources.join('、'))}</td></tr>`).join('') || '<tr><td colspan="5">沒有符合的商品</td></tr>';
  };
}
export function initialize(context) {
  for (const id of ['sourceReviewSearch', 'sourceReviewStatus', 'sourceReviewOrigin']) context.$(id).addEventListener(id === 'sourceReviewSearch' ? 'input' : 'change', context.renderSourceReview);
  context.$('exportSourceAll').onclick = () => {
    if (!context.trackerFeed || !context.catalogReady) return alert('資料尚未同步完成，請等待商品主檔、Final PI 與共享 Active/Inactive 載入後再匯出');
    context.exportSourceWorkbook('Kaisi_Order_Products_Sources_V478.xlsx', [["全部商品及來源", context.sourceExportRows(context.state.items)]]);
  };
  context.$('exportSourceStatus').onclick = () => {
    if (!context.trackerFeed || !context.catalogReady) return alert('資料尚未同步完成，請等待商品主檔、Final PI 與共享 Active/Inactive 載入後再匯出');
    context.exportSourceWorkbook('Kaisi_Order_Products_Status_V478.xlsx', [['Active', context.sourceExportRows(context.state.items.filter(i => i.availability === 'active'))], ['Inactive', context.sourceExportRows(context.state.items.filter(i => i.availability !== 'active'))]]);
  };
}
