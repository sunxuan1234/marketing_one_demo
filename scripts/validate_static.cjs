#!/usr/bin/env node
/* V4 内容与离线不变量校验；从 V4 任意复制位置运行。 */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const index=read('index.html');
const resources=[...index.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m=>m[1].split('?')[0]);
for(const resource of resources){assert(!/^(?:https?:|\/|\.\.\/)/.test(resource),'入口依赖外部目录 '+resource);assert(fs.existsSync(path.join(root,resource)),'缺少资源 '+resource);}
assert(resources.includes('echarts.min.js'));
const sources=fs.readdirSync(path.join(root,'assets')).filter(f=>f.endsWith('.js')).map(f=>[f,read('assets/'+f)]);
for(const[name,source]of sources){new vm.Script(source,{filename:name});}
// V4：抄见率已按决策恢复（仅展示面，不编造数值），改校验臆造值不得回潮
for(const[name,source]of sources){if(name==='catalog.js')continue;assert(!/6\.8%|read_rate_pct|户·月/.test(source),'臆造/旧口径残留 '+name);}
// V4：风险提示组件必须在页面与业务代码中可用
assert(/v4-risk/.test(read('assets/views.js')),'视图缺少风险提示组件');
assert(/v4-risk/.test(read('assets/business.js')),'业务视图缺少风险提示组件');
assert(/riskBadge/.test(read('assets/app.js')),'页头缺少风险徽标');
assert(fs.existsSync(path.join(root,'assets/v4.css')),'缺少 v4.css');
assert(!read('assets/home.js').includes('esc(item.marker)'),'tooltip不应转义marker');
assert(!read('assets/app.js').includes('featureData('),'不得恢复通用功能假预览');
const document={addEventListener(){},querySelector(){return null;},getElementById(){return null;}};
const box={window:{},document,console,Intl,Map,Set,Date,URL,Blob,URLSearchParams};box.window=box;box.addEventListener=()=>{};
vm.createContext(box);for(const f of ['catalog','data','organization','engine','workflows'])vm.runInContext(read('assets/'+f+'.js'),box);
const {WB_DATA:D,WB:W,WB_CATALOG:C}=box,E=W.engine;
assert.equal(C.modules.filter(m=>!m.hidden).length,13,'侧栏可见模块应为13个（首页已合并指标管控）');assert(!C.modules.some(m=>m.id==='kpi'),'指标管控菜单应已合并');assert(C.modules.some(m=>m.id==='drill'&&m.hidden),'缺少隐藏下钻路由');assert(C.modules[0].id==='home','首页应为第一个模块');assert.equal(C.reports.length,21,'报表应为21张');assert(C.reports.some(r=>r.id==='P-RPT-009'),'缺少抄见率报表');assert(C.modules.some(m=>m.id==='auth')&&C.modules.some(m=>m.id==='set'),'缺少用户管理/系统设置模块');assert.equal(C.functions.length,0,'业务UI不再展示通用148项假承接');
assert.equal(D.isSourceFrozen,true);assert.equal(D.sourceWrite,false);assert.equal(D.collaborationEnabled,false);assert.equal(D.supplementEnabled,false);assert.equal(D.supplements.length,0);assert(D.dmaReadings.length>0,'DMA 逐时样例应有数据');assert(D.dmaNodes.length>0,'DMA 拓扑样例应有数据');assert.equal(D.forecasts.length,0,'预测结果仍为页面内演示计算，不落数据层');assert(D.readTasks.length>0,'抄表任务样例应有数据');
const current=E.aggregate(E.filterFacts({period:'当月',month:'2026-10'})),ytd=E.aggregate(E.filterFacts({period:'年内累计',month:'2026-10'}));
const active=D.users.filter(u=>u.regDate<='2026-10-31'&&(!u.deregisterDate||u.deregisterDate>'2026-10-31')).length;
assert.equal(current.registered_count,active);assert.equal(ytd.registered_count,active,'注册存量不得跨月累加');
assert.equal(current.new_count,D.users.filter(u=>u.regDate>='2026-09-26'&&u.regDate<='2026-10-25').length);
assert.equal(current.loss_rate_pct,null,'无供水映射不得推算产销差率');assert.equal(current.arrival_rate_pct,null);
const billAmount=D.bills.filter(b=>b.period==='2026-10').reduce((s,b)=>s+b.amount,0);assert(Math.abs(current.receivable_principal-billAmount)<0.01);
const userById=new Map(D.users.map(u=>[u.id,u]));
for(const r of D.readings){const u=userById.get(r.userId);assert(u);assert(r.date>=u.regDate);assert.equal(r.reading-r.lastReading,r.volume);assert.equal(r.billedVolume,r.volume);}
const vol2026=new Map();
for(const r of D.readings){if(!r.period.startsWith('2026'))continue;vol2026.set(r.userId,(vol2026.get(r.userId)||0)+r.volume);}
for(const u of D.users){assert.equal(u.yearVol,vol2026.get(u.id)||0);}
const v2Unchanged=null; // V4 独立交付，不依赖 V2/V3 运行
const result={result:'PASS',version:'v4',modules:C.modules.length,reports:C.reports.length,riskComponents:true,accountSamples:D.users.length,monthlyFacts:D.facts.length,monthEndRegistered:current.registered_count,ytdRegistered:ytd.registered_count,currentNew:current.new_count,standaloneResources:resources.length,sourceFrozen:D.isSourceFrozen,readOnlyBranches:true,stockNotSummedAcrossMonths:true,readingArithmetic:true,userAnnualVolumeReconciled:true,v2Unchanged};
fs.mkdirSync(path.join(root,'validation'),{recursive:true});fs.writeFileSync(path.join(root,'validation/static-check.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
