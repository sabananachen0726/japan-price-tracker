import {quantityComparison} from '../quantity-comparison.js';
import {orderVersion, sameOrder, orderDifferences, reconcileOrder} from '../../shared/order-version.js';

export const definition = {
  id: 'order-sync',
  owns: [
    ...['orderBaselines', 'orderConflicts', 'orderPending'].map(name => ({name, kind: 'const'})),
    {name: 'orderSyncReady', kind: 'let'},
    ...['resetOrderSync', 'receiveOrderDrafts', 'rememberOrderBase', 'refreshOrderSync', 'reviewOrderConflict', 'finishOrderSave', 'refreshQuantityComparison'].map(name => ({name, kind: 'function'}))
  ],
  imports: ['openPlannerDialog', 'draft', 'draftFingerprint', '$', 'state', 'currentKey', 'trackerFeed', 'plannerRole', 'people', 'deferredDrafts', 'dirtyDrafts', 'saveFingerprints', 'localRecovery', 'localRecoveryScope', 'flushRecovery', 'stageLocalDraft', 'storeLocal', 'loadWork', 'renderAll', 'autosaveLabel', 'clearRecoveredWork'],
  writes: ['orderBaselines', 'orderConflicts', 'orderPending', 'orderSyncReady', 'resetOrderSync', 'receiveOrderDrafts', 'rememberOrderBase', 'refreshOrderSync', 'reviewOrderConflict', 'finishOrderSave', 'refreshQuantityComparison']
};

