// shell: quote-data. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "quote-data",
  "owns": [{
    "name": "parseContainerNo",
    "kind": "function"
  }, {
    "name": "isFrozenContainer",
    "kind": "function"
  }, {
    "name": "frozenBadgeHtml",
    "kind": "function"
  }, {
    "name": "compareContainerNo",
    "kind": "function"
  }, {
    "name": "compareQuotesByContainerNewest",
    "kind": "function"
  }, {
    "name": "mergePriceUpdateNote",
    "kind": "function"
  }, {
    "name": "upsertContainerQuote",
    "kind": "function"
  }, {
    "name": "parseBatchInputLines",
    "kind": "function"
  }, {
    "name": "getTimestampString",
    "kind": "function"
  }],
  "imports": ["cleanBarcode", "normalizeContainerNo", "resolveToPrimaryBarcode"],
  "writes": ["compareContainerNo", "compareQuotesByContainerNewest", "frozenBadgeHtml", "getTimestampString", "isFrozenContainer", "mergePriceUpdateNote", "parseBatchInputLines", "parseContainerNo", "upsertContainerQuote"]
};
export function register(context) {
  context.parseContainerNo = function parseContainerNo(value) {
    const raw = context.normalizeContainerNo(value);
    // Standard: J + SR/TC + YY + B + MM + sequence + optional F (Frozen)
    // Examples: JSR26B0901, JTC26B1002, JSR26B1101F
    const m = raw.match(/^J(?:SR|TC)(\d{2})B(\d{2})(\d{2})(F)?$/);
    if (!m) return null;
    return {
      raw,
      year: 2000 + Number(m[1]),
      month: Number(m[2]),
      seq: Number(m[3]),
      frozen: !!m[4]
    };
  };
  context.isFrozenContainer = function isFrozenContainer(value) {
    const parsed = context.parseContainerNo(value);
    return parsed ? parsed.frozen : /F$/i.test(context.normalizeContainerNo(value));
  };
  context.frozenBadgeHtml = function frozenBadgeHtml(value) {
    return context.isFrozenContainer(value) ? '<span class="frozen-badge ms-1"><i class="fa-solid fa-snowflake"></i>FROZEN</span>' : '';
  };
  context.compareContainerNo = function compareContainerNo(a, b) {
    const pa = context.parseContainerNo(a),
      pb = context.parseContainerNo(b);
    if (pa && pb) {
      return pa.year - pb.year || pa.month - pb.month || pa.seq - pb.seq || pa.raw.localeCompare(pb.raw);
    }
    if (pa) return -1;
    if (pb) return 1;
    return context.normalizeContainerNo(a).localeCompare(context.normalizeContainerNo(b), undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  };
  context.compareQuotesByContainerNewest = function compareQuotesByContainerNewest(a, b) {
    const pa = context.parseContainerNo(a?.container),
      pb = context.parseContainerNo(b?.container);
    if (pa && pb) return -context.compareContainerNo(a.container, b.container) || new Date(b.date || 0) - new Date(a.date || 0);
    if (pa) return -1;
    if (pb) return 1;
    return new Date(b?.date || 0) - new Date(a?.date || 0) || context.normalizeContainerNo(b?.container).localeCompare(context.normalizeContainerNo(a?.container), undefined, {
      numeric: true
    });
  };
  context.mergePriceUpdateNote = function mergePriceUpdateNote(existingNote, incomingNote) {
    const parts = [];
    const add = v => {
      const t = String(v || '').trim();
      if (t && !parts.includes(t)) parts.push(t);
    };
    add(incomingNote);
    add(existingNote);
    if (!parts.some(x => x.includes('價錢更新'))) parts.push('價錢更新');
    return parts.join('｜');
  };
  context.upsertContainerQuote = function upsertContainerQuote({
    barcode,
    itemCode = '',
    supplier = '',
    price = 0,
    container = '',
    note = '',
    date = ''
  }) {
    const primary = context.resolveToPrimaryBarcode(context.cleanBarcode(barcode));
    const ctn = context.normalizeContainerNo(container);
    const quotes = window.appData.quotes || (window.appData.quotes = []);
    const supplierKey = String(supplier || '').trim().toLowerCase();
    const existing = quotes.find(q => context.resolveToPrimaryBarcode(context.cleanBarcode(q.barcode)) === primary && context.normalizeContainerNo(q.container) === ctn && String(q.supplier || '').trim().toLowerCase() === supplierKey);
    const numericPrice = Number(price) || 0;
    if (existing) {
      if (Number(existing.price) === numericPrice) return {
        action: 'skipped',
        quote: existing
      };
      const oldPrice = Number(existing.price) || 0;
      existing.price = numericPrice;
      existing.itemCode = itemCode || existing.itemCode || '';
      existing.supplier = supplier || existing.supplier || '';
      existing.container = ctn;
      existing.note = context.mergePriceUpdateNote(existing.note, note);
      existing.date = date || new Date().toISOString().split('T')[0];
      return {
        action: 'updated',
        quote: existing,
        oldPrice
      };
    }
    const q = {
      id: 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      barcode: primary || context.cleanBarcode(barcode),
      itemCode,
      supplier,
      price: numericPrice,
      container: ctn,
      note,
      date: date || new Date().toISOString().split('T')[0]
    };
    quotes.push(q);
    return {
      action: 'added',
      quote: q
    };
  };
  context.parseBatchInputLines = function parseBatchInputLines(text) {
    if (!text) return [];
    const lines = text.split(/\r?\n/);
    const result = [];
    lines.forEach(line => {
      line = line.trim();
      if (!line) return;
      const parts = line.split(/[\t,]+/).map(p => p.trim()).filter(p => p !== '');
      if (parts.length >= 2) {
        const code = context.cleanBarcode(parts[0]);
        const qty = parseInt(parts[1], 10);
        result.push({
          barcode: code,
          qty: isNaN(qty) ? 1 : qty
        });
      } else {
        const spaceParts = line.split(/\s+/);
        if (spaceParts.length >= 2 && !isNaN(parseInt(spaceParts[spaceParts.length - 1], 10))) {
          const qty = parseInt(spaceParts[spaceParts.length - 1], 10);
          const code = context.cleanBarcode(spaceParts.slice(0, spaceParts.length - 1).join(''));
          result.push({
            barcode: code,
            qty: qty
          });
        } else {
          result.push({
            barcode: context.cleanBarcode(line),
            qty: 1
          });
        }
      }
    });
    return result;
  };
  context.getTimestampString = function getTimestampString() {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '');
    return `${dateStr}_${timeStr}`;
  };
}
export function initialize(context) {}
