import {clearResolvedTemporaryProducts} from '../../shared/product-identity.js';
// shell: session. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "session",
  "owns": [{
    "name": "authGate",
    "kind": "const"
  }, {
    "name": "protectedApp",
    "kind": "const"
  }, {
    "name": "loginForm",
    "kind": "const"
  }, {
    "name": "loginError",
    "kind": "const"
  }, {
    "name": "btnLogout",
    "kind": "const"
  }, {
    "name": "authUser",
    "kind": "const"
  }, {
    "name": "btnRefreshTestData",
    "kind": "const"
  }, {
    "name": "btnModeLive",
    "kind": "const"
  }, {
    "name": "btnModeTest",
    "kind": "const"
  }, {
    "name": "saveFirebaseData",
    "kind": "function"
  }],
  "imports": ["containerTrackerFrameLoaded", "plannerLoaded", "refreshUI", "savedAppData", "PROD_DOC_REF", "TEST_LOCAL_KEY", "applyRoleUI", "auth", "copyLiveToTest", "currentDataMode", "currentRole", "isAdmin", "loadEmbeddedContainerTracker", "loadEmbeddedOrderPlanner", "loadRole", "onAuthStateChanged", "refreshCustomerSource", "renderSharedOrderDrafts", "resetCustomerSource", "searchCache", "setDoc", "sharedOrderDrafts", "showAppToast", "signInWithEmailAndPassword", "signOut", "startCatalogListeners", "startContainerTrackerLink", "startDataListener", "startSharedOrderListener", "stopCatalogListeners", "switchDataMode", "tryCustomerLogin", "unsubscribeContainerTracker", "unsubscribeData", "unsubscribeOrderPlanner", "updateTestDataInfo"],
  "writes": ["containerTrackerFrameLoaded", "plannerLoaded", "savedAppData", "authGate", "authUser", "btnLogout", "btnModeLive", "btnModeTest", "btnRefreshTestData", "currentRole", "loginError", "loginForm", "protectedApp", "saveFirebaseData", "sharedOrderDrafts", "unsubscribeContainerTracker", "unsubscribeData", "unsubscribeOrderPlanner"]
};
export function register(context) {
  context.saveFirebaseData = async function saveFirebaseData() {
    if (!context.auth.currentUser || !context.isAdmin()) {
      alert("僅 Admin 可儲存此區資料。");
      return false;
    }
    clearResolvedTemporaryProducts(window.appData);
    const pendingData = structuredClone(window.appData);
    context.searchCache.valid = false;
    const statusBadge = document.getElementById("cloudStatus");
    try {
      if (context.currentDataMode === 'test') {
        if (statusBadge) {
          statusBadge.className = "badge bg-warning text-dark";
          statusBadge.innerHTML = '<i class="fa-solid fa-sync fa-spin me-1"></i>TEST 儲存中...';
        }
        localStorage.setItem(context.TEST_LOCAL_KEY, JSON.stringify(pendingData));
        context.savedAppData = structuredClone(pendingData);
        context.updateTestDataInfo('TEST 已儲存在本機');
        return true;
      }
      if (statusBadge) {
        statusBadge.className = "badge bg-secondary";
        statusBadge.innerHTML = '<i class="fa-solid fa-sync fa-spin me-1"></i>LIVE 儲存中...';
      }
      await context.setDoc(context.PROD_DOC_REF, pendingData);
      context.savedAppData = structuredClone(pendingData);
      if (statusBadge) {
        statusBadge.className = "badge bg-success";
        statusBadge.innerHTML = '<i class="fa-solid fa-cloud me-1"></i>LIVE Firebase 已同步';
      }
      return true;
    } catch (e) {
      if (context.savedAppData && JSON.stringify(window.appData) === JSON.stringify(pendingData)) {
        window.appData = structuredClone(context.savedAppData);
        context.searchCache.valid = false;
        context.refreshUI();
      }
      console.error(context.currentDataMode + ' save error: ', e);
      if (statusBadge) {
        statusBadge.className = "badge bg-danger";
        statusBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation me-1"></i>${context.currentDataMode === 'test' ? 'TEST' : 'LIVE'} 儲存失敗`;
      }
      context.showAppToast(`${context.currentDataMode === 'test' ? 'TEST' : 'LIVE'} 資料儲存失敗：${e?.code || e?.message || '未知錯誤'}`, 'danger');
      return false;
    }
  };
}
export function initialize(context) {
  context.authGate = document.getElementById('authGate');
  context.protectedApp = document.getElementById('protectedApp');
  context.loginForm = document.getElementById('loginForm');
  context.loginError = document.getElementById('loginError');
  context.btnLogout = document.getElementById('btnLogout');
  context.authUser = document.getElementById('authUser');
  context.btnRefreshTestData = document.getElementById('btnRefreshTestData');
  context.btnModeLive = document.getElementById('btnModeLive');
  context.btnModeTest = document.getElementById('btnModeTest');
  if (context.btnRefreshTestData) context.btnRefreshTestData.addEventListener('click', () => context.copyLiveToTest({
    confirmOverwrite: true
  }));
  if (context.btnModeLive) context.btnModeLive.addEventListener('click', () => context.switchDataMode('live'));
  if (context.btnModeTest) context.btnModeTest.addEventListener('click', () => context.switchDataMode('test'));
  context.loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    context.loginError.classList.add('d-none');
    const btn = document.getElementById('btnLogin');
    btn.disabled = true;
    btn.textContent = '登入中...';
    try {
      await context.signInWithEmailAndPassword(context.auth, document.getElementById('loginEmail').value.trim(), document.getElementById('loginPassword').value);
      context.tryCustomerLogin(document.getElementById('loginEmail').value.trim(), document.getElementById('loginPassword').value);
      document.getElementById('loginPassword').value = '';
    } catch (err) {
      context.loginError.textContent = '登入失敗：Email 或密碼不正確，或此帳號尚未啟用。';
      context.loginError.classList.remove('d-none');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-right-to-bracket me-1"></i>登入';
    }
  });
  context.btnLogout.addEventListener('click', () => context.signOut(context.auth));
  context.onAuthStateChanged(context.auth, async user => {
    if (user) {
      try {
        context.currentRole = await context.loadRole(user);
        context.applyRoleUI();
      } catch (err) {
        context.currentRole = null;
        context.applyRoleUI();
        context.protectedApp.classList.add('d-none');
        context.authGate.classList.remove('d-none');
        context.loginError.textContent = err.message || '未授權';
        context.loginError.classList.remove('d-none');
        return;
      }
      context.authGate.classList.add('d-none');
      context.protectedApp.classList.remove('d-none');
      context.btnLogout.classList.remove('d-none');
      context.authUser.classList.remove('d-none');
      context.authUser.textContent = user.email || '已登入';
      context.startDataListener();
      context.startContainerTrackerLink();
      context.startSharedOrderListener();
      context.startCatalogListeners();
      context.refreshCustomerSource();
      if (document.getElementById('planner-tab')?.classList.contains('active')) context.loadEmbeddedOrderPlanner();
      if (document.getElementById('container-tab')?.classList.contains('active')) context.loadEmbeddedContainerTracker();
    } else {
      context.currentRole = null;
      context.applyRoleUI();
      if (context.unsubscribeContainerTracker) {
        context.unsubscribeContainerTracker();
        context.unsubscribeContainerTracker = null;
      }
      if (context.unsubscribeData) {
        context.unsubscribeData();
        context.unsubscribeData = null;
      }
      if (context.unsubscribeOrderPlanner) {
        context.unsubscribeOrderPlanner();
        context.unsubscribeOrderPlanner = null;
      }
      context.stopCatalogListeners();
      context.resetCustomerSource();
      for (const id of ['plannerFrame', 'containerTrackerFrame']) {
        const frame = document.getElementById(id);
        frame?.removeAttribute('src');
      }
      context.plannerLoaded = false;
      context.containerTrackerFrameLoaded = false;
      context.sharedOrderDrafts = {};
      context.renderSharedOrderDrafts();
      document.getElementById('containerTrackerFrame')?.contentWindow?.postMessage({
        type: 'KAISI_CONTAINER_LOCK'
      }, '*');
      context.protectedApp.classList.add('d-none');
      context.authGate.classList.remove('d-none');
      context.btnLogout.classList.add('d-none');
      context.authUser.classList.add('d-none');
      if (context.btnRefreshTestData) context.btnRefreshTestData.classList.add('d-none');
    }
  });
  window.saveFirebaseData = context.saveFirebaseData;
}
