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
 const userById=new Map(list(D.users).map(user=>[user.id,user]));
 const billUser=bill=>userById.get(bill.userId)||{};

 V.card=(title,value,unit,note,icon='chart',tone='')=>`<article class="card kpi-card"><div class="kpi-top"><span class="kpi-icon ${tone}">${S()?.icon(icon)||''}</span><span>${esc(title)}</span></div><div class="kpi-main"><span class="kpi-value numeric">${typeof value==='number'?fmt(value,2):value}</span><span class="kpi-unit">${esc(unit)}</span></div><div class="kpi-foot"><span>${esc(note)}</span></div></article>`;
 V.cards=totals=>`<section class="kpi-grid">${V.card('售水量',fmt(totals.sold_vol/10000,1),'万吨','当前范围累计售水量','water')}${V.card('收费率',fmt(totals.charge_rate_pct),'%','实收本金 / 应收本金','wallet','green')}${V.card('产销差率',fmt(totals.loss_rate_pct),'%','供售水量综合差率','flow','orange')}${V.card('售水均价',fmt(totals.avg_price_yuan,3),'元/m³','综合售水单价','meter')}${V.card('注册用户',fmt(totals.registered_count),'户','当前范围期末存量','users','green')}</section>`;
 V.table=(id,headers,rows)=>`<div id="${id}" class="table-scroll"><table class="data-table"><thead><tr>${headers.map(header=>`<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}"><div class="empty">暂无符合条件的数据，请调整查询条件或等待数据接入。</div></td></tr>`}</tbody></table></div>`;
 V.featureFooter=()=> '';

 function chart(def){return {html:E.chartCard(def),mount:()=>E.registerChart(def.id,def.id,def)};}
 function metricRows(ctx){return E.group(ctx.data,ctx.state.dimension,ctx.filters).map(row=>[row.name,row.sold_vol,row.charge_rate_pct,row.loss_rate_pct]);}
 function setupCommonChart(id,title,subtitle,extra={}){return {id,title,subtitle,dimension:'company',granularity:true,headers:['期间','售水量(m³)','计划值(m³，非预测)'],getOption:ctx=>E.lineOption({data:E.trend(ctx.data,ctx.filters,ctx.state.granularity),metrics:['sold_vol','plan_vol'],area:true}),getRows:ctx=>E.trend(ctx.data,ctx.filters,ctx.state.granularity).map(row=>[row.name,row.sold_vol,row.plan_vol]),...extra};}
 function dimensionFilter(row,f=WB.state){
  return (!f.company||row.company===f.company)&&(!f.admin||row.adminCode===f.admin)&&(!f.functional||list(row.functionalZones).includes(f.functional))&&(!f.org||row.org===f.org)&&(!f.nature||row.nature===f.nature)&&(!f.industry||row.industry===f.industry)&&(!f.caliberMm||row.caliber===f.caliberMm)&&(!f.meterType||row.meterType===f.meterType);
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
 function setCurrent(headers,rows){WB.currentTable={headers,rows};}
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
  const chartDef=chart({id:'C-AR-RECEIPTS',title:'应收、实收与收费率',subtitle:'按用水性质查看，可切换经营单位与组织',dimensions:['nature','company','org'],dimension:'nature',data:f=>filtered(D.bills,f,'period'),headers:['维度','应收金额(元)','实收金额(元)','欠费金额(元)','收费率(%)'],getOption:ctx=>arCompareOption(billGroups(ctx.data,ctx.state.dimension)),getRows:ctx=>billGroups(ctx.data,ctx.state.dimension).map(row=>[row.name,row.receivable,row.received,row.arrears,row.charge])});
  const debtDef=chart({id:'C-AR-DEBT-YEAR',title:'欠费金额按账务年分布',subtitle:'仅统计当前查询范围内的未结清账单',dimensions:[],data:f=>filtered(D.bills,f,'period').filter(row=>row.arrears>0),headers:['账务年','欠费金额(元)','欠费账单(笔)','欠费用户(户)'],getOption:ctx=>basicBarOption(billGroups(ctx.data,row=>row.period.slice(0,4)).map(row=>({name:row.name,value:row.arrears})),{label:'欠费金额',unit:'元',color:'#D95555'}),getRows:ctx=>billGroups(ctx.data,row=>row.period.slice(0,4)).map(row=>[row.name,row.arrears,row.count,new Set(ctx.data.filter(x=>x.period.startsWith(row.name)).map(x=>x.userId)).size])});
  const state={tab:'bills',page:1,size:20};
  const tabs=[['bills','应收账单'],['debt','欠费用户'],['aging','账龄分析'],['large','5000m³专项'],['adjust','调整减免'],['refund','退款'],['special','特殊开账 / 待处理账']];
  const html=`<section id="arKpis" class="kpi-grid four"></section><div class="notice">账单只读；部分缴费的欠费水量待核，5000m³仅作专项筛选。${risk('L2','部分缴费/预存冲抵的欠费水量口径待确认')}</div><section class="chart-grid">${chartDef.html}${debtDef.html}</section><section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">应收与账务明细</h2><div class="card-subtitle">切换页签查看对应账单或专项台账</div></div><div class="card-head-actions"><button type="button" class="btn" data-export-current>导出当前表</button></div></div><div class="tabs" role="tablist">${tabs.map(([key,label],index)=>`<button type="button" role="tab" data-ar="${key}" class="${index===0?'active':''}" aria-selected="${index===0}">${label}</button>`).join('')}</div><div id="arTable"></div></section>`;
  function adjustment(kind){
   let rows=filtered(D.adjustments,WB.state,'bill_period');
   const type=row=>row.proc_type||row.procType||row.type||'';
   if(kind==='refund')rows=rows.filter(row=>/退款|退费/.test(type(row)));
   else if(kind==='special')rows=rows.filter(row=>/特殊|待处理/.test(type(row)));
   else rows=rows.filter(row=>!/退款|退费|特殊|待处理/.test(type(row)));
   const headers=['处理单号','账期','统一表卡','经营单位','处理类型','处理金额(元)','发起人','发起时间','审核状态','原因'];
   const raw=rows.map(row=>[row.adj_order_no||row.id,row.bill_period||row.period,row.card||row.unified_code||row.cust_id,row.company,type(row),row.proc_amt??row.procAmt??row.amount,row.initiator_name||row.initiator,row.initiate_time||row.time,row.audit_status||row.status,row.reason_desc||row.reason]);
   return {headers,raw,empty:kind==='refund'?'暂无退款记录，未以账单或调整记录推算退款。':kind==='special'?'暂无特殊开账或待处理账记录。':'暂无调整减免记录。'};
  }
  function tableModel(){
   const bills=filtered(D.bills,WB.state,'period');
   if(state.tab==='bills'){
    const headers=['账单编号','账期','统一表卡','经营单位','用水性质','水量(m³)','应收(元)','实收(元)','欠费(元)','到期日','状态','操作'];
    const raw=bills.map(row=>[row.id,row.period,row.card,row.company,row.nature,row.volume,row.amount,row.received,row.arrears,row.dueAt,row.status,row.id]);
    return {headers,raw,kind:'bills'};
   }
   if(state.tab==='debt'||state.tab==='large'){
    let rows=debtUsers(bills);
    if(state.tab==='large'){
     const end=WB.state.month||'2026-10',start=String(Number(end.slice(0,4))-4)+'-01';
     rows=debtUsers(filtered(D.bills,{...WB.state,period:'自定义',start,end},'period')).filter(row=>row.volume!=null&&row.volume>=5000);
    }
    const headers=['统一表卡','用户','经营单位','用水性质','欠费笔数','欠费水量(m³)','欠费金额(元)','最早账期','最近账期'];
    return {headers,raw:rows.map(row=>[row.card,row.user.name,row.company,row.nature,row.count,row.volume,row.amount,row.first,row.last]),kind:state.tab};
   }
   if(state.tab==='aging'){
    const asOf=Date.parse('2026-10-31T00:00:00Z');
    const buckets=[['0-30天',0,30],['31-90天',31,90],['91-180天',91,180],['181-365天',181,365],['365天以上',366,100000]];
    const rows=filtered(D.bills,WB.state,'period').filter(row=>row.arrears>0);
    const byCompany=new Map();
    rows.forEach(row=>{
     const days=Math.floor((asOf-Date.parse(String(row.dueAt||row.period+'-25')+'T00:00:00Z'))/86400000);
     const idx=Math.max(0,buckets.findIndex(([,lo,hi])=>days>=lo&&days<=hi));
     const key=row.company||'未知';
     const entry=byCompany.get(key)||{company:key,count:0,amount:0,buckets:[0,0,0,0,0]};
     entry.count+=1;entry.amount+=Number(row.arrears)||0;entry.buckets[idx]+=Number(row.arrears)||0;
     byCompany.set(key,entry);
    });
    const headers=['经营单位','逾期笔数',...buckets.map(([name])=>name+'(元)'),'欠费合计(元)'];
    const raw=[...byCompany.values()].sort((a,b)=>b.amount-a.amount).map(entry=>[entry.company,entry.count,...entry.buckets.map(value=>+value.toFixed(2)),+entry.amount.toFixed(2)]);
    return {headers,raw,kind:'aging'};
   }
   return {...adjustment(state.tab),kind:state.tab};
  }
  function drawTable(){
   const model=tableModel(),pages=Math.max(1,Math.ceil(model.raw.length/state.size));state.page=Math.min(state.page,pages);
   setCurrent(model.kind==='bills'?model.headers.slice(0,-1):model.headers,model.raw.map(row=>model.kind==='bills'?row.slice(0,-1):row.slice()));
   const rows=pageRows(model.raw,state.page,state.size).map(row=>{
    if(model.kind==='bills')return [text(row[0]),text(row[1]),text(row[2]),text(row[3]),text(row[4]),number(row[5],0),number(row[6]),number(row[7]),number(row[8]),text(row[9]),text(row[10]),`<button type="button" class="btn xs" data-bill-detail="${esc(row[0])}">查看</button>`];
    if(model.kind==='debt'||model.kind==='large')return [text(row[0]),text(row[1]),text(row[2]),text(row[3]),number(row[4],0),row[5]==null?'<span class="badge orange">待核</span>':number(row[5],0),number(row[6]),text(row[7]),text(row[8])];
    if(model.kind==='aging')return row.map((cell,index)=>index<=1?text(cell):number(cell));
    return row.map((cell,index)=>index===5?number(cell):text(cell));
   });
   const content=V.table('arLedger',model.headers,rows)+pager('ar',model.raw.length,state.page,state.size);
   document.getElementById('arTable').innerHTML=model.empty&&!model.raw.length?emptyBlock('当前页签暂无数据',model.empty):content;
  }
  function drawKpis(){const totals=billTotals(filtered(D.bills,WB.state,'period'));document.getElementById('arKpis').innerHTML=V.card('应收金额',fmt(totals.amount,2),'元','当前账单范围','wallet')+V.card('实收金额',fmt(totals.received,2),'元','同一账单范围','wallet','green')+V.card('欠费金额',fmt(totals.arrears,2),'元','未结清账单金额','report','orange')+V.card('收费率',fmt(totals.charge),'%','实收金额 / 应收金额','chart','green');}
  function openBill(id){const row=list(D.bills).find(bill=>bill.id===id);if(!row)return;S().openDrawer({title:`账单 ${row.id}`,subtitle:'源账单只读详情',body:`<div class="kv-grid">${[['统一表卡',row.card],['业务账期',row.period],['经营单位',row.company],['用水性质',row.nature],['账单水量',number(row.volume,0)+' m³'],['应收金额',number(row.amount)+' 元'],['实收金额',number(row.received)+' 元'],['欠费金额',number(row.arrears)+' 元'],['到期日',row.dueAt],['最近缴费时间',row.paidAt],['缴费方式',row.payWay],['账单状态',row.status]].map(([label,value])=>`<div class="kv"><span>${esc(label)}</span><b>${text(value)}</b></div>`).join('')}</div><div class="notice">账单信息只读。</div>`});}
  return {html,mount(){chartDef.mount();debtDef.mount();drawKpis();drawTable();document.querySelectorAll('[data-ar]').forEach(button=>button.onclick=()=>{state.tab=button.dataset.ar;state.page=1;document.querySelectorAll('[data-ar]').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-selected',String(item===button));});drawTable();});document.getElementById('arTable').addEventListener('click',event=>{const page=event.target.closest('[data-ar-page]'),bill=event.target.closest('[data-bill-detail]');if(page&&!page.disabled){state.page=Number(page.dataset.arPage);drawTable();}if(bill)openBill(bill.dataset.billDetail);});}};
 };

 /* DMA：需求入口保留；拓扑、时序采集与测压数据未接入时不制造图形或数值。 */
 V.renderDma=()=>{
  let tab='topology';
  const tabs=[['topology','物理拓扑'],['night','夜间流量'],['hourly','24小时瞬时流量'],['pressure','压力监测'],['balance','供售水分析']];
  const nodes=()=>(D.dmaNodes||[]).filter(node=>!WB.state.company||node.company===WB.state.company);
  const nodeIds=()=>new Set(nodes().map(node=>node.id));
  const readings=()=>(D.dmaReadings||[]).filter(row=>nodeIds().has(row.node_id));
  const balance=()=>(D.dmaBalance||[]).filter(row=>nodeIds().has(row.node_id));
  function summary(){
   const rows=readings(),ok=rows.filter(row=>row.comm_status==='正常').length;
   const night=rows.filter(row=>row.hour>=1&&row.hour<=4);
   const byNode=new Map();
   night.forEach(row=>{const cur=byNode.get(row.node_id)||Infinity;byNode.set(row.node_id,Math.min(cur,row.inst_flow));});
   const mnf=byNode.size?Math.min(...byNode.values()):null;
   const pressures=rows.map(row=>row.pressure_mpa).filter(value=>value!=null);
   return {nodeCount:nodes().length,mnf,avgPressure:pressures.length?pressures.reduce((a,b)=>a+b,0)/pressures.length:null,commRate:rows.length?ok/rows.length*100:null};
  }
  const html=`<div class="notice">分区计量样例：拓扑、逐时流量、压力与供售水由样例数据生成；真实分区区域图与流量计↔考核表↔户表映射仍待甲方提供。${risk('L1','DMA 拓扑与映射为样例，真实区域图待甲方提供')}</div><section id="dmaKpis" class="kpi-grid four"></section><section class="chart-grid" id="dmaCharts"></section><section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">分区计量与流量计</h2><div class="card-subtitle">物理拓扑、夜间流量、瞬时流量、压力与供售水</div></div></div><div class="tabs" role="tablist">${tabs.map(([key,label],index)=>`<button type="button" role="tab" data-dma-tab="${key}" class="${index===0?'active':''}" aria-selected="${index===0}">${label}</button>`).join('')}</div><div id="dmaPanel"></div></section>`;
  function drawKpis(){
   const info=summary();
   document.getElementById('dmaKpis').innerHTML=V.card('DMA 节点',String(info.nodeCount),'个','当前范围',"flow")+V.card('最小夜间流量',info.mnf==null?'—':fmt(info.mnf,2),'m³/h','各节点 01-04 时最小值',"clock",'orange')+V.card('平均压力',info.avgPressure==null?'—':fmt(info.avgPressure,3),'MPa','逐时压力均值',"meter",'green')+V.card('通讯正常率',info.commRate==null?'—':fmt(info.commRate,2),'%','逐时采集记录','chart');
  }
  function table(headers,rows){setCurrent(headers,rows.map(row=>row.slice()));document.getElementById('dmaPanel').innerHTML=V.table('dmaReadonly',headers,rows.map(row=>row.map(cell=>esc(text(cell)))));}
  // ===== 3-6：分区计量图表（夜流 / 24 小时 / 压力 / 供售水）=====
  const DMAX={
    night:{id:'C-DMA-01',title:'夜间最小流量（按日）',subtitle:'01–04 时各节点最小流量；按日展示当月样例 7 天'},
    hourly:{id:'C-DMA-02',title:'24 小时瞬时流量曲线',subtitle:'全天逐时平均瞬时流量；夜间低谷可见'},
    pressure:{id:'C-DMA-03',title:'各节点平均压力',subtitle:'逐时压力均值；缺测节点不补 0'},
    balance:{id:'C-DMA-04',title:'分区供售水量与产销差',subtitle:'最新账期各分区供水量、售水量与产销差率'}
  };
  function dmaMetric(kind){
    const rows=readings();
    if(kind==='night'){
      const days=[...new Set(rows.map(r=>r.period))].sort();
      return days.map(day=>{
        const dayRows=rows.filter(r=>r.period===day&&r.hour>=1&&r.hour<=4);
        return {name:day.slice(5),value:dayRows.length?+Math.min(...dayRows.map(r=>r.inst_flow)).toFixed(2):null};
      });
    }
    if(kind==='hourly'){
      const byHour=new Map();
      rows.forEach(r=>{const e=byHour.get(r.hour)||{sum:0,count:0};e.sum+=r.inst_flow;e.count+=1;byHour.set(r.hour,e);});
      return [...byHour.entries()].sort((a,b)=>a[0]-b[0]).map(([h,e])=>({name:`${String(h).padStart(2,'0')}:00`,value:+(e.sum/e.count).toFixed(2)}));
    }
    if(kind==='pressure'){
      const byNode=new Map();
      rows.forEach(r=>{if(r.pressure_mpa==null)return;const e=byNode.get(r.node_id)||{sum:0,count:0};e.sum+=r.pressure_mpa;e.count+=1;byNode.set(r.node_id,e);});
      return [...byNode.entries()].map(([id,e])=>{const node=(D.dmaNodes||[]).find(n=>n.id===id)||{};
        return {name:node.node_name||id,value:+(e.sum/e.count).toFixed(3)};}).sort((a,b)=>b.value-a.value);
    }
    const rowsB=balance(),latest=[...new Set(rowsB.map(r=>r.period))].sort().pop();
    return rowsB.filter(r=>r.period===latest).map(r=>({name:r.node_name,supply:r.supply_vol,sold:r.sold_vol,loss:r.supply_vol?+(r.loss_rate_pct).toFixed(2):null}));
  }
  function dmaOption(kind){
    const data=dmaMetric(kind);
    if(!data.length)return E.emptyOption();
    if(kind==='balance'){
      return {color:['#317FC2','#41A75E','#F58B3C'],tooltip:{trigger:'axis'},legend:{bottom:0,textStyle:{fontSize:10,color:'#758697'}},grid:{left:56,right:56,top:26,bottom:52},
        xAxis:{type:'category',data:data.map(d=>d.name),axisLabel:{fontSize:10,rotate:data.length>5?22:0}},
        yAxis:[{type:'value',name:'m³',axisLabel:{fontSize:10}},{type:'value',name:'产销差率(%)',axisLabel:{fontSize:10,formatter:'{value}%'}}],
        series:[{name:'供水量',type:'bar',barMaxWidth:26,data:data.map(d=>d.supply),itemStyle:{color:'#317FC2',borderRadius:[4,4,0,0]}},
          {name:'售水量',type:'bar',barMaxWidth:26,data:data.map(d=>d.sold),itemStyle:{color:'#41A75E',borderRadius:[4,4,0,0]}},
          {name:'产销差率',type:'line',yAxisIndex:1,smooth:true,symbolSize:6,data:data.map(d=>d.loss),lineStyle:{width:2,color:'#F58B3C'},itemStyle:{color:'#F58B3C'}}]};
    }
    const isLine=kind==='hourly'||kind==='night';
    const unit=kind==='pressure'?'MPa':'m³/h';
    return {color:[kind==='pressure'?'#8E6FD8':'#317FC2'],tooltip:{trigger:isLine?'axis':'item'},grid:{left:56,right:20,top:26,bottom:kind==='pressure'?58:36},
      xAxis:{type:'category',data:data.map(d=>d.name),axisLabel:{fontSize:10,rotate:kind==='pressure'?24:0}},
      yAxis:{type:'value',name:unit,axisLabel:{fontSize:10}},
      series:[{name:kind==='pressure'?'平均压力':kind==='night'?'夜间最小流量':'平均瞬时流量',
        type:isLine?'line':'bar',smooth:true,symbolSize:kind==='night'?7:5,barMaxWidth:26,
        data:data.map(d=>d.value),
        lineStyle:{width:2,color:kind==='pressure'?'#8E6FD8':'#317FC2'},
        itemStyle:{color:kind==='pressure'?'#8E6FD8':'#317FC2',borderRadius:[4,4,0,0]},
        label:{show:!isLine,position:'top',fontSize:10,color:'#5B7A96'}}]};
  }
  function dmaChartDefs(kind){
    const meta=DMAX[kind];
    return {id:meta.id,title:meta.title,subtitle:meta.subtitle,dimension:kind,dimensions:[],periodFilter:false,wide:true,
      headers:['分项','数值'],
      getRows:()=>{const data=dmaMetric(kind);return kind==='balance'?data.map(d=>[d.name,d.supply,d.sold,d.loss]):data.map(d=>[d.name,d.value]);},
      getOption:()=>dmaOption(kind),
      onClick:(params)=>{if(!params?.name)return;const rows=(kind==='balance'?balance():readings()).filter(r=>((D.dmaNodes||[]).find(n=>n.id===r.node_id)||{}).node_name===params.name);
        if(!rows.length)return;S().toast(`${params.name}：已选中共 ${rows.length} 条样例采集记录，明细见下方表格`);}};
  }
  let dmaChartKind='night';
  function mountDmaCharts(){
    const host=document.getElementById('dmaCharts');if(!host)return;
    ['C-DMA-01','C-DMA-02','C-DMA-03','C-DMA-04'].forEach(id=>{const e=E.charts.get(id);if(e){try{e.chart.dispose();}catch(error){}E.charts.delete(id);}});
    const def=dmaChartDefs(dmaChartKind);
    host.innerHTML=E.chartCard(def);
    E.registerChart(def.id,def.id,def);
  }

  function draw(kind='topology'){
   drawKpis();
   if(kind==='topology'){return table(['节点编码','节点名称','父节点','节点类型','经营单位','口径','通信方式','运行状态'],nodes().map(node=>[node.device_code,node.node_name,node.parent_node_id||'—',node.node_kind,node.company,node.caliber,node.comm_mode,node.run_status]));}
   if(kind==='night'){
    const rows=readings(),byNode=new Map();
    rows.forEach(row=>{const entry=byNode.get(row.node_id)||{node:row.node_id,company:row.company,night:[],all:[]};if(row.hour>=1&&row.hour<=4)entry.night.push(row.inst_flow);entry.all.push(row.inst_flow);byNode.set(row.node_id,entry);});
    const list=[...byNode.values()].map(entry=>{const name=(D.dmaNodes.find(node=>node.id===entry.node)||{}).node_name||entry.node;const mnf=entry.night.length?Math.min(...entry.night):null;const avgNight=entry.night.length?entry.night.reduce((a,b)=>a+b,0)/entry.night.length:null;const avgAll=entry.all.reduce((a,b)=>a+b,0)/entry.all.length;return [name,entry.company,mnf==null?'—':fmt(mnf,2),avgNight==null?'—':fmt(avgNight,2),fmt(avgAll,2),mnf&&avgAll?fmt(mnf/avgAll*100,1)+'%':'—']});
    return table(['DMA 节点','经营单位','夜间最小流量(m³/h)','夜间平均流量(m³/h)','全天平均流量(m³/h)','夜占比'],list);
   }
   if(kind==='hourly'){
    const rows=readings(),byHour=new Map();
    rows.forEach(row=>{const entry=byHour.get(row.hour)||{sum:0,count:0,max:0};entry.sum+=row.inst_flow;entry.count+=1;entry.max=Math.max(entry.max,row.inst_flow);byHour.set(row.hour,entry);});
    const list=[...byHour.entries()].sort((a,b)=>a[0]-b[0]).map(([hour,entry])=>[`${String(hour).padStart(2,'0')}:00`,fmt(entry.sum/entry.count,2),fmt(entry.max,2),entry.count]);
    return table(['时刻','平均瞬时流量(m³/h)','峰值瞬时流量(m³/h)','采集节点数'],list);
   }
   if(kind==='pressure'){
    const rows=readings(),byNode=new Map();
    rows.forEach(row=>{if(row.pressure_mpa==null)return;const entry=byNode.get(row.node_id)||{values:[],company:row.company};entry.values.push(row.pressure_mpa);byNode.set(row.node_id,entry);});
    const list=[...byNode.entries()].map(([id,entry])=>{const name=(D.dmaNodes.find(node=>node.id===id)||{}).node_name||id;const values=entry.values;return [name,entry.company,fmt(Math.min(...values),3),fmt(values.reduce((a,b)=>a+b,0)/values.length,3),fmt(Math.max(...values),3),values.length];});
    return table(['DMA 节点','经营单位','最低压力(MPa)','平均压力(MPa)','最高压力(MPa)','采集点数'],list);
   }
   const rows=balance(),latest=[...new Set(rows.map(row=>row.period))].sort().pop();
   const list=rows.filter(row=>row.period===latest).map(row=>[row.node_name,row.company,row.period,fmt(row.supply_vol,0),fmt(row.sold_vol,0),fmt(row.supply_vol-row.sold_vol,0),row.supply_vol?fmt(row.loss_rate_pct,2)+'%':'—']);
   return table(['DMA 节点','经营单位','账期','供水量(m³)','售水量(m³)','供售差(m³)','产销差率'],list);
  }
  return {html,mount(){draw();mountDmaCharts();document.querySelectorAll('[data-dma-tab]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-dma-tab]').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-selected',String(item===button));});dmaChartKind=(button.dataset.dmaTab==='balance'?'balance':button.dataset.dmaTab==='pressure'?'pressure':button.dataset.dmaTab==='hourly'?'hourly':'night');draw(button.dataset.dmaTab);mountDmaCharts();});}};
 };

 /* 指标预测：历史真实样例与计划分开；未来结果未接入，不使用计划系数或固定MAPE。 */
 const forecastMetrics={water:{label:'售水量',field:'sold_vol',unit:'m³',candidate:false},charge:{label:'收费率',field:'charge_rate_pct',unit:'%',candidate:true},loss:{label:'产销差率',field:'loss_rate_pct',unit:'%',candidate:true},price:{label:'售水单价',field:'avg_price_yuan',unit:'元/m³',candidate:true}};
 V.renderForecast=()=>{
  let metric='water',horizon='下月',chartDef;
  const factors=[];
  const html=`<div class="notice">售水量支持下月、季度、年度查询；其余指标为候选项，当前暂无未来预测数据。${risk('L2','预测模型与手工因子未建，未来结果仅演示形态')}</div><div class="card metric-config"><div class="segmented" id="forecastMetrics" aria-label="预测指标">${Object.entries(forecastMetrics).map(([key,item])=>`<button type="button" data-forecast-metric="${key}" class="${key==='water'?'active':''}" aria-pressed="${key==='water'}">${item.label}${item.candidate?'（候选）':''}</button>`).join('')}</div><div class="tabs" id="forecastTabs"><button type="button" class="active" data-forecast-tab="history">指标趋势</button><button type="button" data-forecast-tab="future">指标预测</button></div></div><section id="forecastHistory"><div id="forecastChart"></div><section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">历史数据</h2><div class="card-subtitle">实际与计划分列，计划值不作为预测结果</div></div><button type="button" class="btn" data-export-current>导出历史</button></div><div id="forecastHistoryTable"></div></section></section><section class="card" id="forecastFuture" hidden><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">售水量预测</h2><div class="card-subtitle">下月、季度、年度到线路的结果待接入</div></div><div class="card-head-actions"><div class="segmented" id="forecastHorizon">${['下月','季度','年度'].map((item,index)=>`<button type="button" data-horizon="${item}" class="${index===0?'active':''}">${item}</button>`).join('')}</div></div></div><div id="forecastFuturePanel"></div></section>`;
  function historyRows(ctx){const rows=E.trend(ctx.data,ctx.filters,ctx.state.granularity),field=forecastMetrics[metric].field;return rows.map(row=>metric==='water'?[row.name,row[field],row.plan_vol]:[row.name,row[field]]);}
  function drawHistoryTable(ctx){const headers=metric==='water'?['期间','实际售水量(m³)','计划值(m³，非预测)']:['期间',`实际${forecastMetrics[metric].label}(${forecastMetrics[metric].unit})`],rows=historyRows(ctx);setCurrent(headers,rows);document.getElementById('forecastHistoryTable').innerHTML=V.table('forecastHistoryValues',headers,rows.slice(-18).map(row=>row.map(cell=>typeof cell==='number'?number(cell,metric==='price'?3:2):text(cell))));}
  function mountHistory(){
   chartDef={id:'C-FC-HISTORY',title:`${forecastMetrics[metric].label}历史趋势`,subtitle:metric==='water'?'实际售水量与计划值分列':'当前仅展示历史实际',dimensions:[],granularity:true,periodFilter:true,data:f=>E.filterFacts(f),getHeaders:()=>metric==='water'?['期间','实际售水量(m³)','计划值(m³，非预测)']:['期间',`实际${forecastMetrics[metric].label}(${forecastMetrics[metric].unit})`],getOption:ctx=>E.lineOption({data:E.trend(ctx.data,ctx.filters,ctx.state.granularity),metrics:metric==='water'?['sold_vol','plan_vol']:[forecastMetrics[metric].field],area:metric==='water'}),getRows:historyRows,afterRender:drawHistoryTable};
   E.registerChart(chartDef.id,chartDef.id,chartDef);
  }
  function bindFactors(){
   const save=document.getElementById('factorSave');
   if(!save)return;
   save.onclick=()=>{
    const read=id=>{const el=document.getElementById(id);return el?Number(el.value)||0:0;};
    factors.push({month:WB.state.month,visit:read('factorVisit'),build:read('factorBuild'),temp:read('factorTemp')});
    const hint=document.getElementById('factorSaved');
    if(hint)hint.textContent='已保存 '+factors.length+' 组：'+factors.map(f=>f.month+'/'+f.visit+'/'+f.build+'/'+f.temp).join('；');
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
   const factorAdjust=(factors.reduce((total,f)=>total+(Number(f.visit)||0)+(Number(f.build)||0),0))*10000;
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
   return {rows:sorted,targetMonths,mape,latest,factorAdjust,lineCount:rows.length};
  }
  function drawFuture(){
   const panel=document.getElementById('forecastFuturePanel'),item=forecastMetrics[metric];
   document.querySelector('#forecastFuture .card-title').textContent=`${item.label}预测`;
   const inputs=metric==='water'?`<div class="card-body"><h3>预测输入（手工因子，演示）</h3><div class="notice">因子仅保存在当前页面内存，刷新即清空，不写入本地存储；仅对售水量预测做加减调整。${risk('L2','预测模型为演示（同比基准×近期增幅），不代表正式算法')}</div><div class="table-scroll"><table class="data-table"><thead><tr><th>因子</th><th>输入值</th><th>口径 / 说明</th><th>状态</th></tr></thead><tbody><tr><td>非居民走访变动</td><td><input class="control" id="factorVisit" type="number" step="0.1" value="0" aria-label="非居民走访变动"></td><td>预计增减水量（万m³/月）</td><td><span class="badge gray">手工</span></td></tr><tr><td>报装在建估算</td><td><input class="control" id="factorBuild" type="number" step="0.1" value="0" aria-label="报装在建估算"></td><td>在建项目预计月水量（万m³）</td><td><span class="badge gray">手工</span></td></tr><tr><td>气象因子（气温）</td><td><input class="control" id="factorTemp" type="number" step="0.1" value="0" aria-label="气象因子气温"></td><td>预测期平均气温（℃）</td><td><span class="badge gray">手工</span></td></tr></tbody></table></div><div style="padding:12px 16px;display:flex;gap:10px;align-items:center"><button type="button" class="btn primary" id="factorSave">保存因子（内存）</button><span class="muted" id="factorSaved">${factors.length?'已保存 '+factors.length+' 组':'尚未保存因子'}</span></div></div>`:'';
   if(item.candidate&&metric!=='water'){
    setCurrent(['预测指标','目标期','状态'],[]);
    panel.innerHTML=emptyBlock(`${item.label}为原型候选指标`,'当前仅提供候选指标选择，暂无可展示的预测结果。')+inputs;bindFactors();return;
   }
   const demo=demoWaterForecast();
   const kpis=`<div class="kpi-grid four" style="margin-bottom:10px">${V.card('覆盖线路',String(demo.lineCount),'条','当前范围有历史数据的线路')}${V.card('回测 MAPE',demo.mape==null?'—':fmt(demo.mape,2),'%','近 6 个月同比基准回测')}${V.card('目标期',demo.targetMonths[0]+' 起','',demo.targetMonths.length+' 个月')}${V.card('因子调整',fmt(demo.factorAdjust/10000,2),'万m³','手工因子合计')}</div>`;
   const headers=['经营单位','线路','目标期','预测值(万m³)','去年同期(万m³)','同比(%)','模型'];
   const tableRows=demo.rows.map(row=>[row.company,row.line,`${demo.targetMonths[0]}${demo.targetMonths.length>1?' ~ '+demo.targetMonths[demo.targetMonths.length-1]:''}`,fmt(row.adjusted/10000,1),row.baseSum?fmt(row.baseSum/10000,1):'—',row.baseSum?fmt((row.adjusted/row.baseSum-1)*100,1):'—',row.hasBase?'同比基准×近期增幅':'近 3 月均值回退']);
   setCurrent(headers,tableRows);
   panel.innerHTML=kpis+V.table('forecastValues',headers,tableRows.map(row=>row.map(cell=>esc(text(cell)))))+inputs+`<div class="notice">演示模型：以“上年同月水量 ×（1+近 3 月同比增幅）”为基准，季度/年度为逐月累加；MAPE 为近 6 个月同比基准回测误差；手工因子按预测占比分摊。真实预测算法与因子权重待确认，本页不代表正式口径。${risk('L2','演示预测模型，未接入正式算法与天气/报装数据')}</div>`;
   bindFactors();
  }
  return {html,mount(){document.getElementById('forecastChart').innerHTML='<article class="card chart-card" id="forecastHistoryCard"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title" id="forecastChartTitle">历史趋势</h2></div></div><div class="chart-toolbar"><div class="chart-filter-group"><label><span>粒度</span><select id="forecastGranularity" class="control compact"><option value="month">月</option><option value="quarter">季</option><option value="year">年</option></select></label></div><div class="chart-toolbar-actions"><button type="button" class="btn xs" data-chart-csv="C-FC-HISTORY">CSV</button><button type="button" class="btn xs" data-chart-png="C-FC-HISTORY">PNG</button></div></div><div class="chart" id="C-FC-HISTORY"></div></article>';mountHistory();document.getElementById('forecastGranularity').onchange=event=>{WB.chartState['C-FC-HISTORY'].granularity=event.target.value;E.refreshChart('C-FC-HISTORY');};document.querySelectorAll('[data-forecast-metric]').forEach(button=>button.onclick=()=>{metric=button.dataset.forecastMetric;document.querySelectorAll('[data-forecast-metric]').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',String(item===button));});document.getElementById('forecastChartTitle').textContent=`${forecastMetrics[metric].label}历史趋势`;if(document.getElementById('forecastHistory').hidden)drawFuture();else mountHistory();});document.querySelectorAll('[data-forecast-tab]').forEach(button=>button.onclick=()=>{const future=button.dataset.forecastTab==='future';document.querySelectorAll('[data-forecast-tab]').forEach(item=>item.classList.toggle('active',item===button));document.getElementById('forecastHistory').hidden=future;document.getElementById('forecastFuture').hidden=!future;if(future)drawFuture();else mountHistory();});document.querySelectorAll('[data-horizon]').forEach(button=>button.onclick=()=>{horizon=button.dataset.horizon;document.querySelectorAll('[data-horizon]').forEach(item=>item.classList.toggle('active',item===button));drawFuture();});drawFuture();}};
 };

 /* 源工单只读：只使用已有收发处理字段，未提供时限和事件时不推断。 */
 V.renderWork=()=>{
  const orders=()=>filtered(D.sourceOrders,WB.state,null);
  const alerts=()=>filtered(D.alerts,WB.state,'period').filter(row=>row.category!=='基础信息');
  const transferred=[];
  let tab='stats';
  const html=`<section class="tabs" role="tablist" aria-label="工单页签"><button type="button" class="active" data-work-tab="stats">① 工单统计</button><button type="button" data-work-tab="process">② 工单处理情况</button><button type="button" data-work-tab="convert">③ 预警转工单</button></section>
  <section id="workPanelStats">
    <section id="workKpis" class="kpi-grid four"></section>
    <div class="notice">源工单只读；平台侧“转工单”仅在原型内生成演示督办单，不回写源系统。${risk('L2','源工单处理时限字段未核，超时判定不启用')}</div>
    <div id="workCharts" class="chart-grid"></div>
    <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">源业务工单明细</h2><div class="card-subtitle">创建、发出、接收与处理时间按已有字段展示</div></div><button type="button" class="btn" data-export-current>导出工单</button></div><div id="workTable"></div></section>
  </section>
  <section id="workPanelProcess" hidden>
    <div class="notice">处理情况按源系统时间字段展示；缺少接收/处理时间的不推算处理时长。${risk('L2','处理时长依赖源时间字段完整性')}</div>
    <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">工单处理情况</h2><div class="card-subtitle">按源状态与处理时间查看，不等同平台办结</div></div><button type="button" class="btn" data-export-current>导出处理情况</button></div><div id="workProcessTable"></div></section>
  </section>
  <section id="workPanelConvert" hidden>
    <div class="notice">预警转工单：勾选异常后生成<b>演示督办单</b>（仅保存在当前页面内存，刷新即清空，不回写源系统）。${risk('L1','平台督办单为演示内闭环，不对接源工单写接口')}</div>
    <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">待转工单的预警</h2><div class="card-subtitle">来源为业务异常只读集合；转单不改变源数据</div></div><div class="card-head-actions"><button type="button" class="btn primary" id="workConvertBtn">批量转督办单</button></div></div><div id="workAlerts"></div></section>
    <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">演示督办单</h2><div class="card-subtitle">仅在内存中存在；可演示派发与办结状态</div></div></div><div id="workConverted"></div></section>
  </section>`;
  const typeDef=chart({id:'C-WORK-TYPE',title:'源工单类型分布',subtitle:'按当前查询范围统计只读源工单',dimensions:[],periodFilter:false,data:f=>filtered(D.sourceOrders,f,null),headers:['工单类型','数量(单)'],getOption:ctx=>basicBarOption(grouped(ctx.data,'type').map(group=>({name:group.name,value:group.items.length})),{label:'工单数'}),getRows:ctx=>grouped(ctx.data,'type').map(group=>[group.name,group.items.length])});
  const statusDef=chart({id:'C-WORK-STATUS',title:'源工单处理状态',subtitle:'待接收、处理中、已处理按源状态展示',dimensions:[],periodFilter:false,data:f=>filtered(D.sourceOrders,f,null),headers:['源状态','数量(单)'],getOption:ctx=>basicBarOption(grouped(ctx.data,'status').map(group=>({name:group.name,value:group.items.length})),{label:'工单数',color:'#41A75E'}),getRows:ctx=>grouped(ctx.data,'status').map(group=>[group.name,group.items.length])});
  const hoursBetween=(a,b)=>{if(!a||!b)return null;const diff=(Date.parse(String(b).replace(' ','T')+':00')-Date.parse(String(a).replace(' ','T')+':00'))/3600000;return Number.isFinite(diff)?diff:null;};
  const avgOf=list=>{const values=list.filter(v=>v!=null);return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;};
  function drawStats(){
   const rows=orders(),counts=Object.fromEntries(grouped(rows,'status').map(group=>[group.name,group.items.length]));
   const receive=avgOf(rows.map(row=>hoursBetween(row.createdAt,row.receivedAt)));
   const process=avgOf(rows.map(row=>hoursBetween(row.receivedAt,row.processedAt)));
   document.getElementById('workKpis').innerHTML=V.card('源工单',fmt(rows.length),'单','当前查询范围','work')+V.card('待接收',fmt(counts['待接收']||0),'单','按源状态统计','clock','orange')+V.card('处理中',fmt(counts['处理中']||0),'单','按源状态统计','clipboard')+V.card('已处理',fmt(counts['已处理']||0),'单','不等同平台办结','checkCircle','green')+V.card('平均接收时长',receive==null?'—':fmt(receive,1),'小时','创建→接收（有字段才计算）','clock')+V.card('平均处理时长',process==null?'—':fmt(process,1),'小时','接收→处理完成','clipboard','green');
   document.getElementById('workKpis').className='kpi-grid six';
   const headers=['源工单号','类型','经营单位','组织','统一表卡','源责任人','创建时间','发出时间','接收时间','处理时间','源状态','操作'];
   setCurrent(headers.slice(0,-1),rows.map(row=>[row.id,row.type,row.company,row.org,row.card,row.owner,row.createdAt,row.sentAt,row.receivedAt,row.processedAt,row.status]));
   document.getElementById('workTable').innerHTML=V.table('sourceOrderTable',headers,rows.map(row=>[text(row.id),text(row.type),text(row.company),text(row.org),text(row.card),text(row.owner),text(row.createdAt),text(row.sentAt),text(row.receivedAt),text(row.processedAt),text(row.status),`<button type="button" class="btn xs" data-source-detail="${esc(row.id)}">查看</button>`]));
   drawProcess();
  }
  function drawProcess(){
   const rows=orders(),headers=['源工单号','类型','经营单位','源状态','创建时间','接收时间','处理时间','接收时长(h)','处理时长(h)','说明'];
   const tableRows=rows.map(row=>{const receive=hoursBetween(row.createdAt,row.receivedAt),process=hoursBetween(row.receivedAt,row.processedAt);return [text(row.id),text(row.type),text(row.company),text(row.status),text(row.createdAt),text(row.receivedAt),text(row.processedAt),receive==null?'—':number(receive,1),process==null?'—':number(process,1),text(receive==null?'缺少接收时间，不推算':process==null?'待处理，未产生完成时间':'按源时间字段计算')];});
   setCurrent(headers,tableRows);
   document.getElementById('workProcessTable').innerHTML=V.table('sourceProcessTable',headers,tableRows);
  }
  function drawConvert(){
   const rows=alerts();
   setCurrent(['异常编号','异常类型','统一表卡','经营单位','来源系统','日期','状态'],rows.map(row=>[row.id,row.type,row.card,row.company,row.sourceSystem,row.date,row.status]));
   document.getElementById('workAlerts').innerHTML=V.table('workAlertTable',['选择','异常编号','异常类型','统一表卡','经营单位','来源系统','日期','状态'],rows.map(row=>[`<input type="checkbox" class="work-pick" value="${esc(row.id)}" aria-label="选择${esc(row.id)}">`,text(row.id),text(row.type),text(row.card),text(row.company),text(row.sourceSystem),text(row.date),text(row.status)]));
   document.getElementById('workConverted').innerHTML=transferred.length?V.table('convertedTable',['督办单号','来源异常','类型','经营单位','状态','操作'],transferred.map((item,index)=>[text(item.id),text(item.alertId),text(item.type),text(item.company),item.status==='已派发'?'<span class="badge green">已派发（演示）</span>':'<span class="badge orange">待派发</span>',item.status==='已派发'?'<span class="muted" style="font-size:11px">仅本页内存</span>':`<button type="button" class="btn xs" data-dispatch="${index}">演示派发</button>`])):emptyBlock('暂无演示督办单','在左侧勾选预警后点击“批量转督办单”。');
  }
  function showTab(name){tab=name;document.getElementById('workPanelStats').hidden=name!=='stats';document.getElementById('workPanelProcess').hidden=name!=='process';document.getElementById('workPanelConvert').hidden=name!=='convert';document.querySelectorAll('[data-work-tab]').forEach(button=>button.classList.toggle('active',button.dataset.workTab===name));if(name==='convert')drawConvert();if(name==='process')drawProcess();}
  return {html,mount(){
   typeDef.mount();statusDef.mount();
   document.getElementById('workCharts').innerHTML=typeDef.html+statusDef.html;
   // 图表容器重建后需重新挂载
   typeDef.mount();statusDef.mount();
   drawStats();drawConvert();
   document.querySelectorAll('[data-work-tab]').forEach(button=>button.onclick=()=>showTab(button.dataset.workTab));
   document.getElementById('workConvertBtn')?.addEventListener('click',()=>{
    const picked=[...document.querySelectorAll('.work-pick:checked')].map(el=>el.value);
    if(!picked.length)return S().toast('请先勾选需要转单的预警');
    picked.forEach((id,index)=>transferred.push({id:'DB'+String(transferred.length+index+1).padStart(3,'0'),alertId:id,type:(alerts().find(row=>row.id===id)||{}).type||'—',company:(alerts().find(row=>row.id===id)||{}).company||'—',status:'待派发'}));
    drawConvert();S().toast(`已在演示环境生成 ${picked.length} 张督办单（仅内存，不回写源系统）`);
   });
   document.getElementById('workConverted').addEventListener('click',event=>{
    const button=event.target.closest('[data-dispatch]');if(!button)return;
    const index=+button.dataset.dispatch,item=transferred[index];if(!item)return;
    item.status='已派发';drawConvert();
    S().toast(`演示派发：${item.id} 已置为“已派发（仅内存）”，不调用源系统接口；查询/换页/刷新即还原`);
   });
   document.getElementById('workTable').addEventListener('click',event=>{const button=event.target.closest('[data-source-detail]');if(!button)return;const row=list(D.sourceOrders).find(order=>order.id===button.dataset.sourceDetail);if(!row)return;const fields=[['源工单号',row.id],['工单类型',row.type],['统一表卡',row.card],['源责任人',row.owner],['创建时间',row.createdAt],['发出时间',row.sentAt],['接收时间',row.receivedAt],['处理时间',row.processedAt],['处理时限',row.limitAt],['源状态',row.status]];S().openDrawer({title:`${row.id} · 只读详情`,body:`<div class="kv-grid">${fields.map(([label,value])=>`<div class="kv"><span>${label}</span><b>${text(value)}</b></div>`).join('')}</div>${list(row.events).length?V.table('sourceEvents',['时间','事件'],row.events.map(item=>[text(item.time||item.date),text(item.name||item.event)])):emptyBlock('暂无源处理事件','暂未提供源处理事件。')}`});});
  }};
 };

 /* 数据治理：批次为样例快照，不声称生产在线，不模拟复检。 */
 V.renderData=()=>{
  const batchDef=chart({id:'C-DATA-SNAPSHOT',title:'各系统样例快照记录数',subtitle:'按当前批次的records字段汇总',dimensions:[],periodFilter:false,data:f=>filtered(D.batches,f,null),headers:['业务系统','样例批次(个)','记录数(条)'],getOption:ctx=>basicBarOption(grouped(ctx.data,'system').map(group=>({name:group.name,value:knownSum(group.items,'records')})),{label:'已提供记录数',unit:'条'}),getRows:ctx=>grouped(ctx.data,'system').map(group=>[group.name,group.items.length,knownSum(group.items,'records')])});
  const html=`<section id="dataKpis" class="kpi-grid four"></section><div class="notice">当前为样例批次快照，未提供的延迟不推算。${risk('L1','ETL 批次与质量稽核为样例快照，非生产在线状态')}</div><section class="chart-grid"><div>${batchDef.html}</div><section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">数据主题</h2><div class="card-subtitle">批次记录与质量异常分别查看</div></div></div><div class="card-body"><div class="source-grid" id="dataSystems"></div></div></section></section><section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">数据集成与质量</h2><div class="card-subtitle">基础信息异常只读归集</div></div><button type="button" class="btn" data-export-current>导出当前表</button></div><div class="tabs"><button type="button" class="active" data-data-tab="batches">同步批次</button><button type="button" data-data-tab="quality">基础信息异常</button><button type="button" data-data-tab="dataAnomaly">数据异常</button></div><div id="dataTable"></div></section>`;
  let tab='batches';
  function batches(){return filtered(D.batches,WB.state,null);}
  function anomalies(){return filtered(D.alerts,WB.state,null).filter(row=>row.category==='基础信息');}
  function draw(){
   const rows=batches(),systems=grouped(rows,'system');document.getElementById('dataKpis').innerHTML=V.card('样例批次',fmt(rows.length),'个','当前查询范围','database')+V.card('样例记录',fmt(knownSum(rows,'records')),'条','仅汇总已提供记录，未知不补0','report','green')+V.card('数据主题',fmt(systems.length),'类','以实际批次为准','layers')+V.card('基础信息异常',fmt(anomalies().length),'条','当前异常样例','alert','orange');
   document.getElementById('dataSystems').innerHTML=systems.map(group=>`<div class="source-card"><span class="source-index">${esc(group.name.slice(0,1))}</span><strong>${esc(group.name)}</strong><span>${knownSum(group.items,'records')==null?'记录数待提供':fmt(knownSum(group.items,'records'))+' 条已提供记录'}</span><span class="badge gray">样例快照</span></div>`).join('')||emptyBlock('暂无批次','当前查询范围没有样例批次。');
   if(tab==='batches'){const headers=['批次编号','经营单位','业务系统','快照时间','记录数(条)','延迟(分钟)','批次状态','版本'];setCurrent(headers,rows.map(row=>[row.id,row.company,row.system,row.time,row.records,row.delay,row.status,row.version]));document.getElementById('dataTable').innerHTML=V.table('batchSnapshots',headers,rows.map(row=>[text(row.id),text(row.company),text(row.system),text(row.time),number(row.records,0),text(row.delay),text(row.status),text(row.version)]));}
   else if(tab==='quality'){const quality=anomalies(),headers=['异常编号','异常类型','统一表卡','经营单位','组织','来源系统','日期','状态'];setCurrent(headers,quality.map(row=>[row.id,row.type,row.card,row.company,row.org,row.sourceSystem,row.date,row.status]));document.getElementById('dataTable').innerHTML=V.table('basicQuality',headers,quality.map(row=>[text(row.id),text(row.type),text(row.card),text(row.company),text(row.org),text(row.sourceSystem),text(row.date),text(row.status)]));}
   else{const rows=filtered(D.alerts,WB.state,'period').filter(row=>row.category==='关联异常'),headers=['异常编号','异常类型','统一表卡','经营单位','来源系统','日期','状态','说明'];setCurrent(headers.slice(0,-1),rows.map(row=>[row.id,row.type,row.card,row.company,row.sourceSystem,row.date,row.status]));document.getElementById('dataTable').innerHTML=`<div class="notice">数据异常（原属智能分析）按 2026-09-24 会议移入本菜单；下列为跨系统指数/档案不一致类异常，只读。${risk('L2','指数一致性与判定规则待甲方提供规则清单')}</div>`+V.table('dataAnomalyTable',headers,rows.map(row=>[text(row.id),text(row.type),text(row.card),text(row.company),text(row.sourceSystem),text(row.date),text(row.status),text('只读')]));}
  }
  return {html,mount(){batchDef.mount();const q=new URLSearchParams((location.hash.split('?')[1]||''));const wanted=q.get('tab');if(wanted&&['batches','quality','dataAnomaly'].includes(wanted)){tab=wanted;document.querySelectorAll('[data-data-tab]').forEach(item=>item.classList.toggle('active',item.dataset.dataTab===wanted));}draw();document.querySelectorAll('[data-data-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.dataTab;document.querySelectorAll('[data-data-tab]').forEach(item=>item.classList.toggle('active',item===button));draw();});}};
 };

 /* 报表：每个目录ID拥有独立列定义和真实样例映射，不使用通用经营七列。 */
 function currentReadings(period=WB.state.month){return list(D.readings).filter(row=>row.period===period&&dimensionFilter(row,WB.state));}
 function stockUsers(){const cutoff=(WB.state.month||'2026-10')+'-31';return list(D.users).filter(user=>user.regDate<=cutoff&&(!user.deregisterDate||user.deregisterDate>cutoff)&&dimensionFilter(user,WB.state));}
 function inventory(){return list(D.meterInventory).filter(row=>dimensionFilter(row,WB.state));}
 function meterEvents(type){return filtered(D.meterEvents,WB.state,'period').filter(row=>!type||row.type.includes(type));}
 function zeroStreaks(minimum){
  return grouped(list(D.readings).filter(row=>dimensionFilter(row,WB.state)&&row.period<=(WB.state.month||'2026-10')),'userId').map(({items})=>{
   const sorted=items.slice().sort((a,b)=>a.period.localeCompare(b.period));let streak=0,last=null,previousZeroPeriod=null;
   for(const row of sorted){if(row.volume===0){streak=previousZeroPeriod&&D.shiftPeriod(previousZeroPeriod,1)===row.period?streak+1:1;last=row;previousZeroPeriod=row.period;}else{streak=0;previousZeroPeriod=null;}}
   return {items,streak,last};
  }).filter(row=>row.streak>=minimum&&row.last);
 }
 function changeRatio(current,previous){return previous?((current-previous)/previous*100):null;}
 const reportTemplateCache=new Map();
 function reportTemplate(id){
  const f=WB.state||{};
  const key=[id,f.period,f.month,f.start,f.end,f.company,f.org,f.nature,f.swapN,f.zeroN].join('|');
  if(reportTemplateCache.has(key))return reportTemplateCache.get(key);
  const value=buildReportTemplate(id);
  reportTemplateCache.set(key,value);
  if(reportTemplateCache.size>240)reportTemplateCache.clear();
  return value;
 }
 function buildReportTemplate(id){
  const unavailable=(headers,note)=>({available:false,headers,rows:[],note});
  if(id==='P-RPT-001')return unavailable(['异常编号','水表','厂家','表型','条形码','异常说明'],'缺少厂家×表型×条形码前8位对应规则及判定结果。');
  if(id==='P-RPT-002'||id==='P-RPT-003'){
   const type=id==='P-RPT-002'?'周检':'故障',rows=meterEvents(type).map(row=>{const meter=list(D.meterInventory).find(item=>item.meterId===row.newMeter)||{},user=userById.get(row.userId)||{};return [row.id,row.card,user.name,user.address,row.nature,row.org,user.booklet,row.type,row.date,row.company,row.oldMeter,row.newMeter,meter.manufacturer,meter.model,row.caliber,row.status];});
   return {available:true,headers:['事件编号','统一表卡','用户名称','用户地址','用水性质','所属组织','册本','换表类型','换表时间','经营单位','旧物理表','新物理表','厂家','型号','口径','状态'],rows,note:`当前仅包含已提供的${type}换表记录。`};
  }
  if(id==='P-RPT-004'||id==='P-RPT-005'){
   const type=id==='P-RPT-004'?'周检':'故障',n=[2,3].includes(Number(WB.state.swapN))?Number(WB.state.swapN):2,rows=meterEvents(type).map(row=>{const before=list(row.before).slice(-n),after=list(row.after).slice(0,n),avg=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;return [row.id,row.card,row.company,row.date,before.join(' / '),after.join(' / '),before.length===n&&after.length===n?changeRatio(avg(after),avg(before)):null,row.unit];});
   return {available:true,headers:['事件编号','统一表卡','经营单位','换表日期',`换表前${n}期水量序列`,`换表后${n}期水量序列`,'均值变化(%)','单位'],rows,note:`按事件已有前后${n}期序列展示。`};
  }
  if(id==='P-RPT-006')return unavailable(['入库日期','仓库','水表','入库类型','厂家','数量'],'本期入库流水待接入，当前仅支持库存快照查询。');
  if(id==='P-RPT-007'){
   const rows=grouped(inventory().filter(row=>row.warehouse),row=>[row.caliber,row.meterType,row.status].join('|')).map(group=>{const [caliber,meterType,status]=group.name.split('|');return [caliber,meterType,status,group.items.length];});
   return {available:true,headers:['口径','水表类型','库存状态','台数'],rows,note:'当前库存快照；未提供期初与出入库流水时不重算期末公式。'};
  }
  if(id==='P-RPT-008'){
   const rows=grouped(inventory().filter(row=>row.warehouse),'warehouse').map(group=>{const row=group.items[0],count=status=>group.items.filter(item=>item.status===status).length;return [group.name,row.company,count('在库'),count('周转'),count('待检'),count('报废'),group.items.length];});
   return {available:true,headers:['仓库','经营单位','在库(台)','周转(台)','待检(台)','报废(台)','合计(台)'],rows,note:'按当前水表库存记录逐仓汇总。'};
  }
  if(id==='P-RPT-009'){
   const tasks=filtered(D.readTasks||[],WB.state,'period');
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
   const rows=grouped(filtered(D.alerts,WB.state,'period').filter(row=>['抄表异常','表务异常'].includes(row.category)),'type').map(group=>[group.name,group.items[0].category,group.items.length]);
   return {available:true,headers:['异常类型','异常分类','数量(条)'],rows,note:'按异常样例已有类型统计。'};
  }
  if(id==='P-RPT-012'){
   const n=[2,3].includes(Number(WB.state.zeroN))?Number(WB.state.zeroN):2,rows=zeroStreaks(n).map(({last,streak})=>[last.card,last.company,last.org,streak,last.period,'连续记录，待复核']);
   return {available:true,headers:['统一表卡','经营单位','组织/线路','连续零水量周期数','最近账期','核验状态'],rows,note:`按连续${n}个账期检查，缺月即中断；应抄任务基线待核。`};
  }
  if(id==='P-RPT-013'){
   const previous=D.shiftPeriod(WB.state.month,-12),rows=currentReadings().filter(row=>row.volume>=100).map(row=>{const old=list(D.readings).find(item=>item.userId===row.userId&&item.period===previous);return [row.card,row.company,row.nature,row.period,row.volume,old?.volume,changeRatio(row.volume,old?.volume)];});
   return {available:true,headers:['统一表卡','经营单位','用水性质','账期','本期水量(m³)','去年同期(m³)','同比(%)'],rows,note:'门槛为月用水量≥100m³；缺去年同期时同比为空。'};
  }
  if(id==='P-RPT-014'){
   const zeros=new Set(zeroStreaks(3).map(row=>row.last.userId)),previous=D.shiftPeriod(WB.state.month,-12),rows=currentReadings().filter(row=>{const old=list(D.readings).find(item=>item.userId===row.userId&&item.period===previous);return zeros.has(row.userId)||(old&&Math.abs(changeRatio(row.volume,old.volume))>=30);}).map(row=>{const old=list(D.readings).find(item=>item.userId===row.userId&&item.period===previous);return [row.card,row.company,row.org,row.period,row.volume,old?.volume,changeRatio(row.volume,old?.volume),zeros.has(row.userId)?'连续3期零水量':'同比变化超过±30%'];});
   return {available:true,headers:['统一表卡','经营单位','组织/线路','账期','本期水量(m³)','去年同期(m³)','同比(%)','异常依据'],rows,note:'按实际记录判断连续3期零水量或同比变化超过±30%。'};
  }
  if(id==='P-RPT-015')return unavailable(['变更日期','统一表卡','原用水性质','新用水性质','经营单位'],'未提供用水性质变更记录。');
  if(id==='P-RPT-016'){
    const natures=D.natures,rows=grouped(stockUsers(),u=>[u.company,u.org,u.community].join('|')).map(group=>{const u=group.items[0],counts=natures.map(nature=>group.items.filter(user=>user.nature===nature).length);return [u.company,u.org,u.community,...counts,group.items.length];});
    return {available:true,headers:['经营单位','组织','小区',...natures.map(n=>n+'(户)'),'合计(户)'],rows,note:'按查询截止月的有效表卡统计；不同公司或组织的同名小区不合并。'};
   }
   if(id==='P-RPT-017'){
    const readers=new Set(currentReadings().map(row=>row.userId)),rows=grouped(stockUsers(),u=>[u.company,u.org,u.booklet].join('|')).map(group=>{const u=group.items[0];return [u.company,u.org,u.booklet,group.items.length,group.items.filter(user=>readers.has(user.id)).length];});
    return {available:true,headers:['经营单位','组织','册本','在册户数(户)','当期有抄表记录户数(户)'],rows,note:'同名册本按经营单位与组织分别统计；应抄任务基线待接入。'};
   }
   if(id==='P-RPT-018')return unavailable(['调整日期','统一表卡','原册本','新册本','调整类型'],'未提供存量用户册本调整记录。');
  if(id==='P-RPT-019')return unavailable(['入册日期','统一表卡','立户日期','经营单位','组织','册本','用水性质'],'未提供新增入册事件，立户日期不代替入册日期。');
   if(id==='P-RPT-020'||id==='P-RPT-021'){
   const added=id==='P-RPT-020',month=WB.state.month,start=D.shiftPeriod(month,-1)+'-26',end=month+'-25',users=list(D.users).filter(user=>dimensionFilter(user,WB.state)&&(added?user.regDate>=start&&user.regDate<=end:user.deregisterDate?.startsWith(month))),rows=D.natures.map(nature=>[nature,users.filter(user=>user.nature===nature).length]).filter(row=>row[1]>0);
   return {available:true,headers:['用水性质',added?'新增用户(户)':'注销用户(户)'],rows,note:added?'新增窗口为上月26日至本月25日。':'按已有注销日期的所在月份统计。'};
  }
  return unavailable(['数据项','状态'],'当前报表尚未建立已核对的数据映射。');
 }

 V.renderReport=()=>{
  const reports=list(D.reportRuns);
  const expectedReportCount=21;
  const categoryDef=chart({id:'C-REPORT-CATALOG',title:'报表目录按类别分布',subtitle:'按当前目录统计',dimensions:[],periodFilter:false,data:()=>reports,headers:['报表类别','报表数量(张)'],getOption:()=>basicBarOption(grouped(reports,'category').map(group=>({name:group.name,value:group.items.length})),{label:'报表数量',unit:'张',color:'#F58B3C'}),getRows:()=>grouped(reports,'category').map(group=>[group.name,group.items.length])});
  const html=`<div class="notice">报表目录共 21 张；可预览/可下载状态取决于当期数据，抄见率报表口径待核定。${risk('L2','抄见率应抄基线未核定；可下载数随数据变化')}</div><section class="kpi-grid four">${V.card('报表目录',fmt(reports.length),'张','当前目录','report')}${V.card('报表类别',fmt(new Set(reports.map(row=>row.category)).size),'类','按目录实际类别统计','layers','green')}${V.card('可查询报表',fmt(reports.filter(row=>reportTemplate(row.id).available).length),'张','当前可查询','clipboard','orange')}${V.card('生成日志','待接入','','日志待接入','clock')}</section><section class="chart-grid"><div>${categoryDef.html}</div><section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">口径与参数说明</h2><div class="card-subtitle">平台配置已拆分为独立「系统设置」页；此处仅保留影响报表口径的说明</div></div></div><div class="card-body quick-grid"><button type="button" class="quick-item" data-config="dictionary">指标口径与字典</button><button type="button" class="quick-item" data-config="parameters">报表参数</button></div></section></section><section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">报表目录</h2><div class="card-subtitle">选择报表查看对应结果或数据状态</div></div><div class="card-head-actions"><select id="reportCategory" class="control compact" aria-label="报表类别"><option value="">全部类别</option>${[...new Set(reports.map(row=>row.category))].map(value=>`<option>${esc(value)}</option>`).join('')}</select><select id="reportCycle" class="control compact" aria-label="报表周期"><option value="">全部周期</option>${[...new Set(reports.map(row=>row.cycle))].map(value=>`<option>${esc(value)}</option>`).join('')}</select><button type="button" class="btn" data-export-current>导出目录</button></div></div><div id="reportCatalog"></div></section>`;
  function selectedReports(){const category=document.getElementById('reportCategory').value,cycle=document.getElementById('reportCycle').value;return reports.filter(row=>(!category||row.category===category)&&(!cycle||row.cycle===cycle));}
  function draw(){const rows=selectedReports();setCurrent(['报表ID','报表名称','类别','周期','数据范围','数据状态'],rows.map(row=>[row.id,row.name,row.category,row.cycle,row.scope,reportTemplate(row.id).available?'可预览':'待数据']));document.getElementById('reportCatalog').innerHTML=V.table('reportList',['报表ID','报表名称','类别','周期','数据范围','数据状态','操作'],rows.map(row=>{const template=reportTemplate(row.id);return [text(row.id),text(row.name),text(row.category),text(row.cycle),text(row.scope),template.available?'<span class="badge green">可预览</span>':'<span class="badge gray">待数据</span>',`<button type="button" class="btn xs" data-preview-report="${esc(row.id)}">${template.available?'预览 / 下载':'查看字段'}</button>`];}));document.querySelectorAll('[data-preview-report]').forEach(button=>button.onclick=()=>preview(rows.find(row=>row.id===button.dataset.previewReport)));}
  function preview(report){
   const template=reportTemplate(report.id),rows=template.rows||[],periodKey=['P-RPT-004','P-RPT-005'].includes(report.id)?'swapN':report.id==='P-RPT-012'?'zeroN':null;
   const currentN=periodKey?Number(WB.state[periodKey])||2:null,selector=periodKey?`<label class="field">对比周期<select id="reportPeriodN" class="control"><option value="2" ${currentN===2?'selected':''}>2期</option><option value="3" ${currentN===3?'selected':''}>3期</option></select></label>`:'';
   const body=`${selector}${template.note?`<div class="notice">${esc(template.note)}</div>`:''}${V.table('reportPreview',template.headers,rows.map(row=>row.map(cell=>typeof cell==='number'?number(cell):text(cell))))}`;
   S().openDrawer({width:'1080px',title:report.name,subtitle:`${report.cycle} · ${report.scope}`,body,footer:`<button type="button" class="btn" data-close>关闭</button><button type="button" class="btn primary" id="downloadReport" ${rows.length?'':'disabled'}>下载当前结果CSV</button>`});
   document.getElementById('downloadReport').onclick=()=>{if(rows.length)E.downloadCSV(`${report.name}_${WB.state.month}.csv`,template.headers,rows);};
   const control=document.getElementById('reportPeriodN');if(control)control.onchange=()=>{WB.state[periodKey]=Number(control.value);S().closeLayers();preview(report);};
  }
  return {html,mount(){categoryDef.mount();draw();document.getElementById('reportCategory').onchange=draw;document.getElementById('reportCycle').onchange=draw;document.querySelectorAll('[data-config]').forEach(button=>button.onclick=()=>config(button.dataset.config));}};
 };

 function config(kind){
  const definitions={
   plans:{title:'计划值样例',headers:['经营单位','期间售水计划(m³)','期间实际售水(m³)','说明'],rows:E.group(E.filterFacts(),'company',WB.state).map(row=>[row.name,row.plan_vol,row.sold_vol,'计划字段仅作样例，不是预测结果'])},
   dictionary:{title:'指标口径与字典',headers:['字典类型','当前值','状态'],rows:[['时间口径','业务账期 / 财务自然月','只读'],['新增用户窗口','上月26日—本月25日','只读'],['用水性质',D.natures.join('、'),'只读'],['水表口径',D.calibers.join('、'),'只读'],['水表类型',D.meterTypes.join('、'),'只读']]},
   identity:{title:'组织、账号与角色',headers:['名称','类型','归属/范围','状态'],rows:[...D.companies.map(company=>[company.full,'经营单位',company.units.join('、'),'只读组织样例']),...list(D.staff).map(staff=>[staff.name,'账号',staff.company+' / '+staff.role,'只读演示账号'])]},
   mapping:{title:'字段关联与编号',headers:['业务对象','字段/规则','用途','状态'],rows:[['统一表卡','unified_code','最小计费实体统一编码','源键已核'],['高新表卡','CardID / CustomerNo','表卡与客户号分离','区域映射待核'],['时间口径','bill_period / natural_month','业务账期与自然月分列','源字段已核']]},
   parameters:{title:'报表参数',headers:['参数','当前值','适用入口','状态'],rows:[['大用户月用水量','≥100m³','100立方米以上用户报表','只读默认值'],['新增用户窗口','上月26日—本月25日','新增用户相关报表','只读'],['夜间MNF窗口','01:00—04:00','DMA夜间流量','待确认，未用于计算'],['换表对比周期',`前后各${WB.state.swapN||2}期，可选2/3期`,'换表对比报表','当前参数'],['连续零水量周期',`${WB.state.zeroN||2}期，可选2/3期`,'连续零水量用户报表','当前参数']]}
  };
  if(kind==='logs'){S().openDrawer({title:'操作日志',body:emptyBlock('暂无操作日志','暂无可展示的操作日志。')});return;}
  const definition=definitions[kind];if(!definition)return;
  S().openDrawer({title:definition.title,subtitle:'当前设置与样例只读',body:V.table('readonlyConfig',definition.headers,definition.rows.map(row=>row.map(cell=>typeof cell==='number'?number(cell):text(cell))))});
 }
 
 /* ===== V4 新增：用户管理（AUTH） ===== */
 V.renderAuth=()=>{
  const companies=list(D.companies);
  const levelPath=c=>{
   const grid=(c.units||[]).some(u=>String(u).includes('网格'))||/高新/.test(c.name);
   return grid?'集团 → 分公司 → 网格 → 班组 → 册本':'集团 → 分公司 → 营业所 → 班组 → 线路';
  };
  const orgRows=companies.map(c=>[text(c.full||c.name),text((c.units||[]).join('、')||'—'),text(levelPath(c)),'<span class="badge gray">演示组织</span>']);
  const demoStaff=[{name:'演示管理员',company:'集团',role:'集团管理员'},
   {name:'演示分公司管理员',company:'营业中心',role:'分公司管理员'},
   {name:'演示营业所用户',company:'营业中心 / 中原所',role:'营业所用户'},
   {name:'演示营销员',company:'营业中心 / 中原所 / 1班组',role:'营销员'}];
  const A=window.WB_ADMIN;
  const staff=A?A.accounts():demoStaff;
  const staffRows=staff.map((st,index)=>[text(st.name),text(st.company||'—'),text(st.role||'—'),
    st.enabled?'<span class="badge green">启用（演示）</span>':'<span class="badge gray">未启用</span>',
    `<span class="row-actions"><button type="button" class="btn xs" data-account-toggle="${index}">${st.enabled?'停用':'启用'}</button><button type="button" class="btn xs" data-account-reset="${index}">重置密码</button></span>`]);
  const roles=(A?A.roleMatrix():[
   {role:'集团管理员',scope:'全集团',mode:'读写（演示）',board:'✓',user:'✓',meter:'✓',set:'✓'},
   {role:'分公司管理员',scope:'本单位',mode:'读（演示）',board:'✓',user:'✓',meter:'✓',set:'—'},
   {role:'营业所用户',scope:'本营业所',mode:'读（演示）',board:'✓',user:'✓',meter:'—',set:'—'},
   {role:'营销员',scope:'本班组/线路',mode:'读（演示）',board:'—',user:'✓',meter:'—',set:'—'}
  ]).map(r=>[text(r.role),text(r.scope),text(r.mode),text(r.board),text(r.user),text(r.meter),text(r.set)]);
  const roleHeaders=['角色','数据范围','权限模式','指标看板','用户查询','表务管理','系统设置'];
  const html=`<section class="notice v4-tip" role="note">${S()?.icon('shield')||''}<div><strong>平台账号与权限（演示）</strong><div class="muted">本页按“完整功能”演示组织、账号、角色与数据权限；账号与授权仅在原型内存中演示，不写入任何本地存储，也不对接源系统账号。</div></div></section>
  <section class="kpi-grid four">${V.card('组织节点',String(companies.length+companies.reduce((n,c)=>n+(c.units||[]).length,0)),'个','经营单位 + 下属单位','building')}${V.card('演示账号',String(staff.length),'个',`已启用 ${A?A.accountEnabledCount():0} 个（仅演示）`,'users','green')}${V.card('角色','4','个','集团/分公司/营业所/营销员','role','orange')}${V.card('数据权限模式','B 模式','','按组织层级行级隔离','shield')}</section>
  <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">组织架构</h2><div class="card-subtitle">四级组织（集团 → 分公司 → 营业所/网格 → 班组 → 线路）；高新区按“高新→网格→班组→册本”映射（“加本”按册本统一处理）</div></div></div><div class="card-body">${V.table('v4OrgTable',['经营单位','下属单位','层级路径','状态'],orgRows)}</div></section>
  <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">账号管理</h2><div class="card-subtitle">演示账号清单；新增/停用入口仅演示，不产生真实变更</div></div><div class="card-head-actions"><button type="button" class="btn primary" id="v4AddAccount">＋ 新增账号</button></div></div><div class="card-body">${V.table('v4StaffTable',['姓名','所属单位','角色','账号状态','操作'],staffRows)}</div></section>
  <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">角色与数据权限</h2><div class="card-subtitle">B 模式：按组织层级限定可见数据范围；切换角色会真实改变各页可见数据</div></div><div class="card-head-actions"><label class="inline-field">当前演示角色
    <select id="v4RoleSelect" class="control compact" aria-label="当前演示角色">${(A?A.roleMatrix():[{role:'集团管理员'}]).map(r=>`<option ${A&&A.role()===r.role?'selected':''}>${esc(r.role)}</option>`).join('')}</select></label></div></div>
    <div class="card-body"><div id="v4RoleScopeNote" class="notice v4-tip" role="note">${S()?.icon('shield')||''}<div><strong>当前角色：${esc(A?A.role():'集团管理员')}</strong><div class="muted">${A&&A.roleScope()?`数据范围已限定为「${esc(A.roleScope())}」，切换页面后仅见该单位数据。`:'数据范围：全集团。'}</div></div></div>
    ${V.table('v4RoleTable',roleHeaders,roles)}</div></section>`;
  return {html,mount(){
   S().refreshIcons&&S().refreshIcons();
   const A=window.WB_ADMIN;if(!A)return;
   const rerender=()=>{const next=V.renderAuth();const page=document.getElementById('page');page.innerHTML=next.html;next.mount();};
   document.getElementById('v4AddAccount')?.addEventListener('click',()=>{
    const options=(D.companies||[]).map(c=>`<option>${esc(c.name)}</option>`).join('');
    S().openModal({title:'新增账号（演示）',subtitle:'仅保存在当前页面内存，不写入本地存储、不对接源系统账号',
      body:`<div class="form-grid"><label class="field">姓名<input id="accName" class="control" placeholder="如：张管理员"></label>
        <label class="field">所属单位<select id="accCompany" class="control">${options}</select></label>
        <label class="field">角色<select id="accRole" class="control">${A.roleMatrix().map(r=>`<option>${esc(r.role)}</option>`).join('')}</select></label></div>`,
      footer:`<button type="button" class="btn" data-close>取消</button><button type="button" class="btn primary" id="accSave">保存（内存）</button>`});
    document.getElementById('accSave').onclick=()=>{
      const result=A.addAccount({name:document.getElementById('accName').value,company:document.getElementById('accCompany').value,role:document.getElementById('accRole').value});
      if(!result.ok)return S().toast(result.message);
      S().closeLayers();S().toast('账号已加入演示清单（仅内存）');rerender();
    };
   });
   document.querySelectorAll('[data-account-toggle]').forEach(button=>button.onclick=()=>{
    const result=A.toggleAccount(+button.dataset.accountToggle);
    if(!result.ok)return;
    S().toast(result.enabled?'账号已启用（演示）':'账号已停用（演示）');rerender();
   });
   document.querySelectorAll('[data-account-reset]').forEach(button=>button.onclick=()=>{
    A.resetPassword(+button.dataset.accountReset);S().toast('已记录重置密码操作（演示，不产生真实凭据）');rerender();
   });
   document.getElementById('v4RoleSelect')?.addEventListener('change',event=>{
    const result=A.setRole(event.target.value);
    if(!result.ok)return;
    WB.state.company=result.scope||'';WB.state.role=event.target.value;
    S().toast(result.scope?`演示角色：${event.target.value}，数据范围限定为「${result.scope}」`:`演示角色：${event.target.value}，数据范围为全集团`);
    rerender();
   });
  }};
 };

 /* 操作日志面板（内存态） */
 function logPanel(){
  const A=window.WB_ADMIN;
  const rows=A?A.logs():[];
  if(!rows.length)return '<div class="empty"><div class="empty-title">暂无操作记录</div><div class="empty-description">在「计划值维护」「报表参数」或「用户管理」中做一次演示操作后，这里会记录动作、对象与时间。</div></div>';
  const headers=['日志编号','时间','操作','对象 / 内容','角色'];
  return V.table('v4LogTable',headers,rows.map(row=>[text(row.id),text(row.at),text(row.action),text(row.detail),text(row.role)]));
 }

 /* ===== V4 新增：系统设置（SET） ===== */
 V.renderSet=()=>{
  const facts=E.filterFacts?E.filterFacts():list(D.facts);
  const A=window.WB_ADMIN;
  const planRows=(E.group?E.group(facts,'company',WB.state):[]).map(row=>{
   const plan=A?A.planOf(row.name,row.plan_vol):row.plan_vol;
   const edited=A?A.hasPlan(row.name):false;
   return [text(row.name),number(plan,0),number(row.sold_vol,0),(plan?number(row.sold_vol/plan*100,1)+'%':'—'),
     edited?'<span class="badge green">已手工填报</span>':'<span class="badge gray">样例计划</span>'];
  });
  const dict=[
   ['时间口径','业务账期 / 财务自然月','只读','双口径并存，不可互换'],
   ['新增用户窗口','上月26日 — 本月25日','只读','仅用于新增户'],
   ['用水性质',text(list(D.natures).join('、')),'只读','来自源系统字典'],
   ['水表口径',text(list(D.calibers).join('、')),'只读','口径列表'],
   ['水表类型',text(list(D.meterTypes).join('、')),'只读','远传/普通'],
   ['产销差率口径','供水量与售水量差率；营业所层级不展示','只读','分区计量产销差需甲方提供区域图']
  ].map(r=>[text(r[0]),r[1],text(r[2]),text(r[3])]);
  const paramDefs=A?A.paramDefs:[];
  const paramRows=paramDefs.map(def=>{
   const current=A.paramValue(def.key);
   const control=`<select class="control compact" data-param-key="${esc(def.key)}" aria-label="${esc(def.label)}">${def.options.map(opt=>`<option ${opt===current?'selected':''}>${esc(opt)}</option>`).join('')}</select>`;
   return [text(def.label),control,text(def.entry),text(def.note)];
  });
  const html=`<section class="notice v4-tip" role="note">${S()?.icon('shield')||''}<div><strong>平台配置（演示）</strong><div class="muted">指标口径、计划值、报表参数与操作日志为平台侧配置演示；修改仅保存在当前页面内存，刷新即恢复。</div></div></section>
  <section class="kpi-grid four">${V.card('指标口径','6','项','只读口径清单','clipboard')}${V.card('计划值节点',String(planRows.length),'个',`其中已手工填报 ${A?A.planCount():0} 个`,'chart','green')}${V.card('报表参数',String(A?A.paramCount():0),'项',`已调整 ${A?A.paramOverrides():0} 项（内存）`,'report','orange')}${V.card('操作日志',String(A?A.logCount():0),'条','本轮演示操作记录','clock')}</section>
  <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">指标口径与字典</h2><div class="card-subtitle">口径类配置只读展示，避免与源系统定义冲突</div></div></div><div class="card-body">${V.table('v4DictTable',['配置项','当前值','状态','说明'],dict)}</div></section>
  <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">计划值维护</h2><div class="card-subtitle">计划值来自平台填报（演示）；实际值来自指标事实</div></div><div class="card-head-actions"><span class="badge gray">口径：${esc(A?A.periodKey():'年内累计')}</span><button type="button" class="btn" id="v4PlanReset">还原全部</button><button type="button" class="btn primary" id="v4PlanEdit">✎ 手工填报（演示）</button></div></div><div class="card-body">${V.table('v4PlanTable',['经营单位','期间计划(m³)','期间实际(m³)','计划完成率','数据状态'],planRows)}<div class="notice v4-tip" role="note" style="margin-top:10px">${S()?.icon('shield')||''}<div><strong>填报口径</strong><div class="muted">计划值为平台侧填报值，不覆盖源系统数据；保存后立即影响首页/下钻页的“计划完成率”，刷新页面即还原为样例计划。</div></div></div></div></section>
  <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">报表参数</h2><div class="card-subtitle">参数用于报表与图表口径；仅演示</div></div></div><div class="card-body">${V.table('v4ParamTable',['参数','当前值','适用入口','说明'],paramRows)}</div></section>
  <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">操作日志</h2><div class="card-subtitle">记录本轮演示中的平台侧写操作（仅内存，刷新清空；不写源系统日志）</div></div><div class="card-head-actions"><span class="badge gray">${A?A.logCount():0} 条</span></div></div><div class="card-body" id="v4LogPanel">${logPanel()}</div></section>`;
  return {html,mount(){
   S().refreshIcons&&S().refreshIcons();
   const A=window.WB_ADMIN;if(!A)return;
   const rerender=()=>{const next=V.renderSet();document.getElementById('page').innerHTML=next.html;next.mount();};

   // 计划值手工填报（内存内闭环）
   document.getElementById('v4PlanEdit')?.addEventListener('click',()=>{
    const base=(E.group?E.group(E.filterFacts(),'company',WB.state):[]);
    if(!base.length)return S().toast('当前范围暂无可填报的计划值节点');
    const rows=base.map(row=>{
      const plan=A.planOf(row.name,row.plan_vol);
      return `<tr><td>${esc(row.name)}</td><td><input class="control plan-input" data-plan-company="${esc(row.name)}" data-plan-base="${plan==null?"":Math.round(plan)}" type="number" min="1" step="1000" value="${plan==null?'':Math.round(plan)}" aria-label="${esc(row.name)}期间计划"></td><td class="numeric">${fmt(row.sold_vol,0)}</td><td>${A.hasPlan(row.name)?'<span class="badge green">已填报</span>':'<span class="badge gray">样例</span>'}</td></tr>`;
    }).join('');
    S().openModal({title:'手工填报计划值（演示）',subtitle:`口径：${A.periodKey()}　仅保存在当前页面内存，不覆盖源系统数据`,
      body:`<div class="notice v4-tip" role="note">${S()?.icon('shield')||''}<div><strong>填报说明</strong><div class="muted">填写各单位“期间计划(m³)”，保存后首页与下钻页的“计划完成率”立即按新计划计算；刷新页面即还原为样例计划。</div></div></div>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>经营单位</th><th>期间计划(m³)</th><th>期间实际(m³)</th><th>状态</th></tr></thead><tbody>${rows}</tbody></table></div>`,
      footer:`<button type="button" class="btn" data-close>取消</button><button type="button" class="btn primary" id="planSave">保存（内存）</button>`});
    document.getElementById('planSave').onclick=()=>{
      const inputs=[...document.querySelectorAll('[data-plan-company]')];
      let ok=0,fail=0,skipped=0;
      inputs.forEach(input=>{
        const company=input.dataset.planCompany,raw=input.value.trim();
        if(!raw){return;}
        if(Number(raw)===Number(input.dataset.planBase)){skipped+=1;return;}
        const result=A.setPlan(company,+raw);
        if(result.ok)ok+=1;else{fail+=1;}
      });
      S().closeLayers();
      if(!ok){return S().toast(fail?'计划值需为正数，未保存':'计划值未变化，未产生改动');}
      S().toast(`已保存 ${ok} 个单位的计划值（仅内存）${skipped?`；${skipped} 个未变化`:''}${fail?`；${fail} 个输入被忽略`:''}`);
      rerender();
    };
   });
   document.getElementById('v4PlanReset')?.addEventListener('click',()=>{
    const base=(E.group?E.group(E.filterFacts(),'company',WB.state):[]);
    base.forEach(row=>A.resetPlan(row.name));
    S().toast('已还原为样例计划（仅内存）');rerender();
   });

   // 报表参数可切换（影响对应报表/页签口径）
   document.querySelectorAll('[data-param-key]').forEach(select=>select.onchange=()=>{
    const result=A.setParam(select.dataset.paramKey,select.value);
    if(!result.ok)return S().toast(result.message||'参数未保存');
    S().toast(`参数已调整：${select.previousValue||''}${select.value}（内存）`);rerender();
   });
  }};
 };

V.commonMetricChart=setupCommonChart;
})();
