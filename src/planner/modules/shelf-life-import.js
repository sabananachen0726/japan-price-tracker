// planner: shelf-life-import. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "shelf-life-import",
  "owns": [{
    "name": "pendingShelfImport",
    "kind": "let"
  }, {
    "name": "shelfColName",
    "kind": "const"
  }, {
    "name": "shelfItemHeaders",
    "kind": "const"
  }, {
    "name": "shelfBarcodeHeaders",
    "kind": "const"
  }, {
    "name": "shelfMonthsHeaders",
    "kind": "const"
  }, {
    "name": "normalizeShelfBarcode",
    "kind": "function"
  }, {
    "name": "parseShelfGrid",
    "kind": "function"
  }, {
    "name": "loadShelfFile",
    "kind": "function"
  }, {
    "name": "previewShelfImport",
    "kind": "function"
  }],
  "imports": ["$", "catalogReady", "csvCell", "download", "esc", "norm", "openPlannerDialog", "plannerRole", "saveCatalogPatch", "shelfLife", "state", "statusDelimitedRows", "trackerFeed"],
  "writes": ["loadShelfFile", "normalizeShelfBarcode", "parseShelfGrid", "pendingShelfImport", "previewShelfImport", "shelfBarcodeHeaders", "shelfColName", "shelfItemHeaders", "shelfMonthsHeaders"]
};
export function register(context) {
  context.normalizeShelfBarcode = function normalizeShelfBarcode(value) {
    return String(value ?? '').normalize('NFKC').trim().replace(/^['’]/, '').replace(/[\s\u200B-\u200D\uFEFF-]/g, '').toUpperCase();
  };
  context.parseShelfGrid = function parseShelfGrid(grid, label) {
    const rows = (grid || []).filter(r => Array.isArray(r) && r.some(c => String(c ?? '').trim()));
    if (!rows.length) throw Error('沒有讀到商品資料');
    let ci = -1,
      bi = -1,
      mi = 1,
      start = 0,
      header = false,
      auto = false;
    for (let k = 0; k < Math.min(12, rows.length); k++) {
      const cols = rows[k].map(context.shelfColName),
        a = cols.findIndex(v => context.shelfItemHeaders.has(v)),
        b = cols.findIndex(v => context.shelfBarcodeHeaders.has(v)),
        c = cols.findIndex(v => context.shelfMonthsHeaders.has(v));
      if ((a >= 0 || b >= 0) && c >= 0) {
        ci = a;
        bi = b;
        mi = c;
        start = k + 1;
        header = true;
        break;
      }
    }
    if (!header) {
      if (rows[0].length !== 2) throw Error('請提供 Barcode / JAN 或 Item Code 與 Shelf Life (Months) 標題列；無標題時請貼上兩欄：Barcode 或 Item Code、保存期限（月）');
      // Resolve each headerless identifier against both indexes during preview.
      auto = true;
      mi = 1;
    }
    return rows.slice(start).map((r, k) => ({
      autoKey: auto ? String(r[0] ?? '').trim() : '',
      code: ci >= 0 ? context.norm(r[ci]) : '',
      barcode: bi >= 0 ? context.normalizeShelfBarcode(r[bi]) : '',
      raw: String(r[mi] ?? '').trim(),
      line: start + k + 1,
      from: label
    })).filter(r => r.autoKey || r.code || r.barcode || r.raw);
  };
  context.loadShelfFile = async function loadShelfFile(file) {
    if (/\.(csv|tsv|txt)$/i.test(file.name)) return context.parseShelfGrid(context.statusDelimitedRows(await file.text()), file.name);
    if (typeof XLSX === 'undefined') throw Error('Excel 元件無法載入；可改用複製 Excel 兩欄貼上');
    const wb = XLSX.read(await file.arrayBuffer(), {
      type: 'array',
      cellDates: false
    });
    // Only import from one sheet; do not read supplementary sheets unexpectedly.
    const ws = wb.Sheets[wb.SheetNames[0]];
    return context.parseShelfGrid(XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false
    }), file.name);
  };
  context.previewShelfImport = function previewShelfImport(rows, label) {
    if (!['admin', 'editor'].includes(context.plannerRole) || !context.trackerFeed || !context.catalogReady) throw Error('請先完成主檔和共享設定同步，並使用 Admin／Editor 登入');
    const found = new Map(context.state.items.filter(i => !i.code.startsWith('__')).map(i => [i.code, i]));
    const byBarcode = new Map();
    for (const item of found.values()) {
      const key = context.normalizeShelfBarcode(item.barcode);
      if (key) {
        if (!byBarcode.has(key)) byBarcode.set(key, []);
        byBarcode.get(key).push(item);
      }
    }
    const unique = new Map(),
      errors = [];
    let unmatched = 0,
      ambiguous = 0,
      invalid = 0,
      duplicates = 0,
      unchanged = 0,
      blank = 0;
    for (const row of rows) {
      if (!row.autoKey && !row.code && !row.barcode) {
        invalid++;
        errors.push(`第 ${row.line} 列：缺少 Barcode / JAN 或 Item Code`);
        continue;
      }
      if (!row.raw) {
        blank++;
        continue;
      }
      let item = null;
      if (row.autoKey) {
        const candidates = new Map();
        const codeMatch = found.get(context.norm(row.autoKey));
        if (codeMatch) candidates.set(codeMatch.code, codeMatch);
        for (const match of byBarcode.get(context.normalizeShelfBarcode(row.autoKey)) || []) candidates.set(match.code, match);
        if (!candidates.size) {
          unmatched++;
          errors.push(`第 ${row.line} 列 ${row.autoKey}：Barcode／Item Code 都找不到已核准商品，略過`);
          continue;
        }
        if (candidates.size > 1) {
          ambiguous++;
          errors.push(`第 ${row.line} 列 ${row.autoKey}：辨識到多款商品（${[...candidates.keys()].join('、')}），請提供 Barcode 與 Item Code 標題欄位確認，略過`);
          continue;
        }
        item = [...candidates.values()][0];
      } else if (row.barcode) {
        const matches = byBarcode.get(row.barcode) || [];
        if (matches.length === 0) {
          unmatched++;
          errors.push(`第 ${row.line} 列 Barcode ${row.barcode}：找不到已核准商品，略過`);
          continue;
        }
        if (matches.length > 1) {
          ambiguous++;
          errors.push(`第 ${row.line} 列 Barcode ${row.barcode}：對應多款商品（${matches.map(i => i.code).join('、')}），請人工確認，略過`);
          continue;
        }
        item = matches[0];
        if (row.code && row.code !== item.code) {
          invalid++;
          errors.push(`第 ${row.line} 列 Barcode ${row.barcode} 對應 ${item.code}，但 Item Code 填寫 ${row.code}；兩者不一致，略過`);
          continue;
        }
      } else {
        item = found.get(row.code);
        if (!item) {
          unmatched++;
          errors.push(`第 ${row.line} 列 Item Code ${row.code}：不是目前三來源的已核准商品，略過`);
          continue;
        }
      }
      const clear = /^(clear|remove|清除|刪除)$/i.test(row.raw);
      const n = clear ? null : Number(row.raw.replace(/\s*(?:months?|個?月)$/i, ''));
      if (!clear && (!/^(?:\d+)(?:\s*(?:months?|個?月))?$/i.test(row.raw) || !Number.isInteger(n) || n < 1 || n > 120)) {
        invalid++;
        errors.push(`第 ${row.line} 列 ${row.barcode || row.code}：保存期限「${row.raw}」不合法，請填 1～120 或 CLEAR`);
        continue;
      }
      // Deduplicate by resolved Item Code, even when one row supplied a barcode and another a code.
      if (unique.has(item.code)) {
        duplicates++;
        const prev = unique.get(item.code);
        if (prev.months !== n) {
          prev.conflict = true;
          errors.push(`${item.code}：多筆資料指定不同保存期限，整款略過`);
        }
        continue;
      }
      unique.set(item.code, {
        months: n,
        conflict: false,
        barcode: context.normalizeShelfBarcode(item.barcode)
      });
    }
    const changes = [];
    for (const [code, v] of unique) {
      if (v.conflict) continue;
      const item = found.get(code),
        old = context.shelfLife(item);
      if (old === v.months) {
        unchanged++;
        continue;
      }
      changes.push({
        code,
        barcode: v.barcode,
        name: item.name,
        old,
        months: v.months
      });
    }
    context.pendingShelfImport = {
      changes,
      label
    };
    context.$('shelfPreviewSummary').textContent = `${label}：讀入 ${rows.length} 列｜更新 ${changes.length} 款｜無需更新 ${unchanged}｜空白略過 ${blank}｜找不到 ${unmatched}｜辨識不唯一 ${ambiguous}｜重複 ${duplicates}｜無效／不一致 ${invalid}`;
    const preview = changes.slice(0, 60).map(x => `<tr><td>${context.esc(x.barcode || '—')}</td><td>${context.esc(x.code)}</td><td>${context.esc(x.name)}</td><td>${x.old ?? '未設定'}</td><td><b>${x.months ?? '清除'}</b></td></tr>`).join('');
    context.$('shelfPreviewDetails').innerHTML = `<table><thead><tr><th>Barcode / JAN</th><th>Item Code</th><th>商品</th><th>目前（月）</th><th>更新後（月）</th></tr></thead><tbody>${preview || '<tr><td colspan="5">沒有需要更新的商品</td></tr>'}</tbody></table>${changes.length > 60 ? '<p>僅顯示前 60 筆，套用時包含全部。</p>' : ''}${errors.length ? `<details><summary>查看 ${errors.length} 筆略過／待確認</summary><pre style="white-space:pre-wrap">${context.esc(errors.slice(0, 120).join('\n'))}</pre></details>` : ''}`;
    context.$('shelfPreviewDetails').classList.remove('hidden');
    context.$('shelfApply').disabled = !changes.length;
  };
}
export function initialize(context) {
  context.pendingShelfImport = null;
  context.shelfColName = x => String(x ?? '').replace(/^\ufeff/, '').trim().toLowerCase().replace(/[\s_.\-()/（）年月]+/g, '');
  context.shelfItemHeaders = new Set(['itemcode', 'itemnumber', 'itemno', '品號', '商品編號', '商品代碼', '貨號']);
  context.shelfBarcodeHeaders = new Set(['barcode', 'barcodejan', 'jancode', 'jan', 'ean', 'ean13', 'gtin', '條碼', '商品條碼', '國際條碼', '商品barcode']);
  context.shelfMonthsHeaders = new Set(['shelflife', 'shelflifemonths', '保存期限', '有效期限', '固定保存期限', '保質期']);
  context.$('openShelfImport').onclick = () => {
    if (!['admin', 'editor'].includes(context.plannerRole)) return alert('Viewer 無法修改保存期限');
    if (!context.trackerFeed || !context.catalogReady) return alert('商品主檔及共享設定尚未連線完成，請稍後再試');
    context.pendingShelfImport = null;
    context.$('shelfPaste').value = '';
    context.$('shelfFile').value = '';
    context.$('shelfPreviewSummary').textContent = '';
    context.$('shelfPreviewDetails').classList.add('hidden');
    context.$('shelfApply').disabled = true;
    context.openPlannerDialog(context.$('shelfImportDialog'));
  };
  context.$('shelfPreviewPaste').onclick = () => {
    try {
      context.previewShelfImport(context.parseShelfGrid(context.statusDelimitedRows(context.$('shelfPaste').value), '貼上資料'), '貼上資料');
    } catch (err) {
      alert('預覽失敗：' + err.message);
    }
  };
  context.$('shelfChooseFile').onclick = () => context.$('shelfFile').click();
  context.$('shelfFile').onchange = async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      context.previewShelfImport(await context.loadShelfFile(f), f.name);
    } catch (err) {
      context.pendingShelfImport = null;
      context.$('shelfApply').disabled = true;
      alert('檔案讀取失敗：' + err.message);
    }
  };
  context.$('shelfClose').onclick = () => context.$('shelfImportDialog').close();
  context.$('shelfApply').onclick = () => {
    const p = context.pendingShelfImport;
    if (!p?.changes?.length) return;
    if (!['admin', 'editor'].includes(context.plannerRole) || !context.trackerFeed || !context.catalogReady) return alert('登入或共享連線狀態已改變，請重新預覽');
    if (!confirm(`確定將 ${p.changes.length} 款商品的固定保存期限更新到共享設定？\n\n未列出的商品及原本空白列不變。`)) return;
    const overrides = {};
    for (const r of p.changes) overrides[r.code] = {
      shelfLifeMonths: r.months
    };
    context.$('shelfApply').disabled = true;
    context.$('shelfImportDialog').close();
    context.pendingShelfImport = null;
    context.saveCatalogPatch({
      overrides
    });
  };
  context.$('downloadShelfTemplate').onclick = () => context.download('Kaisi_Shelf_Life_Months_Barcode_Template.csv', '\ufeff' + [['Barcode / JAN', 'Item Code', 'Product Name', 'Shelf Life (Months)'], ...context.state.items.filter(i => !i.code.startsWith('__')).map(i => [String(i.barcode || ''), i.code, i.name, context.shelfLife(i) ?? ''])].map(row => row.map(context.csvCell).join(',')).join('\r\n'), 'text/csv');
  for (const [id, key] of [['dryInterval', 'dry'], ['frozenInterval', 'frozen'], ['defaultCoverage', 'coverage']]) context.$(id).onchange = () => {
    const v = Number(context.$(id).value);
    if (!Number.isFinite(v) || v < 0) {
      alert('請填非負數字');
      return;
    }
    context.saveCatalogPatch({
      rules: {
        [key]: v
      }
    });
    if (key === 'coverage') context.$('coverage').value = v;
  };
}
