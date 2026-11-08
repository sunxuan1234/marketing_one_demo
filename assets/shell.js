/* Shared application shell, global Filter and accessible UI primitives. */
(function (global) {
  'use strict';

  const WB = global.WB = global.WB || {};
  const FILTER_DEFAULTS = {
    period: '年内累计', caliber: '业务账期', start: '2026-01', end: '2026-10',
    year: '2026', month: '2026-10', company: '', admin: '', functional: '', org: '',
    nature: '', industry: '', caliberMm: '', meterType: '', layer: 'SOURCE', role: '集团管理员'
  };
  WB.state = Object.assign({}, FILTER_DEFAULTS, WB.state || {});

  let modules = [
    { key: 'home', label: '集团经营总览', icon: 'dashboard', group: '经营总览', desc: '集团五指标、行政地图与经营态势' },
    { key: 'user', label: '用户查询与画像', icon: 'users', group: '业务监管', desc: '统一表卡查询、全景档案与用水画像' },
    { key: 'meter', label: '表务与抄表督查', icon: 'meter', group: '业务监管', desc: '水表台账、抄表质量与换表核查' },
    { key: 'alert', label: '智能分析与预警', icon: 'bell', group: '业务监管', desc: '业务异常分类与只读明细' },
    { key: 'project', label: '工程与未立户监管', icon: 'project', group: '业务监管', desc: '工程节点、异常水表与立户关联' },
    { key: 'ar', label: '应收账款与账务', icon: 'wallet', group: '业务监管', desc: '应收实收、欠费账龄与只读账务' },
    { key: 'dma', label: '分区计量与流量计', icon: 'flow', group: '业务监管', desc: 'DMA拓扑、夜间流量与压力监测' },
    { key: 'forecast', label: '售水量预测中心', icon: 'forecast', group: '业务监管', desc: '指标历史与预测结果查询' },
    { key: 'work', label: '工单督查', icon: 'work', group: '平台管理', desc: '源工单状态与办理记录查询' },
    { key: 'data', label: '数据集成与治理', icon: 'database', group: '平台管理', desc: '同步批次与基础信息异常' },
    { key: 'report', label: '报表中心', icon: 'report', group: '平台管理', desc: '标准报表、平台配置与角色权限' }
  ];
  const roles = [{ key: '集团管理员', icon: 'role', desc: '演示查询视角' }];
  const domainModules = {
    HOME: 'home', KPI: 'kpi', USER: 'user', METER: 'meter', ALERT: 'alert', PROJECT: 'project',
    AR: 'ar', DMA: 'dma', FORECAST: 'forecast', WORK: 'work', DATA: 'data', REPORT: 'report', AUTH: 'auth', SET: 'set'
  };

  let initialized = false;
  let navigationHandler = null;
  let roleChangeHandler = null;
  let filtersExpanded = false;
  let layerSequence = 0;
  let toastTimer = null;
  let searchActiveIndex = -1;
  let searchPreviousFocus = null;
  let accountPreviousFocus = null;
  const layers = [];

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const data = () => global.WB_DATA || {};
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const icon = (name, className, label) => global.WBIcons ? global.WBIcons.icon(name, className, label) : '';
  const refreshIcons = root => { if (global.WBIcons) global.WBIcons.hydrate(root || document); };
  const announce = message => { const el = $('#appStatus'); if (el) { el.textContent = ''; requestAnimationFrame(() => { el.textContent = String(message || ''); }); } };
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));

  function moduleFor(key) { return modules.find(item => item.key === key) || modules[0]; }
  function routeFromHash(hash) {
    const raw = String(hash == null ? location.hash : hash).replace(/^#\/?/, '');
    const parts = raw.split('?');
    const key = decodeURIComponent(parts.shift() || 'home');
    return { module: modules.some(item => item.key === key) ? key : 'home', params: Object.fromEntries(new URLSearchParams(parts.join('?'))) };
  }

  function navigate(module, params) {
    const route = moduleFor(String(module || 'home').replace(/^#\/?/, '').split('?')[0]);
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(entry => {
      const key = entry[0], value = entry[1];
      if (value == null || value === '') return;
      query.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    });
    const hash = '#/' + route.key + (query.toString() ? '?' + query.toString() : '');
    closePopovers();
    closeLayers();
    if (typeof navigationHandler === 'function') {
      navigationHandler(route.key, params || {});
      setActiveNav(route.key);
    } else if (location.hash === hash) setActiveNav(route.key);
    else location.hash = hash;
    return hash;
  }

  function setActiveNav(key) {
    const route = moduleFor(key);
    $$('.nav-item').forEach(item => {
      const active = item.dataset.module === route.key;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    const context = $('#currentModuleContext');
    if (context) context.textContent = route.label;
    document.title = route.label + '｜营销一体化管控平台';
  }

  function renderTopbar() {
    const target = $('#appTopbar');
    if (!target) return;
    const alertCount = Array.isArray(data().alerts) ? data().alerts.filter(a=>a.category!=='基础信息').length : 0;
    const asOf = String(data().asOf || '');
    const asOfShort = asOf ? asOf.slice(5, 16) : '';
    target.innerHTML = '<header class="topbar">' +
      '<a class="brand" href="#/home" data-nav="home" aria-label="返回集团经营总览">' +
        '<span class="brand-mark">' + icon('water') + '</span>' +
        '<span class="brand-copy"><span class="brand-name">营销一体化管控平台</span><span class="brand-sub">ZHENGZHOU WATER GROUP</span></span>' +
      '</a>' +
      '<div class="topbar-main">' +
        '<div class="topbar-context">' + icon('building') + '<span>郑州水务集团</span><span class="context-separator">/</span><span id="currentModuleContext">集团经营总览</span></div>' +
        (asOfShort ? '<span class="topbar-freshness" title="合成演示数据截至 ' + esc(asOf) + '">' + icon('clock') + '更新至 ' + esc(asOfShort) + '</span>' : '') +
        '<span class="prototype-badge" title="交互原型｜合成演示数据｜源系统只读隔离"><span class="status-dot"></span>演示环境</span>' +
        '<div class="topbar-actions">' +
          '<button type="button" class="top-action top-search" id="globalSearchBtn" aria-label="全局搜索，快捷键斜杠" aria-expanded="false" aria-controls="searchPanel" title="搜索功能、报表或业务模块（/）">' + icon('search') + '<span>搜索功能、报表或业务模块</span><kbd>/</kbd></button>' +
          '<button type="button" class="top-action" id="alertBtn" aria-label="进入智能分析与预警' + (alertCount ? '，' + alertCount + '项演示预警' : '') + '" title="智能分析与预警">' + icon('bell') + (alertCount ? '<span class="alert-dot" aria-hidden="true">' + alertCount + '</span>' : '') + '</button>' +
          '<button type="button" class="top-action" id="fullscreenBtn" aria-label="切换全屏显示" title="全屏显示">' + icon('fullscreen') + '</button>' +
          '<button type="button" class="top-action user-action" id="userBtn" aria-label="账号与角色视角" aria-expanded="false" aria-controls="accountPanel" title="账号与角色视角"><span class="avatar" id="topbarAvatar">管</span><span class="user-copy"><span class="user-name" id="topbarUserName">集团管理员</span><span class="user-role" id="topbarUserRole">集团管理员</span></span>' + icon('chevronDown') + '</button>' +
        '</div>' +
      '</div>' +
    '</header>';

    $('#globalSearchBtn').addEventListener('click', () => toggleSearch());
    $('#alertBtn').addEventListener('click', () => navigate('alert'));
    $('#userBtn').addEventListener('click', () => toggleAccount());
    $('#fullscreenBtn').addEventListener('click', toggleFullscreen);
    updateRoleDisplay();
  }

  function renderSidebar() {
    const target = $('#appSidebar');
    if (!target) return;
    const groups = [...new Set(modules.filter(item => !item.hidden).map(item => item.group))];
    target.innerHTML = '<aside class="sidebar" aria-label="一级业务导航"><div class="sidebar-scroll">' + groups.map(group =>
      '<div class="nav-section"><div class="nav-section-title">' + esc(group) + '</div>' + modules.filter(item => !item.hidden && item.group === group).map(item =>
        '<a class="nav-item" href="#/' + item.key + '" data-nav="' + item.key + '" data-module="' + item.key + '" title="' + esc(item.label) + (item.count ? '，' + item.count + '项功能' : '') + '">' + icon(item.icon) + '<span class="nav-label">' + esc(item.label) + '</span>' + (item.count ? '<span class="nav-count" aria-hidden="true">' + esc(item.count) + '</span>' : '') + '</a>'
      ).join('') + '</div>'
    ).join('') + '<div class="sidebar-boundary" title="合成演示数据，源业务系统只读">' + icon('shield') + '<span>演示数据 · 源系统只读</span></div></div>' +
      '<div class="sidebar-footer"><button type="button" class="collapse-btn" id="collapseBtn" aria-label="收起或展开导航" title="收起或展开导航">' + icon('collapse') + '<span class="collapse-label">收起导航</span></button></div></aside>';
    $('#collapseBtn').addEventListener('click', toggleSidebar);
  }

  function toggleSidebar() {
    const collapsed = document.body.classList.toggle('nav-collapsed');
    try { localStorage.setItem('wb_nav_collapsed', collapsed ? '1' : '0'); } catch (_) {}
    const button = $('#collapseBtn');
    if (button) button.setAttribute('aria-label', collapsed ? '展开导航' : '收起导航');
    setTimeout(() => {
      if (WB.engine && WB.engine.charts) WB.engine.charts.forEach(entry => entry.chart && entry.chart.resize());
      global.dispatchEvent(new Event('resize'));
    }, 260);
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) { toast('当前浏览器未允许全屏，可使用浏览器全屏快捷键', 'warning'); }
  }

  function uniqueValues(values) {
    return [...new Set((values || []).filter(value => value != null && value !== '').map(String))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }

  function filterOptions(key) {
    const D = data();
    const facts = Array.isArray(D.facts) ? D.facts : [];
    if (key === 'company') return (D.companies || []).map(item => ({ value: item.name, label: item.name }));
    if (key === 'admin') return (D.adminRegions || []).map(item => ({ value: item.code, label: item.name }));
    if (key === 'functional') return (D.functionalZones || []).map(item => ({ value: item.code, label: item.name }));
    if (key === 'nature') return uniqueValues(D.natures || facts.map(item => item.nature)).map(value => ({ value, label: value }));
    if (key === 'industry') return uniqueValues(D.industries || facts.map(item => item.industry)).map(value => ({ value, label: value }));
    if (key === 'caliberMm') return uniqueValues(D.calibers || facts.map(item => item.caliber)).map(value => ({ value, label: value }));
    if (key === 'meterType') return uniqueValues(D.meterTypes || facts.map(item => item.meterType)).map(value => ({ value, label: value }));
    if (key === 'org') return uniqueValues(facts.map(item => item.org)).map(value => ({ value, label: value }));
    return [];
  }

  function selectField(key, label, options, allLabel) {
    const id = 'globalFilter_' + key;
    const current = WB.state[key] == null ? '' : String(WB.state[key]);
    return '<div class="filter-field"><label class="filter-label" for="' + id + '">' + esc(label) + '</label>' +
      '<select class="control" id="' + id + '" data-filter="' + key + '" aria-label="' + esc(label) + '">' +
      (allLabel === false ? '' : '<option value="">' + esc(allLabel || '全部') + '</option>') + options.map(option => {
        const value = typeof option === 'object' ? option.value : option;
        const text = typeof option === 'object' ? option.label : option;
        return '<option value="' + esc(value) + '"' + (String(value) === current ? ' selected' : '') + '>' + esc(text) + '</option>';
      }).join('') + '</select></div>';
  }

  function fixedField(key, label, values) {
    return selectField(key, label, values.map(value => ({ value, label: value })), false);
  }

  function renderFilters() {
    const target = $('#globalFilters');
    if (!target) return;
    target.innerHTML = '<section class="card global-filter-card filter-bar" aria-labelledby="globalFilterTitle">' +
      '<div class="filter-bar-head"><span class="filter-bar-title" id="globalFilterTitle">' + icon('filter') + '全局 Filter</span><span class="filter-summary" id="globalFilterSummary"></span>' +
        '<div class="filter-bar-actions"><button type="button" class="btn ghost sm" id="resetGlobalFilters">' + icon('refresh') + '重置</button><button type="button" class="btn ghost sm" id="advancedFilterToggle" aria-expanded="' + filtersExpanded + '" aria-controls="globalAdvancedFilters">' + icon('sliders') + '<span>' + (filtersExpanded ? '收起维度' : '更多维度') + '</span>' + icon(filtersExpanded ? 'chevronUp' : 'chevronDown') + '</button></div></div>' +
      '<div class="filter-bar-body"><form id="globalFilterForm" autocomplete="off"><div class="filter-grid">' +
        fixedField('period', '统计时段', ['当月', '年内累计', '近5年', '近10年', '自定义']) +
        fixedField('caliber', '时间口径', ['业务账期', '财务自然月']) +
        '<div class="filter-field" id="globalMonthField"' + (WB.state.period === '自定义' ? ' hidden' : '') + '><label class="filter-label" for="globalFilter_month">基准月份</label><input class="control" type="month" id="globalFilter_month" data-filter="month" value="' + esc(WB.state.month) + '" aria-label="基准月份"></div>' +
        '<div class="filter-field custom-period-field"' + (WB.state.period === '自定义' ? '' : ' hidden') + '><label class="filter-label" for="globalFilter_start">开始月份</label><input class="control" type="month" id="globalFilter_start" data-filter="start" value="' + esc(WB.state.start) + '" aria-label="自定义开始月份"></div>' +
        '<div class="filter-field custom-period-field"' + (WB.state.period === '自定义' ? '' : ' hidden') + '><label class="filter-label" for="globalFilter_end">结束月份</label><input class="control" type="month" id="globalFilter_end" data-filter="end" value="' + esc(WB.state.end) + '" aria-label="自定义结束月份"></div>' +
        selectField('company', '经营单位', filterOptions('company'), '四家经营单位') +
        selectField('admin', '法定行政区', filterOptions('admin'), '全部行政区') +
        selectField('functional', '功能区叠加', filterOptions('functional'), '功能区未限定') +
      '</div>' +
      '<div class="advanced-fields' + (filtersExpanded ? '' : ' hidden') + '" id="globalAdvancedFilters"><div class="filter-grid">' +
        selectField('org', '组织 / 所站 / 网格', filterOptions('org'), '全部组织') +
        selectField('nature', '用水性质', filterOptions('nature'), '全部用水性质') +
        selectField('industry', '行业主类', filterOptions('industry'), '全部行业') +
        selectField('caliberMm', '水表口径', filterOptions('caliberMm'), '全部口径') +
        selectField('meterType', '水表类型', filterOptions('meterType'), '全部表型') +
        selectField('layer', 'M01 数据视图', [{ value: 'SOURCE', label: '源系统自动原值' }, { value: 'ADJUSTED', label: '含已复核平台补充层' }], false) +
      '</div></div>' +
      '<div class="filter-actions"><span class="filter-hint">' + icon('info') + '图表、卡片、明细与导出共用此 Filter；局部图表条件可继续收窄。</span><span class="readonly">' + icon('lock') + '源值只读，ADJUSTED 仅叠加已复核补充</span></div>' +
      '</form></div></section>';

    $('#globalFilterForm').addEventListener('change', event => {
      const control = event.target.closest('[data-filter]');
      if (!control) return;
      updateFilter(control.dataset.filter, control.value, control);
    });
    $('#resetGlobalFilters').addEventListener('click', resetFilters);
    $('#advancedFilterToggle').addEventListener('click', () => { filtersExpanded = !filtersExpanded; renderFilters(); });
    updateFilterSummary();
  }

  function updateFilter(key, value, control) {
    if (!(key in FILTER_DEFAULTS)) return;
    WB.state[key] = value;
    if (key === 'month') {
      WB.state.end = value || WB.state.end;
      WB.state.year = value ? value.slice(0, 4) : WB.state.year;
    }
    if (key === 'end' && value) WB.state.month = value;
    if (key === 'company') WB.state.org = '';
    if (key === 'period') {
      $$('.custom-period-field').forEach(field => { field.hidden = value !== '自定义'; });
      const monthField = $('#globalMonthField');
      if (monthField) monthField.hidden = value === '自定义';
    }
    if (key === 'company') {
      const org = $('#globalFilter_org');
      if (org) org.value = '';
    }
    updateFilterSummary();
    const detail = { key, value, filters: currentFilters(), control: control || null };
    emit('wb:filter-change', detail);
    emit('wb:state-change', detail);
    if (WB.engine && typeof WB.engine.refreshAll === 'function') WB.engine.refreshAll();
  }

  function resetFilters() {
    const role = WB.state.role;
    Object.keys(FILTER_DEFAULTS).forEach(key => { WB.state[key] = FILTER_DEFAULTS[key]; });
    WB.state.role = role;
    renderFilters();
    const detail = { reset: true, filters: currentFilters() };
    emit('wb:filter-change', detail);
    emit('wb:state-change', detail);
    if (WB.engine && typeof WB.engine.refreshAll === 'function') WB.engine.refreshAll();
    toast('已恢复全局默认筛选', 'success');
  }

  function updateFilterSummary() {
    const summary = $('#globalFilterSummary');
    if (!summary) return;
    const text = WB.engine && typeof WB.engine.filterLabel === 'function'
      ? WB.engine.filterLabel(WB.state)
      : [WB.state.period, WB.state.caliber, WB.state.company || '四家经营单位', WB.state.layer === 'ADJUSTED' ? '含已复核补充层' : '源系统自动原值'].join('｜');
    summary.textContent = text;
    summary.title = text;
  }

  function currentFilters() { return Object.assign({}, WB.state); }

  function updateRoleDisplay() {
    const role = WB.state.role || '集团管理员';
    const staff = (data().staff || []).find(item => item.role === role);
    const name = staff ? staff.name : role;
    const nameEl = $('#topbarUserName'), roleEl = $('#topbarUserRole'), avatar = $('#topbarAvatar');
    if (nameEl) nameEl.textContent = name;
    if (roleEl) roleEl.textContent = role;
    if (avatar) avatar.textContent = name.slice(0, 1);
  }

  function setRole(role) {
    if (!roles.some(item => item.key === role)) { toast('未知角色视角：' + role, 'error'); return WB.state.role; }
    WB.state.role = role;
    updateRoleDisplay();
    closeAccount(true);
    announce('已切换为' + role + '视角');
    emit('wb:role-change', { role, filters: currentFilters() });
    emit('wb:state-change', { key: 'role', value: role, filters: currentFilters() });
    if (typeof roleChangeHandler === 'function') roleChangeHandler(role, currentFilters());
    if (WB.engine && typeof WB.engine.refreshAll === 'function') WB.engine.refreshAll();
    toast('已切换为「' + role + '」视角', 'success');
    return role;
  }

  function positionPopover(panel, anchor) {
    if (!panel || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    panel.style.top = Math.min(global.innerHeight - 80, rect.bottom + 8) + 'px';
    panel.style.right = Math.max(12, global.innerWidth - rect.right) + 'px';
    panel.style.left = 'auto';
  }

  function toggleSearch() { const panel = $('#searchPanel'); if (panel && !panel.hidden) closeSearch(true); else openSearch(); }
  function openSearch() {
    const panel = $('#searchPanel'), anchor = $('#globalSearchBtn');
    if (!panel || !anchor) return;
    closeAccount();
    closeLayersOfKind('popover');
    searchPreviousFocus = document.activeElement;
    panel.innerHTML = '<div class="search-head">' + icon('search') + '<input id="globalSearchInput" class="search-input" type="search" placeholder="输入模块、功能名称、功能编号或报表…" aria-label="全局搜索" aria-controls="globalSearchResults" autocomplete="off"><button type="button" class="icon-btn search-close" data-search-close aria-label="关闭搜索">' + icon('close') + '</button></div>' +
      '<div class="search-body" id="globalSearchResults" role="listbox" aria-label="搜索结果"></div><div class="search-foot"><span><kbd>↑↓</kbd> 选择</span><span><kbd>Enter</kbd> 打开</span><span><kbd>Esc</kbd> 关闭</span></div>';
    panel.hidden = false;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '全局功能搜索');
    anchor.setAttribute('aria-expanded', 'true');
    anchor.classList.add('active');
    positionPopover(panel, anchor);
    $('#globalSearchInput').addEventListener('input', renderSearchResults);
    $('#globalSearchInput').addEventListener('keydown', handleSearchKeys);
    $('[data-search-close]', panel).addEventListener('click', () => closeSearch(true));
    renderSearchResults();
    requestAnimationFrame(() => $('#globalSearchInput') && $('#globalSearchInput').focus());
  }

  function searchItems() {
    const input = $('#globalSearchInput');
    const query = String(input ? input.value : '').trim().toLowerCase();
    const moduleItems = modules.filter(item => !query || (item.label + item.desc + item.key).toLowerCase().includes(query)).map(item => ({ module: item.key, title: item.label, desc: item.desc, icon: item.icon, group: '业务模块' }));
    if (!query) return moduleItems;
    const catalog = global.WB_CATALOG || {};
    const functions = (catalog.functions || []).filter(item => ((item.id || '') + (item.name || '') + (item.group || '') + (item.purpose || '') + (item.domain || '')).toLowerCase().includes(query)).slice(0, 14).map(item => ({
      module: domainModules[item.domain] || 'home', functionId: item.id, title: item.name || item.id,
      desc: item.id + ' · ' + (item.group || item.domain || '功能目录'), icon: 'file', group: '功能目录'
    }));
    const reports = (catalog.reports || []).filter(item => ((item.id || '') + (item.name || '') + (item.category || '')).toLowerCase().includes(query)).slice(0, 6).map(item => ({
      module: 'report', reportId: item.id, title: item.name, desc: (item.id || '报表') + ' · ' + (item.category || item.cycle || '报表中心'), icon: 'report', group: '报表目录'
    }));
    return moduleItems.concat(functions, reports).slice(0, 24);
  }

  function renderSearchResults() {
    const list = $('#globalSearchResults');
    if (!list) return;
    const items = searchItems();
    searchActiveIndex = -1;
    list.dataset.items = String(items.length);
    if (!items.length) {
      list.innerHTML = '<div class="empty">' + icon('empty') + '<div class="empty-title">没有匹配结果</div><div class="empty-description">可尝试功能ID、模块名称或报表关键词。</div></div>';
      return;
    }
    let previousGroup = '';
    list.innerHTML = items.map((item, index) => {
      const heading = item.group !== previousGroup ? '<div class="search-group-title">' + esc(item.group) + '</div>' : '';
      previousGroup = item.group;
      return heading + '<button type="button" class="search-result" role="option" aria-selected="false" data-search-index="' + index + '" data-search-module="' + esc(item.module) + '"' + (item.functionId ? ' data-search-function="' + esc(item.functionId) + '"' : '') + (item.reportId ? ' data-search-report="' + esc(item.reportId) + '"' : '') + '>' +
        '<span class="search-result-icon">' + icon(item.icon) + '</span><span class="search-result-copy"><span class="search-result-title">' + esc(item.title) + '</span><span class="search-result-desc">' + esc(item.desc) + '</span></span>' + icon('chevronRight') + '</button>';
    }).join('');
    $$('.search-result', list).forEach(button => button.addEventListener('click', () => activateSearchResult(button)));
  }

  function handleSearchKeys(event) {
    const buttons = $$('.search-result', $('#globalSearchResults'));
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!buttons.length) return;
      searchActiveIndex = event.key === 'ArrowDown'
        ? (searchActiveIndex + 1 + buttons.length) % buttons.length
        : (searchActiveIndex - 1 + buttons.length) % buttons.length;
      buttons.forEach((button, index) => {
        const active = index === searchActiveIndex;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
        if (active) button.scrollIntoView({ block: 'nearest' });
      });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const button = buttons[searchActiveIndex >= 0 ? searchActiveIndex : 0];
      if (button) activateSearchResult(button);
    }
  }

  function activateSearchResult(button) {
    const params = {};
    if (button.dataset.searchFunction) params.function = button.dataset.searchFunction;
    if (button.dataset.searchReport) params.report = button.dataset.searchReport;
    navigate(button.dataset.searchModule, params);
    closeSearch(true);
  }

  function closeSearch(restoreFocus) {
    const panel = $('#searchPanel'), anchor = $('#globalSearchBtn');
    if (panel) panel.hidden = true;
    if (anchor) { anchor.setAttribute('aria-expanded', 'false'); anchor.classList.remove('active'); }
    if (restoreFocus && searchPreviousFocus && searchPreviousFocus.isConnected) searchPreviousFocus.focus();
    searchPreviousFocus = null;
  }

  function toggleAccount() { const panel = $('#accountPanel'); if (panel && !panel.hidden) closeAccount(true); else openAccount(); }
  function openAccount() {
    const panel = $('#accountPanel'), anchor = $('#userBtn');
    if (!panel || !anchor) return;
    closeSearch();
    accountPreviousFocus = document.activeElement;
    const role = WB.state.role || '集团管理员';
    const staff = (data().staff || []).find(item => item.role === role) || { name: role, company: '郑州水务集团' };
    panel.innerHTML = '<div class="account-summary"><span class="avatar">' + esc(staff.name.slice(0, 1)) + '</span><div class="account-summary-copy"><div class="account-summary-name">' + esc(staff.name) + '</div><div class="account-summary-org">' + esc(staff.company || '郑州水务集团') + ' · ' + esc(role) + '</div></div><span class="badge gray">演示账号</span></div>' +
      '<div class="role-head"><div class="role-title">当前演示账号</div><div class="role-subtitle">仅用于本地页面浏览</div></div><div role="menu" aria-label="选择工作角色">' + roles.map(item =>
      '<button type="button" class="role-option" role="menuitemradio" aria-checked="' + (role === item.key) + '" data-role="' + esc(item.key) + '">' + icon(item.icon) + '<span class="role-option-copy"><span class="role-option-title">' + esc(item.key) + '</span><span class="role-option-desc">' + esc(item.desc) + '</span></span><span class="role-check">' + icon('check') + '</span></button>'
    ).join('') + '</div><div class="role-boundary">当前版本不连接认证或源业务办理服务。</div>';
    panel.hidden = false;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '账号与角色视角');
    anchor.setAttribute('aria-expanded', 'true');
    anchor.classList.add('active');
    positionPopover(panel, anchor);
    $$('.role-option', panel).forEach(button => button.addEventListener('click', () => setRole(button.dataset.role)));
    const selected = $('.role-option[aria-checked="true"]', panel);
    if (selected) selected.focus();
  }

  function closeAccount(restoreFocus) {
    const panel = $('#accountPanel'), anchor = $('#userBtn');
    if (panel) panel.hidden = true;
    if (anchor) { anchor.setAttribute('aria-expanded', 'false'); anchor.classList.remove('active'); }
    if (restoreFocus && accountPreviousFocus && accountPreviousFocus.isConnected) accountPreviousFocus.focus();
    accountPreviousFocus = null;
  }

  function closePopovers() { closeSearch(); closeAccount(); }

  function setContent(element, content) {
    if (content == null) return;
    if (typeof content === 'function') content = content(element);
    if (content && content.nodeType) element.appendChild(content);
    else element.innerHTML = String(content);
  }

  function focusableElements(root) {
    return $$('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', root)
      .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length);
  }

  function openLayer(kind, options) {
    options = options || {};
    init();
    closePopovers();
    const host = $(kind === 'drawer' ? '#drawerLayer' : '#modalLayer');
    if (!host) return null;
    const root = document.createElement('div');
    root.className = kind === 'drawer' ? 'drawer-mask' : 'modal-mask';
    root.dataset.layerKind = kind;
    const titleId = 'wb-layer-title-' + (++layerSequence);
    const dialog = document.createElement(kind === 'drawer' ? 'aside' : 'section');
    dialog.className = kind === 'drawer' ? 'drawer' : 'modal' + (options.size ? ' ' + esc(options.size) : '');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', titleId);
    dialog.tabIndex = -1;
    if (kind === 'drawer' && options.width) dialog.style.setProperty('--drawer-width', typeof options.width === 'number' ? options.width + 'px' : String(options.width));
    if (kind === 'modal' && options.width) dialog.style.width = typeof options.width === 'number' ? options.width + 'px' : String(options.width);
    dialog.innerHTML = '<div class="' + kind + '-head">' + (options.icon ? '<span class="layer-icon">' + icon(options.icon) + '</span>' : '') + '<div><div class="' + kind + '-title" id="' + titleId + '">' + esc(options.title || (kind === 'drawer' ? '详情' : '提示')) + '</div>' + (options.subtitle ? '<div class="' + kind + '-subtitle">' + esc(options.subtitle) + '</div>' : '') + '</div><button type="button" class="icon-btn ' + kind + '-close" data-layer-close aria-label="关闭">' + icon('close') + '</button></div>' +
      '<div class="' + kind + '-body"></div>';
    root.appendChild(dialog);
    const body = $('.' + kind + '-body', dialog);
    setContent(body, options.body);
    let footer = null;
    if (options.footer != null && options.footer !== '') {
      footer = document.createElement('div');
      footer.className = kind + '-foot';
      setContent(footer, options.footer);
      dialog.appendChild(footer);
    }
    const record = { root, dialog, body, footer, kind, options, previousFocus: document.activeElement, closed: false };
    root.close = value => closeLayer(record, value);
    root.el = dialog;
    root.dialog = dialog;
    root.body = body;
    root.footer = footer;
    root.addEventListener('click', event => {
      if ((event.target === root || event.target.closest('[data-layer-close], [data-close]')) && !options.persistent) closeLayer(record, false);
    });
    const previous = layers[layers.length - 1];
    if (previous) previous.dialog.inert = true;
    else setShellInert(true);
    layers.push(record);
    host.appendChild(root);
    document.body.classList.add('has-layer');
    refreshIcons(root);
    requestAnimationFrame(() => {
      if (record.closed) return;
      const preferred = $('[autofocus]', body) || focusableElements(body)[0] || focusableElements(footer || dialog)[0] || dialog;
      preferred.focus({ preventScroll: true });
    });
    if (typeof options.onOpen === 'function') options.onOpen(root);
    return root;
  }

  function setShellInert(value) {
    ['#appTopbar', '#appSidebar', '#main'].forEach(selector => { const element = $(selector); if (element) element.inert = value; });
  }

  function closeLayer(record, value) {
    if (!record || record.closed) return;
    record.closed = true;
    const index = layers.indexOf(record);
    if (index >= 0) layers.splice(index, 1);
    record.root.remove();
    const top = layers[layers.length - 1];
    if (top) top.dialog.inert = false;
    else {
      setShellInert(false);
      document.body.classList.remove('has-layer');
    }
    if (typeof record.options.onClose === 'function') record.options.onClose(value);
    const restore = top ? top.dialog : record.previousFocus;
    if (restore && restore.isConnected) requestAnimationFrame(() => restore.focus({ preventScroll: true }));
  }

  function closeLayers() { layers.slice().reverse().forEach(record => closeLayer(record, false)); }
  function closeLayersOfKind(kind) { layers.slice().filter(record => record.kind === kind).forEach(record => closeLayer(record, false)); }
  function openDrawer(options) { return openLayer('drawer', options); }
  function openModal(options) { return openLayer('modal', options); }

  function confirmDialog(options, extra) {
    if (typeof options === 'string') options = Object.assign({}, extra || {}, { message: options });
    options = options || {};
    return new Promise(resolve => {
      let settled = false;
      const finish = value => { if (!settled) { settled = true; resolve(value); } };
      const footer = '<button type="button" class="btn" data-confirm-cancel>' + esc(options.cancelText || '取消') + '</button><button type="button" class="btn ' + (options.danger ? 'danger' : 'primary') + '" data-confirm-ok>' + esc(options.confirmText || '确认') + '</button>';
      const root = openModal({
        title: options.title || '请确认', subtitle: options.subtitle || '', size: 'sm', icon: options.danger ? 'alert' : 'info',
        body: '<div class="notice' + (options.danger ? ' warning' : '') + '">' + esc(options.message || options.body || '确认继续此操作吗？') + '</div>',
        footer, persistent: !!options.persistent,
        onClose: () => finish(false)
      });
      if (!root) { finish(false); return; }
      $('[data-confirm-cancel]', root).addEventListener('click', () => root.close(false));
      $('[data-confirm-ok]', root).addEventListener('click', () => { finish(true); root.close(true); });
    });
  }

  function toast(message, type, duration) {
    if (message && typeof message === 'object') {
      const options = message;
      message = options.message;
      type = options.type || 'info';
      duration = options.duration;
    }
    const element = $('#toast');
    if (!element) return function () {};
    type = type || 'info';
    const iconName = type === 'success' ? 'checkCircle' : type === 'error' ? 'xCircle' : type === 'warning' ? 'alert' : 'info';
    element.className = 'toast ' + type;
    element.innerHTML = icon(iconName) + '<span>' + esc(message) + '</span>';
    clearTimeout(toastTimer);
    requestAnimationFrame(() => element.classList.add('show'));
    const hide = () => element.classList.remove('show');
    if (duration !== 0) toastTimer = setTimeout(hide, duration || 2800);
    return hide;
  }

  function badge(text, tone) {
    let dot = false;
    if (text && typeof text === 'object') {
      const options = text;
      text = options.text || options.label;
      tone = options.tone || options.type || '';
      dot = !!options.dot;
    }
    if (!tone) {
      const value = String(text || '');
      if (/异常|失败|退回|超时|高$|关闭/.test(value)) tone = 'red';
      else if (/待|草案|复核中|同步中|中$/.test(value)) tone = 'orange';
      else if (/成功|正常|通过|生效|在线|完成/.test(value)) tone = 'green';
    }
    return '<span class="badge ' + esc(tone || '') + '">' + (dot ? '<span class="status-dot"></span>' : '') + esc(text == null || text === '' ? '—' : text) + '</span>';
  }

  function cellContent(value, header, row, rowIndex) {
    if (typeof header.render === 'function') return String(header.render(value, row, rowIndex) == null ? '—' : header.render(value, row, rowIndex));
    if (value == null || value === '') return '<span class="muted">—</span>';
    if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'html')) return String(value.html);
    if (header.escape) return esc(value);
    if (typeof value === 'string' && /<\/?[a-z][^>]*>/i.test(value)) return value;
    return esc(value);
  }

  function renderTable(options) {
    options = options || {};
    const headers = (options.headers || []).map((header, index) => typeof header === 'object' ? Object.assign({ key: index }, header) : { key: index, label: header });
    const rows = Array.isArray(options.rows) ? options.rows : [];
    const selectable = !!options.selectable;
    const hasActions = !!options.actions;
    const columns = headers.length + (selectable ? 1 : 0) + (hasActions ? 1 : 0);
    const selected = new Set((options.selected || (typeof options.selectable === 'object' && options.selectable.selected) || []).map(String));
    const rowKey = options.rowKey || (typeof options.selectable === 'object' && options.selectable.rowKey);
    const idFor = (row, index) => {
      if (typeof options.getRowId === 'function') return options.getRowId(row, index);
      if (rowKey && row && !Array.isArray(row)) return row[rowKey];
      return row && !Array.isArray(row) && row.id != null ? row.id : index;
    };
    let html = '<div class="table-scroll"' + (options.id ? ' id="' + esc(options.id) + '"' : '') + '><table class="data-table ' + esc(options.className || '') + '"' + (options.minWidth ? ' style="min-width:' + esc(options.minWidth) + '"' : '') + '>';
    if (options.caption) html += '<caption class="sr-only">' + esc(options.caption) + '</caption>';
    html += '<thead><tr>';
    if (selectable) html += '<th class="selection-cell"><input type="checkbox" data-table-select-all aria-label="选择当前表格全部行"></th>';
    headers.forEach(header => {
      const classes = [header.align === 'right' ? 'num' : header.align === 'center' ? 'center' : '', header.className || ''].filter(Boolean).join(' ');
      html += '<th' + (classes ? ' class="' + esc(classes) + '"' : '') + (header.width ? ' style="width:' + esc(header.width) + '"' : '') + ' scope="col">' + esc(header.label == null ? header.key : header.label) + '</th>';
    });
    if (hasActions) html += '<th scope="col">操作</th>';
    html += '</tr></thead><tbody>';
    if (!rows.length) {
      html += '<tr><td colspan="' + Math.max(1, columns) + '"><div class="empty">' + icon('empty') + '<div class="empty-title">' + esc(options.emptyTitle || '暂无可展示数据') + '</div><div class="empty-description">' + esc(options.empty || '当前筛选没有匹配记录，请调整时间或维度；缺数不按 0 处理。') + '</div></div></td></tr>';
    } else rows.forEach((row, rowIndex) => {
      const id = String(idFor(row, rowIndex));
      html += '<tr data-row-index="' + rowIndex + '" data-row-id="' + esc(id) + '"' + (options.clickable ? ' class="clickable" tabindex="0"' : '') + '>';
      if (selectable) html += '<td class="selection-cell"><input type="checkbox" data-table-select value="' + esc(id) + '" aria-label="选择第' + (rowIndex + 1) + '行"' + (selected.has(id) ? ' checked' : '') + '></td>';
      headers.forEach((header, columnIndex) => {
        const value = Array.isArray(row) ? row[columnIndex] : row == null ? null : row[header.key];
        const classes = [header.align === 'right' ? 'num' : header.align === 'center' ? 'center' : '', header.cellClass || ''].filter(Boolean).join(' ');
        html += '<td' + (classes ? ' class="' + esc(classes) + '"' : '') + '>' + cellContent(value, header, row, rowIndex) + '</td>';
      });
      if (hasActions) {
        let actions = options.actions;
        if (typeof actions === 'function') actions = actions(row, rowIndex);
        if (Array.isArray(actions)) actions = actions.map(action => '<button type="button" class="table-link" data-table-action="' + esc(action.key || action.id || action.label) + '">' + (action.icon ? icon(action.icon) : '') + esc(action.label) + '</button>').join('');
        html += '<td><div class="table-actions">' + (actions == null ? '' : String(actions)) + '</div></td>';
      }
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    if (options.target) {
      const target = typeof options.target === 'string' ? $(options.target) : options.target;
      if (target) { target.innerHTML = html; bindTable(target, options); return target; }
    }
    return html;
  }

  function bindTable(target, callbacks) {
    target = typeof target === 'string' ? $(target) : target;
    if (!target) return null;
    target.addEventListener('click', event => {
      const action = event.target.closest('[data-table-action]');
      const rowElement = event.target.closest('tr[data-row-index]');
      const rowIndex = rowElement ? Number(rowElement.dataset.rowIndex) : -1;
      const row = callbacks.rows && rowIndex >= 0 ? callbacks.rows[rowIndex] : undefined;
      if (action) {
        if (typeof callbacks.onAction === 'function') callbacks.onAction(action.dataset.tableAction, row, rowIndex, event);
        return;
      }
      if (rowElement && !event.target.closest('button, input, a, select') && typeof callbacks.onRow === 'function') callbacks.onRow(row, rowIndex, event);
    });
    target.addEventListener('change', event => {
      if (event.target.matches('[data-table-select-all]')) {
        $$('[data-table-select]', target).forEach(input => { input.checked = event.target.checked; });
      }
      if (event.target.matches('[data-table-select], [data-table-select-all]')) {
        const ids = $$('[data-table-select]:checked', target).map(input => input.value);
        const rows = ids.map(id => {
          const element = $('tr[data-row-id="' + (global.CSS && CSS.escape ? CSS.escape(id) : id) + '"]', target);
          return element && callbacks.rows ? callbacks.rows[Number(element.dataset.rowIndex)] : id;
        });
        if (typeof callbacks.onSelect === 'function') callbacks.onSelect(rows, ids);
        emit('wb:table-select', { target, rows, ids });
      }
    });
    return target;
  }

  function trapFocus(event) {
    const top = layers[layers.length - 1];
    if (!top || event.key !== 'Tab') return;
    const items = focusableElements(top.dialog);
    if (!items.length) { event.preventDefault(); top.dialog.focus(); return; }
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || !top.dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !top.dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  }

  function activeConditionSummary() {
    const D = data();
    const state = WB.state;
    const conditions = [
      { text: (state.period || '年内累计') + ' · ' + (state.caliber || '业务账期'), strong: true },
      { text: '截至 ' + (state.month || state.end || '—') },
      { text: state.company || '四家经营单位' }
    ];
    const region = (D.adminRegions || []).find(item => item.code === state.admin);
    const zone = (D.functionalZones || []).find(item => item.code === state.functional);
    if (region) conditions.push({ text: region.name });
    if (state.org) conditions.push({ text: state.org });
    if (zone) conditions.push({ text: zone.short || zone.name });
    if (state.nature) conditions.push({ text: state.nature });
    if (state.industry) conditions.push({ text: state.industry });
    if (state.caliberMm) conditions.push({ text: state.caliberMm });
    if (state.meterType) conditions.push({ text: state.meterType });
    if (state.layer === 'ADJUSTED') conditions.push({ text: '含已复核补充层', strong: true });
    return conditions;
  }

  function enhanceContent() { refreshIcons(); }

  function startContentEnhancements() {
    enhanceContent();
    if (!global.MutationObserver) return;
    const observer = new MutationObserver(records => {
      if (records.some(record => record.addedNodes.length)) enhanceContent();
    });
    ['#globalFilters', '#page'].forEach(selector => {
      const container = $(selector);
      if (container) observer.observe(container, { childList: true });
    });
  }

  function bindGlobalEvents() {
    document.addEventListener('click', event => {
      const nav = event.target.closest('[data-nav]');
      if (nav) { event.preventDefault(); navigate(nav.dataset.nav); return; }
      if (!event.target.closest('#searchPanel, #globalSearchBtn')) closeSearch();
      if (!event.target.closest('#accountPanel, #userBtn')) closeAccount();
    });
    document.addEventListener('keydown', event => {
      const tag = document.activeElement && document.activeElement.tagName;
      const typing = /INPUT|TEXTAREA|SELECT/.test(tag || '') || (document.activeElement && document.activeElement.isContentEditable);
      if ((event.key === '/' && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) {
        event.preventDefault(); openSearch(); return;
      }
      if (event.key === 'Escape') {
        const top = layers[layers.length - 1];
        if (top && !top.options.persistent) { event.preventDefault(); closeLayer(top, false); return; }
        if ($('#searchPanel') && !$('#searchPanel').hidden) { event.preventDefault(); closeSearch(true); return; }
        if ($('#accountPanel') && !$('#accountPanel').hidden) { event.preventDefault(); closeAccount(true); }
      }
      trapFocus(event);
    });
    global.addEventListener('hashchange', () => { closePopovers(); setActiveNav(routeFromHash().module); });
    global.addEventListener('resize', () => {
      if ($('#searchPanel') && !$('#searchPanel').hidden) positionPopover($('#searchPanel'), $('#globalSearchBtn'));
      if ($('#accountPanel') && !$('#accountPanel').hidden) positionPopover($('#accountPanel'), $('#userBtn'));
    });
  }

  function init(options) {
    options = options && typeof options === 'object' && !options.type ? options : {};
    if (typeof options.onNavigate === 'function') navigationHandler = options.onNavigate;
    if (typeof options.onRoleChange === 'function') roleChangeHandler = options.onRoleChange;
    if (Array.isArray(options.modules) && options.modules.length) {
      const defaults = modules.slice();
      modules = options.modules.map((item, index) => {
        if (typeof item === 'string') item = { key: item };
        const key = item.key || item.id || item.module || 'module-' + index;
        const fallback = defaults.find(entry => entry.key === key) || {};
        return Object.assign({}, fallback, item, {
          key,
          label: item.label || item.name || item.title || fallback.label || key,
          icon: item.icon || fallback.icon || 'file',
          group: item.group || item.section || fallback.group || '业务工作台',
          desc: item.desc || item.description || item.subtitle || fallback.desc || ''
        });
      });
      WB.modules = modules;
      if (WB.shell) WB.shell.modules = modules;
    }
    if (initialized) {
      if (options.modules) { renderTopbar(); renderSidebar(); }
      setActiveNav(options.activeModule || routeFromHash().module);
      updateRoleDisplay();
      return WB.shell;
    }
    initialized = true;
    try { if (localStorage.getItem('wb_nav_collapsed') === '1') document.body.classList.add('nav-collapsed'); } catch (_) {}
    renderTopbar();
    renderSidebar();
    if (options.manageFilters === true || !Object.keys(options).length) renderFilters();
    bindGlobalEvents();
    if (!location.hash) history.replaceState(null, '', '#/home');
    setActiveNav(options.activeModule || routeFromHash().module);
    refreshIcons();
    startContentEnhancements();
    emit('wb:shell-ready', { shell: WB.shell });
    return WB.shell;
  }

  WB.modules = modules;
  WB.icon = icon;
  WB.hydrateIcons = refreshIcons;
  WB.shell = {
    init, renderShell: init, modules, roles,
    navigate, currentRoute: routeFromHash, setActiveNav, setActive: setActiveNav,
    currentFilters, updateFilter, resetFilters, renderFilters,
    openDrawer, openModal, closeLayers, toast, confirm: confirmDialog, badge,
    renderTable, bindTable, setRole,
    openSearch, closeSearch, openAccount, closeAccount, closePopovers,
    icon, refreshIcons, hydrateIcons: refreshIcons, announce,
    escape: esc
  };

  // 应用入口统一调用init，避免旧自动筛选器注入页面。
})(window);
