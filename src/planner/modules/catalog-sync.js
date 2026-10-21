// planner: catalog-sync. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "catalog-sync",
  "owns": [{
    "name": "CATALOG_FIELDS",
    "kind": "const"
  }, {
    "name": "catalogRemote",
    "kind": "let"
  }, {
    "name": "catalogReady",
    "kind": "let"
  }, {
    "name": "cloudSequence",
    "kind": "let"
  }, {
    "name": "cloudJobs",
    "kind": "let"
  }, {
    "name": "migrationConflicts",
    "kind": "let"
  }, {
    "name": "importPreview",
    "kind": "let"
  }, {
    "name": "normalizePlannerState",
    "kind": "function"
  }, {
    "name": "storeLocal",
    "kind": "function"
  }, {
    "name": "loadPlannerMode",
    "kind": "function"
  }, {
    "name": "meaningfulNumber",
    "kind": "function"
  }, {
    "name": "itemKey",
    "kind": "function"
  }, {
    "name": "rebuildCatalog",
    "kind": "function"
  }, {
    "name": "catalogRecord",
    "kind": "function"
  }, {
    "name": "discoverCatalog",
    "kind": "function"
  }, {
    "name": "mergePatch",
    "kind": "function"
  }, {
    "name": "saveCatalogPatch",
    "kind": "function"
  }, {
    "name": "sendCloud",
    "kind": "function"
  }, {
    "name": "applyCatalogSnapshot",
    "kind": "function"
  }, {
    "name": "finishCloud",
    "kind": "function"
  }, {
    "name": "sourceSave",
    "kind": "function"
  }],
  "imports": ["$", "ELIGIBLE_SOURCE_ORDER", "KEY", "SEED", "dirtyDrafts", "hydrateSales", "initial", "norm", "refreshRetryStatus", "renderAll", "renderPending", "salesDecoded", "salesError", "salesLoadGeneration", "salesLoading", "salesPending", "salesSignature", "salesSummary", "scopedKey", "state", "trackerFeed", "updateSalesSummary"],
  "writes": ["CATALOG_FIELDS", "applyCatalogSnapshot", "catalogReady", "catalogRecord", "catalogRemote", "cloudJobs", "cloudSequence", "dirtyDrafts", "discoverCatalog", "finishCloud", "importPreview", "itemKey", "loadPlannerMode", "meaningfulNumber", "mergePatch", "migrationConflicts", "normalizePlannerState", "rebuildCatalog", "salesDecoded", "salesError", "salesLoadGeneration", "salesLoading", "salesPending", "salesSignature", "salesSummary", "saveCatalogPatch", "sendCloud", "sourceSave", "state", "storeLocal"]
};
export function register(context) {
  context.normalizePlannerState = function normalizePlannerState(s) {
    s = s && Array.isArray(s.items) ? s : context.initial();
    s.catalog ||= {};
    s.overrides ||= {};
    s.rules ||= {
      dry: 1,
      frozen: 6,
      coverage: 1
    };
    s.drafts ||= {};
    s.pis ||= [];
    s.meta ||= {};
    s.orders ||= structuredClone(context.SEED.orders);
    s.inventory ||= structuredClone(context.SEED.inventory || {});
    s.unitMetadata ||= {};
    s.myobFactorBatchId ||= '';
    s.myobImportedAt ||= '';
    s.dirtyCatalog ||= {
      items: {},
      overrides: {},
      rules: {}
    };
    s.sourceDirty ||= {};
    if (!s.catalogSchema) {
      s.legacyOverrides = structuredClone(s.overrides);
      s.unsavedDrafts = Object.entries(s.drafts).filter(([, d]) => !d.updatedAt && Object.values(d.rows || {}).some(q => q > 0)).map(([code]) => code);
      s.catalogSchema = 2;
    }
    return s;
  };
  context.storeLocal = function storeLocal() {
    try {
      context.state.unsavedDrafts = [...context.dirtyDrafts];
      const local = {
        ...context.state,
        items: context.state.items.map(({
          history,
          ...i
        }) => i)
      };
      localStorage.setItem(context.scopedKey(context.trackerFeed?.mode || 'live'), JSON.stringify(local));
    } catch {
      context.$('catalogSync').textContent = '本機備份空間不足，請匯出完整備份';
    }
  };
  context.loadPlannerMode = function loadPlannerMode(mode) {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(context.scopedKey(mode)) || (mode === 'live' ? localStorage.getItem(context.KEY) : 'null'));
    } catch {}
    context.salesSignature = '';
    context.salesDecoded = {};
    context.salesSummary = null;
    context.salesPending = null;
    context.salesLoadGeneration++;
    context.salesLoading = false;
    context.salesError = '';
    context.$('salesPreview').classList.add('hidden');
    context.state = context.normalizePlannerState(saved || context.initial());
    // LIVE inventory must come from the shared snapshot, never bundled or stale local data.
    if (mode === 'live' && !context.state.sourceDirty.inventory) {
      context.state.inventory = {};
      context.state.myobFactorBatchId = '';
      context.state.myobImportedAt = '';
      context.state.meta.myob = '尚未取得共享 MYOB 快照';
    }
    context.hydrateSales(context.state.salesV1 || null);
    context.dirtyDrafts = new Set(context.state.unsavedDrafts || []);
    context.catalogRemote = {
      items: {},
      overrides: {},
      rules: {}
    };
    context.catalogReady = false;
    context.migrationConflicts = [];
    ['dryInterval', 'frozenInterval', 'defaultCoverage'].forEach((id, n) => context.$(id).value = context.state.rules[['dry', 'frozen', 'coverage'][n]]);
    context.$('coverage').value = context.state.rules.coverage;
  };
  context.meaningfulNumber = function meaningfulNumber(v) {
    return v !== null && v !== '' && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : null;
  };
  context.itemKey = function itemKey(code, barcode) {
    let c = context.norm(code);
    return c || (barcode ? '__JAN_' + String(barcode).replace(/[^A-Z0-9_-]/gi, '') : '');
  };
  context.rebuildCatalog = function rebuildCatalog() {
    // 一律從本次三個核准來源重建，絕不以 state.items、state.catalog 或舊 PI 建立候選產品。
    const map = new Map();
    const addSource = (code, record, source) => {
      const key = context.itemKey(code, record?.barcode);
      if (!key) return;
      const existing = map.get(key) || {
        code: key,
        name: key,
        kind: 'unknown',
        stock: null,
        custom: '',
        barcode: '',
        monthly: null,
        maxStock: null,
        imgUrl: '',
        sources: [],
        history: [],
        primarySource: ''
      };
      if (!existing.sources.includes(source)) existing.sources.push(source);
      // 來源按 Excel < Final PI < 商品主檔依序匯入。高優先權來源的非空欄位覆蓋低來源。
      for (const field of ['name', 'barcode', 'imgUrl']) if (record?.[field]) existing[field] = String(record[field]);
      if (['dry', 'frozen'].includes(record?.kind)) existing.kind = record.kind;
      if (!existing.primarySource || context.ELIGIBLE_SOURCE_ORDER.indexOf(source) >= context.ELIGIBLE_SOURCE_ORDER.indexOf(existing.primarySource)) existing.primarySource = source;
      if (source === '整理 Excel') {
        for (const field of ['monthly', 'maxStock', 'custom']) if (existing[field] == null || existing[field] === '') existing[field] = record?.[field] ?? existing[field];
      }
      map.set(key, existing);
      return existing;
    };
    // 1. 你整理後的 Excel（只內建已核准保留的 1,266 款）。
    for (const item of context.SEED.items) addSource(item.code, item, '整理 Excel');
    // 2. 僅明確標示 isFinal === true 的 PI，可作為商品候選來源。
    //    尚未 Final 的 PI 仍由 incoming() 作為在途庫存計算，不在此新增產品。
    for (const pi of [...(context.trackerFeed?.pis || [])].filter(p => p.isFinal === true).sort((a, b) => String(a.updated || '').localeCompare(String(b.updated || '')) || String(a.container || '').localeCompare(String(b.container || '')))) {
      for (const row of pi.rows || []) {
        if (!(Number(row.qty) > 0)) continue;
        const i = addSource(row.code, row, 'Final PI');
        if (i) i.history.push({
          container: pi.container,
          qty: Number(row.qty),
          price: null,
          version: pi.version || 'Final',
          source: 'Final PI'
        });
      }
    }
    // 3. 商品主檔最高優先；同品號直接覆蓋 Excel / Final PI 的商品資訊。
    for (const [code, product] of Object.entries(context.trackerFeed?.products || {})) addSource(code, product, '商品主檔');
    // 相同條碼的 __JAN_ 待補商品可被正式 Item Code 對應，避免重複顯示。
    for (const [key, i] of [...map]) if (key.startsWith('__JAN_') && i.barcode) {
      const found = [...map.values()].find(j => j !== i && !j.code.startsWith('__') && j.barcode === i.barcode);
      if (found) {
        for (const source of i.sources) if (!found.sources.includes(source)) found.sources.push(source);
        found.history.push(...i.history);
        if (context.ELIGIBLE_SOURCE_ORDER.indexOf(i.primarySource) > context.ELIGIBLE_SOURCE_ORDER.indexOf(found.primarySource)) {
          found.primarySource = i.primarySource;
          for (const f of ['name', 'barcode', 'imgUrl']) if (i[f]) found[f] = i[f];
          if (['dry', 'frozen'].includes(i.kind)) found.kind = i.kind;
        }
        map.delete(key);
      }
    }
    for (const i of map.values()) {
      const inv = context.state.inventory?.[i.code],
        units = context.state.unitMetadata?.[i.code] || context.SEED.inventory?.[i.code] || {};
      i.stock = inv ? inv.stock : null;
      i.custom = context.trackerFeed?.mode === 'live' || context.state.myobFactorBatchId ? String(inv?.custom ?? '') : inv?.custom || units.custom || i.custom || '';
      if (!i.barcode && (inv?.barcode || units.barcode)) i.barcode = String(inv?.barcode || units.barcode);
      // 舊訂貨商品庫僅是設定，不能覆寫新來源的名稱／條碼／分類，也不能新增商品。
      const settings = context.state.catalog?.[i.code] || {};
      if (!i.imgUrl && settings.imgUrl) i.imgUrl = settings.imgUrl;
      if (i.kind === 'unknown' && ['dry', 'frozen'].includes(settings.kind)) i.kind = settings.kind;
      i.availability = ['paused', 'discontinued'].includes(settings.availability) ? settings.availability : 'active';
      i.kind = ['dry', 'frozen'].includes(i.kind) ? i.kind : 'unknown';
      i.sources = context.ELIGIBLE_SOURCE_ORDER.filter(s => i.sources.includes(s));
      i.history = i.history || [];
    }
    context.state.items = [...map.values()].map(i => ({
      ...i,
      name: String(i.name || '').replace(/^O\/S\s*-\s*/i, '').trim()
    })).sort((a, b) => a.code.localeCompare(b.code));
    context.updateSalesSummary();
    context.storeLocal();
  };
  context.catalogRecord = function catalogRecord(i) {
    return {
      name: i.name || '',
      barcode: i.barcode || '',
      kind: i.kind || 'unknown',
      availability: i.availability || 'active',
      imgUrl: i.imgUrl || '',
      sources: i.sources || [],
      history: i.history.filter(h => ['PI', '手動 PI', '貨櫃報價'].includes(h.source))
    };
  };
  context.discoverCatalog = function discoverCatalog() {
    // V4.7.8: 禁止把舊資料／舊快取自動寫回 Firebase 訂貨商品庫。
    // 僅使用者手動修改 Active、Max Stock、Factor 等才儲存該變更。
  };
  context.mergePatch = function mergePatch(a, b) {
    for (const section of ['items', 'overrides']) {
      a[section] ||= {};
      for (const [key, v] of Object.entries(b[section] || {})) a[section][key] = {
        ...(a[section][key] || {}),
        ...v
      };
    }
    a.rules = {
      ...(a.rules || {}),
      ...(b.rules || {})
    };
    return a;
  };
  context.saveCatalogPatch = function saveCatalogPatch(patch, automatic = false) {
    // A manual Factor applies only to the current MYOB batch. The next complete MYOB
    // import changes its batch ID, so old overrides become inactive without a mass write.
    if (!automatic) for (const fields of Object.values(patch.overrides || {})) {
      if (Object.hasOwn(fields, 'factor')) fields.factorBatch = String(context.state.myobFactorBatchId || '');
    }
    if (!automatic) for (const [code, fields] of Object.entries(patch.items || {})) fields.manualFields = [...new Set([...(context.state.catalog[code]?.manualFields || []), ...Object.keys(fields).filter(key => ['name', 'barcode', 'imgUrl'].includes(key))])];
    context.mergePatch(context.state.dirtyCatalog, patch);
    context.mergePatch({
      items: context.state.catalog,
      overrides: context.state.overrides,
      rules: context.state.rules
    }, patch);
    if (patch.rules) Object.assign(context.state.rules, patch.rules);
    context.storeLocal();
    context.rebuildCatalog();
    context.renderAll();
    if (!context.trackerFeed || context.trackerFeed.mode === 'test') {
      context.$('catalogSync').textContent = 'TEST：資料只儲存在本機';
      return;
    }
    context.sendCloud('catalog', patch);
  };
  context.sendCloud = function sendCloud(action, payload) {
    const id = ++context.cloudSequence;
    context.cloudJobs.set(id, {
      action,
      payload: structuredClone(payload),
      mode: context.trackerFeed?.mode || 'live'
    });
    context.$('catalogSync').textContent = '共享資料儲存中…';
    window.parent.postMessage({
      type: 'KAISI_CATALOG_SAVE',
      id,
      action,
      payload
    }, '*');
  };
  context.applyCatalogSnapshot = function applyCatalogSnapshot(data) {
    context.catalogRemote = {
      items: data?.items || {},
      overrides: data?.overrides || {},
      rules: data?.rules || {}
    };
    context.catalogReady = true;
    const missing = {
      overrides: {}
    };
    context.migrationConflicts = [];
    for (const [code, fields] of Object.entries(context.state.legacyOverrides || {})) for (const [field, value] of Object.entries(fields)) {
      const remote = context.catalogRemote.overrides[code] || {};
      if (!Object.hasOwn(remote, field)) (missing.overrides[code] ||= {})[field] = value;else if (JSON.stringify(remote[field]) !== JSON.stringify(value)) context.migrationConflicts.push({
        code,
        field,
        local: value,
        remote: remote[field]
      });
    }
    for (const [code, v] of Object.entries(context.catalogRemote.items)) {
      context.state.catalog[code] = {
        ...(context.state.catalog[code] || {}),
        ...v,
        ...(context.state.dirtyCatalog.items[code] || {})
      };
    }
    for (const [code, v] of Object.entries(context.catalogRemote.overrides)) {
      context.state.overrides[code] = {
        ...(context.state.overrides[code] || {}),
        ...v,
        ...(context.state.dirtyCatalog.overrides[code] || {})
      };
    }
    Object.assign(context.state.rules, context.catalogRemote.rules, context.state.dirtyCatalog.rules);
    for (const [id, key] of [['dryInterval', 'dry'], ['frozenInterval', 'frozen'], ['defaultCoverage', 'coverage']]) context.$(id).value = context.state.rules[key];
    if (!context.cloudJobs.size) context.$('catalogSync').textContent = context.migrationConflicts.length ? '本機舊設定待確認：請查看待補資料' : '使用共享商品資料';
    context.rebuildCatalog();
    if (Object.keys(missing.overrides).length) context.saveCatalogPatch(missing, true);
    context.discoverCatalog();
    context.renderAll();
  };
  context.finishCloud = function finishCloud(m) {
    const job = context.cloudJobs.get(m.id);
    if (!job) return;
    context.cloudJobs.delete(m.id);
    if (job.mode !== context.trackerFeed?.mode) return;
    if (m.ok) {
      if (job.action === 'catalog') {
        for (const section of ['items', 'overrides']) for (const [key, fields] of Object.entries(job.payload[section] || {})) {
          for (const [field, v] of Object.entries(fields)) if (JSON.stringify(context.state.dirtyCatalog[section]?.[key]?.[field]) === JSON.stringify(v)) delete context.state.dirtyCatalog[section][key][field];
          if (context.state.dirtyCatalog[section][key] && !Object.keys(context.state.dirtyCatalog[section][key]).length) delete context.state.dirtyCatalog[section][key];
        }
        for (const [key, v] of Object.entries(job.payload.rules || {})) if (context.state.dirtyCatalog.rules[key] === v) delete context.state.dirtyCatalog.rules[key];
        for (const [code, fields] of Object.entries(job.payload.overrides || {})) for (const field of Object.keys(fields)) if (context.state.legacyOverrides?.[code]) delete context.state.legacyOverrides[code][field];
      } else if (JSON.stringify(context.state.sourceDirty[job.action]) === JSON.stringify(job.payload)) delete context.state.sourceDirty[job.action];
      context.$('catalogSync').textContent = '共享資料已儲存';
    } else {
      context.state.syncFailed = true;
      context.$('catalogSync').textContent = '共享儲存失敗：' + (m.error || '未知錯誤') + '；本機資料已保留，可按「重新儲存共享資料」';
    }
    context.refreshRetryStatus();
    context.storeLocal();
    context.renderPending();
  };
  context.sourceSave = function sourceSave(action, payload) {
    context.state.sourceDirty[action] = structuredClone(payload);
    context.storeLocal();
    if (context.trackerFeed?.mode === 'test') {
      context.$('catalogSync').textContent = 'TEST：資料只儲存在本機';
      return;
    }
    context.sendCloud(action, payload);
  };
}
export function initialize(context) {
  context.CATALOG_FIELDS = ['name', 'barcode', 'kind', 'availability', 'imgUrl', 'sources'];
  context.catalogRemote = {
    items: {},
    overrides: {},
    rules: {}
  };
  context.catalogReady = false;
  context.cloudSequence = 0;
  context.cloudJobs = new Map();
  context.migrationConflicts = [];
  context.importPreview = null;
}
