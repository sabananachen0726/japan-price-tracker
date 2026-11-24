// container: workflow. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "workflow",
  "owns": [{
    "name": "active",
    "kind": "function"
  }, {
    "name": "stage",
    "kind": "function"
  }, {
    "name": "actionIssues",
    "kind": "function"
  }, {
    "name": "filt",
    "kind": "function"
  }, {
    "name": "complete",
    "kind": "function"
  }, {
    "name": "archiveBlockers",
    "kind": "function"
  }],
  "imports": ["$", "D", "dateInfo", "log", "piStats", "today"],
  "writes": ["actionIssues", "active", "archiveBlockers", "complete", "filt", "stage"]
};
export function register(context) {
  context.active = function active() {
    return context.D.containers.filter(c => !c.archived && !['Void', 'Cancelled'].includes(c.status));
  };
  context.stage = function stage(c) {
    // Display only Quotation / Shipping for active containers. Legacy status remains
    // intact in Firebase until that individual container is saved.
    return ['Quotation', 'Planning'].includes(c?.status) ? 'QUOTATION' : 'SHIPPING';
  };
  context.actionIssues = function actionIssues(c) {
    let ps = context.piStats(c),
      issues = [],
      d = context.dateInfo(c);
    if (!ps.exists || !ps.isFinal) issues.push('PI');
    if (!c.depositPaid || !c.balancePaid) issues.push('Payment');
    if (!d.unloadDate && d.eta && d.eta < context.today()) issues.push('日期待確認');
    let n = context.D.settings.checklist.filter(x => c.checks[x]).length;
    if (n < context.D.settings.checklist.length) issues.push('Checklist');
    return issues;
  };
  context.filt = function filt(a) {
    let q = (context.$('search')?.value || '').trim().toLowerCase(),
      sf = context.$('statusFilter')?.value || 'ALL',
      af = context.$('attentionFilter')?.value || 'ALL',
      fo = context.$('frozenOnly')?.checked || false;
    return a.filter(c => {
      if (q && !JSON.stringify(c).toLowerCase().includes(q)) return false;
      if (sf !== 'ALL' && context.stage(c) !== sf) return false;
      if (fo && c.type !== 'Frozen') return false;
      let issues = context.actionIssues(c);
      if (af === 'ACTION' && !issues.length) return false;
      if (af === 'PI' && !issues.includes('PI')) return false;
      if (af === 'PAYMENT' && !issues.includes('Payment')) return false;
      if (af === 'OVERDUE' && !issues.includes('日期待確認')) return false;
      if (af === 'CHECKLIST' && !issues.includes('Checklist')) return false;
      return true;
    });
  };
  // What still keeps an active container out of Archive (same conditions as complete()).
  context.archiveBlockers = function archiveBlockers(c) {
    if (!c || c.archived || ['Void', 'Cancelled'].includes(c.status)) return [];
    const d = context.dateInfo(c), out = [];
    if (!d.unloadDate) out.push('拆櫃日未填');
    else if (!d.unloadConfirmed) out.push('未勾「已確認拆櫃」');
    else if (d.unloadDate > context.today()) out.push('拆櫃日還沒到');
    if (!c.balancePaid) out.push('尾款未付');
    if (!c.finalListReceived) out.push('未勾「Final Container List Received」');
    const missing = context.D.settings.checklist.filter(x => !c.checks?.[x]).length;
    if (missing) out.push(`Checklist 還差 ${missing} 項`);
    return out;
  };
  context.complete = function complete(c) {
    if (c.archived && c.status === 'Completed' && c.unloadConfirmed === undefined) return false;
    let warehouseDone = context.dateInfo(c).unloaded;
    let done = warehouseDone && !!c.balancePaid && !!c.finalListReceived && context.D.settings.checklist.every(x => c.checks[x]);
    if (done && !c.archived) {
      c.preArchiveStatus = context.stage(c) === "QUOTATION" ? "Quotation" : "Shipping";
      c.status = "Completed";
      c.archived = true;
      c.archivedAt = context.today();
      context.log(c, "完成條件全部達成，自動移入 Archive");
      return true;
    }
    if (!done && c.archived && c.status === "Completed") {
      c.archived = false;
      c.archivedAt = "";
      c.status = c.preArchiveStatus === "Quotation" ? "Quotation" : "Shipping";
      context.log(c, "完成條件未達成，自動移出 Archive");
      return true;
    }
    return false;
  };
}
export function initialize(context) {}
