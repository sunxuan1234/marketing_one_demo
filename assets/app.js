/* V3应用：实际页面导航与显式查询；不再用通用预览伪装功能实现。 */
(()=>{
 const D=WB_DATA,C=WB_CATALOG,E=WB.engine,V=WBViews,esc=E.esc;
 const App=window.WBApp={modules:C.modules,current:'home',started:false};let appliedHash='';
 const desc={home:'集团五指标总览 · 分公司分区地图 · 点击下钻',drill:'分公司/组织层级指标详情与维度分析',user:'组合查询用户信息与用水记录',meter:'水表台账、换表、仓库与抄表记录',alert:'业务异常分类查询与明细核查',project:'工程节点与立户状态查询',ar:'应收实收、欠费与账务记录查询',dma:'分区计量、总分表关系与采集数据',forecast:'指标历史与预测结果查询',work:'源工单状态与办理记录查询',data:'数据源、同步批次与基础信息异常',report:'业务报表目录与生成统计',auth:'组织架构、账号、角色与数据权限',set:'参数配置、指标口径、计划值与操作日志'};
 const dimensions=['company','org','admin','nature','industry','caliberMm','meterType','team','line'];
 const fields={company:'经营单位',org:'组织节点',admin:'行政区',nature:'用水性质',industry:'所属行业',caliberMm:'水表口径',meterType:'水表类型'};
 /* 每页自声明本页查询条件：无则不渲染（首页/用户查询各有自有工具条） */
 const pageFields={
  home:{dims:['company','admin','org'],time:false},
  drill:{dims:['company','org','admin'],time:true},
  user:{dims:[],time:false},
  meter:{dims:['company','org','meterType','caliberMm'],time:true},
  alert:{dims:['company','period'],time:true},
  project:{dims:['company','org'],time:false},
  ar:{dims:['company','nature','period'],time:true},
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
 const allowed=new Set([...dimensions,'period','caliber','month','start','end','metric','report','tab','function']);
 const module=id=>C.modules.find(m=>m.id===id)||C.modules[0];
 function parse(){const [rawId,q='']=(location.hash||'#/home').replace(/^#\/?/,'').split('?');const id=rawId==='kpi'?'home':rawId;return{id:C.modules.some(m=>m.id===id)?id:'home',q:new URLSearchParams(q)};}
 App.navigate=(id,params={})=>{id=module(id).id;const q=new URLSearchParams();for(const[k,v]of Object.entries(params)){if(allowed.has(k)){WB.state[k]=v;if(v!==''&&v!=null)q.set(k,String(v));}}const target='#/'+id+(q.size?'?'+q:'');if(location.hash===target)render(false);else location.hash=target;};
 const pageRisks={home:['L2','产销差率分母依赖供水量填报；分公司边界为示意，行政区映射待核'],drill:['L2','下钻层级按组织与映射口径计算；缺数不按0处理'],user:['L2','新增户窗口与立户日期口径待业务签认'],auth:['L1','账号与权限为纯内存演示，不对接源账号'],set:['L1','计划值与参数仅演示，不写入本地存储']};
 const riskBadge=id=>{const item=pageRisks[id];return item?`<span class="v4-risk" data-tip="${item[1]}" title="${item[1]}">⚠ ${item[0]}</span>`:'';};
 function homeLevel(){const c=WB.state.company;if(c)return c;const a=WB.state.admin&&D.adminRegions.find(r=>r.code===WB.state.admin);return a?a.name:'全部经营单位';}
 function heading(m){return `<header class="page-heading product-page-heading"><div class="page-heading-copy"><div class="breadcrumb"><span>营销一体化</span><span class="breadcrumb-separator">/</span><span>${esc(m.name)}</span>${m.id==='home'?`<span class="breadcrumb-separator">/</span><span>${esc(homeLevel())}</span>`:''}</div><div class="page-title-row"><h1 class="page-title">${esc(m.name)}</h1><span class="environment-badge"><i></i>演示数据</span>${riskBadge(m.id)}</div><p class="page-description">${desc[m.id]}</p></div><div class="page-heading-side"><div class="page-data-meta"><span>数据日期</span><strong>${esc(D.asOf)}</strong></div><div class="page-actions"><button type="button" class="btn" id="moduleSearch">${WB.shell.icon('search')}<span>搜索页面与报表</span></button></div></div></header>`;}
 function options(values,current){return values.map(x=>{const value=typeof x==='object'?x.value:x,label=typeof x==='object'?x.label:x;return`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(label)}</option>`;}).join('');}
 function queryPanel(){
  if(App.current==='home'||(!queryKeys(App.current).length&&!temporal(App.current))){document.getElementById('globalFilters').innerHTML='';return;}
  WB.ui=WB.ui||{};const s=WB.state,keys=queryKeys(App.current),time=temporal(App.current),allUnits=[...new Set(D.companies.flatMap(c=>c.units))],units=D.companies.find(c=>c.name===s.company)?.units||allUnits;
  const values={company:D.companies.map(c=>c.name),org:units,admin:D.adminRegions.map(r=>({value:r.code,label:r.name})),nature:D.natures,industry:D.industries,caliberMm:D.calibers,meterType:D.meterTypes};
  const select=(key,list,placeholder)=>`<label class="field query-field"><span>${fields[key]||key}</span><select id="f-${key}" class="control" data-filter="${key}">${placeholder?`<option value="">${placeholder}</option>`:''}${options(list,s[key])}</select></label>`;
  const timeFields=time?`<label class="field query-field"><span>统计时段</span><select id="f-period" data-filter="period" class="control">${options(['当月','年内累计','近5年','近10年','自定义'],s.period)}</select></label><label class="field query-field"><span>截至月份</span><input id="f-month" data-filter="month" class="control" type="month" min="2017-01" max="2026-10" value="${esc(s.month)}"></label><label class="field query-field" ${s.period==='自定义'?'':'hidden'} id="queryStartField"><span>开始月份</span><input id="f-start" data-filter="start" class="control" type="month" min="2017-01" max="2026-10" value="${esc(s.start)}"></label>`:'';
  const primary=keys.slice(0,time?3:4),advanced=keys.slice(primary.length),chips=keys.filter(k=>s[k]).map(k=>`<span class="active-filter-chip"><span>${fields[k]}：${esc(k==='admin'?D.adminRegions.find(r=>r.code===s[k])?.name:s[k])}</span><button type="button" data-clear-filter="${k}" aria-label="清除${fields[k]}">×</button></span>`).join('');
  document.getElementById('globalFilters').innerHTML=`<section class="query-panel card ${WB.ui.queryCollapsed?'is-collapsed':''}"><div class="query-panel-head"><div class="query-panel-title">${WB.shell.icon('filter')}<div><h2>查询条件</h2></div></div><button type="button" class="btn text-btn" id="toggleQueryPanel" aria-expanded="${!WB.ui.queryCollapsed}">${WB.ui.queryCollapsed?'展开条件':'收起条件'}</button></div><div class="query-panel-content" ${WB.ui.queryCollapsed?'hidden':''}><div class="query-fields"><div class="filter-grid query-grid">${timeFields}${primary.map(k=>select(k,values[k],'全部')).join('')}</div>${advanced.length?`<div class="filter-grid query-grid advanced-filters" id="advancedFilters" ${WB.ui.advancedFilters?'':'hidden'}>${advanced.map(k=>select(k,values[k],'全部')).join('')}</div>`:''}</div><div class="query-panel-footer"><div class="active-filter-wrap"><span class="active-filter-label">已选条件</span><div class="active-filter-list">${chips||'<span class="muted">未限定</span>'}</div></div><div class="query-actions">${advanced.length?`<button type="button" class="btn text-btn" id="advancedFilter">${WB.ui.advancedFilters?'收起更多':'更多条件'}</button>`:''}<button type="button" class="btn" id="resetFilters">重置</button><button type="button" class="btn primary" id="applyFilters">查询</button></div></div></div></section>`;
  document.getElementById('toggleQueryPanel').onclick=()=>{WB.ui.queryCollapsed=!WB.ui.queryCollapsed;queryPanel();};
  document.getElementById('advancedFilter')?.addEventListener('click',()=>{WB.ui.advancedFilters=!WB.ui.advancedFilters;document.getElementById('advancedFilters').hidden=!WB.ui.advancedFilters;document.getElementById('advancedFilter').textContent=WB.ui.advancedFilters?'收起更多':'更多条件';});
  document.getElementById('f-period')?.addEventListener('change',e=>document.getElementById('queryStartField').hidden=e.target.value!=='自定义');
  document.getElementById('f-company')?.addEventListener('change',e=>{const el=document.getElementById('f-org');if(el)el.innerHTML='<option value="">全部</option>'+options(D.companies.find(c=>c.name===e.target.value)?.units||allUnits,'');});
  document.getElementById('applyFilters').onclick=()=>{const staged=Object.fromEntries([...document.querySelectorAll('[data-filter]')].map(el=>[el.dataset.filter,el.value]));if(staged.period==='自定义'&&staged.start>staged.month)return WB.shell.toast('开始月份不能晚于截至月份');Object.assign(WB.state,staged);WB.state.end=WB.state.month;render(false);};
  document.getElementById('resetFilters').onclick=()=>{Object.assign(WB.state,{period:'年内累计',month:'2026-10',end:'2026-10',start:'2026-01',company:'',org:'',admin:'',nature:'',industry:'',caliberMm:'',meterType:'',functional:'',layer:'SOURCE'});render(false);};
  document.querySelectorAll('[data-clear-filter]').forEach(b=>b.onclick=()=>{WB.state[b.dataset.clearFilter]='';if(b.dataset.clearFilter==='company')WB.state.org='';render(false);});
 }
 App.openSearch=()=>WB.shell.openSearch();App.openCatalog=App.openSearch;
 App.openFunction=id=>{const f=C.functions.find(f=>f.id===id);if(f?.route)App.navigate(f.route,f.params||{});else WB.shell.toast('此项暂无独立页面');};
 App.apply=()=>render(false);App.render=render;
 function render(scroll=true){const parsed=parse(),changed=appliedHash!==location.hash;App.current=parsed.id; if(parsed.id==='home'||parsed.id==='drill'){
   if(!parsed.q.has('company')&&!parsed.q.has('admin')){WB.state.company='';WB.state.admin='';WB.state.org='';WB.state.team='';WB.state.line='';}
   else if(parsed.id==='drill'){
     if(!parsed.q.has('company')){WB.state.company='';WB.state.org='';WB.state.team='';WB.state.line='';}
     if(!parsed.q.has('org')){WB.state.org='';WB.state.team='';WB.state.line='';}
     if(!parsed.q.has('team')){WB.state.team='';WB.state.line='';}
     if(!parsed.q.has('line')){WB.state.line='';}
   }
  }if(changed){parsed.q.forEach((v,k)=>{if(allowed.has(k))WB.state[k]=v;});appliedHash=location.hash;}WB.state.layer='SOURCE';WB.state.functional='';const valid=queryKeys(App.current);dimensions.filter(k=>!valid.includes(k)&&!['team','line'].includes(k)).forEach(k=>WB.state[k]='');
  E.clearCharts();WB.currentTable={headers:[],rows:[]};WB.shell.closeLayers();const page=document.getElementById('page'),global=document.getElementById('globalFilters');if(global.parentElement===page)document.getElementById('main').insertBefore(global,page);page.innerHTML=heading(module(App.current));queryPanel();WB.shell.setActiveNav(App.current);document.title=`${module(App.current).name}｜营销一体化V4`;
  try{let result;switch(App.current){case'home':result=WBHome.renderHome();break;case'kpi':result=WBHome.renderKpi();break;case'drill':result=WBHome.renderDrill();break;case'user':result=WBBusiness.renderUser();break;case'meter':result=WBBusiness.renderMeter();break;case'alert':result=WBBusiness.renderAlert();break;case'project':result=WBBusiness.renderProject();break;default:result=V['render'+({ar:'Ar',dma:'Dma',forecast:'Forecast',work:'Work',data:'Data',report:'Report',auth:'Auth',set:'Set'}[App.current])]();}
   if(typeof result==='string')result={html:result};if(result?.html!==undefined)page.innerHTML=(App.current==='drill'?'':heading(module(App.current)))+result.html;page.querySelector('.page-heading').after(global);result?.mount?.();const moduleSearchButton=document.getElementById('moduleSearch');if(moduleSearchButton)moduleSearchButton.onclick=App.openSearch;WB.shell.refreshIcons();if(scroll)window.scrollTo({top:0,behavior:'instant'});
   const report=changed&&parsed.q.get('report');if(report)document.querySelector(`[data-preview-report="${CSS.escape(report)}"]`)?.click();
  }catch(error){console.error('页面加载失败',App.current,error);page.insertAdjacentHTML('beforeend',`<div class="notice danger">页面加载失败：${esc(error.message)}</div>`);}
 }
 document.addEventListener('click',event=>{const b=event.target.closest('[data-export-current]');if(!b)return;const t=WB.currentTable;if(!t?.headers?.length||!t.rows?.length)return WB.shell.toast('暂无可导出数据');E.downloadCSV(`${module(App.current).name}.csv`,t.headers,t.rows.map(r=>r.map(x=>typeof x==='string'?x.replace(/<[^>]*>/g,''):x)));});
 App.coverage=()=>({modules:C.modules.length,reports:C.reports.length,charts:E.charts.size,current:App.current,facts:D.facts.length,frozen:D.isSourceFrozen});
 function start(){if(App.started)return;App.started=true;WB.shell.init({modules:C.modules,activeModule:parse().id,onNavigate:App.navigate});render(false);addEventListener('hashchange',()=>render());window.__WB_READY__=true;}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
