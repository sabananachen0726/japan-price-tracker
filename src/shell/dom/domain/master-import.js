export const JapanMasterImport = {
  norm: v => String(v ?? '').trim().toUpperCase(),
  barcode(v) {
    const s = String(v ?? '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[\s\-\u200B-\u200D\uFEFF]/g, '');
    return /^\d+$/.test(s) ? s : '';
  },
  parse(grid) {
    const normHeader = v => String(v ?? '').replace(/^\uFEFF/, '').trim().replace(/\s+/g, ' ').toLowerCase();
    const head = grid.findIndex(row => row.some(v => normHeader(v) === 'place of production value'));
    if (head < 0) throw Error('找不到 Place of Production Value 欄位，請使用 Onsight Product Data Export 原始 Excel。');
    const headers = grid[head].map(normHeader),
      idx = k => headers.indexOf(k.toLowerCase());
    const required = ['Product Code', 'Product Name', 'Place of Production Value', 'Image URL'];
    for (const h of required) if (idx(h) < 0) throw Error('缺少欄位：' + h);
    if (idx('Barcode') < 0 && idx('Barcode Value') < 0) throw Error('缺少 Barcode 或 Barcode Value 欄位');
    const rows = new Map(),
      origins = {},
      warnings = [],
      stats = {
        total: 0,
        japan: 0,
        skipped: 0,
        fallback: 0,
        missingBarcode: 0,
        duplicateCode: 0,
        inactive: 0
      };
    for (let n = head + 1; n < grid.length; n++) {
      const raw = grid[n];
      if (!raw.some(v => String(v ?? '').trim())) continue;
      stats.total++;
      const get = h => idx(h) < 0 ? '' : String(raw[idx(h)] ?? '').trim(),
        origin = get('Place of Production Value');
      if (!origin.toUpperCase().includes('JAPAN')) {
        stats.skipped++;
        continue;
      }
      stats.japan++;
      origins[origin] = (origins[origin] || 0) + 1;
      const code = this.norm(get('Product Code'));
      if (!code || code.length > 100 || /[\u0000-\u001f]/.test(code) || ['__PROTO__', 'PROTOTYPE', 'CONSTRUCTOR'].includes(code)) throw Error('第 ' + (n + 1) + ' 列的日本貨 Product Code 無效，未套用本次資料');
      const primary = this.barcode(get('Barcode')),
        fallback = this.barcode(get('Barcode Value')),
        barcode = primary || fallback;
      if (!primary && fallback) stats.fallback++;
      if (!barcode) stats.missingBarcode++;
      const itemKind = get('Item Kind Value'),
        kind = /frozen|冷凍|凍貨/i.test(itemKind) ? 'frozen' : itemKind ? 'dry' : 'unknown';
      const active = /^(yes|true|1)$/i.test(get('Is Active'));
      if (/^no$/i.test(get('Is Active'))) stats.inactive++;
      if (rows.has(code)) {
        stats.duplicateCode++;
        warnings.push(code + ' 重複品號，採最後一筆');
      }
      rows.set(code, {
        code,
        barcode,
        name: get('Product Name').replace(/^O\/S\s*-\s*/i, '').trim(),
        imgUrl: get('Image URL'),
        origin,
        itemKind,
        kind,
        sourceActive: active
      });
    }
    if (!rows.size) throw Error('本檔沒有 Place of Production Value 包含 JAPAN 的有效商品，未修改主檔');
    return {
      rows: [...rows.values()],
      origins,
      warnings,
      stats
    };
  },
  plan(parsed, existing) {
    const products = structuredClone(existing || {}),
      byCode = new Map(Object.entries(products).filter(([, p]) => p.itemCode).map(([key, p]) => [this.norm(p.itemCode), key])),
      moves = [];
    let added = 0,
      updated = 0;
    for (const row of parsed.rows) {
      const oldKey = byCode.get(row.code),
        old = oldKey ? products[oldKey] : null;
      let key = row.barcode || 'PENDING_ITEM_' + row.code;
      if (oldKey && this.barcode(old.sourceBarcode || oldKey) === row.barcode && row.barcode) key = oldKey;
      if (products[key] && this.norm(products[key].itemCode) !== row.code) key = 'PENDING_ITEM_' + row.code;
      if (products[key] && this.norm(products[key].itemCode) !== row.code) throw Error('品號儲存識別衝突：' + row.code);
      if (old) {
        updated++;
        if (oldKey !== key) {
          delete products[oldKey];
          moves.push({
            from: oldKey,
            to: key,
            code: row.code
          });
        }
      } else added++;
      products[key] = {
        ...(old || {}),
        itemCode: row.code,
        name: row.name || old?.name || '',
        imgUrl: row.imgUrl || old?.imgUrl || '',
        sourceBarcode: row.barcode,
        placeOfProduction: row.origin,
        itemKind: row.itemKind,
        kind: row.kind === 'unknown' ? old?.kind || 'unknown' : row.kind,
        sourceActive: row.sourceActive,
        pendingProduct: false,
        missingBarcode: !row.barcode
      };
      byCode.set(row.code, key);
    }
    const groups = new Map();
    for (const [key, p] of Object.entries(products)) {
      const bc = this.barcode(p.sourceBarcode || key);
      if (bc) {
        if (!groups.has(bc)) groups.set(bc, []);
        groups.get(bc).push({
          key,
          code: this.norm(p.itemCode)
        });
      }
    }
    for (const p of Object.values(products)) {
      delete p.barcodeConflict;
      delete p.barcodeConflictCodes;
    }
    const conflicts = [];
    for (const [barcode, entries] of groups) if (entries.length > 1) {
      const codes = entries.map(e => e.code || '無品號');
      for (const e of entries) {
        products[e.key].barcodeConflict = true;
        products[e.key].barcodeConflictCodes = codes;
      }
      if (parsed.rows.some(r => entries.some(e => e.code === r.code))) conflicts.push({
        barcode,
        codes
      });
    }
    // Exact-key undo also restores conflict annotations on existing, unlisted goods.
    const beforeByKey = {};
    for (const key of new Set([...Object.keys(existing || {}), ...Object.keys(products)])) if (JSON.stringify(existing?.[key] ?? null) !== JSON.stringify(products[key] ?? null)) beforeByKey[key] = existing?.[key] ?? null;
    return {
      products,
      moves,
      beforeByKey,
      added,
      updated,
      conflicts,
      japanCodes: parsed.rows.map(r => r.code)
    };
  }
};
