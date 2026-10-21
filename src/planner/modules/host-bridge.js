// planner: host-bridge. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "host-bridge",
  "owns": [{
    "name": "people",
    "kind": "let"
  }, {
    "name": "refreshRetryStatus",
    "kind": "function"
  }, {
    "name": "updateTableHeader",
    "kind": "function"
  }, {
    "name": "deferredDrafts",
    "kind": "let"
  }, {
    "name": "customerSourceReady",
    "kind": "let"
  }, {
    "name": "plannerHeightLast",
    "kind": "let"
  }, {
    "name": "plannerHeightPending",
    "kind": "let"
  }, {
    "name": "sendPlannerHeight",
    "kind": "function"
  }],
  "imports": ["$", "applyCatalogSnapshot", "applyPreparedDefaults", "autosaveLabel", "catalogReady", "clearRecoveredWork", "currentKey", "dirtyDrafts", "discoverCatalog", "draftFingerprint", "events", "finishCloud", "flushRecovery", "loadLocalRecovery", "loadPlannerMode", "localRecovery", "localRecoveryScope", "notifyPlannerWidth412", "plannerRole", "plannerUid", "rebuildCatalog", "refreshShelfImporterRole", "refreshStatusImporterRole", "renderAll", "renderNotes", "saveFingerprints", "selectedWorkApplied", "showColumnFilter", "state", "storeLocal", "trackerFeed", "updateWorkSelect"],
  "writes": ["people", "catalogReady", "customerSourceReady", "deferredDrafts", "localRecovery", "localRecoveryScope", "plannerHeightLast", "plannerHeightPending", "plannerRole", "plannerUid", "refreshRetryStatus", "selectedWorkApplied", "sendPlannerHeight", "trackerFeed", "updateTableHeader"]
};
export function register(context) {
  context.refreshRetryStatus = function refreshRetryStatus() {
    const dirty = Object.keys(context.state.dirtyCatalog.items).length || Object.keys(context.state.dirtyCatalog.overrides).length || Object.keys(context.state.dirtyCatalog.rules).length || Object.keys(context.state.sourceDirty).length;
    if (!dirty) context.state.syncFailed = false;
    context.$('retryCatalog').classList.toggle('hidden', !context.state.syncFailed || context.trackerFeed?.mode === 'test');
  };
  context.updateTableHeader = function updateTableHeader() {
    context.notifyPlannerWidth412();
    window.parent.postMessage({
      type: 'KAISI_FREEZE_SYNC'
    }, '*');
  };
  context.sendPlannerHeight = function sendPlannerHeight() {
    if (context.plannerHeightPending) return;
    context.plannerHeightPending = true;
    requestAnimationFrame(() => {
      context.plannerHeightPending = false;
      const el = document.querySelector('main');
      if (!el) return;
      const natural = Math.ceil(el.getBoundingClientRect().height + 26);
      const height = Math.min(400000, Math.max(760, natural));
      if (Math.abs(height - context.plannerHeightLast) >= 4) {
        context.plannerHeightLast = height;
        window.parent.postMessage({
          type: 'KAISI_PLANNER_HEIGHT',
          height
        }, '*');
      }
    });
  };
}
export function initialize(context) {
  context.people = {};
  context.deferredDrafts = {};
  context.customerSourceReady = false;
  context.events.onMessage(event => {
    if (event.source !== window.parent) return;
    const m = event.data || {};
    if (m.type === 'KAISI_FROZEN_FILTER') {
      const r = {
        getBoundingClientRect: () => ({
          left: Number(m.left) || 10,
          top: Number(m.top) || 10,
          bottom: (Number(m.top) || 10) + 34
        })
      };
      context.showColumnFilter(m.column, r);
      return;
    }
    if (m.type === 'KAISI_TRACKER_SNAPSHOT') {
      const feed = m.payload;
      if (!feed || !['live', 'test'].includes(feed.mode) || !Array.isArray(feed.pis) || typeof feed.products !== 'object') return;
      if (context.trackerFeed?.mode !== feed.mode) {
        context.flushRecovery();
        context.loadPlannerMode(feed.mode);
        context.localRecoveryScope = '';
        context.localRecovery = {
          works: {}
        };
        context.customerSourceReady = false;
        if (feed.mode === 'live') {
          context.state.orders = [];
          context.state.meta.orders = '等待 Firebase 客訂連線';
        }
      }
      context.trackerFeed = feed;
      context.loadLocalRecovery();
      context.rebuildCatalog();
      if (feed.mode === 'live') for (const [code, d] of Object.entries(context.deferredDrafts)) if (!context.dirtyDrafts.has(code)) context.state.drafts[code] = d;
      context.discoverCatalog();
      context.renderAll();
      return;
    }
    if (m.type === 'KAISI_PLANNER_ROLE') {
      context.plannerRole = m.role || 'viewer';
      context.plannerUid = String(m.uid || '');
      context.loadLocalRecovery();
      context.applyPreparedDefaults();
      context.renderAll();
      context.refreshStatusImporterRole();
      context.refreshShelfImporterRole();
      return;
    }
    if (m.type === 'KAISI_ORDER_DELETE_RESULT') {
      context.$('deleteWork').disabled = false;
      if (m.ok) {
        delete context.state.drafts[m.code];
        delete context.deferredDrafts[m.code];
        context.saveFingerprints.delete(m.code);
        context.dirtyDrafts.delete(m.code);
        if (context.localRecovery.works) delete context.localRecovery.works[m.code];
        context.flushRecovery();
        if (context.currentKey() === m.code) {
          context.$('container').value = '';
          context.selectedWorkApplied = false;
        }
        context.storeLocal();
        context.updateWorkSelect();
        context.renderAll();
        alert((m.localOnly ? '已刪除本機工作單草稿 ' : '已刪除採購建議單 ') + m.code);
      } else alert('刪除失敗：' + (m.error || '未知錯誤'));
      return;
    }
    if (m.type === 'KAISI_ORDER_PRESET_RESULT') {
      context.$('savePreset').disabled = false;
      if (!m.ok) alert('儲存工作設定失敗：' + (m.error || '未知錯誤'));else {
        context.$('container').value = m.code;
        context.selectedWorkApplied = true;
        alert('已儲存工作設定，Editor 可以選取 ' + m.code + ' 開始訂貨。');
      }
      return;
    }
    if (m.type === 'KAISI_ORDER_NOTE_DELETE_RESULT') {
      if (!m.ok) alert('刪除留言失敗：' + (m.error || '未知錯誤'));else context.$('noteStatus').textContent = '已刪除一則留言';
      context.renderNotes();
      return;
    }
    if (m.type === 'KAISI_ORDER_NOTE_RESULT') {
      context.$('sendNote').disabled = false;
      if (!m.ok) alert('留言失敗：' + (m.error || '未知錯誤'));else {
        context.$('noteText').value = '';
        context.$('noteStatus').textContent = '留言已送出';
      }
      return;
    }
    if (m.type === 'KAISI_ORDER_DRAFTS') {
      context.people = m.people || {};
      context.deferredDrafts = m.drafts || {};
      if (context.trackerFeed?.mode === 'live') {
        for (const code of Object.keys(context.state.drafts)) if (code !== '__未命名草稿__' && !context.dirtyDrafts.has(code) && !Object.hasOwn(context.deferredDrafts, code)) delete context.state.drafts[code];
        for (const [code, d] of Object.entries(context.deferredDrafts)) {
          if (!context.dirtyDrafts.has(code)) context.state.drafts[code] = d;else context.state.drafts[code] = {
            ...context.state.drafts[code],
            notes: d.notes || [],
            preparedAt: d.preparedAt,
            preparedBy: d.preparedBy
          };
        }
        context.storeLocal();
        context.applyPreparedDefaults();
        context.renderAll();
      }
      return;
    }
    if (m.type === 'KAISI_ORDER_SAVE_RESULT') {
      if (m.ok) {
        const current = context.state.drafts[m.code];
        if (current && context.saveFingerprints.get(m.code) === context.draftFingerprint(current)) {
          context.dirtyDrafts.delete(m.code);
          if (!m.localOnly) context.clearRecoveredWork(m.code);
          context.autosaveLabel(m.localOnly ? '✓ TEST 本機草稿已保存' : '✓ 已提交 Firebase，其他帳號可查看', 'ok');
        } else context.autosaveLabel('有提交後的新修改，已留在本機，請再次提交', 'warn');
        context.saveFingerprints.delete(m.code);
      } else context.autosaveLabel('提交失敗：' + (m.error || '請稍後重試') + '；本機草稿仍保留', 'warn');
      context.storeLocal();
      context.updateWorkSelect();
      context.renderAll();
      return;
    }
    if (m.type === 'KAISI_CATALOG_SAVE_RESULT') {
      context.finishCloud(m);
      return;
    }
    if (m.type === 'KAISI_CATALOG_ERROR') {
      context.$('catalogSync').textContent = '共享資料連線失敗：' + m.error + '；本機資料保留';
      return;
    }
    if (!context.trackerFeed || m.mode !== context.trackerFeed.mode) return;
    if (m.type === 'KAISI_CATALOG_SNAPSHOT') {
      if (m.mode === 'test') {
        context.catalogReady = true;
        context.renderAll();
        return;
      }
      context.applyCatalogSnapshot(m.data);
      return;
    }
    if (m.type === 'KAISI_INVENTORY_SNAPSHOT' && m.data) {
      if (m.data.resetAt && m.data.resetAt !== context.state.inventoryResetAt) {
        delete context.state.sourceDirty.inventory;
        context.state.inventoryResetAt = m.data.resetAt;
      }
      if (context.state.sourceDirty.inventory) return;
      context.state.inventory = m.data.rows || {};
      context.state.myobFactorBatchId = String(m.data.factorBatchId || '');
      context.state.myobImportedAt = String(m.data.updatedAt || '');
      context.state.meta.myob = m.data.label || (Object.keys(context.state.inventory).length ? '共享 MYOB' : '尚未匯入共享 MYOB 快照');
      context.rebuildCatalog();
      context.renderAll();
      return;
    }
    if (m.type === 'KAISI_CUSTOMER_SOURCE') {
      if (m.mode !== 'live') return;
      context.customerSourceReady = Array.isArray(m.orders);
      context.state.orders = context.customerSourceReady ? m.orders : [];
      context.state.meta.orders = m.status + (m.fetchedAt ? ' · 最後取得 ' + new Date(m.fetchedAt).toLocaleString('zh-TW', {
        timeZone: 'Australia/Brisbane'
      }) : '');
      delete context.state.sourceDirty.orders;
      context.rebuildCatalog();
      context.renderAll();
      return;
    }
    if (m.type === 'KAISI_SOURCES_SNAPSHOT') {
      if (Array.isArray(m.data?.pis) && !context.state.sourceDirty.pis) {
        context.state.pis = m.data.pis;
        context.state.meta.pi = m.data.piLabel || '共享 PI';
      }
      // 客訂由唯讀來源提供，舊 JSON 快照不覆蓋 Firebase 資料。
      context.rebuildCatalog();
      context.discoverCatalog();
      context.renderAll();
      return;
    }
  });
  // Auto-fit embedded planner to its content so the outer document has one scrollbar.
  context.plannerHeightLast = 0;
  context.plannerHeightPending = false;
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(context.sendPlannerHeight).observe(document.querySelector('main'));
  window.addEventListener('resize', () => {
    context.sendPlannerHeight();
    context.updateTableHeader();
  });
  window.addEventListener('load', context.sendPlannerHeight);
}
