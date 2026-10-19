// shell/dom: search-events. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "search-events",
  "owns": [{
    "name": "searchDebounceTimer",
    "kind": "let"
  }, {
    "name": "searchComposing",
    "kind": "let"
  }, {
    "name": "searchInput",
    "kind": "const"
  }, {
    "name": "batchSearchInput",
    "kind": "const"
  }, {
    "name": "compareResultsContainer",
    "kind": "const"
  }],
  "imports": ["renderCompareList", "saveFirebaseData"],
  "writes": ["batchSearchInput", "compareResultsContainer", "searchComposing", "searchDebounceTimer", "searchInput"]
};
export function register(context) {}
export function initialize(context) {
  // 搜尋模式切換

  document.getElementById("btnSingleMode").onclick = function () {
    window.searchMode = 'single';
    this.className = "btn btn-sm btn-primary";
    document.getElementById("btnBatchMode").className = "btn btn-sm btn-outline-primary";
    document.getElementById("singleSearchBox").classList.remove("d-none");
    document.getElementById("batchSearchBox").classList.add("d-none");
    context.renderCompareList();
  };
  document.getElementById("btnBatchMode").onclick = function () {
    window.searchMode = 'batch';
    this.className = "btn btn-sm btn-primary";
    document.getElementById("btnSingleMode").className = "btn btn-sm btn-outline-primary";
    document.getElementById("singleSearchBox").classList.add("d-none");
    document.getElementById("batchSearchBox").classList.remove("d-none");
    context.renderCompareList();
  };
  // 單筆搜尋：停止輸入 350ms 才執行，避免每打一個字就完整重繪整個結果區。
  // Enter 可立即搜尋。中文輸入法組字期間不搜尋。

  context.searchDebounceTimer = null;
  context.searchComposing = false;
  context.searchInput = document.getElementById("searchInput");
  if (context.searchInput) {
    context.searchInput.addEventListener("compositionstart", () => {
      context.searchComposing = true;
    });
    context.searchInput.addEventListener("compositionend", () => {
      context.searchComposing = false;
      clearTimeout(context.searchDebounceTimer);
      context.searchDebounceTimer = setTimeout(context.renderCompareList, 200);
    });
    context.searchInput.addEventListener("input", () => {
      if (context.searchComposing) return;
      clearTimeout(context.searchDebounceTimer);
      context.searchDebounceTimer = setTimeout(context.renderCompareList, 350);
    });
    context.searchInput.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        clearTimeout(context.searchDebounceTimer);
        context.renderCompareList();
      }
    });
  }
  // 批次貼上通常一次就完成，但快速連續修改時也稍微緩衝，避免反覆重繪。

  context.batchSearchInput = document.getElementById("batchSearchInput");
  if (context.batchSearchInput) {
    context.batchSearchInput.addEventListener("input", () => {
      clearTimeout(context.searchDebounceTimer);
      context.searchDebounceTimer = setTimeout(context.renderCompareList, 200);
    });
  }
  document.getElementById("filterSupplier").onchange = context.renderCompareList;
  // 結果區使用事件委派：不再每產生一張卡就 querySelectorAll + 綁定一次事件。

  context.compareResultsContainer = document.getElementById("compareResultsContainer");
  if (context.compareResultsContainer) {
    context.compareResultsContainer.addEventListener("click", function (e) {
      const img = e.target.closest(".img-preview");
      if (img) {
        document.getElementById("modalImage").src = img.getAttribute("data-src");
        new bootstrap.Modal(document.getElementById('imageModal')).show();
        return;
      }
      const deleteBtn = e.target.closest(".btn-delete-quote");
      if (deleteBtn) {
        const qId = deleteBtn.getAttribute("data-id");
        if (confirm("確定刪除此筆報價紀錄？")) {
          window.appData.quotes = window.appData.quotes.filter(q => q.id !== qId);
          context.saveFirebaseData();
        }
        return;
      }
      const purchaseCopyBtn = e.target.closest(".btn-copy-purchase");
      if (purchaseCopyBtn) {
        const card = purchaseCopyBtn.closest('.card');
        const qtyInput = card ? card.querySelector('.purchase-copy-qty') : null;
        const qty = Math.max(1, parseInt(qtyInput ? qtyInput.value : '1', 10) || 1);
        if (qtyInput) qtyInput.value = qty;
        const itemCode = purchaseCopyBtn.getAttribute('data-itemcode') || '-';
        const janCode = purchaseCopyBtn.getAttribute('data-jancode') || '-';
        const lowestRaw = purchaseCopyBtn.getAttribute('data-lowest') || '';
        const lowestText = lowestRaw ? `¥${lowestRaw}` : 'Pending';
        const copyText = `Item Code: ${itemCode}\nJAN Code: ${janCode}\n數量: ${qty}\n最低價格: ${lowestText}`;
        const doFallbackCopy = () => {
          const ta = document.createElement('textarea');
          ta.value = copyText;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        };
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(copyText).catch(doFallbackCopy);
        } else {
          doFallbackCopy();
        }
        const oldHtml = purchaseCopyBtn.innerHTML;
        purchaseCopyBtn.innerHTML = '<i class="fa-solid fa-check me-1"></i>已複製';
        purchaseCopyBtn.classList.remove('btn-success');
        purchaseCopyBtn.classList.add('btn-outline-success');
        setTimeout(() => {
          purchaseCopyBtn.innerHTML = oldHtml;
          purchaseCopyBtn.classList.remove('btn-outline-success');
          purchaseCopyBtn.classList.add('btn-success');
        }, 1200);
        return;
      }
      const copyBtn = e.target.closest(".btn-copy-value");
      if (copyBtn) {
        const value = copyBtn.getAttribute("data-copy") || '';
        if (value) {
          if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(value).catch(() => {});
          } else {
            const ta = document.createElement('textarea');
            ta.value = value;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
          }
          const oldTitle = copyBtn.getAttribute('title') || '複製';
          copyBtn.setAttribute('title', '已複製');
          copyBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
          setTimeout(() => {
            copyBtn.setAttribute('title', oldTitle);
            copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>';
          }, 900);
        }
        return;
      }
      const quickAddBtn = e.target.closest(".btn-quick-add-quote");
      if (quickAddBtn) {
        const bc = quickAddBtn.getAttribute("data-barcode") || '';
        const item = quickAddBtn.getAttribute("data-itemcode") || '';
        const name = quickAddBtn.getAttribute("data-name") || '';
        document.getElementById("quickQuoteBarcode").value = bc;
        document.getElementById("quickQuoteProductName").textContent = name || '未命名商品';
        document.getElementById("quickQuoteProductCode").textContent = `Item Code: ${item || '-'} ｜ JAN: ${bc || '-'}`;
        document.getElementById("quickQuotePrice").value = '';
        document.getElementById("quickQuoteNote").value = '';
        const modalEl = document.getElementById('quickQuoteModal');
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
        setTimeout(() => document.getElementById('quickQuotePrice')?.focus(), 250);
      }
    });
  }
}
