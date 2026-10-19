export const SalesCore = {
  restrict(source, allowed) {
    return {
      ...source,
      scope: 'planner-items-v1',
      months: Object.fromEntries(Object.entries(source.months || {}).map(([m, rows]) => [m, rows.filter(r => allowed.has(r[0]))]))
    };
  },
  monthShift(month, n) {
    const [y, m] = month.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
  },
  range(end) {
    return Array.from({
      length: 6
    }, (_, i) => this.monthShift(end, i - 5));
  },
  defaultEnd(sources, now) {
    const latest = Object.values(sources || {}).map(s => s?.stats?.maxDate || '').sort().at(-1) || '';
    const previous = this.monthShift(now.slice(0, 7), -1);
    if (!latest) return previous;
    const month = latest.slice(0, 7);
    return month < previous ? month : previous;
  },
  mergeSource(previous, next) {
    const months = {
      ...(previous?.months || {})
    };
    const keys = Object.keys(next.months).sort();
    const lo = keys[0],
      hi = keys.at(-1);
    for (const m of Object.keys(months)) if (m >= lo && m <= hi) delete months[m];
    Object.assign(months, next.months);
    return {
      ...next,
      months,
      stats: {
        ...next.stats,
        minDate: [previous?.stats?.minDate, next.stats.minDate].filter(Boolean).sort()[0],
        maxDate: [previous?.stats?.maxDate, next.stats.maxDate].filter(Boolean).sort().at(-1)
      }
    };
  },
  summarize(sources, end, allowed = null) {
    const months = this.range(end),
      coverage = months.map(m => Object.values(sources || {}).some(s => Object.hasOwn(s?.months || {}, m))),
      rows = Object.create(null),
      overlap = [];
    for (let i = 0; i < 6; i++) {
      const m = months[i],
        h = sources.history?.months?.[m],
        c = sources.current?.months?.[m];
      if (h && c) overlap.push(m);
      for (const [code, gross, net] of c || h || []) {
        if (allowed && !allowed.has(code)) continue;
        const r = rows[code] ||= {
          gross: [0, 0, 0, 0, 0, 0],
          net: [0, 0, 0, 0, 0, 0]
        };
        r.gross[i] = gross;
        r.net[i] = net;
      }
    }
    for (const r of Object.values(rows)) {
      r.count = r.gross.filter(x => x > 0).length;
      r.total = r.net.reduce((a, b) => a + b, 0);
      r.raw = r.count ? r.total / r.count : null;
    }
    return {
      months,
      coverage,
      rows,
      overlap,
      complete: coverage.every(Boolean),
      end
    };
  }
};
