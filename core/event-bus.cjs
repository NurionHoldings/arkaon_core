class ArkaonBus {
  constructor(){ this.handlers = new Map(); }
  on(type, handler){
    if(!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(handler);
    return () => this.handlers.get(type).delete(handler);
  }
  async emit(event){
    const list = [...(this.handlers.get(event.type) || [])];
    return Promise.all(list.map(fn => fn(event)));
  }
}
module.exports = { ArkaonBus };
