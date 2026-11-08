/* 统一Filter、聚合、图表与真实文件导出引擎。禁止静态死图或平均率/均价。 */
window.WB=window.WB||{};
(()=>{
 const D=window.WB_DATA;
 WB.state={period:'年内累计',caliber:'业务账期',start:'2026-01',end:'2026-10',year:'2026',month:'2026-10',company:'',admin:'',functional:'',org:'',nature:'',industry:'',caliberMm:'',meterType:'',layer:'SOURCE',role:'集团管理员',viewMode:'main',threshold:100,zeroN:3,swapN:2,nightStart:'01:00',nightEnd:'04:00',rateMin:'',rateMax:'',keyword:'',sourceOnly:false};
 WB.chartState={};WB.currentTable={headers:[],rows:[]};WB.revision=0;WB.listeners=new Set();
 const E=WB.engine={charts:new Map(),colors:['#317FC2','#41A75E','#F58B3C','#6C8EBF','#7DB9A0','#E7B75F','#8295C7','#B3A1CE','#75B8D4','#D99694']};
 const sum=(a,k)=>a.reduce((s,x)=>s+(+x[k]||0),0);
 const div=(a,b)=>b>0?a/b:null;
 const round=(n,d=2)=>n==null||!Number.isFinite(n)?null:+n.toFixed(d);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 E.esc=esc;E.sum=sum;E.div=div;E.round=round;E.hash=D.hash;
 E.fmt=(v,d=0)=>v==null||!Number.isFinite(+v)?'—':(+v).toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d});
 E.periodLabel=f=>`${f.period||'年内累计'} · ${f.caliber||'业务账期'}${f.period==='自定义'?` · ${f.start}—${f.end}`:f.period==='当月'?` · ${f.month}`:''}`;
 E.filterLabel=(f=WB.state)=>[E.periodLabel(f),f.company||'集团',f.admin?D.adminRegions.find(r=>r.code===f.admin)?.name:'',f.org,f.nature,f.industry,f.caliberMm,f.meterType,'合成样例'].filter(Boolean).join('｜');
 function periods(f){let end=f.month||f.end||'2026-10',year=+end.slice(0,4);if(f.period==='当月')return[end];if(f.period==='近5年')return D.periods.filter(p=>p>=`${year-4}-01`&&p<=end);if(f.period==='近10年')return D.periods.filter(p=>p>=`${year-9}-01`&&p<=end);if(f.period==='自定义')return D.periods.filter(p=>p>=(f.start||'2026-01')&&p<=end);return D.periods.filter(p=>p>=`${year}-01`&&p<=end);}
 E.periods=periods;
 const FILTER_KEYS=['period','caliber','month','end','start','year','company','admin','functional','org','nature','industry','caliberMm','meterType','team','line','orgNodeId'];
 const factCache=new Map();
 const filterSignature=(f,list)=>{let sig='';for(const k of FILTER_KEYS)sig+=String(f[k]??'')+'\u0001';return sig+list.join(',');};
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
   const rows=candidates.filter(x=>(!window.WB_ORG||WB_ORG.allows(x,eff))&&(!eff.company||x.company===eff.company)&&(!eff.admin||x.adminCode===eff.admin)&&(!eff.functional||x.functionalZones.includes(eff.functional))&&(!eff.org||x.org===eff.org)&&(!eff.nature||x.nature===eff.nature)&&(!eff.industry||x.industry===eff.industry)&&(!eff.caliberMm||x.caliber===eff.caliberMm)&&(!eff.meterType||x.meterType===eff.meterType)&&(!eff.team||x.team===eff.team)&&(!eff.line||x.line===eff.line));
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
   if(key==='orgNode')return E.group(rows,x=>WB_ORG.childName(x),f);
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
 E.dimensionOptions={orgNode:'直属下级组织',company:'经营单位',admin:'法定行政区',org:'组织节点',nature:'用水性质',industry:'行业',caliber:'水表口径',meterType:'水表类型',wholesale:'趸售标志',manufacturer:'厂家',status:'状态',type:'类型',severity:'级别'};
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
   const ctx={filters:f,data,totals,state:e.state,engine:E};e.context=ctx;
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
   const e=E.charts.get(id);if(!e)return;let rows=e.def.getRows?.(e.context,p)||[];
   if(p?.name)rows=rows.filter(r=>String(r[0])===String(p.name)||String(r[0]).startsWith(String(p.name)+' · '));
   const headers=E.chartHeaders(e,rows);
   WB.shell?.openModal({title:`${e.def.title||id}${p?.name?' · '+p.name:' · 明细'}`,subtitle:E.periodLabel(e.context.filters),body:rows.length?`<div class="table-scroll"><table class="data-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${esc(x??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<div class="empty">当前对象暂无可展示明细</div>',footer:`<button class="btn" data-close>关闭</button>${rows.length?'<button class="btn primary" id="downloadChartDetail">导出当前明细</button>':''}`});
   document.getElementById('downloadChartDetail')?.addEventListener('click',()=>E.downloadCSV(`${e.def.title}_${p?.name||'明细'}.csv`,[...headers,'查询条件','数据性质'],rows.map(r=>[...r,E.filterLabel(e.context.filters),'合成样例'])));
 };
 E.downloadCSV=(name,headers,rows)=>{
   const cell=v=>{let s=v==null?'':typeof v==='object'?JSON.stringify(v):String(v);if(/^[=+\-@]/.test(s))s="'"+s;return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
   const text='\uFEFF'+[headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n');
   const blob=new Blob([text],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name.replace(/[\\/:*?"<>|]/g,'_');document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);WB.shell?.toast(`已生成 ${a.download} · ${rows.length}条 · UTF-8 BOM`);return {name:a.download,blob,text};
 };
 E.exportChartRows=id=>{const e=E.charts.get(id);if(!e)return;const rows=e.def.getRows?.(e.context)||[];if(!rows.length)return WB.shell?.toast('暂无可导出数据');return E.downloadCSV(`${e.def.title||id}_${WB.state.month}.csv`,[...E.chartHeaders(e,rows),'查询条件','数据性质'],rows.map(r=>[...r,E.filterLabel(e.context.filters),'合成样例']));};
 E.exportChart=async id=>{
   const e=E.charts.get(id);if(!e)return;const copy=v=>Array.isArray(v)?v.map(copy):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,copy(x)])):v;const original=copy(e.lastOption||{});
   const exported=copy(original);exported.animation=false;exported.backgroundColor='#FFFFFF';(exported.series||[]).forEach(s=>{s.label={...(s.label||{}),show:true,fontSize:s.label?.fontSize||10,color:s.label?.color||'#354B5C'};if(s.type==='pie')s.labelLine={...(s.labelLine||{}),show:true};});
   let url;
   try{e.chart.setOption(exported,false);url=e.chart.getDataURL({type:'png',pixelRatio:2,backgroundColor:'#FFFFFF',excludeComponents:['toolbox']});}finally{e.chart.setOption(original,true);}
   const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=url;});
   const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height+142;const c=canvas.getContext('2d');c.fillStyle='#FFFFFF';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#317FC2';c.fillRect(0,0,10,canvas.height);c.fillStyle='#172B3A';c.font='bold 30px "Microsoft YaHei",sans-serif';c.fillText(e.def.title||id,38,48);c.fillStyle='#536C80';c.font='18px "Microsoft YaHei",sans-serif';const summary=E.filterLabel(e.context.filters);c.fillText(summary.length>95?summary.slice(0,95)+'…':summary,38,85);c.drawImage(image,0,104);c.fillStyle='#758697';c.font='16px "Microsoft YaHei",sans-serif';c.fillText(`演示数据｜本地模拟｜源系统只读　数据截至 ${D.asOf}`,38,canvas.height-17);
   const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));if(!blob)throw new Error('PNG生成失败');const link=URL.createObjectURL(blob),a=document.createElement('a');a.href=link;a.download=`${e.def.title||id}_带数值标签.png`.replace(/[\\/:*?"<>|]/g,'_');document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(link),2000);WB.shell?.toast(`已导出 ${a.download} · 含数值标签与查询条件水印`);return {name:a.download,blob};
 };
 document.addEventListener('click',e=>{const csv=e.target.closest('[data-chart-csv]');if(csv)E.exportChartRows(csv.dataset.chartCsv);const png=e.target.closest('[data-chart-png]');if(png)E.exportChart(png.dataset.chartPng);});
 window.addEventListener('resize',()=>{E.charts.forEach(e=>e.chart.resize());});
 WB.subscribe=fn=>{WB.listeners.add(fn);return()=>WB.listeners.delete(fn);};
})();
