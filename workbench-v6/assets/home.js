/* 首页与KPI：范围只来自WBOrg/WBAccess，业务数组只经E.scopedRows/E.filterFacts，禁止绕过范围读取WB_DATA。 */
window.WBHome = (() => {
  const D = window.WB_DATA;
  const E = window.WB.engine;
  const scriptBase = document.currentScript?.src ? new URL('.', document.currentScript.src).href : 'assets/';
  const ownedCharts = new Set(['C-HOME-01', 'C-HOME-02', 'C-HOME-03', 'C-DRILL-children', 'C-KPI-01', 'C-KPI-02', 'C-KPI-03', 'C-KPI-04', 'C-KPI-05']);
  const metricMeta = {
    sold_vol: { label: '售水量分析', series: '售水量', unit: '万m³', decimals: 2, chart: 'C-KPI-02', group: 'sold' },
    registered_count: { label: '注册用户分析', series: '注册用户数', unit: '户', decimals: 0, chart: 'C-KPI-05', group: 'reg' },
    loss_rate_pct: { label: '产销差率分析', series: '产销差率', unit: '%', decimals: 2, chart: 'C-KPI-01', group: 'loss' },
    avg_price_yuan: { label: '单价分析', series: '售水均价', unit: '元/m³', decimals: 3, chart: 'C-KPI-04', group: 'price' },
    charge_rate_pct: { label: '收费率分析', series: '收费率', unit: '%', decimals: 2, chart: 'C-KPI-03', group: 'charge' }
  };
  let mapPromise;
  let analysisMetric = 'sold_vol';
  let analysisView = 'cumulative';
  let drillAnalysisDimension = 'children';
  let drillDimensionView = 'bar';
  let drillDimLayout = 'dimension';
  let compareMode = 'compare';
  let subscribed = false;

  const esc = value => E?.esc ? E.esc(value) : String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (value, digits = 0) => E?.fmt ? E.fmt(value, digits) : (value == null || !Number.isFinite(+value) ? '—' : (+value).toFixed(digits));
  const wan = value => value == null || !Number.isFinite(+value) ? null : +value / 10000;
  const risk = (level, tip) => `<span class="v4-risk" data-tip="${esc(tip)}" title="${esc(tip)}">⚠ ${esc(level)}</span>`;
  const page = () => document.getElementById('page') || document.getElementById('main');

  // ===== 范围层：节点、路径与真实层级，全部由WBOrg/WBAccess提供 =====
  const Org = () => window.WBOrg || null;
  const Access = () => window.WBAccess || null;
  const personaInfo = () => {
    const A = Access();
    if (!A) return null;
    return typeof A.current === 'function' ? A.current() : (A.current || null);
  };
  const accessReady = () => !!personaInfo();
  const scopeVersion = () => Number(personaInfo()?.scopeVersion ?? WB.scopeVersion ?? 0) || 0;
  const nodeOf = id => (id && Org()?.get ? Org().get(id) : null);
  const inScopeNode = id => !accessReady() ? true : !!id && !!personaInfo()?.scope?.nodeIds?.has?.(id);
  const scopeRoots = () => (personaInfo()?.scope?.roots || []).map(nodeOf).filter(Boolean);
  const scopeLabel = () => personaInfo()?.scopeLabel || (scopeRoots().length ? '本人责任范围' : '未绑定责任范围');

  function commonAncestorOf(nodes) {
    if (!nodes.length || !Org()?.path) return null;
    const first = Org().path(nodes[0].id) || [];
    for (let index = first.length - 1; index >= 0; index -= 1) {
      const id = first[index];
      if (nodes.every(node => (Org().path(node.id) || []).includes(id))) return nodeOf(id);
    }
    return null;
  }
  function effectiveNode() {
    const requested = WB.state.orgNodeId;
    if (requested) {
      const node = nodeOf(requested);
      return node && inScopeNode(node.id) ? node : null;
    }
    const roots = scopeRoots();
    if (roots.length === 1) return roots[0];
    if (roots.length > 1) {
      const common = commonAncestorOf(roots);
      return common && inScopeNode(common.id) ? common : null;
    }
    return null;
  }
  const requestedOutside = () => !!WB.state.orgNodeId && !inScopeNode(WB.state.orgNodeId);
  function levelChildren() {
    const node = effectiveNode();
    if (node) return Org()?.children?.(node.id) || [];
    const roots = scopeRoots();
    return roots.length > 1 ? roots : [];
  }
  const typeOf = node => String(node?.type || '');
  const TYPE_LABELS = { group: '集团', company: '经营单位', office: '营业所', team: '班组', grid: '网格', line: '线路', candidateGroup: '来源分组', candidateObject: '来源对象' };
  const typeLabel = node => node?.typeLabel || TYPE_LABELS[typeOf(node)] || '范围';
  const childTypeLabel = () => { const child = levelChildren()[0]; return child ? typeLabel(child) : '下级'; };
  const levelLabel = () => { const node = effectiveNode(); return node ? typeLabel(node) : (scopeRoots().length ? '我的责任范围' : '未绑定责任范围'); };
  const isUnitOrGroup = node => typeOf(node) === 'group' || typeOf(node) === 'company';
  const lossApplicable = () => !!effectiveNode() && isUnitOrGroup(effectiveNode());
  const planApplicable = () => !!effectiveNode() && typeOf(effectiveNode()) === 'company';
  // 后代 id 集合按“身份代+节点”缓存：首屏地图/排行/责任清单会按行反复判定归属。
  const nodeIdCache = new Map();
  const EMPTY_IDS = new Set();
  function nodeIdsOf(node) {
    if (!node) return EMPTY_IDS;
    const key = `${scopeVersion()}|${node.id}`;
    const hit = nodeIdCache.get(key);
    if (hit) return hit;
    const org = Org();
    let ids;
    if (org?.descendantIds) ids = new Set((org.descendantIds(node.id) || []).map(value => String(value)));
    else if (org?.descendantsSet) ids = new Set([...org.descendantsSet(node.id)].map(value => String(value)));
    else {
      const list = org?.descendants ? org.descendants(node.id) : null;
      ids = new Set((list || [node]).map(item => String(typeof item === 'string' ? item : item?.id)).filter(Boolean));
    }
    if (nodeIdCache.size > 32) nodeIdCache.clear();
    nodeIdCache.set(key, ids);
    return ids;
  }
  // 图表卡包装：仅在含children维度的卡片上把原始键替换为“下级横评”，不改动全局维度词典。
  function chartCard(def) {
    const html = E.chartCard(def) || '';
    return html.replace(/<option value="children"([^>]*)>children<\/option>/g, (match, attrs) => `<option value="children"${attrs}>${esc(childTypeLabel())}横评</option>`);
  }
  // WBOrg.path(id) 返回节点 id 数组（pathIds），面包屑需要映射回节点对象。
  const crumbNodes = () => {
    const node = effectiveNode();
    if (!node || !Org()?.path) return [];
    return (Org().path(node.id) || []).map(id => nodeOf(id)).filter(Boolean);
  };

  function filters() {
    // 范围来自授权节点（orgNodeId），查询键（company/org/team/line 等）原样保留并与范围求交：
    // WBAccess 只授权、不替用户决定查询，页面不能静默丢弃全局下钻筛选。
    const base = { ...(WB.state || {}), ...(WB.shell?.currentFilters ? WB.shell.currentFilters() : {}) };
    const node = effectiveNode();
    base.orgNodeId = node ? node.id : '';
    return base;
  }

  function scopedRows(name) {
    if (!E?.scopedRows) return [];
    return E.scopedRows(name) || [];
  }
  function nodeOwned(row) {
    const node = effectiveNode();
    if (!node) return true;
    if (!row || !row.orgNodeId) return false; // 单位级共享行已挂单位根节点，无节点行不参与任何节点汇总
    return nodeIdsOf(node).has(String(row.orgNodeId));
  }
  const nodeRows = name => scopedRows(name).filter(nodeOwned);
  const nodeUsers = () => nodeRows('users');
  const nodeBills = () => nodeRows('bills');
  function queryUsers(f) {
    return nodeUsers().filter(user => (!f.company || user.company === f.company) && (!f.org || user.org === f.org) && (!f.team || user.team === f.team) && (!f.line || user.line === f.line) && (!f.nature || user.nature === f.nature) && (!f.admin || user.adminCode === f.admin) && (!f.industry || user.industry === f.industry));
  }

  function canPlan(node) {
    const A = Access();
    if (!A?.can || !node || typeOf(node) !== 'company') return false;
    return !!A.can('plan.write', { orgNodeId: node.id, unitId: String(node.unitId), company: node.company || node.name });
  }

  // 首页全部事实入口：先按身份范围取数（引擎ownsRow），再按当前节点后代集合收窄。
  // 首屏同一代内多张卡共用同一过滤条件：缓存过滤结果，避免重复扫描同一批事实。
  const factsCache = new Map();
  function facts(f = filters()) {
    if (!E?.filterFacts) return [];
    const key = `${scopeVersion()}|${JSON.stringify(f)}`;
    const hit = factsCache.get(key);
    if (hit) return hit;
    const rows = E.filterFacts(f) || [];
    const layered = E.applyLayer ? E.applyLayer(rows, f) : rows;
    if (!Array.isArray(layered)) return [];
    if (factsCache.size > 24) factsCache.clear();
    factsCache.set(key, layered);
    return layered;
  }
  function scopedDef(def) {
    return { ...def, data: def.data || (f => facts(f)) };
  }
  function aggregate(f = filters()) {
    if (!E?.filterFacts || !E?.aggregate) return { count: 0 };
    return E.aggregate(facts(f), f);
  }

  // 下级节点横评：按真实组织子节点切分已授权事实，缺数为 null，不补 0。
  let bucketCache = { key: '', value: [] };
  function childBuckets(f) {
    const key = [scopeVersion(), effectiveNode()?.id || 'multi', JSON.stringify(f)].join('|');
    if (bucketCache.key === key) return bucketCache.value;
    const kids = levelChildren();
    const owner = new Map();
    kids.forEach(kid => { nodeIdsOf(kid).forEach(id => owner.set(id, kid.id)); });
    const buckets = new Map(kids.map(kid => [kid.id, []]));
    (E.filterFacts ? facts(f) || [] : []).forEach(row => {
      const kid = owner.get(row.orgNodeId);
      if (kid) buckets.get(kid).push(row);
    });
    bucketCache = { key, value: kids.map(kid => ({ node: kid, rows: buckets.get(kid.id) })) };
    return bucketCache.value;
  }
  function planOfNode(node) {
    const A = window.WB_ADMIN;
    if (!A?.planOf || !node) return null;
    const value = A.planOf(node.id, null);
    return Number.isFinite(+value) && +value > 0 ? +value : null;
  }
  // 计划值以万m³存储，统一折成m³后与售水量同口径比较。
  function planVolume(node) {
    const value = planOfNode(node);
    return value == null ? null : value * 10000;
  }
  function withPlan(rows) {
    return rows.map(row => {
      const plan = planVolume(row.node);
      if (plan == null) return row;
      const completion = row.sold_vol == null ? null : +(row.sold_vol / plan * 100).toFixed(2);
      return { ...row, plan_vol: plan, plan_completion_pct: completion };
    });
  }
  function childTotals(f) {
    return withPlan(childBuckets(f).map(({ node, rows }) => {
      if (!rows.length) return { name: node.name, node, count: 0, sold_vol: null, registered_count: null, charge_rate_pct: null, avg_price_yuan: null, loss_rate_pct: null };
      const totals = E.aggregate(rows, f) || {};
      return { name: node.name, node, count: totals.count || 0, ...totals };
    }));
  }

  function groupRows(ctx, metric) {
    const dimension = ctx?.state?.dimension || 'children';
    if (dimension === 'children') return childTotals(ctx?.filters || filters());
    if (!E?.group) return [];
    try {
      // 当前workbench引擎：group(rows,key,filters)。同时兼容契约中的group(metric,dimension,filters)。
      if (E.charts instanceof Map && E.dimensionOptions) {
        const rows = Array.isArray(ctx?.data) ? ctx.data : facts(ctx?.filters || filters());
        return E.group(rows, dimension, ctx.filters) || [];
      }
      const result = E.group(metric, dimension, ctx.filters);
      if (Array.isArray(result)) return result;
      if (Array.isArray(result?.rows)) return result.rows;
      if (result && typeof result === 'object') return Object.entries(result).map(([name, value]) => ({ name, ...(value || {}) }));
    } catch (error) {
      return [];
    }
    return [];
  }

  function shiftMonth(value, delta) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
    if (!match) return value;
    const date = new Date(Number(match[1]), Number(match[2]) - 1 + delta, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  function priorYearFilters(f) {
    const shift = value => /^\d{4}(-\d{2})?$/.test(String(value || '')) ? `${+String(value).slice(0, 4) - 1}${String(value).slice(4)}` : value;
    return { ...f, month: shift(f.month), start: shift(f.start), end: shift(f.end), year: shift(f.year) };
  }

  function comparisonRows(ctx, metric) {
    const previousFilters = priorYearFilters(ctx.filters);
    const previousData = facts(previousFilters);
    const previous = new Map(groupRows({ ...ctx, filters: previousFilters, data: previousData }, metric).map(row => [row.name, row]));
    return groupRows(ctx, metric).map(row => ({ ...row, previous_value: previous.get(row.name)?.count ? previous.get(row.name)[metric] ?? null : null }));
  }

  function trendRows(ctx) {
    const granularity = ctx?.state?.granularity || 'month';
    if (!E?.trend) return [];
    try {
      if (E.charts instanceof Map && E.dimensionOptions) {
        const rows = Array.isArray(ctx?.data) ? ctx.data : facts(ctx?.filters || filters());
        return E.trend(rows, ctx.filters, granularity) || [];
      }
      const result = E.trend({ data: ctx.data, filters: ctx.filters, granularity, metric: 'sold_vol' });
      return Array.isArray(result) ? result : (result?.rows || []);
    } catch (error) {
      return [];
    }
  }

  function disposeExcept(active) {
    if (!E?.charts) return;
    [...E.charts.keys()].forEach(id => {
      if (!ownedCharts.has(id) || active.includes(id)) return;
      const entry = E.charts.get(id);
      entry?.chart?.dispose();
      E.charts.delete(id);
    });
  }

  function ensureStyle() {
    if (document.getElementById('wb-home-v2-style')) return;
    const link = document.createElement('link');
    link.id = 'wb-home-v2-style';
    link.rel = 'stylesheet';
    link.href = new URL('home-v2.css', scriptBase).href;
    document.head.appendChild(link);
  }

  const icon = name => WB.shell?.icon?.(name) || '';

  function periodText(f) {
    if (f.period === '当月') return `${f.month || ''} 当月`;
    if (f.period === '年内累计') return `${(f.month || '').slice(0, 4)}年1—${+(f.month || '-0').slice(5) || 0}月累计`;
    return f.period || '当前期间';
  }

  function filterChips(f) {
    const path = crumbNodes().map(node => node.name);
    const chips = [periodText(f), f.caliber || '业务账期', path.length ? path[path.length - 1] : scopeLabel()];
    if (path.length > 1) chips.push(path.slice(0, -1).join(' / '));
    if (f.admin) chips.push(D.adminRegions.find(item => item.code === f.admin)?.name || f.admin);
    if (f.functional) chips.push(D.functionalZones.find(item => item.code === f.functional)?.short || f.functional);
    if (f.nature) chips.push(f.nature);
    if (f.industry) chips.push(f.industry);
    if (f.caliberMm) chips.push(f.caliberMm);
    if (f.meterType) chips.push(f.meterType);
    return chips.map(text => `<span class="wb-filter-chip">${esc(text)}</span>`).join('');
  }

  function contextBar(actions = '') {
    const f = filters();
    return `<section class="wb-context-bar" aria-label="当前经营数据上下文">
      <div class="wb-context-main"><span class="wb-context-label">经营快照</span><div class="wb-filter-chips">${filterChips(f)}</div><span class="sr-only" data-wb-filter-label></span></div>
      <div class="wb-context-actions"><span class="wb-data-time"><i class="status-dot"></i>演示数据截至 ${esc(D.asOf)}</span>${actions}</div>
    </section>`;
  }

  function existingHeading(root, fallback) {
    return root.querySelector('.page-heading')?.outerHTML || fallback;
  }

  function effectivePlan(t) {
    const node = effectiveNode();
    if (!node) return null;
    if (typeOf(node) === 'company') return planVolume(node);
    if (typeOf(node) === 'group') {
      const units = levelChildren().filter(child => typeOf(child) === 'company');
      const values = units.map(unit => planVolume(unit)).filter(value => value != null);
      return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    }
    return null;
  }
  function planCompletion(t) {
    const plan = effectivePlan(t);
    if (plan == null || !plan || t.sold_vol == null) return null;
    return t.sold_vol / plan * 100;
  }
  function metricVisibleCount() {
    const keys = Object.keys(metricMeta).filter(key => key !== 'loss_rate_pct' || lossApplicable());
    const A = window.WB_ADMIN;
    if (!A?.metrics) return keys.length;
    const visible = A.metrics().filter(item => item && item.visible !== false).map(item => item.key ?? item);
    return keys.filter(key => visible.includes(key)).length;
  }
  function kpiCards(t, f) {
    const hasData = !!t.count;
    const previous = aggregate(priorYearFilters(f));
    const yoy = t.yoy_growth_pct == null ? '—' : `${t.yoy_growth_pct > 0 ? '+' : ''}${fmt(t.yoy_growth_pct, 2)}%`;
    const planText = planApplicable() && t.sold_vol != null && planCompletion(t) != null ? `${fmt(planCompletion(t), 2)}%` : '未分解到本级';
    const supplyMissing = t.supply_vol == null;
    const items = [
      { key: 'sold_vol', icon: 'water', tone: 'blue', value: wan(t.sold_vol), unit: '万m³', digits: 2, left: '计划完成', leftValue: planText, right: '同比', rightValue: yoy, toneValue: t.yoy_growth_pct > 0 ? 'up' : t.yoy_growth_pct < 0 ? 'down' : '' },
      { key: 'registered_count', icon: 'users', tone: 'cyan', value: t.registered_count, unit: '户', digits: 0, left: '本期新增', leftValue: `${fmt(t.new_count, 0)} 户`, right: '上年同期末', rightValue: `${fmt(previous.count ? previous.registered_count : null, 0)} 户` },
      { key: 'loss_rate_pct', icon: 'flow', tone: 'orange', value: t.loss_rate_pct, unit: '%', digits: 2, left: '供水量', leftValue: supplyMissing ? '缺数（不按0）' : `${fmt(wan(t.supply_vol), 2)} 万m³`, right: '供售差', rightValue: supplyMissing || t.sold_vol == null ? '—' : `${fmt(wan(t.supply_vol - t.sold_vol), 2)} 万m³` },
      { key: 'avg_price_yuan', icon: 'meter', tone: 'purple', value: t.avg_price_yuan, unit: '元/m³', digits: 3, left: '售水收入', leftValue: `${fmt(wan(t.water_revenue), 2)} 万元`, right: '上年同期均价', rightValue: `${fmt(previous.count ? previous.avg_price_yuan : null, 3)} 元/m³` },
      { key: 'charge_rate_pct', icon: 'wallet', tone: 'green', value: t.charge_rate_pct, unit: '%', digits: 2, left: '应收水费', leftValue: `${fmt(wan(t.receivable_principal), 2)} 万元`, right: '实收水费', rightValue: `${fmt(wan(t.received_principal), 2)} 万元` }
    ];
    const A = window.WB_ADMIN;
    const visible = A?.metrics
      ? A.metrics().filter(item => item && item.visible !== false).map(item => item.key ?? item)
      : items.map(item => item.key);
    let availableItems = items.filter(item => visible.includes(item.key));
    if (!lossApplicable()) availableItems = availableItems.filter(item => item.key !== 'loss_rate_pct');
    if (!availableItems.length) availableItems = items.slice(0, 1);
    const displayItems = hasData ? availableItems : availableItems.map(item => ({ ...item, value: null, leftValue: '—', rightValue: '—' }));
    const planNode = effectiveNode();
    const planAllowed = canPlan(planNode);
    return displayItems.map(item => {
      const meta = metricMeta[item.key];
      return `<button type="button" class="kpi-card wb-kpi-button wb-tone-${item.tone}" data-drill-metric="${item.key}" aria-label="进入${meta.label}">
        <div class="wb-kpi-top"><span class="wb-kpi-icon">${icon(item.icon)}</span><div class="wb-kpi-heading"><span class="wb-kpi-label">${meta.label}</span><span class="wb-kpi-period">${item.key === 'registered_count' ? '期末存量' : esc(f.period || '当前期间')}</span></div><span class="wb-kpi-arrow">${icon('chevronRight')}</span></div>
        <div class="wb-kpi-value-row"><strong class="wb-kpi-value numeric">${fmt(item.value, item.digits)}</strong><span class="wb-kpi-unit">${item.unit}</span></div>
        <div class="wb-kpi-comparisons"><span><small>${item.left}</small><strong>${esc(item.leftValue)}</strong></span><span><small>${item.right}</small><strong class="${item.toneValue || ''}">${esc(item.rightValue)}</strong></span></div>
        <div class="wb-kpi-card-footer"><span>进入指标分析</span><span>查看明细与对比</span></div>
        ${item.key === 'sold_vol' && planAllowed ? `<span class="wb-kpi-edit" role="button" tabindex="0" data-plan-entry="1" aria-label="手工填报计划值" title="手工填报计划值（演示）">✎</span>` : ''}
      </button>`;
    }).join('');
  }

  function updateCards() {
    const grids = document.querySelectorAll('[data-wb-kpi-grid]');
    if (!grids.length) return;
    const f = filters();
    const t = aggregate(f);
    grids.forEach(grid => {
      grid.innerHTML = kpiCards(t, f);
      grid.querySelectorAll('[data-drill-metric]').forEach(button => {
        button.addEventListener('click', () => {
          const metric = button.dataset.drillMetric;
          if (metric === 'loss_rate_pct' && !lossApplicable()) return;
          const node = effectiveNode();
          const extra = {};
          if (node) extra.orgNodeId = node.id;
          if (window.WBApp?.current === 'drill' && WB.state.admin) extra.admin = WB.state.admin;
          navigate('drill', metricDrillParams(metric, extra));
        });
      });
    });
    document.querySelectorAll('[data-wb-filter-label]').forEach(el => { el.textContent = E?.filterLabel ? E.filterLabel(f) : ''; });
    document.querySelectorAll('[data-loss-section], [data-loss-nav], [data-special-tab="loss"]').forEach(el => { el.style.display = lossApplicable() ? '' : 'none'; });
    bindPlanEntries();
    const toggle = document.getElementById('homeMetricToggle');
    if (toggle) toggle.textContent = `${metricVisibleCount()} 项`;
    updateNodeMap();
  }

  function ensureSubscription() {
    if (!WB.subscribe || (WB.listeners instanceof Set ? WB.listeners.has(updateCards) : subscribed)) return;
    subscribed = true;
    WB.subscribe(updateCards);
  }

  function navigate(module, params = {}) {
    if (WB.shell?.navigate) {
      WB.shell.navigate(module, params);
      return;
    }
    Object.assign(WB.state, params);
    if (location.hash !== `#/${module}`) location.hash = `#/${module}`;
    E?.refreshAll?.();
  }

  /* metric→drill 统一入口：先合并 filters()/shell.currentFilters 的公共查询上下文（自然月/期间/行业等），
     使刷新深链不丢全局筛选；再清空上一组残留帧键、覆盖 group/metric，最后 merge extra（orgNodeId/维度筛选）。
     清帧在合并上下文之后、extra 最后，避免旧 frame 键复活；键仍由 App.allowed 过滤、scopeGuard 校验授权。 */
  function metricDrillParams(metric, extra = {}) {
    const key = metricMeta[metric] ? metric : 'sold_vol';
    const params = { ...filters() };
    ['item', 'dim', 'view', 'compare', 'frame', 'reportMode', 'g2', 'i2', 'd2', 'group2', 'item2', 'dim2', 'view2'].forEach(stateKey => { params[stateKey] = ''; });
    params.group = metricMeta[key].group;
    params.metric = key;
    return Object.assign(params, extra);
  }

  function mapDrill(item) {
    const params = { metric: item.metric, admin: '', functional: '' };
    params[item.type] = item.code;
    navigate('home', params);
  }

  function loadScript(file) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL(file, scriptBase).href;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`无法加载${file}`));
      document.head.appendChild(script);
    });
  }

  function ensureMap() {
    if (window.WBMap) return Promise.resolve();
    if (mapPromise) return mapPromise;
    mapPromise = Promise.resolve()
      .then(() => window.WB_MAP_DATA ? null : loadScript('map-data.js'))
      .then(() => window.WBMap ? null : loadScript('map.js'));
    return mapPromise;
  }

  let homeMapView = 'company';
  let homeRankMetric = 'sold_vol';
  let companyMapZoom = 2.3;
  let homeRenderMode = '3d';
  let adminMapCreated = false;
  let adminMapElement = null;
  let lastAdminRows = [];

  function companyCenter(name) {
    const company = (D.companies || []).find(item => item.name === name || item.full === name);
    if (!company) return null;
    const byCode = new Map((D.adminRegions || []).map(region => [region.code, region.center]));
    const points = (company.regions || []).map(code => byCode.get(code)).filter(Boolean);
    if (!points.length) return null;
    return [points.reduce((sum, point) => sum + point[0], 0) / points.length, points.reduce((sum, point) => sum + point[1], 0) / points.length];
  }

  function heroScopeBar() {
    const node = effectiveNode();
    const parent = node ? nodeOf(node.parentId) : null;
    const canBack = !!parent && inScopeNode(parent.id);
    const path = crumbNodes().map(item => item.name).join(' / ');
    return `<div class="home-scope-bar">当前范围：<strong>${esc(node ? node.name : scopeLabel())}</strong>${path ? ` <span class="muted">${esc(path)}</span>` : ''}${canBack ? `<button type="button" id="homeScopeBack">← 返回${esc(typeLabel(parent))}</button>` : ''}<button type="button" id="homeSheetToggle" class="sheet-toggle">展开分析</button></div>`;
  }

  function nodeOptions() {
    const node = effectiveNode();
    const kids = levelChildren();
    const selected = WB.state.orgNodeId || '';
    const options = [`<option value="" ${selected ? '' : 'selected'}>本范围全部（${esc(node ? node.name : scopeLabel())}）</option>`];
    kids.forEach(kid => options.push(`<option value="${esc(kid.id)}" ${selected === kid.id ? 'selected' : ''}>${esc(typeLabel(kid))} · ${esc(kid.name)}</option>`));
    return options.join('');
  }

  function rankMetricOptions() {
    return Object.entries(rankMetricMeta)
      .filter(([key]) => key !== 'loss_rate_pct' || lossApplicable())
      .map(([key, meta]) => `<option value="${key}" ${homeRankMetric === key ? 'selected' : ''}>${meta.label}</option>`).join('');
  }

  function homeHeroHtml() {
    const metricOptions = [['sold_vol', '售水量分析'], ['registered_count', '注册用户分析'], ['avg_price_yuan', '单价分析'], ['charge_rate_pct', '收费率分析']]
      .map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    return `<div class="home-hero">
      <div class="home-map-canvas is-3d" id="homeMapCanvas">
        <div id="C-HOME-COMPANY" class="home-company-map"></div>
        <div id="C-HOME-01" class="home-echarts" hidden></div>
        <div class="home-map-tip" id="homeMapTip" hidden></div>
      </div>
      <div class="home-map-toolbar">
        <span class="hmt-label">本页查询</span>
        <label>时段<select id="homePeriod" class="control compact" aria-label="统计时段">${['当月','年内累计','近5年','近10年','自定义'].map(value => `<option value="${value}" ${WB.state.period === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
        <label id="homeStartWrap" ${WB.state.period === '自定义' ? '' : 'hidden'}>起始<input type="month" id="homeStart" class="control compact" value="${esc(WB.state.start || '2023-01')}" aria-label="起始月份"></label>
        <label>${WB.state.period === '自定义' ? '截止' : '月份'}<input type="month" id="homeMonth" class="control compact" value="${esc(WB.state.month || '2026-10')}" aria-label="基准月份"></label>
        <label>指标显示<button type="button" class="btn xs" id="homeMetricToggle" aria-expanded="false">${metricVisibleCount()} 项</button></label>
        <label>范围<select id="homeNodeSelect" class="control compact" aria-label="当前范围层级">${nodeOptions()}</select></label>
        <label>口径<select id="homeCaliber" class="control compact" aria-label="时间口径">${['业务账期','财务自然月'].map(value => `<option value="${value}" ${WB.state.caliber === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
        <span class="hmt-sep"></span>
        <span>地图视角</span>
        <div class="segmented" id="homeMapViews" aria-label="地图视角">
          <button type="button" data-home-view="company" class="active">层级地图</button>
          <button type="button" data-home-view="admin">行政区</button>
        </div>
        <span id="homeAdminControls" hidden style="display:none;gap:8px;align-items:center">
          <label>指标<select id="wbMapMetric" class="control compact" aria-label="地图染色指标">${metricOptions}</select></label>
          <div class="segmented" aria-label="行政区视角"><button type="button" data-map-view="main" class="active">主城区</button><button type="button" data-map-view="wide">市域</button></div>
        </span>
        <span class="hmt-sep"></span>
        <span class="hmt-render" id="homeRenderWrap">渲染
          <span class="segmented" id="homeRenderMode"><button type="button" data-home-render="2d">2D</button><button type="button" data-home-render="3d" class="active">2.5D</button></span>
        </span>
        <button type="button" class="btn xs" id="wbHomeExport">导出当前范围指标</button>
        <span class="hmt-note">光晕＝方向性示意，不表示精确管辖边界；范围外单位只显示名称</span>
      </div>
      <div class="home-kpi-overlay"><div class="kpi-grid wb-kpi-grid" data-wb-kpi-grid aria-label="${esc(levelLabel())}经营指标"></div></div>
      <aside class="home-rank-panel" aria-label="${esc(childTypeLabel())}横评">
        <div class="rh"><span id="homeRankTitle">${esc(childTypeLabel())}横评</span><span id="homeRankMetricText" class="rank-metric-text" hidden></span><select id="homeRankMetric" class="control compact" aria-label="排行指标">${rankMetricOptions()}</select></div>
        <div id="homeCompanyRank"></div>
      </aside>
      <div class="home-drill-hint">点击${esc(childTypeLabel())}光晕进入该层级指标详情页（整页下钻）；hover 可预览本范围指标</div>
    </div>`;
  }

  let nodeMapInstance = null;
  let nodeMapPromise = null;
  const mapColors = ['#317FC2', '#41A75E', '#F58B3C', '#8E6FD8', '#B7732E', '#4E8DC1'];
  const mapColor = index => mapColors[index % mapColors.length];
  const hexA = (hex, alpha) => { const value = parseInt(String(hex).replace('#', ''), 16); return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`; };

  function ensureNodeMap() {
    if (nodeMapInstance && !nodeMapInstance.getDom().isConnected) { try { nodeMapInstance.dispose(); } catch (error) {} nodeMapInstance = null; nodeMapPromise = null; }
    if (nodeMapInstance) return Promise.resolve(nodeMapInstance);
    if (nodeMapPromise) return nodeMapPromise.then(instance => {
      if (instance && !instance.getDom().isConnected) { nodeMapInstance = null; nodeMapPromise = null; return ensureNodeMap(); }
      return instance;
    });
    nodeMapPromise = Promise.resolve()
      .then(() => window.WB_MAP_DATA ? null : loadScript('map-data.js'))
      .then(() => {
        const el = document.getElementById('C-HOME-COMPANY');
        if (!el || !window.echarts || !window.WB_MAP_DATA) throw new Error('地图资源未就绪');
        if (!echarts.getMap('zz-company-wide')) echarts.registerMap('zz-company-wide', window.WB_MAP_DATA.admin);
        nodeMapInstance = echarts.init(el, null, { renderer: 'canvas', devicePixelRatio: Math.min(window.devicePixelRatio || 1, 1.5) });
        nodeMapInstance.on('georoam', () => {
          clearTimeout(nodeMapInstance.__labelTimer);
          nodeMapInstance.__labelTimer = setTimeout(() => { try { drawNodeLabels(nodeCenters()); } catch (error) {} }, 80);
        });
        nodeMapInstance.on('click', params => {
          const id = params?.data?.nodeId;
          if (id && inScopeNode(id)) drillNode(id);
        });
        return nodeMapInstance;
      });
    return nodeMapPromise;
  }

  function nodeCenters() {
    const kids = levelChildren();
    const users = nodeUsers();
    const byCode = new Map((D.adminRegions || []).map(region => [region.code, region.center]));
    return kids.map((kid, index) => {
      const ids = nodeIdsOf(kid);
      const weights = new Map();
      users.forEach(user => {
        if (!ids.has(user.orgNodeId) || !user.adminCode) return;
        weights.set(user.adminCode, (weights.get(user.adminCode) || 0) + 1);
      });
      let lng = 0, lat = 0, total = 0;
      weights.forEach((weight, code) => { const point = byCode.get(code); if (!point) return; lng += point[0] * weight; lat += point[1] * weight; total += weight; });
      if (total) return { name: kid.name, node: kid, lng: lng / total, lat: lat / total, color: mapColor(index) };
      const fallback = companyCenter(kid.company || kid.name);
      if (fallback) return { name: kid.name, node: kid, lng: fallback[0], lat: fallback[1], color: mapColor(index) };
      return null;
    }).filter(Boolean);
  }

  function centerOfNode(node) {
    if (!node) return null;
    const centers = nodeCenters();
    if (centers.length === 1 && centers[0].node.id === node.id) return centers[0];
    const users = nodeUsers();
    const ids = nodeIdsOf(node);
    const byCode = new Map((D.adminRegions || []).map(region => [region.code, region.center]));
    const weights = new Map();
    users.forEach(user => { if (ids.has(user.orgNodeId) && user.adminCode) weights.set(user.adminCode, (weights.get(user.adminCode) || 0) + 1); });
    let lng = 0, lat = 0, total = 0;
    weights.forEach((weight, code) => { const point = byCode.get(code); if (!point) return; lng += point[0] * weight; lat += point[1] * weight; total += weight; });
    const fallback = total ? [lng / total, lat / total] : companyCenter(node.company || node.name);
    return fallback ? { name: node.name, node, lng: fallback[0], lat: fallback[1], color: '#317FC2', self: true } : null;
  }

  function outsideCompanyLabels() {
    const companies = (Org()?.nodes || []).filter(node => typeOf(node) === 'company');
    return companies.filter(node => !inScopeNode(node.id)).map(node => {
      const center = companyCenter(node.company || node.name);
      return center ? { name: node.name, lng: center[0], lat: center[1] } : null;
    }).filter(Boolean);
  }

  function haloSeries(centers, totalsMap, clickable) {
    return centers.map(center => {
      const totals = totalsMap.get(center.name);
      return {
        name: center.name, type: 'scatter', coordinateSystem: 'geo', z: 5, symbolSize: 320,
        data: [{ name: center.name, value: [center.lng, center.lat], nodeId: center.node?.id || '', totals }],
        itemStyle: { color: { type: 'radial', x: 0.5, y: 0.5, r: 0.5, colorStops: [
          { offset: 0, color: hexA(center.color, 0.62) }, { offset: 0.35, color: hexA(center.color, 0.38) },
          { offset: 0.72, color: hexA(center.color, 0.13) }, { offset: 1, color: hexA(center.color, 0) }
        ] } },
        label: { show: false }, tooltip: { show: false }, silent: !clickable,
        emphasis: { disabled: true, itemStyle: { color: { type: 'radial', x: 0.5, y: 0.5, r: 0.5, colorStops: [
          { offset: 0, color: hexA(center.color, 0.68) }, { offset: 0.4, color: hexA(center.color, 0.4) }, { offset: 1, color: hexA(center.color, 0) }
        ] } } }
      };
    });
  }

  function nodeTotalsMap() {
    const map = new Map();
    childTotals(filters()).forEach(row => map.set(row.name, row));
    const node = effectiveNode();
    if (node) map.set(node.name, aggregate(filters()));
    return map;
  }

  function renderNodeMap() {
    if (!nodeMapInstance) return;
    const centers = nodeCenters();
    const node = effectiveNode();
    const self = !centers.length ? centerOfNode(node) : null;
    const shown = self ? [self] : centers;
    const totalsMap = nodeTotalsMap();
    const hits = shown.map(center => ({
      name: '范围命中区', type: 'scatter', coordinateSystem: 'geo', z: 9, symbolSize: 46,
      data: [{ name: center.name, value: [center.lng, center.lat], nodeId: center.node?.id || '' }],
      itemStyle: { color: 'rgba(0,0,0,0)', borderWidth: 0 },
      label: { show: false }, tooltip: { show: true }, silent: !!center.self,
      emphasis: { disabled: true }
    }));
    const cores = shown.map(center => ({
      name: '范围中心', type: 'effectScatter', coordinateSystem: 'geo', z: 8, symbolSize: 14,
      showEffectOn: 'emphasis', rippleEffect: { brushType: 'stroke', scale: 5, period: 4, color: hexA(center.color, 0.35) },
      data: [{ name: center.name, value: [center.lng, center.lat], nodeId: center.node?.id || '' }],
      itemStyle: { color: '#fff', borderColor: center.color, borderWidth: 3, shadowBlur: 14, shadowColor: hexA(center.color, 0.45) },
      label: { show: false }, tooltip: { show: false }
    }));
    const centerPoint = shown.length ? [shown.reduce((sum, item) => sum + item.lng, 0) / shown.length, shown.reduce((sum, item) => sum + item.lat, 0) / shown.length] : undefined;
    nodeMapInstance.setOption({
      backgroundColor: 'transparent',
      geo: { map: 'zz-company-wide', roam: false, zoom: companyMapZoom, center: centerPoint, layoutCenter: ['50%', '50%'], layoutSize: '100%',
        itemStyle: { areaColor: '#E9F1F8', borderColor: '#C9DAE8', borderWidth: 1 },
        emphasis: { itemStyle: { areaColor: '#DFEAF5' }, label: { show: false } }, silent: true },
      series: [...haloSeries(shown, totalsMap, true), ...hits, ...cores],
      tooltip: { trigger: 'item', backgroundColor: 'rgba(255,255,255,.97)', borderColor: '#D7E6F4', textStyle: { color: '#1F2A37', fontSize: 12 }, extraCssText: 'box-shadow:0 16px 36px rgba(31,74,116,.20);border-radius:10px;',
        formatter: params => {
          const name = params.data?.name || params.name;
          const totals = totalsMap.get(name);
          if (!totals || !totals.count) return `<b>${esc(name)}</b><br/>当前范围缺数（不按0）`;
          const loss = lossApplicable() ? `${totals.loss_rate_pct == null ? '缺数' : fmt(totals.loss_rate_pct, 2) + '%'}` : '本级不适用';
          return `<b>${esc(name)}</b><br/>售水量：<b>${fmt(wan(totals.sold_vol), 1)} 万m³</b><br/>收费率：<b>${totals.charge_rate_pct == null ? '待核' : fmt(totals.charge_rate_pct, 2) + '%'}</b><br/>产销差率：${loss}<br/>售水均价：<b>${fmt(totals.avg_price_yuan, 3)} 元/m³</b><br/>注册用户：<b>${fmt(totals.registered_count, 0)} 户</b><br/><span style="color:#317FC2;font-size:11px">点击进入该层级下钻页</span>`;
        } },
      animationDuration: 800
    }, true);
    requestAnimationFrame(() => drawNodeLabels(shown));
  }

  function drawNodeLabels(centers) {
    if (!nodeMapInstance) return;
    const totalsMap = nodeTotalsMap();
    const graphics = [];
    centers.forEach(center => {
      let pixel = null;
      try { pixel = nodeMapInstance.convertToPixel({ geoIndex: 0 }, [center.lng, center.lat]); } catch (error) {}
      if (!pixel) return;
      const [x, y] = pixel;
      const totals = totalsMap.get(center.name);
      const name = String(center.name).replace('郑州', '').replace('有限责任公司', '').replace('有限公司', '');
      const value = !totals || !totals.count ? '缺数' : `${fmt(wan(totals.sold_vol), 1)} 万m³`;
      const width = Math.max(96, Math.min(158, name.length * 13 + 16));
      const boxX = x - width / 2, boxY = y - 52;
      const clickable = !!center.node && !center.self && inScopeNode(center.node.id);
      const drill = clickable ? () => drillNode(center.node.id) : undefined;
      graphics.push({ type: 'line', z: 9, silent: true, shape: { x1: x, y1: y, x2: x, y2: boxY + 32 }, style: { stroke: 'rgba(120,150,180,.55)', lineWidth: 1, lineDash: [3, 3] } });
      graphics.push({ type: 'rect', z: 10, silent: !clickable, cursor: clickable ? 'pointer' : 'default', onclick: drill,
        shape: { x: boxX, y: boxY, width, height: 32, r: 6 },
        style: { fill: 'rgba(255,255,255,.94)', stroke: 'rgba(201,218,232,.95)', lineWidth: 1, shadowBlur: 10, shadowColor: 'rgba(31,74,116,.12)' } });
      graphics.push({ type: 'text', z: 11, silent: !clickable, cursor: clickable ? 'pointer' : 'default', onclick: drill,
        style: { text: name, fill: '#1F2A37', fontSize: 12, fontWeight: 700, x: boxX + 8, y: boxY + 5 } });
      graphics.push({ type: 'text', z: 11, silent: !clickable, cursor: clickable ? 'pointer' : 'default', onclick: drill,
        style: { text: value, fill: '#317FC2', fontSize: 11, fontWeight: 600, x: boxX + 8, y: boxY + 19 } });
    });
    outsideCompanyLabels().forEach(center => {
      let pixel = null;
      try { pixel = nodeMapInstance.convertToPixel({ geoIndex: 0 }, [center.lng, center.lat]); } catch (error) {}
      if (!pixel) return;
      graphics.push({ type: 'text', z: 11, silent: true,
        style: { text: `${center.name} · 范围外`, fill: '#9AA9B7', fontSize: 11, fontWeight: 500, x: pixel[0] - 26, y: pixel[1] + 26 } });
    });
    nodeMapInstance.setOption({ graphic: graphics });
  }

  function updateNodeMap() {
    if (homeMapView !== 'company') return;
    if (!nodeMapInstance) { ensureNodeMap().then(renderNodeMap).catch(() => {}); return; }
    const dom = nodeMapInstance.getDom?.();
    if (dom && !dom.isConnected) return;
    renderNodeMap();
  }

  function drillNode(nodeId) {
    if (!nodeId || !inScopeNode(nodeId)) return;
    if (window.WBApp?.current === 'drill') { navigate('drill', { orgNodeId: nodeId }); return; }
    navigate('drill', metricDrillParams(analysisMetric, { orgNodeId: nodeId }));
  }

  const rankMetricMeta = {
    sold_vol: { label: '售水量分析', unit: '万m³', decimals: 1, kind: 'volume' },
    registered_count: { label: '注册用户分析', unit: '户', decimals: 0, kind: 'plain' },
    charge_rate_pct: { label: '收费率分析', unit: '%', decimals: 2, kind: 'rate' },
    avg_price_yuan: { label: '单价分析', unit: '元/m³', decimals: 3, kind: 'plain' },
    loss_rate_pct: { label: '产销差率分析', unit: '%', decimals: 2, kind: 'rate', lowerBetter: true }
  };
  function rankValue(totals, metric) {
    if (!totals || !totals.count) return { raw: null, text: '缺数' };
    if (metric === 'sold_vol') return { raw: totals.sold_vol == null ? null : totals.sold_vol / 10000, text: totals.sold_vol == null ? '缺数' : `${fmt(totals.sold_vol / 10000, 1)} 万m³` };
    if (metric === 'registered_count') return { raw: totals.registered_count, text: `${fmt(totals.registered_count, 0)} 户` };
    if (metric === 'charge_rate_pct') return { raw: totals.charge_rate_pct, text: totals.charge_rate_pct == null ? '待核' : `${fmt(totals.charge_rate_pct, 2)}%` };
    if (metric === 'avg_price_yuan') return { raw: totals.avg_price_yuan, text: totals.avg_price_yuan == null ? '待核' : `${fmt(totals.avg_price_yuan, 3)}` };
    if (!lossApplicable()) return { raw: null, text: '本级不适用' };
    return { raw: totals.loss_rate_pct, text: totals.loss_rate_pct == null ? '待核' : `${fmt(totals.loss_rate_pct, 2)}%` };
  }

  function responsibilityRows() {
    const node = effectiveNode();
    const provider = Org()?.responsibilities;
    const all = typeof provider === 'function' ? provider() || [] : (provider || []);
    if (!node || !all.length) return [];
    const ids = nodeIdsOf(node);
    return all.filter(row => (row.orgNodeId ? ids.has(row.orgNodeId) : row.lineKey === node.id));
  }

  function renderScopeRanking() {
    const target = document.getElementById('homeCompanyRank');
    if (!target) return;
    const metric = rankMetricMeta[homeRankMetric] ? homeRankMetric : 'sold_vol';
    const select = document.getElementById('homeRankMetric');
    if (select) { select.hidden = false; select.innerHTML = rankMetricOptions(); select.value = metric; }
    const metricText = document.getElementById('homeRankMetricText');
    if (metricText) metricText.hidden = true;
    const title = document.getElementById('homeRankTitle');
    if (title) title.textContent = `${childTypeLabel()}横评`;
    const rows = childTotals(filters()).map(row => {
      const value = rankValue(row, metric);
      return { name: row.name, node: row.node, raw: value.raw, text: value.text };
    }).filter(row => inScopeNode(row.node.id));
    if (!rows.length) {
      const responsibles = responsibilityRows();
      if (responsibles.length) {
        const list = responsibles.map(person => {
          const name = person.name || person.personName || person.staffName || '—';
          const role = person.role || person.position || person.typeLabel || '责任人';
          const count = person.accountCount ?? person.count ?? person.accounts ?? '—';
          return `<div class="home-rank-row"><span class="no">·</span><span class="nm">${esc(name)}</span><span class="bar"></span><span class="v">${esc(String(count))} 户 · ${esc(role)}</span></div>`;
        }).join('');
        target.innerHTML = list + '<div class="rank-hint">末端层级责任清单：仅本范围责任人，无跨范围数据</div>';
        if (title) title.textContent = '责任清单';
        if (select) select.hidden = true;
      } else {
        target.innerHTML = `<div class="empty">${esc(levelLabel())}暂无下级节点</div>`;
      }
      return;
    }
    const meta = rankMetricMeta[metric];
    const valued = rows.filter(row => row.raw != null);
    valued.sort((a, b) => meta.lowerBetter ? a.raw - b.raw : b.raw - a.raw);
    const missing = rows.filter(row => row.raw == null);
    const ordered = [...valued, ...missing];
    const max = Math.max(1, ...valued.map(row => Math.abs(row.raw)));
    const selected = WB.state.orgNodeId || '';
    target.innerHTML = ordered.map((row, index) => {
      const isMissing = row.raw == null;
      const width = isMissing ? 0 : Math.max(6, Math.round(Math.abs(row.raw) / max * 100));
      return `<button type="button" class="home-rank-row ${selected === row.node.id ? 'is-active' : ''} ${isMissing ? 'is-gray' : ''}" data-rank-node="${esc(row.node.id)}">
        <span class="no">${isMissing ? '—' : index + 1}</span><span class="nm">${esc(row.name)}</span>
        <span class="bar"><i style="width:${width}%"></i></span><span class="v">${esc(row.text)}</span>
      </button>`;
    }).join('') + (meta.lowerBetter ? '<div class="rank-hint">产销差率低者在前；待核数据排在最后</div>' : '') + '<div class="rank-hint">仅列当前范围授权下级，范围外单位不参与排序与汇总</div>';
    target.querySelectorAll('[data-rank-node]').forEach(button => button.addEventListener('click', () => drillNode(button.dataset.rankNode)));
  }

  function renderAdminRanking(rows, metricKey) {
    const target = document.getElementById('homeCompanyRank');
    if (!target || !window.WBMap) return;
    lastAdminRows = (rows || []).filter(row => row.inScope !== false);
    const meta = WBMap.metrics[metricKey] || WBMap.metrics.sold_vol;
    const metricSelect = document.getElementById('homeRankMetric');
    const metricText = document.getElementById('homeRankMetricText');
    if (metricSelect) metricSelect.hidden = true;
    if (metricText) { metricText.hidden = false; metricText.textContent = meta.label; }
    const title = document.getElementById('homeRankTitle');
    if (title) title.textContent = '区域排行（本范围）';
    const sorted = [...lastAdminRows].sort((a, b) => (b.displayValue ?? -Infinity) - (a.displayValue ?? -Infinity));
    const max = Math.max(1, ...sorted.map(row => row.displayValue || 0));
    let rank = 0;
    target.innerHTML = sorted.map(row => {
      const gray = !row.count || row.displayValue == null;
      if (!gray) rank += 1;
      return `<button type="button" class="home-rank-row ${gray ? 'is-gray' : ''}" data-rank-admin="${esc(row.code)}" ${gray ? 'disabled' : ''}>
        <span class="no">${gray ? '—' : rank}</span><span class="nm">${esc(row.name)}</span>
        <span class="bar"><i style="width:${gray ? 0 : Math.round((row.displayValue || 0) / max * 100)}%"></i></span>
        <span class="v">${gray ? '缺数' : fmt(row.displayValue, meta.displayDecimals)}</span>
      </button>`;
    }).join('');
    target.querySelectorAll('[data-rank-admin]').forEach(button => button.addEventListener('click', () => {
      const row = lastAdminRows.find(item => item.code === button.dataset.rankAdmin);
      if (row?.count) mapDrill({ type: 'admin', code: row.code, name: row.name, metric: WBMap.getState().metric });
    }));
  }

  function switchHomeMapView(view) {
    homeMapView = view;
    const map = document.getElementById('C-HOME-COMPANY');
    const admin = document.getElementById('C-HOME-01');
    const controls = document.getElementById('homeAdminControls');
    if (map) map.hidden = view !== 'company';
    if (admin) admin.hidden = view !== 'admin';
    if (controls) { controls.hidden = view !== 'admin'; controls.style.display = view === 'admin' ? 'flex' : 'none'; }
    document.querySelectorAll('[data-home-view]').forEach(button => button.classList.toggle('active', button.dataset.homeView === view));
    if (view === 'company') {
      renderScopeRanking();
      ensureNodeMap().then(renderNodeMap).catch(() => {});
      return;
    }
    ensureMap().then(() => {
      if (!window.WBMap) return;
      const adminElement = document.getElementById('C-HOME-01');
      if (!adminMapCreated || adminMapElement !== adminElement) {
        WBMap.create(adminElement, { id: 'C-HOME-01', onRows: rows => renderAdminRanking(rows, WBMap.getState().metric), onDrill: mapDrill });
        adminMapCreated = true; adminMapElement = adminElement;
      }
      syncMapControls();
      WBMap.setState({ view: WBMap.getState().view || 'main' });
    }).catch(() => {
      const el = document.getElementById('C-HOME-01');
      if (el) el.innerHTML = '<div class="empty">地图暂不可用</div>';
    });
  }

  // 计划填报入口在KPI卡重绘后仍需可用：统一在此绑定，重绘时重复调用覆盖处理器即可。
  function bindPlanEntries() {
    document.querySelectorAll('[data-plan-entry]').forEach(entry => {
      const open = event => {
        event.preventDefault(); event.stopPropagation();
        const A = window.WB_ADMIN; if (!A) return;
        const node = effectiveNode();
        if (!canPlan(node)) { WB.shell?.toast?.('当前身份或层级无权填报计划值'); return; }
        const key = node.id;
        const label = node.company || node.name;
        const current = A.planOf(key, null);
        WB.shell?.openModal?.({title:`手工填报计划值 · ${label}`,subtitle:`口径：${A.periodKey()}　单位：万m³　仅内存，不覆盖源数据`,
          body:`<div class="form-grid"><label class="field">经营单位<input class="control" value="${esc(label)}" readonly></label>
            <label class="field">期间计划(万m³)<input id="homePlanInput" class="control" type="number" min="0" step="10" value="${current == null ? '' : Math.round(current)}" placeholder="留空表示沿用样例计划"></label></div>`,
          footer:`<button type="button" class="btn" data-close>取消</button><button type="button" class="btn primary" id="homePlanSave">保存（内存）</button>`});
        document.getElementById('homePlanSave').onclick = () => {
          if (!canPlan(node)) { WB.shell?.toast?.('计划填报被权限校验拒绝'); return; }
          const raw = document.getElementById('homePlanInput').value.trim();
          const result = raw ? A.setPlan(key, +raw, { label }) : A.resetPlan(key);
          if (!result || result.ok === false) { WB.shell?.toast?.(result?.reason === 'denied' ? '计划填报被权限校验拒绝' : (result?.message || '保存未生效')); return; }
          WB.shell?.closeLayers?.(); WB.shell?.toast?.(raw ? '计划值已保存（仅内存）' : '已沿用样例计划'); updateCards(); renderScopeRanking();
        };
      };
      entry.onclick = open;
      entry.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') open(event); };
    });
  }

  function bindHomeControls() {
    const applyHomeQuery = () => {
      const period = document.getElementById('homePeriod')?.value || WB.state.period;
      const month = document.getElementById('homeMonth')?.value || WB.state.month;
      const start = document.getElementById('homeStart')?.value || WB.state.start;
      const nodeId = document.getElementById('homeNodeSelect')?.value || '';
      const caliber = document.getElementById('homeCaliber')?.value || WB.state.caliber;
      if (period === '自定义') {
        if (!start || !month) { WB.shell?.toast?.('自定义时段需先选择起始与截止月份'); return; }
        if (start > month) { WB.shell?.toast?.('起始月份不能晚于截止月份'); return; }
      }
      if (nodeId && !inScopeNode(nodeId)) { WB.shell?.toast?.('该层级不在当前责任范围'); return; }
      WB.state.period = period; WB.state.month = month; WB.state.caliber = caliber; WB.state.orgNodeId = nodeId;
      if (period === '自定义') WB.state.start = start;
      navigate('home', period === '自定义' ? { period, month, start, caliber, orgNodeId: nodeId } : { period, month, caliber, orgNodeId: nodeId });
    };
    ['homePeriod', 'homeMonth', 'homeCaliber', 'homeNodeSelect'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', applyHomeQuery);
    });
    document.getElementById('homeStart')?.addEventListener('change', applyHomeQuery);
    document.getElementById('homePeriod')?.addEventListener('change', event => {
      const wrap = document.getElementById('homeStartWrap');
      if (wrap) wrap.hidden = event.target.value !== '自定义';
    });
    document.getElementById('homeMetricToggle')?.addEventListener('click', () => {
      const A = window.WB_ADMIN; if (!A) return;
      const body = `<div class="notice v4-tip" role="note">关闭的指标不再显示卡片与排行项；至少保留一项。</div>
        <div class="metric-switch-list">${Object.entries(metricMeta).filter(([key]) => key !== 'loss_rate_pct' || lossApplicable()).map(([key, meta]) => `<label class="metric-switch"><input type="checkbox" data-metric-switch="${key}" ${A.metricVisible(key) ? 'checked' : ''}> <span>${esc(meta.label)}</span></label>`).join('')}</div>`;
      WB.shell?.openModal?.({title:'指标显示设置（演示）',subtitle:'仅影响本页展示，刷新还原',body,
        footer:`<button type="button" class="btn primary" data-close>完成</button>`});
      document.querySelectorAll('[data-metric-switch]').forEach(input => input.addEventListener('change', () => {
        const result = A.toggleMetric(input.dataset.metricSwitch);
        if (!result.ok) { input.checked = !input.checked; WB.shell?.toast?.(result.message || '操作未生效'); return; }
        updateCards();
      }));
    });
    bindPlanEntries();
    document.querySelectorAll('[data-home-view]').forEach(button => button.addEventListener('click', () => switchHomeMapView(button.dataset.homeView)));
    document.getElementById('wbMapMetric')?.addEventListener('change', event => {
      WBMap?.setState({ metric: event.target.value });
      syncMapControls();
    });
    document.querySelectorAll('[data-map-view]').forEach(button => button.addEventListener('click', () => {
      WBMap?.setState({ view: button.dataset.mapView });
      syncMapControls();
    }));
    document.getElementById('homeScopeBack')?.addEventListener('click', () => {
      const node = effectiveNode();
      const parent = node ? nodeOf(node.parentId) : null;
      if (parent && inScopeNode(parent.id)) navigate('home', { orgNodeId: parent.id });
    });
    document.getElementById('homeRankMetric')?.addEventListener('change', event => {
      homeRankMetric = event.target.value;
      renderScopeRanking();
    });
    document.getElementById('wbHomeExport')?.addEventListener('click', exportGroupKpis);
    document.querySelectorAll('[data-home-render]').forEach(button => button.classList.toggle('active', button.dataset.homeRender === homeRenderMode));
    document.getElementById('homeMapCanvas')?.classList.toggle('is-3d', homeRenderMode === '3d');
    document.querySelectorAll('[data-home-render]').forEach(button => button.addEventListener('click', () => {
      homeRenderMode = button.dataset.homeRender;
      document.querySelectorAll('[data-home-render]').forEach(item => item.classList.toggle('active', item === button));
      document.getElementById('homeMapCanvas')?.classList.toggle('is-3d', homeRenderMode === '3d');
      setTimeout(() => { try { nodeMapInstance?.resize(); WBMap?.resize?.(); } catch (error) {} }, 520);
    }));
    document.getElementById('homeSheetToggle')?.addEventListener('click', () => {
      const sheet = document.querySelector('.home-sheet');
      if (!sheet) return;
      const expanded = sheet.classList.toggle('is-expanded');
      const button = document.getElementById('homeSheetToggle');
      if (button) button.textContent = expanded ? '收起分析' : '展开分析';
    });
    bindTrendToggle();
  }

  function bindTrendToggle() {
    const button = document.getElementById('homeTrendToggle');
    if (!button) return;
    button.onclick = () => {
      const panel = document.getElementById('homeTrendPanel');
      if (!panel) return;
      if (panel.hidden) {
        panel.hidden = false; button.setAttribute('aria-expanded', 'true');
        panel.innerHTML = `<div class="chart-grid">${chartCard(homeTrendDefinition())}${chartCard(homeCompanyDefinition())}</div>`;
        E.registerChart('C-HOME-02', document.getElementById('C-HOME-02'), scopedDef(homeTrendDefinition()));
        E.registerChart('C-HOME-03', document.getElementById('C-HOME-03'), scopedDef(homeCompanyDefinition()));
      } else {
        panel.hidden = true; button.setAttribute('aria-expanded', 'false');
        ['C-HOME-02', 'C-HOME-03'].forEach(id => {
          const entry = E.charts?.get ? E.charts.get(id) : null;
          if (entry) { try { entry.chart.dispose(); } catch (error) {} E.charts.delete(id); }
        });
        panel.innerHTML = '';
      }
    };
  }

  function homeTrendDefinition() {
    return {
      id: 'C-HOME-02', title: '售水量同期与计划趋势', dimension: 'company', dimensions: [], granularity: true, periodFilter: true,
      getOption: ctx => {
        const rows = trendRows(ctx);
        if (!rows.some(row => row.count)) return E.emptyOption();
        return baseCombo(rows, [valueAxis('万m³'), valueAxis('%', true)], [
          barSeries('本期售水量', rows.map(row => wan(row.sold_vol)), '#317FC2'),
          barSeries('同期售水量', rows.map(row => wan(row.previous_sold)), '#9BC2DF'),
          barSeries('计划售水量', rows.map(row => wan(row.plan_vol)), '#B9D9C4'),
          lineSeries('计划完成率', rows.map(row => row.plan_completion_pct), '#F58B3C', 1)
        ]);
      },
      getRows: ctx => trendRows(ctx).flatMap(row => [
        [`${row.name} · 本期售水量`, row.sold_vol, 'm³'],
        [`${row.name} · 同期售水量`, row.previous_sold, 'm³'],
        [`${row.name} · 计划售水量`, row.plan_vol, 'm³'],
        [`${row.name} · 计划完成率`, row.plan_completion_pct, '%']
      ])
    };
  }

  function homeCompanyDefinition() {
    return {
      id: 'C-HOME-03', title: `${childTypeLabel()}售水与计划完成`, dimension: 'children', dimensions: ['children', 'nature', 'industry', 'admin', 'meterType', 'caliber'], periodFilter: true,
      getOption: ctx => {
        const rows = groupRows(ctx, 'sold_vol');
        if (!rows.some(row => row.count)) return E.emptyOption();
        return baseCombo(rows, [valueAxis('万m³'), valueAxis('%', true)], [
          barSeries('售水量', rows.map(row => wan(row.sold_vol)), '#317FC2'),
          lineSeries('计划完成率', rows.map(row => row.plan_completion_pct ?? null), '#F58B3C', 1)
        ]);
      },
      getRows: ctx => seriesRows(groupRows(ctx, 'sold_vol'), [['sold_vol', '售水量', 'm³'], ['plan_completion_pct', '计划完成率', '%']]),
      onClick: drillFromChart
    };
  }

  const analysisSubtitles = {
    sold_vol: '本期、上年同期、计划与完成率',
    loss_rate_pct: '同计量边界的本期与上年同期对比',
    charge_rate_pct: '应收、实收水费与同期收费率',
    avg_price_yuan: '用水性质均价与水量对比',
    registered_count: '期末存量对比 · 本期新增按自然月立户日期统计'
  };
  const analysisViewMeta = {
    year: { label: '年分析', period: '近5年' },
    month: { label: '月分析', period: '当月' },
    cumulative: { label: '累计分析', period: '年内累计' }
  };
  const compareMeta = {
    compare: { label: '对比', hint: '本期 / 上年同期 / 上期' },
    yoy: { label: '同比', hint: '本期 vs 上年同期' },
    mom: { label: '环比', hint: '本期 vs 上期' },
    plan: { label: '计划比', hint: '本期 vs 计划' }
  };
  function yearRows() {
    const field = analysisMetric;
    const f = { ...filters(), period: '近5年' };
    if (!E?.trend) return [];
    // 逐年走引擎聚合：存量取期末快照、率/均价按水量加权、供水缺数返回 null；
    // 不逐行累加 registered_count（存量放大），也不读原始行上不存在的派生率字段。
    return E.trend(facts(f), f, 'year').map(entry => ({ name: entry.name, value: entry[field] ?? null, count: entry.count }));
  }
  function yearDefinition() {
    const meta = metricMeta[analysisMetric];
    return {
      id: 'C-HOME-YEAR', title: `${meta.label}（近5年）`, dimensions: [], periodFilter: false,
      getOption: () => {
        const rows = yearRows();
        if (!rows.some(row => row.value != null)) return E.emptyOption('近5年无可用数据');
        const isVolume = analysisMetric === 'sold_vol';
        return baseCombo(rows, [valueAxis(isVolume ? '万m³' : meta.unit)], [barSeries(meta.series, rows.map(row => isVolume ? wan(row.value) : row.value), '#317FC2')]);
      },
      getRows: () => {
        const isVolume = analysisMetric === 'sold_vol';
        return yearRows().map(row => [row.name, isVolume ? wan(row.value) : row.value, metricMeta[analysisMetric].unit]);
      }
    };
  }
  function metricText(value) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    if (analysisMetric === 'sold_vol') return `${fmt(wan(value), 1)} 万m³`;
    if (analysisMetric === 'registered_count') return `${fmt(value, 0)} 户`;
    if (analysisMetric === 'avg_price_yuan') return `${fmt(value, 3)} 元/m³`;
    return `${fmt(value, 2)}%`;
  }
  function compareTable() {
    const f = filters();
    const field = analysisMetric;
    const dimension = drillAnalysisDimension;
    const dimensionName = analysisDimensionLabel();
    const prevYearFilters = priorYearFilters(f);
    const prevMonthFilters = { ...f, month: shiftMonth(f.month, -1), end: shiftMonth(f.end, -1) };
    const cur = groupRows({ data: facts(f), filters: f, state: { dimension } }, field);
    const prevYear = new Map(groupRows({ data: facts(prevYearFilters), filters: prevYearFilters, state: { dimension } }, field).map(row => [row.name, row]));
    const prevMonth = new Map(groupRows({ data: facts(prevMonthFilters), filters: prevMonthFilters, state: { dimension } }, field).map(row => [row.name, row]));
    const columns = compareMode === 'plan' ? [dimensionName, '本期', '计划', '完成率']
      : compareMode === 'yoy' ? [dimensionName, '本期', '上年同期', '同比']
      : compareMode === 'mom' ? [dimensionName, '本期', '上期', '环比']
      : [dimensionName, '本期', '上年同期', '同比', '上期', '环比'];
    const pctDiff = (curValue, baseValue) => {
      if (curValue == null || baseValue == null || !Number.isFinite(+curValue) || !Number.isFinite(+baseValue) || +baseValue === 0) return '—';
      const change = (+curValue - +baseValue) / Math.abs(+baseValue) * 100;
      return `${change >= 0 ? '+' : ''}${fmt(change, 1)}%`;
    };
    const rows = cur.map(row => {
      const yearRow = prevYear.get(row.name) || {};
      const monthRow = prevMonth.get(row.name) || {};
      const base = [esc(row.name || '—'), metricText(row[field])];
      if (compareMode === 'plan') {
        const plan = row.plan_vol ?? planVolume(row.node);
        const completion = plan && row.sold_vol != null ? row.sold_vol / plan * 100 : null;
        return [...base, plan ? `${fmt(wan(plan), 1)} 万m³` : '未分解', completion == null ? '—' : `${fmt(completion, 1)}%`];
      }
      if (compareMode === 'yoy') return [...base, metricText(yearRow[field]), pctDiff(row[field], yearRow[field])];
      if (compareMode === 'mom') return [...base, metricText(monthRow[field]), pctDiff(row[field], monthRow[field])];
      return [...base, metricText(yearRow[field]), pctDiff(row[field], yearRow[field]), metricText(monthRow[field]), pctDiff(row[field], monthRow[field])];
    });
    return `<div class="analysis-compare"><div class="ac-head"><span>对比明细 · ${esc(compareMeta[compareMode].label)}</span><span class="ac-hint">${esc(compareMeta[compareMode].hint)}</span></div>
      <div class="table-scroll"><table class="data-table"><thead><tr>${columns.map(col => `<th>${esc(col)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(cells => `<tr>${cells.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}"><div class="empty">当前范围暂无可对比数据</div></td></tr>`}</tbody></table></div></div>`;
  }
  const dimensionLabels = { nature: '用水性质', children: '下级横评', industry: '行业', caliber: '水表口径', meterType: '水表类型', admin: '行政区' };
  function analysisDimensionLabel() {
    if (drillAnalysisDimension === 'children') return `${childTypeLabel()}横评`;
    return dimensionLabels[drillAnalysisDimension] || '维度';
  }
  function drillFromChart(params, ctx) {
    if (!params?.name) return;
    const dimension = ctx?.state?.dimension || drillAnalysisDimension;
    if (dimension === 'children') {
      const child = levelChildren().find(node => node.name === params.name);
      if (child) { navigate('drill', metricDrillParams(analysisMetric, { orgNodeId: child.id })); return; }
    }
    const keyMap = { admin: 'admin', nature: 'nature', industry: 'industry', caliber: 'caliberMm', meterType: 'meterType' };
    const stateKey = keyMap[dimension];
    if (!stateKey) {
      const chartId = [...E.charts.values()].find(entry => entry.context === ctx)?.id;
      if (chartId) E.openChartRows(chartId, params);
      return;
    }
    let value = params.name;
    if (dimension === 'admin') value = D.adminRegions.find(item => item.name === params.name)?.code || '';
    if (!value) return;
    const node = effectiveNode();
    const next = metricDrillParams(analysisMetric, { [stateKey]: value });
    if (node) next.orgNodeId = node.id;
    if (dimension === 'admin') next.functional = '';
    WB.shell?.toast?.(`已按${E.dimensionOptions[dimension] || dimension}筛选：${params.name}`);
    navigate('drill', next);
  }
  function currentAnalysisSubtitle() {
    const label = analysisDimensionLabel();
    return analysisView === 'year'
      ? `近5年年度对比 · ${compareMeta[compareMode].label}`
      : `${analysisSubtitles[analysisMetric]} · ${label}`;
  }
  function currentAnalysisDefinition() {
    if (analysisView === 'year') return yearDefinition();
    const meta = metricMeta[analysisMetric];
    const baseDefinition = kpiDefinitions().find(item => item.id === meta.chart) || {};
    return {
      ...baseDefinition,
      dimension: drillAnalysisDimension,
      dimensions: [drillAnalysisDimension, ...(baseDefinition.dimensions || []).filter(item => item !== drillAnalysisDimension)],
      onClick: drillFromChart
    };
  }
  function analysisCard() {
    const definition = currentAnalysisDefinition();
    const effectiveSubtitle = currentAnalysisSubtitle();
    const metricButtons = Object.entries(metricMeta)
      .filter(([key]) => key !== 'loss_rate_pct' || lossApplicable())
      .map(([key, item]) => `<button type="button" data-home-metric="${key}" class="${key === analysisMetric ? 'active' : ''}" aria-pressed="${key === analysisMetric}">${esc(item.label)}</button>`).join('');
    return `<section class="card home-analysis" id="homeAnalysis">
      <div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">指标分析</h2><div class="card-subtitle" id="homeAnalysisSub">${esc(effectiveSubtitle || '')}</div></div>
        <div class="card-head-actions"><button type="button" class="btn xs" id="homeTrendToggle" aria-expanded="false">趋势对比</button><nav class="wb-analysis-nav" id="homeAnalysisNav" aria-label="切换分析指标">${metricButtons}</nav></div></div>
      <div class="analysis-controls">
        <span class="ac-label">分析视图</span>
        <div class="segmented" id="homeAnalysisViews" aria-label="分析视图">${Object.entries(analysisViewMeta).map(([key, item]) => `<button type="button" data-analysis-view="${key}" class="${key === analysisView ? 'active' : ''}" aria-pressed="${key === analysisView}">${item.label}</button>`).join('')}</div>
        <span class="ac-label">对比方式</span>
        <div class="segmented" id="homeCompareModes" aria-label="对比方式">${Object.entries(compareMeta).map(([key, item]) => `<button type="button" data-compare-mode="${key}" class="${key === compareMode ? 'active' : ''}" aria-pressed="${key === compareMode}">${item.label}</button>`).join('')}</div>
        <span class="ac-note">维度与粒度在图表工具条内切换</span>
      </div>
      <div class="chart-grid wb-kpi-chart-grid" id="homeAnalysisChart">${chartCard({ ...definition, subtitle: effectiveSubtitle, wide: true })}</div>
      ${compareTable()}
      <div class="home-trend-panel" id="homeTrendPanel" hidden></div>
    </section>`;
  }
  function registerAnalysis() {
    const definition = currentAnalysisDefinition();
    if (definition?.id && WB.chartState[definition.id]) WB.chartState[definition.id].dimension = definition.dimension;
    const target = document.getElementById(definition.id);
    if (target) E.registerChart(definition.id, target, scopedDef(definition));
    document.querySelectorAll('[data-home-metric]').forEach(button => {
      button.addEventListener('click', () => switchAnalysis(button.dataset.homeMetric));
    });
    document.querySelectorAll('[data-analysis-view]').forEach(button => {
      button.addEventListener('click', () => { analysisView = button.dataset.analysisView; WB.state.period = analysisViewMeta[analysisView].period; redrawAnalysis(); updateCards(); });
    });
    document.querySelectorAll('[data-compare-mode]').forEach(button => {
      button.addEventListener('click', () => { compareMode = button.dataset.compareMode; redrawAnalysis(); });
    });
    bindTrendToggle();
  }
  function redrawAnalysis() {
    const card = document.getElementById('homeAnalysis');
    if (!card) return;
    card.outerHTML = analysisCard();
    registerAnalysis();
  }
  function switchAnalysis(metric) {
    if (!metricMeta[metric]) return;
    if (metric === 'loss_rate_pct' && !lossApplicable()) { WB.shell?.toast?.('当前层级不展示产销差率'); return; }
    const previous = metricMeta[analysisMetric].chart;
    const entry = E.charts?.get ? E.charts.get(previous) : null;
    if (entry) { try { entry.chart.dispose(); } catch (error) {} E.charts.delete(previous); }
    analysisMetric = metric; WB.state.metric = metric;
    if (window.WBApp?.current === 'drill') { if (window.WBApp?.render) window.WBApp.render(false); else renderDrill(); return; }
    const card = document.getElementById('homeAnalysis');
    if (!card) return;
    card.outerHTML = analysisCard();
    registerAnalysis();
  }

  function refusalHtml(reason) {
    return `<header class="page-heading"><div class="breadcrumb"><span>营销一体化</span><span class="breadcrumb-separator">/</span><span>首页</span></div><div class="page-title-row"><h1 class="page-title">该层级不在当前责任范围</h1><span class="environment-badge"><i></i>演示数据</span></div><p class="page-description">${esc(reason || '请求的节点不属于当前身份授权范围，未加载其指标、下级、图表与导出。')}</p></header>
      <section class="card"><div class="card-body"><div class="empty">已保留原 URL，未做静默改写。<div style="margin-top:12px"><button type="button" class="btn primary" id="homeRefusalBack">返回我的首页</button></div></div></div></section>`;
  }
  function bindRefusal() {
    document.getElementById('homeRefusalBack')?.addEventListener('click', () => {
      WB.state.orgNodeId = '';
      navigate('home', { orgNodeId: '' });
    });
  }

  function renderHome(initialMetric) {
    ensureStyle(); ensureSubscription();
    const root = page();
    if (!root) return;
    if (requestedOutside()) {
      const heading = existingHeading(root, '<section class="page-heading"><div class="breadcrumb"><span>首页</span></div><h1 class="page-title">首页</h1></section>');
      root.innerHTML = heading + refusalHtml();
      bindRefusal();
      return;
    }
    const requested = initialMetric || (metricMeta[WB.state.metric] ? WB.state.metric : null);
    if (requested && (requested !== 'loss_rate_pct' || lossApplicable())) analysisMetric = requested;
    if (analysisMetric === 'loss_rate_pct' && !lossApplicable()) analysisMetric = 'sold_vol';
    if (!WB.state.period || WB.state.period === '自定义') WB.state.period = analysisViewMeta[analysisView].period;
    disposeExcept(['C-HOME-01', 'C-HOME-02', 'C-HOME-03', metricMeta[analysisMetric].chart, 'C-HOME-YEAR']);
    const level = levelLabel();
    const child = childTypeLabel();
    const heading = existingHeading(root, `<section class="page-heading"><div><div class="breadcrumb"><span>首页</span></div><h1 class="page-title">首页</h1><p class="page-description">${esc(level)}核心指标总览 · ${esc(child)}地图与横评 · 指标分析与下钻</p></div></section>`);
    root.innerHTML = `${heading}${heroScopeBar()}<div class="wb-home-hero-wrap">
      ${homeHeroHtml()}
      <details class="wb-method-note"><summary>统计口径</summary><p>统计值只取自当前身份授权范围（${esc(scopeLabel())}），范围外单位只显示名称、不参与计算、不可点击、不做“其他单位”汇总。注册用户数为所选期间期末存量，不是授权户数；新增户按所选自然月立户日期统计。产销差率仅在集团与经营单位层级展示，所及以下不展示；供水未接入的网格显示缺数，不按0处理。地图为示意，不代表经营覆盖范围或法定边界。</p></details>
    </div>`;
    updateCards();
    bindExport('kpi', 'home-kpi', E?.filterFacts ? facts(filters()) : []);
    registerAnalysis();
    renderScopeRanking();
    bindHomeControls();
    if (homeMapView === 'company') ensureNodeMap().then(renderNodeMap).catch(() => {});
    if (homeMapView === 'admin') switchHomeMapView('admin');
  }

  function syncMapControls() {
    if (!window.WBMap) return;
    const state = WBMap.getState();
    const select = document.getElementById('wbMapMetric');
    if (select) select.value = state.metric;
    document.querySelectorAll('[data-map-view]').forEach(button => button.classList.toggle('active', button.dataset.mapView === state.view));
  }

  // 导出快照：meta 在表格/图表生成时登记，点击导出只比对当时的 scopeVersion，范围变化即拒绝。
  const exportBindings = new Map();
  function snapshotMeta(kind, sourceRows) {
    const rows = sourceRows || [];
    // 生成时快照：版本/来源行/身份一次捕获，导出时显式传回，旧代数组由守卫拒绝。
    return E.tableExportMeta(kind, rows, undefined, personaInfo()?.personaId || '');
  }
  function bindExport(key, kind, sourceRows) {
    exportBindings.set(key, snapshotMeta(kind, sourceRows));
  }
  function guardedExport(key, kind, name, headers, rows) {
    const meta = exportBindings.get(key) || snapshotMeta(kind, facts(filters()));
    // 派生行必须与其来源行一起登记，否则引擎只认原始行或图表上下文。
    if (E?.bindExport && Array.isArray(rows) && rows.length) E.bindExport(rows, meta?.sourceRows || []);
    if (E?.exportGuard) {
      const verdict = E.exportGuard(rows, meta);
      if (verdict && verdict.ok === false) { WB.shell?.toast?.(verdict.reason || '导出被范围校验拒绝'); return false; }
    }
    const result = E?.downloadCSV ? E.downloadCSV(name, headers, rows, meta) : null;
    if (result && result.ok === false) { WB.shell?.toast?.(result.reason || '导出被拒绝'); return false; }
    return true;
  }
  function exportGroupKpis() {
    const f = filters();
    const sourceRows = facts(f);
    if (!sourceRows.length) { WB.shell?.toast?.('当前范围暂无可用数据，未导出（缺数不按0）'); return; }
    exportBindings.set('kpi', snapshotMeta('home-kpi', sourceRows));
    const t = aggregate(f);
    const rows = [
      ['售水量', t.sold_vol, 'm³', `计划完成率 ${planApplicable() && planCompletion(t) != null ? fmt(planCompletion(t), 2) + '%' : '未分解到本级'}`],
      ['注册用户数', t.registered_count, '户', '所选期间期末存量（非授权户数）'],
      ['产销差率', lossApplicable() ? t.loss_rate_pct : null, '%', lossApplicable() ? '同计量边界供售水量计算' : '所及以下不适用'],
      ['售水均价', t.avg_price_yuan, '元/m³', '售水收入/售水量'],
      ['收费率', t.charge_rate_pct, '%', '实收水费/应收水费']
    ];
    const dataRows = rows.map(row => [row[0], t.count ? row[1] : null, ...row.slice(2), E.filterLabel(f)]);
    guardedExport('kpi', 'home-kpi', `${levelLabel()}核心指标_${f.month || '当前'}.csv`, ['指标', '数值', '单位', '口径/补充', 'Filter摘要'], dataRows);
  }

  function categoryAxis(rows) {
    return { type: 'category', data: rows.map(row => row.name), axisLabel: { color: '#758697', fontSize: 10, interval: 0, rotate: rows.length > 8 ? 25 : 0, width: 105, overflow: 'truncate' }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#DCE6EE' } } };
  }
  function valueAxis(name, second = false) {
    return { type: 'value', name, nameTextStyle: { color: '#9AA9B7', fontSize: 10 }, axisLabel: { color: '#8B9AA8', fontSize: 10 }, splitLine: { show: !second, lineStyle: { color: '#EDF2F6', type: 'dashed' } } };
  }
  function hiddenLabel() { return { show: false, fontSize: 9, color: '#536C80' }; }
  function barSeries(name, data, color) { return { name, type: 'bar', data, barMaxWidth: 26, itemStyle: { color, borderRadius: [5, 5, 0, 0] }, label: hiddenLabel() }; }
  function lineSeries(name, data, color, yAxisIndex = 0) { return { name, type: 'line', data, yAxisIndex, smooth: true, symbolSize: 6, lineStyle: { width: 2, color }, itemStyle: { color }, label: hiddenLabel() }; }
  function comboTooltip(params) {
    if (!Array.isArray(params)) params = [params];
    const lines = [esc(params[0]?.axisValueLabel || params[0]?.name || '')];
    params.forEach(item => {
      const unit = item.seriesName.includes('率') ? '%' : item.seriesName.includes('均价') ? '元/m³' : item.seriesName.includes('水费') || item.seriesName.includes('收入') ? '万元' : item.seriesName.includes('户') ? '户' : '万m³';
      const digits = unit === '元/m³' ? 3 : unit === '户' ? 0 : 2;
      // item.marker 是 ECharts 生成的可信 HTML；转义会把色点 <span> 显示成原始文本。
      lines.push(`${item.marker || ''}${esc(item.seriesName)}：<strong>${fmt(item.value, digits)} ${unit}</strong>`);
    });
    return lines.join('<br>');
  }
  function baseCombo(rows, axes, series) {
    return {
      animationDuration: 300,
      grid: { left: 62, right: axes.length > 1 ? 62 : 28, top: 48, bottom: rows.length > 8 ? 68 : 48 },
      legend: { top: 0, right: 0, type: 'scroll', textStyle: { color: '#758697', fontSize: 10 } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: comboTooltip },
      xAxis: categoryAxis(rows), yAxis: axes, series
    };
  }

  function seriesRows(rows, specs) {
    return rows.flatMap(row => specs.map(([key, label, unit]) => [`${row.name} · ${label}`, row[key] ?? null, unit]));
  }

  function kpiDefinitions() {
    const volumeDimensions = ['children', 'nature', 'industry', 'caliber', 'meterType', 'admin'];
    return [
      {
        id: 'C-KPI-01', title: '产销差率分析', dimension: 'children', dimensions: ['children'],
        getOption: ctx => {
          if (!lossApplicable()) return E.emptyOption('当前层级不展示产销差率');
          const rows = comparisonRows(ctx, 'loss_rate_pct');
          if (!rows.length || !rows.some(row => row.loss_rate_pct != null)) return E.emptyOption();
          const bar = barSeries('本期产销差率', rows.map(row => row.loss_rate_pct), '#317FC2');
          bar.itemStyle = { ...bar.itemStyle, color: params => params.value < 0 ? '#D99A32' : '#317FC2' };
          bar.markLine = { silent: true, symbol: 'none', lineStyle: { color: '#9AA9B7', type: 'dashed' }, label: { formatter: '零差异', fontSize: 9 }, data: [{ yAxis: 0 }] };
          return baseCombo(rows, [valueAxis('%')], [bar, barSeries('上年同期产销差率', rows.map(row => row.previous_value), '#9BC2DF')]);
        },
        getRows: ctx => lossApplicable() ? seriesRows(comparisonRows(ctx, 'loss_rate_pct'), [['loss_rate_pct', '本期产销差率', '%'], ['previous_value', '上年同期产销差率', '%']]) : [], onClick: drillFromChart
      },
      {
        id: 'C-KPI-02', title: '售水量与计划完成', dimension: 'children', dimensions: volumeDimensions,
        getOption: ctx => {
          const rows = groupRows(ctx, 'sold_vol');
          if (!rows.some(row => row.count)) return E.emptyOption();
          return baseCombo(rows, [valueAxis('万m³'), valueAxis('%', true)], [
            barSeries('本期售水量', rows.map(row => wan(row.sold_vol)), '#317FC2'),
            barSeries('同期售水量', rows.map(row => wan(row.previous_sold)), '#9BC2DF'),
            barSeries('计划售水量', rows.map(row => wan(row.plan_vol)), '#B9D9C4'),
            lineSeries('计划完成率', rows.map(row => row.plan_completion_pct ?? null), '#F58B3C', 1)
          ]);
        },
        getRows: ctx => seriesRows(groupRows(ctx, 'sold_vol'), [['sold_vol', '本期售水量', 'm³'], ['previous_sold', '同期售水量', 'm³'], ['plan_vol', '计划售水量', 'm³'], ['plan_completion_pct', '计划完成率', '%']]), onClick: drillFromChart
      },
      {
        id: 'C-KPI-03', title: '收费率与应收实收', dimension: 'children', dimensions: ['children', 'nature', 'admin'],
        getOption: ctx => {
          const rows = comparisonRows(ctx, 'charge_rate_pct');
          if (!rows.some(row => row.count)) return E.emptyOption();
          return baseCombo(rows, [valueAxis('万元'), valueAxis('%', true)], [
            barSeries('应收水费', rows.map(row => wan(row.receivable_principal)), '#9BC2DF'),
            barSeries('实收水费', rows.map(row => wan(row.received_principal)), '#317FC2'),
            lineSeries('本期收费率', rows.map(row => row.charge_rate_pct), '#F58B3C', 1),
            lineSeries('上年同期收费率', rows.map(row => row.previous_value), '#41A75E', 1)
          ]);
        },
        getRows: ctx => seriesRows(comparisonRows(ctx, 'charge_rate_pct'), [['receivable_principal', '应收水费', '元'], ['received_principal', '实收水费', '元'], ['charge_rate_pct', '本期收费率', '%'], ['previous_value', '上年同期收费率', '%']]), onClick: drillFromChart
      },
      {
        id: 'C-KPI-04', title: '售水均价与水量结构', dimension: 'nature', dimensions: ['children', 'nature', 'industry'],
        getOption: ctx => {
          const rows = comparisonRows(ctx, 'avg_price_yuan');
          if (!rows.some(row => row.count)) return E.emptyOption();
          return baseCombo(rows, [valueAxis('元/m³'), valueAxis('万m³', true)], [
            barSeries('本期售水均价', rows.map(row => row.avg_price_yuan), '#735DA8'),
            barSeries('上年同期均价', rows.map(row => row.previous_value), '#B3A1CE'),
            lineSeries('售水量', rows.map(row => wan(row.sold_vol)), '#317FC2', 1)
          ]);
        },
        getRows: ctx => seriesRows(comparisonRows(ctx, 'avg_price_yuan'), [['avg_price_yuan', '本期售水均价', '元/m³'], ['previous_value', '上年同期均价', '元/m³'], ['sold_vol', '售水量', 'm³']]), onClick: drillFromChart
      },
      {
        id: 'C-KPI-05', title: '注册用户数与本期新增', dimension: 'children', dimensions: volumeDimensions,
        getOption: ctx => {
          const rows = comparisonRows(ctx, 'registered_count');
          if (!rows.some(row => row.count)) return E.emptyOption();
          return baseCombo(rows, [valueAxis('户')], [
            barSeries('期末注册户数', rows.map(row => row.registered_count), '#317FC2'),
            barSeries('上年同期末户数', rows.map(row => row.previous_value), '#9BC2DF'),
            barSeries('本期新增户数', rows.map(row => row.new_count), '#41A75E')
          ]);
        },
        getRows: ctx => seriesRows(comparisonRows(ctx, 'registered_count'), [['registered_count', '期末注册户数', '户'], ['previous_value', '上年同期末户数', '户'], ['new_count', '本期新增户数', '户']]), onClick: drillFromChart
      }
    ];
  }

  function renderKpi() {
    return renderHome(metricMeta[WB.state.metric] ? WB.state.metric : 'sold_vol');
  }

  function drillBreadcrumb() {
    const nodes = crumbNodes();
    const names = nodes.map(node => node.name);
    if (!names.length) names.push(levelLabel());
    return ['首页', ...names];
  }
  function drillRisk() {
    return `<span class="v4-risk" data-tip="下钻层级来自组织授权树的真实深度；缺数不按0处理，范围外不参与汇总" title="下钻层级来自组织授权树的真实深度；缺数不按0处理，范围外不参与汇总">⚠ L2</span>`;
  }
  function drillBackTarget() {
    const node = effectiveNode();
    const parent = node ? nodeOf(node.parentId) : null;
    return parent && inScopeNode(parent.id) ? parent : null;
  }
  function drillLeaf() {
    return !effectiveNode() || !levelChildren().length;
  }

  function collectionRows(f) {
    const users = queryUsers(f);
    if (!users.length) return [];
    const nonRes = users.filter(user => ['非居民', '特行', '居民非阶梯'].includes(user.nature)).length;
    const metered = users.filter(user => user.nature === '居民阶梯').length;
    return [
      { name: '非居民数量', value: nonRes },
      { name: '抄表到户', value: metered },
      { name: '未抄表到户', value: null }
    ];
  }

  // ===== 业务分类视图（会议 MEET-12：用户管理/表务管理/抄表质量管理/账务管理/收费）=====
  function domainSeries(kind, f) {
    if (kind === 'user') {
      const users = queryUsers(f);
      const rows = (D.natures || []).map(nature => ({ name: nature, value: users.filter(user => user.nature === nature).length })).filter(row => row.value > 0);
      return { title: '注册户数按用水性质', unit: '户', rows, seriesName: '注册户数' };
    }
    if (kind === 'meter') {
      const meters = nodeRows('meterInventory');
      const byType = (D.meterTypes || ['机械表', '远传表']).map(type => ({ name: type, value: meters.filter(meter => meter.meterType === type).length }));
      const byCaliber = (D.calibers || []).map(caliber => ({ name: caliber, value: meters.filter(meter => meter.caliber === caliber).length })).filter(row => row.value > 0);
      return { title: '水表数量（类型 / 口径）', unit: '只', rows: [...byType, ...byCaliber], seriesName: '水表数量' };
    }
    if (kind === 'read') {
      const tasks = nodeRows('readTasks');
      const read = tasks.filter(task => task.status !== '未抄');
      const mobile = tasks.filter(task => task.method !== '远传');
      const arrived = mobile.filter(task => task.arrived === true);
      const estimated = read.filter(task => task.estimated || task.status === '估抄');
      const rate = (a, b) => (b > 0 ? +(a / b * 100).toFixed(2) : null);
      return { title: '抄表三率（抄见 / 到位 / 估抄）', unit: '%',
        rows: [{ name: '抄见率', value: rate(read.length, tasks.length) }, { name: '到位率', value: rate(arrived.length, mobile.length) }, { name: '估抄率', value: rate(estimated.length, read.length) }],
        seriesName: '比率' };
    }
    if (kind === 'account') {
      const dimension = drillLeaf() ? 'nature' : 'children';
      const rows = groupRows({ data: facts(f), filters: f, state: { dimension } }, 'receivable_principal');
      return { title: `应收 / 实收水费（按${analysisDimensionLabel()}）`, unit: '万元', multi: true,
        rows: rows.map(row => ({ name: row.name, receivable: wan(row.receivable_principal), received: wan(row.received_principal) })), seriesName: '水费' };
    }
    const rows = groupRows({ data: facts(f), filters: f, state: { dimension: 'nature' } }, 'charge_rate_pct');
    return { title: '收费率与售水均价（按用水性质）', unit: '%', secondaryUnit: '元/m³', multi: true,
      rows: rows.map(row => ({ name: row.name, rate: row.charge_rate_pct, price: row.avg_price_yuan })), seriesName: '收费' };
  }
  function domainDefinition(kind, label) {
    return {
      id: `C-DOM-${kind}`, title: label, dimension: kind, dimensions: [], periodFilter: true,
      getOption: () => {
        const info = domainSeries(kind, filters());
        if (!info.rows.length) return E.emptyOption();
        if (kind === 'account') {
          return { color: ['#317FC2', '#41A75E'], tooltip: { trigger: 'axis' }, legend: { bottom: 0, textStyle: { fontSize: 10, color: '#758697' } }, grid: { left: 52, right: 18, top: 24, bottom: 46 },
            xAxis: { type: 'category', data: info.rows.map(row => row.name), axisLabel: { fontSize: 10, interval: 0, rotate: info.rows.length > 5 ? 20 : 0 } },
            yAxis: { type: 'value', name: '万元' },
            series: [{ name: '应收水费', type: 'bar', barMaxWidth: 24, data: info.rows.map(row => row.receivable), itemStyle: { color: '#317FC2', borderRadius: [4, 4, 0, 0] } },
              { name: '实收水费', type: 'bar', barMaxWidth: 24, data: info.rows.map(row => row.received), itemStyle: { color: '#41A75E', borderRadius: [4, 4, 0, 0] } }] };
        }
        if (kind === 'charge') {
          return { color: ['#8E6FD8', '#F58B3C'], tooltip: { trigger: 'axis' }, legend: { bottom: 0, textStyle: { fontSize: 10, color: '#758697' } }, grid: { left: 52, right: 52, top: 24, bottom: 46 },
            xAxis: { type: 'category', data: info.rows.map(row => row.name), axisLabel: { fontSize: 10, interval: 0 } },
            yAxis: [{ type: 'value', name: '收费率(%)', max: 100 }, { type: 'value', name: '元/m³' }],
            series: [{ name: '收费率', type: 'bar', barMaxWidth: 26, data: info.rows.map(row => row.rate), itemStyle: { color: '#8E6FD8', borderRadius: [4, 4, 0, 0] } },
              { name: '售水均价', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 6, data: info.rows.map(row => row.price), lineStyle: { width: 2, color: '#F58B3C' }, itemStyle: { color: '#F58B3C' } }] };
        }
        return { color: ['#317FC2'], tooltip: { trigger: 'axis' }, grid: { left: 52, right: 18, top: 24, bottom: 46 },
          xAxis: { type: 'category', data: info.rows.map(row => row.name), axisLabel: { fontSize: 10, interval: 0, rotate: info.rows.length > 5 ? 20 : 0 } },
          yAxis: { type: 'value', name: info.unit },
          series: [{ name: info.seriesName, type: 'bar', barMaxWidth: 26, data: info.rows.map(row => row.value), itemStyle: { color: '#317FC2', borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', fontSize: 10, color: '#5B7A96' } }] };
      },
      getRows: () => {
        const info = domainSeries(kind, filters());
        return info.rows.map(row => kind === 'account' ? [row.name, row.receivable, row.received, '万元']
          : kind === 'charge' ? [row.name, row.rate, row.price, '% / 元每立方米']
          : [row.name, row.value, info.unit]);
      }
    };
  }
  const DOMAIN_GROUPS = [
    ['用户管理', [['user', '注册户数按用水性质']]],
    ['表务管理', [['meter', '水表数量（类型 / 口径）']]],
    ['抄表质量管理', [['read', '抄表三率（抄见 / 到位 / 估抄）']]],
    ['账务管理', [['account', '应收 / 实收水费']]],
    ['收费', [['charge', '收费率与售水均价']]]
  ];
  function dimensionDefinition(dim, label) {
    const titles = { nature: '用水性质', meterType: '水表类型', caliber: '水表口径', industry: '行业主类', admin: '行政区', collection: '抄表到户' };
    return {
      id: `C-DRILL-${dim}`, title: label, dimension: dim, dimensions: [dim], periodFilter: true,
      getOption: ctx => {
        if (dim === 'collection') {
          const rows = collectionRows(ctx.filters);
          if (!rows.length) return E.emptyOption();
          if (drillDimensionView === 'ring') {
            return { color: E.colors, tooltip: { trigger: 'item', formatter: params => `${esc(params.name)}<br>${fmt(params.value, 0)} 户 · ${params.percent}%` }, legend: { bottom: 0, textStyle: { fontSize: 10, color: '#758697' } },
              series: [{ type: 'pie', radius: ['40%', '66%'], center: ['50%', '44%'], data: rows.filter(row => row.value != null).map(row => ({ name: row.name, value: row.value })), itemStyle: { borderColor: '#fff', borderWidth: 2 }, label: { show: false } }] };
          }
          return baseCombo(rows.map(row => ({ name: row.name, value: row.value })), [valueAxis('户')], [barSeries('注册户数', rows.map(row => row.value), '#41A75E')]);
        }
        const rows = groupRows({ data: ctx.data, filters: ctx.filters, state: { dimension: dim } }, 'sold_vol');
        if (!rows.some(row => row.count)) return E.emptyOption();
        if (drillDimensionView === 'ring') return E.pieOption({ data: rows.filter(row => row.count), metric: 'sold_vol' });
        return baseCombo(rows, [valueAxis('万m³')], [barSeries('售水量', rows.map(row => wan(row.sold_vol)), '#317FC2')]);
      },
      getRows: ctx => dim === 'collection'
        ? collectionRows(ctx.filters).map(row => [row.name, row.value, '户'])
        : groupRows({ data: ctx.data, filters: ctx.filters, state: { dimension: dim } }, 'sold_vol').map(row => [row.name, wan(row.sold_vol), '万m³'])
    };
  }
  function childrenDefinition() {
    const label = `${childTypeLabel()}横评`;
    return {
      id: 'C-DRILL-children', title: label, dimension: 'children', dimensions: ['children'], periodFilter: true,
      getOption: ctx => {
        const rows = groupRows(ctx, 'sold_vol');
        if (!rows.some(row => row.count)) return E.emptyOption('当前范围暂无下级节点数据');
        return baseCombo(rows, [valueAxis('万m³'), valueAxis('%', true)], [
          barSeries('售水量', rows.map(row => wan(row.sold_vol)), '#317FC2'),
          lineSeries('计划完成率', rows.map(row => row.plan_completion_pct ?? null), '#F58B3C', 1)
        ]);
      },
      getRows: ctx => groupRows(ctx, 'sold_vol').map(row => [row.name, row.count ? wan(row.sold_vol) : null, row.plan_completion_pct ?? null, '万m³ / %']),
      onClick: drillFromChart
    };
  }

  function sumBy(rows, key) { return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0); }
  function groupSum(rows, key, fields) {
    const map = new Map();
    rows.forEach(row => {
      const name = row[key] || '未分类';
      const entry = map.get(name) || { name };
      fields.forEach(field => { entry[field] = (entry[field] || 0) + (Number(row[field]) || 0); });
      map.set(name, entry);
    });
    return [...map.values()];
  }
  function specialUsers() {
    const users = nodeUsers();
    const now = String(WB.state.month || '2026-10');
    const year = now.slice(0, 4);
    const stock = users.filter(user => !user.deregisterDate || user.deregisterDate > now).length;
    const added = users.filter(user => String(user.regDate || '').startsWith(year)).length;
    const closed = users.filter(user => user.deregisterDate && String(user.deregisterDate).startsWith(year)).length;
    const byNature = ['居民阶梯', '居民非阶梯', '非居民', '特行'].map(nature => {
      const rows = users.filter(user => user.nature === nature);
      return [nature, rows.length, rows.filter(user => String(user.regDate || '').startsWith(year)).length, rows.filter(user => user.deregisterDate && String(user.deregisterDate).startsWith(year)).length, fmt(rows.length ? rows.reduce((total, user) => total + (Number(user.yearVol) || 0), 0) / rows.length : null, 1)];
    });
    const byCommunity = groupSum(users, 'community', ['yearVol']).sort((a, b) => b.yearVol - a.yearVol).slice(0, 6)
      .map(row => [esc(row.name), fmt(row.yearVol, 0)]);
    const latest = (E.filterFacts ? facts({ ...filters(), period: '当月' }) : []);
    const nonRegistered = sumBy(latest, 'non_registered_count');
    const readTotal = sumBy(latest, 'read_total');
    return `<div class="kpi-grid four special-kpis">
        ${VCard('期末存量', fmt(stock, 0), '户', '当前范围有效表卡')}${VCard('本年新增', fmt(added, 0), '户', '按立户日期统计')}${VCard('本年注销', fmt(closed, 0), '户', '按注销日期统计')}${VCard('二次加压表后非注册', fmt(nonRegistered, 0), '户', '当期口径 · 抄表到户 ' + fmt(readTotal, 0), 'orange')}
      </div>
      <div class="special-grid">
        <div class="special-block"><h4>按用水性质</h4>
          <div class="table-scroll"><table class="data-table"><thead><tr><th>用水性质</th><th>存量(户)</th><th>本年新增(户)</th><th>本年注销(户)</th><th>户均年用水量(m³)</th></tr></thead><tbody>${byNature.map(row => `<tr>${row.map(cell => `<td>${esc(String(cell))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        </div>
        <div class="special-block"><h4>按小区（年用水量 Top 6）</h4>
          <div class="table-scroll"><table class="data-table"><thead><tr><th>小区</th><th>年用水量(m³)</th></tr></thead><tbody>${byCommunity.map(row => `<tr><td>${row[0]}</td><td>${row[1]}</td></tr>`).join('')}</tbody></table></div>
        </div>
      </div>
      <div class="notice">存量=当前范围未注销表卡；新增/注销按本年度立户/注销日期统计；二次加压表后非注册用户与抄表到户数取自当期事实表。${risk('L2', '二次加压与小区关联关系待甲方提供区域图后补充')}</div>`;
  }
  function specialBigUsers() {
    const users = nodeUsers();
    const big = users.filter(user => (Number(user.yearVol) || 0) >= 100);
    const key = users.filter(user => user.level === '重点关注');
    const scale = users.filter(user => user.industry === '企业');
    const totalVol = users.reduce((total, user) => total + (Number(user.yearVol) || 0), 0);
    const bigVol = big.reduce((total, user) => total + (Number(user.yearVol) || 0), 0);
    const top = [...users].sort((a, b) => (Number(b.yearVol) || 0) - (Number(a.yearVol) || 0)).slice(0, 10);
    return `<div class="kpi-grid four special-kpis">
        ${VCard('大用户（年用水≥100m³）', fmt(big.length, 0), '户', '占当前范围户数 ' + fmt(users.length ? big.length / users.length * 100 : null, 1) + '%')}${VCard('大用户水量占比', fmt(totalVol ? bigVol / totalVol * 100 : null, 1), '%', '年用水量口径')}${VCard('重点关注用户', fmt(key.length, 0), '户', '用户等级=重点关注')}${VCard('规模以上企业', fmt(scale.length, 0), '户', '行业主类=企业', 'green')}
      </div>
      <div class="special-block"><h4>年用水量 Top 10（大用户）</h4>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>用户</th><th>经营单位</th><th>组织</th><th>用水性质</th><th>行业</th><th>年用水量(m³)</th><th>等级</th></tr></thead><tbody>${top.map(user => `<tr><td>${esc(user.name)}</td><td>${esc(user.company)}</td><td>${esc(user.org)}</td><td>${esc(user.nature)}</td><td>${esc(user.industry)}</td><td>${fmt(user.yearVol, 0)}</td><td>${esc(user.level || '—')}</td></tr>`).join('')}</tbody></table></div>
      </div>
      <div class="notice">大用户与规模以上企业按用户档案口径统计（年用水量≥100m³）；仅统计当前身份授权范围。${risk('L1', '二次加压直供与小区关联关系未接入；样例数据规模不代表真实户均')}</div>`;
  }
  function specialPriceCharge() {
    const scopeFacts = facts(filters());
    const priceRows = ['居民阶梯', '居民非阶梯', '非居民', '特行'].map(nature => {
      const rows = scopeFacts.filter(row => row.nature === nature);
      const vol = sumBy(rows, 'sold_vol'), water = sumBy(rows, 'water_fee'), sewage = sumBy(rows, 'sewage_fee'), revenue = sumBy(rows, 'water_revenue');
      const divide = (a, b) => (b ? a / b : null);
      return [nature, fmt(vol, 0), fmt(divide(water, vol), 3), fmt(divide(sewage, vol), 3), fmt(divide(revenue, vol), 3)];
    });
    const bills = nodeBills();
    const periods = [...new Set(bills.map(bill => bill.period))].sort().slice(-6);
    const chargeRows = periods.map(period => {
      const rows = bills.filter(bill => bill.period === period);
      const amount = sumBy(rows, 'amount'), received = sumBy(rows, 'received');
      return [period, fmt(amount, 2), fmt(received, 2), fmt(amount - received, 2), fmt(amount ? received / amount * 100 : null, 2)];
    });
    const priorRecovered = bills.filter(bill => bill.paidAt && String(bill.period).slice(0, 4) < String(bill.paidAt).slice(0, 4));
    const recovered = sumBy(priorRecovered, 'received');
    return `<div class="special-block"><h4>单价计算逻辑（按用水性质）</h4>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>用水性质</th><th>水量(m³)</th><th>基本水价(元/m³)</th><th>污水处理费单价(元/m³)</th><th>综合单价(元/m³)</th></tr></thead><tbody>${priceRows.map(row => `<tr>${row.map(cell => `<td>${esc(String(cell))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      </div>
      <div class="special-grid">
        <div class="special-block"><h4>收费率（按开账年月）</h4><div class="table-scroll"><table class="data-table"><thead><tr><th>开账年月</th><th>应收水费(元)</th><th>实收水费(元)</th><th>欠费(元)</th><th>收费率(%)</th></tr></thead><tbody>${chargeRows.map(row => `<tr>${row.map(cell => `<td>${esc(String(cell))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>
        <div class="special-block"><h4>往年欠费收回</h4>
          <div class="kv-grid"><div class="kv"><span>往年收回金额</span><b>${fmt(recovered, 2)} 元</b></div><div class="kv"><span>涉及账单</span><b>${fmt(priorRecovered.length, 0)} 笔</b></div><div class="kv"><span>统计口径</span><b>收款日期年份 &gt; 开账年份</b></div></div>
          <button type="button" class="btn" id="specialExportArrears">导出当前欠费明细 CSV</button>
        </div>
      </div>
      <div class="notice">基本水价=水费/水量，综合单价=售水收入/水量；违约金字段未提供，暂不列示；收费率按开账年月统计、不按收款年月重算。${risk('L1', '违约金数据未接入；单价口径待财务确认')}</div>`;
  }
  function lossRows() {
    const node = effectiveNode();
    if (!node) return [];
    if (typeOf(node) === 'company') return [{ name: node.name, node, totals: aggregate(filters()) }];
    if (typeOf(node) === 'group') return childTotals(filters()).filter(row => typeOf(row.node) === 'company').map(row => ({ name: row.name, node: row.node, totals: row }));
    return [];
  }
  const lossReasonStore = new Map();
  function specialLoss() {
    const rows = lossRows().map(row => {
      const supply = row.totals?.supply_vol ?? null, sold = row.totals?.sold_vol ?? null;
      const rate = supply != null && supply > 0 && sold != null ? (supply - sold) / supply * 100 : null;
      return { name: row.name, node: row.node, supply, sold, rate };
    });
    const table = rows.map(row => `<tr><td>${esc(row.name)}</td><td>${row.supply == null ? '缺数' : fmt(row.supply, 0)}</td><td>${fmt(row.sold, 0)}</td><td>${row.rate == null ? '缺数' : fmt(row.rate, 2) + '%'}</td></tr>`).join('');
    const writable = rows.filter(row => canPlan(row.node));
    const month = WB.state.month || '';
    const reasonRows = rows.map(row => {
      const allowed = canPlan(row.node);
      const saved = lossReasonStore.get(`${month}|${row.name}`) || '';
      return `<tr><td>${esc(row.name)}</td><td>${allowed
        ? `<input class="control special-reason" data-company="${esc(row.name)}" value="${esc(saved)}" placeholder="如：供水量口径调整 / 管网漏损" aria-label="${esc(row.name)}变化原因">`
        : `<span class="muted">${saved ? `已填报：${esc(saved)}` : '无填报权限（仅可查看）'}</span>`}</td></tr>`;
    }).join('');
    return `<div class="special-block"><h4>产销差率（按经营单位）</h4>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>经营单位</th><th>供水量(m³)</th><th>售水量(m³)</th><th>产销差率</th></tr></thead><tbody>${table || '<tr><td colspan="4"><div class="empty">当前范围无经营单位数据</div></td></tr>'}</tbody></table></div>
      </div>
      <div class="special-block"><h4>填报变化原因（演示 · 纯内存）</h4>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>经营单位</th><th>变化原因</th></tr></thead><tbody>${reasonRows}</tbody></table></div>
        ${writable.length ? `<div style="padding:10px 0"><button type="button" class="btn primary" id="specialSaveReasons">保存填报原因（内存）</button> <span class="muted" id="specialReasonHint">尚未保存</span></div>` : '<div class="notice">当前身份无计划/产销差填报权限，仅可查看。</div>'}
      </div>
      <div class="notice">供水量填报未接入时产销差率显示“缺数”，不按售水量推算。${risk('L1', '供水量与分区计量数据未接入；填报原因仅演示')}</div>`;
  }
  const baseSpecialTabs = [['users', '用户结构'], ['big', '大用户与重点'], ['price', '单价与收费率']];
  let specialTab = 'users';
  function specialTabs() {
    return lossApplicable() ? [...baseSpecialTabs, ['loss', '产销差与填报']] : baseSpecialTabs;
  }
  function specialBody() {
    if (specialTab === 'users') return specialUsers();
    if (specialTab === 'big') return specialBigUsers();
    if (specialTab === 'price') return specialPriceCharge();
    if (specialTab === 'loss' && lossApplicable()) return specialLoss();
    return specialUsers();
  }
  function renderSpecial() {
    const body = document.getElementById('drillSpecialBody');
    if (!body) return;
    if (!specialTabs().some(([key]) => key === specialTab)) specialTab = 'users';
    body.innerHTML = specialBody();
    if (specialTab === 'price' || document.getElementById('specialExportArrears')) {
      bindExport('arrears', 'bills', nodeBills().filter(bill => Number(bill.arrears) > 0));
    }
    document.querySelectorAll('[data-special-tab]').forEach(button => {
      button.classList.toggle('active', button.dataset.specialTab === specialTab);
      button.onclick = () => { specialTab = button.dataset.specialTab; renderSpecial(); };
    });
    document.getElementById('specialExportArrears')?.addEventListener('click', () => {
      const source = nodeBills().filter(bill => Number(bill.arrears) > 0);
      if (!source.length) { WB.shell?.toast?.('当前范围无欠费明细'); return; }
      guardedExport('arrears', 'bills', '欠费明细_按开账年月.csv', ['开账年月', '用户', '经营单位', '用水性质', '应收(元)', '实收(元)', '欠费(元)'], source.map(bill => [bill.period, bill.userId, bill.company, bill.nature, bill.amount, bill.received, bill.arrears]));
    });
    document.getElementById('specialSaveReasons')?.addEventListener('click', () => {
      const inputs = [...document.querySelectorAll('.special-reason')];
      const allowed = inputs.filter(input => {
        const node = levelChildren().find(item => item.name === input.dataset.company) || (typeOf(effectiveNode()) === 'company' ? effectiveNode() : null);
        return canPlan(node);
      });
      if (inputs.length && !allowed.length) { WB.shell?.toast?.('填报被权限校验拒绝'); return; }
      const month = WB.state.month || '';
      const reasons = allowed.filter(input => input.value.trim()).map(input => ({ month, company: input.dataset.company, reason: input.value.trim() }));
      reasons.forEach(reason => lossReasonStore.set(`${reason.month}|${reason.company}`, reason.reason));
      const hint = document.getElementById('specialReasonHint');
      if (hint) hint.textContent = reasons.length ? `已保存 ${reasons.length} 条（纯内存，刷新清空）` : '尚未保存';
      WB.shell?.toast?.('填报原因已保存到当前页面内存（不落本地存储）');
    });
  }
  function VCard(title, value, unit, note, tone) {
    return `<article class="card kpi-card"><div class="kpi-top"><span class="kpi-icon ${tone || ''}"></span><span>${esc(title)}</span></div><div class="kpi-main"><span class="kpi-value numeric">${value}</span><span class="kpi-unit">${esc(unit)}</span></div><div class="kpi-foot"><span>${esc(note)}</span></div></article>`;
  }

  function renderDrill() {
    ensureStyle(); ensureSubscription();
    const root = page();
    if (!root) return;
    if (requestedOutside()) {
      root.innerHTML = refusalHtml();
      bindRefusal();
      return;
    }
    const node = effectiveNode();
    const children = levelChildren();
    const leaf = !node || !children.length;
    if (!leaf) drillAnalysisDimension = 'children';
    else if (drillAnalysisDimension === 'children') drillAnalysisDimension = 'nature';
    if (analysisMetric === 'loss_rate_pct' && !lossApplicable()) analysisMetric = 'sold_vol';
    disposeExcept(['C-DRILL-children', 'C-DRILL-nature', 'C-DRILL-meterType', 'C-DRILL-caliber', 'C-DRILL-industry', 'C-DRILL-admin', 'C-DRILL-collection', 'C-DOM-user', 'C-DOM-meter', 'C-DOM-read', 'C-DOM-account', 'C-DOM-charge', metricMeta[analysisMetric].chart, 'C-HOME-YEAR']);
    const crumbs = crumbNodes();
    const crumbHtml = ['首页', ...crumbs.map(item => item.name)].map((part, index) => index === 0 ? `<span>${esc(part)}</span>` : `<span class="breadcrumb-separator">/</span><span>${esc(part)}</span>`).join('');
    const pathText = drillBreadcrumb().slice(1).join(' / ') || levelLabel();
    const nextMeta = leaf ? null : { key: 'children', label: childTypeLabel() };
    const heading = `<header class="page-heading product-page-heading"><div class="page-heading-copy"><div class="breadcrumb"><span>营销一体化</span><span class="breadcrumb-separator">/</span>${crumbHtml}</div><div class="page-title-row"><h1 class="page-title">${esc(pathText)} · 指标详情</h1><span class="environment-badge"><i></i>演示数据</span>${drillRisk()}</div><p class="page-description">${esc(pathText)} 层级指标与维度分析 · ${nextMeta ? '可继续下钻到' + esc(nextMeta.label) : '已到责任末端层级，展示责任清单与明细'}</p></div><div class="page-heading-side"><div class="page-data-meta"><span>数据日期</span><strong>${esc(D.asOf)}</strong></div></div></header>`;
    const baseDims = [['nature', '用水性质'], ['meterType', '水表类型'], ['caliber', '水表口径'], ['industry', '行业主类'], ['admin', '行政区']];
    const registeredDims = analysisMetric === 'registered_count' ? [['collection', '抄表到户']] : [];
    const suffix = drillDimensionView === 'ring' ? ' · 构成占比' : '';
    const dimensionDefs = [...(leaf ? [] : [childrenDefinition()]), ...baseDims.map(([dim, label]) => dimensionDefinition(dim, label + suffix)), ...registeredDims.map(([dim, label]) => dimensionDefinition(dim, label + suffix))];
    const backTarget = drillBackTarget();
    const childHtml = children.length ? `<div class="drill-children"><span class="dc-label">继续下钻 · ${esc(childTypeLabel())}</span>${children.map(item => `<button type="button" class="dc-chip" data-drill-child="${esc(item.id)}">${esc(item.name)}<span>→</span></button>`).join('')}</div>` : '';
    root.innerHTML = `${heading}<div class="drill-page">
      <div class="drill-toolbar">
        <button type="button" class="btn" id="drillBack">← ${backTarget ? '返回' + esc(typeLabel(backTarget)) : '返回我的首页'}</button>
        <span class="drill-path">${drillBreadcrumb().map(esc).join(' / ')}</span>
        <span class="drill-note">整页下钻视图 · 面包屑随真实组织层级变化，范围外不可达</span>
      </div>
      ${childHtml}
      <section class="kpi-grid wb-kpi-grid" data-wb-kpi-grid aria-label="当前层级五项指标"></section>
      ${analysisCard()}
      <section class="card drill-dim-card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">${drillDimLayout === 'domain' ? '分类指标分析' : '维度分析'}</h2><div class="card-subtitle">${esc(drillDimLayout === 'domain' ? '按会议要求的五类业务域分组展示当前层级图表（不平铺）' : ('按' + (leaf ? '用水性质、水表类型、口径、行业与行政区拆分当前范围售水量' : childTypeLabel() + '横评，并按用水性质、水表类型、口径、行业与行政区拆分') + (registeredDims.length ? '；注册数另有抄表到户口径' : '') + (drillDimensionView === 'ring' ? '　当前为构成占比视图' : '')))}</div></div><div class="card-head-actions"><span class="ac-label">视图</span><div class="segmented" id="drillDimLayout" aria-label="维度视图方式"><button type="button" data-dim-layout="dimension" class="${drillDimLayout === 'dimension' ? 'active' : ''}">按维度</button><button type="button" data-dim-layout="domain" class="${drillDimLayout === 'domain' ? 'active' : ''}">按业务分类</button></div>${drillDimLayout === 'dimension' ? '<span class="ac-label">图形</span><div class="segmented" id="drillDimViews" aria-label="维度图形"><button type="button" data-dim-view="bar" class="' + (drillDimensionView === 'bar' ? 'active' : '') + '">柱图</button><button type="button" data-dim-view="ring" class="' + (drillDimensionView === 'ring' ? 'active' : '') + '">环形占比</button></div>' : ''}</div></div>
        ${drillDimLayout === 'domain'
          ? `<div class="domain-view">${DOMAIN_GROUPS.map(([group, items]) => `<div class="domain-block"><div class="domain-head"><span class="domain-dot"></span><h3>${esc(group)}</h3><span class="muted">${items.length} 张图</span></div><div class="chart-grid domain-grid">${items.map(([kind, title]) => chartCard(domainDefinition(kind, title))).join('')}</div></div>`).join('')}</div>`
          : `<div class="chart-grid drill-dim-grid">${dimensionDefs.map(def => chartCard(def)).join('')}</div>`}
        ${drillDimLayout === 'dimension' && analysisMetric === 'registered_count' ? `<div class="notice" style="margin:0 16px 14px">抄表到户口径按需求 S08-019 / NEW-1-08：非居民数量＝非居民＋特行＋居民非阶梯（除居民总表）；抄表到户＝居民阶梯＋考核表；未抄表到户＝二次加压表后非注册用户（人工添加）。样例缺“考核表/居民总表/二次加压表”字段，故考核表暂并入居民阶梯、未抄表到户显示缺数而非0。${risk('L2','抄表到户三类口径缺考核表与二次加压数据，未抄表到户待接入')}</div>` : ''}</section>
      <section class="card drill-special"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">专项分析</h2><div class="card-subtitle">${lossApplicable() ? '用户结构、大用户、单价与收费率、产销差填报' : '用户结构、大用户、单价与收费率（所及以下不展示产销差率）'}</div></div><div class="card-head-actions"><div class="tabs" role="tablist" aria-label="专项分析">${specialTabs().map(([key, label]) => `<button type="button" role="tab" data-special-tab="${key}" class="${key === specialTab ? 'active' : ''}">${label}</button>`).join('')}</div></div></div><div id="drillSpecialBody" class="card-body"></div></section>
    </div>`;
    updateCards();
    registerAnalysis();
    document.getElementById('drillBack')?.addEventListener('click', () => {
      if (backTarget) { navigate('drill', { orgNodeId: backTarget.id }); return; }
      WB.state.orgNodeId = '';
      navigate('home', { orgNodeId: '' });
    });
    root.querySelectorAll('[data-drill-child]').forEach(button => button.addEventListener('click', () => drillNode(button.dataset.drillChild)));
    renderSpecial();
    if (drillDimLayout === 'domain') {
      DOMAIN_GROUPS.forEach(([, items]) => items.forEach(([kind, title]) => {
        const def = domainDefinition(kind, title);
        const el = document.getElementById(def.id);
        if (el) E.registerChartLazy(def.id, el, scopedDef(def));
      }));
    } else {
      dimensionDefs.forEach(def => {
        const el = document.getElementById(def.id);
        if (el) E.registerChartLazy(def.id, el, scopedDef(def));
      });
    }
    root.querySelectorAll('[data-dim-view]').forEach(button => button.addEventListener('click', () => {
      if (drillDimensionView === button.dataset.dimView) return;
      drillDimensionView = button.dataset.dimView;
      if (window.WBApp?.render) window.WBApp.render(false); else renderDrill();
    }));
    root.querySelectorAll('[data-dim-layout]').forEach(button => button.addEventListener('click', () => {
      if (drillDimLayout === button.dataset.dimLayout) return;
      drillDimLayout = button.dataset.dimLayout;
      if (window.WBApp?.render) window.WBApp.render(false); else renderDrill();
    }));
  }

  const api = { render: renderHome, renderHome, renderKpi, renderKPI: renderKpi, renderDrill, refresh: updateCards };
  WB.views = WB.views || {};
  WB.views.home = WB.views.home || { render: renderHome };
  WB.views.kpi = WB.views.kpi || { render: renderKpi };
  return api;
})();
