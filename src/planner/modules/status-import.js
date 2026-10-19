// planner: status-import. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "status-import",
  "owns": [{
    "name": "pendingStatusImport",
    "kind": "let"
  }, {
    "name": "statusHead",
    "kind": "const"
  }, {
    "name": "statusCodeHeaders",
    "kind": "const"
  }, {
    "name": "statusValueHeaders",
    "kind": "const"
  }, {
    "name": "parseStatusValue",
    "kind": "function"
  }, {
    "name": "statusDelimitedRows",
    "kind": "function"
  }, {
    "name": "statusRowsFromGrid",
    "kind": "function"
  }, {
    "name": "parseStatusFile",
    "kind": "function"
  }, {
    "name": "stageStatusImport",
    "kind": "function"
  }, {
    "name": "openStatusImport",
    "kind": "function"
  }, {
    "name": "refreshShelfImporterRole",
    "kind": "function"
  }, {
    "name": "refreshStatusImporterRole",
    "kind": "function"
  }],
  "imports": ["$", "catalogReady", "esc", "norm", "openPlannerDialog", "plannerRole", "saveCatalogPatch", "state", "trackerFeed"],
  "writes": ["openStatusImport", "parseStatusFile", "parseStatusValue", "pendingStatusImport", "refreshShelfImporterRole", "refreshStatusImporterRole", "stageStatusImport", "statusCodeHeaders", "statusDelimitedRows", "statusHead", "statusRowsFromGrid", "statusValueHeaders"]
};
export function register(context) {
  context.parseStatusValue = function parseStatusValue(value) {
    const s = String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
    if (['active', '可訂', '啟用', '正常訂購', '可訂購'].includes(s)) return 'active';
    if (s.startsWith('inactive') || ['paused', '暫停訂購', '暫停', '停用', '不訂購', '停產', 'discontinued'].includes(s)) return 'inactive';
    return '';
  };
  context.statusDelimitedRows = function statusDelimitedRows(text) {
    text = String(text || '').replace(/^\ufeff/, '');
    const delim = text.includes('\t') ? '\t' : ',';
    let out = [],
      row = [],
      cell = '',
      quote = false;
    for (let n = 0; n < text.length; n++) {
      let ch = text[n];
      if (ch === '"') {
        if (quote && text[n + 1] === '"') {
          cell += '"';
          n++;
        } else quote = !quote;
      } else if (ch === delim && !quote) {
        row.push(cell);
        cell = '';
      } else if ((ch === '\r' || ch === '\n') && !quote) {
        row.push(cell);
        if (row.some(v => String(v).trim())) out.push(row);
        row = [];
        cell = '';
        if (ch === '\r' && text[n + 1] === '\n') n++;
      } else cell += ch;
    }
    if (quote) throw Error('貼上的 CSV 引號沒有結束，請重新複製');
    row.push(cell);
    if (row.some(v => String(v).trim())) out.push(row);
    return out;
  };
  context.statusRowsFromGrid = function statusRowsFromGrid(grid, sheetName) {
    const rows = (grid || []).map(r => Array.isArray(r) ? r : [r]).filter(r => r.some(v => String(v ?? '').trim()));
    if (!rows.length) return [];
    const inferredSheet = context.parseStatusValue(sheetName);
    let codeCol = 0,
      statusCol = 1,
      start = 0,
      header = false;
    for (let n = 0; n < Math.min(rows.length, 8); n++) {
      const cols = rows[n].map(context.statusHead),
        ci = cols.findIndex(x => context.statusCodeHeaders.has(x)),
        si = cols.findIndex(x => context.statusValueHeaders.has(x));
      if (ci >= 0) {
        codeCol = ci;
        statusCol = si >= 0 ? si : -1;
        start = n + 1;
        header = true;
        break;
      }
    }
    if (!header && inferredSheet) statusCol = -1;
    if (!header && rows.some(r => r.length < 2) && !inferredSheet) throw Error('請提供兩欄：Item Code、Active/Inactive');
    if (header && statusCol < 0 && !inferredSheet) {
      if (rows[start]?.length === 2) statusCol = codeCol === 0 ? 1 : 0;else throw Error(`「${sheetName || '貼上資料'}」有 Item Code，卻找不到 Status／狀態欄`);
    }
    return rows.slice(start).map((r, n) => ({
      code: context.norm(r[codeCol]),
      status: statusCol >= 0 ? String(r[statusCol] ?? '') : inferredSheet,
      line: start + n + 1,
      sheet: sheetName || '貼上'
    })).filter(r => r.code || r.status);
  };
  context.parseStatusFile = async function parseStatusFile(file) {
    if (typeof XLSX === 'undefined') throw Error('Excel 解析元件尚未載入，請確認網路連線後再試，或直接貼上資料');
    const bin = await file.arrayBuffer();
    const wb = XLSX.read(bin, {
      type: 'array',
      cellDates: false,
      raw: true
    });
    let sheets = wb.SheetNames.filter(n => ['active', 'inactive'].includes(n.trim().toLowerCase()));
    if (!sheets.length) sheets = wb.SheetNames.filter(n => /全部商品|來源|狀態|商品清單|sheet1/i.test(n));
    if (!sheets.length) sheets = [wb.SheetNames[0]];
    const result = [];
    for (const name of sheets) {
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], {
        header: 1,
        defval: '',
        raw: false,
        blankrows: false
      });
      result.push(...context.statusRowsFromGrid(grid, name));
    }
    return result;
  };
  context.stageStatusImport = function stageStatusImport(rows, label) {
    if (!context.trackerFeed || !context.catalogReady) throw Error('請先等待商品主檔及共享 Active/Inactive 載入完成');
    if (!['admin', 'editor'].includes(context.plannerRole)) throw Error('Viewer 沒有修改商品狀態的權限');
    if (!rows.length) throw Error('沒有找到有效資料。請提供 Item Code 和 Active/Inactive 兩欄');
    const inventory = new Map(context.state.items.map(i => [i.code, i]));
    const entries = new Map(),
      errors = [];
    let duplicate = 0,
      unknown = 0,
      invalid = 0,
      unchanged = 0,
      placeholders = 0;
    for (const r of rows) {
      if (!r.code) {
        invalid++;
        errors.push(`${r.sheet} 第 ${r.line} 列：Item Code 空白`);
        continue;
      }
      const want = context.parseStatusValue(r.status);
      if (!want) {
        invalid++;
        errors.push(`${r.code}：狀態「${r.status || '(空白)'}」無效`);
        continue;
      }
      // Temporary JAN-based identifiers can be managed if they exist in the current three-source catalog.
      if (!inventory.has(r.code)) {
        unknown++;
        errors.push(`${r.code}：商品不在目前三來源清單內`);
        continue;
      }
      if (r.code.startsWith('__JAN_')) {
        placeholders++;
        errors.push(`${r.code}：暫時品號已允許更新，但正式 Item Code 配對後需重新確認狀態`);
      }
      if (entries.has(r.code)) {
        duplicate++;
        if (entries.get(r.code).want !== want) {
          entries.get(r.code).conflict = true;
          errors.push(`${r.code}：檔案中同時出現 Active／Inactive，整個品號略過`);
        }
        continue;
      }
      entries.set(r.code, {
        want
      });
    }
    const changes = [];
    for (const [code, e] of entries) {
      if (e.conflict) continue;
      const product = inventory.get(code),
        old = product.availability || 'active';
      const next = e.want === 'active' ? 'active' : old === 'discontinued' ? 'discontinued' : 'paused';
      if (old === next) {
        unchanged++;
        continue;
      }
      changes.push({
        code,
        old,
        next,
        name: product.name || ''
      });
    }
    context.pendingStatusImport = {
      changes,
      label
    };
    context.$('statusImportPreviewSummary').textContent = `${label}：讀入 ${rows.length} 列｜將修改 ${changes.length} 款｜原狀態不變 ${unchanged}｜未配對 ${unknown}｜重複 ${duplicate}｜格式錯誤 ${invalid}｜暫時品號 ${placeholders}（允許更新）`;
    const top = changes.slice(0, 70).map(x => `<tr><td>${context.esc(x.code)}</td><td>${context.esc(x.name)}</td><td>${context.esc(x.old)}</td><td><b>${context.esc(x.next)}</b></td></tr>`).join('');
    const warn = errors.length ? `<details style="margin-top:10px"><summary>查看 ${errors.length} 筆待確認／略過原因</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${context.esc(errors.slice(0, 150).join('\n'))}${errors.length > 150 ? '\n…其餘略' : ''}</pre></details>` : '';
    context.$('statusImportPreviewDetails').innerHTML = `<table><thead><tr><th>Item Code</th><th>商品名稱</th><th>目前</th><th>匯入後</th></tr></thead><tbody>${top || '<tr><td colspan="4">沒有需要改變的商品</td></tr>'}</tbody></table>${changes.length > 70 ? '<p class="mini">僅預覽前 70 款，套用時包含全部變更。</p>' : ''}${warn}`;
    context.$('statusImportPreviewArea').classList.remove('hidden');
    context.$('statusImportApply').disabled = !changes.length;
  };
  context.openStatusImport = function openStatusImport() {
    if (!['admin', 'editor'].includes(context.plannerRole)) return alert('Viewer 無法修改商品狀態');
    if (!context.trackerFeed || !context.catalogReady) return alert('請等待商品主檔及共享狀態同步後再匯入');
    context.pendingStatusImport = null;
    context.$('statusImportPaste').value = '';
    context.$('statusImportFile').value = '';
    context.$('statusImportPreviewArea').classList.add('hidden');
    context.$('statusImportApply').disabled = true;
    context.openPlannerDialog(context.$('statusImportDialog'));
  };
  context.refreshShelfImporterRole = function refreshShelfImporterRole() {
    const b = context.$('openShelfImport');
    if (b) {
      b.disabled = context.plannerRole === 'viewer';
      b.title = context.plannerRole === 'viewer' ? 'Viewer 只能查詢保存期限' : 'Admin／Editor 可維護保存期限';
    }
  };
  context.refreshStatusImporterRole = function refreshStatusImporterRole() {
    const b = context.$('openStatusImport');
    if (b) {
      b.disabled = context.plannerRole === 'viewer';
      b.title = context.plannerRole === 'viewer' ? 'Viewer 只能查看商品狀態' : 'Admin／Editor 可批次修改商品狀態';
    }
  };
}
export function initialize(context) {
  context.pendingStatusImport = null;
  context.statusHead = x => String(x ?? '').replace(/^\ufeff/, '').trim().toLowerCase().replace(/[\s_./（）()\-]+/g, '');
  context.statusCodeHeaders = new Set(['itemcode', 'itemnumber', 'itemno', '品號', '商品編號', '商品代碼', '貨號']);
  context.statusValueHeaders = new Set(['status', 'availability', 'activeinactive', '狀態', '商品狀態', '訂貨狀態', '是否訂購']);
  context.$('openStatusImport').onclick = context.openStatusImport;
  context.$('statusImportChooseFile').onclick = () => context.$('statusImportFile').click();
  context.$('statusImportPreviewPaste').onclick = () => {
    try {
      context.stageStatusImport(context.statusRowsFromGrid(context.statusDelimitedRows(context.$('statusImportPaste').value), '貼上資料'), '貼上資料');
    } catch (err) {
      alert('預覽失敗：' + err.message);
    }
  };
  context.$('statusImportFile').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      context.stageStatusImport(await context.parseStatusFile(file), file.name);
    } catch (err) {
      context.pendingStatusImport = null;
      context.$('statusImportApply').disabled = true;
      alert('Excel 讀取失敗：' + err.message);
    }
  };
  context.$('statusImportCancel').onclick = () => context.$('statusImportDialog').close();
  context.$('statusImportApply').onclick = () => {
    const p = context.pendingStatusImport;
    if (!p?.changes?.length) return;
    if (!['admin', 'editor'].includes(context.plannerRole) || !context.trackerFeed || !context.catalogReady) return alert('登入角色或同步狀態已變更，請重新預覽');
    if (!confirm(`確定更新 ${p.changes.length} 款商品 Active／Inactive？\n\n只更新狀態改變的品號，其餘商品及資料都不變。`)) return;
    const items = {};
    for (const r of p.changes) items[r.code] = {
      availability: r.next
    };
    context.$('statusImportApply').disabled = true;
    context.$('statusImportDialog').close();
    context.pendingStatusImport = null;
    context.$('statusImportLastResult').textContent = `已送出 ${p.changes.length} 款狀態更新（${context.trackerFeed.mode === 'test' ? 'TEST：只更新本機' : 'LIVE：請確認「共享資料」儲存結果'}）。`;
    context.saveCatalogPatch({
      items
    });
  };
  context.refreshStatusImporterRole();
}
