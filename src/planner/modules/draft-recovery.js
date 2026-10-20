// planner: draft-recovery. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "draft-recovery",
  "owns": [{
    "name": "plannerUid",
    "kind": "let"
  }, {
    "name": "localRecovery",
    "kind": "let"
  }, {
    "name": "localRecoveryScope",
    "kind": "let"
  }, {
    "name": "recoveryTimer",
    "kind": "let"
  }, {
    "name": "saveFingerprints",
    "kind": "let"
  }, {
    "name": "previousContainerCode",
    "kind": "let"
  }, {
    "name": "recoveryKey",
    "kind": "function"
  }, {
    "name": "localDraftCopy",
    "kind": "function"
  }, {
    "name": "draftFingerprint",
    "kind": "function"
  }, {
    "name": "autosaveLabel",
    "kind": "function"
  }, {
    "name": "flushRecovery",
    "kind": "function"
  }, {
    "name": "stageLocalDraft",
    "kind": "function"
  }, {
    "name": "loadLocalRecovery",
    "kind": "function"
  }, {
    "name": "clearRecoveredWork",
    "kind": "function"
  }, {
    "name": "mergeChangingContainerKey",
    "kind": "function"
  }],
  "imports": ["$", "currentKey", "deferredDrafts", "dirtyDrafts", "draft", "loadWork", "plannerRole", "renderAll", "selectedWorkApplied", "state", "trackerFeed", "updateWorkSelect"],
  "writes": ["autosaveLabel", "clearRecoveredWork", "draftFingerprint", "flushRecovery", "loadLocalRecovery", "localDraftCopy", "localRecovery", "localRecoveryScope", "mergeChangingContainerKey", "plannerUid", "previousContainerCode", "recoveryKey", "recoveryTimer", "saveFingerprints", "selectedWorkApplied", "stageLocalDraft"]
};
export function register(context) {
  context.recoveryKey = function recoveryKey() {
    return context.plannerUid && context.trackerFeed?.mode ? 'kaisi_order_planner_rescue_v483_' + context.plannerUid + '_' + context.trackerFeed.mode : '';
  };
  context.localDraftCopy = function localDraftCopy(d) {
    return {
      kind: d.kind || 'dry',
      arrival: d.arrival || '',
      coverage: Number(d.coverage) || 0,
      rows: {
        ...(d.rows || {})
      },
      itemNotes: {
        ...(d.itemNotes || {})
      }
    };
  };
  context.draftFingerprint = function draftFingerprint(d) {
    return JSON.stringify(context.localDraftCopy(d || {}));
  };
  context.autosaveLabel = function autosaveLabel(msg, cls = '') {
    const el = context.$('autosaveStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = cls;
  };
  context.flushRecovery = function flushRecovery() {
    if (context.recoveryTimer) {
      clearTimeout(context.recoveryTimer);
      context.recoveryTimer = 0;
    }
    const key = context.localRecoveryScope;
    if (!key || context.plannerRole === 'viewer') return;
    try {
      localStorage.setItem(key, JSON.stringify(context.localRecovery));
      context.autosaveLabel('✓ 已暫存於本機 · 尚未提交 Firebase', 'ok');
    } catch (err) {
      context.autosaveLabel('⚠ 本機暫存失敗，請手動提交／匯出草稿', 'warn');
    }
  };
  context.stageLocalDraft = function stageLocalDraft() {
    if (context.plannerRole === 'viewer') return;
    const code = context.currentKey(),
      d = context.state.drafts[code] || context.draft();
    d.rows ||= {};
    d.kind = context.$('kind').value;
    d.arrival = context.$('arrival').value;
    d.coverage = Number(context.$('coverage').value) || 0;
    context.state.drafts[code] = d;
    context.dirtyDrafts.add(code);
    context.$('deleteWork').hidden = context.plannerRole !== 'admin' || code.startsWith('__');
    if (!context.plannerUid) return;
    context.localRecovery.works ||= {};
    context.localRecovery.works[code] = {
      updatedAt: Date.now(),
      draft: context.localDraftCopy(d)
    };
    context.localRecovery.lastCode = code;
    context.autosaveLabel('編輯中 · 正在暫存…');
    if (context.recoveryTimer) clearTimeout(context.recoveryTimer);
    context.recoveryTimer = setTimeout(context.flushRecovery, 400);
  };
  context.loadLocalRecovery = function loadLocalRecovery() {
    const key = context.recoveryKey();
    if (!key || context.localRecoveryScope === key) return;
    if (context.localRecoveryScope) context.flushRecovery();
    context.localRecoveryScope = key;
    try {
      const raw = JSON.parse(localStorage.getItem(key) || '{}');
      context.localRecovery = raw && raw.works && typeof raw.works === 'object' ? raw : {
        works: {}
      };
    } catch {
      context.localRecovery = {
        works: {}
      };
    }
    const entries = Object.entries(context.localRecovery.works || {});
    let restored = 0;
    for (const [code, record] of entries) {
      if (!record || !record.draft || typeof record.draft.rows !== 'object') continue;
      const cloud = context.state.drafts[code] || {};
      context.state.drafts[code] = {
        ...cloud,
        ...context.localDraftCopy(record.draft),
        notes: cloud.notes || []
      };
      context.dirtyDrafts.add(code);
      restored++;
    }
    if (restored) {
      context.autosaveLabel(`✓ 已恢復 ${restored} 份本機未提交草稿 · 請檢查後提交`, 'ok');
    } else context.autosaveLabel('編輯後自動暫存於此瀏覽器 · 正式共用需按提交');
    context.updateWorkSelect();
    const recent = context.localRecovery.lastCode;
    if (restored && recent && recent !== '__未命名草稿__' && !context.$('container').value.trim() && Object.hasOwn(context.state.drafts, recent)) {
      context.selectedWorkApplied = true;
      context.loadWork(recent);
    } else context.renderAll();
  };
  context.clearRecoveredWork = function clearRecoveredWork(code) {
    if (context.localRecovery.works) delete context.localRecovery.works[code];
    context.flushRecovery();
  };
  context.mergeChangingContainerKey = function mergeChangingContainerKey(previous, next) {
    if (previous === next || !previous || !next || Object.hasOwn(context.deferredDrafts || {}, previous)) return;
    const source = context.state.drafts[previous];
    if (!source || Object.hasOwn(context.state.drafts, next)) return;
    // Carry an unnamed, locally edited work through code entry without overwriting an existing work.
    const oldAnon = previous === '__未命名草稿__';
    const typingForward = previous !== '__未命名草稿__' && next.startsWith(previous) && !source.preparedAt && !source.updatedAt;
    if (!oldAnon && !typingForward) return;
    context.state.drafts[next] = source;
    delete context.state.drafts[previous];
    context.dirtyDrafts.delete(previous);
    context.dirtyDrafts.add(next);
    if (context.localRecovery.works?.[previous]) {
      context.localRecovery.works[next] = context.localRecovery.works[previous];
      delete context.localRecovery.works[previous];
    }
  };
}
export function initialize(context) {
  context.plannerUid = '';
  context.localRecovery = {
    works: {}
  };
  context.localRecoveryScope = '';
  context.recoveryTimer = 0;
  context.saveFingerprints = new Map();
  context.previousContainerCode = '';
  window.addEventListener('pagehide', context.flushRecovery);
  window.addEventListener('beforeunload', context.flushRecovery);
}
