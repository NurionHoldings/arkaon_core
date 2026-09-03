class ApprovalStore {
  constructor(){ this.items = new Map(); }
  put(action){ this.items.set(action.action_id, action); return action; }
  get(id){ return this.items.get(id) || null; }
  list(status){
    const rows=[...this.items.values()];
    return status ? rows.filter(x=>x.status===status) : rows;
  }
  patch(id, patch){
    const prev=this.get(id);
    if(!prev) throw new Error('action_not_found');
    const next={...prev,...patch};
    this.items.set(id,next);
    return next;
  }
}
module.exports = { ApprovalStore };
