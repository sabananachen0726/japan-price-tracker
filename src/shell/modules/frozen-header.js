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
          const resize = document.createElement('span');
          resize.className = 'frozen-resizer';
          resize.dataset.resizeColumn = key;
          resize.tabIndex = 0;
          resize.setAttribute('role','separator');
          resize.setAttribute('aria-orientation','vertical');
          resize.setAttribute('aria-label','調整'+labels[i]+'欄寬');
          resize.title = '拖曳調整欄寬；方向鍵微調';
          div.appendChild(resize);
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
  context.frozenHeader.addEventListener('pointerdown', e => {
    const handle = e.target.closest('[data-resize-column]');
    if (!handle) return;
    e.preventDefault(); e.stopPropagation();
    const column = handle.dataset.resizeColumn, x = e.clientX, width = handle.parentElement.getBoundingClientRect().width;
    const frame = document.getElementById('plannerFrame');
    document.body.classList.add('resizing-column');
    const move = event => frame?.contentWindow?.postMessage({type:'KAISI_COLUMN_RESIZE',column,width:width+event.clientX-x},'*');
    const finish = () => {window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',finish,true);window.removeEventListener('pointercancel',finish,true);document.body.classList.remove('resizing-column');context.updateFrozenHeader()};
    window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',finish,true);window.addEventListener('pointercancel',finish,true);
  });
  context.frozenHeader.addEventListener('keydown', e => {
    const handle=e.target.closest('[data-resize-column]');if(!handle||!['ArrowLeft','ArrowRight'].includes(e.key))return;
    e.preventDefault();e.stopPropagation();
    document.getElementById('plannerFrame')?.contentWindow?.postMessage({type:'KAISI_COLUMN_RESIZE',column:handle.dataset.resizeColumn,width:handle.parentElement.getBoundingClientRect().width+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?30:10)},'*');
  });
  context.frozenHeader.addEventListener('click', e => {
    if(e.target.closest('[data-resize-column]')){e.preventDefault();e.stopPropagation();return;}
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
