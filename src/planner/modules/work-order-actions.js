// planner: work-order-actions. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "work-order-actions",
  "owns": [{
    "name": "selectedWorkApplied",
    "kind": "let"
  }, {
    "name": "preparedWorks",
    "kind": "function"
  }, {
    "name": "updateWorkSelect",
    "kind": "function"
  }, {
    "name": "loadWork",
    "kind": "function"
  }, {
    "name": "applyPreparedDefaults",
    "kind": "function"
  }, {
    "name": "renderNotes",
    "kind": "function"
  }, {
    "name": "exportPlanButton",
    "kind": "const"
  }],
  "imports": ["$", "currentKey", "esc", "exportCsv", "persist", "plannerRole", "previousContainerCode", "renderAll", "renderPlan", "saveDraft", "state", "trackerFeed", "updateZoom", "zoomScale"],
  "writes": ["applyPreparedDefaults", "exportPlanButton", "loadWork", "preparedWorks", "previousContainerCode", "renderNotes", "selectedWorkApplied", "updateWorkSelect", "zoomScale"]
};
export function register(context) {
  context.preparedWorks = function preparedWorks() {
    return Object.entries(context.state.drafts || {}).filter(([code, d]) => !code.startsWith('__') && (d?.preparedAt || Object.values(d?.rows || {}).some(n => +n > 0) || Object.values(d?.itemNotes || {}).some(n => String(n).trim()))).sort((a, b) => String(b[1].preparedAt || b[1].updatedAt || '').localeCompare(String(a[1].preparedAt || a[1].updatedAt || '')));
  };
  context.updateWorkSelect = function updateWorkSelect() {
    const list = context.preparedWorks(),
      sel = context.$('workSelect'),
      old = sel.value;
    sel.innerHTML = '<option value="">自行輸入／新工作單</option>' + list.map(([code, d]) => `<option value="${context.esc(code)}">${context.esc(code)} · ${context.esc(d.kind === 'frozen' ? '冷凍' : '乾貨')} · ${context.esc(d.arrival || '待定')}</option>`).join('');
    sel.value = list.some(([code]) => code === old) ? old : '';
  };
  context.loadWork = function loadWork(code) {
    const d = context.state.drafts[code];
    if (!d) return;
    context.$('container').value = code;
    context.$('kind').value = d.kind || 'dry';
    context.$('arrival').value = d.arrival || '';
    context.$('coverage').value = d.coverage ?? 1;
    context.$('workSelect').value = code;
    context.previousContainerCode = code;
    context.renderAll();
    context.renderNotes();
  };
  context.applyPreparedDefaults = function applyPreparedDefaults() {
    context.updateWorkSelect();
    if (context.selectedWorkApplied || context.$('container').value.trim()) return;
    const presets = context.preparedWorks().filter(([, d]) => !!d.preparedAt);
    if (!presets.length) return;
    context.selectedWorkApplied = true;
    context.loadWork(presets[0][0]);
  };
  context.renderNotes = function renderNotes() {
    const code = context.currentKey(),
      d = context.state.drafts[code] || {},
      notes = Array.isArray(d.notes) ? d.notes : [];
    context.$('notesCount').textContent = notes.length + ' 則';
    context.$('notesList').innerHTML = notes.length ? notes.map((n, index) => ({
      n,
      index
    })).slice(-60).map(({
      n,
      index
    }) => `<div class="note-entry"><div class="note-meta"><span>${context.esc(n.by || '同事')} · ${context.esc(n.at ? new Date(n.at).toLocaleString('zh-TW', {
      timeZone: 'Australia/Brisbane'
    }) : '')}</span>${context.plannerRole === 'admin' ? `<button type="button" class="note-delete" data-note-delete="${context.esc(n.id || 'legacy-' + index)}" aria-label="刪除此留言">刪除</button>` : ''}</div><div class="note-text">${context.esc(n.text || '')}</div></div>`).join('') : '<div class="muted">尚無留言，這份工作單的備註會供 Admin 和 Editor 共用。</div>';
    context.$('sendNote').disabled = context.plannerRole === 'viewer' || !code || code.startsWith('__') || context.trackerFeed?.mode === 'test';
    context.$('noteStatus').textContent = context.trackerFeed?.mode === 'test' ? 'TEST 模式不會送出共享留言' : !context.state.drafts[code] ? '請先由 Admin 儲存工作設定，或先儲存這份採購工作單，再留言。' : '留言只在送出時寫入 Firebase，無需另外手動同步。';
  };
}
export function initialize(context) {
  context.selectedWorkApplied = false;
  context.$('workSelect').addEventListener('change', () => {
    const code = context.$('workSelect').value;
    if (code) context.loadWork(code);else {
      context.selectedWorkApplied = true;
      context.$('container').value = '';
      context.previousContainerCode = '__未命名草稿__';
      context.renderAll();
      context.renderNotes();
    }
  });
  context.$('deleteWork').addEventListener('click', () => {
    if (context.plannerRole !== 'admin') return;
    const code = context.currentKey();
    if (code.startsWith('__') || !Object.hasOwn(context.state.drafts, code)) return;
    if (!confirm(`確定永久刪除採購工作單 ${code}（包括本櫃數量及留言）？\n\n不會刪除正式 Container Tracker 貨櫃或 PI。`)) return;
    context.$('deleteWork').disabled = true;
    window.parent.postMessage({
      type: 'KAISI_ORDER_DELETE',
      code
    }, '*');
  });
  context.$('savePreset').addEventListener('click', () => {
    if (context.plannerRole !== 'admin') return;
    const code = context.currentKey();
    if (!code || code.startsWith('__')) return alert('請先填寫工作單／貨櫃號碼');
    const preset = {
      kind: context.$('kind').value,
      arrival: context.$('arrival').value,
      coverage: Number(context.$('coverage').value) || 0
    };
    if (context.trackerFeed?.mode === 'test') return alert('TEST 模式不能發布給其他同事，請切換 LIVE 後設定。');
    context.$('savePreset').disabled = true;
    window.parent.postMessage({
      type: 'KAISI_ORDER_PRESET_SAVE',
      code,
      preset
    }, '*');
  });
  context.$('notesList').addEventListener('click', e => {
    const btn = e.target.closest('[data-note-delete]');
    if (!btn || context.plannerRole !== 'admin') return;
    const code = context.currentKey(),
      id = btn.dataset.noteDelete;
    if (!confirm('確定刪除這一則留言？這不會刪除其他留言。')) return;
    btn.disabled = true;
    window.parent.postMessage({
      type: 'KAISI_ORDER_NOTE_DELETE',
      code,
      id
    }, '*');
  });
  context.$('sendNote').addEventListener('click', () => {
    const code = context.currentKey(),
      text = context.$('noteText').value.trim();
    if (!text) return;
    if (text.length > 1000) return alert('留言最多 1000 個字');
    if (!code || code.startsWith('__') || !context.state.drafts[code]) return alert('請先儲存工作單，才能留言');
    context.$('sendNote').disabled = true;
    window.parent.postMessage({
      type: 'KAISI_ORDER_NOTE_ADD',
      code,
      text
    }, '*');
  });
  context.$('zoomClose').onclick = () => context.$('zoomDialog').close();
  context.$('zoomIn').onclick = () => {
    context.zoomScale = Math.min(4, context.zoomScale + .25);
    context.updateZoom();
  };
  context.$('zoomOut').onclick = () => {
    context.zoomScale = Math.max(.5, context.zoomScale - .25);
    context.updateZoom();
  };
  context.$('zoomReset').onclick = () => {
    context.zoomScale = 1;
    context.updateZoom();
  };
  context.$('zoomDialog').addEventListener('click', e => {
    if (e.target === context.$('zoomDialog')) context.$('zoomDialog').close();
  });
  context.$('zoomDialog').addEventListener('wheel', e => {
    if (!e.target.closest('.zoom-stage')) return;
    e.preventDefault();
    context.zoomScale = Math.min(4, Math.max(.5, context.zoomScale + (e.deltaY < 0 ? .15 : -.15)));
    context.updateZoom();
  }, {
    passive: false
  });
  context.$('viewSubmitted').onclick = () => {
    document.querySelector('[data-tab="containers"]').click();
    context.$('containerCards').scrollIntoView({block: 'start', behavior: 'instant'});
  };
  context.$('reviewWritten').onclick = () => {
    const reviewing = context.$('filter').value !== 'written';
    context.$('filter').value = reviewing ? 'written' : 'all';
    context.renderPlan();
  };
  context.$('savePlan').onclick = context.saveDraft;
  context.exportPlanButton = context.$('exportPlan');
  if (context.exportPlanButton) context.exportPlanButton.onclick = () => {
    if (!context.saveDraft()) return;
    context.exportCsv(context.currentKey());
  };
  context.$('containerCards').onclick = e => {
    let t = e.target.closest('[data-open],[data-delete],[data-csv],[data-pidate]');
    if (!t) return;
    if (t.dataset.open) {
      context.selectedWorkApplied = true;
      context.loadWork(t.dataset.open);
      document.querySelector('[data-tab="plan"]').click();
    }
    if (t.dataset.delete && context.plannerRole === 'admin') {
      const code = t.dataset.delete;
      if (confirm('確定刪除採購建議單 ' + code + '？不影響正式貨櫃及 PI。')) window.parent.postMessage({
        type: 'KAISI_ORDER_DELETE',
        code
      }, '*');
    }
    if (t.dataset.csv) context.exportCsv(t.dataset.csv);
    if (t.dataset.pidate) {
      let p = context.state.pis.find(x => x.container === t.dataset.pidate);
      if (!p) {
        alert('Tracker 同步的到倉日期請在 Container Tracker 修改');
        return;
      }
      let v = prompt(`${p.container} 預計到倉日 YYYY-MM-DD`, p.arrival || '');
      if (v !== null) {
        if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
          alert('日期格式請用 YYYY-MM-DD');
          return;
        }
        p.arrival = v;
        context.persist();
        context.renderAll();
      }
    }
  };
}
