// container: workspace. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "workspace",
  "owns": [{
    "name": "ensureContainerBack412",
    "kind": "function"
  }, {
    "name": "originalContainerRender412",
    "kind": "const"
  }],
  "imports": ["$", "events"],
  "writes": ["ensureContainerBack412", "originalContainerRender412"]
};
export function register(context) {
  context.ensureContainerBack412 = function ensureContainerBack412() {
    if (context.$('settings').classList.contains('hide') || document.getElementById('containerSettingsBack412')) return;
    const b = document.createElement('button');
    b.id = 'containerSettingsBack412';
    b.className = 'soft';
    b.textContent = '← 返回貨櫃進度';
    b.onclick = () => window.page('overview');
    context.$('settings').prepend(b);
  };
}
export function initialize(context) {
  document.querySelector('#nav [data-p="settings"]').hidden = true;
  context.originalContainerRender412 = window.render;
  window.render = () => {
    context.originalContainerRender412();
    context.ensureContainerBack412();
  };
  context.events.onMessage(e => {
    if (e.source === window.parent && e.data?.type === 'KAISI_CONTAINER_OPEN_SETTINGS') window.page('settings');
  });
}
