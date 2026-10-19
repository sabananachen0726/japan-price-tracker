// shell/dom: startup. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "startup",
  "owns": [{
    "name": "finalPiSearch",
    "kind": "const"
  }],
  "imports": ["downloadFinalPiTemplate", "escapeFinalPiText", "exportFinalPiBatch", "finalPiBatchSnapshot", "importFinalPi", "importFinalPiMulti", "looksLikeFinalPiMulti", "readFinalPiBatchFile", "renderFinalPiBatchSearch", "renderFinalPiSearch"],
  "writes": ["finalPiBatchSnapshot", "finalPiSearch"]
};
export function register(context) {}
export function initialize(context) {
  context.finalPiSearch = document.getElementById('finalPiSearch');
  if (context.finalPiSearch) context.finalPiSearch.addEventListener('input', context.renderFinalPiSearch);
  document.getElementById('btnRunFinalPiBatch')?.addEventListener('click', () => context.renderFinalPiBatchSearch(true));
  document.getElementById('btnExportFinalPiBatch')?.addEventListener('click', context.exportFinalPiBatch);
  document.getElementById('finalPiBatchInput')?.addEventListener('input', () => {
    context.finalPiBatchSnapshot = null;
    const b = document.getElementById('btnExportFinalPiBatch');
    if (b) b.disabled = true;
    const host = document.getElementById('finalPiBatchResult');
    if (host) host.textContent = '資料已修改，請按「批次查詢」以更新結果。';
  });
  document.getElementById('btnChooseFinalPiBatchFile')?.addEventListener('click', () => document.getElementById('finalPiBatchFile')?.click());
  document.getElementById('finalPiBatchFile')?.addEventListener('change', async e => {
    await context.readFinalPiBatchFile(e.target.files?.[0]);
    e.target.value = '';
  });
  document.getElementById('btnClearFinalPiBatch')?.addEventListener('click', () => {
    const input = document.getElementById('finalPiBatchInput');
    if (input) {
      input.value = '';
      input.dispatchEvent(new Event('input'));
    }
    document.getElementById('finalPiBatchResult').textContent = '已清空，請貼入新的 Item Code 或 Barcode。';
  });
  document.getElementById('btnImportFinalPi')?.addEventListener('click', context.importFinalPi);
  document.getElementById('btnImportFinalPiMulti')?.addEventListener('click', context.importFinalPiMulti);
  document.getElementById('btnDownloadFinalPiTemplate')?.addEventListener('click', context.downloadFinalPiTemplate);
  document.getElementById('btnChooseFinalPiFile')?.addEventListener('click', () => document.getElementById('finalPiFile')?.click());
  document.getElementById('finalPiPaste')?.addEventListener('paste', () => {
    setTimeout(() => {
      const box = document.getElementById('finalPiPaste');
      const txt = box?.value || '';
      if (context.looksLikeFinalPiMulti(txt)) {
        document.getElementById('finalPiMultiPaste').value = txt;
        box.value = '';
        document.getElementById('finalPiImportHint').innerHTML = '<span class="text-primary fw-bold">✓ 偵測到 Container + Supplier 欄位，已自動移到「多櫃一次匯入」。</span>';
        document.getElementById('finalPiMultiHint').innerHTML = '<span class="text-primary fw-bold">✓ 已自動辨識為多櫃 Final PI，請確認後按「多櫃一次匯入 / 覆蓋」。</span>';
      }
    }, 0);
  });
  document.getElementById('finalPiFile')?.addEventListener('change', function () {
    const file = this.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const txt = String(reader.result || '');
      if (context.looksLikeFinalPiMulti(txt)) {
        document.getElementById('finalPiMultiPaste').value = txt;
        document.getElementById('finalPiPaste').value = '';
        document.getElementById('finalPiMultiHint').innerHTML = `<span class="text-primary fw-bold">✓ 已讀取 ${context.escapeFinalPiText(file.name)}，自動辨識為多櫃格式。</span>`;
      } else {
        document.getElementById('finalPiPaste').value = txt;
        document.getElementById('finalPiImportHint').textContent = `已讀取 ${file.name}，辨識為單櫃格式。`;
      }
    };
    reader.readAsText(file, 'UTF-8');
    this.value = '';
  });
}
