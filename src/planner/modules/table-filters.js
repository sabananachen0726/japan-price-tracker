// planner: table-filters. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "table-filters",
  "owns": [{
    "name": "SORT_FIELDS",
    "kind": "const"
  }, {
    "name": "tableSort",
    "kind": "let"
  }, {
    "name": "columnFilters",
    "kind": "let"
  }, {
    "name": "openColumnKey",
    "kind": "let"
  }, {
    "name": "columnValue",
    "kind": "function"
  }, {
    "name": "passesColumnFilters",
    "kind": "function"
  }, {
    "name": "sortRows",
    "kind": "function"
  }, {
    "name": "renderSortMarks",
    "kind": "function"
  }, {
    "name": "closeColumnFilter",
    "kind": "function"
  }, {
    "name": "showColumnFilter",
    "kind": "function"
  }],
  "imports": ["$", "shelfLife"],
  "writes": ["SORT_FIELDS", "closeColumnFilter", "columnFilters", "columnValue", "openColumnKey", "passesColumnFilters", "renderSortMarks", "showColumnFilter", "sortRows", "tableSort"]
};
export function register(context) {
  context.columnValue = function columnValue(row, key) {
    const {
      i,
      c,
      chosen
    } = row;
    switch (key) {
      case 'product':
        return `${i.code} ${i.name}`;
      case 'myob':
        return typeof i.stock === 'number' ? i.stock : null;
      case 'purchase':
        return c.stock;
      case 'monthly':
        return c.monthly;
      case 'pi':
        return c.available;
      case 'safety':
        return c.safety;
      case 'shelf':
        return context.shelfLife(i);
      case 'suggest':
        return c.suggest;
      case 'qty':
        return chosen;
      default:
        return null;
    }
  };
  context.passesColumnFilters = function passesColumnFilters(row) {
    for (const [key, f] of Object.entries(context.columnFilters)) {
      const v = context.columnValue(row, key);
      if (key === 'product') {
        if (f.text && !String(v).toLowerCase().includes(f.text.toLowerCase())) return false;
        continue;
      }
      const value = Number(v),
        numeric = v !== null && v !== undefined && v !== '' && Number.isFinite(value);
      switch (f.condition) {
        case 'positive':
          if (!numeric || value <= 0) return false;
          break;
        case 'zero':
          if (!numeric || value !== 0) return false;
          break;
        case 'empty':
          if (numeric) return false;
          break;
        case 'min':
          if (!numeric || value < Number(f.min)) return false;
          break;
        case 'max':
          if (!numeric || value > Number(f.max)) return false;
          break;
        case 'range':
          if (!numeric || value < Number(f.min) || value > Number(f.max)) return false;
          break;
      }
    }
    return true;
  };
  context.sortRows = function sortRows(rows) {
    const key = context.tableSort.key;
    if (key === 'default') {
      rows.sort((a, b) => (b.chosen > 0) - (a.chosen > 0) || (b.c.suggest > 0) - (a.c.suggest > 0) || a.i.code.localeCompare(b.i.code));
      return;
    }
    const dir = context.tableSort.dir === 'desc' ? -1 : 1;
    rows.sort((a, b) => {
      let x = context.columnValue(a, key),
        y = context.columnValue(b, key);
      if (x == null && y != null) return 1;
      if (y == null && x != null) return -1;
      let result = key === 'product' ? String(x).localeCompare(String(y), 'zh-Hant', {
        numeric: true
      }) : Number(x) - Number(y);
      return (result || a.i.code.localeCompare(b.i.code)) * dir;
    });
  };
  context.renderSortMarks = function renderSortMarks() {
    document.querySelectorAll('[data-sort-mark]').forEach(el => el.textContent = context.tableSort.key === el.dataset.sortMark ? context.tableSort.dir === 'asc' ? '↑' : '↓' : '↕');
    document.querySelectorAll('[data-filter-head]').forEach(el => el.classList.toggle('is-filtered', Object.hasOwn(context.columnFilters, el.dataset.filterHead)));
    context.$('mobileSort').value = context.tableSort.key;
    context.$('mobileSortDir').textContent = context.tableSort.dir === 'asc' ? '升序 ↑' : '降序 ↓';
  };
  context.closeColumnFilter = function closeColumnFilter() {
    const tip = context.$('columnFilterTip');
    tip.classList.remove('visible');
    tip.setAttribute('aria-hidden', 'true');
    context.openColumnKey = '';
  };
  context.showColumnFilter = function showColumnFilter(key, anchor) {
    context.closeColumnFilter();
    if (!Object.hasOwn(context.SORT_FIELDS, key)) return;
    context.openColumnKey = key;
    const f = context.columnFilters[key] || {};
    context.$('filterTipTitle').textContent = '篩選：' + context.SORT_FIELDS[key];
    context.$('filterTextLabel').hidden = key !== 'product';
    context.$('filterNumberFields').hidden = key === 'product';
    context.$('filterText').value = f.text || '';
    context.$('filterCondition').value = f.condition || 'all';
    context.$('filterMin').value = f.min ?? '';
    context.$('filterMax').value = f.max ?? '';
    const tip = context.$('columnFilterTip');
    tip.classList.add('visible');
    tip.setAttribute('aria-hidden', 'false');
    const r = anchor.getBoundingClientRect(),
      width = tip.getBoundingClientRect().width,
      height = tip.getBoundingClientRect().height;
    tip.style.left = Math.max(10, Math.min(r.left, window.innerWidth - width - 10)) + 'px';
    tip.style.top = (r.bottom + 6 + height < window.innerHeight ? r.bottom + 6 : Math.max(8, r.top - height - 6)) + 'px';
  };
}
export function initialize(context) {
  context.SORT_FIELDS = {
    product: '商品',
    myob: 'MYOB 庫存',
    purchase: '採購庫存',
    monthly: '月銷',
    pi: '在途可用庫存',
    safety: '安全庫存',
    shelf: '保存期限（月）',
    suggest: '建議',
    qty: '本櫃訂量'
  };
  context.tableSort = {
    key: 'default',
    dir: 'asc'
  };
  context.columnFilters = {};
  context.openColumnKey = '';
}
