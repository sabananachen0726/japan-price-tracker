// container: editor. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "editor",
  "owns": [{
    "name": "updateContainerSummary",
    "kind": "function"
  }, {
    "name": "df",
    "kind": "function"
  }, {
    "name": "openContainerEditor",
    "kind": "function"
  }, {
    "name": "syncDraft",
    "kind": "function"
  }, {
    "name": "showOps",
    "kind": "function"
  }, {
    "name": "form",
    "kind": "function"
  }],
  "imports": ["$", "D", "E", "actionIssues", "complete", "dateInfo", "esc", "log", "money", "persist", "piStats", "sendContainerHeight", "setSaveFeedback", "stage", "today", "uid"],
  "writes": ["E", "df", "form", "openContainerEditor", "showOps", "syncDraft", "updateContainerSummary"]
};
export function register(context) {
  context.updateContainerSummary = function updateContainerSummary() {
    if (!context.E) return;
    const c = structuredClone(context.E);
    for (const key of ['code', 'status', 'portDate', 'unloadDate', 'expectedMonth']) {
      const input = context.$('f_' + key);
      if (input) c[key] = input.value;
    }
    c.checks ||= {};
    document.querySelectorAll('[data-check]').forEach(el => c.checks[el.dataset.check] = el.checked);
    for (const [id,key] of [['f_deposit','depositPaid'],['f_balance','balancePaid'],['f_final','finalListReceived']]) if (context.$(id)) c[key] = context.$(id).checked;
    const issues = context.actionIssues(c);
    const todos = (c.todos || []).filter(t => !t.done).length;
    const dates = context.dateInfo(c);
    const eta = dates.portDate || (c.expectedMonth ? c.expectedMonth + '（月份待定）' : '待確認');
    const stage = ['Void','Cancelled'].includes(c.status) ? c.status : context.stage(c);
    context.$('mt').textContent = c.code || '新增貨櫃';
    context.$('containerSummary').innerHTML = [['目前階段',stage],['預計到港',eta],['未完成',issues.length + ' 類 · ' + todos + ' 項待辦']].map(([label,value]) => '<div><span>' + context.esc(label) + '</span><strong>' + context.esc(value) + '</strong>' + (label === '未完成' ? '<small>' + context.esc(issues.map(x => ({PI:'PI 待確認',Payment:'付款待完成',Checklist:'檢查清單待完成'}[x] || x)).concat((c.todos || []).filter(t => !t.done).map(t => t.text)).join(' · ') || '目前無待處理事項') + '</small>' : '') + '</div>').join('');
    window.parent.postMessage({type:'KAISI_CONTAINER_HEADER',title:c.code || '新增貨櫃',summary:stage + ' · 到港 ' + eta + ' · ' + issues.length + ' 類待處理 / ' + todos + ' 項待辦'}, '*');
  };
  context.openContainerEditor = function openContainerEditor() {
    document.body.classList.add('editing-container');
    context.$('modal').scrollTop = 0;
    window.scrollTo({top: 0, behavior: 'instant'});
    context.sendContainerHeight();
    window.parent.postMessage({type: 'KAISI_CONTAINER_VIEW', view: 'detail', height: Math.ceil(context.$('modal').getBoundingClientRect().height) + 12}, '*');
  };
  context.df = function df(label, k) {
    return `<div class="field"><label>${label}</label><input id="f_${k}" type="date" value="${context.esc(context.E[k] || "")}"></div>`;
  };
  context.syncDraft = function syncDraft() {
    if (!context.E) return;
    ["code", "status", "supplier", "type", "destination", "expectedMonth", "version", "total", "notes", "portDate", "unloadDate"].forEach(k => {
      let el = context.$("f_" + k);
      if (el) context.E[k] = el.value;
    });
    document.querySelectorAll("[data-check]").forEach(x => context.E.checks[x.dataset.check] = x.checked);
    let dep = context.$("f_deposit"),
      bal = context.$("f_balance"),
      fin = context.$("f_final"),
      fd = context.$("f_finalListDate");
    if (dep) context.E.depositPaid = dep.checked;
    if (bal) context.E.balancePaid = bal.checked;
    if (fin) context.E.finalListReceived = fin.checked;
    if (fd) context.E.finalListDate = fd.value;
    const unloadCheck = context.$("f_unloadConfirmed");
    if (unloadCheck) context.E.unloadConfirmed = unloadCheck.checked;
  };
  context.showOps = function showOps() {
    return context.E.status === 'Shipping' || context.E.status === 'Completed' || !!context.E.depositPaid || !!context.E.balancePaid || !!context.E.finalListReceived || Object.values(context.E.checks || {}).some(Boolean);
  };
  context.form = function form() {
    const oldOpen = new Set([...document.querySelectorAll("#form details[open]")].map(el => el.dataset.section));
    const ops = context.showOps();
    context.$("mt").textContent = context.E.code || "新增貨櫃";
    context.$("form").innerHTML = `
 <div class="phase-note">${ops ? '目前為 Shipping：可維護付款、Final Container List 與 Checklist。' : '目前為 Quotation：詢價及確認內容；正式確認後選擇 Shipping。'}</div>
 <div class="basic-card"><h3>📦 基本資料</h3><div class="grid3">
 <div class="field"><label>Container / Internal Code *</label><input id="f_code" value="${context.esc(context.E.code)}" placeholder="例如：JSR26B1201"></div>
 <div class="field"><label>Status</label><select id="f_status" onchange="statusPreview(this.value)">${["Quotation", "Shipping", "Void", "Cancelled"].map(x => `<option ${context.E.status === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
 <div class="field"><label>Supplier</label><select id="f_supplier"><option value="">未決定</option>${context.D.settings.suppliers.map(x => `<option ${context.E.supplier === x ? "selected" : ""}>${context.esc(x)}</option>`).join("")}</select></div>
 <div class="field"><label>Type</label><select id="f_type"><option ${context.E.type === "Dry" ? "selected" : ""}>Dry</option><option ${context.E.type === "Frozen" ? "selected" : ""}>Frozen</option></select></div>
 <div class="field"><label>Destination</label><input id="f_destination" value="${context.esc(context.E.destination || "")}"></div>
 
 <div class="field"><label>Current Version</label><input id="f_version" placeholder="V0 / V1 / V2..." value="${context.esc(context.E.version || "")}"></div>
 <div class="field"><label>Latest Total Amount (JPY)</label><input id="f_total" type="number" value="${context.esc(context.E.total ?? "")}" placeholder="JPY"></div>
 <div class="field"><label>Notes</label><input id="f_notes" value="${context.esc(context.E.notes || "")}" placeholder="其他備註"></div>
 </div></div>
 <div class="section"><h3>🚢 貨櫃日期</h3><div class="grid3">
 <div class="field"><label>Expected Month</label><input id="f_expectedMonth" type="month" value="${context.esc(context.E.expectedMonth || "")}"><span class="tiny">若到港日與拆櫃日都空白，當月 15 日作為推估參考</span></div>
 <div class="field"><label>到港日</label><input id="f_portDate" type="date" value="${context.esc(context.E.portDate || "")}"></div>
 <div class="field"><label>拆櫃日</label><input id="f_unloadDate" type="date" value="${context.esc(context.E.unloadDate || "")}"><label class="check" style="margin-top:8px;border:0"><input id="f_unloadConfirmed" type="checkbox" ${context.E.unloadConfirmed ? 'checked' : ''}> 已拆櫃確認</label><span class="tiny">拆櫃日可預先填寫；只有勾選且日期已到，才視為已拆櫃並移出在途 PI。</span></div>
 </div></div>
 ${ops ? `<div class="section"><h3>Japan Price Tracker / Final PI</h3>${(() => {
      let ps = context.piStats(context.E);
      return ps.exists ? `<div class="phase-note"><b>${ps.isFinal ? "✓ FINAL PI" : "⚠ PI 尚未 Final"}</b>　${ps.items} Items · ${ps.ctn.toLocaleString()} CTN<br><span class="tiny">PI 明細與 Final 狀態由 Japan Price Tracker 管理；Container Tracker 不重複儲存。</span></div>` : `<div class="phase-note"><b>尚未連結 Final PI</b><br><span class="tiny">在 Japan Price Tracker 以相同 Container No. 匯入後會自動連結。</span></div>`;
    })()}</div>
 <div class="section"><h3>Payment</h3><div class="grid3"><label class="check"><input id="f_deposit" type="checkbox" ${context.E.depositPaid ? "checked" : ""}> Deposit Paid ${context.E.depositPaidDate ? `<span class="tiny">(${context.E.depositPaidDate})</span>` : ""}</label><label class="check"><input id="f_balance" type="checkbox" ${context.E.balancePaid ? "checked" : ""}> Balance Paid ${context.E.balancePaidDate ? `<span class="tiny">(${context.E.balancePaidDate})</span>` : ""}</label></div></div>
 <div class="section"><h3>Final Container List</h3><div class="grid3"><label class="check"><input id="f_final" type="checkbox" ${context.E.finalListReceived ? "checked" : ""}> Final Container List Received</label><div class="field"><label>Received Date</label><input id="f_finalListDate" type="date" value="${context.esc(context.E.finalListDate || "")}"></div></div></div>
 <div class="section"><h3>Checklist</h3>${context.D.settings.checklist.map(x => `<label class="check"><input type="checkbox" data-check="${context.esc(x)}" ${context.E.checks[x] ? "checked" : ""}> ${context.esc(x)}</label>`).join("")}</div>` : ""}
 <div class="section"><h3>Quotation / Version Notes</h3><div class="grid3"><div class="field"><label>Date *</label><input id="v_date" type="date" value="${context.today()}"></div><div class="field"><label>Version</label><input id="v_ver" placeholder="V1"></div><div class="field"><label>Amount JPY</label><input id="v_amt" type="number" placeholder="Optional"></div></div><div class="field" style="margin-top:10px"><label>Note</label><input id="v_note" placeholder="Optional"></div><button class="soft" style="margin-top:10px" onclick="addVersion()">＋ 加入紀錄</button>${context.E.versions.map(v => `<div class="hist"><b>${v.date}</b> ${context.esc(v.version || "")} ${v.amount ? context.money(v.amount) : ""} ${context.esc(v.note || "")}</div>`).join("")}</div>
 <div class="section"><h3>Ad hoc To-do</h3><div class="grid3"><div class="field"><label>Task</label><input id="t_text"></div><div class="field"><label>Category</label><select id="t_cat"><option>一般</option><option>付款</option><option>文件</option><option>系統/Checklist</option><option>日期/貨運</option></select></div><div class="field"><label>Due Date</label><input id="t_due" type="date"></div></div><button class="soft" style="margin-top:10px" onclick="addTodo()">＋ 加入 To-do</button>${context.E.todos.map(t => `<label class="check"><input type="checkbox" ${t.done ? "checked" : ""} onchange="editTodo('${t.id}',this.checked)"> ${context.esc(t.text)} <span class="tiny">${context.esc(t.category)} ${t.due || ""}</span></label>`).join("")}</div>
 <div class="section"><h3>Activity History</h3>${context.E.history.map(h => `<div class="hist"><b>${h.date}</b> — ${context.esc(h.text)}</div>`).join("") || '<div class="tiny">尚無紀錄</div>'}</div>`;
    for (const section of context.$('form').querySelectorAll('.section')) {
      const heading = section.querySelector('h3');
      if (!heading || heading.textContent.includes('貨櫃日期')) continue;
      const title = heading.textContent.trim();
      const details = document.createElement('details');
      details.className = 'detail-section';
      details.dataset.section = title;
      details.open = oldOpen.has(title);
      const summary = document.createElement('summary');
      summary.textContent = title;
      heading.remove();
      details.append(summary);
      while (section.firstChild) details.append(section.firstChild);
      section.replaceWith(details);
    }
    context.$('form').querySelector('.phase-note')?.remove();
    context.$("modal").classList.add("show");
    context.updateContainerSummary();
  };
}
export function initialize(context) {
  context.$("form").addEventListener("input", context.updateContainerSummary);
  context.$("form").addEventListener("change", context.updateContainerSummary);
  window.newC = () => {
    context.E = {
      id: context.uid(),
      code: "",
      status: "Quotation",
      type: "Dry",
      destination: "Brisbane",
      supplier: "",
      total: "",
      portDate: "",
      unloadDate: "",
      checks: {},
      todos: [],
      history: [],
      etaHistory: [],
      versions: []
    };
    context.$("form").replaceChildren();
    context.setSaveFeedback('');
    context.form();
    context.openContainerEditor();
  };
  window.editC = id => {
    let c = context.D.containers.find(x => x.id === id);
    if (c) {
      context.E = JSON.parse(JSON.stringify(c));
      const dt = context.dateInfo(context.E);
      context.E.portDate = dt.portDate;
      context.E.unloadDate = dt.unloadDate;
      context.E.unloadConfirmed = dt.unloadConfirmed;
      context.E.status = context.stage(context.E) === 'QUOTATION' ? 'Quotation' : 'Shipping';
      context.$("form").replaceChildren();
      context.setSaveFeedback('');
      context.form();
      context.openContainerEditor();
    }
  };
  window.statusPreview = v => {
    context.syncDraft();
    context.E.status = v;
    context.form();
  };
  window.closeM = () => {
    context.$("modal").classList.remove("show");
    document.body.classList.remove('editing-container');
    context.E = null;
    context.sendContainerHeight();
    window.parent.postMessage({type: 'KAISI_CONTAINER_VIEW', view: 'overview', height: Math.ceil(Math.max(760, context.$('app').scrollHeight, context.$('app').getBoundingClientRect().height)) + 12}, '*');
  };
  window.addVersion = () => {
    let d = context.$("v_date").value;
    if (!d) return alert("日期必填");
    let v = {
      id: context.uid(),
      date: d,
      version: context.$("v_ver").value,
      amount: context.$("v_amt").value,
      note: context.$("v_note").value
    };
    context.syncDraft();
    context.E.versions.unshift(v);
    context.log(context.E, "新增 Quotation / Version 紀錄");
    context.form();
  };
  window.addTodo = () => {
    let t = context.$("t_text").value.trim();
    if (!t) return;
    let v = {
      id: context.uid(),
      text: t,
      category: context.$("t_cat").value,
      due: context.$("t_due").value,
      done: false
    };
    context.syncDraft();
    context.E.todos.push(v);
    context.log(context.E, "新增 To-do：" + t);
    context.form();
  };
  window.editTodo = (id, v) => {
    let t = context.E.todos.find(x => x.id === id);
    if (t) {
      t.done = v;
      context.log(context.E, (v ? "完成" : "重新開啟") + " To-do：" + t.text);
    }
  };
  window.saveC = async () => {
    if (!context.E || context.$("modal").dataset.saving === "true") return;
    context.syncDraft();
    let old = context.D.containers.find(x => x.id === context.E.id),
      before = old ? JSON.parse(JSON.stringify(old)) : null;
    ["code", "status", "supplier", "type", "destination", "expectedMonth", "version", "total", "notes", "portDate", "unloadDate"].forEach(k => {
      let el = context.$("f_" + k);
      if (el) context.E[k] = el.value;
    });
    if (!context.E.code.trim()) return context.setSaveFeedback("Container / Internal Code 必填", "bad");
    if (context.E.unloadConfirmed && !context.E.unloadDate) return context.setSaveFeedback('請先填寫拆櫃日，再確認已拆櫃。', 'bad');
    document.querySelectorAll("[data-check]").forEach(x => context.E.checks[x.dataset.check] = x.checked);
    let dep = context.$("f_deposit"),
      bal = context.$("f_balance"),
      fin = context.$("f_final");
    if (dep) {
      let v = dep.checked;
      if (v && !context.E.depositPaid) {
        context.E.depositPaidDate = context.today();
        context.log(context.E, "Deposit marked as Paid");
      }
      context.E.depositPaid = v;
    }
    if (bal) {
      let v = bal.checked;
      if (v && !context.E.balancePaid) {
        context.E.balancePaidDate = context.today();
        context.log(context.E, "Balance marked as Paid");
      }
      context.E.balancePaid = v;
    }
    if (fin) {
      let v = fin.checked;
      if (v && !context.E.finalListReceived) context.log(context.E, "Final Container List received");
      context.E.finalListReceived = v;
      let fd = context.$("f_finalListDate");
      context.E.finalListDate = fd ? fd.value || (v ? context.today() : "") : context.E.finalListDate || "";
    }
    if (before && !!context.dateInfo(before).unloadConfirmed !== !!context.E.unloadConfirmed) context.log(context.E, context.E.unloadConfirmed ? '已確認拆櫃' : '取消已拆櫃確認');
    context.E.dateSchemaV2 = true;
    if (before && context.dateInfo(before).portDate !== context.E.portDate) {
      context.E.etaHistory.unshift({
        date: context.today(),
        from: context.dateInfo(before).portDate || '',
        to: context.E.portDate || ''
      });
      context.log(context.E, `到港日更新：${context.dateInfo(before).portDate || '—'} → ${context.E.portDate || '—'}`);
    }
    if (before && context.dateInfo(before).unloadDate !== context.E.unloadDate) context.log(context.E, `拆櫃日更新：${context.dateInfo(before).unloadDate || '—'} → ${context.E.unloadDate || '—'}`);
    if (!before) context.log(context.E, "建立貨櫃紀錄");
    if (before) context.D.settings.checklist.forEach(x => {
      if (!!before.checks[x] !== !!context.E.checks[x]) context.log(context.E, `${x} ${context.E.checks[x] ? "completed" : "reopened"}`);
    });
    let i = context.D.containers.findIndex(x => x.id === context.E.id);
    if (i >= 0) context.D.containers[i] = context.E;else context.D.containers.push(context.E);
    if (before?.archived && before?.status === 'Completed') {
      if (before.unloadConfirmed === undefined && !!context.dateInfo(before).unloadConfirmed === !!context.E.unloadConfirmed) delete context.E.unloadConfirmed;
      context.E.status = 'Completed';
    }
    context.complete(context.E);
    const attempted = context.E;
    context.$('modal').dataset.saving = 'true';
    document.querySelectorAll('button[onclick="saveC()"],button[onclick="closeM()"]').forEach(b => b.disabled = true);
    try {
      const ok = await context.persist();
      if (!ok) {
        const index = context.D.containers.findIndex(c => c.id === attempted.id);
        if (before && index >= 0) context.D.containers[index] = before;
        else if (!before && index >= 0) context.D.containers.splice(index, 1);
      } else context.E = structuredClone(context.D.containers.find(c => c.id === attempted.id) || attempted);
      context.updateContainerSummary();
      render();
    } finally {
      delete context.$('modal').dataset.saving;
      document.querySelectorAll('button[onclick="saveC()"],button[onclick="closeM()"]').forEach(b => b.disabled = false);
    }
  };
}
