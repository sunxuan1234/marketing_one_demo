/* Shared application shell, global Filter and accessible UI primitives. */
(function (global) {
  'use strict';

  const WB = global.WB = global.WB || {};
  const FILTER_DEFAULTS = {
    period: '年内累计', caliber: '财务自然月', start: '2026-01', end: '2026-10',
    year: '2026', month: '2026-10', company: '', admin: '', functional: '', org: '',
    nature: '', industry: '', caliberMm: '', meterType: '', layer: 'SOURCE', orgNodeId: ''
  };
  WB.state = Object.assign({}, FILTER_DEFAULTS, WB.state || {});

  let modules = [
    { key: 'home', label: '首页', icon: 'dashboard', group: '经营总览', desc: '集团五指标、行政地图与经营态势' },
    { key: 'drill', label: '指标分析下钻', icon: 'kpi', group: '经营总览', desc: '售水量、注册用户、产销差率、单价、收费率等九组指标下钻' },
    { key: 'dma', label: '分区计量', icon: 'flow', group: '业务监管', desc: 'DMA拓扑、夜间流量与压力监测' },
    { key: 'forecast', label: '售水量预测（下钻到线路）', icon: 'forecast', group: '业务监管', desc: '指标历史与预测结果查询' },
    { key: 'work', label: '工单预警', icon: 'work', group: '平台管理', desc: '源工单状态与办理记录查询' },
    { key: 'data', label: '数据集成与治理', icon: 'database', group: '平台管理', desc: '同步批次与基础信息异常' },
    { key: 'report', label: '报表中心', icon: 'report', group: '平台管理', desc: '标准报表、平台配置与角色权限' },
    { key: 'auth', label: '用户管理', icon: 'role', group: '平台管理', desc: '账号、角色与授权范围管理' },
    { key: 'set', label: '系统设置', icon: 'settings', group: '平台管理', desc: '字典、口径与平台参数配置' }
  ];
  const domainModules = {
    HOME: 'home', KPI: 'drill', USER: 'drill', METER: 'drill', ALERT: 'drill', PROJECT: 'drill',
    AR: 'drill', DMA: 'dma', FORECAST: 'forecast', WORK: 'work', DATA: 'data', REPORT: 'report', AUTH: 'auth', SET: 'set'
  };
  const domainDrillGroups = { KPI: 'sold', USER: 'reg', METER: 'meter', ALERT: 'alert', PROJECT: 'project', AR: 'ar' };

  let initialized = false;
  let navigationHandler = null;
  let identityUnsubscribe = null;
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
    document.title = route.label + '｜营销一体化V6';
  }

  function periodWindow(state) {
    const month = /^\d{4}-\d{2}$/.test(String(state.month || '')) ? String(state.month) : '2026-10';
    const year = month.slice(0, 4);
    const period = state.period || '年内累计';
    if (period === '当月') return { from: month, to: month };
    if (period === '近5年' || period === '近10年') {
      const span = period === '近5年' ? 5 : 10;
      return { from: String(Number(year) - span + 1) + '-01', to: month };
    }
    if (period === '自定义') {
      const from = /^\d{4}-\d{2}$/.test(String(state.start || '')) ? String(state.start) : year + '-01';
      const to = /^\d{4}-\d{2}$/.test(String(state.end || '')) ? String(state.end) : month;
      return from <= to ? { from, to } : { from: to, to: from };
    }
    return { from: year + '-01', to: month };
  }

  function scopedRows(name, fallback) {
    const E = global.WB && global.WB.engine;
    if (!fallback && E && typeof E.scopedRows === 'function') {
      try { const rows = E.scopedRows(name); if (Array.isArray(rows)) return rows; } catch (_) {}
    }
    const source = fallback || (data()[name] || []);
    const A = access();
    if (!A || typeof A.scopeRows !== 'function') return Array.isArray(source) ? source : [];
    try { const rows = A.scopeRows(source); return Array.isArray(rows) ? rows : []; } catch (_) { return []; }
  }

  function scopedAlerts() {
    return scopedRows('alerts');
  }

  function visibleAlertCount() {
    if (!access()) return null;
    const window = periodWindow(WB.state);
    return scopedAlerts().filter(item => item && item.category !== '基础信息' && String(item.period || item.date || '').slice(0, 7) >= window.from && String(item.period || item.date || '').slice(0, 7) <= window.to).length;
  }

  function renderTopbar() {
    const target = $('#appTopbar');
    if (!target) return;
    const alertCount = visibleAlertCount();
    const current = identity();
    const asOf = String(data().asOf || '');
    const asOfShort = asOf ? asOf.slice(5, 16) : '';
    target.innerHTML = '<header class="topbar">' +
      '<a class="brand" href="#/home" data-nav="home" aria-label="返回首页">' +
        '<span class="brand-mark">' + icon('water') + '</span>' +
        '<span class="brand-copy"><span class="brand-name">营销一体化管控平台</span><span class="brand-sub">ZHENGZHOU WATER GROUP</span></span>' +
      '</a>' +
      '<div class="topbar-main">' +
        '<div class="topbar-context">' + icon('building') + '<span>郑州水务集团</span><span class="context-separator">/</span><span id="currentModuleContext">首页</span></div>' +
        (asOfShort ? '<span class="topbar-freshness" title="合成演示数据截至 ' + esc(asOf) + '">' + icon('clock') + '更新至 ' + esc(asOfShort) + '</span>' : '') +
        '<span class="prototype-badge" title="交互原型｜合成演示身份｜源系统只读隔离"><span class="status-dot"></span>演示环境</span>' +
        '<div class="topbar-actions">' +
          '<button type="button" class="top-action top-search" id="globalSearchBtn" aria-label="全局搜索，快捷键斜杠" aria-expanded="false" aria-controls="searchPanel" title="搜索功能、报表或业务模块（/）">' + icon('search') + '<span>搜索功能、报表或业务模块</span><kbd>/</kbd></button>' +
          '<button type="button" class="top-action" id="alertBtn" aria-label="进入数据预警异常' + (alertCount == null ? '' : '，' + alertCount + '项未处理预警') + '" title="数据预警异常">' + icon('bell') + (alertCount == null ? '<span class="alert-dot is-pending" aria-hidden="true">—</span>' : '<span class="alert-dot' + (alertCount ? '' : ' is-zero') + '" aria-hidden="true">' + alertCount + '</span>') + '</button>' +
          '<button type="button" class="top-action" id="fullscreenBtn" aria-label="切换全屏显示" title="全屏显示">' + icon('fullscreen') + '</button>' +
          '<button type="button" class="top-action user-action" id="userBtn" aria-label="账号与演示身份" aria-expanded="false" aria-controls="accountPanel" title="账号与演示身份"><span class="avatar" id="topbarAvatar">' + esc(displayInitial(current)) + '</span><span class="user-copy"><span class="user-name" id="topbarUserName">' + esc(displayName(current)) + '</span><span class="user-role" id="topbarUserRole">' + esc(roleLabel(current.roleId) + (current.rangeStatus === 'unbound' ? ' · 未绑定' : ' · ' + scopeSummaryText(current))) + '</span></span>' + icon('chevronDown') + '</button>' +
        '</div>' +
      '</div>' +
    '</header>';

    $('#globalSearchBtn').addEventListener('click', () => toggleSearch());
    $('#alertBtn').addEventListener('click', () => navigate('drill', { group: 'alert' }));
    $('#userBtn').addEventListener('click', () => toggleAccount());
    $('#fullscreenBtn').addEventListener('click', toggleFullscreen);
    refreshIdentityDisplay();
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

  /* 查询条统一由应用层 queryPanel 渲染；shell 只保留状态读写，避免出现第二套全局查询 UI。 */
  function updateFilter(key, value) {
    if (!(key in FILTER_DEFAULTS) || key === 'orgNodeId') return;
    WB.state[key] = value;
    if (key === 'month') { WB.state.end = value || WB.state.end; WB.state.year = value ? value.slice(0, 4) : WB.state.year; }
    if (key === 'end' && value) WB.state.month = value;
    if (key === 'company') WB.state.org = '';
    const detail = { key, value, filters: currentFilters() };
    emit('wb:filter-change', detail);
    emit('wb:state-change', detail);
  }

  function resetFilters() {
    const orgNodeId = WB.state.orgNodeId;
    Object.keys(FILTER_DEFAULTS).forEach(key => { WB.state[key] = FILTER_DEFAULTS[key]; });
    WB.state.orgNodeId = orgNodeId;
    renderFilters();
    const detail = { reset: true, filters: currentFilters() };
    emit('wb:filter-change', detail);
    emit('wb:state-change', detail);
  }

  function renderFilters() {
    if (global.WBApp && typeof global.WBApp.render === 'function') global.WBApp.render(false);
  }

  function currentFilters() { return Object.assign({}, WB.state); }

  const access = () => global.WBAccess || null;

  function identity() {
    const A = access();
    if (A && typeof A.current === 'function') {
      try { return A.current() || {}; } catch (_) { return {}; }
    }
    return { personaId: '', roleId: '', label: '身份数据未加载', roleLabel: '演示身份', scopeLabel: '', rangeStatus: 'unbound', demoEnabled: false, scopeVersion: 0, scope: null };
  }

  function personaList() {
    const A = access();
    if (A && typeof A.personas === 'function') {
      try { const list = A.personas(); if (Array.isArray(list) && list.length) return list; } catch (_) {}
    }
    const demo = global.WBDemo;
    return demo && typeof demo.list === 'function' ? (demo.list() || []) : [];
  }

  function roleList() {
    const A = access();
    if (A && typeof A.roles === 'function') {
      try { const list = A.roles(); if (Array.isArray(list) && list.length) return list; } catch (_) {}
    }
    return [];
  }

  function personaById(id) { return personaList().find(item => item && item.id === id) || null; }
  function roleLabel(roleId) { const role = roleList().find(item => item && item.id === roleId); return role ? role.label : (roleId || ''); }
  function basisText(code) { return code === 'C' ? '源表原文' : code === 'E' ? '虚构绑定演示' : code === 'P' ? '源表未提供' : ''; }
  function displayName(current, persona) {
    if (current && current.displayName) return current.displayName;
    const p = persona || personaById((current || {}).personaId) || {};
    if (current && current.name) return current.name;
    return p.name || ('演示 · ' + ((current || {}).roleLabel || p.label || '身份'));
  }
  function displayInitial(current, persona) { const text = String(displayName(current, persona)); return text.replace(/^演示 · /, '').slice(0, 1); }
  function scopeMembers(set) { return set instanceof Set ? set.size : (Array.isArray(set) ? set.length : 0); }
  function cardCount(current) {
    const counts = current && current.counts;
    if (counts && typeof counts.accounts === 'number') return counts.accounts;
    return scopeMembers(current && current.scope && current.scope.accountIds);
  }
  function scopeNodeIds() { const scope = identity().scope; return scope && scope.nodeIds ? scope.nodeIds : null; }

  /* 范围文案唯一来源：WBAccess.current().scopeLabel（Core 已按当前绑定单位派生），本地不再派生第二套标签。 */
  function scopeSummaryText(current) {
    const scope = current.scope || {};
    if (current.rangeStatus === 'unbound' || scope.unbound) return '未绑定责任范围';
    return current.scopeLabel || current.bindingLabel || '当前责任范围';
  }

  function updateAlertBadge() {
    const button = $('#alertBtn');
    if (!button) return;
    const alertCount = visibleAlertCount();
    Array.from(button.querySelectorAll('.alert-dot')).forEach(dot => dot.remove());
    const dot = document.createElement('span');
    dot.className = 'alert-dot' + (alertCount == null ? ' is-pending' : alertCount ? '' : ' is-zero');
    dot.setAttribute('aria-hidden', 'true');
    dot.textContent = alertCount == null ? '—' : String(alertCount);
    button.appendChild(dot);
    button.setAttribute('aria-label', '进入数据预警异常' + (alertCount == null ? '，当前身份未加载预警' : '，' + alertCount + '项未处理预警'));
  }

  function refreshIdentityDisplay() {
    const current = identity();
    const nameEl = $('#topbarUserName'), roleEl = $('#topbarUserRole'), avatar = $('#topbarAvatar');
    if (nameEl) nameEl.textContent = displayName(current);
    if (roleEl) roleEl.textContent = (roleLabel(current.roleId) || '演示身份') + (current.rangeStatus === 'unbound' ? ' · 未绑定' : ' · ' + scopeSummaryText(current));
    if (avatar) avatar.textContent = displayInitial(current);
    updateAlertBadge();
    renderScopeSummary();
  }

  function renderScopeSummary() {
    const host = $('#scopeSummary');
    if (!host) return;
    const current = identity();
    const persona = personaById(current.personaId);
    const scope = current.scope || {};
    const unbound = current.rangeStatus === 'unbound' || !!scope.unbound;
    /* 授权表卡数取 accountIds（户数口径），组织节点数单独标注，两者不能混用。 */
    const cards = (current.counts && typeof current.counts.accounts === 'number') ? current.counts.accounts : scopeMembers(scope.accountIds);
    const nodes = (current.counts && typeof current.counts.nodes === 'number') ? current.counts.nodes : scopeMembers(scope.nodeIds);
    host.hidden = false;
    host.className = 'scope-summary' + (unbound ? ' is-unbound' : '');
    host.innerHTML = '<div class="scope-summary-inner">' +
      '<span class="scope-summary-label">' + icon('shield') + '我的责任范围</span>' +
      '<span class="scope-summary-value">' + esc(scopeSummaryText(current)) + '</span>' +
      (unbound ? '<span class="badge gray">空绑定</span>' : '<span class="badge gray" title="当前身份可见的授权表卡（户）数">' + esc(String(cards)) + ' 个授权表卡</span><span class="badge gray" title="当前身份可见的授权组织节点数">' + esc(String(nodes)) + ' 个组织节点</span>') +
      '<span class="scope-summary-basis" title="范围依据 ' + esc(basisText(persona && persona.scopeBasis) || '—') + '；动作依据 ' + esc(basisText(persona && persona.actionBasis) || '—') + '">范围依据 ' + esc((persona && persona.scopeBasis) || 'P') + '</span>' +
      '<span class="scope-summary-note">查询只能在该范围内缩小</span>' +
    '</div>';
  }

  function setPersona(personaId, options, ui) {
    const A = access();
    const persona = personaById(personaId);
    if (!A || !persona) { toast('演示身份数据尚未加载，无法切换', 'warning'); return null; }
    let applied = null;
    try {
      applied = options && Object.keys(options).length ? A.setPersona(personaId, options) : A.setPersona(personaId);
    } catch (_) { applied = null; }
    refreshIdentityDisplay();
    if (!(ui && ui.keepPanel)) closeAccount(true);
    const suffix = options && options.unitId ? '（绑定单位已切换）' : '';
    announce('已切换演示身份：' + (persona.label || personaId) + suffix);
    toast('已切换为「' + (persona.label || personaId) + '」' + suffix, 'success');
    return applied;
  }

  function setDemoEnabled(enabled) {
    const A = access();
    if (!A || typeof A.setDemo !== 'function' || typeof A.capabilities !== 'function') { toast('演示能力开关不可用', 'warning'); return null; }
    const caps = (A.capabilities() || {}).demo || [];
    let applied = null;
    caps.forEach(cap => { try { applied = A.setDemo(cap, !!enabled); } catch (_) {} });
    refreshIdentityDisplay();
    if ($('#accountPanel') && !$('#accountPanel').hidden) renderAccountPanel(true);
    announce(enabled ? '已开启扩展演示能力，全部标注暂定演示' : '已关闭扩展演示能力，恢复基础演示动作');
    toast(enabled ? '扩展演示能力已开启：暂定演示 · 非正式授权' : '扩展演示能力已关闭', enabled ? 'warning' : 'success');
    return applied;
  }

  /* 弹层定位一律按布局视口（documentElement.clientWidth，已扣滚动条）计算，
     不用 innerWidth，也不依赖 100vw；宽度用像素显式写入，避免 calc(100vw - n) 溢出。 */
  function viewportBox() {
    const doc = document.documentElement || {};
    return {
      width: Math.max(240, doc.clientWidth || global.innerWidth || 0),
      height: Math.max(320, doc.clientHeight || global.innerHeight || 0)
    };
  }

  function positionPopover(panel, anchor, options) {
    if (!panel || !anchor) return;
    const opts = options || {};
    const margin = 8;
    const box = viewportBox();
    const rect = anchor.getBoundingClientRect();
    const width = Math.max(240, Math.min(opts.width || 420, box.width - margin * 2));
    panel.style.width = width + 'px';
    panel.style.maxWidth = 'calc(100% - ' + margin * 2 + 'px)';
    const right = Math.min(Math.max(margin, box.width - rect.right), Math.max(margin, box.width - margin - width));
    panel.style.right = right + 'px';
    panel.style.left = 'auto';
    const top = Math.max(margin, Math.min(rect.bottom + 8, box.height - 96));
    panel.style.top = top + 'px';
    panel.style.maxHeight = Math.max(200, box.height - top - margin) + 'px';
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
    positionPopover(panel, anchor, { width: 570 });
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
      module: domainModules[item.domain] || 'home', drillGroup: domainDrillGroups[item.domain], functionId: item.id, title: item.name || item.id,
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
      return heading + '<button type="button" class="search-result" role="option" aria-selected="false" data-search-index="' + index + '" data-search-module="' + esc(item.module) + '"' + (item.drillGroup ? ' data-search-group="' + esc(item.drillGroup) + '"' : '') + (item.functionId ? ' data-search-function="' + esc(item.functionId) + '"' : '') + (item.reportId ? ' data-search-report="' + esc(item.reportId) + '"' : '') + '>' +
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
    if (button.dataset.searchGroup) params.group = button.dataset.searchGroup;
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

  const ACTION_LABELS = {
    'account.create': '新建账号', 'account.update': '修改账号', 'account.reset': '重置密码', 'plan.write': '写入计划值',
    'account.toggle': '账号启停', 'rule.write': '异常规则增删改', 'work.transfer': '演示派发 / 转单', 'parameter.write': '参数增删改', 'forecast.factor': '预测因子调整'
  };
  const UNIT_OPTIONS = [{ value: '1', label: '营业中心' }, { value: '2', label: '港区供水' }, { value: '3', label: '高新' }, { value: '4', label: '东区供水' }];

  function toggleAccount() { const panel = $('#accountPanel'); if (panel && !panel.hidden) closeAccount(true); else openAccount(); }

  function capabilitiesOf(personaId) {
    const demo = global.WBDemo;
    if (demo && typeof demo.capabilities === 'function') {
      try {
        const caps = demo.capabilities(personaId) || {};
        return { normal: Array.isArray(caps.normal) ? caps.normal : [], demo: Array.isArray(caps.demo) ? caps.demo : [] };
      } catch (_) {}
    }
    return { normal: [], demo: [] };
  }

  function actionLabel(action) {
    const A = access();
    const shared = A && A.ACTION_LABELS ? A.ACTION_LABELS[action] : '';
    return shared || ACTION_LABELS[action] || action;
  }

  function capabilityList(actions) {
    if (!actions || !actions.length) return '<div class="capability-empty">源表未提供动作授权（P）</div>';
    return '<ul class="capability-list">' + actions.map(action => '<li><code>' + esc(action) + '</code><span>' + esc(actionLabel(action)) + '</span></li>').join('') + '</ul>';
  }

  function accountPanelHtml() {
    const current = identity();
    const persona = personaById(current.personaId) || {};
    const roles = roleList();
    const personas = personaList();
    const unbound = current.rangeStatus === 'unbound';
    const capabilities = capabilitiesOf(current.personaId);
    const enabledCaps = Array.isArray(current.demoEnabled) ? current.demoEnabled : (current.demoEnabled ? capabilities.demo : []);
    const demoOn = enabledCaps.length > 0;
    const isDeptAdmin = current.roleId === 'R3' || persona.roleId === 'R3';
    const unitId = String(current.bindingUnitId != null ? current.bindingUnitId : ((persona.binding && persona.binding.branchUnitId != null) ? persona.binding.branchUnitId : ''));
    const groups = roles.length ? roles : [...new Set(personas.map(item => item.roleId))].map(id => ({ id, label: roleLabel(id) }));
    const groupHtml = groups.map(role => {
      const members = personas.filter(item => item.roleId === role.id);
      if (!members.length) return '';
      return '<details class="persona-group" open><summary class="persona-group-head"><span class="persona-group-title">' + esc(role.label) + '</span><span class="persona-group-meta">' + esc(role.id) + ' · ' + members.length + ' 个身份</span>' + icon('chevronDown') + '</summary>' +
        '<div class="persona-group-body" role="menu">' + members.map(item => {
          const checked = item.id === current.personaId;
          const basis = (item.scopeBasis || 'P');
          return '<button type="button" class="role-option persona-option" role="menuitemradio" aria-checked="' + checked + '" data-persona="' + esc(item.id) + '">' +
            '<span class="persona-basis is-' + esc(basis.toLowerCase()) + '" title="范围依据 ' + esc(basisText(basis) || basis) + '">' + esc(basis) + '</span>' +
            '<span class="role-option-copy"><span class="role-option-title">' + esc(item.label || item.id) + '</span><span class="role-option-desc">' + esc(item.id === current.personaId && !unbound ? scopeSummaryText(current) : (item.bindingLabel || (item.rangeStatus === 'unbound' ? '未绑定责任范围' : ''))) + ' · ' + esc(String(item.id === current.personaId && !unbound ? cardCount(current) : (item.scopeCount == null ? 0 : item.scopeCount))) + ' 个授权表卡 · ' + esc(basisText(basis) || '范围待确认') + '</span></span>' +
            '<span class="role-check">' + icon('check') + '</span></button>';
        }).join('') + '</div></details>';
    }).join('');

    const bindingHtml = (current.roleId === 'R4' || current.roleId === 'R5')
      ? '<div class="persona-binding"><div class="persona-binding-title">演示绑定单位</div><div class="persona-binding-options" role="radiogroup" aria-label="演示绑定单位">' +
        UNIT_OPTIONS.map(unit => '<button type="button" class="binding-option" role="radio" aria-checked="' + (unitId === unit.value) + '" data-binding-unit="' + unit.value + '">' + esc(unit.label) + '</button>').join('') +
        '</div><p class="persona-binding-note">更换绑定单位只调整本次演示责任范围，不改变业务角色。</p></div>'
      : '';

    const demoHtml = isDeptAdmin
      ? '<div class="demo-capability"><div class="demo-capability-head"><span class="demo-capability-title">基础管理演示（C4）</span>' + (demoOn ? '<span class="demo-flag">暂定演示 · 非正式授权</span>' : '<span class="badge gray">默认关闭</span>') + '</div>' +
        capabilityList(capabilities.normal) +
        '<div class="demo-capability-toggle"><span><strong>扩展演示能力</strong><span class="muted">账号启停、规则、转单、参数、预测因子</span></span><button type="button" class="switch" role="switch" aria-checked="' + demoOn + '" data-demo-toggle aria-label="扩展演示能力">' + icon('check') + '</button></div>' +
        (demoOn ? capabilityList(capabilities.demo) : '<p class="demo-capability-note">开启后可演示扩展动作，全程标注「暂定演示 · 非正式授权」；关闭或切换身份即恢复 C4 基础动作。</p>') +
        '</div>'
      : '';

    return '<div class="account-summary"><span class="avatar">' + esc(displayInitial(current)) + '</span><div class="account-summary-copy">' +
        '<div class="account-summary-name">' + esc(displayName(current, persona)) + '</div>' +
        '<div class="account-summary-org">' + esc(current.roleLabel || roleLabel(current.roleId) || '演示身份') + ' · ' + esc(scopeSummaryText(current)) + '</div>' +
        '<div class="account-summary-range">' + esc(unbound ? '空绑定：入口保留，数据为空' : (cardCount(current) + ' 个授权表卡 · ' + scopeMembers(current.scope && current.scope.nodeIds) + ' 个组织节点' + (current.bindingException ? ' · ' + current.bindingException : ''))) + '</div>' +
      '</div><span class="badge ' + (unbound ? 'gray' : 'orange') + '">暂定演示</span></div>' +
      '<div class="persona-basis-line">身份：' + esc(displayName(current, persona)) + ' · 范围依据 ' + esc(persona.scopeBasis || 'P') + ' · 动作依据 ' + esc(persona.actionBasis || 'P') + ' · scopeVersion ' + esc(String(current.scopeVersion == null ? 0 : current.scopeVersion)) + '</div>' +
      '<div class="role-head"><div class="role-title">演示身份（' + personas.length + ' 个）</div><div class="role-subtitle">切换身份即切换授权范围；业务角色不由页面查询改变</div></div>' +
      '<div class="persona-picker" aria-label="选择演示身份">' + groupHtml + '</div>' +
      bindingHtml + demoHtml +
      '<div class="role-boundary"><strong>真实账号</strong><div>尚未接入真实账号与统一登录，暂无真实账号。</div><div>业务角色、演示身份、页面查询三者分离；查询只能在责任范围内缩小。</div></div>';
  }

  function renderAccountPanel(keepScroll) {
    const panel = $('#accountPanel');
    if (!panel || panel.hidden) return;
    const body = panel.querySelector('.account-scroll');
    const top = keepScroll && body ? body.scrollTop : 0;
    panel.innerHTML = '<div class="account-scroll">' + accountPanelHtml() + '</div>';
    $$('[data-persona]', panel).forEach(button => button.addEventListener('click', () => { if (button.getAttribute('aria-checked') !== 'true') setPersona(button.dataset.persona); }));
    $$('[data-binding-unit]', panel).forEach(button => button.addEventListener('click', () => {
      if (button.getAttribute('aria-checked') === 'true') return;
      setPersona(currentPersonaId(), { unitId: button.dataset.bindingUnit }, { keepPanel: true });
      if ($('#accountPanel') && !$('#accountPanel').hidden) { renderAccountPanel(true); positionPopover(panel, $('#userBtn')); }
    }));
    const toggle = $('[data-demo-toggle]', panel);
    if (toggle) toggle.addEventListener('click', () => {
      setDemoEnabled(toggle.getAttribute('aria-checked') !== 'true');
      if ($('#accountPanel') && !$('#accountPanel').hidden) { renderAccountPanel(true); positionPopover(panel, $('#userBtn')); }
    });
    const scroller = panel.querySelector('.account-scroll');
    if (scroller) scroller.scrollTop = top;
  }

  function currentPersonaId() { return identity().personaId; }

  function openAccount() {
    const panel = $('#accountPanel'), anchor = $('#userBtn');
    if (!panel || !anchor) return;
    closeSearch();
    accountPreviousFocus = document.activeElement;
    panel.hidden = false;
    renderAccountPanel(false);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '账号与演示身份');
    anchor.setAttribute('aria-expanded', 'true');
    anchor.classList.add('active');
    positionPopover(panel, anchor);
    const selected = $('.persona-option[aria-checked="true"]', panel);
    if (selected) selected.focus();
    else { const first = $('[data-persona]', panel); if (first) first.focus(); }
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
    // 共用同一宿主：同 z-index 下 DOM 追加顺序与 layers[] 一致，后开层自然盖住先开层。
    const host = $('#overlayLayer');
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
    if (!identityUnsubscribe && access() && typeof access().onChange === 'function') {
      identityUnsubscribe = access().onChange(() => {
        refreshIdentityDisplay();
        if ($('#accountPanel') && !$('#accountPanel').hidden) {
          renderAccountPanel(true);
          positionPopover($('#accountPanel'), $('#userBtn'));
        }
      });
    }
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
      refreshIdentityDisplay();
      return WB.shell;
    }
    initialized = true;
    try { if (localStorage.getItem('wb_nav_collapsed') === '1') document.body.classList.add('nav-collapsed'); } catch (_) {}
    renderTopbar();
    renderSidebar();
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
    init, renderShell: init, modules,
    navigate, currentRoute: routeFromHash, setActiveNav, setActive: setActiveNav,
    currentFilters, updateFilter, resetFilters, renderFilters, periodWindow,
    openDrawer, openModal, closeLayers, toast, confirm: confirmDialog, badge,
    renderTable, bindTable, setPersona, setDemoEnabled, refreshIdentity: refreshIdentityDisplay,
    identity, personas: personaList, roles: roleList, refreshAlertBadge: updateAlertBadge,
    openSearch, closeSearch, openAccount, closeAccount, closePopovers,
    icon, refreshIcons, hydrateIcons: refreshIcons, announce,
    escape: esc
  };

  // 应用入口统一调用init，避免旧自动筛选器注入页面。
})(window);
