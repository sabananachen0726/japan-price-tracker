/** A single native message listener, with independent ordered subscriptions. */
export function createWindowEvents(target) {
  const subscribers = new Set();
  let attached = false;
  function dispatch(event) {
    for (const subscriber of [...subscribers]) {
      if (!subscribers.has(subscriber)) continue;
      try { subscriber(event); }
      catch (error) { queueMicrotask(() => { throw error; }); }
    }
  }
  return Object.freeze({
    onMessage(subscriber) {
      if (typeof subscriber !== 'function') throw new TypeError('Message subscriber must be a function');
      subscribers.add(subscriber);
      if (!attached) { target.addEventListener('message', dispatch); attached = true; }
      return () => {
        subscribers.delete(subscriber);
        if (!subscribers.size && attached) { target.removeEventListener('message', dispatch); attached = false; }
      };
    },
    dispose() {
      if (attached) target.removeEventListener('message', dispatch);
      subscribers.clear(); attached = false;
    }
  });
}
