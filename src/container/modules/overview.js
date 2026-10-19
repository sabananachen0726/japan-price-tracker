// container: overview. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "overview",
  "owns": [{
    "name": "card",
    "kind": "function"
  }, {
    "name": "board",
    "kind": "function"
  }, {
    "name": "codeKey",
    "kind": "function"
  }, {
    "name": "codeSort",
    "kind": "function"
  }, {
    "name": "tableSummary",
    "kind": "function"
  }, {
    "name": "listTable",
    "kind": "function"
  }, {
    "name": "renderOverview",
    "kind": "function"
  }, {
    "name": "renderArchive",
    "kind": "function"
  }],
  "imports": ["$", "D", "actionIssues", "active", "applyOverviewView", "dateInfo", "esc", "filt", "piStats", "stage", "today"],
  "writes": ["board", "card", "codeKey", "codeSort", "listTable", "renderArchive", "renderOverview", "tableSummary"]
};
export function register(context) {
  context.card = function card(c) {
    let n = context.D.settings.checklist.filter(x => c.checks[x]).length,
      d = context.dateInfo(c),
      ps = context.piStats(c),
      frozen = c.type === 'Frozen';
    let eta = d.portDate || (!d.unloadDate && d.estimated ? d.estimated : '');
    let etaText = eta || '—',
      etaLabel = d.portDate ? '到港日' : d.estimated && !d.unloadDate ? '到港日（15日推估）' : '到港日';
    let unloadText = d.unloadDate || '—';
    const unloadLabel = d.unloadConfirmed ? '拆櫃日 ✓ 已確認' : '拆櫃日（未確認）';
    return `<div class="card ${frozen ? 'frozen-card' : ''}" onclick="editC('${c.id}')">
 <div class="cardtop"><div class="code">${context.esc(c.code || '未命名')}</div>${frozen ? '<span class="frozen-tag">❄ FROZEN</span>' : ''}</div>
 <div class="tiny">${context.esc(context.stage(c))} · Expected Month ${context.esc(c.expectedMonth || '—')}</div>
 <div class="arrival-line"><span>${etaLabel}</span><b>${context.esc(etaText)}</b></div>
 <div class="arrival-line"><span>${context.esc(unloadLabel)}</span><b>${context.esc(unloadText)}</b></div>
 ${ps.exists ? `<div class="tiny" style="margin-top:8px"><b>${ps.isFinal ? '✓ FINAL PI' : '⚠ PI NOT FINAL'}</b> · ${ps.items} Items · ${ps.ctn.toLocaleString()} CTN</div>` : `<div class="tiny" style="margin-top:8px">PI：尚未在 Japan Price Tracker 建立</div>`}
 ${c.notes ? `<div class="note-box"><span>📝</span><div>${context.esc(c.notes)}</div></div>` : '<div class="note-box empty-note"><span>📝</span><div>沒有備註</div></div>'}${(() => {
      let i = context.actionIssues(c);
      return `<div class="attention-box ${i.length ? '' : 'okay'}">${i.length ? `${i.length} things need attention · ${i.join(' · ')}` : '✓ No action required'}</div>`;
    })()}
 <div class="card-foot"><span class="pill ${c.depositPaid ? 'green' : 'amber'}">Deposit ${c.depositPaid ? '✓' : ''}</span><span class="pill ${c.balancePaid ? 'green' : 'red'}">Balance ${c.balancePaid ? '✓' : ''}</span><span class="check-count">Checklist ${n}/${context.D.settings.checklist.length}</span></div>
 </div>`;
  };
  context.board = function board() {
    let a = context.filt(context.active()),
      ss = ["QUOTATION", "SHIPPING"];
    context.$('dashboardView').innerHTML = `<div class="board">${ss.map(s => {
      let x = a.filter(c => context.stage(c) === s);
      return `<div class="col"><h3>${s}<span>${x.length}</span></h3>${x.map(context.card).join("") || '<div class="tiny">—</div>'}</div>`;
    }).join("")}</div>`;
  };
  context.codeKey = function codeKey(c) {
    let s = (c.code || "").toUpperCase().replace(/\s+/g, ""),
      m = s.match(/^[A-Z]+(\d{2})[A-Z](\d{2})(\d{2})/);
    return m ? [2000 + Number(m[1]), Number(m[2]), Number(m[3]), s] : [9999, 99, 99, s];
  };
  context.codeSort = function codeSort(a, b) {
    let x = context.codeKey(a),
      y = context.codeKey(b);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return x[3].localeCompare(y[3]);
  };
  context.tableSummary = function tableSummary(a) {
    let arriving = a.filter(c => {
      const d = context.dateInfo(c);
      const next = d.unloadDate || d.eta;
      return !d.unloaded && next && next >= context.today() && (new Date(next) - new Date(context.today())) / 86400000 <= 7;
    }).length;
    let notFinal = a.filter(c => {
      let p = context.piStats(c);
      return p.exists && !p.isFinal;
    }).length;
    let pay = a.filter(c => !c.balancePaid).length;
    let overdue = a.filter(c => {
      const d = context.dateInfo(c);
      return !d.unloaded && !d.unloadDate && d.eta && d.eta < context.today();
    }).length;
    return `<div class="summary-strip"><div class="summary-chip"><span class="tiny">Active</span><b>${a.length}</b></div><div class="summary-chip"><span class="tiny">Arriving ≤ 7 Days</span><b>${arriving}</b></div><div class="summary-chip warn"><span class="tiny">PI Not Final</span><b>${notFinal}</b></div><div class="summary-chip warn"><span class="tiny">Balance Pending</span><b>${pay}</b></div><div class="summary-chip ${overdue ? 'bad' : ''}"><span class="tiny">日期待確認</span><b>${overdue}</b></div></div>`;
  };
  context.listTable = function listTable(a, isArchive = false) {
    a = [...a].sort(context.codeSort);
    let rows = a.map(c => {
      let n = context.D.settings.checklist.filter(x => c.checks[x]).length,
        ps = context.piStats(c),
        d = context.dateInfo(c),
        received = d.unloaded,
        issues = context.actionIssues(c);
      return `<tr class="click ${c.type === 'Frozen' ? 'frozen-row' : ''}" onclick="openDrawer('${c.id}')"><td><b>${context.esc(c.code || '—')}</b>${c.type === 'Frozen' ? '<span class="table-frozen">❄ FROZEN</span>' : ''}</td><td><span class="status-badge ${context.stage(c) === 'QUOTATION' ? 'port' : ''}">${context.esc(context.stage(c))}</span>${issues.length ? `<div class="tiny" style="margin-top:5px;color:#9a6200">${issues.length} action${issues.length > 1 ? 's' : ''}</div>` : ''}</td><td><div class="date-stack"><small>到港日${!d.portDate && d.estimated && !d.unloadDate ? '（推估）' : ''}</small><b>${context.esc(d.portDate || (!d.unloadDate ? d.estimated : '') || '—')}</b><small style="margin-top:5px">拆櫃日</small><b>${context.esc(d.unloadDate || '—')}</b><small style="margin-top:5px">Expected Month ${context.esc(c.expectedMonth || '—')}</small></div></td><td><div class="pay-stack"><span class="mini-state ${c.depositPaid ? 'ok' : 'warn'}">D ${c.depositPaid ? '✓' : 'Pending'}</span><span class="mini-state ${c.balancePaid ? 'ok' : 'bad'}">B ${c.balancePaid ? '✓' : 'Pending'}</span></div></td><td>${ps.exists ? `<span class="mini-state ${ps.isFinal ? 'ok' : 'warn'}">${ps.isFinal ? '✓ FINAL PI' : '⚠ PI NOT FINAL'}</span><div class="tiny" style="margin-top:5px">${ps.items} Items · ${ps.ctn.toLocaleString()} CTN</div>` : '<span class="mini-state neutral">No PI</span>'}<div class="tiny" style="margin-top:5px">Checklist ${n}/${context.D.settings.checklist.length}</div></td><td class="row-arrow">›</td></tr>`;
    }).join('') || '<tr><td colspan="6">沒有貨櫃資料</td></tr>';
    return `<div class="report-title"><h1>Container Status Report</h1><div>Updated: ${context.today()} · ${a.length} Containers</div></div><div class="tablewrap"><table class="overview-table compact-table"><thead><tr><th>Container</th><th>Status</th><th>到港日／拆櫃日</th><th>Payment</th><th>Final PI / Checklist</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  };
  context.renderOverview = function renderOverview() {
    let a = context.filt(context.active());
    context.$('dashboardView').innerHTML = '';
    context.board();
    context.$('listView').innerHTML = `<div class="list-subtitle tiny">目前篩選結果：${a.length} Containers · 點擊貨櫃查看完整 Timeline / Payment / PI / Checklist。</div>${context.listTable(a)}`;
    context.applyOverviewView();
  };
  context.renderArchive = function renderArchive() {
    let q = (context.$('search')?.value || '').trim().toLowerCase(),
      a = context.D.containers.filter(c => c.archived || ['Void', 'Cancelled'].includes(c.status));
    if (q) a = a.filter(c => JSON.stringify(c).toLowerCase().includes(q));
    context.$('archive').innerHTML = `<div class="table-head"><div><h2>Archive</h2><div class="tiny">已完成、Void 或 Cancelled 的歷史貨櫃。</div></div></div>${context.listTable(a, true)}`;
  };
}
export function initialize(context) {}
