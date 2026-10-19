// planner: planning-events. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "planning-events",
  "owns": [{
    "name": "setArrivalDefault",
    "kind": "function"
  }],
  "imports": ["$", "autosaveLabel", "calc", "closeColumnFilter", "closePhotoPreview", "closePiTip", "columnFilters", "currentKey", "currentPhotoTrigger", "currentPiTipTrigger", "dirtyDrafts", "draft", "flushRecovery", "mergeChangingContainerKey", "openColumnKey", "openZoom", "persist", "plannerRole", "previousContainerCode", "renderAll", "renderNotes", "renderPlan", "saveCatalogPatch", "setInactive", "shelfLife", "showColumnFilter", "showExplain", "showPhotoPreview", "showPiDetails", "stageLocalDraft", "state", "tableSort", "updateDraftTotal", "updateTableHeader", "val"],
  "writes": ["previousContainerCode", "setArrivalDefault", "tableSort"]
};
export function register(context) {
  context.setArrivalDefault = function setArrivalDefault() {
    let d = new Date();
    d.setMonth(d.getMonth() + 2);
    context.$('arrival').value = d.toLocaleDateString('en-CA', {
      timeZone: 'Australia/Brisbane'
    });
  };
}
export function initialize(context) {
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('active', x === b));
    ['plan', 'containers', 'settings', 'imports', 'pending'].forEach(id => context.$(id).classList.toggle('hidden', id !== b.dataset.tab));
    context.renderAll();
  });
  context.setArrivalDefault();
  ['kind', 'arrival', 'coverage', 'search', 'filter', 'container'].forEach(id => context.$(id).addEventListener(['search', 'container', 'coverage'].includes(id) ? 'input' : 'change', () => {
    if (id === 'container') {
      const now = context.currentKey();
      context.mergeChangingContainerKey(context.previousContainerCode || '__未命名草稿__', now);
      context.previousContainerCode = now;
      if (context.plannerRole !== 'viewer' && Object.hasOwn(context.state.drafts, now)) context.stageLocalDraft();
    } else if (['kind', 'arrival', 'coverage'].includes(id) && context.plannerRole !== 'viewer') context.stageLocalDraft();
    context.renderPlan();
    if (id === 'container') {
      context.$('deleteWork').hidden = context.plannerRole !== 'admin' || !Object.hasOwn(context.state.drafts, context.currentKey()) || context.currentKey().startsWith('__');
      context.renderNotes();
    }
  }));
  context.$('plan').querySelector('.product-table thead').addEventListener('click', e => {
    const sort = e.target.closest('[data-sort]');
    if (sort) {
      const key = sort.dataset.sort;
      context.tableSort = context.tableSort.key === key ? {
        key,
        dir: context.tableSort.dir === 'asc' ? 'desc' : 'asc'
      } : {
        key,
        dir: 'asc'
      };
      context.renderPlan();
      return;
    }
    const filt = e.target.closest('[data-filter-head]');
    if (filt) context.showColumnFilter(filt.dataset.filterHead, filt);
  });
  context.$('mobileSort').addEventListener('change', () => {
    context.tableSort.key = context.$('mobileSort').value;
    context.renderPlan();
  });
  context.$('mobileSortDir').addEventListener('click', () => {
    context.tableSort.dir = context.tableSort.dir === 'asc' ? 'desc' : 'asc';
    context.renderPlan();
  });
  context.$('mobileOpenFilter').addEventListener('click', () => context.showColumnFilter(context.$('mobileFilterColumn').value, context.$('mobileOpenFilter')));
  context.$('applyColumnFilter').addEventListener('click', () => {
    const key = context.openColumnKey;
    if (!key) return;
    if (key === 'product') {
      const text = context.$('filterText').value.trim();
      if (text) context.columnFilters[key] = {
        text
      };else delete context.columnFilters[key];
    } else {
      const condition = context.$('filterCondition').value,
        min = context.$('filterMin').value,
        max = context.$('filterMax').value;
      if (['min', 'range'].includes(condition) && min === '') return alert('請填寫最小值');
      if (['max', 'range'].includes(condition) && max === '') return alert('請填寫最大值');
      if (condition === 'range' && Number(min) > Number(max)) return alert('最小值不能大於最大值');
      if (condition === 'all') delete context.columnFilters[key];else context.columnFilters[key] = {
        condition,
        min,
        max
      };
    }
    context.renderPlan();
  });
  context.$('resetColumnFilter').addEventListener('click', () => {
    if (context.openColumnKey) delete context.columnFilters[context.openColumnKey];
    context.renderPlan();
  });
  context.$('filterText').addEventListener('keydown', e => {
    if (e.key === 'Enter') context.$('applyColumnFilter').click();
  });
  document.addEventListener('pointerdown', e => {
    if (context.openColumnKey && !e.target.closest('#columnFilterTip,[data-filter-head],#mobileOpenFilter')) context.closeColumnFilter();
  });
  context.$('plan').querySelector('.product-scroll').addEventListener('scroll', () => {
    context.closeColumnFilter();
    context.updateTableHeader();
  }, {
    passive: true
  });
  window.addEventListener('resize', context.closeColumnFilter);
  context.$('productRows').addEventListener('click', e => {
    let t = e.target.closest('[data-explain],[data-use],[data-zoom],[data-inactive]');
    if (!t) return;
    if (t.dataset.explain) context.showExplain(t.dataset.explain);
    if (t.dataset.inactive) {
      context.setInactive(t.dataset.inactive);
      return;
    }
    if (t.dataset.zoom) context.openZoom(t.dataset.zoom);
    if (t.dataset.use) {
      let i = context.state.items.find(x => x.code === t.dataset.use),
        q = context.calc(i).suggest;
      if (q == null) return;
      let d = context.draft();
      d.rows[i.code] = q;
      context.state.drafts[context.currentKey()] = d;
      context.dirtyDrafts.add(context.currentKey());
      context.stageLocalDraft();
      context.flushRecovery();
      context.persist();
      context.renderPlan();
    }
  });
  context.$('productRows').addEventListener('mouseover', e => {
    const t = e.target.closest('[data-pi]');
    if (t && t !== context.currentPiTipTrigger) context.showPiDetails(t);
    const img = e.target.closest('.photo-wrap[data-zoom]');
    if (img && img !== context.currentPhotoTrigger) context.showPhotoPreview(img);
  });
  context.$('productRows').addEventListener('mouseout', e => {
    const t = e.target.closest('[data-pi]');
    if (t && t === context.currentPiTipTrigger && !t.contains(e.relatedTarget)) context.closePiTip();
    const img = e.target.closest('.photo-wrap[data-zoom]');
    if (img && img === context.currentPhotoTrigger && !img.contains(e.relatedTarget)) context.closePhotoPreview();
  });
  context.$('productRows').addEventListener('focusin', e => {
    const t = e.target.closest('[data-pi]');
    if (t) context.showPiDetails(t);
    const img = e.target.closest('.photo-wrap[data-zoom]');
    if (img) context.showPhotoPreview(img);
  });
  context.$('productRows').addEventListener('focusout', e => {
    if (e.target.closest('[data-pi]')) context.closePiTip();
    if (e.target.closest('.photo-wrap[data-zoom]')) context.closePhotoPreview();
  });
  context.$('productRows').addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-zoom]')) {
      e.preventDefault();
      context.openZoom(e.target.dataset.zoom);
    }
    if (e.key === 'Escape') {
      context.closePiTip();
      context.closePhotoPreview();
      context.closeColumnFilter();
    }
  });
  context.$('productRows').addEventListener('scroll', context.closePiTip);
  context.$('plan').querySelector('.product-scroll').addEventListener('scroll', context.closePiTip, {
    passive: true
  });
  context.$('plan').querySelector('.product-scroll').addEventListener('scroll', context.closePhotoPreview, {
    passive: true
  });
  window.addEventListener('resize', context.closePiTip);
  window.addEventListener('resize', context.closePhotoPreview);
  // Record quantity on INPUT as well as CHANGE, so accidental tab close does not lose typing.

  context.$('productRows').addEventListener('input', e => {
    const t = e.target;
    if (context.plannerRole === 'viewer') return;
    if (t.dataset.itemNote) {
      const d = context.state.drafts[context.currentKey()] || context.draft();
      d.itemNotes ||= {};
      if (t.value.trim()) d.itemNotes[t.dataset.itemNote] = t.value.slice(0, 250);else delete d.itemNotes[t.dataset.itemNote];
      context.state.drafts[context.currentKey()] = d;
      context.stageLocalDraft();
      return;
    }
    if (t.dataset.qty) {
      const raw = t.value.trim(),
        n = raw === '' ? 0 : Number(raw);
      if (Number.isInteger(n) && n >= 0) {
        const d = context.state.drafts[context.currentKey()] || context.draft();
        d.rows ||= {};
        d.rows[t.dataset.qty] = n;
        context.state.drafts[context.currentKey()] = d;
        context.stageLocalDraft();
        context.updateDraftTotal();
      } else context.autosaveLabel('⚠ 請輸入非負整數後才會暫存這個數量', 'warn');
    }
  });
  // Flush small recovery immediately when editing ends (in addition to 400ms typing debounce).

  context.$('productRows').addEventListener('focusout', e => {
    if (e.target.matches('[data-item-note],[data-qty]')) context.flushRecovery();
  });
  context.$('productRows').addEventListener('change', e => {
    let t = e.target;
    if (t.dataset.shelf) {
      if (context.plannerRole === 'viewer') {
        context.renderPlan();
        return;
      }
      const code = t.dataset.shelf,
        raw = t.value.trim(),
        months = raw === '' ? null : Number(raw);
      if (months !== null && (!Number.isInteger(months) || months < 1 || months > 120)) {
        alert('保存期限請填寫 1～120 的整數（月），或留空表示未設定');
        context.renderPlan();
        return;
      }
      const i = context.state.items.find(x => x.code === code);
      if (i && context.shelfLife(i) !== months) context.saveCatalogPatch({
        overrides: {
          [code]: {
            shelfLifeMonths: months
          }
        }
      });
      return;
    }
    if (t.dataset.safety) {
      const code = t.dataset.safety;
      const raw = t.value.trim();
      const n = raw === '' ? null : Number(raw);
      if (n !== null && (!Number.isInteger(n) || n < 0)) {
        alert('安全庫存必須是非負整數');
        context.renderPlan();
        return;
      }
      if (context.val(context.state.items.find(i => i.code === code), 'safety') !== n) context.saveCatalogPatch({
        overrides: {
          [code]: {
            safety: n
          }
        }
      });
      return;
    }
    if (!t.dataset.qty) return;
    let n = +t.value;
    if (!Number.isInteger(n) || n < 0) {
      alert('請輸入非負整數箱數');
      context.renderPlan();
      return;
    }
    let d = context.draft();
    d.rows[t.dataset.qty] = n;
    context.state.drafts[context.currentKey()] = d;
    context.dirtyDrafts.add(context.currentKey());
    context.stageLocalDraft();
    context.flushRecovery();
    context.persist();
    context.updateDraftTotal();
  });
}
