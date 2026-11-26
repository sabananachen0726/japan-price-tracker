// Admin actions on 處理中 sent from the planner's 採購單總覽.
import {requestFromSubmission, closeRequest, prunable, CANCEL_REASONS} from '../shared/purchase-pool.js';
import {brisbaneDate} from '../shared/customer-protection.js';

const safeName = value => String(value || '').trim().toUpperCase();
const validName = name => !!name && !name.startsWith('__') && name.length <= 80 && !/[.\/\[\]*`~]/.test(name);

export function installPurchasePoolActions(context) {
  context.events.onMessage(async e => {
    const plannerWindow = document.getElementById('plannerFrame')?.contentWindow;
    if (e.source !== plannerWindow || e.data?.type !== 'KAISI_POOL_ACTION') return;
    const {action, requestId} = e.data;
    const reply = (ok, error = '') => plannerWindow.postMessage({type: 'KAISI_POOL_RESULT', requestId, action, ok, error}, '*');
    if (!context.auth.currentUser || !context.isAdmin()) return reply(false, '只有 Admin 可以處理「處理中」');
    if (context.currentDataMode !== 'live') return reply(false, '處理中只在 LIVE 模式運作');
    const at = new Date().toISOString(), by = context.auth.currentUser.email || '';
    try {
      await context.runTransaction(context.db, async tx => {
        const snap = await tx.get(context.ORDER_PLANNER_REF);
        const data = snap.exists() ? snap.data() : {}, requests = data.pool?.requests || {}, drafts = data.drafts || {};
        const patch = {}, fields = [];
        const put = (name, value) => {
          (patch.pool ||= {requests: {}}).requests[name] = value;
          fields.push(new context.FieldPath('pool', 'requests', name));
        };
        if (action === 'add') {
          const names = [...new Set((Array.isArray(e.data.names) ? e.data.names : []).map(safeName))].filter(validName);
          if (!names.length) throw Error('請先勾選工作單');
          for (const name of names) {
            const draft = drafts[name];
            if (!draft?.updatedAt) throw Error(`${name} 不是已提交的工作單`);
            if (requests[name]) continue;
            const built = requestFromSubmission(null, draft, {name, at: draft.updatedAt, by: draft.submittedBy || ''});
            if (Object.keys(built.lines).length) put(name, built);
          }
        } else if (action === 'close') {
          const name = safeName(e.data.name);
          if (!requests[name]) throw Error(`${name} 不在處理中`);
          const decisions = {};
          for (const [code, choice] of Object.entries(e.data.decisions || {})) if (choice === 'carry' || Object.hasOwn(CANCEL_REASONS, choice)) decisions[safeName(code)] = choice;
          put(name, closeRequest(requests[name], decisions, {at, by}));
        } else throw Error('未知的動作');
        for (const name of prunable({requests}, brisbaneDate())) if (!patch.pool?.requests?.[name]) put(name, context.deleteField());
        if (!fields.length) throw Error('沒有需要更新的資料');
        tx.set(context.ORDER_PLANNER_REF, patch, {mergeFields: fields});
      });
      reply(true);
    } catch (err) {
      reply(false, err.message || String(err));
    }
  });
}
