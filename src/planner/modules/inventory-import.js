// planner: inventory-import. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "inventory-import",
  "owns": [{
    "name": "parseInventoryPaste",
    "kind": "function"
  }, {
    "name": "pendingInventoryImport",
    "kind": "let"
  }, {
    "name": "previewPastedInventory",
    "kind": "function"
  }, {
    "name": "commitPastedInventory",
    "kind": "function"
  }],
  "imports": ["$", "catalogReady", "discoverCatalog", "esc", "norm", "openPlannerDialog", "parseMYOBFactor", "plannerRole", "rebuildCatalog", "renderAll", "sourceSave", "state", "trackerFeed"],
  "writes": ["commitPastedInventory", "parseInventoryPaste", "pendingInventoryImport", "previewPastedInventory"]
};
export function register(context) {
  context.parseInventoryPaste = function parseInventoryPaste(text) {
    const lines = String(text || '').split(/\r?\n/),
      first = lines.find(line => line.trim()) || '';
    const csv = lines.slice(0, 20).some(line => line.includes(',') && /item\s*(number|code|no)/i.test(line) && /on\s*hand/i.test(line)) || first.includes(',') && !/\s/.test(first.split(',')[0].trim());
    const delimiter = text.includes('\t') ? '\t' : csv ? ',' : null;
    let rows = [];
    if (delimiter) {
      let row = [],
        cell = '',
        quoted = false;
      for (let n = 0; n < text.length; n++) {
        const ch = text[n];
        if (ch === '"') {
          if (quoted && text[n + 1] === '"') {
            cell += '"';
            n++;
          } else quoted = !quoted;
        } else if (!quoted && ch === delimiter) {
          row.push(cell);
          cell = '';
        } else if (!quoted && (ch === '\n' || ch === '\r')) {
          if (ch === '\r' && text[n + 1] === '\n') n++;
          row.push(cell);
          rows.push(row);
          row = [];
          cell = '';
        } else cell += ch;
      }
      if (quoted) throw Error('資料的引號未完整，請重新複製');
      row.push(cell);
      rows.push(row);
    } else rows = text.split(/\r?\n/).map(line => line.trim().split(/\s+/));
    rows = rows.filter(row => row.some(c => String(c).trim()));
    if (!rows.length) throw Error('請先貼上 MYOB 資料');
    const heading = x => String(x).replace(/^\ufeff/, '').trim().toLowerCase().replace(/[\s_.-]/g, '');
    let start = 0,
      codeColumn = 0,
      stockColumn = 1,
      unitColumn = -1,
      hasHeader = false;
    for (let n = 0; n < Math.min(rows.length, 20); n++) {
      const columns = rows[n].map(heading),
        code = columns.findIndex(x => ['itemnumber', 'itemcode', 'itemno'].includes(x)),
        stock = columns.indexOf('onhand');
      if (code >= 0 && stock >= 0) {
        start = n + 1;
        codeColumn = code;
        stockColumn = stock;
        unitColumn = columns.indexOf('customlist3');
        hasHeader = true;
        break;
      }
    }
    if (!hasHeader && rows.some(row => row.length !== 2)) throw Error('多欄 MYOB 資料請包含 Item Number／On Hand／Custom List 3 標題；無標題時只允許兩欄');
    const lookup = {},
      issues = [];
    let numeric = 0,
      validFactor = 0,
      unknownFactor = 0;
    for (let n = start; n < rows.length; n++) {
      const row = rows[n],
        code = context.norm(row[codeColumn]);
      if (!code) {
        issues.push(`第 ${n + 1} 列缺少 Item Number，未套用`);
        continue;
      }
      const raw = String(row[stockColumn] ?? '').trim();
      let cleaned = raw.replace(/,/g, '').replace(/\s/g, '');
      if (/^\([\d.]+\)$/.test(cleaned)) cleaned = '-' + cleaned.slice(1, -1);
      const stock = cleaned && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned) && Number.isFinite(Number(cleaned)) ? Number(cleaned) : null;
      const custom = unitColumn < 0 ? null : String(row[unitColumn] ?? '').trim();
      if (Object.hasOwn(lookup, code)) {
        if (lookup[code].stock !== stock || unitColumn >= 0 && lookup[code].custom !== custom) throw Error(`${code} 出現不同的庫存或 Custom List 3，請先整理重複列`);
        continue;
      }
      lookup[code] = {
        stock,
        ...(unitColumn >= 0 ? {
          custom
        } : {})
      };
      if (stock === null) issues.push(`${code}：On Hand 空白或無效，庫存待確認`);else numeric++;
      if (unitColumn >= 0) {
        if (context.parseMYOBFactor(custom) !== null) validFactor++;else {
          unknownFactor++;
          if (issues.length < 100) issues.push(`${code}：Custom List 3「${custom || '空白'}」無法換算，Factor 待確認`);
        }
      }
    }
    if (!numeric) throw Error('沒有讀到有效 On Hand 數字，舊快照未更動');
    return {
      rows: lookup,
      issues,
      numeric,
      hasUnitColumn: unitColumn >= 0,
      validFactor,
      unknownFactor
    };
  };
  context.previewPastedInventory = function previewPastedInventory(text) {
    if (!['admin', 'editor'].includes(context.plannerRole)) throw Error('Viewer 無法更新 MYOB 資料');
    if (!context.trackerFeed || !context.catalogReady) throw Error('商品主檔與共享設定尚未同步完成，請稍候');
    text = String(text || '').replace(/\r\n?/g, '\n');
    const result = context.parseInventoryPaste(text),
      matched = context.state.items.filter(i => Object.hasOwn(result.rows, i.code)).length;
    context.pendingInventoryImport = {
      text,
      result
    };
    context.$('applyInventoryPaste').disabled = false;
    const mode = result.hasUnitColumn ? '完整 MYOB：新 Factor 將優先，舊手動 Factor 於本次匯入後失效' : '舊兩欄：只更新庫存，Factor 保持目前設定';
    context.$('inventoryPasteResult').textContent = `預覽：${Object.keys(result.rows).length} 個品號、配對商品庫 ${matched} 款、有效庫存 ${result.numeric} 款。${result.hasUnitColumn ? `可換算 Factor ${result.validFactor} 款、待確認 ${result.unknownFactor} 款。` : ''}${mode}。尚未更新 Firebase。`;
    context.$('inventoryPasteResult').className = 'ok';
    const examples = Object.entries(result.rows).slice(0, 12).map(([code, r]) => `<tr><td>${context.esc(code)}</td><td>${r.stock ?? '待確認'}</td><td>${context.esc(r.custom ?? '未提供')}</td><td>${result.hasUnitColumn ? context.parseMYOBFactor(r.custom) ?? '待確認' : '不更新'}</td></tr>`).join('');
    context.$('inventoryPastePreview').innerHTML = `<table style="min-width:0"><thead><tr><th>Item Number</th><th>On Hand</th><th>Custom List 3</th><th>MYOB Factor</th></tr></thead><tbody>${examples}</tbody></table>${Object.keys(result.rows).length > 12 ? '<p class="mini">僅預覽前 12 款；確認後套用全部。</p>' : ''}${result.issues.length ? `<details><summary>查看 ${result.issues.length} 筆需注意的資料</summary><pre style="white-space:pre-wrap">${context.esc(result.issues.slice(0, 100).join('\n'))}</pre></details>` : ''}`;
  };
  context.commitPastedInventory = function commitPastedInventory() {
    const pending = context.pendingInventoryImport;
    if (!pending || context.$('inventoryPaste').value !== pending.text) return alert('資料已變更，請重新預覽');
    if (!['admin', 'editor'].includes(context.plannerRole) || !context.trackerFeed || !context.catalogReady) return alert('權限或連線狀態已改變，請重新預覽');
    const result = pending.result;
    const explanation = result.hasUnitColumn ? '本次會以最新 Custom List 3 重算 Factor；之前的手動 Factor 暫時覆蓋將失效。' : '本次為兩欄模式，只更新 On Hand，不更動 Factor。';
    if (!confirm(`確定將 ${Object.keys(result.rows).length} 筆 MYOB 資料設為最新快照？\n\n${explanation}\n未列出的品號庫存將變成待確認；不會更改月銷／最高庫存。`)) return;
    const rows = result.rows;
    // For stock-only legacy pastes, keep the previously known unit but do not create
    // a new Factor batch. A complete Custom List 3 paste is authoritative.
    if (!result.hasUnitColumn) for (const [code, r] of Object.entries(rows)) r.custom = String(context.state.inventory?.[code]?.custom || context.state.unitMetadata?.[code]?.custom || '');else context.state.myobFactorBatchId = 'myob-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    context.state.myobImportedAt = new Date().toISOString();
    context.state.inventory = rows;
    const matched = context.state.items.filter(i => Object.hasOwn(rows, i.code)).length,
      missing = context.state.items.length - matched;
    context.state.meta.myob = `貼上更新 · ${new Date().toLocaleString('zh-TW', {
      timeZone: 'Australia/Brisbane'
    })} · 配對 ${matched} 款`;
    context.pendingInventoryImport = null;
    context.$('applyInventoryPaste').disabled = true;
    context.rebuildCatalog();
    context.discoverCatalog();
    context.sourceSave('inventory', {
      rows,
      label: context.state.meta.myob,
      factorBatchId: context.state.myobFactorBatchId,
      resetAt: context.state.inventoryResetAt || ''
    });
    context.renderAll();
    context.$('inventoryPasteResult').textContent = `已套用本機快照：${Object.keys(rows).length} 品號，配對 ${matched}，未配對 ${missing}。${result.hasUnitColumn ? '本次 MYOB Factor 已生效，舊手動設定已失效。' : '只更新庫存，未改 Factor。'}${context.trackerFeed.mode === 'test' ? ' TEST 模式僅本機保存。' : ' 正在儲存至 Firebase，請確認共享同步狀態。'}`;
    context.$('inventoryPasteResult').className = 'ok';
  };
}
export function initialize(context) {
  context.pendingInventoryImport = null;
  context.$('resetMYOBStock').onclick = () => {
    if (context.plannerRole !== 'admin' || !context.catalogReady) return alert('僅 Admin 可重設庫存');
    if (!confirm('清空全部 MYOB 庫存數值？採購單位保留，庫存將顯示未取得。請先匯出完整備份。')) return;
    const rows = Object.fromEntries(Object.entries(context.state.inventory || {}).map(([code,row]) => [code,{...row,stock:null}]));
    context.state.inventory = rows;
    context.state.inventoryResetAt = new Date().toISOString();
    context.state.myobImportedAt = context.state.inventoryResetAt;
    context.state.meta.myob = 'MYOB 庫存已清空，等待重新匯入';
    context.pendingInventoryImport = null;
    context.sourceSave('inventory',{rows,label:context.state.meta.myob,factorBatchId:context.state.myobFactorBatchId || '',resetAt:context.state.inventoryResetAt});
    context.rebuildCatalog();context.renderAll();
  };
  context.$('importMYOB').onclick = () => {
    context.pendingInventoryImport = null;
    context.$('inventoryPaste').value = '';
    context.$('inventoryPasteResult').textContent = '';
    context.$('inventoryPastePreview').innerHTML = '';
    context.$('applyInventoryPaste').disabled = true;
    context.openPlannerDialog(context.$('inventoryPasteDialog'));
  };
  context.$('inventoryPaste').addEventListener('input', () => {
    context.pendingInventoryImport = null;
    context.$('applyInventoryPaste').disabled = true;
  });
  context.$('inventoryPaste').addEventListener('paste', e => {
    const text = e.clipboardData?.getData('text/plain');
    if (text === undefined) return;
    e.preventDefault();
    context.$('inventoryPaste').value = text;
    try {
      context.previewPastedInventory(context.$('inventoryPaste').value);
    } catch (err) {
      context.pendingInventoryImport = null;
      context.$('applyInventoryPaste').disabled = true;
      context.$('inventoryPasteResult').textContent = '預覽失敗：' + err.message;
      context.$('inventoryPasteResult').className = 'warn';
    }
  });
  context.$('previewInventoryPaste').onclick = () => {
    try {
      context.previewPastedInventory(context.$('inventoryPaste').value);
    } catch (err) {
      context.pendingInventoryImport = null;
      context.$('applyInventoryPaste').disabled = true;
      context.$('inventoryPasteResult').textContent = '預覽失敗：' + err.message;
      context.$('inventoryPasteResult').className = 'warn';
    }
  };
  context.$('applyInventoryPaste').onclick = context.commitPastedInventory;
}
