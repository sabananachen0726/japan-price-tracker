// planner: product-management. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "product-management",
  "owns": [{
    "name": "itemIssues",
    "kind": "function"
  }, {
    "name": "showHistory",
    "kind": "function"
  }, {
    "name": "kindSelect",
    "kind": "function"
  }, {
    "name": "statusSelect",
    "kind": "function"
  }, {
    "name": "renderManagement",
    "kind": "function"
  }, {
    "name": "renderPending",
    "kind": "function"
  }, {
    "name": "renderCatalogSources",
    "kind": "function"
  }],
  "imports": ["$", "esc", "factor", "factorInfo", "fmt", "migrationConflicts", "monthlyManagement", "normalizePlannerState", "openPlannerDialog", "photo", "plannerRole", "saveCatalogPatch", "sendCloud", "shelfLife", "state", "storeLocal", "trackerFeed", "val"],
  "writes": ["itemIssues", "kindSelect", "renderCatalogSources", "renderManagement", "renderPending", "showHistory", "state", "statusSelect"]
};
export function register(context) {
  context.itemIssues = function itemIssues(i) {
    let a = [];
    if (i.code.startsWith('__')) a.push('缺少 Item Code');
    if (i.kind === 'unknown') a.push('乾貨／凍貨待分類');
    if (!i.barcode) a.push('缺少 Barcode');
    if (!context.state.inventory[i.code]) a.push('MYOB 未配對');
    if (!context.factor(i)) a.push('換算待確認');
    if (context.val(i, 'monthly') == null) a.push('月銷待設定');
    if (!context.photo(i)) a.push('缺少圖片');
    return a;
  };
  context.showHistory = function showHistory(code) {
    const i = context.state.items.find(x => x.code === code);
    context.$('dialogTitle').textContent = `${code.startsWith('__') ? '待補品號' : code} · 訂貨紀錄`;
    context.$('dialogBody').innerHTML = `<p>${context.esc(i.name)}</p><p class="muted">來源：${context.esc(i.sources.join('、'))}。歷史紀錄供查詢，不當作在途庫存；不同版本分列。</p><div style="max-height:55vh;overflow:auto"><table style="min-width:0"><thead><tr><th>貨櫃</th><th>箱數</th><th>價格（¥）</th><th>版本／來源</th></tr></thead><tbody>${i.history.map(h => `<tr><td>${context.esc(h.container)}</td><td>${h.qty == null ? '報價紀錄' : context.fmt(h.qty)}</td><td>${context.fmt(h.price)}</td><td>${context.esc(h.version)} · ${context.esc(h.source)}</td></tr>`).join('') || '<tr><td colspan="4">尚無訂貨紀錄，來自商品主檔或舊訂貨清單。</td></tr>'}</tbody></table></div>`;
    context.openPlannerDialog(context.$('infoDialog'));
  };
  context.kindSelect = function kindSelect(i) {
    return `<select data-field="kind" data-code="${context.esc(i.code)}"><option value="unknown" ${i.kind === 'unknown' ? 'selected' : ''}>待分類</option><option value="dry" ${i.kind === 'dry' ? 'selected' : ''}>乾貨</option><option value="frozen" ${i.kind === 'frozen' ? 'selected' : ''}>冷凍</option></select>`;
  };
  context.statusSelect = function statusSelect(i) {
    return `<select data-field="availability" data-code="${context.esc(i.code)}" ${context.plannerRole === 'viewer' ? 'disabled' : ''}>${[['active', '可訂'], ['paused', '暫停訂購'], ['discontinued', '停產']].map(([v, t]) => `<option value="${v}" ${i.availability === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  };
  context.renderManagement = function renderManagement() {
    let q = context.$('manageSearch').value.toLowerCase(),
      kind = context.$('manageKind').value,
      status = context.$('manageStatus').value,
      list = context.state.items.filter(i => (kind === 'all' || i.kind === kind) && (status === 'all' || i.availability === status) && (!q || `${i.code} ${i.name} ${i.barcode}`.toLowerCase().includes(q)));
    context.$('manageShown').textContent = `顯示 ${list.length} / ${context.state.items.length} 筆`;
    context.$('factorAdminSummary').textContent = '採購單位固定使用最新 MYOB 的 Custom List 3。更新請重新匯入 MYOB。';
    context.$('manageRows').innerHTML = list.map(i => `<tr><td class="name"><b>${i.code.startsWith('__') ? '待補 Item Code' : context.esc(i.code)}</b><br>${context.esc(i.name)}<br><span class="detail">${context.esc(i.barcode || '缺少 Barcode')}</span></td><td>${context.kindSelect(i)}</td><td>${context.statusSelect(i)}</td><td>${context.fmt(i.stock)}<br><span class="detail">${context.esc(i.custom || 'MYOB 未配對')}</span></td><td><input type="number" min="0.001" step="any" data-edit="factor" data-code="${context.esc(i.code)}" value="${context.factor(i) ?? ''}" placeholder="待確認" disabled><br><span class="detail">${context.esc(context.factorInfo(i).source)}${context.factorInfo(i).source === 'MYOB' ? ' · ' + context.esc(context.factorInfo(i).raw) : ''}</span></td><td>${context.monthlyManagement(i)}</td><td><input type="number" min="0" step="any" data-edit="maxStock" data-code="${context.esc(i.code)}" value="${context.val(i, 'maxStock') ?? ''}" placeholder="待設定"></td><td><input type="number" min="1" max="120" step="1" data-edit="shelfLifeMonths" data-code="${context.esc(i.code)}" value="${context.shelfLife(i) ?? ''}" placeholder="未設定" ${context.plannerRole === 'viewer' || context.shelfLife(i) !== null ? 'disabled' : ''}></td><td class="mini warn">${context.esc(context.itemIssues(i).join('、') || '資料完整')}</td></tr>`).join('');
  };
  context.renderPending = function renderPending() {
    const pending = context.state.items.filter(i => context.itemIssues(i).length);
    context.$('pendingCount').textContent = pending.length;
    const q = context.$('pendingSearch').value.toLowerCase(),
      reason = context.$('pendingReason').value;
    const list = pending.filter(i => (!q || `${i.code} ${i.name} ${i.barcode}`.toLowerCase().includes(q)) && (!reason || context.itemIssues(i).includes(reason)));
    context.$('pendingShown').textContent = `顯示 ${list.length} / ${pending.length} 筆待補商品`;
    context.$('migrationList').innerHTML = context.migrationConflicts.length ? `<div class="hint"><b>找到 ${context.migrationConflicts.length} 個本機舊設定與共享值不同，兩份都已保留。</b>${context.migrationConflicts.map((c, n) => `<div>${context.esc(c.code)} · ${context.esc({
      monthly: '月銷',
      maxStock: '最高庫存',
      factor: '倍率'
    }[c.field] || c.field)}：本機 ${context.fmt(c.local)}／共享 ${context.fmt(c.remote)} <button data-migration="${n}" data-choice="local">採用本機值</button> <button data-migration="${n}" data-choice="remote">採用共享值</button></div>`).join('')}</div>` : '';
    if (context.$('pending').classList.contains('hidden')) return;
    context.$('pendingRows').innerHTML = list.map(i => `<tr><td><b>${i.code.startsWith('__') ? '待補品號' : context.esc(i.code)}</b><br>${context.esc(i.name)}<br><span class="detail">${context.esc(i.barcode)}</span></td><td class="warn">${context.esc(context.itemIssues(i).join('、'))}</td><td>${context.esc(i.kind === 'dry' ? '乾貨' : i.kind === 'frozen' ? '冷凍' : '待分類')}</td><td><button data-history="${context.esc(i.code)}">查看來源</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">目前篩選沒有待補商品。</td></tr>';
  };
  context.renderCatalogSources = function renderCatalogSources() {
    const n = context.state.items.length,
      count = s => context.state.items.filter(i => i.sources.includes(s)).length;
    const active = context.state.items.filter(i => i.availability === 'active').length;
    context.$('catalogSummary').textContent = `三來源候選商品 ${n} 款 · Active ${active} · Inactive ${n - active}；來源：商品主檔 ${count('商品主檔')}、Final PI ${count('Final PI')}、整理 Excel ${count('整理 Excel')}（可重疊）`;
    context.$('sourceInfo').innerHTML = `准入來源只有：① 已整理 Excel（內建 1,266 款）② 已標記 Final 的 PI ③ 商品主檔；優先權：商品主檔 ＞ Final PI ＞ 整理 Excel。<br>舊訂貨表、歷史 Excel 訂貨紀錄、非 Final PI、MYOB 庫存、客訂、舊共享商品庫都不新增可訂商品。<br>MYOB：${context.esc(context.state.meta.myob || '提供的庫存快照')}<br>客訂：${context.esc(context.state.meta.orders || '24 小時快取')}<br>最高庫存、月銷與 Inactive：共享商品設定。`;
  };
}
export function initialize(context) {
  context.state = context.normalizePlannerState(context.state);
  for (const id of ['manageRows', 'pendingRows']) {
    context.$(id).addEventListener('change', e => {
      const t = e.target,
        code = t.dataset.code;
      if (!code) return;
      if (t.dataset.field) {
        const field = t.dataset.field,
          v = t.value.trim();
        if (field === 'imgUrl' && v && !/^https:\/\//i.test(v)) {
          alert('請使用 https:// 圖片網址');
          return;
        }
        context.saveCatalogPatch({
          items: {
            [code]: {
              [field]: v
            }
          }
        });
      }
      if (t.dataset.edit) {
        const item = context.state.items.find(i => i.code === code);
        if (t.dataset.edit === 'factor' || t.dataset.edit === 'shelfLifeMonths' && context.shelfLife(item) !== null) { context.renderManagement(); return; }
        const field = t.dataset.edit,
          v = t.value.trim() === '' ? null : Number(t.value);
        if (v !== null && (!Number.isFinite(v) || v < 0 || field === 'factor' && v === 0 || field === 'shelfLifeMonths' && (!Number.isInteger(v) || v < 1 || v > 120))) {
          alert('請填有效數字');
          return;
        }
        context.saveCatalogPatch({
          overrides: {
            [code]: {
              [field]: v
            }
          }
        });
      }
    });
    context.$(id).addEventListener('click', e => {
      const t = e.target.closest('[data-history]');
      if (t?.dataset.history) context.showHistory(t.dataset.history);
    });
  }
  context.$('migrationList').onclick = e => {
    let t = e.target.closest('[data-migration]');
    if (!t) return;
    let c = context.migrationConflicts[Number(t.dataset.migration)];
    if (t.dataset.choice === 'local') context.saveCatalogPatch({
      overrides: {
        [c.code]: {
          [c.field]: c.local
        }
      }
    });
    delete context.state.legacyOverrides[c.code][c.field];
    context.migrationConflicts.splice(Number(t.dataset.migration), 1);
    context.storeLocal();
    context.renderPending();
  };
  for (const id of ['manageSearch', 'manageKind', 'manageStatus']) context.$(id).addEventListener(id === 'manageSearch' ? 'input' : 'change', context.renderManagement);
  for (const id of ['pendingSearch', 'pendingReason']) context.$(id).addEventListener(id === 'pendingSearch' ? 'input' : 'change', context.renderPending);
  context.$('openPending').onclick = () => window.parent.postMessage({
    type: 'KAISI_PRODUCT_VIEW',
    view: 'pending'
  }, '*');
  context.$('retryCatalog').onclick = () => {
    if (context.trackerFeed?.mode === 'test') {
      alert('TEST 資料只存在本機');
      return;
    }
    if (Object.keys(context.state.dirtyCatalog.items).length || Object.keys(context.state.dirtyCatalog.overrides).length || Object.keys(context.state.dirtyCatalog.rules).length) context.sendCloud('catalog', context.state.dirtyCatalog);
    for (const [action, payload] of Object.entries(context.state.sourceDirty)) context.sendCloud(action, payload);
  };
}
