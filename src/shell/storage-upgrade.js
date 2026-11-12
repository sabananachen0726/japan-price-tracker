import {capacityReport, DOC_LIMIT, DOC_WARN, isSplit, migrationWrites, splitAppData, bytes} from '../shared/app-storage.js';

const kb = n => Math.round(n / 1024).toLocaleString() + ' KB';
const pct = n => Math.round(n / DOC_LIMIT * 100) + '%';

// Admin notice in 資料匯入中心: the one-time move to storage v2, and later a warning when any
// stored document passes 80 % of Firestore's per-document limit.
export function installStorageUpgrade(context) {
  const bar = document.createElement('div');
  bar.id = 'storageNotice';
  bar.className = 'storage-notice';
  bar.hidden = true;
  let busy = false, shown = '';
  // Re-rendering on every sync would shift the page under the user's cursor.
  const show = (cls, html) => {
    const key = cls + html;
    if (key === shown && !bar.hidden) return;
    shown = key; bar.className = cls; bar.innerHTML = html; bar.hidden = false;
  };
  const hide = () => { if (!bar.hidden) bar.hidden = true; shown = ''; };

  function render() {
    const state = context.storageState;
    if (busy) return;
    if (!context.isAdmin() || context.currentDataMode !== 'live' || !state.loaded) { hide(); return; }
    if (!state.split) {
      const parts = splitAppData(window.appData);
      const now = capacityReport(window.appData, {split: false})[0].bytes;
      show('storage-notice upgrade', `<div><strong>需要升級儲存方式</strong>
        <p>目前所有資料都放在同一份共享文件，已用 <b>${kb(now)}</b>（${pct(now)}，上限約 ${kb(DOC_LIMIT)}）${now >= DOC_WARN ? '，快到上限，PI 和報價可能存不進去' : ''}。
        升級後報價和 PI 會各自放在獨立文件：商品主文件約 ${kb(bytes(parts.main))}、報價約 ${kb(bytes(parts.quotes))}、PI 約 ${kb(bytes(parts.pis))}。</p>
        <p class="small mb-0">請先在 Firebase Console 發布新版規則，再按升級；升級前會先請你下載完整備份。只需由一位 Admin 做一次，完成後請同事重新整理網頁。</p></div>
        <div class="storage-actions"><button type="button" class="btn btn-outline-primary" data-storage-backup>下載完整備份</button><button type="button" class="btn btn-primary" data-storage-upgrade>升級儲存方式</button></div>
        <p class="storage-status small mb-0" role="status" aria-live="polite"></p>`);
      return;
    }
    const high = capacityReport(window.appData, {split: true}).filter(r => r.bytes >= DOC_WARN);
    if (!high.length) { hide(); return; }
    show('storage-notice warn', `<div><strong>共享資料容量提醒</strong><p class="mb-0">${high.map(r => `${r.label}已用 ${kb(r.bytes)}（${pct(r.bytes)}）`).join('、')}。超過約 90% 會無法儲存，請整理舊資料或聯絡維護者。</p></div>`);
  }

  async function upgrade() {
    if (busy) return;
    const status = bar.querySelector('.storage-status');
    if (!confirm('升級儲存方式：把報價和 PI 搬到獨立文件。\n\n請確認：\n1. 已在 Firebase Console 發布新版規則\n2. 已下載完整備份\n\n搬移是一次完成的：全部成功或全部不變。要開始嗎？')) return;
    busy = true;
    bar.querySelectorAll('button').forEach(b => b.disabled = true);
    status.textContent = '搬移中，請勿關閉頁面…';
    const uid = context.auth.currentUser?.uid;
    try {
      await context.runTransaction(context.db, async tx => {
        const snap = await tx.get(context.PROD_DOC_REF);
        if (!context.isAdmin() || context.currentDataMode !== 'live' || context.auth.currentUser?.uid !== uid) throw Error('帳號或模式已變更');
        if (!snap.exists()) throw Error('找不到正式 main_config');
        const main = snap.data();
        if (isSplit(main)) throw Error('已經是新的儲存方式，請重新整理網頁');
        const over = capacityReport(main, {split: true}).filter(r => r.bytes > 950000);
        if (over.length) throw Error(over.map(r => r.label).join('、') + ' 搬移後仍超過上限');
        const refs = {main: context.PROD_DOC_REF, quotes: context.QUOTES_REF, pis: context.PI_REF};
        for (const [key, payload, options] of migrationWrites(main, {FieldPath: context.FieldPath, deleteField: context.deleteField})) tx.set(refs[key], payload, options);
      });
      status.textContent = '✓ 已完成升級。正在重新讀取資料…';
    } catch (err) {
      const denied = /permission|insufficient/i.test(String(err?.code || err?.message));
      status.textContent = '未升級，資料沒有變更：' + (denied ? 'Firebase 規則尚未更新，請先發布新版規則' : err.message || err);
      bar.querySelectorAll('button').forEach(b => b.disabled = false);
    } finally { busy = false; }
  }

  bar.addEventListener('click', e => {
    if (e.target.closest('[data-storage-upgrade]')) void upgrade();
    if (e.target.closest('[data-storage-backup]')) void context.exportToCSV();
  });
  // Lives in 資料匯入中心, under its heading, so it never moves the order planner.
  const mount = () => {
    const hero = document.querySelector('#add-panel .import-hub-hero');
    if (!hero) return false;
    if (!bar.isConnected) hero.after(bar);
    return true;
  };
  if (!mount()) document.addEventListener('DOMContentLoaded', mount);
  document.addEventListener('kaisi:storage-state', () => { mount(); render(); });
}
