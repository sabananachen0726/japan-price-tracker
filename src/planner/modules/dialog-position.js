// planner: dialog-position. Declare dependencies here when adding cross-feature calls.
export const definition = {
  "id": "dialog-position",
  "owns": [{
    "name": "positionPlannerDialog",
    "kind": "function"
  }, {
    "name": "openPlannerDialog",
    "kind": "function"
  }, {
    "name": "dialogPositionPending",
    "kind": "let"
  }, {
    "name": "schedulePlannerDialogs",
    "kind": "function"
  }],
  "imports": [],
  "writes": ["dialogPositionPending", "openPlannerDialog", "positionPlannerDialog", "schedulePlannerDialogs"]
};
export function register(context) {
  context.positionPlannerDialog = function positionPlannerDialog(dialog) {
    if (!dialog) return;
    let start = 0,
      end = window.innerHeight;
    try {
      const frame = window.frameElement;
      if (frame) {
        const r = frame.getBoundingClientRect();
        start = Math.max(0, -r.top);
        end = Math.min(window.innerHeight, window.parent.innerHeight - r.top);
      }
    } catch {}
    const visible = Math.max(120, end - start),
      pad = Math.min(64, Math.max(16, visible * .06));
    for (const [key, value] of Object.entries({
      position: 'fixed',
      margin: '0',
      left: '50%',
      right: 'auto',
      bottom: 'auto',
      top: start + pad + 'px',
      transform: 'translateX(-50%)',
      'max-height': Math.max(80, visible - pad - 16) + 'px',
      'overflow-y': 'auto',
      'box-sizing': 'border-box'
    })) dialog.style.setProperty(key, value, 'important');
  };
  context.openPlannerDialog = function openPlannerDialog(dialog) {
    context.positionPlannerDialog(dialog);
    dialog.scrollTop = 0;
    dialog.showModal();
    requestAnimationFrame(() => {
      if (dialog.open) context.positionPlannerDialog(dialog);
    });
  };
  context.schedulePlannerDialogs = function schedulePlannerDialogs() {
    if (context.dialogPositionPending) return;
    context.dialogPositionPending = true;
    requestAnimationFrame(() => {
      context.dialogPositionPending = false;
      document.querySelectorAll('dialog[open]').forEach(context.positionPlannerDialog);
    });
  };
}
export function initialize(context) {
  context.dialogPositionPending = false;
  window.addEventListener('resize', context.schedulePlannerDialogs, {
    passive: true
  });
  window.addEventListener('scroll', context.schedulePlannerDialogs, {
    passive: true
  });
  try {
    if (window.parent !== window) {
      window.parent.addEventListener('scroll', context.schedulePlannerDialogs, {
        passive: true
      });
      window.parent.addEventListener('resize', context.schedulePlannerDialogs, {
        passive: true
      });
      window.addEventListener('pagehide', () => {
        window.parent.removeEventListener('scroll', context.schedulePlannerDialogs);
        window.parent.removeEventListener('resize', context.schedulePlannerDialogs);
      }, {
        once: true
      });
    }
  } catch {}
}
