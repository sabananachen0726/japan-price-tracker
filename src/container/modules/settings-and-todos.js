// container: settings-and-todos. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "settings-and-todos",
  "owns": [{
    "name": "todos",
    "kind": "function"
  }, {
    "name": "settings",
    "kind": "function"
  }],
  "imports": ["$", "D", "active", "esc", "filt", "today"],
  "writes": ["settings", "todos"]
};
export function register(context) {
  context.todos = function todos() {
    let g = {
      OVERDUE: [],
      TODAY: [],
      UPCOMING: [],
      OTHER: []
    };
    context.filt(context.active()).forEach(c => c.todos.filter(t => !t.done).forEach(t => {
      let k = !t.due ? "OTHER" : t.due < context.today() ? "OVERDUE" : t.due === context.today() ? "TODAY" : "UPCOMING";
      g[k].push({
        c,
        t
      });
    }));
    context.$("todo").innerHTML = `<div class="cols4">${Object.entries(g).map(([k, a]) => `<div class="box"><h3>${k} <span class="tiny">${a.length}</span></h3>${a.map(x => `<div class="todo ${k === "OVERDUE" ? "over" : k === "TODAY" ? "today" : ""}"><b>${context.esc(x.c.code)}</b><div>${context.esc(x.t.text)}</div><div class="tiny">${context.esc(x.t.category || "一般")} · ${x.t.due || "No due"}</div><button class="soft" onclick="doneTodo('${x.c.id}','${x.t.id}')">完成</button></div>`).join("") || '<div class="tiny">沒有待辦</div>'}</div>`).join("")}</div>`;
  };
  context.settings = function settings() {
    context.$("settings").innerHTML = `<div class="box"><h3>供應商</h3>${context.D.settings.suppliers.map((x, i) => `<div class="settingsrow"><input value="${context.esc(x)}" onchange="sup(${i},this.value)"><button class="danger" onclick="delSup(${i})">刪除</button></div>`).join("")}<button class="soft" onclick="addSup()">＋ 新增</button></div><br><div class="box"><h3>預設 Checklist</h3><div class="tiny">可新增、改名、刪除、排序。</div>${context.D.settings.checklist.map((x, i) => `<div class="settingsrow"><input value="${context.esc(x)}" onchange="renameCheck(${i},this.value)"><button class="soft" onclick="moveCheck(${i},-1)">↑</button><button class="soft" onclick="moveCheck(${i},1)">↓</button><button class="danger" onclick="delCheck(${i})">刪除</button></div>`).join("")}<button class="soft" onclick="addCheck()">＋ 新增</button></div><div class="box data-management" style="margin-top:16px"><h3>Data Management</h3><div class="tiny dm-desc">備份與還原集中在這裡，避免 Dashboard 誤觸。</div><div class="dm-actions"><button class="soft dm-btn" onclick="backup()">Backup JSON</button><label class="soft dm-btn">Restore JSON<input type="file" accept=".json" class="hide" onchange="restoreFile(this)"></label></div></div>`;
  };
}
export function initialize(context) {}
