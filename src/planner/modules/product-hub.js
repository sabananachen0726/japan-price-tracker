import {brisbaneDate} from '../../shared/customer-protection.js';
// planner: product-hub (商品管理 → 商品清單 + 商品詳細). Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "product-hub",
  "owns": [{
    "name": "renderProductHub",
    "kind": "function"
  }],
  "imports": ["itemOrigin", "SEED", "saveCatalogPatch", "$", "esc", "events", "factor", "factorInfo", "fmt", "incoming", "kindSelect", "photo", "plannerRole", "shelfLife", "state", "statusSelect", "trackerFeed", "val"],
  "writes": ["renderProductHub"]
};
export const HUB_REASONS = ['缺圖片', '缺名稱', '缺 Item Code', '缺 Barcode', '貨別未分類'];
// Filters stack: 貨別 × 訂貨狀態 × 需要補 (+ 客找保護中 / 已隱藏). Counts follow the other choices.
const GROUPS = [['kind', '貨別', [['all', '全部'], ['frozen', '冷凍'], ['dry', '乾貨'], ['unknown', '未分類']]], ['state', '訂貨狀態', [['all', '全部'], ['active', '可訂'], ['inactive', '暫停／停產']]], ['need', '需要補', [['all', '不限'], ['pending', '⚠ 任一待補'], ...HUB_REASONS.map(r => [r, r])]], ['origin', '來源', [['all', '全部'], ['master', '主檔'], ['seed', '內建清單'], ['pi', '只在 PI'], ['arriving', '未到櫃新品']]], ['special', '其他', [['protect', '客找保護中'], ['hidden', '已隱藏']]]];
const api = {};
const view = {kind: 'all', state: 'all', need: 'pending', origin: 'all', special: '', open: '', openBarcode: '', limit: 150, status: '', statusKind: '', pendingRequest: '', next: false, renderedKey: ''};
const https = u => /^https:\/\//i.test(String(u || '')) ? String(u) : '';
const dmy = v => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

