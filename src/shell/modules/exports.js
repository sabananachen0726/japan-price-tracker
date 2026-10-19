// shell: exports. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "exports",
  "owns": [{
    "name": "exportMasterProductsToCSV",
    "kind": "function"
  }, {
    "name": "downloadQuoteTemplate",
    "kind": "function"
  }, {
    "name": "downloadMasterTemplate",
    "kind": "function"
  }, {
    "name": "csvEscape",
    "kind": "function"
  }, {
    "name": "downloadCSV",
    "kind": "function"
  }, {
    "name": "exportPurchaseDecisionCSV",
    "kind": "function"
  }],
  "imports": ["cleanBarcode", "getRelatedQuotes", "getTimestampString", "parseBatchInputLines", "resolveToPrimaryBarcode"],
  "writes": ["csvEscape", "downloadCSV", "downloadMasterTemplate", "downloadQuoteTemplate", "exportMasterProductsToCSV", "exportPurchaseDecisionCSV"]
};
export function register(context) {
  context.exportMasterProductsToCSV = function exportMasterProductsToCSV() {
    let csv = "\uFEFFPrimary Barcode,Item Code,商品名稱,圖片URL\n";
    for (let mainB in window.appData.products || {}) {
      const p = window.appData.products[mainB] || {};
      csv += `"${mainB}","${(p.itemCode || '').replace(/"/g, '""')}","${(p.name || '').replace(/"/g, '""')}","${(p.imgUrl || '').replace(/"/g, '""')}"\n`;
    }
    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;'
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `商品主檔對照表_${context.getTimestampString()}.csv`;
    link.click();
  };
  context.downloadQuoteTemplate = function downloadQuoteTemplate() {
    let csv = "\uFEFFJAN Code (Barcode),Item Code (料號),商品名稱,廠商名稱,報價金額,貨櫃號碼,備註/狀態(停產/等待報價)\n";
    csv += `"4901330112813","WHH005","Calbee 蝦條 白鹽味 70g","SilkRoad","128.5","CTN-2024-001","正常報價"\n`;
    csv += `"4901330119999","WHH006","Calbee 洋芋片 50g","Tencho","0","CTN-2024-001","停產"\n`;
    csv += `"4901330122222","WHH007","Calbee 堅果餅乾 80g","SilkRoad","0","CTN-2024-001","等待報價"\n`;
    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;'
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `批次報價單匯入範本_含0元下拉選項.csv`;
    link.click();
  };
  context.downloadMasterTemplate = function downloadMasterTemplate() {
    let csv = "\uFEFFPrimary Barcode,Item Code,商品名稱,圖片URL\n";
    csv += `"4901330112813","WHH005","Calbee 蝦條 白鹽味 70g","https://example.com/image.jpg"\n`;
    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;'
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `商品主檔匯入範本.csv`;
    link.click();
  };
  context.csvEscape = function csvEscape(value) {
    const text = String(value ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""');
    return `"${text}"`;
  };
  context.downloadCSV = function downloadCSV(filename, rows) {
    // UTF-8 BOM + CRLF：直接用 Windows / Mac Excel 開啟中文、日文較穩定。
    const csvContent = "\uFEFF" + rows.map(row => row.map(context.csvEscape).join(',')).join('\r\n') + '\r\n';
    const blob = new Blob([csvContent], {
      type: 'text/csv;charset=utf-8;'
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
  context.exportPurchaseDecisionCSV = function exportPurchaseDecisionCSV() {
    const rawInput = document.getElementById("batchSearchInput").value;
    const items = context.parseBatchInputLines(rawInput);
    if (items.length === 0) {
      alert("請先在輸入框貼入需要比對的 Barcode 與數量！");
      return;
    }
    const rows = [["需求條碼/商品", "需求箱數", "主檔條碼", "Item Code", "商品名稱", "狀態", "最低價廠商(建議採購)", "最低單包價(日圓)", "次低價廠商/價格", "價差%", "最新報價日期", "最新貨櫃號碼", "採購備註"]];
    items.forEach(item => {
      const queryBarcode = context.cleanBarcode(item.barcode);
      const primaryB = context.resolveToPrimaryBarcode(queryBarcode);
      const p = window.appData.products[primaryB] || {};
      const matchedQuotes = context.getRelatedQuotes(primaryB);
      const latestBySupplier = {};
      matchedQuotes.forEach(q => {
        if (!latestBySupplier[q.supplier] || new Date(q.date || 0) > new Date(latestBySupplier[q.supplier].date || 0)) {
          latestBySupplier[q.supplier] = q;
        }
      });
      const sortedSuppliers = Object.values(latestBySupplier).sort((a, b) => a.price - b.price);
      let status = "";
      let recommendedSupplier = "";
      let lowestPrice = 0;
      let secondLowestStr = "-";
      let diffStr = "-";
      let purchaseNote = "";
      let latestQuoteObj = null;
      if (sortedSuppliers.length === 0) {
        status = "查無報價";
        recommendedSupplier = "無符合報價";
        purchaseNote = "查無報價";
      } else {
        const registeredSuppliers = window.appData.suppliers || [];
        const validQuotes = sortedSuppliers.filter(s => s.price > 0);
        const zeroQuotes = sortedSuppliers.filter(s => s.price === 0);
        if (validQuotes.length === 0) {
          status = "Pending";
          recommendedSupplier = "Pending";
          purchaseNote = "廠商報價皆為$0 (停產/等待報價)";
        } else {
          const lowest = validQuotes[0];
          lowestPrice = lowest.price;
          const sameLowest = validQuotes.filter(s => s.price === lowest.price);
          if (sameLowest.length > 1) {
            status = "報價相同";
            recommendedSupplier = "報價相同";
            purchaseNote = `多間廠商報價相同 (${sameLowest.map(s => s.supplier).join(' / ')})`;
            if (validQuotes.length > sameLowest.length) {
              const nextQuote = validQuotes[sameLowest.length];
              secondLowestStr = `${nextQuote.supplier} (¥${nextQuote.price})`;
            }
          } else if (zeroQuotes.length > 0) {
            const suppliersWithQuote = Object.keys(latestBySupplier);
            const missingSuppliers = registeredSuppliers.filter(s => !suppliersWithQuote.includes(s));
            if (missingSuppliers.length > 0) {
              status = "建議採購";
              recommendedSupplier = lowest.supplier;
              purchaseNote = `另有廠商(${missingSuppliers.join('/')})查無報價；部分廠商報價$0`;
            } else {
              status = "Pending";
              recommendedSupplier = "Pending";
              purchaseNote = "有廠商報價為$0 (待確認)";
            }
          } else {
            status = "建議採購";
            recommendedSupplier = lowest.supplier;
            if (validQuotes.length > 1) {
              const second = validQuotes[1];
              secondLowestStr = `${second.supplier} (¥${second.price})`;
              const diffPercent = ((second.price - lowest.price) / second.price * 100).toFixed(1);
              diffStr = `省 ${diffPercent}%`;
            }
            const suppliersWithQuote = Object.keys(latestBySupplier);
            const missingSuppliers = registeredSuppliers.filter(s => !suppliersWithQuote.includes(s));
            if (missingSuppliers.length > 0) purchaseNote = `廠商 (${missingSuppliers.join('/')}) 沒有提供報價`;
          }
        }
        // 保留原本日期 / 貨櫃邏輯，不在這次改動範圍內。
        latestQuoteObj = validQuotes[0] || sortedSuppliers[0];
      }
      rows.push([queryBarcode, item.qty, primaryB, p.itemCode || '', p.name || '查無品名', status, recommendedSupplier, lowestPrice, secondLowestStr, diffStr, latestQuoteObj?.date || '-', latestQuoteObj?.container || '-', purchaseNote]);
    });
    context.downloadCSV(`採購決策建議單_${context.getTimestampString()}.csv`, rows);
  };
}
export function initialize(context) {}
