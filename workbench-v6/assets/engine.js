/* 统一Filter、聚合、图表与真实文件导出引擎。禁止静态死图或平均率/均价。 */
window.WB=window.WB||{};
(()=>{
 const D=window.WB_DATA;
 WB.state={period:'年内累计',caliber:'财务自然月',start:'2026-01',end:'2026-10',year:'2026',month:'2026-10',company:'',admin:'',functional:'',org:'',nature:'',industry:'',caliberMm:'',meterType:'',layer:'SOURCE',viewMode:'main',threshold:100,zeroN:3,swapN:2,nightStart:'01:00',nightEnd:'04:00',rateMin:'',rateMax:'',keyword:'',sourceOnly:false};
 WB.chartState={};WB.currentTable={headers:[],rows:[]};WB.revision=0;WB.listeners=new Set();
 const E=WB.engine={charts:new Map(),colors:['#317FC2','#41A75E','#F58B3C','#6C8EBF','#7DB9A0','#E7B75F','#8295C7','#B3A1CE','#75B8D4','#D99694']};
 const sum=(a,k)=>a.reduce((s,x)=>s+(+x[k]||0),0);
 const div=(a,b)=>b>0?a/b:null;
 const round=(n,d=2)=>n==null||!Number.isFinite(n)?null:+n.toFixed(d);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 E.esc=esc;E.sum=sum;E.div=div;E.round=round;E.hash=D.hash;
 E.fmt=(v,d=0)=>v==null||!Number.isFinite(+v)?'—':(+v).toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d});
 // ---- V5 数据范围：范围只由 persona 决定，查询只能求交 ----
 const GLOBAL_DATASETS=new Set(['reportRuns','alertRules','staff','autoRules']);
 const UNIT_DATASETS=new Set(['batches','warehouses','dmaNodes','dmaReadings','dmaBalance']);
 const DATASETS=['users','facts','readings','bills','readTasks','remoteReadings','adjustments','meterInventory','meterEvents','alerts','projects','warehouses','sourceOrders','batches','dmaNodes','dmaReadings','dmaBalance','alertRules','reportRuns','staff','workOrders','autoRules','supplements','forecasts'];
 WB.logs=WB.logs||[];
 E.datasets=()=>DATASETS.slice();
 E.scopeVersion=()=>WBAccess.current().scopeVersion;
 function logEvent(kind,action,ok,reason,extra){
   const p=WBAccess.persona();
   WB.logs.push({ts:Date.now(),kind,action,ok:!!ok,reason:reason||'',persona:p?p.id:'',role:p?p.roleId:'',scopeVersion:E.scopeVersion(),rows:extra&&extra.rows!=null?extra.rows:null});
   if(WB.logs.length>300)WB.logs.shift();
 }
 E.logEvent=logEvent;E.auditLog=()=>WB.logs.slice();
 const scopeCache=new Map(),underCache=new Map();
 function scopeRowsOf(name){
   const list=D[name];
   if(!Array.isArray(list))throw new Error('scopedRows: 未注册数据集 '+name);
   const key=E.scopeVersion()+'|'+name;
   const hit=scopeCache.get(key);if(hit)return hit;
   const p=WBAccess.current();
   let rows;
   if(GLOBAL_DATASETS.has(name))rows=p.scope&&p.scope.unbound?[]:list.slice();
   else if(UNIT_DATASETS.has(name))rows=list.filter(r=>p.scope&&p.scope.fullUnits.has(String(r.unitId)));
   else rows=list.filter(r=>WBAccess.ownsRow(r));
   scopeCache.set(key,rows);
   return rows;
 }
 E.scopedRows=scopeRowsOf;
 E.scopeCacheSize=()=>scopeCache.size;
 E.clearScopeCache=()=>{scopeCache.clear();underCache.clear();};
 E.nodeRows=(name,nodeId)=>{
   const key=E.scopeVersion()+'|'+name+'|'+nodeId;
   const hit=underCache.get(key);if(hit)return hit;
   const ids=WBOrg.has(nodeId)?WBOrg.descendantsSet(nodeId):new Set();
   const rows=scopeRowsOf(name).filter(r=>r.orgNodeId&&ids.has(r.orgNodeId));
   underCache.set(key,rows);return rows;
 };
 E.rowsUnder=E.nodeRows;
 E.ownsRow=r=>WBAccess.ownsRow(r);
 // 明确全局配置：目录/规则定义对所有已绑定身份可读；导出只认当前 scopedRows 里注册的同一对象，杜绝伪造 ownershipLevel:'config'。
 const CONFIG_EXPORT_DATASETS=Object.freeze(['reportRuns','alertRules']);
 const configExportCache={version:null,sets:{}};
 function configExportSet(name){
   const cur=E.scopeVersion();
   if(configExportCache.version!==cur){configExportCache.version=cur;configExportCache.sets={};}
   let set=configExportCache.sets[name];
   if(!set){set=new Set((E.scopedRows(name)||[]).filter(r=>r&&r.ownershipLevel==='config'));configExportCache.sets[name]=set;}
   return set;
 }
 E.exportSourceOwn=row=>{
   if(!row)return false;
   if(WBAccess.ownsRow(row))return true;
   if(row.ownershipLevel!=='config')return false;
   for(const name of CONFIG_EXPORT_DATASETS){if(configExportSet(name).has(row))return true;}
   return false;
 };
 E.CONFIG_EXPORT_DATASETS=CONFIG_EXPORT_DATASETS;
 // 导出守卫：范围版本、来源行归属、表格/图表登记三选一；拒绝不静默。
 const approvedRows=new WeakMap();
 E.bindExport=(rows,sourceRows,extra)=>{
   if(Array.isArray(rows)&&sourceRows)approvedRows.set(rows,{version:E.scopeVersion(),sourceRows:sourceRows.slice()});
   return Object.assign({scopeVersion:E.scopeVersion(),sourceRows:sourceRows||null,kind:'table',at:Date.now()},extra||{});
 };
 // 守卫只信任生成本代的登记与本代范围；拒绝一律留审计。
 E.exportGuard=(rows,meta)=>{
   const m=meta||{},cur=E.scopeVersion();
   const reject=(reason,kind)=>{logEvent('export',kind||m.kind||'rows',false,reason,{rows:Array.isArray(rows)?rows.length:0});return {ok:false,reason:reason};};
   if(!Array.isArray(rows)||!rows.length)return reject('暂无可导出数据');
   if(m.scopeVersion!=null&&+m.scopeVersion!==cur)return reject('数据范围已变更，请重新生成后再导出');
   if(m.sourceRows&&m.sourceRows.length&&!m.sourceRows.every(E.exportSourceOwn))return reject('导出源数据含当前身份范围外数据，已拒绝');
   const stamp=approvedRows.get(rows);
   if(stamp){
     if(stamp.version!==cur||(m.scopeVersion!=null&&+m.scopeVersion!==stamp.version))return reject('导出数据生成于旧数据范围，请重新生成');
     if(stamp.sourceRows&&stamp.sourceRows.length&&!stamp.sourceRows.every(E.exportSourceOwn))return reject('导出数据源含当前身份范围外数据，已拒绝');
     return {ok:true,rows:rows,kind:m.kind||'table'};
   }
   if(rows===WB.currentTable.rows){
     const tv=WB.currentTable.scopeVersion;
     if(tv==null||+tv!==cur||(m.scopeVersion!=null&&+m.scopeVersion!==+tv))return reject('表格数据属于已过期的数据范围，请重新生成后再导出');
     return {ok:true,rows:rows,kind:m.kind||'table'};
   }
   if(m.kind==='chart'&&m.chartId){
     const chart=E.charts.get(m.chartId),cv=chart&&chart.context?chart.context.scopeVersion:null;
     if(!chart||cv==null||+cv!==cur||(m.scopeVersion!=null&&+m.scopeVersion!==+cv))return reject('图表上下文已过期，请刷新后重试','chart');
     return {ok:true,rows:rows,kind:'chart'};
   }
   if(m.scopeVersion!=null&&+m.scopeVersion===cur&&rows.every(E.exportSourceOwn))return {ok:true,rows:rows,kind:m.kind||'rows'};
   return reject('导出行包含当前身份范围外数据，已拒绝');
 };
 // 表格/图表导出元信息必须在生成时捕获范围版本；点击导出时只比较，不重读当前版本。
 E.tableExportMeta=(kind,sourceRows,atVersion,personaId)=>{
   const p=WBAccess.current();
   return {scopeVersion:atVersion!=null?atVersion:p.scopeVersion,personaId:personaId||p.personaId,kind:kind||'table',sourceRows:sourceRows||null,at:Date.now()};
 };
 E.dataQuality=()=>{
   const out={datasets:{},missingOrgNodeId:0,unknownOrgNodeId:0,unitLevel:0,accountLevel:0,checked:0};
   const names=['users','facts','readings','bills','readTasks','remoteReadings','adjustments','meterInventory','meterEvents','alerts','projects','sourceOrders','warehouses','batches','dmaNodes','dmaReadings','dmaBalance','reportRuns','alertRules'];
   for(const name of names){
     const list=WB_DATA[name]||[];let miss=0,unknown=0,unit=0;
     for(const row of list){
       out.checked++;
       if(row.ownershipLevel==='unit'){out.unitLevel++;unit++;}
       else if(row.ownershipLevel==='account')out.accountLevel++;
       if(!row.orgNodeId){miss++;out.missingOrgNodeId++;continue;}
       if(!WBOrg.get(row.orgNodeId)){unknown++;out.unknownOrgNodeId++;}
     }
     out.datasets[name]={rows:list.length,missingOrgNodeId:miss,unknownOrgNodeId:unknown,unitLevel:unit};
   }
   return out;
 };
 E.bindTable=(obj)=>{
   const p=WBAccess.current();
   WB.currentTable={headers:(obj.headers||[]).slice(),rows:obj.rows||[],sourceRows:obj.sourceRows||null,
     scopeVersion:p.scopeVersion,module:obj.module||'',title:obj.title||'',personaId:p.personaId,roleId:p.roleId};
   return WB.currentTable;
 };
 Object.defineProperty(E,'currentTable',{get:()=>WB.currentTable,enumerable:true});
