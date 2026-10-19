// planner: sales-import. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "sales-import",
  "owns": [{
    "name": "parseSalesFile",
    "kind": "function"
  }, {
    "name": "prepareSales",
    "kind": "function"
  }, {
    "name": "selectSalesFile",
    "kind": "function"
  }],
  "imports": ["$", "SalesCore", "esc", "factor", "fmt", "gzipText", "monthlyInfo", "plannerRole", "plannerUid", "refreshSalesUI", "salesAllowedCodes", "salesBusy", "salesDecoded", "salesImportWorker", "salesLoading", "salesPending", "salesStatus", "salesWorker", "state", "today", "trackerFeed"],
  "writes": ["parseSalesFile", "prepareSales", "salesBusy", "salesPending", "salesWorker", "selectSalesFile"]
};
export function register(context) {
  context.parseSalesFile = function parseSalesFile(file, slot) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob(['(' + context.salesImportWorker.toString() + ')()'], {
        type: 'text/javascript'
      }));
      const worker = new Worker(url);
      URL.revokeObjectURL(url);
      context.salesWorker = worker;
      worker.onmessage = e => {
        if (e.data.type === 'progress') context.salesStatus(e.data.message);
        if (e.data.type === 'done' || e.data.type === 'error') {
          worker.terminate();
          context.salesWorker = null;
          e.data.type === 'done' ? resolve(e.data.data) : reject(Error(e.data.message));
        }
      };
      worker.onerror = e => {
        worker.terminate();
        context.salesWorker = null;
        reject(Error(e.message || '銷售檔解析失敗'));
      };
      worker.postMessage({
        file,
        slot,
        allowed: [...context.salesAllowedCodes()]
      });
    });
  };
  context.prepareSales = async function prepareSales(sources, end, record) {
    if (context.plannerRole !== 'admin') throw Error('只有 Admin 可以匯入銷售或更改計算期間');
    const scope = String(context.trackerFeed?.mode || 'test') + '|' + context.plannerUid;
    const last = context.SalesCore.monthShift(context.today().slice(0, 7), -1);
    if (!/^\d{4}-\d{2}$/.test(end) || end > last || end < '2000-06') throw Error('請選取已結束的計算月份');
    sources = Object.fromEntries(Object.entries(sources).map(([slot, s]) => [slot, context.SalesCore.restrict(s, context.salesAllowedCodes())]));
    const summary = context.SalesCore.summarize(sources, end, context.salesAllowedCodes()),
      packed = {};
    for (const [slot, s] of Object.entries(sources)) packed[slot] = {
      codec: 'gzip-base64',
      body: await context.gzipText(JSON.stringify(s)),
      label: s.label || ''
    };
    const payload = {
      version: 1,
      periodEnd: end,
      sources: packed,
      batchId: crypto.randomUUID(),
      updatedAt: new Date().toISOString()
    };
    if (scope !== String(context.trackerFeed?.mode || 'test') + '|' + context.plannerUid || context.plannerRole !== 'admin') throw Error('帳號或模式已改變，請重新預覽');
    if (new TextEncoder().encode(JSON.stringify(payload)).length > 700000) throw Error('月銷彙總超過共享容量，請縮小歷史檔期間後重試');
    const missing = summary.months.filter((_, i) => !summary.coverage[i]),
      manual = context.state.items.filter(i => context.monthlyInfo(i).manual).length;
    context.salesPending = {
      sources,
      summary,
      payload,
      scope: String(context.trackerFeed?.mode || 'test')
    };
    context.$('salesPreview').classList.remove('hidden');
    context.$('salesPreviewSummary').textContent = `${record || '重新計算'}｜${summary.months[0]}～${end}｜${Object.keys(summary.rows).length} 款｜${manual} 款手動值保留`;
    const matched = context.state.items.filter(i => summary.rows[i.code]);
    const unmatched = Object.keys(summary.rows).filter(code => !context.state.items.some(i => i.code === code));
    const notes = [missing.length ? '尚缺 ' + missing.join('、') + ' 的來源資料；依現有月份計算自動月銷，缺資料月份不視為零銷售。' : '六個月來源資料已齊全。', summary.overlap.length ? '兩檔重疊月份以 XLSM 整月優先：' + summary.overlap.join('、') : '', ...Object.values(sources).map(s => `${s.label}：讀取 ${s.stats.rows.toLocaleString()} 筆，略過清單外 ${(s.stats.scopeSkipped || 0).toLocaleString()} 筆，排除 KAISI ${s.stats.excluded.toLocaleString()} 筆，負數 ${s.stats.negative.toLocaleString()} 筆。${s.stats.overlap?.length ? '工作表重疊月份（Sales優先）：' + s.stats.overlap.join('、') : ''}`), `配對本工具日本貨清單 ${matched.length} 款；未配對 ${unmatched.length} 款，不新增商品。`, unmatched.length ? '未配對範例：' + unmatched.slice(0, 30).join('、') : ''];
    context.$('salesPreviewBody').innerHTML = notes.filter(Boolean).map(t => `<p class="mini">${context.esc(t)}</p>`).join('') + `<table><thead><tr><th>Item Code</th>${summary.months.map(m => `<th>${context.esc(m)}</th>`).join('')}<th>出貨月數</th><th>自動平均／採購單位</th><th>套用後來源</th></tr></thead><tbody>${matched.slice(0, 100).map(i => {
      const r = summary.rows[i.code],
        f = context.factor(i),
        auto = r.count && f ? r.raw / f : null,
        manual = context.monthlyInfo(i).manual;
      return `<tr><td>${context.esc(i.code)}</td>${r.net.map((v, n) => `<td>${!summary.coverage[n] ? '—' : f ? context.fmt(v / f) : '待換算'}</td>`).join('')}<td>${r.count}/6</td><td>${auto === null ? '—' : context.fmt(auto)}</td><td>${manual ? '保留手動' : !r.count ? '無銷售資料' : !f ? '換算待確認' : !summary.complete ? '自動・資料不足六個月' : '自動'}</td></tr>`;
    }).join('')}</tbody></table><p class="mini">預覽前100款；確認後套用全部配對商品。無出貨月份排除，但該月份負數仍計入六個月淨量。平均淨量為負的商品不計算建議採購量。</p>`;
    context.salesStatus('請核對預覽後按「確認套用並共用」。');
    context.refreshSalesUI();
  };
  context.selectSalesFile = async function selectSalesFile(file, slot) {
    if (!file || context.salesBusy || context.salesLoading) return;
    if (context.plannerRole !== 'admin') return alert('只有 Admin 可匯入');
    const scope = String(context.trackerFeed?.mode || 'test') + '|' + context.plannerUid;
    const staged = context.salesPending;
    const baseSources = staged?.sources || context.salesDecoded;
    context.salesBusy = true;
    context.refreshSalesUI();
    context.salesStatus('正在讀取 ' + file.name + '，請勿關閉頁面…');
    try {
      const parsed = await context.parseSalesFile(file, slot);
      if (scope !== String(context.trackerFeed?.mode || 'test') + '|' + context.plannerUid) throw Error('帳號或模式已改變，請重新選擇檔案');
      parsed.label = file.name;
      parsed.importedAt = new Date().toISOString();
      const sources = {
        ...baseSources,
        [slot]: context.SalesCore.mergeSource(baseSources[slot], parsed)
      };
      await context.prepareSales(sources, context.SalesCore.defaultEnd(sources, context.today()), file.name);
    } catch (err) {
      context.salesStatus('匯入失敗：' + err.message);
      alert('銷售匯入失敗：' + err.message);
    } finally {
      context.salesBusy = false;
      context.refreshSalesUI();
    }
  };
}
export function initialize(context) {}
