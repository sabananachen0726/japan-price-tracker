// Container numbers say what is inside: JSR27B0202F (…F) is frozen, JSR26B1102 is dry.
const PATTERN = /^[A-Z]{3}\d{2}B\d{4}(F?)$/;
export function kindFromContainer(container) {
  const m = String(container || '').toUpperCase().replace(/[^A-Z0-9]/g, '').match(PATTERN);
  return m ? (m[1] ? 'frozen' : 'dry') : '';
}
// The kind most containers agree on; a tie stays unknown.
export function inferKind(containers) {
  let frozen = 0, dry = 0;
  for (const c of containers || []) { const k = kindFromContainer(c); if (k === 'frozen') frozen++; else if (k === 'dry') dry++; }
  return frozen > dry ? 'frozen' : dry > frozen ? 'dry' : '';
}
