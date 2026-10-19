// container: logistics-dates. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "logistics-dates",
  "owns": [{
    "name": "validShippingDate",
    "kind": "function"
  }, {
    "name": "estimatedMonth15",
    "kind": "function"
  }, {
    "name": "dateInfo",
    "kind": "function"
  }, {
    "name": "norm",
    "kind": "function"
  }, {
    "name": "piFor",
    "kind": "function"
  }, {
    "name": "piStats",
    "kind": "function"
  }, {
    "name": "log",
    "kind": "function"
  }],
  "imports": ["D", "DEF", "PI", "today", "uid"],
  "writes": ["dateInfo", "estimatedMonth15", "log", "norm", "piFor", "piStats", "validShippingDate"]
};
export function register(context) {
  context.validShippingDate = function validShippingDate(value) {
    const d = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
  };
  context.estimatedMonth15 = function estimatedMonth15(value) {
    const m = String(value || '').match(/^(\d{4})-(0[1-9]|1[0-2])/);
    return m ? m[1] + '-' + m[2] + '-15' : '';
  };
  context.dateInfo = function dateInfo(c) {
    const newSchema = c?.dateSchemaV2 === true;
    const portDate = context.validShippingDate(newSchema ? c.portDate : c.portDate || c.actualArrival || c.eta);
    const unloadDate = context.validShippingDate(newSchema ? c.unloadDate : c.unloadDate || c.warehouseReceived || c.expectedWarehouse);
    const estimated = context.estimatedMonth15(c?.expectedMonth);
    // The 15th is a planning estimate only; never silently claim real unloading.
    const unloadConfirmed = c?.unloadConfirmed === true || c?.unloadConfirmed === undefined && c?.archived === true && c?.status === 'Completed';
    return {
      portDate,
      unloadDate,
      estimated,
      eta: portDate || unloadDate || estimated,
      etaEstimated: !portDate && !unloadDate && !!estimated,
      unloadConfirmed,
      unloaded: unloadConfirmed && !!unloadDate && unloadDate <= context.today()
    };
  };
  context.norm = function norm() {
    context.D.containers = context.D.containers || [];
    context.D.settings = context.D.settings || {};
    context.D.settings.suppliers = context.D.settings.suppliers || ["SilkRoad", "Tencho"];
    context.D.settings.checklist = context.D.settings.checklist || context.DEF;
    context.D.containers.forEach(c => {
      c.todos = c.todos || [];
      c.history = c.history || [];
      c.etaHistory = c.etaHistory || [];
      c.versions = c.versions || [];
      c.checks = c.checks || {};
    });
  };
  context.piFor = function piFor(c) {
    return (context.PI.finalPiContainers || {})[String(c?.code || "").trim().toUpperCase()] || null;
  };
  context.piStats = function piStats(c) {
    let p = context.piFor(c),
      rows = p?.rows || [];
    return {
      exists: !!p,
      isFinal: p?.isFinal === true,
      items: new Set(rows.map(r => `${r.itemCode || ""}|${r.barcode || ""}`)).size,
      ctn: rows.reduce((n, r) => n + (Number(r.qty) || 0), 0)
    };
  };
  context.log = function log(c, t) {
    c.history.unshift({
      id: context.uid(),
      date: context.today(),
      text: t
    });
  };
}
export function initialize(context) {}
