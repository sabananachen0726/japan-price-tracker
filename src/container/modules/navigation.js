// container: navigation. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "navigation",
  "owns": [{
    "name": "overviewView",
    "kind": "let"
  }, {
    "name": "applyOverviewView",
    "kind": "function"
  }],
  "imports": ["$", "D", "complete", "persist", "renderArchive", "renderOverview", "sendContainerHeight", "settings", "todos"],
  "writes": ["applyOverviewView", "overviewView"]
};
export function register(context) {
  context.applyOverviewView = function applyOverviewView() {
    let d = context.$('dashboardView'),
      l = context.$('listView'),
      bd = context.$('viewDashboard'),
      bl = context.$('viewList'),
      pb = context.$('printBtn');
    if (!d || !l) return;
    d.classList.toggle('hide', context.overviewView !== 'dashboard');
    l.classList.toggle('hide', context.overviewView !== 'list');
    bd?.classList.toggle('active', context.overviewView === 'dashboard');
    bl?.classList.toggle('active', context.overviewView === 'list');
    pb?.classList.toggle('hide', context.overviewView !== 'list');
  };
}
export function initialize(context) {
  context.overviewView = localStorage.getItem('ct_overview_view') || 'dashboard';
  window.setOverviewView = v => {
    context.overviewView = v === 'list' ? 'list' : 'dashboard';
    localStorage.setItem('ct_overview_view', context.overviewView);
    context.applyOverviewView();
  };
  window.printCurrentList = () => {
    if (context.overviewView !== 'list') setOverviewView('list');
    setTimeout(() => window.print(), 50);
  };
  window.render = () => {
    let changed = false;
    context.D.containers.forEach(c => {
      if (context.complete(c)) changed = true;
    });
    context.renderOverview();
    context.renderArchive();
    context.todos();
    context.settings();
    requestAnimationFrame(context.sendContainerHeight);
    if (changed) context.persist();
  };
  window.page = p => {
    ['overview', 'todo', 'archive', 'settings'].forEach(x => context.$(x).classList.toggle('hide', x !== p));
    document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.p === p));
    context.$('mainToolbar')?.classList.toggle('hide', p === 'settings');
    document.querySelectorAll('.overview-only').forEach(x => x.classList.toggle('hide', p !== 'overview'));
    render();
  };
}
