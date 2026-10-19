// planner: sales-state. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "sales-state",
  "owns": [{
    "name": "salesDecoded",
    "kind": "let"
  }, {
    "name": "salesSummary",
    "kind": "let"
  }, {
    "name": "salesLoadGeneration",
    "kind": "let"
  }, {
    "name": "salesLoading",
    "kind": "let"
  }, {
    "name": "salesError",
    "kind": "let"
  }, {
    "name": "salesPending",
    "kind": "let"
  }, {
    "name": "salesWorker",
    "kind": "let"
  }, {
    "name": "salesSignature",
    "kind": "let"
  }, {
    "name": "salesBusy",
    "kind": "let"
  }, {
    "name": "salesAllowedCodes",
    "kind": "function"
  }, {
    "name": "updateSalesSummary",
    "kind": "function"
  }, {
    "name": "gzipText",
    "kind": "function"
  }, {
    "name": "gunzipText",
    "kind": "function"
  }, {
    "name": "decodeSales",
    "kind": "function"
  }, {
    "name": "hydrateSales",
    "kind": "function"
  }],
  "imports": ["SalesCore", "renderAll", "state", "storeLocal", "today", "trackerFeed"],
  "writes": ["decodeSales", "gunzipText", "gzipText", "hydrateSales", "salesAllowedCodes", "salesBusy", "salesDecoded", "salesError", "salesLoadGeneration", "salesLoading", "salesPending", "salesSignature", "salesSummary", "salesWorker", "updateSalesSummary"]
};
export function register(context) {
  context.salesAllowedCodes = function salesAllowedCodes() {
    const declared = Array.isArray(context.trackerFeed?.japanCodes) ? new Set(context.trackerFeed.japanCodes) : null;
    return new Set(context.state.items.filter(i => !i.code.startsWith('__') && (!declared || declared.has(i.code))).map(i => i.code));
  };
  context.updateSalesSummary = function updateSalesSummary() {
    context.salesSummary = Object.keys(context.salesDecoded).length ? context.SalesCore.summarize(context.salesDecoded, context.state.salesV1?.periodEnd || context.SalesCore.defaultEnd(context.salesDecoded, context.today()), context.salesAllowedCodes()) : null;
  };
  context.gzipText = async function gzipText(text) {
    if (typeof CompressionStream === 'undefined') throw Error('請使用新版 Chrome／Edge 匯入銷售檔');
    const data = new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    let bin = '';
    for (let i = 0; i < data.length; i += 32768) bin += String.fromCharCode(...data.subarray(i, i + 32768));
    return btoa(bin);
  };
  context.gunzipText = async function gunzipText(text) {
    if (typeof DecompressionStream === 'undefined') throw Error('請使用新版 Chrome／Edge 讀取共用月銷');
    const bytes = Uint8Array.from(atob(text), c => c.charCodeAt(0));
    return await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  };
  context.decodeSales = async function decodeSales(record) {
    const result = {};
    for (const slot of ['history', 'current']) {
      const s = record?.sources?.[slot];
      if (s) {
        if (s.codec !== 'gzip-base64') throw Error('不支援此銷售彙總格式');
        result[slot] = context.SalesCore.restrict(JSON.parse(await context.gunzipText(s.body)), context.salesAllowedCodes());
      }
    }
    return result;
  };
  context.hydrateSales = async function hydrateSales(record) {
    const signature = JSON.stringify(record || null);
    if (signature === context.salesSignature) return;
    context.salesSignature = signature;
    const generation = ++context.salesLoadGeneration;
    context.salesLoading = true;
    context.salesError = '';
    context.salesSummary = null;
    context.salesDecoded = {};
    try {
      const decoded = await context.decodeSales(record);
      if (generation !== context.salesLoadGeneration) return;
      context.salesDecoded = decoded;
      context.state.salesV1 = record || null;
      context.updateSalesSummary();
    } catch (err) {
      if (generation !== context.salesLoadGeneration) return;
      context.salesError = '銷售資料讀取失敗：' + err.message;
    } finally {
      if (generation === context.salesLoadGeneration) {
        context.salesLoading = false;
        context.storeLocal();
        context.renderAll();
      }
    }
  };
}
export function initialize(context) {
  context.salesDecoded = {};
  context.salesSummary = null;
  context.salesLoadGeneration = 0;
  context.salesLoading = false;
  context.salesError = '';
  context.salesPending = null;
  context.salesWorker = null;
  context.salesSignature = '';
  context.salesBusy = false;
}
