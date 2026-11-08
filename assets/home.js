/* 首页与KPI：所有事实、聚合、Filter、明细和导出均来自WB_DATA / WB.engine。 */
window.WBHome = (() => {
  const D = window.WB_DATA;
  const E = window.WB.engine;
  const scriptBase = document.currentScript?.src ? new URL('.', document.currentScript.src).href : 'assets/';
  const ownedCharts = new Set(['C-HOME-01', 'C-HOME-02', 'C-HOME-03', 'C-KPI-01', 'C-KPI-02', 'C-KPI-03', 'C-KPI-04', 'C-KPI-05']);
  const metricMeta = {
    sold_vol: { label: '售水量', unit: '万m³', decimals: 2, chart: 'C-KPI-02' },
    registered_count: { label: '注册用户数', unit: '户', decimals: 0, chart: 'C-KPI-05' },
    loss_rate_pct: { label: '产销差率', unit: '%', decimals: 2, chart: 'C-KPI-01' },
    avg_price_yuan: { label: '售水均价', unit: '元/m³', decimals: 3, chart: 'C-KPI-04' },
    charge_rate_pct: { label: '收费率', unit: '%', decimals: 2, chart: 'C-KPI-03' }
  };
  let mapPromise;
  let analysisMetric = 'sold_vol';
  let analysisView = 'cumulative';
  let drillAnalysisDimension = 'company';
  let drillDimensionView = 'bar';
  let drillDimLayout = 'dimension';
  let compareMode = 'compare';
  let subscribed = false;

  const esc = value => E?.esc ? E.esc(value) : String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (value, digits = 0) => E?.fmt ? E.fmt(value, digits) : (value == null || !Number.isFinite(+value) ? '—' : (+value).toFixed(digits));
  const wan = value => value == null || !Number.isFinite(+value) ? null : +value / 10000;
  const risk = (level, tip) => `<span class="v4-risk" data-tip="${esc(tip)}" title="${esc(tip)}">⚠ ${esc(level)}</span>`;
  const page = () => document.getElementById('page') || document.getElementById('main');
  const filters = () => ({ ...(WB.state || {}), ...(WB.shell?.currentFilters ? WB.shell.currentFilters() : {}) });

  function aggregate(f = filters()) {
    if (!E?.filterFacts || !E?.aggregate) return { count: 0 };
    const rows = E.filterFacts(f);
    return E.aggregate(E.applyLayer ? E.applyLayer(rows, f) : rows, f);
  }

  function groupRows(ctx, metric) {
    const dimension = ctx.state?.dimension || 'company';
    if (!E?.group) return [];
    // 当前workbench引擎：group(rows,key,filters)。同时兼容契约中的group(metric,dimension,filters)。
    if (E.charts instanceof Map && E.dimensionOptions) return E.group(ctx.data, dimension, ctx.filters) || [];
    const result = E.group(metric, dimension, ctx.filters);
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.rows)) return result.rows;
    if (result && typeof result === 'object') return Object.entries(result).map(([name, value]) => ({ name, ...(value || {}) }));
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
    const previousData = E.filterFacts(previousFilters);
    const previous = new Map(groupRows({ ...ctx, filters: previousFilters, data: previousData }, metric).map(row => [row.name, row]));
    return groupRows(ctx, metric).map(row => ({ ...row, previous_value: previous.get(row.name)?.count ? previous.get(row.name)[metric] ?? null : null }));
  }

  function trendRows(ctx) {
    const granularity = ctx.state?.granularity || 'month';
    if (!E?.trend) return [];
    if (E.charts instanceof Map && E.dimensionOptions) return E.trend(ctx.data, ctx.filters, granularity) || [];
    const result = E.trend({ data: ctx.data, filters: ctx.filters, granularity, metric: 'sold_vol' });
    return Array.isArray(result) ? result : (result?.rows || []);
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
    const chips = [periodText(f), f.caliber || '业务账期', f.company || '四家经营单位'];
    if (f.admin) chips.push(D.adminRegions.find(item => item.code === f.admin)?.name || f.admin);
    if (f.functional) chips.push(D.functionalZones.find(item => item.code === f.functional)?.short || f.functional);
    if (f.nature) chips.push(f.nature);
    if (f.org) chips.push(f.org);
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

  function effectivePlan(t, f) {
    const A = window.WB_ADMIN;
    if (!A) return t.plan_vol;
    if (f.company) return A.planOf(f.company, t.plan_vol);
    const groups = E.group ? E.group(E.filterFacts(f), 'company', f) : [];
    if (!groups.length || !groups.some(row => A.hasPlan(row.name))) return t.plan_vol;
    return groups.reduce((sum, row) => sum + (A.planOf(row.name, row.plan_vol) || 0), 0);
  }
  function planCompletion(t, f) {
    const plan = effectivePlan(t, f);
    if (!plan || t.sold_vol == null) return null;
    return t.sold_vol / plan * 100;
  }
  function kpiCards(t, f) {
    const hasData = !!t.count;
    const previous = aggregate(priorYearFilters(f));
    const yoy = t.yoy_growth_pct == null ? '—' : `${t.yoy_growth_pct > 0 ? '+' : ''}${fmt(t.yoy_growth_pct, 2)}%`;
    const items = [
      { key: 'sold_vol', icon: 'water', tone: 'blue', value: wan(t.sold_vol), unit: '万m³', digits: 2, left: '计划完成', leftValue: `${fmt(planCompletion(t, f), 2)}%`, right: '同比', rightValue: yoy, toneValue: t.yoy_growth_pct > 0 ? 'up' : t.yoy_growth_pct < 0 ? 'down' : '' },
      { key: 'registered_count', icon: 'users', tone: 'cyan', value: t.registered_count, unit: '户', digits: 0, left: '本期新增', leftValue: `${fmt(t.new_count, 0)} 户`, right: '上年同期末', rightValue: `${fmt(previous.count ? previous.registered_count : null, 0)} 户` },
      { key: 'loss_rate_pct', icon: 'flow', tone: 'orange', value: t.loss_rate_pct, unit: '%', digits: 2, left: '供水量', leftValue: `${fmt(wan(t.supply_vol), 2)} 万m³`, right: '供售差', rightValue: `${fmt(wan(t.supply_vol == null || t.sold_vol == null ? null : t.supply_vol - t.sold_vol), 2)} 万m³` },
      { key: 'avg_price_yuan', icon: 'meter', tone: 'purple', value: t.avg_price_yuan, unit: '元/m³', digits: 3, left: '售水收入', leftValue: `${fmt(wan(t.water_revenue), 2)} 万元`, right: '上年同期均价', rightValue: `${fmt(previous.count ? previous.avg_price_yuan : null, 3)} 元/m³` },
      { key: 'charge_rate_pct', icon: 'wallet', tone: 'green', value: t.charge_rate_pct, unit: '%', digits: 2, left: '应收水费', leftValue: `${fmt(wan(t.receivable_principal), 2)} 万元`, right: '实收水费', rightValue: `${fmt(wan(t.received_principal), 2)} 万元` }
    ];
    const A = window.WB_ADMIN;
    const visible = A ? A.metrics() : items.map(item => item.key);
    let availableItems = items.filter(item => visible.includes(item.key));
    if (lowerOrg(f)) availableItems = availableItems.filter(item => item.key !== 'loss_rate_pct');
    if (!availableItems.length) availableItems = items.slice(0, 1);
    const displayItems = hasData ? availableItems : availableItems.map(item => ({ ...item, value: null, leftValue: '—', rightValue: '—' }));
    return displayItems.map(item => {
      const meta = metricMeta[item.key];
      return `<button type="button" class="kpi-card wb-kpi-button wb-tone-${item.tone}" data-drill-metric="${item.key}" aria-label="进入${meta.label}指标分析">
        <div class="wb-kpi-top"><span class="wb-kpi-icon">${icon(item.icon)}</span><div class="wb-kpi-heading"><span class="wb-kpi-label">${meta.label}</span><span class="wb-kpi-period">${item.key === 'registered_count' ? '期末存量' : esc(f.period || '当前期间')}</span></div><span class="wb-kpi-arrow">${icon('chevronRight')}</span></div>
        <div class="wb-kpi-value-row"><strong class="wb-kpi-value numeric">${fmt(item.value, item.digits)}</strong><span class="wb-kpi-unit">${item.unit}</span></div>
        <div class="wb-kpi-comparisons"><span><small>${item.left}</small><strong>${esc(item.leftValue)}</strong></span><span><small>${item.right}</small><strong class="${item.toneValue || ''}">${esc(item.rightValue)}</strong></span></div>
        <div class="wb-kpi-card-footer"><span>进入指标分析</span><span>查看明细与对比</span></div>
        ${item.key === 'sold_vol' ? `<span class="wb-kpi-edit" role="button" tabindex="0" data-plan-entry="1" aria-label="手工填报计划值" title="手工填报计划值（演示）">✎</span>` : ''}
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
          if (window.WBApp?.current !== 'drill') { navigate('drill', { metric, company: '', org: '', admin: '' }); return; }
          const params = { metric };
          if (WB.state.company) params.company = WB.state.company;
          if (WB.state.org) params.org = WB.state.org;
          if (WB.state.team) params.team = WB.state.team;
          if (WB.state.line) params.line = WB.state.line;
          if (WB.state.admin) params.admin = WB.state.admin;
          navigate('drill', params);
        });
      });
    });
    document.querySelectorAll('[data-wb-filter-label]').forEach(el => { el.textContent = E?.filterLabel ? E.filterLabel(f) : ''; });
    document.querySelectorAll('[data-loss-section], [data-loss-nav]').forEach(el => { el.style.display = lowerOrg(f) ? 'none' : ''; });
    updateCompanyMap();
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

  function mapDrill(item) {
    const params = { metric: item.metric, admin: '', functional: '' };
    params[item.type] = item.code;
    navigate('home', params);
  }

  function renderRegionRanking(rows, metricKey) {
    const target = document.getElementById('wbRegionRanking');
    if (!target) return;
    const meta = WBMap.metrics[metricKey] || WBMap.metrics.sold_vol;
    const title = document.getElementById('wbRegionRankingTitle');
    if (title) title.textContent = `${meta.label}区域对比`;
    const subtitle = document.getElementById('wbRegionRankingMeta');
    if (subtitle) subtitle.textContent = `${WBMap.getState().view === 'main' ? '主城区聚焦' : '市域12区县'} · ${meta.displayUnit} · 点击下钻`;
    const sorted = [...rows].sort((a, b) => (b.displayValue ?? -Infinity) - (a.displayValue ?? -Infinity));
    const max = Math.max(1, ...sorted.map(row => row.displayValue || 0));
    let rank = 0;
    target.innerHTML = sorted.map(row => {
      const gray = !row.count || row.displayValue == null;
      if (!gray && row.displayValue != null) rank += 1;
      return `<button type="button" class="wb-region-row ${gray ? 'is-gray' : ''}" data-region-drill="${row.code}" ${!row.count ? 'disabled' : ''}>
        <span class="wb-region-rank">${gray || row.displayValue == null ? '—' : String(rank).padStart(2, '0')}</span>
        <span class="wb-region-copy"><span class="wb-region-name">${esc(row.name)}</span><span class="wb-region-status">${esc(WBMap.statusLabel(row.status))}</span>${!gray && row.displayValue >= 0 ? `<progress max="${max}" value="${row.displayValue}" aria-label="${esc(row.name)}${esc(meta.label)}"></progress>` : ''}</span>
        <strong class="wb-region-value numeric">${row.count && row.displayValue != null ? `${fmt(row.displayValue, meta.displayDecimals)}<small>${esc(meta.displayUnit)}</small>` : '缺数'}</strong>
      </button>`;
    }).join('');
    target.querySelectorAll('[data-region-drill]').forEach(button => button.addEventListener('click', () => {
      const row = rows.find(item => item.code === button.dataset.regionDrill);
      if (row?.count) mapDrill({ type: 'admin', code: row.code, name: row.name, metric: metricKey });
    }));
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

  function companyLayout() {
    return [
      { name: '高新供水', left: 3, top: 26, width: 22, height: 13 },
      { name: '营业中心', left: 27, top: 25, width: 27, height: 15 },
      { name: '东区水务', left: 50, top: 24, width: 18, height: 12 },
      { name: '航空港区水务', left: 48, top: 41, width: 24, height: 14 },
      { name: '上街水务', left: 3, top: 42, width: 16, height: 13, planned: true },
      { name: '中牟水务', left: 72, top: 40, width: 10, height: 13, planned: true }
    ];
  }

  function companyTotals(name) {
    const f = { ...filters(), company: name };
    if (!E?.filterFacts || !E?.aggregate) return { count: 0 };
    const rows = E.filterFacts(f);
    return E.aggregate(E.applyLayer ? E.applyLayer(rows, f) : rows, f);
  }

  function heroScopeBar() {
    const company = WB.state.company || '';
    const adminRow = WB.state.admin ? (D.adminRegions || []).find(row => row.code === WB.state.admin) : null;
    const scope = company || (adminRow ? adminRow.name : '');
    return `<div class="home-scope-bar">${scope
      ? `当前范围：<strong>${esc(scope)}</strong><button type="button" id="homeScopeBack">← 返回集团总览</button>`
      : '当前范围：集团 · 全部经营单位（点击地图分区或排行下钻）'}<button type="button" id="homeSheetToggle" class="sheet-toggle">展开分析</button></div>`;
  }

  function homeHeroHtml() {
    const metricOptions = [['sold_vol', '售水量'], ['registered_count', '注册用户数'], ['avg_price_yuan', '售水均价'], ['charge_rate_pct', '收费率']]
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
        <label>指标显示<button type="button" class="btn xs" id="homeMetricToggle" aria-expanded="false">5 项</button></label>
        <label>经营单位<select id="homeCompanySelect" class="control compact" aria-label="经营单位"><option value="">全部</option>${(D.companies || []).map(item => `<option value="${esc(item.name)}" ${WB.state.company === item.name ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label>
        <label>口径<select id="homeCaliber" class="control compact" aria-label="时间口径">${['业务账期','财务自然月'].map(value => `<option value="${value}" ${WB.state.caliber === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
        <span class="hmt-sep"></span>
        <span>地图视角</span>
        <div class="segmented" id="homeMapViews" aria-label="地图视角">
          <button type="button" data-home-view="company" class="active">分公司</button>
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
        <span class="hmt-note">光晕＝方向性示意，不表示精确管辖边界</span>
      </div>
      <div class="home-kpi-overlay"><div class="kpi-grid wb-kpi-grid" data-wb-kpi-grid aria-label="集团五项经营指标"></div></div>
      <aside class="home-rank-panel" aria-label="分公司排行">
        <div class="rh"><span id="homeRankTitle">分公司排行</span><span id="homeRankMetricText" class="rank-metric-text" hidden></span><select id="homeRankMetric" class="control compact" aria-label="排行指标"><option value="sold_vol">售水量</option><option value="registered_count">注册用户数</option><option value="charge_rate_pct">收费率</option><option value="avg_price_yuan">售水均价</option><option value="loss_rate_pct">产销差率</option></select></div>
        <div id="homeCompanyRank"></div>
      </aside>
      <div class="home-drill-hint">点击分公司光晕进入该层级指标详情页（整页下钻）；hover 可预览五项指标</div>
    </div>`;
  }

  function renderCompanyBlocks() {
    const wrap = document.getElementById('homeCompanyBlocks');
    if (!wrap) return;
    const selected = WB.state.company || '';
    wrap.innerHTML = companyLayout().map(item => {
      const planned = !!item.planned;
      const totals = planned ? null : companyTotals(item.name);
      const classes = ['home-company', planned ? 'is-planned' : '', selected && selected === item.name ? 'is-active' : '', selected && selected !== item.name && !planned ? 'is-dimmed' : ''].filter(Boolean).join(' ');
      const metrics = planned ? '规划并入 · 示意' : `售水 ${fmt(wan(totals.sold_vol), 1)} 万m³ · 收费率 ${totals.charge_rate_pct == null ? '待核' : fmt(totals.charge_rate_pct, 2) + '%'}`;
      return `<button type="button" class="${classes}" style="left:${item.left}%;top:${item.top}%;width:${item.width}%;height:${item.height}%" data-company="${esc(item.name)}" ${planned ? 'data-planned="1" disabled' : ''}>
        <span class="hc-name">${esc(item.name)}</span><span class="hc-metrics">${esc(metrics)}</span>
      </button>`;
    }).join('');
    wrap.querySelectorAll('[data-company]').forEach(button => {
      if (button.dataset.planned) return;
      button.addEventListener('mouseenter', () => showCompanyTip(button));
      button.addEventListener('focus', () => showCompanyTip(button));
      button.addEventListener('mouseleave', hideCompanyTip);
      button.addEventListener('blur', hideCompanyTip);
      button.addEventListener('click', () => drillCompany(button.dataset.company));
    });
  }

  function showCompanyTip(button) {
    const tip = document.getElementById('homeMapTip');
    const canvas = document.getElementById('homeMapCanvas');
    if (!tip || !canvas) return;
    const totals = companyTotals(button.dataset.company);
    tip.innerHTML = `<div class="t-name">${esc(button.dataset.company)}<span>点击下钻 →</span></div>
      <div class="t-row">售水量 <b>${fmt(wan(totals.sold_vol), 1)} 万m³</b></div>
      <div class="t-row">收费率 <b>${fmt(totals.charge_rate_pct, 2)}%</b></div>
      <div class="t-row">产销差率 <b>${totals.loss_rate_pct == null ? '待核' : fmt(totals.loss_rate_pct, 2) + '%'}</b></div>
      <div class="t-row">售水均价 <b>${fmt(totals.avg_price_yuan, 3)} 元/m³</b></div>
      <div class="t-row">注册用户 <b>${fmt(totals.registered_count, 0)} 户</b></div>
      <div class="t-tip">hover 显示五指标；点击同页下钻到该分公司</div>`;
    tip.hidden = false;
    const cr = canvas.getBoundingClientRect(), br = button.getBoundingClientRect();
    let left = br.left - cr.left + br.width + 10;
    if (left + 246 > cr.width) left = Math.max(8, br.left - cr.left - 246);
    const top = Math.max(8, Math.min(cr.height - 200, br.top - cr.top));
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }

  function hideCompanyTip() { const tip = document.getElementById('homeMapTip'); if (tip) tip.hidden = true; }

  function drillCompany(name) {
    if (!name) return;
    WB.state.company = name; WB.state.org = ''; WB.state.admin = '';
    navigate('drill', { company: name });
  }

  let companyMapInstance = null;
  let companyMapPromise = null;
  const companyColors = ['#317FC2', '#41A75E', '#F58B3C', '#8E6FD8', '#B7732E', '#4E8DC1'];
  const companyStyle = {
    '营业中心': { color: '#317FC2', offset: [-34, 50] },
    '高新供水': { color: '#41A75E', offset: [-170, -36] },
    '航空港区水务': { color: '#F58B3C', offset: [28, 8] },
    '东区水务': { color: '#8E6FD8', offset: [52, 46] }
  };
  const styleOf = name => companyStyle[name] || { color: companyColors[0], offset: [26, 0] };
  function ensureCompanyMap() {
    if (companyMapInstance && !companyMapInstance.getDom().isConnected) { try { companyMapInstance.dispose(); } catch (error) {} companyMapInstance = null; companyMapPromise = null; }
    if (companyMapInstance) return Promise.resolve(companyMapInstance);
    if (companyMapPromise) return companyMapPromise.then(instance => {
      if (instance && !instance.getDom().isConnected) { companyMapInstance = null; companyMapPromise = null; return ensureCompanyMap(); }
      return instance;
    });
    companyMapPromise = Promise.resolve()
      .then(() => window.WB_MAP_DATA ? null : loadScript('map-data.js'))
      .then(() => {
        const el = document.getElementById('C-HOME-COMPANY');
        if (!el || !window.echarts || !window.WB_MAP_DATA) throw new Error('地图资源未就绪');
        if (!echarts.getMap('zz-company-wide')) echarts.registerMap('zz-company-wide', window.WB_MAP_DATA.admin);
        companyMapInstance = echarts.init(el, null, { renderer: 'canvas', devicePixelRatio: Math.min(window.devicePixelRatio || 1, 1.5) });
        companyMapInstance.on('georoam', () => {
          clearTimeout(companyMapInstance.__labelTimer);
          companyMapInstance.__labelTimer = setTimeout(() => { try { drawCompanyLabels(companyCenters()); } catch (error) {} }, 80);
        });
        companyMapInstance.on('click', params => {
          const company = params?.data?.company || (params?.seriesName === '分公司中心' ? params?.name : '');
          if (company) drillCompany(company);
        });
        return companyMapInstance;
      });
    return companyMapPromise;
  }
  function companyCenters() {
    const byCode = new Map((D.adminRegions || []).map(region => [region.code, region.center]));
    return (D.companies || []).map((company, index) => {
      const points = (company.regions || []).map(code => byCode.get(code)).filter(Boolean);
      if (!points.length) return null;
      const lng = points.reduce((sum, point) => sum + point[0], 0) / points.length;
      const lat = points.reduce((sum, point) => sum + point[1], 0) / points.length;
      return { name: company.name, short: company.name.replace('郑州', '').replace('水务', '').replace('有限责任公司', '').replace('有限公司', ''), lng, lat, color: companyColors[index % companyColors.length], index };
    }).filter(Boolean);
  }
  function haloSeries(centers) {
    return centers.map(center => {
      const color = styleOf(center.name).color;
      const totals = companyTotals(center.name);
      return {
        name: center.name, type: 'scatter', coordinateSystem: 'geo', z: 5, symbolSize: 320,
        data: [{ name: center.name, value: [center.lng, center.lat], company: center.name, totals }],
        itemStyle: { color: { type: 'radial', x: 0.5, y: 0.5, r: 0.5, colorStops: [
          { offset: 0, color: hexA(color, 0.62) }, { offset: 0.35, color: hexA(color, 0.38) },
          { offset: 0.72, color: hexA(color, 0.13) }, { offset: 1, color: hexA(color, 0) }
        ] } },
        label: { show: false }, tooltip: { show: false }, silent: true,
        emphasis: { disabled: true, itemStyle: { color: { type: 'radial', x: 0.5, y: 0.5, r: 0.5, colorStops: [
          { offset: 0, color: hexA(color, 0.68) }, { offset: 0.4, color: hexA(color, 0.4) }, { offset: 1, color: hexA(color, 0) }
        ] } } }
      };
    });
  }
  function hexA(hex, alpha) {
    const value = parseInt(String(hex).replace('#', ''), 16);
    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
  }
  function companyCenterPoint(centers) {
    if (!centers || !centers.length) return undefined;
    const lng = centers.reduce((sum, center) => sum + center.lng, 0) / centers.length;
    const lat = centers.reduce((sum, center) => sum + center.lat, 0) / centers.length;
    return [lng, lat];
  }
  function renderCompanyMap() {
    if (!companyMapInstance) return;
    const centers = companyCenters();

    const hits = centers.map(center => ({
      name: '分公司命中区', type: 'scatter', coordinateSystem: 'geo', z: 9, symbolSize: 46,
      data: [{ name: center.name, value: [center.lng, center.lat], company: center.name }],
      itemStyle: { color: 'rgba(0,0,0,0)', borderWidth: 0 },
      label: { show: false }, tooltip: { show: true }, silent: false,
      emphasis: { disabled: true }
    }));
    const cores = centers.map((center, index) => {
      const style = styleOf(center.name);
      const color = style.color;
      return {
        name: '分公司中心', type: 'effectScatter', coordinateSystem: 'geo', z: 8, symbolSize: 14,
        showEffectOn: 'emphasis', rippleEffect: { brushType: 'stroke', scale: 5, period: 4, color: hexA(color, 0.35) },
        data: [{ name: center.name, value: [center.lng, center.lat], company: center.name }],
        itemStyle: { color: '#fff', borderColor: color, borderWidth: 3, shadowBlur: 14, shadowColor: hexA(color, 0.45) },
        label: { show: false },
        tooltip: { show: false }
      };
    });
    companyMapInstance.setOption({
      backgroundColor: 'transparent',
      geo: { map: 'zz-company-wide', roam: false, zoom: companyMapZoom, center: companyCenterPoint(centers), layoutCenter: ['50%', '50%'], layoutSize: '100%',
        itemStyle: { areaColor: '#E9F1F8', borderColor: '#C9DAE8', borderWidth: 1 },
        emphasis: { itemStyle: { areaColor: '#DFEAF5' }, label: { show: false } }, silent: true },
      series: [...haloSeries(centers), ...hits, ...cores],
      tooltip: { trigger: 'item', backgroundColor: 'rgba(255,255,255,.97)', borderColor: '#D7E6F4', textStyle: { color: '#1F2A37', fontSize: 12 }, extraCssText: 'box-shadow:0 16px 36px rgba(31,74,116,.20);border-radius:10px;',
        formatter: params => {
          const series = params.seriesName;
          if (series !== '分公司中心' && !centers.some(center => center.name === params.name)) return '';
          const company = params.data?.company || params.name;
          const totals = companyTotals(company);
          return `<b>${company}</b><br/>售水量：<b>${fmt(wan(totals.sold_vol), 1)} 万m³</b><br/>收费率：<b>${totals.charge_rate_pct == null ? '待核' : fmt(totals.charge_rate_pct, 2) + '%'}</b><br/>产销差率：${totals.loss_rate_pct == null ? '待核' : fmt(totals.loss_rate_pct, 2) + '%'}<br/>售水均价：<b>${fmt(totals.avg_price_yuan, 3)} 元/m³</b><br/>注册用户：<b>${fmt(totals.registered_count, 0)} 户</b><br/><span style="color:#317FC2;font-size:11px">点击进入分公司下钻页</span>`;
        } },
      animationDuration: 800
    }, true);
    requestAnimationFrame(() => drawCompanyLabels(centers));
  }
  function drawCompanyLabels(centers) {
    if (!companyMapInstance) return;
    const graphics = [];
    centers.forEach(center => {
      let pixel = null;
      try { pixel = companyMapInstance.convertToPixel({ geoIndex: 0 }, [center.lng, center.lat]); } catch (error) {}
      if (!pixel) return;
      const [x, y] = pixel;
      const [dx, dy] = styleOf(center.name).offset;
      const totals = companyTotals(center.name);
      const short = center.name.replace('郑州', '').replace('有限责任公司', '').replace('有限公司', '');
      const value = `${fmt(wan(totals.sold_vol), 1)} 万m³`;
      const width = Math.max(96, Math.min(150, short.length * 13 + 16));
      const boxX = x + dx, boxY = y + dy;
      const anchorX = dx < 0 ? boxX + width : boxX;
      graphics.push({ type: 'line', z: 9, silent: true, shape: { x1: x, y1: y, x2: anchorX, y2: boxY + 14 },
        style: { stroke: 'rgba(120,150,180,.55)', lineWidth: 1, lineDash: [3, 3] } });
      const drill = () => drillCompany(center.name);
      graphics.push({ type: 'rect', z: 10, silent: false, cursor: 'pointer', onclick: drill,
        shape: { x: boxX, y: boxY, width, height: 32, r: 6 },
        style: { fill: 'rgba(255,255,255,.94)', stroke: 'rgba(201,218,232,.95)', lineWidth: 1, shadowBlur: 10, shadowColor: 'rgba(31,74,116,.12)' } });
      graphics.push({ type: 'text', z: 11, silent: false, cursor: 'pointer', onclick: drill,
        style: { text: short, fill: '#1F2A37', fontSize: 12, fontWeight: 700, x: boxX + 8, y: boxY + 5 } });
      graphics.push({ type: 'text', z: 11, silent: false, cursor: 'pointer', onclick: drill,
        style: { text: value, fill: '#317FC2', fontSize: 11, fontWeight: 600, x: boxX + 8, y: boxY + 19 } });
    });
    companyMapInstance.setOption({ graphic: graphics });
  }
  function updateCompanyMap() {
    if (homeMapView !== 'company') return;
    if (!companyMapInstance) { ensureCompanyMap().then(renderCompanyMap).catch(() => {}); return; }
    renderCompanyMap();
  }

  const rankMetricMeta = {
    sold_vol: { label: '售水量', unit: '万m³', decimals: 1, kind: 'volume' },
    registered_count: { label: '注册用户数', unit: '户', decimals: 0, kind: 'plain' },
    charge_rate_pct: { label: '收费率', unit: '%', decimals: 2, kind: 'rate' },
    avg_price_yuan: { label: '售水均价', unit: '元/m³', decimals: 3, kind: 'plain' },
    loss_rate_pct: { label: '产销差率', unit: '%', decimals: 2, kind: 'rate', lowerBetter: true }
  };
  function rankValue(totals, metric) {
    if (metric === 'sold_vol') return { raw: totals.sold_vol == null ? null : totals.sold_vol / 10000, text: totals.sold_vol == null ? '缺数' : `${fmt(totals.sold_vol / 10000, 1)} 万m³` };
    if (metric === 'registered_count') return { raw: totals.registered_count, text: `${fmt(totals.registered_count, 0)} 户` };
    if (metric === 'charge_rate_pct') return { raw: totals.charge_rate_pct, text: totals.charge_rate_pct == null ? '待核' : `${fmt(totals.charge_rate_pct, 2)}%` };
    if (metric === 'avg_price_yuan') return { raw: totals.avg_price_yuan, text: totals.avg_price_yuan == null ? '待核' : `${fmt(totals.avg_price_yuan, 3)}` };
    return { raw: totals.loss_rate_pct, text: totals.loss_rate_pct == null ? '待核' : `${fmt(totals.loss_rate_pct, 2)}%` };
  }
  function renderCompanyRanking() {
    const target = document.getElementById('homeCompanyRank');
    if (!target) return;
    const metric = rankMetricMeta[homeRankMetric] ? homeRankMetric : 'sold_vol';
    const meta = rankMetricMeta[metric];
    const select = document.getElementById('homeRankMetric');
    if (select) { select.hidden = false; select.value = metric; }
    const metricText = document.getElementById('homeRankMetricText');
    if (metricText) metricText.hidden = true;
    const rows = (D.companies || []).map(item => {
      const totals = companyTotals(item.name);
      const value = rankValue(totals, metric);
      return { name: item.name, raw: value.raw, text: value.text, totals };
    });
    const valued = rows.filter(row => row.raw != null);
    valued.sort((a, b) => meta.lowerBetter ? a.raw - b.raw : b.raw - a.raw);
    const missing = rows.filter(row => row.raw == null);
    const ordered = [...valued, ...missing];
    const max = Math.max(1, ...valued.map(row => Math.abs(row.raw)));
    const selected = WB.state.company || '';
    const rankHtml = ordered.map((row, index) => {
      const isMissing = row.raw == null;
      const rank = isMissing ? '—' : index + 1;
      const width = isMissing ? 0 : Math.max(6, Math.round(Math.abs(row.raw) / max * 100));
      return `<button type="button" class="home-rank-row ${selected === row.name ? 'is-active' : ''} ${isMissing ? 'is-gray' : ''}" data-rank-company="${esc(row.name)}">
        <span class="no">${rank}</span><span class="nm">${esc(row.name)}</span>
        <span class="bar"><i style="width:${width}%"></i></span><span class="v">${esc(row.text)}</span>
      </button>`;
    }).join('');
    const hint = meta.lowerBetter ? '<div class="rank-hint">产销差率低者在前；待核数据排在最后</div>' : '';
    target.innerHTML = rankHtml + hint;
    target.querySelectorAll('[data-rank-company]').forEach(button => button.addEventListener('click', () => drillCompany(button.dataset.rankCompany)));
  }

  function renderAdminRanking(rows, metricKey) {
    const target = document.getElementById('homeCompanyRank');
    if (!target || !window.WBMap) return;
    lastAdminRows = rows || [];
    const meta = WBMap.metrics[metricKey] || WBMap.metrics.sold_vol;
    const metricSelect = document.getElementById('homeRankMetric');
    const metricText = document.getElementById('homeRankMetricText');
    if (metricSelect) metricSelect.hidden = true;
    if (metricText) { metricText.hidden = false; metricText.textContent = meta.label; }
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
    const blocks = document.getElementById('homeCompanyBlocks');
    const echarts = document.getElementById('C-HOME-01');
    const controls = document.getElementById('homeAdminControls');
    if (blocks) blocks.hidden = view !== 'company';
    if (echarts) echarts.hidden = view !== 'admin';
    if (controls) { controls.hidden = view !== 'admin'; controls.style.display = view === 'admin' ? 'flex' : 'none'; }
    document.querySelectorAll('[data-home-view]').forEach(button => button.classList.toggle('active', button.dataset.homeView === view));
    const title = document.getElementById('homeRankTitle');
    if (title) title.textContent = view === 'company' ? '分公司排行' : '区域排行';
    if (view === 'company') {
      document.getElementById('C-HOME-COMPANY')?.removeAttribute('hidden');
      renderCompanyRanking();
      ensureCompanyMap().then(renderCompanyMap).catch(() => {});
      return;
    }
    document.getElementById('C-HOME-COMPANY')?.setAttribute('hidden', '');
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

  function bindHomeControls() {
    const applyHomeQuery = () => {
      const period = document.getElementById('homePeriod')?.value || WB.state.period;
      const month = document.getElementById('homeMonth')?.value || WB.state.month;
      const start = document.getElementById('homeStart')?.value || WB.state.start;
      const company = document.getElementById('homeCompanySelect')?.value || '';
      const caliber = document.getElementById('homeCaliber')?.value || WB.state.caliber;
      if (period === '自定义') {
        if (!start || !month) { WB.shell?.toast?.('自定义时段需先选择起始与截止月份'); return; }
        if (start > month) { WB.shell?.toast?.('起始月份不能晚于截止月份'); return; }
      }
      WB.state.period = period; WB.state.month = month; WB.state.caliber = caliber; WB.state.company = company; WB.state.org = '';
      if (period === '自定义') WB.state.start = start;
      navigate('home', period === '自定义' ? { period, month, start, caliber, company } : { period, month, caliber, company });
    };
    ['homePeriod', 'homeMonth', 'homeCaliber', 'homeCompanySelect'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', applyHomeQuery);
    });
    document.getElementById('homeStart')?.addEventListener('change', applyHomeQuery);
    document.getElementById('homePeriod')?.addEventListener('change', event => {
      const wrap = document.getElementById('homeStartWrap');
      if (wrap) wrap.hidden = event.target.value !== '自定义';
    });
    // 5 指标显示开关
    document.getElementById('homeMetricToggle')?.addEventListener('click', () => {
      const A = window.WB_ADMIN; if (!A) return;
      const body = `<div class="notice v4-tip" role="note">关闭的指标不再显示卡片与排行项；至少保留一项。</div>
        <div class="metric-switch-list">${Object.entries(metricMeta).map(([key, meta]) => `<label class="metric-switch"><input type="checkbox" data-metric-switch="${key}" ${A.metricVisible(key) ? 'checked' : ''}> <span>${esc(meta.label)}</span></label>`).join('')}</div>`;
      WB.shell?.openModal?.({title:'指标显示设置（演示）',subtitle:'仅影响本页展示，刷新还原',body,
        footer:`<button type="button" class="btn primary" data-close>完成</button>`});
      document.querySelectorAll('[data-metric-switch]').forEach(input => input.addEventListener('change', () => {
        const result = A.toggleMetric(input.dataset.metricSwitch);
        if (!result.ok) { input.checked = !input.checked; WB.shell?.toast?.(result.message || '操作未生效'); return; }
        updateCards();
      }));
    });
    // 首页 KPI 卡「✎ 计划值」：阻止下钻并打开填报
    document.querySelectorAll('[data-plan-entry]').forEach(entry => {
      const open = event => {
        event.preventDefault(); event.stopPropagation();
        const A = window.WB_ADMIN; if (!A) return;
        const company = WB.state.company || '';
        const current = company ? A.planOf(company, null) : null;
        WB.shell?.openModal?.({title:`手工填报计划值 · ${company || '全部经营单位'}`,subtitle:`口径：${A.periodKey()}　仅内存，不覆盖源数据`,
          body:`<div class="form-grid"><label class="field">经营单位<input class="control" value="${esc(company || '集团（请在系统设置中按单位填报）')}" readonly></label>
            <label class="field">期间计划(m³)<input id="homePlanInput" class="control" type="number" min="1" step="1000" value="${current == null ? '' : Math.round(current)}" placeholder="留空表示沿用样例计划"></label></div>`,
          footer:`<button type="button" class="btn" data-close>取消</button><button type="button" class="btn primary" id="homePlanSave">保存（内存）</button>`});
        document.getElementById('homePlanSave').onclick = () => {
          if (!company) return WB.shell?.toast?.('集团口径请到「系统设置 → 计划值维护」按单位填报');
          const raw = document.getElementById('homePlanInput').value.trim();
          if (!raw) { A.resetPlan(company); WB.shell?.toast?.('已沿用样例计划'); WB.shell?.closeLayers?.(); updateCards(); return; }
          const result = A.setPlan(company, +raw);
          if (!result.ok) return WB.shell?.toast?.(result.message);
          WB.shell?.closeLayers?.(); WB.shell?.toast?.('计划值已保存（仅内存）'); updateCards();
          const sub = document.getElementById('homeAnalysisSub'); if (sub) { /* 分析区同步 */ }
        };
      };
      entry.addEventListener('click', open);
      entry.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') open(event); });
    });
    document.querySelectorAll('[data-home-view]').forEach(button => button.addEventListener('click', () => switchHomeMapView(button.dataset.homeView)));
    document.getElementById('wbMapMetric')?.addEventListener('change', event => {
      WBMap?.setState({ metric: event.target.value });
      syncMapControls();
    });
    document.querySelectorAll('[data-map-view]').forEach(button => button.addEventListener('click', () => {
      WBMap?.setState({ view: button.dataset.mapView });
      syncMapControls();
    }));
    document.getElementById('homeScopeBack')?.addEventListener('click', resetHomeScope);
    document.getElementById('homeRankMetric')?.addEventListener('change', event => {
      homeRankMetric = event.target.value;
      renderCompanyRanking();
    });
    document.querySelectorAll('[data-home-render]').forEach(button => button.classList.toggle('active', button.dataset.homeRender === homeRenderMode));
    document.getElementById('homeMapCanvas')?.classList.toggle('is-3d', homeRenderMode === '3d');
    document.querySelectorAll('[data-home-render]').forEach(button => button.addEventListener('click', () => {
      homeRenderMode = button.dataset.homeRender;
      document.querySelectorAll('[data-home-render]').forEach(item => item.classList.toggle('active', item === button));
      document.getElementById('homeMapCanvas')?.classList.toggle('is-3d', homeRenderMode === '3d');
      setTimeout(() => { try { companyMapInstance?.resize(); WBMap?.resize?.(); } catch (error) {} }, 520);
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
        panel.innerHTML = `<div class="chart-grid">${E.chartCard(homeTrendDefinition())}${E.chartCard(homeCompanyDefinition())}</div>`;
        E.registerChart('C-HOME-02', document.getElementById('C-HOME-02'), homeTrendDefinition());
        E.registerChart('C-HOME-03', document.getElementById('C-HOME-03'), homeCompanyDefinition());
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

  function resetHomeScope() {
    WB.state.company = ''; WB.state.org = ''; WB.state.team = ''; WB.state.line = ''; WB.state.admin = '';
    navigate('home', {});
  }

  function homeTrendDefinition() {
    return {
      id: 'C-HOME-02', title: '售水量同期与计划趋势', dimension: 'company', dimensions: [],
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
      id: 'C-HOME-03', title: '区域售水与计划完成', dimension: 'company', dimensions: ['company', 'org', 'nature', 'industry', 'caliber', 'meterType', 'admin'],
      getOption: ctx => {
        const rows = groupRows(ctx, 'sold_vol');
        if (!rows.some(row => row.count)) return E.emptyOption();
        return baseCombo(rows, [valueAxis('万m³'), valueAxis('%', true)], [
          barSeries('售水量', rows.map(row => wan(row.sold_vol)), '#317FC2'),
          lineSeries('计划完成率', rows.map(row => row.plan_completion_pct), '#F58B3C', 1)
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
    registered_count: '期末存量对比 · 本期新增按26日至25日统计'
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
    const rows = E.filterFacts ? E.filterFacts(f) : [];
    const byYear = new Map();
    rows.forEach(row => {
      const year = String(row.period || row.billingMonth || '').slice(0, 4);
      if (!year) return;
      const entry = byYear.get(year) || { name: year, sum: 0, count: 0, samples: [] };
      const value = row[field];
      if (value != null && Number.isFinite(Number(value))) { entry.sum += Number(value); entry.samples.push(Number(value)); } 
      entry.count += 1;
      byYear.set(year, entry);
    });
    const rateFields = ['charge_rate_pct', 'loss_rate_pct', 'avg_price_yuan'];
    return [...byYear.values()].sort((a, b) => a.name.localeCompare(b.name)).map(entry => ({
      name: entry.name,
      value: rateFields.includes(field) ? (entry.samples.length ? entry.samples.reduce((s, v) => s + v, 0) / entry.samples.length : null) : entry.sum,
      count: entry.count
    }));
  }
  function yearDefinition() {
    const meta = metricMeta[analysisMetric];
    return {
      id: 'C-HOME-YEAR', title: `${meta.label}年度分析（近5年）`, dimensions: [], periodFilter: false,
      getOption: () => {
        const rows = yearRows();
        if (!rows.some(row => row.count)) return E.emptyOption('近5年无可用数据');
        const isVolume = analysisMetric === 'sold_vol';
        return baseCombo(rows, [valueAxis(isVolume ? '万m³' : meta.unit)], [barSeries(meta.label, rows.map(row => isVolume ? wan(row.value) : row.value), '#317FC2')]);
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
    const labels = orgLabels();
    const dimensionName = analysisDimensionLabel() || (dimension === 'org' ? labels.org : dimension === 'team' ? labels.team : dimension === 'line' ? labels.line : '维度');
    const prevYearFilters = priorYearFilters(f);
    const prevMonthFilters = { ...f, month: shiftMonth(f.month, -1), end: shiftMonth(f.end, -1) };
    const cur = groupRows({ data: E.filterFacts(f), filters: f, state: { dimension } }, field);
    const prevYear = new Map(groupRows({ data: E.filterFacts(prevYearFilters), filters: prevYearFilters, state: { dimension } }, field).map(row => [row.name, row]));
    const prevMonth = new Map(groupRows({ data: E.filterFacts(prevMonthFilters), filters: prevMonthFilters, state: { dimension } }, field).map(row => [row.name, row]));
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
        const plan = row.plan_vol;
        const completion = plan && row.sold_vol != null ? row.sold_vol / plan * 100 : null;
        return [...base, plan ? `${fmt(wan(plan), 1)} 万m³` : '—', completion == null ? '—' : `${fmt(completion, 1)}%`];
      }
      if (compareMode === 'yoy') return [...base, metricText(yearRow[field]), pctDiff(row[field], yearRow[field])];
      if (compareMode === 'mom') return [...base, metricText(monthRow[field]), pctDiff(row[field], monthRow[field])];
      return [...base, metricText(yearRow[field]), pctDiff(row[field], yearRow[field]), metricText(monthRow[field]), pctDiff(row[field], monthRow[field])];
    });
    return `<div class="analysis-compare"><div class="ac-head"><span>对比明细 · ${esc(compareMeta[compareMode].label)}</span><span class="ac-hint">${esc(compareMeta[compareMode].hint)}</span></div>
      <div class="table-scroll"><table class="data-table"><thead><tr>${columns.map(col => `<th>${esc(col)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(cells => `<tr>${cells.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}"><div class="empty">当前范围暂无可对比数据</div></td></tr>`}</tbody></table></div></div>`;
  }
  const dimensionLabels = { nature: '用水性质', company: '经营单位', industry: '行业', caliber: '水表口径', meterType: '水表类型', admin: '行政区' };
  function analysisDimensionLabel() {
    const labels = orgLabels();
    const dynamic = { org: labels.org.replace(' / 站点', ''), team: labels.team, line: labels.line };
    return dynamic[drillAnalysisDimension] || dimensionLabels[drillAnalysisDimension] || '维度';
  }
  function drillChartClick(params, ctx) {
    const level = drillNextLevel();
    if (!level) {
      const chartId = [...E.charts.values()].find(entry => entry.context === ctx)?.id;
      if (chartId) E.openChartRows(chartId, params);
      return;
    }
    if (!params?.name) return;
    const next = { company: WB.state.company || '' };
    if (WB.state.org) next.org = WB.state.org;
    if (WB.state.team) next.team = WB.state.team;
    if (WB.state.line) next.line = WB.state.line;
    next[level.key] = params.name;
    navigate('drill', next);
  }
  function currentAnalysisSubtitle() {
    const nextLevel = drillNextLevel();
    const dimensionLabel = analysisDimensionLabel();
    return analysisView === 'year'
      ? `近5年年度对比 · ${compareMeta[compareMode].label}`
      : `${analysisSubtitles[analysisMetric]} · ${nextLevel ? dimensionLabel + '横评' : dimensionLabel + '结构'}`;
  }
  function currentAnalysisDefinition() {
    if (analysisView === 'year') return yearDefinition();
    const meta = metricMeta[analysisMetric];
    const baseDefinition = kpiDefinitions().find(item => item.id === meta.chart) || {};
    return {
      ...baseDefinition,
      dimension: drillAnalysisDimension,
      dimensions: [drillAnalysisDimension, ...(baseDefinition.dimensions || []).filter(item => item !== drillAnalysisDimension)],
      onClick: drillChartClick
    };
  }
  function analysisCard() {
    const definition = currentAnalysisDefinition();
    const effectiveSubtitle = currentAnalysisSubtitle();
    return `<section class="card home-analysis" id="homeAnalysis">
      <div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">指标分析</h2><div class="card-subtitle" id="homeAnalysisSub">${esc(effectiveSubtitle || '')}</div></div>
        <div class="card-head-actions"><button type="button" class="btn xs" id="homeTrendToggle" aria-expanded="false">趋势对比</button><nav class="wb-analysis-nav" id="homeAnalysisNav" aria-label="切换分析指标">${Object.entries(metricMeta).map(([key, item]) => `<button type="button" data-home-metric="${key}" ${key === 'loss_rate_pct' ? 'data-loss-nav' : ''} class="${key === analysisMetric ? 'active' : ''}" aria-pressed="${key === analysisMetric}">${esc(item.label)}</button>`).join('')}</nav></div></div>
      <div class="analysis-controls">
        <span class="ac-label">分析视图</span>
        <div class="segmented" id="homeAnalysisViews" aria-label="分析视图">${Object.entries(analysisViewMeta).map(([key, item]) => `<button type="button" data-analysis-view="${key}" class="${key === analysisView ? 'active' : ''}" aria-pressed="${key === analysisView}">${item.label}</button>`).join('')}</div>
        <span class="ac-label">对比方式</span>
        <div class="segmented" id="homeCompareModes" aria-label="对比方式">${Object.entries(compareMeta).map(([key, item]) => `<button type="button" data-compare-mode="${key}" class="${key === compareMode ? 'active' : ''}" aria-pressed="${key === compareMode}">${item.label}</button>`).join('')}</div>
        <span class="ac-note">维度与粒度在图表工具条内切换</span>
      </div>
      <div class="chart-grid wb-kpi-chart-grid" id="homeAnalysisChart">${E.chartCard({ ...definition, subtitle: effectiveSubtitle, wide: true })}</div>
      ${compareTable()}
      <div class="home-trend-panel" id="homeTrendPanel" hidden></div>
    </section>`;
  }
  function registerAnalysis() {
    const definition = currentAnalysisDefinition();
    if (definition?.id && WB.chartState[definition.id]) WB.chartState[definition.id].dimension = definition.dimension;
    const target = document.getElementById(definition.id);
    if (target) E.registerChart(definition.id, target, definition);
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
    if (metric === 'loss_rate_pct' && lowerOrg(filters())) { WB.shell?.toast?.('当前层级不展示产销差率'); return; }
    const previous = metricMeta[analysisMetric].chart;
    const entry = E.charts?.get ? E.charts.get(previous) : null;
    if (entry) { try { entry.chart.dispose(); } catch (error) {} E.charts.delete(previous); }
    analysisMetric = metric; WB.state.metric = metric;
    // 下钻页的维度卡片随指标变化（注册数才有「抄表到户」维度），需整页重绘；首页只重绘分析区。
    if (window.WBApp?.current === 'drill') { if (window.WBApp?.render) window.WBApp.render(false); else renderDrill(); return; }
    const card = document.getElementById('homeAnalysis');
    if (!card) return;
    card.outerHTML = analysisCard();
    registerAnalysis();
  }

  function renderHome(initialMetric) {
    ensureStyle(); ensureSubscription();
    const requested = initialMetric || (metricMeta[WB.state.metric] ? WB.state.metric : null);
    if (requested) analysisMetric = requested;
    if (!WB.state.period || WB.state.period === '自定义') WB.state.period = analysisViewMeta[analysisView].period;
    disposeExcept(['C-HOME-01', 'C-HOME-02', 'C-HOME-03', metricMeta[analysisMetric].chart, 'C-HOME-YEAR']);
    const root = page();
    if (!root) return;
    const heading = existingHeading(root, '<section class="page-heading"><div><div class="breadcrumb"><span>首页</span></div><h1 class="page-title">首页</h1><p class="page-description">集团五指标总览 · 分公司分区地图 · 指标分析与下钻</p></div></section>');
    root.innerHTML = `${heading}<div class="wb-home-hero-wrap">
      ${homeHeroHtml()}
      <details class="wb-method-note"><summary>统计口径</summary><p>注册用户数为所选期间期末存量；新增户按上月26日至本月25日统计。同期指上年相同范围，缺少数据时显示“—”。地图为分公司/行政区示意，不代表经营覆盖范围或法定边界。</p></details>
    </div>`;
    updateCards();
    document.getElementById('wbHomeExport')?.addEventListener('click', exportGroupKpis);
    renderCompanyRanking();
    bindHomeControls();
    if (homeMapView === 'company') ensureCompanyMap().then(renderCompanyMap).catch(() => {});
    if (homeMapView === 'admin') switchHomeMapView('admin');
  }

  function syncMapControls() {
    if (!window.WBMap) return;
    const state = WBMap.getState();
    const select = document.getElementById('wbMapMetric');
    if (select) select.value = state.metric;
    document.querySelectorAll('[data-map-view]').forEach(button => button.classList.toggle('active', button.dataset.mapView === state.view));
  }

  function exportGroupKpis() {
    const f = filters();
    const t = aggregate(f);
    const rows = [
      ['售水量', t.sold_vol, 'm³', `计划完成率 ${fmt(t.plan_completion_pct, 2)}%`],
      ['注册用户数', t.registered_count, '户', '所选期间期末存量'],
      ['产销差率', lowerOrg(f) ? null : t.loss_rate_pct, '%', '同计量边界供售水量计算'],
      ['售水均价', t.avg_price_yuan, '元/m³', '售水收入/售水量'],
      ['收费率', t.charge_rate_pct, '%', '实收水费/应收水费']
    ];
    E.downloadCSV(`集团五指标_${f.month || '当前'}.csv`, ['指标', '数值', '单位', '口径/补充', 'Filter摘要'], rows.map(row => [row[0], t.count ? row[1] : null, ...row.slice(2), E.filterLabel(f)]));
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

  function lowerOrg(f) {
    if (!f.org) return false;
    if ((D.companies || []).some(company => company.name === f.org || company.full === f.org)) return false;
    return true;
  }

  function drillFromChart(params, ctx) {
    const dimension = ctx.state?.dimension || 'company';
    if (!params?.name || dimension === 'wholesale') {
      E.openChartRows(ctx.state ? Object.keys(WB.chartState).find(key => WB.chartState[key] === ctx.state) : '', params);
      return;
    }
    const keyMap = { company: 'company', admin: 'admin', org: 'org', nature: 'nature', industry: 'industry', caliber: 'caliberMm', meterType: 'meterType' };
    const stateKey = keyMap[dimension];
    if (!stateKey) return;
    let value = params.name;
    if (dimension === 'admin') value = D.adminRegions.find(item => item.name === params.name)?.code || '';
    if (!value) return;
    const chartId = [...E.charts.values()].find(entry => entry.context === ctx)?.id;
    const metric = Object.entries(metricMeta).find(([, meta]) => meta.chart === chartId)?.[0] || 'sold_vol';
    const next = { [stateKey]: value, metric };
    if (dimension === 'admin') next.functional = '';
    WB.shell?.toast?.(`已按${E.dimensionOptions[dimension] || dimension}下钻：${params.name}`);
    navigate('kpi', next);
  }

  function seriesRows(rows, specs) {
    return rows.flatMap(row => specs.map(([key, label, unit]) => [`${row.name} · ${label}`, row[key] ?? null, unit]));
  }

  function kpiDefinitions() {
    const volumeDimensions = ['company', 'org', 'nature', 'industry', 'caliber', 'meterType', 'admin'];
    return [
      {
        id: 'C-KPI-01', title: '产销差率分析', dimension: 'company', dimensions: ['company'],
        getOption: ctx => {
          if (lowerOrg(ctx.filters)) return E.emptyOption('当前层级不展示产销差率');
          const rows = comparisonRows(ctx, 'loss_rate_pct');
          if (!rows.length || !rows.some(row => row.loss_rate_pct != null)) return E.emptyOption();
          const bar = barSeries('本期产销差率', rows.map(row => row.loss_rate_pct), '#317FC2');
          bar.itemStyle = { ...bar.itemStyle, color: params => params.value < 0 ? '#D99A32' : '#317FC2' };
          bar.markLine = { silent: true, symbol: 'none', lineStyle: { color: '#9AA9B7', type: 'dashed' }, label: { formatter: '零差异', fontSize: 9 }, data: [{ yAxis: 0 }] };
          return baseCombo(rows, [valueAxis('%')], [bar, barSeries('上年同期产销差率', rows.map(row => row.previous_value), '#9BC2DF')]);
        },
        getRows: ctx => lowerOrg(ctx.filters) ? [] : seriesRows(comparisonRows(ctx, 'loss_rate_pct'), [['loss_rate_pct', '本期产销差率', '%'], ['previous_value', '上年同期产销差率', '%']]), onClick: drillFromChart
      },
      {
        id: 'C-KPI-02', title: '售水量与计划完成', dimension: 'company', dimensions: volumeDimensions,
        getOption: ctx => {
          const rows = groupRows(ctx, 'sold_vol');
          if (!rows.some(row => row.count)) return E.emptyOption();
          return baseCombo(rows, [valueAxis('万m³'), valueAxis('%', true)], [
            barSeries('本期售水量', rows.map(row => wan(row.sold_vol)), '#317FC2'),
            barSeries('同期售水量', rows.map(row => wan(row.previous_sold)), '#9BC2DF'),
            barSeries('计划售水量', rows.map(row => wan(row.plan_vol)), '#B9D9C4'),
            lineSeries('计划完成率', rows.map(row => row.plan_completion_pct), '#F58B3C', 1)
          ]);
        },
        getRows: ctx => seriesRows(groupRows(ctx, 'sold_vol'), [['sold_vol', '本期售水量', 'm³'], ['previous_sold', '同期售水量', 'm³'], ['plan_vol', '计划售水量', 'm³'], ['plan_completion_pct', '计划完成率', '%']]), onClick: drillFromChart
      },
      {
        id: 'C-KPI-03', title: '收费率与应收实收', dimension: 'company', dimensions: ['company', 'org', 'nature'],
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
        id: 'C-KPI-04', title: '售水均价与水量结构', dimension: 'nature', dimensions: ['company', 'org', 'nature'],
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
        id: 'C-KPI-05', title: '注册用户数与本期新增', dimension: 'company', dimensions: volumeDimensions,
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
    const parts = ['首页', '集团'];
    if (WB.state.company) parts.push(WB.state.company);
    if (WB.state.org) parts.push(WB.state.org);
    if (WB.state.team) parts.push(WB.state.team);
    if (WB.state.line) parts.push(WB.state.line);
    return parts;
  }
  function drillRisk() {
    return `<span class="v4-risk" data-tip="下钻层级按组织与映射口径计算；缺数不按0处理" title="下钻层级按组织与映射口径计算；缺数不按0处理">⚠ L2</span>`;
  }
  function orgLabels() {
    const company = WB.state.company || '';
    const hit = (D.companies || []).find(item => item.name === company);
    const grid = /高新/.test(company) || (hit?.units || []).some(unit => String(unit).includes('网格'));
    return grid ? { org: '网格', team: '班组', line: '册本' } : { org: '营业所 / 站点', team: '班组', line: '线路' };
  }
  function drillNextLevel() {
    const labels = orgLabels();
    if (!WB.state.company) return { key: 'company', label: '分公司' };
    if (!WB.state.org) return { key: 'org', label: labels.org };
    if (!WB.state.team) return { key: 'team', label: labels.team };
    if (!WB.state.line) return { key: 'line', label: labels.line };
    return null;
  }
  function drillChildUnits() {
    const level = drillNextLevel();
    if (!level) return [];
    const f = filters();
    const rows = groupRows({ data: E.filterFacts(f), filters: f, state: { dimension: level.key } }, 'sold_vol');
    return rows.filter(row => row.count && row.name).map(row => row.name);
  }
  // 抄表到户三类口径（需求 S08-019 / NEW-1-08）：
  // 非居民数量 = 非居民 + 特行 + 居民非阶梯（除居民总表）；抄表到户 = 居民阶梯 + 考核表；未抄表到户 = 二次加压表后非注册（人工添加）
  // 样例无「考核表 / 居民总表 / 二次加压表」字段，故：考核表并入居民阶梯暂不单列、未抄表到户取 0 并在卡片标注待接入。
  function collectionRows(f) {
    const users = scopedUsers();
    if (!users.length) return [];
    const nonRes = users.filter(user => ['非居民', '特行', '居民非阶梯'].includes(user.nature)).length;
    const metered = users.filter(user => user.nature === '居民阶梯').length;
    return [
      { name: '非居民数量', value: nonRes },
      { name: '抄表到户', value: metered },
      { name: '未抄表到户', value: 0 }
    ];
  }
  // ===== 业务分类视图（会议 MEET-12：用户管理/表务管理/抄表质量管理/账务管理/收费）=====
  function scopeMatch(f) {
    return row => (!f.company || row.company === f.company) && (!f.org || row.org === f.org)
      && (!f.team || row.team === f.team) && (!f.line || row.line === f.line);
  }
  function domainSeries(kind, f) {
    const match = scopeMatch(f);
    if (kind === 'user') {
      const users = (D.users || []).filter(match);
      const rows = (D.natures || []).map(nature => ({ name: nature, value: users.filter(u => u.nature === nature).length })).filter(r => r.value > 0);
      return { title: '注册户数按用水性质', unit: '户', rows, seriesName: '注册户数' };
    }
    if (kind === 'meter') {
      const meters = (D.meterInventory || []).filter(match);
      const byType = (D.meterTypes || ['机械表', '远传表']).map(t => ({ name: t, value: meters.filter(m => m.meterType === t).length }));
      const byCaliber = (D.calibers || []).map(c => ({ name: c, value: meters.filter(m => m.caliber === c).length })).filter(r => r.value > 0);
      return { title: '水表数量（类型 / 口径）', unit: '只', rows: [...byType, ...byCaliber], seriesName: '水表数量' };
    }
    if (kind === 'read') {
      const tasks = (D.readTasks || []).filter(match);
      const read = tasks.filter(t => t.status !== '未抄');
      const mobile = tasks.filter(t => t.method !== '远传');
      const arrived = mobile.filter(t => t.arrived === true);
      const estimated = read.filter(t => t.estimated || t.status === '估抄');
      const rate = (a, b) => (b > 0 ? +(a / b * 100).toFixed(2) : 0);
      return { title: '抄表三率（抄见 / 到位 / 估抄）', unit: '%',
        rows: [{ name: '抄见率', value: rate(read.length, tasks.length) }, { name: '到位率', value: rate(arrived.length, mobile.length) }, { name: '估抄率', value: rate(estimated.length, read.length) }],
        seriesName: '比率' };
    }
    if (kind === 'account') {
      const dim = drillNextLevel()?.key || 'nature';
      const rows = groupRows({ data: E.filterFacts(f), filters: f, state: { dimension: dim } }, 'receivable_principal');
      return { title: `应收 / 实收水费（按${analysisDimensionLabel()}）`, unit: '万元', multi: true,
        rows: rows.map(r => ({ name: r.name, receivable: wan(r.receivable_principal), received: wan(r.received_principal) })), seriesName: '水费' };
    }
    const rows = groupRows({ data: E.filterFacts(f), filters: f, state: { dimension: 'nature' } }, 'charge_rate_pct');
    return { title: '收费率与售水均价（按用水性质）', unit: '%', secondaryUnit: '元/m³', multi: true,
      rows: rows.map(r => ({ name: r.name, rate: r.charge_rate_pct, price: r.avg_price_yuan })), seriesName: '收费' };
  }
  function domainDefinition(kind, label) {
    return {
      id: `C-DOM-${kind}`, title: label, dimension: kind, dimensions: [], periodFilter: true,
      getOption: () => {
        const info = domainSeries(kind, filters());
        if (!info.rows.length) return E.emptyOption();
        if (kind === 'account') {
          return { color: ['#317FC2', '#41A75E'], tooltip: { trigger: 'axis' }, legend: { bottom: 0, textStyle: { fontSize: 10, color: '#758697' } }, grid: { left: 52, right: 18, top: 24, bottom: 46 },
            xAxis: { type: 'category', data: info.rows.map(r => r.name), axisLabel: { fontSize: 10, interval: 0, rotate: info.rows.length > 5 ? 20 : 0 } },
            yAxis: { type: 'value', name: '万元' },
            series: [{ name: '应收水费', type: 'bar', barMaxWidth: 24, data: info.rows.map(r => r.receivable), itemStyle: { color: '#317FC2', borderRadius: [4, 4, 0, 0] } },
              { name: '实收水费', type: 'bar', barMaxWidth: 24, data: info.rows.map(r => r.received), itemStyle: { color: '#41A75E', borderRadius: [4, 4, 0, 0] } }] };
        }
        if (kind === 'charge') {
          return { color: ['#8E6FD8', '#F58B3C'], tooltip: { trigger: 'axis' }, legend: { bottom: 0, textStyle: { fontSize: 10, color: '#758697' } }, grid: { left: 52, right: 52, top: 24, bottom: 46 },
            xAxis: { type: 'category', data: info.rows.map(r => r.name), axisLabel: { fontSize: 10, interval: 0 } },
            yAxis: [{ type: 'value', name: '收费率(%)', max: 100 }, { type: 'value', name: '元/m³' }],
            series: [{ name: '收费率', type: 'bar', barMaxWidth: 26, data: info.rows.map(r => r.rate), itemStyle: { color: '#8E6FD8', borderRadius: [4, 4, 0, 0] } },
              { name: '售水均价', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 6, data: info.rows.map(r => r.price), lineStyle: { width: 2, color: '#F58B3C' }, itemStyle: { color: '#F58B3C' } }] };
        }
        return { color: ['#317FC2'], tooltip: { trigger: 'axis' }, grid: { left: 52, right: 18, top: 24, bottom: 46 },
          xAxis: { type: 'category', data: info.rows.map(r => r.name), axisLabel: { fontSize: 10, interval: 0, rotate: info.rows.length > 5 ? 20 : 0 } },
          yAxis: { type: 'value', name: info.unit },
          series: [{ name: info.seriesName, type: 'bar', barMaxWidth: 26, data: info.rows.map(r => r.value), itemStyle: { color: '#317FC2', borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', fontSize: 10, color: '#5B7A96' } }] };
      },
      getRows: () => {
        const info = domainSeries(kind, filters());
        return info.rows.map(r => kind === 'account' ? [r.name, r.receivable, r.received, '万元']
          : kind === 'charge' ? [r.name, r.rate, r.price, '% / 元每立方米']
          : [r.name, r.value, info.unit]);
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
    const titles = { nature: '用水性质', meterType: '水表类型', caliber: '水表口径', industry: '行业主类', admin: '行政区', collection: '抄表到户', admin8: '行政区（8区）' };
    return {
      id: `C-DRILL-${dim}`, title: label, dimension: dim, dimensions: [dim], periodFilter: true,
      getOption: ctx => {
        if (dim === 'collection') {
          const rows = collectionRows(ctx.filters);
          if (!rows.length) return E.emptyOption();
          if (drillDimensionView === 'ring') {
            return { color: E.colors, tooltip: { trigger: 'item', formatter: p => `${esc(p.name)}<br>${fmt(p.value, 0)} 户 · ${p.percent}%` }, legend: { bottom: 0, textStyle: { fontSize: 10, color: '#758697' } },
              series: [{ type: 'pie', radius: ['40%', '66%'], center: ['50%', '44%'], data: rows.map(r => ({ name: r.name, value: r.value })), itemStyle: { borderColor: '#fff', borderWidth: 2 }, label: { show: false } }] };
          }
          return baseCombo(rows.map(r => ({ name: r.name, value: r.value })), [valueAxis('户')], [barSeries('注册户数', rows.map(r => r.value), '#41A75E')]);
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
  const lossReasons = [];
  function scopedUsers() {
    const f = filters();
    return (D.users || []).filter(user => (!f.company || user.company === f.company) && (!f.org || user.org === f.org) && (!f.nature || user.nature === f.nature) && (!f.admin || user.adminCode === f.admin));
  }
  function scopedBills() {
    const f = filters();
    return (D.bills || []).filter(bill => (!f.company || bill.company === f.company) && (!f.org || bill.org === f.org) && (!f.nature || bill.nature === f.nature) && (!f.admin || bill.adminCode === f.admin));
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
    const users = scopedUsers();
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
    const latest = (E.filterFacts ? E.filterFacts({ ...filters(), period: '当月' }) : []);
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
    const users = scopedUsers();
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
      <div class="notice">大用户与规模以上企业按用户档案口径统计（年用水量≥100m³）；当前样例数据户均年用水量约 120m³，阈值会把多数样例计入，真实数据接入后按实际口径筛选。二次加压前直供水量与小区关联需分区区域图，当前仍在缺数态。${risk('L1', '二次加压直供与小区关联关系未接入；样例数据规模不代表真实户均')}</div>`;
  }
  function specialPriceCharge() {
    const facts = E.filterFacts ? E.filterFacts(filters()) : [];
    const priceRows = ['居民阶梯', '居民非阶梯', '非居民', '特行'].map(nature => {
      const rows = facts.filter(row => row.nature === nature);
      const vol = sumBy(rows, 'sold_vol'), water = sumBy(rows, 'water_fee'), sewage = sumBy(rows, 'sewage_fee'), revenue = sumBy(rows, 'water_revenue');
      const divide = (a, b) => (b ? a / b : null);
      return [nature, fmt(vol, 0), fmt(divide(water, vol), 3), fmt(divide(sewage, vol), 3), fmt(divide(revenue, vol), 3)];
    });
    const bills = scopedBills();
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
  function specialLoss() {
    const facts = E.filterFacts ? E.filterFacts(filters()) : [];
    const companyList = WB.state.company ? [WB.state.company] : ['营业中心', '航空港区水务', '高新供水', '东区水务'];
    const rows = companyList.map(company => {
      const items = facts.filter(row => row.company === company);
      const supply = sumBy(items, 'supply_vol'), sold = sumBy(items, 'sold_vol');
      const rate = supply > 0 ? (supply - sold) / supply * 100 : null;
      return [company, fmt(supply || null, 0), fmt(sold, 0), rate == null ? '缺数' : fmt(rate, 2) + '%'];
    });
    return `<div class="special-block"><h4>产销差率（按经营单位）</h4>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>经营单位</th><th>供水量(m³)</th><th>售水量(m³)</th><th>产销差率</th></tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${esc(String(cell))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      </div>
      <div class="special-block"><h4>填报变化原因（演示 · 纯内存）</h4>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>经营单位</th><th>变化原因</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(row[0])}</td><td><input class="control special-reason" data-company="${esc(row[0])}" placeholder="如：供水量口径调整 / 管网漏损" aria-label="${esc(row[0])}变化原因"></td></tr>`).join('')}</tbody></table></div>
        <div style="padding:10px 0"><button type="button" class="btn primary" id="specialSaveReasons">保存填报原因（内存）</button> <span class="muted" id="specialReasonHint">尚未保存</span></div>
      </div>
      <div class="notice">供水量填报未接入时产销差率显示“缺数”，不按售水量推算。${risk('L1', '供水量与分区计量数据未接入；填报原因仅演示')}</div>`;
  }
  const specialTabs = [['users', '用户结构'], ['big', '大用户与重点'], ['price', '单价与收费率'], ['loss', '产销差与填报']];
  let specialTab = 'users';
  function specialBody() {
    if (specialTab === 'users') return specialUsers();
    if (specialTab === 'big') return specialBigUsers();
    if (specialTab === 'price') return specialPriceCharge();
    return specialLoss();
  }
  function renderSpecial() {
    const body = document.getElementById('drillSpecialBody');
    if (!body) return;
    body.innerHTML = specialBody();
    document.querySelectorAll('[data-special-tab]').forEach(button => {
      button.classList.toggle('active', button.dataset.specialTab === specialTab);
      button.onclick = () => { specialTab = button.dataset.specialTab; renderSpecial(); };
    });
    document.getElementById('specialExportArrears')?.addEventListener('click', () => {
      const rows = scopedBills().filter(bill => Number(bill.arrears) > 0);
      if (!rows.length) { WB.shell?.toast?.('当前范围无欠费明细'); return; }
      E.downloadCSV('欠费明细_按开账年月.csv', ['开账年月', '用户', '经营单位', '用水性质', '应收(元)', '实收(元)', '欠费(元)'], rows.map(bill => [bill.period, bill.userId, bill.company, bill.nature, bill.amount, bill.received, bill.arrears]));
    });
    document.getElementById('specialSaveReasons')?.addEventListener('click', () => {
      lossReasons.length = 0;
      document.querySelectorAll('.special-reason').forEach(input => { if (input.value.trim()) lossReasons.push({ month: WB.state.month, company: input.dataset.company, reason: input.value.trim() }); });
      const hint = document.getElementById('specialReasonHint');
      if (hint) hint.textContent = lossReasons.length ? `已保存 ${lossReasons.length} 条（纯内存，刷新清空）` : '尚未保存';
      WB.shell?.toast?.('填报原因已保存到当前页面内存（不落本地存储）');
    });
  }
  function VCard(title, value, unit, note, tone) {
    return `<article class="card kpi-card"><div class="kpi-top"><span class="kpi-icon ${tone || ''}"></span><span>${esc(title)}</span></div><div class="kpi-main"><span class="kpi-value numeric">${value}</span><span class="kpi-unit">${esc(unit)}</span></div><div class="kpi-foot"><span>${esc(note)}</span></div></article>`;
  }

  function renderDrill() {
    ensureStyle(); ensureSubscription();
    disposeExcept(['C-DRILL-nature', 'C-DRILL-meterType', 'C-DRILL-caliber', 'C-DRILL-industry', 'C-DRILL-admin', metricMeta[analysisMetric].chart, 'C-HOME-YEAR']);
    const root = page();
    if (!root) return;
    const company = WB.state.company || '';
    const org = WB.state.org || '';
    const team = WB.state.team || '';
    const line = WB.state.line || '';
    const deepest = line || team || org || company;
    const nextLevelMeta = drillNextLevel();
    drillAnalysisDimension = nextLevelMeta ? nextLevelMeta.key : 'nature';
    const crumbs = drillBreadcrumb().map((part, index) => index === 0 ? `<span>${esc(part)}</span>` : `<span class="breadcrumb-separator">/</span><span>${esc(part)}</span>`).join('');
    const scopePath = drillBreadcrumb().slice(1).join(' / ');
    const heading = `<header class="page-heading product-page-heading"><div class="page-heading-copy"><div class="breadcrumb"><span>营销一体化</span><span class="breadcrumb-separator">/</span>${crumbs}</div><div class="page-title-row"><h1 class="page-title">${esc(scopePath)} · 指标详情</h1><span class="environment-badge"><i></i>演示数据</span>${drillRisk()}</div><p class="page-description">${esc(drillBreadcrumb().slice(1).join(' / '))} 层级指标与维度分析 · ${drillNextLevel() ? '可继续下钻到' + drillNextLevel().label : '已到最细层级'}</p></div><div class="page-heading-side"><div class="page-data-meta"><span>数据日期</span><strong>${esc(D.asOf)}</strong></div></div></header>`;
    const baseDims = [['nature', '用水性质'], ['meterType', '水表类型'], ['caliber', '水表口径'], ['industry', '行业主类'], ['admin', '行政区']];
    // 注册数专属：抄表到户（需求 NEW-1-08 / S08-019）。行政区 8 区口径需功能区映射，样例仅依法定行政区，故不新增该维度。
    const registeredDims = analysisMetric === 'registered_count' ? [['collection', '抄表到户']] : [];
    const suffix = drillDimensionView === 'ring' ? ' · 构成占比' : '';
    const dimensionDefs = [...baseDims, ...registeredDims].map(([dim, label]) => dimensionDefinition(dim, label + suffix));
    const children = drillChildUnits();
    const childHtml = children.length ? `<div class="drill-children"><span class="dc-label">继续下钻</span>${children.map(name => `<button type="button" class="dc-chip" data-drill-child="${esc(name)}">${esc(name)}<span>→</span></button>`).join('')}</div>` : '';
    root.innerHTML = `${heading}<div class="drill-page">
      <div class="drill-toolbar">
        <button type="button" class="btn" id="drillBack">← ${line ? '返回' + orgLabels().team : team ? '返回' + orgLabels().org.replace(' / 站点', '') : org ? '返回分公司' : company ? '返回集团' : '返回首页'}</button>
        <span class="drill-path">${drillBreadcrumb().map(esc).join(' / ')}</span>
        <span class="drill-note">整页下钻视图 · 面包屑随层级变化</span>
      </div>
      ${childHtml}
      <section class="kpi-grid wb-kpi-grid" data-wb-kpi-grid aria-label="当前层级五项指标"></section>
      ${analysisCard()}
      <section class="card drill-dim-card"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">${drillDimLayout === 'domain' ? '分类指标分析' : '维度分析'}</h2><div class="card-subtitle">${esc(drillDimLayout === 'domain' ? '按会议要求的五类业务域分组展示当前层级图表（不平铺）' : ('按用水性质、水表类型、口径、行业与行政区拆分当前层级售水量' + (registeredDims.length ? '；注册数另有抄表到户口径' : '') + (drillDimensionView === 'ring' ? '　当前为构成占比视图' : '')))}</div></div><div class="card-head-actions"><span class="ac-label">视图</span><div class="segmented" id="drillDimLayout" aria-label="维度视图方式"><button type="button" data-dim-layout="dimension" class="${drillDimLayout === 'dimension' ? 'active' : ''}">按维度</button><button type="button" data-dim-layout="domain" class="${drillDimLayout === 'domain' ? 'active' : ''}">按业务分类</button></div>${drillDimLayout === 'dimension' ? '<span class="ac-label">图形</span><div class="segmented" id="drillDimViews" aria-label="维度图形"><button type="button" data-dim-view="bar" class="' + (drillDimensionView === 'bar' ? 'active' : '') + '">柱图</button><button type="button" data-dim-view="ring" class="' + (drillDimensionView === 'ring' ? 'active' : '') + '">环形占比</button></div>' : ''}</div></div>
        ${drillDimLayout === 'domain'
          ? `<div class="domain-view">${DOMAIN_GROUPS.map(([group, items]) => `<div class="domain-block"><div class="domain-head"><span class="domain-dot"></span><h3>${esc(group)}</h3><span class="muted">${items.length} 张图</span></div><div class="chart-grid domain-grid">${items.map(([kind, title]) => E.chartCard(domainDefinition(kind, title))).join('')}</div></div>`).join('')}</div>`
          : `<div class="chart-grid drill-dim-grid">${dimensionDefs.map(def => E.chartCard(def)).join('')}</div>`}
        ${drillDimLayout === 'dimension' && analysisMetric === 'registered_count' ? `<div class="notice" style="margin:0 16px 14px">抄表到户口径按需求 S08-019 / NEW-1-08：非居民数量＝非居民＋特行＋居民非阶梯（除居民总表）；抄表到户＝居民阶梯＋考核表；未抄表到户＝二次加压表后非注册用户（人工添加）。样例缺“考核表/居民总表/二次加压表”字段，故考核表暂并入居民阶梯、未抄表到户显示 0。${risk('L2','抄表到户三类口径缺考核表与二次加压数据，未抄表到户待接入')}</div>` : ''}</section>
      <section class="card drill-special"><div class="card-head"><span class="card-title-bar"></span><div><h2 class="card-title">专项分析</h2><div class="card-subtitle">用户结构、大用户、单价与收费率、产销差填报</div></div><div class="card-head-actions"><div class="tabs" role="tablist" aria-label="专项分析">${specialTabs.map(([key, label]) => `<button type="button" role="tab" data-special-tab="${key}" class="${key === specialTab ? 'active' : ''}">${label}</button>`).join('')}</div></div></div><div id="drillSpecialBody" class="card-body"></div></section>
    </div>`;
    updateCards();
    registerAnalysis();
    document.getElementById('drillBack')?.addEventListener('click', () => {
      if (line) { WB.state.line = ''; navigate('drill', { company, org, team }); }
      else if (team) { WB.state.team = ''; navigate('drill', { company, org }); }
      else if (org) { WB.state.org = ''; navigate('drill', { company }); }
      else if (company) { WB.state.company = ''; WB.state.org = ''; WB.state.team = ''; WB.state.line = ''; navigate('drill', { metric: analysisMetric }); }
      else { WB.state.company = ''; WB.state.org = ''; WB.state.team = ''; WB.state.line = ''; navigate('home', {}); }
    });
    root.querySelectorAll('[data-drill-child]').forEach(button => button.addEventListener('click', () => {
      const level = drillNextLevel();
      if (!level) return;
      const params = { company };
      if (org) params.org = org;
      if (team) params.team = team;
      if (line) params.line = line;
      params[level.key] = button.dataset.drillChild;
      navigate('drill', params);
    }));
    renderSpecial();
    if (drillDimLayout === 'domain') {
      DOMAIN_GROUPS.forEach(([, items]) => items.forEach(([kind, title]) => {
        const def = domainDefinition(kind, title);
        const el = document.getElementById(def.id);
        if (el) E.registerChartLazy(def.id, el, def);
      }));
    } else {
      dimensionDefs.forEach(def => {
        const el = document.getElementById(def.id);
        if (el) E.registerChartLazy(def.id, el, def);
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
