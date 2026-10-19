// shell: container-bridge. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "container-bridge",
  "owns": [{
    "name": "EMBEDDED_CONTAINER_TRACKER_B64",
    "kind": "const"
  }, {
    "name": "containerTrackerFrameLoaded",
    "kind": "let"
  }, {
    "name": "loadEmbeddedContainerTracker",
    "kind": "function"
  }, {
    "name": "renderContainerIntegrationCheck",
    "kind": "function"
  }],
  "imports": ["auth", "containerTrackerData", "normalizeContainerNo", "sendContainerSnapshot"],
  "writes": ["EMBEDDED_CONTAINER_TRACKER_B64", "containerTrackerFrameLoaded", "loadEmbeddedContainerTracker", "renderContainerIntegrationCheck"]
};
export function register(context) {
  context.loadEmbeddedContainerTracker = function loadEmbeddedContainerTracker() {
    const frame = document.getElementById('containerTrackerFrame');
    if (!frame || context.containerTrackerFrameLoaded || !context.auth.currentUser) return;
    try {
      const bin = atob(context.EMBEDDED_CONTAINER_TRACKER_B64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      frame.srcdoc = new TextDecoder('utf-8').decode(bytes);
      context.containerTrackerFrameLoaded = true;
      frame.addEventListener('load', context.sendContainerSnapshot);
    } catch (e) {
      console.error('Container Tracker load failed', e);
    }
  };
  context.renderContainerIntegrationCheck = function renderContainerIntegrationCheck() {
    const host = document.getElementById('containerIntegrationCheck');
    if (!host) return;
    const piKeys = new Set(Object.keys(window.appData.finalPiContainers || {}).map(context.normalizeContainerNo).filter(Boolean));
    const trackerKeys = new Set((context.containerTrackerData.containers || []).map(c => context.normalizeContainerNo(c.code)).filter(Boolean));
    const matched = [...piKeys].filter(k => trackerKeys.has(k));
    const onlyPi = [...piKeys].filter(k => !trackerKeys.has(k)).sort();
    const onlyTracker = [...trackerKeys].filter(k => !piKeys.has(k)).sort();
    const chip = (n, label, cls) => `<span class="badge ${cls} fs-6 me-2 mb-2">${label}：${n}</span>`;
    host.innerHTML = `<div>${chip(piKeys.size, 'Final PI', 'bg-primary')}${chip(trackerKeys.size, 'Container Tracker', 'bg-secondary')}${chip(matched.length, '已配對', 'bg-success')}${chip(onlyPi.length, '只在 Final PI', 'bg-warning text-dark')}${chip(onlyTracker.length, '只在 Tracker', 'bg-info text-dark')}</div>` + (onlyPi.length || onlyTracker.length ? `<details class="mt-2"><summary class="small fw-bold" style="cursor:pointer">查看未配對貨櫃</summary><div class="small mt-2">${onlyPi.length ? `<div><b>只在 Final PI：</b> ${onlyPi.join(', ')}</div>` : ''}${onlyTracker.length ? `<div><b>只在 Container Tracker：</b> ${onlyTracker.join(', ')}</div>` : ''}<div class="text-muted mt-1">未配對不會被刪除；通常代表 PI 尚未建立或 Tracker 尚未建立。</div></div></details>` : `<div class="small text-success fw-bold">✓ 目前兩邊所有貨櫃均可依 Container No. 配對。</div>`);
  };
}
export function initialize(context) {
  context.EMBEDDED_CONTAINER_TRACKER_B64 = __JPT_CONTAINER_TRACKER_B64__;
  context.containerTrackerFrameLoaded = false;
  document.addEventListener('shown.bs.tab', e => {
    if (e.target?.id === 'container-tab') {
      context.loadEmbeddedContainerTracker();
      context.renderContainerIntegrationCheck();
    }
  });
  document.addEventListener('click', e => {
    if (e.target.closest?.('#btnRefreshIntegrationCheck')) context.renderContainerIntegrationCheck();
  });
}
