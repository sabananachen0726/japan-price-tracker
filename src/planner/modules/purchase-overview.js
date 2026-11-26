import {requestLines, requestRemaining, ageDays, staleCustomerOrders, poolKey, POOL_STALE_DAYS, CANCEL_REASONS} from '../../shared/purchase-pool.js';
import {brisbaneDate} from '../../shared/customer-protection.js';
// planner: purchase-overview (採購單總覽). Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "purchase-overview",
  "owns": [{
    "name": "purchasePool",
    "kind": "let"
  }, {
    "name": "renderPurchaseOverview",
    "kind": "function"
  }],
  "imports": ["$", "allPis", "compareContainerIds", "deferredDrafts", "dirtyDrafts", "esc", "events", "fmt", "plannerRole", "state", "trackerFeed"],
  "writes": ["purchasePool", "renderPurchaseOverview"]
};
const view = {tab: 'drafts', closing: '', allArrived: false, status: '', statusKind: '', pendingRequest: ''};
const dmy = value => {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
const brisbaneDay = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso).slice(0, 10) : brisbaneDate(d);
};
export function register(context) {
  context.purchasePool = {requests: {}};
  const live = () => context.trackerFeed?.mode === 'live';
  const admin = () => context.plannerRole === 'admin';
  const hasRows = d => d && (d.preparedAt || Object.values(d.rows || {}).some(x => +x > 0) || Object.values(d.itemNotes || {}).some(n => String(n).trim()));
  const piKeys = () => new Set(context.allPis().map(p => poolKey(p.container)));
  const coverageFor = container => {
    const key = poolKey(container), out = [];
    for (const [name, r] of Object.entries(context.purchasePool?.requests || {})) {
      const lines = Object.values(r.lines || {}).filter(l => Number(l.covered?.[key]) > 0);
      if (lines.length) out.push({name, items: lines.length, qty: lines.reduce((n, l) => n + Number(l.covered[key]), 0)});
    }
    return out;
  };
  const draftCard = ([k, d]) => {
    const own = Object.values(d.rows || {}).filter(x => +x > 0);
    const status = context.deferredDrafts[k]?.updatedAt ? (context.dirtyDrafts.has(k) ? '已提交 · 有本機未提交修改' : '已提交') : context.deferredDrafts[k]?.preparedAt ? '已安排，待提交' : '本機未提交草稿';
    return `<div class="panel"><div class="row between"><div><b>${context.esc(k)}</b> <span class="tag">${context.esc(status)}</span> · ${context.esc(d.kind === 'frozen' ? '冷凍' : '乾貨')} · 到倉 ${context.esc(d.arrival || '未設定')}<br><span class="muted">${own.length} 款 · ${context.fmt(own.reduce((n, x) => n + (+x || 0), 0))} 箱 · ${Object.values(d.itemNotes || {}).filter(n => String(n).trim()).length} 項商品備註</span></div><div class="row"><button data-open="${context.esc(k)}">開啟</button><button data-delete="${context.esc(k)}" class="admin-only" ${admin() ? '' : 'hidden'}>刪除</button></div></div></div>`;
  };
  const requestCard = (name, r, today) => {
    const lines = requestLines(r).sort((a, b) => (b.remaining > 0) - (a.remaining > 0) || a.code.localeCompare(b.code));
    const remaining = requestRemaining(r), open = lines.filter(l => l.remaining > 0);
    const age = ageDays(brisbaneDay(r.submittedAt), today), stale = remaining > 0 && age !== null && age > POOL_STALE_DAYS;
    const closing = view.closing === name && admin() && open.length;
    const staleOrders = staleCustomerOrders(r, context.state.orders);
    const draft = context.state.drafts[name];
    const reason = l => l.cancelled ? `取消 ${context.fmt(l.cancelled.qty)}（${context.esc(CANCEL_REASONS[l.cancelled.reason] || l.cancelled.reason)}）` : '—';
    const rows = lines.map(l => `<tr class="${l.remaining > 0 ? '' : 'pool-done'}"><td>${context.esc(l.code)}</td><td>${context.esc(l.name || '')}</td><td class="right">${context.fmt(l.qty)}</td><td>${Object.entries(l.covered).map(([c, q]) => `${context.esc(c)} ${context.fmt(q)}`).join('、') || '—'}</td><td>${reason(l)}</td><td class="right"><strong>${l.remaining > 0 ? context.fmt(l.remaining) : '✓'}</strong>${l.remaining > 0 && l.carried ? '<div class="mini muted">延到下次</div>' : ''}</td>${closing ? `<td>${l.remaining > 0 ? `<select data-close-choice="${context.esc(l.code)}" aria-label="${context.esc(l.code)} 處理方式"><option value="carry">延到下次</option>${Object.entries(CANCEL_REASONS).map(([k, v]) => `<option value="${k}">取消：${context.esc(v)}</option>`).join('')}</select>` : ''}</td>` : ''}</tr>`).join('');
    return `<details class="panel pool-card${stale ? ' pool-stale' : ''}" data-pool-request="${context.esc(name)}"${closing || remaining > 0 ? ' open' : ''}><summary><b>${context.esc(name)}</b> <span class="tag">${remaining > 0 ? `處理中 ${open.length} 項／${context.fmt(remaining)} 箱` : '已完成'}</span>${r.closedAt && remaining > 0 ? ' <span class="tag">已結案 · 有延後品項</span>' : ''}${stale ? ` <span class="tag pool-stale-tag">已 ${age} 天</span>` : ''} <span class="muted">已提交 ${dmy(brisbaneDay(r.submittedAt))}${r.submittedBy ? ' · ' + context.esc(r.submittedBy) : ''}</span></summary>${staleOrders.length ? `<div class="pool-warn">客訂表還有 ${staleOrders.length} 筆寫著 ${context.esc(name)}，但這些品項已轉入 PI。請把客訂更新成正式櫃號：${context.esc([...new Set(staleOrders.map(o => o.code))].join('、'))}</div>` : ''}<div class="pool-table-wrap"><table class="pool-table"><thead><tr><th>品號</th><th>商品</th><th class="right">業務單</th><th>已轉 PI</th><th>已取消</th><th class="right">處理中</th>${closing ? '<th>結案處理</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div><div class="row pool-actions">${draft ? `<button data-open="${context.esc(name)}">開啟業務單</button>` : ''}${admin() && live() && open.length && !closing ? `<button data-pool-close="${context.esc(name)}">結案…</button>` : ''}${closing ? `<button class="primary" data-pool-close-confirm="${context.esc(name)}">確認結案</button><button data-pool-close-cancel>取消</button><span class="mini muted">「延到下次」會留在處理中，下次訂貨繼續扣；取消的品項不再計算。</span>` : ''}</div></details>`;
  };
  const piCard = p => {
    const qty = (p.rows || []).reduce((n, r) => n + (Number(r.qty) || 0), 0);
    const from = coverageFor(p.container);
    const draft = context.state.drafts[p.container] || context.state.drafts[poolKey(p.container)];
    return `<details class="panel pi-card"><summary><b>${context.esc(p.container)}</b> <span class="tag">${context.esc(p.isFinal ? 'Final' : p.version || '未 Final')}</span> · ${(p.rows || []).length} 款 · ${context.fmt(qty)} 箱 · ${p.received ? '已到貨' : `到港 ${p.eta ? (p.etaEstimated ? '約 ' : '') + dmy(p.eta) : '待定'}`}${from.length ? ` · <span class="muted">來自處理中：${from.map(f => `${context.esc(f.name)} ${f.items} 項`).join('、')}</span>` : ''}</summary><div class="pool-table-wrap"><table class="pool-table"><thead><tr><th>品號</th><th>商品</th><th class="right">箱數</th></tr></thead><tbody>${(p.rows || []).map(r => `<tr><td>${context.esc(String(r.code || '').startsWith('__JAN_') ? r.barcode || '' : r.code)}</td><td>${context.esc(r.name || '')}</td><td class="right">${context.fmt(r.qty)}</td></tr>`).join('')}</tbody></table></div><div class="row pool-actions">${draft ? `<button data-open="${context.esc(p.container)}">開啟工作單</button>` : ''}${p.source !== 'tracker' ? `<button data-pidate="${context.esc(p.container)}">設定到倉日</button>` : ''}</div></details>`;
  };
  context.renderPurchaseOverview = function renderPurchaseOverview() {
    const today = brisbaneDate(), pool = context.purchasePool?.requests || {}, pis = context.allPis(), withPi = piKeys();
    const entries = Object.entries(context.state.drafts).filter(([k, d]) => k !== '__未命名草稿__' && hasRows(d));
    const drafts = entries;
    const sendable = d => Object.values(d.rows || {}).some(x => +x > 0);
    const requests = Object.entries(pool).sort((a, b) => String(a[1].submittedAt || '').localeCompare(String(b[1].submittedAt || '')) || a[0].localeCompare(b[0]));
    const pending = requests.filter(([, r]) => requestRemaining(r) > 0), finished = requests.filter(([, r]) => requestRemaining(r) <= 0).reverse();
    const unpooled = entries.filter(([k, d]) => context.deferredDrafts[k]?.updatedAt && !pool[k] && !withPi.has(poolKey(k)) && sendable(d));
    const incoming = pis.filter(p => !p.received).sort((a, b) => context.compareContainerIds(a.container, b.container));
    const arrived = pis.filter(p => p.received).sort((a, b) => context.compareContainerIds(b.container, a.container));
    const tabs = [['drafts', '工作單', drafts.length], ['pending', '處理中', pending.length], ['incoming', '已有 PI（未到貨）', incoming.length], ['arrived', '已到貨', arrived.length]];
    let body = '';
    if (view.tab === 'drafts') body = `<p class="intro">所有工作單，含本機未提交的草稿（只存在這台電腦的瀏覽器）和已提交的工作單。</p>${drafts.map(draftCard).join('') || '<p class="muted">尚無工作單。</p>'}`;
    if (view.tab === 'pending') {
      body = `<p class="intro">業務單提交後、還沒有 PI 的品項。訂貨規劃的在途會扣掉這些箱數；匯入 PI 時會依品號劃掉。超過 ${POOL_STALE_DAYS} 天標紅。</p>`;
      if (!live()) body += '<p class="pool-warn">處理中只在 LIVE 模式運作；TEST 模式不會記錄。</p>';
      if (live() && unpooled.length) body += `<div class="panel pool-migrate"><h3>還沒加入處理中的已提交工作單（${unpooled.length}）</h3><p class="intro">這些工作單已提交，但沒有同名 PI，也還沒放進處理中。${admin() ? '預設全部勾選；已經到貨或不需要的請取消勾選，再按「加入處理中」。' : '請 Admin 確認是否加入。'}</p>${unpooled.map(([k, d]) => `<label class="pool-migrate-row">${admin() ? `<input type="checkbox" data-pool-pick="${context.esc(k)}" checked>` : ''}<b>${context.esc(k)}</b> <span class="muted">提交 ${dmy(brisbaneDay(context.deferredDrafts[k].updatedAt))} · ${Object.values(d.rows || {}).filter(x => +x > 0).length} 款</span></label>`).join('')}${admin() ? '<div class="row pool-actions"><button class="primary" data-pool-add>加入處理中</button></div>' : ''}</div>`;
      body += pending.map(([k, r]) => requestCard(k, r, today)).join('') || '<p class="muted">目前沒有處理中的品項。</p>';
      if (finished.length) body += `<details class="panel"><summary>已完成的業務單（${finished.length}）</summary>${finished.map(([k, r]) => requestCard(k, r, today)).join('')}</details>`;
    }
    if (view.tab === 'incoming') body = `<p class="intro">已匯入 PI、還沒拆櫃到倉的貨櫃。點開看品項。</p>${incoming.map(piCard).join('') || '<p class="muted">沒有在途的 PI。</p>'}`;
    if (view.tab === 'arrived') {
      const shown = view.allArrived ? arrived : arrived.slice(0, 30);
      body = `<p class="intro">已拆櫃到倉的貨櫃，最新的在最上面。</p>${shown.map(piCard).join('') || '<p class="muted">沒有已到貨的 PI。</p>'}${arrived.length > shown.length ? `<button data-ov-all>顯示全部 ${arrived.length} 櫃</button>` : ''}`;
    }
    context.$('containerCards').innerHTML = `<nav class="overview-tabs" aria-label="採購單分類">${tabs.map(([id, label, n]) => `<button type="button" data-ov-tab="${id}" class="${view.tab === id ? 'active' : ''}" aria-pressed="${view.tab === id}">${label} <span class="count">${n}</span></button>`).join('')}</nav><div class="pool-status ${view.statusKind}" role="status" aria-live="polite">${context.esc(view.status)}</div>${body}`;
  };
}
export function initialize(context) {
  const send = (action, payload) => {
    const requestId = crypto.randomUUID();
    view.pendingRequest = requestId;
    view.status = '處理中，請稍候…'; view.statusKind = 'pending';
    context.renderPurchaseOverview();
    window.parent.postMessage({type: 'KAISI_POOL_ACTION', action, requestId, ...payload}, '*');
  };
  context.$('viewSubmitted')?.addEventListener('click', () => { view.tab = 'drafts'; view.closing = ''; context.renderPurchaseOverview(); });
  context.$('containerCards').addEventListener('click', e => {
    const t = e.target.closest('[data-ov-tab],[data-ov-all],[data-pool-close],[data-pool-close-cancel],[data-pool-close-confirm],[data-pool-add]');
    if (!t) return;
    if (t.dataset.ovTab) { view.tab = t.dataset.ovTab; view.closing = ''; view.status = ''; }
    else if (t.hasAttribute('data-ov-all')) view.allArrived = true;
    else if (t.dataset.poolClose) view.closing = t.dataset.poolClose;
    else if (t.hasAttribute('data-pool-close-cancel')) view.closing = '';
    else if (t.dataset.poolCloseConfirm) {
      const card = t.closest('[data-pool-request]'), decisions = {};
      card.querySelectorAll('[data-close-choice]').forEach(s => { decisions[s.dataset.closeChoice] = s.value; });
      const cancels = Object.values(decisions).filter(v => v !== 'carry').length;
      if (!confirm(`結案 ${t.dataset.poolCloseConfirm}：${cancels} 項取消、${Object.keys(decisions).length - cancels} 項延到下次。確定？`)) return;
      return send('close', {name: t.dataset.poolCloseConfirm, decisions});
    } else if (t.hasAttribute('data-pool-add')) {
      const names = [...context.$('containerCards').querySelectorAll('[data-pool-pick]:checked')].map(i => i.dataset.poolPick);
      if (!names.length) { view.status = '請先勾選工作單'; view.statusKind = 'bad'; context.renderPurchaseOverview(); return; }
      return send('add', {names});
    }
    context.renderPurchaseOverview();
  });
  context.events.onMessage(e => {
    if (e.source !== window.parent || e.data?.type !== 'KAISI_POOL_RESULT' || e.data.requestId !== view.pendingRequest) return;
    view.pendingRequest = '';
    if (e.data.ok) { view.status = e.data.action === 'close' ? '已結案。' : '已加入處理中。'; view.statusKind = 'ok'; view.closing = ''; }
    else { view.status = '未完成：' + (e.data.error || '請稍後再試'); view.statusKind = 'bad'; }
    if (!context.$('containers').classList.contains('hidden')) context.renderPurchaseOverview();
  });
}
