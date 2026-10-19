// shell: utilities. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "utilities",
  "owns": [{
    "name": "showAppToast",
    "kind": "function"
  }, {
    "name": "cleanBarcode",
    "kind": "function"
  }, {
    "name": "normalizeContainerNo",
    "kind": "function"
  }],
  "imports": [],
  "writes": ["cleanBarcode", "normalizeContainerNo", "showAppToast"]
};
export function register(context) {
  context.showAppToast = function showAppToast(message, type = 'success') {
    let wrap = document.getElementById('appToastContainer');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'appToastContainer';
      wrap.className = 'toast-container position-fixed top-0 end-0 p-3';
      wrap.style.zIndex = '2000';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = `toast align-items-center text-bg-${type} border-0`;
    el.setAttribute('role', 'alert');
    el.innerHTML = `<div class="d-flex"><div class="toast-body fw-semibold">${message}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
    wrap.appendChild(el);
    const toast = new bootstrap.Toast(el, {
      delay: 2800
    });
    el.addEventListener('hidden.bs.toast', () => el.remove());
    toast.show();
  };
  context.cleanBarcode = function cleanBarcode(str) {
    if (!str) return "";
    str = String(str).trim();
    str = str.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
    return str.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  };
  context.normalizeContainerNo = function normalizeContainerNo(value) {
    return String(value || '').trim().toUpperCase();
  };
}
export function initialize(context) {}
