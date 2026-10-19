// shell/dom: backup-restore. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "backup-restore",
  "owns": [],
  "imports": ["CONTAINER_TRACKER_REF", "containerTrackerData", "currentDataMode", "isAdmin", "normalizeAppData", "rebuildItemToBarcode", "refreshUI", "renderContainerIntegrationCheck", "restoreCompleteBackup412", "saveFirebaseData", "sendContainerSnapshot", "setDoc"],
  "writes": ["containerTrackerData"]
};
export function register(context) {}
export function initialize(context) {
  // 恢復系統全資料備份：V4.1.3 優先使用 JSON；仍相容舊版 CSV。

  document.getElementById("importCSVFile").onchange = function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function (evt) {
      try {
        const text = String(evt.target.result || '');
        let newData;
        const looksJson = file.name.toLowerCase().endsWith('.json') || text.trim().startsWith('{');
        if (looksJson) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed?.containers) && parsed?.settings) {
            if (!context.isAdmin() || context.currentDataMode !== 'live') throw Error('舊版貨櫃備份只能由 Admin 在 LIVE 還原');
            if (!confirm('只還原貨櫃進度與檢查清單，共 ' + parsed.containers.length + ' 櫃；商品、PI 與訂貨資料保留。確定繼續？')) return;
            await context.setDoc(context.CONTAINER_TRACKER_REF, parsed);
            context.containerTrackerData = parsed;
            context.sendContainerSnapshot();
            context.refreshUI();
            alert('舊版貨櫃備份已還原');
            return;
          }
          const validOld = parsed?.backupFormat === 'JapanPriceTracker-FullBackup';
          const validIntegrated = parsed?.backupFormat === 'JapanPriceTracker-Integrated-FullBackup';
          if (!validOld && !validIntegrated || !parsed?.data || typeof parsed.data !== 'object') {
            throw new Error('這不是有效的 Japan Price Tracker 完整備份 JSON。');
          }
          newData = context.normalizeAppData(parsed.data);
          var restoreContainerTrackerData = validIntegrated && parsed.containerTrackerData && typeof parsed.containerTrackerData === 'object' ? parsed.containerTrackerData : null;
        } else {
          // 舊版 CSV 備份相容模式。舊 CSV 本身未保存 masterImportBatches / pendingProduct 等新欄位。
          const lines = text.split(/\r?\n/);
          newData = {
            suppliers: [],
            mappings: {},
            products: {},
            itemToBarcode: {},
            quotes: [],
            masterImportBatches: [],
            finalPiContainers: {}
          };
          lines.forEach((line, idx) => {
            if (idx === 0 || !line.trim()) return;
            const cols = line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
            const type = cols[0];
            if (type === 'SUPPLIER' && cols[1]) {
              if (!newData.suppliers.includes(cols[1])) newData.suppliers.push(cols[1]);
            } else if (type === 'MAPPING' && cols[1] && cols[2]) {
              newData.mappings[cols[1]] ||= [];
              if (!newData.mappings[cols[1]].includes(cols[2])) newData.mappings[cols[1]].push(cols[2]);
            } else if (type === 'PRODUCT' && cols[1]) {
              newData.products[cols[1]] = {
                itemCode: cols[2] || '',
                name: cols[3] || '',
                imgUrl: cols[4] || ''
              };
              if (cols[2]) newData.itemToBarcode[cols[2]] = cols[1];
            } else if (type === 'QUOTE' && cols[1]) {
              newData.quotes.push({
                id: cols[1],
                itemCode: cols[2] || '',
                barcode: cols[3] || '',
                supplier: cols[4] || '',
                price: parseFloat(cols[5]) || 0,
                container: cols[6] || '',
                note: cols[7] || '',
                date: cols[8] || ''
              });
            }
          });
          if (newData.suppliers.length === 0) newData.suppliers = ['SilkRoad', 'Tencho'];
          newData = context.normalizeAppData(newData);
        }
        if (looksJson) {
          const payload = JSON.parse(text);
          if (payload.backupFormat === 'JapanPriceTracker-Integrated-FullBackup' && payload.backupVersion === '4.12.0') {
            await context.restoreCompleteBackup412(payload);
            e.target.value = '';
            return;
          }
        }
        const productCount = Object.keys(newData.products || {}).length;
        const quoteCount = (newData.quotes || []).length;
        const finalPiCount = Object.keys(newData.finalPiContainers || {}).length;
        const modeText = context.currentDataMode === 'live' ? 'LIVE 正式資料' : 'TEST 本機資料';
        const trackerCount = restoreContainerTrackerData ? (restoreContainerTrackerData.containers || []).length : null;
        const trackerLine = trackerCount === null ? '\nContainer Tracker：此舊備份未包含（不會變更）' : `\nContainer Tracker：${trackerCount} 條貨櫃`;
        const warning = `即將用此備份完整覆蓋目前的 ${modeText}。\n\n商品：${productCount} 筆\n報價：${quoteCount} 筆\nFinal PI 貨櫃：${finalPiCount} 條\n廠商：${(newData.suppliers || []).length} 個${trackerLine}\n\n目前資料會被取代，確定恢復嗎？`;
        if (!confirm(warning)) {
          e.target.value = '';
          return;
        }
        window.appData = newData;
        context.rebuildItemToBarcode();
        const ok = await context.saveFirebaseData();
        if (!ok) throw new Error('備份資料解析成功，但儲存失敗。');
        if (restoreContainerTrackerData) {
          if (context.currentDataMode !== 'live') {
            alert('Japan Price Tracker TEST 已恢復；Container Tracker 正式資料未變更。Container Tracker 只允許在 LIVE 恢復。');
          } else {
            await context.setDoc(context.CONTAINER_TRACKER_REF, restoreContainerTrackerData);
            context.containerTrackerData = restoreContainerTrackerData;
          }
        }
        context.refreshUI();
        context.renderContainerIntegrationCheck();
        alert(`系統資料備份已成功恢復！\n商品 ${productCount} 筆 / 報價 ${quoteCount} 筆`);
      } catch (err) {
        console.error('Restore backup error', err);
        alert(`備份恢復失敗：${err?.message || '檔案格式錯誤'}`);
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file, 'UTF-8');
  };
}
