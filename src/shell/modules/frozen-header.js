// shell: frozen-header. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "frozen-header",
  "owns": [{
    "name": "frozenHeader",
    "kind": "const"
  }, {
    "name": "frozenScheduled",
    "kind": "let"
  }, {
    "name": "frozenSignature",
    "kind": "let"
  }, {
    "name": "updateFrozenHeader",
    "kind": "function"
  }],
  "imports": ["auth", "plannerLoaded"],
  "writes": ["frozenHeader", "frozenScheduled", "frozenSignature", "updateFrozenHeader"]
};
export function register(context) {
  context.updateFrozenHeader = function updateFrozenHeader() {
    if (context.frozenScheduled) return;
    context.frozenScheduled = true;
    requestAnimationFrame(() => {
      context.frozenScheduled = false;
      const frame = document.getElementById('plannerFrame');
      if (!frame || !context.plannerLoaded || !context.auth.currentUser || window.innerWidth <= 1050 || !document.getElementById('planner-tab')?.classList.contains('active')) {
        context.frozenHeader.classList.remove('visible');
        return;
      }
      let table, th;
      try {
        table = frame.contentDocument?.querySelector('#plan:not(.hidden) .product-table');
        th = table?.tHead?.rows[0]?.cells;
      } catch {}
      if (!table || !th?.length) {
        context.frozenHeader.classList.remove('visible');
        return;
      }
      const fr = frame.getBoundingClientRect(),
        tr = table.getBoundingClientRect();
      const top = fr.top + tr.top,
        bottom = fr.top + tr.bottom,
        headHeight = Math.max(35, table.tHead.getBoundingClientRect().height);
      if (top >= 0 || bottom <= headHeight || fr.bottom <= headHeight) {
        context.frozenHeader.classList.remove('visible');
        return;
      }
      th = Array.from(th).filter(c => c.getBoundingClientRect().width > 0);
      const scroller = table.closest('.product-scroll'),
        sr = scroller.getBoundingClientRect();
      const widths = Array.from(th, c => c.getBoundingClientRect().width);
      const labels = Array.from(th, c => c.querySelector('.sort-head')?.textContent || c.textContent || '');
      const filters = Array.from(th, c => c.querySelector('.filter-head')?.classList.contains('is-filtered'));
      const keys = Array.from(th, c => c.dataset.column || '');
      const sig = JSON.stringify([widths.map(x => Math.round(x * 10) / 10), labels, filters, keys]);
      if (sig !== context.frozenSignature) {
        context.frozenSignature = sig;
        context.frozenHeader.replaceChildren(...keys.map((key, i) => {
          const div = document.createElement('div');
          div.className = 'frozen-column';
          div.style.flex = `0 0 ${widths[i]}px`;
          div.style.width = widths[i] + 'px';
          if (!key) {
            div.textContent = labels[i];
            return div;
          }
          const sort = document.createElement('button');
          sort.type = 'button';
          sort.dataset.frozenSort = key;
          sort.textContent = labels[i];
          sort.title = '按此切換升序／降序';
          div.appendChild(sort);
          const filter = document.createElement('button');
          filter.type = 'button';
          filter.dataset.frozenFilter = key;
          filter.textContent = filters[i] ? '▼' : '▽';
          filter.title = '篩選這個欄位';
          div.appendChild(filter);
          return div;
        }));
      }
      context.frozenHeader.style.left = fr.left + sr.left + 'px';
      context.frozenHeader.style.width = scroller.clientWidth + 'px';
      context.frozenHeader.style.height = headHeight + 'px';
      context.frozenHeader.querySelectorAll('.frozen-column').forEach(c => c.style.transform = `translateX(-${scroller.scrollLeft}px)`);
      context.frozenHeader.classList.add('visible');
    });
  };
}
export function initialize(context) {
  context.frozenHeader = document.getElementById('kaisiFrozenPlannerHead');
  context.frozenScheduled = false;
  context.frozenSignature = '';
  context.frozenHeader.addEventListener('click', e => {
    const target = e.target.closest('[data-frozen-sort],[data-frozen-filter]');
    if (!target) return;
    const frame = document.getElementById('plannerFrame'),
      key = target.dataset.frozenSort || target.dataset.frozenFilter;
    if (!frame?.contentWindow || !key) return;
    if (target.dataset.frozenSort) {
      frame.contentDocument?.querySelector(`[data-sort="${key}"]`)?.click();
      context.updateFrozenHeader();
    } else {
      const button = target.getBoundingClientRect(),
        fr = frame.getBoundingClientRect();
      frame.contentWindow.postMessage({
        type: 'KAISI_FROZEN_FILTER',
        column: key,
        left: button.left - fr.left,
        top: Math.max(0, -fr.top + button.bottom + 5)
      }, '*');
    }
  });
  window.addEventListener('scroll', context.updateFrozenHeader, {
    passive: true
  });
  window.addEventListener('resize', () => {
    context.frozenSignature = '';
    context.updateFrozenHeader();
  }, {
    passive: true
  });
  window.addEventListener('load', context.updateFrozenHeader);
  document.addEventListener('shown.bs.tab', context.updateFrozenHeader);
}
