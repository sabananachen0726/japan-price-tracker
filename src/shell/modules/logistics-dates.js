// shell: logistics-dates. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "logistics-dates",
  "owns": [{
    "name": "legacySafeDate",
    "kind": "function"
  }, {
    "name": "expectedMonth15",
    "kind": "function"
  }, {
    "name": "getContainerDates",
    "kind": "function"
  }],
  "imports": [],
  "writes": ["expectedMonth15", "getContainerDates", "legacySafeDate"]
};
export function register(context) {
  context.legacySafeDate = function legacySafeDate(v) {
    const d = String(v || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
  };
  context.expectedMonth15 = function expectedMonth15(v) {
    const m = String(v || '').match(/^(\d{4})-(0[1-9]|1[0-2])/);
    return m ? m[1] + '-' + m[2] + '-15' : '';
  };
  context.getContainerDates = function getContainerDates(c) {
    const newer = c?.dateSchemaV2 === true;
    const portDate = context.legacySafeDate(newer ? c?.portDate : c?.portDate || c?.actualArrival || c?.eta);
    const unloadDate = context.legacySafeDate(newer ? c?.unloadDate : c?.unloadDate || c?.warehouseReceived || c?.expectedWarehouse);
    const expectedMonth = String(c?.expectedMonth || '').slice(0, 7),
      month15 = context.expectedMonth15(expectedMonth);
    const unloadConfirmed = c?.unloadConfirmed === true || c?.unloadConfirmed === undefined && c?.archived === true && c?.status === 'Completed';
    return {
      portDate,
      unloadDate,
      expectedMonth,
      month15,
      eta: portDate || unloadDate || month15,
      etaEstimated: !portDate && !unloadDate && !!month15,
      unloadConfirmed,
      unloaded: unloadConfirmed && !!unloadDate && unloadDate <= new Date().toLocaleDateString('en-CA', {
        timeZone: 'Australia/Brisbane'
      })
    };
  };
}
export function initialize(context) {}
