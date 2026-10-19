// container: editing-actions. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "editing-actions",
  "owns": [],
  "imports": ["D", "log", "persist"],
  "writes": []
};
export function register(context) {}
export function initialize(context) {
  window.doneTodo = (cid, tid) => {
    let c = context.D.containers.find(x => x.id === cid),
      t = c.todos.find(x => x.id === tid);
    t.done = true;
    context.log(c, "完成 To-do：" + t.text);
    context.persist();
    render();
  };
  window.sup = (i, v) => {
    context.D.settings.suppliers[i] = v.trim();
    context.persist();
    render();
  };
  window.delSup = i => {
    if (confirm("刪除供應商選項？既有資料不受影響。")) {
      context.D.settings.suppliers.splice(i, 1);
      context.persist();
      render();
    }
  };
  window.addSup = () => {
    let v = prompt("供應商名稱");
    if (v) {
      context.D.settings.suppliers.push(v.trim());
      context.persist();
      render();
    }
  };
  window.renameCheck = (i, v) => {
    let o = context.D.settings.checklist[i],
      n = v.trim();
    if (!n || n === o) return;
    context.D.containers.forEach(c => {
      if (c.checks[o] !== undefined) {
        c.checks[n] = c.checks[o];
        delete c.checks[o];
      }
    });
    context.D.settings.checklist[i] = n;
    context.persist();
    render();
  };
  window.moveCheck = (i, d) => {
    let j = i + d;
    if (j < 0 || j >= context.D.settings.checklist.length) return;
    [context.D.settings.checklist[i], context.D.settings.checklist[j]] = [context.D.settings.checklist[j], context.D.settings.checklist[i]];
    context.persist();
    render();
  };
  window.delCheck = i => {
    if (confirm("刪除 Checklist？")) {
      context.D.settings.checklist.splice(i, 1);
      context.persist();
      render();
    }
  };
  window.addCheck = () => {
    let v = prompt("新的 Checklist 名稱");
    if (v) {
      context.D.settings.checklist.push(v.trim());
      context.persist();
      render();
    }
  };
}
