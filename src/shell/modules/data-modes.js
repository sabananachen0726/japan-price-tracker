// shell: data-modes. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "data-modes",
  "owns": [{
    "name": "normalizeAppData",
    "kind": "function"
  }, {
    "name": "setModeUI",
    "kind": "function"
  }, {
    "name": "updateTestDataInfo",
    "kind": "function"
  }, {
    "name": "readLiveSnapshotOnce",
    "kind": "function"
  }, {
    "name": "copyLiveToTest",
    "kind": "function"
  }, {
    "name": "startLiveListener",
    "kind": "function"
  }, {
    "name": "startContainerTrackerLink",
    "kind": "function"
  }, {
    "name": "linkedTrackerContainer",
    "kind": "function"
  }, {
    "name": "startTestMode",
    "kind": "function"
  }, {
    "name": "switchDataMode",
    "kind": "function"
  }, {
    "name": "startDataListener",
    "kind": "function"
  }],
  "imports": ["CONTAINER_TRACKER_REF", "PROD_DOC_REF", "TEST_LOCAL_KEY", "auth", "containerTrackerData", "currentDataMode", "customerGeneration", "normalizeContainerNo", "onSnapshot", "refreshCustomerSource", "refreshUI", "renderContainerIntegrationCheck", "renderFinalPiBatchSearch", "renderFinalPiContainerList", "renderFinalPiSearch", "renderSharedOrderDrafts", "searchCache", "sendContainerSnapshot", "sendCustomerSource", "sendPlannerSnapshot", "showAppToast", "unsubscribeContainerTracker", "unsubscribeData"],
  "writes": ["containerTrackerData", "copyLiveToTest", "currentDataMode", "customerGeneration", "linkedTrackerContainer", "normalizeAppData", "readLiveSnapshotOnce", "setModeUI", "startContainerTrackerLink", "startDataListener", "startLiveListener", "startTestMode", "switchDataMode", "unsubscribeContainerTracker", "unsubscribeData", "updateTestDataInfo"]
};
export function register(context) {
  context.normalizeAppData = function normalizeAppData(data) {
    const base = data && typeof data === 'object' ? data : {};
    if (!base.itemToBarcode) base.itemToBarcode = {};
    if (!base.suppliers) base.suppliers = ["SilkRoad", "Tencho"];
    if (!base.mappings) base.mappings = {};
    if (!base.products) base.products = {};
    for (const product of Object.values(base.products)) if (typeof product.name === 'string') product.name = product.name.replace(/^O\/S\s*-\s*/i, '').trim();
    if (!base.quotes) base.quotes = [];
    if (!base.masterImportBatches) base.masterImportBatches = [];
    if (!base.finalPiContainers) base.finalPiContainers = {};
    return base;
  };
  context.setModeUI = function setModeUI() {
    const isTest = context.currentDataMode === 'test';
    document.getElementById('testModeBanner')?.classList.toggle('d-none', !isTest);
    document.getElementById('btnRefreshTestData')?.classList.toggle('d-none', !isTest || !context.auth.currentUser);
    const liveBtn = document.getElementById('btnModeLive');
    const testBtn = document.getElementById('btnModeTest');
    if (liveBtn) liveBtn.className = isTest ? 'btn btn-outline-success' : 'btn btn-success';
    if (testBtn) testBtn.className = isTest ? 'btn btn-warning' : 'btn btn-outline-warning';
    document.body.style.backgroundColor = isTest ? '#fffaf0' : '';
  };
  context.updateTestDataInfo = function updateTestDataInfo(sourceText = 'TEST 本機') {
    const p = Object.keys(window.appData?.products || {}).length;
    const q = (window.appData?.quotes || []).length;
    const statusBadge = document.getElementById("cloudStatus");
    if (statusBadge) {
      statusBadge.className = "badge bg-warning text-dark";
      statusBadge.innerHTML = `<i class="fa-solid fa-flask me-1"></i>${sourceText}｜${p} 商品 / ${q} 報價`;
    }
  };
  context.readLiveSnapshotOnce = function readLiveSnapshotOnce() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const unsub = context.onSnapshot(context.PROD_DOC_REF, snapshot => {
        if (settled) return;
        settled = true;
        try {
          unsub();
        } catch (_) {}
        if (!snapshot.exists()) return reject(new Error('找不到正式 main_config'));
        resolve(snapshot.data());
      }, error => {
        if (settled) return;
        settled = true;
        try {
          unsub();
        } catch (_) {}
        reject(error);
      });
    });
  };
  context.copyLiveToTest = async function copyLiveToTest({
    confirmOverwrite = false
  } = {}) {
    if (confirmOverwrite && localStorage.getItem(context.TEST_LOCAL_KEY)) {
      const ok = confirm('這會用目前 LIVE 正式資料重新建立 TEST，現有 TEST 修改會被覆蓋。\n\n只會 LIVE → TEST，不會修改正式資料。\n\n確定繼續？');
      if (!ok) return false;
    }
    const statusBadge = document.getElementById("cloudStatus");
    try {
      if (statusBadge) {
        statusBadge.className = "badge bg-warning text-dark";
        statusBadge.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>正在從 LIVE 複製...';
      }
      const liveData = await context.readLiveSnapshotOnce();
      window.appData = context.normalizeAppData(JSON.parse(JSON.stringify(liveData)));
      localStorage.setItem(context.TEST_LOCAL_KEY, JSON.stringify(window.appData));
      localStorage.setItem(context.TEST_LOCAL_KEY + '_copied_at', new Date().toISOString());
      context.searchCache.valid = false;
      context.refreshUI();
      context.updateTestDataInfo('TEST 已從 LIVE 更新');
      context.showAppToast(`🧪 TEST 建立成功：${Object.keys(window.appData.products || {}).length} 商品 / ${(window.appData.quotes || []).length} 報價`, 'success');
      return true;
    } catch (error) {
      console.error('TEST copy from LIVE error', error);
      if (statusBadge) {
        statusBadge.className = "badge bg-danger";
        statusBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation me-1"></i>無法讀取 LIVE';
      }
      context.showAppToast(`TEST 無法讀取 LIVE：${error?.code || error?.message || '未知錯誤'}`, 'danger');
      return false;
    }
  };
  context.startLiveListener = function startLiveListener() {
    if (context.unsubscribeData) {
      context.unsubscribeData();
      context.unsubscribeData = null;
    }
    const statusBadge = document.getElementById("cloudStatus");
    if (statusBadge) {
      statusBadge.className = 'badge bg-secondary';
      statusBadge.innerHTML = '<i class="fa-solid fa-sync fa-spin me-1"></i>LIVE 同步中...';
    }
    context.unsubscribeData = context.onSnapshot(context.PROD_DOC_REF, snapshot => {
      if (context.currentDataMode !== 'live') return;
      if (snapshot.exists()) window.appData = context.normalizeAppData(snapshot.data());else window.appData = context.normalizeAppData({});
      context.searchCache.valid = false;
      context.refreshUI();
      if (statusBadge) {
        statusBadge.className = 'badge bg-success';
        statusBadge.innerHTML = '<i class="fa-solid fa-cloud me-1"></i>LIVE Firebase 已同步';
      }
    }, error => {
      console.error('LIVE listener error', error);
      if (statusBadge) {
        statusBadge.className = 'badge bg-danger';
        statusBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation me-1"></i>LIVE 同步失敗';
      }
      context.showAppToast(`LIVE Firebase 同步失敗：${error?.code || error?.message || '未知錯誤'}`, 'danger');
    });
  };
  context.startContainerTrackerLink = function startContainerTrackerLink() {
    if (context.unsubscribeContainerTracker) {
      try {
        context.unsubscribeContainerTracker();
      } catch (_) {}
    }
    context.unsubscribeContainerTracker = context.onSnapshot(context.CONTAINER_TRACKER_REF, snapshot => {
      context.containerTrackerData = snapshot.exists() ? snapshot.data() || {
        containers: []
      } : {
        containers: []
      };
      context.containerTrackerData.containers ||= [];
      context.renderFinalPiContainerList();
      context.renderContainerIntegrationCheck();
      context.renderFinalPiSearch();
      context.renderFinalPiBatchSearch();
      context.sendPlannerSnapshot();
      context.sendContainerSnapshot();
      context.renderSharedOrderDrafts();
    }, error => {
      console.warn('Container Tracker link unavailable', error);
    });
  };
  context.linkedTrackerContainer = function linkedTrackerContainer(containerNo) {
    const key = context.normalizeContainerNo(containerNo);
    return (context.containerTrackerData.containers || []).find(c => context.normalizeContainerNo(c.code) === key) || null;
  };
  context.startTestMode = async function startTestMode() {
    if (context.unsubscribeData) {
      context.unsubscribeData();
      context.unsubscribeData = null;
    }
    const saved = localStorage.getItem(context.TEST_LOCAL_KEY);
    if (saved) {
      try {
        window.appData = context.normalizeAppData(JSON.parse(saved));
        context.searchCache.valid = false;
        context.refreshUI();
        context.updateTestDataInfo('TEST 本機');
        return true;
      } catch (_) {
        localStorage.removeItem(context.TEST_LOCAL_KEY);
      }
    }
    return await context.copyLiveToTest({
      confirmOverwrite: false
    });
  };
  context.switchDataMode = async function switchDataMode(nextMode) {
    if (nextMode === context.currentDataMode) return;
    if (nextMode === 'test') {
      const ok = confirm('切換到 TEST MODE？\n\nTEST 的新增、修改、刪除只存在這台電腦，不會寫回正式 Firebase。');
      if (!ok) return;
      context.currentDataMode = 'test';
      context.customerGeneration++;
      context.sendCustomerSource();
      context.setModeUI();
      await context.startTestMode();
      context.showAppToast('🧪 已切換到 TEST MODE', 'warning');
    } else {
      const ok = confirm('即將切回 LIVE MODE。\n\n接下來的新增、修改、刪除都會直接寫入正式 Firebase。\n\n確定切回 LIVE？');
      if (!ok) return;
      context.currentDataMode = 'live';
      context.sendCustomerSource();
      context.refreshCustomerSource();
      context.setModeUI();
      context.startLiveListener();
      context.showAppToast('✓ 已切回 LIVE MODE｜現在操作的是正式資料', 'success');
    }
  };
  context.startDataListener = async function startDataListener() {
    context.setModeUI();
    if (context.currentDataMode === 'test') await context.startTestMode();else context.startLiveListener();
  };
}
export function initialize(context) {}
