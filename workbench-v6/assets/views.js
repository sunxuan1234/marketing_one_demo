/* V3 专属业务视图：应收、DMA、预测、源工单、治理、报表与只读配置。 */
(()=>{
 const D=WB_DATA,C=WB_CATALOG,E=WB.engine,S=()=>WB.shell;
 const V=window.WBViews={};
 const esc=E.esc,fmt=E.fmt;
 const list=value=>Array.isArray(value)?value:[];
 const sum=(rows,key)=>rows.reduce((total,row)=>total+(Number(row[key])||0),0);
 const knownSum=(rows,key)=>{const values=rows.map(row=>row[key]).filter(value=>value!=null&&Number.isFinite(Number(value)));return values.length?values.reduce((total,value)=>total+Number(value),0):null;};
 const text=value=>esc(value==null||value===''?'—':value);
 const risk=(level,tip)=>`<span class="v4-risk" data-tip="${esc(tip)}" title="${esc(tip)}">⚠ ${esc(level)}</span>`;
 const number=(value,digits=2)=>value==null||!Number.isFinite(Number(value))?'—':fmt(Number(value),digits);
 /* 数据入口：全部经 WBAccess 范围裁剪，页面内不直接读冻结源数组。 */
 const A=()=>window.WBAccess,O=()=>window.WBOrg;
 const scopeOf=()=>A()?.current?.().scope||{nodeIds:new Set(),unitIds:new Set(),roots:[],unbound:true};
 const scopeVersion=()=>A()?.current?.().scopeVersion??WB.state.scopeVersion??0;
 const src=name=>{const items=E.scopedRows(name);return Array.isArray(items)?items:[];};
 let scopeSet=null,scopeSetRef=null;
 const scopeNodeSet=()=>{const ids=scopeOf().nodeIds;if(scopeSetRef===ids&&scopeSet)return scopeSet;scopeSetRef=ids;scopeSet=new Set((ids instanceof Set?[...ids]:list(ids)).map(String));return scopeSet;};
 const inScopeNode=id=>id!=null&&scopeNodeSet().has(String(id));
 let nodeIndex=null,nodeIndexRef=null;
 let descendantStamp=-1;const descendantSets=new Map();
 const descendantsOf=id=>{
  const version=scopeVersion();
  if(descendantStamp!==version){descendantSets.clear();descendantStamp=version;}
  const key=String(id);
  if(descendantSets.has(key))return descendantSets.get(key);
  const org=O();
  const raw=org?.descendantsSet?[...org.descendantsSet(key)]:(org?.descendants?org.descendants(key).map(node=>node.id):[key]);
  const set=new Set(list(raw).map(String).concat(String(key)));
  descendantSets.set(key,set);
  return set;
 };
 const orgNodes=()=>{const nodes=O()?.nodes;if(!Array.isArray(nodes))return [];if(nodeIndexRef!==nodes){nodeIndexRef=nodes;nodeIndex=new Map(nodes.map(node=>[String(node.id),node]));}return nodes;};
 const orgNode=id=>{if(!nodeIndexRef){orgNodes();}return nodeIndex?nodeIndex.get(String(id))||null:null;};
 const nodeLabel=id=>{const node=orgNode(id);return node?.name||String(id??'—');};
 const scopeText=()=>{const cur=A()?.current?.();if(!cur)return '身份数据未加载';if(cur.scopeLabel)return cur.scopeLabel;const roots=[...((cur.scope&&cur.scope.roots)||[])];if(!roots.length)return cur.rangeStatus==='unbound'?'数据范围未绑定实际账号（P）':'无可见组织';const unbound=cur.scope&&cur.scope.unbound;return roots.map(nodeLabel).join('、')+(unbound?'（未绑定实际账号）':' 及以下');};
 /* 册本是用户行维度而不是组织节点：所在范围没有册本数据时相关报表判为不适用。 */
 const hasBooklet=()=>src('users').some(user=>user.booklet!=null&&String(user.booklet).trim()!=='');
 let userIndex=null,userIndexStamp=-1;
 function usersById(){const version=scopeVersion();if(!userIndex||userIndexStamp!==version){userIndex=new Map(src('users').map(user=>[user.id,user]));userIndexStamp=version;}return userIndex;}
 const billUser=bill=>usersById().get(bill.userId)||{};

 V.card=(title,value,unit,note,icon='chart',tone='')=>`<article class="card kpi-card"><div class="kpi-top"><span class="kpi-icon ${tone}">${S()?.icon(icon)||''}</span><span>${esc(title)}</span></div><div class="kpi-main"><span class="kpi-value numeric">${typeof value==='number'?fmt(value,2):value}</span><span class="kpi-unit">${esc(unit)}</span></div><div class="kpi-foot"><span>${esc(note)}</span></div></article>`;
 V.cards=totals=>`<section class="kpi-grid">${V.card('售水量',fmt(totals.sold_vol/10000,1),'万吨','当前范围累计售水量','water')}${V.card('收费率',fmt(totals.charge_rate_pct),'%','实收本金 / 应收本金','wallet','green')}${V.card('产销差率',fmt(totals.loss_rate_pct),'%','供售水量综合差率','flow','orange')}${V.card('售水均价',fmt(totals.avg_price_yuan,3),'元/m³','综合售水单价','meter')}${V.card('注册用户',fmt(totals.registered_count),'户','当前范围期末存量','users','green')}</section>`;
 V.table=(id,headers,rows)=>`<div id="${id}" class="table-scroll"><table class="data-table"><thead><tr>${headers.map(header=>`<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}"><div class="empty">暂无符合条件的数据，请调整查询条件或等待数据接入。</div></td></tr>`}</tbody></table></div>`;
 V.featureFooter=()=> '';

 function chart(def){return {html:E.chartCard(def),mount:()=>E.registerChart(def.id,def.id,def)};}
 function metricRows(ctx){return E.group(ctx.data,ctx.state.dimension,ctx.filters).map(row=>[row.name,row.sold_vol,row.charge_rate_pct,row.loss_rate_pct]);}
 function setupCommonChart(id,title,subtitle,extra={}){return {id,title,subtitle,dimension:'company',granularity:true,headers:['期间','售水量(m³)','计划值(m³，非预测)'],getOption:ctx=>E.lineOption({data:E.trend(ctx.data,ctx.filters,ctx.state.granularity),metrics:['sold_vol','plan_vol'],area:true}),getRows:ctx=>E.trend(ctx.data,ctx.filters,ctx.state.granularity).map(row=>[row.name,row.sold_vol,row.plan_vol]),...extra};}
 function dimensionFilter(row,f=WB.state){
  const nodeFilter=f.orgNodeId!=null&&f.orgNodeId!==''?String(f.orgNodeId):'';
  const unitFilter=f.unitId!=null&&f.unitId!==''?String(f.unitId):'';
  const owner=()=>{if(row.orgNodeId!=null)return String(row.orgNodeId);const user=row.userId!=null?usersById().get(row.userId):null;return user&&user.orgNodeId!=null?String(user.orgNodeId):'';};
  const unit=()=>{if(row.unitId!=null&&row.unitId!=='')return String(row.unitId);const user=row.userId!=null?usersById().get(row.userId):null;return user&&user.unitId!=null?String(user.unitId):'';};
  return (!f.company||row.company===f.company)&&(!f.admin||row.adminCode===f.admin)&&(!f.functional||list(row.functionalZones).includes(f.functional))&&(!f.org||row.org===f.org)&&(!f.nature||row.nature===f.nature)&&(!f.industry||row.industry===f.industry)&&(!f.caliberMm||row.caliber===f.caliberMm)&&(!f.meterType||row.meterType===f.meterType)&&(!f.team||row.team===f.team)&&(!f.line||row.line===f.line)&&(!f.booklet||row.booklet===f.booklet)&&(!nodeFilter||descendantsOf(nodeFilter).has(owner()))&&(!unitFilter||unit()===unitFilter);
 }
 function filtered(rows,f=WB.state,periodKey='period'){
  const periods=new Set(E.periods(f));
  return list(rows).filter(row=>{
   const value=periodKey?row[periodKey]??row.period??row.billingMonth??row.createdAt:null;
   const period=value?String(value).slice(0,7):null;
   return dimensionFilter(row,f)&&(!periodKey||periods.has(period));
  });
 }
 function grouped(rows,key){
  const map=new Map();
  rows.forEach((row,index)=>{const name=typeof key==='function'?key(row,index):row[key]??'未提供';if(!map.has(name))map.set(name,[]);map.get(name).push(row);});
  return [...map].map(([name,items])=>({name,items}));
 }
 /* 表数据登记：引擎持有当前表并附带范围代次与来源行，导出据此校验。 */
 function stampTable(module,title,headers,tableRows,sourceRows){
  if(typeof E.bindTable==='function'){E.bindTable({headers,rows:tableRows,sourceRows,module,title});return;}
  WB.currentTable={headers,rows:tableRows,scopeVersion:scopeVersion(),sourceRows,module,title,period:WB.state.period,filters:{...WB.state}};
 }
 /* 平台侧写操作返回 {ok:false,reason:'denied'|...}，统一转成面向用户的中文说明。 */
 function denyText(reason,fallback='操作被拒绝'){
  if(!reason)return fallback;
  const map={'denied':'当前身份未授权（需在顶部身份面板显式开启演示能力）','not-found':'对象不存在或不在当前范围','name-required':'请填写账号名称','company-required':'请选择归属经营单位','org-required':'请选择归属组织节点','unit-required':'请选择经营单位','node-required':'缺少组织节点编号','invalid-value':'取值非法（计划值需为非负数）','invalid':'取值非法','duplicated':'名称重复'};
  return map[String(reason)]||fallback;
 }
 function pager(namespace,total,page,size){
  const pages=Math.max(1,Math.ceil(total/size));if(pages<=1)return '';
  return `<div class="pagination"><span>共 ${fmt(total)} 条 · 第 ${page}/${pages} 页</span><button type="button" class="page-btn" data-${namespace}-page="${page-1}" ${page<=1?'disabled':''}>上一页</button><button type="button" class="page-btn" data-${namespace}-page="${page+1}" ${page>=pages?'disabled':''}>下一页</button></div>`;
 }
 function pageRows(rows,page,size){return rows.slice((page-1)*size,page*size);}
 function basicBarOption(rows,{label='数量',unit='单',color='#317FC2'}={}){
  if(!rows.length||rows.every(row=>row.value==null))return E.emptyOption('暂无可汇总数据');
  return {animationDuration:300,grid:{left:56,right:24,top:38,bottom:52},tooltip:{trigger:'axis',axisPointer:{type:'shadow'},valueFormatter:value=>fmt(value,0)+' '+unit},xAxis:{type:'category',data:rows.map(row=>row.name),axisLabel:{interval:0,rotate:rows.length>6?22:0,color:'#758697',fontSize:10},axisTick:{show:false}},yAxis:{type:'value',name:unit,minInterval:1,axisLabel:{color:'#8798A6'},splitLine:{lineStyle:{color:'#EDF2F6',type:'dashed'}}},series:[{name:label,type:'bar',barMaxWidth:30,data:rows.map(row=>row.value),itemStyle:{color,borderRadius:[5,5,0,0]},label:{show:false}}]};
 }
 function emptyBlock(title,description){return `<div class="empty">${S()?.icon('empty')||''}<div class="empty-title">${esc(title)}</div><div class="empty-description">${esc(description)}</div></div>`;}

 /* 应收账款：卡片、图表、当前明细与CSV全部读取同一组账单。 */
 function billTotals(rows){const amount=sum(rows,'amount'),received=sum(rows,'received'),arrears=sum(rows,'arrears');return {amount,received,arrears,charge:amount?received/amount*100:null};}
 function billGroups(rows,key){return grouped(rows,key).map(({name,items})=>{const totals=billTotals(items);return {name,receivable:totals.amount,received:totals.received,arrears:totals.arrears,charge:totals.charge,count:items.length};});}
 function arCompareOption(rows){
  if(!rows.length)return E.emptyOption();
  return {animationDuration:300,color:['#317FC2','#41A75E','#F58B3C'],grid:{left:70,right:66,top:48,bottom:58},legend:{top:4,textStyle:{fontSize:11,color:'#647B8D'}},tooltip:{trigger:'axis',axisPointer:{type:'shadow'}},xAxis:{type:'category',data:rows.map(row=>row.name),axisLabel:{interval:0,rotate:rows.length>6?22:0,color:'#758697',fontSize:10},axisTick:{show:false}},yAxis:[{type:'value',name:'金额（元）',axisLabel:{color:'#8798A6'},splitLine:{lineStyle:{color:'#EDF2F6',type:'dashed'}}},{type:'value',name:'收费率（%）',min:0,max:100,axisLabel:{color:'#8798A6'},splitLine:{show:false}}],series:[{name:'应收金额',type:'bar',barMaxWidth:24,data:rows.map(row=>row.receivable),itemStyle:{borderRadius:[4,4,0,0]}},{name:'实收金额',type:'bar',barMaxWidth:24,data:rows.map(row=>row.received),itemStyle:{borderRadius:[4,4,0,0]}},{name:'收费率',type:'line',yAxisIndex:1,data:rows.map(row=>row.charge),smooth:true,symbolSize:6}]};
 }
 function debtVolume(bill){return bill.arrears>0&&bill.received>0?null:(bill.arrears>0?bill.volume:0);}
 function debtUsers(rows){
  return grouped(rows.filter(row=>row.arrears>0),'userId').map(({items})=>{
   const bill=items[0],user=billUser(bill),volumes=items.map(debtVolume),volume=volumes.some(value=>value==null)?null:volumes.reduce((a,b)=>a+b,0);
   return {userId:bill.userId,card:bill.card,user,company:bill.company,nature:bill.nature,count:items.length,volume,amount:sum(items,'arrears'),first:items.map(x=>x.period).sort()[0],last:items.map(x=>x.period).sort().at(-1)};
  }).sort((a,b)=>b.amount-a.amount);
 }
 V.renderAr=()=>{
  const chartDef=chart({id:'C-AR-RECEIPTS',title:'应收、实收与收费率',subtitle:'按用水性质查看，可切换经营单位与组织',dimensions:['nature','company','org'],dimension:'nature',data:f=>filtered(src('bills'),f,'period'),headers:['维度','应收金额(元)','实收金额(元)','欠费金额(元)','收费率(%)'],getOption:ctx=>arCompareOption(billGroups(ctx.data,ctx.state.dimension)),getRows:ctx=>billGroups(ctx.data,ctx.state.dimension).map(row=>[row.name,row.receivable,row.received,row.arrears,row.charge])});
  const debtDef=chart({id:'C-AR-DEBT-YEAR',title:'欠费金额按账务年分布',subtitle:'仅统计当前查询范围内的未结清账单',dimensions:[],data:f=>filtered(src('bills'),f,'period').filter(row=>row.arrears>0),headers:['账务年','欠费金额(元)','欠费账单(笔)','欠费用户(户)'],getOption:ctx=>basicBarOption(billGroups(ctx.data,row=>row.period.slice(0,4)).map(row=>({name:row.name,value:row.arrears})),{label:'欠费金额',unit:'元',color:'#D95555'}),getRows:ctx=>billGroups(ctx.data,row=>row.period.slice(0,4)).map(row=>[row.name,row.arrears,row.count,new Set(ctx.data.filter(x=>x.period.startsWith(row.name)).map(x=>x.userId)).size])});
  const state={tab:'bills',page:1,size:20};
  const tabs=[['bills','应收账单'],['debt','欠费用户'],['aging','账龄分析'],['large','5000m³专项'],['adjust','调整减免'],['refund','退款'],['special','特殊开账 / 待处理账']];
  const html=`<section id="arKpis" class="kpi-grid four"></section><div class="notice">账单只读；部分缴费的欠费水量待核，5000m³仅作专项筛选。${risk('L2','部分缴费/预存冲抵的欠费水量口径待确认')}</div><section class="chart-grid">${chartDef.html}${debtDef.html}</section><section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">应收与账务明细</h2><div class="card-subtitle">切换页签查看对应账单或专项台账</div></div><div class="card-head-actions"><button type="button" class="btn" data-export-current>导出当前表</button></div></div><div class="tabs" role="tablist">${tabs.map(([key,label],index)=>`<button type="button" role="tab" data-ar="${key}" class="${index===0?'active':''}" aria-selected="${index===0}">${label}</button>`).join('')}</div><div id="arTable"></div></section>`;
  function adjustment(kind){
   let rows=filtered(src('adjustments'),WB.state,'bill_period');
   const type=row=>row.proc_type||row.procType||row.type||'';
   if(kind==='refund')rows=rows.filter(row=>/退款|退费/.test(type(row)));
   else if(kind==='special')rows=rows.filter(row=>/特殊|待处理/.test(type(row)));
   else rows=rows.filter(row=>!/退款|退费|特殊|待处理/.test(type(row)));
   const headers=['处理单号','账期','统一表卡','经营单位','处理类型','处理金额(元)','发起人','发起时间','审核状态','原因'];
   const raw=rows.map(row=>[row.adj_order_no||row.id,row.bill_period||row.period,row.card||row.unified_code||row.cust_id,row.company,type(row),row.proc_amt??row.procAmt??row.amount,row.initiator_name||row.initiator,row.initiate_time||row.time,row.audit_status||row.status,row.reason_desc||row.reason]);
   return {headers,raw,empty:kind==='refund'?'暂无退款记录，未以账单或调整记录推算退款。':kind==='special'?'暂无特殊开账或待处理账记录。':'暂无调整减免记录。'};
  }
  function tableModel(){
   const bills=filtered(src('bills'),WB.state,'period');
   if(state.tab==='bills'){
    const headers=['账单编号','账期','统一表卡','经营单位','用水性质','水量(m³)','应收(元)','实收(元)','欠费(元)','到期日','状态','操作'];
    const raw=bills.map(row=>[row.id,row.period,row.card,row.company,row.nature,row.volume,row.amount,row.received,row.arrears,row.dueAt,row.status,row.id]);
    return {headers,raw,kind:'bills',source:bills};
   }
   if(state.tab==='debt'||state.tab==='large'){
    let rows=debtUsers(bills),source=bills;
    if(state.tab==='large'){
     const end=WB.state.month||'2026-10',start=String(Number(end.slice(0,4))-4)+'-01';
     /* 五年大用户与表格同源：来源行必须是同一「自定义五年」过滤结果，不能沿用当期账单。 */
     source=filtered(src('bills'),{...WB.state,period:'自定义',start,end},'period');
     rows=debtUsers(source).filter(row=>row.volume!=null&&row.volume>=5000);
    }
    const headers=['统一表卡','用户','经营单位','用水性质','欠费笔数','欠费水量(m³)','欠费金额(元)','最早账期','最近账期'];
    return {headers,raw:rows.map(row=>[row.card,row.user.name,row.company,row.nature,row.count,row.volume,row.amount,row.first,row.last]),kind:state.tab,source};
   }
   if(state.tab==='aging'){
    const month=WB.state.month||'2026-10';
    const [asYear,asMonth]=month.split('-').map(Number);
    const asOf=Date.UTC(asYear,asMonth,0);
    const overdue=[['0-30天',0,30],['31-90天',31,90],['91-180天',91,180],['181-365天',181,365],['365天以上',366,100000]];
    const labels=['未到期',...overdue.map(([name])=>name),'未知'];
    const rows=filtered(src('bills'),WB.state,'period').filter(row=>row.arrears>0);
    const byCompany=new Map();
    rows.forEach(row=>{
     const dueStr=row.dueAt||(row.period?row.period+'-25':null);
     const days=dueStr?Math.floor((asOf-Date.parse(String(dueStr)+'T00:00:00Z'))/86400000):NaN;
     let idx;
     if(!Number.isFinite(days))idx=labels.length-1;
     else if(days<0)idx=0;
     else{const found=overdue.findIndex(([,lo,hi])=>days>=lo&&days<=hi);idx=found<0?labels.length-1:found+1;}
     const key=row.company||'未知';
     const entry=byCompany.get(key)||{company:key,count:0,amount:0,buckets:labels.map(()=>0)};
     entry.count+=1;entry.amount+=Number(row.arrears)||0;entry.buckets[idx]+=Number(row.arrears)||0;
     byCompany.set(key,entry);
    });
    const headers=['经营单位','欠费笔数',...labels.map(name=>name+'(元)'),'欠费合计(元)'];
    const raw=[...byCompany.values()].sort((a,b)=>b.amount-a.amount).map(entry=>[entry.company,entry.count,...entry.buckets.map(value=>+value.toFixed(2)),+entry.amount.toFixed(2)]);
    return {headers,raw,kind:'aging',source:rows};
   }
   return {...adjustment(state.tab),kind:state.tab};
  }
  function drawTable(){
   const model=tableModel(),pages=Math.max(1,Math.ceil(model.raw.length/state.size));state.page=Math.min(state.page,pages);
   const headers=model.kind==='bills'?model.headers.slice(0,-1):model.headers;
   const tableRows=model.raw.map(row=>model.kind==='bills'?row.slice(0,-1):row.slice());
   const source=model.source||(state.tab==='adjust'||state.tab==='refund'||state.tab==='special'?filtered(src('adjustments'),WB.state,'bill_period'):filtered(src('bills'),WB.state,'period'));
   stampTable('ar','应收与账务明细',headers,tableRows,source);
   const rows=pageRows(model.raw,state.page,state.size).map(row=>{
    if(model.kind==='bills')return [text(row[0]),text(row[1]),text(row[2]),text(row[3]),text(row[4]),number(row[5],0),number(row[6]),number(row[7]),number(row[8]),text(row[9]),text(row[10]),`<button type="button" class="btn xs" data-bill-detail="${esc(row[0])}">查看</button>`];
    if(model.kind==='debt'||model.kind==='large')return [text(row[0]),text(row[1]),text(row[2]),text(row[3]),number(row[4],0),row[5]==null?'<span class="badge orange">待核</span>':number(row[5],0),number(row[6]),text(row[7]),text(row[8])];
    if(model.kind==='aging')return row.map((cell,index)=>index<=1?text(cell):number(cell));
    return row.map((cell,index)=>index===5?number(cell):text(cell));
   });
   const content=V.table('arLedger',model.headers,rows)+pager('ar',model.raw.length,state.page,state.size);
   document.getElementById('arTable').innerHTML=model.empty&&!model.raw.length?emptyBlock('当前页签暂无数据',model.empty):content;
  }
  function drawKpis(){const totals=billTotals(filtered(src('bills'),WB.state,'period'));document.getElementById('arKpis').innerHTML=V.card('应收金额',fmt(totals.amount,2),'元','当前账单范围','wallet')+V.card('实收金额',fmt(totals.received,2),'元','同一账单范围','wallet','green')+V.card('欠费金额',fmt(totals.arrears,2),'元','未结清账单金额','report','orange')+V.card('收费率',fmt(totals.charge),'%','实收金额 / 应收金额','chart','green');}
  function openBill(id){const row=list(src('bills')).find(bill=>bill.id===id);if(!row)return;S().openDrawer({title:`账单 ${row.id}`,subtitle:'源账单只读详情',body:`<div class="kv-grid">${[['统一表卡',row.card],['业务账期',row.period],['经营单位',row.company],['用水性质',row.nature],['账单水量',number(row.volume,0)+' m³'],['应收金额',number(row.amount)+' 元'],['实收金额',number(row.received)+' 元'],['欠费金额',number(row.arrears)+' 元'],['到期日',row.dueAt],['最近缴费时间',row.paidAt],['缴费方式',row.payWay],['账单状态',row.status]].map(([label,value])=>`<div class="kv"><span>${esc(label)}</span><b>${text(value)}</b></div>`).join('')}</div><div class="notice">账单信息只读。</div>`});}
  return {html,mount(){chartDef.mount();debtDef.mount();drawKpis();drawTable();document.querySelectorAll('[data-ar]').forEach(button=>button.onclick=()=>{state.tab=button.dataset.ar;state.page=1;document.querySelectorAll('[data-ar]').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-selected',String(item===button));});drawTable();});document.getElementById('arTable').addEventListener('click',event=>{const page=event.target.closest('[data-ar-page]'),bill=event.target.closest('[data-bill-detail]');if(page&&!page.disabled){state.page=Number(page.dataset.arPage);drawTable();}if(bill)openBill(bill.dataset.billDetail);});}};
 };

 /* DMA：需求入口保留；拓扑、时序采集与测压数据未接入时不制造图形或数值。 */
 V.renderDma=()=>{
  /* 分区计量：消费 window.WBPrototypeData（预置模拟，非真实接入）。范围以 dmaNodes（已经营单位+身份裁剪）为准；
     成员明细仅取授权 src('users')；局部用户筛选不以整分区供水量套用产销差，标“局部不适用”。导出原始值与展示动作分列登记。 */
  const P=()=>window.WBPrototypeData||null;
  const protoLabel=()=>P()?.meta?.label||'原型模拟数据（非真实接入）';
  const isNonres=user=>!!user&&!String(user.nature||'').startsWith('居民');
  const isRemote=user=>!!user&&user.meterType==='远传表';
  let tab='topology',nodeSel='';
  const tabs=[['topology','物理拓扑'],['night','夜间流量'],['hourly','24小时瞬时流量'],['pressure','压力监测'],['balance','供售水分析'],['dailyOnline','当月逐日在线'],['dailyVolume','日用水量、累加用水量'],['remoteRatio','远传表占比'],['nonresRatio','非居民水表占比'],['syncYear','同步年分析']];
  const orgQueryOf=f=>f.orgNodeId!=null&&f.orgNodeId!==''?String(f.orgNodeId):'';
  const nodeOwner=node=>String(node.orgNodeId||'');
  /* 组织可见性按祖先/后代关系：查询节点与分区所属单位互为祖先/后代（含自身）才可见，不借外单位；unitId 过滤整单位。 */
  const nodeVisible=(node,f)=>{const query=orgQueryOf(f),owner=nodeOwner(node);if(f.unitId!=null&&f.unitId!==''&&String(node.unitId)!==String(f.unitId))return false;if(!query||!owner)return true;return query===owner||descendantsOf(query).has(owner)||descendantsOf(owner).has(query);};
  /* 局部判定：查询节点是分区所属单位的真后代（所/线路）→局部；祖先或本身（集团/整单位）→整分区完整。 */
  const nodePartial=(node,f)=>{const query=orgQueryOf(f),owner=nodeOwner(node);return !!query&&!!owner&&query!==owner&&descendantsOf(owner).has(query);};
  const nodes=()=>src('dmaNodes').filter(node=>(!WB.state.company||node.company===WB.state.company)&&nodeVisible(node,WB.state));
  const nodeIds=()=>new Set(nodes().map(node=>node.id));
  const nodeById=()=>new Map(nodes().map(node=>[node.id,node]));
  const dmaMonth=()=>WB.state.month||'2026-10';
  const dmaPeriods=()=>{const periods=E.periods(WB.state);return periods.length?periods:[dmaMonth()];};
  const periodEnd=()=>dmaPeriods()[dmaPeriods().length-1];
  const periodRangeLabel=()=>{const periods=dmaPeriods();return periods.length>1?`${periods[0]}…${periods[periods.length-1]}`:periods[0];};
  const dmaMonthDays=()=>{const [y,m]=dmaMonth().split('-').map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate();};
  const enrichNode=row=>{const node=nodeById().get(row.dmaId);if(!node)return null;return {...row,orgNodeId:row.orgNodeId||node.orgNodeId,unitId:row.unitId||node.unitId,company:row.company||node.company,nodeName:node.node_name};};
  const dailyRows=()=>list(P()?.dmaDailyReadings).map(enrichNode).filter(Boolean);
  const balanceRows=()=>list(P()?.dmaBalance).map(enrichNode).filter(Boolean);
  const memberships=()=>list(P()?.dmaMemberships).filter(row=>nodeIds().has(row.dmaId));
  const meterLinks=()=>list(P()?.dmaMeterLinks).filter(row=>nodeIds().has(row.dmaId));
  const monthDaily=()=>dailyRows().filter(row=>String(row.date||row.period||'').slice(0,7)===dmaMonth());
  const activeAt=(row,month)=>String(row.validFrom||'').slice(0,7)<=month&&(!row.validTo||String(row.validTo).slice(0,7)>=month);
  /* caliber 是时间口径（默认“财务自然月”恒有值），不参与局部判定；物理口径沿用 dimensionFilter 的专用键。 */
  const USER_KEYS=['nature','industry','team','line','booklet','meterType','admin','functional','org','caliberMm'];
  const partialFilter=f=>USER_KEYS.some(key=>f[key])||nodes().some(node=>nodePartial(node,f));
  function memberMap(f){const end=periodEnd(),map=new Map();memberships().forEach(row=>{if(!activeAt(row,end))return;const user=usersById().get(row.userId);if(!user||!dimensionFilter(user,f))return;if(!map.has(row.dmaId))map.set(row.dmaId,[]);map.get(row.dmaId).push({m:row,u:user});});return map;}
  function linksByNode(){const map=new Map();meterLinks().forEach(row=>{if(!map.has(row.dmaId))map.set(row.dmaId,[]);map.get(row.dmaId).push(row);});return map;}
  const readings=()=>src('dmaReadings').filter(row=>nodeIds().has(row.node_id));
  const dmaHourly=()=>readings().filter(row=>String(row.period||row.ts||'').startsWith(dmaMonth()));
  const detailBtn=(kind,nodeId,extra='')=>`<button type="button" class="btn xs" data-dma-detail data-dma-kind="${esc(kind)}" data-dma-node="${esc(nodeId)}"${extra}>详情</button>`;
  const nodeSelectHtml=()=>`<label style="display:inline-flex;align-items:center;gap:6px;margin-left:12px"><span>分区</span><select class="control compact" data-dma-node-select aria-label="选择分区"><option value="">全部</option>${nodes().map(node=>`<option value="${esc(node.id)}"${node.id===nodeSel?' selected':''}>${esc(node.node_name)}</option>`).join('')}</select></label>`;
  const html=`<div class="notice" id="dmaProtoNotice"></div><section id="dmaKpis" class="kpi-grid four"></section><section class="chart-grid" id="dmaCharts"></section><section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">分区计量与流量计</h2><div class="card-subtitle">物理拓扑、夜间流量、瞬时流量、压力与供售水</div></div><button type="button" class="btn" data-export-current>导出当前表</button></div><div class="tabs" role="tablist">${tabs.map(([key,label],index)=>`<button type="button" role="tab" data-dma-tab="${key}" class="${index===0?'active':''}" aria-selected="${index===0}">${label}</button>`).join('')}</div><div id="dmaPanel"></div></section>`;
  function drawKpis(){
   const notice=document.getElementById('dmaProtoNotice');
   if(notice)notice.innerHTML=P()?`${esc(protoLabel())} · 数据窗口 2026-01…10 · 当前期间 ${esc(periodRangeLabel())} · 口径：分区整表计量，用户数取期末快照，水量按期间累加。${risk('L1','分区计量为预置模拟，非真实接入')}`:`原型模拟数据未加载（prototype-data-v6.js）；分区指标显示 —，不补造数值。${risk('L1','原型数据未加载')}`;
   const monthRows=monthDaily(),bal=balanceRows().filter(row=>row.period===periodEnd()),partial=partialFilter(WB.state);
   const supply=knownSum(bal,'supply_vol'),sold=knownSum(bal,'sold_vol');
   const loss=supply!=null&&sold!=null&&supply>0?(supply-sold)/supply*100:null;
   const pressures=monthRows.map(row=>row.pressureMpa).filter(value=>value!=null&&Number.isFinite(Number(value)));
   const avgPressure=pressures.length?pressures.reduce((a,b)=>a+Number(b),0)/pressures.length:null;
   const online=knownSum(monthRows,'onlineSamples'),expected=knownSum(monthRows,'expectedSamples');
   const coverage=online!=null&&expected?online/expected*100:null;
   document.getElementById('dmaKpis').innerHTML=V.card('DMA 节点',String(nodes().length),'个','当前范围','flow')+V.card('期末月供水量',partial?'局部不适用':(supply==null?'—':fmt(supply,0)),'m³',partial?'局部用户筛选：整分区供水不适用':`${periodEnd()} 分区合计（模拟）`,'clock','orange')+V.card('平均压力',avgPressure==null?'—':fmt(avgPressure,3),'MPa',`${dmaMonth()} 逐日有效均值（模拟）`,'meter','green')+V.card('采集覆盖率',coverage==null?'—':fmt(coverage,2),'%','在线样本 / 期望样本（模拟）','chart');
  }
  function dmaTable(headers,rawRows,viewRows,sourceRows,title,notice,sourceLabel){
   const label=sourceLabel||protoLabel();
   const hasAction=headers[headers.length-1]==='操作';
   const exportHeaders=[...(hasAction?headers.slice(0,-1):headers),'数据来源'];
   stampTable('dma',title||'分区计量与流量计',exportHeaders,rawRows.map(row=>[...row,label]),sourceRows);
   const viewHeaders=hasAction?[...headers.slice(0,-1),'数据来源','操作']:[...headers,'数据来源'];
   const displayRows=viewRows.map(row=>hasAction?[...row.slice(0,-1),esc(label),row[row.length-1]]:[...row,esc(label)]);
   document.getElementById('dmaPanel').innerHTML=(notice||'')+V.table('dmaReadonly',viewHeaders,displayRows);
  }
  function openDmaDrawer({title,subtitle,body,csv}){
   S().openDrawer({title,subtitle,body,footer:`<button class="btn" data-close>关闭</button>${csv?'<button class="btn primary" id="dmaDrawerExport">导出明细</button>':''}`});
   if(csv)document.getElementById('dmaDrawerExport')?.addEventListener('click',()=>{const meta=E.bindExport(csv.rows,csv.sourceRows);E.downloadCSV(csv.name,csv.headers,csv.rows,meta);});
  }
  function openNodeDrawer(nodeId,opts={}){
   const node=nodeById().get(nodeId);if(!node)return;
   const links=linksByNode().get(nodeId)||[];
   let members=memberMap(WB.state).get(nodeId)||[];
   if(opts.memberFilter)members=members.filter(entry=>opts.memberFilter(entry.u));
   const linkByUser=new Map();links.forEach(link=>{if(link.userId!=null)linkByUser.set(link.userId,link);});
  const mainMeterId=(links.find(link=>link.role==='AREA_INLET')||{}).meterId||null;
  const csvRows=members.map(({m,u})=>({orgNodeId:u.orgNodeId,accountId:u.id,dmaId:nodeId,mainMeterId,userId:u.id,name:u.name,unified_code:u.unified_code,nature:u.nature,meterType:u.meterType,meterId:u.meterId,role:(linkByUser.get(u.id)||{}).role||'—',validFrom:m.validFrom,validTo:m.validTo}));
  const csvHeaders=['分区','主流量计ID','用户ID','用户名称','统一表卡','用水性质','水表类型','水表编号','计量角色','生效起','生效止','数据来源'];
  const csvDisplay=csvRows.map(row=>[nodeId,row.mainMeterId||'—',row.userId,row.name,row.unified_code,row.nature,row.meterType,row.meterId,row.role,row.validFrom,row.validTo||'—',protoLabel()]);
   const nodeKv=[['节点编码',node.device_code],['节点名称',node.node_name],['经营单位',node.company],['口径',node.caliber],['通信方式',node.comm_mode],['运行状态',node.run_status]];
   let balanceKv='';
   if(opts.balance){const rows=balanceRows().filter(row=>row.dmaId===nodeId&&dmaPeriods().includes(row.period));const supply=knownSum(rows,'supply_vol'),sold=knownSum(rows,'sold_vol');const endRow=rows.filter(row=>row.period===periodEnd()).pop();const loss=supply!=null&&sold!=null&&supply>0?(supply-sold)/supply*100:null;const partial=partialFilter(WB.state);
    balanceKv=`<h3>供售水（${esc(periodRangeLabel())}）</h3>${partial?`<div class="notice">局部用户筛选：整分区供水量/售水量/产销差率不适用（局部不适用）；下表用户数为授权成员期末快照。</div>`:''}<div class="kv-grid">${[['供水量(m³)',partial?'局部不适用':(supply==null?'—':fmt(supply,0))],['售水量(m³)',partial?'局部不适用':(sold==null?'—':fmt(sold,0))],['产销差率',partial?'局部不适用':(loss==null?'—':fmt(loss,2)+'%')],['用户数(期末)',endRow?.registered_count],['远传表数(期末)',endRow?.remote_count],['非居民表数(期末)',endRow?.nonres_count]].map(([label,value])=>`<div class="kv"><span>${label}</span><b>${text(value)}</b></div>`).join('')}</div>`;}
   const memberTitle=opts.memberLabel||'授权范围内成员用户';
   const body=`${opts.notice?`<div class="notice">${opts.notice}</div>`:''}<div class="kv-grid">${nodeKv.map(([label,value])=>`<div class="kv"><span>${label}</span><b>${text(value)}</b></div>`).join('')}</div>${balanceKv}<h3>计量表链接（流量计↔户表，${links.length}）</h3>${V.table('dmaLinks',['角色','水表编号','用户ID','用户名称','统一表卡'],links.map(link=>{const user=link.userId!=null?usersById().get(link.userId):null;return [text(link.role),text(link.meterId),text(link.userId),text(user?.name),text(user?.unified_code)];}))}<h3>${esc(memberTitle)}（${members.length}）</h3>${V.table('dmaMembers',['用户ID','用户名称','统一表卡','用水性质','水表类型','水表编号','计量角色'],members.map(({u})=>{const link=linkByUser.get(u.id);return [text(u.id),text(u.name),text(u.unified_code),text(u.nature),text(u.meterType),text(u.meterId),text(link?.role)];}))}`;
   openDmaDrawer({title:`${node.node_name} · 分区映射详情`,subtitle:`${protoLabel()} · 成员按当前身份授权范围裁剪`,body,csv:{name:`DMA映射_${node.id}.csv`,headers:csvHeaders,rows:csvDisplay,sourceRows:csvRows}});
  }
  function openDailyDrawer(nodeId,date){
   const node=nodeById().get(nodeId);if(!node)return;
   const row=monthDaily().find(item=>item.dmaId===nodeId&&String(item.date)===String(date));
   if(!row){S().toast('当前范围无该日计量记录');return;}
   const fields=[['日期',row.date],['分区',node.node_name],['起始累计(m³)',row.startVolume],['期末累计(m³)',row.endVolume],['日用水量(m³)',row.dailyVolume],['累加用水量(m³)',row.cumulativeVolume],['夜间流量(m³)',row.nightVolume],['压力(MPa)',row.pressureMpa],['在线样本',`${row.onlineSamples}/${row.expectedSamples}`]];
   openDmaDrawer({title:`${node.node_name} · ${date} 日计量`,subtitle:protoLabel(),body:`<div class="kv-grid">${fields.map(([label,value])=>`<div class="kv"><span>${label}</span><b>${text(value)}</b></div>`).join('')}</div><div class="notice">日用水量=期末累计−起始累计；累加用水量为连续计数器读数，不重复累加。夜间流量为远传表模拟量，不按户分摊。</div>`,csv:{name:`DMA日计量_${nodeId}_${date}.csv`,headers:['日期','分区','起始累计','期末累计','日用水量','累加用水量','夜间流量','压力','在线样本','期望样本','数据来源'],rows:[[row.date,node.node_name,row.startVolume,row.endVolume,row.dailyVolume,row.cumulativeVolume,row.nightVolume,row.pressureMpa,row.onlineSamples,row.expectedSamples,protoLabel()]],sourceRows:[{...row}]}});
  }
  function openPressureDrawer(nodeId){
   const node=nodeById().get(nodeId);if(!node)return;
   const rows=monthDaily().filter(row=>row.dmaId===nodeId).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
   const body=`<div class="notice">${esc(protoLabel())} · ${esc(dmaMonth())} 逐日压力与在线样本；缺测日不补 0。</div>${V.table('dmaPressureDaily',['日期','压力(MPa)','在线样本','期望样本'],rows.map(row=>[text(row.date),row.pressureMpa==null?'—':number(row.pressureMpa,3),text(row.onlineSamples),text(row.expectedSamples)]))}`;
   openDmaDrawer({title:`${node.node_name} · 逐日压力`,subtitle:protoLabel(),body,csv:{name:`DMA压力_${nodeId}_${dmaMonth()}.csv`,headers:['日期','分区','压力(MPa)','在线样本','期望样本','数据来源'],rows:rows.map(row=>[row.date,node.node_name,row.pressureMpa,row.onlineSamples,row.expectedSamples,protoLabel()]),sourceRows:rows}});
  }
  function openNightDrawer(nodeId,date){
   const node=nodeById().get(nodeId);if(!node)return;
   const links=(linksByNode().get(nodeId)||[]).filter(link=>link.role==='REMOTE');
   const rows=monthDaily().filter(row=>row.dmaId===nodeId);
   const total=knownSum(rows,'nightVolume');
   const body=`<div class="notice">${esc(protoLabel())} · 夜间流量按远传表整表模拟，不按户分摊；当月累加 ${total==null?'—':fmt(total,0)} m³。</div><h3>远传表链接（REMOTE，${links.length}）</h3>${V.table('dmaRemoteLinks',['水表编号','用户ID','用户名称','统一表卡'],links.map(link=>{const user=link.userId!=null?usersById().get(link.userId):null;return [text(link.meterId),text(link.userId),text(user?.name),text(user?.unified_code)];}))}`;
   openDmaDrawer({title:`${node.node_name} · 夜间流量${date?' · '+date:''}`,subtitle:protoLabel(),body,csv:{name:`DMA远传表_${nodeId}.csv`,headers:['分区','水表编号','用户ID','用户名称','统一表卡','角色','数据来源'],rows:links.map(link=>{const user=link.userId!=null?usersById().get(link.userId):null;return [node.node_name,link.meterId,link.userId,user?.name,user?.unified_code,link.role,protoLabel()];}),sourceRows:links.map(link=>({...link,orgNodeId:link.orgNodeId||node.orgNodeId}))}});
  }
  function openDmaDetail(kind,nodeId,date){
   if(kind==='daily')return openDailyDrawer(nodeId,date);
   if(kind==='pressure')return openPressureDrawer(nodeId);
   if(kind==='night')return openNightDrawer(nodeId,date);
   if(kind==='remote')return openNodeDrawer(nodeId,{memberFilter:isRemote,memberLabel:'远传表成员用户（按水表类型）',notice:'表数占比分子为分区远传表数（期末，计量表级）；下列为授权范围内远传表成员用户，水量占比按期间售水量计算。'});
   if(kind==='nonres')return openNodeDrawer(nodeId,{memberFilter:isNonres,memberLabel:'非居民类成员用户（非居民/特行）',notice:'表数占比分子为分区非居民表数（期末，计量表级）；下列为授权范围内非居民类成员用户，水量占比按期间售水量计算。'});
   return openNodeDrawer(nodeId,{balance:kind==='balance'});
  }
  const DMAX={
   night:{id:'C-DMA-01',title:'夜间流量（按日）',subtitle:'远传表夜间模拟量按日合计；不按户分摊'},
   hourly:{id:'C-DMA-02',title:'24 小时瞬时流量曲线（旧样例）',subtitle:'仅旧逐时样例，与新日计量口径不同，不拼接'},
   pressure:{id:'C-DMA-03',title:'各节点平均压力',subtitle:'逐日压力有效均值；缺测不补 0'},
   balance:{id:'C-DMA-04',title:'分区供售水量与产销差',subtitle:'期末账期各分区供水量、售水量与产销差率'},
   daily:{id:'C-DMA-05',title:'日用水量与累加用水量',subtitle:'日用水量=期末−起始；累加用水量为连续计数器读数'},
   online:{id:'C-DMA-06',title:'逐日采集覆盖率',subtitle:'在线样本 / 期望样本（每日期望 24，模拟）'}
  };
  const scopedDaily=()=>monthDaily().filter(row=>!nodeSel||row.dmaId===nodeSel);
  function nightSeries(){const byDay=new Map();scopedDaily().forEach(row=>{const day=String(row.date).slice(0,10);byDay.set(day,(byDay.get(day)||0)+(Number(row.nightVolume)||0));});return [...byDay.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([day,value])=>({name:day.slice(5),value:+value.toFixed(2)}));}
  function dailySeries(){const byDay=new Map();scopedDaily().forEach(row=>{const day=String(row.date).slice(0,10);const entry=byDay.get(day)||{daily:0,cumulative:0};entry.daily+=Number(row.dailyVolume)||0;entry.cumulative+=Number(row.cumulativeVolume)||0;byDay.set(day,entry);});return [...byDay.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([day,entry])=>({name:day.slice(5),daily:+entry.daily.toFixed(2),cumulative:+entry.cumulative.toFixed(2)}));}
  function onlineSeries(){const byDay=new Map();scopedDaily().forEach(row=>{const day=String(row.date).slice(0,10);const entry=byDay.get(day)||{online:0,expected:0};entry.online+=Number(row.onlineSamples)||0;entry.expected+=Number(row.expectedSamples)||0;byDay.set(day,entry);});return [...byDay.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([day,entry])=>({name:day.slice(5),value:entry.expected?+(entry.online/entry.expected*100).toFixed(2):null}));}
  function pressureByNode(){const byNode=new Map();monthDaily().forEach(row=>{if(row.pressureMpa==null)return;const entry=byNode.get(row.dmaId)||{sum:0,count:0};entry.sum+=Number(row.pressureMpa);entry.count+=1;byNode.set(row.dmaId,entry);});return [...byNode.entries()].map(([id,entry])=>({id,name:nodeById().get(id)?.node_name||id,value:+(entry.sum/entry.count).toFixed(3)})).sort((a,b)=>b.value-a.value);}
  function balanceByNode(){const end=periodEnd(),partial=partialFilter(WB.state);return balanceRows().filter(row=>row.period===end).map(row=>({id:row.dmaId,name:row.nodeName,supply:partial?null:row.supply_vol,sold:partial?null:row.sold_vol,loss:partial?null:(row.supply_vol?+(((row.supply_vol-row.sold_vol)/row.supply_vol)*100).toFixed(2):null)}));}
  function hourlySeries(){const byHour=new Map();dmaHourly().forEach(row=>{const entry=byHour.get(row.hour)||{sum:0,count:0};entry.sum+=row.inst_flow;entry.count+=1;byHour.set(row.hour,entry);});return [...byHour.entries()].sort((a,b)=>a[0]-b[0]).map(([hour,entry])=>({name:`${String(hour).padStart(2,'0')}:00`,value:+(entry.sum/entry.count).toFixed(2)}));}
  function lineOption(data,{unit='m³',color='#317FC2',name='数值',second=null,key='value'}={}){
   if(!data.length)return E.emptyOption();
   const series=[{name,type:'line',smooth:true,symbolSize:5,data:data.map(item=>item[key]),lineStyle:{width:2,color},itemStyle:{color}}];
   const yAxis=[{type:'value',name:unit,axisLabel:{fontSize:10}}];
   if(second){series.push({name:second.name,type:'line',yAxisIndex:1,smooth:true,symbolSize:5,data:data.map(item=>item[second.key]),lineStyle:{width:2,color:'#F58B3C'},itemStyle:{color:'#F58B3C'}});yAxis.push({type:'value',name:second.unit,axisLabel:{fontSize:10},splitLine:{show:false}});}
   return {color:[color,'#F58B3C'],tooltip:{trigger:'axis'},legend:second?{bottom:0,textStyle:{fontSize:10,color:'#758697'}}:undefined,grid:{left:56,right:second?56:20,top:26,bottom:second?52:36},xAxis:{type:'category',data:data.map(item=>item.name),axisLabel:{fontSize:10}},yAxis,series};
  }
  function balanceOption(){const data=balanceByNode();if(!data.length)return E.emptyOption();if(partialFilter(WB.state))return E.emptyOption('局部用户筛选：整分区供水量/售水量/产销差率不适用（局部不适用）');
   return {color:['#317FC2','#41A75E','#F58B3C'],tooltip:{trigger:'axis'},legend:{bottom:0,textStyle:{fontSize:10,color:'#758697'}},grid:{left:56,right:56,top:26,bottom:52},xAxis:{type:'category',data:data.map(item=>item.name),axisLabel:{fontSize:10,rotate:data.length>5?22:0}},yAxis:[{type:'value',name:'m³',axisLabel:{fontSize:10}},{type:'value',name:'产销差率(%)',axisLabel:{fontSize:10,formatter:'{value}%'}}],series:[{name:'供水量',type:'bar',barMaxWidth:26,data:data.map(item=>item.supply),itemStyle:{color:'#317FC2',borderRadius:[4,4,0,0]}},{name:'售水量',type:'bar',barMaxWidth:26,data:data.map(item=>item.sold),itemStyle:{color:'#41A75E',borderRadius:[4,4,0,0]}},{name:'产销差率',type:'line',yAxisIndex:1,smooth:true,symbolSize:6,data:data.map(item=>item.loss),lineStyle:{width:2,color:'#F58B3C'},itemStyle:{color:'#F58B3C'}}]};}
  function pressureOption(){const data=pressureByNode();if(!data.length)return E.emptyOption();
   return {color:['#8E6FD8'],tooltip:{trigger:'item'},grid:{left:56,right:20,top:26,bottom:58},xAxis:{type:'category',data:data.map(item=>item.name),axisLabel:{fontSize:10,rotate:24}},yAxis:{type:'value',name:'MPa',axisLabel:{fontSize:10}},series:[{name:'平均压力',type:'bar',barMaxWidth:26,data:data.map(item=>item.value),itemStyle:{color:'#8E6FD8',borderRadius:[4,4,0,0]},label:{show:true,position:'top',fontSize:10,color:'#5B7A96'}}]};}
  function dmaChartDefs(kind){
   const meta=DMAX[kind];
   const base={id:meta.id,title:meta.title,subtitle:meta.subtitle,sourceLabel:kind==='hourly'?'源系统样例（旧逐时瞬时流量）':protoLabel(),dimensions:[],periodFilter:false,wide:true};
   const nodeByName=name=>nodes().find(node=>node.node_name===name);
   if(kind==='balance')return {...base,headers:['分区','供水量(m³)','售水量(m³)','产销差率(%)'],data:()=>balanceRows().filter(row=>dmaPeriods().includes(row.period)),getOption:()=>balanceOption(),getRows:()=>balanceByNode().map(item=>[item.name,item.supply==null?'局部不适用':item.supply,item.sold==null?'局部不适用':item.sold,item.loss==null?'局部不适用':item.loss]),onClick:params=>{const node=nodeByName(params?.name);if(node)openNodeDrawer(node.id,{balance:true});}};
   if(kind==='pressure')return {...base,headers:['分区','平均压力(MPa)'],data:()=>monthDaily(),getOption:()=>pressureOption(),getRows:()=>pressureByNode().map(item=>[item.name,item.value]),onClick:params=>{const node=nodeByName(params?.name);if(node)openPressureDrawer(node.id);}};
   if(kind==='hourly')return {...base,headers:['时刻','平均瞬时流量(m³/h)'],data:()=>dmaHourly(),getOption:()=>lineOption(hourlySeries(),{unit:'m³/h',name:'平均瞬时流量'}),getRows:()=>hourlySeries().map(item=>[item.name,item.value])};
   if(kind==='daily')return {...base,headers:['日期','日用水量(m³)','累加用水量(m³)'],data:()=>scopedDaily(),getOption:()=>lineOption(dailySeries(),{unit:'m³',name:'日用水量',key:'daily',second:{name:'累加用水量',key:'cumulative',unit:'m³'}}),getRows:()=>dailySeries().map(item=>[item.name,item.daily,item.cumulative]),onClick:params=>{if(nodeSel)openDailyDrawer(nodeSel,`${dmaMonth()}-${params?.name}`);else S().toast('选择单一分区后可查看该日计量详情');}};
   if(kind==='online')return {...base,headers:['日期','采集覆盖率(%)'],data:()=>scopedDaily(),getOption:()=>lineOption(onlineSeries(),{unit:'%',color:'#41A75E',name:'采集覆盖率'}),getRows:()=>onlineSeries().map(item=>[item.name,item.value])};
   return {...base,headers:['日期','夜间流量(m³)'],data:()=>scopedDaily(),getOption:()=>lineOption(nightSeries(),{unit:'m³',name:'夜间流量'}),getRows:()=>nightSeries().map(item=>[item.name,item.value]),onClick:params=>{if(nodeSel)openNightDrawer(nodeSel,`${dmaMonth()}-${params?.name}`);else S().toast('选择单一分区后可查看远传表明细');}};
  }
  const CHART_FOR={night:'night',hourly:'hourly',pressure:'pressure',balance:'balance',dailyVolume:'daily',dailyOnline:'online'};
  let dmaChartKind=null;
  function mountDmaCharts(){
   const host=document.getElementById('dmaCharts');if(!host)return;
   Object.values(DMAX).forEach(meta=>{const entry=E.charts.get(meta.id);if(entry){try{entry.chart.dispose();}catch(error){}E.charts.delete(meta.id);}});
   if(!dmaChartKind||!DMAX[dmaChartKind]){host.innerHTML='';return;}
   const def=dmaChartDefs(dmaChartKind);
   host.innerHTML=`<div>${E.chartCard(def)}</div>`;
   E.registerChart(def.id,def.id,def);
  }
  function draw(kind){
   tab=kind;
   if(!nodes().length){stampTable('dma','分区计量与流量计',['分区','状态'],[],[]);document.getElementById('dmaPanel').innerHTML=emptyBlock('当前范围无分区','当前组织范围不覆盖任何分区所属单位；整分区供售水仅在集团/整单位等完整范围展示，所/线路局部范围标注局部不适用。');return;}
   const f=WB.state,partial=partialFilter(f),mm=memberMap(f),links=linksByNode();
   if(kind==='topology'){
    const headers=['节点编码','节点名称','父节点','节点类型','经营单位','口径','通信方式','运行状态','成员用户数','计量表链接数','操作'];
    const raw=[],view=[];
    nodes().forEach(node=>{const memberCount=(mm.get(node.id)||[]).length,linkCount=(links.get(node.id)||[]).length;raw.push([node.device_code,node.node_name,node.parent_node_id,node.node_kind,node.company,node.caliber,node.comm_mode,node.run_status,memberCount,linkCount]);view.push([text(node.device_code),text(node.node_name),text(node.parent_node_id),text(node.node_kind),text(node.company),text(node.caliber),text(node.comm_mode),text(node.run_status),number(memberCount,0),number(linkCount,0),detailBtn('mapping',node.id)]);});
    dmaTable(headers,raw,view,nodes(),'分区物理拓扑',`<div class="notice">${esc(protoLabel())} · 拓扑与流量计↔户表映射为预置模拟；详情可查看授权范围内成员用户与水表。${risk('L1','分区计量为预置模拟，非真实接入')}</div>`,P()?`节点台账：源系统样例；成员/链接计数：${protoLabel()}`:'源系统样例');
   }else if(kind==='balance'){
    const periods=new Set(dmaPeriods()),rows=balanceRows().filter(row=>periods.has(row.period)),byNode=new Map();
    rows.forEach(row=>{const entry=byNode.get(row.dmaId)||{supply:0,sold:0,remoteSold:0,nonresSold:0,end:null};entry.supply+=Number(row.supply_vol)||0;entry.sold+=Number(row.sold_vol)||0;entry.remoteSold+=Number(row.remote_sold_vol)||0;entry.nonresSold+=Number(row.nonres_sold_vol)||0;if(row.period===periodEnd())entry.end=row;byNode.set(row.dmaId,entry);});
    const headers=['分区','经营单位','期间','供水量(m³)','售水量(m³)','产销差率','用户数(期末)','远传表数(期末)','非居民表数(期末)','操作'],raw=[],view=[];
    nodes().forEach(node=>{const members=mm.get(node.id)||[],agg=byNode.get(node.id);
     if(partial){const remote=members.filter(entry=>isRemote(entry.u)).length,nonres=members.filter(entry=>isNonres(entry.u)).length;raw.push([node.node_name,node.company,periodRangeLabel(),null,null,null,members.length,remote,nonres]);view.push([text(node.node_name),text(node.company),text(periodRangeLabel()),'局部不适用','局部不适用','局部不适用',number(members.length,0),number(remote,0),number(nonres,0),detailBtn('mapping',node.id)]);}
     else{const supply=agg?agg.supply:null,sold=agg?agg.sold:null,loss=supply!=null&&sold!=null&&supply>0?(supply-sold)/supply*100:null,end=agg?.end;raw.push([node.node_name,node.company,periodRangeLabel(),supply,sold,loss,end?.registered_count,end?.remote_count,end?.nonres_count]);view.push([text(node.node_name),text(node.company),text(periodRangeLabel()),supply==null?'—':number(supply,0),sold==null?'—':number(sold,0),loss==null?'—':number(loss,2)+'%',end?.registered_count==null?'—':number(end.registered_count,0),end?.remote_count==null?'—':number(end.remote_count,0),end?.nonres_count==null?'—':number(end.nonres_count,0),detailBtn('balance',node.id)]);}});
    const note=partial?`${esc(protoLabel())} · 局部用户筛选下供水量/售水量/产销差率为“局部不适用”（整分区供水量不可套用到部分用户）；用户数为授权成员期末快照。`:`${esc(protoLabel())} · 供售水量按 ${esc(periodRangeLabel())} 累加，用户数/远传/非居民表数为 ${esc(periodEnd())} 期末快照；产销差率=(供水−售水)/供水。`;
    dmaTable(headers,raw,view,rows,'分区供售水分析',`<div class="notice">${note}${risk('L1','分区计量为预置模拟，非真实接入')}</div>`);
   }else if(kind==='dailyVolume'){
    const rows=monthDaily().filter(row=>!nodeSel||row.dmaId===nodeSel).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.dmaId).localeCompare(String(b.dmaId)));
    const headers=['日期','分区','起始累计(m³)','期末累计(m³)','日用水量(m³)','累加用水量(m³)','在线样本','操作'],raw=[],view=[];
    rows.forEach(row=>{raw.push([row.date,row.nodeName,row.startVolume,row.endVolume,row.dailyVolume,row.cumulativeVolume,`${row.onlineSamples}/${row.expectedSamples}`]);view.push([text(row.date),text(row.nodeName),number(row.startVolume,0),number(row.endVolume,0),number(row.dailyVolume,0),number(row.cumulativeVolume,0),text(`${row.onlineSamples}/${row.expectedSamples}`),detailBtn('daily',row.dmaId,` data-dma-date="${esc(row.date)}"`)]);});
    dmaTable(headers,raw,view,rows,'分区日用水量',`<div class="notice">${esc(protoLabel())} · ${esc(dmaMonth())} 逐日计量；日用水量=期末累计−起始累计，累加用水量为连续计数器读数，不重复累加。${nodeSelectHtml()}</div>`);
   }else if(kind==='night'){
    const rows=monthDaily().filter(row=>!nodeSel||row.dmaId===nodeSel).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.dmaId).localeCompare(String(b.dmaId)));
    const cum=new Map(),headers=['日期','分区','当日夜间流量(m³)','当月累加夜间流量(m³)','操作'],raw=[],view=[];
    rows.forEach(row=>{const c=(cum.get(row.dmaId)||0)+(Number(row.nightVolume)||0);cum.set(row.dmaId,c);raw.push([row.date,row.nodeName,row.nightVolume,c]);view.push([text(row.date),text(row.nodeName),number(row.nightVolume,0),number(c,0),detailBtn('night',row.dmaId,` data-dma-date="${esc(row.date)}"`)]);});
    dmaTable(headers,raw,view,rows,'分区夜间流量',`<div class="notice">${esc(protoLabel())} · 夜间流量为远传表夜间模拟量，不按户分摊；累加为当月逐日求和。${nodeSelectHtml()}</div>`);
   }else if(kind==='pressure'){
    const rows=monthDaily(),byNode=new Map();
    rows.forEach(row=>{const entry=byNode.get(row.dmaId)||{sum:0,count:0,min:null,max:null,online:0,expected:0};if(row.pressureMpa!=null){const value=Number(row.pressureMpa);entry.sum+=value;entry.count+=1;entry.min=entry.min==null?value:Math.min(entry.min,value);entry.max=entry.max==null?value:Math.max(entry.max,value);}entry.online+=Number(row.onlineSamples)||0;entry.expected+=Number(row.expectedSamples)||0;byNode.set(row.dmaId,entry);});
    const headers=['分区','经营单位','平均压力(MPa)','最低(MPa)','最高(MPa)','有效天数','采集覆盖率','操作'],raw=[],view=[];
    nodes().forEach(node=>{const entry=byNode.get(node.id);if(!entry)return;const avg=entry.count?entry.sum/entry.count:null,coverage=entry.expected?entry.online/entry.expected*100:null;raw.push([node.node_name,node.company,avg,entry.min,entry.max,entry.count,coverage]);view.push([text(node.node_name),text(node.company),avg==null?'—':number(avg,3),entry.min==null?'—':number(entry.min,3),entry.max==null?'—':number(entry.max,3),number(entry.count,0),coverage==null?'—':number(coverage,2)+'%',detailBtn('pressure',node.id)]);});
    dmaTable(headers,raw,view,rows,'分区压力监测',`<div class="notice">${esc(protoLabel())} · 压力为 ${esc(dmaMonth())} 逐日模拟均值，按有效日统计，缺测不补 0；覆盖率=在线样本/期望样本。</div>`);
   }else if(kind==='dailyOnline'){
    const rows=monthDaily().filter(row=>!nodeSel||row.dmaId===nodeSel).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.dmaId).localeCompare(String(b.dmaId)));
    const headers=['日期','分区','在线样本','期望样本','采集覆盖率','数据状态','操作'],raw=[],view=[];
    rows.forEach(row=>{const coverage=row.expectedSamples?row.onlineSamples/row.expectedSamples*100:null;raw.push([row.date,row.nodeName,row.onlineSamples,row.expectedSamples,coverage,'模拟采集']);view.push([text(row.date),text(row.nodeName),number(row.onlineSamples,0),number(row.expectedSamples,0),coverage==null?'—':number(coverage,2)+'%','<span class="badge gray">模拟采集</span>',detailBtn('daily',row.dmaId,` data-dma-date="${esc(row.date)}"`)]);});
    dmaTable(headers,raw,view,rows,'分区逐日在线',`<div class="notice">${esc(protoLabel())} · 在线样本为预置模拟（每日期望 24），非真实采集接入。${nodeSelectHtml()}</div>`);
   }else if(kind==='remoteRatio'||kind==='nonresRatio'){
    const remote=kind==='remoteRatio',periods=new Set(dmaPeriods()),rows=balanceRows().filter(row=>periods.has(row.period)),byNode=new Map();
    rows.forEach(row=>{const entry=byNode.get(row.dmaId)||{sold:0,part:0,end:null};entry.sold+=Number(row.sold_vol)||0;entry.part+=Number(remote?row.remote_sold_vol:row.nonres_sold_vol)||0;if(row.period===periodEnd())entry.end=row;byNode.set(row.dmaId,entry);});
    const label=remote?'远传表':'非居民表',headers=['分区','经营单位',`${label}数(期末)`,'用户数(期末)','表数占比',`${label}水量(期间)`,'总售水量(期间)','水量占比','操作'],raw=[],view=[];
    nodes().forEach(node=>{const members=mm.get(node.id)||[],agg=byNode.get(node.id);
     if(partial){const count=members.filter(entry=>(remote?isRemote(entry.u):isNonres(entry.u))).length,ratio=members.length?count/members.length*100:null;raw.push([node.node_name,node.company,count,members.length,ratio,null,null,null]);view.push([text(node.node_name),text(node.company),number(count,0),number(members.length,0),ratio==null?'—':number(ratio,2)+'%','局部不适用','局部不适用','局部不适用',detailBtn(remote?'remote':'nonres',node.id)]);}
     else{const end=agg?.end,count=end?(remote?end.remote_count:end.nonres_count):null,reg=end?.registered_count,ratio=count!=null&&reg?count/reg*100:null,vol=agg?agg.part:null,sold=agg?agg.sold:null,volRatio=vol!=null&&sold?vol/sold*100:null;raw.push([node.node_name,node.company,count,reg,ratio,vol,sold,volRatio]);view.push([text(node.node_name),text(node.company),count==null?'—':number(count,0),reg==null?'—':number(reg,0),ratio==null?'—':number(ratio,2)+'%',vol==null?'—':number(vol,0),sold==null?'—':number(sold,0),volRatio==null?'—':number(volRatio,2)+'%',detailBtn(remote?'remote':'nonres',node.id)]);}});
    const note=partial?`${esc(protoLabel())} · 局部用户筛选下水量占比为“局部不适用”；表数占比按授权成员期末计算。`:`${esc(protoLabel())} · 表数占比=${label}数(期末)/用户数(期末)；水量占比=${label}水量(期间)/总售水量(期间)，同范围同分母。`;
    dmaTable(headers,raw,view,rows,remote?'分区远传表占比':'分区非居民水表占比',`<div class="notice">${note}${risk('L1','分区计量为预置模拟，非真实接入')}</div>`);
   }else if(kind==='syncYear'){
    const rows=balanceRows(),years=[...new Set(rows.map(row=>String(row.period).slice(0,4)))].sort(),maxYear=years[years.length-1];
    const headers=['分区','经营单位','账期','供水量(m³)','售水量(m³)','产销差率(%)','去年同期供水','同比(%)'],raw=[],view=[];
    rows.filter(row=>String(row.period).slice(0,4)===maxYear).forEach(row=>{const loss=row.supply_vol?((row.supply_vol-row.sold_vol)/row.supply_vol*100):null;
     if(partial){raw.push([row.nodeName,row.company,row.period,null,null,null,null,null]);view.push([text(row.nodeName),text(row.company),text(row.period),'局部不适用','局部不适用','局部不适用','—','—']);}
     else{raw.push([row.nodeName,row.company,row.period,row.supply_vol,row.sold_vol,loss,null,null]);view.push([text(row.nodeName),text(row.company),text(row.period),number(row.supply_vol,0),number(row.sold_vol,0),loss==null?'—':number(loss,2),'—','—']);}});
    const note=partial?`${esc(protoLabel())} · 局部用户筛选下供水量/售水量/产销差率为“局部不适用”（整分区供水量不可套用到部分用户）；样例仅含 ${esc(years.join('、')||'—')} 年，无上年同期来源，同比与去年同期保留 —，不补造。`:`${esc(protoLabel())} · 样例仅含 ${esc(years.join('、')||'—')} 年，无上年同期来源；同比与去年同期保留 —，不补造。`;
    dmaTable(headers,raw,view,rows,'分区同步年分析',`<div class="notice">${note}</div>`);
   }else{
    const rows=dmaHourly(),byHour=new Map();
    rows.forEach(row=>{const entry=byHour.get(row.hour)||{sum:0,count:0,pressure:0};entry.sum+=row.inst_flow;entry.count+=1;entry.pressure+=row.pressure_mpa;byHour.set(row.hour,entry);});
    const headers=['时刻','平均瞬时流量(m³/h)','平均压力(MPa)','样本数','操作'],raw=[],view=[];
    [...byHour.entries()].sort((a,b)=>a[0]-b[0]).forEach(([hour,entry])=>{const avg=entry.sum/entry.count,pressure=entry.pressure/entry.count;raw.push([`${String(hour).padStart(2,'0')}:00`,avg,pressure,entry.count]);view.push([text(`${String(hour).padStart(2,'0')}:00`),number(avg,2),number(pressure,3),number(entry.count,0),'<span class="badge gray">旧样例</span>']);});
    dmaTable(headers,raw,view,rows,'分区24小时瞬时流量',`<div class="notice">24 小时瞬时流量为旧逐时样例（${esc(dmaMonth())}），与新日计量口径不同，不拼接、不补造；逐日用水请查看“日用水量、累加用水量”。${risk('L1','旧逐时样例，非新日计量')}</div>`,'源系统样例（旧逐时瞬时流量）');
   }
  }
 return {html,mount(){
  dmaChartKind=CHART_FOR[tab]||null;
  draw(tab);drawKpis();mountDmaCharts();
  const panel=document.getElementById('dmaPanel');
  document.querySelectorAll('[data-dma-tab]').forEach(btn=>btn.onclick=()=>{tab=btn.dataset.dmaTab;nodeSel='';dmaChartKind=CHART_FOR[tab]||null;document.querySelectorAll('[data-dma-tab]').forEach(item=>{item.classList.toggle('active',item===btn);item.setAttribute('aria-selected',String(item===btn));});draw(tab);drawKpis();mountDmaCharts();});
  panel.addEventListener('click',event=>{const btn=event.target.closest('[data-dma-detail]');if(btn)openDmaDetail(btn.dataset.dmaDetail,btn.dataset.dmaNode,btn.dataset.dmaDate);});
  panel.addEventListener('change',event=>{if(event.target.matches('[data-dma-node-select]')){nodeSel=event.target.value||'';draw(tab);mountDmaCharts();}});
 }};
};

 /* 指标预测：历史真实样例与计划分开；未来结果未接入，不使用计划系数或固定MAPE。 */
 const forecastMetrics={water:{label:'售水量',field:'sold_vol',unit:'m³',candidate:false},charge:{label:'收费率',field:'charge_rate_pct',unit:'%',candidate:true},loss:{label:'产销差率',field:'loss_rate_pct',unit:'%',candidate:true},price:{label:'售水单价',field:'avg_price_yuan',unit:'元/m³',candidate:true}};
 /* 手工因子是内存对象：带组织归属，跨身份不串用，刷新复位。 */
 let forecastFactors=[];
 /* 演示督办单同样是内存对象：带组织归属与身份，跨身份不串用，刷新复位。 */
 let transferLog=[];
 const factorRoot=()=>{const roots=[...((scopeOf().roots)||[])];return roots[0]??null;};
 function visibleFactors(){return forecastFactors.filter(factor=>factor.orgNodeId!=null&&inScopeNode(factor.orgNodeId));}
 function visibleTransfers(){return transferLog.filter(item=>item.orgNodeId!=null&&inScopeNode(item.orgNodeId));}
 V.renderForecast=()=>{
  let metric='water',horizon='下月',chartDef;
  const html=`<div class="notice">售水量支持下月、季度、年度查询；其余指标为候选项，当前暂无未来预测数据。新增用户/供水区域按所选年自然月统计同批立户用户实际水量。${risk('L2','预测模型与手工因子未建，未来结果仅演示形态')}</div><div class="card metric-config"><div class="segmented" id="forecastMetrics" aria-label="预测指标">${Object.entries(forecastMetrics).map(([key,item])=>`<button type="button" data-forecast-metric="${key}" class="${key==='water'?'active':''}" aria-pressed="${key==='water'}">${item.label}${item.candidate?'（候选）':''}</button>`).join('')}</div><div class="tabs" id="forecastTabs"><button type="button" class="active" data-forecast-tab="history">指标趋势</button><button type="button" data-forecast-tab="future">指标预测</button><button type="button" data-forecast-tab="newuser">新增用户（立户时间）</button><button type="button" data-forecast-tab="area">供水区域</button></div></div><section id="forecastHistory"><div id="forecastChart"></div><section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">历史数据</h2><div class="card-subtitle">实际与计划分列，计划值不作为预测结果</div></div><button type="button" class="btn" data-export-current>导出历史</button></div><div id="forecastHistoryTable"></div></section></section><section class="card" id="forecastFuture" hidden><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">售水量预测</h2><div class="card-subtitle">下月、季度、年度到线路的结果待接入</div></div><div class="card-head-actions"><div class="segmented" id="forecastHorizon">${['下月','季度','年度'].map((item,index)=>`<button type="button" data-horizon="${item}" class="${index===0?'active':''}">${item}</button>`).join('')}</div></div></div><div id="forecastFuturePanel"></div></section><section class="card" id="forecastNewUser" hidden><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">新增用户（立户时间）</h2><div class="card-subtitle">按所选年自然月统计同批立户用户与实际水量</div></div><button type="button" class="btn" data-export-current>导出新增用户</button></div><div id="forecastNewUserTable"></div></section><section class="card" id="forecastArea" hidden><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">供水区域</h2><div class="card-subtitle">按经营单位/线路归集同批新增用户实际水量</div></div><button type="button" class="btn" data-export-current>导出供水区域</button></div><div id="forecastAreaTable"></div></section>`;
  function historyRows(ctx){const rows=E.trend(ctx.data,ctx.filters,ctx.state.granularity),field=forecastMetrics[metric].field;return rows.map(row=>metric==='water'?[row.name,row[field],row.plan_vol]:[row.name,row[field]]);}
  function drawHistoryTable(ctx){const headers=metric==='water'?['期间','实际售水量(m³)','计划值(m³，非预测)']:['期间',`实际${forecastMetrics[metric].label}(${forecastMetrics[metric].unit})`],rows=historyRows(ctx);stampTable('forecast',`${forecastMetrics[metric].label}历史趋势`,headers,rows,ctx.data);document.getElementById('forecastHistoryTable').innerHTML=V.table('forecastHistoryValues',headers,rows.slice(-18).map(row=>row.map(cell=>typeof cell==='number'?number(cell,metric==='price'?3:2):text(cell))));}
  function mountHistory(){
   chartDef={id:'C-FC-HISTORY',title:`${forecastMetrics[metric].label}历史趋势`,subtitle:metric==='water'?'实际售水量与计划值分列':'当前仅展示历史实际',dimensions:[],granularity:true,periodFilter:true,data:f=>E.filterFacts(f),getHeaders:()=>metric==='water'?['期间','实际售水量(m³)','计划值(m³，非预测)']:['期间',`实际${forecastMetrics[metric].label}(${forecastMetrics[metric].unit})`],getOption:ctx=>E.lineOption({data:E.trend(ctx.data,ctx.filters,ctx.state.granularity),metrics:metric==='water'?['sold_vol','plan_vol']:[forecastMetrics[metric].field],area:metric==='water'}),getRows:historyRows,afterRender:drawHistoryTable};
   E.registerChart(chartDef.id,chartDef.id,chartDef);
  }
  function bindFactors(){
   const save=document.getElementById('factorSave');
   if(!save)return;
   const ownerNode=factorRoot();
   const allowed=!!A()?.can?.('forecast.factor',{orgNodeId:ownerNode});
   save.disabled=!allowed;
   if(!allowed)save.title='当前身份不具备预测因子维护权限';
   save.onclick=()=>{
    /* handler 会跨身份切换存活：提交时按当前身份与当前节点重新判定，不依赖创建时的 allowed 常量。 */
    const current=A()?.current?.(),node=ownerNode!=null?ownerNode:(factorRoot());
    const allowedNow=!!(node!=null&&A()?.can?.('forecast.factor',{orgNodeId:node}));
    if(!allowedNow){
     window.WB_ADMIN?.log?.('forecast.factor',String(node||'未选择节点'),{result:'denied',reason:'超出当前身份数据范围或未开放此演示动作',orgNodeId:node||undefined,personaId:current?.personaId});
     S().toast('当前身份不具备预测因子维护权限，仅在显式演示身份下可用');return;
    }
    const read=id=>{const el=document.getElementById(id);return el?Number(el.value)||0:0;};
    const factor={orgNodeId:node,personaId:current?.personaId,month:WB.state.month,visit:read('factorVisit'),build:read('factorBuild'),temp:read('factorTemp')};
    forecastFactors.push(factor);
    window.WB_ADMIN?.log?.('forecast.factor',node,{targetLabel:`${WB.state.month} 售水量预测`,orgNodeId:node,personaId:current?.personaId,detail:`因子 走访${factor.visit}/建设${factor.build}/气温${factor.temp}（页面内存）`});
    const saved=visibleFactors(),hint=document.getElementById('factorSaved');
    if(hint)hint.textContent='已保存 '+saved.length+' 组：'+saved.map(f=>f.month+'/'+f.visit+'/'+f.build+'/'+f.temp).join('；');
    S().toast('因子已保存到当前页面内存（刷新清空，不落本地存储）');
   };
  }
  function shiftPeriodStr(period,delta){const[y,m]=period.split('-').map(Number);const total=y*12+(m-1)+delta;return `${Math.floor(total/12)}-${String(total%12+1).padStart(2,'0')}`;}
  function demoWaterForecast(){
   const scope={...WB.state,period:'近5年'};
   const all=(E.filterFacts?E.filterFacts(scope):[]).filter(row=>row.period>='2023-01'&&row.period<='2026-10');
   const periods=[...new Set(all.map(row=>row.period))].sort();
   const latest=periods[periods.length-1]||'2026-10';
   const byLine=new Map();
   all.forEach(row=>{const key=`${row.company||'—'}|${row.line||'未分线路'}`;if(!byLine.has(key))byLine.set(key,new Map());const map=byLine.get(key);map.set(row.period,(map.get(row.period)||0)+(Number(row.sold_vol)||0));});
   const sum=(map,list)=>list.reduce((total,p)=>total+(map.get(p)||0),0);
   const lastThree=periods.slice(-3),lastThreeLastYear=lastThree.map(p=>shiftPeriodStr(p,-12));
   const lastSix=periods.slice(-6);
   const targetMonths=horizon==='下月'?[shiftPeriodStr(latest,1)]:horizon==='季度'?[1,2,3].map(n=>shiftPeriodStr(latest,n)):[1,2,3,4,5,6,7,8,9,10,11,12].map(n=>shiftPeriodStr(latest,n));
   const factorAdjust=(visibleFactors().reduce((total,f)=>total+(Number(f.visit)||0)+(Number(f.build)||0),0))*10000;
   const rows=[];const errors=[];
   byLine.forEach((map,key)=>{
    const [company,line]=key.split('|');
    const recent=sum(map,lastThree),recentLastYear=sum(map,lastThreeLastYear);
    const growth=recentLastYear>0?Math.max(-.3,Math.min(.3,recent/recentLastYear-1)):.05;
    const fallback=recent?recent/lastThree.length:0;
    let forecast=0,baseSum=0,hasBase=true;
    targetMonths.forEach(m=>{const base=map.get(shiftPeriodStr(m,-12));if(base==null){hasBase=false;forecast+=fallback*(1+growth);}else{baseSum+=base;forecast+=base*(1+growth);}});
    lastSix.forEach(p=>{const actual=map.get(p),base=map.get(shiftPeriodStr(p,-12));if(actual>0&&base>0)errors.push(Math.abs(actual-base*(1+growth))/actual);});
    rows.push({company,line,forecast,baseSum,growth,hasBase});
   });
   const totalForecast=rows.reduce((total,row)=>total+row.forecast,0)||1;
   rows.forEach(row=>{row.adjusted=row.forecast+(factorAdjust>0?factorAdjust*row.forecast/totalForecast:0);});
   const mape=errors.length?+(errors.reduce((a,b)=>a+b,0)/errors.length*100).toFixed(2):null;
   const sorted=rows.filter(row=>row.adjusted>0).sort((a,b)=>b.adjusted-a.adjusted).slice(0,12);
   return {rows:sorted,targetMonths,mape,latest,factorAdjust,lineCount:rows.length,source:all};
  }
  function drawFuture(){
   const panel=document.getElementById('forecastFuturePanel'),item=forecastMetrics[metric];
   document.querySelector('#forecastFuture .card-title').textContent=`${item.label}预测`;
   const inputs=metric==='water'?`<div class="card-body"><h3>预测输入（手工因子，演示）</h3><div class="notice">因子仅保存在当前页面内存，刷新即清空，不写入本地存储；仅对售水量预测做加减调整。${risk('L2','预测模型为演示（同比基准×近期增幅），不代表正式算法')}</div><div class="table-scroll"><table class="data-table"><thead><tr><th>因子</th><th>输入值</th><th>口径 / 说明</th><th>状态</th></tr></thead><tbody><tr><td>非居民走访变动</td><td><input class="control" id="factorVisit" type="number" step="0.1" value="0" aria-label="非居民走访变动"></td><td>预计增减水量（万m³/月）</td><td><span class="badge gray">手工</span></td></tr><tr><td>报装在建估算</td><td><input class="control" id="factorBuild" type="number" step="0.1" value="0" aria-label="报装在建估算"></td><td>在建项目预计月水量（万m³）</td><td><span class="badge gray">手工</span></td></tr><tr><td>气象因子（气温）</td><td><input class="control" id="factorTemp" type="number" step="0.1" value="0" aria-label="气象因子气温"></td><td>预测期平均气温（℃）</td><td><span class="badge gray">手工</span></td></tr></tbody></table></div><div style="padding:12px 16px;display:flex;gap:10px;align-items:center"><button type="button" class="btn primary" id="factorSave">保存因子（内存）</button><span class="muted" id="factorSaved">${visibleFactors().length?'已保存 '+visibleFactors().length+' 组':'尚未保存因子'}</span></div></div>`:'';
   if(item.candidate&&metric!=='water'){
    stampTable('forecast','指标预测',['预测指标','目标期','状态'],[],src('forecasts'));
    panel.innerHTML=emptyBlock(`${item.label}为原型候选指标`,'当前仅提供候选指标选择，暂无可展示的预测结果。')+inputs;bindFactors();return;
   }
   const demo=demoWaterForecast();
   const kpis=`<div class="kpi-grid four" style="margin-bottom:10px">${V.card('覆盖线路',String(demo.lineCount),'条','当前范围有历史数据的线路')}${V.card('回测 MAPE',demo.mape==null?'—':fmt(demo.mape,2),'%','近 6 个月同比基准回测')}${V.card('目标期',demo.targetMonths[0]+' 起','',demo.targetMonths.length+' 个月')}${V.card('因子调整',fmt(demo.factorAdjust/10000,2),'万m³','手工因子合计')}</div>`;
   const headers=['经营单位','线路','目标期','预测值(万m³)','去年同期(万m³)','同比(%)','模型'];
   const rawRows=demo.rows.map(row=>[row.company,row.line,`${demo.targetMonths[0]}${demo.targetMonths.length>1?' ~ '+demo.targetMonths[demo.targetMonths.length-1]:''}`,Number((row.adjusted/10000).toFixed(2)),row.baseSum?Number((row.baseSum/10000).toFixed(2)):null,row.baseSum?Number(((row.adjusted/row.baseSum-1)*100).toFixed(1)):null,row.hasBase?'同比基准×近期增幅':'近 3 月均值回退']);
   const viewRows=rawRows.map(row=>[row[0],row[1],row[2],fmt(row[3],2),row[4]==null?'—':fmt(row[4],2),row[5]==null?'—':fmt(row[5],1),row[6]]);
   stampTable('forecast','售水量预测',headers,rawRows,demo.source);
   panel.innerHTML=kpis+V.table('forecastValues',headers,viewRows.map(row=>row.map(cell=>esc(text(cell)))))+inputs+`<div class="notice">演示模型：以“上年同月水量 ×（1+近 3 月同比增幅）”为基准，季度/年度为逐月累加；MAPE 为近 6 个月同比基准回测误差；手工因子按预测占比分摊。真实预测算法与因子权重待确认，本页不代表正式口径。${risk('L2','演示预测模型，未接入正式算法与天气/报装数据')}</div>`;
   bindFactors();
  }
  function selectedYear(){return String(WB.state.year||(WB.state.month||'2026-10').slice(0,4));}
  function newUserModel(){
   const year=selectedYear();
   const periodFacts=E.filterFacts(WB.state);
   const volBySeries=new Map();
   periodFacts.forEach(fact=>{const key=String(fact.seriesKey);const entry=volBySeries.get(key)||{res:0,non:0};const v=Number(fact.sold_vol);if(Number.isFinite(v)){if(String(fact.nature||'').startsWith('居民'))entry.res+=v;else entry.non+=v;}volBySeries.set(key,entry);});
   const users=(src('users')||[]).filter(user=>dimensionFilter(user,{...WB.state,nature:''}));
   const months=Array.from({length:12},(_,i)=>`${year}-${String(i+1).padStart(2,'0')}`);
   const rows=months.map(month=>{
    const cohort=users.filter(user=>String(user.regDate||'').slice(0,7)===month);
    let resCount=0,nonCount=0,resVol=0,nonVol=0;const series=new Set();
    cohort.forEach(user=>{const vol=volBySeries.get(String(user.id))||{res:0,non:0};series.add(String(user.id));if(String(user.nature||'').startsWith('居民')){resCount+=1;resVol+=vol.res;}else{nonCount+=1;nonVol+=vol.non;}});
    return {month,cohort,resCount,nonCount,resVol,nonVol,series};
   });
   const allSeries=new Set();rows.forEach(row=>row.series.forEach(key=>allSeries.add(key)));
   const source=periodFacts.filter(fact=>allSeries.has(String(fact.seriesKey)));
   return {year,rows,source,periodFacts,volBySeries,periodLabel:E.periodLabel(WB.state)};
  }
  function drawNewUser(){
   const panel=document.getElementById('forecastNewUserTable');if(!panel)return;
   const model=newUserModel();
   const headers=['自然月','居民新增户数','居民同批水量(m³)','非居民新增户数','非居民同批水量(m³)','加压表','数据状态'];
   const rawRows=model.rows.map(row=>[row.month,row.resCount,row.resVol,row.nonCount,row.nonVol,null,row.cohort.length?'真实计算':'无同批立户用户']);
   const viewRows=rawRows.map(row=>[text(row[0]),number(row[1],0),number(row[2],2),number(row[3],0),number(row[4],2),'—',text(row[6])]);
   stampTable('forecast',`新增用户（立户时间）· ${model.year}`,headers,rawRows,model.source);
   const totalRes=model.rows.reduce((total,row)=>total+row.resCount,0),totalNon=model.rows.reduce((total,row)=>total+row.nonCount,0);
   panel.innerHTML=`<div class="notice">立户月：${esc(model.year)} 年 1–12 月；水量期间：${esc(model.periodLabel)}。同批水量为该立户月用户在当前公共筛选期间的实际售水量，非全年水量摊入每月。居民/非居民按用水性质区分（非居民含特行）；加压表无表类↔用水性质映射，显示 —，不以表型猜测。未来报装/在建估算/加压新增无源，不伪造。${risk('L1','加压表及未来新增缺源，显示 —/待数据')}</div>`+(totalRes+totalNon?V.table('forecastNewUserValues',headers,viewRows):emptyBlock('所选年无同批立户用户',`当前公共筛选期间（${esc(model.periodLabel)}）内，${esc(model.year)} 年各自然月无可见立户用户；不更换全局期间。`));
  }
  function drawArea(){
   const panel=document.getElementById('forecastAreaTable');if(!panel)return;
   const model=newUserModel();
   const byLine=new Map();
   model.rows.forEach(row=>row.cohort.forEach(user=>{const key=`${user.company||'—'}|${user.line||'未分线路'}`;const entry=byLine.get(key)||{company:user.company||'—',line:user.line||'未分线路',count:0,vol:0};const vol=model.volBySeries.get(String(user.id))||{res:0,non:0};entry.count+=1;entry.vol+=vol.res+vol.non;byLine.set(key,entry);}));
   const headers=['经营单位','线路','新增用户','同批实际水量(m³)','数据状态'];
   const rawRows=[...byLine.values()].map(entry=>[entry.company,entry.line,entry.count,entry.vol,'真实计算']);
   const viewRows=rawRows.map(row=>[text(row[0]),text(row[1]),number(row[2],0),number(row[3],2),text(row[4])]);
   stampTable('forecast',`供水区域新增用户 · ${model.year}`,headers,rawRows,model.source);
   panel.innerHTML=`<div class="notice">立户月：${esc(model.year)} 年 1–12 月；水量期间：${esc(model.periodLabel)}。按真实经营单位/线路归集同批立户用户的当前期间实际水量；与新增用户页同一水量期间。未来报装/估算无源不补造。${risk('L1','区域新增按真实组织归集，缺源不补造')}</div>`+(rawRows.length?V.table('forecastAreaValues',headers,viewRows):emptyBlock('所选年无同批立户用户',`当前公共筛选期间内 ${esc(model.year)} 年无可见立户用户；不更换全局期间。`));
  }
  function showForecastTab(tab){
   document.getElementById('forecastHistory').hidden=tab!=='history';
   document.getElementById('forecastFuture').hidden=tab!=='future';
   document.getElementById('forecastNewUser').hidden=tab!=='newuser';
   document.getElementById('forecastArea').hidden=tab!=='area';
   if(tab==='future')drawFuture();else if(tab==='newuser')drawNewUser();else if(tab==='area')drawArea();else mountHistory();
  }
  return {html,mount(){document.getElementById('forecastChart').innerHTML='<article class="card chart-card" id="forecastHistoryCard"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title" id="forecastChartTitle">历史趋势</h2></div></div><div class="chart-toolbar"><div class="chart-filter-group"><label><span>粒度</span><select id="forecastGranularity" class="control compact"><option value="month">月</option><option value="quarter">季</option><option value="year">年</option></select></label></div><div class="chart-toolbar-actions"><button type="button" class="btn xs" data-chart-csv="C-FC-HISTORY">CSV</button><button type="button" class="btn xs" data-chart-png="C-FC-HISTORY">PNG</button></div></div><div class="chart" id="C-FC-HISTORY"></div></article>';mountHistory();document.getElementById('forecastGranularity').onchange=event=>{WB.chartState['C-FC-HISTORY'].granularity=event.target.value;E.refreshChart('C-FC-HISTORY');};document.querySelectorAll('[data-forecast-metric]').forEach(button=>button.onclick=()=>{metric=button.dataset.forecastMetric;document.querySelectorAll('[data-forecast-metric]').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',String(item===button));});document.getElementById('forecastChartTitle').textContent=`${forecastMetrics[metric].label}历史趋势`;const activeTab=(document.querySelector('[data-forecast-tab].active')||{}).dataset?.forecastTab||'history';showForecastTab(activeTab);});document.querySelectorAll('[data-forecast-tab]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-forecast-tab]').forEach(item=>item.classList.toggle('active',item===button));showForecastTab(button.dataset.forecastTab);});document.querySelectorAll('[data-horizon]').forEach(button=>button.onclick=()=>{horizon=button.dataset.horizon;document.querySelectorAll('[data-horizon]').forEach(item=>item.classList.toggle('active',item===button));drawFuture();});drawFuture();}};
 };

 /* 源工单只读：只使用已有收发处理字段，未提供时限和事件时不推断。 */
/* 工单三来源：SOURCE=上游样例源工单（只读，不标人工）；AUTO=预置规则自动建单样例（只读回放，非实时引擎）；
   MANUAL=本页用户预警转单生成的演示督办单（transferLog 真实动作）。合并集合统一统计/明细/导出，按 id 唯一，不重复计数。 */
V.prototypeAutoOrder=alertId=>{const P=window.WBPrototypeData;if(!P||alertId==null)return null;const example=list(P.automaticOrderExamples).find(row=>String(row.alertId)===String(alertId));if(!example)return null;const user=usersById().get(example.userId);if(!user)return null;return {id:example.id,source:'AUTO',creationMethod:'AUTO',userId:example.userId,accountId:user.id,alertId:example.alertId,ruleId:example.ruleId,ruleName:example.ruleName,type:example.type||'—',company:user.company,orgNodeId:example.ownerOrgNodeId||user.orgNodeId,unitId:user.unitId,lineKey:user.lineKey,org:user.org,line:user.line,card:user.unified_code,owner:example.createdBy||'规则引擎（模拟）',status:example.status||'已分派',createdAt:example.createdAt,sentAt:example.createdAt,triggeredAt:example.triggeredAt,createdBy:example.createdBy,history:list(example.history),readOnly:true};};
V.renderWork=()=>{
 /* 内存动作留痕：走平台既有日志接口，只记对象编号/授权组织/动作/结果，不写外部载荷。 */
 const audit=(action,target,options)=>{const admin=window.WB_ADMIN;if(!admin||typeof admin.log!=='function')return;admin.log(action,target,options||{});};
 const DENY_TRANSFER='超出当前身份数据范围或未开放此演示动作';
 const P=()=>window.WBPrototypeData||null;
 const protoLabel=()=>P()?.meta?.label||'原型模拟数据（非真实接入）';
 const sourceOrders=()=>filtered(src('sourceOrders'),WB.state,null).map(row=>({...row,source:'SOURCE',creationMethod:'SOURCE'}));
 const alerts=()=>filtered(src('alerts'),WB.state,'period').filter(row=>row.category!=='基础信息');
 function autoOrders(){const proto=P();if(!proto)return [];const users=usersById();return list(proto.automaticOrderExamples).map(example=>{const user=users.get(example.userId);if(!user)return null;const history=list(example.history);const at=action=>{const step=history.find(item=>item.action===action);return step?step.at:null;};return {id:example.id,source:'AUTO',creationMethod:'AUTO',userId:example.userId,accountId:user.id,alertId:example.alertId,ruleId:example.ruleId,ruleName:example.ruleName,type:example.type||'—',company:user.company,orgNodeId:example.ownerOrgNodeId||user.orgNodeId,unitId:user.unitId,lineKey:user.lineKey,org:user.org,line:user.line,card:user.unified_code,owner:example.createdBy||'规则引擎（模拟）',status:example.status||'已分派',createdAt:example.createdAt,sentAt:example.createdAt,receivedAt:at('AUTO_ASSIGN')||at('自动分派'),processedAt:null,triggeredAt:example.triggeredAt,createdBy:example.createdBy,history,readOnly:true};}).filter(Boolean);}
 function manualOrders(){return visibleTransfers().map(item=>{const alert=src('alerts').find(row=>row.id===item.alertId);const user=alert?usersById().get(alert.userId):null;return {id:item.id,source:'MANUAL',creationMethod:'MANUAL',alertId:item.alertId,type:item.type||'—',company:item.company||'—',orgNodeId:item.orgNodeId,unitId:item.unitId??null,targetNodeId:item.targetNodeId,lineKey:user?.lineKey||null,org:user?.org||nodeLabel(item.orgNodeId),line:user?.line||null,card:user?.unified_code||alert?.card||null,owner:'当前演示身份（人工转单）',status:item.status==='已派发'?'已派发':'待派发',createdAt:item.createdAt||null,sentAt:item.dispatchedAt||null,receivedAt:null,processedAt:null,history:[],readOnly:false,_transfer:item};});}
 const mergedOrders=()=>[...sourceOrders(),...autoOrders(),...manualOrders()];
 let sourceFilter='全部';
 const shownOrders=()=>{const rows=mergedOrders();return sourceFilter==='全部'?rows:rows.filter(row=>row.source===sourceFilter);};
 const SOURCE_LABEL={SOURCE:'来源工单',AUTO:'自动建单',MANUAL:'人工转单'};
 const sourceBadge=row=>row.source==='AUTO'?'<span class="badge blue">自动建单</span>':row.source==='MANUAL'?'<span class="badge orange">人工转单</span>':'<span class="badge gray">来源工单</span>';
 const transferred=transferLog;
 const transferOwner=()=>{const rows=alerts();return rows.length?rows[0].orgNodeId??null:null;};
 const canTransfer=()=>{const owner=transferOwner();return owner!=null&&!!A()?.can?.('work.transfer',{orgNodeId:owner,targetNodeId:owner});};
  const html=`<section class="tabs" role="tablist" aria-label="工单页签"><button type="button" class="active" data-work-tab="stats">① 工单统计</button><button type="button" data-work-tab="process">② 工单处理情况</button><button type="button" data-work-tab="convert">③ 预警转工单</button><button type="button" data-work-tab="marketer">营销员层级（自动建单样例）</button><button type="button" data-work-tab="assess">考核</button></section>
  <section id="workPanelStats">
    <section id="workKpis" class="kpi-grid six"></section>
    <div class="notice" id="workSourceNotice"></div>
    <div id="workCharts" class="chart-grid"></div>
    <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">业务工单明细（三来源）</h2><div class="card-subtitle">来源工单（样例）／自动建单（模拟）／人工转单（演示）；按来源筛选，id 唯一不重复计数</div></div><div class="card-head-actions"><label class="field" style="margin:0">来源<select id="workSourceFilter" class="control compact" aria-label="按创建来源筛选"><option value="全部">全部</option><option value="AUTO">自动建单</option><option value="MANUAL">人工转单</option><option value="SOURCE">来源工单</option></select></label><button type="button" class="btn" data-export-current>导出工单</button></div></div><div id="workTable"></div></section>
  </section>
  <section id="workPanelProcess" hidden>
    <div class="notice">处理情况按各来源已有时间字段展示；缺少接收/处理时间的不推算处理时长。自动建单为预置分派，无人工接收/处理环节。${risk('L2','处理时长依赖源时间字段完整性')}</div>
    <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">工单处理情况</h2><div class="card-subtitle">按来源与状态查看，不等同平台办结</div></div><button type="button" class="btn" data-export-current>导出处理情况</button></div><div id="workProcessTable"></div></section>
  </section>
  <section id="workPanelConvert" hidden>
    <div class="notice">预警转工单：勾选异常后生成<b>演示督办单</b>（人工转单，仅保存在当前页面内存，刷新即清空，不回写源系统）。${risk('L1','平台督办单为演示内闭环，不对接源工单写接口')}</div>
    <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">待转工单的预警</h2><div class="card-subtitle">来源为业务异常只读集合；转单不改变源数据</div></div><div class="card-head-actions"><button type="button" class="btn primary" id="workConvertBtn">批量转督办单</button></div></div><div id="workAlerts"></div></section>
    <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">演示督办单（人工转单）</h2><div class="card-subtitle">仅在内存中存在；可演示派发状态；已并入工单统计“人工转单”</div></div></div><div id="workConverted"></div></section>
    <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">自动建单样例（预置·只读）</h2><div class="card-subtitle">规则命中→自动建单→自动分派；无定时器、无外部写入、无人工确认</div></div><div class="card-head-actions"><button type="button" class="btn" id="workAutoViewBtn">在统计中查看自动建单</button></div></div><div id="workAutoExamples"></div></section>
  </section>
  <section id="workPanelMarketer" hidden>
    <div class="notice">营销员层级按真实组织/线路归集现有工单（含来源/自动/人工三来源）；源责任人为合成样例（源责任人N），与实名营销员无映射，营销员列标“待责任人映射”，不冒充实名。自动建单样例已展示，真实自动规则服务待接入。${risk('L1','营销员映射缺失，真实自动规则服务待接入')}</div>
    <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">营销员层级（自动建单样例）</h2><div class="card-subtitle">按组织/线路归集工单，营销员待映射</div></div><div class="card-head-actions"><button type="button" class="btn" id="workAutoBtn">查看自动建单样例</button><button type="button" class="btn" data-export-current>导出营销员层级</button></div></div><div id="workMarketerTable"></div></section>
  </section>
  <section id="workPanelAssess" hidden>
    <div class="notice">考核为 v5 B 批 G-19，尚未实施；保留入口，不造考核数据、不称完成。${risk('L1','考核待实施')}</div>
    <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">考核【待实施】</h2></div></div>${emptyBlock('考核【待实施】','v5 B 批 G-19 尚未实施，暂无考核结果。')}</section>
  </section>`;
  const typeDef=chart({id:'C-WORK-TYPE',title:'工单类型分布（三来源）',subtitle:'来源工单／自动建单／人工转单合并统计',dimensions:[],periodFilter:false,data:()=>mergedOrders(),headers:['工单类型','数量(单)'],getOption:ctx=>basicBarOption(grouped(ctx.data,'type').map(group=>({name:group.name,value:group.items.length})),{label:'工单数'}),getRows:ctx=>grouped(ctx.data,'type').map(group=>[group.name,group.items.length])});
  const statusDef=chart({id:'C-WORK-STATUS',title:'工单状态分布',subtitle:'源状态／自动已分派／演示派发状态',dimensions:[],periodFilter:false,data:()=>mergedOrders(),headers:['状态','数量(单)'],getOption:ctx=>basicBarOption(grouped(ctx.data,'status').map(group=>({name:group.name,value:group.items.length})),{label:'工单数',color:'#41A75E'}),getRows:ctx=>grouped(ctx.data,'status').map(group=>[group.name,group.items.length])});
  const sourceDef=chart({id:'C-WORK-SOURCE',title:'创建来源分布',subtitle:'来源工单（样例）／自动建单（模拟）／人工转单（演示）',dimensions:[],periodFilter:false,data:()=>mergedOrders(),headers:['创建来源','数量(单)'],getOption:ctx=>basicBarOption(grouped(ctx.data.map(row=>({...row,sourceLabel:SOURCE_LABEL[row.source]})),'sourceLabel').map(group=>({name:group.name,value:group.items.length})),{label:'工单数',color:'#8E6FD8'}),getRows:ctx=>grouped(ctx.data.map(row=>({...row,sourceLabel:SOURCE_LABEL[row.source]})),'sourceLabel').map(group=>[group.name,group.items.length])});
  const hoursBetween=(a,b)=>{if(!a||!b)return null;const diff=(Date.parse(String(b).replace(' ','T')+':00')-Date.parse(String(a).replace(' ','T')+':00'))/3600000;return Number.isFinite(diff)?diff:null;};
  const avgOf=values=>{const list=values.filter(v=>v!=null);return list.length?list.reduce((a,b)=>a+b,0)/list.length:null;};
  const statusCell=row=>row.source==='AUTO'?`<span class="badge blue">${esc(row.status)}</span>`:row.source==='MANUAL'?(row.status==='已派发'?'<span class="badge green">已派发（演示）</span>':'<span class="badge orange">待派发</span>'):text(row.status);
  function drawStats(){
   const all=mergedOrders(),rows=shownOrders();
   const countSource=all.filter(row=>row.source==='SOURCE').length,countAuto=all.filter(row=>row.source==='AUTO').length,countManual=all.filter(row=>row.source==='MANUAL').length;
   const sourceRows=all.filter(row=>row.source==='SOURCE');
   const receive=avgOf(sourceRows.map(row=>hoursBetween(row.createdAt,row.receivedAt)));
   const process=avgOf(sourceRows.map(row=>hoursBetween(row.receivedAt,row.processedAt)));
   document.getElementById('workKpis').innerHTML=V.card('工单总数',fmt(rows.length),'单',`当前来源筛选：${sourceFilter}`,'work')+V.card('来源工单',fmt(countSource),'单','上游样例·只读·非人工创建','clipboard')+V.card('自动建单',fmt(countAuto),'单','预置规则回放·模拟·已分派','flow','orange')+V.card('人工转单',fmt(countManual),'单','本页演示转单·内存','checkCircle','green')+V.card('平均接收时长',receive==null?'—':fmt(receive,1),'小时','来源工单 创建→接收','clock')+V.card('平均处理时长',process==null?'—':fmt(process,1),'小时','来源工单 接收→处理','clipboard','green');
   document.getElementById('workKpis').className='kpi-grid six';
   const notice=document.getElementById('workSourceNotice');
   if(notice)notice.innerHTML=`${esc(protoLabel())} · <b>来源工单</b>为上游样例（非人工创建，只读）；<b>自动建单</b>为预置规则命中→自动建单→自动分派的回放样例（非实时引擎、无定时器）；<b>人工转单</b>为本页用户预警转单生成的演示督办单。三来源按工单号唯一合并，不重复计数。${P()?'':` ${risk('L1','原型数据未加载，自动建单样例为空')}`}`;
   const headers=['工单号','来源','类型','经营单位','组织','统一表卡','责任人/创建主体','创建时间','发出/分派时间','状态','操作'];
   const rawRows=rows.map(row=>[row.id,SOURCE_LABEL[row.source],row.type,row.company,row.org,row.card,row.owner,row.createdAt,row.sentAt,row.status]);
   stampTable('work','工单明细（三来源）',headers.slice(0,-1),rawRows,rows);
   document.getElementById('workTable').innerHTML=V.table('sourceOrderTable',headers,rows.map(row=>[text(row.id),sourceBadge(row),text(row.type),text(row.company),text(row.org),text(row.card),text(row.owner),text(row.createdAt),text(row.sentAt),statusCell(row),`<button type="button" class="btn xs" data-source-detail="${esc(row.id)}">查看</button>`]));
   drawProcess();
  }
  function drawProcess(){
   const rows=shownOrders(),headers=['工单号','来源','类型','经营单位','状态','创建时间','接收/分派时间','处理时间','接收时长(h)','处理时长(h)','说明'];
   const rawRows=rows.map(row=>{const receive=hoursBetween(row.createdAt,row.receivedAt),process=hoursBetween(row.receivedAt,row.processedAt);const note=row.source==='AUTO'?'预置自动分派，无人工接收/处理环节':row.source==='MANUAL'?(row.status==='已派发'?'演示已派发（仅内存）':'演示待派发（仅内存）'):(receive==null?'缺少接收时间，不推算':process==null?'待处理，未产生完成时间':'按源时间字段计算');return [row.id,SOURCE_LABEL[row.source],row.type,row.company,row.status,row.createdAt,row.receivedAt,row.processedAt,receive==null?null:Number(receive.toFixed(1)),process==null?null:Number(process.toFixed(1)),note];});
   const tableRows=rawRows.map(row=>[text(row[0]),text(row[1]),text(row[2]),text(row[3]),text(row[4]),text(row[5]),text(row[6]),text(row[7]),row[8]==null?'—':number(row[8],1),row[9]==null?'—':number(row[9],1),text(row[10])]);
   stampTable('work','工单处理情况',headers,rawRows,rows);
   document.getElementById('workProcessTable').innerHTML=V.table('sourceProcessTable',headers,tableRows);
  }
  function drawConvert(){
   const rows=alerts(),demo=visibleTransfers(),allowed=canTransfer();
   stampTable('work','待转工单预警',['异常编号','异常类型','统一表卡','经营单位','来源系统','日期','状态'],rows.map(row=>[row.id,row.type,row.card,row.company,row.sourceSystem,row.date,row.status]),rows);
   document.getElementById('workAlerts').innerHTML=V.table('workAlertTable',['选择','异常编号','异常类型','统一表卡','经营单位','来源系统','日期','状态'],rows.map(row=>[`<input type="checkbox" class="work-pick" value="${esc(row.id)}"${allowed?'':' disabled'} aria-label="选择${esc(row.id)}">`,text(row.id),text(row.type),text(row.card),text(row.company),text(row.sourceSystem),text(row.date),text(row.status)]));
   document.getElementById('workConverted').innerHTML=(allowed?'':`<div class="notice">当前身份不具备预警转单权限；仅显式演示身份（演示环境）可生成演示督办单。</div>`)+(demo.length?V.table('convertedTable',['督办单号','来源异常','类型','经营单位','督办节点','状态','操作'],demo.map(item=>[text(item.id),text(item.alertId),text(item.type),text(item.company),text(nodeLabel(item.orgNodeId)),item.status==='已派发'?'<span class="badge green">已派发（演示）</span>':'<span class="badge orange">待派发</span>',item.status==='已派发'?'<span class="muted" style="font-size:11px">仅本页内存</span>':`<button type="button" class="btn xs" data-dispatch="${esc(item.id)}">演示派发</button>`])):emptyBlock('暂无演示督办单',allowed?'在左侧勾选预警后点击“批量转督办单”；生成的人工转单会并入工单统计。':'当前身份不具备转单权限，仅可查看源工单。'));
   const auto=autoOrders();
   document.getElementById('workAutoExamples').innerHTML=`<div class="notice">${esc(protoLabel())} · 下列为预置规则自动建单样例（规则命中→自动建单→自动分派），只读回放，无定时器、无外部写入、无人工确认按钮；真实自动规则服务待接入。${risk('L1','自动建单为预置模拟，非实时引擎')}</div>`+(auto.length?V.table('workAutoTable',['自动工单号','关联预警','规则编号','触发规则','触发时间','自动建单时间','创建主体','分派组织','状态','操作'],auto.map(row=>[text(row.id),text(row.alertId),text(row.ruleId),text(row.ruleName),text(row.triggeredAt),text(row.createdAt),text(row.createdBy),text(nodeLabel(row.orgNodeId)),statusCell(row),`<button type="button" class="btn xs" data-source-detail="${esc(row.id)}">查看</button>`])):emptyBlock('暂无自动建单样例',P()?'当前授权范围内无自动建单样例。':'原型模拟数据未加载（prototype-data-v6.js）。'));
  }
  function drawMarketer(){
   const rows=mergedOrders(),byLine=new Map();
   rows.forEach(row=>{const key=`${row.company||'—'}|${row.line||'未分线路'}`;const entry=byLine.get(key)||{company:row.company||'—',line:row.line||'未分线路',total:0,source:0,auto:0,manual:0};entry.total+=1;if(row.source==='SOURCE')entry.source+=1;else if(row.source==='AUTO')entry.auto+=1;else entry.manual+=1;byLine.set(key,entry);});
   const headers=['组织/线路','营销员','工单数','来源工单','自动建单','人工转单'];
   const rawRows=[...byLine.values()].map(entry=>[`${entry.company} / ${entry.line}`,'待责任人映射',entry.total,entry.source,entry.auto,entry.manual]);
   const viewRows=rawRows.map(row=>[text(row[0]),text(row[1]),number(row[2],0),number(row[3],0),number(row[4],0),number(row[5],0)]);
   stampTable('work','营销员层级（组织/线路归集）',headers,rawRows,rows);
   document.getElementById('workMarketerTable').innerHTML=rows.length?V.table('workMarketerValues',headers,viewRows):emptyBlock('当前范围无工单','当前查询范围内无可见工单。');
  }
  function showTab(name){document.getElementById('workPanelStats').hidden=name!=='stats';document.getElementById('workPanelProcess').hidden=name!=='process';document.getElementById('workPanelConvert').hidden=name!=='convert';document.getElementById('workPanelMarketer').hidden=name!=='marketer';document.getElementById('workPanelAssess').hidden=name!=='assess';document.querySelectorAll('[data-work-tab]').forEach(button=>button.classList.toggle('active',button.dataset.workTab===name));if(name==='convert')drawConvert();if(name==='process')drawProcess();if(name==='marketer')drawMarketer();if(name==='stats')drawStats();}
  const kvGrid=fields=>`<div class="kv-grid">${fields.map(([label,value])=>`<div class="kv"><span>${label}</span><b>${text(value)}</b></div>`).join('')}</div>`;
 const AUTO_ACTION_LABEL={ALERT_GENERATED:'预警生成',RULE_HIT:'规则命中',AUTO_CREATE:'自动建单',AUTO_ASSIGN:'自动分派'};
  function openOrderDrawer(row){
   if(row.source==='AUTO'){
    const fields=[['自动工单号',row.id],['创建方式','自动建单（模拟）'],['规则编号',row.ruleId],['触发规则',row.ruleName],['规则触发时间',row.triggeredAt],['自动建单时间',row.createdAt],['创建主体',row.createdBy],['关联预警',row.alertId],['分派组织',nodeLabel(row.orgNodeId)],['线路',row.lineKey],['工单类型',row.type],['统一表卡',row.card],['状态',row.status]];
    const history=list(row.history);
   S().openDrawer({title:`${row.id} · 自动建单（模拟·只读）`,subtitle:protoLabel(),body:`<div class="notice">预置规则回放：规则命中→自动建单→自动分派。只读样例，无定时器、无外部写入、无人工确认/转单按钮；真实自动规则服务待接入。${risk('L1','自动建单为预置模拟，非实时引擎')}</div>${kvGrid(fields)}<h3>规则回放轨迹（${history.length}）</h3>${history.length?V.table('autoOrderHistory',['时间','动作','执行主体','说明'],history.map(step=>[text(step.at),text(AUTO_ACTION_LABEL[step.action]||step.action),text(step.actor),text(step.detail)])):emptyBlock('暂无回放轨迹','未提供规则回放事件。')}`});
    return;
   }
   if(row.source==='MANUAL'){
    const fields=[['督办单号',row.id],['创建方式','人工转单（演示）'],['来源异常',row.alertId],['工单类型',row.type],['经营单位',row.company],['督办节点',nodeLabel(row.targetNodeId||row.orgNodeId)],['统一表卡',row.card],['状态',row.status],['创建时间',row.createdAt],['派发时间',row.sentAt]];
    S().openDrawer({title:`${row.id} · 人工转单（演示）`,subtitle:'本页用户预警转单生成',body:`<div class="notice">人工转单为当前演示身份在本页勾选预警后生成的演示督办单，仅保存在页面内存，刷新即清空，不回写源系统；已并入工单统计“人工转单”，不重复计数。${risk('L1','演示督办单为内存对象')}</div>${kvGrid(fields)}`});
    return;
   }
   const fields=[['源工单号',row.id],['创建方式','来源工单（上游样例）'],['工单类型',row.type],['统一表卡',row.card],['源责任人',row.owner],['创建时间',row.createdAt],['发出时间',row.sentAt],['接收时间',row.receivedAt],['处理时间',row.processedAt],['处理时限',row.limitAt],['源状态',row.status]];
   S().openDrawer({title:`${row.id} · 来源工单（样例·只读）`,subtitle:'上游样例源工单，非人工创建',body:`<div class="notice">来源工单为上游提供的样例源工单（只读），不代表人工创建；平台侧转单仅生成演示督办单，不回写源系统。${risk('L2','源工单处理时限字段未核，超时判定不启用')}</div>${kvGrid(fields)}${list(row.events).length?V.table('sourceEvents',['时间','事件'],row.events.map(item=>[text(item.time||item.date),text(item.name||item.event)])):emptyBlock('暂无源处理事件','暂未提供源处理事件。')}`});
  }
  const handleDetail=event=>{const button=event.target.closest('[data-source-detail]');if(!button)return;const row=mergedOrders().find(order=>order.id===button.dataset.sourceDetail);if(row)openOrderDrawer(row);};
  const gotoAuto=()=>{sourceFilter='AUTO';const select=document.getElementById('workSourceFilter');if(select)select.value='AUTO';showTab('stats');S().toast('已切换到“自动建单”来源筛选（预置模拟样例，只读）');};
  return {html,mount(){
   typeDef.mount();statusDef.mount();sourceDef.mount();
   document.getElementById('workCharts').innerHTML=typeDef.html+statusDef.html+sourceDef.html;
   typeDef.mount();statusDef.mount();sourceDef.mount();
   drawStats();drawConvert();drawMarketer();
   document.querySelectorAll('[data-work-tab]').forEach(button=>button.onclick=()=>showTab(button.dataset.workTab));
   document.getElementById('workSourceFilter')?.addEventListener('change',event=>{sourceFilter=event.target.value||'全部';drawStats();});
   document.getElementById('workAutoBtn')?.addEventListener('click',gotoAuto);
   document.getElementById('workAutoViewBtn')?.addEventListener('click',gotoAuto);
   document.getElementById('workConvertBtn')?.addEventListener('click',()=>{
    const picked=[...document.querySelectorAll('.work-pick:checked')].map(el=>el.value);
    if(!picked.length)return S().toast('请先勾选需要转单的预警');
    const source=alerts(),persona=A()?.current?.();
    const usable=picked.map(id=>source.find(row=>row.id===id)).filter(row=>row&&row.orgNodeId!=null&&A()?.can?.('work.transfer',{orgNodeId:row.orgNodeId,targetNodeId:row.orgNodeId}));
    if(!usable.length){
     audit('work.transfer','未授权选择',{result:'denied',reason:DENY_TRANSFER,detail:`所选 ${picked.length} 条均不在授权范围，未记录外部编号`});
     S().toast('当前身份不具备预警转单权限，仅在显式演示身份下可用');return;
    }
    const now=new Date(),stamp=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const created=usable.map(row=>{
     const item={id:'DB'+String(transferLog.length+1).padStart(3,'0'),alertId:row.id,type:row.type||'—',company:row.company||'—',orgNodeId:row.orgNodeId,unitId:row.unitId??null,targetNodeId:row.orgNodeId,personaId:persona?.personaId??null,scopeVersion:scopeVersion(),status:'待派发',createdAt:stamp,dispatchedAt:null};
     transferLog.push(item);
     audit('work.transfer',item.id,{targetLabel:`${item.type} / ${item.company}`,orgNodeId:item.orgNodeId,unitId:item.unitId,detail:`预警 ${row.id} → 督办 ${item.id}（页面内存，不回写源系统）`});
     return item;
    });
    drawConvert();drawStats();drawMarketer();S().toast(`已在演示环境生成 ${created.length} 张人工转单督办单（仅内存，已并入工单统计，不回写源系统）`);
   });
   document.getElementById('workConverted').addEventListener('click',event=>{
    const button=event.target.closest('[data-dispatch]');if(!button)return;
    const item=visibleTransfers().find(row=>row.id===button.dataset.dispatch);if(!item)return;
    if(!(A()?.can?.('work.transfer',{orgNodeId:item.orgNodeId,targetNodeId:item.targetNodeId}))){
     audit('work.transfer',item.id,{targetLabel:`${item.type} / ${item.company}`,orgNodeId:item.orgNodeId,unitId:item.unitId,result:'denied',reason:DENY_TRANSFER,detail:`预警 ${item.alertId} 派发被拒`});
     S().toast('当前身份不具备办理权限，仅可查看');return;
    }
    item.status='已派发';const now=new Date();item.dispatchedAt=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    drawConvert();drawStats();drawMarketer();
    audit('work.transfer',item.id,{targetLabel:`${item.type} / ${item.company}`,orgNodeId:item.orgNodeId,unitId:item.unitId,detail:`预警 ${item.alertId} 演示派发为“已派发”（页面内存）`});
    S().toast(`演示派发：${item.id} 已置为“已派发（仅内存）”，不调用源系统接口；刷新页面后还原`);
   });
   document.getElementById('workTable').addEventListener('click',handleDetail);
   document.getElementById('workAutoExamples').addEventListener('click',handleDetail);
  }};
};

 /* 数据治理：批次为样例快照，不声称生产在线，不模拟复检。 */
 V.renderData=()=>{
  const batchDef=chart({id:'C-DATA-SNAPSHOT',title:'各系统样例快照记录数',subtitle:'按当前批次的records字段汇总',dimensions:[],periodFilter:false,data:f=>filtered(src('batches'),f,null),headers:['业务系统','样例批次(个)','记录数(条)'],getOption:ctx=>basicBarOption(grouped(ctx.data,'system').map(group=>({name:group.name,value:knownSum(group.items,'records')})),{label:'已提供记录数',unit:'条'}),getRows:ctx=>grouped(ctx.data,'system').map(group=>[group.name,group.items.length,knownSum(group.items,'records')])});
  const html=`<section id="dataKpis" class="kpi-grid four"></section><div class="notice">当前为样例批次快照，未提供的延迟不推算。${risk('L1','ETL 批次与质量稽核为样例快照，非生产在线状态')}</div><section class="chart-grid"><div>${batchDef.html}</div><section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">数据主题</h2><div class="card-subtitle">批次记录与质量异常分别查看</div></div></div><div class="card-body"><div class="source-grid" id="dataSystems"></div></div></section></section><section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">数据集成与质量</h2><div class="card-subtitle">基础信息异常只读归集</div></div><button type="button" class="btn" data-export-current>导出当前表</button></div><div class="tabs"><button type="button" class="active" data-data-tab="batches">同步批次</button><button type="button" data-data-tab="quality">基础信息异常</button><button type="button" data-data-tab="dataAnomaly">数据异常</button></div><div id="dataTable"></div></section>`;
  let tab='batches';
  function batches(){return filtered(src('batches'),WB.state,null);}
  function anomalies(){return filtered(src('alerts'),WB.state,null).filter(row=>row.category==='基础信息');}
  function draw(){
   const rows=batches(),systems=grouped(rows,'system');document.getElementById('dataKpis').innerHTML=V.card('样例批次',fmt(rows.length),'个','当前查询范围','database')+V.card('样例记录',fmt(knownSum(rows,'records')),'条','仅汇总已提供记录，未知不补0','report','green')+V.card('数据主题',fmt(systems.length),'类','以实际批次为准','layers')+V.card('基础信息异常',fmt(anomalies().length),'条','当前异常样例','alert','orange');
   document.getElementById('dataSystems').innerHTML=systems.map(group=>`<div class="source-card"><span class="source-index">${esc(group.name.slice(0,1))}</span><strong>${esc(group.name)}</strong><span>${knownSum(group.items,'records')==null?'记录数待提供':fmt(knownSum(group.items,'records'))+' 条已提供记录'}</span><span class="badge gray">样例快照</span></div>`).join('')||emptyBlock('暂无批次','当前查询范围没有样例批次。');
   if(tab==='batches'){const headers=['批次编号','经营单位','业务系统','快照时间','记录数(条)','延迟(分钟)','批次状态','版本'];stampTable('data','同步批次',headers,rows.map(row=>[row.id,row.company,row.system,row.time,row.records,row.delay,row.status,row.version]),rows);document.getElementById('dataTable').innerHTML=V.table('batchSnapshots',headers,rows.map(row=>[text(row.id),text(row.company),text(row.system),text(row.time),number(row.records,0),text(row.delay),text(row.status),text(row.version)]));}
   else if(tab==='quality'){const quality=anomalies(),headers=['异常编号','异常类型','统一表卡','经营单位','组织','来源系统','日期','状态'];stampTable('data','基础信息异常',headers,quality.map(row=>[row.id,row.type,row.card,row.company,row.org,row.sourceSystem,row.date,row.status]),quality);document.getElementById('dataTable').innerHTML=V.table('basicQuality',headers,quality.map(row=>[text(row.id),text(row.type),text(row.card),text(row.company),text(row.org),text(row.sourceSystem),text(row.date),text(row.status)]));}
   else{const rows=filtered(src('alerts'),WB.state,'period').filter(row=>row.category==='关联异常'),headers=['异常编号','异常类型','统一表卡','经营单位','来源系统','日期','状态','说明'];stampTable('data','数据异常',headers.slice(0,-1),rows.map(row=>[row.id,row.type,row.card,row.company,row.sourceSystem,row.date,row.status]),rows);document.getElementById('dataTable').innerHTML=`<div class="notice">数据异常（原属智能分析）按 2026-09-24 会议移入本菜单；下列为跨系统指数/档案不一致类异常，只读。${risk('L2','指数一致性与判定规则待甲方提供规则清单')}</div>`+V.table('dataAnomalyTable',headers,rows.map(row=>[text(row.id),text(row.type),text(row.card),text(row.company),text(row.sourceSystem),text(row.date),text(row.status),text('只读')]));}
  }
  return {html,mount(){batchDef.mount();const q=new URLSearchParams((location.hash.split('?')[1]||''));const wanted=q.get('tab');if(wanted&&['batches','quality','dataAnomaly'].includes(wanted)){tab=wanted;document.querySelectorAll('[data-data-tab]').forEach(item=>item.classList.toggle('active',item.dataset.dataTab===wanted));}draw();document.querySelectorAll('[data-data-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.dataTab;document.querySelectorAll('[data-data-tab]').forEach(item=>item.classList.toggle('active',item===button));draw();});}};
 };

 /* 报表：每个目录ID拥有独立列定义和真实样例映射，不使用通用经营七列。 */
 function currentReadings(period=WB.state.month){return list(src('readings')).filter(row=>row.period===period&&dimensionFilter(row,WB.state));}
 function stockUsers(){const cutoff=(WB.state.month||'2026-10')+'-31';return list(src('users')).filter(user=>user.regDate<=cutoff&&(!user.deregisterDate||user.deregisterDate>cutoff)&&dimensionFilter(user,WB.state));}
 function inventory(){return list(src('meterInventory')).filter(row=>dimensionFilter(row,WB.state));}
 function meterEvents(type){return filtered(src('meterEvents'),WB.state,'period').filter(row=>!type||row.type.includes(type));}
 function zeroStreaks(minimum){
  return grouped(list(src('readings')).filter(row=>dimensionFilter(row,WB.state)&&row.period<=(WB.state.month||'2026-10')),'userId').map(({items})=>{
   const sorted=items.slice().sort((a,b)=>a.period.localeCompare(b.period));let streak=0,last=null,previousZeroPeriod=null;
   for(const row of sorted){if(row.volume===0){streak=previousZeroPeriod&&D.shiftPeriod(previousZeroPeriod,1)===row.period?streak+1:1;last=row;previousZeroPeriod=row.period;}else{streak=0;previousZeroPeriod=null;}}
   return {items,streak,last};
  }).filter(row=>row.streak>=minimum&&row.last);
 }
 function querySignature(){return Object.keys(WB.state).sort().map(name=>`${name}=${String(WB.state[name])}`).join('&');}
 function changeRatio(current,previous){return previous?((current-previous)/previous*100):null;}
 /* ===== 原型模拟报表流水适配（仅补充预览，不改冻结清单与状态真源） ===== */
 const protoData=()=>window.WBPrototypeData||null;
 const protoLabel=()=>protoData()?.meta?.label||'原型模拟数据（非真实接入）';
 const protoUser=userId=>usersById().get(Number(userId))||null;
 const protoWarehouseName=warehouseId=>{const w=(protoData()?.warehouses||[]).find(x=>String(x.id)===String(warehouseId));return w?w.name:warehouseId;};
 const protoMovements=(bounded=false)=>{const cutoff=`${WB.state.month}-31`;const periods=bounded?new Set(E.periods(WB.state)):null;return (protoData()?.warehouseMovements||[]).filter(row=>dimensionFilter(row)&&(!row.eventAt||String(row.eventAt)<=cutoff)&&(!periods||periods.has(String(row.period||row.eventAt).slice(0,7))));};
 const protoBooklets=type=>filtered((protoData()?.bookletEvents||[]).filter(row=>row.eventType===type),WB.state,'period').filter(row=>dimensionFilter(row));
 const protoStock=()=>{const latest=new Map();protoMovements().forEach(row=>{const prev=latest.get(row.meterId);if(!prev||String(row.eventAt)>String(prev.eventAt))latest.set(row.meterId,row);});return [...latest.values()];};
 const reportTemplateCache=new Map();
 function reportTemplate(id){
  const key=[id,scopeVersion(),querySignature()].join('|');
  if(reportTemplateCache.has(key))return reportTemplateCache.get(key);
  const value=buildReportTemplate(id);
  value.sourceRows=value.available?reportSourceRows(id):[];
  reportTemplateCache.set(key,value);
  if(reportTemplateCache.size>240)reportTemplateCache.clear();
  return value;
 }
 function reportSourceRows(id){
  if(id==='P-RPT-002')return [...meterEvents('周检'),...inventory()];
  if(id==='P-RPT-003')return [...meterEvents('故障'),...inventory()];
  if(id==='P-RPT-004'||id==='P-RPT-005')return [...meterEvents(id==='P-RPT-004'?'周检':'故障'),...list(src('readings'))];
  if(id==='P-RPT-006')return protoMovements(true).filter(row=>row.eventType==='IN');
  if(id==='P-RPT-007'||id==='P-RPT-008')return [...inventory(),...protoMovements()];
  if(id==='P-RPT-009')return filtered(src('readTasks'),WB.state,'period');
  if(id==='P-RPT-010'||id==='P-RPT-012'||id==='P-RPT-013'||id==='P-RPT-014')return list(src('readings'));
  if(id==='P-RPT-011')return filtered(src('alerts'),WB.state,'period');
  if(id==='P-RPT-016'||id==='P-RPT-017')return stockUsers();
  if(id==='P-RPT-018')return protoBooklets('TRANSFER');
  if(id==='P-RPT-019')return protoBooklets('ENROLL');
  if(id==='P-RPT-020'||id==='P-RPT-021')return list(src('users'));
  return [];
 }
 function buildReportTemplate(id){
  /* 待接入报表保留目录、字段与原合成样例行；只禁用“计算预览”与数据导出。 */
  const unavailable=(headers,note,sample=[])=>({available:false,headers,rows:sample,note});
  if(id==='P-RPT-001')return unavailable(['异常编号','水表','厂家','表型','条形码','异常说明'],'缺少厂家×表型×条形码前8位对应规则及判定结果。',[['样板-001','样例表号','样例厂家','LXS-15','33010011','样例占位，规则未提供'],['样板-002','样例表号','样例厂家','LXS-20','33010012','样例占位，规则未提供']]);
  if(id==='P-RPT-002'||id==='P-RPT-003'){
   const type=id==='P-RPT-002'?'周检':'故障',rows=meterEvents(type).map(row=>{const meter=list(src('meterInventory')).find(item=>item.meterId===row.newMeter)||{},user=usersById().get(row.userId)||{};return [row.id,row.card,user.name,user.address,row.nature,row.org,user.booklet,row.type,row.date,row.company,row.oldMeter,row.newMeter,meter.manufacturer,meter.model,row.caliber,row.status];});
   return {available:true,headers:['事件编号','统一表卡','用户名称','用户地址','用水性质','所属组织','册本','换表类型','换表时间','经营单位','旧物理表','新物理表','厂家','型号','口径','状态'],rows,note:`当前仅包含已提供的${type}换表记录。`};
  }
  if(id==='P-RPT-004'||id==='P-RPT-005'){
   const type=id==='P-RPT-004'?'周检':'故障',n=[2,3].includes(Number(WB.state.swapN))?Number(WB.state.swapN):2,rows=meterEvents(type).map(row=>{const before=list(row.before).slice(-n),after=list(row.after).slice(0,n),avg=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;return [row.id,row.card,row.company,row.date,before.join(' / '),after.join(' / '),before.length===n&&after.length===n?changeRatio(avg(after),avg(before)):null,row.unit];});
   return {available:true,headers:['事件编号','统一表卡','经营单位','换表日期',`换表前${n}期水量序列`,`换表后${n}期水量序列`,'均值变化(%)','单位'],rows,note:`按事件已有前后${n}期序列展示。`};
  }
  if(id==='P-RPT-006'){const rows=protoMovements(true).filter(row=>row.eventType==='IN');if(!protoData()||!rows.length)return unavailable(['入库日期','仓库','水表','入库类型','数量'],'本期入库流水待接入；原型模拟入库事件未覆盖当前范围/期间。');return {available:true,sourceLabel:protoLabel(),headers:['入库日期','仓库','水表','入库类型','数量'],rows:rows.map(row=>[row.eventAt,protoWarehouseName(row.warehouseId),row.meterId,row.eventType,1]),note:`原型模拟入库事件（${protoLabel()}），按当前范围与期间过滤；真实入库流水仍未接。`};}
  if(id==='P-RPT-007'){
   const legacy=grouped(inventory().filter(row=>row.warehouse),row=>[row.caliber,row.meterType,row.status].join('|'));
   const stock=grouped(protoStock(),row=>[row.caliber,row.meterType,row.status].join('|'));
   const legacyMap=new Map(legacy.map(group=>[group.name,group.items.length])),stockMap=new Map(stock.map(group=>[group.name,group.items.length]));
   const keys=[...new Set([...legacyMap.keys(),...stockMap.keys()])];
   const rows=keys.map(key=>{const [caliber,meterType,status]=key.split('|');return [caliber,meterType,status,(legacyMap.get(key)||0)+(stockMap.get(key)||0)];});
   return {available:true,sourceLabel:protoData()&&stock.length?`源系统库存样例＋${protoLabel()}`:'源系统库存样例',headers:['口径','水表类型','库存状态','台数'],rows,note:protoData()?`现有库存台账与原型模拟仓库最新出入库快照合并（${protoLabel()}）；未提供期初时不重算期末公式。`:'当前库存快照；未提供期初与出入库流水时不重算期末公式。'};
  }
  if(id==='P-RPT-008'){
   const legacy=grouped(inventory().filter(row=>row.warehouse),'warehouse');
   const count=(items,status)=>items.filter(item=>item.status===status).length;
   const rows=legacy.map(group=>{const row=group.items[0];return [group.name,row.company,count(group.items,'在库'),count(group.items,'周转'),count(group.items,'待检'),count(group.items,'报废'),group.items.length];});
   const legacyNames=new Set(legacy.map(group=>group.name));
   grouped(protoStock(),row=>protoWarehouseName(row.warehouseId)).forEach(group=>{if(legacyNames.has(group.name))return;const row=group.items[0];rows.push([group.name,row.company,count(group.items,'在库'),count(group.items,'周转'),count(group.items,'待检'),group.items.filter(item=>item.status==='报废'||item.eventType==='SCRAP').length,group.items.length]);});
   return {available:true,sourceLabel:protoData()?`源系统库存样例＋${protoLabel()}`:'源系统库存样例',headers:['仓库','经营单位','在库(台)','周转(台)','待检(台)','报废(台)','合计(台)'],rows,note:protoData()?`现有仓库台账与原型模拟仓库最新事件快照合并（${protoLabel()}），同名仓库不重复计数，不重算期初期末。`:'按当前水表库存记录逐仓汇总。'};
  }
  if(id==='P-RPT-009'){
   const tasks=filtered(src('readTasks'),WB.state,'period');
   const rows=grouped(tasks,'company').map(group=>{
    const total=group.items.length,read=group.items.filter(t=>t.status!=='未抄').length;
    const mobile=group.items.filter(t=>t.method!=='远传'),arrived=mobile.filter(t=>t.arrived===true).length;
    const photo=mobile.filter(t=>t.photoCompliant!=null),photoOk=photo.filter(t=>t.photoCompliant===true).length;
    const precent=(a,b)=>b?+(a/b*100).toFixed(2):null;
    return [group.name,total,read,total-read,precent(read,total),precent(photoOk,photo.length),precent(arrived,mobile.length)];
   });
   return {available:true,headers:['经营单位','应抄任务(户次)','已抄(户次)','未抄(户次)','抄见率(%)','照片合规率(%)','定位到位率(%)'],rows,note:'按抄表任务基线计算（样例任务自 2023-01 起）；未抄任务不计水量与应收。'};
  }
  if(id==='P-RPT-010'){
   const rows=currentReadings().filter(row=>row.status!=='正常'||row.arrived===false).map(row=>[row.id,row.card,row.company,row.org,row.reader,row.period,row.status,row.method,row.volume]);
   return {available:true,headers:['抄表记录','统一表卡','经营单位','组织/线路','抄表员','账期','抄表状态','抄表方式','水量(m³)'],rows,note:'仅展示已有非正常抄表状态；其他未抄见原因未提供时不补写。'};
  }
  if(id==='P-RPT-011'){
   const rows=grouped(filtered(src('alerts'),WB.state,'period').filter(row=>['抄表异常','表务异常'].includes(row.category)),'type').map(group=>[group.name,group.items[0].category,group.items.length]);
   return {available:true,headers:['异常类型','异常分类','数量(条)'],rows,note:'按异常样例已有类型统计。'};
  }
  if(id==='P-RPT-012'){
   const n=[2,3].includes(Number(WB.state.zeroN))?Number(WB.state.zeroN):2,rows=zeroStreaks(n).map(({last,streak})=>[last.card,last.company,last.org,streak,last.period,'连续记录，待复核']);
   return {available:true,headers:['统一表卡','经营单位','组织/线路','连续零水量周期数','最近账期','核验状态'],rows,note:`按连续${n}个账期检查，缺月即中断；仅依据已有抄表记录，未抄任务不补水量。`};
  }
  if(id==='P-RPT-013'){
   const previous=D.shiftPeriod(WB.state.month,-12),rows=currentReadings().filter(row=>row.volume>=100).map(row=>{const old=list(src('readings')).find(item=>item.userId===row.userId&&item.period===previous);return [row.card,row.company,row.nature,row.period,row.volume,old?.volume,changeRatio(row.volume,old?.volume)];});
   return {available:true,headers:['统一表卡','经营单位','用水性质','账期','本期水量(m³)','去年同期(m³)','同比(%)'],rows,note:'门槛为月用水量≥100m³；缺去年同期时同比为空。'};
  }
  if(id==='P-RPT-014'){
   const zeros=new Set(zeroStreaks(3).map(row=>row.last.userId)),previous=D.shiftPeriod(WB.state.month,-12),rows=currentReadings().filter(row=>{const old=list(src('readings')).find(item=>item.userId===row.userId&&item.period===previous);return zeros.has(row.userId)||(old&&Math.abs(changeRatio(row.volume,old.volume))>=30);}).map(row=>{const old=list(src('readings')).find(item=>item.userId===row.userId&&item.period===previous);return [row.card,row.company,row.org,row.period,row.volume,old?.volume,changeRatio(row.volume,old?.volume),zeros.has(row.userId)?'连续3期零水量':'同比变化超过±30%'];});
   return {available:true,headers:['统一表卡','经营单位','组织/线路','账期','本期水量(m³)','去年同期(m³)','同比(%)','异常依据'],rows,note:'按实际记录判断连续3期零水量或同比变化超过±30%。'};
  }
  if(id==='P-RPT-015')return unavailable(['变更日期','统一表卡','原用水性质','新用水性质','经营单位'],'未提供用水性质变更记录。',[['样例日期','样例卡号','居民生活','商业','样例单位'],['样例日期','样例卡号','商业','居民生活','样例单位']]);
  if(id==='P-RPT-016'){
    const natures=D.natures,rows=grouped(stockUsers(),u=>[u.company,u.org,u.community].join('|')).map(group=>{const u=group.items[0],counts=natures.map(nature=>group.items.filter(user=>user.nature===nature).length);return [u.company,u.org,u.community,...counts,group.items.length];});
    return {available:true,headers:['经营单位','组织','小区',...natures.map(n=>n+'(户)'),'合计(户)'],rows,note:'按查询截止月的有效表卡统计；不同公司或组织的同名小区不合并。'};
   }
   if(id==='P-RPT-017'){
    const readers=new Set(currentReadings().map(row=>row.userId)),rows=grouped(stockUsers(),u=>[u.company,u.org,u.booklet].join('|')).map(group=>{const u=group.items[0];return [u.company,u.org,u.booklet,group.items.length,group.items.filter(user=>readers.has(user.id)).length];});
    return {available:true,headers:['经营单位','组织','册本','在册户数(户)','当期有抄表记录户数(户)'],rows,note:'同名册本按经营单位与组织分别统计；应抄任务基线待接入。'};
   }
  if(id==='P-RPT-018'){const rows=protoBooklets('TRANSFER');if(!protoData()||!rows.length)return unavailable(['调整日期','统一表卡','原册本','新册本','调整类型'],'未提供存量用户册本调整记录；原型模拟册本调整未覆盖当前范围/期间。');return {available:true,sourceLabel:protoLabel(),headers:['调整日期','统一表卡','原册本','新册本','调整类型'],rows:rows.map(row=>{const user=protoUser(row.userId);return [row.eventAt,user?.unified_code,row.beforeBooklet,row.afterBooklet,row.eventType];}),note:`原型模拟册本调整事件（${protoLabel()}），按当前范围/期间过滤；真实册本调整流水仍未接。`};}
  if(id==='P-RPT-019'){const rows=protoBooklets('ENROLL');if(!protoData()||!rows.length)return unavailable(['入册日期','统一表卡','立户日期','经营单位','组织','册本','用水性质'],'未提供新增入册事件，立户日期不代替入册日期。');return {available:true,sourceLabel:protoLabel(),headers:['入册日期','统一表卡','立户日期','经营单位','组织','册本','用水性质'],rows:rows.map(row=>{const user=protoUser(row.userId);return [row.eventAt,user?.unified_code,user?.regDate,user?.company,user?.org,row.afterBooklet||user?.booklet,user?.nature];}),note:`原型模拟入册事件（${protoLabel()}），入册日期取事件 eventAt（非立户日期 regDate）；真实入册流水仍未接。`};}
   if(id==='P-RPT-020'||id==='P-RPT-021'){
  const added=id==='P-RPT-020',month=WB.state.month||(D.periods||[]).slice(-1)[0]||'2026-10',users=list(src('users')).filter(user=>dimensionFilter(user,WB.state)&&(added?user.regDate?.startsWith(month):user.deregisterDate?.startsWith(month))),rows=D.natures.map(nature=>[nature,users.filter(user=>user.nature===nature).length]).filter(row=>row[1]>0);
   const note=added?'新增窗口为所选月1日至月末（自然月），按立户日期 regDate 所在月统计。':'注销按注销日期所在自然月统计。源事实仅到月、缺注销日级水量，“上年全年 vs 当年1/1至各自注销日”的逐户水量对比暂不计算（待接入），不以整月冒充。';
   return {available:true,headers:['用水性质',added?'新增用户(户)':'注销用户(户)'],rows,note};
  }
  return unavailable(['数据项','状态'],'当前报表尚未建立已核对的数据映射。');
 }

 V.renderReport=()=>{
  const reports=list(C.reports);
  /* 目录状态来自冻结清单：可预览 / 待接入（含原因）/ 不适用（缺册本维度）。 */
  /* 状态真源只有 Core 的 reportRuns.status/waitReason；catalog 只提供静态字段说明与册本维度要求。 */
  const notes=()=>{const value=C.reportAvailability||{};return {waiting:value.waiting||value.waitingReasons||{},needsBooklet:value.needsBooklet||[]};};
  const runStatus=()=>{const map=new Map();list(src('reportRuns')).forEach(row=>map.set(row.id,row));return map;};
  function reportState(id){
   const note=notes(),scope=scopeOf(),run=runStatus().get(id),statusText=run&&run.status?String(run.status):'';
   if(!(scope.roots||[]).length)return {status:'范围未绑定',available:false,reason:'当前身份未绑定实际账号，报表不出数（P）；目录与字段定义仍可查看。',badge:'gray'};
   if((note.needsBooklet||[]).includes(id)&&!hasBooklet())return {status:'不适用',available:false,reason:'当前范围用户的册本字段为空，本报表不适用。',badge:'gray'};
   if(protoData()&&['P-RPT-006','P-RPT-018','P-RPT-019'].includes(id)&&reportTemplate(id).available)return {status:'可预览',available:true,reason:`原型模拟流水已接入预览（${protoLabel()}）；真实报表流水仍未接。`,badge:'green'};
   if(/^待/.test(statusText))return {status:'待接入',available:false,reason:(run&&run.waitReason)||note.waiting[id]||'数据未接入，暂不生成计算预览。',badge:'orange'};
   if(!statusText)return {status:'待接入',available:false,reason:'运行时未返回该报表状态，暂不生成计算预览。',badge:'orange'};
   return {status:'可预览',available:true,reason:'',badge:'green'};
  }
  const categoryDef=chart({id:'C-REPORT-CATALOG',title:'报表目录按类别分布',subtitle:'按当前目录统计',dimensions:[],periodFilter:false,data:()=>reports,headers:['报表类别','报表数量(张)'],getOption:()=>basicBarOption(grouped(reports,'category').map(group=>({name:group.name,value:group.items.length})),{label:'报表数量',unit:'张',color:'#F58B3C'}),getRows:()=>grouped(reports,'category').map(group=>[group.name,group.items.length])});
  const html=`<div class="notice">报表目录共 ${reports.length} 张，按当前身份范围展示；${reports.filter(row=>reportState(row.id).available).length} 张可预览，${reports.filter(row=>!reportState(row.id).available).length} 张待接入/不适用（含原因），缺册本维度时对应报表标记为不适用。抄见率按抄表任务口径计算。${risk('L2','待接入报表不生成明细；数据状态以当期样例为准')}</div><section class="kpi-grid four">${V.card('报表目录',fmt(reports.length),'张','当前目录','report')}${V.card('报表类别',fmt(new Set(reports.map(row=>row.category)).size),'类','按目录实际类别统计','layers','green')}${V.card('可查询报表',fmt(reports.filter(row=>reportState(row.id).available).length),'张','当前可预览','clipboard','orange')}${V.card('生成日志','待接入','','日志待接入','clock')}</section><section class="chart-grid"><div>${categoryDef.html}</div><section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">口径与参数说明</h2><div class="card-subtitle">平台配置已拆分为独立「系统设置」页；此处仅保留影响报表口径的说明</div></div></div><div class="card-body quick-grid"><button type="button" class="quick-item" data-config="dictionary">指标口径与字典</button><button type="button" class="quick-item" data-config="parameters">报表参数</button></div></section></section><section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">报表目录</h2><div class="card-subtitle">选择报表查看对应结果或数据状态</div></div><div class="card-head-actions"><select id="reportCategory" class="control compact" aria-label="报表类别"><option value="">全部类别</option>${[...new Set(reports.map(row=>row.category))].map(value=>`<option>${esc(value)}</option>`).join('')}</select><select id="reportCycle" class="control compact" aria-label="报表周期"><option value="">全部周期</option>${[...new Set(reports.map(row=>row.cycle))].map(value=>`<option>${esc(value)}</option>`).join('')}</select><button type="button" class="btn" data-export-current>导出目录</button></div></div><div id="reportCatalog"></div></section>`;
  function selectedReports(){const category=document.getElementById('reportCategory').value,cycle=document.getElementById('reportCycle').value;return reports.filter(row=>(!category||row.category===category)&&(!cycle||row.cycle===cycle));}
  function draw(){const rows=selectedReports(),rawRows=rows.map(row=>[row.id,row.name,row.category,row.cycle,row.scope,reportState(row.id).status]);stampTable('report','报表目录',['报表ID','报表名称','类别','周期','数据范围','数据状态'],rawRows,src('reportRuns'));document.getElementById('reportCatalog').innerHTML=V.table('reportList',['报表ID','报表名称','类别','周期','数据范围','数据状态','操作'],rows.map(row=>{const state=reportState(row.id);return [text(row.id),text(row.name),text(row.category),text(row.cycle),text(row.scope),`<span class="badge ${state.badge}">${esc(state.status)}</span>`,`<button type="button" class="btn xs" data-preview-report="${esc(row.id)}">${state.available?'预览 / 下载':'查看说明'}</button>`];}));document.querySelectorAll('[data-preview-report]').forEach(button=>button.onclick=()=>preview(rows.find(row=>row.id===button.dataset.previewReport)));}
  function preview(report){
   const state=reportState(report.id),template=reportTemplate(report.id);
   const rows=template.rows||[],periodKey=['P-RPT-004','P-RPT-005'].includes(report.id)?'swapN':report.id==='P-RPT-012'?'zeroN':null;
   const rawN=periodKey?Number(WB.state[periodKey]):null,currentN=periodKey?([2,3].includes(rawN)?rawN:2):null,selector=(state.available&&periodKey)?`<label class="field">对比周期<select id="reportPeriodN" class="control"><option value="2" ${currentN===2?'selected':''}>2期</option><option value="3" ${currentN===3?'selected':''}>3期</option></select></label>`:'';
   const statusBar=`<div class="notice"><b>${esc(state.status)}</b>${(state.reason||template.note)?'：'+esc(state.reason||template.note):''}${!state.available&&rows.length?'（下列为原合成样例行，未计算、不可导出）':''}<br>数据范围：${esc(scopeText())}；目录口径：${esc(report.scope)}</div>`;
  const displayRows=rows.map(row=>row.map(cell=>typeof cell==='number'?number(cell):text(cell)));const srcLabel=template.sourceLabel||'';const outHeaders=srcLabel?[...template.headers,'数据来源']:template.headers;const outRows=srcLabel?displayRows.map(row=>[...row,esc(srcLabel)]):displayRows;stampTable('report',report.name,outHeaders,outRows,template.sourceRows||[]);
  const body=`${statusBar}${selector}${V.table('reportPreview',outHeaders,outRows)}`;
   const footer=`<button type="button" class="btn" data-close>关闭</button><button type="button" class="btn primary" id="downloadReport" ${state.available&&rows.length?'':'disabled'}>下载当前结果CSV</button>`;
   S().openDrawer({width:'1080px',title:report.name,subtitle:`${report.cycle} · ${state.status}`,body,footer});
   /* 导出元数据在预览生成时固化：来源取真实记录，范围版本取生成时的身份版本；不复用后续 WB.currentTable。 */
   const generation=E.tableExportMeta?E.tableExportMeta('report',template.sourceRows||[],E.scopeVersion(),(A()?.current?.()||{}).personaId):{scopeVersion:E.scopeVersion(),sourceRows:template.sourceRows||[],kind:'report',period:String(WB.state.month||''),filters:{...WB.state}};
   const reportMonth=String(WB.state.month||'');
   document.getElementById('downloadReport').onclick=()=>{
    if(!rows.length)return;
   const result=E.downloadCSV(`${report.name}_${reportMonth}.csv`,outHeaders,outRows,generation);
    if(result&&result.ok===false)S().toast(denyText(result.reason,'当前范围无权导出该报表'));
   };
   const control=document.getElementById('reportPeriodN');if(control)control.onchange=()=>{WB.state[periodKey]=Number(control.value);S().closeLayers();preview(report);};
  }
  return {html,mount(){categoryDef.mount();draw();document.getElementById('reportCategory').onchange=draw;document.getElementById('reportCycle').onchange=draw;document.querySelectorAll('[data-config]').forEach(button=>button.onclick=()=>config(button.dataset.config));}};
 };

 function config(kind){
  const admin=()=>window.WB_ADMIN;
  const companyNodes=()=>orgNodes().filter(node=>node.type==='company'&&inScopeNode(node.id)).sort((a,b)=>String(a.name).localeCompare(String(b.name),'zh'));
  const canPlan=nodeId=>!!A()?.can?.('plan.write',{orgNodeId:nodeId});
  const definitions={
   plans:{title:'计划值样例',headers:['经营单位','节点编号','期间计划(万m³)','数据状态'],rows:companyNodes().map(node=>{const plan=canPlan(node.id)&&admin()?.planOf?admin().planOf(node.id):null;return [node.name,node.id,plan==null?'—':number(plan,0),canPlan(node.id)?(admin()?.hasPlan?.(node.id)?'已手工填报（内存）':'样例计划值'):'无权限查看（节点级计划不向下继承）'];})},
   dictionary:{title:'指标口径与字典',headers:['字典类型','当前值','状态'],rows:[['时间口径','业务账期 / 财务自然月','只读'],['新增用户窗口','所选月1日—月末（自然月）','只读'],['用水性质',D.natures.join('、'),'只读'],['水表口径',D.calibers.join('、'),'只读'],['水表类型',D.meterTypes.join('、'),'只读']]},
   identity:{title:'组织、账号与角色',headers:['名称','类型','归属/范围','来源依据','绑定状态'],rows:[...companyNodes().map(node=>[node.name,'经营单位',node.unitName||'—',`源表节点 ${node.id}`,'组织授权范围']),...(list(A()?.personas?.())||[]).map(persona=>{const current=(A()?.current?.()||{});const basis=persona.demo?'演示':persona.rangeStatus==='unbound'?'未提供（P）':'虚拟（源未核对账号）';const bound=current.personaId===persona.id?'当前身份':persona.demo?'演示绑定':'虚拟身份（未绑定实际账号）';return [`${persona.name||'未命名'}（${persona.label||persona.roleId||'—'}）`,'身份',text(persona.bindingLabel||persona.scopeLabel||'—'),basis,bound];})]},
   mapping:{title:'字段关联与编号',headers:['业务对象','字段/规则','用途','状态'],rows:[['统一表卡','unified_code','最小计费实体统一编码','源键已核'],['高新表卡','CardID / CustomerNo','表卡与客户号分离','区域映射待核'],['时间口径','bill_period / natural_month','业务账期与自然月分列','源字段已核']]},
   parameters:{title:'报表参数',headers:['参数','当前值','适用入口','状态'],rows:(()=>{const swapN=[2,3].includes(Number(WB.state.swapN))?Number(WB.state.swapN):2;const zeroN=[2,3].includes(Number(WB.state.zeroN))?Number(WB.state.zeroN):2;return [['大用户月用水量','≥100m³','100立方米以上用户报表','只读默认值'],['新增用户窗口','所选月1日—月末（自然月）','新增用户相关报表','只读'],['夜间MNF窗口','01:00—04:00','DMA夜间流量','待确认，未用于计算'],['换表对比周期',`前后各${swapN}期，可选2/3期`,'换表对比报表','当前参数'],['连续零水量周期',`${zeroN}期，可选2/3期`,'连续零水量用户报表','当前参数']];})()}
  };
  if(kind==='logs'){const model=logRows();S().openDrawer({title:'操作日志',subtitle:'平台侧写操作与鉴权/导出拒绝记录（仅内存，刷新清空）',body:model.rows.length?V.table('readonlyLogs',model.headers,model.rows):emptyBlock('暂无操作日志','当前身份尚未产生平台侧演示写操作。')});return;}
  const definition=definitions[kind];if(!definition)return;
  S().openDrawer({title:definition.title,subtitle:'当前设置与样例只读',body:V.table('readonlyConfig',definition.headers,definition.rows.map(row=>row.map(cell=>typeof cell==='number'?number(cell):text(cell))))});
 }
 
 /* ===== 平台组织账号与权限（AUTH） ===== */
 V.renderAuth=()=>{
  const access=A();
  const current=access?.current?.()||null;
  const allNodes=orgNodes();
  const anc=[];
  list(current&&current.scope&&current.scope.roots).forEach(rootId=>{
   const root=orgNode(rootId);
   list(root&&root.pathIds).forEach(id=>{if(String(id)!==String(rootId))anc.push(String(id));});
  });
  const ancestors=new Set(anc);
  const nodeState=node=>inScopeNode(node.id)?['在范围内','green']:ancestors.has(String(node.id))?['上级路径只读','gray']:['范围外仅名称','gray'];
  const owned=allNodes.filter(node=>inScopeNode(node.id));
  const visible=allNodes.filter(node=>inScopeNode(node.id)||ancestors.has(String(node.id)));
  const nodes=visible;
  const treeRows=visible.map(node=>{
   const [stateLabel,tone]=nodeState(node);
   const depth=Math.max(0,(Number(node.depth)||1)-1);
   return [`<span style="padding-left:${depth*14}px">${esc(node.name)}</span>`,text(node.id),text(node.typeLabel||node.type),inScopeNode(node.id)?text(O()?.subtreeSize?O().subtreeSize(node.id):(node.children||[]).length):'—',`<span class="badge ${tone}">${esc(stateLabel)}</span>`];
  });
  const importable=owned.filter(node=>node.importable!==false).length;
  const pending=owned.filter(node=>String(node.status||'').indexOf('待')>=0).length;
  const admin=()=>window.WB_ADMIN;
  const accounts=list(admin()?.accounts?.());
  const accountEnabled=account=>account.enabled!==false&&account.status!=='disabled';
  const accountSubject=account=>({orgNodeId:account&&account.orgNodeId?account.orgNodeId:undefined,unitId:account&&account.unitId!=null?String(account.unitId):undefined});
 const canAccount=(action,account)=>!!access?.can?.(action,accountSubject(account));
  const createTargets=nodes.filter(node=>node.type==='company'&&access?.can?.('account.create',{orgNodeId:node.id}));
  const accountRows=accounts.map(account=>[text(account.name),text(account.company||nodeLabel(account.orgNodeId)),text(account.role||'—'),
   accountEnabled(account)?'<span class="badge green">启用（演示）</span>':'<span class="badge gray">未启用</span>',
   `<span class="row-actions"><button type="button" class="btn xs" data-account-edit="${esc(account.id)}" ${canAccount('account.update',account)?'':'disabled'}>编辑</button><button type="button" class="btn xs" data-account-toggle="${esc(account.id)}" ${canAccount('account.toggle',account)?'':'disabled'}>${accountEnabled(account)?'停用':'启用'}</button><button type="button" class="btn xs" data-account-reset="${esc(account.id)}" ${canAccount('account.reset',account)?'':'disabled'}>重置密码</button></span>`]);
  const roles=list(access?.roles?.());
  const basisText=basis=>basis==='C'?'原文提供':basis==='E'?'仅演示':'未提供（P）';
  const roleRows=roles.map(role=>[text(role.label||role.name||role.id),text(role.id),text(role.sourceScope||role.scopeLabel||'—'),`${esc(basisText(role.scopeBasis))} / 动作 ${esc(basisText(role.actionBasis))}`]);
  const personas=list(access?.personas?.());
  const personaRows=personas.map(persona=>[`${esc(persona.name||'未命名')}（${esc(persona.label||persona.roleId||'—')}）`,text(persona.roleId||'—'),text(persona.bindingLabel||persona.scopeLabel||'—'),text(persona.rangeStatus||'—'),
   current&&current.personaId===persona.id?'<span class="badge green">当前身份</span>':persona.demo?'<span class="badge gray">演示绑定</span>':'<span class="badge gray">虚拟身份（源未核对账号）</span>']);
  const roleHeaders=['角色','代号','数据范围（原文）','权限依据'];
  const html=`<section class="notice v4-tip" role="note">${S()?.icon('shield')||''}<div><strong>平台组织账号与权限（A 原型）</strong><div class="muted">8 类角色按组织节点做行级隔离；身份切换在顶部身份面板完成，本页只读展示。平台演示账号仅用于演示平台侧写操作，真实账号与 SSO 尚未接入，不在原型创建真实凭据。</div></div></section>
  <section class="kpi-grid four">${V.card('组织节点',String(owned.length),'个',`当前身份可见；可导入 ${importable} 个；待确认 ${pending} 个`,'building')}${V.card('平台演示账号',String(accounts.length),'个','真实账号 0 个（SSO 未接入）','users','green')}${V.card('角色',String(roles.length||8),'个','集团领导至员工共 8 类','role','orange')}${V.card('演示身份',String(personas.length),'个',`当前身份：${(current&&current.label)||'—'}`,'shield')}</section>
  <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">组织架构</h2><div class="card-subtitle">集团 → 经营单位 → 营业所 → 班组 → 线路；册本是用户行维度而非组织节点；候选节点不进入授权树；范围外节点只保留名称与编号，不提供数据与操作</div></div></div><div class="card-body">${treeRows.length?V.table('v5OrgTree',['组织节点','节点编号','节点类型','下属节点','数据范围'],treeRows):emptyBlock('组织树未加载','请确认 organization.js 已加载。')}</div></section>
  <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">平台演示账号</h2><div class="card-subtitle">按账号 ID 操作；新增、停用与重置密码仅在具备对应权限时可用</div></div><div class="card-head-actions"><button type="button" class="btn primary" id="v5AddAccount" ${createTargets.length?'':'disabled'}>＋ 新增账号</button></div></div><div class="card-body">${accountRows.length?V.table('v5Accounts',['姓名','所属单位','角色','账号状态','操作'],accountRows):emptyBlock('当前范围无平台演示账号','账号按组织归属隔离，当前身份范围内没有可管理的演示账号。')}
    <div class="notice v4-tip" role="note" style="margin-top:10px">${S()?.icon('shield')||''}<div><strong>真实账号与 SSO</strong><div class="muted">源系统账号、统一认证与单点登录尚未接入：真实账号 0 个，未授权项保持空白（P），不按默认放行。</div></div></div></div></section>
  <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">角色与数据权限</h2><div class="card-subtitle">8 类角色对应不同数据范围；下属单位、班组与线路范围由组织归属与责任线路推导</div></div></div><div class="card-body">${roleRows.length?V.table('v5RoleTable',roleHeaders,roleRows):emptyBlock('角色未加载','请确认 access.js 已加载。')}</div></section>
  <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">演示身份</h2><div class="card-subtitle">虚构身份；未绑定实际账号的身份数据范围为空白（P），仅在显式演示身份下开放演示写能力</div></div></div><div class="card-body">${personaRows.length?V.table('v5PersonaTable',['身份','角色','数据范围','范围状态','当前'],personaRows):emptyBlock('身份未加载','请确认 demo-profiles.js 与 access.js 已加载。')}</div></section>`;
  return {html,mount(){
   S().refreshIcons&&S().refreshIcons();
   const rerender=()=>{const next=V.renderAuth();const page=document.getElementById('page');page.innerHTML=next.html;next.mount();};
   document.getElementById('v5AddAccount')?.addEventListener('click',()=>{
    if(!createTargets.length)return S().toast('当前身份无权新增平台账号');
    S().openModal({title:'新增平台演示账号',subtitle:'仅保存在当前页面内存，不写入本地存储、不对接源系统账号',
      body:`<div class="form-grid"><label class="field">姓名<input id="accName" class="control" placeholder="如：张管理员"></label>
        <label class="field">所属单位<select id="accCompany" class="control">${createTargets.map(node=>`<option value="${esc(node.id)}">${esc(node.name)}</option>`).join('')}</select></label>
        <label class="field">角色<select id="accRole" class="control">${roles.map(role=>`<option>${esc(role.label||role.id)}</option>`).join('')}</select></label></div>`,
      footer:`<button type="button" class="btn" data-close>取消</button><button type="button" class="btn primary" id="accSave">保存（内存）</button>`});
    document.getElementById('accSave').onclick=()=>{
      const name=document.getElementById('accName').value.trim();
      const orgNodeId=document.getElementById('accCompany').value;
      const role=document.getElementById('accRole').value;
      if(!name)return S().toast('请填写账号姓名');
      const result=admin()?.addAccount?.({name,company:nodeLabel(orgNodeId),role,orgNodeId})||{ok:false,reason:'账号模块未加载'};
      if(!result.ok)return S().toast(result.ok===false?denyText(result.reason,'账号未创建'):result.message||'账号未创建');
      S().closeLayers();S().toast('账号已加入平台演示清单（仅内存）');rerender();
    };
   });
   /* 修改平台演示账号：提交前按目标组织节点校验，未知节点与范围外节点一律拒绝。 */
   document.querySelectorAll('[data-account-edit]').forEach(button=>button.onclick=()=>{
    if(button.disabled)return;
    const id=button.dataset.accountEdit,account=accounts.find(item=>String(item.id)===String(id));
    if(!account)return S().toast('账号不存在或不在当前范围');
    const targets=nodes.filter(node=>node.type==='company'&&(String(node.id)===String(account.orgNodeId)||access?.can?.('account.update',{orgNodeId:node.id,unitId:node.unitId!=null?String(node.unitId):undefined})));
    S().openModal({title:'编辑平台演示账号',subtitle:'仅保存在当前页面内存；修改用户基础信息按原文权限校验所属组织节点',
      body:`<div class="form-grid"><label class="field">姓名<input id="accEditName" class="control" value="${esc(account.name||'')}"></label>
        <label class="field">所属单位<select id="accEditCompany" class="control">${(targets.length?targets:[{id:account.orgNodeId||'',name:account.company||'—'}]).map(node=>`<option value="${esc(node.id)}" ${String(node.id)===String(account.orgNodeId)?'selected':''}>${esc(node.name)}</option>`).join('')}</select></label>
        <label class="field">角色<select id="accEditRole" class="control">${roles.map(role=>{const label=role.label||role.id;return `<option ${label===account.role?'selected':''}>${esc(label)}</option>`;}).join('')}</select></label></div>
        <div class="notice v4-tip" role="note" style="margin-top:10px">${S()?.icon('shield')||''}<div><strong>校验规则</strong><div class="muted">仅可修改当前身份范围内的平台演示账号；目标组织节点未知或超出范围时提交被拒绝，并记入操作日志。</div></div></div>`,
      footer:`<button type="button" class="btn" data-close>取消</button><button type="button" class="btn primary" id="accEditSave">保存（内存）</button>`});
    document.getElementById('accEditSave').onclick=()=>{
      const name=document.getElementById('accEditName').value.trim(),orgNodeId=document.getElementById('accEditCompany').value,role=document.getElementById('accEditRole').value;
      if(!name)return S().toast('请填写账号姓名');
      if(!access?.can?.('account.update',accountSubject(account)))return S().toast('原账号不在当前身份范围，已拒绝');
      const targetNode=orgNode(orgNodeId);
      if(!targetNode)return S().toast('目标组织节点不存在，已拒绝');
      if(!access?.can?.('account.update',{orgNodeId:targetNode.id,unitId:targetNode.unitId!=null?String(targetNode.unitId):undefined}))return S().toast('目标组织节点不在当前身份范围，已拒绝');
      const result=admin()?.updateAccount?.(account.id,{name,role,orgNodeId})||{ok:false,reason:'账号修改接口未就绪'};
      if(!result.ok)return S().toast(denyText(result.reason,'账号未修改'));
      S().closeLayers();S().toast('账号信息已更新（仅内存）');rerender();
    };
   });
   document.querySelectorAll('[data-account-toggle]').forEach(button=>button.onclick=()=>{
    if(button.disabled)return;
    const result=admin()?.toggleAccount?.(button.dataset.accountToggle)||{ok:false,reason:'账号模块未加载'};
    if(!result.ok)return S().toast(denyText(result.reason,'当前身份无权变更账号状态'));
    S().toast(result.status==='disabled'?'账号已停用（演示）':'账号已启用（演示）');rerender();
   });
   document.querySelectorAll('[data-account-reset]').forEach(button=>button.onclick=()=>{
    if(button.disabled)return;
    const result=admin()?.resetPassword?.(button.dataset.accountReset)||{ok:false,reason:'账号模块未加载'};
    if(!result.ok)return S().toast(denyText(result.reason,'当前身份无权重置密码'));
    S().toast(result.message||'已记录重置密码操作（演示，不产生真实凭据）');rerender();
   });
  }};
 };

 /* 操作日志：平台侧写日志（WB_ADMIN.logs）与鉴权/导出守卫日志（E.auditLog）合并展示，拒绝原因用户可见。 */
 function logRows(){
  const admin=window.WB_ADMIN;
  const timeText=value=>{if(value==null||value==='')return '—';const date=value instanceof Date?value:new Date(value);if(Number.isNaN(date.getTime()))return String(value);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}:${String(date.getSeconds()).padStart(2,'0')}`;};
  const merged=list(admin?.logs?.()).slice(-200).map(row=>{const action=String(row.action||'');return {id:row.id,at:timeText(row.at),who:row.actor||row.personaId||'—',source:/^导出/.test(action)?'导出':row.result==='denied'?'权限':'平台',action:action||'—',target:row.targetLabel||row.target||'—',ok:row.result!=='denied',reason:row.reason};});
  return {headers:['日志编号','时间','身份','来源','操作','对象','结果'],rows:merged.map(row=>[text(row.id),text(row.at),text(row.who),text(row.source),text(row.action),text(row.target),row.ok?'<span class="badge green">成功</span>':`<span class="badge orange">拒绝：${esc(row.reason||'无权')}</span>`])};
 }
 function logPanel(){
  const model=logRows();
  if(!model.rows.length)return emptyBlock('暂无操作日志','当前身份尚未产生平台侧演示写操作；提交一次计划值、账号或参数变更、或触发一次越权拒绝后在此记录。');
  return V.table('v5LogTable',model.headers,model.rows);
 }
 /* ===== V4 新增：系统设置（SET） ===== */
 V.renderSet=()=>{
  const facts=E.filterFacts?E.filterFacts():[];
  const access=A();
  const admin=()=>window.WB_ADMIN;
  const canPlan=nodeId=>!!access?.can?.('plan.write',{orgNodeId:nodeId});
  const companyNodes=orgNodes().filter(node=>node.type==='company'&&inScopeNode(node.id)).sort((a,b)=>String(a.name).localeCompare(String(b.name),'zh'));
  const unitSold=unitId=>facts.filter(fact=>String(fact.unitId)===String(unitId)).reduce((total,fact)=>total+(Number(fact.sold_vol)||0),0);
  const planRows=companyNodes.map(node=>{
   const allowed=canPlan(node.id);
   const edited=allowed&&!!admin()?.hasPlan?.(node.id);
   const stored=allowed&&admin()?.planOf?admin().planOf(node.id):null;
   const sample=facts.filter(fact=>String(fact.unitId)===String(node.unitId)).reduce((total,fact)=>total+(Number(fact.plan_vol)||0),0);
   const plan=sample?sample/10000:null;
   const planWan=stored==null?plan:stored;
   const actual=unitSold(node.unitId);
   const completion=planWan?actual/(planWan*10000)*100:null;
   return [text(node.name),allowed?(planWan==null?'—':number(planWan,2)):'—',number(actual,0),allowed?(completion==null?'—':number(completion,1)+'%'):'—',
     allowed?(edited?'<span class="badge green">已手工填报</span>':'<span class="badge gray">样例计划</span>'):'<span class="badge gray">无权限（计划值不向下继承）</span>'];
  });
  const dict=[
   ['时间口径','业务账期 / 财务自然月','只读','双口径并存，不可互换'],
   ['新增用户窗口','所选月1日 — 月末（自然月）','只读','仅用于新增户'],
   ['用水性质',text(list(D.natures).join('、')),'只读','来自源系统字典'],
   ['水表口径',text(list(D.calibers).join('、')),'只读','口径列表'],
   ['水表类型',text(list(D.meterTypes).join('、')),'只读','远传/普通'],
   ['产销差率口径','供水量与售水量差率；营业所层级不展示','只读','分区计量产销差需甲方提供区域图']
  ].map(r=>[text(r[0]),r[1],text(r[2]),text(r[3])]);
  const paramDefs=list(admin()?.paramDefs?.());
  const paramScopeId=(access?.current?.()||{}).scope?.roots?.[0]||null;
  const canParam=!!(paramScopeId&&access?.can?.('parameter.write',{orgNodeId:paramScopeId}));
  const paramRows=paramDefs.map(def=>{
   const current=admin()?.paramValue?.(def.key);
   const control=`<span style="display:inline-flex;align-items:center;gap:6px"><input type="number" class="control compact" data-param-key="${esc(def.key)}" aria-label="${esc(def.label)}" min="${def.min}" max="${def.max}" step="${def.step}" value="${current}" ${canParam?'':'disabled'} style="width:110px">${def.unit?`<span class="muted" style="font-size:11px">${esc(def.unit)}</span>`:''}</span>`;
   return [text(def.label),control,text(def.entry),text(def.note)];
  });
  const editableNodes=companyNodes.filter(node=>canPlan(node.id));
  const logCount=list(admin()?.logs?.()).length;
  const planCount=list(admin()?.planEntries?.()).length;
  const html=`<section class="notice v4-tip" role="note">${S()?.icon('shield')||''}<div><strong>平台配置（A 原型）</strong><div class="muted">指标口径、计划值、报表参数与操作日志为平台侧配置；修改仅保存在当前页面内存，刷新即恢复，不写源系统。</div></div></section>
  <section class="kpi-grid four">${V.card('指标口径','6','项','只读口径清单','clipboard')}${V.card('计划值节点',String(planRows.length),'个',`其中已手工填报 ${planCount} 个`,'chart','green')}${V.card('报表参数',String(paramDefs.length),'项',canParam?'当前身份可维护参数':'参数只读（需显式演示身份）','report','orange')}${V.card('操作日志',String(logCount),'条','当前身份范围内的演示写操作','clock')}</section>
  <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">指标口径与字典</h2><div class="card-subtitle">口径类配置只读展示，避免与源系统定义冲突</div></div></div><div class="card-body">${V.table('v5DictTable',['配置项','当前值','状态','说明'],dict)}</div></section>
  <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">计划值维护</h2><div class="card-subtitle">计划值按组织节点编号填报（演示）；售水量取自当前身份可见范围</div></div><div class="card-head-actions"><span class="badge gray">口径：${esc(admin()?.periodKey?.()||'年内累计')}</span><button type="button" class="btn" id="v5PlanReset" ${editableNodes.length?'':'disabled'}>还原全部</button><button type="button" class="btn primary" id="v5PlanEdit" ${editableNodes.length?'':'disabled'}>✎ 手工填报（演示）</button></div></div><div class="card-body">${planRows.length?V.table('v5PlanTable',['经营单位','期间计划(万m³)','可见范围售水量(m³)','计划完成率','数据状态'],planRows):emptyBlock('组织树未加载','请确认 organization.js 已加载。')}<div class="notice v4-tip" role="note" style="margin-top:10px">${S()?.icon('shield')||''}<div><strong>填报口径</strong><div class="muted">计划值是经营单位级平台填报值，不覆盖源系统数据，也不向下继承到营业所/班组/线路；保存后立即影响首页与下钻页的“计划完成率”，刷新页面即还原为样例计划。</div></div></div></div></section>
  <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">报表参数</h2><div class="card-subtitle">参数用于报表与图表口径；需 parameter.write 权限，仅演示</div></div></div><div class="card-body">${paramRows.length?V.table('v5ParamTable',['参数','当前值','适用入口','说明'],paramRows):emptyBlock('参数定义未加载','请确认 admin.js 已加载。')}</div></section>
  <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">操作日志</h2><div class="card-subtitle">记录当前身份范围内的演示写操作（仅内存，刷新清空；不写源系统日志）</div></div><div class="card-head-actions"><span class="badge gray">${logCount} 条</span></div></div><div class="card-body" id="v5LogPanel">${logPanel()}</div></section>`;
  return {html,mount(){
   S().refreshIcons&&S().refreshIcons();
   const rerender=()=>{const next=V.renderSet();document.getElementById('page').innerHTML=next.html;next.mount();};

   // 计划值手工填报（内存内闭环，按组织节点编号）
   document.getElementById('v5PlanEdit')?.addEventListener('click',()=>{
    if(!editableNodes.length)return S().toast('当前身份不具备计划值维护权限');
    const rows=editableNodes.map(node=>{
      const stored=admin()?.planOf?admin().planOf(node.id):null;
      const sample=facts.filter(fact=>String(fact.unitId)===String(node.unitId)).reduce((total,fact)=>total+(Number(fact.plan_vol)||0),0)/10000;
      const planWan=stored==null?(sample||null):stored;
      const filled=!!admin()?.hasPlan?.(node.id);
      const value=planWan==null?'':Number(planWan.toFixed(2));
      return `<tr><td>${esc(node.name)}</td><td class="mono">${esc(node.id)}</td><td><input class="control plan-input" data-plan-node="${esc(node.id)}" data-plan-base="${value}" type="number" min="0" step="0.1" value="${value}" aria-label="${esc(node.name)}期间计划"></td><td class="numeric">${fmt(unitSold(node.unitId),0)}</td><td>${filled?'<span class="badge green">已填报</span>':'<span class="badge gray">样例</span>'}</td></tr>`;
    }).join('');
    S().openModal({title:'手工填报计划值（演示）',subtitle:`口径：${admin()?.periodKey?.()||'年内累计'}　仅保存在当前页面内存，不覆盖源系统数据`,
      body:`<div class="notice v4-tip" role="note">${S()?.icon('shield')||''}<div><strong>填报说明</strong><div class="muted">按组织节点编号填报经营单位“期间计划(万m³)”，保存后首页与下钻页的“计划完成率”立即按新计划计算；刷新页面即还原为样例计划。</div></div></div>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>经营单位</th><th>节点编号</th><th>期间计划(万m³)</th><th>可见范围售水量(m³)</th><th>状态</th></tr></thead><tbody>${rows}</tbody></table></div>`,
      footer:`<button type="button" class="btn" data-close>取消</button><button type="button" class="btn primary" id="planSave">保存（内存）</button>`});
    document.getElementById('planSave').onclick=()=>{
      const inputs=[...document.querySelectorAll('[data-plan-node]')];
      let ok=0,fail=0,skipped=0,reason='';
      inputs.forEach(input=>{
        const nodeId=input.dataset.planNode,raw=input.value.trim();
        if(!raw)return;
        if(Number(raw)===Number(input.dataset.planBase)){skipped+=1;return;}
        const result=admin()?.setPlan?.(nodeId,Number(raw))||{ok:false,reason:'计划值模块未加载'};
        if(result.ok)ok+=1;else{fail+=1;reason=result.reason||reason;}
      });
      if(!ok){return S().toast(fail?denyText(reason,'计划值未保存'):'计划值未变化，未产生改动');}
      S().closeLayers();
      S().toast(`已保存 ${ok} 个经营单位的计划值（仅内存）${skipped?`；${skipped} 个未变化`:''}${fail?`；${fail} 个被拒绝`:''}`);
      rerender();
    };
   });
   document.getElementById('v5PlanReset')?.addEventListener('click',()=>{
    if(!editableNodes.length)return S().toast('当前身份不具备计划值维护权限');
    let ok=0;
    editableNodes.forEach(node=>{const result=admin()?.resetPlan?.(node.id);if(!result||result.ok!==false)ok+=1;});
    S().toast(ok?`已还原 ${ok} 个经营单位的样例计划（仅内存）`:'暂无可还原的计划值');rerender();
   });

   // 报表参数（需 parameter.write；拒绝时回滚输入）
   document.querySelectorAll('[data-param-key]').forEach(input=>{
    const previous=input.value;
    input.onchange=()=>{
      if(!canParam){input.value=previous;return S().toast('当前身份不具备报表参数维护权限（需显式演示身份）');}
      const result=admin()?.setParam?.(input.dataset.paramKey,input.value)||{ok:false,reason:'参数模块未加载'};
      if(!result.ok){input.value=previous;return S().toast(result.ok===false?denyText(result.reason,'参数未保存'):result.message||'参数未保存');}
      S().toast(`参数已调整：${input.value}（内存）`);rerender();
    };
   });
  }};
 };

V.commonMetricChart=setupCommonChart;
})();
