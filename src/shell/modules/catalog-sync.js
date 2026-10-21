// shell: catalog-sync. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "catalog-sync",
  "owns": [{
    "name": "CATALOG_REF",
    "kind": "const"
  }, {
    "name": "INVENTORY_REF",
    "kind": "const"
  }, {
    "name": "PLANNER_SOURCES_REF",
    "kind": "const"
  }, {
    "name": "catalogData",
    "kind": "let"
  }, {
    "name": "inventoryData",
    "kind": "let"
  }, {
    "name": "plannerSourcesData",
    "kind": "let"
  }, {
    "name": "catalogUnsubscribers",
    "kind": "let"
  }, {
    "name": "sendCatalogSources",
    "kind": "function"
  }, {
    "name": "stopCatalogListeners",
    "kind": "function"
  }, {
    "name": "startCatalogListeners",
    "kind": "function"
  }, {
    "name": "safeCatalogKey",
    "kind": "function"
  }, {
    "name": "cleanCatalogPatch",
    "kind": "function"
  }],
  "imports": ["auth", "canPlan", "currentDataMode", "db", "doc", "events", "isAdmin", "onSnapshot", "plannerLoaded", "renderInactiveNotices", "sendSharedOrderDrafts", "setDoc"],
  "writes": ["CATALOG_REF", "INVENTORY_REF", "PLANNER_SOURCES_REF", "catalogData", "catalogUnsubscribers", "cleanCatalogPatch", "inventoryData", "plannerSourcesData", "safeCatalogKey", "sendCatalogSources", "startCatalogListeners", "stopCatalogListeners"]
};
export function register(context) {
  context.sendCatalogSources = function sendCatalogSources() {
    const w = document.getElementById('plannerFrame')?.contentWindow;
    if (!context.auth.currentUser || !context.plannerLoaded || !w) return;
    if (context.currentDataMode !== 'live') {
      w.postMessage({
        type: 'KAISI_CATALOG_SNAPSHOT',
        mode: 'test',
        data: null
      }, '*');
      return;
    }
    if (context.catalogData !== null) w.postMessage({
      type: 'KAISI_CATALOG_SNAPSHOT',
      mode: 'live',
      data: context.catalogData
    }, '*');
    if (context.inventoryData !== null) w.postMessage({
      type: 'KAISI_INVENTORY_SNAPSHOT',
      mode: 'live',
      data: context.inventoryData
    }, '*');
    if (context.plannerSourcesData !== null) w.postMessage({
      type: 'KAISI_SOURCES_SNAPSHOT',
      mode: 'live',
      data: context.plannerSourcesData
    }, '*');
    context.sendSharedOrderDrafts();
  };
  context.stopCatalogListeners = function stopCatalogListeners() {
    context.catalogUnsubscribers.forEach(fn => fn());
    context.catalogUnsubscribers = [];
    context.catalogData = context.inventoryData = context.plannerSourcesData = null;
  };
  context.startCatalogListeners = function startCatalogListeners() {
    context.stopCatalogListeners();
    for (const [ref, type] of [[context.CATALOG_REF, 'catalog'], [context.INVENTORY_REF, 'inventory'], [context.PLANNER_SOURCES_REF, 'sources']]) {
      context.catalogUnsubscribers.push(context.onSnapshot(ref, s => {
        const d = s.exists() ? s.data() : {};
        if (type === 'catalog') {context.catalogData = d; context.renderInactiveNotices();}
        if (type === 'inventory') context.inventoryData = d;
        if (type === 'sources') context.plannerSourcesData = d;
        context.sendCatalogSources();
      }, err => {
        document.getElementById('plannerFrame')?.contentWindow?.postMessage({
          type: 'KAISI_CATALOG_ERROR',
          error: err.code || err.message
        }, '*');
      }));
    }
  };
  context.safeCatalogKey = function safeCatalogKey(key) {
    return typeof key === 'string' && key.length >= 2 && key.length <= 100 && key === key.trim() && !/[\u0000-\u001f]/.test(key) && !/^__.*__$/.test(key) && !['__PROTO__', 'CONSTRUCTOR', 'PROTOTYPE'].includes(key.toUpperCase());
  };
  context.cleanCatalogPatch = function cleanCatalogPatch(p) {
    const clean = {
      items: {},
      overrides: {},
      rules: {}
    };
    for (const [code, fields] of Object.entries(p.items || {})) {
      if (!context.safeCatalogKey(code) || !fields || typeof fields !== 'object') throw Error('商品品號無效');
      const v = {};
      for (const [key, value] of Object.entries(fields)) {
        if (['name', 'barcode', 'imgUrl', 'mergedInto'].includes(key)) {
          if (typeof value !== 'string' || value.length > 2048) throw Error('商品欄位無效');
          if (key === 'imgUrl' && value && !/^https:\/\//i.test(value)) throw Error('圖片網址無效');
          v[key] = value;
        } else if (key === 'kind') {
          if (!['dry', 'frozen', 'unknown'].includes(value)) throw Error('貨別無效');
          v.kind = value;
        } else if (key === 'availability') {
          if (!['active', 'paused', 'discontinued', 'merged'].includes(value)) throw Error('訂貨狀態無效');
          v.availability = value;
        } else if (key === 'sources') {
          if (!Array.isArray(value) || value.some(x => typeof x !== 'string' || x.length > 100)) throw Error('來源無效');
          v.sources = value.slice(0, 30);
        } else if (key === 'manualFields') {
          if (!Array.isArray(value) || value.some(x => !['name', 'barcode', 'imgUrl'].includes(x))) throw Error('人工欄位無效');
          v.manualFields = value;
        } else if (key === 'history') {
          if (!Array.isArray(value) || value.length > 2000) throw Error('訂貨紀錄格式無效');
          v.history = value.map(h => {
            if (!h || typeof h.container !== 'string' || h.container.length > 100 || h.qty !== null && (typeof h.qty !== 'number' || !Number.isFinite(h.qty) || h.qty < 0)) throw Error('訂貨紀錄無效');
            return {
              container: h.container,
              qty: h.qty,
              price: typeof h.price === 'number' && Number.isFinite(h.price) ? h.price : null,
              version: String(h.version || ''),
              source: String(h.source || '')
            };
          });
        }
      }
      clean.items[code] = v;
    }
    for (const [code, fields] of Object.entries(p.overrides || {})) {
      if (!context.safeCatalogKey(code) || !fields || typeof fields !== 'object') throw Error('設定品號無效');
      const v = {};
      for (const [key, value] of Object.entries(fields)) {
        if (key === 'factorBatch') {
          if (value !== null && (typeof value !== 'string' || value.length > 100)) throw Error('Factor 批次識別無效');
          v[key] = value;
          continue;
        }
        if (!['monthly', 'maxStock', 'factor', 'shelfLifeMonths'].includes(key) || value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || key === 'factor' && value === 0 || key === 'shelfLifeMonths' && value !== null && (!Number.isInteger(value) || value < 1 || value > 120))) throw Error('月銷、最高庫存或倍率無效');
        v[key] = value;
      }
      clean.overrides[code] = v;
    }
    for (const [key, v] of Object.entries(p.rules || {})) {
      if (!['dry', 'frozen', 'coverage'].includes(key) || typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw Error('預設規則無效');
      clean.rules[key] = v;
    }
    for (const key of Object.keys(clean)) if (!Object.keys(clean[key]).length) delete clean[key];
    return clean;
  };
}
export function initialize(context) {
  context.CATALOG_REF = context.doc(context.db, 'app_data', 'order_catalog_v1');
  context.INVENTORY_REF = context.doc(context.db, 'app_data', 'order_inventory_v1');
  context.PLANNER_SOURCES_REF = context.doc(context.db, 'app_data', 'order_planner_sources_v1');
  context.catalogData = null;
  context.inventoryData = null;
  context.plannerSourcesData = null;
  context.catalogUnsubscribers = [];
  context.events.onMessage(async e => {
    const frame = document.getElementById('plannerFrame');
    if (e.source !== frame?.contentWindow || !context.auth.currentUser || e.data?.type !== 'KAISI_CATALOG_SAVE') return;
    const {
      id,
      action,
      payload
    } = e.data;
    const respond = (ok, error) => frame.contentWindow.postMessage({
      type: 'KAISI_CATALOG_SAVE_RESULT',
      id,
      ok,
      error
    }, '*');
    if (!context.canPlan()) {
      respond(false, '唯讀帳號不能儲存');
      return;
    }
    if (context.currentDataMode !== 'live') {
      respond(false, 'TEST 不寫入正式共享資料');
      return;
    }
    try {
      let ref,
        data,
        merge = true;
      if (action === 'catalog') {
        ref = context.CATALOG_REF;
        data = context.cleanCatalogPatch(payload);
        for (const [code,item] of Object.entries(data.items || {})) {
          const previous = context.catalogData?.items?.[code]?.availability || 'active';
          if (['paused','discontinued','merged'].includes(item.availability) && previous === 'active') {
            const id = crypto.randomUUID();
            item.inactiveNotices = {[id]:{id,uid:context.auth.currentUser.uid,by:context.auth.currentUser.email || '',at:new Date().toISOString()}};
          }
        }
      } else if (action === 'inventory') {
        ref = context.INVENTORY_REF;
        merge = false;
        const rows = {};
        for (const [code, r] of Object.entries(payload.rows || {})) {
          if (!code || code.length > 80 || ['__proto__', 'constructor', 'prototype'].includes(code.toLowerCase())) throw Error('MYOB 品號無效');
          if (r.stock !== null && (typeof r.stock !== 'number' || !Number.isFinite(r.stock))) throw Error('MYOB 庫存無效');
          rows[code] = {
            stock: r.stock,
            custom: String(r.custom || ''),
            barcode: String(r.barcode || ''),
            name: String(r.name || '')
          };
        }
        data = {
          rows,
          label: String(payload.label || ''),
          factorBatchId: String(payload.factorBatchId || '').slice(0, 100)
        };
      } else if (action === 'sales') {
        if (!context.isAdmin()) throw Error('只有 Admin 可匯入銷售資料');
        ref = context.PLANNER_SOURCES_REF;
        const sales = payload;
        if (sales?.version !== 1 || !/^\d{4}-\d{2}$/.test(sales.periodEnd) || !sales.sources || typeof sales.batchId !== 'string' || sales.batchId.length > 100) throw Error('月銷資料格式無效');
        const sources = {};
        for (const [slot, s] of Object.entries(sales.sources)) {
          if (!['history', 'current'].includes(slot) || s?.codec !== 'gzip-base64' || typeof s.body !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(s.body) || typeof s.label !== 'string' || s.label.length > 300) throw Error('銷售來源格式無效');
          sources[slot] = {
            codec: 'gzip-base64',
            body: s.body,
            label: s.label
          };
        }
        data = {
          salesV1: {
            version: 1,
            periodEnd: sales.periodEnd,
            batchId: sales.batchId,
            updatedAt: new Date().toISOString(),
            sources
          }
        };
        const candidate = {
          ...(context.plannerSourcesData || {}),
          ...data
        };
        if (new TextEncoder().encode(JSON.stringify(candidate)).length > 850000) throw Error('共享彙總接近容量上限，請縮短歷史檔期間');
      } else if (action === 'pis') {
        ref = context.PLANNER_SOURCES_REF;
        if (!Array.isArray(payload.pis)) throw Error('PI 格式無效');
        data = {
          pis: payload.pis,
          piLabel: String(payload.label || '')
        };
      } else if (action === 'orders') throw Error('客訂已改為直接唯讀連線，請到客訂工具修改');else throw Error('未知的資料更新');
      data.updatedAt = new Date().toISOString();
      data = JSON.parse(JSON.stringify(data));
      if (new TextEncoder().encode(JSON.stringify(data)).length > 900000) throw Error('本次資料太大，請分批匯入');
      if (action === 'catalog') {
        const candidate = JSON.parse(JSON.stringify(context.catalogData || {}));
        for (const section of ['items', 'overrides']) for (const [key, v] of Object.entries(data[section] || {})) {
          candidate[section] ||= {};
          candidate[section][key] = {
            ...(candidate[section][key] || {}),
            ...v
          };
        }
        candidate.rules = {
          ...(candidate.rules || {}),
          ...(data.rules || {})
        };
        if (new TextEncoder().encode(JSON.stringify(candidate)).length > 900000) throw Error('共享商品庫超過目前容量，請保留本機備份並聯絡 Sabrina 調整儲存');
      }
      await context.setDoc(ref, data, merge ? {
        merge: true
      } : {});
      respond(true);
    } catch (err) {
      respond(false, err.code || err.message);
    }
  });
}
