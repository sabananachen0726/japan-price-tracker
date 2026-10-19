// planner: settings-import. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "settings-import",
  "owns": [{
    "name": "unifiedPending",
    "kind": "let"
  }, {
    "name": "UNIFIED_FIELDS",
    "kind": "const"
  }, {
    "name": "unifiedImportGrid",
    "kind": "function"
  }, {
    "name": "unifiedImportFile",
    "kind": "function"
  }, {
    "name": "previewUnified",
    "kind": "function"
  }],
  "imports": ["$", "catalogReady", "esc", "events", "exportSettings412", "factor", "norm", "openPlannerDialog", "parseStatusValue", "plannerRole", "saveCatalogPatch", "shelfColName", "shelfItemHeaders", "shelfLife", "state", "statusDelimitedRows", "trackerFeed", "val"],
  "writes": ["UNIFIED_FIELDS", "previewUnified", "unifiedImportFile", "unifiedImportGrid", "unifiedPending"]
};
export function register(context) {
  context.unifiedImportGrid = function unifiedImportGrid(grid, label) {
    const raw = (grid || []).filter(r => Array.isArray(r) && r.some(v => String(v ?? '').trim()));
    if (!raw.length) throw Error('檔案沒有商品資料');
    let names = null,
      heading = -1;
    for (let i = 0; i < Math.min(raw.length, 12); i++) {
      const n = raw[i].map(context.shelfColName);
      if (n.some(x => context.shelfItemHeaders.has(x))) {
        names = n;
        heading = i;
        break;
      }
    }
    if (heading < 0) throw Error('請提供標題列「Item Code」及至少一個設定欄位；不接受無標題的多欄檔案');
    const codeCol = names.findIndex(x => context.shelfItemHeaders.has(x));
    const mapping = {};
    for (const [key, aliases] of Object.entries(context.UNIFIED_FIELDS)) {
      const idx = names.findIndex(n => aliases.has(n));
      if (idx >= 0) mapping[key] = idx;
    }
    if (!Object.keys(mapping).length) throw Error('找不到 Monthly Sales／Safety Stock／Factor／Shelf Life (Months)／Status 任一欄位');
    return raw.slice(heading + 1).map((r, i) => ({
      code: context.norm(r[codeCol]),
      line: heading + 2 + i,
      fields: Object.fromEntries(Object.entries(mapping).map(([key, col]) => [key, String(r[col] ?? '').trim()]))
    }));
  };
  context.unifiedImportFile = async function unifiedImportFile(file) {
    if (/\.(csv|tsv|txt)$/i.test(file.name)) return context.unifiedImportGrid(context.statusDelimitedRows(await file.text()), file.name);
    if (typeof XLSX === 'undefined') throw Error('Excel 元件尚未載入；請改貼上資料或重新連線');
    const wb = XLSX.read(await file.arrayBuffer(), {
      type: 'array',
      cellDates: false
    });
    if (wb.SheetNames.length > 1) context.$('unifiedWarning').textContent = '提醒：只讀取第一張工作表 ' + wb.SheetNames[0] + '；其他工作表未處理。';
    return context.unifiedImportGrid(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false
    }), file.name);
  };
  context.previewUnified = function previewUnified(rows, label) {
    if (!['admin', 'editor'].includes(context.plannerRole)) throw Error('此功能只有 Admin／Editor 可以使用');
    if (!context.trackerFeed || !context.catalogReady) throw Error('請等待商品主檔與共享商品設定同步完成');
    const productMap = new Map(context.state.items.map(i => [i.code, i]));
    const proposals = new Map(),
      warnings = [];
    let notFound = 0,
      blank = 0,
      invalid = 0,
      duplicates = 0,
      unchanged = 0;
    for (const r of rows) {
      if (!r.code) {
        invalid++;
        warnings.push(`第 ${r.line} 列：Item Code 空白`);
        continue;
      }
      const item = productMap.get(r.code);
      if (!item) {
        notFound++;
        warnings.push(`${r.code}：不在目前三來源商品清單內，略過`);
        continue;
      }
      if (proposals.has(r.code)) {
        duplicates++;
        proposals.get(r.code).conflict = true;
        warnings.push(`${r.code}：重複品號，整個品號略過，避免錯誤覆蓋`);
        continue;
      }
      const proposed = {
        code: r.code,
        name: item.name,
        items: {},
        overrides: {},
        changes: [],
        conflict: false
      };
      let bad = false;
      for (const [key, value] of Object.entries(r.fields)) {
        if (key === 'monthlySource') continue;
        if (key === 'monthly' && r.fields.monthlySource) {
          const source = r.fields.monthlySource.trim().toLowerCase();
          if (!['auto', '自動', 'manual', '手動'].includes(source)) {
            warnings.push(r.code + '：月銷來源需為 Auto 或 Manual');
            bad = true;
            break;
          }
          if (source === 'auto' || source === '自動') {
            if (typeof context.state.overrides[r.code]?.monthly === 'number') {
              proposed.overrides.monthly = null;
              proposed.changes.push('月銷 → 自動');
            }
            continue;
          }
        }
        if (!value) {
          blank++;
          continue;
        }
        if (key === 'availability') {
          const want = context.parseStatusValue(value);
          if (!want) {
            warnings.push(`${r.code}：Active／Inactive 值「${value}」無效`);
            bad = true;
            break;
          }
          const old = item.availability || 'active',
            next = want === 'active' ? 'active' : old === 'discontinued' ? 'discontinued' : 'paused';
          if (old !== next) {
            proposed.items.availability = next;
            proposed.changes.push(`狀態 ${old} → ${next}`);
          }
          continue;
        }
        const clear = /^(clear|清除)$/i.test(value),
          parsed = Number(value),
          next = clear ? null : parsed;
        if (!clear && (!Number.isFinite(parsed) || parsed < 0 || key === 'factor' && parsed === 0 || key === 'shelfLifeMonths' && (!Number.isInteger(parsed) || parsed < 1 || parsed > 120))) {
          warnings.push(`${r.code}：${key}「${value}」格式錯誤`);
          bad = true;
          break;
        }
        const old = key === 'shelfLifeMonths' ? context.shelfLife(item) : key === 'factor' ? clear ? context.state.overrides[item.code]?.factor ?? null : context.factor(item) : context.val(item, key);
        if (old !== next) {
          proposed.overrides[key] = next;
          proposed.changes.push(`${key} ${old ?? '未設'} → ${next ?? '清除'}`);
        }
      }
      if (bad) {
        invalid++;
        continue;
      }
      if (!proposed.changes.length) unchanged++;
      proposals.set(r.code, proposed);
    }
    const changed = [...proposals.values()].filter(p => !p.conflict && p.changes.length);
    context.unifiedPending = {
      changed,
      label
    };
    context.$('unifiedSummary').textContent = `${label}：讀取 ${rows.length} 筆，預計更新 ${changed.length} 款／未變更 ${unchanged} 款／空白略過 ${blank} 格／未配對 ${notFound} 款／重複 ${duplicates} 筆／錯誤 ${invalid} 筆`;
    const display = changed.slice(0, 60).map(p => `<tr><td>${context.esc(p.code)}</td><td>${context.esc(p.name)}</td><td>${context.esc(p.changes.join('；'))}</td></tr>`).join('');
    context.$('unifiedPreview').innerHTML = `<table style="min-width:0"><thead><tr><th>Item Code</th><th>商品名稱</th><th>將修改的欄位</th></tr></thead><tbody>${display || '<tr><td colspan="3">沒有需要更新的欄位</td></tr>'}</tbody></table>` + (changed.length > 60 ? '<p class="mini">僅顯示前 60 款，確認後會處理所有變更。</p>' : '') + (warnings.length ? `<details><summary>查看 ${warnings.length} 筆略過／錯誤資訊</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${context.esc(warnings.slice(0, 130).join('\n'))}</pre></details>` : '');
    context.$('unifiedPreview').classList.remove('hidden');
    context.$('unifiedApply').disabled = !changed.length;
  };
}
export function initialize(context) {
  context.unifiedPending = null;
  context.UNIFIED_FIELDS = {
    monthly: new Set(['monthlysales', 'monthly', '月銷', '月均銷量']),
    monthlySource: new Set(['monthlysource', '月銷來源']),
    safety: new Set(['safetystock', 'safety', '安全庫存']),
    factor: new Set(['factor', '倍率', '換算倍率', '出貨單位／採購單位', '出貨單位採購單位']),
    shelfLifeMonths: new Set(['shelflifemonths', 'shelflife', '保存期限', '固定保存期限']),
    availability: new Set(['status', 'availability', 'activeinactive', '狀態', '商品狀態', '訂貨狀態', '是否訂購'])
  };
  context.$('openUnifiedImport').onclick = () => {
    if (!['admin', 'editor'].includes(context.plannerRole)) return alert('Viewer 無法匯入');
    if (!context.trackerFeed || !context.catalogReady) return alert('請等待共享資料同步完成後再匯入');
    context.unifiedPending = null;
    context.$('unifiedPaste').value = '';
    context.$('unifiedFile').value = '';
    context.$('unifiedWarning').textContent = '';
    context.$('unifiedPreview').classList.add('hidden');
    context.$('unifiedSummary').textContent = '';
    context.$('unifiedApply').disabled = true;
    context.openPlannerDialog(context.$('unifiedDialog'));
  };
  context.$('unifiedPreviewPaste').onclick = () => {
    try {
      context.previewUnified(context.unifiedImportGrid(context.statusDelimitedRows(context.$('unifiedPaste').value), '貼上資料'), '貼上資料');
    } catch (e) {
      alert('預覽失敗：' + e.message);
    }
  };
  context.$('unifiedChooseFile').onclick = () => context.$('unifiedFile').click();
  context.$('unifiedFile').onchange = async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      context.previewUnified(await context.unifiedImportFile(f), f.name);
    } catch (err) {
      context.unifiedPending = null;
      context.$('unifiedApply').disabled = true;
      alert('檔案解析失敗：' + err.message);
    }
  };
  context.$('unifiedCancel').onclick = () => context.$('unifiedDialog').close();
  context.$('unifiedApply').onclick = () => {
    const p = context.unifiedPending;
    if (!p?.changed?.length) return;
    if (!['admin', 'editor'].includes(context.plannerRole) || !context.trackerFeed || !context.catalogReady) return alert('帳號權限或共享資料狀態已改變，請重新預覽');
    if (!confirm(`確定批次更新 ${p.changed.length} 款商品設定？\n\n只修改預覽列出的欄位；沒有提供的商品及空白值都不會變更。`)) return;
    const items = {},
      overrides = {};
    for (const q of p.changed) {
      if (Object.keys(q.items).length) items[q.code] = q.items;
      if (Object.keys(q.overrides).length) overrides[q.code] = q.overrides;
    }
    context.$('unifiedApply').disabled = true;
    context.$('unifiedDialog').close();
    context.unifiedPending = null;
    context.saveCatalogPatch({
      items,
      overrides
    });
    context.$('unifiedResult').textContent = `${p.label}：已送出 ${p.changed.length} 款更新（${context.trackerFeed.mode === 'test' ? 'TEST 僅保存本機' : 'LIVE 請檢查共享同步狀態'}）。`;
  };
  context.$('unifiedDownloadTemplate').onclick = context.exportSettings412;
  // V4.8.2: one import entry point for embedded planner without new Firebase listeners.

  context.$('goPlannerImports').onclick = () => window.parent.postMessage({
    type: 'KAISI_OPEN_HUB',
    view: 'planner'
  }, '*');
  context.events.onMessage(e => {
    if (e.source !== window.parent || !e.data) return;
    if (e.data.type === 'KAISI_OPEN_IMPORT_CENTER') {
      document.body.classList.add('hub-import-only');
      document.querySelector('[data-tab="imports"]')?.click();
    }
    if (e.data.type === 'KAISI_OPEN_PLAN') {
      document.body.classList.remove('hub-import-only');
      document.querySelector('[data-tab="plan"]')?.click();
    }
  });
}
