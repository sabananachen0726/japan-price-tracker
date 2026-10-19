// shell: pi-shelf-life. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "pi-shelf-life",
  "owns": [{
    "name": "findPiShelfColumn",
    "kind": "function"
  }, {
    "name": "readPiShelfCell",
    "kind": "function"
  }, {
    "name": "planPiShelf",
    "kind": "function"
  }, {
    "name": "piShelfPreviewText",
    "kind": "function"
  }, {
    "name": "savePiAndShelf",
    "kind": "function"
  }],
  "imports": ["CATALOG_REF", "PROD_DOC_REF", "TEST_LOCAL_KEY", "catalogData", "currentDataMode", "db", "isAdmin", "rebuildItemToBarcode", "refreshUI", "requestPlannerBackup412", "safeCatalogKey", "searchCache", "sendCatalogSources", "writeBatch"],
  "writes": ["catalogData", "findPiShelfColumn", "piShelfPreviewText", "planPiShelf", "readPiShelfCell", "savePiAndShelf"]
};
export function register(context) {
  context.findPiShelfColumn = function findPiShelfColumn(cols) {
    return cols.findIndex(v => /^(shelflife(?:months)?|保存期限(?:月|月份)?|固定保存期限(?:月|月份)?)$/i.test(String(v).replace(/[\s_\-\/()（）]/g, '')));
  };
  context.readPiShelfCell = function readPiShelfCell(cols, index, fallback) {
    const raw = String(cols[index >= 0 ? index : fallback] ?? '').trim();
    if (!raw) return null;
    // Historical multi-container exports sometimes had a logistics date here.
    if (index < 0 && /^\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}$/.test(raw)) return null;
    const n = Number(raw);
    return /^\d+$/.test(raw) && n >= 1 && n <= 120 ? n : false;
  };
  context.planPiShelf = function planPiShelf(groups, storedOverrides) {
    const changes = new Map(),
      issues = [],
      products = window.appData.products || {},
      byCode = new Map(),
      byBarcode = new Map();
    for (const [key, p] of Object.entries(products)) {
      const code = String(p.itemCode || '').trim().toUpperCase();
      if (!code) continue;
      byCode.set(code, p);
      const bc = String(p.sourceBarcode || key).replace(/[\s-]/g, '');
      if (!byBarcode.has(bc)) byBarcode.set(bc, new Set());
      byBarcode.get(bc).add(code);
    }
    const known = storedOverrides || context.catalogData?.overrides || {};
    for (const g of groups) for (const r of g.rows || []) {
      if (r.shelfLifeMonths == null) continue;
      const n = r.shelfLifeMonths;
      if (!Number.isInteger(n) || n < 1 || n > 120) throw Error('PI 保存期限須為 1～120 月');
      let code = String(r.itemCode || '').trim().toUpperCase(),
        bc = String(r.barcode || '').replace(/[\s-]/g, '');
      if (code && (!context.safeCatalogKey(code) || code.startsWith('__'))) {
        issues.push(code + '：品號無效，保存期限略過');
        continue;
      }
      if (!code) {
        const matches = byBarcode.get(bc);
        if (matches?.size !== 1) {
          issues.push(bc + '：無法唯一配對 Item Code，保存期限略過');
          continue;
        }
        code = [...matches][0];
      }
      const product = byCode.get(code);
      if (product) {
        const actual = String(product.sourceBarcode || window.appData.itemToBarcode?.[code] || '').replace(/[\s-]/g, '');
        if (actual && bc && actual !== bc) {
          const aliases = window.appData.mappings?.[window.appData.itemToBarcode?.[code]] || [];
          if (!aliases.includes(bc)) {
            issues.push(code + '：條碼與商品主檔不同，保存期限略過');
            continue;
          }
        }
      }
      const old = known[code]?.shelfLifeMonths ?? null;
      if (changes.has(code) && changes.get(code).next !== n) {
        changes.get(code).conflict = true;
        issues.push(code + '：PI 內有不同保存期限，保留原設定');
        continue;
      }
      changes.set(code, {
        code,
        old,
        next: n,
        conflict: changes.get(code)?.conflict || false
      });
    }
    return {
      changes: [...changes.values()].filter(x => !x.conflict && x.old !== x.next),
      issues
    };
  };
  context.piShelfPreviewText = function piShelfPreviewText(plan) {
    return '\n\n保存期限：' + plan.changes.length + ' 款更新（完整保質期，非剩餘效期）' + (plan.changes.length ? '\n' + plan.changes.slice(0, 30).map(x => x.code + '：' + (x.old ?? '未設') + ' → ' + x.next + ' 月').join('\n') : '') + (plan.changes.length > 30 ? '\n其餘 ' + (plan.changes.length - 30) + ' 款一併套用' : '') + (plan.issues.length ? '\n待確認／保存期限略過：\n' + plan.issues.join('\n') : '');
  };
  context.savePiAndShelf = async function savePiAndShelf(plan, previous) {
    if (!context.isAdmin()) return false;
    try {
      const patch = {
        overrides: {}
      };
      for (const x of plan.changes) patch.overrides[x.code] = {
        shelfLifeMonths: x.next
      };
      if (context.currentDataMode === 'test') {
        await context.requestPlannerBackup412();
        localStorage.setItem(context.TEST_LOCAL_KEY, JSON.stringify(window.appData));
        document.getElementById('plannerFrame')?.contentWindow?.postMessage({
          type: 'KAISI_PI_SHELF_TEST',
          overrides: patch.overrides
        }, '*');
        context.refreshUI();
        return true;
      }
      if (plan.changes.length && context.catalogData === null) throw Error('訂貨設定尚未同步完成，請稍後再匯入');
      const candidate = structuredClone(context.catalogData || {});
      for (const x of plan.changes) ((candidate.overrides ||= {})[x.code] ||= {}).shelfLifeMonths = x.next;
      for (const d of [candidate, window.appData]) if (new TextEncoder().encode(JSON.stringify(d)).length > (d === window.appData ? 950000 : 900000)) throw Error('共享資料容量不足，未套用 PI 或保存期限');
      const batch = context.writeBatch(context.db);
      batch.set(context.PROD_DOC_REF, window.appData);
      if (plan.changes.length) batch.set(context.CATALOG_REF, patch, {
        merge: true
      });
      await batch.commit();
      if (plan.changes.length) context.catalogData = candidate;
      context.searchCache.valid = false;
      context.refreshUI();
      context.sendCatalogSources();
      return true;
    } catch (err) {
      window.appData = previous;
      context.rebuildItemToBarcode();
      context.refreshUI();
      alert('PI 與保存期限未完成儲存，原資料已保留：' + (err.message || err));
      return false;
    }
  };
}
export function initialize(context) {}
