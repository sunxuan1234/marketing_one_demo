/* 用户、表务、预警与工程的只读业务视图。 */
(()=>{
 const D=WB_DATA,E=WB.engine,V=WBViews,S=()=>WB.shell,esc=E.esc,fmt=E.fmt;
 const B=window.WBBusiness={};
 const list=key=>Array.isArray(D[key])?D[key]:[];
 const text=value=>value==null||value===''?'—':String(value);
 const number=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(+value)?+value:null;
 const cells=rows=>rows.map(row=>row.map(value=>esc(text(value))));
 const empty=message=>`<div class="empty">${esc(message||'暂无记录')}</div>`;
 const risk=(level,tip)=>`<span class="v4-risk" data-tip="${esc(tip)}" title="${esc(tip)}">⚠ ${esc(level)}</span>`;
 const options=values=>[...new Set(values.filter(v=>v!=null&&v!==''))].sort().map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
 const kv=pairs=>`<div class="kv-grid">${pairs.map(([name,value])=>`<div class="kv"><span>${esc(name)}</span><b>${esc(text(value))}</b></div>`).join('')}</div>`;
 let userIndexCache=null;
 const userIndex=()=>{if(userIndexCache)return userIndexCache;userIndexCache=new Map();for(const u of list('users')){userIndexCache.set('id'+u.id,u);if(u.unified_code)userIndexCache.set('code'+u.unified_code,u);if(u.meterId)userIndexCache.set('meter'+u.meterId,u);}return userIndexCache;};
 const linkedUser=x=>{const index=userIndex();if(x.userId!=null){const byId=index.get('id'+x.userId);if(byId)return byId;}if(x.card){const byCard=index.get('code'+x.card);if(byCard)return byCard;}if(x.meterId){const byMeter=index.get('meter'+x.meterId);if(byMeter)return byMeter;}return undefined;};
 function matches(x,f=WB.state){
  const needFallback=!x.company||!x.org||!x.nature||!x.adminCode;
  const row=needFallback?{...(linkedUser(x)||{}),...x}:x;
  return [['company','company'],['admin','adminCode'],['org','org'],['nature','nature'],['industry','industry'],['caliberMm','caliber'],['meterType','meterType']].every(([filter,key])=>!f[filter]||row[key]===f[filter])&&(!f.functional||(row.functionalZones||[]).includes(f.functional)||D.functionalZones?.some(z=>z.code===f.functional&&z.companyId===row.companyId&&z.parents.includes(row.adminCode)));
 }
 let periodCache=new Map();
 function periodsOf(f){
  const key=[f.period,f.month,f.start,f.end,f.caliber].join('|');
  if(!periodCache.has(key))periodCache.set(key,new Set(E.periods(f)));
  return periodCache.get(key);
 }
 function inPeriod(x,f=WB.state){
  const p=f.caliber==='财务自然月'?(x.billingMonth||x.naturalMonth||x.date?.slice(0,7)):(x.period||x.date?.slice(0,7));
  return !!p&&periodsOf(f).has(p);
 }
 const scoped=(key,f=WB.state,period=true)=>list(key).filter(x=>matches(x,f)&&(!period||inPeriod(x,f)));
 const related=(key,u,period=true)=>list(key).filter(x=>(x.userId!=null?String(x.userId)===String(u.id):x.card===u.unified_code)&&(!period||inPeriod(x)));
 function volume(u){const rows=related('readings',u),values=rows.map(x=>number(x.volume));return rows.length&&values.every(v=>v!==null)?values.reduce((a,b)=>a+b,0):null;}
 function filteredUsers(extra={}){
  return list('users').filter(u=>matches(u)&&Object.entries(extra).every(([key,value])=>{
   if(value===''||value==null||Array.isArray(value)&&!value.length)return true;
   if(key==='keyword')return [u.unified_code,u.card_no,u.customer_no,u.name,u.address,u.phone].some(v=>String(v||'').toLowerCase().includes(String(value).toLowerCase()));
   if(key==='code')return [u.unified_code,u.card_no,u.customer_no].some(v=>String(v||'').toLowerCase().includes(String(value).toLowerCase()));
   if(key==='dateFrom')return !!u.regDate&&u.regDate>=value;
   if(key==='dateTo')return !!u.regDate&&u.regDate<=value;
   if(key==='minVol')return u.yearVol!=null&&u.yearVol>=+value;
   if(key==='arrearsOnly')return !value||number(u.arrearsAmount)>0;
   if(Array.isArray(value))return value.includes(String(u[key]||''));
   return ['name','phone','booklet','address'].includes(key)?String(u[key]||'').toLowerCase().includes(String(value).toLowerCase()):u[key]===value;
  }));
 }
 B.filteredUsers=filteredUsers;
 const tablePages=new Map();
 function setTable(target,id,headers,rows,actions){
  WB.currentTable={headers:[...headers],rows:rows.map(r=>[...r])};
  const paged=!actions&&rows.length>20,signature=rows.map(r=>text(r[0])).join('|');
  let state=tablePages.get(id);if(!state||state.signature!==signature){state={signature,page:1};tablePages.set(id,state);}
  const pages=Math.max(1,Math.ceil(rows.length/20));state.page=Math.min(state.page,pages);
  const display=cells(paged?rows.slice((state.page-1)*20,state.page*20):rows);if(actions)display.forEach((row,i)=>row.push(actions(i)));
  const box=document.getElementById(target);box.innerHTML=V.table(id,actions?[...headers,'操作']:headers,display)+(paged?`<div class="pagination"><button class="btn xs" data-table-prev ${state.page===1?'disabled':''}>上一页</button><span>第 ${state.page} / ${pages} 页 · 共 ${rows.length} 条 · 每页20条</span><button class="btn xs" data-table-next ${state.page===pages?'disabled':''}>下一页</button></div>`:'');
  if(paged){box.querySelector('[data-table-prev]').onclick=()=>{state.page--;setTable(target,id,headers,rows);};box.querySelector('[data-table-next]').onclick=()=>{state.page++;setTable(target,id,headers,rows);};}
 }
 const readingHeaders=['抄表编号','账期','抄表日期','上次抄表日期','上次指数','本次指数','抄表水量(m³)','开账水量(m³)','开账状态','抄表方式','抄表状态','抄表员','是否估抄','现场到位'];
 const bool=(value,yes='是',no='否')=>value===true?yes:value===false?no:'—';
 const readingRows=rows=>rows.map(r=>[r.id,r.period,r.date,r.lastDate,r.lastReading,r.reading,r.volume,r.billedVolume,bool(r.billed,'已开账','未开账'),r.method,r.status,r.reader,bool(r.estimated),bool(r.arrived)]);
 const meterHeaders=['水表编号','条形码','钢印号','口径','水表类型','厂家','型号','经营单位','仓库','状态','安装日期'];
 const meterRows=rows=>rows.map(m=>[m.meterId,m.barcode,m.sealNumber,m.caliber,m.meterType,m.manufacturer,m.model,m.company,m.warehouse,m.status,m.installDate]);
 const swapHeaders=['事件编号','表卡编码','经营单位','换表类型','旧水表','新水表','换表日期','换表前各期(m³)','换表后各期(m³)','状态'];
 const swapRows=(rows,n=2)=>rows.map(x=>[x.id,x.card,x.company,x.type,x.oldMeter,x.newMeter,x.date,Array.isArray(x.before)?x.before.slice(-n).map(text).join(' / '):null,Array.isArray(x.after)?x.after.slice(0,n).map(text).join(' / '):null,x.status]);
 const projectHeaders=['工程编号','项目名称','经营单位','当前节点','是否完工','是否装表','是否立户','水表编号','口径','远传水量(m³)','仓库'];
 const projectRows=rows=>rows.map(p=>[p.id,p.name,p.company,p.stage,bool(p.completed),bool(p.installed),bool(p.registered),p.meterId,p.caliber,p.remoteVol,p.warehouse]);
 B.openProfile=function(id,tab='basic'){
  const u=list('users').find(x=>String(x.id)===String(id));if(!u||!matches(u))return;
  const tabs=[['basic','基本档案'],['reading','抄表信息'],['billing','应收实收'],['meter','水表信息'],['replacement','换表信息'],['installation','报装信息'],['remote','远传信息'],['adjustment','调整减免'],['portrait','用水画像']];
  S().openDrawer({width:'1060px',title:`${text(u.name)} · 用户档案`,subtitle:`${text(u.unified_code)}｜${text(u.company)}`,body:`<div class="tabs profile-tabs" role="tablist">${tabs.map(([k,n])=>`<button role="tab" data-profile="${k}" aria-selected="${k===tab}" class="${k===tab?'active':''}">${n}</button>`).join('')}</div><div class="table-actions"><button class="btn" id="profileExport">导出当前档案CSV</button></div><div id="profileContent"></div>`});
  let exportData={headers:[],rows:[]};
  function showTable(headers,rows){exportData={headers,rows};document.getElementById('profileContent').innerHTML=V.table('profileRecords',headers,cells(rows));}
  function draw(kind){
   for(const [key,entry] of E.charts)if(key.startsWith('C-PROFILE-')){entry.chart.dispose();E.charts.delete(key);}
   const box=document.getElementById('profileContent');if(!box)return;
   if(kind==='basic'){
    const pairs=[['统一表卡编码',u.unified_code],['源表卡号',u.card_no],['源客户号',u.customer_no],['用户姓名',u.name],['经营单位',u.company],['行政区',u.admin],['站点 / 所 / 网格',u.org],['班组',u.team],['线路',u.line],['册本',u.booklet],['用水性质',u.nature],['行业',u.industry],['用户等级',u.level],['支付方式',u.payWay],['联系电话',u.phone],['地址',u.address],['立户日期',u.regDate],['状态',u.status]];
    exportData={headers:['字段','内容'],rows:pairs};box.innerHTML=kv(pairs);return;
   }
   if(kind==='reading'){showTable(readingHeaders,readingRows(related('readings',u)));return;}
   if(kind==='billing'){
    showTable(['账单编号','抄表编号','业务账期','账务年月','开账水量(m³)','应收金额(元)','实收金额(元)','欠费金额(元)','支付方式','缴费期限','收款时间','状态'],related('bills',u).map(b=>[b.id,b.readId,b.period,b.billingMonth,b.volume,b.amount,b.received,b.arrears,b.payWay,b.dueAt,b.paidAt,b.status]));return;
   }
   if(kind==='meter'){showTable(meterHeaders,meterRows(list('meterInventory').filter(m=>String(m.userId)===String(u.id)||m.meterId===u.meterId)));return;}
   if(kind==='replacement'){showTable(swapHeaders,swapRows(related('meterEvents',u,false),WB.state.swapN||2));return;}
   if(kind==='installation'){
    const projects=list('projects').filter(p=>p.card===u.unified_code||p.meterId===u.meterId||p.userId!=null&&String(p.userId)===String(u.id));showTable(projectHeaders,projectRows(projects));return;
   }
   if(kind==='remote'){
    showTable(['采集编号','采集日期','累计水量(m³)','日用水量(m³)','压力(MPa)','最近通信时间'],related('remoteReadings',u).map(r=>[r.id,r.date,r.totalFlux,r.useFlux,r.pressure,r.lastCommunication]));return;
   }
   if(kind==='adjustment'){
    showTable(['调整编号','账期','调整类型','调整水量(m³)','调整金额(元)','申请时间','源审批状态'],related('adjustments',u).map(a=>[a.id,a.period,a.type,a.volume,a.amount,a.date,a.status]));return;
   }
   const def={id:`C-PROFILE-${u.id}`,title:'历史用水量趋势',subtitle:'按表卡抄表记录汇总；缺失记录不补零',dimension:'period',dimensions:[],headers:['业务账期','抄表水量(m³)','单位'],data:f=>list('readings').filter(r=>String(r.userId)===String(u.id)&&inPeriod(r,f)),getOption:c=>{
    const data=usageTrend(c.data);if(!data.length)return E.emptyOption('当前期间暂无历史用水记录');const option=E.lineOption({data,metrics:['sold_vol']});option.series[0].name='抄表水量';return option;
   },getRows:c=>usageTrend(c.data).map(x=>[x.name,x.sold_vol,'m³'])};
   exportData={headers:['业务账期','用水量(m³)'],rows:usageTrend(related('readings',u)).map(x=>[x.name,x.sold_vol])};
   box.innerHTML=E.chartCard(def);E.registerChart(def.id,def.id,def);
  }
  function usageTrend(rows){const map=new Map();rows.forEach(r=>{if(!r.period)return;if(!map.has(r.period))map.set(r.period,[]);map.get(r.period).push(number(r.volume));});return [...map].sort(([a],[b])=>a.localeCompare(b)).map(([name,values])=>({name,sold_vol:values.every(v=>v!==null)?values.reduce((a,b)=>a+b,0):null}));}
  draw(tab);document.querySelectorAll('[data-profile]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-profile]').forEach(x=>{x.classList.toggle('active',x===button);x.setAttribute('aria-selected',String(x===button));});draw(button.dataset.profile);});
  document.getElementById('profileExport').onclick=()=>{
   const chart=E.charts.get(`C-PROFILE-${u.id}`);const data=chart?{headers:['业务账期','用水量(m³)'],rows:chart.def.getRows(chart.context).map(r=>r.slice(0,2))}:exportData;
   E.downloadCSV(`${u.unified_code}_用户档案.csv`,data.headers,data.rows);
  };
 };
 B.renderUser=function(){
  let query={},page=1,pageSize=10;
  const fields=[['company','经营单位'],['org','站点 / 所 / 网格'],['team','班组'],['line','线路'],['nature','用水性质'],['industry','行业'],['level','用户等级'],['payWay','支付方式'],['adminCode','行政区'],['caliber','水表口径'],['meterType','水表类型'],['functional','功能区'],['status','表卡状态']];
  const stateKeys={company:'company',org:'org',nature:'nature',industry:'industry',adminCode:'admin',caliber:'caliberMm',meterType:'meterType',functional:'functional'};
  const defaultMonth=D.periods?.at(-1)||WB.state.month;
  function syncStateControls(){Object.entries(stateKeys).forEach(([key,stateKey])=>{document.getElementById(`user-${key}`).value=WB.state[stateKey]||'';});document.getElementById('user-period').value=WB.state.period||'年内累计';document.getElementById('user-month').value=WB.state.month||defaultMonth;document.getElementById('user-start').value=WB.state.start||`${defaultMonth.slice(0,4)}-01`;document.getElementById('user-dateCaliber').value=WB.state.caliber||'业务账期';document.getElementById('user-startField').hidden=WB.state.period!=='自定义';}
  const columns=[['code','统一表卡编码',u=>u.unified_code],['card','源表卡号',u=>u.card_no],['customer','源客户号',u=>u.customer_no],['name','用户姓名',u=>u.name],['company','经营单位',u=>u.company],['org','站点 / 所 / 网格',u=>u.org],['line','线路',u=>u.line],['booklet','册本',u=>u.booklet],['admin','行政区',u=>u.admin],['nature','用水性质',u=>u.nature],['industry','行业',u=>u.industry],['level','用户等级',u=>u.level],['payWay','支付方式',u=>u.payWay],['phone','联系电话',u=>u.phone],['regDate','立户日期',u=>u.regDate],['vol','本年累计用水量(m³)',u=>u.yearVol],['status','状态',u=>u.status]];
  const shown=new Set(['code','name','company','line','booklet','nature','phone','vol','status']);
  const filterHtml=fields.map(([key,label])=>`<label class="field">${label}<select id="user-${key}" class="control" aria-label="${label}"><option value="">全部</option>${key==='adminCode'?list('adminRegions').map(a=>`<option value="${esc(a.code)}">${esc(a.name)}</option>`).join(''):key==='functional'?list('functionalZones').map(z=>`<option value="${esc(z.code)}">${esc(z.name)}</option>`).join(''):options(list('users').map(u=>u[key]))}</select></label>`).join('');
  const html=`<section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">用户组合查询</h2><div class="card-subtitle">组合组织与用户条件，查看九类只读档案</div></div><div class="card-head-actions"><button class="btn" id="userFields">结果字段</button><button class="btn" id="userExport">导出查询结果CSV</button></div></div><div class="card-body"><div class="filter-grid four user-query-grid"><label class="field">统计时段<select id="user-period" class="control" aria-label="统计时段"><option>当月</option><option>年内累计</option><option>近5年</option><option>近10年</option><option>自定义</option></select></label><label class="field">截至月份<input id="user-month" type="month" class="control" aria-label="截至月份"></label><label class="field" id="user-startField" hidden>起始月份<input id="user-start" type="month" class="control" aria-label="起始月份"></label><label class="field">期间口径<select id="user-dateCaliber" class="control" aria-label="期间口径"><option>业务账期</option><option>财务自然月</option></select></label>${filterHtml}${[['code','户号 / 表卡 / 客户号'],['name','用户姓名'],['phone','联系电话'],['booklet','册本'],['address','地址']].map(([key,label])=>`<label class="field">${label}<input id="user-${key}" class="control" aria-label="${label}" placeholder="支持模糊查询"></label>`).join('')}<label class="field">立户日期起<input id="user-dateFrom" type="date" class="control"></label><label class="field">立户日期止<input id="user-dateTo" type="date" class="control"></label><label class="field">当前期间用水量下限(m³)<input id="user-minVol" type="number" min="0" class="control"></label><label class="check-field"><input id="user-arrearsOnly" type="checkbox">仅看当前期间欠费用户</label><div class="filter-actions"><button class="btn primary" id="userSearch">查询</button><button class="btn" id="userReset">重置</button></div></div><div id="userFilterSummary" class="active-filter-wrap" aria-live="polite"></div></div><div id="userTable"></div><div id="userPagination" class="pagination"></div></section>`;
  const queryKeys=[...fields.map(f=>f[0]),'code','name','phone','booklet','address','dateFrom','dateTo','minVol'];
  const rows=()=>filteredUsers(query);
  function draw(){
   const all=rows(),pages=Math.max(1,Math.ceil(all.length/pageSize));page=Math.min(page,pages);
   const active=columns.filter(c=>shown.has(c[0])),headers=active.map(c=>c[1]);
   WB.currentTable={headers,rows:all.map(u=>active.map(c=>c[2](u)))};
   const current=all.slice((page-1)*pageSize,page*pageSize);
   document.getElementById('userTable').innerHTML=V.table('userResults',[...headers,'档案'],current.map(u=>[...active.map(c=>esc(text(c[2](u)))),`<button class="btn xs" data-profile-open="${esc(u.id)}">查看档案</button>`]));
   document.getElementById('userFilterSummary').textContent=`共 ${all.length} 户｜${E.filterLabel()}${Object.values(query).some(Boolean)?'｜已应用组合查询条件':''}`;
   document.getElementById('userPagination').innerHTML=`<button class="btn xs" data-page="prev" ${page===1?'disabled':''}>上一页</button><span>第 ${page} / ${pages} 页 · 共 ${all.length} 户</span><select id="userPageSize" class="control compact" aria-label="每页条数">${[10,20,50].map(n=>`<option ${pageSize===n?'selected':''}>${n}</option>`).join('')}</select><button class="btn xs" data-page="next" ${page===pages?'disabled':''}>下一页</button>`;
   document.querySelectorAll('[data-profile-open]').forEach(b=>b.onclick=()=>B.openProfile(b.dataset.profileOpen));
   document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{page+=b.dataset.page==='next'?1:-1;draw();});
   document.getElementById('userPageSize').onchange=e=>{pageSize=+e.target.value;page=1;draw();};
  }
  return{html,mount(){
   syncStateControls();draw();WB.subscribe(()=>{syncStateControls();page=1;draw();});
   document.getElementById('user-period').onchange=e=>{document.getElementById('user-startField').hidden=e.target.value!=='自定义';};
   document.getElementById('userSearch').onclick=()=>{const next=Object.fromEntries(queryKeys.map(key=>[key,document.getElementById(`user-${key}`).value.trim()]));if(next.dateFrom&&next.dateTo&&next.dateFrom>next.dateTo){S().toast('立户起始日期不能晚于结束日期');return;}const period=document.getElementById('user-period').value,month=document.getElementById('user-month').value,start=document.getElementById('user-start').value;if(!month||period==='自定义'&&(!start||start>month)){S().toast('请选择有效的统计起止月份');return;}Object.entries(stateKeys).forEach(([key,stateKey])=>{WB.state[stateKey]=next[key];delete next[key];});Object.assign(WB.state,{period,month,end:month,start:start||`${month.slice(0,4)}-01`,year:month.slice(0,4),caliber:document.getElementById('user-dateCaliber').value});next.arrearsOnly=document.getElementById('user-arrearsOnly').checked;query=next;page=1;E.refreshAll();};
   queryKeys.forEach(key=>document.getElementById(`user-${key}`).onkeydown=e=>{if(e.key==='Enter')document.getElementById('userSearch').click();});
   document.getElementById('userReset').onclick=()=>{queryKeys.forEach(key=>document.getElementById(`user-${key}`).value='');document.getElementById('user-arrearsOnly').checked=false;Object.values(stateKeys).forEach(key=>WB.state[key]='');Object.assign(WB.state,{period:'年内累计',month:defaultMonth,end:defaultMonth,start:`${defaultMonth.slice(0,4)}-01`,year:defaultMonth.slice(0,4),caliber:'业务账期',keyword:''});query={};page=1;E.refreshAll();};
   document.getElementById('userExport').onclick=()=>E.downloadCSV('用户组合查询.csv',WB.currentTable.headers,WB.currentTable.rows);
   document.getElementById('userFields').onclick=()=>{S().openModal({title:'查询结果字段',body:columns.map(([key,label])=>`<label class="check-field"><input type="checkbox" data-user-column="${key}" ${shown.has(key)?'checked':''}>${label}</label>`).join(''),footer:'<button class="btn primary" id="saveUserColumns">应用字段</button>'});document.getElementById('saveUserColumns').onclick=()=>{shown.clear();document.querySelectorAll('[data-user-column]').forEach(i=>{if(i.checked)shown.add(i.dataset.userColumn);});if(!shown.size)shown.add('code');S().closeLayers();draw();};};
  }};
 };
 const alertHeaders=['异常编号','异常类型','级别','表卡编码','经营单位','行政区','组织','异常日期','问题描述','源状态'];
 const alertRows=rows=>rows.map(a=>[a.id,a.type,a.severity,a.card,a.company,a.admin,a.org,a.date,a.description,a.status]);
 function alertTable(alerts,targetId){
  setTable(targetId,targetId+'Records',alertHeaders,alertRows(alerts),i=>`<button class="btn xs" data-alert-detail="${esc(alerts[i].id)}">查看证据</button>`);
  document.getElementById(targetId).querySelectorAll('[data-alert-detail]').forEach(b=>b.onclick=()=>B.openAlert(b.dataset.alertDetail));
 }
 B.alertTable=alertTable;
 B.openAlert=function(id){
  const a=list('alerts').find(x=>x.id===id);if(!a||!matches(a))return;
  const evidence=Array.isArray(a.evidence)?a.evidence:[];
  S().openDrawer({title:`${text(a.type)} · 异常证据`,subtitle:`${text(a.id)}｜${text(a.card)}｜${text(a.company)}`,body:kv([['异常类型',a.type],['严重程度',a.severity],['源系统',a.sourceSystem],['责任营销员',a.assignee],['异常日期',a.date],['源状态',a.status],['异常描述',a.description]])+`<h3>源证据索引</h3>${evidence.length?V.table('alertEvidence',['证据','记录时间'],cells(evidence.map(e=>typeof e==='string'?[e,null]:[e.name||e.id,e.time||e.date]))):empty('暂无源证据记录')}`,footer:'<button class="btn" data-close>关闭</button>'});
 };
 B.renderAlert=function(){
  let tab='meterState',type='',severity='';
  const tabDefs=[['meterState','① 异常状态水表','表务异常 + 立户相关异常'],['dataAnomaly','② 数据异常','已按会议要求移入「数据集成与治理」'],['readAnomaly','③ 抄表异常','抄表状态、拍照、定位、指数差异'],['meterFault','④ 表务异常','设备与档案类异常'],['illegal','⑤ 违规立户','无表立户、表档未同步、户表号不匹配'],['flow','⑥ 流程异常','工单超时与流程节点滞留'],['rules','⑦ 异常规则管理','预设规则清单与自主增减（演示）']];
  const match=(a,key)=>{
   if(key==='meterState')return a.category==='表务异常'||/立户/.test(a.type);
   if(key==='dataAnomaly')return false;
   if(key==='readAnomaly')return a.category==='抄表异常';
   if(key==='meterFault')return a.category==='表务异常';
   if(key==='illegal')return /无表立户|表档未同步|户表号不匹配/.test(a.type);
   if(key==='flow')return a.category==='流程异常';
   if(key==='rules')return false;
   return true;
  };
  const rules=(D.alertRules||[]).map(rule=>({...rule}));
  const disabledTypes=()=>new Set(rules.filter(rule=>!rule.enabled).map(rule=>rule.type));
  const base=()=>scoped('alerts',WB.state).filter(a=>a.category!=='基础信息'&&!disabledTypes().has(a.type));
  const alerts=(f=WB.state)=>base().filter(a=>match(a,tab)).filter(a=>(!type||a.type===type)&&(!severity||a.severity===severity));
  function rulePanel(){
   const hitCount=rule=>list('alerts').filter(alert=>alert.type===rule.type).length;
   const enabled=rules.filter(rule=>rule.enabled).length;
   const custom=rules.filter(rule=>rule.source==='自定义').length;
   const rows=rules.map((rule,index)=>`<tr>
     <td>${esc(rule.id)}</td><td>${esc(rule.name)}</td><td>${esc(rule.category)}</td><td>${esc(rule.level)}</td>
     <td>${esc(rule.threshold)} ${esc(rule.unit||'')}</td><td>${esc(rule.condition)}</td>
     <td>${hitCount(rule)}</td>
     <td><span class="badge ${rule.enabled?'green':'gray'}">${rule.enabled?'启用':'停用'}</span></td>
     <td class="rule-actions">
       <button class="btn xs" data-rule-toggle="${index}">${rule.enabled?'停用':'启用'}</button>
       <button class="btn xs" data-rule-edit="${index}">编辑</button>
       ${rule.source==='自定义'?`<button class="btn xs" data-rule-delete="${index}">删除</button>`:'<span class="muted" style="font-size:11px">预设</span>'}
     </td></tr>`).join('');
   return `<div class="kpi-grid four special-kpis">${V.card('规则总数',String(rules.length),'条','预设 + 自定义')}${V.card('启用规则',String(enabled),'条','停用后对应异常不再展示','green')}${V.card('停用规则',String(rules.length-enabled),'条','仅影响页面展示','orange')}${V.card('自定义规则',String(custom),'条','保存在当前页面内存')}</div>
    <div class="rule-toolbar"><button type="button" class="btn primary" id="addRule">＋ 新增规则</button><span class="muted">操作说明：点「停用/启用」切换是否参与展示；点「编辑」修改阈值与条件；自定义规则可删除。所有修改仅保存在当前页面，刷新还原。</span></div>
    <div class="table-scroll"><table class="data-table rule-table"><thead><tr><th>规则编号</th><th>规则名称</th><th>异常类型</th><th>级别</th><th>阈值</th><th>判定条件</th><th>命中样例</th><th>状态</th><th>操作</th></tr></thead><tbody>${rows||`<tr><td colspan="9"><div class="empty">暂无规则</div></td></tr>`}</tbody></table></div>
    <div class="notice">预设 10 条规则覆盖抄表异常、表务异常、关联异常与流程异常；正式规则清单与阈值由甲方提供，本页为演示。${risk('L2','规则阈值与判定条件为预设样例，未接入规则引擎')}</div>`;
  }
  function openRuleModal(index){
   const isNew=index==null,rule=isNew?{name:'',type:(list('alerts')[0]||{}).type||'',category:'抄表异常',level:'中',threshold:1,unit:'期',condition:''}:rules[index];
   const types=[...new Set(list('alerts').map(alert=>alert.type))];
   const body=`<div class="rule-form">
     <label>规则名称<input id="ruleName" class="control" value="${esc(rule.name)}" placeholder="如：连续3期水量波动超阈值"></label>
     <label>异常类型<select id="ruleType" class="control">${types.map(item=>`<option value="${esc(item)}" ${item===rule.type?'selected':''}>${esc(item)}</option>`).join('')}</select></label>
     <label>预警级别<select id="ruleLevel" class="control">${['高','中','低','待核查'].map(item=>`<option ${item===rule.level?'selected':''}>${item}</option>`).join('')}</select></label>
     <label>阈值<input id="ruleThreshold" class="control" type="number" step="0.1" value="${esc(rule.threshold)}"><span class="rule-unit">${esc(rule.unit||'')}</span></label>
     <label>判定条件<textarea id="ruleCondition" class="control" rows="3">${esc(rule.condition)}</textarea></label>
     <div class="notice">保存只写入当前页面内存，刷新后恢复预设。</div></div>`;
   S().openModal({title:isNew?'新增异常规则':'编辑异常规则',body,footer:'<button type="button" class="btn" id="cancelRule">取消</button><button type="button" class="btn primary" id="saveRule">保存</button>'});
   document.getElementById('cancelRule').onclick=()=>S().closeLayers();
   document.getElementById('saveRule').onclick=()=>{
    const name=document.getElementById('ruleName').value.trim();
    if(!name)return S().toast('请填写规则名称');
    const payload={name,type:document.getElementById('ruleType').value,level:document.getElementById('ruleLevel').value,threshold:Number(document.getElementById('ruleThreshold').value)||0,condition:document.getElementById('ruleCondition').value.trim()};
    if(isNew){rules.push({...payload,id:`R-${String(rules.length+1).padStart(3,'0')}`,unit:'期',category:(list('alerts').find(alert=>alert.type===payload.type)||{}).category||'抄表异常',enabled:true,source:'自定义'});}
    else Object.assign(rules[index],payload);
    S().closeLayers();draw();S().toast('规则已保存（仅保存在当前页面内存）');
   };
  }
  function bindRules(){
   document.getElementById('addRule')?.addEventListener('click',()=>openRuleModal());
   document.querySelectorAll('[data-rule-toggle]').forEach(button=>button.onclick=()=>{const rule=rules[+button.dataset.ruleToggle];rule.enabled=!rule.enabled;draw();S().toast(`规则已${rule.enabled?'启用':'停用'}（仅影响当前页面展示）`);});
   document.querySelectorAll('[data-rule-edit]').forEach(button=>button.onclick=()=>openRuleModal(+button.dataset.ruleEdit));
   document.querySelectorAll('[data-rule-delete]').forEach(button=>button.onclick=()=>{const index=+button.dataset.ruleDelete;if(rules[index].source!=='自定义')return S().toast('预设规则不可删除，可停用');rules.splice(index,1);draw();S().toast('自定义规则已删除（仅内存）');});
  }
  const def={id:'C-AL-01',title:'异常类型分布',subtitle:'仅统计当前页签范围的异常',dimension:'type',dimensions:['type','severity','company','org'],headers:['拆分项','异常数量(条)'],data:f=>alerts(f),getOption:c=>countOption(c.data,c.state.dimension,'异常数量','条'),getRows:c=>countBy(c.data,c.state.dimension).map(x=>[x.name,x.count]),onClick:(p,c)=>{const rows=c.data.filter(a=>text(a[c.state.dimension])===p.name);S().openModal({title:`${text(p.name)} · 异常明细`,body:V.table('alertChartRecords',alertHeaders,cells(alertRows(rows))),footer:'<button class="btn" id="exportAlertChart">导出当前明细CSV</button>'});document.getElementById('exportAlertChart').onclick=()=>E.downloadCSV('异常图表明细.csv',alertHeaders,alertRows(rows));}};
  // 3-5：堆叠柱（经营单位 × 异常类型）与占比饼（按当前拆分维度）
  const stackDef={id:'C-AL-02',title:'异常类型堆叠（按经营单位）',subtitle:'每个经营单位按异常类型堆叠；点击柱条查看明细',dimension:'company',dimensions:[],headers:['经营单位','异常类型','数量(条)'],
    data:f=>alerts(f),
    getOption:c=>{const rows=c.data;if(!rows.length)return E.emptyOption();
      const companies=[...new Set(rows.map(a=>text(a.company)))];
      const types=[...new Set(rows.map(a=>text(a.type)))];
      return {color:E.colors,tooltip:{trigger:'axis'},legend:{bottom:0,type:'scroll',textStyle:{fontSize:10,color:'#758697'}},grid:{left:48,right:18,top:24,bottom:52},
        xAxis:{type:'category',data:companies,axisLabel:{fontSize:10,rotate:companies.length>5?22:0}},yAxis:{type:'value',name:'条',minInterval:1},
        series:types.map(t=>({name:t,type:'bar',stack:'a',barMaxWidth:36,data:companies.map(co=>rows.filter(a=>text(a.company)===co&&text(a.type)===t).length)}))};},
    getRows:c=>{const rows=c.data;const companies=[...new Set(rows.map(a=>text(a.company)))];const types=[...new Set(rows.map(a=>text(a.type)))];
      return companies.flatMap(co=>types.map(t=>[co,t,rows.filter(a=>text(a.company)===co&&text(a.type)===t).length]));},
    onClick:(params,ctx)=>{const rows=ctx.data.filter(a=>text(a.company)===text(params?.name));if(!rows.length)return;S().openModal({title:`${text(params.name)} · 异常明细`,body:V.table('alertStackRecords',alertHeaders,cells(alertRows(rows))),footer:'<button class="btn" id="exportAlertStack">导出当前明细CSV</button>'});document.getElementById('exportAlertStack').onclick=()=>E.downloadCSV('异常堆叠明细.csv',alertHeaders,alertRows(rows));}};
  const pieDef={id:'C-AL-03',title:'异常构成占比',subtitle:'按当前拆分维度看占比；点击扇区查看明细',dimension:'type',dimensions:['type','severity','company','org'],headers:['分项','数量(条)','占比(%)'],
    data:f=>alerts(f),
    getOption:c=>{const data=countBy(c.data,c.state.dimension);if(!data.length)return E.emptyOption();
      const total=data.reduce((n,d)=>n+d.count,0);
      return {color:E.colors,tooltip:{trigger:'item',formatter:q=>`${esc(q.name)}<br>${fmt(q.value,0)} 条 · ${q.percent}%`},legend:{bottom:0,type:'scroll',textStyle:{fontSize:10,color:'#758697'}},
        series:[{type:'pie',radius:['38%','64%'],center:['50%','44%'],data:data.map(d=>({name:d.name,value:d.count,percent:total?+(d.count/total*100).toFixed(2):0})),itemStyle:{borderColor:'#fff',borderWidth:2},label:{show:false}}]};},
    getRows:c=>{const data=countBy(c.data,c.state.dimension);const total=data.reduce((n,d)=>n+d.count,0);return data.map(d=>[d.name,d.count,total?+(d.count/total*100).toFixed(2):null]);},
    onClick:(params,ctx)=>{const rows=ctx.data.filter(a=>text(a[ctx.state.dimension])===text(params?.name));if(!rows.length)return;S().openModal({title:`${text(params.name)} · 异常明细`,body:V.table('alertPieRecords',alertHeaders,cells(alertRows(rows))),footer:'<button class="btn" id="exportAlertPie">导出当前明细CSV</button>'});document.getElementById('exportAlertPie').onclick=()=>E.downloadCSV('异常占比明细.csv',alertHeaders,alertRows(rows));}};

  const html=`<section class="notice" id="alertScopeNote"></section><div class="tabs" role="tablist" aria-label="异常分类">${tabDefs.map(([key,label],i)=>`<button type="button" role="tab" data-alert-tab="${key}" class="${i===0?'active':''}" aria-selected="${i===0}">${label}</button>`).join('')}</div><section class="kpi-grid four" id="alertKpis" style="margin-bottom:12px"></section><section id="alertChartWrap" class="chart-grid"><div>${E.chartCard(def)}</div><div>${E.chartCard(stackDef)}</div><div>${E.chartCard(pieDef)}</div></section><section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">异常分析与预警明细</h2><div class="card-subtitle" id="alertPanelSub">源状态与证据只读</div></div><div class="card-head-actions"><select id="alertType" class="control compact" aria-label="异常类型"><option value="">全部类型</option>${options(base().map(a=>a.type))}</select><select id="alertSeverity" class="control compact" aria-label="异常级别"><option value="">全部级别</option>${options(base().map(a=>a.severity))}</select><button class="btn" data-export-current>导出异常CSV</button></div></div><div id="alertTable"></div></section>`;
  function notes(){
   const tip={'meterState':'水表与户状态类异常；未立户有水量需结合远传与报装数据复核','dataAnomaly':'按 2026-09-24 会议，数据异常归入「数据集成与治理」菜单','readAnomaly':'拍照、定位、OCR 识别类异常按抄表任务样例展示','meterFault':'设备与档案类异常','illegal':'违规立户为专项视图，与异常状态水表存在交叉','flow':'流程异常来自源流程记录，只读','rules':'预设异常规则清单；可启用/停用、新增、编辑、删除（仅内存，不落盘）'};
   document.getElementById('alertScopeNote').innerHTML=S().icon('bell')+'<div><strong>'+esc(tabDefs.find(t=>t[0]===tab)[1].replace(/^[①②③④⑤⑥]\s*/,''))+'</strong><div class="muted">'+esc(tip[tab]||'')+'</div></div>'+risk('L1','拍照/定位/AI识别类异常缺源系统数据，演示分类与名单，不代表已接入');
  }
  function draw(){
   notes();
   const panel=document.getElementById('alertTable'),wrap=document.getElementById('alertChartWrap');
   if(tab==='rules'){
    wrap.hidden=true;
    panel.innerHTML=rulePanel();
    bindRules();
    WB.currentTable={headers:[],rows:[]};
    return;
   }
   if(tab==='dataAnomaly'){
    wrap.hidden=true;
    panel.innerHTML=`<div class="empty">${S().icon('empty')||''}<div class="empty-title">数据异常已移至「数据集成与治理」</div><div class="empty-description">该分类按 2026-09-24 会议调整归属；请前往数据集成与治理页的「数据异常」页签查看。</div></div><div style="padding:0 16px 16px"><button type="button" class="btn primary" id="gotoDataAnomaly">前往数据集成与治理</button></div>`;
    document.getElementById('gotoDataAnomaly').onclick=()=>location.hash='#/data?tab=dataAnomaly';
    WB.currentTable={headers:[],rows:[]};
    return;
   }
   wrap.hidden=false;
   const list0=alerts();
   const byCompany=countBy(list0,'company').sort((a,b)=>b.count-a.count);
   const pending=list0.filter(a=>text(a.severity)==='待核查'||!a.severity).length;
   const kpiHost=document.getElementById('alertKpis');
   if(kpiHost){
     kpiHost.innerHTML=V.card('当前页签异常',String(list0.length),'条',tabDefs.find(t=>t[0]===tab)[2],'alert','blue')
       +V.card('待核查',String(pending),'条','级别为待核查或无级别','clock','orange')
       +V.card('涉及经营单位',String(byCompany.length),'个',byCompany[0]?`最多：${byCompany[0].name}`:'当前范围无异常','building','green')
       +V.card('异常类型',String(new Set(list0.map(a=>text(a.type))).size),'类','当前页签范围','layers','purple');
   }
   if(!E.charts.get(stackDef.id))E.registerChart(stackDef.id,stackDef.id,stackDef);else E.refreshChart(stackDef.id);
   if(!E.charts.get(pieDef.id))E.registerChart(pieDef.id,pieDef.id,pieDef);else E.refreshChart(pieDef.id);
   alertTable(alerts(),'alertTable');
   document.getElementById('alertPanelSub').textContent=`当前页签 ${alerts().length} 条 · ${tabDefs.find(t=>t[0]===tab)[2]}`;
   WB.currentTable={headers:alertHeaders,rows:alertRows(alerts())};
  }
  return{html,mount(){E.registerChart(def.id,def.id,def);draw();
   document.querySelectorAll('[data-alert-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.alertTab;document.querySelectorAll('[data-alert-tab]').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-selected',String(item===button));});type='';severity='';document.getElementById('alertType').value='';document.getElementById('alertSeverity').value='';draw();E.clearCharts();E.registerChart(def.id,def.id,def);E.refreshChart(def.id);});
   ['alertType','alertSeverity'].forEach(id=>document.getElementById(id).onchange=e=>{if(id==='alertType')type=e.target.value;else severity=e.target.value;draw();E.refreshChart(def.id);E.refreshChart(stackDef.id);E.refreshChart(pieDef.id);});
   WB.subscribe(draw);}};
 };
 function countBy(rows,key){const map=new Map();rows.forEach(x=>{const value=text(x[key]);map.set(value,(map.get(value)||0)+1);});return [...map].map(([name,count])=>({name,count}));}
 function countOption(rows,key,label,unit){const data=countBy(rows,key);if(!data.length)return E.emptyOption();const option=E.barOption({data,metric:'count',seriesName:label});option.yAxis.name=unit;option.yAxis.minInterval=1;option.tooltip.valueFormatter=value=>`${fmt(value)} ${unit}`;option.series[0].label.formatter=p=>fmt(p.value);return option;}
 let evidenceExpanded={};
 let meterTab='quality';
 B.renderMeter=function(){
  let tab=meterTab,query='';
  const rateNames=['抄见率','到位率','估抄率','远传开账率','照片合规率','指数一致率'];
  const pct=(a,b)=>b>0?+(a/b*100).toFixed(2):null;
  function rateStats(rows){
   const read=rows.filter(t=>t.status!=='未抄');
   const mobile=rows.filter(t=>t.method!=='远传');
   const arrived=mobile.filter(t=>t.arrived===true);
   const estimated=read.filter(t=>t.estimated||t.status==='估抄');
   const remote=rows.filter(t=>t.method==='远传');
   const pushed=remote.filter(t=>t.remotePushed===true);
   const photo=mobile.filter(t=>t.photoCompliant!=null);
   const photoOk=photo.filter(t=>t.photoCompliant===true);
   const indexOk=photoOk.filter(t=>t.ocrDiff===0);
   return {total:rows.length,read:read.length,missing:rows.length-read.length,
     '抄见率':pct(read.length,rows.length),'到位率':pct(arrived.length,mobile.length),'估抄率':pct(estimated.length,read.length),
     '远传开账率':pct(pushed.length,remote.length),'照片合规率':pct(photoOk.length,photo.length),'指数一致率':pct(indexOk.length,photoOk.length)};
  }
  const rateDef={id:'C-MET-01',title:'抄表质量与三率（按抄表任务基线）',subtitle:'应抄任务、到位、估抄、远传开账、照片与指数一致性',dimension:'rate',dimensions:[],periodFilter:false,headers:['指标','比率(%)','口径'],data:f=>scoped('readTasks',f),getOption:c=>{const stat=rateStats(c.data);const data=rateNames.map(name=>({name,value:stat[name]??0}));if(!c.data.length)return E.emptyOption();const option=E.barOption({data,metric:'value',seriesName:'比率'});option.yAxis.name='%';option.yAxis.max=100;option.series[0].label.formatter=p=>fmt(p.value,1)+'%';return option;},getRows:c=>{const stat=rateStats(c.data);return rateNames.map(name=>[name,stat[name],'%',name==='抄见率'?'已抄任务 / 应抄任务':name==='到位率'?'手机抄表到位 / 手机抄表任务':name==='估抄率'?'估抄任务 / 已抄任务':name==='远传开账率'?'已推送开账 / 远传任务':name==='照片合规率'?'合规照片 / 手机抄表任务':'AI识别指数与开账一致 / 合规照片']);}};
  const ledgerDef={id:'C-MET-02',title:'水表台账统计',subtitle:'按水表类型、厂家、口径查看水表数量',dimension:'meterType',dimensions:['meterType','manufacturer','caliber','company','status'],periodFilter:false,headers:['拆分项','水表数量(只)'],data:f=>scoped('meterInventory',f,false),getOption:c=>countOption(c.data,c.state.dimension,'水表数量','只'),getRows:c=>countBy(c.data,c.state.dimension).map(x=>[x.name,x.count]),onClick:(p,c)=>{const rows=c.data.filter(m=>text(m[c.state.dimension])===p.name);S().openModal({title:`${text(p.name)} · 水表明细`,body:V.table('meterChartRecords',meterHeaders,cells(meterRows(rows))),footer:'<button class="btn" id="exportMeterChart">导出当前明细CSV</button>'});document.getElementById('exportMeterChart').onclick=()=>E.downloadCSV('水表图表明细.csv',meterHeaders,meterRows(rows));}};
  const tabs=[['quality','抄表与三率'],['ledger','水表台账'],['swap','换表记录'],['warehouse','仓库'],['booklet','册本'],['evidence','照片 / 定位 / 指数异常'],['remote','远传采集']];
  // ===== 按页签的图表（需求 NEW-4-03/04/05）=====
  const meterPieDef={id:'C-MET-03',title:'水表数量构成占比',subtitle:'各经营单位水表占比；点击扇区下钻到该单位',dimension:'company',dimensions:[],periodFilter:false,
    headers:['经营单位','水表数量(只)','占比(%)'],
    getRows:c=>{const rows=countBy(scoped('meterInventory',WB.state,false),'company');const total=rows.reduce((n,r)=>n+r.count,0);return rows.map(r=>[r.name,r.count,total?+(r.count/total*100).toFixed(2):null]);},
    getOption:c=>{const rows=countBy(scoped('meterInventory',WB.state,false),'company');if(!rows.length)return E.emptyOption();
      return {color:E.colors,tooltip:{trigger:'item',formatter:q=>`${esc(q.name)}<br>${fmt(q.value,0)} 只 · ${q.percent}%`},legend:{bottom:0,type:'scroll',textStyle:{fontSize:10,color:'#758697'}},
        series:[{type:'pie',radius:['38%','64%'],center:['50%','44%'],data:rows.map(r=>({name:r.name,value:r.count})),itemStyle:{borderColor:'#fff',borderWidth:2},label:{show:false}}]};},
    onClick:params=>{if(!params?.name)return;WB.state.company=params.name;WB.shell?.toast?.(`已按经营单位筛选：${params.name}`);window.WBApp?.render?.(false);}};

  const swapStackDef={id:'C-MET-04',title:'周检 / 故障换表数量',subtitle:'按经营单位堆叠：周检换表 + 故障换表；点击柱条查看口径与表型构成',dimension:'company',dimensions:[],periodFilter:false,
    headers:['经营单位','周检换表(只)','故障换表(只)','合计(只)','周检占比(%)'],
    getRows:c=>{const rows=swapComposition();return rows.map(r=>[r.name,r.check,r.fault,r.check+r.fault,r.check+r.fault?+(r.check/(r.check+r.fault)*100).toFixed(2):null]);},
    getOption:c=>{const rows=swapComposition();if(!rows.length)return E.emptyOption();
      return {color:['#317FC2','#F58B3C'],tooltip:{trigger:'axis'},legend:{bottom:0,textStyle:{fontSize:10,color:'#758697'}},grid:{left:48,right:18,top:24,bottom:62},
        xAxis:{type:'category',data:rows.map(r=>r.name),axisLabel:{fontSize:10,interval:0}},yAxis:{type:'value',name:'只'},
        series:[{name:'周检换表',type:'bar',stack:'s',barMaxWidth:34,data:rows.map(r=>r.check),itemStyle:{color:'#317FC2'}},
          {name:'故障换表',type:'bar',stack:'s',barMaxWidth:34,data:rows.map(r=>r.fault),itemStyle:{color:'#F58B3C'}}]};},
    onClick:params=>{if(!params?.name)return;openComposition(scoped('meterEvents').filter(x=>x.company===params.name),`${params.name} · 换表构成`);}};

  const swapRingDef={id:'C-MET-05',title:'换表双环构成',subtitle:'外环＝各经营单位占比；内环＝周检 / 故障构成；点击外环下钻',dimension:'company',dimensions:[],periodFilter:false,
    headers:['层级','分项','数量(只)'],
    getRows:c=>{const rows=swapComposition();const outer=rows.map(r=>['经营单位',r.name,r.check+r.fault]);
      const check=rows.reduce((n,r)=>n+r.check,0),fault=rows.reduce((n,r)=>n+r.fault,0);return [...outer,['换表类型','周检换表',check],['换表类型','故障换表',fault]];},
    getOption:c=>{const rows=swapComposition();if(!rows.length)return E.emptyOption();
      const check=rows.reduce((n,r)=>n+r.check,0),fault=rows.reduce((n,r)=>n+r.fault,0);
      return {color:['#317FC2','#41A75E','#F58B3C','#8E6FD8','#B7732E'],tooltip:{trigger:'item',formatter:q=>`${esc(q.name)}<br>${fmt(q.value,0)} 只 · ${q.percent}%`},
        legend:{bottom:0,type:'scroll',textStyle:{fontSize:10,color:'#758697'},data:[...rows.map(r=>r.name),'周检换表','故障换表']},
        series:[
          {name:'经营单位',type:'pie',radius:['58%','74%'],center:['50%','44%'],label:{show:false},itemStyle:{borderColor:'#fff',borderWidth:2},data:rows.map(r=>({name:r.name,value:r.check+r.fault}))},
          {name:'换表类型',type:'pie',radius:['34%','52%'],center:['50%','44%'],label:{show:false},itemStyle:{borderColor:'#fff',borderWidth:2},data:[{name:'周检换表',value:check,itemStyle:{color:'#B7732E'}},{name:'故障换表',value:fault,itemStyle:{color:'#8E6FD8'}}]}
        ]};},
    onClick:params=>{if(!params?.name)return;WB.state.company=params.name;WB.shell?.toast?.(`已按经营单位筛选：${params.name}`);window.WBApp?.render?.(false);}};

  const warehouseBarDef={id:'C-MET-06',title:'各仓库水表库存',subtitle:'中心仓库与站点仓库库存；点击柱条查看口径与表型构成',dimension:'warehouse',dimensions:[],periodFilter:false,
    headers:['仓库','经营单位','仓库类型','库存(只)'],
    getRows:c=>warehouseRows().map(r=>[r.name,r.company,r.type,r.count]),
    getOption:c=>{const rows=warehouseRows();if(!rows.length)return E.emptyOption();
      return {color:['#317FC2'],tooltip:{trigger:'axis'},grid:{left:48,right:18,top:24,bottom:52},
        xAxis:{type:'category',data:rows.map(r=>r.name),axisLabel:{fontSize:10,rotate:rows.length>6?24:0}},yAxis:{type:'value',name:'只'},
        series:[{name:'库存水表',type:'bar',barMaxWidth:34,data:rows.map(r=>r.count),itemStyle:{color:'#317FC2',borderRadius:[5,5,0,0]}}]};},
    onClick:params=>{if(!params?.name)return;const inventory=scoped('meterInventory',WB.state,false).filter(m=>m.warehouse===params.name);openComposition(inventory,`${params.name} · 库存构成`);}};

  const warehousePieDef={id:'C-MET-07',title:'仓库库存占比',subtitle:'按仓库类型与仓库分布；点击扇区查看该仓库明细',dimension:'warehouse',dimensions:[],periodFilter:false,
    headers:['仓库','库存(只)','占比(%)'],
    getRows:c=>{const rows=warehouseRows();const total=rows.reduce((n,r)=>n+r.count,0);return rows.map(r=>[r.name,r.count,total?+(r.count/total*100).toFixed(2):null]);},
    getOption:c=>{const rows=warehouseRows();if(!rows.length)return E.emptyOption();
      return {color:E.colors,tooltip:{trigger:'item',formatter:q=>`${esc(q.name)}<br>${fmt(q.value,0)} 只 · ${q.percent}%`},legend:{bottom:0,type:'scroll',textStyle:{fontSize:10,color:'#758697'}},
        series:[{type:'pie',radius:['38%','64%'],center:['50%','44%'],data:rows.map(r=>({name:r.name,value:r.count})),itemStyle:{borderColor:'#fff',borderWidth:2},label:{show:false}}]};},
    onClick:params=>{if(!params?.name)return;const inventory=scoped('meterInventory',WB.state,false).filter(m=>m.warehouse===params.name);if(!inventory.length)return WB.shell?.toast?.('该仓库当前无库存水表');openComposition(inventory,`${params.name} · 库存明细`);}};

  function swapComposition(){
    const map=new Map();
    scoped('meterEvents').forEach(x=>{const cur=map.get(x.company)||{name:x.company,check:0,fault:0};if(String(x.type||'').includes('故障'))cur.fault+=1;else cur.check+=1;map.set(x.company,cur);});
    return [...map.values()].sort((a,b)=>(b.check+b.fault)-(a.check+a.fault));
  }
  function warehouseRows(){
    const inventory=scoped('meterInventory',WB.state,false);
    return list('warehouses').filter(w=>!WB.state.company||w.company===WB.state.company)
      .map(w=>({name:w.name,company:w.company,type:w.type,count:inventory.filter(m=>m.company===w.company&&(m.warehouse===w.id||m.warehouse===w.name)).length}))
      .filter(row=>row.count>0||!WB.state.company)
      .sort((a,b)=>b.count-a.count);
  }
  function openComposition(rows,title){
    if(!rows.length)return WB.shell?.toast?.('当前范围没有可用于构成分析的水表');
    const block=(label,key)=>{const data=countBy(rows,key).slice(0,12);if(!data.length)return '';
      return `<div class="compose-block"><h4>${esc(label)}</h4>${data.map(d=>`<div class="compose-row"><span>${esc(d.name)}</span><i style="width:${Math.max(4,Math.round(d.count/rows.length*100))}%"></i><strong>${fmt(d.count,0)} 只</strong></div>`).join('')}</div>`;};
    WB.shell?.openModal({title,subtitle:`共 ${rows.length} 只水表　按口径 / 水表类型 / 用水性质 / 状态拆分`,
      body:`<div class="compose-grid">${block('水表口径','caliber')}${block('水表类型','meterType')}${block('厂家','manufacturer')}${block('状态','status')}</div>`,
      footer:`<button type="button" class="btn primary" data-close>关闭</button>`});
  }

  const html=`<section class="chart-grid" id="meterCharts"></section><div class="tabs">${tabs.map(([key,label])=>`<button data-meter="${key}" class="${key===tab?'active':''}">${label}</button>`).join('')}</div><section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title" id="meterPanelTitle">抄表与三率</h2><div class="card-subtitle">表务与抄表只读明细</div></div><div class="card-head-actions"><input id="meterQuery" class="control compact" placeholder="水表 / 表卡 / 类型查询" aria-label="表务关键字"><label id="swapOptions" hidden>前后周期<select id="swapN" class="control compact"><option>1</option><option selected>2</option><option>3</option><option>4</option></select></label><button class="btn" data-export-current>导出当前页签CSV</button></div></div><div id="meterSummary"></div><div id="meterPanel"></div></section>`;
  const search=rows=>rows.filter(x=>!query||Object.values(x).some(v=>v!=null&&String(v).toLowerCase().includes(query.toLowerCase())));
  function panel(){
   document.getElementById('meterPanelTitle').textContent=tabs.find(t=>t[0]===tab)[1];document.getElementById('swapOptions').hidden=tab!=='swap';document.getElementById('meterSummary').innerHTML='';
   if(tab==='quality'){
    const tasks=search(scoped('readTasks')),stat=rateStats(tasks);
    document.getElementById('meterSummary').innerHTML=`<div class="card-body">${kv([['应抄任务(户次)',fmt(stat.total,0)],['已抄任务(户次)',fmt(stat.read,0)],['未抄任务(户次)',fmt(stat.missing,0)],...rateNames.map(name=>[name,stat[name]==null?'—':fmt(stat[name],2)+'%'])])}<div class="notice">比率按<b>抄表任务基线</b>计算（样例任务自 2023-01 起）：未抄任务不计水量与应收，估抄仍计费但计入估抄率。${risk('L2','抄表任务与照片/定位/指数为样例数据，接入云知水后替换')}</div></div>`;
    const headers=['任务编号','表卡编码','经营单位','期次','抄表方式','抄表员','应抄日期','状态','到位','照片合规','识别指数差','远传推送'];
    setTable('meterPanel','readTaskRecords',headers,tasks.map(t=>[t.id,t.card,t.company,t.period,t.method,t.assignedReader,t.dueDate,t.status,t.arrived==null?'—':(t.arrived?'到位':'不到位'),t.photoCompliant==null?'—':(t.photoCompliant?'合规':'不合规'),t.ocrDiff==null?'—':String(t.ocrDiff),t.remotePushed==null?'—':(t.remotePushed?'已推送':'未推送')]));return;
   }
   if(tab==='ledger'){setTable('meterPanel','meterLedger',meterHeaders,meterRows(search(scoped('meterInventory',WB.state,false))));return;}
   if(tab==='swap'){setTable('meterPanel','swapLedger',swapHeaders,swapRows(search(scoped('meterEvents')),WB.state.swapN||2));return;}
   if(tab==='warehouse'){
    const inventory=scoped('meterInventory',WB.state,false),warehouses=search(list('warehouses').filter(w=>!WB.state.company||w.company===WB.state.company)).filter(w=>!WB.state.admin&&!WB.state.org&&!WB.state.nature&&!WB.state.industry&&!WB.state.caliberMm&&!WB.state.meterType&&!WB.state.functional||inventory.some(m=>m.company===w.company&&(m.warehouse===w.id||m.warehouse===w.name)));
    setTable('meterPanel','warehouseLedger',['仓库编码','仓库名称','经营单位','仓库类型','当前筛选台账水表数'],warehouses.map(w=>[w.id,w.name,w.company,w.type,inventory.filter(m=>m.company===w.company&&(m.warehouse===w.id||m.warehouse===w.name)).length]));return;
   }
   if(tab==='booklet'){
    const groups=new Map();search(filteredUsers()).forEach(u=>{const key=[u.company,u.org,u.line,u.booklet].join('|');if(!groups.has(key))groups.set(key,{u,count:0});groups.get(key).count++;});
    setTable('meterPanel','bookletLedger',['经营单位','站点 / 所 / 网格','线路','册本','当前档案户数','抄表周期','调整记录'],[...groups.values()].map(({u,count})=>[u.company,u.org,u.line,u.booklet,count,null,null]));return;
   }
   if(tab==='evidence'){
    const tasks=search(scoped('readTasks'));
    const headers=['任务编号','表卡编码','经营单位','组织','期次','抄表方式','抄表员','问题类型','详情'];
    const photo=tasks.filter(t=>t.method!=='远传'&&t.photoCompliant===false);
    const loc=tasks.filter(t=>t.method!=='远传'&&t.arrived===false);
    const idx=tasks.filter(t=>t.ocrDiff!=null&&t.ocrDiff>0);
    const rowsOf=(list,type,detail)=>list.map(t=>[t.id,t.card,t.company,t.org,t.period,t.method,t.assignedReader,type,detail]);
    const EVIDENCE_PAGE=20;
    const block=(key,title,sub,rows,emptyTitle,emptyDesc)=>{
      if(!rows.length)return `<section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">${esc(title)}</h2><div class="card-subtitle">${esc(sub)}</div></div><div class="card-head-actions"><span class="badge gray">正常</span></div></div><div class="card-body"><div class="empty"><div class="empty-title">${esc(emptyTitle)}</div><div class="empty-description">${esc(emptyDesc)}</div></div></div></section>`;
      const expanded=!!evidenceExpanded[key];
      const shown=expanded?rows:rows.slice(0,EVIDENCE_PAGE);
      const more=rows.length>EVIDENCE_PAGE
        ? `<div class="evidence-more"><span class="muted">共 ${rows.length} 条，当前显示 ${shown.length} 条</span><button type="button" class="btn xs" data-evidence-more="${esc(key)}">${expanded?'收起':'显示全部 '+rows.length+' 条'}</button></div>`
        : '';
      return `<section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">${esc(title)}</h2><div class="card-subtitle">${esc(sub)}</div></div><div class="card-head-actions"><span class="badge orange">异常 ${rows.length} 条</span></div></div><div class="card-body">${V.table('ev'+key,headers,shown.map(cells=>cells.map(cell=>esc(text(cell)))))}${more}</div></section>`;
    };
    document.getElementById('meterPanelTitle').textContent='照片 / 定位 / 指数异常';
    document.getElementById('meterSummary').innerHTML=`<div class="card-body"><div class="notice">照片合规、抄表定位与识别指数按<b>抄表任务</b>样例数据计算（手机抄表任务才有照片/定位）。${risk('L2','照片/定位/OCR 为样例任务，接入云知水后替换')}</div></div>`;
    const all=[...rowsOf(photo,'照片不合规','照片判读不通过'),...rowsOf(loc,'定位不一致','抄表定位超出阈值'),...rowsOf(idx,'指数差异','识别指数与开账指数不一致')];
    WB.currentTable={headers,rows:all};
    document.getElementById('meterPanel').innerHTML=block('photo','照片合规与识别','拍照不符合、照片缺失、AI 识别指数差异',rowsOf(photo,'照片不合规','照片判读不通过'),'照片全部合规','当前范围没有照片不合规任务。')+block('loc','抄表定位','手机抄表定位与装表地址距离校验',rowsOf(loc,'定位不一致','抄表定位超出阈值'),'定位全部一致','当前范围没有定位异常任务。')+block('idx','指数一致性','手机/远传读数与营收开账指数差异',rowsOf(idx,'指数差异','识别指数与开账指数不一致'),'指数全部一致','当前范围没有指数差异任务。');
    return;
   }
   setTable('meterPanel','remoteLedger',['表卡编码','采集编号','采集日期','累计水量(m³)','日用水量(m³)','压力(MPa)','最近通信时间'],search(scoped('remoteReadings')).map(r=>[r.card,r.id,r.date,r.totalFlux,r.useFlux,r.pressure,r.lastCommunication]));
  }
  const METER_CHART_IDS=['C-MET-01','C-MET-02','C-MET-03','C-MET-04','C-MET-05','C-MET-06','C-MET-07'];
  function disposeMeterCharts(){
    METER_CHART_IDS.forEach(id=>{const entry=E.charts.get(id);if(entry){try{entry.chart.dispose();}catch(error){}E.charts.delete(id);}});
  }
  function mountCharts(){
    const host=document.getElementById('meterCharts');if(!host)return;
    let defs=[];
    if(tab==='quality')defs=[rateDef,ledgerDef];
    else if(tab==='ledger')defs=[ledgerDef,meterPieDef];
    else if(tab==='swap')defs=[swapStackDef,swapRingDef];
    else if(tab==='warehouse')defs=[warehouseBarDef,warehousePieDef];
    else defs=[rateDef,ledgerDef];
    disposeMeterCharts();
    host.innerHTML=defs.map(def=>E.chartCard(def)).join('');
    defs.forEach(def=>E.registerChart(def.id,def.id,def));
  }
  return{html,mount(){panel();mountCharts();document.querySelectorAll('[data-meter]').forEach(b=>b.onclick=()=>{tab=b.dataset.meter;meterTab=tab;document.querySelectorAll('[data-meter]').forEach(x=>x.classList.toggle('active',x===b));panel();mountCharts();});document.getElementById('meterPanel').addEventListener('click',event=>{
     const more=event.target.closest('[data-evidence-more]');if(!more)return;
     const key=more.dataset.evidenceMore;evidenceExpanded[key]=!evidenceExpanded[key];panel();
    });
    document.getElementById('meterQuery').oninput=e=>{query=e.target.value.trim();panel();};document.getElementById('swapN').value=String(WB.state.swapN||2);document.getElementById('swapN').onchange=e=>{WB.state.swapN=+e.target.value;panel();};WB.subscribe(panel);}};
 };
 B.renderProject=function(){
  let tab='ledger',stage='',registration='';
  const all=()=>scoped('projects',WB.state,false);
  const projects=()=>all().filter(p=>(!stage||p.stage===stage)&&(!registration||p.registered===(registration==='yes')));
  const tabs=[['ledger','工程台账'],['nodes','节点时效'],['unregistered','未立户核查']];
  const html=`<div class="notice">工程项目与未立户监管为完整功能演示：节点停留天数、超期与未立户核查按样例时间字段计算；报装链路与判定规则待源系统确认。${risk('L2','工程节点时间字段为样例；违规立户判定规则待甲方确认')}</div>
   <section id="projectKpis" class="kpi-grid six"></section>
   <section class="card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">工程项目督查</h2><div class="card-subtitle">工程台账、节点时效与未立户核查</div></div>
     <div class="card-head-actions"><select id="projectStage" class="control compact" aria-label="工程节点"><option value="">全部节点</option>${options(list('projects').map(p=>p.stage))}</select><select id="projectRegistration" class="control compact" aria-label="立户状态"><option value="">全部立户状态</option><option value="yes">已立户</option><option value="no">未立户</option></select></div></div>
     <div class="tabs" role="tablist" aria-label="工程视图">${tabs.map(([key,label],index)=>`<button type="button" role="tab" data-project-tab="${key}" class="${index===0?'active':''}" aria-selected="${index===0}">${label}</button>`).join('')}</div>
     <div id="projectPanel"></div></section>`;
  function drawKpis(){
   const rows=all(),completed=rows.filter(p=>p.completed),registered=rows.filter(p=>p.registered),unregistered=rows.filter(p=>p.completed&&!p.registered),overdue=rows.filter(p=>p.overdue&&!p.completed);
   document.getElementById('projectKpis').innerHTML=V.card('工程总数',String(rows.length),'个','当前范围',"project")+V.card('在建工程',String(rows.filter(p=>!p.completed).length),'个','未完工',"clipboard",'orange')+V.card('已完工',String(completed.length),'个','已完成施工',"checkCircle",'green')+V.card('已立户',String(registered.length),'个','完成立户',"users",'green')+V.card('完工未立户',String(unregistered.length),'个','需核查',"alert",'orange')+V.card('节点超期',String(overdue.length),'个','停留超过计划天数',"clock",'red');
  }
  function openDetail(p){
   const events=Array.isArray(p.timeline)?p.timeline:[];
   S().openDrawer({title:`${text(p.name)} · 工程源记录`,subtitle:`${text(p.id)}｜${text(p.company)}`,body:kv([['项目名称',p.name],['工程编号',p.id],['地址',p.address],['当前节点',p.stage],['进入节点时间',p.stageAt],['节点停留(天)',p.nodeDays],['计划停留(天)',p.plannedNodeDays],['是否超期',bool(p.overdue)],['施工单位',p.constructionUnit],['审批状态',p.approvalStatus],['是否完工',bool(p.completed)],['是否装表',bool(p.installed)],['是否立户',bool(p.registered)],['水表编号',p.meterId],['条形码',p.barcode],['口径',p.caliber],['远传水量(m³)',p.remoteVol],['远传上传',bool(p.remoteUploaded)]])+(events.length?V.table('projectTimeline',['时间','节点'],events.map(item=>[text(item.time),text(item.event)])):emptyBlock('暂无节点事件','未提供报装流程节点事件。'))});
  }
  function ledger(){
   const rows=projects();
   setTable('projectPanel','projectLedger',projectHeaders,projectRows(rows),i=>`<button class="btn xs" data-project-detail="${esc(rows[i].id)}">源记录</button>`);
   document.querySelectorAll('[data-project-detail]').forEach(button=>button.onclick=()=>{const row=rows.find(item=>item.id===button.dataset.projectDetail);if(row)openDetail(row);});
  }
  function nodes(){
   const rows=projects(),stages=['报装受理','工程施工','表务检定','待立户'];
   const summary=stages.map(name=>{const items=rows.filter(p=>p.stage===name);const overdue=items.filter(p=>p.overdue);const avg=items.length?items.reduce((total,p)=>total+p.nodeDays,0)/items.length:null;const max=items.length?Math.max(...items.map(p=>p.nodeDays)):null;return [name,items.length,avg==null?'—':fmt(avg,1),overdue.length,items.length?fmt(overdue.length/items.length*100,1)+'%':'—',max==null?'—':max];});
   const overdueRows=rows.filter(p=>p.overdue&&!p.completed).sort((a,b)=>b.nodeDays-a.nodeDays).map(p=>[p.id,p.name,p.company,p.stage,p.nodeDays,p.plannedNodeDays,p.nodeDays-p.plannedNodeDays,p.stageAt]);
   WB.currentTable={headers:['当前节点','工程数','平均停留(天)','超期数','超期率','最长停留(天)'],rows:summary.map(row=>row.slice())};
   document.getElementById('projectPanel').innerHTML=`<div class="special-block"><h4>各节点停留与超期</h4>${V.table('projectNodeSummary',['当前节点','工程数','平均停留(天)','超期数','超期率','最长停留(天)'],summary.map(row=>row.map(cell=>esc(text(cell)))))}</div><div class="special-block"><h4>超期工程清单（未完工）</h4>${overdueRows.length?V.table('projectOverdue',['工程编号','项目名称','经营单位','当前节点','停留(天)','计划(天)','超期(天)','进入节点'],overdueRows.map(row=>row.map(cell=>esc(text(cell))))):emptyBlock('暂无超期工程','当前范围工程节点均未超出计划停留天数。')}</div>`;
  }
  function unregistered(){
   const rows=projects(),pending=rows.filter(p=>p.completed&&!p.registered);
   const noMeter=pending.filter(p=>!p.installed),hasMeter=pending.filter(p=>p.installed);
   const registeredNoMeter=rows.filter(p=>p.registered&&!p.installed);
   const remoteMissing=pending.filter(p=>p.meterType==='远传表'&&p.installed&&!p.remoteUploaded);
   WB.currentTable={headers:['工程编号','项目名称','经营单位','当前节点','是否装表','水表编号','远传水量(m³)','远传上传','地址'],rows:pending.map(p=>[p.id,p.name,p.company,p.stage,bool(p.installed),p.meterId||'—',p.remoteVol,bool(p.remoteUploaded),p.address])};
   document.getElementById('projectPanel').innerHTML=`<div class="kpi-grid four special-kpis">${V.card('完工未立户',String(pending.length),'个','需核查',"alert",'orange')}${V.card('已装表未立户',String(hasMeter.length),'个','装表完成待立户',"clipboard")}${V.card('未装表已完工',String(noMeter.length),'个','需补装表',"meter",'red')}${V.card('已立户无表号',String(registeredNoMeter.length),'个','疑似违规立户',"alert",'red')}</div><div class="special-block"><h4>完工未立户清单</h4>${pending.length?V.table('projectPending',['工程编号','项目名称','经营单位','当前节点','是否装表','水表编号','远传水量(m³)','远传上传','地址'],pending.map(p=>[p.id,p.name,p.company,p.stage,bool(p.installed),p.meterId||'—',p.remoteVol,bool(p.remoteUploaded),p.address].map(cell=>esc(text(cell))))):emptyBlock('暂无完工未立户','当前范围已完工工程均已完成立户。')}</div><div class="notice">核查口径：已完工且未立户为重点；已装表未立户需跟踪立户；未装表已完工需补装；已立户但无表号列为疑似违规立户，需源系统核实（远传未上传 ${remoteMissing.length} 个）。${risk('L2','违规立户判定规则与报装链路待甲方确认')}</div>`;
  }
  function draw(){
   drawKpis();
   if(tab==='ledger')ledger();else if(tab==='nodes')nodes();else unregistered();
  }
  return{html,mount(){
   draw();
   document.querySelectorAll('[data-project-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.projectTab;document.querySelectorAll('[data-project-tab]').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-selected',String(item===button));});draw();});
   document.getElementById('projectStage').onchange=event=>{stage=event.target.value;draw();};
   document.getElementById('projectRegistration').onchange=event=>{registration=event.target.value;draw();};
  }};
 };
})();
