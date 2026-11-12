import {formatPiExpiry} from '../../shared/pi-paste.js';
import {auditPiData, planPiRepairs, commitPiRepairs, piRowsVersion} from '../../shared/pi-audit.js';
export const definition = {
  id: 'pi-audit', owns: ['renderPiAudit', 'openPiAudit'].map(name => ({name, kind: 'function'})),
  imports: ['PI_REF', 'storageState', 'auth', 'isAdmin', 'currentDataMode', 'inventoryData', 'chooseImportView', 'db', 'PROD_DOC_REF', 'FieldPath', 'runTransaction', 'saveFirebaseData', 'savedAppData', 'refreshUI', 'sendPlannerSnapshot', 'sendContainerSnapshot', 'escapeFinalPiText'],
  writes: ['renderPiAudit', 'openPiAudit']
};
export function register(context) {
  context.openPiAudit = function openPiAudit() {
    document.getElementById('add-tab').click(); context.chooseImportView('issues'); context.renderPiAudit();
  };
}
export function initialize(context) {
  let issues = [], scope = null, busy = false;
  const esc = context.escapeFinalPiText, host = document.getElementById('piAuditRows'), status = document.getElementById('piAuditStatus');
  const fields = {itemCode: '品號', barcode: '條碼', qty: '箱數', unitPrice: '單價', expiryDate: '效期', identity: '商品配對', unit: '採購單位', duplicate: '可能重複'};
  context.renderPiAudit = function renderPiAudit() {
    if (busy || !context.isAdmin()) return;
    issues = auditPiData(window.appData, context.inventoryData?.rows || {});
    scope = {mode: context.currentDataMode, uid: context.auth.currentUser?.uid};
    status.textContent = `${scope.mode.toUpperCase()}：檢查 ${Object.keys(window.appData.finalPiContainers || {}).length} 櫃，發現 ${issues.length} 項待確認，其中 ${issues.filter(i => typeof i.suggestion === 'string').length} 項可提議清理。尚未修改資料。`;
    host.innerHTML = issues.map((issue, i) => `<tr><td><input type="checkbox" data-pi-repair="${i}" aria-label="選取 ${esc(issue.container)} 第 ${issue.index + 1} 列 ${fields[issue.field]}" ${typeof issue.suggestion !== 'string' ? 'disabled' : ''}></td><td>${esc(issue.container)}<br>第 ${issue.index + 1} 列</td><td>${esc(issue.row.itemCode || issue.row.barcode || '未填')}</td><td>${fields[issue.field]}<br><code>${esc(JSON.stringify(issue.before) ?? '未填')}</code></td><td>${typeof issue.suggestion === 'string' ? esc(JSON.stringify(issue.suggestion)) : '需人工核對'}</td><td>${esc(issue.reason)}</td><td><button type="button" class="btn btn-sm btn-outline-primary" data-pi-audit-open="${i}">${issue.field === 'unit' ? '前往單位匯入' : '回到此櫃 PI'}</button></td></tr>`).join('') || '<tr><td colspan="7">未發現可辨識的異常。未保留的原始列或已漏掉的資料，仍需原 Excel 才能還原。</td></tr>';
  };
  document.getElementById('scanPiAudit').onclick = context.renderPiAudit;
  document.getElementById('exportPiAudit').onclick = () => {
    if (!context.isAdmin() || !scope) return;
    if (typeof XLSX === 'undefined') {status.textContent = 'Excel 元件尚未載入'; return;}
    const rows = [['貨櫃', '明細列', '品號', '欄位', '目前值', '建議值', '原因'], ...issues.map(i => [i.container, i.index + 1, i.row.itemCode || '', fields[i.field], JSON.stringify(i.before) ?? '', i.suggestion ?? '', i.reason])];
    const book = XLSX.utils.book_new(), sheet = XLSX.utils.aoa_to_sheet(rows); sheet['!cols'] = [{wch:20},{wch:10},{wch:20},{wch:15},{wch:30},{wch:30},{wch:65}]; XLSX.utils.book_append_sheet(book, sheet, 'PI Audit'); XLSX.writeFile(book, 'PI_Audit_' + new Date().toISOString().slice(0,10) + '.xlsx');
  };
  host.onclick = event => {
    const button = event.target.closest('[data-pi-audit-open]'); if (!button || !context.isAdmin()) return;
    const issue = issues[Number(button.dataset.piAuditOpen)], pi = window.appData.finalPiContainers?.[issue?.key]; if (!pi) return;
    if (issue.field === 'unit') {context.chooseImportView('planner'); return;}
    context.chooseImportView('pi'); document.getElementById('finalPiPaste').closest('details').open = true; document.getElementById('finalPiContainer').value = pi.container || issue.key;
    const supplier = document.getElementById('finalPiSupplier'); if ([...supplier.options].some(o => o.value === pi.supplier)) supplier.value = pi.supplier;
    const quote = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const mode = document.getElementById('finalPiPasteMode');
    mode.value = 'table'; mode.dispatchEvent(new Event('change'));
    document.getElementById('finalPiMapping').open = false;
    document.getElementById('finalPiPaste').value = [['JAN Code','Qty(CTN)','Item Code','Unit Price','Expiry Date','Shelf Life (Months)'], ...pi.rows.map(r => [r.barcode,r.qty,r.itemCode,r.unitPrice,formatPiExpiry(r.expiryDate),r.shelfLifeMonths])].map(row => row.map(quote).join('\t')).join('\n');
    document.getElementById('finalPiImportHint').textContent = `已載入 ${pi.container || issue.key}；請核對第 ${issue.index + 1} 列：${issue.reason}。尚未儲存；重新匯入會完整覆蓋此櫃並取消 Final，請先預覽。`;
    document.getElementById('finalPiPaste').focus();
  };
  document.getElementById('applyPiAudit').onclick = async () => {
    if (busy || !context.isAdmin() || !scope) return;
    if (scope.mode !== context.currentDataMode || scope.uid !== context.auth.currentUser?.uid) {status.textContent = '帳號或模式已改變，請重新排查'; return;}
    const selected = [...host.querySelectorAll('[data-pi-repair]:checked')].map(el => issues[Number(el.dataset.piRepair)]);
    if (!selected.length) {status.textContent = '請先勾選要清理的品號／條碼；數量、單價等異常不可自動修正。'; return;}
    let changes; try {changes = planPiRepairs(window.appData, selected);} catch (err) {status.textContent = err.message; return;}
    const preview = document.createElement('dialog'); preview.id = 'piRepairPreview'; preview.className = 'pi-paste-preview';
    const heading = document.createElement('h3'); heading.textContent = '確認歷史 PI 清理'; preview.append(heading);
    const p = document.createElement('p'); p.textContent = `只清理勾選的 ${selected.length} 個品號／條碼欄位。不改箱數、單價、效期、Final 標記或入倉日期。`; preview.append(p);
    const list = document.createElement('pre'); list.textContent = selected.map(i => `${i.container} 第 ${i.index + 1} 列 ${fields[i.field]}：${JSON.stringify(i.before)} → ${JSON.stringify(i.suggestion)}`).join('\n'); preview.append(list);
    const feedback = document.createElement('p'); feedback.id = 'piRepairStatus'; feedback.setAttribute('role','status'); feedback.setAttribute('aria-live','polite'); preview.append(feedback);
    const setFeedback = message => {feedback.textContent = message; status.textContent = message;};
    const cancel = document.createElement('button'); cancel.className = 'btn btn-outline-secondary'; cancel.textContent = '取消'; cancel.onclick = () => {preview.close(); preview.remove();};
    const apply = document.createElement('button'); apply.id = 'confirmPiRepair'; apply.className = 'btn btn-primary ms-2'; apply.textContent = '確認清理';
    apply.onclick = async () => {
      if (busy) return;
      if (!context.isAdmin() || scope.mode !== context.currentDataMode || scope.uid !== context.auth.currentUser?.uid) {setFeedback('帳號、權限或模式已改變，請取消後重新排查。'); return;}
      busy = true; apply.disabled = true; cancel.disabled = true; apply.textContent = '清理中…'; setFeedback('正在確認雲端版本並儲存，請稍候…'); const mode = scope.mode, uid = scope.uid;
      try {
        if (mode === 'test') {
          planPiRepairs(window.appData, selected);
          for (const change of changes) window.appData.finalPiContainers[change.key].rows = change.rows;
          if (!await context.saveFirebaseData()) throw Error('TEST 本機儲存失敗');
        } else {
          await commitPiRepairs({runTransaction:context.runTransaction,db:context.db,ref:context.storageState.split?context.PI_REF:context.PROD_DOC_REF,FieldPath:context.FieldPath,changes});
          if (mode !== context.currentDataMode || uid !== context.auth.currentUser?.uid) {setFeedback('原帳號的 LIVE 清理已儲存；目前帳號或模式已改變，請關閉後重新排查。'); apply.textContent = '已完成'; cancel.disabled = false; return;}
          for (const change of changes) {
            if (piRowsVersion(window.appData.finalPiContainers?.[change.key]?.rows) === change.baseline) window.appData.finalPiContainers[change.key].rows = change.rows;
            if (piRowsVersion(context.savedAppData?.finalPiContainers?.[change.key]?.rows) === change.baseline) context.savedAppData.finalPiContainers[change.key].rows = structuredClone(change.rows);
          }
        }
        context.refreshUI(); context.sendPlannerSnapshot(); context.sendContainerSnapshot(); preview.close(); preview.remove(); busy = false; context.renderPiAudit(); status.textContent = `已清理 ${selected.length} 個欄位；其餘資料未修改。`;
      } catch (err) {setFeedback('未完成清理：' + (err.code ? '[' + err.code + '] ' : '') + err.message + '。請核對後重試，或取消並重新排查。'); apply.disabled = false; cancel.disabled = false; apply.textContent = '重試清理';}
      finally {busy = false;}
    };
    preview.append(cancel, apply); preview.addEventListener('cancel', e => {if (busy) e.preventDefault(); else preview.remove();}); document.body.append(preview); preview.showModal();
  };
}
