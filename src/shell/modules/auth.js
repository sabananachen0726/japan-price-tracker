// shell: auth. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "auth",
  "owns": [{
    "name": "escapeHtml",
    "kind": "function"
  }, {
    "name": "firebaseConfig",
    "kind": "const"
  }, {
    "name": "app",
    "kind": "const"
  }, {
    "name": "db",
    "kind": "const"
  }, {
    "name": "auth",
    "kind": "const"
  }, {
    "name": "BOOTSTRAP_ADMIN_EMAIL",
    "kind": "const"
  }, {
    "name": "currentRole",
    "kind": "let"
  }, {
    "name": "roleDoc",
    "kind": "const"
  }, {
    "name": "isAdmin",
    "kind": "const"
  }, {
    "name": "canPlan",
    "kind": "const"
  }, {
    "name": "applyRoleUI",
    "kind": "function"
  }, {
    "name": "loadRole",
    "kind": "function"
  }, {
    "name": "refreshUsers",
    "kind": "function"
  }],
  "imports": ["ORDER_PLANNER_REF", "people", "currentDataMode", "collection", "doc", "getAuth", "getDoc", "getDocsFromServer", "getFirestore", "initializeApp", "setDoc"],
  "writes": ["BOOTSTRAP_ADMIN_EMAIL", "app", "applyRoleUI", "auth", "canPlan", "currentRole", "db", "escapeHtml", "firebaseConfig", "isAdmin", "loadRole", "refreshUsers", "roleDoc"]
};
export function register(context) {
  context.escapeHtml = function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[ch]);
  };
  context.applyRoleUI = function applyRoleUI() {
    document.body.dataset.role = context.currentRole || 'none';
    const badge = document.getElementById('roleBadge');
    badge.textContent = (context.currentRole || 'UNAPPROVED').toUpperCase();
    badge.classList.toggle('d-none', !context.currentRole);
    document.getElementById('btnUsers').classList.toggle('d-none', !context.isAdmin());
    document.querySelectorAll('#container-panel iframe').forEach(x => x.style.pointerEvents = context.isAdmin() ? '' : 'none');
    document.querySelectorAll('#finalpi-panel button').forEach(b => {
      if (!context.isAdmin() && /^(btnImport|btnChooseFinalPi)/.test(b.id)) b.disabled = true;
    });
    if (context.currentRole === 'viewer' && document.getElementById('add-tab').classList.contains('active')) bootstrap.Tab.getOrCreateInstance(document.getElementById('compare-tab')).show();
  };
  context.loadRole = async function loadRole(user) {
    const snap = await context.getDoc(context.roleDoc(user.uid));
    const role = snap.exists() ? snap.data().role : null;
    if (!['admin', 'editor', 'viewer'].includes(role)) throw Error('帳號尚未經 Admin 核准，請聯絡管理員。');
    return role;
  };
  context.refreshUsers = async function refreshUsers() {
    const host = document.getElementById('userRows');
    host.textContent = '讀取中...';
    try {
      const snaps = await context.getDocsFromServer(context.collection(context.db, 'user_roles'));
      host.innerHTML = '';
      snaps.forEach(d => {
        const x = d.data(),
          row = document.createElement('div');
        row.className = 'border-bottom py-2';
        row.innerHTML = '<div>' + context.escapeHtml(x.email || d.id) + ' ｜ ' + context.escapeHtml(x.role || 'disabled') + '</div><div class="d-flex gap-2 mt-1"><input class="form-control form-control-sm" data-profile-uid="' + context.escapeHtml(d.id) + '" data-profile-email="' + context.escapeHtml(x.email || '') + '" aria-label="顯示名字" placeholder="例如 Sabrina、Jimmy" maxlength="50" value="' + context.escapeHtml(context.people?.[d.id]?.name || x.displayName || '') + '"><button class="btn btn-sm btn-outline-primary" data-save-profile="' + context.escapeHtml(d.id) + '">儲存名字</button><button class="btn btn-sm btn-outline-secondary" data-edit-role="' + context.escapeHtml(d.id) + '">編輯權限</button></div>';
        row.querySelector('[data-edit-role]').onclick = () => {document.getElementById('grantUid').value=d.id;document.getElementById('grantEmail').value=x.email || '';document.getElementById('grantRole').value=x.role || 'disabled';};
        host.appendChild(row);
      });
      if (!host.querySelector('[data-profile-uid="' + context.auth.currentUser.uid + '"]')) {
        const row = document.createElement('div'); row.className='border-bottom py-2';
        row.innerHTML='<div>我的名字（Admin）</div><div class="d-flex gap-2"><input class="form-control form-control-sm" data-profile-uid="' + context.escapeHtml(context.auth.currentUser.uid) + '" data-profile-email="' + context.escapeHtml(context.auth.currentUser.email || '') + '" maxlength="50" aria-label="我的顯示名字" value="' + context.escapeHtml(context.people?.[context.auth.currentUser.uid]?.name || '') + '"><button class="btn btn-sm btn-outline-primary" data-save-profile="' + context.escapeHtml(context.auth.currentUser.uid) + '">儲存名字</button></div>';
        host.prepend(row);
      }
    } catch (e) {
      host.textContent = '讀取失敗：' + (e.code || e.message);
    }
  };
}
export function initialize(context) {
  document.getElementById('userRows').addEventListener('click',async e => {
    const uid=e.target.closest('[data-save-profile]')?.dataset.saveProfile;
    if (!uid || !context.isAdmin()) return;
    if (context.currentDataMode !== 'live') {document.getElementById('grantStatus').textContent='請切換 LIVE 後修改名字。';return;}
    const input=[...document.querySelectorAll('[data-profile-uid]')].find(el=>el.dataset.profileUid===uid);
    const name=input.value.trim(),email=input.dataset.profileEmail;
    const status=document.getElementById('grantStatus');
    if(name.length>50){status.textContent='名字最多 50 個字。';return;}
    try{await context.setDoc(context.ORDER_PLANNER_REF,{people:{[uid]:{name,email}}},{merge:true});status.textContent='名字已儲存，留言會同步更新。';}
    catch(err){status.textContent='名字儲存失敗，請重試。';}
  });
  context.firebaseConfig = {
    apiKey: "AIzaSyCPFkJo7MTDpr8AHLC7yI9FTpmJtpNhd80",
    authDomain: "japan-price-tracker.firebaseapp.com",
    projectId: "japan-price-tracker",
    storageBucket: "japan-price-tracker.firebasestorage.app",
    messagingSenderId: "1002513622800",
    appId: "1:1002513622800:web:81d46a4652394990c42795",
    measurementId: "G-443QV3DGB8"
  };
  context.app = context.initializeApp(context.firebaseConfig);
  context.db = context.getFirestore(context.app);
  context.auth = context.getAuth(context.app);
  context.BOOTSTRAP_ADMIN_EMAIL = 'sabrinachen0726@gmail.com';
  context.currentRole = null;
  context.roleDoc = uid => context.doc(context.db, 'user_roles', uid);
  context.isAdmin = () => context.currentRole === 'admin';
  context.canPlan = () => context.currentRole === 'admin' || context.currentRole === 'editor';
  document.getElementById('refreshUsers').onclick = () => {
    if (context.isAdmin()) context.refreshUsers();
  };
  document.getElementById('grantSave').onclick = async () => {
    if (!context.isAdmin()) return;
    const uid = document.getElementById('grantUid').value.trim(),
      email = document.getElementById('grantEmail').value.trim().toLowerCase(),
      role = document.getElementById('grantRole').value;
    const status = document.getElementById('grantStatus');
    if (!/^[a-zA-Z0-9_-]{12,128}$/.test(uid) || !email.includes('@')) {
      status.textContent = '請填入正確 UID 和 Email';
      return;
    }
    if (!['editor','viewer','disabled'].includes(role)) {status.textContent='請選擇有效的權限。';return;}
    if (uid === context.auth.currentUser.uid || email === context.BOOTSTRAP_ADMIN_EMAIL) {
      status.textContent = '不可透過此介面修改首位 Admin';
      return;
    }
    try {
      await context.setDoc(context.roleDoc(uid), {
        email,
        role,
        updatedAt: new Date().toISOString()
      });
      status.textContent = '已儲存；下次登入生效';
      context.refreshUsers();
    } catch (e) {
      status.textContent = '儲存失敗：' + (e.code || e.message);
    }
  };
}