export function register(context) {
  context.resetOrderSync = function resetOrderSync() {
    context.orderBaselines.clear();
    context.orderConflicts.clear();
    context.orderPending.clear();
    context.orderSyncReady = false;
  };
  context.rememberOrderBase = function rememberOrderBase(code) {
    if (!context.orderBaselines.has(code) && !context.dirtyDrafts.has(code) && context.orderSyncReady) {
      context.orderBaselines.set(code, orderVersion(context.deferredDrafts[code]));
    }
  };
  context.receiveOrderDrafts = function receiveOrderDrafts(snapshotReceived = false) {
    if (snapshotReceived) context.orderSyncReady = true;
    if (context.trackerFeed?.mode !== 'live' || !context.orderSyncReady) return;
    const codes = new Set([...Object.keys(context.state.drafts), ...Object.keys(context.deferredDrafts)]);
    for (const code of codes) {
      if (code.startsWith('__')) continue;
      const remote = context.deferredDrafts[code] || null;
      const local = context.state.drafts[code];
      if (!context.dirtyDrafts.has(code)) {
        if (remote) context.state.drafts[code] = structuredClone(remote);
        else delete context.state.drafts[code];
        context.orderBaselines.set(code, orderVersion(remote));
        context.orderConflicts.delete(code);
      } else {
        // An optimistic own write may reach the listener before its acknowledgement.
        const pending = context.orderPending.get(code);
        const ownWrite = pending && remote?.revision === pending.revision;
        const base = context.orderBaselines.get(code);
        if (!ownWrite && (typeof base !== 'string' || base !== orderVersion(remote))) {
          context.orderConflicts.set(code, remote);
        } else if (!ownWrite) context.orderConflicts.delete(code);
        if (local) {
          local.notes = remote?.notes || [];
          local.preparedAt = remote?.preparedAt;
          local.preparedBy = remote?.preparedBy;
        }
      }
    }
    const active = context.currentKey(), remote = context.deferredDrafts[active];
    // Update both quantity rows and work-level controls when an unedited work changes remotely.
    if (remote && !context.dirtyDrafts.has(active)) {
      context.$('kind').value = remote.kind || 'dry';
      context.$('arrival').value = remote.arrival || '';
      context.$('coverage').value = remote.coverage ?? 1;
    }
    context.storeLocal();
    context.refreshOrderSync();
  };
  context.refreshOrderSync = function refreshOrderSync() {
    const code = context.currentKey(), live = context.trackerFeed?.mode === 'live';
    const conflict = live && context.orderConflicts.has(code);
    const pending = context.orderPending.has(code);
    const remote = context.deferredDrafts[code];
    if (live && context.orderSyncReady) context.rememberOrderBase(code);
    context.refreshQuantityComparison();
    const version = context.$('orderVersionStatus');
    if (version) {
      const by = Object.values(context.people || {}).find(p => p.email === remote?.submittedBy)?.name || remote?.submittedBy || '同事';
      version.textContent = !live ? 'TEST：僅本機資料' : !context.orderSyncReady ? '正在確認雲端工作單版本…'
        : remote?.updatedAt ? '雲端最後提交：' + by + ' · ' + new Date(remote.updatedAt).toLocaleString('zh-TW', {timeZone: 'Australia/Brisbane'}) : '尚無已提交版本';
    }
    const banner = context.$('orderConflictBanner');
    if (banner) banner.hidden = !conflict;
    const message = context.$('orderConflictText');
    if (message && conflict) message.textContent = remote
      ? '雲端版本與本機草稿不同，已暫停提交，避免覆蓋同事的更新。請先比較並處理。'
      : '雲端已刪除此工作單，或本機草稿缺少版本紀錄。請先比較並確認是否重新建立。';
    for (const id of ['savePlan', 'exportPlan']) {
      const button = context.$(id);
      if (button) button.disabled = context.plannerRole === 'viewer' || pending || (live && (!context.orderSyncReady || conflict));
    }
  };
  context.refreshQuantityComparison = function refreshQuantityComparison(changedCode) {
    const show = context.$('showSubmittedQuantity')?.checked && context.trackerFeed?.mode === 'live' && context.orderSyncReady;
    const remote = context.deferredDrafts[context.currentKey()];
    const rows = context.draft().rows || {};
    for (const el of context.$('productRows').querySelectorAll('[data-qty-comparison]')) {
      const code = el.dataset.qtyComparison;
      if (changedCode && code !== changedCode) continue;
      const comparison = show ? quantityComparison(rows[code] ?? 0, remote, code) : null;
      el.textContent = comparison?.text || '';
      el.hidden = !comparison;
      el.className = 'qty-comparison ' + (comparison?.delta > 0 ? 'quantity-increase' : 'quantity-decrease');
    }
  };
  context.reviewOrderConflict = function reviewOrderConflict() {
    const code = context.currentKey();
    if (!context.orderConflicts.has(code)) return;
    const local = structuredClone(context.state.drafts[code] || {});
    const remote = structuredClone(context.orderConflicts.get(code));
    const version = orderVersion(remote);
    const differences = orderDifferences(local, remote);
    const dialog = context.$('orderConflictDialog'), body = context.$('orderConflictRows');
    body.replaceChildren();
    const labels = {kind: '貨別', arrival: '預計到倉', coverage: '備貨月數', rows: '箱數', itemNotes: '商品備註'};
    for (const [index, row] of differences.entries()) {
      const tr = document.createElement('tr');
      for (const value of [labels[row.field] + (['rows', 'itemNotes'].includes(row.field) ? ' · ' + row.key : ''), row.remote, row.local]) {
        const td = document.createElement('td');
        td.textContent = value === undefined || value === '' ? '未填' : String(value);
        tr.append(td);
      }
      const td = document.createElement('td'), checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.dataset.difference = index;
      checkbox.setAttribute('aria-label', '採用本機 ' + labels[row.field] + ' ' + row.key);
      td.append(checkbox); tr.append(td); body.append(tr);
    }
    context.$('orderConflictEmpty').hidden = differences.length > 0;
    context.$('orderConflictApply').onclick = () => {
      if (context.currentKey() !== code) return dialog.close();
      if (version !== orderVersion(context.deferredDrafts[code])) {
        alert('比較期間雲端又有更新，請重新比較。'); dialog.close(); context.reviewOrderConflict(); return;
      }
      if (!sameOrder(local, context.state.drafts[code])) {
        alert('比較期間本機草稿已變更，請重新比較。'); dialog.close(); context.reviewOrderConflict(); return;
      }
      // Retain a downloadable recovery copy even after the user accepts a different version.
      context.localRecovery.archives ||= [];
      context.localRecovery.archives.push({code, archivedAt: new Date().toISOString(), baseVersion: context.orderBaselines.get(code) ?? null, draft: local});
      const selected = new Set([...body.querySelectorAll('input:checked')].map(el => Number(el.dataset.difference)));
      const next = reconcileOrder(local, context.deferredDrafts[code], selected);
      context.orderBaselines.set(code, version);
      context.orderConflicts.delete(code);
      context.dirtyDrafts.delete(code);
      if (remote || selected.size) context.state.drafts[code] = next;
      else delete context.state.drafts[code];
      context.clearRecoveredWork(code);
      if (remote || selected.size) {
        context.loadWork(code);
        if (!sameOrder(next, remote)) context.stageLocalDraft();
      } else context.renderAll();
      context.flushRecovery(); context.storeLocal(); context.refreshOrderSync();
      if (!context.dirtyDrafts.has(code)) context.autosaveLabel(remote ? '✓ 已載入雲端最新版本' : '✓ 已接受雲端刪除；原草稿仍在本機備份', 'ok');
      dialog.close();
    };
    if (!dialog.open) context.openPlannerDialog(dialog);
  };
  context.finishOrderSave = function finishOrderSave(message) {
    const code = message.code, pending = context.orderPending.get(code);
    if (!pending || message.requestId !== pending.requestId) return;
    context.orderPending.delete(code);
    if (message.ok) {
      if (!message.localOnly && message.draft) {
        context.orderBaselines.set(code, orderVersion(message.draft));
        // Do not overwrite a newer snapshot received after this save committed.
        const latest = context.deferredDrafts[code];
        if (!latest || orderVersion(latest) === pending.expectedVersion || latest.revision === pending.revision) context.deferredDrafts[code] = message.draft;
      }
      const current = context.state.drafts[code];
      if (current && context.saveFingerprints.get(code) === context.draftFingerprint(current)) {
        context.dirtyDrafts.delete(code);
        if (!message.localOnly) context.clearRecoveredWork(code);
        context.autosaveLabel(message.localOnly ? '✓ TEST 本機草稿已保存' : '✓ 已提交 Firebase，其他帳號可查看', 'ok');
      } else {
        // Editing while a submission is pending remains a separate, unsent local draft.
        if (context.localRecovery.works?.[code]) context.localRecovery.works[code].baseVersion = context.orderBaselines.get(code) ?? null;
        context.flushRecovery();
        context.autosaveLabel('提交已完成；之後的新修改仍在本機，請再次提交', 'warn');
      }
      context.orderConflicts.delete(code);
      context.receiveOrderDrafts();
    } else if (message.conflict) {
      context.deferredDrafts[code] = message.latest;
      if (!message.latest) delete context.deferredDrafts[code];
      context.orderConflicts.set(code, message.latest || null);
      context.autosaveLabel('雲端已有更新，已阻止覆蓋；本機草稿仍保留', 'warn');
    } else context.autosaveLabel('提交失敗：' + (message.error || '請稍後重試') + '；本機草稿仍保留', 'warn');
    context.saveFingerprints.delete(code);
    context.storeLocal(); context.renderAll(); context.refreshOrderSync();
  };
}

export function initialize(context) {
  context.orderBaselines = new Map();
  context.orderConflicts = new Map();
  context.orderPending = new Map();
  context.orderSyncReady = false;
  const comparison = context.$('showSubmittedQuantity');
  try {comparison.checked = localStorage.getItem('kaisi_show_submitted_quantity_v1') === 'true';} catch {}
  comparison.onchange = () => {
    try {localStorage.setItem('kaisi_show_submitted_quantity_v1', String(comparison.checked));} catch {}
    context.refreshQuantityComparison();
  };
  context.$('reviewOrderConflict').onclick = context.reviewOrderConflict;
  context.$('orderConflictCancel').onclick = () => context.$('orderConflictDialog').close();
  context.$('exportOrderRecovery').onclick = () => {
    const blob = new Blob([JSON.stringify(context.localRecovery, null, 2)], {type: 'application/json'});
    const a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = 'Purchase_Local_Drafts_' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
}
