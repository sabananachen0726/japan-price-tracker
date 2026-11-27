// 商品管理 → 商品詳細: fill missing name / image / Item Code / Barcode.
// Fills are written into the master record and flagged in manualFields; the next
// master import replaces any field it has a value for (see master-import plan()).
import {validItemCode, createProductResolver} from '../shared/product-identity.js';

const digits = value => String(value ?? '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[\s\-​-‍﻿]/g, '');

export function applyMasterFill(products, request, {now = new Date().toISOString(), itemToBarcode = {}} = {}) {
  const fields = request.fields || {};
  let key = String(request.masterKey || '');
  let product = key ? products[key] : null;
  if (key && !product) throw Error('找不到這個主檔商品，請重新整理');
  if (!product) {
    // A PI-only new product becomes a master record once it has an Item Code.
    const bc = digits(request.barcode);
    if (!/^\d{8,14}$/.test(bc)) throw Error('這個商品沒有可用的條碼，無法建立主檔');
    if (!String(fields.itemCode || '').trim()) throw Error('請先填 Item Code；只想暫填名稱或圖片，請用「暫填名稱／圖片」');
    if (products[bc]) throw Error('條碼 ' + bc + ' 已在主檔，請重新整理');
    key = bc;
    product = products[bc] = {sourceBarcode: bc, missingBarcode: false, pendingProduct: false};
  }
  const manual = {...(product.manualFields || {})};
  const changed = [];
  const set = (field, value) => {
    if (String(product[field] || '') === value) return;
    product[field] = value;
    changed.push(field);
    if (value) manual[field] = now; else delete manual[field];
  };
  if (fields.name !== undefined) {
    const name = String(fields.name).trim();
    if (name.length > 200) throw Error('商品名稱最多 200 字');
    set('name', name);
  }
  if (fields.imgUrl !== undefined) {
    const url = String(fields.imgUrl).trim();
    if (url && !/^https:\/\/[^\s"'<>]+$/i.test(url)) throw Error('圖片請貼 https:// 開頭的網址');
    if (url.length > 2048) throw Error('圖片網址太長');
    set('imgUrl', url);
  }
  if (fields.itemCode !== undefined && String(fields.itemCode).trim() !== String(product.itemCode || '')) {
    if (product.itemCode && !request.create) throw Error('已有 Item Code 的商品不能在這裡改品號');
    const code = String(fields.itemCode).trim().toUpperCase();
    if (!validItemCode(code)) throw Error('Item Code 格式不正確');
    const used = Object.entries(products).find(([k, p]) => k !== key && String(p?.itemCode || '').trim().toUpperCase() === code);
    if (used || (itemToBarcode[code] && itemToBarcode[code] !== key)) throw Error('Item Code ' + code + ' 已被其他商品使用');
    product.itemCode = code;
    changed.push('itemCode');
    manual.itemCode = now;
  }
  if (fields.barcode !== undefined) {
    const bc = digits(fields.barcode);
    const hasBarcode = !product.missingBarcode && /^\d{8,14}$/.test(digits(product.sourceBarcode || key));
    if (bc && hasBarcode && bc !== digits(product.sourceBarcode || key)) throw Error('已有條碼的商品不能在這裡改條碼');
    if (bc && !hasBarcode) {
      if (!/^\d{8,14}$/.test(bc)) throw Error('Barcode 請填 8–14 位數字');
      product.sourceBarcode = bc;
      product.missingBarcode = false;
      changed.push('barcode');
      manual.barcode = now;
    }
  }
  if (Object.keys(manual).length) product.manualFields = manual; else delete product.manualFields;
  return {key, changed};
}

export function installMasterFill(context) {
  context.events.onMessage(async e => {
    const plannerWindow = document.getElementById('plannerFrame')?.contentWindow;
    if (e.source !== plannerWindow || e.data?.type !== 'KAISI_MASTER_FILL') return;
    const {requestId} = e.data;
    const reply = (ok, error = '', extra = {}) => plannerWindow.postMessage({type: 'KAISI_MASTER_FILL_RESULT', requestId, ok, error, ...extra}, '*');
    if (!context.isAdmin()) return reply(false, '只有 Admin 可以補主檔資料');
    const previous = structuredClone(window.appData);
    try {
      window.appData.products ||= {};
      const create = !e.data.masterKey;
      if (create && !createProductResolver(window.appData)({barcode: digits(e.data.barcode)}).pending) throw Error('這個條碼已配對主檔，請重新整理');
      const result = applyMasterFill(window.appData.products, {...e.data, create}, {itemToBarcode: window.appData.itemToBarcode || {}});
      if (!result.changed.length) return reply(true, '', {changed: []});
      context.rebuildItemToBarcode();
      if (!await context.saveFirebaseData()) throw Error('儲存失敗，請重試');
      context.refreshUI();
      context.sendPlannerSnapshot();
      reply(true, '', {changed: result.changed, key: result.key});
    } catch (err) {
      window.appData = previous;
      context.rebuildItemToBarcode();
      reply(false, err.message || String(err));
    }
  });
}
