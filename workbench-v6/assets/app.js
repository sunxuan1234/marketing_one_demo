/* V5应用：身份范围守卫、显式查询与本页导航；不再用通用预览伪装功能实现。 */
(()=>{
 const D=WB_DATA,C=WB_CATALOG,E=WB.engine,V=WBViews,esc=E.esc;
 const App=window.WBApp={modules:C.modules,current:'home',started:false};let appliedHash='';let lastScopeVersion=null;let identityUnsubscribe=null;
 const desc={home:'集团五指标总览 · 分公司分区地图 · 点击下钻',drill:'九组指标分析下钻：售水量 / 注册用户 / 产销差率 / 单价 / 收费率 / 表务督查 / 数据预警异常 / 工程项目督查 / 应收账款',dma:'分区计量、总分表关系与采集数据',forecast:'售水量预测下钻到线路',work:'工单预警与督查',data:'数据源、同步批次与基础信息异常',report:'业务报表目录与月报十八章导出',auth:'组织架构、账号、角色与数据权限',set:'参数配置、指标口径、计划值与操作日志'};
 const dimensions=['company','org','admin','nature','industry','caliberMm','meterType','team','line'];
 const fields={company:'经营单位',org:'组织节点',admin:'行政区',nature:'用水性质',industry:'所属行业',caliberMm:'水表口径',meterType:'水表类型'};
 /* 每页自声明本页查询条件：无则不渲染（首页/用户查询各有自有工具条） */
 const pageFields={
  home:{dims:['company','admin','org'],time:false},
  drill:{dims:['company','org','admin','nature','industry','caliberMm','meterType'],time:true},
  dma:{dims:['company','period'],time:true},
  forecast:{dims:['company','period'],time:true},
  work:{dims:['company','period'],time:true},
  data:{dims:['company'],time:false},
  report:{dims:[],time:false},
  auth:{dims:[],time:false},
  set:{dims:[],time:false}
 };
 const pageConf=id=>pageFields[id]||{dims:[],time:false};
 const allowedDims=id=>pageConf(id).dims.filter(k=>k!=='period');
 const hasTime=id=>pageConf(id).time;
 const queryKeys=id=>allowedDims(id);
 const temporal=id=>hasTime(id);
const allowed=new Set([...dimensions,'period','caliber','month','start','end','metric','report','tab','function','functional','booklet','orgNodeId','unitId','accountId','card','userId','name','group','item','dim','view','compare','frame','reportMode','g2','i2','d2','group2','item2','dim2','view2']);
const scopeOnlyKeys=['company','org','admin','functional','booklet','nature','industry','meterType','team','line','name','accountId','card','userId','orgNodeId','unitId'];
 const module=id=>C.modules.find(m=>m.id===id)||C.modules[0];
 const access=()=>window.WBAccess||null;
 const scopeUsers=()=>{const A=access();const rows=Array.isArray(D.users)?D.users:[];if(E&&typeof E.scopedRows==='function'){try{const scoped=E.scopedRows('users');if(Array.isArray(scoped))return scoped;}catch(_){}}if(!A||typeof A.scopeRows!=='function')return rows;try{const scoped=A.scopeRows(rows);return Array.isArray(scoped)?scoped:[];}catch(_){return[];}};
 const scopeVersion=()=>{const A=access();try{return A&&A.current?Number(A.current().scopeVersion)||0:0;}catch(_){return 0;}};
 const uniq=values=>[...new Set(values.filter(v=>v!=null&&v!=='').map(String))].sort((a,b)=>a.localeCompare(b,'zh-CN'));

 /* —— 身份范围守卫：只校验“显式跨范围深链”，页面内查询只能从范围内选项收窄 —— */
 function scopeOf(){const A=access();try{return (A&&A.current&&(A.current().scope||null))||null;}catch(_){return null;}}
 function scopeNodeSet(){const s=scopeOf();const v=s&&s.nodeIds;return v instanceof Set?v:new Set(v||[]);}
 function scopeFullUnits(){const s=scopeOf();const v=s&&s.fullUnits;return v instanceof Set?new Set([...v].map(String)):new Set([...(v||[])].map(String));}
 function scopeAccountSet(){const s=scopeOf();const v=s&&s.accountIds;return v instanceof Set?v:new Set((v||[]).map(String));}
 const ownsNode=nodeId=>{const A=access();if(!A||typeof A.owns!=='function')return false;try{return A.owns(String(nodeId))===true;}catch(_){return false;}};
 const unbound=()=>{const s=scopeOf();return !!(s&&s.unbound);};
 function assertScopeParam(key,value){
  const A=access();if(!A)return {allowed:true};
  if(value==null||value==='')return {allowed:true};
  const emptyRange={allowed:false,reason:'当前身份未绑定责任范围',value};
  if(key==='orgNodeId'){
   if(ownsNode(value))return {allowed:true};
   return unbound()?emptyRange:{allowed:false,reason:'组织节点不在责任范围',value};
  }
  if(key==='company'||key==='unitId'){
   const unit=key==='company'?D.companies.find(c=>c.name===value):D.companies.find(c=>String(c.id)===String(value));
   if(!unit)return {allowed:false,reason:'未知经营单位',value};
   if(scopeFullUnits().has(String(unit.id)))return {allowed:true};
   return unbound()?emptyRange:{allowed:false,reason:'经营单位不在责任范围',value};
  }
  if(key==='org'||key==='team'||key==='line'){
   const org=window.WBOrg;if(!org||!Array.isArray(org.nodes))return {allowed:false,reason:'组织树未加载',value};
   /* 规范节点 ID 优先：只有授权树内（非候选）节点才被识别为已知节点。 */
   if(typeof org.has==='function'&&org.has(value)){
     if(ownsNode(value))return {allowed:true};
     return unbound()?emptyRange:{allowed:false,reason:'组织节点不在责任范围',value};
   }
   /* 兼容旧的中文名称参数：只在授权树里按名称匹配，优先取与该参数层级一致的类型；
      任一匹配节点在当前范围内即允许，不会因外单位/同名候选排在前而误拒，也不会把候选引入授权。 */
   const typeByKey={org:'office',team:'team',line:'line'};
   const type=typeByKey[key];
   const same=org.nodes.filter(n=>n.name===value&&(!type||n.type===type));
   const pool=same.length?same:org.nodes.filter(n=>n.name===value);
   if(pool.some(n=>ownsNode(n.id)))return {allowed:true};
   return unbound()?emptyRange:{allowed:false,reason:'组织节点不在责任范围',value};
  }
  if(key==='accountId'||key==='userId'){
   if(scopeAccountSet().has(String(value)))return {allowed:true};
   return unbound()?emptyRange:{allowed:false,reason:'该账户不在责任范围',value};
  }
  if(key==='card'){
   const user=(D.users||[]).find(u=>u.unified_code===value||u.card_no===value);
   if(user&&scopeAccountSet().has(String(user.unified_code)))return {allowed:true};
   return unbound()?emptyRange:{allowed:false,reason:'该表卡不在责任范围',value};
  }
  return {allowed:true};
 }
 function scopeGuard(params){
  const A=access();if(!A)return {denied:false};
  for(const key of ['orgNodeId','unitId','company','org','team','line','accountId','userId','card']){
   const value=params&&params[key];
   if(value==null||value==='')continue;
   const verdict=assertScopeParam(key,value);
   if(!verdict.allowed)return {denied:true,key,value,reason:verdict.reason,nodeId:params.orgNodeId||params.org||params.line||''};
  }
  return {denied:false};
 }
 App.scopeGuard=scopeGuard;
 function currentScopeLabel(){
  const A=access();try{const c=A&&A.current?A.current():{};return c.scopeLabel||c.bindingLabel||'（未绑定责任范围）';}catch(_){return '（未绑定责任范围）';}
 }
 function refusalHtml(guard){
  const A=access();const current=A&&A.current?A.current():{};
  const target=guard.nodeId||guard.value;
  return `<section class="access-state is-denied" role="alert">`+
   `<div class="access-state-icon">${WB.shell.icon('shield')}</div>`+
   `<h1 class="access-state-title">该节点不在当前责任范围，未加载其数据。</h1>`+
   `<p class="access-state-desc">请求的节点：<code>${esc(target)}</code>（${esc(guard.reason||'范围外')}）。地址栏保留原始请求，不静默改写为其他单位数据。</p>`+
   `<p class="access-state-scope">当前范围：${esc(currentScopeLabel())}</p>`+
   `<dl class="access-state-meta"><div><dt>登录身份</dt><dd>${esc(current.label||'演示身份')}</dd></div><div><dt>业务角色</dt><dd>${esc(current.roleLabel||'')}</dd></div><div><dt>范围依据</dt><dd>${esc((current.rangeStatus==='bound'||current.rangeStatus==='demo')?'C / E 演示绑定':'P 未绑定')}</dd></div><div><dt>scopeVersion</dt><dd>${esc(String(current.scopeVersion==null?0:current.scopeVersion))}</dd></div></dl>`+
   `<div class="access-state-actions"><button type="button" class="btn primary" data-return-home>返回我的首页</button></div>`+
   `<p class="access-state-note">范围外单位只保留轮廓与标签，不展示任何数值；不聚合“其他单位”。</p></section>`;
 }
 App.refuse=params=>{const guard=scopeGuard(params);if(guard.denied)renderRefusal(guard);return guard.denied;};
 let refusalLogged='';
 /* 越界请求落一条拒绝审计（只记参数名与原因，不记录范围外的具体取值）。 */
 function logRefusal(guard){
  const key=guard.key+'|'+guard.reason+'|'+scopeVersion();
  if(key===refusalLogged)return;refusalLogged=key;
  if(E&&typeof E.logEvent==='function')E.logEvent('deny','越界访问（'+(guard.key||'组织节点')+'）',false,guard.reason||'超出当前身份数据范围',{rows:null});
 }
 function renderRefusal(guard){
  const page=document.getElementById('page');
  /* 拒绝态与正常渲染一样清空上一模块的图表、导出快照与弹层，避免遗留回调/全局导出。 */
  if(E&&typeof E.clearCharts==='function')E.clearCharts();
  WB.currentTable={headers:[],rows:[],sourceRows:null,scopeVersion:null};
  WB.shell.closeLayers();
  /* 下钻共享条件 host 可能已在 #page 内的槽位中；清空页面前先收回 #main，避免拒绝态把 host 一并销毁。 */
  const g=document.getElementById('globalFilters'),m=document.getElementById('main');if(g&&g.parentElement!==m)m.insertBefore(g,page);
  document.getElementById('globalFilters').innerHTML='';
  page.innerHTML=refusalHtml(guard);
  const back=page.querySelector('[data-return-home]');if(back)back.onclick=()=>App.navigate('home');
  document.title=`范围限制｜营销一体化V5`;
  WB.shell.announce('该节点不在当前责任范围，未加载其数据');
  logRefusal(guard);
 }
 function parse(){const [rawId,q='']=(location.hash||'#/home').replace(/^#\/?/,'').split('?');const params=new URLSearchParams(q);return{id:C.modules.some(m=>m.id===rawId)?rawId:'home',q:params};}
 App.navigate=(id,params={})=>{id=module(id).id;const guard=scopeGuard(params);const q=new URLSearchParams();if(!guard.denied)scopeOnlyKeys.forEach(k=>{if(!(k in params))WB.state[k]='';});for(const[k,v]of Object.entries(params)){if(allowed.has(k)){if(!guard.denied&&!scopeOnlyKeys.includes(k)||!guard.denied&&assertScopeParam(k,v).allowed)WB.state[k]=v;if(v!==''&&v!=null)q.set(k,String(v));}}const target='#/'+id+(q.size?'?'+q:'');if(location.hash===target)render(false);else location.hash=target;};
 const pageRisks={home:['L2','产销差率分母依赖供水量填报；分公司边界为示意，行政区映射待核'],drill:['L2','下钻层级按组织与映射口径计算；缺数不按0处理；牟新/西区水务未接入'],auth:['L1','账号与权限为纯内存演示，不对接源账号'],set:['L1','计划值与参数仅演示，不写入本地存储']};
 const riskBadge=id=>{const item=pageRisks[id];return item?`<span class="v4-risk" data-tip="${item[1]}" title="${item[1]}">⚠ ${item[0]}</span>`:'';};
 function homeLevel(){const c=WB.state.company;if(c)return c;const a=WB.state.admin&&D.adminRegions.find(r=>r.code===WB.state.admin);return a?a.name:'全部经营单位';}
 function heading(m){return `<header class="page-heading product-page-heading"><div class="page-heading-copy"><div class="breadcrumb"><span>营销一体化</span><span class="breadcrumb-separator">/</span><span>${esc(m.name)}</span>${m.id==='home'?`<span class="breadcrumb-separator">/</span><span>${esc(homeLevel())}</span>`:''}</div><div class="page-title-row"><h1 class="page-title">${esc(m.name)}</h1><span class="environment-badge"><i></i>演示数据</span>${riskBadge(m.id)}</div><p class="page-description">${desc[m.id]}</p></div><div class="page-heading-side"><div class="page-data-meta"><span>数据日期</span><strong>${esc(D.asOf)}</strong></div><div class="page-actions"><button type="button" class="btn" id="moduleSearch">${WB.shell.icon('search')}<span>搜索页面与报表</span></button></div></div></header>`;}
 function options(values,current){return values.map(x=>{const value=typeof x==='object'?x.value:x,label=typeof x==='object'?x.label:x;return`<option value="${esc(value)}" ${String(value)===String(current)?'selected':''}>${esc(label)}</option>`;}).join('');}
 function scopedValues(key,pool){
  if(key==='company'){const present=new Set(pool.map(u=>u.company));return D.companies.filter(c=>present.has(c.name)).map(c=>c.name);}
  if(key==='admin'){const present=new Set(pool.map(u=>u.adminCode));return D.adminRegions.filter(r=>present.has(r.code)).map(r=>({value:r.code,label:r.name}));}
  if(key==='org')return uniq(pool.map(u=>u.org));
  if(key==='nature')return uniq(pool.map(u=>u.nature));
  if(key==='industry')return uniq(pool.map(u=>u.industry));
  if(key==='caliberMm')return uniq(pool.map(u=>u.caliber));
  if(key==='meterType')return uniq(pool.map(u=>u.meterType));
  return [];
 }
 function queryPanel(){
  const host=document.getElementById('globalFilters'),drill=App.current==='drill';
  host.classList.toggle('an6-shared-host',drill);
  if(App.current==='home'||(!queryKeys(App.current).length&&!temporal(App.current))){host.innerHTML='';return;}
  WB.ui=WB.ui||{};const s=WB.state,keys=queryKeys(App.current),time=temporal(App.current);
  const pool=scopeUsers(),usesCompany=keys.includes('company')||keys.includes('org');
  const companyPool=s.company?pool.filter(u=>u.company===s.company):pool;
  const values={company:scopedValues('company',pool),org:scopedValues('org',companyPool),admin:scopedValues('admin',pool),nature:scopedValues('nature',pool),industry:scopedValues('industry',pool),caliberMm:scopedValues('caliberMm',pool),meterType:scopedValues('meterType',pool)};
  const fieldCls=drill?'an6-shared-field':'field query-field';
  const select=(key,list,placeholder)=>`<label class="${fieldCls}"><span>${fields[key]||key}</span><select id="f-${key}" class="control" data-filter="${key}">${placeholder?`<option value="">${placeholder}</option>`:''}${options(list,s[key])}</select></label>`;
  const timeFields=time?`<label class="${fieldCls}"><span>统计时段</span><select id="f-period" data-filter="period" class="control">${options(['当月','年内累计','近5年','近10年','自定义'],s.period)}</select></label><label class="${fieldCls}"><span>截至月份</span><input id="f-month" data-filter="month" class="control" type="month" min="2017-01" max="2026-10" value="${esc(s.month)}"></label><label class="${fieldCls}" ${s.period==='自定义'?'':'hidden'} id="queryStartField"><span>开始月份</span><input id="f-start" data-filter="start" class="control" type="month" min="2017-01" max="2026-10" value="${esc(s.start)}"></label>`:'';
  const chipCls=drill?'active-filter-chip an6-shared-chip':'active-filter-chip';
  const chips=keys.filter(k=>s[k]).map(k=>`<span class="${chipCls}"><span>${fields[k]}：${esc(k==='admin'?D.adminRegions.find(r=>r.code===s[k])?.name:s[k])}</span><button type="button" data-clear-filter="${k}" aria-label="清除${fields[k]}">×</button></span>`).join('');
  let html;
  if(drill){
   const expanded=!!WB.ui.drillQueryExpanded,compare=s.compare==='1'||s.compare===true;
   html=`<section class="an6-shared-query" aria-label="共同条件"><div class="an6-shared-main"><span class="an6-shared-label">${WB.shell.icon('filter')}<span class="an6-shared-label-copy"><strong>共同条件</strong><span class="an6-shared-sub">${compare?'共同作用于两个分析框':'当前分析范围'}</span></span></span>${timeFields}<div class="an6-shared-chips" id="sharedFilterChips" ${expanded||!chips?'hidden':''}>${chips}</div><div class="an6-shared-actions"><button type="button" class="btn text-btn an6-shared-advanced-toggle" id="toggleSharedQuery" aria-expanded="${expanded}" aria-controls="sharedAdvancedFilters">${expanded?'收起筛选':'筛选条件'}</button><button type="button" class="btn text-btn" id="resetFilters">重置</button><button type="button" class="btn primary" id="applyFilters">查询</button></div></div><div class="an6-shared-advanced" id="sharedAdvancedFilters" ${expanded?'':'hidden'}><div class="filter-grid query-grid">${keys.map(k=>select(k,values[k],'全部')).join('')}</div></div></section>`;
  }else{
   const primary=keys.slice(0,time?3:4),advanced=keys.slice(primary.length);
   html=`<section class="query-panel card ${WB.ui.queryCollapsed?'is-collapsed':''}"><div class="query-panel-head"><div class="query-panel-title">${WB.shell.icon('filter')}<div><h2>查询条件</h2><span class="query-panel-sub">本页查询只能在责任范围内缩小</span></div></div><button type="button" class="btn text-btn" id="toggleQueryPanel" aria-expanded="${!WB.ui.queryCollapsed}">${WB.ui.queryCollapsed?'展开条件':'收起条件'}</button></div><div class="query-panel-content" ${WB.ui.queryCollapsed?'hidden':''}><div class="query-fields"><div class="filter-grid query-grid">${timeFields}${primary.map(k=>select(k,values[k],'全部')).join('')}</div>${advanced.length?`<div class="filter-grid query-grid advanced-filters" id="advancedFilters" ${WB.ui.advancedFilters?'':'hidden'}>${advanced.map(k=>select(k,values[k],'全部')).join('')}</div>`:''}</div><div class="query-panel-footer"><div class="active-filter-wrap"><span class="active-filter-label">已选条件</span><div class="active-filter-list">${chips||'<span class="muted">未限定</span>'}</div></div><div class="query-actions">${advanced.length?`<button type="button" class="btn text-btn" id="advancedFilter">${WB.ui.advancedFilters?'收起更多':'更多条件'}</button>`:''}<button type="button" class="btn" id="resetFilters">重置</button><button type="button" class="btn primary" id="applyFilters">查询</button></div></div></div></section>`;
  }
  host.innerHTML=html;
  if(drill){
   document.getElementById('toggleSharedQuery').onclick=()=>{WB.ui.drillQueryExpanded=!WB.ui.drillQueryExpanded;const open=WB.ui.drillQueryExpanded;document.getElementById('sharedAdvancedFilters').hidden=!open;const btn=document.getElementById('toggleSharedQuery');btn.setAttribute('aria-expanded',String(open));btn.textContent=open?'收起筛选':'筛选条件';const chipsEl=document.getElementById('sharedFilterChips');if(chipsEl)chipsEl.hidden=open||!chipsEl.innerHTML.trim();};
  }else{
   document.getElementById('toggleQueryPanel').onclick=()=>{WB.ui.queryCollapsed=!WB.ui.queryCollapsed;queryPanel();};
   document.getElementById('advancedFilter')?.addEventListener('click',()=>{WB.ui.advancedFilters=!WB.ui.advancedFilters;document.getElementById('advancedFilters').hidden=!WB.ui.advancedFilters;document.getElementById('advancedFilter').textContent=WB.ui.advancedFilters?'收起更多':'更多条件';});
  }
  document.getElementById('f-period')?.addEventListener('change',e=>document.getElementById('queryStartField').hidden=e.target.value!=='自定义');
  document.getElementById('f-company')?.addEventListener('change',e=>{const el=document.getElementById('f-org');if(el){const p=e.target.value?pool.filter(u=>u.company===e.target.value):pool;el.innerHTML='<option value="">全部</option>'+options(scopedValues('org',p),'');}});
  const commitFilters=()=>{const staged=Object.fromEntries([...host.querySelectorAll('[data-filter]')].map(el=>[el.dataset.filter,el.value]));if(staged.period==='自定义'&&staged.start>staged.month)return WB.shell.toast('开始月份不能晚于截至月份');Object.assign(WB.state,staged);WB.state.end=WB.state.month;render(false);};
  document.getElementById('applyFilters').onclick=commitFilters;
  if(drill)host.querySelectorAll('[data-filter]').forEach(el=>el.addEventListener('change',commitFilters));
  document.getElementById('resetFilters').onclick=()=>{Object.assign(WB.state,{period:'年内累计',month:'2026-10',end:'2026-10',start:'2026-01',company:'',org:'',admin:'',nature:'',industry:'',caliberMm:'',meterType:'',functional:'',layer:'SOURCE'});render(false);};
  host.querySelectorAll('[data-clear-filter]').forEach(b=>b.onclick=()=>{WB.state[b.dataset.clearFilter]='';if(b.dataset.clearFilter==='company')WB.state.org='';render(false);});
 }
 App.openSearch=()=>WB.shell.openSearch();App.openCatalog=App.openSearch;
 App.openFunction=id=>{const f=C.functions.find(f=>f.id===id);if(f?.route)App.navigate(f.route,f.params||{});else WB.shell.toast('此项暂无独立页面');};
 App.apply=()=>render(false);App.render=render;
 /* 身份切换协调：保留时间/口径/指标/报表分类/当前模块，清空可能越界的筛选、分页、选择、弹层与下钻 */
 const PRESERVE_PARAMS=['period','caliber','month','start','end','metric','report','tab','function','group','item','dim','view','compare'];
 function onIdentityChange(snapshot){
  const version=snapshot&&snapshot.scopeVersion!=null?Number(snapshot.scopeVersion):scopeVersion();
  if(lastScopeVersion!==null&&version===lastScopeVersion)return;
  lastScopeVersion=version;
  const parsed=parse(),keep={};
  PRESERVE_PARAMS.forEach(key=>{const value=parsed.q.get(key);if(value!=null&&value!=='')keep[key]=value;});
  if(parsed.id==='drill'){
   const org=parsed.q.get('orgNodeId');
   if(org&&assertScopeParam('orgNodeId',org).allowed)keep.orgNodeId=org;
  }
  scopeOnlyKeys.forEach(key=>{WB.state[key]='';});
  WB.currentTable={headers:[],rows:[]};
  WB.shell.closeLayers();
  const downgraded=parsed.id==='drill'&&!keep.orgNodeId;
  App.navigate(downgraded?'home':parsed.id,keep);
  WB.shell.announce(downgraded?'原下钻节点已不在新的责任范围内，已返回首页并重绘':'已按新的责任范围重绘当前页面');
 }
 function render(scroll=true){
  const parsed=parse(),changed=appliedHash!==location.hash;App.current=parsed.id;
  if(parsed.q.has('persona')||parsed.q.has('role')){
   const clean=new URLSearchParams(parsed.q);clean.delete('persona');clean.delete('role');
   history.replaceState(null,'','#/'+parsed.id+(clean.size?'?'+clean.toString():''));
   WB.shell.toast('身份只能通过账号面板切换，URL 不接受 persona/role', 'warning');
   return render(scroll);
  }
  const params=Object.fromEntries(parsed.q.entries());
  const guard=scopeGuard(params);
  if(guard.denied){appliedHash=location.hash;WB.shell.setActiveNav(App.current);renderRefusal(guard);WB.shell.refreshIcons();if(scroll)window.scrollTo({top:0,behavior:'instant'});return;}
  if(changed){
   /* URL 初始化/清理只在真正发生 hash 导航时执行；同模块的查询应用（#applyFilters→render(false)）不得重置查询。 */
   if(parsed.id==='home'||parsed.id==='drill'){
     if(!parsed.q.has('company')&&!parsed.q.has('admin')){WB.state.company='';WB.state.admin='';WB.state.org='';WB.state.team='';WB.state.line='';}
     else if(parsed.id==='drill'){
       if(!parsed.q.has('company')){WB.state.company='';WB.state.org='';WB.state.team='';WB.state.line='';}
       if(!parsed.q.has('org')){WB.state.org='';WB.state.team='';WB.state.line='';}
       if(!parsed.q.has('team')){WB.state.team='';WB.state.line='';}
       if(!parsed.q.has('line')){WB.state.line='';}
     }
   }
   parsed.q.forEach((v,k)=>{if(allowed.has(k))WB.state[k]=v;});appliedHash=location.hash;
   WB.state.functional=parsed.q.get('functional')||'';WB.state.booklet=parsed.q.get('booklet')||'';
  }WB.state.layer='SOURCE';const valid=queryKeys(App.current);dimensions.filter(k=>!valid.includes(k)&&!['team','line'].includes(k)).forEach(k=>WB.state[k]='');
  E.clearCharts();WB.currentTable={headers:[],rows:[]};WB.shell.closeLayers();const page=document.getElementById('page'),global=document.getElementById('globalFilters'),main=document.getElementById('main');const summary=document.getElementById('scopeSummary');if(summary&&main.firstElementChild!==summary)main.insertBefore(summary,main.firstElementChild);if(global.parentElement!==main||global.nextElementSibling!==page)main.insertBefore(global,page);queryPanel();WB.shell.setActiveNav(App.current);document.title=`${module(App.current).name}｜营销一体化V6`;
  try{page.innerHTML='';let result;switch(App.current){case'home':result=WBHome.renderHome();break;case'drill':result=window.WBAnalysis?WBAnalysis.render():WBHome.renderDrill();break;default:result=V['render'+({dma:'Dma',forecast:'Forecast',work:'Work',data:'Data',report:'Report',auth:'Auth',set:'Set'}[App.current])]();}
   if(typeof result==='string')result={html:result};if(result&&result.html!==undefined)page.innerHTML=result.html;if(!page.querySelector('.page-heading'))page.insertAdjacentHTML('afterbegin',heading(module(App.current)));if(App.current==='drill'){const sharedSlot=page.querySelector('[data-an6-shared-filters]');if(sharedSlot)sharedSlot.appendChild(global);}if(result&&typeof result.mount==='function')result.mount();const moduleSearchButton=document.getElementById('moduleSearch');if(moduleSearchButton)moduleSearchButton.onclick=App.openSearch;WB.shell.refreshIcons();const scopeHomeButton=page.querySelector('[data-return-home]');if(scopeHomeButton)scopeHomeButton.onclick=()=>App.navigate('home');if(scroll)window.scrollTo({top:0,behavior:'instant'});
   const report=changed&&parsed.q.get('report');if(report)document.querySelector(`[data-preview-report="${CSS.escape(report)}"]`)?.click();
  }catch(error){console.error('页面加载失败',App.current,error);page.insertAdjacentHTML('beforeend',`<div class="notice danger">页面加载失败：${esc(error.message)}</div>`);}
 }
 /* 导出守卫：本轮范围版本随表带上，跨版本或范围外行由 engine.exportGuard 拒绝 */
 document.addEventListener('click',event=>{const b=event.target.closest('[data-export-current]');if(!b)return;const t=WB.currentTable;if(!t||!t.headers||!t.headers.length||!t.rows||!t.rows.length)return WB.shell.toast('暂无可导出数据');
  const version=scopeVersion();
  const refuseExport=reason=>{if(E&&typeof E.logEvent==='function')E.logEvent('export',module(App.current).name+' 表格',false,reason,{rows:0});WB.shell.toast(reason,'warning');};
  if(t.scopeVersion==null)return refuseExport('该表未标注授权范围，已拒绝导出');
  if(Number(t.scopeVersion)!==version)return refuseExport('数据范围已变更，请重新生成后再导出');
  const rows=t.rows.map(row=>row.map(cell=>typeof cell==='string'?cell.replace(/<[^>]*>/g,''):cell));
  const sourceRows=t.sourceRows||null;
  const meta=typeof E.bindExport==='function'?E.bindExport(rows,sourceRows):{scopeVersion:t.scopeVersion,sourceRows,kind:'table'};
  meta.period=WB.state.period;meta.filters=WB.shell.currentFilters();
  E.downloadCSV(`${module(App.current).name}_${WB.state.month||D.asOf.slice(0,7)}.csv`,t.headers,rows,meta);});
 App.coverage=()=>({modules:C.modules.length,reports:C.reports.length,charts:E.charts.size,current:App.current,facts:D.facts.length,frozen:D.isSourceFrozen});
 function start(){if(App.started)return;App.started=true;WB.shell.init({modules:C.modules,activeModule:parse().id,onNavigate:App.navigate});
 lastScopeVersion=scopeVersion();
 const A=access();if(A&&typeof A.onChange==='function')identityUnsubscribe=A.onChange(onIdentityChange);
 render(false);addEventListener('hashchange',()=>render());window.__WB_READY__=true;}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
