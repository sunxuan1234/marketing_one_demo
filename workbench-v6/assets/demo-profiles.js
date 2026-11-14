/* V5 角色与演示身份（全部虚构，非真实账号）
 * 角色来自《组织层级与角色权限基线.xlsx》01-角色原文与权限矩阵 R1–R8；
 * 其中只有 R3 的 C4 有原文动作（添加/修改用户基础信息、重置密码、添加计划），其余动作为 P（未提供）。
 * persona 的绑定是演示数据：范围 C 来自组织基线，E 为显式演示包，P 为未绑定（空范围）。
 */
window.WBDemo=(()=>{
'use strict';
const DEMO_NOTICE='暂定演示';

const ROLES=Object.freeze([
  {id:'R1',label:'集团领导',level:1,scopeBasis:'C',actionBasis:'P',sourceScope:'集团（全部单位）',sourceAction:'未提供'},
  {id:'R2',label:'管理部领导',level:1,scopeBasis:'C',actionBasis:'P',sourceScope:'集团（全部单位）',sourceAction:'未提供'},
  {id:'R3',label:'部管理员',level:1,scopeBasis:'C',actionBasis:'C',sourceScope:'集团（全部单位）',
   sourceAction:'添加修改用户基础信息、重置密码、添加计划等功能',sourceCoord:'01-角色原文与权限矩阵 C4'},
  {id:'R4',label:'分公司领导',level:2,scopeBasis:'C',actionBasis:'P',sourceScope:'本分公司',sourceAction:'未提供'},
  {id:'R5',label:'分公司管理员',level:2,scopeBasis:'C',actionBasis:'P',sourceScope:'本分公司',sourceAction:'未提供'},
  {id:'R6',label:'所长',level:3,scopeBasis:'P',actionBasis:'P',sourceScope:'未提供（营业所层无人员登记）',sourceAction:'未提供'},
  {id:'R7',label:'班长',level:4,scopeBasis:'P',actionBasis:'P',sourceScope:'未提供（班组层无人员登记）',sourceAction:'未提供'},
  {id:'R8',label:'员工',level:5,scopeBasis:'C',actionBasis:'P',sourceScope:'本人登记线路',sourceAction:'未提供'}
].map(Object.freeze));

const DEMO_PACKS=Object.freeze({
  admin:Object.freeze(['account.toggle','rule.write','work.transfer','parameter.write','forecast.factor']),
  branch:Object.freeze(['work.transfer']),
  station:Object.freeze(['work.transfer']),
  team:Object.freeze(['work.transfer'])
});

// scopeCount 是演示数据量（户数/线路数），不是权限计数；unbound 身份为 0。
const PERSONAS=Object.freeze([
  {id:'PER-GROUP-LEAD',name:'周航',roleId:'R1',label:'集团领导',bindingLabel:'集团（全部单位）',
   binding:{roots:['ORG-GROUP']},scopeBasis:'C',actionBasis:'P',rangeStatus:'bound',scopeCount:2000,
   demo:false,note:'组织基线集团根节点；可读全部 2000 户。'},
  {id:'PER-DEPT-LEAD',name:'陈曦',roleId:'R2',label:'管理部领导',bindingLabel:'集团（全部单位）',
   binding:{roots:['ORG-GROUP']},scopeBasis:'C',actionBasis:'P',rangeStatus:'bound',scopeCount:2000,
   demo:false,note:'管理部领导按集团范围读取，台账类动作未提供。'},
  {id:'PER-DEPT-ADMIN',name:'李澈',roleId:'R3',label:'部管理员',bindingLabel:'集团（全部单位）',
   binding:{roots:['ORG-GROUP']},scopeBasis:'C',actionBasis:'C',rangeStatus:'bound',scopeCount:2000,
   demo:false,note:'唯一有原文动作的身份：用户基础信息新增/修改、重置密码、添加计划。',demoPack:'admin'},
  {id:'PER-BRANCH-LEAD-BIZ',name:'王砚',roleId:'R4',label:'分公司领导',bindingLabel:'营业中心（995 户）',
   binding:{roots:['ORG-BIZ'],branchUnitId:1,unitSwitchable:true},scopeBasis:'C',actionBasis:'P',rangeStatus:'bound',scopeCount:995,
   demo:false,note:'营业中心 5 所 22 班组 199 条线路 × 5 户。本期例外：可在本绑定单位填报水厂出水量与未注册用户数，其余管理动作不扩。',demoPack:'branch'},
  {id:'PER-BRANCH-ADMIN-BIZ',name:'赵岚',roleId:'R5',label:'分公司管理员',bindingLabel:'营业中心（995 户）',
   binding:{roots:['ORG-BIZ'],branchUnitId:1,unitSwitchable:true},scopeBasis:'C',actionBasis:'P',rangeStatus:'bound',scopeCount:995,
   demo:false,note:'本期例外：可在本绑定单位填报水厂出水量与未注册用户数；其余管理动作未提供，不扩权。',demoPack:'branch'},
  {id:'PER-STATION-HEAD-UNBOUND',name:'孙禾',roleId:'R6',label:'所长',bindingLabel:'营业所（未绑定）',
   binding:{roots:[]},scopeBasis:'P',actionBasis:'P',rangeStatus:'unbound',scopeCount:0,
   demo:false,note:'营业所层无人员责任登记，范围未提供；保留入口，读取为空。'},
  {id:'PER-STATION-HEAD-DEMO',name:'吴启',roleId:'R6',label:'所长',bindingLabel:'中原营业所（演示）',
   binding:{roots:['ORG-BIZ-ZY']},scopeBasis:'E',actionBasis:'P',rangeStatus:'demo',scopeCount:225,
   demo:true,note:'演示绑定：中原营业所 45 条线路 × 5 户 = 225 户。',demoPack:'station'},
  {id:'PER-TEAM-LEAD-UNBOUND',name:'郑遥',roleId:'R7',label:'班长',bindingLabel:'班组（未绑定）',
   binding:{roots:[]},scopeBasis:'P',actionBasis:'P',rangeStatus:'unbound',scopeCount:0,
   demo:false,note:'班组层仅登记线路归属，未登记班组长；保留入口，读取为空。'},
  {id:'PER-TEAM-LEAD-DEMO',name:'何沐',roleId:'R7',label:'班长',bindingLabel:'中原·户表二班（演示）',
   binding:{roots:['ORG-BIZ-ZY-T2']},scopeBasis:'E',actionBasis:'P',rangeStatus:'demo',scopeCount:40,
   demo:true,note:'演示绑定：中原营业所户表二班 8 条线路 × 5 户 = 40 户。',demoPack:'team'},
  {id:'PER-STAFF-BOUND',name:'徐清',roleId:'R8',label:'员工',bindingLabel:'虚拟账号绑定线路 1148（无真实人员关联）',
   binding:{roots:['LINE-BIZ-ZY-T2-1148']},scopeBasis:'C',actionBasis:'P',rangeStatus:'bound',scopeCount:5,
   demo:false,bindingBasis:'E（演示绑定）',note:'线路 1148 在组织基线中有责任登记，但账号未提供；此处为虚构演示账号，不对应任何真实人员，也不推导其权限。'},
  {id:'PER-STAFF-MULTI',name:'唐越',roleId:'R8',label:'员工',bindingLabel:'虚拟账号绑定 1148 + 2241（跨所两条线路）',
   binding:{roots:['LINE-BIZ-ZY-T2-1148','LINE-BIZ-JS-T2-2241']},scopeBasis:'C',actionBasis:'P',rangeStatus:'bound',scopeCount:10,
   demo:false,bindingBasis:'E（演示绑定）',note:'两条线路只是虚拟绑定的演示组合，不合并、不代表任何真实人员的多线路责任，也不扩展到整班组。'},
  {id:'PER-STAFF-UNBOUND',name:'冯谦',roleId:'R8',label:'员工',bindingLabel:'未绑定线路',
   binding:{roots:[]},scopeBasis:'P',actionBasis:'P',rangeStatus:'unbound',scopeCount:0,
   demo:false,note:'未提供责任线路；保留入口，读取为空。'}
].map(p=>Object.freeze(Object.assign({},p,{binding:Object.freeze(Object.assign({lineKeys:[]},p.binding)),
  bindingBasis:p.bindingBasis||(p.scopeBasis==='C'?'C（原文范围；账号均为虚构）':p.scopeBasis==='E'?'E（演示绑定）':'P（原文未提供）'),
  demoNotice:p.demo?DEMO_NOTICE:'',demoCaps:Object.freeze([])}))));

const byPersona=new Map(PERSONAS.map(p=>[p.id,p]));
const byRole=new Map(ROLES.map(r=>[r.id,r]));
const DEFAULT_PERSONA_ID='PER-DEPT-ADMIN';

function list(){return PERSONAS.slice();}
function byId(id){return byPersona.get(id)||null;}
function roles(){return ROLES.slice();}
function role(id){return byRole.get(id)||null;}
function defaultFor(roleId){
  const bound=PERSONAS.filter(p=>p.roleId===roleId&&p.rangeStatus==='bound');
  if(bound.length)return bound[0].id;
  const any=PERSONAS.filter(p=>p.roleId===roleId);
  return any.length?any[0].id:DEFAULT_PERSONA_ID;
}
function capabilities(personaId){
  const p=byPersona.get(personaId);
  if(!p)return {normal:[],demo:[],demoPack:null};
  const normal=p.roleId==='R3'?['account.create','account.update','account.'+'reset','plan.write']:[];
  const demo=p.demoPack?(DEMO_PACKS[p.demoPack]||[]).slice():[];
  return {normal:normal,demo:demo,demoPack:p.demoPack||null};
}
function demoCapabilityOptions(){
  return Object.keys(DEMO_PACKS).map(k=>({pack:k,caps:DEMO_PACKS[k].slice()}));
}
function personaForRole(roleId){return PERSONAS.filter(p=>p.roleId===roleId).map(p=>p.id);}

return Object.freeze({
  NOTICE:DEMO_NOTICE,DEFAULT_PERSONA_ID:DEFAULT_PERSONA_ID,
  ROLES:ROLES,PERSONAS:PERSONAS,DEMO_PACKS:DEMO_PACKS,
  list:list,byId:byId,roles:roles,role:role,defaultFor:defaultFor,capabilities:capabilities,
  demoCapabilityOptions:demoCapabilityOptions,personaForRole:personaForRole
});
})();
