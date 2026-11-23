export const SalesCore = {
  restrict(source, allowed) {
    return {
      ...source,
      scope: 'planner-items-v1',
      lastSales: Object.fromEntries(Object.entries(source.lastSales || {}).filter(([code])=>allowed.has(code))),
      basePrices: Object.fromEntries(Object.entries(source.basePrices || {}).filter(([code])=>allowed.has(code))),
      daily: Object.fromEntries(Object.entries(source.daily || {}).map(([date, rows])=>[date,rows.filter(([code])=>allowed.has(code))])),
      edges: Object.fromEntries(Object.entries(source.edges || {}).map(([date, rows])=>[date,rows.filter(([,code])=>allowed.has(code))])),
      months: Object.fromEntries(Object.entries(source.months || {}).map(([m, rows]) => [m, rows.filter(r => allowed.has(r[0]))]))
    };
  },
  monthShift(month, n) {
    const [y, m] = month.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
  },
  // The averaging window: six months ending on the cutoff date, e.g. 2026-05-11～2026-11-10.
  // A bare month (legacy "YYYY-MM") means that month's last day, i.e. six whole months.
  endDate(end) {
    const text = String(end || '');
    if (/^\d{4}-\d{2}$/.test(text)) { const [y, m] = text.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); }
    return text.slice(0, 10);
  },
  windowStart(end) {
    const [y, m, d] = this.endDate(end).split('-').map(Number);
    const last = new Date(Date.UTC(y, m - 6, 0)).getUTCDate();  // days in the month six back
    const back = Date.UTC(y, m - 7, Math.min(d, last));
    // When the cutoff is a month's last day, the window is six whole months.
    const monthEnd = new Date(Date.UTC(y, m, 0)).getUTCDate() === d;
    return new Date(monthEnd ? Date.UTC(y, m - 6, 1) : back + 86400000).toISOString().slice(0, 10);
  },
  range(end) {
    const start = this.windowStart(end).slice(0, 7), last = this.endDate(end).slice(0, 7), out = [];
    for (let m = start; m <= last; m = this.monthShift(m, 1)) out.push(m);
    return out;
  },
  // Default cutoff: the last day the sales files cover (never in the future).
  defaultEnd(sources, now) {
    const latest = Object.values(sources || {}).map(s => s?.stats?.maxDate || '').sort().at(-1) || '';
    const today = String(now || '').slice(0, 10);
    if (!latest) return new Date(Date.parse(today + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
    return latest < today ? latest : today;
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
    const minDate=[previous?.stats?.minDate,next.stats.minDate].filter(Boolean).sort()[0];
    const maxDate=[previous?.stats?.maxDate,next.stats.maxDate].filter(Boolean).sort().at(-1);
    const lastSales={...next.lastSales};
    for(const [code,date] of Object.entries(previous?.lastSales||{}))
      if((date.slice(0,7)<lo || date.slice(0,7)>hi) && (!lastSales[code]||lastSales[code]<date))lastSales[code]=date;
    const daily={...next.daily};
    const firstDaily=this.monthShift(maxDate.slice(0,7),-3)+'-01';
    for(const [date,rows] of Object.entries(previous?.daily||{}))
      if(date>=firstDaily&&(date.slice(0,7)<lo||date.slice(0,7)>hi))daily[date]=rows;
    for(const date of Object.keys(daily))if(date<firstDaily)delete daily[date];
    const edges={};
    for(const date of [minDate,maxDate]){
      const rows=next.edges?.[date] ?? ((date.slice(0,7)<lo||date.slice(0,7)>hi)?previous?.edges?.[date]:undefined);
      if(rows)edges[date]=rows;
    }
    return {
      ...next,
      months,lastSales,daily,edges,
      stats: {
        ...next.stats,
        minDate,maxDate
      }
    };
  },
  boundaryAdjustment(sources) {
    const h=sources.history,c=sources.current, date=h?.stats?.maxDate;
    if(!date||c?.stats?.minDate!==date||!h.edges?.[date]||!c.edges?.[date])return null;
    const counts=new Map(), totals=new Map();
    for(const [id,code,qty] of c.edges[date]){
      const key=JSON.stringify([id,code,qty]); counts.set(key,(counts.get(key)||0)+1);
    }
    for(const [id,code,qty,clear] of h.edges[date]){
      const key=JSON.stringify([id,code,qty]), n=counts.get(key)||0;
      if(!n)continue;
      counts.set(key,n-1);
      const a=totals.get(code)||[0,0,0];
      a[0]+=Math.max(0,qty);a[1]+=qty;a[2]+=clear;totals.set(code,a);
    }
    return {date,totals};
  },
  details(sources) {
    const cutoff=Object.values(sources).map(s=>s?.stats?.maxDate||'').sort().at(-1)||'';
    const lastSales={}, clearance={};
    for(const s of Object.values(sources))for(const [code,date] of Object.entries(s.lastSales||{}))
      if(!lastSales[code]||lastSales[code]<date)lastSales[code]=date;
    if(!cutoff)return {cutoff,lastSales,clearance,series:{},daily:{},dailyStart:''};
    // Batch-based clearance needs every month (positive qty, clearance qty) plus the
    // recent daily detail; the latest source wins for months both files cover.
    const series={}, daily={};
    const monthKeys=new Set(Object.values(sources).flatMap(s=>Object.keys(s?.months||{})));
    for(const m of monthKeys){
      const rows=sources.current?.months?.[m]||sources.history?.months?.[m]||[];
      for(const [code,gross,,clear=0] of rows){const a=(series[code]||={})[m]||=[0,0];a[0]+=gross;a[1]+=clear;}
    }
    let dailyStart='';
    for(const [slot,s] of Object.entries(sources))for(const [date,rows] of Object.entries(s.daily||{})){
      if(slot==='history'&&sources.current?.months?.[date.slice(0,7)])continue;
      if(!dailyStart||date<dailyStart)dailyStart=date;
      for(const [code,gross,clear] of rows){const a=(daily[code]||={})[date]||=[0,0];a[0]+=gross;a[1]+=clear;}
    }
    // Daily detail starts on the first day of its first month; earlier days come from months.
    if(dailyStart)dailyStart=dailyStart.slice(0,7)+'-01';
    const month=this.monthShift(cutoff.slice(0,7),-3), next=this.monthShift(month,1),
      lastDay=new Date(Date.parse(next+'-01')-86400000).getUTCDate(),
      start=month+'-'+String(Math.min(lastDay,+cutoff.slice(8,10))).padStart(2,'0');
    const boundary=this.boundaryAdjustment(sources), current=sources.current;
    for(const [slot,s] of Object.entries(sources))for(const [date,rows] of Object.entries(s.daily||{})){
      if(date<start||date>cutoff||slot==='history'&&date!==boundary?.date&&current?.months?.[date.slice(0,7)])continue;
      for(const [code,gross,clear] of rows){
        const a=clearance[code]||=[0,0], d=slot==='history'&&date===boundary?.date?boundary.totals.get(code):null;
        a[0]+=gross-(d?.[0]||0); a[1]+=clear-(d?.[2]||0);
      }
    }
    return {cutoff,lastSales,clearance,clearanceStart:start,series,daily,dailyStart};
  },
  summarize(sources, end, allowed = null) {
    end = this.endDate(end);
    const start = this.windowStart(end), months = this.range(end), n = months.length,
      coverage = months.map(m => Object.values(sources || {}).some(s => Object.hasOwn(s?.months || {}, m))),
      rows = Object.create(null),
      overlap = [];
    const dataStart = Object.values(sources || {}).map(s => s?.stats?.minDate || '').filter(Boolean).sort()[0] || '';
    const dataEnd = Object.values(sources || {}).map(s => s?.stats?.maxDate || '').filter(Boolean).sort().at(-1) || '';
    const day = d => Date.parse(d + 'T00:00:00Z') / 86400000;
    const span = (a, b) => b < a ? 0 : day(b) - day(a) + 1;
    const max = (...v) => v.filter(Boolean).sort().at(-1), min = (...v) => v.filter(Boolean).sort()[0];
    // Per month: how much of it lies in the window (weight, in months) and what share
    // of that month's recorded sales belongs to the window. Partial edge months count
    // by days; a month's totals only cover the days the files contain.
    const parts = months.map(m => {
      const first = m + '-01', last = new Date(Date.parse(this.monthShift(m, 1) + '-01T00:00:00Z') - 86400000).toISOString().slice(0, 10);
      const days = span(first, last);
      const covered = span(max(first, dataStart), min(last, dataEnd));
      const inWindow = span(max(first, start, dataStart), min(last, end, dataEnd));
      return {month: m, days, covered, inWindow, weight: inWindow / days, share: covered ? inWindow / covered : 0};
    });
    const boundary=this.boundaryAdjustment(sources);
    for (let i = 0; i < n; i++) {
      const m = months[i],
        h = sources.history?.months?.[m],
        c = sources.current?.months?.[m];
      if (h && c) overlap.push(m);
      const bridge = h && c && boundary?.date.startsWith(m);
      const sums = new Map();
      for (const [code,gross,net,clear=0] of bridge ? [...h,...c] : c || h || []) {
        const a=sums.get(code)||[0,0,0];a[0]+=gross;a[1]+=net;a[2]+=clear;sums.set(code,a);
      }
      for (const [code, a] of sums) {
        const d=bridge?boundary.totals.get(code):null;
        const gross=a[0]-(d?.[0]||0),net=a[1]-(d?.[1]||0),clear=a[2]-(d?.[2]||0);
        if (allowed && !allowed.has(code)) continue;
        const r = rows[code] ||= {gross: Array(n).fill(0), net: Array(n).fill(0), clear: Array(n).fill(0)};
        r.gross[i] = gross;
        r.net[i] = net;
        r.clear[i] = clear;
      }
    }
    // Average = window sales (clearance excluded) ÷ months with shipments, both by days.
    for (const r of Object.values(rows)) {
      r.count = parts.reduce((a, p, i) => a + (r.gross[i] > 0 ? p.weight : 0), 0);
      r.total = parts.reduce((a, p, i) => a + (r.net[i] - r.clear[i]) * p.share, 0);
      r.raw = r.count > 1e-9 ? r.total / r.count : null;
    }
    return {
      months,
      coverage,
      parts,
      start,
      rows,
      overlap,
      boundaryDate: boundary?.date || '',
      details: this.details(sources),
      complete: coverage.every(Boolean) && (!dataStart || dataStart <= start) && (!dataEnd || dataEnd >= end),
      end
    };
  }
};
