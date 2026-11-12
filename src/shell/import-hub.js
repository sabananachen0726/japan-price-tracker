import {detectImport, IMPORT_TYPES} from '../shared/import-detect.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(get, timeout = 20000) {
  const end = Date.now() + timeout;
  for (;;) { const v = get(); if (v) return v; if (Date.now() > end) throw Error('畫面載入逾時，請重試'); await sleep(120); }
}

// Read just enough of a file to recognise it: sheet names and the first rows.
async function sniff(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.gz')) return {name: file.name, sheets: []};
  if (name.endsWith('.json')) {
    try { return {name: file.name, json: JSON.parse(await file.text())}; } catch { return {name: file.name, json: null}; }
  }
  const X = window.XLSX;
  if (!X) throw Error('Excel 讀取元件尚未載入');
  const workbook = /\.(xlsx|xlsm|xls)$/.test(name)
    ? X.read(await file.arrayBuffer(), {type: 'array', sheetRows: 15, bookSheets: false})
    : X.read((await file.text()).slice(0, 20000), {type: 'string', sheetRows: 15});
  return {name: file.name, sheets: workbook.SheetNames.map(n => ({name: n, rows: X.utils.sheet_to_json(workbook.Sheets[n], {header: 1, defval: '', raw: false})}))};
}

// Excel/CSV → tab-separated text, for importers that only take pasted tables.
async function asTable(file) {
  const X = window.XLSX;
  if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) return file.text();
  const wb = X.read(await file.arrayBuffer(), {type: 'array'});
  return X.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], {FS: '\t', blankrows: false});
}

