function observe(snapshot={}) {
  const events=[];
  const now=Date.now();
  for(const o of snapshot.orders || []){
    const status=String(o.order_status||'');
    if(status==='VENDOR_PENDING' && o.created_at){
      const age=(now-new Date(o.created_at).getTime())/60000;
      if(age>=10) events.push({type:'VENDOR_ACCEPT_DELAY',severity:'HIGH',order:o,age_minutes:Math.round(age)});
      else if(age>=5) events.push({type:'VENDOR_ACCEPT_DELAY',severity:'MEDIUM',order:o,age_minutes:Math.round(age)});
    }
    if(['READY','PICKUP_ASSIGNED'].includes(status) && o.date_needed && o.arrive_time){
      events.push({type:'DELIVERY_WATCH',severity:'LOW',order:o});
    }
  }
  return events;
}
module.exports={observe};
