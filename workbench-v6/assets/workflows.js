/* V3默认纯监管：未签认的实绩修订与数据整改流程不开放。 */
(()=>{
 const denied=()=>{WB.shell?.toast('此办理能力尚未授权，当前仅提供查询');return null;};
 WB.workflows=Object.freeze({
  mode:'READ_ONLY',supplementEnabled:false,collaborationEnabled:false,
  openSupplement:denied,saveSupplement:denied,reviewSupplement:denied,
  openWorkOrderForm:denied,createWorkOrders:denied,advanceWorkOrder:denied,
  openAutoRules:denied,runAutoRules:denied,checkNewBatch:denied,
  getAlertWorkOrder:()=>null,orderState:o=>o.status,
  renderWorkOrders:el=>{if(el)el.innerHTML='<div class="empty">当前仅展示源工单记录</div>';}
 });
})();