export function installImportHub(context) {
  const results = () => document.getElementById('importDropResults');
  const planner = () => document.getElementById('plannerFrame');

  function setFiles(input, files) {
    const win = input.ownerDocument.defaultView, dt = new win.DataTransfer();
    for (const f of files) dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new win.Event('change', {bubbles: true}));
  }
  const openView = view => {
    window.bootstrap?.Tab.getOrCreateInstance(document.getElementById('add-tab')).show();
    context.chooseImportView(view);
  };
  async function plannerEl(id) {
    openView('planner');
    const frame = await waitFor(() => planner()?.contentDocument?.getElementById(id) && planner());
    return [frame.contentDocument.getElementById(id), frame.contentDocument];
  }
  const shellEl = id => document.getElementById(id);

  // Each route hands the file to the importer that already exists, so the
  // familiar preview and confirmation stay exactly the same.
  const routes = {
    async master(files) { openView('master'); setFiles(shellEl('masterCSVFile'), [files[0]]); shellEl('btnImportMasterCSV').click(); return '已在「商品主檔」顯示預覽，確認後按套用。'; },
    async quotes(files) { openView('quotes'); setFiles(shellEl('batchQuoteCSVFile'), [files[0]]); shellEl('btnImportBatchCSV').click(); return '已讀取報價，確認視窗中按「確定」才會匯入。'; },
    async pi(files) {
      openView('pi');
      const file = /\.(xlsx|xlsm|xls)$/i.test(files[0].name) ? new File([await asTable(files[0])], files[0].name + '.tsv', {type: 'text/plain'}) : files[0];
      setFiles(shellEl('finalPiFile'), [file]);
      await sleep(250);
      const container = shellEl('finalPiContainer');
      container?.scrollIntoView({behavior: 'smooth', block: 'center'}); container?.focus();
      return '已填入「廠商 PI」，請填寫櫃號、選擇廠商後按「匯入／覆蓋此貨櫃 Final PI」。';
    },
    async piMulti(files) {
      openView('pi');
      const file = /\.(xlsx|xlsm|xls)$/i.test(files[0].name) ? new File([await asTable(files[0])], files[0].name + '.tsv', {type: 'text/plain'}) : files[0];
      setFiles(shellEl('finalPiFile'), [file]);
      await waitFor(() => shellEl('finalPiMultiPaste')?.value.trim());
      shellEl('btnImportFinalPiMulti').click();
      return '已開啟多櫃 PI 預覽，確認後才會儲存。';
    },
    async salesHistory(files) { const [input] = await plannerEl('salesHistoryFile'); setFiles(input, [files[0]]); return '歷史銷售解析中，完成後在「訂貨資料」按「確認套用並共用」。'; },
    async salesCurrent(files) { const [input] = await plannerEl('salesCurrentFile'); setFiles(input, [files[0]]); return '最新銷售解析中，完成後在「訂貨資料」按「確認套用並共用」。'; },
    async myob(files) {
      const [open, doc] = await plannerEl('importMYOB');
      open.click();
      const paste = await waitFor(() => doc.getElementById('inventoryPaste'));
      paste.value = await asTable(files[0]);
      doc.getElementById('previewInventoryPaste').click();
      return '已開啟 MYOB 預覽，確認後按「確認套用快照」。';
    },
    async settings(files) { const [open, doc] = await plannerEl('openUnifiedImport'); open.click(); setFiles(await waitFor(() => doc.getElementById('unifiedFile')), [files[0]]); return '已開啟商品訂貨設定預覽，只會套用有變動的欄位。'; },
    async shelf(files) { const [open, doc] = await plannerEl('openShelfImport'); open.click(); setFiles(await waitFor(() => doc.getElementById('shelfFile')), [files[0]]); return '已開啟保存期限預覽。'; },
    async status(files) { const [open, doc] = await plannerEl('openStatusImport'); open.click(); setFiles(await waitFor(() => doc.getElementById('statusImportFile')), [files[0]]); return '已開啟 Active／Inactive 預覽。'; },
    async backup(files) { setFiles(shellEl('importCSVFile'), [files[0]]); return '已讀取備份，還原前會先列出範圍讓你確認。'; }
  };

  function card(file, type, text, state) {
    const li = document.createElement('li');
    li.className = 'import-drop-item ' + state;
    li.innerHTML = `<div><strong>${esc(file.name)}</strong><span class="import-drop-type">${esc(IMPORT_TYPES[type] || IMPORT_TYPES.unknown)}</span></div><p>${esc(text)}</p>`;
    return li;
  }
  async function run(file, type, li) {
    li.className = 'import-drop-item working';
    li.querySelector('p').textContent = '開啟預覽中…';
    try {
      const message = await routes[type]([file]);
      li.className = 'import-drop-item done';
      li.querySelector('p').textContent = message;
    } catch (err) {
      li.className = 'import-drop-item failed';
      li.querySelector('p').textContent = '無法開啟預覽：' + err.message;
    }
  }

  async function handle(files) {
    const list = results();
    if (!list || !files.length) return;
    if (!context.isAdmin()) { list.innerHTML = '<li class="import-drop-item failed"><p>只有 Admin 可以使用自動匯入。</p></li>'; return; }
    list.replaceChildren();
    const queue = [];
    for (const file of files) {
      let type = 'unknown';
      try { type = detectImport(await sniff(file)); } catch (err) { list.append(card(file, 'unknown', '讀取失敗：' + err.message, 'failed')); continue; }
      if (type === 'unknown') { list.append(card(file, type, '看不出是哪一種資料。請確認第一列是標題列，或到上方分類手動匯入。', 'failed')); continue; }
      const li = card(file, type, '等待開啟', 'waiting');
      list.append(li);
      queue.push({file, type, li});
    }
    // Sales files share one preview, so they can all be staged together.
    const sales = queue.filter(q => q.type === 'salesHistory' || q.type === 'salesCurrent');
    for (const q of sales) await run(q.file, q.type, q.li);
    const others = queue.filter(q => !sales.includes(q));
    // Other previews are dialogs: open the first now, the rest on request.
    others.forEach((q, i) => {
      if (i === 0 && !sales.length) { void run(q.file, q.type, q.li); return; }
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn btn-sm btn-primary'; b.textContent = '開啟預覽';
      b.onclick = () => { b.remove(); void run(q.file, q.type, q.li); };
      q.li.querySelector('p').textContent = '辨識完成，處理完上一個預覽後按右側按鈕。';
      q.li.append(b);
    });
  }

  function mount() {
    const zone = document.getElementById('importDropZone'), input = document.getElementById('importDropFile');
    if (!zone || !input || zone.dataset.ready) return !!zone;
    zone.dataset.ready = '1';
    input.addEventListener('change', () => { const files = [...input.files]; input.value = ''; void handle(files); });
    for (const type of ['dragenter', 'dragover']) zone.addEventListener(type, e => { e.preventDefault(); zone.classList.add('dragging'); });
    for (const type of ['dragleave', 'dragend']) zone.addEventListener(type, () => zone.classList.remove('dragging'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragging'); void handle([...e.dataTransfer.files]); });
    // Dropping anywhere on the import centre works too, so a miss is not lost.
    const panel = document.getElementById('add-panel');
    panel?.addEventListener('dragover', e => { if (document.body.dataset.importView === 'auto') e.preventDefault(); });
    panel?.addEventListener('drop', e => { if (document.body.dataset.importView !== 'auto' || zone.contains(e.target)) return; e.preventDefault(); void handle([...e.dataTransfer.files]); });
    document.getElementById('importPasteAutoGo')?.addEventListener('click', () => {
      const text = document.getElementById('importPasteAuto').value;
      if (!text.trim()) return;
      void handle([new File([text], '貼上的表格.tsv', {type: 'text/plain'})]);
    });
    return true;
  }
  if (!mount()) document.addEventListener('DOMContentLoaded', mount);
}
