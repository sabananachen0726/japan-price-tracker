// shell: workspace. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "workspace",
  "owns": [{
    "name": "routePlannerWorkspace",
    "kind": "function"
  }, {
    "name": "chooseProductView412",
    "kind": "function"
  }, {
    "name": "chooseContainerView412",
    "kind": "function"
  }, {
    "name": "openSystemTools412",
    "kind": "function"
  }, {
    "name": "containerSettingsPending412",
    "kind": "let"
  }, {
    "name": "containerSettingsReady412",
    "kind": "let"
  }],
  "imports": ["chooseImportView", "events", "loadEmbeddedContainerTracker", "loadEmbeddedOrderPlanner", "masterCurrentPage", "masterSearchTerm", "renderMasterTable"],
  "writes": ["chooseContainerView412", "chooseProductView412", "containerSettingsPending412", "containerSettingsReady412", "masterCurrentPage", "masterSearchTerm", "openSystemTools412", "routePlannerWorkspace"]
};
export function register(context) {
  context.routePlannerWorkspace = function routePlannerWorkspace() {
    const f = document.getElementById('plannerFrame');
    if (!f?.contentWindow) return;
    if (document.getElementById('add-tab').classList.contains('active') && document.body.dataset.importView === 'planner') f.contentWindow.postMessage({
      type: 'KAISI_OPEN_IMPORT_CENTER'
    }, '*');else if (document.getElementById('settings-tab').classList.contains('active') && ['settings', 'pending'].includes(document.body.dataset.productView)) f.contentWindow.postMessage({
      type: 'KAISI_PRODUCT_OPEN',
      view: document.body.dataset.productView,
      query: document.getElementById('productSearch412')?.value || ''
    }, '*');else if (document.getElementById('planner-tab').classList.contains('active')) f.contentWindow.postMessage({
      type: 'KAISI_OPEN_PLAN'
    }, '*');
  };
  context.chooseProductView412 = function chooseProductView412(view) {
    document.body.dataset.productView = ['settings', 'pending'].includes(view) ? view : 'master';
    document.querySelectorAll('[data-product-view]').forEach(b => {
      if (b.tagName === 'BUTTON') b.classList.toggle('active', b.dataset.productView === document.body.dataset.productView);
    });
    if (view !== 'master') context.loadEmbeddedOrderPlanner();
    context.routePlannerWorkspace();
  };
  context.chooseContainerView412 = function chooseContainerView412(view) {
    const panel = document.getElementById('container-panel');
    panel.dataset.containerView = view === 'pi' ? 'pi' : 'overview';
    panel.querySelectorAll('[data-container-view-button]').forEach(b => b.classList.toggle('active', b.dataset.containerViewButton === panel.dataset.containerView));
    if (view !== 'pi') context.loadEmbeddedContainerTracker();
  };
  context.openSystemTools412 = function openSystemTools412(view) {
    const d = document.getElementById('systemTools412');
    if (!d.open) d.showModal();
    if (view === 'backup') document.getElementById('systemBackup412').open = true;
  };
}
export function initialize(context) {
  context.events.onMessage(e => {
    if (e.source !== document.getElementById('plannerFrame')?.contentWindow) return;
    const m = e.data || {};
    if (m.type === 'KAISI_PLANNER_WIDTH') document.body.classList.toggle('planner-wide', m.wide === true);
    if (m.type === 'KAISI_PRODUCT_VIEW') {
      bootstrap.Tab.getOrCreateInstance(document.getElementById('settings-tab')).show();
      context.chooseProductView412(m.view);
    }
    if (m.type === 'KAISI_OPEN_HUB') {
      bootstrap.Tab.getOrCreateInstance(document.getElementById('add-tab')).show();
      context.chooseImportView(m.view || 'planner');
    }
    if (m.type === 'KAISI_OPEN_SYSTEM') context.openSystemTools412(m.view);
  });
  document.addEventListener('DOMContentLoaded', () => {
    const settings = document.getElementById('settings-panel'),
      master = document.createElement('div');
    master.id = 'productMasterView';
    while (settings.firstChild) master.append(settings.firstChild);
    settings.append(master);
    const bar = document.createElement('div');
    bar.innerHTML = '<h3>商品管理</h3><input id="productSearch412" class="form-control mb-3" placeholder="搜尋 Item Code／Barcode／商品名稱"><div class="workspace-subnav"><button class="btn btn-outline-primary active" data-product-view="master">基本資料</button><button class="btn btn-outline-primary" data-product-view="settings">訂貨設定</button><button class="btn btn-outline-primary" data-product-view="pending">待補資料</button></div>';
    settings.prepend(bar);
    document.getElementById('masterSearchInput').classList.add('d-none');
    document.getElementById('productSearch412').addEventListener('input', e => {
      document.getElementById('masterSearchInput').value = e.target.value;
      context.masterSearchTerm = e.target.value.trim().toLowerCase();
      context.masterCurrentPage = 1;
      context.renderMasterTable();
      document.getElementById('plannerFrame')?.contentWindow?.postMessage({
        type: 'KAISI_PRODUCT_SEARCH',
        query: e.target.value
      }, '*');
    });
    settings.querySelectorAll('button[data-product-view]').forEach(b => b.onclick = () => context.chooseProductView412(b.dataset.productView));
    document.body.dataset.productView = 'master';
    document.getElementById('btnDownloadMasterTemplate').hidden = true;
    master.querySelector('h4').textContent = '商品基本資料';
    master.querySelector('p.text-muted').textContent = '商品主檔以 Item Code 更新；同條碼不同品號分開保留。原始資料可在資料匯入中心更新。';
    const cp = document.getElementById('container-panel'),
      overview = document.createElement('div');
    overview.id = 'containerOverview412';
    while (cp.firstChild) overview.append(cp.firstChild);
    cp.append(overview);
    const pi = document.getElementById('finalpi-panel');
    pi.className = '';
    cp.append(pi);
    const cb = document.createElement('div');
    cb.className = 'workspace-subnav';
    cb.innerHTML = '<button class="btn btn-outline-primary active" data-container-view-button="overview">貨櫃進度</button><button class="btn btn-outline-primary" data-container-view-button="pi">PI 商品查詢 <span id="finalPiPendingBadge" class="badge bg-warning text-dark d-none"></span></button>';
    cp.prepend(cb);
    // Remove the old duplicate pending badge if it was kept in a hidden old tab.
    cb.querySelectorAll('button').forEach(b => b.onclick = () => context.chooseContainerView412(b.dataset.containerViewButton));
    cp.dataset.containerView = 'overview';
    const sys = document.createElement('dialog');
    sys.id = 'systemTools412';
    sys.innerHTML = '<div class="d-flex justify-content-between mb-3"><h3>系統設定</h3><button class="btn btn-outline-secondary" onclick="this.closest(\'dialog\').close()">關閉</button></div><div id="systemAccounts412" class="mb-3"></div><details id="systemBackup412"><summary class="fw-bold">完整備份／還原</summary><div id="systemBackupBody412" class="mt-3"></div></details><details class="mt-3"><summary class="fw-bold">廠商、條碼關聯與進階維護</summary><div id="systemAdvanced412" class="mt-3"></div></details>';
    document.body.append(sys);
    const users = document.getElementById('btnUsers');
    document.getElementById('systemAccounts412').append(users);
    users.addEventListener('click', () => sys.close());
    const backup = document.getElementById('hub-backup');
    backup.className = '';
    backup.style.display = 'block';
    document.getElementById('systemBackupBody412').append(backup);
    backup.querySelector('h4').textContent = '完整系統備份／還原';
    backup.querySelectorAll('p').forEach(p => p.textContent = '包含商品、報價、PI、貨櫃、商品訂貨設定、庫存、銷售彙總與共用工作單。還原前會列出範圍。');
    document.querySelectorAll('.import-switcher [data-import-view="backup"]').forEach(b => b.remove());
    const advanced = document.getElementById('systemAdvanced412');
    const supplier = document.getElementById('newSupplierName')?.closest('.card');
    if (supplier) advanced.append(supplier);
    const mapping = document.getElementById('mapPrimaryBarcode')?.closest('details');
    if (mapping) advanced.append(mapping);
    const cm = document.getElementById('containerManagerBody')?.closest('.card');
    if (cm) advanced.append(cm);
    const integ = document.getElementById('containerIntegrationCheck')?.closest('.card');
    if (integ) advanced.append(integ);
    for (const col of master.querySelectorAll('.row>div[class*="col-"]')) if (!col.textContent.trim() && !col.children.length) col.remove();
    const gear = document.createElement('button');
    gear.id = 'systemOpen412';
    gear.type = 'button';
    gear.className = 'btn btn-sm btn-outline-secondary';
    gear.textContent = '系統設定';
    gear.onclick = () => context.openSystemTools412();
    document.getElementById('authUser').parentElement.prepend(gear);
    document.addEventListener('shown.bs.tab', e => {
      if (!e.target.classList.contains('active')) return;
      if (e.target?.id === 'settings-tab') context.chooseProductView412(document.body.dataset.productView || 'master');
      if (e.target?.id !== 'planner-tab') document.body.classList.remove('planner-wide');
    });
    document.querySelector('[data-import-view="pi"]').textContent = '③ PI 匯入';
    document.querySelector('#hub-pi details').open = true;
    context.routePlannerWorkspace();
  });
  context.containerSettingsPending412 = false;
  context.containerSettingsReady412 = false;
  context.events.onMessage(e => {
    if (e.source !== document.getElementById('containerTrackerFrame')?.contentWindow || e.data?.type !== 'KAISI_CONTAINER_READY') return;
    context.containerSettingsReady412 = true;
    if (context.containerSettingsPending412) {
      context.containerSettingsPending412 = false;
      e.source.postMessage({
        type: 'KAISI_CONTAINER_OPEN_SETTINGS'
      }, '*');
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'containerSettingsOpen412';
    b.className = 'btn btn-outline-secondary mb-3';
    b.textContent = '貨櫃預設與檢查清單';
    b.onclick = () => {
      document.getElementById('systemTools412').close();
      context.containerSettingsPending412 = true;
      bootstrap.Tab.getOrCreateInstance(document.getElementById('container-tab')).show();
      context.chooseContainerView412('overview');
      if (context.containerSettingsReady412) {
        context.containerSettingsPending412 = false;
        document.getElementById('containerTrackerFrame').contentWindow.postMessage({
          type: 'KAISI_CONTAINER_OPEN_SETTINGS'
        }, '*');
      }
    };
    document.getElementById('systemAdvanced412').prepend(b);
  });
}
