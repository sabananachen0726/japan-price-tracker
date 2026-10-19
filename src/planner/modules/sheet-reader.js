// planner: sheet-reader. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "sheet-reader",
  "owns": [{
    "name": "parseSheet",
    "kind": "function"
  }],
  "imports": ["$", "download", "state"],
  "writes": ["parseSheet"]
};
export function register(context) {
  context.parseSheet = function parseSheet(file) {
    return new Promise((resolve, reject) => {
      let reader = new FileReader();
      reader.onload = () => {
        try {
          let wb = XLSX.read(reader.result, {
            type: 'array'
          });
          resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
            defval: ''
          }));
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };
}
export function initialize(context) {
  context.$('exportAll').onclick = () => context.download('Kaisi_Order_Planner_Drafts.json', JSON.stringify({
    drafts: context.state.drafts,
    pis: context.state.pis
  }, null, 2), 'application/json');
}