E.periodLabel=f=>{const ps=periods(f),first=ps[0],last=ps[ps.length-1];return `${f.period||'年内累计'} · ${f.caliber||'业务账期'} · ${ps.length?(first===last?first:`${first}—${last}`):'无可用期间'}`;};
 E.filterLabel=(f=WB.state)=>{const p=WBAccess.current(),rl=p['role'+'Label'];return [E.periodLabel(f),(p.displayName||p.label)+'／'+(rl||p.label),p.scopeLabel,f.company||'集团',f.admin?D.adminRegions.find(r=>r.code===f.admin)?.name:'',f.org,f.team,f.line,f.nature,f.industry,f['book'+'let'],f.meterType,'合成样例'].filter(Boolean).join('｜');};
 function periods(f){let end=f.month||f.end||'2026-10',year=+end.slice(0,4);if(f.period==='当月')return[end];if(f.period==='近5年')return D.periods.filter(p=>p>=`${year-4}-01`&&p<=end);if(f.period==='近10年')return D.periods.filter(p=>p>=`${year-9}-01`&&p<=end);if(f.period==='自定义')return D.periods.filter(p=>p>=(f.start||'2026-01')&&p<=end);return D.periods.filter(p=>p>=`${year}-01`&&p<=end);}
 E.periods=periods;
 const FILTER_KEYS=['period','caliber','month','end','start','year','company','admin','functional','org','nature','industry','caliberMm','booklet','meterType','team','line','orgNodeId','unitId'];
 const factCache=new Map();
 const filterSignature=(f,list)=>{let sig=E.scopeVersion()+'|';for(const k of FILTER_KEYS)sig+=String(f[k]??'')+'\u0001';return sig+list.join(',');};
 E.factCacheSize=()=>factCache.size;
 E.clearFactCache=()=>factCache.clear();
 E.filterFacts=(f={})=>{
   const eff={...WB.state,...f};const list=periods(eff);
   const sig=filterSignature(eff,list);const cached=factCache.get(sig);if(cached)return cached;
   const monthMode=eff.caliber==='财务自然月';
   const index=D.factIndex;
   let candidates;
   if(index){
     const source=monthMode?index.byMonth:index.byPeriod;
     candidates=[];const useCompany=eff.company&&source.size&&[...source.values()][0]?.byCompany;
     for(const p of list){
       const bucket=source.get(p);if(!bucket)continue;
       if(useCompany){const rows=bucket.byCompany.get(eff.company);if(rows)candidates.push(...rows);}
       else candidates.push(...bucket.all);
     }
   } else {
     const set=new Set(list);
     candidates=D.facts.filter(x=>set.has(monthMode?x.naturalMonth:x.period));
   }
   // 组织节点查询语义固定为「本节点 + 全部后代」，与授权子集口径一致，不做叶子精确匹配。
   const nodeIds=eff.orgNodeId?(WBOrg.has(eff.orgNodeId)?WBOrg.descendantsSet(eff.orgNodeId):new Set()):null;
   const rows=candidates.filter(x=>(!eff.company||x.company===eff.company)&&(!eff.admin||x.adminCode===eff.admin)&&(!eff.functional||x.functionalZones.includes(eff.functional))&&(!eff.org||x.org===eff.org)&&(!eff.nature||x.nature===eff.nature)&&(!eff.industry||x.industry===eff.industry)&&(!eff.caliberMm||x.caliber===eff.caliberMm)&&(!eff.booklet||x.booklet===eff.booklet)&&(!eff.meterType||x.meterType===eff.meterType)&&(!eff.team||x.team===eff.team)&&(!eff.line||x.line===eff.line)&&(!nodeIds||x.orgNodeId===eff.orgNodeId||nodeIds.has(x.orgNodeId))&&(!eff.unitId||String(x.unitId)===String(eff.unitId))&&WBAccess.ownsRow(x));
   factCache.set(sig,rows);
   if(factCache.size>48){const first=factCache.keys().next().value;factCache.delete(first);}
   return rows;
 };
 // 未签认的实绩补充层不参与V3标准分析。
 E.applyLayer=rows=>rows;
 E.snapshot=rows=>{const map=new Map();for(const x of rows){const key=x.accountId??x.seriesKey??[x.company,x.adminCode,x.org,x.nature,x.industry,x.caliber,x.meterType].join('|');if(!map.has(key)||map.get(key).period<x.period)map.set(key,x);}return [...map.values()];};
 const aggCache=new WeakMap();
 E.aggregate=(rows,f=WB.state)=>{
   const memo=aggCache.get(rows);if(memo)return memo;
   const a={count:rows.filter(x=>x.registered_count||x.sold_vol||x.new_count||x.closed_count).length};
   for(const k of ['sold_vol','supply_vol','plan_vol','receivable_principal','received_principal','water_revenue','water_fee','sewage_fee','other_fee','new_count','closed_count','read_total','estimated_count','remote_total','remote_billed'])a[k]=sum(rows,k);
  /* 自然月新增/注销派生：按 users.regDate/deregisterDate 落在 rows 实际覆盖自然月计数（不改源 facts；纯由 rows 推导，memo 安全）。注销日早于立户日者不计入正常注销。 */
  {const pset=new Set();for(const x of rows)pset.add(x.naturalMonth||x.period);const um=D.userIndex||new Map();const seenN=new Set(),seenC=new Set();let nc=0,cc=0;
   for(const x of rows){const u=um.get(+x.seriesKey);if(!u)continue;
    if(!seenN.has(u.id)){seenN.add(u.id);if(pset.has(String(u.regDate||'').slice(0,7)))nc++;}
    if(!seenC.has(u.id)){seenC.add(u.id);const dm=String(u.deregisterDate||'').slice(0,7);if(dm&&pset.has(dm)&&String(u.deregisterDate)>=String(u.regDate))cc++;}}
   a.new_count=nc;a.closed_count=cc;}
   a.registered_count=sum(E.snapshot(rows),'registered_count');a.supply_vol=rows.length&&rows.every(x=>x.supply_vol!=null)?sum(rows,'supply_vol'):null;
   a.non_registered_count=rows.length&&rows.every(x=>x.non_registered_count!=null)?sum(E.snapshot(rows),'non_registered_count'):null;
   a.previous_sold=rows.length&&rows.every(x=>x.previous_sold!=null)?sum(rows,'previous_sold'):null;
   a.wholesale_vol=rows.some(x=>x.wholesale)?sum(rows.filter(x=>x.wholesale),'sold_vol'):null;
   const ratio=(n,d)=>{const value=div(n,d);return value==null?null:round(value*100);};
   a.loss_rate_pct=a.supply_vol==null?null:ratio(a.supply_vol-a.sold_vol,a.supply_vol);a.charge_rate_pct=ratio(a.received_principal,a.receivable_principal);a.avg_price_yuan=round(div(a.water_revenue,a.sold_vol),3);a.plan_completion_pct=ratio(a.sold_vol,a.plan_vol);a.yoy_growth_pct=a.previous_sold==null?null:ratio(a.sold_vol-a.previous_sold,a.previous_sold);
   a.arrival_rate_pct=null;a.estimate_rate_pct=null;a.remote_bill_rate_pct=null;
   a.sold_wan=round(a.sold_vol/10000);a.arrears_principal=round(a.receivable_principal-a.received_principal);aggCache.set(rows,a);return a;
 };
 const groupCache=new WeakMap();
 E.group=(rows,key,f=WB.state)=>{
   if(typeof key!=='function'){
     let perRows=groupCache.get(rows);if(!perRows){perRows=new Map();groupCache.set(rows,perRows);}
     const cached=perRows.get(String(key));if(cached)return cached.map(item=>({...item}));
     const map=new Map(),layered=E.applyLayer(rows,f);for(const x of layered){let k=x[key];k=k??'未提供';if(!map.has(k))map.set(k,[]);map.get(k).push(x);}
     const result=[...map].map(([name,items])=>({name,...E.aggregate(items,f)})).sort((a,b)=>b.sold_vol-a.sold_vol);
     perRows.set(String(key),result);return result.map(item=>({...item}));
   }
   const map=new Map(),layered=E.applyLayer(rows,f);for(const x of layered){let k=key(x);k=k??'未提供';if(!map.has(k))map.set(k,[]);map.get(k).push(x);}
   return [...map].map(([name,items])=>({name,...E.aggregate(items,f)})).sort((a,b)=>b.sold_vol-a.sold_vol);
 };
 const trendCache=new WeakMap();
 E.trend=(rows,f=WB.state,granularity='month')=>{
   let perRows=trendCache.get(rows);if(!perRows){perRows=new Map();trendCache.set(rows,perRows);}
   const cacheKey=`${granularity}|${f.caliber||''}`;
   const cached=perRows.get(cacheKey);if(cached)return cached.map(item=>({...item}));
   const map=new Map(),layered=E.applyLayer(rows,f);for(const x of layered){const p=f.caliber==='财务自然月'?x.naturalMonth:x.period;let key=p;if(granularity==='quarter')key=p.slice(0,4)+' Q'+Math.ceil(+p.slice(5)/3);if(granularity==='year')key=p.slice(0,4);if(!map.has(key))map.set(key,[]);map.get(key).push(x);}
   const result=[...map].sort((a,b)=>a[0].localeCompare(b[0])).map(([name,items])=>({name,...E.aggregate(items,f)}));
   perRows.set(cacheKey,result);return result.map(item=>({...item}));
 };
 E.dimensionOptions={company:'经营单位',admin:'法定行政区',org:'组织节点',nature:'用水性质',industry:'行业',caliber:'水表口径',meterType:'水表类型',wholesale:'趸售标志',manufacturer:'厂家',status:'状态',type:'类型',severity:'级别'};
 E.metricOptions={sold_vol:'售水量(m³)',supply_vol:'供水量(m³)',registered_count:'注册用户数(户)',new_count:'新增用户(户)',loss_rate_pct:'产销差率(%)',charge_rate_pct:'收费率(%)',avg_price_yuan:'售水均价(元/m³)',plan_completion_pct:'计划完成率(%)',receivable_principal:'应收本金(元)',received_principal:'实收本金(元)',wholesale_vol:'趸售水量(m³)'};
 E.metric=(name)=>({count:{label:'数量',unit:'条',decimals:0},meter_count:{label:'水表数量',unit:'只',decimals:0},record_count:{label:'记录数',unit:'条',decimals:0},sold_vol:{label:'售水量',unit:'m³',decimals:0},supply_vol:{label:'供水量',unit:'m³',decimals:0},registered_count:{label:'注册用户数',unit:'户',decimals:0},new_count:{label:'新增用户',unit:'户',decimals:0},loss_rate_pct:{label:'产销差率',unit:'%',decimals:2},charge_rate_pct:{label:'收费率',unit:'%',decimals:2},avg_price_yuan:{label:'售水均价',unit:'元/m³',decimals:3},plan_completion_pct:{label:'计划完成率',unit:'%',decimals:2},receivable_principal:{label:'应收本金',unit:'元',decimals:2},received_principal:{label:'实收本金',unit:'元',decimals:2},wholesale_vol:{label:'趸售水量',unit:'m³',decimals:0}}[name]||{label:name,unit:'',decimals:2});
 function axes(data,metric,horizontal=false){const m=E.metric(metric);const cat={type:'category',data:data.map(x=>x.name),axisLabel:{color:'#758697',fontSize:10,interval:0,rotate:data.length>8?24:0,width:100,overflow:'truncate'},axisTick:{show:false},axisLine:{lineStyle:{color:'#DCE6EE'}}};const val={type:'value',name:m.unit,nameTextStyle:{color:'#9AA9B7',fontSize:10},axisLabel:{color:'#8B9AA8',fontSize:10},splitLine:{lineStyle:{color:'#EDF2F6',type:'dashed'}}};return horizontal?{xAxis:val,yAxis:cat}:{xAxis:cat,yAxis:val};}
 E.barOption=({data,metric='sold_vol',horizontal=false,seriesName,color,secondMetric,stack=false})=>{
   const m=E.metric(metric);return {color:E.colors,animationDuration:350,grid:{left:horizontal?95:55,right:secondMetric?60:24,top:40,bottom:horizontal?25:50},tooltip:{trigger:'axis',axisPointer:{type:'shadow'},valueFormatter:v=>E.fmt(v,m.decimals)+' '+m.unit},legend:secondMetric?{top:0,right:0,textStyle:{fontSize:10,color:'#758697'}}:undefined,...axes(data,metric,horizontal),series:[{name:seriesName||m.label,type:'bar',barMaxWidth:28,data:data.map(x=>x[metric]),itemStyle:{color:color||E.colors[0],borderRadius:horizontal?[0,5,5,0]:[5,5,0,0]},label:{show:false,position:horizontal?'right':'top',fontSize:9,color:'#536C80',formatter:p=>E.fmt(p.value,m.decimals)},...(stack?{stack:'total'}:{})},...(secondMetric?[{name:E.metric(secondMetric).label,type:'line',yAxisIndex:1,data:data.map(x=>x[secondMetric]),smooth:true,symbolSize:6,itemStyle:{color:E.colors[2]},label:{show:false,fontSize:9,formatter:p=>E.fmt(p.value,2)}}]:[])],...(secondMetric?{yAxis:[{type:'value',axisLabel:{color:'#8B9AA8',fontSize:10},splitLine:{lineStyle:{color:'#EDF2F6',type:'dashed'}}},{type:'value',axisLabel:{color:'#8B9AA8',fontSize:10},splitLine:{show:false}}]}:{})};
 };
 E.lineOption=({data,metrics=['sold_vol'],area=false})=>{
   const m=E.metric(metrics[0]);return {color:E.colors,animationDuration:350,grid:{left:60,right:25,top:44,bottom:45},tooltip:{trigger:'axis'},legend:{top:0,right:0,textStyle:{fontSize:10,color:'#758697'}},xAxis:{type:'category',data:data.map(x=>x.name),axisLabel:{color:'#758697',fontSize:10},axisTick:{show:false},axisLine:{lineStyle:{color:'#DCE6EE'}}},yAxis:{type:'value',name:m.unit,axisLabel:{color:'#8B9AA8',fontSize:10},splitLine:{lineStyle:{color:'#EDF2F6',type:'dashed'}}},series:metrics.map((metric,i)=>({name:E.metric(metric).label,type:'line',data:data.map(x=>x[metric]),smooth:true,symbol:'circle',symbolSize:5,lineStyle:{width:2},areaStyle:area&&i===0?{opacity:.08}:undefined,label:{show:false,position:'top',fontSize:9,formatter:p=>E.fmt(p.value,E.metric(metric).decimals)}}))};
 };
 E.pieOption=({data,metric='sold_vol'})=>{const m=E.metric(metric);return {color:E.colors,tooltip:{trigger:'item',formatter:p=>`${esc(p.name)}<br>${E.fmt(p.value,m.decimals)} ${m.unit} · ${p.percent}%`},legend:{bottom:0,type:'scroll',textStyle:{fontSize:10,color:'#758697'}},series:[{name:m.label,type:'pie',radius:['40%','66%'],center:['50%','44%'],data:data.filter(x=>x[metric]>0).map(x=>({name:x.name,value:x[metric]})),itemStyle:{borderColor:'#fff',borderWidth:2},label:{show:false,fontSize:10,formatter:p=>`${p.name} ${E.fmt(p.value,m.decimals)}`}}]};};
 E.emptyOption=(message='当前筛选暂无可展示数据')=>({title:{text:message,left:'center',top:'center',textStyle:{fontSize:12,fontWeight:'normal',color:'#9AA9B7'}},xAxis:{show:false},yAxis:{show:false},series:[]});
 E.chartCard=def=>{const dimensions=def.dimensions??Object.keys(E.dimensionOptions);return `<article class="card chart-card ${def.wide?'wide':''}" data-chart-card="${def.id}"><div class="card-head chart-card-head"><span class="card-title-bar"></span><div><h2 class="card-title">${esc(def.title)}</h2>${def.subtitle?`<div class="card-subtitle">${esc(def.subtitle)}</div>`:''}</div></div><div class="chart-toolbar"><div class="chart-filter-group">${def.periodFilter===false?'':`<label><span>时段</span><select class="control compact" data-local="period" aria-label="${esc(def.title)}时段"><option value="">跟随查询</option><option>当月</option><option>年内累计</option><option>近5年</option><option>近10年</option></select></label>`}${dimensions.length?`<label><span>维度</span><select class="control compact" data-local="dimension" aria-label="${esc(def.title)}维度">${dimensions.map(k=>`<option value="${k}" ${k===(def.dimension||dimensions[0])?'selected':''}>${E.dimensionOptions[k]||esc(k)}</option>`).join('')}</select></label>`:''}${def.granularity?'<label><span>粒度</span><select class="control compact" data-local="granularity" aria-label="时间粒度"><option value="month">月</option><option value="quarter">季</option><option value="year">年</option></select></label>':''}</div><div class="chart-toolbar-actions"><button class="btn xs" type="button" data-chart-csv="${def.id}">${WB.shell?.icon('download')||''}<span>CSV</span></button><button class="btn xs" type="button" data-chart-png="${def.id}">${WB.shell?.icon('download')||''}<span>PNG</span></button></div></div><div class="chart" id="${def.id}" role="img" aria-label="${esc(def.title)}"></div><div class="chart-source" data-chart-source="${def.id}"></div></article>`;};
 E.registerChart=(id,el,def={})=>{
   if(typeof el==='string')el=document.getElementById(el);if(!el)return null;
   const existing=echarts.getInstanceByDom(el),oldEntry=E.charts.get(id);
   if(existing&&oldEntry&&oldEntry.chart===existing){
     oldEntry.def=def;oldEntry.el=el;
     const state=WB.chartState[id]||{period:'',dimension:def.dimension||'company',granularity:'month'};
     if(def.dimensions?.length&&!def.dimensions.includes(state.dimension))state.dimension=def.dimensions[0];
     oldEntry.state=state;WB.chartState[id]=state;
     const card=el.closest('.chart-card');if(card){card.querySelectorAll('[data-local]').forEach(s=>{s.value=state[s.dataset.local]??s.value;s.onchange=()=>{state[s.dataset.local]=s.value;E.refreshChart(id);};});}
     existing.off('click');existing.on('click',p=>{if(def.onClick)def.onClick(p,oldEntry.context);else E.openChartRows(id,p);});
     E.refreshChart(id);return existing;
   }
   const old=E.charts.get(id);if(old){old.chart.dispose();E.charts.delete(id);}
   const chart=echarts.init(el,null,{renderer:'canvas'});const state=WB.chartState[id]||{period:'',dimension:def.dimension||'company',granularity:'month'};if(def.dimensions?.length&&!def.dimensions.includes(state.dimension))state.dimension=def.dimensions[0];WB.chartState[id]=state;
   const entry={id,el,chart,def,state,context:null,lastOption:null};E.charts.set(id,entry);
   const card=el.closest('.chart-card');if(card){card.querySelectorAll('[data-local]').forEach(s=>{s.value=state[s.dataset.local]??s.value;s.onchange=()=>{state[s.dataset.local]=s.value;E.refreshChart(id);};});}
   E.refreshChart(id);chart.on('click',p=>{if(def.onClick)def.onClick(p,entry.context);else E.openChartRows(id,p);});
   return chart;
 };
 // P1 懒渲染：图表进入视口附近才初始化；另设 idle 兜底，保证静态截图/打印时最终全部就绪。
 const lazyCharts=new Map();
 E.lazyChartCount=()=>[...lazyCharts.values()].filter(item=>!item.done).length;
 E.registerChartLazy=(id,el,def={},opts={})=>{
   if(typeof el==='string')el=document.getElementById(el);if(!el)return null;
   if(!('IntersectionObserver' in window))return E.registerChart(id,el,def);
   const previous=lazyCharts.get(id);if(previous){previous.observer?.disconnect();clearTimeout(previous.timer);}
   const record={el,done:false,observer:null,timer:null};
   const mount=()=>{if(record.done)return;record.done=true;record.observer?.disconnect();clearTimeout(record.timer);if(el.isConnected&&document.contains(el)){try{E.registerChart(id,el,def);}catch(error){console.error('懒加载图表失败',id,error);}}lazyCharts.delete(id);};
   const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))mount();},{rootMargin:opts.rootMargin||'360px 0px'});
   record.observer=observer;observer.observe(el);
   record.timer=setTimeout(mount,opts.idleDelay??1200);
   lazyCharts.set(id,record);
   return null;
 };
 E.clearLazyCharts=()=>{lazyCharts.forEach(record=>{record.observer?.disconnect();clearTimeout(record.timer);});lazyCharts.clear();};

 E.refreshChart=id=>{
   const e=E.charts.get(id);if(!e)return;
   const f={...WB.state};if(e.state.period)f.period=e.state.period;
   let data=e.def.data?e.def.data(f,e):E.filterFacts(f);
   const totals=e.def.getTotals?e.def.getTotals(data,f,e):E.aggregate(e.def.layer===false?data:E.applyLayer(data,f),f);
   const ctx={filters:f,data,totals,state:e.state,engine:E,scopeVersion:E.scopeVersion()};e.context=ctx;
   const option=e.def.getOption?e.def.getOption(ctx):E.emptyOption();
   e.lastOption=option;e.chart.setOption(option,true);
   const src=document.querySelector(`[data-chart-source="${id}"]`);if(src)src.textContent=`${E.periodLabel(f)} · 样例数据`;const hasRows=!!e.def.getRows?.(ctx)?.length;e.el.closest('.chart-card')?.querySelectorAll('[data-chart-csv],[data-chart-png]').forEach(b=>b.disabled=!hasRows);
   if(e.def.afterRender)e.def.afterRender(ctx,e);
   if(window.WB.shell?.refreshIcons)WB.shell.refreshIcons();
 };
 E.refreshAll=()=>{WB.revision++;E.charts.forEach((_,id)=>E.refreshChart(id));WB.listeners.forEach(fn=>{try{fn(WB.state);}catch(error){console.error('视图订阅刷新失败',error);}});};
 E.clearCharts=()=>{E.clearLazyCharts();E.charts.forEach(e=>e.chart.dispose());E.charts.clear();WB.listeners.clear();};
 E.chartHeaders=(e,rows)=>{const size=Math.max(0,...rows.map(r=>r.length));return e.def.getHeaders?.(e.context)||e.def.headers||(size===4?['维度/期间','指标','数值','单位']:size===3?['维度/期间','数值','单位']:Array.from({length:size},(_,i)=>i===0?'维度/期间':`字段${i+1}`));};
 E.openChartRows=(id,p)=>{
   const e=E.charts.get(id);if(!e)return;
   const ctx=e.context||{},filters=Object.assign({},ctx.filters||{});
   const meta={kind:'chart',chartId:id,scopeVersion:ctx.scopeVersion,sourceRows:ctx.data||null};
   const title=e.def.title||id;
   let rows=e.def.getRows?.(ctx,p)||[];
   if(p?.name)rows=rows.filter(r=>String(r[0])===String(p.name)||String(r[0]).startsWith(String(p.name)+' · '));
   const headers=E.chartHeaders(e,rows);
   WB.shell?.openModal({title:`${title}${p?.name?' · '+p.name:' · 明细'}`,subtitle:E.periodLabel(filters),body:rows.length?`<div class="table-scroll"><table class="data-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${esc(x??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<div class="empty">当前对象暂无可展示明细</div>',footer:`<button class="btn" data-close>关闭</button>${rows.length?'<button class="btn primary" id="downloadChartDetail">导出当前明细</button>':''}`});
  document.getElementById('downloadChartDetail')?.addEventListener('click',()=>E.downloadCSV(`${title}_${p?.name||'明细'}.csv`,[...headers,'查询条件','数据来源'],rows.map(r=>[...r,E.filterLabel(filters),e.def?.sourceLabel||'合成样例']),meta));
 };
 E.downloadCSV=(name,headers,rows,meta)=>{
   const guard=E.exportGuard(rows,meta);
   if(!guard.ok){WB.shell?.toast?.(guard.reason);return {ok:false,reason:guard.reason};}
   const p=WBAccess.current();
   const allHeaders=[...headers,'角色/身份','数据范围','数据性质'];
   const allRows=rows.map(r=>[...r,p.roleLabel+'／'+p.label,p.scopeLabel,'合成样例']);
   const cell=v=>{let x=v==null?'':typeof v==='object'?JSON.stringify(v):String(v);if(/^[=+\-@]/.test(x))x="'"+x;return /[",\r\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x;};
   const text='\uFEFF'+[allHeaders,...allRows].map(r=>r.map(cell).join(',')).join('\r\n');
   const blob=new Blob([text],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name.replace(/[\\/:*?"<>|]/g,'_');document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
   logEvent('export',name,true,'',{rows:rows.length});
   WB.shell?.toast?.(`已生成 ${a.download} · ${rows.length}条 · UTF-8 BOM`);
   return {ok:true,name:a.download,blob,text,rows:rows.length,headers:allHeaders};
 };
 E.exportChartRows=id=>{
   const e=E.charts.get(id);if(!e)return {ok:false,reason:'图表不存在'};
   const ctx=e.context||{},filters=Object.assign({},ctx.filters||{});
   const meta={kind:'chart',chartId:id,scopeVersion:ctx.scopeVersion,sourceRows:ctx.data||null};
   const rows=e.def.getRows?.(ctx)||[];
   const guard=E.exportGuard(rows,meta);
   if(!guard.ok){WB.shell?.toast?.(guard.reason);return guard;}
  return E.downloadCSV(`${e.def.title||id}_明细.csv`,[...E.chartHeaders(e,rows),'查询条件','数据来源'],rows.map(r=>[...r,E.filterLabel(filters),e.def?.sourceLabel||'合成样例']),meta);
 };
 E.exportChart=async id=>{
   const e=E.charts.get(id);if(!e||!e.chart)return {ok:false,reason:'图表不存在'};
   const ctx=e.context||{},meta={kind:'chart',chartId:id,scopeVersion:ctx.scopeVersion,sourceRows:ctx.data||null};
   const rowsOf=()=>e.def.getRows?.(ctx)||[];
   const src=()=>(ctx.data&&ctx.data.length?ctx.data:rowsOf());
   const pre=E.exportGuard(src(),meta);
   if(!pre.ok){WB.shell?.toast?.(pre.reason);return pre;}
   const copy=v=>Array.isArray(v)?v.map(copy):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,copy(x)])):v;const original=copy(e.lastOption||{});
   const exported=copy(original);exported.animation=false;exported.backgroundColor='#FFFFFF';(exported.series||[]).forEach(s=>{s.label={...(s.label||{}),show:true,fontSize:s.label?.fontSize||10,color:s.label?.color||'#354B5C'};if(s.type==='pie')s.labelLine={...(s.labelLine||{}),show:true};});
   let url;
   try{e.chart.setOption(exported,false);url=e.chart.getDataURL({type:'png',pixelRatio:2,backgroundColor:'#FFFFFF',excludeComponents:['toolbox']});}finally{e.chart.setOption(original,true);}
   const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=url;});
  const canvas=document.createElement('canvas');canvas.width=image.width;const sourceLabel=e.def.sourceLabel||'';const footerH=sourceLabel?24:0;canvas.height=image.height+142+footerH;const c=canvas.getContext('2d');c.fillStyle='#FFFFFF';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#317FC2';c.fillRect(0,0,10,canvas.height);c.fillStyle='#172B3A';c.font='bold 30px "Microsoft YaHei",sans-serif';c.fillText(e.def.title||id,38,48);c.fillStyle='#536C80';c.font='18px "Microsoft YaHei",sans-serif';const summary=E.filterLabel(e.context.filters);c.fillText(summary.length>95?summary.slice(0,95)+'…':summary,38,85);c.drawImage(image,0,104);c.fillStyle='#758697';c.font='16px "Microsoft YaHei",sans-serif';if(sourceLabel)c.fillText(`数据来源=${sourceLabel}`,38,canvas.height-17);c.fillText(`演示数据｜本地模拟｜源系统只读　数据截至 ${D.asOf}`,38,canvas.height-17-footerH);
   const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));if(!blob)throw new Error('PNG生成失败');
   const post=E.exportGuard(src(),meta);
   if(!post.ok||meta.scopeVersion!==E.scopeVersion()){logEvent('export','chart-png',false,'异步导出期间数据范围已变更',{});WB.shell?.toast?.('数据范围已变更，导出已中止');return {ok:false,reason:'数据范围已变更，导出已中止'};}
   const link=URL.createObjectURL(blob),a=document.createElement('a');a.href=link;a.download=`${e.def.title||id}_带数值标签.png`.replace(/[\\/:*?"<>|]/g,'_');document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(link),2000);logEvent('export',a.download,true,'',{rows:src().length});WB.shell?.toast(`已导出 ${a.download} · 含数值标签与查询条件水印`);return {name:a.download,blob};
 };
 document.addEventListener('click',e=>{const csv=e.target.closest('[data-chart-csv]');if(csv)E.exportChartRows(csv.dataset.chartCsv);const png=e.target.closest('[data-chart-png]');if(png)E.exportChart(png.dataset.chartPng);});
 window.addEventListener('resize',()=>{E.charts.forEach(e=>e.chart.resize());});
 // 身份切换：范围版本变化即失效全部缓存与图表上下文；旧异步结果按版本丢弃。
 WBAccess.onChange(snap=>{
   E.clearFactCache();E.clearScopeCache();if(E.clearLazyCharts)E.clearLazyCharts();
   WB.revision++;WB.scopeVersion=snap.scopeVersion;
   E.charts.forEach((_,id)=>{try{E.refreshChart(id);}catch(error){console.error('范围变更后图表刷新失败',id,error);}});
   WB.listeners.forEach(fn=>{try{fn(WB.state);}catch(error){console.error('视图订阅刷新失败',error);}});
 });
 WB.scopeVersion=WBAccess.current().scopeVersion;
 WB.subscribe=fn=>{WB.listeners.add(fn);return()=>WB.listeners.delete(fn);};
})();
