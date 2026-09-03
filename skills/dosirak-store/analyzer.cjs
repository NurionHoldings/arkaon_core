const { normalizeAction } = require('../../core/action-engine.cjs');
function analyze(events=[]){
  return events.map(e=>{
    if(e.type==='VENDOR_ACCEPT_DELAY'){
      return normalizeAction({
        platform:'dosirak-store',
        skill:'notification_escalation',
        title:`업체 주문 미수락 ${e.age_minutes}분`,
        summary:'대표자/주문담당자 재알림 및 관리자 우선순위 상향을 준비했습니다.',
        risk:e.severity==='HIGH'?'MEDIUM':'LOW',
        requested_authority:e.severity==='HIGH'?2:3,
        payload:{submission_id:e.order.submission_id,order_id:e.order.order_id,age_minutes:e.age_minutes},
        evidence:[{source:'order',status:e.order.order_status}]
      });
    }
    return normalizeAction({
      platform:'dosirak-store',skill:'order_delay_risk',title:e.type,
      summary:'운영상태를 검토해 조치안을 준비했습니다.',risk:'LOW',requested_authority:1,
      payload:{order_id:e.order?.order_id}
    });
  });
}
module.exports={analyze};
