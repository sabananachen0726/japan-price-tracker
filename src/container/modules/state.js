// container: state. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "state",
  "owns": [{
    "name": "DEF",
    "kind": "const"
  }, {
    "name": "D",
    "kind": "let"
  }, {
    "name": "PI",
    "kind": "let"
  }, {
    "name": "E",
    "kind": "let"
  }, {
    "name": "unsub",
    "kind": "let"
  }, {
    "name": "piUnsub",
    "kind": "let"
  }, {
    "name": "$",
    "kind": "const"
  }, {
    "name": "esc",
    "kind": "const"
  }, {
    "name": "today",
    "kind": "const"
  }, {
    "name": "uid",
    "kind": "const"
  }, {
    "name": "money",
    "kind": "const"
  }],
  "imports": [],
  "writes": ["$", "D", "DEF", "E", "PI", "esc", "money", "piUnsub", "today", "uid", "unsub"]
};
export function register(context) {}
export function initialize(context) {
  context.DEF = ["做貨櫃單", "檢查客人預訂", "錄入 MYOB", "錄入 Onsight", "Product Hierarchy", "Catalogue"];
  context.D = {
    containers: [],
    settings: {
      suppliers: ["SilkRoad", "Tencho"],
      checklist: context.DEF
    }
  };
  context.PI = {
    finalPiContainers: {}
  };
  context.E = null;
  context.unsub = null;
  context.piUnsub = null;
  context.$ = x => document.getElementById(x);
  context.esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[m]);
  context.today = () => new Date().toLocaleDateString('en-CA', {
    timeZone: 'Australia/Brisbane'
  });
  context.uid = () => crypto.randomUUID ? crypto.randomUUID() : "id" + Date.now() + Math.random();
  context.money = n => n === "" || n == null ? "—" : "¥" + Number(n).toLocaleString();
}
