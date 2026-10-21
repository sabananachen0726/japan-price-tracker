// shell: frame-commands. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "frame-commands",
  "owns": [],
  "imports": ["CONTAINER_TRACKER_REF", "FieldPath", "ORDER_PLANNER_REF", "arrayRemove", "arrayUnion", "auth", "canPlan", "currentDataMode", "currentRole", "deleteProposal", "events", "frozenSignature", "isAdmin", "loadEmbeddedOrderPlanner", "normalizeContainerNo", "refreshCustomerSource", "routePlannerWorkspace", "safeCatalogKey", "sendContainerSnapshot", "sendPlannerSnapshot", "sendSharedOrderDrafts", "setDoc", "sharedOrderDrafts", "updateDoc", "updateFrozenHeader"],
  "writes": ["frozenSignature"]
};
export function register(context) {}
export function initialize(context) {
  let containerReturnScroll = null;
  const containerFrame = document.getElementById('containerTrackerFrame');
  const detailBar = document.createElement('div');
  detailBar.id = 'containerDetailBar';
  detailBar.hidden = true;
  detailBar.innerHTML = '<div><strong data-detail-title></strong><div data-detail-summary></div><div data-detail-feedback role="status" aria-live="polite"></div></div><div class="detail-bar-actions"><button type="button" class="btn btn-outline-secondary" data-detail-action="back">← 返回列表</button><button type="button" class="btn btn-primary" data-detail-action="save">儲存變更</button></div>';
  containerFrame?.parentElement.before(detailBar);
  detailBar.addEventListener('click', e => {
    const action = e.target.closest('[data-detail-action]')?.dataset.detailAction;
    if (action) containerFrame?.contentWindow?.postMessage({type: 'KAISI_CONTAINER_ACTION', action}, '*');
  });
  context.events.onMessage(e => {
    if (!context.auth.currentUser) return;
    const plannerWindow = document.getElementById('plannerFrame')?.contentWindow;
    const containerWindow = document.getElementById('containerTrackerFrame')?.contentWindow;
    if (e.source === plannerWindow && e.data?.type === 'KAISI_PLANNER_HEIGHT') {
      const h = Number(e.data.height);
      if (Number.isFinite(h) && h >= 760 && h <= 400000) {
        const f = document.getElementById('plannerFrame');
        if (f && Math.abs(f.getBoundingClientRect().height - h) > 3) f.style.height = h + 'px';
        context.updateFrozenHeader();
      }
      return;
    }
    if (e.source === plannerWindow && e.data?.type === 'KAISI_PLANNER_READY') {
      context.updateFrozenHeader();
      context.sendPlannerSnapshot();
      context.sendSharedOrderDrafts();
      plannerWindow.postMessage({
        type: 'KAISI_PLANNER_ROLE',
        role: context.currentRole,
        uid: context.auth.currentUser?.uid || ''
      }, '*');
      context.routePlannerWorkspace();
    }
    if (e.source === plannerWindow && e.data?.type === 'KAISI_FREEZE_SYNC') {
      context.frozenSignature = '';
      context.updateFrozenHeader();
      return;
    }
    if (e.source === plannerWindow && e.data?.type === 'KAISI_ORDER_PRESET_SAVE') {
      const code = context.normalizeContainerNo(e.data.code),
        p = e.data.preset || {};
      const reply = (ok, error = '') => plannerWindow.postMessage({
        type: 'KAISI_ORDER_PRESET_RESULT',
        code,
        ok,
        error
      }, '*');
      if (!context.isAdmin() || !code || code.startsWith('__') || !['dry', 'frozen', 'unknown'].includes(p.kind) || !Number.isFinite(Number(p.coverage))) return reply(false, '設定無效或沒有 Admin 權限');
      if (context.currentDataMode !== 'live') return reply(false, 'TEST 模式不會更新共享工作設定');
      const fields = {
        kind: p.kind,
        arrival: String(p.arrival || ''),
        coverage: Number(p.coverage),
        preparedAt: new Date().toISOString(),
        preparedBy: context.auth.currentUser.email || ''
      };
      context.setDoc(context.ORDER_PLANNER_REF, {
        drafts: {
          [code]: fields
        }
      }, {
        merge: true
      }).then(() => reply(true)).catch(err => reply(false, err.code || err.message));
      return;
    }
    if (e.source === plannerWindow && e.data?.type === 'KAISI_ORDER_NOTE_ADD') {
      const code = context.normalizeContainerNo(e.data.code),
        noteText = String(e.data.text || '').trim();
      const reply = (ok, error = '') => plannerWindow.postMessage({
        type: 'KAISI_ORDER_NOTE_RESULT',
        code,
        ok,
        error
      }, '*');
      if (!context.canPlan() || context.currentDataMode !== 'live' || !Object.hasOwn(context.sharedOrderDrafts, code) || !noteText || noteText.length > 1000) return reply(false, '工作單不存在、權限不足或留言超過 1000 字');
      const note = {
        id: crypto.randomUUID(),
        by: context.auth.currentUser.email || '',
        uid: context.auth.currentUser.uid,
        at: new Date().toISOString(),
        text: noteText
      };
      context.updateDoc(context.ORDER_PLANNER_REF, new context.FieldPath('drafts', code, 'notes'), context.arrayUnion(note)).then(() => reply(true)).catch(err => reply(false, err.code || err.message));
      return;
    }
    if (e.source === plannerWindow && e.data?.type === 'KAISI_ORDER_NOTE_DELETE') {
      const code = context.normalizeContainerNo(e.data.code),
        id = String(e.data.id || '');
      const reply = (ok, error = '') => plannerWindow.postMessage({
        type: 'KAISI_ORDER_NOTE_DELETE_RESULT',
        code,
        id,
        ok,
        error
      }, '*');
      if (!context.isAdmin() || context.currentDataMode !== 'live' || !Object.hasOwn(context.sharedOrderDrafts, code) || !id) return reply(false, '僅 Admin 可以刪除已儲存工作單的留言');
      const notes = context.sharedOrderDrafts[code]?.notes || [];
      const note = notes.find((n, index) => (n.id || 'legacy-' + index) === id);
      if (!note) return reply(false, '找不到這則留言，可能已由其他人刪除');
      context.updateDoc(context.ORDER_PLANNER_REF, new context.FieldPath('drafts', code, 'notes'), context.arrayRemove(note)).then(() => reply(true)).catch(err => reply(false, err.code || err.message));
      return;
    }
    if (e.source === plannerWindow && e.data?.type === 'KAISI_ORDER_DELETE') {
      const code = context.normalizeContainerNo(e.data.code);
      if (!context.isAdmin() || !code || code.startsWith('__')) {
        plannerWindow.postMessage({
          type: 'KAISI_ORDER_DELETE_RESULT',
          code,
          ok: false,
          error: context.isAdmin() ? '請選擇有效的工作單' : '僅 Admin 可刪除'
        }, '*');
        return;
      }
      // A local draft has never been shared. Clear it locally instead of rejecting an Admin.
      if (context.currentDataMode === 'test' || !Object.hasOwn(context.sharedOrderDrafts, code)) {
        plannerWindow.postMessage({ type: 'KAISI_ORDER_DELETE_RESULT', code, ok: true, localOnly: true }, '*');
        return;
      }
      context.deleteProposal(code).then(() => plannerWindow.postMessage({
        type: 'KAISI_ORDER_DELETE_RESULT',
        code,
        ok: true
      }, '*')).catch(err => plannerWindow.postMessage({
        type: 'KAISI_ORDER_DELETE_RESULT',
        code,
        ok: false,
        error: err.message
      }, '*'));
    }
    if (e.source === plannerWindow && e.data?.type === 'KAISI_ORDER_SAVE') {
      const code = context.normalizeContainerNo(e.data.code),
        draft = e.data.draft;
      if (!context.canPlan()) {
        plannerWindow.postMessage({
          type: 'KAISI_ORDER_SAVE_RESULT',
          code,
          ok: false,
          error: '唯讀帳號不能儲存'
        }, '*');
        return;
      }
      if (!code || code.startsWith('__') || !draft || typeof draft.rows !== 'object') return;
      const cleaned = {
        kind: draft.kind === 'frozen' ? 'frozen' : 'dry',
        arrival: String(draft.arrival || ''),
        coverage: Number(draft.coverage) || 0,
        rows: {},
        itemNotes: {},
        snapshot: {},
        submittedBy: context.auth.currentUser.email || '',
        updatedAt: new Date().toISOString()
      };
      Object.entries(draft.rows).forEach(([item, q]) => {
        if (context.safeCatalogKey(item) && Number.isInteger(Number(q)) && Number(q) >= 0) {
          cleaned.rows[item.toUpperCase()] = Number(q);
          const barcode = window.appData.itemToBarcode?.[item] || '';
          cleaned.snapshot[item.toUpperCase()] = {
            barcode,
            name: window.appData.products?.[barcode]?.name || item
          };
        }
      });
      Object.entries(draft.itemNotes || {}).forEach(([item, note]) => {
        const code = String(item || '').toUpperCase();
        const message = String(note || '').trim();
        if (context.safeCatalogKey(code) && message && message.length <= 250) {
          cleaned.itemNotes[code] = message;
          const barcode = window.appData.itemToBarcode?.[code] || '';
          cleaned.snapshot[code] ||= {barcode, name: window.appData.products?.[barcode]?.name || code};
        }
      });
      if (context.currentDataMode === 'test') {
        plannerWindow.postMessage({
          type: 'KAISI_ORDER_SAVE_RESULT',
          code,
          ok: true,
          localOnly: true
        }, '*');
        return;
      }
      context.setDoc(context.ORDER_PLANNER_REF, {
        drafts: {
          [code]: cleaned
        }
      }, {
        // Replace editable maps, including deleted notes, without touching shared comments/presets.
        mergeFields: Object.keys(cleaned).map(field => new context.FieldPath('drafts', code, field))
      }).then(() => plannerWindow.postMessage({
        type: 'KAISI_ORDER_SAVE_RESULT',
        code,
        ok: true
      }, '*')).catch(err => plannerWindow.postMessage({
        type: 'KAISI_ORDER_SAVE_RESULT',
        code,
        ok: false,
        error: err.code || err.message
      }, '*'));
    }
    if (e.source === containerWindow && e.data?.type === 'KAISI_CONTAINER_HEADER') {
      detailBar.querySelector('[data-detail-title]').textContent = String(e.data.title || '').slice(0, 120);
      detailBar.querySelector('[data-detail-summary]').textContent = String(e.data.summary || '').slice(0, 240);
      return;
    }
    if (e.source === containerWindow && e.data?.type === 'KAISI_CONTAINER_FEEDBACK') {
      const el = detailBar.querySelector('[data-detail-feedback]');
      el.textContent = String(e.data.message || '').slice(0, 400);
      el.className = ['ok', 'bad', 'pending'].includes(e.data.kind) ? e.data.kind : '';
      const saving = e.data.kind === 'pending';
      detailBar.querySelectorAll('button').forEach(b => b.disabled = saving);
      return;
    }
    if (e.source === containerWindow && e.data?.type === 'KAISI_CONTAINER_VIEW') {
      const frame = document.getElementById('containerTrackerFrame');
      const height = Number(e.data.height);
      if (!frame || !['detail', 'overview'].includes(e.data.view) || !Number.isFinite(height) || height < 760 || height >= 180000) return;
      if (e.data.view === 'detail' && containerReturnScroll === null) containerReturnScroll = window.scrollY;
      detailBar.hidden = e.data.view !== 'detail';
      detailBar.querySelector('[data-detail-action="save"]').hidden = !context.isAdmin();
      frame.style.height = height + 'px';
      const target = e.data.view === 'detail' ? window.scrollY + frame.getBoundingClientRect().top - 110 : containerReturnScroll;
      if (e.data.view === 'overview') containerReturnScroll = null;
      requestAnimationFrame(() => window.scrollTo({top: Math.max(0, target ?? window.scrollY), behavior: 'instant'}));
      return;
    }
    if (e.source === containerWindow && e.data?.type === 'KAISI_CONTAINER_HEIGHT') {
      const h = Number(e.data.height);
      if (Number.isFinite(h) && h >= 760 && h < 180000) {
        const f = document.getElementById('containerTrackerFrame');
        if (f && Math.abs(f.getBoundingClientRect().height - h) > 5) f.style.height = h + 'px';
      }
      return;
    }
    if (e.source === containerWindow && e.data?.type === 'KAISI_CONTAINER_READY') {
      detailBar.hidden = true;
      containerReturnScroll = null;
      context.sendContainerSnapshot();
    }
    if (e.source === containerWindow && e.data?.type === 'KAISI_CONTAINER_SAVE') {
      const id = e.data.id,
        data = e.data.data;
      if (!context.isAdmin()) {
        containerWindow.postMessage({
          type: 'KAISI_CONTAINER_SAVE_RESULT',
          id,
          ok: false,
          error: '僅 Admin 可修改貨櫃'
        }, '*');
        return;
      }
      if (context.currentDataMode === 'test') {
        containerWindow.postMessage({
          type: 'KAISI_CONTAINER_SAVE_RESULT',
          id,
          ok: false,
          error: 'TEST 模式不能修改正式貨櫃'
        }, '*');
        return;
      }
      if (!data || !Array.isArray(data.containers) || !data.settings) return;
      context.setDoc(context.CONTAINER_TRACKER_REF, data).then(() => containerWindow.postMessage({
        type: 'KAISI_CONTAINER_SAVE_RESULT',
        id,
        ok: true
      }, '*')).catch(err => containerWindow.postMessage({
        type: 'KAISI_CONTAINER_SAVE_RESULT',
        id,
        ok: false,
        error: err.code || err.message
      }, '*'));
    }
  });
  document.addEventListener('shown.bs.tab', e => {
    if (e.target?.id === 'planner-tab') {
      context.loadEmbeddedOrderPlanner();
      context.refreshCustomerSource();
    }
  });
}
