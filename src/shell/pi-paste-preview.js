export function reviewPiPaste(parsed, groups, message = '') {
  return new Promise(resolve => {
    const old = document.getElementById('piPastePreview'); if (old) return resolve(false);
    const dialog = document.createElement('dialog'); dialog.id = 'piPastePreview'; dialog.className = 'pi-paste-preview';
    const title = document.createElement('h3'); title.textContent = 'PI 匯入預覽'; dialog.append(title);
    const stats = document.createElement('p'); stats.id = 'piPasteStats'; stats.textContent = `已清理 ${parsed.stats.cleanedIdentifiers} 個識別欄位、略過 ${parsed.stats.blankRows} 列空白、讀取 ${parsed.stats.multilineCells} 個含換行儲存格；${parsed.invalid.length} 列需要確認。`; dialog.append(stats);
    if (message) {const p = document.createElement('p'); p.style.whiteSpace = 'pre-wrap'; p.textContent = message; dialog.append(p);}
    const scroller = document.createElement('div'); scroller.className = 'table-responsive pi-preview-scroll';
    const table = document.createElement('table'); table.className = 'table table-sm';
    const header = table.createTHead().insertRow(); for (const label of ['貨櫃', '品號', '條碼', '箱數', '單價', '效期']) {const th = document.createElement('th'); th.textContent = label; header.append(th);}
    const body = table.createTBody();
    for (const group of groups) for (const row of group.rows || []) {const tr = body.insertRow(); for (const value of [group.container, row.itemCode, row.barcode, row.qty, row.unitPrice ?? '未填', row.expiryDate || '未填']) tr.insertCell().textContent = String(value ?? '');}
    scroller.append(table); dialog.append(scroller);
    const issueBox = document.createElement('div'); issueBox.id = 'piPasteProblems';
    for (const issue of parsed.invalid) {const div = document.createElement('div'); div.className = 'alert alert-danger'; div.style.whiteSpace = 'pre-wrap'; div.textContent = `原文第 ${issue.line} 行：${issue.reason}\n${issue.raw}`; issueBox.append(div);}
    for (const warning of parsed.warnings) {const p = document.createElement('p'); p.className = 'small text-muted'; p.textContent = `第 ${warning.line} 行 ${warning.field}：${JSON.stringify(warning.before)} → ${JSON.stringify(warning.after)}`; issueBox.append(p);}
    dialog.append(issueBox);
    const note = document.createElement('p'); note.textContent = parsed.invalid.length ? '有異常資料，本次不會略過後繼續匯入。請返回 Excel 或貼上區修正，再重新預覽。' : '請核對品號、箱數與單價；確認前不會儲存。'; dialog.append(note);
    const actions = document.createElement('div'); actions.className = 'd-flex gap-2 pi-preview-actions';
    const finish = value => {dialog.close(); dialog.remove(); resolve(value);};
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn btn-outline-secondary'; cancel.textContent = '返回修改'; cancel.onclick = () => finish(false);
    const apply = document.createElement('button'); apply.type = 'button'; apply.id = 'piPastePreviewApply'; apply.className = 'btn btn-primary'; apply.textContent = '確認匯入'; apply.disabled = !!parsed.invalid.length || !groups.some(g => g.rows?.length); apply.onclick = () => finish(true);
    actions.append(cancel, apply); dialog.append(actions); dialog.addEventListener('cancel', e => {e.preventDefault(); finish(false);}); document.body.append(dialog); dialog.showModal();
  });
}
