/* 异构组织演示：组织身份独立于显示名称；前端范围控制不替代生产后端鉴权。 */
window.WB_ORG=(()=>{
 const D=WB_DATA,nodes=new Map(),userNodes=new Map(),cards=new Map(),meters=new Map(),userObjects=new WeakMap();
 function add(id,name,type,parentId){if(nodes.has(id))return nodes.get(id);const parent=nodes.get(parentId);const n={id,name,type,parentId,children:[],path:[...(parent?.path||[]),id]};nodes.set(id,n);parent?.children.push(n);return n;}
 add('group','集团','集团',null);
 for(const c of D.companies)add('c'+c.id,c.name,'经营单位','group');
 for(const u of D.users){
  const c=D.companies.find(x=>x.id===u.companyId),unit='c'+c.id+'-u'+c.units.indexOf(u.org);
  add(unit,u.org,c.id===1?'营业所':c.id===3?'网格':'站点','c'+c.id);
  let leaf;
  if(c.id===1){const team=unit+'-t'+u.team;add(team,u.team,'班组',unit);const line=team+'-l'+u.line;add(line,u.line,'线路',team);leaf=line+'-b'+u.booklet;add(leaf,u.booklet,'册本',line);}
  else if(c.id===3){leaf=unit+'-s'+(Math.floor((u.id-1)/16)%4+1);add(leaf,'固定人员'+(Math.floor((u.id-1)/16)%4+1),'固定人员（册本）',unit);}
  else{leaf=unit+'-l'+u.line;add(leaf,u.line.replace('班组','组'),'线路',unit);}
  userObjects.set(u,leaf);userNodes.set(u.id,leaf);cards.set(u.unified_code,leaf);meters.set(u.meterId,leaf);
 }
 let authRoot='group';
 const within=(id,root)=>!!nodes.get(id)?.path.includes(root);
 const rowNode=row=>row.orgNodeId||userNodes.get(row.accountId??row.userId) ||cards.get(row.card||row.unified_code)||meters.get(row.meterId)|| userObjects.get(row);
 function allows(row,f=window.WB?.state||{}){const root=f.orgNodeId||authRoot;if(!within(root,authRoot))return false;const id=rowNode(row);if(id)return within(id,root)&&within(id,authRoot);if(root==='group'&&authRoot==='group')return true;const c=D.companies.find(c=>c.name===row.company);return !!c&&within('c'+c.id,root)&&within('c'+c.id,authRoot);}
 function resolve(f=WB.state){if(f.orgNodeId&&within(f.orgNodeId,authRoot))return nodes.get(f.orgNodeId);const c=D.companies.find(c=>c.name===f.company);let n=c?nodes.get('c'+c.id):nodes.get(authRoot);if(!within(n.id,authRoot))n=nodes.get(authRoot);if(f.org)n=n.children.find(x=>x.name===f.org)||n;return n;}
 function go(id){if(!within(id,authRoot))return WB.shell.toast('当前演示视角不能查看该组织');Object.assign(WB.state,{orgNodeId:id,company:'',org:'',team:'',line:''});WBApp.navigate('drill',{orgNodeId:id});}
 const presets=[{id:'group',label:'集团营销管理部'},...D.companies.map(c=>({id:'c'+c.id,label:c.name+'负责人'}))];
 for(const c of [1,3,4]){const n=nodes.get('c'+c).children[0];presets.push({id:n.id,label:n.name+'负责人'});if(c===3)presets.push({id:n.children[0].id,label:n.name+' / '+n.children[0].name});}
 function select(id){if(!nodes.has(id))return;authRoot=id;Object.assign(WB.state,{orgNodeId:id,company:'',org:'',team:'',line:'',admin:'',nature:'',industry:'',caliberMm:'',meterType:''});WB.engine.clearFactCache();WB.shell.closeLayers();go(id);}
 function mount(){const label=presets.find(p=>p.id===authRoot)?.label||'组织视角';const topName=document.getElementById('topbarUserName'),topRole=document.getElementById('topbarUserRole');if(topName)topName.textContent=label;if(topRole)topRole.textContent='组织范围演示';const host=document.getElementById('page');if(!host)return;const n=resolve();const bar=document.createElement('section');bar.className='v4-org-nav';bar.innerHTML='<label>登录视角（演示）<select id="orgRole" class="control">'+presets.map(p=>'<option value="'+WB.engine.esc(p.id)+'" '+(authRoot===p.id?'selected':'')+'>'+WB.engine.esc(p.label)+'</option>').join('')+'</select></label><div class="v4-org-path">'+n.path.slice(n.path.indexOf(authRoot)).map(id=>'<button class="btn text-btn" data-org-go="'+WB.engine.esc(id)+'">'+WB.engine.esc(nodes.get(id).name)+'</button>').join('<span>/</span>')+'</div><span class="muted">'+(n.children.length?'直属下级 '+n.children.length+' 个 · '+n.children[0].type:'已到末级 · 可查看本级业务明细')+'</span>';
 host.querySelector('.page-heading')?.after(bar);bar.querySelector('#orgRole').onchange=e=>select(e.target.value);bar.querySelectorAll('[data-org-go]').forEach(b=>b.onclick=()=>go(b.dataset.orgGo));
 }
 return{nodes,presets,userNodes,rowNode,within,allows,resolve,go,select,mount,get authRoot(){return authRoot;},children:()=>resolve().children,crumbs:()=>{const n=resolve();return n.path.slice(n.path.indexOf(authRoot)).map(id=>nodes.get(id).name);},childName:row=>{const id=rowNode(row),n=resolve();return n.children.find(c=>within(id,c.id))?.name||'未映射';}};
})();
