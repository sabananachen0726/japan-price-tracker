export function salesImportWorker() {
  let allowedCodes = new Set(), basePrices = {};
  const EXCLUDED = new Set(['KAISI (MEL)PTY LTD', 'KAISI (MEL) PTY LTD', 'KAISI AUSTRALIA HOLDINGS PTY LTD']);
  const norm = s => String(s ?? '').trim();
  const customer = s => norm(s).replace(/\s+/g, ' ').toUpperCase();
  const safeCode = s => {
    s = norm(s).toUpperCase();
    return s && s.length <= 100 && !/^[=+@]/.test(s) && !/[\u0000-\u001f]/.test(s) && !['__PROTO__', 'CONSTRUCTOR', 'PROTOTYPE'].includes(s) ? s : null;
  };
  function day(v, date1904 = false) {
    if (typeof v === 'number') return new Date(Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10);
    const s = norm(v);
    let m = s.match(/^(\d{4})-(\d\d)-(\d\d)(?:$|[ T])/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : null;
  }
  function validDay(s) {
    if (!s || s < '2000-01-01' || s > '2100-12-31') return false;
    return new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;
  }
  function accumulator(label, date1904 = false) {
    let header = null,
      ix = null,
      n = 0;
    const months = Object.create(null), daily = new Map(), edges = new Map(), lastSales = Object.create(null),
      seenCodes = new Set();
    const stats = {
      rows: 0,
      excluded: 0,
      negative: 0,
      invalid: 0,
      scopeSkipped: 0,
      minDate: '',
      maxDate: '',
      examples: []
    };
    const bad = (row, message) => {
      stats.invalid++;
      if (stats.examples.length < 15) stats.examples.push(`第 ${row} 列：${message}`);
    };
    function add(row) {
      n++;
      if (!row.some(x => norm(x))) return;
      if (!header) {
        header = row.map(x => norm(x).replace(/^\uFEFF/, '').toLowerCase());
        ix = Object.fromEntries(['date', 'number', 'customer.name', 'itemno', 'qty'].map(k => [k, header.indexOf(k)]));
        if (Object.values(ix).some(x => x < 0)) throw Error(label + ' 缺少 Date / Number / Customer.Name / ItemNo / Qty 欄位');
        for (const name of ['price','disc%','lines.total','lines.description','customerpurchaseordernumber']) ix[name] = header.indexOf(name);
        return;
      }
      const rawCode = row[ix.itemno],
        code = safeCode(rawCode),
        date = day(row[ix.date], date1904),
        rawQty = norm(row[ix.qty]);
      if (!code) {
        if (norm(rawCode)) bad(n, '品號無效');
        return;
      }
      if (!validDay(date)) {
        bad(n, '日期無效');
        return;
      }
      stats.rows++;
      stats.minDate = !stats.minDate || date < stats.minDate ? date : stats.minDate;
      stats.maxDate = date > stats.maxDate ? date : stats.maxDate;
      const month = date.slice(0, 7),
        table = months[month] ||= Object.create(null);
      if (!allowedCodes.has(code)) {
        stats.scopeSkipped++;
        return;
      }
      const qty = Number(rawQty.replace(/,/g, ''));
      if (rawQty === '' || !Number.isFinite(qty) || Math.abs(qty) > 1e9) {
        bad(n, '數量無效');
        return;
      }
      seenCodes.add(code);
      if (EXCLUDED.has(customer(row[ix['customer.name']]))) {
        stats.excluded++;
        return;
      }
      const price = +norm(row[ix.price]).replace(/,/g,''), discount = +norm(row[ix['disc%']]),
        total = norm(row[ix['lines.total']]), base = basePrices[code];
      const unitPrice = norm(row[ix.price]) && price > 0 && norm(row[ix['disc%']]) && discount >= 0 && discount <= 100
        ? price * (1 - discount / 100) : total && Number.isFinite(+total.replace(/,/g,'')) && +total.replace(/,/g,'') > 0 && qty > 0 ? +total.replace(/,/g,'') / qty : null;
      const clear = qty > 0 && base > 0 && unitPrice !== null && unitPrice > 0 && unitPrice <= base * .7 + 1e-9 ? qty : 0;
      const rec = table[code] ||= [0, 0, 0];
      rec[0] += Math.max(0, qty);
      rec[1] += qty;
      rec[2] += clear;
      for (const k of edges.keys()) if (k !== stats.minDate && k !== stats.maxDate) edges.delete(k);
      if (date === stats.minDate || date === stats.maxDate) {
        if (!edges.has(date)) edges.set(date, []);
        const value = JSON.stringify([norm(row[ix.number]).replace(/^0+(?=\d)/,''), customer(row[ix['customer.name']]), code, qty, price, discount, Number(total.replace(/,/g,''))]);
        let a=2166136261,b=5381;
        for(let i=0;i<value.length;i++){a=Math.imul(a^value.charCodeAt(i),16777619);b=Math.imul(b,33)^value.charCodeAt(i);}
        edges.get(date).push([(a>>>0).toString(36)+'-'+(b>>>0).toString(36),code,qty,clear]);
      }
      if (qty > 0) {
        if (!lastSales[code] || lastSales[code] < date) lastSales[code] = date;
        const newest = stats.maxDate.slice(0,7).split('-').map(Number);
        const lower = new Date(Date.UTC(newest[0],newest[1]-4,1)).toISOString().slice(0,10);
        if (date >= lower) {
          if (!daily.has(date)) daily.set(date,new Map());
          const byCode = daily.get(date), d = byCode.get(code) || [0,0];
          d[0]+=qty; d[1]+=clear; byCode.set(code,d);
        }
        if(daily.size>124) for(const key of daily.keys()) if(key<lower) daily.delete(key);
      }
      if (qty < 0) stats.negative++;
      if (stats.rows % 50000 === 0) self.postMessage({
        type: 'progress',
        message: label + '：已處理 ' + stats.rows.toLocaleString() + ' 筆'
      });
    }
    function finish() {
      if (!header || !stats.rows) throw Error(label + ' 沒有可用銷售資料');
      if (stats.invalid) throw Error(label + ' 有 ' + stats.invalid + ' 筆日期／數量／品號錯誤，為免月銷少算，請修正再匯入。\n' + stats.examples.join('\n'));
      const result = {};
      for (const [month, t] of Object.entries(months)) result[month] = Object.entries(t).map(([c, v]) => [c, Math.round(v[0] * 1e8) / 1e8, Math.round(v[1] * 1e8) / 1e8, Math.round(v[2] * 1e8) / 1e8]);
      return {
        months: result,
        stats,
        codes: seenCodes.size,
        edges: Object.fromEntries([...new Set([stats.minDate,stats.maxDate])].map(date=>[date,edges.get(date)||[]])),
        daily: Object.fromEntries([...daily].map(([date, entries])=>[date,[...entries].map(([code,[qty,clear]])=>[code,qty,clear])])),
        lastSales,
        priced: Object.keys(basePrices).length > 0,
        enriched: true
      };
    }
    return {
      add,
      finish
    };
  }
  async function csv(file) {
    const agg = accumulator(file.name);
    let stream = file.stream();
    if (/\.gz$/i.test(file.name)) {
      if (typeof DecompressionStream === 'undefined') throw Error('此瀏覽器不支援 gzip，請改用 Chrome／Edge 或先解壓縮成 CSV');
      stream = stream.pipeThrough(new DecompressionStream('gzip'));
    }
    const reader = stream.pipeThrough(new TextDecoderStream('utf-8', {
      fatal: true
    })).getReader();
    let field = '',
      row = [],
      quoted = false,
      quotePending = false,
      skipLF = false;
    function endField() {
      row.push(field);
      field = '';
    }
    function endRow() {
      endField();
      agg.add(row);
      row = [];
    }
    function consume(ch) {
      if (skipLF) {
        skipLF = false;
        if (ch === '\n') return;
      }
      if (quotePending) {
        quotePending = false;
        if (ch === '"') {
          field += '"';
          return;
        }
        quoted = false;
      }
      if (quoted) {
        if (ch === '"') quotePending = true;else field += ch;
        return;
      }
      if (ch === '"' && field === '') {
        quoted = true;
        return;
      }
      if (ch === ',') {
        endField();
        return;
      }
      if (ch === '\n' || ch === '\r') {
        endRow();
        skipLF = ch === '\r';
        return;
      }
      field += ch;
    }
    while (true) {
      const {
        value,
        done
      } = await reader.read();
      if (done) break;
      for (const ch of value) consume(ch);
    }
    if (quoted && !quotePending) throw Error('CSV 引號未閉合');
    if (field !== '' || row.length) endRow();
    return agg.finish();
  }
  async function xls(file) {
    importScripts('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js');
    self.postMessage({
      type: 'progress',
      message: '正在解析 SalesHist 與 Sales 工作表…'
    });
    const wb = XLSX.read(await file.arrayBuffer(), {
      type: 'array',
      cellDates: false,
      sheets: ['SalesHist', 'Sales', 'Items'],
      dense: true
    });
    const itemSheet=wb.Sheets.Items;
    if (itemSheet) {
      basePrices={};
      const [head,...rows]=XLSX.utils.sheet_to_json(itemSheet,{header:1,defval:'',raw:true,blankrows:false});
      const keys=(head||[]).map(x=>norm(x).toLowerCase()), codeIndex=keys.indexOf('number'),
        priceIndex=keys.indexOf('basesellingprice'), unitIndex=keys.indexOf('sellingdetails.sellingunitofmeasure');
      if(codeIndex>=0&&priceIndex>=0&&unitIndex>=0) for(const r of rows){
        const code=safeCode(r[codeIndex]), price=+r[priceIndex];
        if(allowedCodes.has(code)&&norm(r[unitIndex])&&Number.isFinite(price)&&price>0)basePrices[code]=price;
      }
    }
    const parts = [];
    for (const name of ['SalesHist', 'Sales']) {
      if (!wb.Sheets[name]) continue;
      const agg = accumulator(name, !!wb.Workbook?.WBProps?.date1904);
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], {
        header: 1,
        defval: '',
        raw: true,
        blankrows: false
      });
      for (const row of grid) agg.add(row);
      parts.push({
        name,
        ...agg.finish()
      });
    }
    if (!parts.length) throw Error('找不到 SalesHist 或 Sales 工作表；不會讀取進貨表當成銷售');
    const months = {},
      stats = {
        rows: 0,
        excluded: 0,
        negative: 0,
        invalid: 0,
        scopeSkipped: 0,
        minDate: '',
        maxDate: '',
        examples: [],
        overlap: []
      };
    for (const p of parts) {
      for (const [m, rows] of Object.entries(p.months)) {
        if (Object.hasOwn(months, m)) stats.overlap.push(m);
        months[m] = rows;
      }
      for (const k of ['rows', 'excluded', 'negative', 'scopeSkipped']) stats[k] += p.stats[k];
      stats.minDate = !stats.minDate || p.stats.minDate < stats.minDate ? p.stats.minDate : stats.minDate;
      stats.maxDate = p.stats.maxDate > stats.maxDate ? p.stats.maxDate : stats.maxDate;
    }
    const daily={},edges={},lastSales={};
    for(const p of parts){
      Object.assign(daily,p.daily); Object.assign(edges,p.edges);
      for(const [code,date] of Object.entries(p.lastSales)) if(!lastSales[code]||lastSales[code]<date)lastSales[code]=date;
    }
    return {
      months,stats,daily,edges:Object.fromEntries(Object.entries(edges).filter(([date])=>date===stats.minDate||date===stats.maxDate)),
      lastSales,basePrices,enriched:true
    };
  }
  self.onmessage = async e => {
    try {
      const {
        file,
        slot,
        allowed, prices
      } = e.data;
      allowedCodes = new Set(allowed || []);
      basePrices = prices || {};
      if (!allowedCodes.size) throw Error('尚未載入日本貨商品清單，請等待商品載入後再匯入');
      const data = slot === 'history' ? await csv(file) : await xls(file);
      self.postMessage({
        type: 'done',
        data
      });
    } catch (err) {
      self.postMessage({
        type: 'error',
        message: err.message || String(err)
      });
    }
  };
}
