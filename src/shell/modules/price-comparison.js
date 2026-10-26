// shell: price-comparison. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "price-comparison",
  "owns": [{
    "name": "resolveToPrimaryBarcode",
    "kind": "function"
  }, {
    "name": "renderSupplierOptions",
    "kind": "function"
  }, {
    "name": "getRelatedQuotes",
    "kind": "function"
  }, {
    "name": "normalizeSmartText",
    "kind": "function"
  }, {
    "name": "isOrderedSubsequence",
    "kind": "function"
  }, {
    "name": "smartProductMatchScore",
    "kind": "function"
  }, {
    "name": "renderCompareList",
    "kind": "function"
  }, {
    "name": "STALE_QUOTE_DAYS",
    "kind": "const"
  }, {
    "name": "quoteStatus",
    "kind": "function"
  }, {
    "name": "quoteStatusLabel",
    "kind": "function"
  }, {
    "name": "quoteAgeDays",
    "kind": "function"
  }, {
    "name": "isQuoteStale",
    "kind": "function"
  }, {
    "name": "renderProductCard",
    "kind": "function"
  }],
  "imports": ["PRICE_ANOMALY_THRESHOLD", "cleanBarcode", "ensureSearchCache", "frozenBadgeHtml", "isFrozenContainer", "parseBatchInputLines", "resolveToPrimaryBarcodeFromCache", "saveFirebaseData"],
  "writes": ["STALE_QUOTE_DAYS", "getRelatedQuotes", "isOrderedSubsequence", "isQuoteStale", "normalizeSmartText", "quoteAgeDays", "quoteStatus", "quoteStatusLabel", "renderCompareList", "renderProductCard", "renderSupplierOptions", "resolveToPrimaryBarcode", "smartProductMatchScore"]
};
export function register(context) {
  context.resolveToPrimaryBarcode = function resolveToPrimaryBarcode(barcode) {
    if (!barcode) return "";
    const cache = context.ensureSearchCache();
    return context.resolveToPrimaryBarcodeFromCache(barcode, cache.aliasToPrimary, window.appData.itemToBarcode || {});
  };
  context.renderSupplierOptions = function renderSupplierOptions() {
    const filterSelect = document.getElementById("filterSupplier");
    const inputSelect = document.getElementById("inputSupplier");
    const quickBatchSelect = document.getElementById("quickBatchSupplier");
    const quickQuoteSelect = document.getElementById("quickQuoteSupplier");
    const finalPiSupplier = document.getElementById("finalPiSupplier");
    if (filterSelect) {
      const currentFilter = filterSelect.value;
      filterSelect.innerHTML = '<option value="">全部廠商比對</option>';
      (window.appData.suppliers || []).forEach(s => {
        filterSelect.innerHTML += `<option value="${s}">${s}</option>`;
      });
      filterSelect.value = currentFilter;
    }
    if (inputSelect) {
      const currentInput = inputSelect.value;
      inputSelect.innerHTML = '';
      (window.appData.suppliers || []).forEach(s => {
        inputSelect.innerHTML += `<option value="${s}">${s}</option>`;
      });
      inputSelect.value = currentInput;
    }
    [quickBatchSelect, quickQuoteSelect, finalPiSupplier].forEach(sel => {
      if (!sel) return;
      const current = sel.value;
      sel.innerHTML = '';
      (window.appData.suppliers || []).forEach(s => {
        sel.innerHTML += `<option value="${s}">${s}</option>`;
      });
      if (current && (window.appData.suppliers || []).includes(current)) sel.value = current;
    });
    const listContainer = document.getElementById("supplierList");
    if (listContainer) {
      listContainer.innerHTML = '';
      (window.appData.suppliers || []).forEach(s => {
        listContainer.innerHTML += `
          <li class="list-group-item d-flex justify-content-between align-items-center">
            ${s}
            <button class="btn btn-sm btn-outline-danger btn-delete-supplier" data-supplier="${s}"><i class="fa-solid fa-xmark"></i></button>
          </li>
        `;
      });
      document.querySelectorAll(".btn-delete-supplier").forEach(btn => {
        btn.addEventListener("click", function () {
          const sup = this.getAttribute("data-supplier");
          if (confirm(`確定刪除廠商「${sup}」？`)) {
            window.appData.suppliers = window.appData.suppliers.filter(x => x !== sup);
            context.saveFirebaseData();
          }
        });
      });
    }
  };
  context.getRelatedQuotes = function getRelatedQuotes(primaryB, queryBarcode = '') {
    const cache = context.ensureSearchCache();
    const bundle = cache.quoteBundlesByPrimary.get(primaryB);
    if (bundle) return Object.values(bundle.supplierHistory).flat();
    // fallback：主檔尚未建立 / 特殊查詢條碼仍保留原本行為
    const aliases = window.appData.mappings[primaryB] || [];
    const related = new Set([context.cleanBarcode(primaryB), ...aliases.map(context.cleanBarcode)]);
    if (queryBarcode) related.add(context.cleanBarcode(queryBarcode));
    const quotes = [];
    for (const bc of related) {
      const list = cache.quoteByBarcode.get(bc);
      if (list) quotes.push(...list);
    }
    return quotes;
  };
  context.normalizeSmartText = function normalizeSmartText(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  };
  context.isOrderedSubsequence = function isOrderedSubsequence(needle, haystack) {
    needle = context.normalizeSmartText(needle).replace(/\s+/g, '');
    haystack = context.normalizeSmartText(haystack).replace(/\s+/g, '');
    if (!needle) return true;
    let i = 0;
    for (let j = 0; j < haystack.length && i < needle.length; j++) {
      if (haystack[j] === needle[i]) i++;
    }
    return i === needle.length;
  };
  context.smartProductMatchScore = function smartProductMatchScore(query, entry) {
    const q = context.normalizeSmartText(query);
    if (!q) return 0;
    const barcode = context.normalizeSmartText(entry.barcode);
    const itemCode = context.normalizeSmartText(entry.itemCode);
    const name = context.normalizeSmartText(entry.name);
    const aliases = (entry.aliases || []).map(context.normalizeSmartText);
    const fields = [barcode, itemCode, ...aliases, name].filter(Boolean);
    const combined = fields.join(' ');
    const compactCombined = [itemCode, barcode, ...aliases, name].join('').replace(/\s+/g, '');
    if (barcode === q) return 100;
    if (itemCode === q) return 98;
    if (aliases.includes(q)) return 96;
    if (barcode.startsWith(q)) return 90;
    if (itemCode.startsWith(q)) return 88;
    if (aliases.some(a => a.startsWith(q))) return 86;
    if (name.startsWith(q)) return 78;
    if (fields.some(v => v.includes(q))) return itemCode.includes(q) || barcode.includes(q) ? 72 : 60;
    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length > 1 && tokens.every(t => fields.some(v => v.includes(t)) || context.isOrderedSubsequence(t, compactCombined))) return 56;
    if (context.isOrderedSubsequence(q, compactCombined)) return 52;
    return 0;
  };
  context.renderCompareList = function renderCompareList() {
    const resultsContainer = document.getElementById("compareResultsContainer");
    const summaryContainer = document.getElementById("batchSummaryContainer");
    if (!resultsContainer) return;
    if (summaryContainer) summaryContainer.innerHTML = '';
    const filterSupplierVal = document.getElementById("filterSupplier") ? document.getElementById("filterSupplier").value : '';
    const cache = context.ensureSearchCache();
    const data = window.appData || {};
    if (window.searchMode === 'single') {
      const searchInput = document.getElementById("searchInput");
      const rawSearch = searchInput ? searchInput.value : '';
      const normalizedSearch = context.cleanBarcode(rawSearch).toLowerCase();
      // 空白搜尋不再一次產生全商品 DOM；使用者輸入關鍵字後才渲染。
      if (!normalizedSearch) {
        resultsContainer.innerHTML = '<div class="alert alert-light text-center text-muted border"><i class="fa-solid fa-keyboard me-2"></i>請輸入 Barcode、Item Code 或商品名稱開始搜尋。</div>';
        return;
      }
      const scoreByPrimary = new Map();
      const addScore = (primary, score) => {
        if (!primary) return;
        const current = scoreByPrimary.get(primary) || 0;
        if (score > current) scoreByPrimary.set(primary, score);
      };
      // V4.1.1：完整 Item Code / JAN / Alias 精確命中時，只顯示精確商品。
      // 只有沒有精確命中時，才啟動前綴 / 包含 / 跨欄位智慧搜尋（例如 UL爽）。
      const exactPrimary = new Set();
      for (const entry of cache.productEntries) {
        const barcode = context.normalizeSmartText(entry.barcode);
        const itemCode = context.normalizeSmartText(entry.itemCode);
        const aliases = (entry.aliases || []).map(context.normalizeSmartText);
        if (barcode === normalizedSearch || itemCode === normalizedSearch || aliases.includes(normalizedSearch)) {
          exactPrimary.add(entry.primary);
        }
      }
      for (const q of data.quotes || []) {
        const qBarcode = context.cleanBarcode(q.barcode).toLowerCase();
        const qItemCode = String(q.itemCode || '').trim().toLowerCase();
        if (qBarcode === normalizedSearch || qItemCode === normalizedSearch) {
          exactPrimary.add(context.resolveToPrimaryBarcode(q.barcode));
        }
      }
      let targetPrimaryBarcodes;
      if (exactPrimary.size > 0) {
        targetPrimaryBarcodes = [...exactPrimary].sort((a, b) => String(a).localeCompare(String(b)));
      } else {
        for (const entry of cache.productEntries) {
          const score = context.smartProductMatchScore(rawSearch, entry);
          if (score) addScore(entry.primary, score);
        }
        // 報價中存在、但尚未完整進商品主檔的 barcode / item code 也可以找到。
        for (const q of data.quotes || []) {
          const qBarcode = context.cleanBarcode(q.barcode).toLowerCase();
          const qItemCode = String(q.itemCode || '').trim().toLowerCase();
          let score = 0;
          if (qBarcode.startsWith(normalizedSearch)) score = 84;else if (qItemCode && qItemCode.startsWith(normalizedSearch)) score = 82;else if (qBarcode.includes(normalizedSearch)) score = 64;else if (qItemCode && qItemCode.includes(normalizedSearch)) score = 62;
          if (score) addScore(context.resolveToPrimaryBarcode(q.barcode), score);
        }
        targetPrimaryBarcodes = [...scoreByPrimary.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).map(([primary]) => primary);
      }
      if (targetPrimaryBarcodes.length === 0) {
        resultsContainer.innerHTML = '<div class="alert alert-info text-center">查無符合條件的商品報價資料。</div>';
        return;
      }
      resultsContainer.innerHTML = targetPrimaryBarcodes.map(primaryB => context.renderProductCard(primaryB, filterSupplierVal, null, 1)).join('');
      return;
    }
    const batchInput = document.getElementById("batchSearchInput");
    const rawInput = batchInput ? batchInput.value : '';
    const items = context.parseBatchInputLines(rawInput);
    if (items.length === 0) {
      resultsContainer.innerHTML = '<div class="alert alert-light text-center text-muted">請在上方貼入條碼與數量進行批次比對。</div>';
      return;
    }
    if (summaryContainer) {
      summaryContainer.innerHTML = `
        <div class="alert alert-primary d-flex justify-content-between align-items-center mb-3">
          <div><i class="fa-solid fa-list-check me-2"></i>比對商品：<strong>${items.length}</strong> 項${items.ignoredCount ? ` · 已忽略 ${items.ignoredCount} 筆重複資料（保留第一次箱數，不累加）` : ''}</div>
          <small class="text-muted">比對結果已依輸入順序排版</small>
        </div>
      `;
    }
    resultsContainer.innerHTML = items.map(item => {
      const queryBarcode = context.cleanBarcode(item.barcode);
      const primaryB = context.resolveToPrimaryBarcode(queryBarcode);
      return context.renderProductCard(primaryB, filterSupplierVal, null, item.qty, queryBarcode);
    }).join('');
  };
  context.quoteStatus = function quoteStatus(q) {
    if (!q) return 'missing';
    if (Number(q.price) > 0) return 'normal';
    const note = String(q.note || '').toLowerCase();
    if (/停產|discontinued|廃番|廃盤/.test(note)) return 'discontinued';
    if (/等待|pending|待報|確認|未報/.test(note)) return 'pending';
    return 'unavailable';
  };
  context.quoteStatusLabel = function quoteStatusLabel(q) {
    const st = context.quoteStatus(q);
    if (st === 'discontinued') return '停產';
    if (st === 'pending') return '等待報價';
    if (st === 'unavailable') return '無有效報價';
    if (st === 'missing') return '無報價';
    return '正常';
  };
  context.quoteAgeDays = function quoteAgeDays(q) {
    if (!q || !q.date) return null;
    const d = new Date(q.date + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  };
  context.isQuoteStale = function isQuoteStale(q) {
    const age = context.quoteAgeDays(q);
    return Number(q?.price) > 0 && age !== null && age > context.STALE_QUOTE_DAYS;
  };
  context.renderProductCard = function renderProductCard(primaryB, filterSupplierVal, container, qty = 1, queryBarcode = '') {
    const p = window.appData.products[primaryB] || {};
    const aliases = window.appData.mappings[primaryB] || [];
    const cache = context.ensureSearchCache();
    const cachedBundle = cache.quoteBundlesByPrimary.get(primaryB) || {
      latestBySupplier: {},
      supplierHistory: {}
    };
    const latestBySupplier = cachedBundle.latestBySupplier;
    const supplierHistory = cachedBundle.supplierHistory;
    const activeSuppliers = Object.keys(latestBySupplier);
    let lowestPrice = Infinity;
    for (const sup of activeSuppliers) {
      const pr = latestBySupplier[sup].price;
      if (pr > 0 && pr < lowestPrice) lowestPrice = pr;
    }
    if (lowestPrice === Infinity) lowestPrice = 0;
    const aliasesBadgeHtml = aliases.map(a => `<span class="badge badge-alias">${a}</span>`).join('');
    let suppliersCardHtml = '';
    const registeredSuppliers = window.appData.suppliers || [];
    registeredSuppliers.forEach(sup => {
      if (filterSupplierVal && filterSupplierVal !== sup) return;
      const latestQ = latestBySupplier[sup];
      const history = supplierHistory[sup] || [];
      if (latestQ) {
        const isLowest = latestQ.price === lowestPrice && lowestPrice > 0;
        const stale = context.isQuoteStale(latestQ);
        const ageDays = context.quoteAgeDays(latestQ);
        let trendHtml = '';
        if (history.length > 1) {
          const currentP = history[0].price;
          const prevP = history[1].price;
          if (currentP > prevP) {
            trendHtml = `<span class="trend-up ms-2"><i class="fa-solid fa-arrow-trend-up"></i> +¥${(currentP - prevP).toFixed(2)}</span>`;
          } else if (currentP < prevP) {
            trendHtml = `<span class="trend-down ms-2"><i class="fa-solid fa-arrow-trend-down"></i> -¥${(prevP - currentP).toFixed(2)}</span>`;
          } else {
            trendHtml = `<span class="trend-same ms-2"><i class="fa-solid fa-minus"></i> 持平</span>`;
          }
        }
        let anomalyHtml = '';
        const positiveHistory = history.filter(h => Number(h.price) > 0);
        if (positiveHistory.length > 1) {
          const currentP = Number(positiveHistory[0].price);
          const prevP = Number(positiveHistory[1].price);
          if (prevP > 0) {
            const changeRatio = (currentP - prevP) / prevP;
            if (changeRatio >= context.PRICE_ANOMALY_THRESHOLD) {
              anomalyHtml = `<span class="badge bg-danger ms-2" title="較前次有效報價上漲 ${(changeRatio * 100).toFixed(1)}%"><i class="fa-solid fa-triangle-exclamation me-1"></i>價格異常 +${(changeRatio * 100).toFixed(1)}%</span>`;
            }
          }
        }
        let historyAccordionHtml = '';
        if (history.length > 0) {
          const accordionId = `acc_${primaryB}_${sup}`.replace(/[^a-zA-Z0-9]/g, '_');
          const historyRows = history.map(h => `
            <tr>
              <td class="small py-1">${h.date || ''}</td>
              <td class="small py-1 ${context.isFrozenContainer(h.container) ? 'frozen-container-row' : ''}">${h.container || ''} ${context.frozenBadgeHtml(h.container)}</td>
              <td class="small py-1 fw-bold text-end">${Number(h.price) === 0 ? context.quoteStatusLabel(h) : '¥' + h.price}</td>
              <td class="small py-1 text-muted ms-2">${h.note || ''}</td>
              <td class="small py-1 text-end"><button class="btn btn-link text-danger btn-sm p-0 btn-delete-quote" data-id="${h.id}"><i class="fa-solid fa-trash"></i></button></td>
            </tr>
          `).join('');
          historyAccordionHtml = `
            <div class="accordion mt-2" id="${accordionId}">
              <div class="accordion-item border-0">
                <h2 class="accordion-header">
                  <button class="accordion-button collapsed py-1 px-2 small bg-light" type="button" data-bs-toggle="collapse" data-bs-target="#c_${accordionId}">
                    查看歷史報價 (${history.length} 筆)
                  </button>
                </h2>
                <div id="c_${accordionId}" class="accordion-collapse collapse" data-bs-parent="#${accordionId}">
                  <div class="accordion-body p-2">
                    <table class="table table-sm table-borderless mb-0"><tbody>${historyRows}</tbody></table>
                  </div>
                </div>
              </div>
            </div>
          `;
        }
        suppliersCardHtml += `
          <div class="col-md-6 mb-2">
            <div class="p-2 border rounded ${stale ? 'stale-quote' : isLowest ? 'border-success bg-light' : 'bg-white'}">
              <div class="d-flex justify-content-between align-items-center">
                <span class="fw-bold">${sup}</span>
                <div>
                  ${isLowest ? '<span class="lowest-price me-1"><i class="fa-solid fa-crown me-1"></i>最低價</span>' : ''}
                  <span class="price-tag fw-bold ${isLowest ? 'text-success' : 'text-dark'}">
                    ${Number(latestQ.price) === 0 ? `<span class="badge ${context.quoteStatus(latestQ) === 'discontinued' ? 'bg-danger' : 'bg-warning text-dark'}">${context.quoteStatusLabel(latestQ)}</span>` : '¥' + latestQ.price}
                  </span>
                  ${trendHtml}
                  ${anomalyHtml}
                  ${stale ? `<span class="badge bg-warning text-dark ms-2"><i class="fa-solid fa-hourglass-half me-1"></i>${ageDays} 天未更新</span>` : ''}
                </div>
              </div>
              <div class="d-flex justify-content-between align-items-center text-muted small mt-1">
                <span><i class="fa-solid fa-box me-1"></i>${latestQ.container || '-'} ${context.frozenBadgeHtml(latestQ.container)}</span>
                <span><i class="fa-solid fa-clock me-1"></i>${latestQ.date || '-'}</span>
              </div>
              ${latestQ.note ? `<div class="small text-muted mt-1 bg-light p-1 rounded"><i class="fa-solid fa-comment-dots me-1"></i>${latestQ.note}</div>` : ''}
              ${historyAccordionHtml}
            </div>
          </div>
        `;
      } else {
        suppliersCardHtml += `
          <div class="col-md-6 mb-2">
            <div class="p-2 border rounded bg-white text-muted opacity-75">
              <div class="d-flex justify-content-between align-items-center">
                <span>${sup}</span>
                <span class="badge bg-light text-secondary border">無報價</span>
              </div>
            </div>
          </div>
        `;
      }
    });
    const imgSrc = p.imgUrl || '';
    const imgHtml = imgSrc ? `<img src="${imgSrc}" loading="lazy" decoding="async" class="product-img-thumb img-preview" data-src="${imgSrc}" alt="商品圖">` : `<div class="no-img-placeholder"><i class="fa-solid fa-image"></i>無圖</div>`;
    return `
      <div class="card mb-3">
        <div class="card-body">
          <div class="d-flex align-items-start gap-3">
            <div class="img-wrapper">${imgHtml}</div>
            <div class="flex-grow-1">
              <div class="d-flex justify-content-between align-items-start">
                <div>
                  <h5 class="card-title mb-1">
                    ${p.name || '（未命名商品）'}
                    ${qty > 1 ? `<span class="qty-badge ms-2">需求: ${qty}</span>` : ''}
                  </h5>
                  <div class="mb-2">
                    <span class="item-code-badge me-1">${p.itemCode ? 'Item: ' + p.itemCode : '無 Item Code'}</span>
                    <span class="fw-bold text-dark me-1">JAN: ${primaryB}</span>
                    ${queryBarcode && queryBarcode !== primaryB ? `<span class="badge bg-warning text-dark me-2">查詢條碼: ${queryBarcode}</span>` : ''}
                    ${aliasesBadgeHtml}
                  </div>
                  <div class="d-flex flex-wrap align-items-center gap-2 mt-2 purchase-copy-row">
                    <div class="input-group input-group-sm" style="width: 135px;">
                      <span class="input-group-text">數量</span>
                      <input type="number" class="form-control purchase-copy-qty" min="1" step="1" value="${Math.max(1, Number(qty) || 1)}" aria-label="採購數量">
                    </div>
                    <button type="button" class="btn btn-success btn-sm btn-copy-purchase"
                      data-itemcode="${p.itemCode || ''}"
                      data-jancode="${primaryB}"
                      data-lowest="${lowestPrice > 0 ? lowestPrice : ''}">
                      <i class="fa-regular fa-copy me-1"></i>複製採購資訊
                    </button>
                    <small class="text-muted">${lowestPrice > 0 ? `最低價 ¥${lowestPrice}` : '最低價 Pending'}</small>
                  </div>
                </div>
                <button class="btn btn-outline-primary btn-sm btn-quick-add-quote" data-barcode="${primaryB}" data-itemcode="${p.itemCode || ''}" data-name="${p.name || ''}" data-img="${p.imgUrl || ''}">
                  <i class="fa-solid fa-plus me-1"></i>錄入報價
                </button>
              </div>
              <div class="row g-2 mt-2 border-top pt-2">${suppliersCardHtml}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  };
}
export function initialize(context) {
  context.STALE_QUOTE_DAYS = 90;
}