export function register(context) {
  const today = () => brisbaneDate();
  const entries = () => {
    const products = context.trackerFeed?.products || {};
    const list = context.state.items.map(i => ({key: i.code, item: i, master: products[i.code] || null}));
    for (const m of context.trackerFeed?.masterNoCode || []) list.push({key: 'MASTER:' + m.masterKey, master: {masterKey: m.masterKey, manual: m.manual || [], missingBarcode: !m.barcode, imgUrl: m.imgUrl}, item: {code: '', name: m.name, barcode: m.barcode, imgUrl: m.imgUrl, kind: 'unknown', availability: 'active', history: [], sources: ['商品主檔'], noCode: true}});
    return list;
  };
  const hiddenEntries = () => context.SEED.items.filter(s => context.state.catalog?.[s.code]?.hiddenSeed === true).map(s => ({key: 'HIDDEN:' + s.code, hidden: true, master: null, item: {...s, availability: 'active', history: [], sources: ['整理 Excel']}}));
  const photoOf = e => e.item.noCode ? https(e.item.imgUrl) : context.photo(e.item);
  const barcodeOf = e => e.master?.missingBarcode ? '' : (/^\d{8,14}$/.test(String(e.item.barcode || '')) ? String(e.item.barcode) : '');
  const piOnly = e => !e.item.noCode && String(e.item.code).startsWith('__');
  const nameOf = e => { const n = String(e.item.name || '').trim(); return n && n !== e.item.code && !n.startsWith('待補商品資料') ? n : ''; };
  const issues = e => {
    const out = [];
    if (!photoOf(e)) out.push('缺圖片');
    if (!nameOf(e)) out.push('缺名稱');
    if (e.item.noCode || piOnly(e)) out.push('缺 Item Code');
    if (!barcodeOf(e)) out.push('缺 Barcode');
    if (!e.item.noCode && e.item.kind === 'unknown') out.push('貨別未分類');
    return out;
  };
  const needsMyob = e => !e.item.noCode && !piOnly(e) && (!context.state.inventory?.[e.item.code] || !context.factor(e.item));
  const protection = e => { const p = context.trackerFeed?.protections?.[e.item.code]; return p?.expiresOn > today() ? p : null; };
  const passes = (e, dim, value) => {
    if (dim === 'kind') return value === 'all' || (e.item.noCode ? 'unknown' : e.item.kind) === value;
    if (dim === 'state') return value === 'all' || (value === 'active' ? e.item.availability === 'active' : e.item.availability !== 'active');
    if (dim === 'need') return value === 'all' || (value === 'pending' ? issues(e).length > 0 : issues(e).includes(value));
    if (dim === 'origin') {
      if (value === 'all') return true;
      const o = originOf(e);
      return value === 'master' ? o.master : value === 'seed' ? o.seed && !o.master : value === 'pi' ? o.piOnly : o.newArrival;
    }
    if (dim === 'special') return value !== 'protect' || !!protection(e);
    return true;
  };
  const originCache = new Map();
  const originOf = e => {
    if (e.hidden) return {master: false, seed: true, piOnly: false, pis: [], open: [], newArrival: false};
    if (!originCache.has(e.key)) originCache.set(e.key, context.itemOrigin(e.item));
    return originCache.get(e.key);
  };
  const piText = p => `${p.container} ${p.received ? '已到' : `未到櫃${p.eta ? `（${p.etaEstimated ? '約 ' : ''}${dmy(p.eta)}）` : ''}`}`;
  const originTags = e => {
    const o = originOf(e), tags = [];
    if (o.master) tags.push('<span class="tag src-master">主檔</span>');
    if (o.seed) tags.push('<span class="tag src-seed">內建清單</span>');
    if (o.piOnly) tags.push('<span class="tag src-pi">只在 PI</span>');
    if (o.newArrival) tags.push('<span class="tag src-new">未到櫃新品</span>');
    const pis = o.pis.slice(0, 2).map(piText).join('、') + (o.pis.length > 2 ? ` 等 ${o.pis.length} 櫃` : '');
    return `<div class="hub-origin">${tags.join(' ')}${pis ? ` <span class="mini muted">PI：${context.esc(pis)}</span>` : ''}</div>`;
  };
  const searched = e => {
    const q = String(context.$('manageSearch').value || '').trim().toLowerCase();
    return !q || `${e.item.code} ${e.item.name} ${e.item.barcode}`.toLowerCase().includes(q);
  };
  const matches = (e, except = '') => searched(e) && GROUPS.every(([dim]) => dim === except || passes(e, dim, view[dim]));
  const source = (special = view.special) => special === 'hidden' ? hiddenEntries() : entries();
  const filtered = () => source().filter(e => matches(e)).sort((a, b) => issues(b).length - issues(a).length || String(a.item.code || 'ZZZ').localeCompare(String(b.item.code || 'ZZZ')));
  const kindLabel = k => k === 'frozen' ? '冷凍' : k === 'dry' ? '乾貨' : '未分類';
  const statusLabel = s => s === 'paused' ? '暫停訂購' : s === 'discontinued' ? '停產' : '可訂';
  const codeLabel = e => e.item.noCode || piOnly(e) ? '待補 Item Code' : e.item.code;

  const positionDrawer = () => {
    const d = context.$('hubDrawer');
    if (!d || d.hidden) return;
    let start = 0, end = window.innerHeight;
    try {
      const r = window.frameElement?.getBoundingClientRect();
      if (r) { start = Math.max(0, -r.top); end = Math.min(window.innerHeight, window.parent.innerHeight - r.top); }
    } catch {}
    d.style.top = start + 'px';
    d.style.height = Math.max(240, end - start) + 'px';
  };
  api.positionHubDrawer = positionDrawer;

  const fillRow = (label, field, value, {manual, placeholder = '', type = 'text', hint = ''} = {}) => `<label class="hub-field${value ? '' : ' hub-missing'}"><span class="hub-label">${label}${manual ? ' <span class="tag hub-temp" title="下次匯入主檔時，主檔有值就會覆蓋">暫填</span>' : ''}</span><input type="${type}" data-fill="${field}" value="${context.esc(value)}" placeholder="${context.esc(placeholder)}" autocomplete="off">${hint ? `<span class="mini muted">${hint}</span>` : ''}</label>`;

  const renderDrawer = e => {
    const d = context.$('hubDrawer');
    if (!e) { d.hidden = true; context.$('productHub').classList.remove('hub-drawer-open'); view.renderedKey = ''; return; }
    const keepTyping = view.renderedKey === e.key && d.contains(document.activeElement) && document.activeElement.matches('input,select');
    d.hidden = false;
    context.$('productHub').classList.add('hub-drawer-open');
    positionDrawer();
    if (keepTyping) return;
    view.renderedKey = e.key;
    const i = e.item, miss = issues(e), manual = new Set(e.master?.manual || []), admin = context.plannerRole === 'admin';
    if (e.hidden) {
      context.$('hubDrawerTitle').innerHTML = `<div class="hub-title-code">${context.esc(i.code)}</div><div class="hub-title-name">${context.esc(nameOf(e) || '（未命名）')}</div>`;
      context.$('hubDrawerBody').innerHTML = `<div class="hub-section"><h4>內建清單（已隱藏）</h4><p>這個品號已從內建「整理 Excel」清單隱藏，不會出現在訂貨規劃。條碼：${context.esc(i.barcode || '—')}</p>${admin ? `<button type="button" data-hub-unhide="${context.esc(i.code)}">取消隱藏</button>` : ''}</div>`;
      context.$('hubDrawerSettings').innerHTML = '';
      context.$('hubDrawerExtra').innerHTML = '';
      return;
    }
    const img = photoOf(e);
    context.$('hubDrawerTitle').innerHTML = `<div class="hub-title-code">${context.esc(codeLabel(e))}</div><div class="hub-title-name">${context.esc(nameOf(e) || '（未命名）')}</div>`;
    const missing = miss.length ? `<div class="hub-missing-box">還缺：${miss.map(context.esc).join('、')}</div>` : '<div class="hub-ok-box">基本資料完整</div>';
    let form;
    const noMaster = piOnly(e) && !e.master;
    if (!admin) form = '<p class="mini muted">只有 Admin 可以補主檔資料。</p>';
    else {
      const imgValue = noMaster ? https(e.item.imgUrl) : e.master?.imgUrl || '';
      const temp = noMaster && e.item.temporary;
      form = `<div class="hub-fill" data-hub-key="${context.esc(e.key)}">
        ${fillRow('商品名稱', 'name', nameOf(e), {manual: manual.has('name') || (temp && !!nameOf(e)), placeholder: '輸入商品名稱'})}
        ${fillRow('圖片網址', 'imgUrl', imgValue, {manual: manual.has('imgUrl') || (temp && !!imgValue), placeholder: 'https://…', type: 'url', hint: noMaster && img && !imgValue ? '目前用的是上傳的照片。' : ''})}
        ${e.item.noCode || piOnly(e) ? fillRow('Item Code', 'itemCode', '', {placeholder: '例如 AKAG050', hint: noMaster ? '有 Item Code 就會建立主檔；沒填的話，名稱和圖片網址先存成暫填。' : ''}) : ''}
        ${!barcodeOf(e) ? fillRow('Barcode', 'barcode', '', {manual: manual.has('barcode'), placeholder: '8–14 位數字'}) : `<div class="hub-field"><span class="hub-label">Barcode${manual.has('barcode') ? ' <span class="tag hub-temp">暫填</span>' : ''}</span><div>${context.esc(barcodeOf(e))}</div></div>`}
        <div class="row hub-actions"><button type="button" class="primary" data-hub-save="next">儲存並到下一個待補</button><button type="button" data-hub-save="stay">儲存</button>${noMaster ? `<button type="button" data-hub-temp="${context.esc(i.barcode)}">上傳照片…</button><button type="button" data-hub-match="${context.esc(i.barcode)}">配對既有主檔</button>` : ''}</div>
        <div class="hub-status ${view.statusKind}" role="status" aria-live="polite">${context.esc(view.status)}</div>
        <p class="mini muted">在名稱或網址欄按 Enter ＝ 儲存並到下一個。補的資料是暫填：下次匯入主檔時，主檔有值的欄位會直接覆蓋；主檔空白則保留你補的。</p>
      </div>`;
    }
    context.$('hubDrawerBody').innerHTML = `<div class="hub-photo-big">${img ? `<img src="${context.esc(img)}" alt="商品圖片" data-hub-preview>` : '<div class="hub-photo-empty" data-hub-preview-empty>沒有圖片</div><img alt="商品圖片預覽" data-hub-preview hidden>'}</div>${missing}${form}`;
    // Order settings reuse the 訂貨設定 change handler (product-management.js).
    const settingsBox = context.$('hubDrawerSettings');
    if (i.noCode) settingsBox.innerHTML = '<h4>訂貨設定</h4><p class="mini muted">補上 Item Code 後才能設定貨別與訂貨狀態。</p>';
    else settingsBox.innerHTML = `<h4>訂貨設定</h4><div class="hub-grid"><label><span class="hub-label">貨別${i.kindFromContainer ? ' <span class="mini muted">（依貨櫃號碼判斷）</span>' : ''}</span>${context.kindSelect(i)}</label><label><span class="hub-label">訂貨狀態</span>${context.statusSelect(i)}</label><label><span class="hub-label">最高庫存（採購單位）</span><input type="number" min="0" step="any" data-edit="maxStock" data-code="${context.esc(i.code)}" value="${context.val(i, 'maxStock') ?? ''}" placeholder="待設定"></label><label><span class="hub-label">保存期限（月）</span><input type="number" min="1" max="120" step="1" data-edit="shelfLifeMonths" data-code="${context.esc(i.code)}" value="${context.shelfLife(i) ?? ''}" placeholder="未設定" ${context.plannerRole === 'viewer' || context.shelfLife(i) !== null ? 'disabled' : ''}></label></div>`;
    let extra = '';
    if (!i.noCode) {
      const info = context.factorInfo(i), inv = context.state.inventory?.[i.code];
      extra += `<div class="hub-section"><h4>庫存與單位</h4><p>MYOB 庫存：<b>${inv ? context.fmt(inv.stock) : '未配對'}</b> · 採購單位：${context.esc(i.custom || '—')} · 換算：${context.esc(context.factor(i) ?? '待確認')}${needsMyob(e) ? '<br><span class="mini muted">MYOB 未配對或換算待確認，需重新匯入 MYOB 才能補。</span>' : ''}${info.source !== 'MYOB' ? '' : ''}</p></div>`;
      const transit = context.incoming(i, '', '');
      extra += `<div class="hub-section"><h4>在途</h4>${transit.details.length ? `<table class="hub-mini-table"><tbody>${transit.details.map(t => `<tr><td>${context.esc(t.container)}</td><td>${t.pending ? '處理中' : context.esc(dmy(t.eta) || '待定')}</td><td class="right">${context.fmt(t.qty)} 箱</td></tr>`).join('')}</tbody></table>` : '<p class="mini muted">目前沒有在途或處理中。</p>'}</div>`;
      const p = protection(e);
      extra += `<div class="hub-section"><h4>客找保護</h4>${p ? `<p>${context.esc(p.store)} 保護到 ${context.esc(dmy(p.expiresOn))}</p>` : '<p class="mini muted">沒有保護中的店家。</p>'}</div>`;
    }
    {
      const o = originOf(e);
      extra = `<div class="hub-section"><h4>來源</h4>${originTags(e)}<p class="mini muted">${o.master ? '商品主檔有這個商品。' : o.seed ? '只在網站內建清單（整理 Excel），主檔沒有。' : '主檔和內建清單都沒有，只出現在 PI。'}${o.newArrival ? ' 還沒到櫃的新品，資料通常要等主檔匯入或手動暫填。' : ''}</p>${o.pis.length ? `<ul class="hub-pi-list">${o.pis.map(p => `<li>${context.esc(piText(p))}${p.isFinal ? ' · Final' : ''}</li>`).join('')}</ul>` : ''}</div>` + extra;
    }
    if (admin && (i.sources || []).includes('整理 Excel')) {
      const others = (i.sources || []).filter(x => x !== '整理 Excel');
      extra += `<div class="hub-section"><h4>內建清單</h4><p class="mini muted">這個商品來自網站內建的「整理 Excel」清單。${others.length ? `它也出現在 ${context.esc(others.join('、'))}，隱藏後仍會顯示。` : '隱藏後就不會出現在訂貨規劃；可在「已隱藏」取消。'}</p><button type="button" data-hub-hide="${context.esc(i.code)}">從內建清單隱藏</button></div>`;
    }
    const history = (i.history || []).slice(-12).reverse();
    extra += `<div class="hub-section"><h4>訂貨紀錄</h4>${history.length ? `<table class="hub-mini-table"><thead><tr><th>貨櫃</th><th class="right">箱數</th><th class="right">價格（¥）</th></tr></thead><tbody>${history.map(h => `<tr><td>${context.esc(h.container)}</td><td class="right">${h.qty == null ? '報價' : context.fmt(h.qty)}</td><td class="right">${context.fmt(h.price)}</td></tr>`).join('')}</tbody></table>` : '<p class="mini muted">尚無訂貨紀錄。</p>'}</div>`;
    context.$('hubDrawerExtra').innerHTML = extra;
  };

  context.renderProductHub = function renderProductHub() {
    originCache.clear();
    const all = entries(), list = filtered();
    const count = (dim, value) => {
      if (dim === 'special') return source(value === 'hidden' ? 'hidden' : '').filter(e => matches(e, 'special') && passes(e, 'special', value)).length;
      return source().filter(e => matches(e, dim) && passes(e, dim, value)).length;
    };
    context.$('hubFilters').innerHTML = GROUPS.map(([dim, title, options]) => `<div class="hub-filter-group"><span class="hub-filter-title">${title}</span>${options.map(([value, label]) => { const on = view[dim] === value; return `<button type="button" data-hub-dim="${dim}" data-hub-val="${context.esc(value)}" class="${on ? 'active' : ''}" aria-pressed="${on}">${label} <span class="count">${count(dim, value)}</span></button>`; }).join('')}</div>`).join('');
    context.$('hubReasons').innerHTML = `<span class="mini muted hub-myob-note">「需匯入 MYOB」（MYOB 未配對或換算待確認）另外標示，不算待補：目前篩選中 ${list.filter(needsMyob).length} 款。</span>`;
    context.$('hubCount').textContent = `顯示 ${Math.min(list.length, view.limit)} / ${list.length} 款`;
    context.$('hubRows').innerHTML = list.slice(0, view.limit).map(e => {
      const img = photoOf(e), miss = issues(e);
      return `<tr data-hub-open="${context.esc(e.key)}" class="${view.open === e.key ? 'hub-selected' : ''}" tabindex="0"><td class="hub-photo-col">${img ? `<img src="${context.esc(img)}" alt="" loading="lazy">` : '<span class="hub-photo-none">無圖</span>'}</td><td><b>${context.esc(codeLabel(e))}</b><div>${context.esc(nameOf(e) || '（未命名）')}</div><div class="mini muted">${context.esc(barcodeOf(e) || '缺少 Barcode')}</div>${originTags(e)}</td><td>${kindLabel(e.item.kind)}</td><td>${e.item.noCode ? '—' : statusLabel(e.item.availability)}</td><td class="right">${e.item.noCode || piOnly(e) ? '—' : context.fmt(e.item.stock)}</td><td>${miss.map(m => `<span class="tag hub-issue">${context.esc(m)}</span>`).join(' ')}${needsMyob(e) ? ' <span class="tag hub-myob">需匯入 MYOB</span>' : ''}${protection(e) ? ' <span class="tag hub-protect">客找保護</span>' : ''}${!miss.length && !needsMyob(e) ? '<span class="mini muted">完整</span>' : ''}</td></tr>`;
    }).join('') || `<tr><td colspan="6" class="empty">${view.need !== 'all' ? '這個篩選下沒有要補的商品 🎉' : '沒有符合的商品。'}</td></tr>`;
    context.$('hubMore').innerHTML = list.length > view.limit ? `<button type="button" data-hub-more>再顯示 ${Math.min(150, list.length - view.limit)} 款</button>` : '';
    const pool = view.special === 'hidden' ? [...all, ...hiddenEntries()] : all;
    let current = view.open ? pool.find(e => e.key === view.open) : null;
    if (view.open && !current && view.openBarcode && !String(view.open).startsWith('HIDDEN:')) current = all.find(e => barcodeOf(e) === view.openBarcode) || null;
    if (current) { view.open = current.key; } else view.open = '';
    renderDrawer(current);
  };

  api.hubOpen = (key, {keepStatus = false} = {}) => {
    const e = [...entries(), ...hiddenEntries()].find(x => x.key === key);
    view.open = e ? key : '';
    view.openBarcode = e ? barcodeOf(e) || String(e.item.barcode || '') : '';
    view.renderedKey = '';
    if (!keepStatus) { view.status = ''; view.statusKind = ''; }
    context.renderProductHub();
    if (e) setTimeout(() => context.$('hubDrawer').querySelector('.hub-missing input,[data-fill]')?.focus({preventScroll: true}), 0);
  };
  api.hubNextKey = key => {
    const list = filtered().filter(e => issues(e).length);
    const at = list.findIndex(e => e.key === key);
    const rest = at >= 0 ? [...list.slice(at + 1), ...list.slice(0, at)] : list;
    return rest.find(e => e.key !== key)?.key || '';
  };
  api.hubSave = next => {
    const box = context.$('hubDrawer').querySelector('.hub-fill');
    if (!box || view.pendingRequest) return;
    const e = entries().find(x => x.key === box.dataset.hubKey);
    if (!e) return;
    const fields = {};
    box.querySelectorAll('[data-fill]').forEach(input => { fields[input.dataset.fill] = input.value; });
    if (!fields.itemCode) delete fields.itemCode;
    // A product known only from the built-in list has no master record yet: create one under its own code.
    if (!e.master && !e.item.noCode && !piOnly(e)) fields.itemCode = e.item.code;
    if (!fields.barcode) delete fields.barcode;
    const requestId = crypto.randomUUID();
    // A PI-only product without an Item Code keeps its name / image as a temporary fill.
    const temporary = piOnly(e) && !e.master && !fields.itemCode;
    if (temporary && fields.imgUrl && !/^https:\/\//i.test(fields.imgUrl.trim())) {
      view.status = '圖片請貼 https:// 開頭的網址'; view.statusKind = 'bad'; view.renderedKey = ''; renderDrawer(e); return;
    }
    view.pendingRequest = requestId;
    view.next = next ? api.hubNextKey(e.key) : '';
    view.status = '儲存中…'; view.statusKind = 'pending';
    const status = box.querySelector('.hub-status');
    if (status) { status.textContent = view.status; status.className = 'hub-status pending'; }
    if (temporary) window.parent.postMessage({type: 'KAISI_PI_TEMP_SAVE', requestId, barcode: String(e.item.barcode || ''), name: fields.name || '', imgUrl: (fields.imgUrl || '').trim()}, '*');
    else window.parent.postMessage({type: 'KAISI_MASTER_FILL', requestId, masterKey: e.master?.masterKey || '', barcode: String(e.item.barcode || ''), fields}, '*');
  };
  api.hubResult = m => {
    if (m.requestId !== view.pendingRequest) return;
    view.pendingRequest = '';
    if (!m.ok) { view.status = '未儲存：' + (m.error || '請重試'); view.statusKind = 'bad'; const s = context.$('hubDrawer').querySelector('.hub-status'); if (s) { s.textContent = view.status; s.className = 'hub-status bad'; } return; }
    view.status = m.changed?.length ? '已儲存。' : '沒有變更。'; view.statusKind = 'ok';
    if (view.next) { const nextKey = view.next; view.next = ''; api.hubOpen(nextKey, {keepStatus: true}); }
    else { view.renderedKey = ''; context.renderProductHub(); }
  };
  api.hubView = view;
}

