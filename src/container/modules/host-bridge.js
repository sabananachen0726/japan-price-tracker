// container: host-bridge. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "host-bridge",
  "owns": [{
    "name": "saveCallbacks",
    "kind": "const"
  }, {
    "name": "saveSequence",
    "kind": "let"
  }, {
    "name": "persist",
    "kind": "function"
  }, {
    "name": "lastContainerHeight",
    "kind": "let"
  }, {
    "name": "sendContainerHeight",
    "kind": "function"
  }],
  "imports": ["$", "D", "DEF", "PI", "events", "norm"],
  "writes": ["D", "PI", "lastContainerHeight", "persist", "saveCallbacks", "saveSequence", "sendContainerHeight"]
};
export function register(context) {
  context.persist = async function persist() {
    context.norm();
    context.$("cloud").textContent = "儲存中…";
    const id = ++context.saveSequence;
    return new Promise(resolve => {
      context.saveCallbacks.set(id, resolve);
      window.parent.postMessage({
        type: 'KAISI_CONTAINER_SAVE',
        id,
        data: structuredClone(context.D)
      }, '*');
    });
  };
  context.sendContainerHeight = function sendContainerHeight() {
    const root = context.$('app');
    if (!root || root.classList.contains('hide')) return;
    const h = Math.ceil(Math.max(760, root.scrollHeight, root.getBoundingClientRect().height)) + 12;
    if (Math.abs(h - context.lastContainerHeight) < 5) return;
    context.lastContainerHeight = h;
    window.parent.postMessage({
      type: 'KAISI_CONTAINER_HEIGHT',
      height: h
    }, '*');
  };
}
export function initialize(context) {
  context.saveCallbacks = new Map();
  context.saveSequence = 0;
  context.events.onMessage(event => {
    if (event.source !== window.parent) return;
    const m = event.data || {};
    if (m.type === 'KAISI_CONTAINER_SNAPSHOT') {
      context.D = m.data || {
        containers: [],
        settings: {
          suppliers: ["SilkRoad", "Tencho"],
          checklist: context.DEF
        }
      };
      context.PI = m.pi || {
        finalPiContainers: {}
      };
      context.PI.finalPiContainers ||= {};
      context.norm();
      context.$("login").classList.add("hide");
      context.$("app").classList.remove("hide");
      render();
      context.$("cloud").textContent = "由 Japan Price Tracker 同步";
      context.$("cloud").className = "status ok";
    } else if (m.type === 'KAISI_CONTAINER_SAVE_RESULT') {
      const done = context.saveCallbacks.get(m.id);
      context.saveCallbacks.delete(m.id);
      done?.(!!m.ok);
      context.$("cloud").textContent = m.ok ? 'Firebase 已同步' : '儲存失敗';
      context.$("cloud").className = m.ok ? 'status ok' : 'status bad';
      if (!m.ok) alert('貨櫃儲存失敗：' + (m.error || '未知錯誤'));
    } else if (m.type === 'KAISI_CONTAINER_LOCK') {
      context.$("app").classList.add("hide");
      context.$("login").classList.add("hide");
    }
  });
  // Parent page owns scrolling. Send only changed height to avoid message storms.
  context.lastContainerHeight = 0;
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => requestAnimationFrame(context.sendContainerHeight));
    observer.observe(document.documentElement);
    observer.observe(document.body);
    const root = document.getElementById('app');
    if (root) observer.observe(root);
  }
  window.addEventListener('load', context.sendContainerHeight);
  window.parent.postMessage({
    type: 'KAISI_CONTAINER_READY'
  }, '*');
}
