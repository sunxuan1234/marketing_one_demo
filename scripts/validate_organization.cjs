const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..');
const box={console,Map,Set,WeakMap,Date,Intl,URL,URLSearchParams,Blob,document:{addEventListener(){},getElementById(){return null;}},addEventListener(){}};box.window=box;vm.createContext(box);
for(const f of ['catalog','data','organization','engine'])vm.runInContext(fs.readFileSync(path.join(root,'assets',f+'.js'),'utf8'),box);
const {WB_DATA:D,WB_ORG:O,WB:W}=box,E=W.engine;
W.shell={toast(){},closeLayers(){}};box.WBApp={navigate(_id,params){Object.assign(W.state,params);}};
for(const u of D.users)assert(O.nodes.has(O.userNodes.get(u.id)));
const depths=new Map();for(const c of D.companies){const leaves=[...O.nodes.values()].filter(n=>!n.children.length&&O.within(n.id,'c'+c.id));depths.set(c.id,[...new Set(leaves.map(n=>n.path.length-1))]);}
assert.deepEqual(depths.get(1),[5]);for(const id of [2,3,4])assert.deepEqual(depths.get(id),[3]);
const all=E.aggregate(E.filterFacts({period:'当月',month:'2026-10'}));
let total=0;for(const c of D.companies){W.state.orgNodeId='c'+c.id;total+=E.aggregate(E.filterFacts({period:'当月',month:'2026-10'})).sold_vol;}
assert.equal(total,all.sold_vol);
const office=O.nodes.get('c1').children[0];O.select(office.id);
assert(E.filterFacts().length>0);assert(E.filterFacts().every(r=>O.within(O.rowNode(r),office.id)));
assert.equal(E.filterFacts({orgNodeId:'c3'}).length,0,'越权 URL 必须无数据');
assert.equal(O.allows(D.users.find(u=>u.companyId===3)),false);
const before=W.state.orgNodeId;O.go('group');assert.equal(W.state.orgNodeId,before,'不能返回权限根上级');
O.select('c3');const grid=O.children()[0];O.go(grid.id);assert.equal(O.children()[0].type,'固定人员（册本）');
const leaf=O.children()[0];O.go(leaf.id);assert.equal(O.children().length,0);assert(E.filterFacts().length>0);
O.select('group');assert.equal(E.aggregate(E.filterFacts({period:'当月',month:'2026-10'})).sold_vol,all.sold_vol,'切换视角不能污染缓存');
const result={result:'PASS',accounts:D.users.length,organizationNodes:O.nodes.size,depths:Object.fromEntries(depths),scopeIsolation:true,rollupReconciled:true,leafTermination:true,cacheIsolation:true};
fs.writeFileSync(path.join(root,'validation/organization-check.json'),JSON.stringify(result,null,2)+'\n');console.log(result);
