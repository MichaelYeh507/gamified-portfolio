/**
 * The smallest event emitter that supports priorities.
 *
 * Priority exists because of the single-ticker lesson from the the reference site
 * teardown: one loop, explicit ordering, no hidden dependency on registration
 * order. Lower numbers run first.
 */
export default class Events {
  constructor() {
    /** @type {Map<string, {fn: Function, priority: number, ctx: any}[]>} */
    this._listeners = new Map();
  }

  on(name, fn, priority = 50, ctx = null) {
    let list = this._listeners.get(name);
    if (!list) {
      list = [];
      this._listeners.set(name, list);
    }
    list.push({ fn, priority, ctx });
    list.sort((a, b) => a.priority - b.priority);
    return () => this.off(name, fn);
  }

  once(name, fn, priority = 50, ctx = null) {
    const wrapped = (...args) => {
      this.off(name, wrapped);
      fn.apply(ctx, args);
    };
    return this.on(name, wrapped, priority, ctx);
  }

  off(name, fn) {
    const list = this._listeners.get(name);
    if (!list) return;
    const i = list.findIndex((l) => l.fn === fn);
    if (i !== -1) list.splice(i, 1);
    if (list.length === 0) this._listeners.delete(name);
  }

  emit(name, ...args) {
    const list = this._listeners.get(name);
    if (!list) return;
    // Iterate a copy: handlers are allowed to unsubscribe themselves.
    for (const l of list.slice()) l.fn.apply(l.ctx, args);
  }

  clear() {
    this._listeners.clear();
  }
}
