/* 平台配置内存态（演示）：计划值、操作日志、账号、报表参数、指标显示开关、角色范围。
   全部仅存于内存，刷新即还原；不写 localStorage、不写文件、不回写源系统。 */
window.WB_ADMIN = (() => {
  const D = window.WB_DATA;
  const logs = [];
  const planMap = new Map();
  const paramMap = new Map();
  let seq = 0;
  let activeRole = '集团管理员';
  let activeRoleScope = '';
  const visibleMetrics = ['sold_vol', 'registered_count', 'loss_rate_pct', 'avg_price_yuan', 'charge_rate_pct'];

  const accounts = [
    { name: '演示管理员', company: '集团', role: '集团管理员', enabled: true },
    { name: '演示分公司管理员', company: '营业中心', role: '分公司管理员', enabled: true },
    { name: '演示营业所用户', company: '营业中心 / 中原所', role: '营业所用户', enabled: true },
    { name: '演示营销员', company: '营业中心 / 中原所 / 1班组', role: '营销员', enabled: true }
  ];

  const roleMatrix = [
    { role: '集团管理员', scope: '全集团', mode: '读写（演示）', board: '✓', user: '✓', meter: '✓', set: '✓' },
    { role: '分公司管理员', scope: '本单位', mode: '读（演示）', board: '✓', user: '✓', meter: '✓', set: '—' },
    { role: '营业所用户', scope: '本营业所', mode: '读（演示）', board: '✓', user: '✓', meter: '—', set: '—' },
    { role: '营销员', scope: '本班组/线路', mode: '读（演示）', board: '—', user: '✓', meter: '—', set: '—' }
  ];

  function stamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  function log(action, detail) {
    logs.unshift({ id: `LOG${String(++seq).padStart(3, '0')}`, at: stamp(), action, detail, role: activeRole });
    if (logs.length > 200) logs.length = 200;
    return logs[0];
  }
  function periodKey() {
    const s = window.WB?.state || {};
    if (s.period === '自定义') return `自定义 ${s.start || ''}~${s.month || s.end || ''}`;
    return `${s.period || '年内累计'} ${s.month || s.end || ''}`.trim();
  }
  function planKey(company) { return `${company}|${periodKey()}`; }
  function planOf(company, fallback) {
    const hit = planMap.get(planKey(company));
    return hit == null ? fallback : hit;
  }
  function hasPlan(company) { return planMap.has(planKey(company)); }
  function setPlan(company, value) {
    const num = Number(value);
    if (!company) return { ok: false, message: '缺少经营单位' };
    if (!Number.isFinite(num) || num <= 0) return { ok: false, message: '计划值需为正数' };
    planMap.set(planKey(company), num);
    log('计划值填报', `${company} · ${periodKey()} · ${num.toLocaleString('zh-CN')} m³`);
    window.WB?.engine?.clearFactCache?.();
    return { ok: true };
  }
  function resetPlan(company) {
    planMap.delete(planKey(company));
    log('计划值还原', `${company} · ${periodKey()}`);
    window.WB?.engine?.clearFactCache?.();
  }
  function planCount() { return planMap.size; }

  const paramDefs = [
    { key: 'bigUser', label: '大用户月用水量', value: '≥100m³', options: ['≥100m³', '≥200m³', '≥500m³'], entry: '100立方米以上用户报表', note: '阈值变化影响该报表行数' },
    { key: 'swapN', label: '换表对比周期', value: '前后各2期', options: ['前后各2期', '前后各3期'], entry: '换表前后水量对比报表', note: '同时作用于表务页签与报表' },
    { key: 'zeroN', label: '连续零水量周期', value: '2期', options: ['2期', '3期', '4期'], entry: '连续零水量用户报表', note: '判断连续零水量的期数' },
    { key: 'mnf', label: '夜间 MNF 窗口', value: '01:00—04:00', options: ['01:00—04:00', '02:00—05:00'], entry: '分区计量夜间流量', note: '口径待确认，未用于计算' }
  ];
  function paramValue(key) {
    const def = paramDefs.find(item => item.key === key);
    return paramMap.get(key) || (def ? def.value : '');
  }
  function setParam(key, value) {
    const def = paramDefs.find(item => item.key === key);
    if (!def || !def.options.includes(value)) return { ok: false, message: '参数值不合法' };
    paramMap.set(key, value);
    log('报表参数调整', `${def.label} → ${value}`);
    return { ok: true };
  }
  function paramCount() { return paramDefs.length; }
  function paramOverrides() { return paramMap.size; }

  function addAccount(payload) {
    const name = String(payload?.name || '').trim();
    const company = String(payload?.company || '').trim();
    const role = String(payload?.role || '').trim();
    if (!name) return { ok: false, message: '请填写账号姓名' };
    if (!company) return { ok: false, message: '请选择所属单位' };
    if (!role) return { ok: false, message: '请选择角色' };
    if (accounts.some(item => item.name === name && item.company === company)) return { ok: false, message: '同名账号已存在' };
    accounts.push({ name, company, role, enabled: false });
    log('新增账号', `${name} · ${company} · ${role}（未启用）`);
    return { ok: true };
  }
  function toggleAccount(index) {
    const item = accounts[index];
    if (!item) return { ok: false };
    item.enabled = !item.enabled;
    log(item.enabled ? '启用账号' : '停用账号', `${item.name} · ${item.company}`);
    return { ok: true, enabled: item.enabled };
  }
  function resetPassword(index) {
    const item = accounts[index];
    if (!item) return { ok: false };
    log('重置密码', `${item.name} · ${item.company}（演示，不产生真实凭据）`);
    return { ok: true };
  }
  function accountEnabledCount() { return accounts.filter(item => item.enabled).length; }

  function setRole(role) {
    const hit = roleMatrix.find(item => item.role === role);
    if (!hit) return { ok: false };
    activeRole = role;
    if (role === '集团管理员') activeRoleScope = '';
    else if (role === '分公司管理员') activeRoleScope = D.companies[0]?.name || '';
    else if (role === '营业所用户') activeRoleScope = D.companies[0]?.name || '';
    else activeRoleScope = D.companies[0]?.name || '';
    log('切换演示角色', `${role}（数据范围：${hit.scope}）`);
    return { ok: true, scope: activeRoleScope, scopeLabel: hit.scope };
  }
  function role() { return activeRole; }
  function roleScope() { return activeRoleScope; }

  function metricVisible(key) { return visibleMetrics.includes(key); }
  function toggleMetric(key) {
    const i = visibleMetrics.indexOf(key);
    if (i >= 0) { if (visibleMetrics.length === 1) return { ok: false, message: '至少保留一个指标' }; visibleMetrics.splice(i, 1); }
    else visibleMetrics.push(key);
    log('指标显示开关', `${key} → ${i >= 0 ? '隐藏' : '显示'}`);
    return { ok: true, visible: visibleMetrics.includes(key) };
  }
  function metrics() { return [...visibleMetrics]; }

  return {
    log, logs: () => logs, logCount: () => logs.length,
    periodKey, planOf, hasPlan, setPlan, resetPlan, planCount,
    paramDefs, paramValue, setParam, paramCount, paramOverrides,
    accounts: () => accounts, addAccount, toggleAccount, resetPassword, accountEnabledCount,
    roleMatrix: () => roleMatrix, setRole, role: () => activeRole, roleScope: () => activeRoleScope,
    metricVisible, toggleMetric, metrics
  };
})();
