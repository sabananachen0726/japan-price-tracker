import {brisbaneDate} from '../shared/customer-protection.js';
import {parseProtectionPaste, planProtectionBatch} from '../shared/protection-batch.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dmy = iso => iso ? iso.split('-').reverse().join('/') : '';
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// 客找商品保護 lives in 商品管理 as its own page: bulk paste, preview, one save.
export function installProtectionManager(context) {
  let data = {}, plan = [], busy = false, listMode = 'active';
  const view = document.createElement('section');
  view.id = 'protectionView';
  view.className = 'protection-view';
  view.innerHTML = `
  <div class="card p-4 mb-3">
    <div class="protect-head">
      <div><h4 class="mb-1">客找商品保護</h4>
        <p class="text-muted small mb-0">客戶確認找貨日起 4 個曆月內，寫貨人員看得到商品但不能下訂；到期當天（Brisbane）自動可訂。同一品號同時只保護一家店。</p></div>
      <div class="protect-stats" data-stats></div>
    </div>
    <p class="protect-locked alert alert-warning small mb-0 mt-3" data-locked hidden>請在 LIVE 模式使用 Admin 帳號管理客找保護。</p>
    <form class="protect-batch mt-3" data-batch>
      <div class="protect-fields">
        <div class="protect-action" role="radiogroup" aria-label="操作">
          <label><input type="radio" name="action" value="register" checked><span>新登記</span></label>
          <label><input type="radio" name="action" value="renew"><span>續訂（新一批）</span></label>
        </div>
        <label class="form-label mb-0" data-store-field>店家名稱<input name="store" class="form-control" maxlength="120" placeholder="例如 Lara"></label>
        <label class="form-label mb-0">客戶確認日<input name="date" type="date" class="form-control"></label>
      </div>
      <label class="form-label mt-3 mb-1" for="protectPaste">貼上料號</label>
      <textarea id="protectPaste" name="codes" class="form-control font-monospace" rows="6" spellcheck="false" placeholder="ACE005
ACE006
ACE007"></textarea>
      <div class="form-text">可直接從 Excel 貼整欄料號，一行一個；也可用逗號或空白分隔。若每列店家或日期不同，貼三欄：<b>料號</b>⇥<b>店家</b>⇥<b>確認日（DD/MM/YYYY）</b>，空白欄沿用上方設定。</div>
      <div class="d-flex gap-2 mt-3 flex-wrap"><button type="submit" class="btn btn-primary">預覽</button><button type="button" class="btn btn-outline-secondary" data-clear>清空</button></div>
    </form>
    <div class="protect-preview mt-3" data-preview hidden>
      <div class="protect-preview-head"><strong data-preview-summary></strong></div>
      <div class="table-responsive"><table class="table table-sm align-middle mb-2"><thead><tr><th>料號</th><th>商品</th><th>店家</th><th>確認日</th><th>結果</th></tr></thead><tbody data-preview-rows></tbody></table></div>
      <div class="d-flex gap-2 flex-wrap"><button type="button" class="btn btn-primary" data-save disabled>確認儲存</button><button type="button" class="btn btn-outline-secondary" data-cancel>返回修改</button></div>
    </div>
    <p class="small mt-2 mb-0" role="status" aria-live="polite" data-status></p>
  </div>
  <div class="card p-4 mb-3">
    <h5 class="mb-1">單次放行</h5>
    <p class="text-muted small">保護期間若要讓某家店在某一櫃訂貨，Admin 核准一次：綁定 店家＋櫃號＋料號＋核准箱數。提交成功後只核銷一次，商品仍維持保護。</p>
    <form class="protect-pass" data-pass>
      <label class="form-label mb-0">料號<input name="code" class="form-control" maxlength="60" required></label>
      <label class="form-label mb-0">櫃號<input name="container" class="form-control" maxlength="60" required></label>
      <label class="form-label mb-0">核准箱數<input name="boxes" type="number" min="1" step="1" class="form-control" required></label>
      <label class="form-label mb-0 protect-reason">理由<input name="reason" class="form-control" maxlength="300" required></label>
      <button type="submit" class="btn btn-outline-primary">核准放行</button>
    </form>
    <p class="small mt-2 mb-0" role="status" aria-live="polite" data-pass-status></p>
  </div>
  <div class="card p-4">
    <div class="protect-list-head">
      <div class="workspace-subnav mb-0" role="tablist"><button type="button" class="btn active" data-list="active">保護中</button><button type="button" class="btn" data-list="expired">已到期</button></div>
      <input class="form-control" data-filter placeholder="搜尋料號、商品或店家">
    </div>
    <div class="table-responsive mt-3"><table class="table align-middle protect-table"><thead><tr><th>料號／商品</th><th>店家</th><th>確認日</th><th>可訂日</th><th>操作</th></tr></thead><tbody data-rows></tbody></table></div>
  </div>`;

  const $ = s => view.querySelector(s);
  const batch = $('[data-batch]'), pass = $('[data-pass]');
  const permitted = () => context.isAdmin() && context.currentDataMode === 'live';
  const productName = code => {
    const app = window.appData || {};
    const barcode = app.itemToBarcode?.[code];
    return barcode ? app.products?.[barcode]?.name || '' : '';
  };
  const action = () => batch.elements.action.value;

  function stats() {
    const today = brisbaneDate(), entries = Object.values(data.protections || {});
    const active = entries.filter(p => p.expiresOn > today);
    const soon = active.filter(p => daysBetween(today, p.expiresOn) <= 30).length;
    $('[data-stats]').innerHTML = `<span><b>${active.length}</b> 保護中</span><span><b>${soon}</b> 30 天內可訂</span><span><b>${entries.length - active.length}</b> 已到期</span>`;
  }

  function list() {
    const today = brisbaneDate(), query = $('[data-filter]').value.trim().toLowerCase();
    const records = Object.entries(data.protections || {})
      .filter(([, p]) => (p.expiresOn > today) === (listMode === 'active'))
      .filter(([code, p]) => !query || [code, productName(code), p.store].join(' ').toLowerCase().includes(query))
      .sort((a, b) => listMode === 'active' ? a[1].expiresOn.localeCompare(b[1].expiresOn) : b[1].expiresOn.localeCompare(a[1].expiresOn));
    const passes = Object.values(data.passes || {});
    $('[data-rows]').innerHTML = records.map(([code, p]) => {
      const left = daysBetween(today, p.expiresOn);
      const history = [...(p.history || [])].reverse().map(h => `<li>${esc(h.store)} · 確認 ${dmy(h.confirmedOn)} → ${dmy(h.expiresOn)} 可訂</li>`).join('');
      const used = passes.filter(x => x.code === code).map(x => `<li>放行 ${esc(x.store)} · ${esc(x.container)} · ${x.boxes} 箱 · ${x.usedAt ? '已核銷' : '未使用'} · ${esc(x.reason)}</li>`).join('');
      return `<tr><td><strong class="text-primary">${esc(code)}</strong><div class="small text-muted">${esc(productName(code)) || '主檔查無此料號'}</div>
        ${history || used ? `<details class="small mt-1"><summary>紀錄（${(p.history || []).length} 次確認${used ? '、含放行' : ''}）</summary><ul class="mb-0 ps-3">${history}${used}</ul></details>` : ''}</td>
        <td>${esc(p.store)}</td><td>${dmy(p.confirmedOn)}</td>
        <td><strong>${dmy(p.expiresOn)}</strong>${listMode === 'active' ? `<div class="small ${left <= 30 ? 'text-warning' : 'text-muted'}">還有 ${left} 天</div>` : ''}</td>
        <td class="text-nowrap"><button type="button" class="btn btn-sm btn-outline-primary" data-renew="${esc(code)}">續訂</button>${listMode === 'active' ? ` <button type="button" class="btn btn-sm btn-outline-secondary" data-pass-for="${esc(code)}">放行</button>` : ''}</td></tr>`;
    }).join('') || `<tr><td colspan="5" class="text-muted text-center py-4">${query ? '沒有符合的紀錄' : listMode === 'active' ? '目前沒有保護中的料號' : '沒有已到期的紀錄'}</td></tr>`;
  }

  function fields() {
    const renew = action() === 'renew';
    $('[data-store-field]').hidden = renew;
    batch.elements.store.required = !renew;
    hidePreview();
  }
  function hidePreview() { plan = []; $('[data-preview]').hidden = true; $('[data-save]').disabled = true; }
  const status = text => { $('[data-status]').textContent = text; };

  async function refresh() {
    if (!permitted()) { $('[data-locked]').hidden = false; return; }
    $('[data-locked]').hidden = true;
    const snap = await context.getDoc(context.PROD_DOC_REF);
    if (!permitted()) return;
    data = snap.data()?.customerProtection || {};
    stats(); list();
  }

  function preview() {
    const today = brisbaneDate();
    const store = batch.elements.store.value.trim(), confirmedOn = batch.elements.date.value;
    const rows = parseProtectionPaste(batch.elements.codes.value, {store, confirmedOn});
    if (!rows.length) { hidePreview(); status('請先貼上料號。'); return; }
    plan = planProtectionBatch(rows, data.protections, today, action());
    const ok = plan.filter(r => r.ok).length, bad = plan.length - ok;
    $('[data-preview-summary]').textContent = `共 ${plan.length} 筆：可儲存 ${ok} 筆${bad ? `，${bad} 筆不會儲存（見下方原因）` : ''}`;
    $('[data-preview-rows]').innerHTML = plan.map(r => `<tr class="${r.ok ? '' : 'protect-row-bad'}"><td><strong>${esc(r.code)}</strong></td><td class="small">${esc(productName(r.code)) || '<span class="text-muted">主檔查無</span>'}</td><td>${esc(r.store)}</td><td>${dmy(r.confirmedOn) || '<span class="text-danger">未填</span>'}</td><td class="small ${r.ok ? 'text-success' : 'text-danger'}">${r.ok ? '✓ ' : '✕ '}${esc(r.message)}</td></tr>`).join('');
    $('[data-preview]').hidden = false;
    $('[data-save]').disabled = !ok;
    $('[data-save]').textContent = ok ? `確認儲存 ${ok} 筆` : '沒有可儲存的資料';
    status('');
  }

  async function save() {
    const chosen = plan.filter(r => r.ok);
    if (busy || !chosen.length || !permitted()) return;
    const uid = context.auth.currentUser.uid, today = brisbaneDate(), kind = action();
    busy = true; $('[data-save]').disabled = true; status('儲存中…');
    try {
      await context.runTransaction(context.db, async tx => {
        const snap = await tx.get(context.PROD_DOC_REF);
        if (!permitted() || context.auth.currentUser?.uid !== uid) throw Error('帳號或模式已變更，未儲存');
        const fresh = planProtectionBatch(chosen.map(({code, store, confirmedOn, dateText}) => ({code, store, confirmedOn, dateText})),
          snap.data()?.customerProtection?.protections || {}, today, kind);
        const stale = fresh.filter(r => !r.ok);
        if (stale.length) throw Error('資料已被其他人更新，請重新預覽：' + stale.map(r => `${r.code}（${r.message}）`).join('、'));
        const payload = {}, mergeFields = [];
        for (const r of fresh) { payload[r.code] = r.next; mergeFields.push(new context.FieldPath('customerProtection', 'protections', r.code)); }
        tx.set(context.PROD_DOC_REF, {customerProtection: {protections: payload}}, {mergeFields});
      });
      status(`已儲存 ${chosen.length} 筆客找保護。`);
      batch.elements.codes.value = ''; hidePreview();
      await refresh();
    } catch (err) {
      status('儲存失敗，資料未變更：' + err.message);
      $('[data-save]').disabled = false;
    } finally { busy = false; }
  }

  async function savePass(e) {
    e.preventDefault();
    const out = $('[data-pass-status]');
    if (busy || !permitted()) { out.textContent = '請在 LIVE 模式使用 Admin 帳號。'; return; }
    const f = new FormData(pass), item = String(f.get('code') || '').trim().toUpperCase(), uid = context.auth.currentUser.uid, today = brisbaneDate();
    const container = context.normalizeContainerNo(f.get('container')), boxes = Number(f.get('boxes')), reason = String(f.get('reason') || '').trim();
    if (!/^[A-Z0-9_-]{1,60}$/.test(item) || item.startsWith('__')) { out.textContent = '料號格式不正確'; return; }
    const id = crypto.randomUUID();
    busy = true; out.textContent = '儲存中…';
    try {
      await context.runTransaction(context.db, async tx => {
        const snap = await tx.get(context.PROD_DOC_REF);
        if (!permitted() || context.auth.currentUser?.uid !== uid) throw Error('帳號或模式已變更');
        const d = snap.data()?.customerProtection || {}, prior = d.protections?.[item];
        if (!prior || prior.expiresOn <= today) throw Error('該料號沒有生效中的保護');
        if (!container || !Number.isSafeInteger(boxes) || boxes < 1 || !reason) throw Error('請確認櫃號、箱數和放行理由');
        if (Object.values(d.passes || {}).some(p => !p.usedAt && p.code === item && p.container === container && p.confirmedOn === prior.confirmedOn)) throw Error('此料號和櫃號已有未使用的放行');
        const next = {id, code: item, container, boxes, reason, store: prior.store, confirmedOn: prior.confirmedOn, issuedBy: uid};
        tx.set(context.PROD_DOC_REF, {customerProtection: {passes: {[id]: next}}}, {mergeFields: [new context.FieldPath('customerProtection', 'passes', id)]});
      });
      out.textContent = `已核准 ${item} 在 ${container} 訂 ${boxes} 箱。`;
      pass.reset(); await refresh();
    } catch (err) { out.textContent = '未儲存：' + err.message; }
    finally { busy = false; }
  }

  batch.addEventListener('submit', e => { e.preventDefault(); preview(); });
  batch.addEventListener('change', e => { if (e.target.name === 'action') fields(); else if (!$('[data-preview]').hidden) hidePreview(); });
  batch.elements.codes.addEventListener('input', () => { if (!$('[data-preview]').hidden) hidePreview(); });
  $('[data-clear]').onclick = () => { batch.elements.codes.value = ''; hidePreview(); status(''); };
  $('[data-cancel]').onclick = () => { hidePreview(); batch.elements.codes.focus(); };
  $('[data-save]').onclick = save;
  pass.addEventListener('submit', savePass);
  $('[data-filter]').addEventListener('input', list);
  view.querySelectorAll('[data-list]').forEach(b => b.onclick = () => {
    listMode = b.dataset.list; view.querySelectorAll('[data-list]').forEach(x => x.classList.toggle('active', x === b)); list();
  });
  view.addEventListener('click', e => {
    const renew = e.target.closest('[data-renew]'), passFor = e.target.closest('[data-pass-for]');
    if (renew) {
      batch.elements.action.value = 'renew'; fields();
      batch.elements.codes.value = renew.dataset.renew; batch.elements.date.value = brisbaneDate();
      batch.scrollIntoView({behavior: 'smooth', block: 'center'}); batch.elements.date.focus();
    }
    if (passFor) { pass.elements.code.value = passFor.dataset.passFor; pass.scrollIntoView({behavior: 'smooth', block: 'center'}); pass.elements.container.focus(); }
  });

  function mount() {
    const panel = document.getElementById('settings-panel'), nav = panel?.querySelector('.workspace-subnav');
    if (!panel || !nav) return false;
    if (!nav.querySelector('[data-product-view="protect"]')) {
      const b = document.createElement('button');
      b.className = 'btn btn-outline-primary'; b.dataset.productView = 'protect'; b.textContent = '客找保護';
      b.onclick = () => context.chooseProductView412('protect');
      nav.append(b);
    }
    if (!view.isConnected) panel.append(view);
    batch.elements.date.value ||= brisbaneDate();
    return true;
  }
  if (!mount()) {
    const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); });
    observer.observe(document.documentElement, {childList: true, subtree: true});
  }
  document.addEventListener('kaisi:product-view', e => {
    if (e.detail !== 'protect') return;
    status(''); refresh().catch(err => status('讀取失敗：' + err.message));
  });
  // Other pages can link here, e.g. from the import centre.
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-open-protection]')) return;
    bootstrap.Tab.getOrCreateInstance(document.getElementById('settings-tab')).show();
    setTimeout(() => context.chooseProductView412('protect'), 0);
  });
}
