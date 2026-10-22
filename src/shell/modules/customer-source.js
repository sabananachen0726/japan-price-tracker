import {dueDaily} from '../../shared/daily-cycle.js';
// shell: customer-source. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "customer-source",
  "owns": [{
    "name": "customerApp",
    "kind": "const"
  }, {
    "name": "customerAuth",
    "kind": "const"
  }, {
    "name": "customerDB",
    "kind": "const"
  }, {
    "name": "CUSTOMER_STAFF",
    "kind": "const"
  }, {
    "name": "customerRows",
    "kind": "let"
  }, {
    "name": "customerFetchedAt",
    "kind": "let"
  }, {
    "name": "customerStatus",
    "kind": "let"
  }, {
    "name": "customerBusy",
    "kind": "let"
  }, {
    "name": "customerGeneration",
    "kind": "let"
  }, {
    "name": "customerIdentity",
    "kind": "let"
  }, {
    "name": "customerRetryAt",
    "kind": "let"
  }, {
    "name": "CUSTOMER_CACHE_MS",
    "kind": "const"
  }, {
    "name": "customerVisible",
    "kind": "function"
  }, {
    "name": "customerKey",
    "kind": "function"
  }, {
    "name": "customerAllowed",
    "kind": "function"
  }, {
    "name": "sendCustomerSource",
    "kind": "function"
  }, {
    "name": "resetCustomerSource",
    "kind": "function"
  }, {
    "name": "prepareCustomerIdentity",
    "kind": "function"
  }, {
    "name": "mapCustomerDocs",
    "kind": "function"
  }, {
    "name": "refreshCustomerSource",
    "kind": "function"
  }, {
    "name": "tryCustomerLogin",
    "kind": "function"
  }],
  "imports": ["renderFinalPiSearch", "auth", "browserLocalPersistence", "browserSessionPersistence", "collection", "currentDataMode", "events", "getAuth", "getDocsFromServer", "getFirestore", "initializeApp", "onAuthStateChanged", "plannerLoaded", "setPersistence", "signInWithEmailAndPassword", "signOut"],
  "writes": ["CUSTOMER_CACHE_MS", "CUSTOMER_STAFF", "customerAllowed", "customerApp", "customerAuth", "customerBusy", "customerDB", "customerFetchedAt", "customerGeneration", "customerIdentity", "customerKey", "customerRetryAt", "customerRows", "customerStatus", "customerVisible", "mapCustomerDocs", "prepareCustomerIdentity", "refreshCustomerSource", "resetCustomerSource", "sendCustomerSource", "tryCustomerLogin"]
};
export function register(context) {
  context.customerVisible = function customerVisible() {
    return !!context.auth.currentUser && context.currentDataMode === 'live';
  };
  context.customerKey = function customerKey() {
    return 'kaisi_planner_customer_read_v1:' + context.auth.currentUser?.uid + ':' + context.customerAuth.currentUser?.uid;
  };
  context.customerAllowed = function customerAllowed() {
    return !!context.customerAuth.currentUser && context.CUSTOMER_STAFF.has(context.customerAuth.currentUser.uid);
  };
  context.sendCustomerSource = function sendCustomerSource() {
    context.renderFinalPiSearch();
    const frame = document.getElementById('plannerFrame');
    document.getElementById('customerSourceStatus').textContent = context.currentDataMode === 'test' ? 'TEST：使用本機示範客訂，不讀正式客訂' : context.customerStatus + (context.customerFetchedAt ? ' · 最後取得 ' + new Date(context.customerFetchedAt).toLocaleString('zh-TW', {
      timeZone: 'Australia/Brisbane'
    }) : '');
    document.getElementById('customerSourceLogin').classList.toggle('d-none', context.currentDataMode === 'test' || context.customerAllowed());
    document.getElementById('customerSourceRefresh').disabled = context.customerBusy || !context.customerAllowed() || context.currentDataMode !== 'live';
    if (context.auth.currentUser && context.plannerLoaded && frame?.contentWindow) frame.contentWindow.postMessage({
      type: 'KAISI_CUSTOMER_SOURCE',
      mode: context.currentDataMode,
      orders: context.currentDataMode === 'live' ? context.customerRows : null,
      fetchedAt: context.customerFetchedAt,
      status: context.customerStatus
    }, '*');
  };
  context.resetCustomerSource = function resetCustomerSource() {
    context.customerGeneration++;
    context.customerRows = null;
    context.customerFetchedAt = 0;
    context.customerIdentity = '';
    context.customerRetryAt = 0;
    context.customerStatus = '客訂尚未連線';
    context.sendCustomerSource();
  };
  context.prepareCustomerIdentity = function prepareCustomerIdentity() {
    const identity = context.customerKey();
    if (identity === context.customerIdentity) return;
    context.customerGeneration++;
    context.customerIdentity = identity;
    context.customerRows = null;
    context.customerFetchedAt = 0;
    context.customerRetryAt = 0;
    try {
      const c = JSON.parse(localStorage.getItem(identity) || 'null');
      if (c && Array.isArray(c.orders) && Number.isFinite(c.at) && c.at <= Date.now()) {
        context.customerRows = c.orders;
        context.customerFetchedAt = c.at;
        context.customerStatus = '客訂使用本機快取';
      }
    } catch {}
  };
  context.mapCustomerDocs = function mapCustomerDocs(snapshot) {
    return snapshot.docs.map(d => {
      const row = d.data(),
        v = row.values;
      if (!Array.isArray(v) || v.length < 11) throw Error('客訂資料格式有變，保留上一份資料');
      const raw = v[6],
        qty = raw === null || raw === undefined || String(raw).trim() === '' ? null : Number(String(raw).replace(/,/g, ''));
      return {
        id: String(row.id || d.id),
        code: String(v[2] ?? '').trim().toUpperCase(),
        customer: String(v[1] ?? ''),
        qty: Number.isFinite(qty) ? qty : null,
        unit: String(v[7] ?? '').trim(),
        status: String(v[8] ?? ''),
        container: String(v[9] ?? ''),
        note: String(v[10] ?? '')
      };
    });
  };
  context.refreshCustomerSource = async function refreshCustomerSource(force = false) {
    if (!context.customerVisible()) return;
    if (!context.customerAllowed()) {
      context.customerStatus = context.customerAuth.currentUser ? '此客訂帳號未授權，請換帳號' : '請連接客訂帳號；尚未取得最新客訂';
      context.sendCustomerSource();
      return;
    }
    context.prepareCustomerIdentity();
    const now = Date.now();
    if (context.customerBusy) return;
    if (now < context.customerRetryAt) {
      context.sendCustomerSource();
      return;
    }
    if (context.customerRows !== null && (force ? now - context.customerFetchedAt < 30000 : !dueDaily(context.customerFetchedAt,now))) {
      context.customerStatus = force ? '已是最近 30 秒取得的客訂，避免重複讀取' : '客訂已是本次 08:30 更新週期';
      context.sendCustomerSource();
      return;
    }
    const generation = context.customerGeneration,
      identity = context.customerIdentity;
    context.customerBusy = true;
    context.customerStatus = '正在讀取客訂…';
    context.sendCustomerSource();
    try {
      const s = await context.getDocsFromServer(context.collection(context.customerDB, 'kaisi_customer_orders'));
      if (generation !== context.customerGeneration || identity !== context.customerKey() || !context.auth.currentUser || context.currentDataMode !== 'live') return;
      context.customerRows = context.mapCustomerDocs(s);
      context.customerFetchedAt = Date.now();
      context.customerStatus = `客訂已更新 · ${context.customerRows.length} 筆（唯讀）`;
      try {
        localStorage.setItem(identity, JSON.stringify({
          orders: context.customerRows,
          at: context.customerFetchedAt
        }));
      } catch {}
    } catch (error) {
      if (generation !== context.customerGeneration) return;
      const code = error.code || '';
      context.customerRetryAt = Date.now() + (code.includes('resource-exhausted') ? 60 * 60 * 1000 : 30000);
      context.customerStatus = code.includes('resource-exhausted') ? '客訂額度已用完；停止重試 1 小時，保留上次資料' : code.includes('permission-denied') ? '客訂讀取權限不足；保留上次資料' : '客訂更新失敗；保留上次資料（' + (code || error.message) + ')';
    } finally {
      context.customerBusy = false;
      context.sendCustomerSource();
    }
  };
  context.tryCustomerLogin = async function tryCustomerLogin(email, password) {
    if (context.customerAllowed()) return;
    try {
      await context.signInWithEmailAndPassword(context.customerAuth, email, password);
    } catch {
      context.customerStatus = '客訂專案需要首次登入；請在上方連接客訂帳號';
      context.sendCustomerSource();
    }
  };
}
export function initialize(context) {
  context.customerApp = context.initializeApp({
    apiKey: 'AIzaSyApntyby1Vpu4ZdrmX_N3QYyMcwXdaZu2U',
    authDomain: 'kaisi-catalogue-generator.firebaseapp.com',
    projectId: 'kaisi-catalogue-generator',
    storageBucket: 'kaisi-catalogue-generator.firebasestorage.app',
    messagingSenderId: '1023010186874',
    appId: '1:1023010186874:web:81e6c56e162a77065e7dc3'
  }, 'planner-customer-source');
  context.customerAuth = context.getAuth(context.customerApp);
  context.customerDB = context.getFirestore(context.customerApp);
  context.CUSTOMER_STAFF = new Set(['gKYdE0pLAIUIIp6z1YDcZMJ3mTm1', 'sxaJRywPDofoNl7alnJSUzcKFTu2', '1zYXkhhvLgbctjf9mw7ABX2yObn2', 'qXaSgF1pNvZVQoGzk7OE0OVmSIU2', 'NAcKChslC3QDfpHuN3Mfko2x0x73', 'vESJQmRs08NzdPhzF5Zb89JwMCD2', 'BYM7dnrOxsba5Poi3tgX908Pxs22', 'C4ZafUhpaDRsVSOQzya8r6p6C5Q2', 'OvLY8I6JShfB6s1Mc9dsrlszkdn2']);
  context.customerRows = null;
  context.customerFetchedAt = 0;
  context.customerStatus = '客訂尚未連線';
  context.customerBusy = false;
  context.customerGeneration = 0;
  context.customerIdentity = '';
  context.customerRetryAt = 0;
  setInterval(() => context.refreshCustomerSource(),60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)context.refreshCustomerSource()});
  context.CUSTOMER_CACHE_MS = 24 * 60 * 60 * 1000;
  document.getElementById('customerSourceLogin').addEventListener('submit', async e => {
    e.preventDefault();
    if (!context.auth.currentUser || context.currentDataMode !== 'live') return;
    const button = document.getElementById('customerSourceConnect');
    button.disabled = true;
    try {
      await context.setPersistence(context.customerAuth, document.getElementById('customerSourceRemember').checked ? context.browserLocalPersistence : context.browserSessionPersistence);
      await context.signInWithEmailAndPassword(context.customerAuth, document.getElementById('customerSourceEmail').value.trim(), document.getElementById('customerSourcePassword').value);
      document.getElementById('customerSourcePassword').value = '';
      await context.refreshCustomerSource();
    } catch {
      context.customerStatus = '客訂登入失敗，請確認客訂工具使用的帳號與密碼';
      context.sendCustomerSource();
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById('customerSourceRefresh').addEventListener('click', () => context.refreshCustomerSource(true));
  document.getElementById('customerSourceDisconnect').addEventListener('click', () => context.signOut(context.customerAuth));
  context.events.onMessage(e => {
    if (e.source === document.getElementById('plannerFrame')?.contentWindow && e.data?.type === 'KAISI_CUSTOMER_REFRESH') context.refreshCustomerSource(true);
  });
  document.addEventListener('shown.bs.tab', e => {
    if (e.target?.id === 'planner-tab') context.refreshCustomerSource();
  });
  context.onAuthStateChanged(context.customerAuth, () => {
    context.resetCustomerSource();
    context.refreshCustomerSource();
  });
}
