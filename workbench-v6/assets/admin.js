/* 基础管理演示：纯内存、不回写源系统；全部写入先过 WBAccess.can，范围外拒绝且不改内存。 */
(() => {
  'use strict';

  const A = () => window.WBAccess || null;
  const D = () => window.WB_DATA || { companies: [], users: [] };
  const DEMO_CLOCK = () => (D().asOf || '2026-10-31 08:30') + ':00';
  const logList = [];
  let logSeq = 0;
  const planMap = new Map();   /* nodeId -> {value, by, at, label, unitId, scopeVersion} */
  const paramOverride = new Map();
  const metricPrefs = new Map();
  const denied = reason => ({ ok: false, reason: reason || 'denied' });

  /* —— 范围 —— */
  function current() {
    const a = A();
    if (!a || typeof a.current !== 'function') return { personaId: '', roleId: '', scope: { roots: [], nodeIds: new Set(), accountIds: new Set(), unitIds: new Set(), unbound: true }, scopeVersion: 0 };
    const c = a.current() || {};
    const s = c.scope || {};
    return {
      personaId: c.personaId || '', roleId: c.roleId || '', label: c.label || '', roleLabel: c.roleLabel || '',
      scopeVersion: Number(c.scopeVersion) || 0, rangeStatus: c.rangeStatus || 'unbound',
      scope: {
        roots: Array.isArray(s.roots) ? s.roots.map(String) : [],
        nodeIds: s.nodeIds instanceof Set ? s.nodeIds : new Set(s.nodeIds || []),
        accountIds: s.accountIds instanceof Set ? s.accountIds : new Set(s.accountIds || []),
        unitIds: s.unitIds instanceof Set ? new Set([...s.unitIds].map(String)) : new Set([...(s.unitIds || [])].map(String)),
        unbound: !!s.unbound
      }
    };
  }
  const inScope = subject => {
    const s = current().scope;
    if (!s || s.unbound) return false;
    if (!subject) return s.nodeIds.size > 0;
    const nodeId = subject.orgNodeId != null ? String(subject.orgNodeId) : (subject.nodeId != null ? String(subject.nodeId) : '');
    if (nodeId && s.nodeIds.size && s.nodeIds.has(nodeId)) return true;
    if (subject.unitId != null && s.unitIds.size && s.unitIds.has(String(subject.unitId))) return true;
    if (subject.accountId != null && s.accountIds.size && s.accountIds.has(String(subject.accountId))) return true;
    return false;
  };
  const authorise = (action, subject) => {
    const a = A();
    if (!a || typeof a.can !== 'function') return denied('no-access-layer');
    let verdict;
    try { verdict = a.can(action, subject || {}); } catch (_) { verdict = false; }
    return verdict === true ? { ok: true } : denied('denied');
  };
  const unitOfNode = nodeId => {
    const org = window.WBOrg;
    if (!org || typeof org.unitOf !== 'function') return null;
    try { const unit = org.unitOf(String(nodeId)); return unit && unit.id != null ? String(unit.id) : null; } catch (_) { return null; }
  };
  const nodeLabel = nodeId => {
    const org = window.WBOrg;
    if (org && typeof org.get === 'function') { try { const n = org.get(String(nodeId)); if (n) return n.name || String(nodeId); } catch (_) {} }
    return String(nodeId);
  };
  /* 授权判定只用节点，避免部分子树单位被 fullUnits 规则误拒；日志里再单独记单位。 */
  const subjectFor = nodeId => ({ orgNodeId: String(nodeId) });
  function stamp() { return DEMO_CLOCK(); }

  function log(action, target, options = {}) {
    const me = current();
    const entry = {
      id: 'LOG-' + String(++logSeq).padStart(5, '0'),
      at: options.at || stamp(),
      actor: me.label || '演示身份',
      personaId: me.personaId, roleId: me.roleId, scopeVersion: me.scopeVersion,
      action, target: target == null ? '' : String(target),
      targetLabel: options.targetLabel || (target == null ? '' : String(target)),
      orgNodeId: options.orgNodeId == null ? '' : String(options.orgNodeId),
      unitId: options.unitId == null ? (options.orgNodeId ? (unitOfNode(options.orgNodeId) || '') : '') : options.unitId,
      detail: options.detail || '',
      result: options.result || 'ok',
      reason: options.reason || ''
    };
    logList.unshift(entry);
    if (logList.length > 500) logList.pop();
    return entry;
  }

  /* —— 演示账号（真实 SSO 未接入；此处仅为演示数据，按范围过滤） —— */
  /* 演示账号挂在所属经营单位节点上，便于按节点授权；所属单位可能只是部分子树，因此不能只靠 unitId 判定。 */
  const unitNode = unitId => {
    const org = window.WBOrg;
    if (!org || typeof org.unitById !== 'function') return '';
    try { const unit = org.unitById(String(unitId)); return unit && unit.nodeId ? String(unit.nodeId) : ''; } catch (_) { return ''; }
  };
  const accountList = [
    { id: 101, name: '演示值班员·营业中心', company: '营业中心', unitId: '1', orgNodeId: unitNode('1'), role: '分公司管理员', status: 'enabled', createdAt: '2026-03-02 09:12' },
    { id: 102, name: '演示抄表员·中原营业所', company: '营业中心', unitId: '1', orgNodeId: unitNode('1'), role: '员工', status: 'enabled', createdAt: '2026-04-18 14:05' },
    { id: 103, name: '演示值班员·港区供水', company: '港区供水', unitId: '2', orgNodeId: unitNode('2'), role: '分公司领导', status: 'disabled', createdAt: '2026-05-09 10:40' },
    { id: 104, name: '演示审核员·高新', company: '高新', unitId: '3', orgNodeId: unitNode('3'), role: '管理部领导', status: 'enabled', createdAt: '2026-06-21 16:28' }
  ];
  /* 账号 ID 单调唯一：初值取种子最大 ID，每次分配都再以现有最大值为下界，避免与任何已有账号撞号。 */
  let accountSeq = accountList.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
  const nextAccountId = () => {
    accountSeq = accountList.reduce((max, item) => Math.max(max, Number(item.id) || 0), accountSeq) + 1;
    return accountSeq;
  };
  const accounts = () => accountList.filter(item => inScope({ orgNodeId: item.orgNodeId, unitId: item.unitId })).map(item => ({ ...item }));
  const findAccount = id => accountList.find(item => String(item.id) === String(id)) || null;

  function addAccount(payload) {
    const data = payload || {};
    const nodeId = data.orgNodeId != null && data.orgNodeId !== '' ? String(data.orgNodeId) : '';
    const unitId = data.unitId != null && data.unitId !== '' ? String(data.unitId) : (nodeId ? String(unitOfNode(nodeId) || '') : '');
    const subject = nodeId ? subjectFor(nodeId) : (unitId ? { unitId } : {});
    const verdict = authorise('account.create', subject);
    if (!verdict.ok) { log('account.create', data.name || '', { result: 'denied', reason: '范围外或未授权', ...subject }); return denied('denied'); }
    if (!String(data.name || '').trim()) return denied('name-required');
    const company = data.company || ((D().companies || []).find(c => String(c.id) === String(unitId)) || {}).name || '';
    const item = {
      id: nextAccountId(), name: String(data.name).trim(), company, unitId: unitId || '', orgNodeId: nodeId || unitNode(unitId),
      role: data.role || '员工', status: 'enabled', createdAt: stamp()
    };
    accountList.push(item);
    log('account.create', item.id, { targetLabel: item.name, orgNodeId: nodeId, unitId: item.unitId, detail: '角色 ' + item.role });
    return { ok: true, id: item.id, account: { ...item } };
  }
  function toggleAccount(id) {
    const item = findAccount(id);
    if (!item) return denied('not-found');
    if (!inScope({ orgNodeId: item.orgNodeId, unitId: item.unitId })) return denied('denied');
    const verdict = authorise('account.toggle', item.orgNodeId ? subjectFor(item.orgNodeId) : { unitId: item.unitId });
    if (!verdict.ok) { log('account.toggle', id, { targetLabel: item.name, orgNodeId: item.orgNodeId, unitId: item.unitId, result: 'denied', reason: '需要显式启用扩展演示能力' }); return denied('denied'); }
    item.status = item.status === 'enabled' ? 'disabled' : 'enabled';
    log('account.toggle', item.id, { targetLabel: item.name, orgNodeId: item.orgNodeId, unitId: item.unitId, detail: item.status === 'enabled' ? '启用' : '停用' });
    return { ok: true, status: item.status, account: { ...item } };
  }
  const RESET_ACTION = 'account.' + 'reset';
  function resetPassword(id) {
    const item = findAccount(id);
    if (!item) return denied('not-found');
    if (!inScope({ orgNodeId: item.orgNodeId, unitId: item.unitId })) return denied('denied');
    const verdict = authorise(RESET_ACTION, item.orgNodeId ? subjectFor(item.orgNodeId) : { unitId: item.unitId });
    if (!verdict.ok) { log(RESET_ACTION, id, { targetLabel: item.name, orgNodeId: item.orgNodeId, unitId: item.unitId, result: 'denied', reason: '未授权' }); return denied('denied'); }
    const serial = 'DEMO-' + String(Date.now()).slice(-6) + '-' + String(id);
    log(RESET_ACTION, item.id, { targetLabel: item.name, orgNodeId: item.orgNodeId, unitId: item.unitId, detail: '演示口令已重置（不落盘、不回写源账号）' });
    return { ok: true, ticket: serial, message: '演示口令已重置：' + serial + '（仅本次会话有效，不写入任何存储）' };
  }
  const roleNames = () => {
    const a = A();
    const out = new Set();
    if (a && typeof a.roles === 'function') {
      try { (a.roles() || []).forEach(role => { if (role && role.id) out.add(String(role.id)); if (role && role.label) out.add(String(role.label)); }); } catch (_) {}
    }
    return out;
  };
  /* 编辑演示账号：改名/改角色/改归属节点；归属变更后单位由节点推导，不做单位兜底放行。 */
  function updateAccount(id, payload) {
    const item = findAccount(id);
    if (!item) return denied('not-found');
    if (!inScope({ orgNodeId: item.orgNodeId, unitId: item.unitId })) return denied('denied');
    const data = payload || {};
    const name = data.name == null ? '' : String(data.name).trim();
    if (!name) return denied('name-required');
    const nextNodeId = data.orgNodeId != null && data.orgNodeId !== '' ? String(data.orgNodeId) : (item.orgNodeId || '');
    const org = window.WBOrg;
    if (nextNodeId && (!org || typeof org.has !== 'function' || !org.has(nextNodeId))) {
      log('account.update', id, { targetLabel: item.name, orgNodeId: item.orgNodeId, unitId: item.unitId, result: 'denied', reason: '未知组织节点' });
      return denied('unknown-node');
    }
    if (nextNodeId && !inScope({ orgNodeId: nextNodeId })) return denied('denied');
    const nextUnitId = nextNodeId ? String(unitOfNode(nextNodeId) || '') : String(item.unitId || '');
    const subject = nextNodeId ? subjectFor(nextNodeId) : { unitId: item.unitId };
    const verdict = authorise('account.update', subject);
    if (!verdict.ok) {
      log('account.update', id, { targetLabel: item.name, orgNodeId: nextNodeId || item.orgNodeId, unitId: nextUnitId, result: 'denied', reason: '范围外或未授权' });
      return denied('denied');
    }
    const nextRole = data.role == null || data.role === '' ? item.role : String(data.role);
    const known = roleNames();
    if (known.size && !known.has(nextRole)) return denied('invalid-role');
    const changes = [];
    if (name && name !== item.name) { changes.push('名称 ' + item.name + ' → ' + name); item.name = name; }
    if (nextRole !== item.role) { changes.push('角色 ' + item.role + ' → ' + nextRole); item.role = nextRole; }
    if (nextNodeId && nextNodeId !== item.orgNodeId) { changes.push('归属节点 ' + (item.orgNodeId || '未绑定') + ' → ' + nextNodeId); item.orgNodeId = nextNodeId; }
    if (nextUnitId && nextUnitId !== String(item.unitId)) item.unitId = nextUnitId;
    const company = (D().companies || []).find(c => String(c.id) === String(item.unitId));
    if (company && company.name) item.company = company.name;
    item.updatedAt = stamp();
    log('account.update', item.id, { targetLabel: item.name, orgNodeId: item.orgNodeId, unitId: item.unitId, detail: changes.join('；') || '无字段变化' });
    return { ok: true, account: { ...item } };
  }
  const accountEnabledCount = () => accounts().filter(item => item.status === 'enabled').length;

  /* —— 计划值：按组织节点键控，写入需 plan.write 授权 —— */
  /* 计划值一律按组织节点 id 键控；调用方额外的兜底标签参数被忽略。 */
  const planOf = (nodeId) => {
    if (nodeId == null || nodeId === '') return null;
    const hit = planMap.get(String(nodeId));
    return hit ? hit.value : null;
  };
  const hasPlan = nodeId => nodeId != null && planMap.has(String(nodeId));
  function setPlan(nodeId, value, options = {}) {
    if (nodeId == null || nodeId === '') return denied('node-required');
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return denied('invalid-value');
    const subject = subjectFor(nodeId);
    const verdict = authorise('plan.write', subject);
    if (!verdict.ok) { log('plan.write', nodeId, { targetLabel: nodeLabel(nodeId), orgNodeId: nodeId, unitId: subject.unitId, result: 'denied', reason: '范围外或未授权' }); return denied('denied'); }
    const label = options.label || nodeLabel(nodeId);
    const me = current();
    planMap.set(String(nodeId), { value: numeric, by: me.label || '演示身份', at: stamp(), label, unitId: subject.unitId || '', scopeVersion: me.scopeVersion });
    log('plan.write', nodeId, { targetLabel: label, orgNodeId: nodeId, unitId: subject.unitId, detail: '计划值 ' + numeric + ' 万m³' });
    return { ok: true, value: numeric, entry: { ...planMap.get(String(nodeId)) } };
  }
  function resetPlan(nodeId) {
    if (nodeId == null || nodeId === '') return denied('node-required');
    const subject = subjectFor(nodeId);
    const verdict = authorise('plan.write', subject);
    if (!verdict.ok) { log('plan.write', nodeId, { targetLabel: nodeLabel(nodeId), orgNodeId: nodeId, unitId: subject.unitId, result: 'denied', reason: '范围外或未授权', detail: '清除计划值' }); return denied('denied'); }
    planMap.delete(String(nodeId));
    log('plan.write', nodeId, { targetLabel: nodeLabel(nodeId), orgNodeId: nodeId, unitId: subject.unitId, detail: '清除计划值' });
    return { ok: true };
  }
  const planEntries = () => [...planMap.entries()]
    .filter(([nodeId]) => inScope({ orgNodeId: nodeId }))
    .map(([nodeId, entry]) => ({ nodeId, label: entry.label, value: entry.value, by: entry.by, at: entry.at, unitId: entry.unitId }));

  /* —— 参数与指标口径 —— */
  /* 平台侧演示参数：仅写 paramOverride 内存 Map，供系统设置展示与审计；当前分析/报表计算未消费这些阈值，说明不得声称已联动。
     swapLeadDays 为换表提醒提前天数，与换表对比周期 WB.state.swapN（2/3期）相互独立，不复用 swapN 键名。 */
  function paramDefs() {
    return [
      { key: 'bigUser', label: '大用户判定阈值', unit: 'm³/月', value: 5000, min: 1000, max: 20000, step: 500, group: '计量口径', entry: '系统设置 · 报表参数', note: '月用水量判定阈值。仅页面内存保存，刷新还原；当前分析与报表未消费该阈值，调整不影响计算。' },
      { key: 'swapLeadDays', label: '换表提醒提前量', unit: '天', value: 30, min: 5, max: 90, step: 5, group: '计量口径', entry: '系统设置 · 报表参数', note: '换表提醒提前天数。仅页面内存保存，刷新还原；当前无提醒计算消费该项，与换表前后对比周期（2/3期）相互独立。' },
      { key: 'zeroN', label: '连续零量判定月数', unit: '月', value: 3, min: 1, max: 12, step: 1, group: '异常规则', entry: '系统设置 · 报表参数', note: '连续零量判定月数。仅页面内存保存，刷新还原；连续零水量报表按报表自身周期参数（2/3期）计算，未消费该项。' },
      { key: 'mnf', label: '最小夜间流量阈值', unit: 'm³/h', value: 0.5, min: 0.1, max: 5, step: 0.1, group: '分区计量', entry: '系统设置 · 报表参数', note: '最小夜间流量阈值。仅页面内存保存，刷新还原；DMA 夜间最小流量按逐时样例数据取最小值，未消费该阈值。' }
    ];
  }
  const paramValue = key => paramOverride.has(key) ? paramOverride.get(key) : (paramDefs().find(item => item.key === key) || {}).value;
  function setParam(key, value) {
    const def = paramDefs().find(item => item.key === key);
    if (!def) return denied('unknown-param');
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < def.min || numeric > def.max) return denied('out-of-range');
    const root = current().scope.roots[0] || '';
    const verdict = authorise('parameter.write', root ? subjectFor(root) : {});
    if (!verdict.ok) { log('parameter.write', key, { targetLabel: def.label, orgNodeId: root, result: 'denied', reason: '需要显式启用扩展演示能力' }); return denied('denied'); }
    paramOverride.set(key, numeric);
    log('parameter.write', key, { targetLabel: def.label, orgNodeId: root, detail: def.value + ' → ' + numeric + ' ' + def.unit });
    return { ok: true, value: numeric };
  }
  const paramCount = () => paramOverride.size;
  const paramOverrides = () => Object.fromEntries(paramOverride.entries());

  /* —— 指标显示偏好（不是操作授权） —— */
  /* 首页集团/单位5卡口径，顺序与 home.js metricMeta 一致；所/班组/员工的产销差率由首页自行排除。 */
  const METRICS = ['sold_vol', 'registered_count', 'loss_rate_pct', 'avg_price_yuan', 'charge_rate_pct'];
  const metrics = () => METRICS.map(key => ({ key, visible: metricVisible(key) }));
  function metricVisible(key) { return metricPrefs.has(key) ? metricPrefs.get(key) : true; }
  function toggleMetric(key) {
    if (!METRICS.includes(key)) return denied('unknown-metric');
    const next = !metricVisible(key);
    if (!next && METRICS.every(k => k === key || !metricVisible(k))) return { ok: false, message: '至少保留一个指标' };
    metricPrefs.set(key, next);
    log('metric.display', key, { targetLabel: key, detail: next ? '显示' : '隐藏', result: 'ok' });
    return { ok: true, visible: next };
  }

  /* —— 操作日志：按当前范围过滤，不泄漏其他单位 —— */
  /* 引擎审计（导出、守卫拒绝）并入平台日志：只展示本身份的动作，避免越权目标带出其他单位数据。 */
  const timeText = ts => {
    const date = new Date(ts == null ? Date.now() : ts);
    if (Number.isNaN(date.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
  };
  const ENGINE_ACTIONS = { export: '导出', deny: '权限拒绝' };
  function engineEntries(me) {
    const wb = window.WB || {};
    const E = wb.engine;
    const raw = typeof (E && E.auditLog) === 'function' ? (E.auditLog() || []) : (Array.isArray(wb.logs) ? wb.logs : []);
    const out = [];
    raw.forEach((row, index) => {
      if (!row || typeof row !== 'object') return;
      if (row.persona && row.persona !== me.personaId) return;
      if (row.kind === 'rule.write') return;   /* 与平台侧 rule.write 记录重复 */
      const prefix = ENGINE_ACTIONS[row.kind] || (row.kind ? String(row.kind) : '审计');
      out.push({
        id: 'EV-' + String(row.ts || index).slice(-6) + '-' + String(index + 1).padStart(3, '0'),
        at: timeText(row.ts),
        actor: me.label || '演示身份',
        personaId: row.persona || me.personaId || '',
        roleId: row.role || me.roleId || '',
        scopeVersion: Number(row.scopeVersion) || 0,
        action: prefix + (row.action ? '「' + String(row.action) + '」' : ''),
        target: row.rows != null ? String(row.rows) + ' 行' : '',
        targetLabel: row.rows != null ? String(row.rows) + ' 行' : '',
        orgNodeId: '', unitId: '', detail: '',
        result: row.ok ? 'ok' : 'denied',
        reason: row.reason ? String(row.reason) : ''
      });
    });
    return out;
  }
  const logs = () => {
    const me = current();
    /* 有节点归属的日志按范围过滤；无节点归属（如 metric.display、未定位对象的拒绝）只对本人身份可见。 */
    const own = logList.filter(entry => (entry.orgNodeId
      ? inScope({ orgNodeId: entry.orgNodeId, unitId: entry.unitId })
      : String(entry.personaId || '') === String(me.personaId || '')));
    const merged = own.concat(engineEntries(me));
    merged.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    return merged.slice(0, 200);
  };

  const periodKey = () => {
    const a = A();
    const c = a && a.current ? a.current() : { scopeVersion: 0 };
    return 'sv' + (Number(c.scopeVersion) || 0) + ':' + (window.WB.state && window.WB.state.period || '年内累计');
  };

  window.WB_ADMIN = {
    stamp, periodKey,
    scope: current, inScope, can: authorise,
    accounts, addAccount, updateAccount, toggleAccount, resetPassword, accountEnabledCount,
    planOf, hasPlan, setPlan, resetPlan, planEntries,
    paramDefs, paramValue, setParam, paramCount, paramOverrides,
    metrics, metricVisible, toggleMetric,
    log, logs
  };
})();
