// Before a PI is saved: which 處理中 lines it takes, confirmed by the Admin.
import {planPiCoverage, summarizeMatches} from '../shared/purchase-pool.js';
import {createProductResolver} from '../shared/product-identity.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export function piPoolPlan(appData, pool, groups, links = {}) {
  const resolve = createProductResolver({...appData, piProductLinks: {...(appData.piProductLinks || {}), ...links}});
  let current = {requests: {...(pool?.requests || {})}};
  const updates = {}, summary = [], at = new Date().toISOString();
  for (const g of groups) {
    const totals = {};
    for (const r of g.rows || []) {
      const key = String(resolve(r).key || '').toUpperCase(), qty = Number(r.qty) || 0;
      if (key && qty > 0) totals[key] = (totals[key] || 0) + qty;
    }
    const plan = planPiCoverage(current, g.container, totals, {at});
    Object.assign(updates, plan.updates);
    current = {requests: {...current.requests, ...plan.updates}};
    summary.push({container: g.container, matches: summarizeMatches(plan.matches), reverted: Object.keys(plan.updates).length > 0 && !plan.matches.length});
  }
  return {updates, summary};
}

// Resolves to 'apply' | 'skip' | 'cancel'.
export function reviewPiPool(plan) {
  if (!Object.keys(plan.updates).length) return Promise.resolve('apply');
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'pi-pool-dialog';
    dialog.id = 'piPoolDialog';
    const rows = plan.summary.map(s => `<li><b>${esc(s.container)}</b>：${s.matches.length ? s.matches.map(m => `${esc(m.request)} ${m.items} 項／${m.qty.toLocaleString()} 箱`).join('、') : '沒有對到處理中的品項'}</li>`).join('');
    dialog.innerHTML = `<h3>這份 PI 對到「處理中」的品項</h3><p>匯入後，下面這些箱數會從處理中劃掉（同櫃重新匯入會以新版本重新計算）。PI 箱數少於業務單時，差額會留在處理中。</p><ul>${rows}</ul><div class="pi-pool-actions"><button type="button" class="btn btn-primary" data-pool="apply">劃掉並匯入 PI</button><button type="button" class="btn btn-outline-secondary" data-pool="skip">只匯入 PI，不劃掉</button><button type="button" class="btn btn-link" data-pool="cancel">取消匯入</button></div>`;
    const finish = choice => { dialog.close(); dialog.remove(); resolve(choice); };
    dialog.addEventListener('click', e => { const c = e.target.closest('[data-pool]')?.dataset.pool; if (c) finish(c); });
    dialog.addEventListener('cancel', e => { e.preventDefault(); finish('cancel'); });
    document.body.append(dialog);
    dialog.showModal();
  });
}
