// shell: pi-batch-query. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "pi-batch-query",
  "owns": [{
    "name": "FINAL_PI_BATCH_MAX_TERMS",
    "kind": "const"
  }, {
    "name": "finalPiBatchSnapshot",
    "kind": "let"
  }, {
    "name": "finalPiBatchTokens",
    "kind": "function"
  }, {
    "name": "batchPiContainerSort",
    "kind": "function"
  }, {
    "name": "buildFinalPiBatchResult",
    "kind": "function"
  }, {
    "name": "renderFinalPiBatchSearch",
    "kind": "function"
  }, {
    "name": "exportFinalPiBatch",
    "kind": "function"
  }, {
    "name": "readFinalPiBatchFile",
    "kind": "function"
  }],
  "imports": ["cleanBarcode", "escapeFinalPiText", "finalPiLogistics", "getFinalPiProduct", "getTimestampString", "isFinalPiConfirmed", "isFinalPiReceived", "normalizeContainerNo", "resolveToPrimaryBarcode", "showAppToast"],
  "writes": ["FINAL_PI_BATCH_MAX_TERMS", "batchPiContainerSort", "buildFinalPiBatchResult", "exportFinalPiBatch", "finalPiBatchSnapshot", "finalPiBatchTokens", "readFinalPiBatchFile", "renderFinalPiBatchSearch"]
};
export function register(context) {
  context.finalPiBatchTokens = function finalPiBatchTokens(raw) {
    const terms = [],
      seen = new Set();
    for (const line of String(raw || '').split(/\r?\n/)) {
      if (!line.trim()) continue;
      const bare = line.replace(/["'`]/g, '').trim();
      if (/^(?:(?:item\s*code|barcode|jan(?:\s*code)?|商品編號|品號|條碼|jan碼)[\s,，;；\t/\\]*)+$/i.test(bare)) continue;
      for (const cell of line.split(/[\t,，;；\s]+/)) {
        const term = context.cleanBarcode(cell).replace(/^["'`]+|["'`]+$/g, '').trim();
        if (!term || /^(item|code|itemcode|barcode|jan|jancode|商品編號|品號|條碼|\/|\\)$/i.test(term)) continue;
        const key = term.toUpperCase();
        if (!seen.has(key)) {
          seen.add(key);
          terms.push(term);
        }
      }
    }
    return terms;
  };
  context.batchPiContainerSort = function batchPiContainerSort(a, b) {
    // Sort YY / MM / sequence; ignore JSR / JTC and other alphabetic prefixes.
    const key = v => {
      const m = context.normalizeContainerNo(v).match(/(\d{2})B(\d{2})(\d{2})(?:F)?$/i);
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
    };
    const x = key(a),
      y = key(b);
    if (x && y) for (let i = 0; i < 3; i++) {
      if (x[i] !== y[i]) return x[i] - y[i];
    }
    if (!!x !== !!y) return x ? -1 : 1;
    return context.normalizeContainerNo(a).localeCompare(context.normalizeContainerNo(b), undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  };
  context.buildFinalPiBatchResult = function buildFinalPiBatchResult(terms) {
    const records = [],
      matchedTerms = new Set(),
      groups = new Map(),
      itemMap = window.appData.itemToBarcode || {};
    for (const c of Object.values(window.appData.finalPiContainers || {})) {
      (c.rows || []).forEach((r, index) => {
        const p = context.getFinalPiProduct(r);
        const code = String(r.itemCode || p.itemCode || '').trim().toUpperCase();
        const rawBarcode = context.cleanBarcode(r.barcode);
        const mappedBarcode = context.cleanBarcode(itemMap[code] || '');
        const barcode = rawBarcode || mappedBarcode;
        const primary = barcode ? context.resolveToPrimaryBarcode(barcode) : '';
        const rowPrimary = rawBarcode ? context.resolveToPrimaryBarcode(rawBarcode) : '';
        const mappedPrimary = mappedBarcode ? context.resolveToPrimaryBarcode(mappedBarcode) : '';
        const productCode = String(p.itemCode || '').trim().toUpperCase();
        records.push({
          c,
          r,
          p,
          index,
          code: code || productCode,
          barcode,
          primary,
          rawBarcode,
          rowPrimary,
          mappedPrimary,
          productCode
        });
      });
    }
    const tests = terms.map(term => {
      const upper = String(term).toUpperCase(),
        clean = context.cleanBarcode(term),
        isBarcode = /^\d{8,14}$/.test(clean);
      return {
        term,
        upper,
        clean,
        isBarcode,
        primary: isBarcode ? context.resolveToPrimaryBarcode(clean) : ''
      };
    });
    for (const x of records) {
      const hits = [];
      for (const t of tests) {
        const match = !!(t.upper && (t.upper === x.code || t.upper === x.productCode)) || !!(t.isBarcode && x.barcode && (x.rawBarcode === t.clean || x.barcode === t.clean || t.primary && (t.primary === x.primary || t.primary === x.rowPrimary || t.primary === x.mappedPrimary)));
        if (match) {
          hits.push(t.term);
          matchedTerms.add(t.term.toUpperCase());
        }
      }
      if (!hits.length) continue;
      // All different search keys that resolve to the same PI row are counted only once.
      const groupKey = x.code ? 'CODE:' + x.code : 'BARCODE:' + (x.primary || x.barcode);
      if (!groups.has(groupKey)) groups.set(groupKey, {
        code: x.code,
        barcode: x.primary || x.barcode,
        name: x.p.name || '',
        hits: new Set(),
        rows: [],
        future: 0,
        final: 0,
        pending: 0,
        received: 0,
        containers: new Set()
      });
      const g = groups.get(groupKey);
      if (!g.name && x.p.name) g.name = x.p.name;
      if (!g.barcode && (x.primary || x.barcode)) g.barcode = x.primary || x.barcode;
      hits.forEach(t => g.hits.add(t));
      const qty = Number(x.r.qty) || 0,
        received = context.isFinalPiReceived(x.c),
        isFinal = context.isFinalPiConfirmed(x.c);
      const logistic = context.finalPiLogistics(x.c);
      const track = logistic.linked;
      // This is a read-only lookup; do not invent an ETA when dates are unavailable.
      const eta = logistic.eta;
      const record = {
        container: x.c.container,
        supplier: x.c.supplier || '',
        version: isFinal ? 'Final' : '未 Final',
        status: received ? '已到倉' : '未到倉',
        qty,
        unitPrice: x.r.unitPrice,
        expiry: x.r.expiryDate || '',
        barcode: x.rawBarcode || x.barcode,
        code: x.code,
        name: x.p.name || '',
        eta,
        unloadDate: logistic.unloadDate,
        expectedMonth: logistic.expectedMonth
      };
      g.rows.push(record);
      g.containers.add(context.normalizeContainerNo(x.c.container));
      if (received) g.received += qty;else {
        g.future += qty;
        if (isFinal) g.final += qty;else g.pending += qty;
      }
    }
    const sorted = [...groups.values()].sort((a, b) => (a.code || a.barcode).localeCompare(b.code || b.barcode, undefined, {
      numeric: true,
      sensitivity: 'base'
    }));
    sorted.forEach(g => g.rows.sort((a, b) => context.batchPiContainerSort(a.container, b.container) || String(a.expiry).localeCompare(String(b.expiry))));
    return {
      terms,
      groups: sorted,
      notFound: terms.filter(t => !matchedTerms.has(t.toUpperCase())),
      matched: matchedTerms.size,
      rows: sorted.reduce((n, g) => n + g.rows.length, 0)
    };
  };
  context.renderFinalPiBatchSearch = function renderFinalPiBatchSearch(force = false) {
    const host = document.getElementById('finalPiBatchResult'),
      button = document.getElementById('btnExportFinalPiBatch');
    if (!host || !button) return;
    if (!force && !context.finalPiBatchSnapshot) return;
    const raw = document.getElementById('finalPiBatchInput')?.value || '';
    const terms = context.finalPiBatchTokens(raw);
    if (!terms.length) {
      context.finalPiBatchSnapshot = null;
      button.disabled = true;
      host.innerHTML = '<span class="text-muted">請貼上至少一個 Item Code 或 Barcode。</span>';
      return;
    }
    if (terms.length > context.FINAL_PI_BATCH_MAX_TERMS) {
      context.finalPiBatchSnapshot = null;
      button.disabled = true;
      host.innerHTML = `<span class="text-danger">一次最多 ${context.FINAL_PI_BATCH_MAX_TERMS} 個不同代碼，目前 ${terms.length} 個，請分批查詢。</span>`;
      return;
    }
    const result = context.buildFinalPiBatchResult(terms);
    context.finalPiBatchSnapshot = result;
    button.disabled = false;
    const sum = result.groups.reduce((a, g) => {
      a.future += g.future;
      a.received += g.received;
      return a;
    }, {
      future: 0,
      received: 0
    });
    const short = s => context.escapeFinalPiText(s || '—');
    const rows = result.groups.map(g => {
      const details = g.rows.map(r => `<tr><td>${short(r.container)}</td><td>${short(r.version)}</td><td>${short(r.status)}</td><td class="text-end">${Number(r.qty).toLocaleString()}</td><td>${short(r.expiry)}</td></tr>`).join('');
      return `<tr><td><div class="fw-semibold">${short(g.code || g.barcode)}</div><div class="text-muted small">${short(g.barcode)}</div></td><td>${short(g.name)}</td><td class="text-end fw-semibold">${g.future.toLocaleString()}</td><td class="text-end">${g.final.toLocaleString()} / ${g.pending.toLocaleString()}</td><td class="text-end">${g.received.toLocaleString()}</td><td><details><summary style="cursor:pointer;color:#0b5ed7">${g.containers.size} 櫃 · 查看明細</summary><div class="table-responsive mt-2"><table class="table table-sm table-striped table-bordered mb-0" style="min-width:470px"><thead><tr><th>貨櫃</th><th>版本</th><th>到貨狀態</th><th class="text-end">箱數</th><th>Expiry</th></tr></thead><tbody>${details}</tbody></table></div></details></td></tr>`;
    }).join('');
    host.innerHTML = `<div class="mb-2"><span class="badge bg-primary me-1">查詢 ${terms.length} 個代碼</span><span class="badge bg-success me-1">符合 ${result.groups.length} 款商品</span><span class="badge bg-warning text-dark me-1">未到倉 ${sum.future.toLocaleString()} CTN</span><span class="badge bg-secondary me-1">已到倉 ${sum.received.toLocaleString()} CTN</span>${result.notFound.length ? `<span class="badge bg-danger">未找到 ${result.notFound.length} 個代碼</span>` : ''}</div>` + (result.groups.length ? `<div class="table-responsive"><table class="table table-sm table-hover table-bordered align-middle mb-0"><thead class="table-light"><tr><th>Item Code／Barcode</th><th>商品名稱</th><th class="text-end">未到倉 CTN</th><th class="text-end">Final / 未 Final</th><th class="text-end">已到倉 CTN</th><th>貨櫃明細</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="alert alert-light border">沒有找到符合代碼的 PI 明細。</div>') + (result.notFound.length ? `<div class="mt-2 text-danger small"><strong>找不到：</strong>${result.notFound.slice(0, 30).map(short).join('、')}${result.notFound.length > 30 ? ' …（其餘請見匯出）' : ''}</div>` : '') + '<div class="small text-muted mt-2">箱數按 PI 明細去重；僅查詢已載入的 PI 資料，不會新增 Firebase 讀取。匯出保留各筆 PI 的保存期限、價格與到貨狀態。</div>';
  };
  context.exportFinalPiBatch = function exportFinalPiBatch() {
    const result = context.finalPiBatchSnapshot;
    if (!result?.terms?.length) return context.showAppToast('請先批次查詢，再匯出結果', 'warning');
    if (typeof XLSX === 'undefined') return context.showAppToast('Excel 元件尚未載入，請檢查網路後重試', 'danger');
    const summary = [['Item Code', 'Barcode / JAN', '商品名稱', '查詢輸入', '未到倉箱數 CTN', '其中 Final CTN', '其中未 Final CTN', '已到倉箱數 CTN', '貨櫃數']];
    const detail = [['Item Code', 'Barcode / JAN', '商品名稱', 'PI / 貨櫃', 'Supplier', 'PI 版本', '到貨狀態', '到港日（或15日推估）', '拆櫃日', 'Expected Month', '箱數 CTN', '單包價 JPY', 'Expiry Date', '符合的查詢代碼']];
    for (const g of result.groups) {
      const tokens = [...g.hits].join(' / ');
      summary.push([g.code || '', g.barcode || '', g.name || '', tokens, g.future, g.final, g.pending, g.received, g.containers.size]);
      for (const r of g.rows) {
        detail.push([r.code || g.code || '', r.barcode || g.barcode || '', r.name || g.name || '', r.container, r.supplier, r.version, r.status, r.eta, r.unloadDate, r.expectedMonth, r.qty, r.unitPrice ?? '', r.expiry, tokens]);
      }
    }
    const missing = [['未找到的 Item Code / Barcode'], ...result.notFound.map(t => [t])];
    const wb = XLSX.utils.book_new();
    for (const [name, rows, widths] of [['商品彙總', summary, [17, 21, 55, 33, 17, 17, 18, 17, 11]], ['PI 貨櫃明細', detail, [17, 21, 55, 18, 17, 14, 13, 16, 19, 18, 13, 14, 16, 34]], ['未找到', missing, [38]]]) {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = widths.map(w => ({
        wch: w
      }));
      // Barcodes must remain strings, including those with a leading zero.
      if (name !== '未找到') for (let i = 1; i < rows.length; i++) {
        const address = XLSX.utils.encode_cell({
          r: i,
          c: 1
        });
        if (ws[address]) {
          ws[address].t = 's';
          ws[address].v = String(rows[i][1] ?? '');
        }
      }
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
    XLSX.writeFile(wb, 'PI_批次查詢_' + context.getTimestampString() + '.xlsx');
  };
  context.readFinalPiBatchFile = async function readFinalPiBatchFile(file) {
    if (!file) return;
    try {
      let rows = [];
      if (/\.(csv|txt)$/i.test(file.name) && typeof XLSX === 'undefined') {
        rows = (await file.text()).split(/\r?\n/).map(x => x.split(/[\t,]/));
      } else {
        if (typeof XLSX === 'undefined') throw new Error('Excel 元件尚未載入');
        const wb = XLSX.read(await file.arrayBuffer(), {
          type: 'array'
        });
        if (!wb.SheetNames.length) throw new Error('檔案沒有工作表');
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
          header: 1,
          raw: false,
          defval: ''
        });
      }
      if (!rows.length) throw new Error('檔案內沒有代碼');
      const norm = v => String(v || '').trim().toLowerCase().replace(/[\s_\/()\-]/g, '');
      const head = rows[0].map(norm);
      const indexes = head.map((v, i) => /^(itemcode|barcode|jancode|jan|商品編號|品號|條碼)$/.test(v) ? i : -1).filter(i => i >= 0);
      const cols = indexes.length ? indexes : [0];
      const list = rows.slice(indexes.length ? 1 : 0).flatMap(r => cols.map(i => String(r[i] ?? '').trim())).filter(Boolean);
      const textarea = document.getElementById('finalPiBatchInput');
      textarea.value = list.join('\n');
      textarea.dispatchEvent(new Event('input'));
      document.getElementById('finalPiBatchResult').textContent = `已讀取 ${list.length} 筆代碼（${file.name}），請按「批次查詢」。`;
    } catch (e) {
      context.showAppToast('讀取查詢檔案失敗：' + (e.message || e), 'danger');
    }
  };
}
export function initialize(context) {
  context.FINAL_PI_BATCH_MAX_TERMS = 500;
  context.finalPiBatchSnapshot = null;
}
