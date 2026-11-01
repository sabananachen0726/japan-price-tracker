// Coalesce typing, support IME composition, and keep Enter/clear immediate.
export function bindDeferredSearch(input, search, delay = 350) {
  let timer, composing = false;
  const cancel = () => {clearTimeout(timer); timer = undefined;};
  const flush = () => {cancel(); search();};
  const schedule = event => {
    cancel();
    if (composing || event?.isComposing) return;
    if (!input.value.trim()) return flush();
    timer = setTimeout(flush, delay);
  };
  const start = () => {composing = true; cancel();};
  const end = () => {composing = false; schedule();};
  const key = event => {if (event.key === 'Enter' && !event.isComposing && !composing) {event.preventDefault(); flush();}};
  input.addEventListener('input', schedule);
  input.addEventListener('compositionstart', start);
  input.addEventListener('compositionend', end);
  input.addEventListener('keydown', key);
  return () => {
    cancel();
    for (const [name, fn] of [['input', schedule], ['compositionstart', start], ['compositionend', end], ['keydown', key]]) input.removeEventListener(name, fn);
  };
}
