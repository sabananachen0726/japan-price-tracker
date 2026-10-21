// planner: product-details. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "product-details",
  "owns": [{
    "name": "currentPiTipTrigger",
    "kind": "let"
  }, {
    "name": "closePiTip",
    "kind": "function"
  }, {
    "name": "formatTransitEta",
    "kind": "function"
  }, {
    "name": "showPiDetails",
    "kind": "function"
  }, {
    "name": "setInactive",
    "kind": "function"
  }, {
    "name": "currentPhotoTrigger",
    "kind": "let"
  }, {
    "name": "closePhotoPreview",
    "kind": "function"
  }, {
    "name": "showPhotoPreview",
    "kind": "function"
  }, {
    "name": "openZoom",
    "kind": "function"
  }, {
    "name": "zoomScale",
    "kind": "let"
  }, {
    "name": "updateZoom",
    "kind": "function"
  }, {
    "name": "showExplain",
    "kind": "function"
  }],
  "imports": ["$", "calc", "draft", "esc", "fmt", "openPlannerDialog", "photo", "piWithReservations", "plannerRole", "saveCatalogPatch", "state"],
  "writes": ["closePhotoPreview", "closePiTip", "currentPhotoTrigger", "currentPiTipTrigger", "formatTransitEta", "openZoom", "setInactive", "showExplain", "showPhotoPreview", "showPiDetails", "updateZoom", "zoomScale"]
};
export function register(context) {
  context.closePiTip = function closePiTip() {
    const tip = context.$('piHoverTip');
    tip.classList.remove('visible');
    tip.setAttribute('aria-hidden', 'true');
    context.currentPiTipTrigger = null;
  };
  context.formatTransitEta = function formatTransitEta(value, estimated) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '—';
    const date = String(value);
    return `${estimated ? '約 ' : ''}${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(2, 4)}`;
  };
  context.showPiDetails = function showPiDetails(trigger) {
    const code = trigger?.dataset.pi,
      i = context.state.items.find(x => x.code === code);
    if (!i) return;
    const c = context.calc(i),
      pi = context.piWithReservations(c.pi, c.ord),
      tip = context.$('piHoverTip');
    const lines = pi.details.map(p => `<tr><td>${context.esc(p.container)}</td><td class="right" title="${context.esc(p.etaEstimated ? 'Expected Month 15 日推估' : '系統到港日')}">${context.esc(context.formatTransitEta(p.eta, p.etaEstimated))}</td><td class="right"><strong>${context.fmt(p.qty)}</strong></td></tr>${p.reserved > 0 ? `<tr class="pi-order-line"><td colspan="2">客訂</td><td class="right">−${context.fmt(p.reserved)}</td></tr>` : ''}`).join('');
    const rest = (pi.unallocated > 0 ? `<tr class="pi-order-line"><td colspan="2">未分配客訂</td><td class="right">−${context.fmt(pi.unallocated)}</td></tr>` : '') + (pi.unmatched > 0 ? `<tr class="pi-order-line"><td colspan="2">其他貨櫃客訂／未配對 PI</td><td class="right">−${context.fmt(pi.unmatched)}</td></tr>` : '');
    tip.innerHTML = `<div class="pi-tip-heading">${context.esc(code)} · 在途可用 ${context.fmt(c.available)} 箱</div><div class="muted" style="margin-bottom:6px;font-size:12px">${context.esc(i.name)}</div><table><thead><tr><th>PI／貨櫃</th><th class="right">ETA</th><th class="right">箱數</th></tr></thead><tbody>${lines}${rest}<tr class="pi-total-line"><td colspan="2">PI 合計</td><td class="right">${context.fmt(c.pi.sum)}</td></tr><tr class="pi-total-line"><td colspan="2">客訂合計</td><td class="right">−${context.fmt(c.ord.total)}</td></tr><tr class="pi-grand-total"><td colspan="2">在途可用</td><td class="right">${context.fmt(c.available)}</td></tr></tbody></table>${c.ord.unknown ? `<div class="pi-tip-warning">另有 ${c.ord.unknown} 筆客訂單位／數量待確認，未計入扣除。</div>` : ''}`;
    context.currentPiTipTrigger = trigger;
    tip.classList.add('visible');
    tip.setAttribute('aria-hidden', 'false');
    const r = trigger.getBoundingClientRect(),
      width = tip.getBoundingClientRect().width,
      height = tip.getBoundingClientRect().height;
    const left = Math.max(10, Math.min(r.left, window.innerWidth - width - 10));
    const below = r.bottom + 9,
      above = r.top - height - 9;
    const top = below + height < window.innerHeight - 8 ? below : above > 8 ? above : Math.max(8, window.innerHeight - height - 8);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  };
  context.setInactive = function setInactive(code) {
    if (context.plannerRole === 'viewer') return;
    const i = context.state.items.find(x => x.code === code);
    if (!i || i.availability !== 'active') return;
    const qty = Number(context.draft().rows?.[code] || 0);
    if (qty > 0) {
      alert(`${code} 本櫃已有 ${qty} 箱，請先將本櫃訂量改成 0 再停用，避免訂單中藏著已選商品。`);
      return;
    }
    if (!confirm(`確定將 ${code}（${i.name}）設為 Inactive／暫停訂購？\n\n這會從所有人的新訂貨清單隱藏此商品，但不會刪除主檔、PI 或已儲存的舊採購單。可以在「資料管理 → 暫停訂購」重新設成「可訂」。`)) return;
    context.saveCatalogPatch({
      items: {
        [code]: {
          availability: 'paused'
        }
      }
    });
  };
  context.closePhotoPreview = function closePhotoPreview() {
    const tip = context.$('photoHoverCard');
    if (!tip) return;
    tip.classList.remove('visible');
    tip.setAttribute('aria-hidden', 'true');
    context.currentPhotoTrigger = null;
  };
  context.showPhotoPreview = function showPhotoPreview(trigger) {
    const code = trigger.dataset.zoom,
      i = context.state.items.find(x => x.code === code),
      src = i && context.photo(i);
    if (!src) return;
    const tip = context.$('photoHoverCard');
    context.$('photoHoverImage').src = src;
    context.$('photoHoverImage').alt = i.name;
    context.$('photoHoverCaption').textContent = i.code + ' · ' + i.name;
    context.currentPhotoTrigger = trigger;
    tip.classList.add('visible');
    tip.setAttribute('aria-hidden', 'false');
    const r = trigger.getBoundingClientRect(),
      width = tip.getBoundingClientRect().width,
      height = tip.getBoundingClientRect().height;
    tip.style.left = (r.right + 12 + width < window.innerWidth - 8 ? r.right + 12 : Math.max(8, r.left - width - 12)) + 'px';
    tip.style.top = Math.max(8, Math.min(r.top, window.innerHeight - height - 8)) + 'px';
  };
  context.openZoom = function openZoom(code) {
    context.closePhotoPreview();
    const i = context.state.items.find(x => x.code === code),
      src = i && context.photo(i);
    if (!src) return;
    context.zoomScale = 1;
    context.$('zoomTitle').textContent = `${i.code} · ${i.name}`;
    context.$('zoomImage').src = src;
    context.updateZoom();
    context.openPlannerDialog(context.$('zoomDialog'));
  };
  context.updateZoom = function updateZoom() {
    context.$('zoomImage').style.width = `${Math.round(Math.min(window.innerWidth * .72, 680) * context.zoomScale)}px`;
  };
  context.showExplain = function showExplain(code) {
    let i = context.state.items.find(x => x.code === code),
      c = context.calc(i);
    context.$('dialogTitle').textContent = `${code} · 建議量拆解`;
    context.$('dialogBody').innerHTML = '<p>' + context.esc(i.name) + '</p><p>建議箱數＝到貨前後需求－現有庫存－在途可用庫存，取最接近的整箱。</p><p>若有最高庫存，建議箱數不會超過上限。</p><p>預計到倉庫存＝MYOB 庫存＋（在途可用箱數＋本櫃訂量）× 每箱銷售單位。</p><p>目前預計：' + (c.projected === null ? '資料不足，無法計算' : context.fmt(c.projected)) + '；最高庫存：' + context.fmt(c.maxStock) + '。</p><p class="warn">' + context.esc(c.issues.join('、')) + '</p>';
    context.openPlannerDialog(context.$('infoDialog'));
  };
}
export function initialize(context) {
  context.currentPiTipTrigger = null;
  context.currentPhotoTrigger = null;
  context.zoomScale = 1;
}
