/**
 * Each feature owns its declarations and declares cross-feature dependencies.
 * Registration restores function hoisting; initialization preserves source order.
 * Parent scopes support deferred DOM bindings without promoting their private state.
 */
export function createFeatureRuntime(features, {imports = {}, parent = null, exposeGlobals = false} = {}) {
  const slots = new Map();
  const definitions = new Map();
  let started = false;
  for (const feature of features) {
    const definition = feature.definition;
    if (definitions.has(definition.id)) throw new Error(`Duplicate feature: ${definition.id}`);
    definitions.set(definition.id, definition);
    for (const declaration of definition.owns) {
      if (slots.has(declaration.name)) throw new Error(`Duplicate declaration: ${declaration.name}`);
      slots.set(declaration.name, {
        owner: definition.id, kind: declaration.kind,
        initialized: declaration.kind === 'var', value: undefined
      });
    }
  }
  for (const [name, value] of Object.entries(imports)) {
    if (slots.has(name)) throw new Error(`Import shadows declaration: ${name}`);
    slots.set(name, {owner: '@imports', kind: 'const', initialized: true, value});
  }
  const exists = name => slots.has(name) || !!(parent && name in parent);
  const read = name => {
    if (!slots.has(name)) {
      if (parent && name in parent) return parent[name];
      throw new ReferenceError(`Unknown dependency: ${name}`);
    }
    const slot = slots.get(name);
    if (!slot.initialized) throw new ReferenceError(`Cannot access '${name}' before initialization`);
    return slot.value;
  };
  const write = (name, value) => {
    const slot = slots.get(name);
    if (!slot) {
      if (parent && name in parent) { parent[name] = value; return true; }
      throw new ReferenceError(`Unknown state: ${name}`);
    }
    if (slot.initialized && slot.kind === 'const') throw new TypeError(`Assignment to constant '${name}'`);
    slot.value = value; slot.initialized = true; return true;
  };
  const contexts = new Map();
  for (const feature of features) {
    const {id, owns, imports: dependencies, writes} = feature.definition;
    const owned = new Set(owns.map(item => item.name));
    const readable = new Set([...owned, ...dependencies]);
    const writable = new Set([...owned, ...writes]);
    for (const name of readable) if (!exists(name)) throw new Error(`${id}: missing dependency '${name}'`);
    contexts.set(id, new Proxy(Object.create(null), {
      get(_target, name) {
        if (typeof name !== 'string') return undefined;
        if (!readable.has(name)) throw new Error(`${id}: undeclared read '${name}'`);
        return read(name);
      },
      set(_target, name, value) {
        if (!writable.has(name)) throw new Error(`${id}: undeclared write '${name}'`);
        return write(name, value);
      },
      has(_target, name) { return readable.has(name) && exists(name); }
    }));
  }
  if (exposeGlobals) {
    // Existing HTML event attributes in the embedded tools remain compatible.
    for (const [name, slot] of slots) {
      if (slot.owner === '@imports') continue;
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
      if (descriptor && !descriptor.configurable) throw new Error(`Cannot expose legacy handler '${name}'`);
      Object.defineProperty(globalThis, name, {configurable: true, get: () => read(name), set: value => write(name, value)});
    }
  }
  return Object.freeze({
    start() {
      if (started) throw new Error('Application already initialized');
      started = true;
      for (const feature of features) feature.register(contexts.get(feature.definition.id));
      for (const feature of features) feature.initialize(contexts.get(feature.definition.id));
    }
  });
}
