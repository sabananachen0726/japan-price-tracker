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
    const months = this.range(end),
      coverage = months.map(m => Object.values(sources || {}).some(s => Object.hasOwn(s?.months || {}, m))),
      rows = Object.create(null),
      overlap = [];
    const boundary=this.boundaryAdjustment(sources);
    for (let i = 0; i < 6; i++) {
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
        const r = rows[code] ||= {
          gross: [0, 0, 0, 0, 0, 0],
          net: [0, 0, 0, 0, 0, 0],
          clear: [0, 0, 0, 0, 0, 0]
        };
        r.gross[i] = gross;
        r.net[i] = net;
        r.clear[i] = clear;
      }
    }
    for (const r of Object.values(rows)) {
      r.count = r.gross.filter(x => x > 0).length;
      r.total = r.net.reduce((a, b, i) => a + b - r.clear[i], 0);
      r.raw = r.count ? r.total / r.count : null;
    }
    return {
      months,
      coverage,
      rows,
      overlap,
      boundaryDate: boundary?.date || '',
      details: this.details(sources),
      complete: coverage.every(Boolean),
      end
    };
  }
};