export function initialize(context) {
  const hub = context.$('productHub');
  hub.addEventListener('click', e => {
    const t = e.target.closest('[data-hub-dim],[data-hub-more],[data-hub-open],#hubDrawerClose,[data-hub-save],[data-hub-temp],[data-hub-match],[data-hub-hide],[data-hub-unhide]');
    if (!t) return;
    const view = api.hubView;
    if (t.dataset.hubDim) {
      const dim = t.dataset.hubDim, value = t.dataset.hubVal;
      view[dim] = dim === 'special' && view.special === value ? '' : value;
      view.limit = 150; context.renderProductHub();
    }
    else if (t.hasAttribute('data-hub-more')) { view.limit += 150; context.renderProductHub(); }
    else if (t.id === 'hubDrawerClose') { view.open = ''; view.openBarcode = ''; context.renderProductHub(); }
    else if (t.dataset.hubHide) {
      if (context.plannerRole !== 'admin' || !confirm(`把 ${t.dataset.hubHide} 從內建清單隱藏？可在「已隱藏」取消。`)) return;
      const next = api.hubNextKey(t.dataset.hubHide);
      context.saveCatalogPatch({items: {[t.dataset.hubHide]: {hiddenSeed: true}}});
      view.open = next; view.openBarcode = ''; view.renderedKey = ''; context.renderProductHub();
    } else if (t.dataset.hubUnhide) {
      if (context.plannerRole !== 'admin') return;
      context.saveCatalogPatch({items: {[t.dataset.hubUnhide]: {hiddenSeed: false}}});
      view.open = ''; context.renderProductHub();
    }
    else if (t.dataset.hubSave) api.hubSave(t.dataset.hubSave === 'next');
    else if (t.dataset.hubTemp) { view.status = ''; view.statusKind = ''; const s = hub.querySelector('.hub-status'); if (s) s.textContent = ''; }
    if (t.dataset.hubTemp) window.parent.postMessage({type: 'KAISI_PI_TEMP_EDIT', barcode: t.dataset.hubTemp}, '*');
    else if (t.dataset.hubMatch) window.parent.postMessage({type: 'KAISI_PI_MATCH', barcode: t.dataset.hubMatch}, '*');
    else if (t.dataset.hubOpen && !e.target.closest('#hubDrawer')) api.hubOpen(t.dataset.hubOpen);
  });
  hub.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('[data-hub-open]')) { e.preventDefault(); api.hubOpen(e.target.dataset.hubOpen); }
    if (e.key === 'Enter' && e.target.matches('[data-fill]')) { e.preventDefault(); api.hubSave(true); }
    if (e.key === 'Escape' && api.hubView.open) { api.hubView.open = ''; context.renderProductHub(); }
  });
  hub.addEventListener('input', e => {
    if (e.target.dataset.fill !== 'imgUrl') return;
    const img = hub.querySelector('[data-hub-preview]'), empty = hub.querySelector('[data-hub-preview-empty]'), url = e.target.value.trim();
    if (!img) return;
    if (/^https:\/\//i.test(url)) { img.src = url; img.hidden = false; if (empty) empty.hidden = true; }
  });
  context.events.onMessage(e => {
    if (e.source !== window.parent || e.data?.type !== 'KAISI_MASTER_FILL_RESULT') return;
    api.hubResult(e.data);
  });
  try {
    window.parent.addEventListener('scroll', () => api.positionHubDrawer(), {passive: true});
    window.parent.addEventListener('resize', () => api.positionHubDrawer());
  } catch {}
}
