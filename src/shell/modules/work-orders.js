// shell: work-orders. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "work-orders",
  "owns": [{
    "name": "renderSharedOrderDrafts",
    "kind": "function"
  }, {
    "name": "exportProposalExcel",
    "kind": "function"
  }, {
    "name": "deleteProposal",
    "kind": "function"
  }, {
    "name": "sendSharedOrderDrafts",
    "kind": "function"
  }, {
    "name": "startSharedOrderListener",
    "kind": "function"
  }, {
    "name": "sendContainerSnapshot",
    "kind": "function"
  }],
  "imports": ["ORDER_PLANNER_REF", "auth", "containerTrackerData", "containerTrackerFrameLoaded", "currentDataMode", "deleteField", "escapeFinalPiText", "isAdmin", "normalizeContainerNo", "onSnapshot", "plannerLoaded", "proposalListenerInitialized", "setDoc", "sharedOrderDrafts", "showAppToast", "unsubscribeOrderPlanner"],
  "writes": ["deleteProposal", "exportProposalExcel", "proposalListenerInitialized", "renderSharedOrderDrafts", "sendContainerSnapshot", "sendSharedOrderDrafts", "sharedOrderDrafts", "startSharedOrderListener", "unsubscribeOrderPlanner"]
};
export function register(context) {
  context.renderSharedOrderDrafts = function renderSharedOrderDrafts() {
    const host = document.getElementById('sharedOrderList'),
      badge = document.getElementById('sharedOrderStatus');
    if (!host) return;
    const entries = Object.entries(context.sharedOrderDrafts || {}).filter(([code, d]) => code && !code.startsWith('__') && (d.preparedAt || Object.values(d.rows || {}).some(q => Number(q) > 0) || Object.values(d.itemNotes || {}).some(n => String(n).trim())));
    entries.sort((a, b) => String(b[1].updatedAt || '').localeCompare(String(a[1].updatedAt || '')));
    badge.textContent = entries.length + ' 份採購建議';
    badge.className = 'badge bg-primary';
    host.innerHTML = entries.length ? entries.map(([code, d]) => {
      const rows = [...new Set([...Object.keys(d.rows || {}), ...Object.keys(d.itemNotes || {})])].filter(item => Number(d.rows?.[item]) > 0 || String(d.itemNotes?.[item] || '').trim()).map(item => [item, Number(d.rows?.[item]) || 0]),
        qty = rows.reduce((n, [, q]) => n + Number(q), 0);
      const tracker = (context.containerTrackerData.containers || []).find(c => context.normalizeContainerNo(c.code) === context.normalizeContainerNo(code));
      return `<details class="border rounded p-2 mb-2"><summary class="fw-bold" style="cursor:pointer">${context.escapeFinalPiText(code)}　${rows.length} 款 / ${qty.toLocaleString()} 箱　<span class="text-muted fw-normal">${context.escapeFinalPiText(d.kind === 'frozen' ? '冷凍' : '乾貨')} · 預計到倉 ${context.escapeFinalPiText(d.arrival || '待填')} · ${d.updatedAt ? '已提交採購建議' : '已安排，待提交'}</span></summary><div class="table-responsive mt-2"><table class="table table-sm align-middle mb-0"><thead><tr><th>商品</th><th>Item Code</th><th>Barcode</th><th class="text-end">箱數</th><th>備註</th></tr></thead><tbody>${rows.map(([item, q]) => {
        const barcode = window.appData.itemToBarcode?.[item] || d.snapshot?.[item]?.barcode || '',
          product = window.appData.products?.[barcode] || {};
        const photo = /^https:\/\//i.test(product.imgUrl || '') ? `<img src="${context.escapeFinalPiText(product.imgUrl)}" alt="" width="40" height="40" style="object-fit:contain" class="me-2 rounded">` : '';
        return `<tr><td>${photo}${context.escapeFinalPiText(product.name || d.snapshot?.[item]?.name || item)}</td><td>${context.escapeFinalPiText(item)}</td><td>${context.escapeFinalPiText(barcode || '—')}</td><td class="text-end fw-bold">${Number(q) > 0 ? Number(q).toLocaleString() : '<span class="badge bg-light text-secondary">僅備註</span>'}</td><td style="max-width:250px;white-space:normal">${context.escapeFinalPiText(d.itemNotes?.[item] || '—')}</td></tr>`;
      }).join('')}</tbody></table></div>${context.isAdmin() ? `<div class="mt-2 d-flex gap-2"><button class="btn btn-sm btn-primary" data-proposal-export="${context.escapeFinalPiText(code)}">下載 Excel</button><button class="btn btn-sm btn-outline-danger" data-proposal-delete="${context.escapeFinalPiText(code)}">刪除建議單</button></div>` : ''}</details>`;
    }).join('') : '尚無已提交的採購建議。';
  };
  context.exportProposalExcel = function exportProposalExcel(code) {
    if (!context.isAdmin()) return context.showAppToast('僅 Admin 可下載採購建議', 'danger');
    const draft = context.sharedOrderDrafts[code];
    if (!draft) return;
    if (typeof XLSX === 'undefined') return context.showAppToast('Excel 元件尚未載入，請重新整理', 'danger');
    const suppliers = (window.appData.suppliers || []).slice(0, 2);
    while (suppliers.length < 2) suppliers.push('Supplier ' + (suppliers.length + 1));
    const quotes = window.appData.quotes || [];
    const header = ['Item Code', 'Barcode', 'Product Name', ...suppliers.map(s => s + ' Price'), 'QTY', 'Item Note'];
    const rows = [...new Set([...Object.keys(draft.rows || {}), ...Object.keys(draft.itemNotes || {})])].filter(item => Number(draft.rows?.[item]) > 0 || String(draft.itemNotes?.[item] || '').trim()).map(item => {
      const qty = Number(draft.rows?.[item]) || 0;
      const barcode = window.appData.itemToBarcode?.[item] || draft.snapshot?.[item]?.barcode || '';
      const product = window.appData.products?.[barcode] || {};
      const snap = draft.snapshot?.[item] || {};
      const prices = suppliers.map(s => {
        const matching = quotes.filter(q => (q.itemCode === item || q.barcode === barcode) && q.supplier === s && Number.isFinite(Number(q.price)));
        matching.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        return matching.length ? Number(matching[0].price) : '';
      });
      return [item, barcode || snap.barcode || '', product.name || snap.name || item, ...prices, Number(qty), draft.itemNotes?.[item] || ''];
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [{
      wch: 20
    }, {
      wch: 20
    }, {
      wch: 55
    }, {
      wch: 22
    }, {
      wch: 22
    }, {
      wch: 12
    }, {
      wch: 48
    }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Purchase Proposal');
    XLSX.writeFile(wb, code.replace(/[^a-zA-Z0-9_-]/g, '_') + '_Purchase_Proposal.xlsx');
  };
  context.deleteProposal = async function deleteProposal(code) {
    if (!context.isAdmin() || context.currentDataMode !== 'live' || !Object.hasOwn(context.sharedOrderDrafts, code)) {
      context.showAppToast('請切換 LIVE 並使用 Admin 帳號刪除', 'danger');
      throw Error('非 LIVE 模式或權限不足');
    }
    try {
      await context.setDoc(context.ORDER_PLANNER_REF, {
        drafts: {
          [code]: context.deleteField()
        }
      }, {
        merge: true
      });
      context.showAppToast('已刪除採購建議單 ' + code);
    } catch (err) {
      context.showAppToast('刪除失敗：' + (err.code || err.message), 'danger');
      throw err;
    }
  };
  context.sendSharedOrderDrafts = function sendSharedOrderDrafts() {
    const frame = document.getElementById('plannerFrame');
    if (context.plannerLoaded && frame?.contentWindow && context.auth.currentUser && context.currentDataMode === 'live') frame.contentWindow.postMessage({
      type: 'KAISI_ORDER_DRAFTS',
      mode: 'live',
      drafts: context.sharedOrderDrafts
    }, '*');
  };
  context.startSharedOrderListener = function startSharedOrderListener() {
    if (context.unsubscribeOrderPlanner) context.unsubscribeOrderPlanner();
    context.unsubscribeOrderPlanner = context.onSnapshot(context.ORDER_PLANNER_REF, s => {
      const next = s.exists() ? s.data().drafts || {} : {};
      if (context.proposalListenerInitialized && context.isAdmin()) {
        const changed = Object.keys(next).filter(code => Object.values(next[code]?.rows || {}).some(q => Number(q) > 0) && (!Object.hasOwn(context.sharedOrderDrafts, code) || next[code]?.updatedAt !== context.sharedOrderDrafts[code]?.updatedAt));
        if (changed.length) context.showAppToast('收到 ' + changed.length + ' 份新提交／更新的採購建議', 'info');
      }
      context.sharedOrderDrafts = next;
      context.proposalListenerInitialized = true;
      context.renderSharedOrderDrafts();
      context.sendSharedOrderDrafts();
    }, e => {
      const b = document.getElementById('sharedOrderStatus');
      if (b) {
        b.textContent = '訂貨同步失敗';
        b.className = 'badge bg-danger';
      }
      console.warn('Order planner link unavailable', e);
    });
  };
  context.sendContainerSnapshot = function sendContainerSnapshot() {
    const frame = document.getElementById('containerTrackerFrame');
    if (!frame?.contentWindow || !context.containerTrackerFrameLoaded || !context.auth.currentUser) return;
    frame.contentWindow.postMessage({
      type: 'KAISI_CONTAINER_SNAPSHOT',
      data: context.containerTrackerData,
      pi: {
        finalPiContainers: window.appData.finalPiContainers || {}
      }
    }, '*');
  };
}
export function initialize(context) {
  document.getElementById('sharedOrderList')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-proposal-export],[data-proposal-delete]');
    if (!btn || !context.isAdmin()) return;
    if (btn.dataset.proposalExport) context.exportProposalExcel(btn.dataset.proposalExport);
    if (btn.dataset.proposalDelete) {
      const code = btn.dataset.proposalDelete;
      if (context.currentDataMode !== 'live') return context.showAppToast('TEST 模式不能刪除 LIVE 工作單', 'danger');
      if (confirm('確定刪除採購建議單 ' + code + '？此操作不影響正式貨櫃。')) context.deleteProposal(code).catch(() => {});
    }
  });
}
