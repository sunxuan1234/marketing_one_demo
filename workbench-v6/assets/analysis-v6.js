/* 营销一体化 V6 · 指标分析下钻（九组双框架）。
 * 权威口径：需求说明10.29-修正.xlsx 第二sheet「Sheet1 (2)」。
 * 同页全部真实组织层级 + 维度；组织/期间/对象共用上下文；主分析整框，
 * 可增第二个整框（默认共享组织/期间/对象，独立组+维度，可移除/导出）。
 * 计算复用 WB.engine 聚合/过滤；权限复用 WBAccess；组织复用 WBOrg。
 * 空态：未绑定/越权/缺数/零/不适用/超历史/牟新西区预留 严格区分，缺失同期不按0。 */
(function () {
  'use strict';
  const E = window.WB.engine;
  const Org = () => window.WBOrg;
  const A = () => window.WBAccess;
  const D = () => window.WB_DATA;
  const shell = () => window.WB.shell;
  const esc = E.esc;

  /* ---------- 组织上下文 ---------- */
  const nodeIdsCache = new Map();
  function nodeIdsOf(node) {
    if (!node) return new Set();
    if (nodeIdsCache.has(node.id)) return nodeIdsCache.get(node.id);
    const set = Org().descendantsSet(node.id);
    nodeIdsCache.set(node.id, set);
    return set;
  }
  function effectiveNode() {
    const org = Org();
    const id = window.WB.state.orgNodeId;
    if (id && org.has(id)) return org.get(id);
    const roots = A().current().scope.roots || [];
    if (roots.length === 1) return org.get(roots[0]);
    if (roots.length > 1) {
      let anc = org.get(roots[0]);
      while (anc && !roots.every(r => nodeIdsOf(anc).has(r))) anc = org.parent(anc.id);
      return anc || org.get(org.ROOT_ID);
    }
    return org.get(org.ROOT_ID);
  }
  function levelChildren(node) { return node ? Org().children(node.id) : []; }
  function lossApplicable(node) { return !!node && (node.type === 'group' || node.type === 'company'); }
  function inScopeNode(id) {
    if (!id) return true;
    const cur = A().current();
    if (cur.rangeStatus === 'unbound') return false;
    return cur.scope.nodeIds.has(id);
  }
  function filters() { return Object.assign({}, window.WB.state, shell().currentFilters()); }
  let factsCache = { key: '', rows: [] };
  function facts(f) {
    f = f || filters();
    const key = A().current().scopeVersion + '|' + JSON.stringify(f);
    if (factsCache.key === key) return factsCache.rows;
    const rows = E.filterFacts(f);
    factsCache = { key, rows };
    return rows;
  }
  function scoped(name) { return E.scopedRows(name); }

  /* ---------- 原型模拟数据（WBPrototypeData）：仅补充缺源分析项，不改 WB_DATA ---------- */
  function P() { return window.WBPrototypeData || null; }
  const PROTO_TARGET_IDS = new Set(['sold.scaleIndustry', 'sold.community', 'sold.policyIndustry', 'reg.caliberChange', 'meter.unreg', 'meter.warehouse', 'meter.bookAdjust', 'meter.bookNew', 'meter.remoteBill', 'meter.unpushedDetails', 'alert.remoteIdx', 'alert.remoteVol', 'alert.remoteComm', 'alert.adjVol', 'alert.adjPrice', 'alert.adjPenalty']);
  const PROTO_EVENT_IDS = new Set(['reg.caliberChange', 'meter.bookAdjust', 'meter.bookNew', 'meter.remoteBill', 'meter.unpushedDetails', 'meter.unreg', 'meter.warehouse', 'alert.remoteIdx', 'alert.remoteVol', 'alert.remoteComm', 'alert.adjVol', 'alert.adjPrice', 'alert.adjPenalty']);
  const PROTO_COHORT_IDS = { 'sold.scaleIndustry': 'scale', 'sold.policyIndustry': 'policy', 'sold.community': 'community' };
  function protoMeta() { const p = P(); return p && p.meta ? p.meta : null; }
  function protoLabel() { const m = protoMeta(); return (m && m.label) || '原型模拟数据（非真实接入）'; }
  function protoAssumptions() { const m = protoMeta(); return m && Array.isArray(m.assumptions) ? m.assumptions : []; }
  function protoList(name) { const p = P(); const list = p && p[name]; return Array.isArray(list) ? list : []; }
  function protoOwns(row) { return !!(row && A().ownsRow(row)); }
  function protoNodeOk(row) { return !!(row && row.orgNodeId && nodeIdsOf(effectiveNode()).has(row.orgNodeId)); }
  function protoNodeRows(name) { return protoList(name).filter(r => protoOwns(r) && protoNodeOk(r)); }
  function eligibleUsers(f) {
    const fs = facts(f); const ids = new Set(); const codes = new Set();
    fs.forEach(r => { if (r.seriesKey != null) ids.add(String(r.seriesKey)); if (r.accountId != null) codes.add(String(r.accountId)); });
    const map = new Map();
    scoped('users').forEach(u => { if ((ids.has(String(u.id)) || codes.has(String(u.unified_code))) && protoOwns(u) && protoNodeOk(u)) map.set(String(u.id), u); });
    return map;
  }
  function protoUserOf(row, eligible) {
    if (!row) return null;
    if (row.userId != null && eligible.has(String(row.userId))) return eligible.get(String(row.userId));
    if (row.accountId != null) { for (const u of eligible.values()) if (String(u.unified_code) === String(row.accountId)) return u; }
    return null;
  }
  function protoPeriodOf(row) { return row.period || String(row.effectiveAt || row.eventAt || row.openedAt || row.dueAt || '').slice(0, 7); }
  function protoInPeriods(row, ps) { const m = protoPeriodOf(row); return !!m && ps.has(m); }
  function protoValidForPeriod(row, period) {
    if (!period) return true;
    const from = row.validFrom ? String(row.validFrom).slice(0, 7) : null;
    const to = row.validTo ? String(row.validTo).slice(0, 7) : null;
    return (!from || from <= period) && (!to || to >= period);
  }
  function protoValidIn(row, ps) { for (const p of ps) if (protoValidForPeriod(row, p)) return true; return false; }
  function protoUserRows(name, f, opts) {
    opts = opts || {}; const ps = new Set(E.periods(f)); const eligible = eligibleUsers(f);
    const rows = []; const consumedFacts = []; const factsByUser = new Map();
    protoList(name).forEach(r => {
      if (!protoOwns(r) || !protoNodeOk(r)) return;
      const u = protoUserOf(r, eligible); if (!u) return;
      if (opts.period && !protoInPeriods(r, ps)) return;
      if (opts.valid && !protoValidIn(r, ps)) return;
      rows.push(r);
    });
    if (opts.facts) {
      const ids = new Set(rows.map(r => String(protoUserOf(r, eligible).id)));
      facts(f).forEach(fr => { const u = protoUserOf(fr, eligible); if (u && ids.has(String(u.id))) { consumedFacts.push(fr); const key = u.id; if (!factsByUser.has(key)) factsByUser.set(key, []); factsByUser.get(key).push(fr); } });
    }
    return { rows, eligible, consumedFacts, factsByUser, periods: ps };
  }
  function protoEventAt(row) { return String(row.eventAt || row.effectiveAt || row.openedAt || row.dueAt || '').slice(0, 10); }
  function protoAtOrBefore(row, end) { const d = protoEventAt(row); return !!d && d <= end; }
  function protoStatusOf(row) { return row.status || '—'; }
  function protoInStockStatus(status) { return status === '在库' || status === '调拨入库' || status === '报废入库'; }
  function protoOutStatus(status) { return status === '已出库' || status === '调拨出库'; }
  function protoDueTs(row) { return Date.parse(row.dueAt || (protoPeriodOf(row) + '-01T00:00:00')); }
  function protoPushTs(row) { return row.pushedAt ? Date.parse(row.pushedAt) : NaN; }
  function protoPushState(row) {
    const due = protoDueTs(row); const push = protoPushTs(row);
    if (!isFinite(push)) return { state: '缺失', reason: '截至查询期末未收到远传推送记录' };
    if (isFinite(due) && push > due) return { state: '延迟', reason: '推送时间 ' + String(row.pushedAt).slice(0, 10) + ' 晚于应推送时间 ' + String(row.dueAt || '').slice(0, 10) };
    return { state: '正常', reason: '按期推送' };
  }
  function protoChildBuckets(rows) {
    const node = effectiveNode(); const kids = levelChildren(node);
    if (!kids.length) return [{ name: node ? node.name : '当前范围', nodeId: node ? node.id : null, rows: rows.slice() }];
    const owner = new Map(); kids.forEach(k => nodeIdsOf(k).forEach(id => owner.set(id, k)));
    const buckets = kids.map(k => ({ name: k.name, nodeId: k.id, rows: [] })); const byId = new Map(buckets.map(b => [b.nodeId, b]));
    rows.forEach(r => { const k = owner.get(r.orgNodeId); if (k) byId.get(k.id).rows.push(r); });
    return buckets;
  }
  function roleLabel(role) { return role === 'ASSESSMENT' ? '考核总表' : role === 'DIRECT' ? '直供表' : role === 'SECONDARY' ? '二次加压表' : (role || '—'); }
  function protoCohortCodes(item, f) {
    const eligible = eligibleUsers(f); const ps = new Set(E.periods(f));
    const codes = new Set();
    const add = r => { const u = protoUserOf(r, eligible); if (u && u.unified_code != null) codes.add(u.unified_code); };
    if (item.id === 'sold.scaleIndustry') protoList('scaleRoster').filter(r => protoOwns(r) && protoNodeOk(r) && protoValidIn(r, ps)).forEach(add);
    else if (item.id === 'sold.policyIndustry') protoList('policyMembership').filter(r => protoOwns(r) && protoNodeOk(r) && protoValidIn(r, ps)).forEach(add);
    else if (item.id === 'sold.community') protoList('communityMeterLinks').filter(r => protoOwns(r) && protoNodeOk(r) && (r.role === 'DIRECT' || r.role === 'SECONDARY')).forEach(add);
    return codes;
  }
  function markProto(r, item) {
    if (!PROTO_TARGET_IDS.has(item.id)) return r;
    if (PROTO_EVENT_IDS.has(item.id)) { r.rankingApplicable = false; r.rankingCohort = null; }
    else if (PROTO_COHORT_IDS[item.id]) { r.rankingApplicable = true; r.rankingCohort = PROTO_COHORT_IDS[item.id]; }
    if (!protoMeta()) return r;
    r.synthetic = true; r.sourceLabel = protoLabel(); r.prototypeAssumptions = protoAssumptions(); r.prototypeRows = (r.sourceRows || []).length;
    const tag = '数据来源：' + r.sourceLabel + '。' + (r.prototypeAssumptions.length ? '原型假设：' + r.prototypeAssumptions.join('；') + '。' : '');
    r.note = (r.note ? r.note + ' ' : '') + tag;
    if (r.totalsNote) r.totalsNote = r.totalsNote + ' ' + tag;
    return r;
  }

  /* ---------- 指标显示 ---------- */
  const METRICS = {
    sold_vol: { label: '售水量', unit: '万m³', dec: 2, get: a => a.sold_vol == null ? null : a.sold_vol / 10000 },
    sold_raw: { label: '售水量', unit: 'm³', dec: 0, get: a => a.sold_vol },
    registered_count: { label: '注册用户数', unit: '户', dec: 0, get: a => a.registered_count },
    new_count: { label: '新增用户', unit: '户', dec: 0, get: a => a.new_count },
    closed_count: { label: '注销用户', unit: '户', dec: 0, get: a => a.closed_count },
    receivable: { label: '应收水费', unit: '元', dec: 2, get: a => a.receivable_principal },
    received: { label: '实收水费', unit: '元', dec: 2, get: a => a.received_principal },
    arrears: { label: '欠费金额', unit: '元', dec: 2, get: a => a.arrears_principal },
    charge_rate: { label: '收费率', unit: '%', dec: 2, get: a => a.charge_rate_pct },
    avg_price: { label: '售水均价', unit: '元/m³', dec: 3, get: a => a.avg_price_yuan },
    loss_rate: { label: '产销差率', unit: '%', dec: 2, get: a => a.loss_rate_pct },
    supply_vol: { label: '供水量', unit: '万m³', dec: 2, get: a => a.supply_vol == null ? null : a.supply_vol / 10000 },
    plan_vol: { label: '计划水量', unit: '万m³', dec: 2, get: a => a.plan_vol == null ? null : a.plan_vol / 10000 },
    plan_pct: { label: '计划完成率', unit: '%', dec: 2, get: a => a.plan_completion_pct },
    yoy: { label: '同比', unit: '%', dec: 2, get: a => a.yoy_growth_pct }
  };
  const DIM_LABELS = {
    children: '下级横评', company: '经营单位', org: '组织节点', admin: '行政区',
    nature: '用水性质', industry: '行业', caliber: '水表口径', meterType: '水表类型',
    team: '班组', line: '线路', community: '小区', collection: '抄表到户', wholesale: '趸售标志', installYear: '安装年份', manufacturer: '水表厂家'
  };
  const DIM_FIELD = {
    company: 'company', org: 'org', admin: 'admin', nature: 'nature', industry: 'industry',
    caliber: 'caliber', meterType: 'meterType', team: 'team', line: 'line', community: 'community', manufacturer: 'manufacturer'
  };

  /* ---------- 分组与条目（名称取自 sheet2 原文） ---------- */
  const NATURE_NOTE = '居民阶梯、居民非阶梯（4.4元）、居民非阶梯（4.5元）、非居民用水、特行用水；趸售水量自动生成可人工修改。源实际仅居民非阶梯4.4元一档，4.5元档与趸售标志未提供，缺数不补0。';
  const GROUPS = [
    { id: 'sold', name: '售水量分析', tool: null, items: [
      { id: 'sold.cum5', label: '集团和各区域近5年年度累计售水量对比', type: 'trend', gran: 'year', period: '近5年', metrics: ['sold_vol'], dims: ['children'] },
      { id: 'sold.planGroup', label: '集团售水量计划指标、累计完成情况（同比、环比、计划比）', type: 'total', metrics: ['sold_vol', 'plan_vol', 'plan_pct', 'yoy'], dims: ['children'] },
      { id: 'sold.planRegion', label: '各供水区域售水量计划指标、累计完成情况（同比、环比、计划比）', type: 'agg', metrics: ['sold_vol', 'plan_vol', 'plan_pct', 'yoy'], dims: ['children', 'company'] },
      { id: 'sold.nature', label: '按用水性质分析', type: 'agg', metrics: ['sold_vol'], dims: ['nature', 'children'], note: NATURE_NOTE },
      { id: 'sold.newNature', label: '新增用户按用水性质分析', type: 'newCohort', metrics: ['new_count'], dims: ['nature', 'children', 'admin', 'industry', 'community', 'collection'], note: NATURE_NOTE },
      { id: 'sold.closedNature', label: '注销用户按用水性质分析', type: 'closedCohort', metrics: ['closed_count'], dims: ['nature', 'children', 'admin', 'industry', 'community', 'collection'], note: NATURE_NOTE },
      { id: 'sold.industry', label: '行业用水分析', type: 'agg', metrics: ['sold_vol', 'yoy'], dims: ['industry', 'children'], note: '居民用水、商业用水、教学用水、工业用水、物业绿化、市政取水、行政事业、医院、饭店酒店（累计、同比、环比）。源按12行业展示，9类正式映射待提供，不擅自归并。' },
      { id: 'sold.scaleIndustry', label: '规模以上企业按行业进行水量分析', type: 'scale', metrics: ['sold_vol', 'yoy'], dims: ['industry'], note: '累计、同比、环比。规模以上按原型显式名单（scaleRoster）×户号×有效期判定，非水量阈值、非行业代理。' },
      { id: 'sold.bigUser', label: '大用户用水分析（100m³以上）', type: 'bigUser', metrics: ['sold_raw'], dims: ['children'], note: '月用100m³以上用户集合（累计、同比）；与月均100m³集合区分。' },
      { id: 'sold.community', label: '高层二次加压以前，多层直供用水量与小区关联', type: 'community', metrics: ['sold_vol'], dims: ['community', 'children'], note: '小区考核总表→关联用户直供表/二次加压表按原型关联明细统计；仅纳入当前筛选命中用户，部分筛选不泄漏整个小区水量。' },
      { id: 'sold.policyIndustry', label: '涉及水价优惠政策用户用水量按行业代码统计', type: 'policyIndustry', metrics: ['sold_vol'], dims: ['industry'], note: '按原型优惠政策成员名单×户号×有效期判定后按行业代码汇总，不以行业代码代理优惠政策用户。' },
      { id: 'sold.swapWeekly', label: '周检换表换表前后2个周期（可调整）水量对比分析（报表）', type: 'swapVolume', swap: '周检换表', metrics: [], dims: ['children'], note: '换表前后各取N个周期水量均值对比（N仅2/3，默认2，与报表P-RPT-004同参数）；同期缺数不按0。' },
      { id: 'sold.swapFault', label: '故障换表换表前后2个周期（可调整）水量', type: 'swapVolume', swap: '故障换表', metrics: [], dims: ['children'], note: '换表前后各取N个周期水量均值对比（N仅2/3，默认2，与报表P-RPT-005同参数）；同期缺数不按0。' },
      { id: 'sold.changeRank', label: '用户水量变化排序（80/20规则）', type: 'changeRank', metrics: ['sold_vol'], dims: ['children', 'line'], note: '按变化绝对值升/降分别排序，K80达到该方向80%、K20=ceil(0.2N)取小；N为可比较用户（含0变化、缺基期排除）；显示实际覆盖率，可不足80%。' },
      { id: 'sold.adminWater', label: '各行政区域用水分析（水量与注册占比）', type: 'adminWater', metrics: ['sold_vol'], dims: ['admin', 'children'], note: '行政区域售水量、注册用户数及占比；行政区映射为示意。' },
      { id: 'sold.bigUserAvg', label: '月均用水100m³以上用户集合', type: 'bigUserAvg', metrics: ['sold_raw'], dims: ['children'], note: '所选期间月均用水100m³以上（累计÷月数）；与月用100m³集合区分，分母月份按实际有数月份。' },
      { id: 'sold.bigUserSummary', label: '集团重点用户用水分析（月用100m³以上/以内户数与水量占比）', type: 'bigUserSummary', metrics: ['sold_raw'], dims: ['children'], note: '按区域统计月用100m³以上与以内用户的户数、水量及占比；与月均100m³集合区分。' },
      { id: 'sold.syncYear', label: '同步年分析', type: 'syncYear', period: '近5年', metrics: ['sold_vol'], dims: ['children'], note: '各年同一月份与当年1月至该月累计售水量对比；数据范围外年份缺数不按0，不以全年水量代理同月。' }
    ] },
    { id: 'reg', name: '注册用户分析', tool: 'user', items: [
      { id: 'reg.total', label: '总注册用户', type: 'agg', metrics: ['registered_count'], dims: ['children', 'nature', 'collection', 'admin', 'industry', 'caliber', 'community'], note: '按各供水区域和集团注册用户数量及占比。' },
      { id: 'reg.new', label: '新增用户', type: 'agg', metrics: ['new_count'], dims: ['children', 'nature', 'collection', 'admin', 'industry', 'caliber', 'community'] },
      { id: 'reg.closed', label: '注销用户', type: 'agg', metrics: ['closed_count'], dims: ['children', 'nature', 'collection', 'admin', 'industry', 'caliber', 'community'] },
      { id: 'reg.syncYear', label: '同步年分析', type: 'trend', gran: 'year', period: '近5年', metrics: ['registered_count', 'new_count', 'closed_count'], dims: ['children'] },
      { id: 'reg.newCohort', label: '新增用户同批水量分析（自然月立户）', type: 'newCohort', metrics: ['new_count'], dims: ['children', 'nature', 'admin', 'industry', 'community', 'collection'], note: '按自然月立户时间确定同批新增用户，统计该批用户在所选期间的水量（非全部用户水量）；采用最新调整后结算。' },
      { id: 'reg.closedCohort', label: '注销用户同批水量对比（上年全年 vs 注销当年1月1日至注销日）', type: 'closedCohort', metrics: ['closed_count'], dims: ['children', 'nature', 'admin', 'industry', 'community', 'collection'], note: '逐户截断后汇总：上年全年 vs 注销当年1月1日至各自注销日，起止不等长不年化；日粒度不可得时说明实际精度，不编造月内拆分；注销日早于立户日为无效日期单列。' },
      { id: 'reg.unreg', label: '未注册用户数（人工填报，末月存量）', type: 'unregStock', metrics: [], dims: ['children', 'company'], note: '末月存量不累加；由分公司领导/分公司管理员按绑定单位填报，缺数不按0；与「未抄表到户」区分。' },
      { id: 'reg.caliberChange', label: '水表口径变更统计', type: 'caliberChange', metrics: [], dims: ['children'], note: '按原型口径变更事件（变更前后口径+生效日期）统计；不绑定 P-RPT-015（口径变更≠用水性质变更）。' }
    ] },
    { id: 'loss', name: '产销差率分析', tool: null, loss: true, items: [
      { id: 'loss.group10', label: '集团近10年产销差率当月和累计指标对比', type: 'loss10', period: '近10年', metrics: ['loss_rate', 'supply_vol', 'sold_vol'], dims: ['children'], note: '各年按所选月份同月与当年累计分别取真实供售水量；供水量手动填报须单位×月齐备，缺数不按0。' },
      { id: 'loss.region10', label: '各区域近10年产销差率当月和累计指标对比', type: 'loss10', period: '近10年', metrics: ['loss_rate', 'supply_vol', 'sold_vol'], dims: ['children', 'company'], note: '各区域各年按所选月份同月与当年累计分别取真实供售水量；不十年汇成单行，缺数不按0。' },
      { id: 'loss.groupMonth', label: '集团当月产销差率', type: 'total', period: '当月', metrics: ['loss_rate', 'supply_vol', 'sold_vol', 'plan_pct'], dims: ['children'], note: '计划指标、每月完成情况（同比、环比、计划比）；自动生成可人工修改，设置填报变化分析原因。' },
      { id: 'loss.groupCum', label: '集团累计产销差率', type: 'total', metrics: ['loss_rate', 'supply_vol', 'sold_vol', 'plan_pct'], dims: ['children'], note: '计划指标、累计完成情况（同比、环比、计划比）；自动生成可人工修改，设置填报变化分析原因。' },
      { id: 'loss.regionMonth', label: '各供水区域当月产销差率', type: 'agg', period: '当月', metrics: ['loss_rate', 'supply_vol', 'sold_vol'], dims: ['children', 'company'], note: '各区域当月供售水量与产销差率；供水量按绑定单位手动填报口径，集团缺月则缺数。' },
      { id: 'loss.regionCum', label: '各供水区域累计产销差率', type: 'agg', metrics: ['loss_rate', 'supply_vol', 'sold_vol'], dims: ['children', 'company'], note: '各区域累计供售水量与产销差率；供水量按绑定单位手动填报口径，集团缺月则缺数。' }
    ] },
    { id: 'price', name: '单价分析', tool: null, items: [
      { id: 'price.calc', label: '月报计算逻辑，各用水性质基本水价、税后单价、水量表格自动计算单价', type: 'price', metrics: ['avg_price'], dims: ['nature'] },
      { id: 'price.compare', label: '单价（累计，当月）指标对比分析', type: 'agg', metrics: ['avg_price', 'sold_vol'], dims: ['children', 'nature', 'company'] }
    ] },
    { id: 'charge', name: '收费率分析', tool: 'ar', items: [
      { id: 'charge.arNature', label: '应收账款按开账年月，用水性质', type: 'bills', field: 'arrears', metrics: ['arrears'], dims: ['nature', 'children'] },
      { id: 'charge.recvNature', label: '实收水费按开账年月，用水性质', type: 'bills', field: 'received', metrics: ['received'], dims: ['nature', 'children'] },
      { id: 'charge.penalty', label: '实收违约金按开账年月', type: 'penalty', metrics: [], dims: ['children'], note: '违约金字段未接入演示数据，缺数（不按0）。' },
      { id: 'charge.cum', label: '累计收费率计算：每月和累计应收水费和实收水费金额', type: 'total', metrics: ['charge_rate', 'receivable', 'received'], dims: ['children'], note: '自动生成；人工修改入口待接入（不扩MF两字段），缺修改入口不宣称可用。' },
      { id: 'charge.compare', label: '收费率当月累计指标对比', type: 'agg', metrics: ['charge_rate', 'receivable', 'received'], dims: ['children', 'company', 'nature'] },
      { id: 'charge.arrearsExport', label: '选择周期，欠费明细按年月导出', type: 'arrearsDetail', metrics: [], dims: ['children'] },
      { id: 'charge.priorRecover', label: '选择周期，往年水费收回统计', type: 'priorRecover', metrics: [], dims: ['children'] }
    ] },
    { id: 'meter', name: '表务督查', tool: 'meter', items: [
      { id: 'meter.info', label: '按照表类型、水表厂家、安装年份和口径统计', type: 'meterInfo', metrics: [], dims: ['meterType', 'manufacturer', 'caliber', 'installYear', 'industry', 'children'] },
      { id: 'meter.category', label: '水表类别（机械，远传）', type: 'meterCategory', metrics: [], dims: ['meterType'] },
      { id: 'meter.unreg', label: '未立户水表存放状态（地址，出入库时间）', type: 'meterUnreg', metrics: [], dims: ['children'] },
      { id: 'meter.weekly', label: '周检换表统计', type: 'meterSwapCount', swap: '周检换表', metrics: [], dims: ['meterType', 'manufacturer', 'caliber', 'children'], note: '按水表类型、水表厂家和口径。' },
      { id: 'meter.fault', label: '故障表统计', type: 'meterSwapCount', swap: '故障换表', metrics: [], dims: ['meterType', 'manufacturer', 'caliber', 'children'], note: '按水表类型、水表厂家和口径。' },
      { id: 'meter.online', label: '远传水表通讯在线率', type: 'meterOnline', period: '当月', metrics: [], dims: ['manufacturer', 'caliber', 'children'], note: '按水表厂家、口径统计，离线水表导出明细。' },
      { id: 'meter.offlineDetails', label: '远传水表通讯在线率·离线水表明细', type: 'offlineDetail', period: '当月', metrics: [], dims: ['children'], note: '按水表厂家、口径统计，离线水表导出明细。' },
      { id: 'meter.warehouse', label: '仓库管理', type: 'warehouse', metrics: [], dims: ['children'], note: '分公司中心库快照保留，另增原型营业所/网格级仓库台账；在库按每表最新事件状态（在库/调拨入库/报废入库）判定，已出库/调拨出库不计在库。' },
      { id: 'meter.booklet', label: '册本户数（单月抄、双月抄和每月抄）', type: 'booklet', metrics: [], dims: ['children'] },
      { id: 'meter.bookAdjust', label: '存量用户册本调整统计', type: 'bookletAdjust', metrics: [], dims: ['children'], note: '按原型存量册本调整 TRANSFER 事件（调整前后册本+日期）统计。' },
      { id: 'meter.bookNew', label: '新增用户入册统计', type: 'bookNew', metrics: [], dims: ['children'], note: '按原型独立入册 ENROLL 事件统计，入册日期独立于立户日期。' },
      { id: 'meter.readRate', label: '抄见率', type: 'readRate', metrics: [], dims: ['children', 'line'], note: '集团到各个线路抄见率。' },
      { id: 'meter.arrival', label: '到位率', type: 'arrivalRate', metrics: [], dims: ['children', 'line'] },
      { id: 'meter.estimate', label: '估抄率,未抄见水表', type: 'estimateRate', metrics: [], dims: ['children', 'line'], note: '统计各线路未抄见水表并导出明细，核算估抄率。' },
      { id: 'meter.remoteBill', label: '远传水表开账率统计', type: 'remoteBill', metrics: [], dims: ['children'], note: '分母为原型应推送事件（每用户每账期一条）；缺失/延迟可导出明细。' },
      { id: 'meter.unpushedDetails', label: '远传水表开账率统计·未及时推送明细', type: 'unpushedDetail', metrics: [], dims: ['children'], note: '与开账率同源；缺失=期末无推送，延迟=推送晚于应推送时间。' }
    ] },
    { id: 'alert', name: '数据预警异常', tool: 'alert', items: [
      { id: 'alert.photo', label: '手机拍照抄表无法识别', type: 'alertCat', cat: '抄表异常', kw: '拍照', metrics: [], dims: ['line', 'children'], note: '按线路统计明细。' },
      { id: 'alert.remoteIdx', label: '远传系统指数和开账指数不一致', type: 'remoteAlert', alertType: 'INDEX_MISMATCH', metrics: [], dims: ['children'], note: '取原型远传指数不一致报警事件，不以手机拍照指数代理远传指数。' },
      { id: 'alert.photoIdx', label: '手机拍照系统识别指数和开账指数不一致', type: 'alertCat', cat: '抄表异常', kw: '指数差异', metrics: [], dims: ['children'] },
      { id: 'alert.notArrived', label: '抄表未到位', type: 'readFlag', flag: 'arrived', metrics: [], dims: ['children', 'line'] },
      { id: 'alert.gps', label: '抄表定位不一致', type: 'readFlag', flag: 'gps', metrics: [], dims: ['children', 'line'] },
      { id: 'alert.readStatus', label: '异常抄表状态统计', type: 'readStatus', metrics: [], dims: ['children'], note: '压埋、车压、水没、黑黄、门闭、通讯中断、停走、估表、溢出、表丢（刨除正常、不用、定换、周检）。' },
      { id: 'alert.volTotal', label: '总水量异常（营业所网格-班组-线路）±5%', type: 'volAnomaly', thr: 5, metrics: [], dims: ['children', 'line'] },
      { id: 'alert.zero3', label: '连续3个抄表周期0水量用户统计', type: 'zeroVol', n: 3, metrics: [], dims: ['children'], note: '选择周期。' },
      { id: 'alert.volYoy', label: '水量同比变化±30%（可调整）以上（当月、累计同比）', type: 'volYoy', thr: 30, metrics: [], dims: ['children'], note: '选择周期。' },
      { id: 'alert.remoteVol', label: '获取远传系统远传水表水量报警数据', type: 'remoteAlert', alertType: 'WATER_ALARM', metrics: [], dims: ['children'], note: '取原型远传水量报警事件，仅事实不推断。' },
      { id: 'alert.remoteComm', label: '获取远传系统远传水表通讯报警数据', type: 'remoteAlert', alertType: 'COMM_ALARM', metrics: [], dims: ['children'], note: '取原型远传通讯报警事件，仅事实不推断。' },
      { id: 'alert.adjVol', label: '涉及调整水量', type: 'adjustmentDetail', field: 'waterVolume', metrics: [], dims: ['children'], note: '取原型 typed 调整水量明细（m³，调整前/后/增减），不以金额换算冒充。' },
      { id: 'alert.adjPrice', label: '调整水价', type: 'adjustmentDetail', field: 'unitPrice', metrics: [], dims: ['children'], note: '取原型 typed 调整水价明细（元/m³，调整前/后/增减），不以金额换算冒充。' },
      { id: 'alert.adjPenalty', label: '调整违约金', type: 'adjustmentDetail', field: 'penalty', metrics: [], dims: ['children'], note: '取原型 typed 调整违约金字段明细（元，调整前/后/增减），不以金额换算冒充。' }
    ] },
    { id: 'project', name: '工程项目督查', tool: 'project', scopeUnit: 'ORG-BIZ', items: [
      { id: 'project.unreg', label: '未立户水表明细', type: 'projectList', filter: 'unreg', metrics: [], dims: ['children'], note: '工程编号，工程当前节点，口径、水表厂家、条形码。' },
      { id: 'project.unregVol', label: '未立户有水量远传水表明细', type: 'projectList', filter: 'unregVol', metrics: [], dims: ['children'], note: '工程编号，工程当前节点，口径、水表厂家、条形码。' },
      { id: 'project.progress', label: '在建工程进度统计', type: 'projectProgress', metrics: [], dims: ['children'], note: '报装系统和营收系统获取工程按照是否完工、是否装表、是否立户。' }
    ] },
    { id: 'ar', name: '应收账款', tool: 'ar', items: [
      { id: 'ar.aging', label: '账龄分析（价差退款、特殊开账、待处理账）', type: 'aging', metrics: [], dims: ['children'] },
      { id: 'ar.priceRefund', label: '价差退款', type: 'adjust', proc: '价差退款', metrics: [], dims: ['children'], note: '账务调整台账原名条目（价差退款），展示真实调整金额/原因；缺独立水量字段，不冒账龄。' },
      { id: 'ar.specialBill', label: '特殊开账', type: 'adjust', proc: '特殊开账', metrics: [], dims: ['children'], note: '账务调整台账原名条目（特殊开账），展示真实调整金额/原因；缺独立水量字段，不冒账龄。' },
      { id: 'ar.pending', label: '待处理账', type: 'adjust', proc: '待处理账', metrics: [], dims: ['children'], note: '账务调整台账原名条目（待处理账），展示真实调整金额/原因；缺独立水量字段，不冒账龄。' },
      { id: 'ar.big5000', label: '（5年以内）欠费5000m³以上用户台账自动建立', type: 'bigArrears', thr: 5000, metrics: [], dims: ['children'], note: '欠费5000m³为水量阈值（非金额）；5年以内按账期窗口（所选月末年-4至所选月末）。' },
      { id: 'ar.detail', label: '欠费具体到用户明细', type: 'arrearsUsers', metrics: [], dims: ['children'] }
    ] }
  ];
  const GROUP_BY_ID = Object.fromEntries(GROUPS.map(g => [g.id, g]));
  function groupOfItem(itemId) { return GROUP_BY_ID[String(itemId).split('.')[0]] || null; }
  function findItem(groupId, itemId) {
    const g = GROUP_BY_ID[groupId];
    if (!g) return null;
    return g.items.find(i => i.id === itemId) || REPORT_ITEMS[itemId] || null;
  }

  /* ---------- 通用聚合 ---------- */
  function groupBy(rows, keyFn) {
    const m = new Map();
    rows.forEach(r => { const k = keyFn(r); if (k == null || k === '') return; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    return Array.from(m.entries()).map(([name, rs]) => ({ name, rows: rs }));
  }
  function childBuckets(f, rowsOverride) {
    const node = effectiveNode();
    const kids = levelChildren(node);
    if (!kids.length) return [];
    const owner = new Map();
    kids.forEach(k => nodeIdsOf(k).forEach(id => owner.set(id, k)));
    const buckets = new Map(kids.map(k => [k.id, []]));
    (rowsOverride || facts(f)).forEach(r => { const k = owner.get(r.orgNodeId); if (k) buckets.get(k.id).push(r); });
    return kids.map(k => ({ node: k, name: k.name, rows: buckets.get(k.id) }));
  }
  function collectionBuckets(f, rowsOverride) {
    const ff = rowsOverride || facts(f);
    const codes = new Set(ff.map(r => r.accountId));
    const users = scoped('users').filter(u => codes.has(u.unified_code));
    const nonRes = new Set(users.filter(u => ['非居民', '特行', '居民非阶梯'].includes(u.nature)).map(u => u.unified_code));
    const toHouse = new Set(users.filter(u => u.nature === '居民阶梯').map(u => u.unified_code));
    return [
      { name: '非居民（非居民/特行/居民非阶梯4.5元除居民总表）', rows: ff.filter(r => nonRes.has(r.accountId)) },
      { name: '抄表到户（居民阶梯和考核表）', rows: ff.filter(r => toHouse.has(r.accountId)) },
      { name: '未抄表到户（二次加压表后非注册用户，人工添加）', rows: [], count: null }
    ];
  }
  function dimBuckets(f, dimKey, rowsOverride) {
    if (dimKey === 'children') {
      const cb = childBuckets(f, rowsOverride);
      if (cb.length) return cb.map(b => ({ name: b.name, nodeId: b.node.id, rows: b.rows }));
      const n = effectiveNode();
      return [{ name: n ? n.name : '当前节点', nodeId: n && n.id, rows: rowsOverride || facts(f) }];
    }
    if (dimKey === 'collection') return collectionBuckets(f, rowsOverride);
    if (dimKey === 'community') {
      const um = D().userIndex;
      return groupBy(rowsOverride || facts(f), r => { const u = um.get(Number(r.seriesKey)); return u && u.community ? u.community : '未提供'; }).map(b => ({ name: b.name, rows: b.rows }));
    }
    const field = DIM_FIELD[dimKey] || dimKey;
    return groupBy(rowsOverride || facts(f), r => r[field]).map(b => ({ name: b.name, rows: b.rows }));
  }
  function queryUsers(f) {
    f = f || filters();
    const codes = new Set(facts(f).map(r => r.accountId));
    return scoped('users').filter(u => codes.has(u.unified_code));
  }
  function aggRows(f, dimKey) {
    return dimBuckets(f, dimKey).map(b => {
      if (b.count === null) return { name: b.name, nodeId: b.nodeId, count: null, agg: { sold_vol: null, registered_count: null, new_count: null, closed_count: null, receivable_principal: null, received_principal: null, arrears_principal: null, charge_rate_pct: null, avg_price_yuan: null, loss_rate_pct: null, supply_vol: null, plan_vol: null, plan_completion_pct: null, yoy_growth_pct: null }, _rows: [] };
      return { name: b.name, nodeId: b.nodeId, count: b.count != null ? b.count : b.rows.length, agg: E.aggregate(b.rows, f), _rows: b.rows };
    });
  }
  function metricColumns(keys) {
    return keys.map(k => ({ key: k, label: METRICS[k].label, unit: METRICS[k].unit, dec: METRICS[k].dec, align: 'right' }));
  }

  /* ---------- 条目计算分发 ---------- */
  function effectiveF(item, f) { return item && item.period ? Object.assign({}, f, { period: item.period }) : f; }
  function computeItem(item, dimKey, f) {
    f = effectiveF(item, f);
    const node = effectiveNode();
    const base = { columns: [], rows: [], chart: null, note: item.note || '', empty: '', sourceRows: [], totals: null, kind: 'table' };
    const g = groupOfItem(item.id);
    if (item.type === 'missing') { base.empty = item.note || '当前口径暂无接入数据（缺数，不按0）。'; return base; }
    if (g && g.loss && !lossApplicable(node)) { base.empty = '所及以下层级无供水口径，不计算产销差率（不适用，非缺数）。'; return base; }
    if (g && g.scopeUnit) {
      const inScope = node.id === g.scopeUnit || nodeIdsOf(Org().get(g.scopeUnit)).has(node.id);
      const isAncestor = !inScope && nodeIdsOf(node).has(g.scopeUnit);
      if (isAncestor) base.note = (base.note ? base.note + ' ' : '') + '工程督查数据仅覆盖营业中心；当前节点为其上级，按营业中心口径展示。';
      else if (!inScope) base.note = (base.note ? base.note + ' ' : '') + '工程督查口径限营业中心；当前节点不在该口径内。';
    }
    switch (item.type) {
      case 'agg': return computeAgg(item, dimKey, f, base);
      case 'total': return computeTotal(item, f, base);
      case 'trend': return computeTrend(item, f, base);
      case 'scale': return computeScale(item, f, base);
      case 'community': return computeCommunity(item, dimKey, f, base);
      case 'policyIndustry': return computePolicy(item, f, base);
      case 'caliberChange': return computeCaliberChange(item, f, base);
      case 'bookletAdjust': return computeBookletAdjust(item, f, base);
      case 'remoteAlert': return computeRemoteAlert(item, f, base);
      case 'adjustmentDetail': return computeAdjustmentDetail(item, f, base);
      case 'bigUser': return computeBigUser(item, f, base);
      case 'bigUserAvg': return computeBigUserAvg(item, f, base);
      case 'bigUserSummary': return computeBigUserSummary(item, dimKey, f, base);
      case 'changeRank': return computeChangeRank(item, dimKey, f, base);
      case 'adminWater': return computeAdminWater(item, dimKey, f, base);
      case 'newCohort': return computeNewCohort(item, dimKey, f, base);
      case 'closedCohort': return computeClosedCohort(item, dimKey, f, base);
      case 'unregStock': return computeUnregStock(item, dimKey, f, base);
      case 'price': return computePrice(item, f, base);
      case 'bills': return computeBills(item, dimKey, f, base);
      case 'penalty': base.empty = '违约金字段未接入演示数据，缺数（不按0）。'; return base;
      case 'arrearsDetail': return computeArrearsDetail(item, f, base);
      case 'priorRecover': return computePriorRecover(item, f, base);
      case 'meterInfo': return computeMeterInfo(item, dimKey, f, base);
      case 'meterCategory': return computeMeterCategory(item, f, base);
      case 'meterUnreg': return computeMeterUnreg(item, f, base);
      case 'meterSwapCount': return computeMeterSwapCount(item, dimKey, f, base);
      case 'swapVolume': return computeMeterSwap(item, dimKey, f, base);
      case 'meterOnline': return computeMeterOnline(item, dimKey, f, base);
      case 'warehouse': return computeWarehouse(item, f, base);
      case 'booklet': return computeBooklet(item, f, base);
      case 'bookNew': return computeBookNew(item, f, base);
      case 'readRate': return computeReadRate(item, dimKey, f, base, 'read');
      case 'arrivalRate': return computeReadRate(item, dimKey, f, base, 'arrival');
      case 'estimateRate': return computeReadRate(item, dimKey, f, base, 'estimate');
      case 'remoteBill': return computeRemoteBill(item, f, base);
      case 'alertCat': return computeAlertCat(item, dimKey, f, base);
      case 'readFlag': return computeReadFlag(item, dimKey, f, base);
      case 'readStatus': return computeReadStatus(item, f, base);
      case 'volAnomaly': return computeVolAnomaly(item, dimKey, f, base);
      case 'zeroVol': return computeZeroVol(item, f, base);
      case 'volYoy': return computeVolYoy(item, f, base);
      case 'adjust': return computeAdjust(item, f, base);
      case 'projectList': return computeProjectList(item, f, base);
      case 'projectProgress': return computeProjectProgress(item, f, base);
      case 'aging': return computeAging(item, f, base);
      case 'bigArrears': return computeBigArrears(item, f, base);
      case 'arrearsUsers': return computeArrearsUsers(item, f, base);
      case 'loss10': return computeLoss10(item, dimKey, f, base);
      case 'syncYear': return computeSyncYear(item, dimKey, f, base);
      case 'offlineDetail': return computeOfflineDetail(item, f, base);
      case 'unpushedDetail': return computeUnpushedDetail(item, f, base);
      case 'reportLoss': return computeReportLoss(item, dimKey, f, base);
      case 'reportTrend': return computeReportTrend(item, f, base);
      case 'reportBigIndustry': return computeReportBigIndustry(item, f, base);
      default: base.empty = '该分析项计算口径待接入。'; return base;
    }
  }
  /* price.compare 上年同期辅助列：同权限同维度、上年各期真实事实聚合；缺基期→null，不推定、不改本期口径。 */
  function prevAggByName(f, dimKey, baseFacts) {
    const map = new Map();
    if (!baseFacts || !baseFacts.length) return map;
    dimBuckets(f, dimKey, baseFacts).forEach(b => { if (b.count !== null) map.set(b.name, E.aggregate(b.rows, f)); });
    return map;
  }
  function computeAgg(item, dimKey, f, base) {
    const rows = aggRows(f, dimKey);
    const isPriceCompare = item.id === 'price.compare';
    const hasShare = item.metrics.includes('registered_count') || item.metrics.includes('sold_vol');
    const pk = hasShare ? (item.metrics.includes('registered_count') ? 'registered_count' : 'sold_vol') : null;
    const isWaterShare = pk === 'sold_vol' && !item.metrics.includes('loss_rate');
    const isChargeCompare = item.metrics.includes('charge_rate') && item.metrics.includes('receivable');
    const needPrior = isPriceCompare || isWaterShare || isChargeCompare;
    const prevBaseFacts = needPrior ? rangeFacts(f, E.periods(f).map(p => shiftYear(p, -1))) : null;
    const prevAgg = needPrior ? prevAggByName(f, dimKey, prevBaseFacts) : null;
    const priorWater = isWaterShare && rows.some(r => { const pa = prevAgg.get(r.name); return pa && pa.sold_vol > 0; });
    const priorCharge = isChargeCompare && rows.some(r => { const pa = prevAgg.get(r.name); return pa && pa.received_principal > 0; });
    base.columns = [{ key: 'name', label: DIM_LABELS[dimKey] || '名称' }].concat(metricColumns(item.metrics));
    if (isPriceCompare) {
      const prevCol = { key: 'prev_avg_price', label: '上年同期综合单价', unit: '元/m³', dec: 3, align: 'right' };
      const at = base.columns.findIndex(c => c.key === 'avg_price');
      base.columns.splice(at >= 0 ? at + 1 : base.columns.length, 0, prevCol);
    }
    if (priorWater) {
      const at = base.columns.findIndex(c => c.key === 'sold_vol');
      base.columns.splice(at >= 0 ? at + 1 : base.columns.length, 0,
        { key: 'prev_sold', label: '上年同期售水量', unit: '万m³', dec: 2, align: 'right' },
        { key: 'yoy', label: '同比增长', unit: '%', dec: 2, align: 'right' });
    }
    if (priorCharge) {
      const at = base.columns.findIndex(c => c.key === 'received');
      base.columns.splice(at >= 0 ? at + 1 : base.columns.length, 0, { key: 'prev_received', label: '上年同期实收', unit: '元', dec: 2, align: 'right' });
    }
    if (hasShare) base.columns.push({ key: 'share', label: '占比', unit: '%', dec: 2, align: 'right' });
    const denomReg = E.sum(rows.map(x => x.agg), 'registered_count');
    const denomSold = E.sum(rows.map(x => x.agg), 'sold_vol');
    base.rows = rows.map(r => {
      const o = { name: r.name, nodeId: r.nodeId, _raw: r._rows };
      item.metrics.forEach(k => { o[k] = METRICS[k].get(r.agg); });
      if (isPriceCompare) { const pa = prevAgg.get(r.name); o.prev_avg_price = pa && pa.sold_vol > 0 ? METRICS.avg_price.get(pa) : null; }
      if (priorWater) {
        const pa = prevAgg.get(r.name);
        o.prev_sold = pa && pa.sold_vol > 0 ? METRICS.sold_vol.get(pa) : null;
        o.yoy = (o.prev_sold != null && o.prev_sold > 0 && o.sold_vol != null) ? E.round((o.sold_vol - o.prev_sold) / o.prev_sold * 100, 2) : null;
      }
      if (priorCharge) { const pa = prevAgg.get(r.name); o.prev_received = pa ? E.round(pa.received_principal, 2) : null; }
      if (hasShare) {
        const reg = item.metrics.includes('registered_count');
        const v = reg ? r.agg.registered_count : r.agg.sold_vol;
        const denom = reg ? denomReg : denomSold;
        o.share = (v != null && denom > 0) ? E.round(v / denom * 100, 2) : null;
      }
      return o;
    }).sort((a, b) => (b[item.metrics[0]] || 0) - (a[item.metrics[0]] || 0));
    base.sourceRows = rows.flatMap(r => r._rows).concat(needPrior && prevBaseFacts ? prevBaseFacts : []);
    if (isPriceCompare) {
      base.chart = { kind: 'bar', series: [{ key: 'avg_price', name: '本期综合单价', type: 'bar', yAxis: 0 }, { key: 'prev_avg_price', name: '上年同期综合单价', type: 'bar', yAxis: 0 }] };
    } else if (item.metrics.includes('loss_rate') && item.metrics.includes('supply_vol') && item.metrics.includes('sold_vol')) {
      base.chart = { kind: 'bar', composition: 'stock-flow', series: [{ key: 'supply_vol', name: METRICS.supply_vol.label, type: 'bar', yAxis: 0 }, { key: 'sold_vol', name: METRICS.sold_vol.label, type: 'bar', yAxis: 0 }, { key: 'loss_rate', name: METRICS.loss_rate.label, type: 'line', yAxis: 1 }] };
    } else if (hasShare && pk === 'sold_vol') {
      const series = [];
      if (priorWater) series.push({ key: 'prev_sold', name: '上年同期售水量', type: 'bar', yAxis: 0 });
      series.push({ key: 'sold_vol', name: METRICS.sold_vol.label, type: 'bar', yAxis: 0 });
      const lineKey = item.metrics.includes('plan_pct') ? 'plan_pct' : (priorWater && base.rows.some(r => r.yoy != null) ? 'yoy' : null);
      if (lineKey) series.push({ key: lineKey, name: METRICS[lineKey].label, type: 'line', yAxis: 1 });
      base.chart = { kind: 'bar', composition: 'bar-share', shareKey: 'sold_vol', series };
    } else if (hasShare) {
      base.chart = { kind: 'bar', composition: 'bar-share', shareKey: pk, series: [{ key: pk, name: METRICS[pk].label, type: 'bar', yAxis: 0 }] };
    } else if (isChargeCompare) {
      const series = [{ key: 'receivable', name: METRICS.receivable.label, type: 'bar', yAxis: 0 }, { key: 'received', name: METRICS.received.label, type: 'bar', yAxis: 0 }];
      if (priorCharge) series.push({ key: 'prev_received', name: '上年同期实收', type: 'bar', yAxis: 0 });
      series.push({ key: 'charge_rate', name: METRICS.charge_rate.label, type: 'line', yAxis: 1 });
      base.chart = { kind: 'bar', composition: 'stock-flow', series };
    } else {
      base.chart = { kind: 'bar', series: item.metrics.slice(0, 2).map((k, i) => ({ key: k, name: METRICS[k].label, type: i === 0 ? 'bar' : 'line', yAxis: i })) };
    }
    base.totals = E.aggregate(facts(f), f);
    if (dimKey === 'collection') base.note = (base.note ? base.note + ' ' : '') + '抄表到户三类按真实用户用水性质归集：非居民（非居民/特行/居民非阶梯）、抄表到户（居民阶梯和考核表）；未抄表到户（二次加压表后非注册用户）需人工添加，无源始终缺数不按0。';
    if (!base.rows.length) base.empty = '当前范围暂无数据。';
    return base;
  }
  function computeTotal(item, f, base) {
    const tf = item.period ? Object.assign({}, f, { period: item.period }) : f;
    const t = E.aggregate(facts(tf), tf);
    base.columns = [{ key: 'name', label: '指标' }].concat(metricColumns(item.metrics));
    const o = { name: (effectiveNode() || {}).name || '集团', _raw: facts(tf) };
    item.metrics.forEach(k => { o[k] = METRICS[k].get(t); });
    base.rows = [o];
    base.sourceRows = facts(tf);
    base.totals = t;
    if (item.metrics.includes('loss_rate') && item.metrics.includes('supply_vol') && item.metrics.includes('sold_vol')) {
      base.chart = { kind: 'bar', composition: 'stock-flow', series: [{ key: 'supply_vol', name: METRICS.supply_vol.label, type: 'bar', yAxis: 0 }, { key: 'sold_vol', name: METRICS.sold_vol.label, type: 'bar', yAxis: 0 }, { key: 'loss_rate', name: METRICS.loss_rate.label, type: 'line', yAxis: 1 }] };
    } else {
      const volKeys = item.metrics.filter(k => METRICS[k] && METRICS[k].unit !== '%' && o[k] != null);
      const pctKeys = item.metrics.filter(k => METRICS[k] && METRICS[k].unit === '%' && o[k] != null);
      if (volKeys.length && pctKeys.length) {
        base.chart = { kind: 'bar', composition: 'stock-flow', series: volKeys.map(k => ({ key: k, name: METRICS[k].label, type: 'bar', yAxis: 0 })).concat(pctKeys.map(k => ({ key: k, name: METRICS[k].label, type: 'line', yAxis: 1 }))) };
      } else {
        base.chart = { kind: 'bar', series: item.metrics.slice(0, 3).filter(k => o[k] != null).map(k => ({ key: k, name: METRICS[k].label, type: 'bar', yAxis: 0 })) };
      }
    }
    return base;
  }
  function computeTrend(item, f, base) {
    const tf = Object.assign({}, f, { period: item.period || f.period });
    const buckets = E.trend(facts(tf), tf, item.gran || 'year');
    base.columns = [{ key: 'name', label: item.gran === 'month' ? '月份' : '年度' }].concat(metricColumns(item.metrics));
    base.rows = buckets.map(b => {
      const o = { name: b.period || b.name, _raw: b.rows || [] };
      item.metrics.forEach(k => { o[k] = METRICS[k].get(b); });
      return o;
    });
    base.sourceRows = facts(tf);
    base.chart = { kind: 'line', series: item.metrics.map(k => ({ key: k, name: METRICS[k].label, type: 'line', yAxis: 0 })) };
    base.note = (base.note ? base.note + ' ' : '') + historyNote(tf);
    if (!base.rows.length) base.empty = '当前范围暂无数据。';
    return base;
  }
  function historyNote(f) {
    const periods = D().periods;
    const first = periods[0], last = periods[periods.length - 1];
    const req = E.periods(f);
    if (req.length && req[0] < first) return '实际数据自 ' + first + ' 起至 ' + last + '；请求期间超出部分无数据，缺失同期不按0、不补值。';
    return '实际数据范围 ' + first + ' … ' + last + '。';
  }
  /* 规模以上企业：WBPrototypeData.scaleRoster 显式名单×户号×有效期，非水量阈值、非行业代理。 */
  function computeScale(item, f, base) {
    const ps = new Set(E.periods(f)); const eligible = eligibleUsers(f);
    const roster = protoList('scaleRoster').filter(r => protoOwns(r) && protoNodeOk(r) && protoUserOf(r, eligible) && protoValidIn(r, ps));
    const memberPeriods = new Map();
    roster.forEach(r => { const u = protoUserOf(r, eligible); const key = String(u.id); if (!memberPeriods.has(key)) memberPeriods.set(key, new Set()); ps.forEach(p => { if (protoValidForPeriod(r, p)) memberPeriods.get(key).add(p); }); });
    const rows = facts(f).filter(r => { const u = protoUserOf(r, eligible); if (!u) return false; const set = memberPeriods.get(String(u.id)); const p = f.caliber === '财务自然月' ? (r.naturalMonth || r.period) : r.period; return set && set.has(p); });
    const buckets = groupBy(rows, r => r.industry);
    const priorPs = E.periods(f).map(p => shiftYear(p, -1));
    const priorMemberPeriods = new Map();
    roster.forEach(r => { const u = protoUserOf(r, eligible); const key = String(u.id); if (!priorMemberPeriods.has(key)) priorMemberPeriods.set(key, new Set()); priorPs.forEach(p => { if (protoValidForPeriod(r, p)) priorMemberPeriods.get(key).add(p); }); });
    const priorRows = rangeFacts(f, priorPs).filter(r => { const u = protoUserOf(r, eligible); if (!u) return false; const set = priorMemberPeriods.get(String(u.id)); const p = f.caliber === '财务自然月' ? (r.naturalMonth || r.period) : r.period; return set && set.has(p); });
    const priorByIndustry = new Map(groupBy(priorRows, r => r.industry).map(b => [b.name, E.aggregate(b.rows, f)]));
    const priorWater = buckets.some(b => { const pa = priorByIndustry.get(b.name); return pa && pa.sold_vol > 0; });
    base.columns = [{ key: 'name', label: '行业' }].concat(metricColumns(item.metrics));
    if (priorWater) {
      const at = base.columns.findIndex(c => c.key === 'sold_vol');
      base.columns.splice(at >= 0 ? at + 1 : base.columns.length, 0,
        { key: 'prev_sold', label: '上年同期售水量', unit: '万m³', dec: 2, align: 'right' },
        { key: 'yoy', label: '同比增长', unit: '%', dec: 2, align: 'right' });
    }
    base.rows = buckets.map(b => { const a = E.aggregate(b.rows, f); const o = { name: b.name, _raw: b.rows }; item.metrics.forEach(k => o[k] = METRICS[k].get(a)); if (priorWater) { const pa = priorByIndustry.get(b.name); o.prev_sold = pa && pa.sold_vol > 0 ? METRICS.sold_vol.get(pa) : null; o.yoy = (o.prev_sold != null && o.prev_sold > 0 && o.sold_vol != null) ? E.round((o.sold_vol - o.prev_sold) / o.prev_sold * 100, 2) : null; } return o; }).sort((a, b) => (b.sold_vol || 0) - (a.sold_vol || 0));
    base.sourceRows = roster.concat(rows).concat(priorRows);
    const series = [{ key: 'sold_vol', name: '售水量', type: 'bar', yAxis: 0 }];
    if (priorWater) series.push({ key: 'yoy', name: '同比增长', type: 'line', yAxis: 1 });
    base.chart = { kind: 'bar', series };
    base.note = '规模以上按原型显式名单（scaleRoster）×户号×有效期逐月判定，非水量阈值；名单命中 ' + memberPeriods.size + ' 户，仅统计当前范围与期间内匹配到结算水量的户。' + (priorWater ? ' 上年同期按同名单同有效期回溯，缺基期不按0。' : ' 上年同期无数据来源，未绘制同期比较。');
    if (!base.rows.length) base.empty = roster.length ? '当前范围所选期间暂无规上名单匹配水量。' : '当前范围暂无规模以上企业原型名单。';
    return base;
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function shiftMonth(period, n) { const y = +period.slice(0, 4), m = +period.slice(5, 7) + n; const yy = y + Math.floor((m - 1) / 12), mm = ((m - 1) % 12 + 12) % 12 + 1; return yy + '-' + pad2(mm); }
  function shiftYear(period, n) { return (+period.slice(0, 4) + n) + period.slice(4); }
  function rangeFacts(f, list) { if (!list.length) return []; return E.filterFacts(Object.assign({}, f, { period: '自定义', start: list[0], end: list[list.length - 1], month: list[list.length - 1] })); }
  function accountSum(rows) { const m = new Map(); for (const r of rows) { const k = r.accountId; m.set(k, (m.get(k) || 0) + (r.sold_vol || 0)); } return m; }
  function accountMeta(rows) { const m = new Map(); for (const r of rows) { if (!m.has(r.accountId)) m.set(r.accountId, r); } return m; }

  function computeBigUser(item, f, base) {
    const curMonth = f.month || f.end || '2026-10';
    const cf = E.filterFacts(Object.assign({}, f, { period: '当月', month: curMonth }));
    const um = D().userIndex;
    const rows = cf.filter(r => (r.sold_vol || 0) > 100).sort((a, b) => (b.sold_vol - a.sold_vol) || String(a.accountId).localeCompare(String(b.accountId)));
    base.columns = [
      { key: 'name', label: '用户名称' }, { key: 'nature', label: '用水性质' }, { key: 'industry', label: '行业' },
      { key: 'org', label: '所属组织' }, { key: 'monthVol', label: '月用水量', unit: 'm³', dec: 0, align: 'right' }
    ];
    base.rows = rows.map(r => { const u = um.get(Number(r.seriesKey)) || {}; return { name: u.name || r.accountId, nature: r.nature, industry: r.industry, org: r.org, monthVol: r.sold_vol, accountId: r.accountId, userId: u.id, _raw: [r] }; });
    base.sourceRows = rows; base.kind = 'users';
    base.note = '自然月（' + curMonth + '）月用水量＞100m³ 重点用户，共 ' + rows.length + ' 户（完整集合）；＞100 与 ≥100 边界以原表记录为准，待用户裁决；屏幕 Top10/50 仅在渲染层截断，导出与月报为全集。';
    if (!rows.length) base.empty = '当前范围暂无月用水量＞100m³ 的重点用户。';
    return base;
  }
  function computeBigUserAvg(item, f, base) {
    const periods = E.periods(f); const n = periods.length || 1;
    const cf = facts(f); const um = D().userIndex;
    const byAccount = new Map();
    for (const r of cf) { const k = r.accountId; let e = byAccount.get(k); if (!e) { e = { sum: 0, meta: r }; byAccount.set(k, e); } e.sum += (r.sold_vol || 0); }
    const rows = [...byAccount.entries()].filter(([, e]) => e.sum / n >= 100).sort((a, b) => (b[1].sum - a[1].sum) || String(a[0]).localeCompare(String(b[0])));
    base.columns = [
      { key: 'name', label: '用户名称' }, { key: 'nature', label: '用水性质' }, { key: 'industry', label: '行业' }, { key: 'org', label: '所属组织' },
      { key: 'avgVol', label: '月均用水量', unit: 'm³', dec: 1, align: 'right' }, { key: 'totalVol', label: '累计用水量', unit: 'm³', dec: 0, align: 'right' }, { key: 'months', label: '统计月数', dec: 0, align: 'right' }
    ];
    base.rows = rows.map(([k, e]) => { const u = um.get(Number(e.meta.seriesKey)) || {}; return { name: u.name || k, nature: e.meta.nature, industry: e.meta.industry, org: e.meta.org, avgVol: E.round(e.sum / n, 1), totalVol: e.sum, months: n, accountId: k, userId: u.id, _raw: [e.meta] }; });
    base.sourceRows = rows.map(([, e]) => e.meta); base.kind = 'users';
    base.note = '月均用水量≥100m³（累计水量÷' + n + ' 个自然月），共 ' + rows.length + ' 户；与「月用100」为不同集合，分母为所选期间实际月数。';
    if (!rows.length) base.empty = '当前范围暂无月均用水量≥100m³ 的用户。';
    return base;
  }
  function computeAdminWater(item, dimKey, f, base) {
    const dk = dimKey || 'admin';
    const rows = aggRows(f, dk);
    const prevBaseFacts = rangeFacts(f, E.periods(f).map(p => shiftYear(p, -1)));
    const prevAgg = prevAggByName(f, dk, prevBaseFacts);
    const priorWater = rows.some(r => { const pa = prevAgg.get(r.name); return pa && pa.sold_vol > 0; });
    base.columns = [{ key: 'name', label: dk === 'admin' ? '行政区' : '组织' }].concat(metricColumns(['sold_vol', 'registered_count']));
    if (priorWater) base.columns.push({ key: 'prev_sold', label: '上年同期售水量', unit: '万m³', dec: 2, align: 'right' }, { key: 'yoy', label: '同比增长', unit: '%', dec: 2, align: 'right' });
    base.columns.push({ key: 'share', label: '水量占比', unit: '%', dec: 2, align: 'right' });
    const total = E.sum(rows.map(r => ({ v: r.agg.sold_vol })), 'v');
    base.rows = rows.map(r => {
      const o = { name: r.name, nodeId: r.nodeId, sold_vol: METRICS.sold_vol.get(r.agg), registered_count: r.agg.registered_count, share: total > 0 ? E.round(r.agg.sold_vol / total * 100, 2) : null, _raw: r._rows };
      if (priorWater) { const pa = prevAgg.get(r.name); o.prev_sold = pa && pa.sold_vol > 0 ? METRICS.sold_vol.get(pa) : null; o.yoy = (o.prev_sold != null && o.prev_sold > 0 && o.sold_vol != null) ? E.round((o.sold_vol - o.prev_sold) / o.prev_sold * 100, 2) : null; }
      return o;
    }).sort((a, b) => (b.sold_vol || 0) - (a.sold_vol || 0));
    base.sourceRows = rows.flatMap(r => r._rows).concat(prevBaseFacts);
    const series = [];
    if (priorWater) series.push({ key: 'prev_sold', name: '上年同期售水量', type: 'bar', yAxis: 0 });
    series.push({ key: 'sold_vol', name: '售水量', type: 'bar', yAxis: 0 });
    if (priorWater) series.push({ key: 'yoy', name: '同比增长', type: 'line', yAxis: 1 });
    base.chart = { kind: 'bar', composition: 'bar-share', shareKey: 'sold_vol', series };
    base.totals = E.aggregate(facts(f), f);
    base.note = '各行政区域售水量与注册用户数及占比（r19 为用户数口径，本视图为水量口径，月报第八章）。' + (priorWater ? '' : ' 上年同期无数据来源，未绘制同期比较。');
    if (!rows.length) base.empty = '当前范围暂无行政区用水数据。';
    return base;
  }
  function computeBigUserSummary(item, dimKey, f, base) {
    const curMonth = f.month || f.end || '2026-10';
    const cf = E.filterFacts(Object.assign({}, f, { period: '当月', month: curMonth }));
    const node = effectiveNode();
    let buckets;
    if (dimKey === 'children' || !dimKey) { const kids = levelChildren(node); buckets = kids.length ? kids.map(c => ({ name: c.name, nodeId: c.id, rows: cf.filter(r => nodeIdsOf(c).has(r.orgNodeId)) })) : [{ name: node.name, nodeId: node.id, rows: cf }]; }
    else { const field = DIM_FIELD[dimKey] || 'org'; buckets = groupBy(cf, r => r[field]).map(b => ({ name: b.name, rows: b.rows })); }
    base.columns = [
      { key: 'name', label: dimKey === 'children' || !dimKey ? '区域' : (DIM_LABELS[dimKey] || '维度') },
      { key: 'bigCount', label: '＞100m³户数', dec: 0, align: 'right' }, { key: 'bigVol', label: '＞100m³水量', unit: 'm³', dec: 0, align: 'right' },
      { key: 'smallCount', label: '≤100m³户数', dec: 0, align: 'right' }, { key: 'smallVol', label: '≤100m³水量', unit: 'm³', dec: 0, align: 'right' },
      { key: 'bigVolShare', label: '大用户水量占比', unit: '%', dec: 2, align: 'right' }
    ];
    base.rows = buckets.map(b => {
      const big = new Map(), small = new Map(); let bigVol = 0, smallVol = 0;
      for (const r of b.rows) { const v = r.sold_vol || 0; if (v > 100) { big.set(r.accountId, (big.get(r.accountId) || 0) + v); bigVol += v; } else { small.set(r.accountId, (small.get(r.accountId) || 0) + v); smallVol += v; } }
      const tot = bigVol + smallVol;
      return { name: b.name, nodeId: b.nodeId, bigCount: big.size, bigVol, smallCount: small.size, smallVol, bigVolShare: tot > 0 ? E.round(bigVol / tot * 100, 2) : null, _raw: b.rows };
    }).sort((a, b) => b.bigVol - a.bigVol);
    base.sourceRows = cf; base.kind = 'bigUserSummary';
    /* 分区名（＞100m³/≤100m³）不是可排行类别：双环点击切本框表格（chartAction='table'），排行不适用。 */
    base.rankingApplicable = false;
    base.chart = { kind: 'bar', composition: 'dual-donut', series: [{ key: 'bigVol', name: '＞100m³水量', type: 'bar', yAxis: 0 }, { key: 'smallVol', name: '≤100m³水量', type: 'bar', yAxis: 0 }] };
    base.note = '自然月（' + curMonth + '）重点用户＞100m³ 与 ≤100m³ 户数、水量及占比（月报第十二章）；＞100/≤100 边界以原表记录为准，待裁决。';
    if (!cf.length) base.empty = '当前范围暂无当月用水数据。';
    return base;
  }
  function computeNewCohort(item, dimKey, f, base) {
    const periods = E.periods(f); const pset = new Set(periods);
    const cohort = queryUsers(f).filter(u => u.regDate && pset.has(u.regDate.slice(0, 7)));
    const codes = new Set(cohort.map(u => u.unified_code));
    const cf = facts(f).filter(r => codes.has(r.accountId));
    const waterBy = new Map(); const rowsBy = new Map(); const covered = new Set();
    for (const r of cf) { covered.add(r.accountId); waterBy.set(r.accountId, (waterBy.get(r.accountId) || 0) + (r.sold_vol || 0)); let a = rowsBy.get(r.accountId); if (!a) { a = []; rowsBy.set(r.accountId, a); } a.push(r); }
    const totalWater = E.sum(cf.map(r => ({ v: r.sold_vol })), 'v');
    const node = effectiveNode();
    const mkBucket = (name, members, nodeId) => {
      const complete = members.every(u => covered.has(u.unified_code));
      const water = complete ? members.reduce((s, u) => s + (waterBy.get(u.unified_code) || 0), 0) : null;
      return { name, nodeId, count: members.length, water, share: water != null && totalWater > 0 ? E.round(water / totalWater * 100, 2) : null, _raw: members.flatMap(u => rowsBy.get(u.unified_code) || []) };
    };
    let buckets;
    if (dimKey === 'children' || !dimKey) {
      const kids = levelChildren(node);
      buckets = kids.length ? kids.map(c => { const ids = nodeIdsOf(c); return mkBucket(c.name, cohort.filter(u => ids.has(u.orgNodeId)), c.id); }) : [mkBucket(node.name, cohort, node.id)];
    } else if (dimKey === 'collection') {
      const nonRes = cohort.filter(u => ['非居民', '特行', '居民非阶梯'].includes(u.nature));
      const toHouse = cohort.filter(u => u.nature === '居民阶梯');
      buckets = [mkBucket('非居民（非居民/特行/居民非阶梯4.5元除居民总表）', nonRes), mkBucket('抄表到户（居民阶梯和考核表）', toHouse), { name: '未抄表到户（二次加压表后非注册用户，人工添加）', count: null, water: null, share: null, _raw: [] }];
    } else {
      const field = DIM_FIELD[dimKey] || dimKey;
      buckets = groupBy(cohort, u => u[field] || '未提供').map(b => mkBucket(b.name, b.rows));
    }
    base.columns = [{ key: 'name', label: dimKey === 'children' || !dimKey ? '组织' : (DIM_LABELS[dimKey] || '维度') }, { key: 'count', label: '新增户数', dec: 0, align: 'right' }, { key: 'water', label: '同批售水量', unit: 'm³', dec: 0, align: 'right' }, { key: 'share', label: '水量占比', unit: '%', dec: 2, align: 'right' }];
    base.rows = buckets.sort((a, b) => (b.water || 0) - (a.water || 0) || (b.count || 0) - (a.count || 0));
    base.sourceRows = cf; base.kind = 'newCohort';
    base.chart = { kind: 'bar', series: [{ key: 'water', name: '同批售水量', type: 'bar', yAxis: 0 }] };
    const allCovered = cohort.every(u => covered.has(u.unified_code));
    base.note = '按自然月立户时间圈定新增用户（' + periods[0] + ' 至 ' + periods[periods.length - 1] + ' 立户 ' + cohort.length + ' 户），户数按同批档案统计（不因当期无水量丢户）；统计该批用户在所选期间的售水量（最新结算口径），任一成员当期缺可取水量则该桶水量置空（不按0），非全部用户水量。';
    base.totalsNote = '新增 ' + cohort.length + ' 户，同批售水量 ' + (allCovered ? E.fmt(totalWater, 0) + ' m³' : '缺数（部分成员当期无水量来源）') + '。';
    if (!cohort.length) base.empty = '当前期间暂无自然月新增立户用户。';
    return base;
  }
  function computeClosedCohort(item, dimKey, f, base) {
    const periods = E.periods(f); const pset = new Set(periods); const last = periods[periods.length - 1];
    const users = queryUsers(f).filter(u => u.deregisterDate && pset.has(u.deregisterDate.slice(0, 7)));
    const valid = users.filter(u => u.deregisterDate >= u.regDate);
    const invalid = users.filter(u => u.deregisterDate < u.regDate);
    const allP = D().periods; const dataLast = allP[allP.length - 1];
    const allFacts = E.filterFacts(Object.assign({}, f, { period: '自定义', start: allP[0], end: last, month: last }));
    const byAccount = new Map();
    for (const r of allFacts) { let m = byAccount.get(r.accountId); if (!m) { m = new Map(); byAccount.set(r.accountId, m); } m.set(r.period, (m.get(r.period) || 0) + (r.sold_vol || 0)); }
    base.columns = [
      { key: 'name', label: '用户名称' }, { key: 'org', label: '所属组织' }, { key: 'deregDate', label: '注销日期' },
      { key: 'prevYear', label: '上年' }, { key: 'prevFullYear', label: '上年全年水量', unit: 'm³', dec: 0, align: 'right' },
      { key: 'knownMonths', label: '已知完整月份水量（不含注销月）', unit: 'm³', dec: 0, align: 'right' },
      { key: 'knownRange', label: '已知完整月份范围' },
      { key: 'exactVol', label: '截至注销日水量', unit: 'm³', dec: 0, align: 'right' },
      { key: 'delta', label: '变化量', unit: 'm³', dec: 0, align: 'right' }, { key: 'changeRate', label: '变化率', unit: '%', dec: 2, align: 'right' }
    ];
    base.rows = valid.map(u => {
      const m = byAccount.get(u.unified_code) || new Map();
      const dy = u.deregisterDate.slice(0, 4), dm = +u.deregisterDate.slice(5, 7); const py = +dy - 1;
      const regMonth = u.regDate.slice(0, 7);
      const prevMonths = []; for (let i = 1; i <= 12; i++) prevMonths.push(py + '-' + pad2(i));
      const prevCovered = prevMonths.filter(p => p >= regMonth && p >= allP[0] && p <= dataLast);
      const prevComplete = prevCovered.length === 12 && prevCovered.every(p => m.has(p));
      const prev = prevComplete ? prevCovered.reduce((s, p) => s + m.get(p), 0) : null;
      const curMonths = []; for (let i = 1; i < dm; i++) { const p = dy + '-' + pad2(i); if (p >= regMonth && p >= allP[0] && p <= last) curMonths.push(p); }
      const curComplete = curMonths.length > 0 && curMonths.every(p => m.has(p));
      const known = curComplete ? curMonths.reduce((s, p) => s + m.get(p), 0) : null;
      const prevRangeText = prevComplete ? '上年' + py + '全年12个月' : '上年' + py + '仅覆盖' + prevCovered.length + '个月（缺月不按0，全年量置空）';
      const curRangeText = curMonths.length ? '当年' + curMonths[0] + '…' + curMonths[curMonths.length - 1] + '（' + curMonths.length + '个完整月，不含注销月' + dy + '-' + pad2(dm) + '）' : '当年注销月前无完整月';
      return { name: u.name, org: u.org, deregDate: u.deregisterDate, prevYear: String(py), prevFullYear: prev, knownMonths: known, knownRange: prevRangeText + '；' + curRangeText, exactVol: null, delta: null, changeRate: null, userId: u.id, _raw: [u] };
    }).sort((a, b) => a.deregDate.localeCompare(b.deregDate));
    if (['nature', 'admin', 'industry', 'community', 'collection'].includes(dimKey)) {
      const sumOrNull = vals => vals.some(v => v == null) ? null : vals.reduce((s, v) => s + v, 0);
      const userOf = new Map(valid.map(u => [u.id, u]));
      const mkRow = (name, rows) => ({ name, count: rows.length, prevFullYear: sumOrNull(rows.map(r => r.prevFullYear)), knownMonths: sumOrNull(rows.map(r => r.knownMonths)), exactVol: null, delta: null, changeRate: null, _raw: rows.flatMap(r => r._raw) });
      let buckets;
      if (dimKey === 'collection') {
        const nonRes = base.rows.filter(r => { const u = userOf.get(r.userId); return u && ['非居民', '特行', '居民非阶梯'].includes(u.nature); });
        const toHouse = base.rows.filter(r => { const u = userOf.get(r.userId); return u && u.nature === '居民阶梯'; });
        buckets = [mkRow('非居民（非居民/特行/居民非阶梯4.5元除居民总表）', nonRes), mkRow('抄表到户（居民阶梯和考核表）', toHouse), { name: '未抄表到户（二次加压表后非注册用户，人工添加）', count: null, prevFullYear: null, knownMonths: null, exactVol: null, delta: null, changeRate: null, _raw: [] }];
      } else {
        const field = DIM_FIELD[dimKey] || dimKey;
        const attrOf = new Map(valid.map(u => [u.id, u[field] || '未提供']));
        buckets = groupBy(base.rows, r => attrOf.get(r.userId) || '未提供').map(b => mkRow(b.name, b.rows));
      }
      base.columns = [
        { key: 'name', label: DIM_LABELS[dimKey] || '维度' }, { key: 'count', label: '同批注销户数', dec: 0, align: 'right' },
        { key: 'prevFullYear', label: '上年全年水量合计', unit: 'm³', dec: 0, align: 'right' },
        { key: 'knownMonths', label: '当年完整月参考合计', unit: 'm³', dec: 0, align: 'right' },
        { key: 'exactVol', label: '截至注销日水量', unit: 'm³', dec: 0, align: 'right' },
        { key: 'delta', label: '变化量', unit: 'm³', dec: 0, align: 'right' }, { key: 'changeRate', label: '变化率', unit: '%', dec: 2, align: 'right' }
      ];
      base.rows = buckets.sort((a, b) => (b.count || 0) - (a.count || 0) || a.name.localeCompare(b.name));
      base.chart = { kind: 'bar', series: [{ key: 'prevFullYear', name: '上年全年水量合计', type: 'bar' }, { key: 'knownMonths', name: '当年完整月参考合计', type: 'bar' }] };
    }
    const supportCodes = new Set(valid.map(u => u.unified_code));
    base.sourceRows = valid.concat(allFacts.filter(r => supportCodes.has(r.accountId)));
    base.kind = 'closedCohort'; base.invalid = invalid.map(u => ({ name: u.name, org: u.org, regDate: u.regDate, deregDate: u.deregisterDate, userId: u.id }));
    base.note = '注销同批＝注销日落在所选自然月集合（' + periods[0] + '…' + last + '）的用户。上年全年水量仅在该年12个月均有真实结算覆盖时给出（缺月不按0）；「已知完整月份水量」为注销当年1月至注销月前一个月的完整月合计（不含注销月），仅供参考，非截至注销日精确量。样例仅月粒度、无日水量：截至注销日水量/变化量/变化率置空（不编造月内拆分、不年化）。注销日早于立户日的 ' + invalid.length + ' 户单列为无效日期。' + (['nature', 'admin', 'industry', 'community', 'collection'].includes(dimKey) ? ' 按维度汇总（取用户档案原字段，缺值记「未提供」；三类到户按性质归集，未抄表到户无来源置空）：上年全年水量合计/当年完整月参考合计任一成员缺对应基期则整组置空；各户注销日不同，参考期间起止不等长、不年化，完整月参考不冒充截至注销日精确量。' : '');
    if (!users.length) base.empty = '当前期间（' + periods[0] + '…' + last + '）暂无注销用户。';
    else if (!valid.length) base.empty = '当前期间暂无有效注销用户（注销日早于立户日的记录单列为无效日期）。';
    return base;
  }
  function computeUnregStock(item, dimKey, f, base) {
    const S = window.WBSupplement;
    base.columns = [{ key: 'name', label: '供水单位' }, { key: 'non_registered', label: '未注册用户数', unit: '户', dec: 0, align: 'right' }];
    base.kind = 'unregStock'; base.manualSource = true;
    if (!S) { base.empty = '手动填报模块未加载。'; return base; }
    const periods = E.periods(f); const last = periods[periods.length - 1];
    const O = Org(); let snode = effectiveNode();
    if (f.orgNodeId && O.has(f.orgNodeId)) snode = O.get(f.orgNodeId);
    else if (f.company) { const cn = O.nodeForCompany(f.company); if (cn) snode = cn; }
    const NARROW = ['nature', 'industry', 'admin', 'functional', 'org', 'team', 'line', 'meterType', 'keyword', 'booklet', 'caliberMm'];
    const narrowed = NARROW.some(k => { const v = f[k]; return v != null && v !== '' && !(Array.isArray(v) && !v.length); });
    if (narrowed || !snode || (snode.type !== 'group' && snode.type !== 'company')) {
      base.empty = '未注册用户数为单位整体末月存量口径：当前组织层级或对象筛选无对应单位存量，不适用（不列单位空值、不分摊）。';
      return base;
    }
    const nr = S.nonRegisteredFor(snode, last);
    const byUnit = nr.byUnit || [];
    base.rows = byUnit.map(u => ({ name: u.name, non_registered: u.complete ? u.non_registered_count : null, _raw: [] }));
    base.rows.push({ name: snode.type === 'group' ? '合计（集团）' : '合计（本公司）', non_registered: nr.complete ? nr.value : null, _raw: [] });
    base.sourceRows = S.viewRows(snode, [last]);
    base.note = '未注册用户数为期末存量（' + last + '），不跨月累加，区别于「未抄表到户」；由分公司领导/分公司管理员按绑定单位手动填报，未填为缺数（非0）。' + (snode.type === 'group' ? '集团合计需四家已接入单位均完整授权且填报完整；仅列当前身份完整授权的单位。' : '分公司口径仅含本公司，合计为本公司存量。');
    if (!byUnit.length) base.empty = '当前身份未完整授权任何供水单位，未注册存量不可读（缺数，不按0）。';
    return base;
  }
  function rankingCore(f, dimKey, compare, rowName, cohortCodes) {
    const curPeriods = E.periods(f); const len = curPeriods.length || 1;
    const basePeriods = curPeriods.map(p => compare === 'mom' ? shiftMonth(p, -len) : shiftYear(p, -1));
    let curFacts = rangeFacts(f, curPeriods); let baseFacts = rangeFacts(f, basePeriods);
    if (rowName) {
      const node = effectiveNode();
      if (dimKey === 'children' || !dimKey) { const kid = levelChildren(node).find(c => c.name === rowName); if (kid) { const ids = nodeIdsOf(kid); curFacts = curFacts.filter(r => ids.has(r.orgNodeId)); baseFacts = baseFacts.filter(r => ids.has(r.orgNodeId)); } }
      else { const field = DIM_FIELD[dimKey]; if (field) { curFacts = curFacts.filter(r => r[field] === rowName); baseFacts = baseFacts.filter(r => r[field] === rowName); } }
    }
    if (cohortCodes) { curFacts = curFacts.filter(r => cohortCodes.has(r.accountId)); baseFacts = baseFacts.filter(r => cohortCodes.has(r.accountId)); }
    const curMap = accountSum(curFacts), baseMap = accountSum(baseFacts), meta = accountMeta(curFacts);
    const um = D().userIndex;
    const comparable = [...curMap.keys()].filter(k => baseMap.has(k));
    const missingBase = [...curMap.keys()].filter(k => !baseMap.has(k)).map(k => { const r = meta.get(k); const u = um.get(Number(r && r.seriesKey)) || {}; return { accountId: k, name: u.name || k, current: curMap.get(k), orgLabel: r ? r.org : '' }; });
    const N = comparable.length; const K20 = N > 0 ? Math.max(1, Math.ceil(N * 0.2)) : 0;
    const mkRow = k => { const cur = curMap.get(k), prev = baseMap.get(k), delta = cur - prev; const r = meta.get(k) || {}; const u = um.get(Number(r.seriesKey)) || {}; return { accountId: k, name: u.name || k, current: cur, previous: prev, delta, changeRate: prev > 0 ? E.round(delta / prev * 100, 2) : null, orgLabel: r.org || '', userId: u.id, nature: r.nature, industry: r.industry }; };
    const build = dir => {
      const list = comparable.map(mkRow).filter(r => dir === 'increase' ? r.delta > 0 : r.delta < 0).sort((a, b) => (Math.abs(b.delta) - Math.abs(a.delta)) || String(a.accountId).localeCompare(String(b.accountId)));
      const totalChange = list.reduce((s, r) => s + Math.abs(r.delta), 0);
      let cum = 0, K80 = 0; for (let i = 0; i < list.length; i++) { cum += Math.abs(list[i].delta); if (cum >= totalChange * 0.8) { K80 = i + 1; break; } }
      const K = Math.min(K80, K20); const selected = list.slice(0, K); const selectedChange = selected.reduce((s, r) => s + Math.abs(r.delta), 0);
      const coverage = totalChange > 0 ? selectedChange / totalChange : null;
      return { total: list.length, totalChange, K80, K, coverage, selected, selectedChange, rows: list };
    };
    return { N, K20, missingBase, curPeriods, basePeriods, curFacts, baseFacts, increase: build('increase'), decrease: build('decrease') };
  }
  function computeChangeRank(item, dimKey, f, base) {
    const core = rankingCore(f, dimKey, 'yoy', null);
    const dirs = [['increase', '增加'], ['decrease', '减少']];
    const rows = []; const selectedCodes = new Set();
    for (const [key, label] of dirs) { const d = core[key]; let cum = 0; d.selected.forEach(r => { cum += Math.abs(r.delta); selectedCodes.add(r.accountId); rows.push(Object.assign({}, r, { direction: label, cumCoverage: d.totalChange > 0 ? E.round(cum / d.totalChange * 100, 2) : null })); }); }
    base.columns = [
      { key: 'name', label: '用户名称' }, { key: 'direction', label: '方向' }, { key: 'orgLabel', label: '所属组织' },
      { key: 'current', label: '本期水量', unit: 'm³', dec: 0, align: 'right' }, { key: 'previous', label: '上年同期水量', unit: 'm³', dec: 0, align: 'right' },
      { key: 'delta', label: '变化量', unit: 'm³', dec: 0, align: 'right' }, { key: 'changeRate', label: '变化率', unit: '%', dec: 2, align: 'right' }, { key: 'cumCoverage', label: '方向累计覆盖', unit: '%', dec: 2, align: 'right' }
    ];
    base.rows = rows; base.rank = core; base.kind = 'changeRank';
    base.sourceRows = rangeFacts(f, core.curPeriods).filter(r => selectedCodes.has(r.accountId));
    const inc = core.increase, dec = core.decrease;
    base.note = '可比较用户 N=' + core.N + '（含0变化，缺基期 ' + core.missingBase.length + ' 户单列不计0）；K20=ceil(20%×N)=' + core.K20 + '。增加方向 ' + inc.total + ' 户 K80=' + inc.K80 + ' 取 ' + inc.K + ' 户覆盖 ' + (inc.coverage == null ? '—' : E.round(inc.coverage * 100, 4) + '%') + '；减少方向 ' + dec.total + ' 户 K80=' + dec.K80 + ' 取 ' + dec.K + ' 户覆盖 ' + (dec.coverage == null ? '—' : E.round(dec.coverage * 100, 4) + '%') + '。按变化绝对值分别升降排序，取 min(K80,K20)，20%上限可致覆盖不足80%（已明示）。';
    if (!core.N) base.empty = '当前范围暂无可比较用户（本期与基期均有结算记录）。';
    return base;
  }
  function computePrice(item, f, base) {
    const curPeriods = E.periods(f); const basePeriods = curPeriods.map(p => shiftYear(p, -1));
    const curFacts = facts(f); const baseFacts = rangeFacts(f, basePeriods);
    const curB = groupBy(curFacts, r => r.nature); const baseB = groupBy(baseFacts, r => r.nature);
    const curAgg = new Map(curB.map(b => [b.name, { rows: b.rows, a: E.aggregate(b.rows, f) }]));
    const baseAgg = new Map(baseB.map(b => [b.name, E.aggregate(b.rows, f)]));
    const names = [...new Set(curB.map(b => b.name).concat(baseB.map(b => b.name)))];
    const curVolTotal = E.sum([...curAgg.values()].map(x => ({ v: x.a.sold_vol })), 'v');
    const baseVolTotal = E.sum([...baseAgg.values()].map(a => ({ v: a.sold_vol })), 'v');
    const curRevTotal = E.sum([...curAgg.values()].map(x => ({ v: x.a.water_revenue })), 'v');
    const baseRevTotal = E.sum([...baseAgg.values()].map(a => ({ v: a.water_revenue })), 'v');
    const overallCur = curVolTotal > 0 ? curRevTotal / curVolTotal : null;
    const overallPrev = baseVolTotal > 0 ? baseRevTotal / baseVolTotal : null;
    base.columns = [
      { key: 'name', label: '用水性质' },
      { key: 'base', label: '基本水价', unit: '元/m³', dec: 2, align: 'right' },
      { key: 'afterTax', label: '税后单价', unit: '元/m³', dec: 3, align: 'right' },
      { key: 'vol', label: '本期水量', unit: 'm³', dec: 0, align: 'right' },
      { key: 'prevVol', label: '上年同期水量', unit: 'm³', dec: 0, align: 'right' },
      { key: 'price', label: '本期综合单价', unit: '元/m³', dec: 3, align: 'right' },
      { key: 'prevPrice', label: '上年同期综合单价', unit: '元/m³', dec: 3, align: 'right' },
      { key: 'structure', label: '结构贡献', unit: '元/m³', dec: 4, align: 'right' },
      { key: 'priceContrib', label: '单价变化贡献', unit: '元/m³', dec: 4, align: 'right' }
    ];
    let complete = names.length > 0; let sumS = 0, sumP = 0;
    base.rows = names.map(name => {
      const c = curAgg.get(name); const a = c ? c.a : null; const p = baseAgg.get(name) || null;
      const curVol = a ? a.sold_vol : 0; const prevVol = p ? p.sold_vol : null;
      const curPrice = a && a.sold_vol > 0 ? a.avg_price_yuan : null;
      const prevPrice = p && p.sold_vol > 0 ? p.avg_price_yuan : null;
      const curShare = curVolTotal > 0 ? curVol / curVolTotal : null;
      const prevShare = baseVolTotal > 0 && prevVol != null ? prevVol / baseVolTotal : null;
      const structure = curShare != null && prevShare != null && prevPrice != null ? (curShare - prevShare) * prevPrice : null;
      const priceContrib = curShare != null && curPrice != null && prevPrice != null ? curShare * (curPrice - prevPrice) : null;
      if (structure == null || priceContrib == null) complete = false; else { sumS += structure; sumP += priceContrib; }
      return { name: name, base: null, afterTax: null, vol: a ? a.sold_vol : null, prevVol: prevVol, price: curPrice, prevPrice: prevPrice, structure: structure == null ? null : E.round(structure, 4), priceContrib: priceContrib == null ? null : E.round(priceContrib, 4), _raw: c ? c.rows : [] };
    }).sort((x, y) => (y.vol || 0) - (x.vol || 0));
    base.sourceRows = curFacts.concat(baseFacts);
    base.chart = null; /* 月报第十五章以单价影响分解表为准（PDF p15 表为主），不另造饼图。 */
    const rangeText = '本期 ' + curPeriods[0] + '…' + curPeriods[curPeriods.length - 1] + '，上年同期 ' + basePeriods[0] + '…' + basePeriods[basePeriods.length - 1];
    const decomp = complete && overallCur != null && overallPrev != null
      ? '整体综合单价 ' + E.fmt(overallPrev, 3) + '→' + E.fmt(overallCur, 3) + ' 元/m³，变动 ' + E.fmt(overallCur - overallPrev, 4) + '；结构贡献合计 ' + E.fmt(sumS, 4) + '＋单价变化贡献合计 ' + E.fmt(sumP, 4) + '＝整体变动（完整分解）。'
      : '上年同期缺数或水量基数为0，综合单价变动不可完整分解（不补价、不推定）。';
    base.note = '综合单价=水费收入/售水量（water_revenue/sold_vol），非税后口径；基本水价、税后单价缺真实字段，置空不编税率。' + rangeText + '，仅使用可取得的真实结算facts，缺失不补0。结构贡献=(本期水量占比−同期占比)×同期综合单价；单价变化贡献=本期占比×(本期综合单价−同期综合单价)；仅量化事实，不自动归因。' + decomp;
    base.totalsNote = decomp;
    base.totals = { avg_price_yuan: overallCur };
    if (!base.rows.length) base.empty = '当前范围暂无单价分析数据。';
    return base;
  }
  function scopedBills(f) { const ids = nodeIdsOf(effectiveNode()); return scoped('bills').filter(b => ids.has(b.orgNodeId)); }
  function computeBills(item, dimKey, f, base) {
    const bills = scopedBills(f);
    const field = item.field === 'received' ? 'received' : 'arrears';
    const buckets = dimKey === 'children'
      ? childBuckets(f).map(b => ({ name: b.name, rows: bills.filter(x => nodeIdsOf(b.node).has(x.orgNodeId)) }))
      : groupBy(bills, b => b[dimKey === 'nature' ? 'nature' : 'company']);
    base.columns = [{ key: 'name', label: DIM_LABELS[dimKey] || '名称' }, { key: 'value', label: field === 'received' ? '实收水费' : '应收账款', unit: '元', dec: 2, align: 'right' }, { key: 'count', label: '笔数', unit: '笔', dec: 0, align: 'right' }];
    base.rows = buckets.map(b => ({ name: b.name, value: E.round(E.sum(b.rows, field), 2), count: b.rows.length, _raw: b.rows })).sort((a, b) => b.value - a.value);
    base.sourceRows = bills;
    base.chart = { kind: 'bar', series: [{ key: 'value', name: field === 'received' ? '实收水费' : '应收账款', type: 'bar', yAxis: 0 }] };
    if (!base.rows.length) base.empty = '当前范围暂无账单数据。';
    return base;
  }
  function computeArrearsDetail(item, f, base) {
    const bills = scopedBills(f).filter(b => (b.arrears || 0) > 0);
    base.columns = [{ key: 'period', label: '开账年月' }, { key: 'name', label: '用户' }, { key: 'nature', label: '用水性质' }, { key: 'org', label: '组织' }, { key: 'amount', label: '应收', unit: '元', dec: 2, align: 'right' }, { key: 'received', label: '实收', unit: '元', dec: 2, align: 'right' }, { key: 'arrears', label: '欠费', unit: '元', dec: 2, align: 'right' }];
    const um = D().userIndex;
    base.rows = bills.map(b => { const u = um.get(b.userId) || {}; return { period: b.billingMonth || b.period, name: u.name || b.userId, nature: b.nature, org: b.org, amount: b.amount, received: b.received, arrears: b.arrears, _raw: [b] }; });
    base.sourceRows = bills;
    base.note = '共 ' + bills.length + ' 笔欠费，模型保留全集（界面按 TopN 渲染，导出为完整明细）；可按当前周期导出CSV。';
    if (!bills.length) base.empty = '当前范围暂无欠费明细。';
    return base;
  }
  function computePriorRecover(item, f, base) {
    const bills = scopedBills(f).filter(b => b.paidAt && b.paidAt.slice(0, 4) > (b.billingMonth || b.period).slice(0, 4));
    base.columns = [{ key: 'name', label: '组织' }, { key: 'value', label: '往年水费收回', unit: '元', dec: 2, align: 'right' }, { key: 'count', label: '笔数', unit: '笔', dec: 0, align: 'right' }];
    const buckets = groupBy(bills, b => b.org);
    base.rows = buckets.map(b => ({ name: b.name, value: E.round(E.sum(b.rows, 'received'), 2), count: b.rows.length, _raw: b.rows }));
    base.sourceRows = bills;
    base.chart = { kind: 'bar', series: [{ key: 'value', name: '往年收回', type: 'bar', yAxis: 0 }] };
    if (!bills.length) base.empty = '当前范围暂无往年水费收回记录。';
    return base;
  }
  /* ---------- 表务督查 ---------- */
  function nodeRows(name) {
    const ids = nodeIdsOf(effectiveNode());
    return scoped(name).filter(r => ids.has(r.orgNodeId));
  }
  function avg(a) { const v = a.filter(x => x != null && isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; }
  function countTable(rows, keyFn, label, unit) {
    const g = groupBy(rows, keyFn);
    const out = g.map(b => ({ name: b.name, count: b.rows.length, _raw: b.rows })).sort((a, b) => b.count - a.count);
    return { columns: [{ key: 'name', label }, { key: 'count', label: '数量', unit: unit || '台', dec: 0, align: 'right' }], rows: out, chart: { kind: 'bar', series: [{ key: 'count', name: '数量', type: 'bar' }] }, sourceRows: rows };
  }
  function computeMeterInfo(item, dimKey, f, base) {
    const rows = nodeRows('meterInventory');
    if (!rows.length) { base.empty = '当前范围暂无水表台账数据。'; return base; }
    const keyFn = dimKey === 'children' ? (r => { const n = Org().get(r.orgNodeId); return n ? n.name : '未提供'; })
      : dimKey === 'installYear' ? (r => (r.installDate || '').slice(0, 4) || '未提供')
      : dimKey === 'industry' ? (r => { const u = r.userId != null ? D().userIndex.get(r.userId) : null; return u && u.industry ? u.industry : '未提供'; })
      : (r => r[DIM_FIELD[dimKey]] || '未提供');
    Object.assign(base, countTable(rows, keyFn, DIM_LABELS[dimKey] || '名称'));
    base.note = (base.note ? base.note + ' ' : '') + '水表信息按表类型/厂家/安装年份/口径/行业统计；行业经水表档案 userId 关联用户用水性质行业，库存表无用户归属标「未提供」，不推定行业。';
    return base;
  }
  function computeMeterCategory(item, f, base) {
    const rows = nodeRows('meterInventory');
    if (!rows.length) { base.empty = '当前范围暂无水表台账数据。'; return base; }
    Object.assign(base, countTable(rows, r => r.meterType || '未提供', '水表类别'));
    return base;
  }
  function computeMeterUnreg(item, f, base) {
    const rows = nodeRows('meterInventory').filter(r => !r.userId);
    const end = windowEnd(f);
    const movements = protoNodeRows('warehouseMovements').filter(m => protoAtOrBefore(m, end));
    const latest = latestMovementByMeter(movements);
    const whs = protoNodeRows('warehouses'); const whById = new Map(whs.map(w => [String(w.id), w]));
    base.columns = [{ key: 'barcode', label: '条形码' }, { key: 'meterType', label: '表类型' }, { key: 'caliber', label: '口径' }, { key: 'manufacturer', label: '厂家' }, { key: 'warehouse', label: '仓库' }, { key: 'address', label: '存放地址' }, { key: 'movementType', label: '最近出入库' }, { key: 'movementTime', label: '出入库时间' }, { key: 'status', label: '存放状态' }];
    base.rows = rows.map(r => {
      const mv = latest.get(String(r.meterId || r.barcode)); const wh = mv ? whById.get(String(mv.warehouseId)) : null;
      return { barcode: r.barcode || r.meterId, meterType: r.meterType || '—', caliber: r.caliber || '—', manufacturer: r.manufacturer || '—', warehouse: (wh && wh.name) || r.warehouse || '—', address: (mv && mv.address) || (wh && wh.address) || '—', movementType: mv ? mv.eventType : '—', movementTime: mv ? protoEventAt(mv) : '—', status: (mv && mv.status) || r.status || '—', _raw: [r, mv, wh].filter(Boolean) };
    });
    base.sourceRows = rows.concat(movements, whs);
    base.note = (base.note ? base.note + ' ' : '') + '存放地址与出入库时间取原型仓库台账（warehouseMovements）截至查询期末的最新事件；无事件记录显示—，不按0。';
    if (!rows.length) base.empty = '当前范围暂无未立户水表。';
    return base;
  }
  function latestMovementByMeter(movements) {
    const latest = new Map();
    movements.forEach(m => { const key = String(m.meterId); const cur = latest.get(key); if (!cur || String(m.eventAt) > String(cur.eventAt) || (String(m.eventAt) === String(cur.eventAt) && String(m.id) > String(cur.id))) latest.set(key, m); });
    return latest;
  }
  function ledgerIndex() {
    const byUser = new Map(), byMeter = new Map();
    scoped('meterInventory').forEach(m => { if (m.userId != null && !byUser.has(m.userId)) byUser.set(m.userId, m); if (m.meterId != null && !byMeter.has(m.meterId)) byMeter.set(m.meterId, m); });
    return { byUser, byMeter };
  }
  function ledgerRowOf(r, idx) { return (r.userId != null && idx.byUser.get(r.userId)) || (r.newMeter && idx.byMeter.get(r.newMeter)) || (r.oldMeter && idx.byMeter.get(r.oldMeter)) || null; }
  function computeMeterSwapCount(item, dimKey, f, base) {
    const periods = new Set(E.periods(f));
    const rows = nodeRows('meterEvents').filter(r => r.type === item.swap && periods.has(r.period));
    if (!rows.length) { base.empty = '当前范围/周期暂无' + item.swap + '记录。'; return base; }
    const idx = ledgerIndex();
    const keyFn = dimKey === 'children' ? (r => { const n = Org().get(r.orgNodeId); return n ? n.name : '未提供'; })
      : dimKey === 'manufacturer' ? (r => { const m = ledgerRowOf(r, idx); return m && m.manufacturer ? m.manufacturer : '未提供'; })
      : (r => r[DIM_FIELD[dimKey]] || '未提供');
    Object.assign(base, countTable(rows, keyFn, DIM_LABELS[dimKey] || '名称', '次'));
    base.note = (base.note ? base.note + ' ' : '') + '按换表事件次数统计；厂家按水表台账真实关联（户号/新旧表号），无台账关联记「未提供」，不凭空补造。';
    return base;
  }
  function computeMeterSwap(item, dimKey, f, base) {
    const periods = new Set(E.periods(f));
    const swapN = [2, 3].includes(Number(WB.state.swapN)) ? Number(WB.state.swapN) : 2;
    const rows = nodeRows('meterEvents').filter(r => r.type === item.swap && periods.has(r.period));
    base.columns = [{ key: 'name', label: '户号/卡号' }, { key: 'date', label: '换表日期' }, { key: 'beforeAvg', label: '换表前均量', unit: 'm³', dec: 2, align: 'right' }, { key: 'afterAvg', label: '换表后均量', unit: 'm³', dec: 2, align: 'right' }, { key: 'changePct', label: '变化率', unit: '%', dec: 2, align: 'right' }];
    base.rows = rows.map(r => {
      const before = (r.before || []).slice(-swapN), after = (r.after || []).slice(0, swapN);
      const ok = before.length === swapN && after.length === swapN;
      const b = ok ? avg(before) : null, a = ok ? avg(after) : null;
      return { name: r.card || r.userId, date: r.date, beforeAvg: b == null ? null : E.round(b, 2), afterAvg: a == null ? null : E.round(a, 2), changePct: (b != null && b > 0 && a != null) ? E.round((a - b) / b * 100, 2) : null, _raw: [r] };
    });
    base.sourceRows = rows;
    base.note = (base.note ? base.note + ' ' : '') + '换表前后各取最近 N 个周期水量均值对比（N 仅 2/3，默认 2，与报表 P-RPT-004/005 同参数）；序列不足 N 或同期缺数不按0。';
    if (!rows.length) base.empty = '当前范围/周期暂无' + item.swap + '记录。';
    return base;
  }
  function computeMeterOnline(item, dimKey, f, base) {
    const rows = nodeRows('remoteReadings');
    if (!rows.length) { base.empty = '当前范围暂无远传水表通讯数据。'; return base; }
    const ps = E.periods(f);
    const month = ps[ps.length - 1] || f.month || '2026-10';
    const snapMonth = rows.reduce((m, r) => (r.date && r.date > m ? r.date : m), '').slice(0, 7);
    if (snapMonth && month !== snapMonth) {
      base.empty = '远传通讯源仅有 ' + snapMonth + ' 当前快照，所选 ' + month + ' 无历史在线状态数据（缺数）；不以当前快照通讯状态推定历史月在线。';
      return base;
    }
    const idx = ledgerIndex();
    const byUser = new Map();
    rows.forEach(r => { const cur = byUser.get(r.userId); if (!cur || (r.lastCommunication || '') > (cur.lastCommunication || '')) byUser.set(r.userId, r); });
    const meters = Array.from(byUser.values());
    const isOnline = r => String(r.lastCommunication || '').slice(0, 7) === month;
    const keyFn = dimKey === 'children' ? (r => { const n = Org().get(r.orgNodeId); return n ? n.name : '未提供'; })
      : dimKey === 'manufacturer' ? (r => { const m = ledgerRowOf(r, idx); return m && m.manufacturer ? m.manufacturer : '未提供'; })
      : (r => r.caliber || '未提供');
    const buckets = groupBy(meters, keyFn);
    base.columns = [{ key: 'name', label: DIM_LABELS[dimKey] || '口径' }, { key: 'total', label: '远传表数', dec: 0, align: 'right' }, { key: 'online', label: '在线', dec: 0, align: 'right' }, { key: 'offline', label: '离线', dec: 0, align: 'right' }, { key: 'rate', label: '在线率', unit: '%', dec: 2, align: 'right' }];
    base.rows = buckets.map(b => { const on = b.rows.filter(isOnline).length; return { name: b.name, total: b.rows.length, online: on, offline: b.rows.length - on, rate: b.rows.length ? E.round(on / b.rows.length * 100, 2) : null, _raw: b.rows }; }).sort((a, b) => b.total - a.total);
    base.chart = { kind: 'bar', series: [{ key: 'rate', name: '在线率', type: 'bar' }] };
    base.sourceRows = meters.filter(r => !isOnline(r));
    base.note = (base.note ? base.note + ' ' : '') + '在线=最近通讯时间落在快照月（' + month + '）；通讯源为当前快照（' + (snapMonth || month) + '，按日采集），无历史月在线状态，历史期间缺数不推定；离线明细可导出。';
    return base;
  }
  function computeWarehouse(item, f, base) {
    const wh = scoped('warehouses').filter(w => w.orgNodeId && nodeIdsOf(effectiveNode()).has(w.orgNodeId));
    const inv = nodeRows('meterInventory');
    const end = windowEnd(f);
    const protoWh = protoNodeRows('warehouses');
    const movements = protoNodeRows('warehouseMovements').filter(m => protoAtOrBefore(m, end));
    const latest = latestMovementByMeter(movements);
    const byWh = new Map(); latest.forEach(m => { const k = String(m.warehouseId); if (!byWh.has(k)) byWh.set(k, []); byWh.get(k).push(m); });
    base.columns = [{ key: 'name', label: '仓库' }, { key: 'level', label: '层级' }, { key: 'org', label: '单位/营业所' }, { key: 'type', label: '类型' }, { key: 'stock', label: '在库', dec: 0, align: 'right' }, { key: 'turn', label: '周转', dec: 0, align: 'right' }, { key: 'check', label: '待检', dec: 0, align: 'right' }, { key: 'scrap', label: '报废入库', dec: 0, align: 'right' }, { key: 'out', label: '已出库', dec: 0, align: 'right' }, { key: 'total', label: '合计', dec: 0, align: 'right' }];
    const oldRows = wh.map(w => { const rs = inv.filter(r => r.warehouse === w.name); const c = s => rs.filter(r => r.status === s).length; const stock = c('在库'), turn = c('周转'), check = c('待检'), scrap = c('报废'); return { name: w.name, level: '分公司中心库', org: w.company, type: w.type, stock, turn, check, scrap, out: null, total: stock + turn + check + scrap, _raw: rs.concat([w]) }; });
    const newRows = protoWh.map(w => { const ms = byWh.get(String(w.id)) || []; const stock = ms.filter(m => protoInStockStatus(m.status)).length; const scrap = ms.filter(m => m.status === '报废入库').length; const out = ms.filter(m => protoOutStatus(m.status)).length; const n = Org().get(w.orgNodeId); return { name: w.name, level: '营业所/网格库', org: (n && n.name) || w.unitId || '', type: w.type, stock, turn: null, check: null, scrap, out, total: ms.length, _raw: ms.concat([w]) }; });
    base.rows = oldRows.concat(newRows);
    base.sourceRows = base.rows.flatMap(r => r._raw);
    base.note = (base.note ? base.note + ' ' : '') + '分公司中心库为旧快照（按库存状态计数）；营业所/网格级仓库取原型台账（warehouses+warehouseMovements），按截至查询期末每表最新出入库事件状态计数，报废入库计入在库、周转/待检该台账不追踪显示—。两类仓库并列展示，不互相替代。';
    if (!base.rows.length) base.empty = '当前范围暂无仓库数据。';
    return base;
  }
  function computeBooklet(item, f, base) {
    const users = queryUsers(f);
    Object.assign(base, countTable(users, u => u.booklet || '未提供', '册本', '户'));
    base.note = (base.note ? base.note + ' ' : '') + '单月抄/双月抄/每月抄频率字段未接入，按册本户数统计。';
    if (!users.length) base.empty = '当前范围暂无用户册本数据。';
    return base;
  }
  function computeBookNew(item, f, base) {
    const events = protoUserRows('bookletEvents', f, { period: true }).rows.filter(e => e.eventType === 'ENROLL');
    Object.assign(base, countTable(events, e => { const n = Org().get(e.orgNodeId); return n ? n.name : '未提供'; }, DIM_LABELS.children, '户'));
    base.note = (base.note ? base.note + ' ' : '') + '仅按原型独立入册事件（bookletEvents.ENROLL，eventAt）统计，不以立户日期替代；事件须关联当前范围授权用户。';
    if (!events.length) base.empty = '当前范围所选期间暂无新增入册事件。';
    return base;
  }
  /* ---------- 原型补充数据集消费（小区考核总表关联 / 政策成员 / 口径变更 / 册本调整 / 远传告警 / typed 调整明细） ---------- */
  function computeCommunity(item, dimKey, f, base) {
    const eligible = eligibleUsers(f);
    const links = protoList('communityMeterLinks').filter(r => protoOwns(r) && protoNodeOk(r));
    const fs = facts(f);
    const volByUser = new Map();
    fs.forEach(fr => { const u = protoUserOf(fr, eligible); if (!u) return; const k = String(u.id); volByUser.set(k, (volByUser.get(k) || 0) + (fr.sold_vol || 0)); });
    const groups = new Map();
    links.forEach(r => { const key = String(r.assessmentMeterId || r.communityId); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r); });
    const node = effectiveNode(); const kids = levelChildren(node);
    const owner = new Map(); kids.forEach(k => nodeIdsOf(k).forEach(id => owner.set(id, k)));
    const detail = []; const usedLinks = []; const usedUsers = new Set(); const communityRows = [];
    groups.forEach((ls, key) => {
      const eligibleMembers = ls.filter(r => (r.role === 'DIRECT' || r.role === 'SECONDARY') && protoUserOf(r, eligible));
      if (!eligibleMembers.length) return; /* 部分筛选不泄漏整小区：仅纳入含授权关联用户的考核总表组 */
      const parents = ls.filter(r => r.role === 'ASSESSMENT');
      const assessmentId = (parents[0] && parents[0].assessmentMeterId) || (ls[0] && ls[0].assessmentMeterId) || key;
      const communityName = (ls[0] && ls[0].communityName) || '—';
      const direct = eligibleMembers.filter(r => r.role === 'DIRECT').length;
      const secondary = eligibleMembers.filter(r => r.role === 'SECONDARY').length;
      const userIds = new Set(eligibleMembers.map(r => String(protoUserOf(r, eligible).id)));
      let vol = 0; userIds.forEach(id => { vol += volByUser.get(id) || 0; usedUsers.add(id); });
      const child = owner.get(ls[0].orgNodeId);
      const included = parents.concat(eligibleMembers); /* 仅父级+授权合格成员：被 industry/booklet/functional 筛掉的成员不暴露 meterId/raw，也不入来源行 */
      communityRows.push({ name: communityName, childName: child ? child.name : (node ? node.name : '当前范围'), assessmentMeterId: assessmentId, assessmentCount: parents.length, directCount: direct, secondaryCount: secondary, userCount: userIds.size, sold_vol: vol / 10000, _raw: included });
      included.forEach(r => { const u = protoUserOf(r, eligible); detail.push({ community: communityName, assessmentMeterId: assessmentId, role: roleLabel(r.role), name: u ? u.name : (r.role === 'ASSESSMENT' ? '考核总表' : '—'), accountId: u ? u.unified_code : '—', meterId: r.meterId || '—', sold_vol: u ? E.round((volByUser.get(String(u.id)) || 0) / 10000, 4) : null, userId: u ? u.id : null, _raw: [r] }); });
      usedLinks.push(...included);
    });
    let rows;
    if (dimKey === 'children') {
      rows = groupBy(communityRows, r => r.childName).map(b => { const o = { name: b.name, assessmentMeterId: '—', assessmentCount: 0, directCount: 0, secondaryCount: 0, userCount: 0, sold_vol: 0, _raw: [] }; b.rows.forEach(r => { o.assessmentCount += r.assessmentCount; o.directCount += r.directCount; o.secondaryCount += r.secondaryCount; o.userCount += r.userCount; o.sold_vol += r.sold_vol; o._raw.push(...r._raw); }); o.sold_vol = E.round(o.sold_vol, 2); return o; });
    } else {
      rows = communityRows.map(r => Object.assign({}, r, { sold_vol: E.round(r.sold_vol, 2) }));
    }
    rows.sort((a, b) => (b.sold_vol || 0) - (a.sold_vol || 0));
    base.columns = [{ key: 'name', label: dimKey === 'children' ? '节点' : '小区' }, { key: 'assessmentMeterId', label: '考核总表ID' }, { key: 'assessmentCount', label: '考核总表', dec: 0, align: 'right' }, { key: 'directCount', label: '直供表', dec: 0, align: 'right' }, { key: 'secondaryCount', label: '二次加压表', dec: 0, align: 'right' }, { key: 'userCount', label: '关联用户', dec: 0, align: 'right' }, { key: 'sold_vol', label: '售水量', unit: '万m³', dec: 2, align: 'right' }];
    base.rows = rows;
    base.detail = { columns: [{ key: 'community', label: '小区' }, { key: 'assessmentMeterId', label: '考核总表ID' }, { key: 'role', label: '表角色' }, { key: 'name', label: '用户' }, { key: 'accountId', label: '户号' }, { key: 'meterId', label: '水表ID' }, { key: 'sold_vol', label: '售水量', unit: '万m³', dec: 4, align: 'right' }], rows: detail };
    base.chart = { kind: 'bar', series: [{ key: 'sold_vol', name: '售水量', type: 'bar' }] };
    const consumedFacts = fs.filter(fr => { const u = protoUserOf(fr, eligible); return u && usedUsers.has(String(u.id)); });
    base.sourceRows = usedLinks.concat(consumedFacts);
    base.totals = null;
    base.note = (base.note ? base.note + ' ' : '') + '按考核总表（assessmentMeterId）关联直供表/二次加压表与用户；仅统计当前范围授权用户，部分筛选不泄漏整小区；售水量为关联用户结算水量合计，不覆盖小区总表口径。通过关联明细查看总表→分表及用户对应关系。';
    if (!rows.length) base.empty = '当前范围暂无小区考核总表关联数据。';
    return base;
  }
  function computePolicy(item, f, base) {
    const ps = new Set(E.periods(f)); const eligible = eligibleUsers(f);
    const memberships = protoList('policyMembership').filter(r => protoOwns(r) && protoNodeOk(r) && protoUserOf(r, eligible) && protoValidIn(r, ps));
    const memberPeriods = new Map(); const policyNames = new Map();
    memberships.forEach(r => { const u = protoUserOf(r, eligible); const key = String(u.id); if (!memberPeriods.has(key)) memberPeriods.set(key, new Set()); ps.forEach(p => { if (protoValidForPeriod(r, p)) memberPeriods.get(key).add(p); }); const ind = u.industry || '未提供'; if (!policyNames.has(ind)) policyNames.set(ind, new Set()); if (r.policyName) policyNames.get(ind).add(r.policyName); });
    const rows = facts(f).filter(r => { const u = protoUserOf(r, eligible); if (!u) return false; const set = memberPeriods.get(String(u.id)); const p = f.caliber === '财务自然月' ? (r.naturalMonth || r.period) : r.period; return set && set.has(p); });
    const buckets = groupBy(rows, r => r.industry || '未提供');
    base.columns = [{ key: 'name', label: '行业' }, { key: 'policy', label: '涉及政策' }, { key: 'userCount', label: '涉及用户', dec: 0, align: 'right' }].concat(metricColumns(item.metrics));
    base.rows = buckets.map(b => { const a = E.aggregate(b.rows, f); const users = new Set(b.rows.map(r => { const u = protoUserOf(r, eligible); return u ? String(u.id) : null; }).filter(Boolean)); const o = { name: b.name, policy: Array.from(policyNames.get(b.name) || []).join('、') || '—', userCount: users.size, _raw: b.rows }; item.metrics.forEach(k => o[k] = METRICS[k].get(a)); return o; }).sort((a, b) => (b.sold_vol || 0) - (a.sold_vol || 0));
    base.sourceRows = memberships.concat(rows);
    base.chart = { kind: 'bar', series: [{ key: 'sold_vol', name: '售水量', type: 'bar' }] };
    base.note = (base.note ? base.note + ' ' : '') + '涉及水价优惠政策用户按原型政策成员名单（policyMembership）×行业代码×有效期逐月判定，仅统计当前范围授权用户匹配到结算水量的户；非全行业代理。';
    if (!base.rows.length) base.empty = memberships.length ? '当前范围所选期间暂无政策成员匹配水量。' : '当前范围暂无水价优惠政策成员原型名单。';
    return base;
  }
  function computeCaliberChange(item, f, base) {
    const rows = protoUserRows('caliberChanges', f, { period: true }).rows;
    const eligible = eligibleUsers(f);
    base.columns = [{ key: 'name', label: '用户' }, { key: 'meterId', label: '水表' }, { key: 'effectiveDate', label: '变更日期' }, { key: 'beforeCaliber', label: '变更前口径' }, { key: 'afterCaliber', label: '变更后口径' }, { key: 'reason', label: '变更原因' }, { key: 'org', label: '组织' }];
    base.rows = rows.map(r => { const u = protoUserOf(r, eligible) || {}; return { name: u.name || r.userId, meterId: r.meterId || '—', effectiveDate: String(r.effectiveDate || r.eventAt || '').slice(0, 10) || '—', beforeCaliber: r.beforeCaliber || '—', afterCaliber: r.afterCaliber || '—', reason: r.reason || '—', org: u.org || '', _raw: [r] }; });
    base.sourceRows = rows;
    base.note = (base.note ? base.note + ' ' : '') + '水表口径变更按原型变更事件（caliberChanges）统计，展示变更前后口径与生效日期；区别于用水性质变更（P015，仍缺源）。';
    if (!rows.length) base.empty = '当前范围所选期间暂无水表口径变更事件。';
    return base;
  }
  function computeBookletAdjust(item, f, base) {
    const rows = protoUserRows('bookletEvents', f, { period: true }).rows.filter(e => e.eventType === 'TRANSFER');
    const eligible = eligibleUsers(f);
    base.columns = [{ key: 'name', label: '用户' }, { key: 'eventDate', label: '调整日期' }, { key: 'beforeBooklet', label: '调整前册本' }, { key: 'afterBooklet', label: '调整后册本' }, { key: 'reason', label: '调整原因' }, { key: 'org', label: '组织' }];
    base.rows = rows.map(e => { const u = protoUserOf(e, eligible) || {}; return { name: u.name || e.userId, eventDate: protoEventAt(e) || '—', beforeBooklet: e.beforeBooklet || '—', afterBooklet: e.afterBooklet || '—', reason: e.reason || '—', org: u.org || '', _raw: [e] }; });
    base.sourceRows = rows;
    base.note = (base.note ? base.note + ' ' : '') + '册本调整按原型独立调册事件（bookletEvents.TRANSFER，eventAt）统计，展示调整前后册本；与新增入册（ENROLL）分离，不以立户日期替代。';
    if (!rows.length) base.empty = '当前范围所选期间暂无册本调整事件。';
    return base;
  }
  function computeRemoteAlert(item, f, base) {
    const rows = protoUserRows('remoteAlerts', f, { period: true }).rows.filter(r => !item.alertType || r.alertType === item.alertType);
    const eligible = eligibleUsers(f);
    base.columns = [{ key: 'name', label: '用户' }, { key: 'meterId', label: '水表' }, { key: 'period', label: '账期' }, { key: 'openedAt', label: '告警时间' }, { key: 'value', label: '告警值' }, { key: 'threshold', label: '阈值' }, { key: 'status', label: '状态' }, { key: 'org', label: '组织' }];
    base.rows = rows.map(r => { const u = protoUserOf(r, eligible) || {}; return { name: u.name || r.userId, meterId: r.meterId || '—', period: protoPeriodOf(r), openedAt: String(r.openedAt || '').slice(0, 10) || '—', value: r.value == null ? '—' : r.value, threshold: r.threshold == null ? '—' : r.threshold, status: r.status || '—', org: u.org || '', _raw: [r] }; });
    base.sourceRows = rows;
    base.note = (base.note ? base.note + ' ' : '') + '远传告警按原型告警事件（remoteAlerts，alertType=' + (item.alertType || '全部') + '）统计，仅当前范围授权用户。';
    if (!rows.length) base.empty = '当前范围所选期间暂无该类远传告警。';
    return base;
  }
  function computeAdjustmentDetail(item, f, base) {
    const rows = protoUserRows('adjustmentDetails', f, { period: true }).rows.filter(r => !item.field || r.field === item.field);
    const eligible = eligibleUsers(f);
    const unitOf = { waterVolume: 'm³', unitPrice: '元/m³', penalty: '元' };
    const unit = unitOf[item.field] || '';
    base.columns = [{ key: 'name', label: '用户' }, { key: 'period', label: '账期' }, { key: 'effectiveAt', label: '生效时间' }, { key: 'beforeValue', label: '调整前', unit: unit, dec: 3, align: 'right' }, { key: 'afterValue', label: '调整后', unit: unit, dec: 3, align: 'right' }, { key: 'delta', label: '变化量', unit: unit, dec: 3, align: 'right' }, { key: 'reason', label: '调整原因' }, { key: 'org', label: '组织' }];
    base.rows = rows.map(r => { const u = protoUserOf(r, eligible) || {}; const before = r.beforeValue == null ? null : Number(r.beforeValue); const after = r.afterValue == null ? null : Number(r.afterValue); const delta = r.delta != null ? Number(r.delta) : (before != null && after != null ? after - before : null); return { name: u.name || r.userId, period: protoPeriodOf(r), effectiveAt: String(r.effectiveAt || '').slice(0, 10) || '—', beforeValue: before, afterValue: after, delta: delta == null ? null : E.round(delta, 3), reason: r.reason || '—', org: u.org || '', _raw: [r] }; });
    base.sourceRows = rows;
    base.note = (base.note ? base.note + ' ' : '') + '调整明细按原型调整台账（adjustmentDetails，field=' + (item.field || '全部') + '）统计，变化量＝调整后−调整前，单位' + (unit || '—') + '；仅当前范围授权用户。';
    if (!rows.length) base.empty = '当前范围所选期间暂无该类调整明细。';
    return base;
  }
  function computeReadRate(item, dimKey, f, base, kind) {
    const periods = new Set(E.periods(f));
    const natural = f.caliber === '财务自然月';
    const monthOf = r => natural ? String(r.dueDate || '').slice(0, 7) : (r.period || String(r.dueDate || '').slice(0, 7));
    const tasks = nodeRows('readTasks').filter(r => { const m = monthOf(r); return !!m && periods.has(m); });
    const buckets = dimKey === 'line' ? groupBy(tasks, r => r.line || '未提供') : groupBy(tasks, r => { const n = Org().get(r.orgNodeId); return n ? n.name : '未提供'; });
    const num = r => kind === 'read' ? (r.status === '已抄' ? 1 : 0) : kind === 'arrival' ? (r.arrived ? 1 : 0) : (r.estimated || r.status === '估抄' ? 1 : 0);
    const numLabel = kind === 'read' ? '抄见数' : kind === 'arrival' ? '到位数' : '估抄数';
    const rateLabel = kind === 'read' ? '抄见率' : kind === 'arrival' ? '到位率' : '估抄率';
    base.columns = [{ key: 'name', label: dimKey === 'line' ? '线路' : '节点' }, { key: 'total', label: '应抄数', dec: 0, align: 'right' }, { key: 'num', label: numLabel, dec: 0, align: 'right' }, { key: 'rate', label: rateLabel, unit: '%', dec: 2, align: 'right' }];
    base.rows = buckets.map(b => { const n = b.rows.reduce((s, r) => s + num(r), 0); return { name: b.name, total: b.rows.length, num: n, rate: b.rows.length ? E.round(n / b.rows.length * 100, 2) : null, _raw: b.rows }; }).sort((a, b) => (b.rate || 0) - (a.rate || 0));
    base.chart = { kind: 'bar', series: [{ key: 'rate', name: rateLabel, type: 'bar' }] };
    base.sourceRows = kind === 'estimate' ? tasks.filter(r => !(r.status === '已抄')) : tasks;
    base.note = (base.note ? base.note + ' ' : '') + (natural ? '任务按应抄日期（dueDate）自然月归属；' : '任务按业务账期（period，缺则应抄日期）归属；') + '未抄任务计入应抄数分母。' + (kind === 'estimate' ? '未抄见水表明细可导出。' : '');
    if (!tasks.length) base.empty = '当前范围/周期暂无抄表任务数据。';
    return base;
  }
  function computeRemoteBill(item, f, base) {
    const rows = protoUserRows('remotePushEvents', f, { period: true }).rows;
    const buckets = protoChildBuckets(rows);
    base.columns = [{ key: 'name', label: '节点' }, { key: 'expected', label: '应推送', dec: 0, align: 'right' }, { key: 'pushed', label: '已推送', dec: 0, align: 'right' }, { key: 'billed', label: '已开账', dec: 0, align: 'right' }, { key: 'missing', label: '缺失', dec: 0, align: 'right' }, { key: 'late', label: '延迟', dec: 0, align: 'right' }, { key: 'rate', label: '推送率', unit: '%', dec: 2, align: 'right' }];
    base.rows = buckets.map(b => { const expected = b.rows.length; const pushed = b.rows.filter(e => protoPushState(e).state !== '缺失').length; const billed = b.rows.filter(e => e.billedAt).length; const missing = b.rows.filter(e => protoPushState(e).state === '缺失').length; const late = b.rows.filter(e => protoPushState(e).state === '延迟').length; return { name: b.name, expected, pushed, billed, missing, late, rate: expected ? E.round(pushed / expected * 100, 2) : null, _raw: b.rows }; }).filter(r => r.expected > 0);
    base.chart = { kind: 'bar', series: [{ key: 'rate', name: '推送率', type: 'bar' }] };
    base.sourceRows = rows;
    base.note = (base.note ? base.note + ' ' : '') + '应推送＝每授权用户每期一条预期推送事件（remotePushEvents）；缺失＝无 pushedAt，延迟＝pushedAt 晚于 dueAt；与「未及时推送远传水表明细」同源同口径，可导出明细。';
    if (!rows.length) base.empty = '当前范围所选期间暂无远传应推送事件。';
    return base;
  }
  /* ---------- 数据预警异常 ---------- */
  function computeAlertCat(item, dimKey, f, base) {
    const rows = nodeRows('alerts').filter(r => r.category === item.cat && (!item.kw || ((r.type || '') + (r.description || '')).includes(item.kw)));
    base.columns = [{ key: 'customer', label: '用户' }, { key: 'type', label: '异常类型' }, { key: 'description', label: '描述' }, { key: 'date', label: '日期' }, { key: 'status', label: '状态' }, { key: 'value', label: '数值' }];
    base.rows = rows.map(r => ({ customer: r.customer || r.card || r.userId, type: r.type, description: r.description, date: r.date, status: r.status, value: r.value == null ? '—' : r.value, _raw: [r] }));
    base.sourceRows = rows;
    base.note = (base.note ? base.note + ' ' : '') + '仅事实与排序，不做原因推断。';
    if (!rows.length) base.empty = '当前范围暂无该类预警数据（缺数，不按0）。';
    return base;
  }
  function computeReadFlag(item, dimKey, f, base) {
    const periods = new Set(E.periods(f));
    const thr = Number(WB.state.gpsThr) || 100;
    const tasks = nodeRows('readTasks').filter(r => periods.has(r.period)).filter(r => item.flag === 'arrived' ? r.arrived === false : (r.gpsDistanceMeters != null && r.gpsDistanceMeters > thr));
    const buckets = dimKey === 'line' ? groupBy(tasks, r => r.line || '未提供') : groupBy(tasks, r => { const n = Org().get(r.orgNodeId); return n ? n.name : '未提供'; });
    base.columns = [{ key: 'name', label: dimKey === 'line' ? '线路' : '节点' }, { key: 'count', label: '异常数', dec: 0, align: 'right' }];
    base.rows = buckets.map(b => ({ name: b.name, count: b.rows.length, _raw: b.rows })).sort((a, b) => b.count - a.count);
    base.chart = { kind: 'bar', series: [{ key: 'count', name: '异常数', type: 'bar' }] };
    base.sourceRows = tasks;
    base.note = (base.note ? base.note + ' ' : '') + (item.flag === 'gps' ? '定位偏差阈值 ' + thr + ' 米（可调）。' : '');
    if (!tasks.length) base.empty = '当前范围/周期暂无该类抄表异常。';
    return base;
  }
  function computeReadStatus(item, f, base) {
    const periods = new Set(E.periods(f));
    const normal = ['正常', '不用', '定换', '周检'];
    const rows = nodeRows('readings').filter(r => periods.has(r.period) && r.status && !normal.includes(r.status));
    Object.assign(base, countTable(rows, r => r.status, '异常抄表状态', '条'));
    base.note = (base.note ? base.note + ' ' : '') + '已刨除正常、不用、定换、周检。';
    if (!rows.length) base.empty = '当前范围/周期暂无异常抄表状态记录。';
    return base;
  }
  function computeVolAnomaly(item, dimKey, f, base) {
    const thr = item.thr || 5;
    const rows = aggRows(f, dimKey === 'line' ? 'line' : 'children');
    base.columns = [{ key: 'name', label: dimKey === 'line' ? '线路' : '节点' }, { key: 'sold_vol', label: '本期售水量', unit: 'm³', dec: 0, align: 'right' }, { key: 'previous_sold', label: '同期售水量', unit: 'm³', dec: 0, align: 'right' }, { key: 'changePct', label: '变化率', unit: '%', dec: 2, align: 'right' }, { key: 'flag', label: '是否异常' }];
    base.rows = rows.map(r => { const s = r.agg.sold_vol, p = r.agg.previous_sold; const c = (p != null && p > 0) ? E.round((s - p) / p * 100, 2) : null; return { name: r.name, sold_vol: s, previous_sold: p == null ? null : p, changePct: c, flag: c == null ? '缺同期' : (Math.abs(c) >= thr ? '异常' : '正常'), _raw: r._rows }; });
    base.sourceRows = rows.flatMap(r => r._rows);
    base.note = (base.note ? base.note + ' ' : '') + '阈值 ±' + thr + '%；同期缺数不判异常、不按0。';
    return base;
  }
  function computeZeroVol(item, f, base) {
    const n = item.n || 3;
    const periods = E.periods(f).slice(-n);
    const byUser = new Map();
    facts(f).forEach(r => { if (!periods.includes(r.period)) return; if (!byUser.has(r.accountId)) byUser.set(r.accountId, []); byUser.get(r.accountId).push(r); });
    const out = [];
    byUser.forEach((rs, id) => { if (rs.length < n) return; const last = rs.sort((a, b) => a.period < b.period ? -1 : 1).slice(-n); if (last.every(r => (r.sold_vol || 0) === 0)) { const u = D().userIndex.get(Number(rs[0].seriesKey)); out.push({ name: u ? u.name : id, nature: u ? u.nature : '—', org: u ? u.org : '—', periods: last.map(r => r.period).join('、'), _raw: last }); } });
    base.columns = [{ key: 'name', label: '用户' }, { key: 'nature', label: '用水性质' }, { key: 'org', label: '组织' }, { key: 'periods', label: '连续零水量周期' }];
    base.rows = out;
    base.sourceRows = out.flatMap(r => r._raw);
    base.note = (base.note ? base.note + ' ' : '') + '连续 ' + n + ' 个周期售水量为0；周期数可调。';
    if (!out.length) base.empty = '当前范围暂无连续 ' + n + ' 周期零水量用户。';
    return base;
  }
  function computeVolYoy(item, f, base) {
    const thr = Number(WB.state.volYoyThr) || item.thr || 30;
    const byUser = new Map();
    facts(f).forEach(r => { if (!byUser.has(r.accountId)) byUser.set(r.accountId, []); byUser.get(r.accountId).push(r); });
    const out = [];
    byUser.forEach((rs, id) => { const a = E.aggregate(rs, f); const p = a.previous_sold; if (p == null || p <= 0) return; const c = E.round((a.sold_vol - p) / p * 100, 2); if (Math.abs(c) >= thr) { const u = D().userIndex.get(Number(rs[0].seriesKey)); out.push({ name: u ? u.name : id, nature: u ? u.nature : '—', sold_vol: a.sold_vol, previous_sold: p, yoy: c, _raw: rs }); } });
    out.sort((a, b) => Math.abs(b.yoy) - Math.abs(a.yoy));
    base.columns = [{ key: 'name', label: '用户' }, { key: 'nature', label: '用水性质' }, { key: 'sold_vol', label: '本期水量', unit: 'm³', dec: 0, align: 'right' }, { key: 'previous_sold', label: '同期水量', unit: 'm³', dec: 0, align: 'right' }, { key: 'yoy', label: '同比变化', unit: '%', dec: 2, align: 'right' }];
    base.rows = out;
    base.sourceRows = out.flatMap(r => r._raw);
    base.note = (base.note ? base.note + ' ' : '') + '阈值 ±' + thr + '%（可调）；同期缺数不纳入、不按0。';
    if (!out.length) base.empty = '当前范围暂无同比变化超阈值用户。';
    return base;
  }
  function computeAdjust(item, f, base) {
    const periods = new Set(E.periods(f));
    const rows = nodeRows('adjustments').filter(r => r.proc_type === item.proc && periods.has(r.period));
    base.columns = [{ key: 'card', label: '卡号' }, { key: 'period', label: '账期' }, { key: 'proc_amt', label: '调整金额', unit: '元', dec: 2, align: 'right' }, { key: 'initiator_name', label: '发起人' }, { key: 'audit_status', label: '审核状态' }, { key: 'reason', label: '原因' }];
    base.rows = rows.map(r => ({ card: r.card, period: r.period, proc_amt: r.proc_amt, initiator_name: r.initiator_name, audit_status: r.audit_status, reason: r.reason, _raw: [r] }));
    base.sourceRows = rows;
    if (!rows.length) base.empty = '当前范围/周期暂无' + item.proc + '记录（缺数，不按0）。';
    return base;
  }
  /* ---------- 工程项目督查 ---------- */
  function computeProjectList(item, f, base) {
    let rows = nodeRows('projects');
    if (item.filter === 'unreg') rows = rows.filter(r => !r.registered);
    else if (item.filter === 'unregVol') rows = rows.filter(r => !r.registered && (r.remoteVol || 0) > 0);
    base.columns = [{ key: 'id', label: '工程编号' }, { key: 'name', label: '工程名称' }, { key: 'stage', label: '当前节点' }, { key: 'caliber', label: '口径' }, { key: 'manufacturer', label: '水表厂家' }, { key: 'barcode', label: '条形码' }];
    base.rows = rows.map(r => ({ id: r.id, name: r.name, stage: r.stage, caliber: r.caliber || '—', manufacturer: r.manufacturer || '—', barcode: r.barcode || '—', _raw: [r] }));
    base.sourceRows = rows;
    if (!rows.length) base.empty = '当前范围暂无符合条件工程水表明细。';
    return base;
  }
  function computeProjectProgress(item, f, base) {
    const rows = nodeRows('projects');
    const buckets = groupBy(rows, r => r.stage || '未提供');
    base.columns = [{ key: 'name', label: '工程阶段' }, { key: 'total', label: '工程数', dec: 0, align: 'right' }, { key: 'completed', label: '已完工', dec: 0, align: 'right' }, { key: 'installed', label: '已装表', dec: 0, align: 'right' }, { key: 'registered', label: '已立户', dec: 0, align: 'right' }];
    base.rows = buckets.map(b => ({ name: b.name, total: b.rows.length, completed: b.rows.filter(r => r.completed).length, installed: b.rows.filter(r => r.installed).length, registered: b.rows.filter(r => r.registered).length, _raw: b.rows }));
    base.chart = { kind: 'bar', series: [{ key: 'total', name: '工程数', type: 'bar' }] };
    base.sourceRows = rows;
    base.note = (base.note ? base.note + ' ' : '') + '按是否完工/装表/立户统计。';
    if (!rows.length) base.empty = '当前范围暂无在建工程数据。';
    return base;
  }
  /* ---------- 应收账款 ---------- */
  function computeAging(item, f, base) {
    const end = windowEnd(f);
    const asOf = Date.parse(end + 'T00:00:00');
    const bills = scopedBills(f).filter(b => (b.arrears || 0) > 0);
    const buckets = [
      { name: '0-30天', lo: 0, hi: 30 }, { name: '31-90天', lo: 31, hi: 90 },
      { name: '91-180天', lo: 91, hi: 180 }, { name: '181-365天', lo: 181, hi: 365 },
      { name: '365天以上', lo: 366, hi: Infinity }, { name: '未到期', lo: -Infinity, hi: -1 },
      { name: '未知（缺应缴日期）', lo: null, hi: null }
    ];
    const acc = buckets.map(b => Object.assign({ count: 0, amount: 0, volume: 0, volKnown: true, rows: [] }, b));
    bills.forEach(b => {
      const due = b.dueAt || (b.period ? b.period + '-25' : '');
      const days = due ? Math.floor((asOf - Date.parse(due + 'T00:00:00')) / 86400000) : null;
      const idx = days == null ? 6 : (days < 0 ? 5 : acc.findIndex((x, i) => i < 5 && days >= x.lo && days <= x.hi));
      const t = acc[idx >= 0 ? idx : 6];
      t.count += 1; t.amount += b.arrears || 0; t.rows.push(b);
      const v = debtVolume(b); if (v == null) t.volKnown = false; else t.volume += v;
    });
    base.kind = 'aging';
    base.columns = [{ key: 'name', label: '账龄区间' }, { key: 'count', label: '欠费笔数', dec: 0, align: 'right' }, { key: 'amount', label: '欠费金额', unit: '元', dec: 2, align: 'right' }, { key: 'volume', label: '欠费水量', unit: 'm³', dec: 0, align: 'right' }];
    base.rows = acc.map(t => ({ name: t.name, count: t.count, amount: E.round(t.amount, 2), volume: t.volKnown ? E.round(t.volume, 0) : null, _raw: t.rows }));
    const adj = nodeRows('adjustments').filter(r => ['价差退款', '特殊开账', '待处理账'].includes(r.proc_type));
    const adjByType = groupBy(adj, r => r.proc_type);
    adjByType.forEach(b => { base.rows.push({ name: b.name + '（账务调整）', count: b.rows.length, amount: E.round(E.sum(b.rows, 'proc_amt'), 2), volume: null, _raw: b.rows }); });
    base.sourceRows = bills.concat(adj);
    base.note = (base.note ? base.note + ' ' : '') + '账龄按账单应缴日期（dueAt）截至所选月末 ' + end + ' 真实分桶；未来到期单列「未到期」，缺应缴日期单列「未知」，不按0-30天计。价差退款/特殊开账/待处理账为账务调整台账原名条目（金额=Σ调整金额，缺独立水量字段，不冒账龄）。部分缴清净欠费水量待核者水量列空。';
    if (!bills.length && !adj.length) base.empty = '当前范围暂无欠费账单及价差退款/特殊开账/待处理账记录。';
    return base;
  }
  function windowEnd(f) {
    const ps = E.periods(f); const last = ps[ps.length - 1] || f.month || f.end || '2026-10';
    const d = new Date(last + '-01T00:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function debtVolume(b) { return b.arrears > 0 && b.received > 0 ? null : (b.arrears > 0 ? b.volume : 0); }
  function computeBigArrears(item, f, base) {
    const thr = item.thr || 5000;
    const end = f.month || f.end || '2026-10';
    const start = String(Number(end.slice(0, 4)) - 4) + '-01';
    const ps = new Set(D().periods.filter(p => p >= start && p <= end));
    const bills = scopedBills(f).filter(b => ps.has(b.period));
    const byUser = new Map();
    bills.forEach(b => { const k = b.userId; if (!byUser.has(k)) byUser.set(k, []); byUser.get(k).push(b); });
    const ui = D().userIndex; const rows = []; const source = [];
    byUser.forEach((bs, uid) => {
      let vol = 0, amount = 0, complete = true;
      bs.forEach(b => { const v = debtVolume(b); if (v == null) complete = false; else vol += v; amount += b.arrears || 0; });
      if (!complete || vol < thr) return;
      const u = ui.get(uid) || {};
      rows.push({ name: u.name || uid, nature: u.nature || '', org: u.org || '', arrears: E.round(vol, 0), arrearsAmount: E.round(amount, 2), regDate: u.regDate || '', _raw: bs });
      source.push(...bs);
    });
    base.kind = 'bigArrears';
    base.columns = [{ key: 'name', label: '用户' }, { key: 'nature', label: '用水性质' }, { key: 'org', label: '组织' }, { key: 'arrears', label: '欠费水量', unit: 'm³', dec: 0, align: 'right' }, { key: 'arrearsAmount', label: '欠费金额', unit: '元', dec: 2, align: 'right' }, { key: 'regDate', label: '注册日期' }];
    base.rows = rows.sort((a, b) => b.arrears - a.arrears);
    base.sourceRows = source;
    base.note = (base.note ? base.note + ' ' : '') + '欠费 ' + thr + 'm³ 为水量阈值（非金额）；账龄窗口 ' + start + ' 至 ' + end + '（5年以内）欠费未清账单按用户聚合，与应收明细·大额欠费同口径。部分缴清净欠费水量待核者不计入。台账自动建立。';
    if (!rows.length) base.empty = '当前范围暂无账龄窗口内欠费 ' + thr + 'm³ 以上用户。';
    return base;
  }
  function computeArrearsUsers(item, f, base) {
    const users = queryUsers(f).filter(u => (u.arrears || 0) > 0);
    base.columns = [{ key: 'name', label: '用户' }, { key: 'nature', label: '用水性质' }, { key: 'org', label: '组织' }, { key: 'arrears', label: '欠费水量', unit: 'm³', dec: 0, align: 'right' }, { key: 'arrearsAmount', label: '欠费金额', unit: '元', dec: 2, align: 'right' }];
    base.rows = users.map(u => ({ name: u.name, nature: u.nature, org: u.org, arrears: u.arrears, arrearsAmount: u.arrearsAmount, _raw: [u] })).sort((a, b) => b.arrears - a.arrears);
    base.sourceRows = users;
    if (!users.length) base.empty = '当前范围暂无欠费用户。';
    return base;
  }
  /* ---------- 近10年各年当月+当年累计产销差率（真实供水，不取首公司/全局期） ---------- */
  function loss10Narrow(f) {
    const NARROW = ['nature', 'industry', 'admin', 'functional', 'org', 'team', 'line', 'meterType', 'keyword', 'booklet', 'caliberMm'];
    return NARROW.some(k => { const v = f[k]; return v != null && v !== '' && !(Array.isArray(v) && !v.length); });
  }
  function loss10Supply(node, periods) {
    const S = window.WBSupplement;
    if (!S || typeof S.supplyFor !== 'function') return { ok: false, supplyRaw: null, missing: [], reason: '手动填报模块未加载' };
    const sup = S.supplyFor(node, periods);
    if (!sup || !sup.applicable) return { ok: false, supplyRaw: null, missing: [], reason: (sup && sup.reason) || '当前层级无独立供水口径' };
    if (!sup.coveredSupply) return { ok: false, supplyRaw: null, missing: sup.missing || [], reason: '当前身份范围未完整覆盖该节点应属单位' };
    if (!sup.complete || sup.supply_vol == null) return { ok: false, supplyRaw: null, missing: sup.missing || [], reason: '供水量缺数（按单位×月份）' };
    return { ok: true, supplyRaw: sup.supply_vol, missing: [], reason: '' };
  }
  /* 月报专用供水口径（第三/四章）：整块单一来源——手动填报完整则整块用手动，否则整块用完整 P（DMA 分区）原型合计；
     不混用部分手动、不逐期切换来源；沿用 loss10Narrow 与层级守卫，无身份越权、无叶节点/性质/行政筛选下的整 DMA 供水。 */
  function reportSupply(snode, periods, f) {
    if (loss10Narrow(f)) return { ok: false, reason: '当前筛选无独立供水口径，产销差率缺数。' };
    if (!lossApplicable(snode)) return { ok: false, reason: '所及以下层级无独立供水口径，产销差率不适用。' };
    const O = Org();
    const S = window.WBSupplement;
    const sup = S && typeof S.supplyFor === 'function' ? S.supplyFor(snode, periods) : null;
    if (sup && sup.applicable && sup.coveredSupply && sup.complete && sup.supply_vol != null) {
      return { ok: true, source: 'manual', supplyRaw: sup.supply_vol, label: '手动填报（' + (sup.sourceLabel || '单位整体') + '）', rows: S.viewRows(snode, periods), missing: [] };
    }
    const units = snode.type === 'group' ? O.UNITS.map(u => O.get(u.nodeId)).filter(Boolean) : [snode];
    const unitIds = new Set(units.map(u => String(u.unitId)));
    const ps = new Set(periods);
    const proto = P();
    const owned = proto && proto.dmaBalance ? proto.dmaBalance.filter(r => A().ownsRow(r) && unitIds.has(String(r.unitId)) && ps.has(r.period)) : [];
    const covered = units.length > 0 && units.every(u => periods.every(p => owned.some(r => String(r.unitId) === String(u.unitId) && r.period === p)));
    if (covered && owned.length) {
      return { ok: true, source: 'proto', supplyRaw: E.sum(owned, 'supply_vol'), label: protoLabel() + '（DMA 分区供水合计）', rows: owned, missing: [] };
    }
    const why = sup && sup.applicable && sup.coveredSupply
      ? '手动填报不完整（缺：' + (sup.missing || []).slice(0, 3).map(m => m.unitName + ' ' + m.period).join('、') + ((sup.missing || []).length > 3 ? ' 等' : '') + '）'
      : ((sup && sup.reason) || '供水量未接入');
    return { ok: false, reason: why + '，且原型 DMA 供水未完整覆盖当前单位×期间，产销差率缺数，不按0计算。' };
  }
  /* 月报产销差率：真实售水 facts ＋ 整块单一供水来源；率=(Σ供水−Σ售水)/Σ供水 加权，非各月/各区域简单平均。 */
  function computeReportLoss(item, dimKey, f, base) {
    const O = Org();
    const snode = f.orgNodeId && O.has(f.orgNodeId) ? O.get(f.orgNodeId) : (f.company ? O.nodeForCompany(f.company) : effectiveNode());
    base.kind = 'reportLoss';
    const periods = E.periods(f);
    const sup = reportSupply(snode, periods, f);
    if (!sup.ok) { base.empty = sup.reason; return base; }
    const S = window.WBSupplement;
    const units = item.dim === 'company' && snode.type === 'group' ? O.UNITS.map(u => O.get(u.nodeId)).filter(Boolean) : [snode];
    const unitF = un => Object.assign({}, f, { period: '自定义', start: periods[0], end: periods[periods.length - 1], month: periods[periods.length - 1], orgNodeId: un.id, company: '' });
    const rateOf = (s, v) => (s != null && s > 0 && v != null) ? E.round((s - v) / s * 100, 2) : null;
    const supplyOf = (rows, un, ps) => {
      if (sup.source === 'manual') { const us = S.supplyFor(un, ps); return us && us.complete && us.supply_vol != null ? us.supply_vol : null; }
      const rs = rows.filter(r => String(r.unitId) === String(un.unitId) && ps.indexOf(r.period) >= 0);
      return rs.length ? E.sum(rs, 'supply_vol') : null;
    };
    const priorPeriods = periods.map(p => shiftYear(p, -1));
    let priorRows = [];
    if (sup.source === 'manual') {
      const ps = S.supplyFor(snode, priorPeriods);
      if (ps && ps.applicable && ps.coveredSupply && ps.complete && ps.supply_vol != null) priorRows = S.viewRows(snode, priorPeriods);
    }
    const priorOk = priorRows.length > 0;
    const factsUsed = []; const priorFactsUsed = [];
    const unitData = units.map(un => {
      const uf = unitF(un); const ff = facts(uf); factsUsed.push(...ff);
      const pf = Object.assign({}, uf, { start: priorPeriods[0], end: priorPeriods[priorPeriods.length - 1], month: priorPeriods[priorPeriods.length - 1] });
      const pff = priorOk ? rangeFacts(uf, priorPeriods) : []; priorFactsUsed.push(...pff);
      const sold = E.aggregate(ff, uf).sold_vol;
      const supply = supplyOf(sup.rows, un, periods);
      const pSold = priorOk ? E.aggregate(pff, pf).sold_vol : null;
      const pSupply = priorOk ? supplyOf(priorRows, un, priorPeriods) : null;
      return { un, sold, supply, rate: rateOf(supply, sold), pRate: rateOf(pSupply, pSold) };
    });
    const priorAny = unitData.some(u => u.pRate != null);
    const selMonth = periods[periods.length - 1];
    const monthSupplyOf = p => {
      if (sup.source === 'manual') { const us = S.supplyFor(snode, [p]); return us && us.complete && us.supply_vol != null ? us.supply_vol : null; }
      const rs = sup.rows.filter(r => r.period === p);
      return rs.length ? E.sum(rs, 'supply_vol') : null;
    };
    const monthSoldOf = p => { const mf = Object.assign({}, f, { period: '自定义', start: p, end: p, month: p, orgNodeId: snode.id, company: '' }); const ff = facts(mf); factsUsed.push(...ff); return E.aggregate(ff, mf).sold_vol; };
    if (item.mode === 'month' && item.dim !== 'company') {
      base.columns = [{ key: 'name', label: '月份' }].concat(metricColumns(['supply_vol', 'sold_vol', 'loss_rate']));
      base.rows = periods.map(p => { const s = monthSupplyOf(p); const v = monthSoldOf(p); return { name: p, supply_vol: s != null ? E.round(s / 10000, 2) : null, sold_vol: v != null ? E.round(v / 10000, 2) : null, loss_rate: rateOf(s, v) }; });
      base.chart = { kind: 'bar', composition: 'stock-flow', series: [{ key: 'supply_vol', name: '供水量', type: 'bar', yAxis: 0 }, { key: 'sold_vol', name: '售水量', type: 'bar', yAxis: 0 }, { key: 'loss_rate', name: '产销差率', type: 'line', yAxis: 1 }] };
    } else if (item.mode === 'cumRate') {
      let cs = 0, cv = 0, pcs = 0, pcv = 0, pRunOk = priorOk;
      const priorMonthSupply = p => { if (!priorOk) return null; const us = S.supplyFor(snode, [p]); return us && us.complete && us.supply_vol != null ? us.supply_vol : null; };
      base.rows = periods.map((p, i) => {
        const s = monthSupplyOf(p); const v = monthSoldOf(p);
        if (s != null) cs += s; if (v != null) cv += v;
        const pp = priorPeriods[i]; let pv = null;
        if (pRunOk) {
          const ps = priorMonthSupply(pp);
          const mf = Object.assign({}, f, { period: '自定义', start: pp, end: pp, month: pp, orgNodeId: snode.id, company: '' });
          const pff = rangeFacts(mf, [pp]); priorFactsUsed.push(...pff);
          pv = E.aggregate(pff, mf).sold_vol;
          if (ps != null && pv != null) { pcs += ps; pcv += pv; } else pRunOk = false;
        }
        return { name: p, cumRate: cs > 0 ? E.round((cs - cv) / cs * 100, 2) : null, prevCumRate: (pRunOk && pcs > 0) ? E.round((pcs - pcv) / pcs * 100, 2) : null };
      });
      const priorCumAny = base.rows.some(r => r.prevCumRate != null);
      base.columns = [{ key: 'name', label: '月份' }, { key: 'cumRate', label: '累计产销差率', unit: '%', dec: 2, align: 'right' }];
      if (priorCumAny) base.columns.push({ key: 'prevCumRate', label: '上年同期累计产销差率', unit: '%', dec: 2, align: 'right' });
      const series = [{ key: 'cumRate', name: '累计产销差率', type: 'line', yAxis: 0 }];
      if (priorCumAny) series.push({ key: 'prevCumRate', name: '上年同期累计产销差率', type: 'line', yAxis: 0 });
      base.chart = { kind: 'line', series };
    } else {
      const isMonth = item.mode === 'month';
      base.columns = [{ key: 'name', label: '供水区域' }].concat(metricColumns(['supply_vol', 'sold_vol', 'loss_rate']));
      if (priorAny) base.columns.push({ key: 'prev_rate', label: '上年同期产销差率', unit: '%', dec: 2, align: 'right' });
      base.rows = unitData.map(u => {
        if (!isMonth) return { name: u.un.name, supply_vol: u.supply != null ? E.round(u.supply / 10000, 2) : null, sold_vol: u.sold != null ? E.round(u.sold / 10000, 2) : null, loss_rate: u.rate, prev_rate: u.pRate };
        const s = supplyOf(sup.rows, u.un, [selMonth]);
        const mf = Object.assign({}, f, { period: '自定义', start: selMonth, end: selMonth, month: selMonth, orgNodeId: u.un.id, company: '' });
        const ff = facts(mf); factsUsed.push(...ff);
        const v = E.aggregate(ff, mf).sold_vol;
        let pRate = null;
        if (priorOk) {
          const pp = shiftYear(selMonth, -1);
          const ps = supplyOf(priorRows, u.un, [pp]);
          const pf = Object.assign({}, mf, { start: pp, end: pp, month: pp });
          const pff = rangeFacts(pf, [pp]); priorFactsUsed.push(...pff);
          pRate = rateOf(ps, E.aggregate(pff, pf).sold_vol);
        }
        return { name: u.un.name, supply_vol: s != null ? E.round(s / 10000, 2) : null, sold_vol: v != null ? E.round(v / 10000, 2) : null, loss_rate: rateOf(s, v), prev_rate: pRate };
      }).sort((a, b) => (b.sold_vol || 0) - (a.sold_vol || 0));
      const series = [{ key: 'supply_vol', name: '供水量', type: 'bar', yAxis: 0 }, { key: 'sold_vol', name: '售水量', type: 'bar', yAxis: 0 }, { key: 'loss_rate', name: '产销差率', type: 'line', yAxis: 1 }];
      if (priorAny) series.push({ key: 'prev_rate', name: '上年同期产销差率', type: 'line', yAxis: 1 });
      base.chart = { kind: 'bar', composition: 'stock-flow', series };
    }
    const isTrend = item.mode === 'month' && item.dim !== 'company';
    const totSupply = isTrend ? base.rows.reduce((s, r) => r.supply_vol != null ? s + r.supply_vol * 10000 : s, 0) : unitData.reduce((s, u) => u.supply != null ? s + u.supply : s, 0);
    const totSold = isTrend ? base.rows.reduce((s, r) => r.sold_vol != null ? s + r.sold_vol * 10000 : s, 0) : unitData.reduce((s, u) => u.sold != null ? s + u.sold : s, 0);
    base.totals = { supply_vol: totSupply, sold_vol: totSold, loss_rate_pct: rateOf(totSupply, totSold) };
    const srcSeen = new Set();
    base.sourceRows = factsUsed.concat(sup.rows).concat(priorFactsUsed).concat(priorRows).filter(r => {
      if (srcSeen.has(r)) return false;
      srcSeen.add(r); return true;
    });
    if (sup.source === 'proto') { base.synthetic = true; base.sourceLabel = sup.label; base.prototypeRows = sup.rows.length; } else base.manualSource = true;
    base.note = '产销差率=(供水量−售水量)/供水量×100，按期间合计加权，非各月/各区域简单平均。供水量来源：' + sup.label + '；售水量为当前身份授权事实同期间合计（派生汇总，非逐户供水台账）。' + (priorOk ? '' : ' 上年同期无数据来源，未绘制同期比较。');
    if (!base.rows.length) base.empty = '当前范围所选期间暂无产销差数据。';
    return base;
  }
  /* 月报时间序列（第五/六/十四章）：所选年份 1 月→所选月份按月时间轴＋上年同期；缺基期不按0。 */
  function computeReportTrend(item, f, base) {
    const ps = E.periods(Object.assign({}, f, { period: '年内累计' }));
    const tf = Object.assign({}, f, { period: '自定义', start: ps[0], end: ps[ps.length - 1], month: ps[ps.length - 1] });
    const curFacts = rangeFacts(f, ps);
    const buckets = E.trend(curFacts, tf, 'month');
    const priorPs = ps.map(p => shiftYear(p, -1));
    const priorFacts = rangeFacts(f, priorPs);
    const priorTf = Object.assign({}, tf, { start: priorPs[0], end: priorPs[priorPs.length - 1], month: priorPs[priorPs.length - 1] });
    const priorMap = new Map(E.trend(priorFacts, priorTf, 'month').map(b => [shiftYear(b.name, 1), b]));
    const m = METRICS[item.metric];
    const cum = item.mode === 'cum';
    const curMap = new Map(buckets.map(b => [b.name, b]));
    let run = 0, priorRun = 0, curRunOk = true, priorRunOk = true;
    base.rows = ps.map(p => {
      const cb = curMap.get(p);
      const pb = priorMap.get(p);
      let value = null, prevValue = null;
      if (cum) {
        if (cb && cb.sold_vol != null && curRunOk) { run += cb.sold_vol; value = E.round(run / 10000, 2); }
        else curRunOk = false;
        if (pb && pb.sold_vol != null && priorRunOk) { priorRun += pb.sold_vol; prevValue = E.round(priorRun / 10000, 2); }
        else priorRunOk = false;
      } else {
        value = cb ? m.get(cb) : null;
        prevValue = pb ? m.get(pb) : null;
      }
      return { name: p, value, prevValue };
    });
    const priorAny = base.rows.some(r => r.prevValue != null);
    const vLabel = (cum ? '累计' : '') + m.label;
    base.columns = [{ key: 'name', label: '月份' }, { key: 'value', label: vLabel, unit: m.unit, dec: m.dec, align: 'right' }];
    if (priorAny) base.columns.push({ key: 'prevValue', label: '上年同期' + vLabel, unit: m.unit, dec: m.dec, align: 'right' });
    const series = [{ key: 'value', name: vLabel, type: 'line', yAxis: 0 }];
    if (priorAny) series.push({ key: 'prevValue', name: '上年同期' + vLabel, type: 'line', yAxis: 0 });
    base.chart = { kind: 'line', series };
    base.sourceRows = curFacts.concat(priorFacts);
    base.note = (cum ? '累计值为所选年份 1 月至该月的逐月累加。' : '') + historyNote(tf) + (priorAny ? '' : ' 上年同期无数据来源，未绘制同期比较。');
    if (!base.rows.some(r => r.value != null)) base.empty = '当前范围所选期间暂无数据。';
    return base;
  }
  /* 月报重点行业（第十一章）：月用水量＞100m³ 或月均≥100m³ 用户集合按行业归集＋上年同期回溯，非逐户明细。 */
  function computeReportBigIndustry(item, f, base) {
    const month = item.mode === 'month';
    const curMonth = f.month || f.end || '2026-10';
    const ps = month ? [curMonth] : E.periods(f);
    const cf = month ? E.filterFacts(Object.assign({}, f, { period: '当月', month: curMonth })) : rangeFacts(f, ps);
    const cohort = new Set();
    if (month) cf.forEach(r => { if (r.sold_vol > 100) cohort.add(r.accountId); });
    else { const n = ps.length || 1; accountSum(cf).forEach((v, k) => { if (v / n >= 100) cohort.add(k); }); }
    const periodText = month ? curMonth + ' 月用水量＞100m³' : '所选期间月均用水量≥100m³（累计÷' + (ps.length || 1) + ' 个月）';
    if (!cohort.size) { base.empty = '当前范围' + periodText + '的重点用户为空。'; return base; }
    const eligible = cf.filter(r => cohort.has(r.accountId));
    const buckets = groupBy(eligible, r => r.industry);
    const priorPs = ps.map(p => shiftYear(p, -1));
    const priorFacts = rangeFacts(f, priorPs);
    const priorEligible = priorFacts.filter(r => cohort.has(r.accountId));
    const priorByIndustry = new Map(groupBy(priorEligible, r => r.industry).map(b => [b.name, E.aggregate(b.rows, f)]));
    const priorWater = buckets.some(b => { const pa = priorByIndustry.get(b.name); return pa && pa.sold_vol > 0; });
    base.columns = [{ key: 'name', label: '行业' }, { key: 'count', label: '重点用户数', unit: '户', dec: 0, align: 'right' }].concat(metricColumns(['sold_vol']));
    if (priorWater) base.columns.push({ key: 'prev_sold', label: '上年同期售水量', unit: '万m³', dec: 2, align: 'right' }, { key: 'yoy', label: '同比增长', unit: '%', dec: 2, align: 'right' });
    base.rows = buckets.map(b => {
      const a = E.aggregate(b.rows, f);
      const o = { name: b.name, count: new Set(b.rows.map(r => r.accountId)).size, sold_vol: METRICS.sold_vol.get(a), _raw: b.rows };
      if (priorWater) { const pa = priorByIndustry.get(b.name); o.prev_sold = pa && pa.sold_vol > 0 ? METRICS.sold_vol.get(pa) : null; o.yoy = (o.prev_sold != null && o.prev_sold > 0 && o.sold_vol != null) ? E.round((o.sold_vol - o.prev_sold) / o.prev_sold * 100, 2) : null; }
      return o;
    }).sort((a, b) => (b.sold_vol || 0) - (a.sold_vol || 0));
    base.sourceRows = eligible.concat(priorEligible);
    const series = [{ key: 'sold_vol', name: '售水量', type: 'bar', yAxis: 0 }];
    if (priorWater) { series.unshift({ key: 'prev_sold', name: '上年同期售水量', type: 'bar', yAxis: 0 }); series.push({ key: 'yoy', name: '同比增长', type: 'line', yAxis: 1 }); }
    base.chart = { kind: 'bar', series };
    base.totals = E.aggregate(eligible, f);
    base.note = periodText + ' 的用户集合（' + cohort.size + ' 户）按行业归集，非逐户明细；上年同期为同一用户集合回溯，缺基期不按0。' + (priorWater ? '' : ' 上年同期无数据来源，未绘制同期比较。');
    if (!base.rows.length) base.empty = '当前范围重点用户暂无行业水量。';
    return base;
  }
  function computeLoss10(item, dimKey, f, base) {
    const O = Org();
    const snode = f.orgNodeId && O.has(f.orgNodeId) ? O.get(f.orgNodeId) : (f.company ? O.nodeForCompany(f.company) : effectiveNode());
    base.kind = 'loss10';
    base.columns = [
      { key: 'name', label: dimKey === 'company' ? '供水区域 / 年份' : '年份' },
      { key: 'monthSupply', label: '当月供水量', unit: '万m³', dec: 2, align: 'right' },
      { key: 'monthSold', label: '当月售水量', unit: '万m³', dec: 2, align: 'right' },
      { key: 'monthRate', label: '当月产销差率', unit: '%', dec: 2, align: 'right' },
      { key: 'cumSupply', label: '当年累计供水量', unit: '万m³', dec: 2, align: 'right' },
      { key: 'cumSold', label: '当年累计售水量', unit: '万m³', dec: 2, align: 'right' },
      { key: 'cumRate', label: '当年累计产销差率', unit: '%', dec: 2, align: 'right' }
    ];
    if (loss10Narrow(f)) { base.empty = '当前筛选无独立供水口径，不适用（不计算局部产销差率）。'; base.rows = []; return base; }
    if (!snode || !lossApplicable(snode)) { base.empty = '当前组织层级无独立供水口径，不适用（公司级指标不分摊到下级）。'; base.rows = []; return base; }
    const selMonth = f.month || f.end || '2026-10';
    const mm = selMonth.slice(5, 7);
    const lastYear = Number(selMonth.slice(0, 4));
    const periodsAll = D().periods;
    const dataFirst = periodsAll[0], dataLast = periodsAll[periodsAll.length - 1];
    const units = dimKey === 'company' && snode.type === 'group' ? O.UNITS.map(u => O.get(u.nodeId)).filter(Boolean) : [snode];
    const rows = []; const source = []; const missingNotes = [];
    units.forEach(un => {
      for (let y = lastYear - 9; y <= lastYear; y++) {
        const ym = y + '-' + mm;
        const cumPs = periodsAll.filter(p => p.slice(0, 4) === String(y) && p <= ym);
        const row = { name: dimKey === 'company' ? un.name + ' / ' + y : String(y), nodeId: un.id, year: y, monthSupply: null, monthSold: null, monthRate: null, cumSupply: null, cumSold: null, cumRate: null };
        if (periodsAll.includes(ym)) {
          const mf = Object.assign({}, f, { period: '自定义', start: ym, end: ym, month: ym, orgNodeId: un.id, company: '' });
          const mFacts = facts(mf); const mSold = E.aggregate(mFacts, mf).sold_vol;
          const ms = loss10Supply(un, [ym]);
          row.monthSold = mSold == null ? null : E.round(mSold / 10000, 2);
          row.monthSupply = ms.ok ? E.round(ms.supplyRaw / 10000, 2) : null;
          row.monthRate = ms.ok && ms.supplyRaw > 0 && mSold != null ? E.round((ms.supplyRaw - mSold) / ms.supplyRaw * 100, 2) : null;
          source.push(...mFacts);
          if (!ms.ok) missingNotes.push(un.name + ' ' + ym + ' 当月：' + ms.reason + (ms.missing.length ? '（' + ms.missing.map(m => m.unitName + m.period).join('、') + '）' : ''));
        }
        if (cumPs.length) {
          const cf = Object.assign({}, f, { period: '自定义', start: cumPs[0], end: cumPs[cumPs.length - 1], month: cumPs[cumPs.length - 1], orgNodeId: un.id, company: '' });
          const cFacts = facts(cf); const cSold = E.aggregate(cFacts, cf).sold_vol;
          const cs = loss10Supply(un, cumPs);
          row.cumSold = cSold == null ? null : E.round(cSold / 10000, 2);
          row.cumSupply = cs.ok ? E.round(cs.supplyRaw / 10000, 2) : null;
          row.cumRate = cs.ok && cs.supplyRaw > 0 && cSold != null ? E.round((cs.supplyRaw - cSold) / cs.supplyRaw * 100, 2) : null;
          source.push(...cFacts);
          if (!cs.ok) missingNotes.push(un.name + ' ' + y + ' 累计：' + cs.reason + (cs.missing.length ? '（缺' + cs.missing.length + '项单位×月）' : ''));
        }
        rows.push(row);
      }
    });
    base.rows = rows;
    const S = window.WBSupplement;
    base.sourceRows = source.concat(S && S.viewRows ? S.viewRows(snode, periodsAll) : []);
    base.chart = null; base.manualSource = true;
    base.note = (base.note ? base.note + ' ' : '') + '各年按所选月份的同月与当年1月至该月累计分别取数；供水量来源手动填报（' + (snode.type === 'group' ? '集团四家已接入单位合计' : snode.name) + '），须全部应属单位×各月齐备才计供水量与差率，否则缺数不按0。数据范围 ' + dataFirst + ' 至 ' + dataLast + '，范围外年份不造数。' + (missingNotes.length ? ' 缺数明细：' + missingNotes.join('；') + '。' : '');
    if (!rows.length) base.empty = '当前范围暂无可对比年份。';
    return base;
  }
  /* ---------- 同步年分析：各年同一月与当年累计售水量对比 ---------- */
  function computeSyncYear(item, dimKey, f, base) {
    const selMonth = f.month || f.end || '2026-10';
    const mm = selMonth.slice(5, 7);
    const lastYear = Number(selMonth.slice(0, 4));
    const periodsAll = D().periods;
    const dataFirst = periodsAll[0], dataLast = periodsAll[periodsAll.length - 1];
    base.kind = 'syncYear';
    base.columns = [
      { key: 'name', label: '年份' },
      { key: 'monthSold', label: '同月售水量', unit: '万m³', dec: 2, align: 'right' },
      { key: 'cumSold', label: '当年累计售水量（1月至该月）', unit: '万m³', dec: 2, align: 'right' }
    ];
    const rows = []; const source = [];
    for (let y = lastYear - 4; y <= lastYear; y++) {
      const ym = y + '-' + mm;
      const cumPs = periodsAll.filter(p => p.slice(0, 4) === String(y) && p <= ym);
      const row = { name: String(y), year: y, monthSold: null, cumSold: null };
      if (periodsAll.includes(ym)) {
        const mf = Object.assign({}, f, { period: '自定义', start: ym, end: ym, month: ym });
        const mFacts = facts(mf); row.monthSold = mFacts.length ? E.round(E.aggregate(mFacts, mf).sold_vol / 10000, 2) : null; source.push(...mFacts);
      }
      if (cumPs.length) {
        const cf = Object.assign({}, f, { period: '自定义', start: cumPs[0], end: cumPs[cumPs.length - 1], month: cumPs[cumPs.length - 1] });
        const cFacts = facts(cf); row.cumSold = cFacts.length ? E.round(E.aggregate(cFacts, cf).sold_vol / 10000, 2) : null; source.push(...cFacts);
      }
      rows.push(row);
    }
    base.rows = rows; base.sourceRows = source;
    base.chart = { kind: 'line', series: [{ key: 'cumSold', name: '当年累计售水量', type: 'line', yAxis: 0 }, { key: 'monthSold', name: '同月售水量', type: 'line', yAxis: 0 }] };
    base.note = (base.note ? base.note + ' ' : '') + '同步年分析：各年同一月份（' + mm + '月）与当年1月至该月累计售水量对比；数据范围 ' + dataFirst + ' 至 ' + dataLast + '，范围外年份缺数不按0，不以全年水量代理同月。';
    if (!rows.length) base.empty = '当前范围暂无可对比年份。';
    return base;
  }
  /* ---------- 远传离线水表明细（r44，与通讯在线率同口径） ---------- */
  function computeOfflineDetail(item, f, base) {
    const rows = nodeRows('remoteReadings');
    const month = E.periods(f).slice(-1)[0] || f.month || '2026-10';
    const snapMonth = rows.reduce((m, r) => { const d = (r.date || '').slice(0, 7); return d > m ? d : m; }, '');
    base.kind = 'offlineDetail';
    base.columns = [{ key: 'name', label: '用户' }, { key: 'meterId', label: '水表' }, { key: 'manufacturer', label: '厂家' }, { key: 'caliber', label: '口径' }, { key: 'lastCommunication', label: '最近通讯时间' }, { key: 'org', label: '组织' }];
    if (!rows.length || snapMonth !== month) { base.empty = '远传通讯快照（' + (snapMonth || '无') + '）与所选月份（' + month + '）不一致或缺数，离线明细不推定。'; base.rows = []; return base; }
    const byUser = new Map();
    rows.forEach(r => { const cur = byUser.get(r.userId); if (!cur || (r.lastCommunication || '') > (cur.lastCommunication || '')) byUser.set(r.userId, r); });
    const idx = ledgerIndex(); const ui = D().userIndex; const offline = [];
    byUser.forEach(r => { if ((r.lastCommunication || '').slice(0, 7) !== month) offline.push(r); });
    base.rows = offline.map(r => { const u = ui.get(r.userId) || {}; const led = ledgerRowOf(r, idx) || {}; return { name: u.name || r.userId, meterId: led.meterId || '—', manufacturer: led.manufacturer || '未提供', caliber: led.caliber || u.caliber || '未提供', lastCommunication: r.lastCommunication || '—', org: u.org || '', _raw: [r] }; });
    base.sourceRows = offline;
    base.note = (base.note ? base.note + ' ' : '') + '离线水表＝最近通讯月份早于所选月份（快照 ' + snapMonth + '）；与「远传水表通讯在线率」同口径，可导出明细。';
    if (!base.rows.length) base.empty = '当前范围所选月份无离线远传水表。';
    return base;
  }
  /* ---------- 未及时推送远传水表明细（r52，与开账率同源） ---------- */
  function computeUnpushedDetail(item, f, base) {
    const rows = protoUserRows('remotePushEvents', f, { period: true }).rows;
    const unpushed = rows.filter(e => protoPushState(e).state !== '正常');
    base.kind = 'unpushedDetail';
    base.columns = [{ key: 'name', label: '用户' }, { key: 'meterId', label: '水表' }, { key: 'period', label: '账期' }, { key: 'dueAt', label: '应推送时间' }, { key: 'pushedAt', label: '推送时间' }, { key: 'state', label: '推送状态' }, { key: 'reason', label: '原因' }, { key: 'org', label: '组织' }];
    const eligible = eligibleUsers(f);
    base.rows = unpushed.map(e => { const u = protoUserOf(e, eligible) || {}; const st = protoPushState(e); return { name: u.name || e.userId, meterId: e.meterId || '—', period: protoPeriodOf(e), dueAt: String(e.dueAt || '').slice(0, 10) || '—', pushedAt: e.pushedAt ? String(e.pushedAt).slice(0, 10) : '—', state: st.state, reason: st.reason, org: u.org || '', _raw: [e] }; });
    base.sourceRows = unpushed;
    base.note = (base.note ? base.note + ' ' : '') + '未及时推送＝预期推送事件（remotePushEvents）状态为缺失（无 pushedAt）或延迟（pushedAt 晚于 dueAt）；与「远传水表推送率统计」同源同口径，可导出明细。';
    if (!rows.length) base.empty = '当前范围所选期间暂无远传应推送事件。';
    else if (!base.rows.length) base.empty = '当前范围所选期间远传水表均已按期推送。';
    return base;
  }
  /* ---------- 手动填报接入（WBSupplement） ---------- */
  function withManual(result, item, dimKey, f) {
    const S = window.WBSupplement; if (!S) return result;
    if (result.empty) return result;                       // 已不适用/无数据：不再追加供水量说明，避免两种状态矛盾
    if (item.type === 'loss10') return result;            // 近10年各年当月/累计产销差率由专用 compute 取真实供水，withManual 不二次错 patch
    if (item.reportOnly) return result;                   // 月报专用项自带整块供水来源与派生口径，不经手动 patch
    const node = effectiveNode(); if (!node) return result;
    const O = Org();
    const periods = E.periods(f);
    // 对象/性质/行业/行政区/关键字等缩小后无独立供水口径（公司/组织筛选另行解析单位归属）
    const NARROW = ['nature', 'industry', 'admin', 'functional', 'org', 'team', 'line', 'meterType', 'keyword', 'booklet', 'caliberMm'];
    const narrowed = NARROW.some(k => { const v = f[k]; return v != null && v !== '' && !(Array.isArray(v) && !v.length); });
    let snode = node;
    if (f.orgNodeId && O.has(f.orgNodeId)) snode = O.get(f.orgNodeId);
    else if (f.company) { const cn = O.nodeForCompany(f.company); if (cn) snode = cn; }
    const nullLoss = note => {
      result.rows.forEach(r => { r.loss_rate = null; r.supply_vol = null; });
      if (result.totals) { result.totals.supply_vol = null; result.totals.loss_rate_pct = null; }
      if (result.chart) result.chart = null;
      if (note) result.note = (result.note ? result.note + ' ' : '') + note;
      return result;
    };
    if (item.metrics && item.metrics.includes('loss_rate')) {
      if (narrowed) return nullLoss('当前筛选无独立供水口径，不适用（不计算局部产销差率）。');
      if (!lossApplicable(snode)) return nullLoss('当前组织层级无独立供水口径，不适用（不计算局部产销差率）。');
      const sup = S.supplyFor(snode, periods);
      if (sup && sup.complete && sup.supply_vol != null) {
        const supplyRaw = sup.supply_vol; const soldRaw = result.totals ? result.totals.sold_vol : null;
        const rate = supplyRaw > 0 && soldRaw != null ? E.round((supplyRaw - soldRaw) / supplyRaw * 100, 2) : null;
        result.rows.forEach(r => {
          if (r.name === '合计' || r.name === '合计（集团）' || r.name === snode.name) { r.supply_vol = E.round(supplyRaw / 10000, 2); r.loss_rate = rate; return; }
          // 集团下按经营单位（children/company 维度）逐行取该单位真实填报并算其率
          if (snode.type === 'group' && (dimKey === 'children' || dimKey === 'company')) {
            let cn = r.nodeId ? O.get(r.nodeId) : null;
            if (!cn && r._raw && r._raw.length) { const u = O.unitOf(r._raw[0].orgNodeId); if (u) cn = O.get(u.nodeId); }
            if (!cn && dimKey === 'company') cn = O.nodeForCompany(r.name);
            if (cn && cn.type === 'company') {
              const cs = S.supplyFor(cn, periods);
              if (cs && cs.complete && cs.supply_vol != null) { const cSold = r.sold_vol == null ? null : r.sold_vol * 10000; r.supply_vol = E.round(cs.supply_vol / 10000, 2); r.loss_rate = cs.supply_vol > 0 && cSold != null ? E.round((cs.supply_vol - cSold) / cs.supply_vol * 100, 2) : null; }
              else { r.supply_vol = null; r.loss_rate = null; }
              return;
            }
          }
          r.supply_vol = null; r.loss_rate = null;          // 公司下级（所/班组/线路）及对象拆分无独立供水口径，不分摊
        });
        if (result.totals) { result.totals.supply_vol = supplyRaw; result.totals.loss_rate_pct = rate; }
        result.note = (result.note ? result.note + ' ' : '') + '供水量来源：手动填报（' + esc(sup.sourceLabel || '单位整体') + '），覆盖 ' + periods.length + ' 期。';
        result.manualSource = true;
      } else {
        let miss = '';
        if (sup && Array.isArray(sup.missing) && sup.missing.length) {
          const byUnit = new Map();
          sup.missing.forEach(m => { const k = m.unitName || m.unitId || '未知单位'; if (!byUnit.has(k)) byUnit.set(k, []); byUnit.get(k).push(m.period); });
          miss = Array.from(byUnit.entries()).map(([u, ps]) => u + '缺' + ps.join('、')).join('；');
        } else if (sup && sup.missingUnits && sup.missingUnits.length) miss = sup.missingUnits.join('、');
        return nullLoss('供水量未接入或手动填报不完整' + (miss ? '（缺：' + miss + '）' : '') + '，产销差率缺数，不按0计算。');
      }
    }
    if (item.id === 'reg.unreg') {
      const unitWhole = !dimKey || dimKey === 'children' || dimKey === 'company';
      if (!unitWhole || !lossApplicable(snode)) { result.note = (result.note ? result.note + ' ' : '') + '未注册用户数为单位整体末月存量，当前维度不适用，不分摊。'; return result; }
      const nr = S.nonRegisteredFor(snode, periods[periods.length - 1]);
      if (nr && nr.complete && nr.value != null) { result.rows.forEach(r => { if (r.name === '合计' || r.name === '合计（集团）' || r.name === '合计（本公司）' || r.name === snode.name) r.non_registered = nr.value; }); result.note = (result.note ? result.note + ' ' : '') + '未注册用户数来源：手动填报（末月存量）。'; result.manualSource = true; }
      else { result.note = (result.note ? result.note + ' ' : '') + '未注册用户数手动填报不完整，缺数不按0。'; }
    }
    return result;
  }
  const _computeItem = computeItem;
  computeItem = function (item, dimKey, f) { const ef = effectiveF(item, f); const r = markProto(withManual(_computeItem(item, dimKey, ef), item, dimKey, ef), item); r.periodLabel = E.periodLabel(ef); return r; };
  /* ---------- 图表 option / 表格 ---------- */
  function fmtVal(v, dec) { return v == null || (typeof v === 'number' && isNaN(v)) ? '—' : E.fmt(v, dec == null ? 0 : dec); }
  const COMPOSE_MIN_WIDTH = 880; /* 组合并排最小容器宽；不足时退化单 cartesian（月报 1100×420 保持并排）。 */
  const PIE_MAX_CATS = 12;
  /* 环图准入：2..12 类、全值有限非负、合计>0；单类别不画 100% 自饼，缺数/负值不补 0。 */
  function pieValid(rows, key) {
    if (rows.length < 2 || rows.length > PIE_MAX_CATS) return false;
    let sum = 0;
    for (const r of rows) { const v = r[key]; if (v == null || !isFinite(v) || v < 0) return false; sum += v; }
    return sum > 0;
  }
  /* 统一入口：同一 option 供主屏/单框 PNG/月报 PNG；opts.width 容器宽、opts.height 实际画布高、
     opts.subtitle 为导出/报告期间来源行（预留 top=30 heading 区，标题一律 title[] 数组）。 */
  function chartOption(result, opts) {
    opts = opts || {}; const ch = result.chart; if (!ch || !result.rows.length) return null;
    const W = Math.max(320, Math.round(opts.width || 1000));
    const H = Math.max(240, Math.round(opts.height || 520));
    const top = (opts.title ? 26 : 0) + (opts.subtitle ? 30 : 0);
    const titles = [];
    if (opts.title) titles.push({ text: String(opts.title), left: 'center', top: 4, textStyle: { fontSize: 14, fontWeight: 600, color: '#22364A' } });
    if (opts.subtitle) titles.push({ text: String(opts.subtitle), left: 'center', top: opts.title ? 30 : 6, textStyle: { fontSize: 12, fontWeight: 'normal', color: '#5A6B7B' } });
    let option = null;
    if (ch.composition && W >= COMPOSE_MIN_WIDTH) {
      if (ch.composition === 'bar-share' && ch.shareKey && pieValid(result.rows, ch.shareKey)) option = barShareOption(result, W, H, top);
      else if (ch.composition === 'dual-donut') option = dualDonutOption(result, W, H, top);
      else if (ch.composition === 'stock-flow') option = stockFlowOption(result, W, H, top);
    }
    if (!option) option = cartesianOption(result, W, H, top);
    if (!option) return null;
    option.animation = opts.animation !== false;
    option.title = titles.concat(option.title || []);
    return option;
  }
  /* 单面板 cartesian（亦为组合退化形态）：grid[]/legend[]/xAxis[]/yAxis[]，null 保持缺数。 */
  function cartesianOption(result, W, H, top) {
    const ch = result.chart; const rows = result.rows; const cats = rows.map(r => r.name);
    const metaOf = key => METRICS[key] || (result.columns || []).find(c => c.key === key) || {};
    if (ch.kind === 'pie') {
      const s0 = ch.series[0]; const m = metaOf(s0.key);
      if (!pieValid(rows, s0.key)) return null;
      return { color: E.colors, tooltip: { trigger: 'item', formatter: p => p.name + '：' + fmtVal(p.value, m.dec) + (m.unit || '') + '（' + p.percent + '%）' }, legend: [{ top: top + 6, type: 'scroll' }], series: [{ type: 'pie', radius: ['38%', '66%'], center: ['50%', Math.round(top + (H - top) * 0.56)], itemStyle: pieDepth(), data: rows.map((r, i) => pieDatum(r.name, r[s0.key], i)), label: { formatter: '{b}\n{d}%' } }] };
    }
    const units = [];
    ch.series.forEach(s => { const u = metaOf(s.key).unit || ''; if (units.indexOf(u) < 0) units.push(u); });
    const grid = [{ left: 12, right: 48 + Math.max(0, units.length - 1) * 56, top: top + 42, bottom: cats.length > 6 ? 56 : 36, containLabel: true }];
    const legend = [{ top: top + 6, type: 'scroll', data: ch.series.map(s => s.name) }];
    const yAxes = units.map((u, i) => i === 0 ? { type: 'value', name: u, gridIndex: 0 } : { type: 'value', name: u, gridIndex: 0, position: 'right', offset: (i - 1) * 56 });
    const series = ch.series.map(s => { const m = metaOf(s.key); const u = m.unit || ''; const base = { name: s.name, type: s.type || 'bar', xAxisIndex: 0, yAxisIndex: units.indexOf(u), data: rows.map(r => r[s.key] == null ? null : r[s.key]), emphasis: { focus: 'series' }, tooltip: { valueFormatter: v => v == null ? '—' : fmtVal(v, m.dec) + (u ? ' ' + u : '') } }; if (s.type === 'line') { base.smooth = true; base.symbolSize = 6; base.connectNulls = false; } else { base.barMaxWidth = 34; } return base; });
    return { color: E.colors, grid, legend, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, xAxis: [{ type: 'category', gridIndex: 0, data: cats, axisLabel: { interval: cats.length > 18 ? 'auto' : 0, rotate: cats.length > 6 ? 30 : 0, fontSize: 11 } }], yAxis: yAxes, series };
  }
  /* ---------- 组合面板（PDF 月报版式：绝对量＋占比 / 双环 / 量率双轴） ---------- */
  function panelTitle(top, text, left, align, subtext) {
    const t = { text, left, top: top + 2, textStyle: { fontSize: 13, fontWeight: 600, color: '#22364A' }, itemGap: 2 };
    if (align) t.textAlign = align;
    if (subtext) { t.subtext = subtext; t.subtextStyle = { fontSize: 10, color: '#7A8A99' }; }
    return t;
  }
  function pieTip(m) { return p => p.name + '：' + fmtVal(p.value, m.dec) + (m.unit ? ' ' + m.unit : '') + '（' + p.percent + '%）'; }
  function valTip(m) { return v => v == null ? '—' : fmtVal(v, m.dec) + (m.unit ? ' ' + m.unit : ''); }
  /* 环图微妙深度：2D 精确扇区角＋纵向渐变＋投影；无 3D 透视、无 roseType，点击契约不变。 */
  function lightenHex(hex, t) {
    const n = parseInt(hex.slice(1), 16);
    const mix = c => Math.round(c + (255 - c) * t);
    return 'rgb(' + mix((n >> 16) & 255) + ',' + mix((n >> 8) & 255) + ',' + mix(n & 255) + ')';
  }
  function pieDepth() { return { borderColor: '#fff', borderWidth: 2, shadowBlur: 8, shadowColor: 'rgba(31,58,95,0.18)', shadowOffsetY: 3 }; }
  function pieDatum(name, value, i, extra) {
    const base = E.colors[i % E.colors.length];
    const o = { name, value, itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: lightenHex(base, 0.18) }, { offset: 1, color: base }] } } };
    if (extra) Object.assign(o, extra);
    return o;
  }
  /* bar-share：左绝对量柱/线（尊重 series 类型与独立 % 轴，% 轴自适应含负增长/超100完成率）、右真实分母占比环；类别名保持真实可排行，点击映射当前行。 */
  function barShareOption(result, W, H, top) {
    const ch = result.chart; const rows = result.rows; const cats = rows.map(r => r.name);
    const metaOf = key => METRICS[key] || (result.columns || []).find(c => c.key === key) || {};
    const pk = ch.shareKey; const pm = metaOf(pk);
    const total = rows.reduce((s, r) => s + (r[pk] || 0), 0);
    const split = Math.round(W * 0.58); const donutW = W - split;
    const legendW = Math.min(120, Math.round(donutW * 0.32));
    const cx = split + Math.round((donutW - legendW) / 2); const cy = top + Math.round((H - top) * 0.56);
    const radius = Math.max(36, Math.min(Math.round((H - top) * 0.28), Math.round((donutW - legendW) * 0.30)));
    const many = cats.length > 8;
    const barLegend = ch.series.length > 1;
    const units = [];
    ch.series.forEach(s => { const u = metaOf(s.key).unit || ''; if (units.indexOf(u) < 0) units.push(u); });
    const titles = [panelTitle(top, pm.label + '（' + (pm.unit || '') + '）', 12), panelTitle(top, pm.label + '占比', split + 10, null, '合计 ' + fmtVal(total, pm.dec) + (pm.unit || ''))];
    const legends = [{ orient: 'vertical', right: 8, top: top + 40, bottom: 14, type: 'scroll', itemWidth: 12, itemHeight: 9, textStyle: { fontSize: 11, width: Math.max(40, legendW - 26), overflow: 'truncate' }, data: cats }];
    if (barLegend) legends.unshift({ top: top + 30, left: 12, type: 'scroll', data: ch.series.map(s => s.name) });
    const series = ch.series.map(s => {
      const m = metaOf(s.key); const u = m.unit || ''; const isLine = s.type === 'line';
      const o = { name: s.name, type: isLine ? 'line' : 'bar', xAxisIndex: 0, yAxisIndex: units.indexOf(u), data: rows.map(r => r[s.key] == null ? null : r[s.key]), emphasis: { focus: 'series' }, tooltip: { valueFormatter: valTip(m) } };
      if (isLine) { o.smooth = true; o.symbolSize = 6; o.connectNulls = false; }
      else { o.barMaxWidth = 30; o.label = { show: !many, position: 'top', fontSize: 10, color: '#43566A', formatter: p => fmtVal(p.value, m.dec) }; }
      return o;
    });
    series.push({ name: pm.label + '占比', type: 'pie', radius: [Math.round(radius * 0.58), radius], center: [cx, cy], itemStyle: pieDepth(), data: rows.map((r, i) => pieDatum(r.name, r[pk], i)), label: many ? { show: false } : { formatter: '{d}%', fontSize: 10, color: '#43566A' }, labelLine: many ? { show: false } : { length: 8, length2: 6 }, emphasis: { scale: true }, tooltip: { trigger: 'item', formatter: pieTip(pm) } });
    const yAxes = units.map((u, i) => i === 0 ? { type: 'value', name: u, gridIndex: 0 } : { type: 'value', name: u, gridIndex: 0, position: 'right', offset: (i - 1) * 56 });
    return { color: E.colors, title: titles, legend: legends, grid: [{ left: 12, right: donutW + (units.length > 1 ? 56 : 12), top: top + (barLegend ? 56 : 34), bottom: cats.length > 6 ? 56 : 36, containLabel: true }], tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, xAxis: [{ type: 'category', gridIndex: 0, data: cats, axisLabel: { interval: cats.length > 18 ? 'auto' : 0, rotate: cats.length > 6 ? 30 : 0, fontSize: 11 } }], yAxis: yAxes, series };
  }
  /* dual-donut：重点用户户数占比与水量占比两个真实分母环（Σ户数 / Σ水量各自合计）；分区名非类别，点击切表格。 */
  function dualDonutOption(result, W, H, top) {
    const rows = result.rows;
    const totalOf = k => { let s = 0; for (const r of rows) { const v = r[k]; if (v == null || !isFinite(v) || v < 0) return null; s += v; } return s; };
    const panels = [];
    const cb = totalOf('bigCount'); const cs = totalOf('smallCount');
    if (cb != null && cs != null && cb + cs > 0) panels.push({ title: '户数占比', unit: '户', dec: 0, big: cb, small: cs });
    const vb = totalOf('bigVol'); const vs = totalOf('smallVol');
    if (vb != null && vs != null && vb + vs > 0) panels.push({ title: '水量占比', unit: 'm³', dec: 0, big: vb, small: vs });
    if (!panels.length) return null;
    const n = panels.length;
    const cy = top + Math.round((H - top) * 0.58);
    const radius = Math.max(40, Math.min(Math.round((H - top) * 0.30), Math.round((W / n) * 0.26)));
    const titles = []; const series = [];
    panels.forEach((p, i) => {
      const cx = Math.round(W * (i + 0.5) / n);
      titles.push(panelTitle(top, p.title, cx, 'center', '合计 ' + fmtVal(p.big + p.small, p.dec) + ' ' + p.unit));
      series.push({ name: p.title, type: 'pie', chartAction: 'table', radius: [Math.round(radius * 0.58), radius], center: [cx, cy], itemStyle: pieDepth(), data: [pieDatum('＞100m³', p.big, 0, { chartAction: 'table' }), pieDatum('≤100m³', p.small, 1, { chartAction: 'table' })], label: { formatter: '{d}%', fontSize: 11, color: '#43566A' }, labelLine: { length: 10, length2: 8 }, emphasis: { scale: true }, tooltip: { trigger: 'item', formatter: pieTip(p) } });
    });
    return { color: E.colors, title: titles, legend: [{ top: top + 34, left: 'center', data: ['＞100m³', '≤100m³'] }], tooltip: { trigger: 'item' }, series };
  }
  /* stock-flow：供水量/售水量柱（万m³）＋漏损率线（独立 % 轴，不按区域平均）；缺数保持 null。 */
  function stockFlowOption(result, W, H, top) {
    const ch = result.chart; const rows = result.rows; const cats = rows.map(r => r.name);
    const metaOf = key => METRICS[key] || (result.columns || []).find(c => c.key === key) || {};
    const volSeries = ch.series.filter(s => s.type !== 'line'); const rateSeries = ch.series.filter(s => s.type === 'line');
    if (!volSeries.length || !rateSeries.length) return null;
    const volUnit = metaOf(volSeries[0].key).unit || '万m³';
    const title = panelTitle(top, volSeries.map(s => s.name).join(' / ') + '（' + volUnit + '）与' + rateSeries.map(s => s.name).join(' / ') + '（%）', 12);
    const series = ch.series.map(s => { const m = metaOf(s.key); const isLine = s.type === 'line'; const base = { name: s.name, type: isLine ? 'line' : 'bar', xAxisIndex: 0, yAxisIndex: isLine ? 1 : 0, data: rows.map(r => r[s.key] == null ? null : r[s.key]), emphasis: { focus: 'series' }, tooltip: { valueFormatter: valTip(m) } }; if (isLine) { base.smooth = true; base.symbolSize = 6; base.connectNulls = false; } else { base.barMaxWidth = 30; } return base; });
    return { color: E.colors, title: [title], legend: [{ top: top + 26, left: 12, type: 'scroll', data: ch.series.map(s => s.name) }], grid: [{ left: 12, right: 56, top: top + 52, bottom: cats.length > 6 ? 56 : 36, containLabel: true }], tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, xAxis: [{ type: 'category', gridIndex: 0, data: cats, axisLabel: { interval: cats.length > 18 ? 'auto' : 0, rotate: cats.length > 6 ? 30 : 0, fontSize: 11 } }], yAxis: [{ type: 'value', name: volUnit, gridIndex: 0 }, { type: 'value', name: '%', gridIndex: 0, position: 'right' }], series };
  }
  function tableRows(result) {
    const cols = result.columns || [];
    const headers = cols.map(c => ({ key: c.key, label: c.label + (c.unit ? '（' + c.unit + '）' : ''), align: c.align || (c.dec != null ? 'right' : 'left') }));
    const rows = (result.rows || []).map(r => { const o = {}; cols.forEach(c => { const v = r[c.key]; o[c.key] = c.dec != null ? fmtVal(v, c.dec) : (v == null ? '—' : v); }); return o; });
    const out = { headers, rows };
    if (result.totals && cols.some(c => METRICS[c.key])) {
      out.totals = cols.map((c, i) => i === 0 ? '合计' : (METRICS[c.key] ? fmtVal(METRICS[c.key].get(result.totals), c.dec) : '—'));
    }
    return out;
  }
  /* ---------- 帧结果 / 导出 ---------- */
  function frameResult(fk) {
    const st = readState(); const fs = st[fk || 'f1']; const item = findItem(fs.group, fs.item);
    if (!item) return { result: { columns: [], rows: [], chart: null, note: '', empty: '分析项未注册：' + fs.item, sourceRows: [], totals: null, kind: 'table' }, item: null, fs };
    return { result: computeItem(item, fs.dim, filters()), item, fs };
  }
  function manualVersionNow() {
    const S = window.WBSupplement;
    if (!S || typeof S.version !== 'function') return null;
    try { const v = S.version(); return Number.isFinite(+v) ? +v : null; } catch (_) { return null; }
  }
  function frameManualTag(result, mv) { return result && result.manualSource ? '人工填报（版本' + (mv == null ? '—' : mv) + '）' : '无'; }
  function frameStateJson() { try { return JSON.stringify(WB.state || {}); } catch (_) { return ''; } }
  function captureFrameLock() {
    const cur = A().current() || {};
    return { scopeVersion: E.scopeVersion(), personaId: cur.personaId || null, stateJson: frameStateJson(), manualVersion: manualVersionNow() };
  }
  function frameLockBreach(lock) {
    const cur = A().current() || {};
    if ((cur.personaId || null) !== lock.personaId) return '演示身份已切换';
    if (E.scopeVersion() !== lock.scopeVersion) return '数据范围已变更';
    if (frameStateJson() !== lock.stateJson) return '查询条件（范围/期间/口径）已变更';
    if (manualVersionNow() !== lock.manualVersion) return '单位手填数据版本已变更';
    return '';
  }
  function exportFrameCsv(fk) {
    const { result, item } = frameResult(fk);
    if (!item) { shell().toast('当前分析项缺失，无法导出', 'warn'); return; }
    const f = effectiveF(item, filters());
    const mv = manualVersionNow();
    const { headers, rows, totals } = tableRows(result);
    const filterText = E.filterLabel(f);
    const manualTag = frameManualTag(result, mv);
    const synthetic = !!result.synthetic;
    const sourceTag = result.sourceLabel || '原型模拟数据（非真实接入）';
    const headerLabels = headers.map(h => h.label).concat(['查询条件', '手动来源']).concat(synthetic ? ['数据来源'] : []);
    const dataRows = rows.map(r => headers.map(h => r[h.key]).concat([filterText, manualTag]).concat(synthetic ? [sourceTag] : []));
    const data = totals ? dataRows.concat([totals.concat([filterText, manualTag]).concat(synthetic ? [sourceTag] : [])]) : dataRows;
    const sourceRows = result.sourceRows && result.sourceRows.length ? result.sourceRows : (result.rows || []).flatMap(r => r._raw || []);
    const meta = E.bindExport(data, sourceRows, Object.assign({ kind: 'table', title: item.label, manualVersion: mv }, synthetic ? { synthetic: true, sourceLabel: sourceTag } : {}));
    E.downloadCSV('v6-' + item.id, headerLabels, data, meta);
  }
  async function exportFramePng(fk) {
    const { result, item } = frameResult(fk);
    if (!item) { shell().toast('当前分析项缺失，无法导出', 'warn'); return; }
    const f = effectiveF(item, filters());
    const lock = captureFrameLock();
    const opt = chartOption(result, { animation: false, width: 1000, height: 520 });
    if (!opt) { shell().toast('当前视图无图表可导出', 'warn'); return; }
    const sourceRows = result.sourceRows && result.sourceRows.length ? result.sourceRows : (result.rows || []).flatMap(r => r._raw || []);
    const meta = E.bindExport(sourceRows, sourceRows, { kind: 'chart', title: item.label, manualVersion: lock.manualVersion });
    const pre = E.exportGuard(sourceRows, meta);
    if (!pre.ok) { shell().toast(pre.reason, 'warn'); return; }
    const b0 = frameLockBreach(lock);
    if (b0) { shell().toast('导出前' + b0 + '，已取消，请重新导出', 'warn'); return; }
    const holder = document.createElement('div'); holder.style.cssText = 'position:fixed;left:-9999px;width:1000px;height:520px;'; document.body.appendChild(holder);
    let inst = null;
    const cancel = reason => { E.logEvent('export', 'chart-png:' + item.id, false, reason, {}); shell().toast('导出期间' + reason + '，已取消，请重新导出', 'warn'); };
    try {
      inst = echarts.init(holder, null, { renderer: 'canvas' }); inst.setOption(opt);
      const b1 = frameLockBreach(lock);
      if (b1) { cancel(b1); return; }
      const url = inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
      inst.dispose(); inst = null;
      const image = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('图表图像加载失败')); i.src = url; });
      const b2 = frameLockBreach(lock);
      if (b2) { cancel(b2); return; }
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height + 142; const c = canvas.getContext('2d');
      c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, canvas.width, canvas.height);
      c.fillStyle = '#317FC2'; c.fillRect(0, 0, 10, canvas.height);
      c.fillStyle = '#172B3A'; c.font = 'bold 30px "Microsoft YaHei",sans-serif'; c.fillText(item.label, 38, 48);
      c.fillStyle = '#536C80'; c.font = '18px "Microsoft YaHei",sans-serif';
      const summary = E.periodLabel(f) + '　' + E.filterLabel(f);
      c.fillText(summary.length > 95 ? summary.slice(0, 95) + '…' : summary, 38, 85);
      c.drawImage(image, 0, 104);
      c.fillStyle = '#758697'; c.font = '16px "Microsoft YaHei",sans-serif';
      const manualNote = result.manualSource && lock.manualVersion != null ? '　含单位手填补充（版本' + lock.manualVersion + '）' : '';
      const sourceNote = result.synthetic ? '　' + (result.sourceLabel || '原型模拟数据（非真实接入）') : '';
      c.fillText('演示数据｜本地模拟｜源系统只读　数据截至 ' + D().asOf + manualNote + sourceNote, 38, canvas.height - 17);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      if (!blob) throw new Error('PNG生成失败');
      const post = E.exportGuard(sourceRows, meta);
      const b3 = frameLockBreach(lock);
      if (!post.ok || b3) { cancel(b3 || post.reason || '数据范围或手填数据已变更'); return; }
      const link = URL.createObjectURL(blob), a = document.createElement('a'); a.href = link; a.download = ('v6-' + item.id + '.png').replace(/[\\/:*?"<>|]/g, '_'); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(link), 2000);
      E.logEvent('export', 'chart-png:' + item.id, true, '', { rows: sourceRows.length }); shell().toast('已导出PNG · 含标题/期间/口径与来源水印', 'ok');
    } catch (e) { shell().toast('PNG导出失败：' + e.message, 'err'); }
    finally { if (inst) { try { inst.dispose(); } catch (_) {} inst = null; } if (holder.parentNode) document.body.removeChild(holder); }
  }
  /* ---------- 月报 18 章模型 ---------- */
  const REPORT_TITLES = ['一、集团注册用户分析', '二、集团新增注册和注销用户分析', '三、集团产销差率', '四、各供水区域产销差率', '五、集团7月售水量分析', '六、集团累计售水量分析', '七、各供水区域售水量分析', '八、各行政区域用水分析', '九、7月各用水性质售水量分析', '十、各用水性质累计售水量分析', '十一、集团重点行业用水分析', '十二、集团7月重点用户用水分析', '十三、规模以上企业用水量', '十四、集团售水单价', '十五、各用水性质售水量对单价影响', '十六、集团收费率', '十七、牟新水务供售水量', '十八、牟新水务营销指标'];
  /* 月报专用分析项（reportOnly：绕过 withManual 应用层补数；供水量走 reportSupply 整块单一来源，派生汇总保留真实 sourceRows）。 */
  const REPORT_ITEMS = {
    'loss.reportGroupMonth': { id: 'loss.reportGroupMonth', group: 'loss', type: 'reportLoss', mode: 'month', dim: 'group', metrics: ['supply_vol', 'sold_vol', 'loss_rate'], reportOnly: true, label: '集团当月供售水量与产销差率' },
    'loss.reportGroupCumRate': { id: 'loss.reportGroupCumRate', group: 'loss', type: 'reportLoss', mode: 'cumRate', dim: 'group', metrics: ['loss_rate'], reportOnly: true, label: '集团累计产销差率走势' },
    'loss.reportRegionMonth': { id: 'loss.reportRegionMonth', group: 'loss', type: 'reportLoss', mode: 'month', dim: 'company', metrics: ['supply_vol', 'sold_vol', 'loss_rate'], reportOnly: true, label: '各区域当月产销差率' },
    'loss.reportRegionCum': { id: 'loss.reportRegionCum', group: 'loss', type: 'reportLoss', mode: 'cum', dim: 'company', metrics: ['supply_vol', 'sold_vol', 'loss_rate'], reportOnly: true, label: '各区域累计产销差率' },
    'sold.reportTrendFlow': { id: 'sold.reportTrendFlow', group: 'sold', type: 'reportTrend', metric: 'sold_vol', mode: 'flow', period: '年内累计', metrics: ['sold_vol'], reportOnly: true, label: '集团月度售水量走势' },
    'sold.reportTrendCum': { id: 'sold.reportTrendCum', group: 'sold', type: 'reportTrend', metric: 'sold_vol', mode: 'cum', period: '年内累计', metrics: ['sold_vol'], reportOnly: true, label: '集团累计售水量走势' },
    'price.reportTrend': { id: 'price.reportTrend', group: 'price', type: 'reportTrend', metric: 'avg_price', mode: 'flow', period: '年内累计', metrics: ['avg_price'], reportOnly: true, label: '集团月度售水单价走势' },
    'sold.reportBigIndustryMonth': { id: 'sold.reportBigIndustryMonth', group: 'sold', type: 'reportBigIndustry', mode: 'month', metrics: ['sold_vol'], reportOnly: true, label: '当月重点行业用水（月用＞100m³用户集合）' },
    'sold.reportBigIndustryAvg': { id: 'sold.reportBigIndustryAvg', group: 'sold', type: 'reportBigIndustry', mode: 'avg', metrics: ['sold_vol'], reportOnly: true, label: '累计重点行业用水（月均≥100m³用户集合）' }
  };
  /* 月报块摘要：仅客观业务事实（合计/加权率/基期缺失），不含归因或实现说明。sum=[metricKey,opts]。 */
  function reportSummary(result, metricKey, opts) {
    opts = opts || {};
    const rows = (result && result.rows) || [];
    if (!rows.length) return (result && result.empty) || '本期无数据（缺数不按0计）。';
    const m = METRICS[metricKey] || {};
    const dec = opts.dec != null ? opts.dec : (m.dec != null ? m.dec : 2);
    const unit = opts.unit != null ? opts.unit : (m.unit || '');
    const label = opts.label || m.label || '';
    let value = null;
    if (result.totals && m.get) value = m.get(result.totals);
    if (value == null) {
      if (opts.last) { for (let i = rows.length - 1; i >= 0; i--) { const v = rows[i][metricKey]; if (v != null && isFinite(v)) { value = v; break; } } }
      else { let s = 0, any = false; for (const r of rows) { const v = r[metricKey]; if (v != null && isFinite(v)) { s += v; any = true; } } value = any ? E.round(s, dec) : null; }
    }
    if (value == null) return opts.emptyText || ('本期无有效' + label + '数据。');
    let text;
    if (opts.rate) text = (opts.prefix || '') + label + ' ' + E.fmt(value, dec) + (unit ? ' ' + unit : '');
    else if (opts.zeroText && value === 0) text = opts.zeroText;
    else text = (opts.prefix || '本期') + label + '合计 ' + E.fmt(value, dec) + (unit ? ' ' + unit : '');
    if (opts.priorKey && !rows.some(r => r[opts.priorKey] != null && isFinite(r[opts.priorKey]))) text += '；上年同期无数据来源，未绘制同期比较';
    if (result.synthetic && result.sourceLabel) text += '；数据来源：' + result.sourceLabel;
    return text + '。';
  }

  function chapterResult(groupId, itemId, dim, f) { const item = findItem(groupId, itemId); if (!item) return { columns: [], rows: [], chart: null, note: '', empty: '报告分析项未注册：' + groupId + '/' + itemId, sourceRows: [], totals: null, kind: 'table' }; return computeItem(item, dim, f); }
  function buildReportModel(f) {
    f = f || filters();
    const cur = A().current();
    const monthF = Object.assign({}, f, { period: '当月' });
    const cumF = Object.assign({}, f, { period: '年内累计' });
    const meta = { title: '供水营销指标月报', periodLabel: E.periodLabel(f), filterLabel: E.filterLabel(f), scopeLabel: cur.scopeLabel || '', persona: cur.displayName || '', generatedAt: new Date().toLocaleString('zh-CN'), dataRange: D().periods[0] + ' 至 ' + D().periods[D().periods.length - 1], asOf: D().asOf };
    /* B：presentation 缺省 chart；summary 仅客观事实（reportSummary 由 result 计算，避免重复取数）。 */
    const B = (heading, result, presentation, sum) => {
      const b = { heading, result, synthetic: !!result.synthetic, sourceLabel: result.sourceLabel || null, prototypeRows: result.prototypeRows || 0 };
      if (presentation) b.presentation = presentation;
      const summary = sum ? reportSummary(result, sum[0], sum[1]) : null;
      if (typeof summary === 'string' && summary.trim()) b.summary = summary.trim();
      return b;
    };
    const muxinEmpty = (note) => ({ columns: [{ key: 'name', label: '指标' }, { key: 'value', label: '数值' }], rows: [], chart: null, note, empty: note, sourceRows: [], totals: null, kind: 'table' });
    const chapters = [
      { no: 1, title: REPORT_TITLES[0], blocks: [
        B('注册用户统计（按区域）', chapterResult('reg', 'reg.total', 'children', cumF), null, ['registered_count', { prefix: '本年累计', label: '注册用户' }]),
        B('注册用户占比（按用水性质）', chapterResult('reg', 'reg.total', 'nature', cumF), null, ['registered_count', { prefix: '本年累计', label: '注册用户' }]),
        B('抄表到户统计', chapterResult('reg', 'reg.total', 'collection', cumF), null, ['registered_count', { prefix: '本年累计', label: '抄表到户注册用户' }])] },
      { no: 2, title: REPORT_TITLES[1], blocks: [
        B('新增注册按用水性质（本年累计）', chapterResult('reg', 'reg.new', 'nature', cumF), null, ['new_count', { prefix: '本年累计', label: '新增注册', zeroText: '本年累计无新增注册（0 户）' }]),
        B('注销用户按用水性质（本年累计）', chapterResult('reg', 'reg.closed', 'nature', cumF), null, ['closed_count', { prefix: '本年累计', label: '注销', zeroText: '本年累计无注销（0 户）' }])] },
      { no: 3, title: REPORT_TITLES[2], blocks: [
        B('集团供售水量与产销差率（逐月）', chapterResult('loss', 'loss.reportGroupMonth', 'children', cumF), null, ['loss_rate', { rate: true, prefix: '本年累计', label: '产销差率（供售水量加权）' }]),
        B('集团累计产销差率走势', chapterResult('loss', 'loss.reportGroupCumRate', 'children', cumF), null, ['loss_rate', { rate: true, prefix: '本年累计', label: '产销差率（加权）', priorKey: 'prevCumRate' }])] },
      { no: 4, title: REPORT_TITLES[3], blocks: [
        B('各区域当月产销差率', chapterResult('loss', 'loss.reportRegionMonth', 'children', monthF), null, ['loss_rate', { rate: true, prefix: '当月', label: '集团产销差率（加权）', priorKey: 'prev_rate' }]),
        B('各区域累计产销差率', chapterResult('loss', 'loss.reportRegionCum', 'children', cumF), null, ['loss_rate', { rate: true, prefix: '本年累计', label: '集团产销差率（加权）', priorKey: 'prev_rate' }])] },
      { no: 5, title: REPORT_TITLES[4], blocks: [
        B('集团当月售水量计划完成', chapterResult('sold', 'sold.planGroup', 'children', monthF), null, ['sold_vol', { prefix: '当月', label: '售水量' }]),
        B('集团月度售水量走势（含上年同期）', chapterResult('sold', 'sold.reportTrendFlow', 'children', monthF), null, ['value', { prefix: '本年累计', label: '售水量', dec: 2, unit: '万m³', priorKey: 'prevValue' }])] },
      { no: 6, title: REPORT_TITLES[5], blocks: [
        B('集团累计售水量计划完成', chapterResult('sold', 'sold.planGroup', 'children', cumF), null, ['sold_vol', { prefix: '本年累计', label: '售水量' }]),
        B('集团累计售水量走势（含上年同期）', chapterResult('sold', 'sold.reportTrendCum', 'children', cumF), null, ['value', { prefix: '截至本月', label: '累计售水量', dec: 2, unit: '万m³', last: true, priorKey: 'prevValue' }])] },
      { no: 7, title: REPORT_TITLES[6], blocks: [
        B('各区域当月售水量（计划完成率与占比）', chapterResult('sold', 'sold.planRegion', 'children', monthF), null, ['sold_vol', { prefix: '当月', label: '售水量' }]),
        B('各区域累计售水量（计划完成率与占比）', chapterResult('sold', 'sold.planRegion', 'children', cumF), null, ['sold_vol', { prefix: '本年累计', label: '售水量' }])] },
      { no: 8, title: REPORT_TITLES[7], blocks: [
        B('各行政区域当月用水量（同比与占比）', chapterResult('sold', 'sold.adminWater', 'admin', monthF), null, ['sold_vol', { prefix: '当月', label: '用水量', priorKey: 'yoy' }]),
        B('各行政区域累计用水量（同比与占比）', chapterResult('sold', 'sold.adminWater', 'admin', cumF), null, ['sold_vol', { prefix: '本年累计', label: '用水量', priorKey: 'yoy' }])] },
      { no: 9, title: REPORT_TITLES[8], blocks: [
        B('当月各用水性质售水量及占比', chapterResult('sold', 'sold.nature', 'nature', monthF), null, ['sold_vol', { prefix: '当月', label: '售水量' }])] },
      { no: 10, title: REPORT_TITLES[9], blocks: [
        B('累计各用水性质售水量及占比', chapterResult('sold', 'sold.nature', 'nature', cumF), null, ['sold_vol', { prefix: '本年累计', label: '售水量' }])] },
      { no: 11, title: REPORT_TITLES[10], blocks: [
        B('当月重点行业用水（月用＞100m³用户集合按行业）', chapterResult('sold', 'sold.reportBigIndustryMonth', 'children', monthF), null, ['sold_vol', { prefix: '当月', label: '重点用户售水量', priorKey: 'yoy' }]),
        B('累计重点行业用水（月均≥100m³用户集合按行业）', chapterResult('sold', 'sold.reportBigIndustryAvg', 'children', cumF), null, ['sold_vol', { prefix: '本年累计', label: '重点用户售水量', priorKey: 'yoy' }])] },
      { no: 12, title: REPORT_TITLES[11], blocks: [
        B('重点用户月用＞100m³/以内户数与水量占比', chapterResult('sold', 'sold.bigUserSummary', 'children', monthF), null, ['bigVol', { prefix: '当月', label: '重点用户（＞100m³）水量', dec: 0, unit: 'm³' }])] },
      { no: 13, title: REPORT_TITLES[12], blocks: [
        B('规模以上企业按行业用水量（含同比）', chapterResult('sold', 'sold.scaleIndustry', 'industry', cumF), null, ['sold_vol', { prefix: '本年累计', label: '规模以上企业售水量', priorKey: 'yoy' }])] },
      { no: 14, title: REPORT_TITLES[13], blocks: [
        B('集团当月售水单价（分区域）', chapterResult('price', 'price.compare', 'children', monthF), null, ['avg_price', { rate: true, prefix: '当月', label: '综合售水单价' }]),
        B('集团累计售水单价（分区域）', chapterResult('price', 'price.compare', 'children', cumF), null, ['avg_price', { rate: true, prefix: '本年累计', label: '综合售水单价' }]),
        B('集团月度售水单价走势（含上年同期）', chapterResult('price', 'price.reportTrend', 'children', monthF), null, ['value', { rate: true, label: '当月综合售水单价', dec: 3, unit: '元/m³', last: true, priorKey: 'prevValue' }])] },
      { no: 15, title: REPORT_TITLES[14], blocks: [
        B('各用水性质售水量对单价影响（量化分解）', chapterResult('price', 'price.calc', 'nature', cumF), 'table', ['avg_price', { rate: true, prefix: '本年累计', label: '综合售水单价' }])] },
      { no: 16, title: REPORT_TITLES[15], blocks: [
        B('集团累计收费率（分区域，含上年同期实收）', chapterResult('charge', 'charge.compare', 'children', cumF), null, ['charge_rate', { rate: true, prefix: '本年累计', label: '收费率', priorKey: 'prev_received' }])] },
      { no: 17, title: REPORT_TITLES[16], blocks: [
        B('牟新水务供售水量', muxinEmpty('牟新水务尚未接入数据，暂无供售水量指标。'), null, ['sold_vol', {}])] },
      { no: 18, title: REPORT_TITLES[17], blocks: [
        B('牟新水务营销指标', muxinEmpty('牟新水务应收、实收及收费率等营销指标尚未接入数据。'), null, ['charge_rate', {}])] }
    ];
    return { meta, chapters };
  }
  /* ---------- 状态桥接（UI 层 WBAnalysisUI 提供 readState/render） ---------- */
  function readState() {
    if (window.WBAnalysisUI && typeof window.WBAnalysisUI.readState === 'function') return window.WBAnalysisUI.readState();
    const g = WB.state.group || 'sold'; const grp = GROUP_BY_ID[g] || GROUPS[0];
    const item = grp.items.find(i => i.id === WB.state.item) || grp.items[0];
    const dim = item.dims && item.dims.includes(WB.state.dim) ? WB.state.dim : (item.dims && item.dims[0]) || 'children';
    const g2 = WB.state.group2 || WB.state.g2 || g; const grp2 = GROUP_BY_ID[g2] || grp;
    const item2 = grp2.items.find(i => i.id === (WB.state.item2 || WB.state.i2)) || grp2.items[0];
    const d2raw = WB.state.dim2 || WB.state.d2;
    const dim2 = item2.dims && item2.dims.includes(d2raw) ? d2raw : (item2.dims && item2.dims[0]) || 'children';
    return { f1: { group: grp.id, item: item.id, dim: dim, view: WB.state.view || 'chart' }, f2: { group: grp2.id, item: item2.id, dim: dim2, view: WB.state.view2 || 'chart' }, compare: WB.state.compare === '1' || WB.state.compare === true };
  }
  /* ---------- 80/20 排名公开 API（UI 管弹窗 TopN 与导出，本函数只算全集） ---------- */
  function buildRanking(fk, opts) {
    opts = opts || {};
    const st = readState(); const fs = st[fk || 'f1']; const f = filters();
    const compare = opts.compare === 'mom' ? 'mom' : 'yoy';
    const grp = GROUP_BY_ID[fs.group]; const item = grp && grp.items.find(i => i.id === fs.item);
    const curPeriods = E.periods(f); const len = curPeriods.length || 1;
    const basePeriods = curPeriods.map(p => compare === 'mom' ? shiftMonth(p, -len) : shiftYear(p, -1));
    /* 原型事件/台账明细项：水量80/20排行不是其明细口径，返回不适用模型，避免泄漏无关用户（UI 依 result.rankingApplicable 改开明细）。 */
    if (item && PROTO_EVENT_IDS.has(item.id)) {
      return { title: '水量80/20排行不适用', rows: [], selectedRows: [], N: 0, K80: 0, K20: 0, coverage: null, totalChange: 0, selectedChange: 0, missingBase: [], curPeriods: curPeriods, basePeriods: basePeriods, note: '该分析项为原型事件/台账明细，水量80/20排行不是其明细口径；请查看该项明细表。', sourceRows: [], inapplicable: true, synthetic: !!protoMeta(), sourceLabel: protoLabel() };
    }
    /* 原型受限名单（规模名单/政策成员/小区考核总表）：排行仅限定该名单授权用户，不泄漏范围外用户；基线 sold.changeRank 不受影响。 */
    const cohort = item && PROTO_COHORT_IDS[item.id] ? PROTO_COHORT_IDS[item.id] : null;
    const cohortCodes = cohort ? protoCohortCodes(item, f) : null;
    const core = rankingCore(f, fs.dim, compare, opts.rowName || null, cohortCodes);
    const dirKey = opts.direction === 'decrease' ? 'decrease' : 'increase';
    const d = core[dirKey];
    const allCodes = new Set(d.rows.map(r => r.accountId));
    const sourceRows = core.curFacts.concat(core.baseFacts).filter(r => allCodes.has(r.accountId));
    const covText = d.coverage == null ? '—' : E.round(d.coverage * 100, 4) + '%';
    const capNote = d.K < d.K80 ? '受20%户数上限（K20=' + core.K20 + '）截断，实际覆盖 ' + covText + '，未达80%。' : '达到该方向80%变化量（覆盖 ' + covText + '）。';
    const isProto = !!(item && PROTO_TARGET_IDS.has(item.id) && protoMeta());
    const cohortNote = cohort ? '排行已限定原型' + (cohort === 'scale' ? '规模用户名单' : cohort === 'policy' ? '优惠政策成员' : '小区考核总表关联用户') + '（授权用户 ' + (cohortCodes ? cohortCodes.size : 0) + ' 户），不含名单外用户。' : '';
    return {
      title: (dirKey === 'increase' ? '增加' : '减少') + '方向用户水量变化排序（' + (compare === 'mom' ? '环比' : '同比') + '）',
      rows: d.rows, selectedRows: d.selected,
      N: core.N, K80: d.K80, K20: core.K20, coverage: d.coverage,
      totalChange: d.totalChange, selectedChange: d.selectedChange,
      missingBase: core.missingBase, curPeriods: core.curPeriods, basePeriods: core.basePeriods,
      note: '可比较用户 N=' + core.N + '（含0变化，缺基期 ' + core.missingBase.length + ' 户单列不计0）；K20=ceil(20%×N)=' + core.K20 + '，K80=' + d.K80 + '，取 min=' + d.K + ' 户。' + capNote + (cohortNote ? ' ' + cohortNote : ''),
      sourceRows: sourceRows,
      rankingCohort: cohort,
      synthetic: isProto,
      sourceLabel: isProto ? protoLabel() : undefined
    };
  }
  /* ---------- 公开 API ---------- */
  window.WBAnalysis = {
    GROUPS: GROUPS, METRICS: METRICS, REPORT_TITLES: REPORT_TITLES,
    readState: readState, frameResult: frameResult, chartOption: chartOption, tableRows: tableRows,
    exportFrameCsv: exportFrameCsv, exportFramePng: exportFramePng,
    buildReportModel: buildReportModel, buildRanking: buildRanking,
    render: function () { return window.WBAnalysisUI ? window.WBAnalysisUI.render() : { html: '<div class="empty">分析界面加载中…</div>', mount: function () {} }; }
  };
})();