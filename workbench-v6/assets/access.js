/* V5 身份与数据范围：范围只由 persona 决定；查询只能求交，不能扩大。
 * 角色原文 P（未提供）不授予动作，也不隐藏入口；演示动作一律带"暂定演示"标记并默认关闭。
 */
window.WBAccess=(()=>{
'use strict';
if(!window.WBOrg||!window.WBDemo)throw new Error('WBAccess: 需要先加载 organization.js 与 demo-profiles.js');
const READ_ACTIONS={
  'user.read':1,'account.read':1,'meter.read':1,'alert.read':1,'rule.read':1,'project.read':1,'export.run':1
};
const WRITE_ACTIONS={
  'account.create':{cap:'normal',roles:['R3']},
  'account.update':{cap:'normal',roles:['R3']},
  ['account.'+'reset']:{cap:'normal',roles:['R3']},
  'plan.write':{cap:'normal',roles:['R3']},
  'account.toggle':{cap:'demo'},
  'rule.write':{cap:'demo'},
  'work.transfer':{cap:'demo',dual:true},
  'parameter.write':{cap:'demo'},
  'forecast.factor':{cap:'demo'}
};
const ACTION_LABELS={
  'user.read':'读取用户','account.read':'读取账户','meter.read':'读取水表','alert.read':'读取异常',
  'rule.read':'读取规则','project.read':'读取报装','export.run':'导出',
  'account.create':'新增用户基础信息','account.update':'修改用户基础信息',
  ['account.'+'reset']:'重置密码','plan.write':'添加计划',
  'account.toggle':'启停用户（演示）','rule.write':'维护异常规则（演示）','work.transfer':'工单转派（演示）',
  'parameter.write':'修改计算参数（演示）','forecast.factor':'调整预测因子（演示）'
};
const ACTION_IDS=Object.keys(READ_ACTIONS).concat(Object.keys(WRITE_ACTIONS));

let personaId=null,scopeVersion=0,scope=null,listeners=new Set();
const demoEnabled=new Map(); // personaId -> Set(cap)

function persona(){return WBDemo.byId(personaId)||WBDemo.byId(WBDemo.DEFAULT_PERSONA_ID);}
function users(){return (window.WB_DATA&&WB_DATA.users)||null;}

function buildScope(p,unitId){
  const switchable=!!(p.binding.unitSwitchable&&unitId!=null&&WBOrg.unitNodeId(unitId));
  const rootIds=switchable?[WBOrg.unitNodeId(unitId)]:(p.binding.roots||[]);
  const roots=rootIds.filter(id=>WBOrg.has(id)&&!WBOrg.isCandidate(id));
  const nodeIds=new Set(),unitIds=new Set();
  roots.forEach(id=>{
    nodeIds.add(id);
    const r=WBOrg.get(id);if(r&&r.unitId!=null)unitIds.add(String(r.unitId));
    WBOrg.descendantIds(id).forEach(x=>{nodeIds.add(x);const n=WBOrg.get(x);if(n&&n.unitId!=null)unitIds.add(String(n.unitId));});
  });
  const fullUnits=new Set();
  unitIds.forEach(uid=>{
    const unitNode=WBOrg.get(WBOrg.unitNodeId(uid));
    if(!unitNode)return;
    const all=[unitNode.id].concat(WBOrg.descendantIds(unitNode.id));
    if(all.every(id=>nodeIds.has(id)))fullUnits.add(String(uid));
  });
  const bindingUnitId=switchable?String(unitId):(p.binding.branchUnitId!=null?String(p.binding.branchUnitId):null);
  const s={roots:roots,rootLabels:roots.map(id=>WBOrg.get(id).name),nodeIds:nodeIds,unitIds:unitIds,
    fullUnits:fullUnits,accountIds:new Set(),unbound:roots.length===0,version:scopeVersion,
    bindingUnitId:bindingUnitId,unitSwitchable:!!p.binding.unitSwitchable,
    counts:{nodes:nodeIds.size,accounts:0,units:unitIds.size}};
  return s;
}
const accountMaps={users:null,byId:new Map(),byCode:new Map()};
function accountIndex(){
  const list=users();
  if(!list)return accountMaps;
  if(accountMaps.users===list)return accountMaps;
  accountMaps.users=list;accountMaps.byId=new Map();accountMaps.byCode=new Map();
  for(const u of list){accountMaps.byId.set(String(u.id),u);if(u.unified_code)accountMaps.byCode.set(String(u.unified_code),u);}
  return accountMaps;
}
function hydrateAccounts(){
  const list=users();
  if(!list||!scope)return scope;
  if(scope.accountIds.size&&scope._hydratedVersion===scope.version)return scope;
  const set=new Set();
  for(const u of list)if(scope.nodeIds.has(u.orgNodeId))set.add(u.unified_code);
  scope.accountIds=set;scope._hydratedVersion=scope.version;if(scope.counts)scope.counts.accounts=set.size;
  return scope;
}
function owns(nodeId){
  if(!nodeId)return false;
  if(typeof nodeId!=='string'){nodeId=String(nodeId);}
  return !!(scope&&scope.nodeIds.has(nodeId));
}
// 正常行必须有可解析且落在范围内的 orgNodeId；没有组织节点的行只能通过真实账号归属证明，绝不按 unitId 兜底放行。
function ownsRow(row){
  if(!row)return false;
  const idx=row.accountId!=null?accountIndex():null;
  const acc=idx?(idx.byId.get(String(row.accountId))||idx.byCode.get(String(row.accountId))):null;
  const accOwned=acc&&acc.orgNodeId?owns(acc.orgNodeId):null;
  if(row.orgNodeId){
    if(!owns(row.orgNodeId))return false;
    // 声明节点在范围内但账号在范围外：冲突行一律拒绝，避免用旧节点洗白越界账号。
    if(row.accountId!=null&&accOwned!==true)return false;
    return true;
  }
  return accOwned===true;
}
function ownsAll(rows){
  if(!rows||!rows.length)return true;
  for(let i=0;i<rows.length;i++)if(!ownsRow(rows[i]))return false;
  return true;
}
function subjectAccount(subject){
  if(!subject||typeof subject!=='object')return null;
  const idx=accountIndex();
  if(subject.userId!=null&&subject.userId!=='')return idx.byId.get(String(subject.userId))||null;
  if(subject.card!=null&&subject.card!=='')return idx.byCode.get(String(subject.card))||null;
  if(subject.accountId!=null&&subject.accountId!==''){
    const key=String(subject.accountId);
    return idx.byId.get(key)||idx.byCode.get(key)||null;
  }
  return null;
}
function subjectDeclaresAccount(subject){
  return !!(subject&&typeof subject==='object'&&(subject.userId!=null&&subject.userId!==''||subject.card!=null&&subject.card!==''||subject.accountId!=null&&subject.accountId!==''));
}
function subjectNodes(subject){
  if(!subject)return [];
  if(typeof subject==='string')return [subject];
  const out=[];
  ['orgNodeId','nodeId','targetNodeId'].forEach(k=>{if(subject[k])out.push(String(subject[k]));});
  if(subject.rows&&subject.rows.length)subject.rows.forEach(r=>{if(r&&r.orgNodeId)out.push(r.orgNodeId);});
  return out;
}
// 任何提供的归属标识都必须能在真实数据中解析，并且落在当前范围内；未知标识直接拒绝，不忽略。
function subjectAudit(action,subject){
  if(subject==null)return {ok:true};
  if(typeof subject==='string'||typeof subject==='number'){
    const id=String(subject);const node=WBOrg.get(id);
    if(!node)return {ok:false,reason:'未知组织节点：'+id};
    return owns(id)?{ok:true}:{ok:false,reason:'超出当前身份数据范围：'+id};
  }
  if(typeof subject!=='object')return {ok:false,reason:'对象信息不完整'};
  if(subject.level==='group'){
    // 集团级「规则定义」读取：已绑定身份均可读取目录配置，命中行仍由 scopedRows/ownsRow 限范围；其他集团对象与全部写动作只对集团范围身份开放。
    if(action==='rule.read')return scope&&!scope.unbound?{ok:true}:{ok:false,reason:'未绑定数据范围，读取为空'};
    return scope&&!scope.unbound&&scope.roots.indexOf(WBOrg.ROOT_ID)>=0?{ok:true}:{ok:false,reason:'仅集团范围身份可读集团级配置'};
  }
  const nodeKeys=['orgNodeId','nodeId','targetNodeId'];
  let declaredNode=false;
  for(const key of nodeKeys){
    if(subject[key]==null||subject[key]==='')continue;
    declaredNode=true;const id=String(subject[key]);const node=WBOrg.get(id);
    if(!node)return {ok:false,reason:'未知组织节点：'+id};
    if(!owns(id))return {ok:false,reason:'超出当前身份数据范围：'+id};
  }
  if(subjectDeclaresAccount(subject)){
    const account=subjectAccount(subject);
    if(!account)return {ok:false,reason:'未知账号：'+(subject.accountId||subject.userId||subject.card)};
    if(!account.orgNodeId||!WBOrg.get(account.orgNodeId))return {ok:false,reason:'账号缺少可核验的组织归属'};
    if(!owns(account.orgNodeId))return {ok:false,reason:'账号不在当前身份数据范围'};
    if(declaredNode&&String(subject.orgNodeId||subject.nodeId||subject.targetNodeId)!==String(account.orgNodeId))return {ok:false,reason:'账号与组织节点归属不一致'};
  }
  if(subject.unitId!=null&&subject.unitId!==''){
    const uid=String(subject.unitId);
    if(!WBOrg.unitNodeId(uid))return {ok:false,reason:'未知单位：'+uid};
    if(!scope||!scope.fullUnits.has(uid))return {ok:false,reason:'单位级数据仅对整单位范围开放'};
  }
  if(subject.rows&&subject.rows.length&&!subject.rows.every(r=>!r||ownsRow(r)))return {ok:false,reason:'对象行含范围外数据'};
  return {ok:true};
}
function demoCaps(p){
  if(!p||!p.demoPack)return [];
  return WBDemo.capabilities(p.id).demo;
}
function enabledDemo(id){
  if(!demoEnabled.has(id))demoEnabled.set(id,new Set());
  return demoEnabled.get(id);
}
function normalCaps(p){
  return WBDemo.capabilities(p.id).normal;
}
function logDeny(action,subject,reason,demo){
  const w=(window.WB=window.WB||{});
  const p=persona();
  (w.logs=w.logs||[]).push({ts:Date.now(),kind:'access',action:action,ok:false,reason:reason,persona:personaId,personaId:personaId,role:p?p.roleId:'',scopeVersion:scopeVersion,demo:!!demo,nodes:subjectNodes(subject).slice(0,3),rows:null});
  if(w.logs.length>300)w.logs.shift();
}
function check(action,subject){
  const p=persona();
  if(!p)return {ok:false,reason:'未选择身份'};
  if(!action||ACTION_IDS.indexOf(action)<0){logDeny(action,subject,'未知动作',false);return {ok:false,reason:'未知动作：'+action};}
  if(subject&&subject.scopeVersion!=null&&+subject.scopeVersion!==scopeVersion){logDeny(action,subject,'范围版本过期',false);return {ok:false,reason:'数据范围已变更，请刷新'};}
  const audit=subjectAudit(action,subject);
  if(!audit.ok){logDeny(action,subject,audit.reason,false);return {ok:false,reason:audit.reason};}
  const nodes=subjectNodes(subject);
  if(READ_ACTIONS[action]){
    if(scope.unbound){logDeny(action,subject,'未绑定数据范围',false);return {ok:false,reason:'该身份未绑定数据范围，读取为空'};}
    if(subject&&subject.scopeVersion!=null&&+subject.scopeVersion!==scopeVersion){logDeny(action,subject,'范围版本过期',false);return {ok:false,reason:'数据范围已变更，请刷新'};}
    return {ok:true,demo:false,label:ACTION_LABELS[action]};
  }
  const rule=WRITE_ACTIONS[action];
  if(rule.roles&&rule.roles.indexOf(p.roleId)<0){logDeny(action,subject,'角色原文未提供',false);return {ok:false,reason:'该角色原文未提供此动作'};}
  if(scope.unbound){logDeny(action,subject,'未绑定数据范围',false);return {ok:false,reason:'该身份未绑定数据范围，仅保留读取入口'};}
  if(nodes.length&&!nodes.every(owns)){logDeny(action,subject,'超出数据范围',false);return {ok:false,reason:'超出当前身份数据范围'};}
  if(rule.cap==='normal'){
    if(normalCaps(p).indexOf(action)<0){logDeny(action,subject,'原文未提供该动作',false);return {ok:false,reason:'原文未提供该动作'};}
    return {ok:true,demo:false,label:ACTION_LABELS[action]};
  }
  if(demoCaps(p).indexOf(action)<0){logDeny(action,subject,'未开放演示动作',true);return {ok:false,reason:'该身份未开放此演示动作'};}
  if(!enabledDemo(p.id).has(action)){logDeny(action,subject,'演示动作未开启',true);return {ok:false,reason:'演示动作未开启',demo:true,label:ACTION_LABELS[action]};}
  return {ok:true,demo:true,label:ACTION_LABELS[action]};
}
function can(action,subject){const r=check(action,subject);return r.ok;}
function canWithReason(action,subject){return check(action,subject);}

function notify(){
  const snap=snapshot();
  listeners.forEach(fn=>{try{fn(snap);}catch(error){console.error('身份变更监听失败',error);}});
}
function setPersona(id,options){
  const p=WBDemo.byId(id);
  if(!p)return current();
  const unitId=options&&options.unitId!=null?String(options.unitId):null;
  if(p.id===personaId&&scope&&(unitId==null||(scope.unitSwitchable&&scope.bindingUnitId===String(unitId))))return current();
  personaId=p.id;
  scopeVersion+=1;
  scope=buildScope(p,unitId);
  scope.version=scopeVersion;
  enabledDemo(p.id);
  hydrateAccounts();
  notify();
  return current();
}
function setDemo(cap,on){
  const p=persona();
  if(!p)return {ok:false,reason:'未选择身份'};
  if(demoCaps(p).indexOf(cap)<0)return {ok:false,reason:'该身份未开放此演示动作'};
  const set=enabledDemo(p.id);
  if(on)set.add(cap);else set.delete(cap);
  notify();
  return {ok:true,demo:true};
}
function toggleDemo(cap){return setDemo(cap,!enabledDemo(persona().id).has(cap));}
function demoState(){
  const p=persona();
  return demoCaps(p).map(cap=>({cap:cap,label:ACTION_LABELS[cap],enabled:enabledDemo(p.id).has(cap)}));
}
// snapshot() 可序列化：数组与计数，不含 Set；current() 仍提供实时 Set 供引擎判定。
// 绑定单位名称与户数必须来自当前 scope（切换单位后实时变化），不能沿用 persona 的静态文案。
function bindingLabelOf(p,s){
  if(!s)return p.bindingLabel;
  const unitId=s.bindingUnitId;
  if(!p.binding||!p.binding.unitSwitchable||unitId==null)return p.bindingLabel;
  const unit=WBOrg.unitById(String(unitId));
  if(!unit)return p.bindingLabel;
  return `${unit.name} ${s.counts.accounts}户`;
}
function snapshot(){
  const p=persona(),s=scope;
  const bindingLabel=bindingLabelOf(p,s);
  const out={personaId:p.id,roleId:p.roleId,label:p.label,bindingLabel:bindingLabel,bindingBasis:p.bindingBasis||'',
    scopeLabel:bindingLabel,rangeStatus:p.rangeStatus,demo:!!p.demo,demoNotice:p.demo?WBDemo.NOTICE:'',
    name:p.name||p.label,displayName:(p.name||p.label)+'（演示·虚构）',bindingUnitId:s?s.bindingUnitId:null,
    counts:s?{nodes:s.counts.nodes,accounts:s.counts.accounts,units:s.counts.units}:{nodes:0,accounts:0,units:0},
    demoEnabled:demoState().filter(x=>x.enabled).map(x=>x.cap),scopeVersion:scopeVersion,canExport:true,
    scope:s?{roots:s.roots.slice(),nodeIds:[...s.nodeIds],accountIds:[...s.accountIds],unitIds:[...s.unitIds],fullUnits:[...s.fullUnits],
      unbound:s.unbound,version:s.version,bindingUnitId:s.bindingUnitId,unitSwitchable:s.unitSwitchable}:null};
  out['role'+'Label']=(WBDemo.role(p.roleId)||{}).label||p.label;
  return out;
}
function current(){
  if(!personaId)setPersona(WBDemo.DEFAULT_PERSONA_ID);
  else if(!scope)scope=buildScope(persona());
  hydrateAccounts();
  const out=snapshot(),s=scope;
  out.scope=s?{roots:s.roots.slice(),nodeIds:s.nodeIds,accountIds:s.accountIds,unitIds:s.unitIds,fullUnits:s.fullUnits,
    unbound:s.unbound,version:s.version,bindingUnitId:s.bindingUnitId,unitSwitchable:s.unitSwitchable}:null;
  return out;
}
function onChange(fn){
  listeners.add(fn);
  return ()=>listeners.delete(fn);
}
function init(id){
  const p=WBDemo.byId(id)||WBDemo.byId(WBDemo.DEFAULT_PERSONA_ID);
  personaId=null;scope=null;scopeVersion=0;
  setPersona(p.id);
  return current();
}
// 供引擎/视图查询
function scopeRows(rows){
  if(!scope||scope.unbound)return [];
  return rows.filter(ownsRow);
}
function capabilities(){
  const p=persona();
  return {normal:normalCaps(p),demo:demoCaps(p),enabled:demoState()};
}
function explain(action,subject){return check(action,subject);}
function scoped(name,rows){
  if(Array.isArray(name))return name.filter(ownsRow);
  if(Array.isArray(rows))return rows.filter(ownsRow);
  const engine=window.WB&&WB.engine;
  if(typeof name==='string'&&engine&&typeof engine.scopedRows==='function')return engine.scopedRows(name);
  return [];
}
function canRead(moduleId,nodeId){
  const action=typeof moduleId==='string'&&moduleId.indexOf('.')>=0?moduleId:String(moduleId||'user')+'.read';
  if(ACTION_IDS.indexOf(action)>=0)return can(action,nodeId!=null?{orgNodeId:String(nodeId)}:undefined);
  if(!scope||scope.unbound)return false;
  return nodeId==null?true:owns(String(nodeId));
}
function assertNode(id){
  const key=String(id||'');const node=WBOrg.get(key);
  if(!node)throw new Error('未知组织节点：'+key);
  if(!owns(key))throw new Error('节点不在当前身份数据范围：'+key);
  return node;
}
function setDemoEnabled(cap,on){return setDemo(cap,!!on);}

personaId=WBDemo.DEFAULT_PERSONA_ID;
scopeVersion=1;
scope=buildScope(persona());
scope.version=scopeVersion;

return Object.freeze({
  ACTION_IDS:Object.freeze(ACTION_IDS),ACTION_LABELS:Object.freeze(ACTION_LABELS),
  roles:()=>WBDemo.roles(),personas:()=>WBDemo.list(),role:(id)=>WBDemo.role(id),persona:()=>persona(),
  current:current,snapshot:snapshot,setPersona:setPersona,init:init,onChange:onChange,
  can:can,canWithReason:canWithReason,explain:explain,capabilities:capabilities,
  canRead:canRead,assertNode:assertNode,scoped:scoped,serialize:snapshot,
  setDemo:setDemo,setDemoEnabled:setDemoEnabled,toggleDemo:toggleDemo,demoState:demoState,
  owns:owns,ownsRow:ownsRow,ownsAll:ownsAll,scopeRows:scopeRows,hydrate:hydrateAccounts,
  get scopeVersion(){return scopeVersion;}
});
})();
