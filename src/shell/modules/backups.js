import {exportTemporaryImages,removedTemporaryImages} from '../temporary-image-store.js';
import {validateImageRecord,isUploadedImage,validImageBarcode} from '../../shared/temporary-image.js';
// shell: backups. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "backups",
  "owns": [{
    "name": "backupRequests412",
    "kind": "const"
  }, {
    "name": "requestPlannerBackup412",
    "kind": "function"
  }, {
    "name": "storeTestPlanner412",
    "kind": "function"
  }, {
    "name": "exportToCSV",
    "kind": "function"
  }, {
    "name": "validateCompleteBackup412",
    "kind": "function"
  }, {
    "name": "restoreCompleteBackup412",
    "kind": "function"
  }],
  "imports": ["doc", "CATALOG_REF", "CONTAINER_TRACKER_REF", "INVENTORY_REF", "ORDER_PLANNER_REF", "PLANNER_SOURCES_REF", "PROD_DOC_REF", "TEST_LOCAL_KEY", "auth", "catalogData", "containerTrackerData", "currentDataMode", "db", "events", "getDoc", "getTimestampString", "inventoryData", "isAdmin", "loadEmbeddedOrderPlanner", "normalizeAppData", "plannerSourcesData", "rebuildItemToBarcode", "refreshUI", "sendCatalogSources", "sendContainerSnapshot", "sharedOrderDrafts", "showAppToast", "writeBatch"],
  "writes": ["backupRequests412", "catalogData", "containerTrackerData", "exportToCSV", "inventoryData", "plannerSourcesData", "requestPlannerBackup412", "restoreCompleteBackup412", "sharedOrderDrafts", "storeTestPlanner412", "validateCompleteBackup412"]
};
export function register(context) {
  context.requestPlannerBackup412 = function requestPlannerBackup412() {
    context.loadEmbeddedOrderPlanner();
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID(),
        mode = context.currentDataMode;
      const timer = setTimeout(() => {
        context.backupRequests412.delete(id);
        reject(Error('訂貨資料尚未載入，請稍後再試'));
      }, 12000);
      context.backupRequests412.set(id, {
        mode,
        resolve,
        reject,
        timer
      });
      const send = () => {
        if (!context.backupRequests412.has(id)) return;
        if (context.currentDataMode !== mode) {
          clearTimeout(timer);
          context.backupRequests412.delete(id);
          reject(Error('資料模式已變更'));
          return;
        }
        document.getElementById('plannerFrame')?.contentWindow?.postMessage({
          type: 'KAISI_BACKUP_REQUEST',
          id
        }, '*');
      };
      send();
      const retry = setInterval(() => {
        if (!context.backupRequests412.has(id)) {
          clearInterval(retry);
          return;
        }
        send();
      }, 250);
    });
  };
  context.storeTestPlanner412 = function storeTestPlanner412(data) {
    // Planner maintains the account-specific recovery key; request its restore handler
    // to write through its normal local persistence route after loading.
    const f = document.getElementById('plannerFrame');
    f?.contentWindow?.postMessage({
      type: 'KAISI_RESTORE_PLANNER',
      mode: 'test',
      data
    }, '*');
  };
  context.exportToCSV = async function exportToCSV() {
    const button = document.getElementById('btnExportCSV');
    button.disabled = true;
    const mode = context.currentDataMode,
      uid = context.auth.currentUser?.uid;
    try {
      if (!context.isAdmin() || !uid) throw Error('僅 Admin 可匯出完整備份');
      const local = await context.requestPlannerBackup412();
      let planner = local;
      if (mode === 'live') {
        const snaps = await Promise.all([context.CATALOG_REF, context.INVENTORY_REF, context.PLANNER_SOURCES_REF, context.ORDER_PLANNER_REF].map(ref => context.getDoc(ref)));
        planner = Object.fromEntries(['catalog', 'inventory', 'sources', 'orders'].map((key, i) => [key, snaps[i].exists() ? snaps[i].data() : {}]));
      }
      const temporaryImages = mode === 'live' ? await exportTemporaryImages(window.appData,{getDoc:context.getDoc,doc:context.doc,db:context.db}) : {};
      if (mode !== context.currentDataMode || uid !== context.auth.currentUser?.uid) throw Error('帳號或資料模式已變更，請重試');
      const backup = {
        backupFormat: 'JapanPriceTracker-Integrated-FullBackup',
        backupVersion: '4.12.0',
        exportedAt: new Date().toISOString(),
        mode,
        data: structuredClone(context.normalizeAppData(window.appData)),
        containerTrackerData: mode === 'live' ? structuredClone(context.containerTrackerData || {
          containers: []
        }) : null,
        planner,
        temporaryImages,
        localRecovery: local
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json'
      }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Japan_Price_Tracker_Full_Backup_' + mode + '_' + context.getTimestampString() + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      context.showAppToast('完整備份已匯出，包含共用訂貨設定、庫存、銷售及工作單', 'success');
    } catch (err) {
      alert('備份未完成：' + err.message);
    } finally {
      button.disabled = false;
    }
  };
  context.validateCompleteBackup412 = function validateCompleteBackup412(payload) {
    if (!payload?.data?.products || !payload.planner || !['catalog', 'inventory', 'sources', 'orders'].every(k => payload.planner[k] && typeof payload.planner[k] === 'object' && !Array.isArray(payload.planner[k]))) throw Error('完整備份缺少訂貨資料，未還原');
    if (payload.containerTrackerData !== null && (!payload.containerTrackerData || !Array.isArray(payload.containerTrackerData.containers))) throw Error('貨櫃備份格式無效');
    for (const d of [payload.data, payload.containerTrackerData, ...Object.values(payload.planner)]) if (d && new TextEncoder().encode(JSON.stringify(d)).length > (d === payload.data ? 950000 : 900000)) throw Error('備份中有文件超過共享容量，未還原');
    if (payload.planner.sources.salesV1?.sources) for (const src of Object.values(payload.planner.sources.salesV1.sources)) if (src.codec !== 'gzip-base64' || typeof src.body !== 'string') throw Error('銷售彙總格式無效');
    const images=payload.temporaryImages || {};
    if(Object.keys(images).length>400)throw Error('暫用圖片超過單次還原上限');
    for(const [bc,image] of Object.entries(images)){validateImageRecord(bc,image);if(payload.data.piTemporaryProducts?.[bc]?.imageRevision!==image.updatedAt)throw Error('暫圖與商品資料不一致')}
    for(const [bc,meta] of Object.entries(payload.data.piTemporaryProducts||{}))if(meta.imageRevision&&!meta.imageData&&!images[bc])throw Error('完整備份缺少暫用圖片：'+bc);
    return payload;
  };
  context.restoreCompleteBackup412 = async function restoreCompleteBackup412(payload) {
    context.validateCompleteBackup412(payload);
    if (!context.isAdmin()) throw Error('僅 Admin 可還原');
    const mode = context.currentDataMode,
      uid = context.auth.currentUser?.uid;
    const plan = payload.planner;
    const summary = `還原至 ${mode.toUpperCase()}：\n商品 ${Object.keys(payload.data.products || {}).length} 款\nPI ${Object.keys(payload.data.finalPiContainers || {}).length} 櫃\n訂貨設定 ${Object.keys(plan.catalog.overrides || {}).length} 款\nMYOB 庫存 ${Object.keys(plan.inventory.rows || {}).length} 款\n銷售來源 ${Object.keys(plan.sources.salesV1?.sources || {}).length} 份\n工作單 ${Object.keys(plan.orders.drafts || {}).length} 份\n貨櫃 ${payload.containerTrackerData?.containers?.length ?? '不變'}\n\n以上範圍會完整取代。目前未成功共用的編輯也會清除。確定還原？`;
    if (!confirm(summary)) return;
    await context.requestPlannerBackup412();
    if (mode !== context.currentDataMode || uid !== context.auth.currentUser?.uid) throw Error('帳號或模式已變更');
    const main = context.normalizeAppData(structuredClone(payload.data));
    const restoredImages={...(payload.temporaryImages || {})};
    if(mode==='live')for(const [bc,meta] of Object.entries(main.piTemporaryProducts||{}))if(meta.imageData){
      if(!validImageBarcode(bc)||!isUploadedImage(meta.imageData))throw Error('備份中的暫圖格式錯誤');
      meta.imageRevision ||= new Date().toISOString();restoredImages[bc]={barcode:bc,dataUrl:meta.imageData,updatedAt:meta.imageRevision};delete meta.imageData;
    }
    if (mode === 'live') {
      const batch = context.writeBatch(context.db);
      batch.set(context.PROD_DOC_REF, main);
      for(const [bc,image] of Object.entries(restoredImages))batch.set(context.doc(context.db,'pi_temporary_images',bc),image);
      for(const bc of removedTemporaryImages(window.appData,main))batch.delete(context.doc(context.db,'pi_temporary_images',bc));
      if (payload.containerTrackerData) batch.set(context.CONTAINER_TRACKER_REF, payload.containerTrackerData);
      for (const [key, ref] of [['catalog', context.CATALOG_REF], ['inventory', context.INVENTORY_REF], ['sources', context.PLANNER_SOURCES_REF], ['orders', context.ORDER_PLANNER_REF]]) batch.set(ref, plan[key]);
      await batch.commit();
      context.catalogData = structuredClone(plan.catalog);
      context.inventoryData = structuredClone(plan.inventory);
      context.plannerSourcesData = structuredClone(plan.sources);
      context.sharedOrderDrafts = structuredClone(plan.orders.drafts || {});
      if (payload.containerTrackerData) context.containerTrackerData = structuredClone(payload.containerTrackerData);
    } else {for(const [bc,image] of Object.entries(payload.temporaryImages||{}))if(main.piTemporaryProducts?.[bc])main.piTemporaryProducts[bc].imageData=image.dataUrl;localStorage.setItem(context.TEST_LOCAL_KEY, JSON.stringify(main));}
    window.appData = main;
    context.rebuildItemToBarcode();
    document.getElementById('plannerFrame').contentWindow.postMessage({
      type: 'KAISI_RESTORE_PLANNER',
      mode,
      data: plan
    }, '*');
    context.refreshUI();
    context.sendCatalogSources();
    context.sendContainerSnapshot();
    alert('完整備份已還原；商品、PI 與訂貨資料已一併更新。');
  };
}
export function initialize(context) {
  context.backupRequests412 = new Map();
  context.events.onMessage(e => {
    if (e.source !== document.getElementById('plannerFrame')?.contentWindow || e.data?.type !== 'KAISI_BACKUP_RESPONSE') return;
    const r = context.backupRequests412.get(e.data.id);
    if (!r || e.data.mode !== r.mode) return;
    context.backupRequests412.delete(e.data.id);
    clearTimeout(r.timer);
    r.resolve(e.data.data);
  });
}
