class DosirakAdminConnector {
  constructor({baseUrl='', fetchImpl=global.fetch}={}){ this.baseUrl=baseUrl; this.fetch=fetchImpl; }
  async snapshot(){
    const res=await this.fetch(`${this.baseUrl}/api/admin-orders`,{credentials:'include'});
    if(!res.ok) throw new Error(`admin_orders_${res.status}`);
    const data=await res.json();
    return {orders:data.orders||data.data||[], vendors:data.vendors||[], riders:data.riders||[]};
  }
  async execute(action){
    const map={
      vendor_assignment_suggest:'assign_vendor',
      delivery_recovery:'assign_delivery',
      settlement_finalization:'confirm_settlement'
    };
    const apiAction=map[action.skill];
    if(!apiAction) return {ok:false,error:'skill_not_bound'};
    const res=await this.fetch(`${this.baseUrl}/api/admin-orders`,{
      method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:apiAction,...action.payload})
    });
    return res.json();
  }
}
module.exports={DosirakAdminConnector};
