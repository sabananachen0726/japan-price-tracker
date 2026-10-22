import {renderCustomerDemand} from '../customer-demand-view.js';
// shell: pi-query. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "pi-query",
  "owns": [{
    "name": "escapeFinalPiText",
    "kind": "function"
  }, {
    "name": "normalizeFinalPiDate",
    "kind": "function"
  }, {
    "name": "parseFinalPiLine",
    "kind": "function"
  }, {
    "name": "parseFinalPiPaste",
    "kind": "function"
  }, {
    "name": "getFinalPiProduct",
    "kind": "function"
  }, {
    "name": "getFinalPiToday",
    "kind": "function"
  }, {
    "name": "finalPiLogistics",
    "kind": "function"
  }, {
    "name": "isFinalPiReceived",
    "kind": "function"
  }, {
    "name": "finalPiContainerSort",
    "kind": "function"
  }, {
    "name": "isFinalPiConfirmed",
    "kind": "function"
  }, {
    "name": "finalPiWorkflowStatus",
    "kind": "function"
  }, {
    "name": "updateFinalPiPendingBadge",
    "kind": "function"
  }, {
    "name": "renderFinalPiContainerList",
    "kind": "function"
  }, {
    "name": "renderFinalPiSearch",
    "kind": "function"
  }],
  "imports": ["auth", "currentDataMode", "customerRows", "customerFetchedAt", "customerStatus", "cleanBarcode", "compareContainerNo", "findPiShelfColumn", "frozenBadgeHtml", "getContainerDates", "legacySafeDate", "linkedTrackerContainer", "normalizeContainerNo", "readPiShelfCell", "resolveToPrimaryBarcode", "saveFirebaseData", "showAppToast"],
  "writes": ["escapeFinalPiText", "finalPiContainerSort", "finalPiLogistics", "finalPiWorkflowStatus", "getFinalPiProduct", "getFinalPiToday", "isFinalPiConfirmed", "isFinalPiReceived", "normalizeFinalPiDate", "parseFinalPiLine", "parseFinalPiPaste", "renderFinalPiContainerList", "renderFinalPiSearch", "updateFinalPiPendingBadge"]
};
export function register(context) {
  context.escapeFinalPiText = function escapeFinalPiText(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[ch]);
  };
  context.normalizeFinalPiDate = function normalizeFinalPiDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const m = raw.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
    const m2 = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m2) return `${m2[3]}-${String(m2[2]).padStart(2, '0')}-${String(m2[1]).padStart(2, '0')}`;
    return raw;
  };
  context.parseFinalPiLine = function parseFinalPiLine(line) {
    if (line.includes('\t')) return line.split('\t').map(v => v.trim());
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === ',' && !quoted) {
        out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  context.parseFinalPiPaste = function parseFinalPiPaste(text) {
    const rows = [];
    const invalid = [];
    let shelfColumn = -1;
    String(text || '').split(/\r?\n/).forEach((line, idx) => {
      if (!line.trim()) return;
      const cols = context.parseFinalPiLine(line);
      const first = String(cols[0] || '').toLowerCase();
      if ((idx === 0 || first.includes('jan') || first.includes('barcode') || first.includes('條碼')) && (first.includes('jan') || first.includes('barcode') || first.includes('條碼'))) {
        shelfColumn = context.findPiShelfColumn(cols);
        return;
      }
      const fail = reason => invalid.push({
        line: idx + 1,
        reason,
        raw: line
      });
      if (cols.length < 2) {
        fail('欄位不足：至少需要 JAN Code 與箱數');
        return;
      }
      const barcode = context.cleanBarcode(cols[0]);
      const qtyRaw = String(cols[1] ?? '').trim();
      const qty = Number(qtyRaw.replace(/,/g, ''));
      const itemCode = String(cols[2] || '').trim();
      const rawPrice = String(cols[3] ?? '').trim();
      const unitPrice = rawPrice === '' ? null : Number(rawPrice.replace(/[¥$,\s]/g, ''));
      const expiryDate = context.normalizeFinalPiDate(cols[4]);
      const shelfLifeMonths = context.readPiShelfCell(cols, shelfColumn, 5);
      if (shelfLifeMonths === false) {
        fail('保存期限（月）須為 1～120 的整數');
        return;
      }
      if (!barcode) {
        fail('JAN Code / Barcode 為必填');
        return;
      }
      if (!qtyRaw) {
        fail(`JAN ${barcode}：箱數為空白`);
        return;
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        fail(`JAN ${barcode}：箱數「${qtyRaw}」不是有效的正數`);
        return;
      }
      if (unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
        fail(`JAN ${barcode}：單包價「${rawPrice}」格式無效`);
        return;
      }
      rows.push({
        itemCode,
        qty,
        unitPrice,
        barcode,
        expiryDate,
        shelfLifeMonths
      });
    });
    return {
      rows,
      invalid
    };
  };
  context.getFinalPiProduct = function getFinalPiProduct(row) {
    const products = window.appData.products || {};
    const byBarcode = row.barcode ? products[context.resolveToPrimaryBarcode(row.barcode)] || products[row.barcode] : null;
    if (byBarcode) return byBarcode;
    const mapped = (window.appData.itemToBarcode || {})[String(row.itemCode || '').trim().toUpperCase()] || (window.appData.itemToBarcode || {})[String(row.itemCode || '').trim()];
    return mapped ? products[mapped] || {} : {};
  };
  context.getFinalPiToday = function getFinalPiToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  context.finalPiLogistics = function finalPiLogistics(container) {
    const linked = context.linkedTrackerContainer(container?.container);
    const dates = context.getContainerDates(linked);
    const legacyPiOnly = linked ? '' : context.legacySafeDate(container?.receivedDate);
    const effectiveUnload = dates.unloadDate || legacyPiOnly;
    return {
      linked,
      portDate: dates.portDate,
      unloadDate: effectiveUnload,
      expectedMonth: dates.expectedMonth,
      eta: dates.eta || legacyPiOnly,
      etaEstimated: dates.etaEstimated,
      expectedWarehouse: dates.unloadDate || dates.month15,
      actualReceived: (linked ? dates.unloaded : !!legacyPiOnly && legacyPiOnly <= context.getFinalPiToday()) ? effectiveUnload : ""
    };
  };
  context.isFinalPiReceived = function isFinalPiReceived(container) {
    const d = context.finalPiLogistics(container).actualReceived;
    return !!d && d <= context.getFinalPiToday();
  };
  context.finalPiContainerSort = function finalPiContainerSort(a, b) {
    const af = !context.isFinalPiReceived(a),
      bf = !context.isFinalPiReceived(b);
    if (af !== bf) return af ? -1 : 1;
    if (af) return -context.compareContainerNo(a.container, b.container);
    return String(context.finalPiLogistics(b).actualReceived || '').localeCompare(String(context.finalPiLogistics(a).actualReceived || '')) || -context.compareContainerNo(a.container, b.container);
  };
  context.isFinalPiConfirmed = function isFinalPiConfirmed(container) {
    return container?.isFinal === true;
  };
  context.finalPiWorkflowStatus = function finalPiWorkflowStatus(container) {
    if (context.isFinalPiReceived(container)) return {
      key: 'received',
      label: `已到倉 ${context.escapeFinalPiText(context.finalPiLogistics(container).actualReceived || '')}`,
      cls: 'bg-success'
    };
    if (context.isFinalPiConfirmed(container)) return {
      key: 'final',
      label: 'FINAL PI ✓ / 待到倉',
      cls: 'bg-primary'
    };
    return {
      key: 'pending',
      label: 'PI 尚未 Final',
      cls: 'bg-warning text-dark'
    };
  };
  context.updateFinalPiPendingBadge = function updateFinalPiPendingBadge() {
    const badge = document.getElementById('finalPiPendingBadge');
    if (!badge) return;
    const n = Object.values(window.appData.finalPiContainers || {}).filter(c => !context.isFinalPiReceived(c) && !context.isFinalPiConfirmed(c)).length;
    badge.textContent = n;
    badge.classList.toggle('d-none', n === 0);
  };
  context.renderFinalPiContainerList = function renderFinalPiContainerList() {
    const host = document.getElementById('finalPiContainerList');
    const count = document.getElementById('finalPiContainerCount');
    if (!host) return;
    const containers = Object.values(window.appData.finalPiContainers || {}).sort(context.finalPiContainerSort);
    if (count) count.textContent = `${containers.length} 條貨櫃`;
    context.updateFinalPiPendingBadge();
    if (!containers.length) {
      host.innerHTML = '<div class="text-muted text-center py-4">尚未匯入 Final PI。</div>';
      return;
    }
    host.innerHTML = containers.map(c => {
      const rows = c.rows || [];
      const total = rows.reduce((n, r) => n + (Number(r.qty) || 0), 0);
      const unique = new Set(rows.map(r => `${r.itemCode}|${r.barcode}`)).size;
      const arrived = context.isFinalPiReceived(c);
      const wf = context.finalPiWorkflowStatus(c);
      const lg = context.finalPiLogistics(c);
      const overdue = !arrived && !lg.unloadDate && lg.eta && lg.eta < context.getFinalPiToday();
      const status = `<div class="text-end"><span class="badge ${wf.cls}">${wf.label}</span><div class="small ${overdue ? 'text-danger fw-bold' : 'text-muted'} mt-1">${lg.linked ? '到港日 ' + context.escapeFinalPiText(lg.portDate || (lg.etaEstimated ? lg.eta + '（15日推估）' : '—')) + ' · 拆櫃日 ' + context.escapeFinalPiText(lg.unloadDate || '—') : '⚠ Container Tracker 尚未建立此櫃'}</div></div>`;
      const detail = rows.map(r => {
        const p = context.getFinalPiProduct(r);
        return `<tr><td>${context.escapeFinalPiText(r.itemCode || p.itemCode || '-')}</td><td class="small">${context.escapeFinalPiText(r.barcode || '-')}</td><td>${context.escapeFinalPiText(p.name || '⚠️ 商品資料待補')}</td><td class="text-end fw-bold">${Number(r.qty).toLocaleString()} CTN</td><td class="text-end">${r.unitPrice === null || r.unitPrice === undefined || r.unitPrice === '' ? '—' : '¥' + Number(r.unitPrice).toLocaleString()}</td><td>${context.escapeFinalPiText(r.expiryDate || '-')}</td><td>${r.shelfLifeMonths == null ? '—' : context.escapeFinalPiText(r.shelfLifeMonths) + ' 月'}</td></tr>`;
      }).join('');
      return `<div class="border rounded p-3 mb-3 ${arrived ? 'bg-light' : ''}">
        <div class="d-flex flex-wrap justify-content-between gap-2 align-items-start"><div><div class="fw-bold fs-5">${context.escapeFinalPiText(c.container)} ${context.frozenBadgeHtml(c.container)}</div><div class="small text-muted">${context.escapeFinalPiText(c.supplier || '-')}｜${unique} 個商品｜<strong>${total.toLocaleString()} CTN</strong>｜匯入 ${context.escapeFinalPiText((c.importedAt || '').slice(0, 10) || '-')}</div></div>${status}</div>
        <div class="row g-2 align-items-center mt-2"><div class="col-md-7"><div class="small text-muted">到港日／拆櫃日／Expected Month 請統一至「Container Tracker」維護。</div></div><div class="col-md-5"><div class="form-check form-switch border rounded p-2 ps-5 bg-white"><input class="form-check-input final-pi-final-toggle" type="checkbox" data-container="${context.escapeFinalPiText(c.container)}" ${context.isFinalPiConfirmed(c) ? 'checked' : ''}><label class="form-check-label fw-bold">此 PI 已確認為 Final Version</label></div></div></div>
        <details class="mt-3"><summary class="text-primary" style="cursor:pointer">查看整櫃內容（${rows.length} 列）</summary><div class="table-responsive mt-2"><table class="table table-sm table-hover align-middle"><thead class="table-light"><tr><th>Item Code</th><th>Barcode</th><th>商品名稱</th><th class="text-end">箱數</th><th class="text-end">單包價</th><th>Expiry</th><th>保存期限</th></tr></thead><tbody>${detail}</tbody></table></div></details>
      </div>`;
    }).join('');
    host.querySelectorAll('.final-pi-final-toggle').forEach(box => box.addEventListener('change', async () => {
      const key = context.normalizeContainerNo(box.dataset.container);
      const obj = (window.appData.finalPiContainers || {})[key];
      if (!obj) return;
      obj.isFinal = box.checked;
      const ok = await context.saveFirebaseData();
      if (ok) {
        context.renderFinalPiContainerList();
        context.renderFinalPiSearch();
        context.showAppToast(box.checked ? `${key} 已標記 FINAL PI` : `${key} 已取消 FINAL PI`, 'success');
      }
    }));
  };
  context.renderFinalPiSearch = function renderFinalPiSearch() {
    const host = document.getElementById('finalPiSearchResults');
    const input = document.getElementById('finalPiSearch');
    if (!host || !input) return;
    const q = String(input.value || '').trim().toLowerCase();
    if (!q) {
      host.innerHTML = '<div class="text-muted text-center py-4">輸入商品資料即可查詢它在哪些貨櫃、各有幾箱。</div>';
      return;
    }
    const matches = [];
    Object.values(window.appData.finalPiContainers || {}).forEach(c => (c.rows || []).forEach(r => {
      const p = context.getFinalPiProduct(r);
      const hay = [r.itemCode, r.barcode, p.itemCode, p.name].map(v => String(v || '').toLowerCase()).join(' ');
      if (hay.includes(q)) matches.push({
        c,
        r,
        p
      });
    }));
    const matchedCodes = new Set(matches.map(x => String(x.r.itemCode || x.p.itemCode || '').trim().toUpperCase()).filter(Boolean));
    Object.values(window.appData.products || {}).forEach(p => {
      if ([p.itemCode, p.name, p.sourceBarcode].some(v => String(v || '').toLowerCase().includes(q))) matchedCodes.add(String(p.itemCode || '').trim().toUpperCase());
    });
    const customerRows = context.auth.currentUser && context.currentDataMode === 'live' ? context.customerRows : null;
    (customerRows || []).forEach(o => {if (String(o.code || '').toLowerCase().includes(q)) matchedCodes.add(String(o.code).trim().toUpperCase());});
    if (!matches.length && !matchedCodes.size) {
      host.innerHTML = '<div class="alert alert-light border text-center mb-0">找不到任何 Final PI 貨櫃紀錄。</div>';
      return;
    }
    const groups = new Map();
    matches.forEach(x => {
      const key = context.normalizeContainerNo(x.c.container);
      if (!groups.has(key)) groups.set(key, {
        c: x.c,
        rows: []
      });
      groups.get(key).rows.push(x);
    });
    const arr = [...groups.values()].sort((a, b) => context.finalPiContainerSort(a.c, b.c));
    const future = arr.filter(g => !context.isFinalPiReceived(g.c)),
      received = arr.filter(g => context.isFinalPiReceived(g.c));
    const futureQty = future.reduce((sum, g) => sum + g.rows.reduce((n, x) => n + (Number(x.r.qty) || 0), 0), 0);
    const receivedQty = received.reduce((sum, g) => sum + g.rows.reduce((n, x) => n + (Number(x.r.qty) || 0), 0), 0);
    const finalFuture = future.filter(g => context.isFinalPiConfirmed(g.c)),
      pendingFuture = future.filter(g => !context.isFinalPiConfirmed(g.c));
    const finalFutureQty = finalFuture.reduce((sum, g) => sum + g.rows.reduce((n, x) => n + (Number(x.r.qty) || 0), 0), 0);
    const pendingFutureQty = pendingFuture.reduce((sum, g) => sum + g.rows.reduce((n, x) => n + (Number(x.r.qty) || 0), 0), 0);
    const names = [...new Set(matches.map(x => x.p.name).filter(Boolean))];
    const codes = [...new Set(matches.map(x => x.r.itemCode).filter(Boolean))];
    const renderGroup = g => {
      const qty = g.rows.reduce((n, x) => n + (Number(x.r.qty) || 0), 0);
      const wf = context.finalPiWorkflowStatus(g.c);
      const details = '<div class="table-responsive mt-2"><table class="table table-sm pi-search-table"><colgroup><col style="width:110px"><col><col style="width:80px"><col style="width:120px"><col style="width:100px"></colgroup><thead><tr><th>品號</th><th>商品名稱</th><th class="text-end">箱數</th><th>效期</th><th class="text-end">單價</th></tr></thead><tbody>' + g.rows.map(x => '<tr><td><strong>' + context.escapeFinalPiText(x.r.itemCode || x.p.itemCode || x.r.barcode || '—') + '</strong></td><td>' + context.escapeFinalPiText(x.p.name || x.r.itemCode || '未命名商品') + '</td><td class="text-end fw-bold">' + Number(x.r.qty).toLocaleString() + '</td><td>' + context.escapeFinalPiText(x.r.expiryDate || '未填') + '</td><td class="text-end">' + (x.r.unitPrice === null || x.r.unitPrice === undefined || x.r.unitPrice === '' ? '—' : '¥' + Number(x.r.unitPrice).toLocaleString()) + '</td></tr>').join('') + '</tbody></table></div>';
      return `<div class="border rounded p-3 mb-2"><div class="d-flex justify-content-between gap-2"><div><div class="fw-bold fs-5">📦 ${context.escapeFinalPiText(g.c.container)} ${context.frozenBadgeHtml(g.c.container)}</div><div class="small text-muted">${context.escapeFinalPiText(g.c.supplier || '-')}｜<span class="badge ${wf.cls}">${wf.label}</span>｜${context.isFinalPiReceived(g.c) ? '已拆櫃 ' + context.escapeFinalPiText(context.finalPiLogistics(g.c).actualReceived) : '待拆櫃 ' + context.escapeFinalPiText(context.finalPiLogistics(g.c).unloadDate || '—')}</div></div><div class="text-end"><div class="fw-bold fs-4 text-primary">${qty.toLocaleString()} CTN<div class="small fw-normal text-muted">符合搜尋條件</div></div></div></div>${details}</div>`;
    };
    host.innerHTML = `<div class="border rounded p-3 mb-3 bg-light"><div class="fw-bold fs-5">找到 ${matchedCodes.size} 項商品 · ${arr.length} 個貨櫃</div><div class="mt-2"><span class="badge bg-warning text-dark me-2">🚢 未到貨箱數 ${futureQty.toLocaleString()} 箱 / ${future.length} 櫃</span><span class="badge bg-primary me-2">✓ Final ${finalFutureQty.toLocaleString()} CTN</span><span class="badge bg-danger me-2">⚠ 未 Final ${pendingFutureQty.toLocaleString()} CTN</span><span class="badge bg-secondary">🏭 已到倉 ${receivedQty.toLocaleString()} CTN / ${received.length} Containers</span></div></div>${renderCustomerDemand({rows:customerRows,codes:matchedCodes,incoming:futureQty,fetchedAt:context.currentDataMode === 'live' ? context.customerFetchedAt : 0,status:context.currentDataMode === 'live' ? context.customerStatus : 'TEST：不讀正式客訂',containers:future.map(g=>g.c.container)})}<h5 class="text-warning-emphasis">🚢 未到貨貨櫃</h5>${future.length ? future.map(renderGroup).join('') : '<div class="text-muted mb-3">目前沒有未到貨貨櫃。</div>'}<details class="mt-3" ${future.length ? '' : 'open'}><summary class="fw-bold text-secondary" style="cursor:pointer">🏭 查看已到倉紀錄（${received.length} 條貨櫃 / ${receivedQty.toLocaleString()} CTN）</summary><div class="mt-2">${received.length ? received.map(renderGroup).join('') : '<div class="text-muted">沒有已到倉紀錄。</div>'}</div></details>`;
  };
}
export function initialize(context) {}
