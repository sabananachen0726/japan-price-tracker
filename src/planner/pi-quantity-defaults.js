const normalize = value => String(value ?? '').trim().toUpperCase();
// Rebuild only when the host sends a new PI snapshot; never mutate PI or saved work.
export function createPiQuantityLookup() {
  let previousSource;
  let byContainer = new Map();
  return (source, container) => {
    if (source !== previousSource) {
      previousSource = source;
      byContainer = new Map();
      for (const pi of source || []) {
        const key = normalize(pi.container);
        if (!key) continue;
        const rows = {};
        for (const row of pi.received ? [] : pi.rows || []) {
          const code = normalize(row.code);
          const qty = Number(row.qty);
          if (!code || code.startsWith('__') || !Number.isFinite(qty) || qty <= 0) continue;
          rows[code] = (rows[code] || 0) + qty;
        }
        byContainer.set(key, rows);
      }
    }
    return byContainer.get(normalize(container)) || {};
  };
}
export function applyPiQuantityDefaults(work, piRows) {
  return {...work, rows:{...piRows, ...(work.rows || {})}};
}
