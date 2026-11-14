/* 营销一体化 V6 · 指标分析下钻 UI 层（九组 · 双整框 · 真实组织定位）。
 * 只渲染不聚合：计算全部来自 WBAnalysis（frameResult/chartOption/tableRows/buildRanking/导出）。
 * 状态走 WB.state/URL：group/item/dim/view + group2/item2/dim2/view2 + compare，可前进后退与分享。
 * 公开接口：window.WBAnalysisUI = { readState, render }。 */
(function () {
  'use strict';
  const E = window.WB.engine;
  const esc = E.esc;
  const shell = () => window.WB.shell;
  const A = () => window.WBAccess;
  const Org = () => window.WBOrg;
  const Ana = () => window.WBAnalysis;
  const App = () => window.WBApp;
  const icon = n => shell().icon(n);

  const METRIC_GROUP = { sold_vol: 'sold', registered_count: 'reg', loss_rate_pct: 'loss', avg_price_yuan: 'price', charge_rate_pct: 'charge' };
  const DIM_LABELS = { children: '下级横评', company: '经营单位', org: '组织节点', admin: '行政区', nature: '用水性质', industry: '行业', caliber: '水表口径', meterType: '水表类型', manufacturer: '水表厂家', installYear: '安装年份', team: '班组', line: '线路', community: '小区', collection: '抄表到户', wholesale: '趸售标志' };
  const FRAME_KEYS = { f1: { g: 'group', i: 'item', d: 'dim', v: 'view' }, f2: { g: 'group2', i: 'item2', d: 'dim2', v: 'view2' } };
  /* 全球筛选键：导航/hash 保留 + 排行冻结 filtersKey 共用。functional/booklet 亦是 views.matchRow 收窄键，漏带则刷新后范围变宽。 */
  const GLOBAL_KEYS = ['period', 'month', 'start', 'end', 'company', 'org', 'admin', 'nature', 'industry', 'caliberMm', 'caliber', 'meterType', 'team', 'line', 'functional', 'booklet', 'name', 'accountId', 'orgNodeId', 'metric'];
  const TOOL_RENDER = {
    user: { label: '组合查询与用户档案', run: () => window.WBBusiness.renderUser() },
    meter: { label: '表务督查工具', run: () => window.WBBusiness.renderMeter() },
    alert: { label: '数据预警工具', run: () => window.WBBusiness.renderAlert() },
    project: { label: '工程项目工具', run: () => window.WBBusiness.renderProject() },
    ar: { label: '应收账款工具', run: () => window.WBViews.renderAr() }
  };

  /* ---------- 状态读取（纯函数，URL/WB.state 归位） ---------- */
  function groups() { const a = Ana(); return a && Array.isArray(a.GROUPS) ? a.GROUPS : []; }
  function groupById(id) { return groups().find(g => g.id === id) || null; }
  function itemDims(item) { return item && Array.isArray(item.dims) && item.dims.length ? item.dims : ['children']; }
  function normFrame(s, keys, defGroup) {
    const gs = groups();
    let g = gs.find(x => x.id === s[keys.g]);
    if (!g) g = gs.find(x => x.id === defGroup) || gs[0] || null;
    const item = g ? (g.items.find(i => i.id === s[keys.i]) || g.items[0]) : null;
    const dims = itemDims(item);
    const explicitView = s[keys.v] === 'table' || s[keys.v] === 'chart';
    const defaultView = item && item.id === 'price.calc' ? 'table' : 'chart';
    return {
      group: g ? g.id : '',
      item: item ? item.id : '',
      dim: dims.indexOf(s[keys.d]) >= 0 ? s[keys.d] : dims[0],
      view: explicitView ? s[keys.v] : defaultView
    };
  }
  function readState() {
    const s = window.WB.state || {};
    /* 合法 group 优先（normFrame 首查 s.group），否则按首页 metric 映射归位；不因非空但非法的 group 强制 sold。 */
    const f1 = normFrame(s, FRAME_KEYS.f1, METRIC_GROUP[s.metric] || 'sold');
    const f2 = normFrame(s, FRAME_KEYS.f2, 'reg');
    return { f1, f2, compare: /^(1|true|yes|on)$/i.test(String(s.compare == null ? '' : s.compare)) };
  }
  let lastNoticeSig = '';
  function noticeInvalid(st) {
    const s = window.WB.state || {}; const fixes = [];
    const chk = (raw, val, label) => { if (raw != null && raw !== '' && raw !== val) fixes.push(label); };
    chk(s.group, st.f1.group, '组'); chk(s.item, st.f1.item, '项目'); chk(s.dim, st.f1.dim, '维度'); chk(s.view, st.f1.view, '视图');
    if (st.compare) { chk(s.group2, st.f2.group, '对比组'); chk(s.item2, st.f2.item, '对比项目'); chk(s.dim2, st.f2.dim, '对比维度'); chk(s.view2, st.f2.view, '对比视图'); }
    if (!fixes.length) return;
    const sig = JSON.stringify([s.group, s.item, s.dim, s.view, s.group2, s.item2, s.dim2, s.view2, fixes]);
    if (sig === lastNoticeSig) return;
    lastNoticeSig = sig;
    shell().toast('链接参数无效，已归位到可用默认（' + fixes.join('、') + '）', 'warning');
  }

  /* ---------- 组织上下文（与核心 effectiveNode 同口径；只定位不扩权） ---------- */
  function effectiveNode() {
    const org = Org(); const id = window.WB.state.orgNodeId;
    if (id && org.has(id)) return org.get(id);
    const roots = (A().current().scope && A().current().scope.roots) || [];
    if (roots.length === 1) return org.get(roots[0]);
    if (roots.length > 1) {
      let anc = org.get(roots[0]);
      while (anc && !roots.every(r => org.descendantsSet(anc.id).has(r))) anc = org.parent(anc.id);
      return anc || org.get(org.ROOT_ID);
    }
    return org.get(org.ROOT_ID);
  }
  function inScope(id) {
    if (!id) return true;
    const cur = A().current();
    if (cur.rangeStatus === 'unbound' || !cur.scope) return false;
    return cur.scope.nodeIds.has(id);
  }
  /* 帧/组织切换统一走 URL：保留全球筛选，scopeGuard 由 App.navigate 负责。 */
  function nav(patch) {
    const s = window.WB.state, st = readState(), p = {};
    GLOBAL_KEYS.forEach(k => { if (s[k] != null && s[k] !== '') p[k] = s[k]; });
    p.group = st.f1.group; p.item = st.f1.item; p.dim = st.f1.dim; p.view = st.f1.view;
    if (st.compare) { p.compare = '1'; p.group2 = st.f2.group; p.item2 = st.f2.item; p.dim2 = st.f2.dim; p.view2 = st.f2.view; }
    Object.assign(p, patch);
    Object.keys(p).forEach(k => { if (p[k] == null || p[k] === '') delete p[k]; });
    App().navigate('drill', p);
  }

  /* ---------- 渲染 ---------- */
  const calc = new Map();           // fk -> frameResult（render 计算一次，mount 复用）
  const frameCharts = new Map();    // fk -> echarts 实例（自管生命周期，不进 E.charts）
  let activeTool = null;            // {key, groupId} 同页工具视图（临时态，身份切换清空）
  const chartObservers = new Map(); // fk -> ResizeObserver（随 disposeCharts 释放）
  const chartSizes = new Map();     // fk -> 上次已应用 {width,height}，尺寸未变不重绘
  let resizeTimer = null;
  /* 多面板组合标识＝result.chart.composition（bar-share/dual-donut 在 width≥880 并排，<880 核心自动退化为单 cartesian；stock-flow 为单 grid 双轴，任意宽度同构）。 */
  function isSideBySide(result) {
    const ch = result && result.chart;
    const comp = ch && ch.composition;
    return comp === 'bar-share' || comp === 'dual-donut';
  }
  function chartHeight(width, result) {
    if (isSideBySide(result) && width >= 880) return 380;
    return width >= 520 ? 320 : 300;
  }
  function sizeChart(el, result) {
    const width = el.clientWidth || (el.parentElement && el.parentElement.clientWidth) || 0;
    const height = chartHeight(width, result);
    el.style.height = height + 'px';
    return { width, height };
  }
  /* 核心 chartOption 把宽高烘进像素坐标（grid/圆心/半径/标题）：任何实际宽高变化都要重建 option，
     不能只 resize 画布（含同 880 带内宽度变化、520/880 高度阈值）；重建一律 animation:false，避免缩放动画抖动。 */
  function syncChart(fk, el, inst, result) {
    if (frameCharts.get(fk) !== inst || el.isConnected === false) return; // 已释放/被替换实例或脱离文档：不操作
    const width = el.clientWidth || 0;
    if (!width) return; // 隐藏/不可测量：保留上次已应用尺寸，重新可见时再整体同步
    const height = chartHeight(width, result);
    const prev = chartSizes.get(fk);
    if (prev && prev.width === width && prev.height === height) return; // 无变化不重绘，亦切断自身写 height 触发的 RO 回环
    chartSizes.set(fk, { width, height });
    el.style.height = height + 'px';
    try {
      inst.resize({ width, height });
      const opt = Ana().chartOption(result, { animation: false, width, height });
      if (opt) inst.setOption(opt, true);
    } catch (_) {}
  }
  function observeChart(fk, el, inst, result) {
    const width = el.clientWidth || 0;
    chartSizes.set(fk, { width, height: chartHeight(width, result) });
    if (!window.ResizeObserver) return;
    const ro = new ResizeObserver(() => { syncChart(fk, el, inst, result); });
    ro.observe(el);
    chartObservers.set(fk, ro);
  }
  /* 无 ResizeObserver 时的兜底：window resize 防抖后逐框同步（syncChart 内部判重并重建 option）；定时器随 disposeCharts 清理。 */
  window.addEventListener('resize', () => {
    if (window.ResizeObserver) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      frameCharts.forEach((inst, fk) => {
        const el = document.getElementById('an6-chart-' + fk);
        const c = calc.get(fk);
        if (el && c) syncChart(fk, el, inst, c.result);
      });
    }, 120);
  });
  function disposeCharts() {
    clearTimeout(resizeTimer);
    resizeTimer = null;
    chartObservers.forEach(ro => { try { ro.disconnect(); } catch (_) {} });
    chartObservers.clear();
    chartSizes.clear();
    frameCharts.forEach(c => { try { c.dispose(); } catch (_) {} });
    frameCharts.clear();
  }

  function render() {
    const a = Ana();
    if (!a || !Array.isArray(a.GROUPS)) {
      return { html: '<div class="an6"><div class="notice danger">' + icon('alert') + '<span>分析引擎（WBAnalysis）尚未加载，无法渲染分析页。</span></div></div>', mount() {} };
    }
    disposeCharts();
    calc.clear();
    const st = readState();
    noticeInvalid(st);
    const cur = A().current();
    if (cur.rangeStatus === 'unbound' || !cur.scope) {
      return { html: '<div class="an6"><div class="an6-empty an6-empty-lg">' + icon('shield') + '<h3>未绑定责任范围</h3><p>当前身份没有可分析的组织范围。请在账号面板选择演示身份后重试；未绑定状态不展示任何数值。</p></div></div>', mount() {} };
    }
    const node = effectiveNode();
    let html = '<div class="an6">' + orgLocatorHtml(node, cur) + toolbarHtml(st);
    if (activeTool) html += toolHtml();
    else {
      html += '<div class="an6-frames' + (st.compare ? ' is-compare' : '') + '">' + frameHtml('f1', st.f1, false);
      if (st.compare) html += frameHtml('f2', st.f2, true);
      html += '</div>';
    }
    html += '</div>';
    return { html, mount() { mountPage(st); } };
  }

  function orgLocatorHtml(node, cur) {
    const org = Org();
    const ids = org.path(node.id), names = org.pathNames(node.id);
    const crumbs = ids.map((id, i) => {
      const last = i === ids.length - 1;
      const label = esc(names[i] || id);
      if (last) return '<span class="an6-crumb is-current" aria-current="page">' + label + '</span>';
      if (inScope(id)) return '<button type="button" class="an6-crumb" data-an6-org="' + esc(id) + '" title="定位到该祖先节点">' + label + '</button>';
      return '<span class="an6-crumb is-locked" title="超出当前责任范围，不可进入">' + icon('lock') + label + '</span>';
    }).join('<span class="an6-crumb-sep">' + icon('right') + '</span>');
    const scopeIds = [...cur.scope.nodeIds].filter(id => org.has(id));
    const nodes = scopeIds.map(id => org.get(id)).sort((x, y) => (x.depth - y.depth) || String(x.name).localeCompare(String(y.name), 'zh-CN'));
    const options = nodes.map(n => '<option value="' + esc(n.id) + '" data-an6-name="' + esc(n.name) + '"' + (n.id === node.id ? ' selected' : '') + '>' + esc(n.displayPath || n.name) + '（' + esc(n.typeLabel || n.type) + '）</option>').join('');
    const kids = org.children(node.id);
    const scopedKids = kids.filter(k => inScope(k.id));
    const chips = scopedKids.length
      ? scopedKids.map(k => '<button type="button" class="an6-chip" data-an6-org="' + esc(k.id) + '" title="' + esc(k.typeLabel || k.type) + '">' + icon('location') + esc(k.name) + '</button>').join('')
      : '<span class="an6-chip-note">' + (kids.length ? '下级组织均不在当前责任范围内。' : '无下级组织。') + '</span>';
    return '<section class="an6-org" aria-label="组织定位与共同条件">' +
      '<div class="an6-org-top">' +
        '<div class="an6-org-copy"><div class="an6-org-title"><strong>' + esc(node.name) + '</strong><span class="an6-org-type">' + esc(node.typeLabel || node.type) + '</span></div>' +
        '<nav class="an6-crumbs" aria-label="组织路径">' + crumbs + '</nav></div>' +
        '<div class="an6-org-select"><label class="an6-org-select-label" for="an6-org-node-select">切换节点</label><div class="an6-org-search"><input type="search" class="control" data-an6-org-search placeholder="按节点名称筛选" aria-label="按节点自身名称筛选切换节点候选" autocomplete="off"><button type="button" class="an6-org-clear" data-an6-org-clear aria-label="清空节点名称筛选" title="清空筛选，恢复完整节点列表">' + icon('close') + '</button></div><select id="an6-org-node-select" class="control" data-an6-org-select>' + options + '</select><p class="an6-org-search-status" data-an6-org-status role="status" aria-live="polite" hidden>' + icon('alert') + '未找到匹配的节点</p></div>' +
      '</div>' +
      '<div class="an6-org-kids"><span class="an6-kids-label">' + icon('layers') + '下级组织（' + scopedKids.length + '/' + kids.length + '）</span><div class="an6-chips">' + chips + '</div></div>' +
      '<div class="an6-shared-slot" data-an6-shared-filters></div>' +
      '</section>';
  }

  function toolbarHtml(st) {
    const S = window.WBSupplement;
    const perm = S && typeof S.fillPermission === 'function' ? S.fillPermission() : { ok: false, reason: '人工填报模块未加载' };
    const denyCopy = perm.reason && !/R[45]/.test(perm.reason) ? perm.reason : '仅分公司领导、分公司管理员可填报本绑定单位';
    const fillBtn = perm.ok
      ? '<button type="button" class="btn an6-btn-fill" data-an6-fill>' + icon('edit') + '手动填报</button>'
      : '<button type="button" class="btn" disabled title="' + esc(denyCopy) + '">' + icon('lock') + '手动填报（只读）</button>';
    const fillHint = perm.ok ? '' : '<span class="an6-fill-hint">' + icon('info') + '当前身份只读：仅分公司领导、分公司管理员可填报本绑定单位。</span>';
    return '<div class="an6-toolbar">' +
      '<div class="an6-toolbar-left">' + fillBtn + fillHint + '</div>' +
      '<div class="an6-toolbar-right">' +
        (st.compare ? '' : '<button type="button" class="btn" data-an6-compare-add>' + icon('plus') + '添加对比框</button>') +
        '<button type="button" class="btn" data-an6-report-html title="导出完整月报 HTML">' + icon('file') + '月报 HTML</button>' +
        '<button type="button" class="btn" data-an6-report-zip title="导出月报 HTML 与数据">' + icon('download') + '月报 ZIP</button>' +
      '</div></div>';
  }

  function frameHtml(fk, fs, removable) {
    const a = Ana();
    const c = a.frameResult(fk); calc.set(fk, c);
    const g = groupById(fs.group);
    const item = c.item;
    const result = c.result;
    const keys = FRAME_KEYS[fk];
    const groupOpts = groups().map(x => '<option value="' + esc(x.id) + '"' + (x.id === fs.group ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('');
    const itemOpts = (g ? g.items : []).map(x => '<option value="' + esc(x.id) + '"' + (x.id === fs.item ? ' selected' : '') + '>' + esc(x.label) + '</option>').join('');
    const dimOpts = itemDims(item).map(d => '<option value="' + esc(d) + '"' + (d === fs.dim ? ' selected' : '') + '>' + esc(DIM_LABELS[d] || d) + '</option>').join('');
    const swapN = window.WB.state.swapN === 3 ? 3 : 2;
    const swapPeriod = item && item.type === 'swapVolume' ? '<label><span>对比周期</span><select class="control sm" data-an6-param="swapN" aria-label="换表水量对比周期"><option value="2"' + (swapN === 2 ? ' selected' : '') + '>2期</option><option value="3"' + (swapN === 3 ? ' selected' : '') + '>3期</option></select></label>' : '';
    const tool = g && g.tool && TOOL_RENDER[g.tool] ? '<button type="button" class="btn xs" data-an6-tool="' + esc(g.tool) + '" data-an6-tool-group="' + esc(g.id) + '" title="在本页打开组内工具，返回分析不丢全局筛选">' + icon('sliders') + esc(TOOL_RENDER[g.tool].label) + '</button>' : '';
    /* 源缺/空态帧导出约束：CSV 禁用并明示原因；核心 chartOption 对空态返回 null，PNG 无空态证据可导，同样禁用。正常帧不受影响。 */
    const rowCount = Array.isArray(result.rows) ? result.rows.length : 0;
    /* kind:'table' 且无有效 result.chart（同 header PNG 禁用判定）的明细项有 rows 时：本框有效视图强制 table（不改 URL/全局态），可绘图项保留用户原 view。 */
    const tableOnly = isTableOnly(result);
    const view = effectiveView(fs, result);
    const csvBlocked = !item || item.type === 'missing' || !!result.empty || !rowCount;
    const csvTitle = !item ? '分析项未注册，无法导出 CSV'
      : item.type === 'missing' ? '源缺，CSV 不可导出（缺数不按 0）'
      : result.empty ? '空态，CSV 不可导出：' + result.empty
      : !rowCount ? '当前范围暂无数据行，CSV 不可导出（缺数不按 0）'
      : '导出当前表格 CSV';
    const pngBlocked = !rowCount || !result.chart;
    const pngTitle = !rowCount ? '空态无图表，PNG 不可导出' + (result.empty ? '：' + result.empty : '')
      : !result.chart ? '当前分析项无图表，PNG 不可导出'
      : '导出当前图表 PNG';
    /* 关联明细下钻入口：仅当核心产出 detail.rows 有值时出现（computeCommunity 考核总表→直供/二次加压）。 */
    const detailBtn = (result.detail && Array.isArray(result.detail.rows) && result.detail.rows.length)
      ? '<button type="button" class="btn xs" data-an6-detail="' + fk + '" title="查看关联明细">' + icon('list') + '关联明细</button>' : '';
    const actions =
      (rankInapplicable(result) ? '' : '<button type="button" class="btn xs" data-an6-rank="' + fk + '" title="查看变化对象排行">' + icon('trend') + '变化对象</button>') +
      detailBtn +
      '<button type="button" class="btn xs" data-an6-png="' + fk + '"' + (pngBlocked ? ' disabled' : '') + ' title="' + esc(pngTitle) + '">' + icon('download') + 'PNG</button>' +
      '<button type="button" class="btn xs" data-an6-csv="' + fk + '"' + (csvBlocked ? ' disabled' : '') + ' title="' + esc(csvTitle) + '">' + icon('download') + 'CSV</button>' + tool +
      (removable ? '<button type="button" class="icon-btn an6-remove" data-an6-compare-remove aria-label="移除对比框" title="移除对比框">' + icon('close') + '</button>' : '');
    let body;
    if (result.empty) {
      body = '<div class="an6-empty">' + icon('empty') + '<p>' + esc(result.empty) + '</p></div>';
    } else if (!result.rows || !result.rows.length) {
      body = '<div class="an6-empty">' + icon('empty') + '<p>当前组织/期间/维度下暂无数据（缺数不按 0）。</p></div>';
    } else if (view === 'table') {
      body = tableHtml(result, fk);
    } else {
      body = '<div class="an6-chart" id="an6-chart-' + fk + '" data-an6-chart="' + fk + '" role="img" aria-label="' + esc(item.label) + '图表"></div>';
    }
    const note = businessNote(item, result);
    const sourceBadge = result.synthetic ? '<span class="an6-source-badge">' + icon('alert') + '数据来源：' + esc(result.sourceLabel || '原型模拟数据（非真实接入）') + '</span>' : '';
    const node = effectiveNode();
    /* 期间按 item.period 覆盖（与核心 computeTotal/computeTrend 同口径），避免全局年累计错标当月/近年数据。 */
    const periodState = item && item.period ? Object.assign({}, window.WB.state || {}, { period: item.period }) : (window.WB.state || {});
    const meta = '<div class="an6-frame-meta"><span>维度 · ' + esc(DIM_LABELS[fs.dim] || fs.dim) + '</span><span>组织 · ' + esc(node ? node.name : '未定位') + '</span><span>期间 · ' + esc(E.periodLabel(periodState)) + '</span>' + sourceBadge + '</div>';
    return '<section class="an6-frame card" data-an6-frame="' + fk + '" aria-label="分析框 ' + (fk === 'f1' ? '一' : '二') + '">' +
      '<header class="an6-frame-head">' +
        '<span class="an6-frame-badge">' + (fk === 'f1' ? '主分析框' : '对比框') + '</span>' +
        '<div class="an6-frame-selects">' +
          '<label><span>指标组</span><select class="control sm" data-an6-select="' + fk + '" data-an6-kind="g" aria-label="选择指标组">' + groupOpts + '</select></label>' +
          '<label><span>分析项</span><select class="control sm" data-an6-select="' + fk + '" data-an6-kind="i" aria-label="选择分析项">' + itemOpts + '</select></label>' +
          '<label><span>维度</span><select class="control sm" data-an6-select="' + fk + '" data-an6-kind="d" aria-label="选择分析维度">' + dimOpts + '</select></label>' + swapPeriod +
        '</div>' +
        '<div class="an6-seg" role="group" aria-label="视图切换">' +
          '<button type="button" data-an6-view="' + fk + '" data-an6-view-val="chart" aria-pressed="' + (view === 'chart') + '"' + (tableOnly ? ' disabled title="此项为明细表格，无图表"' : '') + '>' + icon('chart') + '图表</button>' +
          '<button type="button" data-an6-view="' + fk + '" data-an6-view-val="table" aria-pressed="' + (view === 'table') + '">' + icon('list') + '表格</button>' +
        '</div>' +
        '<div class="an6-frame-actions">' + actions + '</div>' +
      '</header>' +
      '<div class="an6-frame-body">' + body + note + meta + '</div>' +
      '</section>';
  }

  function tableHtml(result, fk) {
    const tr = Ana().tableRows(result);
    const headers = tr.headers || [];
    const raw = result.rows || [];
    const head = headers.map(h => '<th class="' + (h.align === 'right' ? 'is-right' : '') + '">' + esc(h.label) + '</th>').join('');
    const body = (tr.rows || []).map((row, i) => {
      const src = raw[i] || {};
      const cells = headers.map((h, ci) => {
        let v = row[h.key];
        if (ci === 0) {
          const label = v == null ? '—' : String(v);
          if (src.userId || src.accountId) {
            v = '<span class="an6-acct">' + esc(label) + (src.userId ? '<button type="button" class="an6-profile" data-an6-profile="' + esc(src.userId) + '" title="打开用户档案">' + icon('user') + '档案</button>' : '') + '</span>';
          } else v = esc(label);
        } else v = esc(v == null ? '—' : String(v));
        return '<td class="' + (h.align === 'right' ? 'is-right' : '') + '">' + v + '</td>';
      }).join('');
      const isUser = !!(src.userId || src.accountId);
      const itType = ((calc.get(fk) || {}).item || {}).type;
      const noRank = itType === 'changeRank' || itType === 'trend';
      const attrs = src.userId ? ' class="is-user" data-an6-rowprofile="' + esc(src.userId) + '" title="查看用户档案"'
        : (!isUser && !noRank && !rankInapplicable(result) && src.name != null ? ' class="is-dim" data-an6-rankrow="' + fk + '" data-an6-rowname="' + esc(String(src.name)) + '" title="查看变化对象排行"' : '');
      return '<tr data-an6-row="' + i + '"' + attrs + '>' + cells + '</tr>';
    }).join('');
    let foot = '';
    if (tr.totals) {
      const cells = headers.map(h => {
        const v = Array.isArray(tr.totals) ? tr.totals[headers.indexOf(h)] : tr.totals[h.key];
        return '<td class="' + (h.align === 'right' ? 'is-right' : '') + '">' + esc(v == null ? '' : String(v)) + '</td>';
      }).join('');
      foot = '<tfoot><tr>' + cells + '</tr></tfoot>';
    }
    return '<div class="an6-table-scroll" tabindex="0" aria-label="分析数据表（可横向滚动）"><table class="an6-table"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody>' + foot + '</table></div>';
  }

  function toolHtml() {
    const meta = TOOL_RENDER[activeTool.key];
    const g = groupById(activeTool.groupId);
    return '<section class="an6-tool card">' +
      '<header class="an6-tool-head"><div class="an6-tool-title">' + icon('sliders') + '<strong>' + esc(meta.label) + '</strong>' + (g ? '<span class="an6-tool-group">' + esc(g.name) + '</span>' : '') + '</div>' +
      '<button type="button" class="btn sm" data-an6-back>' + icon('left') + '返回分析</button></header>' +
      '<div class="an6-tool-host" id="an6ToolHost"></div></section>';
  }
  function mountTool() {
    const host = document.getElementById('an6ToolHost');
    if (!host) return;
    const meta = TOOL_RENDER[activeTool.key];
    let out;
    try { out = meta.run(); } catch (err) { host.innerHTML = '<div class="notice danger">' + icon('alert') + '<span>工具加载失败：' + esc(err.message) + '</span></div>'; return; }
    if (typeof out === 'string') out = { html: out };
    host.innerHTML = (out && out.html) || '';
    if (out && typeof out.mount === 'function') out.mount();
  }

  /* ---------- 挂载与事件（委托单订阅，随页面替换释放） ---------- */
  function mountPage(st) {
    const root = document.querySelector('.an6');
    if (!root) return;
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    mountOrgSearch(root);
    if (activeTool) { mountTool(); return; }
    initCharts(st);
  }
  function initCharts(st) {
    const list = [['f1', st.f1]];
    if (st.compare) list.push(['f2', st.f2]);
    list.forEach(([fk, fs]) => {
      const c = calc.get(fk);
      if (effectiveView(fs, c && c.result) !== 'chart') return;
      const el = document.getElementById('an6-chart-' + fk);
      if (!el || !c) return;
      /* 重建前先释放旧实例与观察器，避免重复挂载产生双实例/泄漏。 */
      const old = frameCharts.get(fk);
      if (old) { try { old.dispose(); } catch (_) {} frameCharts.delete(fk); }
      const oldRo = chartObservers.get(fk);
      if (oldRo) { try { oldRo.disconnect(); } catch (_) {} chartObservers.delete(fk); }
      const size = sizeChart(el, c.result);
      const opt = Ana().chartOption(c.result, { animation: true, width: size.width, height: size.height });
      if (!opt || !window.echarts) {
        el.innerHTML = '<div class="an6-chart-fallback">' + icon('chart') + '<p>图表暂不可用，可切换到表格查看。</p><button type="button" class="btn sm" data-an6-view="' + fk + '" data-an6-view-val="table">切换到表格</button></div>';
        return;
      }
      const inst = window.echarts.init(el, null, { width: size.width, height: size.height });
      inst.setOption(opt);
      inst.on('click', p => {
        if (!p) return;
        /* 重点用户双环等组合图：切片标记 chartAction:'table' → 直接开本框明细表格，不弹排行。 */
        if (p.data && p.data.chartAction === 'table') { toFrameTable(fk); return; }
        if (p.name == null || p.name === '') return;
        const cc = calc.get(fk);
        const itm = cc && cc.item;
        if (itm && itm.type === 'changeRank') {
          const row = ((cc.result && cc.result.rows) || []).find(r => r.name === p.name);
          if (row && row.userId) window.WBBusiness.openProfile(row.userId);
          else shell().toast('该图表条目没有可定位的用户档案', 'warning');
          return;
        }
        /* 原型事件/台账明细项排行不适用：柱状点击改开本框表格明细，不弹空的「不适用排行」弹窗。 */
        if (rankInapplicable(cc && cc.result)) { toFrameTable(fk); return; }
        openRanking(fk, itm && itm.type === 'trend' ? '' : String(p.name));
      });
      frameCharts.set(fk, inst);
      observeChart(fk, el, inst, c.result);
    });
  }

  /* 节点名称筛选：仅过滤本轮渲染的授权候选（按节点自身名称，不匹配父级路径），
     不 render/nav、不改 WB.state/hash/图表；每次 mount 以局部闭包捕获完整 options 与当前节点，
     页面重渲染后搜索自然复位。无匹配时禁用下拉并显示 role=status 提示，输入与清空保持可用。 */
  function mountOrgSearch(root) {
    const select = root.querySelector('[data-an6-org-select]');
    const input = root.querySelector('[data-an6-org-search]');
    const clearBtn = root.querySelector('[data-an6-org-clear]');
    const status = root.querySelector('[data-an6-org-status]');
    if (!select || !input || !clearBtn || !status) return;
    const fullOptions = Array.prototype.slice.call(select.options);
    const selectedId = select.value;
    const applyFilter = () => {
      const kw = input.value.trim().toLowerCase();
      const matched = kw ? fullOptions.filter(o => String(o.dataset.an6Name || '').toLowerCase().includes(kw)) : fullOptions;
      const keepCurrent = matched.some(o => o.value === selectedId);
      select.innerHTML = (keepCurrent ? '' : '<option value="" disabled selected>请选择节点</option>') + matched.map(o => o.outerHTML).join('');
      select.value = keepCurrent ? selectedId : '';
      select.disabled = matched.length === 0;
      status.hidden = matched.length > 0;
    };
    input.addEventListener('input', applyFilter);
    clearBtn.addEventListener('click', () => { input.value = ''; applyFilter(); input.focus(); });
  }
  function onClick(ev) {
    const t = ev.target.closest('[data-an6-org],[data-an6-compare-add],[data-an6-compare-remove],[data-an6-fill],[data-an6-report-html],[data-an6-report-zip],[data-an6-view],[data-an6-png],[data-an6-csv],[data-an6-profile],[data-an6-tool],[data-an6-back],[data-an6-rank],[data-an6-rankrow],[data-an6-rowprofile],[data-an6-detail]');
    if (!t) return;
    if (t.disabled) return;
    if (t.dataset.an6Org != null) { nav({ orgNodeId: t.dataset.an6Org }); return; }
    if (t.hasAttribute('data-an6-compare-add')) { nav({ compare: '1' }); return; }
    if (t.hasAttribute('data-an6-compare-remove')) { nav({ compare: '', group2: '', item2: '', dim2: '', view2: '' }); return; }
    if (t.hasAttribute('data-an6-fill')) { const S = window.WBSupplement; if (S && typeof S.openFillUI === 'function') S.openFillUI(); else shell().toast('人工填报模块未加载', 'err'); return; }
    if (t.hasAttribute('data-an6-report-html') || t.hasAttribute('data-an6-report-zip')) {
      const R = window.WBReportV6;
      if (!R) { shell().toast('月报模块（WBReportV6）未加载', 'err'); return; }
      (t.hasAttribute('data-an6-report-html') ? R.exportHtml : R.exportZip)();
      return;
    }
    if (t.dataset.an6View) { const fk = t.dataset.an6View; nav({ [FRAME_KEYS[fk].v]: t.dataset.an6ViewVal }); return; }
    if (t.dataset.an6Png) { Ana().exportFramePng(t.dataset.an6Png); return; }
    if (t.dataset.an6Csv) { Ana().exportFrameCsv(t.dataset.an6Csv); return; }
    if (t.dataset.an6Rank) { openRanking(t.dataset.an6Rank, ''); return; }
    if (t.dataset.an6Rankrow) { openRanking(t.dataset.an6Rankrow, t.dataset.an6Rowname || ''); return; }
    if (t.dataset.an6Detail) { openDetail(t.dataset.an6Detail); return; }
    if (t.dataset.an6Rowprofile) { window.WBBusiness.openProfile(t.dataset.an6Rowprofile); return; }
    if (t.dataset.an6Profile) { window.WBBusiness.openProfile(t.dataset.an6Profile); return; }
    if (t.dataset.an6Tool) { activeTool = { key: t.dataset.an6Tool, groupId: t.dataset.an6ToolGroup || '' }; App().render(false); return; }
    if (t.hasAttribute('data-an6-back')) { activeTool = null; App().render(false); return; }
  }
  function onChange(ev) {
    const t = ev.target;
    if (t.matches('[data-an6-org-select]')) { if (t.value) nav({ orgNodeId: t.value }); return; }
    if (t.matches('[data-an6-param="swapN"]')) {
      if (t.value !== '2' && t.value !== '3') return;
      window.WB.state.swapN = Number(t.value);
      App().render(false);
      return;
    }
    const sel = t.closest('[data-an6-select]');
    if (!sel) return;
    const fk = sel.dataset.an6Select, kind = sel.dataset.an6Kind, keys = FRAME_KEYS[fk];
    if (kind === 'g') {
      const g = groupById(sel.value); const item = g && g.items[0];
      nav({ [keys.g]: sel.value, [keys.i]: item ? item.id : '', [keys.d]: item ? itemDims(item)[0] : '' });
    } else if (kind === 'i') {
      const g = groupById(readState()[fk].group); const item = g && g.items.find(x => x.id === sel.value);
      nav({ [keys.i]: sel.value, [keys.d]: item ? itemDims(item)[0] : '' });
    } else if (kind === 'd') nav({ [keys.d]: sel.value });
  }

  /* ---------- 变化对象弹窗（80/20）：入选/排序全部委托核心 buildRanking，UI 只展示、筛 TopN、导出 ---------- */
  let ranking = null; // {fk,rowName,direction,compare,topN,root,models,frozen}
  function closeRanking() {
    if (ranking && ranking.root) { try { ranking.root.close(); } catch (_) {} }
    ranking = null;
  }
  function filtersKey() {
    const s = window.WB.state || {};
    return JSON.stringify(GLOBAL_KEYS.map(k => s[k] == null ? '' : String(s[k])));
  }
  function num(v, dec) {
    if (v == null || isNaN(v)) return '—';
    return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
  }
  /* 原型事件/台账明细项：水量80/20排行不是其明细口径（result.rankingApplicable===false）。排行入口隐藏、柱状点击改开本框表格明细，绝不弹空的「不适用排行」弹窗；名单三类 rankingApplicable=true 照常排行（后端已 cohort 限定）。 */
  function rankInapplicable(result) { return !!result && result.rankingApplicable === false; }
  function toFrameTable(fk) {
    nav({ [FRAME_KEYS[fk].v]: 'table' });
    shell().toast('已切换到本框明细表格', 'info');
  }
  /* kind:'table' 且 rows 非空且无 result.chart（同 PNG 可绘制判定）→ 有效视图 table；rows 0 或有图表不触发，保留原空态/缺数语义与用户 view。仅展示层覆盖，不写 URL/全局状态。 */
  function isTableOnly(result) {
    const n = Array.isArray(result && result.rows) ? result.rows.length : 0;
    return !!(result && result.kind === 'table' && n > 0 && !result.chart);
  }
  function effectiveView(fs, result) { return isTableOnly(result) ? 'table' : fs.view; }
  function noteBox(text, warn) {
    return '<div class="an6-note' + (warn ? ' an6-note--warn' : '') + '">' + icon(warn ? 'alert' : 'info') + '<span>' + esc(text) + '</span></div>';
  }
  function lossMissingList(result) {
    const rows = Array.isArray(result.rows) ? result.rows : [];
    const out = [];
    rows.forEach(r => {
      if (r && r.year != null && (r.monthSupply == null || r.cumSupply == null)) {
        const label = r.name || r.year;
        if (r.monthSupply == null) out.push(label + ' ' + r.year + '年当月');
        if (r.cumSupply == null) out.push(label + ' ' + r.year + '年累计');
      }
    });
    if (out.length) return out;
    const note = String(result.note || '');
    const m = note.match(/缺：([^）]*)）/) || note.match(/缺数明细：([^。]*)/);
    if (!m) return [];
    return m[1].split('；').map(s => s.split('：')[0].trim()).filter(Boolean);
  }
  /* 正常分析框只展示简短业务说明；原始 result.note 仍保留在模型/审计与导出中，不在此处展开实现细节。 */
  function businessNote(item, result) {
    if (!item || !result || result.empty) return '';
    if (item.id === 'price.calc') {
      let text = '综合单价＝水费收入÷售水量；基本水价、税后单价暂无数据。';
      const m = String(result.totalsNote || '').match(/整体综合单价\s*([0-9.,-]+)\s*→\s*([0-9.,-]+)\s*元\/m³，变动\s*([0-9.,-]+)/);
      if (m) text += ' 整体综合单价 ' + m[1] + '→' + m[2] + ' 元/m³，变动 ' + m[3] + '。';
      return noteBox(text);
    }
    const metrics = Array.isArray(item.metrics) ? item.metrics : [];
    if (metrics.indexOf('loss_rate') >= 0) {
      const note = String(result.note || '');
      if (/无独立供水口径/.test(note)) return noteBox('当前范围无独立供水口径，不计算局部产销差率。');
      const rows = Array.isArray(result.rows) ? result.rows : [];
      const missing = rows.some(r => r && (r.loss_rate == null || r.supply_vol == null || r.monthRate == null || r.cumRate == null));
      if (!missing) return '';
      const list = lossMissingList(result);
      let html = noteBox('供水量待补充，暂不计算产销差率。', true);
      if (list.length) {
        html += '<details class="an6-note-details"><summary>查看缺数期间（' + list.length + '）</summary><ul>' + list.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></details>';
      }
      return html;
    }
    if (item.id === 'reg.unreg') {
      const note = String(result.note || '');
      if (/不适用|不分摊/.test(note)) return noteBox('当前维度不适用，未注册用户数不分摊。');
      if (/不完整|缺数/.test(note)) return noteBox('未注册用户数待补充，暂不按 0 计。', true);
      return '';
    }
    if (item.id === 'charge.penalty') return noteBox('违约金数据暂未接入，不按 0 计。');
    if (item.id === 'sold.nature' || item.id === 'sold.newNature' || item.id === 'sold.closedNature') return noteBox('部分水价档或趸售标志未提供，相关数据不补 0。');
    return '';
  }
  function openRanking(fk, rowName) {
    const a = Ana();
    if (!a || typeof a.buildRanking !== 'function') { shell().toast('排行计算接口（WBAnalysis.buildRanking）尚未就绪，请稍后重试', 'err'); return; }
    closeRanking();
    const c = calc.get(fk) || a.frameResult(fk);
    if (rankInapplicable(c && c.result)) { toFrameTable(fk); return; }
    const S = window.WBSupplement;
    const fs = readState()[fk];
    ranking = {
      fk, rowName: rowName || '', direction: 'increase', compare: 'yoy', topN: 10,
      models: new Map(), root: null,
      frozen: {
        scopeVersion: E.scopeVersion(),
        manualVersion: S && typeof S.version === 'function' ? S.version() : null,
        filtersKey: filtersKey(),
        frameKey: JSON.stringify([fs.group, fs.item, fs.dim])
      }
    };
    ranking.root = shell().openModal({
      title: '变化对象 · 80/20 水量变化排行',
      subtitle: (c.item ? c.item.label : fs.item) + ' · ' + (rowName ? '对象：' + rowName : '当前组织范围全部对象'),
      icon: 'trend', size: 'lg',
      body: '<div class="an6-rank" id="an6RankBox"></div>',
      onClose() { ranking = null; }
    });
    ranking.root.el.addEventListener('click', onRankClick);
    renderRank();
  }
  function rankModel() {
    const key = ranking.direction + '|' + ranking.compare;
    if (!ranking.models.has(key)) {
      ranking.models.set(key, Ana().buildRanking(ranking.fk, { direction: ranking.direction, compare: ranking.compare, rowName: ranking.rowName || undefined }));
    }
    return ranking.models.get(key);
  }
  function rankSeg(attr, val, cur, label) {
    return '<button type="button" data-an6-rank-' + attr + '="' + val + '" aria-pressed="' + (cur === val) + '">' + label + '</button>';
  }
  function renderRank() {
    if (!ranking || !ranking.root) return;
    const box = ranking.root.el.querySelector('#an6RankBox');
    if (!box) return;
    const m = rankModel();
    const cov = m.coverage == null ? null : Math.max(0, Math.min(1, m.coverage));
    const covPct = cov == null ? '—' : (cov * 100).toFixed(1) + '%';
    const low = cov != null && cov < 0.8;
    const stats = [
      ['入选户数', m.selectedRows.length, ''],
      ['N · 可比较用户', m.N, ''],
      ['K80 · 80%水量', m.K80, ''],
      ['K20 · 20%户数', m.K20, ''],
      ['真实覆盖', covPct, 'is-cover' + (low ? ' is-low' : '')]
    ].map(([label, v, cls]) => '<div class="an6-rank-stat ' + cls + '"><b>' + esc(String(v)) + '</b><span>' + label + '</span></div>').join('');
    const coverBar = '<div class="an6-rank-cover' + (low ? ' is-low' : '') + '" role="img" aria-label="真实覆盖率 ' + covPct + '（红线为80%目标）"><i style="width:' + (cov == null ? 0 : cov * 100) + '%"></i><em></em></div>';
    const warn = low
      ? '<div class="an6-rank-warn">' + icon('alert') + '<span>真实覆盖 ' + covPct + '，不足 80%：入选户数被 20% 户数上限（K20=' + m.K20 + '）截断，K80=' + m.K80 + ' 户中其余户的变化量未进入入选集。</span></div>'
      : (cov == null ? '<div class="an6-rank-warn is-info">' + icon('info') + '<span>该方向总变化量为 0 或无可比较变化，覆盖率不适用；入选集仍按规则给出。</span></div>' : '');
    const per = arr => Array.isArray(arr) && arr.length ? (arr.length > 1 ? arr[0] + ' 至 ' + arr[arr.length - 1] : arr[0]) : '—';
    const period = '<div class="an6-rank-period"><span>本期 <b>' + esc(per(m.curPeriods)) + '</b></span><span>基期 <b>' + esc(per(m.basePeriods)) + '</b></span><span>方向总变化 <b>' + num(m.totalChange) + ' m³</b></span><span>入选变化 <b>' + num(m.selectedChange) + ' m³</b></span>' + (m.missingBase && m.missingBase.length ? '<span>缺基期 <b>' + m.missingBase.length + ' 户</b>（单列，不计入 N）</span>' : '') + '</div>';
    const shown = m.rows.slice(0, ranking.topN);
    const baseLabel = ranking.compare === 'mom' ? '上期水量(m³)' : '上年同期水量(m³)';
    const head = '<tr><th>序</th><th>户号</th><th>用户名称</th><th>所属组织</th><th class="is-right">本期水量(m³)</th><th class="is-right">' + baseLabel + '</th><th class="is-right">变化量(m³)</th><th class="is-right">变化率(%)</th><th>入选</th></tr>';
    const body = shown.map((r, i) => {
      const sel = i < m.selectedRows.length;
      const deltaCls = r.delta > 0 ? 'an6-rank-delta-up' : (r.delta < 0 ? 'an6-rank-delta-down' : '');
      const nameCell = esc(r.name) + (r.userId ? '<button type="button" class="an6-profile" data-an6-rank-profile="' + esc(r.userId) + '" title="打开用户档案（九页签）">' + icon('user') + '档案</button>' : '');
      return '<tr' + (sel ? ' class="is-selected"' : '') + '><td>' + (i + 1) + '</td><td class="an6-rank-acct">' + esc(r.accountId || '—') + '</td><td><span class="an6-acct">' + nameCell + '</span></td><td>' + esc(r.orgLabel || '—') + '</td><td class="is-right">' + num(r.current) + '</td><td class="is-right">' + num(r.previous) + '</td><td class="is-right ' + deltaCls + '">' + (r.delta > 0 ? '+' : '') + num(r.delta) + '</td><td class="is-right">' + (r.changeRate == null ? '<span title="基期为 0，变化率不可计算">基期0</span>' : (r.changeRate > 0 ? '+' : '') + num(r.changeRate, 2)) + '</td><td>' + (sel ? '<span class="an6-rank-tag">入选</span>' : '—') + '</td></tr>';
    }).join('');
    const table = m.rows.length
      ? '<div class="an6-rank-scroll" tabindex="0" aria-label="变化对象明细（可滚动）"><table class="an6-rank-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>'
      : '<div class="an6-rank-empty">' + icon('empty') + '<p>当前方向/范围/期间下没有可比较的用户明细。</p></div>';
    const exportBtn = (range, label, disabled) => '<button type="button" class="btn sm" data-an6-rank-export="' + range + '"' + (disabled ? ' disabled' : '') + '>' + icon('download') + label + '</button>';
    const html =
      '<div class="an6-rank-controls">' +
        '<div class="an6-rank-ctl"><span>方向</span><div class="an6-seg" role="group" aria-label="变化方向">' + rankSeg('dir', 'increase', ranking.direction, '增加') + rankSeg('dir', 'decrease', ranking.direction, '减少') + '</div></div>' +
        '<div class="an6-rank-ctl"><span>对比</span><div class="an6-seg" role="group" aria-label="对比口径">' + rankSeg('cmp', 'yoy', ranking.compare, '同比') + rankSeg('cmp', 'mom', ranking.compare, '环比') + '</div></div>' +
        '<div class="an6-rank-ctl"><span>显示</span><div class="an6-seg" role="group" aria-label="显示范围">' + rankSeg('top', '10', String(ranking.topN), 'Top10') + rankSeg('top', '50', String(ranking.topN), 'Top50') + '</div></div>' +
      '</div>' +
      '<div class="an6-rank-stats">' + stats + '</div>' + coverBar + warn + period + table +
      (m.note ? '<div class="an6-rank-note">' + esc(m.note) + '</div>' : '') +
      (m.synthetic ? '<div class="an6-rank-note" style="color:#9A6B15;font-weight:600">' + icon('alert') + ' 数据来源：' + esc(m.sourceLabel || '原型模拟数据（非真实接入）') + '</div>' : '') +
      '<div class="an6-rank-export"><span>CSV 导出（冻结当前身份/范围/填报版本）</span>' +
        exportBtn('selected', '入选全集（' + m.selectedRows.length + ' 户）', !m.selectedRows.length) +
        exportBtn('top', '当前 Top' + ranking.topN + '（' + shown.length + ' 户）', !shown.length) +
        exportBtn('all', '全方向明细（' + m.rows.length + ' 户）', !m.rows.length) +
      '</div>';
    box.innerHTML = html;
  }
  function onRankClick(ev) {
    const t = ev.target.closest('[data-an6-rank-dir],[data-an6-rank-cmp],[data-an6-rank-top],[data-an6-rank-export],[data-an6-rank-profile]');
    if (!t || !ranking) return;
    if (t.dataset.an6RankDir) { ranking.direction = t.dataset.an6RankDir; renderRank(); return; }
    if (t.dataset.an6RankCmp) { ranking.compare = t.dataset.an6RankCmp; renderRank(); return; }
    if (t.dataset.an6RankTop) { ranking.topN = Number(t.dataset.an6RankTop) || 10; renderRank(); return; }
    if (t.dataset.an6RankExport) { rankExport(t.dataset.an6RankExport); return; }
    if (t.dataset.an6RankProfile) { window.WBBusiness.openProfile(t.dataset.an6RankProfile); return; }
  }
  function rankExport(range) {
    if (!ranking) return;
    const m = rankModel();
    const S = window.WBSupplement;
    const fs = readState()[ranking.fk];
    const fz = ranking.frozen;
    const stale = E.scopeVersion() !== fz.scopeVersion
      || (S && typeof S.version === 'function' ? S.version() : null) !== fz.manualVersion
      || filtersKey() !== fz.filtersKey
      || JSON.stringify([fs.group, fs.item, fs.dim]) !== fz.frameKey;
    if (stale) {
      shell().toast('导出已冻结：身份/范围/筛选/填报版本已变化，请重新打开变化对象弹窗生成', 'err');
      closeRanking();
      return;
    }
    const rows = range === 'selected' ? m.selectedRows : (range === 'top' ? m.rows.slice(0, ranking.topN) : m.rows);
    if (!rows.length) { shell().toast('当前范围没有可导出的行', 'warning'); return; }
    const rangeLabel = range === 'selected' ? '入选全集' : (range === 'top' ? 'Top' + ranking.topN : '全方向明细');
    const baseLabel = ranking.compare === 'mom' ? '上期水量(m³)' : '上年同期水量(m³)';
    const sourceLabel = m.synthetic ? String(m.sourceLabel || '原型模拟数据（非真实接入）') : '';
    const headers = ['序号', '户号', '用户名称', '所属组织', '本期水量(m³)', baseLabel, '变化量(m³)', '变化率(%)', '是否入选'];
    if (sourceLabel) headers.push('数据来源');
    const data = rows.map((r, i) => {
      const row = [i + 1, r.accountId, r.name, r.orgLabel || '', r.current, r.previous, r.delta, r.changeRate == null ? '' : r.changeRate, i < m.selectedRows.length ? '是' : '否'];
      if (sourceLabel) row.push(sourceLabel);
      return row;
    });
    const extra = { kind: 'table', title: (m.title || '变化对象排行') + ' · ' + rangeLabel };
    if (sourceLabel) { extra.synthetic = true; extra.sourceLabel = sourceLabel; }
    const meta = E.bindExport(data, m.sourceRows, extra);
    E.downloadCSV('v6-rank-' + ranking.fk + '-' + ranking.direction + '-' + ranking.compare + '-' + range, headers, data, meta);
  }
  /* ---------- 关联明细下钻（computeCommunity 考核总表→直供/二次加压）：复用排行弹窗表格样式，冻结当前身份/范围/筛选，独立 CSV 导出 ---------- */
  let detail = null; // {fk,result,root,frozen}
  function closeDetail() {
    if (detail && detail.root) { try { detail.root.close(); } catch (_) {} }
    detail = null;
  }
  function openDetail(fk) {
    const a = Ana();
    closeRanking(); closeDetail();
    const c = calc.get(fk) || (a && typeof a.frameResult === 'function' ? a.frameResult(fk) : null);
    const result = c && c.result;
    const d = result && result.detail;
    if (!d || !Array.isArray(d.rows) || !d.rows.length) { shell().toast('当前分析项暂无可展开的关联明细', 'warning'); return; }
    const S = window.WBSupplement;
    const fs = readState()[fk];
    detail = {
      fk, result, root: null,
      frozen: {
        scopeVersion: E.scopeVersion(),
        manualVersion: S && typeof S.version === 'function' ? S.version() : null,
        filtersKey: filtersKey(),
        frameKey: JSON.stringify([fs.group, fs.item, fs.dim])
      }
    };
    const node = effectiveNode();
    detail.root = shell().openModal({
      title: '关联明细 · 考核总表 → 直供 / 二次加压',
      subtitle: (c.item ? c.item.label : fs.item) + ' · ' + (node ? node.name : '未定位') + ' · 冻结当前身份/范围/筛选',
      icon: 'list', size: 'lg',
      body: '<div class="an6-rank" id="an6DetailBox"></div>',
      onClose() { detail = null; }
    });
    detail.root.el.addEventListener('click', onDetailClick);
    renderDetail();
  }
  function renderDetail() {
    if (!detail || !detail.root) return;
    const box = detail.root.el.querySelector('#an6DetailBox');
    if (!box) return;
    const result = detail.result;
    const d = result.detail;
    const cols = d.columns || [];
    const rows = d.rows || [];
    const S = window.WBSupplement;
    const mv = S && typeof S.version === 'function' ? S.version() : null;
    const sourceLabel = result.synthetic ? String(result.sourceLabel || '原型模拟数据（非真实接入）') : '';
    /* 角色徽章复用 .an6-rank-tag，内联色区分考核总表/直供/二次加压（不新增 CSS 体系）。 */
    const roleStyle = { '考核总表': 'color:#1E5AA8;background:#EAF1FA;border:1px solid #C7D9F0', '直供表': 'color:#1F7A4D;background:#E9F5EE;border:1px solid #C4E3D2', '二次加压表': 'color:#9A6B15;background:#FBF3E2;border:1px solid #E8D5AC' };
    const count = lab => rows.filter(r => r.role === lab).length;
    const head = cols.map(h => '<th class="' + (h.align === 'right' ? 'is-right' : '') + '">' + esc(h.label) + (h.unit ? '（' + esc(h.unit) + '）' : '') + '</th>').join('');
    const body = rows.map(r => {
      const cells = cols.map(h => {
        const v = r[h.key];
        if (h.key === 'role') {
          const lab = v == null ? '—' : String(v);
          return '<td><span class="an6-rank-tag" style="' + (roleStyle[lab] || '') + '">' + esc(lab) + '</span></td>';
        }
        if (h.key === 'name') {
          const label = v == null ? '—' : String(v);
          if (r.userId != null) return '<td><span class="an6-acct">' + esc(label) + '<button type="button" class="an6-profile" data-an6-detail-profile="' + esc(r.userId) + '" title="打开用户档案（九页签）">' + icon('user') + '档案</button></span></td>';
          return '<td>' + esc(label) + '</td>';
        }
        if (h.align === 'right') return '<td class="is-right">' + esc(v == null ? '—' : num(v, h.dec)) + '</td>';
        return '<td>' + esc(v == null ? '—' : String(v)) + '</td>';
      }).join('');
      return '<tr>' + cells + '</tr>';
    }).join('');
    box.innerHTML =
      '<div class="an6-rank-stats">' +
        '<div class="an6-rank-stat"><b>' + rows.length + '</b><span>关联明细行</span></div>' +
        '<div class="an6-rank-stat"><b>' + count('考核总表') + '</b><span>考核总表</span></div>' +
        '<div class="an6-rank-stat"><b>' + count('直供表') + '</b><span>直供表</span></div>' +
        '<div class="an6-rank-stat"><b>' + count('二次加压表') + '</b><span>二次加压表</span></div>' +
      '</div>' +
      (sourceLabel ? '<div class="an6-rank-note" style="color:#9A6B15;font-weight:600">' + icon('alert') + ' 数据来源：' + esc(sourceLabel) + '</div>' : '') +
      '<div class="an6-rank-note">' + icon('info') + ' 筛选上下文：' + esc(E.filterLabel(window.WB.state || {})) + (mv != null ? ' · 手填版本 ' + mv : '') + '</div>' +
      '<div class="an6-rank-note">' + icon('info') + ' 本明细为当前汇总块授权关联成员的展开（考核总表 → 直供表 → 二次加压表，按小区连续展示），与汇总同口径、不重复汇总；考核总表为父级计量点，其售水量不计入成员合计，成员水量已计入小区汇总。</div>' +
      '<div class="an6-rank-scroll" tabindex="0" aria-label="关联明细（可滚动）"><table class="an6-rank-table"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<div class="an6-rank-export"><span>关联明细 CSV 导出（冻结当前身份/范围/填报版本；汇总 CSV 不受影响）</span>' +
        '<button type="button" class="btn sm" data-an6-detail-export="all">' + icon('download') + '导出关联明细CSV（' + rows.length + ' 行）</button>' +
      '</div>';
  }
  function onDetailClick(ev) {
    const t = ev.target.closest('[data-an6-detail-profile],[data-an6-detail-export]');
    if (!t || !detail) return;
    if (t.dataset.an6DetailProfile != null) {
      window.WBBusiness.openProfile(t.dataset.an6DetailProfile);
      return;
    }
    if (t.dataset.an6DetailExport) { detailExport(); return; }
  }
  function detailExport() {
    if (!detail) return;
    const result = detail.result;
    const d = result.detail;
    const S = window.WBSupplement;
    const fs = readState()[detail.fk];
    const fz = detail.frozen;
    const stale = E.scopeVersion() !== fz.scopeVersion
      || (S && typeof S.version === 'function' ? S.version() : null) !== fz.manualVersion
      || filtersKey() !== fz.filtersKey
      || JSON.stringify([fs.group, fs.item, fs.dim]) !== fz.frameKey;
    if (stale) {
      shell().toast('导出已冻结：身份/范围/筛选/填报版本已变化，请重新打开关联明细弹窗生成', 'err');
      closeDetail();
      return;
    }
    const cols = d.columns || [];
    const rows = d.rows || [];
    if (!rows.length) { shell().toast('当前范围没有可导出的关联明细行', 'warning'); return; }
    const sourceLabel = result.synthetic ? String(result.sourceLabel || '原型模拟数据（非真实接入）') : '';
    const headers = cols.map(h => h.label + (h.unit ? '(' + h.unit + ')' : ''));
    if (sourceLabel) headers.push('数据来源');
    const data = rows.map(r => {
      const row = cols.map(h => r[h.key] == null ? '' : r[h.key]);
      if (sourceLabel) row.push(sourceLabel);
      return row;
    });
    const extra = { kind: 'table', title: '关联明细 · 考核总表→直供/二次加压' };
    if (sourceLabel) { extra.synthetic = true; extra.sourceLabel = sourceLabel; }
    /* 来源行用 result.sourceRows（授权关联链接+消费事实，均 ownsRow 可授权）；result.prototypeRows 只是数量不是数组，不能作来源行。owns 守卫由 E.bindExport/exportGuard 校验。 */
    const meta = E.bindExport(data, result.sourceRows, extra);
    E.downloadCSV('v6-detail-' + detail.fk, headers, data, meta);
  }
  /* 全球筛选/状态变化 → 旧排行弹窗立即关闭（身份切换另由 WBAccess.onChange 清理） */
  document.addEventListener('wb:state-change', () => { if (ranking) closeRanking(); if (detail) closeDetail(); });
  document.addEventListener('wb:filter-change', () => { if (ranking) closeRanking(); if (detail) closeDetail(); });
  /* 离开 drill（hash 导航到他页）→ 清同页工具临时态、关排行、释放私有图表实例（E.clearCharts 不管 frameCharts）。
     原地工具页签/返回分析走 App.render(false) 不改 hash，不受此钩子影响。 */
  window.addEventListener('hashchange', () => {
    const id = (location.hash || '#/home').replace(/^#\/?/, '').split('?')[0];
    if (id !== 'drill') { activeTool = null; closeRanking(); closeDetail(); disposeCharts(); }
  });

  /* ---------- 全局联动：填报写入刷新；身份切换清临时态 ---------- */
  if (window.WBSupplement && typeof window.WBSupplement.onChange === 'function') {
    window.WBSupplement.onChange(() => { if (App() && App().current === 'drill') App().render(false); });
  }
  if (window.WBAccess && typeof window.WBAccess.onChange === 'function') {
    window.WBAccess.onChange(() => { activeTool = null; lastNoticeSig = ''; closeRanking(); closeDetail(); disposeCharts(); });
  }

  window.WBAnalysisUI = { readState, render };
})();