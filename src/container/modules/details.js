// container: details. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "details",
  "owns": [],
  "imports": ["$", "D", "dateInfo", "esc", "money", "piStats", "stage"],
  "writes": []
};
export function register(context) {}
export function initialize(context) {
  window.openDrawer = id => {
    let c = context.D.containers.find(x => x.id === id);
    if (!c) return;
    let ps = context.piStats(c),
      n = context.D.settings.checklist.filter(x => c.checks[x]).length;
    let dates = context.dateInfo(c),
      timeline = [['Expected Month', c.expectedMonth], ['到港日', dates.portDate || (!dates.unloadDate ? dates.estimated + '（15日推估）' : '')], ['拆櫃日', dates.unloadDate]];
    context.$('drawerBody').innerHTML = `<div class="drawer-head"><div><div class="drawer-code">${context.esc(c.code || '—')}</div><div class="tiny">${context.esc(c.supplier || '—')} · ${context.esc(c.type || '—')} · ${context.esc(context.stage(c))}</div></div><button class="soft" onclick="closeDrawer()">✕</button></div><div class="drawer-content"><div class="drawer-section"><h4>🚢 到港／拆櫃</h4><div class="drawer-grid">${timeline.map(([k, v]) => `<div class="drawer-kv"><span>${k}</span><b>${context.esc(v || '—')}</b></div>`).join('')}</div></div><div class="drawer-section"><h4>¥ Payment</h4><div class="drawer-grid"><div class="drawer-kv"><span>Deposit</span><b>${c.depositPaid ? '✓ Paid' : 'Pending'}</b></div><div class="drawer-kv"><span>Balance</span><b>${c.balancePaid ? '✓ Paid' : 'Pending'}</b></div><div class="drawer-kv"><span>Total JPY</span><b>${context.money(c.total)}</b></div><div class="drawer-kv"><span>Final Container List</span><b>${c.finalListReceived ? '✓ ' + context.esc(c.finalListDate || 'Received') : 'Pending'}</b></div></div></div><div class="drawer-section"><h4>📦 Japan Price Tracker / Final PI</h4>${ps.exists ? `<div><span class="mini-state ${ps.isFinal ? 'ok' : 'warn'}">${ps.isFinal ? '✓ FINAL PI' : '⚠ PI NOT FINAL'}</span></div><div class="drawer-grid" style="margin-top:10px"><div class="drawer-kv"><span>Items</span><b>${ps.items}</b></div><div class="drawer-kv"><span>Total CTN</span><b>${ps.ctn.toLocaleString()}</b></div></div>` : '<div class="tiny">尚未建立 Final PI</div>'}</div><div class="drawer-section"><h4>✓ Checklist · ${n}/${context.D.settings.checklist.length}</h4>${context.D.settings.checklist.map(x => `<div class="check-mini"><span>${context.esc(x)}</span><b>${c.checks[x] ? '✓' : '○'}</b></div>`).join('')}</div>${c.notes ? `<div class="drawer-section"><h4>📝 Notes</h4><div style="white-space:pre-wrap;font-size:12px">${context.esc(c.notes)}</div></div>` : ''}<div class="drawer-actions"><button class="pri" onclick="closeDrawer();editC('${c.id}')">編輯完整資料</button><button class="soft" onclick="closeDrawer()">關閉</button></div></div>`;
    context.$('quickDrawer').classList.add('show');
    context.$('quickDrawerBackdrop').classList.add('show');
  };
  window.closeDrawer = () => {
    context.$('quickDrawer').classList.remove('show');
    context.$('quickDrawerBackdrop').classList.remove('show');
  };
}
