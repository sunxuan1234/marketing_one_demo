/* 手动填报补录层 · WBSupplement
 * 中台缺失的两项公司级指标——水厂出水量（m³，当月累计流量，用于产销差）与
 * 未注册用户数（户，月末存量）——开放给分公司角色（R4/R5）手动补录。
 *
 * 公开接口（window.WBSupplement，唯一入口，无别名）：
 *   init()                          幂等初始化；脚本加载时已自执行，owner 可再调用。
 *   version()                       整数版本号，每次成功写入 +1。
 *   onChange(fn)                    订阅写入事件，返回退订函数；payload={version,unitId,period,nodeId,fields}。
 *   fillPermission()                => {ok,unitId,unitName,roleId,reason}；仅 R4/R5 且完整覆盖绑定单位时 ok。
 *   get(unitId,period)              => 记录副本|null；仅当前身份完整授权（fullUnits）的单位可读。
 *   set(unitId,period,field,value)  => {ok,reason}；field='supply_vol'|'non_registered_count'；
 *                                   supply_vol=非负有限数（允许小数，0 有效），non_registered_count=非负整数；
 *                                   空值(''/null/undefined)=未填/清空，绝不落成 0；逐次重查权限，失败不 bump 版本。
 *   supplyFor(node,periods)         => {supply_vol,complete,byUnit,missingUnits,missingPeriods,missing,coveredSupply,sourceLabel,applicable[,reason]}
 *                                   出水量可跨月累加；须节点全部应属单位×全部月份均填（含0）才给数值；
 *                                   missing=[{unitId,unitName,period}] 逐项列出缺数的单位×月份；
 *                                   coveredSupply=当前身份范围是否完整覆盖该节点应属单位；
 *                                   下级节点 applicable=false，公司级指标绝不分摊。
 *   nonRegisteredFor(node,period)   => {value,complete,byUnit,missingUnits,missing,period,applicable[,reason]}
 *                                   期末存量，只取单月（传数组时取所选期间内最晚自然月），不跨月累加。
 *   openFillUI()                    无参数；按当前绑定单位 + WB.state.month 打开真实表单弹窗；
 *                                   无权限时可见拒绝提示并留审计日志。
 *   viewRows(node,periods)          => [{unitName,period,supply_vol,non_registered_count,filledBy,filledAt,
 *                                   source,orgNodeId,unitId,ownershipLevel:'unit'}]；仅当前范围，可直接导出。
 *
 * 约束：源数据（WB_DATA）只读，本层独立内存（Map），刷新即恢复为空；不落 localStorage。
 * node 接受 WBOrg 节点对象或节点 id。集团口径=四个已接入单位（WBOrg.UNITS），不含未接入单位。
 * 写入同时触发 onChange 与 document 事件 'wb:v6-manual-change'（detail={nodeId,month,version}）。
 * 身份/范围变更（WBAccess.onChange）自动关闭填报弹窗，但不清空已填数据。
 * 加载顺序：engine.js 之后、analysis-v6.js 之前；对 WB.shell/WB.engine 均为运行时惰性引用。
 */
(function () {
  'use strict';
  if (window.WBSupplement) return; // 重复加载不覆盖已有内存数据

  var FIELDS = ['supply_vol', 'non_registered_count'];
  var store = new Map();           // key: unitId|period -> 记录（两字段均为 null 时删除）
  var version = 0;
  var listeners = new Set();
  var initialized = false;
  var accessUnsub = null;
  var activeModal = null;          // {close,unitId,scopeVersion}

  /* ---------- 基础工具 ---------- */

  function org() { return window.WBOrg; }
  function access() { return window.WBAccess; }

  function log(kind, action, ok, reason, rows) {
    try {
      var E = window.WB && window.WB.engine;
      if (E && typeof E.logEvent === 'function') E.logEvent(kind, action, ok, reason || '', { rows: rows == null ? null : rows });
    } catch (e) { /* 审计失败不阻断业务 */ }
  }

  function toast(message, type) {
    var shell = window.WB && window.WB.shell;
    if (shell && typeof shell.toast === 'function') { shell.toast(message, type || 'info'); return true; }
    return false;
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function stamp() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function authorLabel() {
    try {
      var cur = access().current();
      var role = cur.roleLabel || cur.roleId || '';
      return (cur.name || cur.label || '未知身份') + (role ? '（' + role + '）' : '');
    } catch (e) { return '未知身份'; }
  }

  function validPeriod(period) {
    var D = window.WB_DATA;
    return typeof period === 'string' && !!(D && Array.isArray(D.periods) && D.periods.indexOf(period) !== -1);
  }

  function normPeriods(periods) {
    var D = window.WB_DATA;
    var all = (D && Array.isArray(D.periods)) ? D.periods : [];
    var list = Array.isArray(periods) ? periods : (periods == null ? [] : [periods]);
    var seen = new Set(), out = [];
    list.forEach(function (p) {
      if (typeof p === 'string' && all.indexOf(p) !== -1 && !seen.has(p)) { seen.add(p); out.push(p); }
    });
    return out;
  }

  /* 数组月份取“所选期间内最晚自然月”（按源数据月份顺序，而非入参顺序）。 */
  function lastPeriod(periods) {
    var D = window.WB_DATA;
    var all = (D && Array.isArray(D.periods)) ? D.periods : [];
    var best = null, bestIdx = -1;
    normPeriods(periods).forEach(function (p) {
      var i = all.indexOf(p);
      if (i > bestIdx) { bestIdx = i; best = p; }
    });
    return best;
  }

  /* 数值校验：空=未填/清空（null）；否则十进制非负有限数，未注册数须为整数。 */
  function parseValue(field, raw) {
    var label = field === 'supply_vol' ? '水厂出水量须为≥0的数值（m³）' : '未注册用户数须为≥0的整数（户）';
    if (raw == null) return { ok: true, value: null };
    if (typeof raw === 'string') {
      var t = raw.trim();
      if (t === '') return { ok: true, value: null };
      var re = field === 'supply_vol' ? /^(\d+(\.\d*)?|\.\d+)$/ : /^\d+$/;
      if (!re.test(t)) return { ok: false, reason: label + '，留空表示未填' };
      raw = t;
    }
    if (typeof raw !== 'number' && typeof raw !== 'string') return { ok: false, reason: label + '，留空表示未填' };
    var n = Number(raw);
    if (!isFinite(n) || n < 0) return { ok: false, reason: label + '，留空表示未填' };
    if (field === 'non_registered_count' && !Number.isInteger(n)) return { ok: false, reason: label + '，留空表示未填' };
    return { ok: true, value: n };
  }

  /* ---------- 权限与范围 ---------- */

  function fillPermission() {
    var A = access();
    var cur = null, roleId = null;
    try {
      cur = A && A.current();
      roleId = cur ? cur.roleId : (A && A.persona ? (A.persona() || {}).roleId : null);
    } catch (e) { cur = null; }
    function deny(reason) { return { ok: false, unitId: null, unitName: null, roleId: roleId || null, reason: reason }; }
    if (!cur || !cur.scope) return deny('身份未就绪，无法填报');
    if (roleId !== 'R4' && roleId !== 'R5') return deny('仅分公司领导（R4）/分公司管理员（R5）可手动填报');
    if (cur.scope.unbound) return deny('当前身份未绑定单位，无法填报');
    var unitId = cur.scope.bindingUnitId;
    if (unitId == null || !cur.scope.fullUnits.has(String(unitId))) return deny('当前数据范围未完整覆盖绑定单位，无法填报');
    var unit = org() && org().unitById(unitId);
    if (!unit) return deny('绑定单位不存在于组织主数据');
    return { ok: true, unitId: String(unitId), unitName: unit.name, roleId: roleId, reason: '' };
  }

  /* 单位级数据只对“完整授权该单位”的身份开放（与 WBAccess 主体审计口径一致），各单位互相隔离。 */
  function canReadUnit(unitId) {
    try {
      var s = access().current().scope;
      return !!(s && s.fullUnits && s.fullUnits.has(String(unitId)));
    } catch (e) { return false; }
  }

  function resolveNode(node) {
    var O = org();
    if (!O || node == null) return null;
    var id = typeof node === 'object' ? node.id : node;
    return O.get(id) || null;
  }

  /* 节点应属单位集合：group=四个已接入单位；company=本单位；下级=不分摊。 */
  function unitSetFor(node) {
    var O = org();
    if (!node || !O) return { required: [], visible: [], kind: 'none' };
    var required;
    if (node.type === 'group') required = O.UNITS.slice();
    else if (node.type === 'company') { var u = O.unitById(node.unitId); required = u ? [u] : []; }
    else return { required: [], visible: [], kind: 'sub' };
    var visible = required.filter(function (u) { return canReadUnit(u.id); });
    return { required: required, visible: visible, kind: node.type };
  }

  /* ---------- 内存写入 ---------- */

  function blankRecord(unitId, period) {
    var unit = org() && org().unitById(unitId);
    return {
      unitId: String(unitId), period: period,
      supply_vol: null, non_registered_count: null,
      filledBy: '', filledAt: '', source: '手动填报',
      orgNodeId: unit ? unit.nodeId : (org() ? org().unitNodeId(unitId) : null),
      ownershipLevel: 'unit'
    };
  }

  function emit(unitId, period, nodeId, fields) {
    var payload = { version: version, unitId: unitId, period: period, nodeId: nodeId, fields: fields };
    listeners.forEach(function (fn) {
      try { fn(payload); } catch (e) { console.error('WBSupplement.onChange 监听失败', e); }
    });
    try {
      document.dispatchEvent(new CustomEvent('wb:v6-manual-change', { detail: { nodeId: nodeId, month: period, version: version } }));
    } catch (e) { /* 非浏览器环境忽略 */ }
  }

  /* patch 为已校验的 {field:value}；一次批量写入只 bump 一次版本、只发一次事件。 */
  function applyWrite(unitId, period, patch) {
    var key = unitId + '|' + period;
    var rec = store.get(key) || blankRecord(unitId, period);
    Object.keys(patch).forEach(function (f) { rec[f] = patch[f]; });
    rec.filledBy = authorLabel();
    rec.filledAt = stamp();
    if (rec.supply_vol == null && rec.non_registered_count == null) store.delete(key);
    else store.set(key, rec);
    version += 1;
    emit(unitId, period, rec.orgNodeId, Object.keys(patch));
  }

  function set(unitId, period, field, value) {
    function fail(reason) { log('supplement', 'set', false, reason); return { ok: false, reason: reason }; }
    var uid = unitId == null ? '' : String(unitId);
    if (FIELDS.indexOf(field) === -1) return fail('未知填报字段：' + String(field));
    if (!validPeriod(period)) return fail('自然月无效，须为源数据真实月份');
    var perm = fillPermission();
    if (!perm.ok) return fail(perm.reason);
    if (uid !== perm.unitId) return fail('仅可填报当前绑定单位「' + perm.unitName + '」，不能代填其他单位');
    var parsed = parseValue(field, value);
    if (!parsed.ok) return fail(parsed.reason);
    applyWrite(uid, period, (function () { var p = {}; p[field] = parsed.value; return p; })());
    log('supplement', field, true, '', 1);
    return { ok: true, reason: '' };
  }

  function get(unitId, period) {
    var uid = unitId == null ? '' : String(unitId);
    var rec = store.get(uid + '|' + period);
    if (!rec || !canReadUnit(uid)) return null;
    return Object.assign({}, rec);
  }

  /* ---------- 汇总口径 ---------- */

  function supplyFor(node, periods) {
    var n = resolveNode(node);
    var ps = normPeriods(periods);
    var out = { supply_vol: null, complete: false, byUnit: [], missingUnits: [], missingPeriods: [], missing: [], coveredSupply: false, sourceLabel: '', applicable: false };
    if (!n) { out.reason = '节点不存在或不可识别'; return out; }
    var set = unitSetFor(n);
    if (set.kind === 'sub') { out.reason = '公司级指标，不分摊到下级节点'; return out; }
    out.applicable = true;
    if (!set.required.length) { out.reason = '节点未关联已接入单位'; return out; }
    var covered = set.visible.length === set.required.length;
    out.coveredSupply = covered;
    if (!ps.length) { out.reason = '未选择有效自然月'; return out; }
    out.sourceLabel = set.kind === 'group' ? '集团四家已接入单位合计' : set.required[0].name;
    var missingPeriodSet = new Set();
    var total = 0;
    var allFilled = covered;
    set.required.forEach(function (u) {
      var visible = canReadUnit(u.id);
      var unitSum = 0;
      var unitComplete = visible;
      ps.forEach(function (p) {
        var rec = visible ? store.get(String(u.id) + '|' + p) : null;
        var v = rec ? rec.supply_vol : null;
        if (v == null) {
          unitComplete = false;
          missingPeriodSet.add(p);
          out.missing.push({ unitId: String(u.id), unitName: u.name, period: p });
        } else unitSum += v;
      });
      if (!unitComplete) { out.missingUnits.push(u.name); allFilled = false; }
      if (visible) out.byUnit.push({ unitId: String(u.id), name: u.name, supply_vol: unitComplete ? unitSum : null, complete: unitComplete });
      if (unitComplete) total += unitSum;
    });
    out.missingPeriods = ps.filter(function (p) { return missingPeriodSet.has(p); });
    out.complete = allFilled;
    out.supply_vol = allFilled ? total : null;
    return out;
  }

  function nonRegisteredFor(node, period) {
    var n = resolveNode(node);
    var p = Array.isArray(period) ? lastPeriod(period) : period;
    var out = { value: null, complete: false, byUnit: [], missingUnits: [], missing: [], period: null, applicable: false };
    if (!n) { out.reason = '节点不存在或不可识别'; return out; }
    var set = unitSetFor(n);
    if (set.kind === 'sub') { out.reason = '公司级指标，不分摊到下级节点'; return out; }
    out.applicable = true;
    if (!set.required.length) { out.reason = '节点未关联已接入单位'; return out; }
    var valid = validPeriod(p);
    out.period = valid ? p : null;
    if (!valid) out.reason = '自然月无效';
    var covered = set.visible.length === set.required.length;
    var total = 0;
    var allFilled = covered && valid;
    set.required.forEach(function (u) {
      var visible = canReadUnit(u.id);
      var rec = (visible && valid) ? store.get(String(u.id) + '|' + p) : null;
      var v = rec ? rec.non_registered_count : null;
      var filled = v != null;
      if (!filled) {
        out.missingUnits.push(u.name);
        if (valid) out.missing.push({ unitId: String(u.id), unitName: u.name, period: p });
        allFilled = false;
      }
      if (visible) out.byUnit.push({ unitId: String(u.id), name: u.name, non_registered_count: v, complete: filled });
      if (filled) total += v;
    });
    out.complete = allFilled;
    out.value = allFilled ? total : null;
    return out;
  }

  /* 导出行：orgNodeId=公司节点，ownershipLevel='unit'，可通过 WBAccess.ownsRow / engine.exportGuard。 */
  function viewRows(node, periods) {
    var set = unitSetFor(resolveNode(node));
    var ps = normPeriods(periods);
    var rows = [];
    set.visible.forEach(function (u) {
      ps.forEach(function (p) {
        var rec = store.get(String(u.id) + '|' + p);
        if (!rec) return;
        rows.push({
          unitName: u.name, period: p,
          supply_vol: rec.supply_vol, non_registered_count: rec.non_registered_count,
          filledBy: rec.filledBy, filledAt: rec.filledAt, source: rec.source,
          orgNodeId: rec.orgNodeId, unitId: rec.unitId, ownershipLevel: 'unit'
        });
      });
    });
    return rows;
  }

  /* ---------- 填报弹窗 ---------- */

  var FORM_HTML =
    '<div class="mv6-form">' +
      '<div class="notice"><span>手动填报仅保存在本次页面内存中，刷新后恢复为空；不修改任何只读源数据。空值 = 未填 / 清空，不计为 0。</span></div>' +
      '<div class="form-grid">' +
        '<div class="field field-full">' +
          '<label for="mv6Period">自然月</label>' +
          '<select id="mv6Period" class="control"></select>' +
          '<div class="field-help">默认当前筛选月份；切换月份可回显并编辑该月已填数据。</div>' +
        '</div>' +
        '<div class="field">' +
          '<label for="mv6Supply">水厂出水量（m³）</label>' +
          '<input id="mv6Supply" class="text-input" type="text" inputmode="decimal" autocomplete="off" placeholder="未填请留空">' +
          '<div class="field-help">当月累计供水量，≥0 的数值（可含小数），可为 0。</div>' +
          '<div class="field-error" id="mv6SupplyErr" hidden></div>' +
        '</div>' +
        '<div class="field">' +
          '<label for="mv6Unreg">未注册用户数（户）</label>' +
          '<input id="mv6Unreg" class="text-input" type="text" inputmode="numeric" autocomplete="off" placeholder="未填请留空">' +
          '<div class="field-help">月末存量，非负整数；跨月查询仅取所选期间末月，不累加。</div>' +
          '<div class="field-error" id="mv6UnregErr" hidden></div>' +
        '</div>' +
      '</div>' +
      '<div class="mv6-meta" id="mv6Meta"></div>' +
      '<div class="notice warning mv6-save-err" id="mv6SaveErr" role="alert" hidden></div>' +
    '</div>';

  var FOOTER_HTML =
    '<div class="mv6-actions">' +
      '<button type="button" class="btn" data-mv6="cancel">取消</button>' +
      '<button type="button" class="btn primary" data-mv6="save">保存</button>' +
    '</div>';

  /* 无 WB.shell 时的兜底语义弹窗（mv6 前缀样式，自管闭合/焦点/Escape），正常页面走 shell.openModal。 */
  function fallbackDialog(opts) {
    var host = document.getElementById('overlayLayer') || document.body;
    var prevFocus = document.activeElement;
    var mask = document.createElement('div'); mask.className = 'mv6-mask';
    var dialog = document.createElement('div'); dialog.className = 'modal sm';
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-label', opts.title);
    var head = document.createElement('div'); head.className = 'modal-head';
    var headText = document.createElement('div');
    var title = document.createElement('div'); title.className = 'modal-title'; title.textContent = opts.title;
    var subtitle = document.createElement('div'); subtitle.className = 'modal-subtitle'; subtitle.textContent = opts.subtitle || '';
    headText.appendChild(title); headText.appendChild(subtitle);
    var closeBtn = document.createElement('button'); closeBtn.type = 'button'; closeBtn.className = 'icon-btn modal-close';
    closeBtn.setAttribute('aria-label', '关闭'); closeBtn.textContent = '✕';
    head.appendChild(headText); head.appendChild(closeBtn);
    var body = document.createElement('div'); body.className = 'modal-body'; body.appendChild(opts.body);
    var foot = document.createElement('div'); foot.className = 'modal-foot'; foot.appendChild(opts.footer);
    dialog.appendChild(head); dialog.appendChild(body); dialog.appendChild(foot);
    mask.appendChild(dialog); host.appendChild(mask);
    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      mask.remove();
      if (prevFocus && typeof prevFocus.focus === 'function') { try { prevFocus.focus(); } catch (e) { } }
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    document.addEventListener('keydown', onKey, true);
    mask.addEventListener('mousedown', function (e) { if (e.target === mask) close(); });
    closeBtn.addEventListener('click', close);
    var first = dialog.querySelector('select, input, button');
    if (first) first.focus();
    return { close: close, dialog: dialog, body: body, footer: foot };
  }

  function notifyDenied(reason) {
    if (toast(reason, 'warning')) return;
    var body = document.createElement('div');
    body.className = 'notice danger';
    body.textContent = reason;
    var footer = document.createElement('div'); footer.className = 'mv6-actions';
    var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'btn primary'; ok.textContent = '知道了';
    footer.appendChild(ok);
    var layer = fallbackDialog({ title: '无法手动填报', subtitle: '权限校验未通过', body: body, footer: footer });
    ok.addEventListener('click', layer.close);
  }

  function openFillUI() {
    watchAccess();
    if (activeModal) { try { activeModal.close(); } catch (e) { } activeModal = null; }
    var perm = fillPermission();
    if (!perm.ok) {
      log('supplement', 'open-fill', false, perm.reason);
      notifyDenied(perm.reason);
      return { ok: false, reason: perm.reason };
    }
    var D = window.WB_DATA;
    var periods = (D && Array.isArray(D.periods)) ? D.periods : [];
    if (!periods.length) {
      var r = '自然月数据未就绪，无法填报';
      log('supplement', 'open-fill', false, r);
      notifyDenied(r);
      return { ok: false, reason: r };
    }
    var state = window.WB && window.WB.state;
    var month = (state && typeof state.month === 'string' && periods.indexOf(state.month) !== -1) ? state.month : periods[periods.length - 1];
    var scopeAtOpen = access().scopeVersion;

    var shell = window.WB && window.WB.shell;
    var onClose = function () { activeModal = null; };
    var subtitle = perm.unitName + ' · 仅当前绑定单位 · 页面内存演示';
    var layer = null;
    if (shell && typeof shell.openModal === 'function') {
      layer = shell.openModal({
        title: '手动填报 · 缺数据补录', subtitle: subtitle, size: 'sm',
        body: FORM_HTML, footer: FOOTER_HTML, onClose: onClose
      });
    }
    if (!layer) {
      var tpl = document.createElement('template');
      tpl.innerHTML = FORM_HTML + FOOTER_HTML;
      var bodyNode = tpl.content.querySelector('.mv6-form');
      var footerNode = tpl.content.querySelector('.mv6-actions');
      layer = fallbackDialog({ title: '手动填报 · 缺数据补录', subtitle: subtitle, body: bodyNode, footer: footerNode, onClose: onClose });
    }

    var root = layer.dialog || layer.body;
    function q(sel) { return root.querySelector(sel); }
    var periodSel = q('#mv6Period'), supplyIn = q('#mv6Supply'), unregIn = q('#mv6Unreg');
    var meta = q('#mv6Meta'), saveErr = q('#mv6SaveErr');
    var supplyErr = q('#mv6SupplyErr'), unregErr = q('#mv6UnregErr');

    periods.forEach(function (p) {
      var o = document.createElement('option'); o.value = p; o.textContent = p;
      periodSel.appendChild(o);
    });
    periodSel.value = month;

    function clearFieldError(input, errEl) {
      errEl.hidden = true; errEl.textContent = '';
      input.classList.remove('mv6-invalid'); input.removeAttribute('aria-invalid');
    }
    function showFieldError(input, errEl, msg) {
      errEl.textContent = msg; errEl.hidden = false;
      input.classList.add('mv6-invalid'); input.setAttribute('aria-invalid', 'true');
    }
    function echo() {
      var p = periodSel.value;
      var rec = get(perm.unitId, p);
      supplyIn.value = rec && rec.supply_vol != null ? String(rec.supply_vol) : '';
      unregIn.value = rec && rec.non_registered_count != null ? String(rec.non_registered_count) : '';
      meta.textContent = rec
        ? '上次填报：' + rec.filledBy + ' · ' + rec.filledAt + ' · 来源：' + rec.source
        : '该月尚未填报，保存后将记录填报人与时间。';
      clearFieldError(supplyIn, supplyErr); clearFieldError(unregIn, unregErr);
      saveErr.hidden = true;
    }
    periodSel.addEventListener('change', echo);
    echo();

    function saveFail(reason) {
      saveErr.textContent = reason; saveErr.hidden = false;
      log('supplement', 'fill', false, reason);
    }
    function save() {
      saveErr.hidden = true;
      var A = access();
      if (!A || A.scopeVersion !== scopeAtOpen) return saveFail('数据范围已变更，请关闭后重新打开填报');
      var live = fillPermission();
      if (!live.ok) return saveFail(live.reason);
      if (live.unitId !== perm.unitId) return saveFail('绑定单位已变更，请重新打开填报');
      var p = periodSel.value;
      var sv = parseValue('supply_vol', supplyIn.value);
      var uv = parseValue('non_registered_count', unregIn.value);
      var firstBad = null;
      if (!sv.ok) { showFieldError(supplyIn, supplyErr, sv.reason); firstBad = supplyIn; }
      if (!uv.ok) { showFieldError(unregIn, unregErr, uv.reason); firstBad = firstBad || unregIn; }
      if (firstBad) { log('supplement', 'fill', false, '校验未通过'); firstBad.focus(); return; }
      var rec = get(perm.unitId, p);
      var patch = {};
      if (sv.value !== (rec ? rec.supply_vol : null)) patch.supply_vol = sv.value;
      if (uv.value !== (rec ? rec.non_registered_count : null)) patch.non_registered_count = uv.value;
      if (!Object.keys(patch).length) { layer.close(); toast('本月数据无变更', 'info'); return; }
      applyWrite(perm.unitId, p, patch);
      log('supplement', 'fill', true, '', 1);
      var author = authorLabel();
      layer.close();
      toast('已保存 · ' + perm.unitName + ' ' + p + ' · 填报人：' + author, 'success');
    }

    q('[data-mv6="save"]').addEventListener('click', save);
    q('[data-mv6="cancel"]').addEventListener('click', function () { layer.close(); });
    [supplyIn, unregIn].forEach(function (input) {
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    });

    activeModal = { close: layer.close, unitId: perm.unitId, scopeVersion: scopeAtOpen };
    log('supplement', 'open-fill', true, '', null);
    return { ok: true, reason: '' };
  }

  /* ---------- 初始化与事件 ---------- */

  function watchAccess() {
    if (accessUnsub) return;
    var A = access();
    if (A && typeof A.onChange === 'function') {
      accessUnsub = A.onChange(function () {
        // 身份/范围变更：关闭弹窗，不清空已填内存数据
        if (activeModal) { try { activeModal.close(); } catch (e) { } activeModal = null; }
      });
    }
  }

  function injectStyle() {
    if (document.getElementById('mv6-style')) return;
    var s = document.createElement('style');
    s.id = 'mv6-style';
    s.textContent =
      '.mv6-form .form-grid{margin-top:14px}' +
      '.mv6-meta{margin-top:12px;color:var(--muted,#6B7F8E);font-size:11px;line-height:1.6}' +
      '.mv6-save-err{margin-top:12px}' +
      '.mv6-actions{display:flex;justify-content:flex-end;gap:8px;width:100%}' +
      '.mv6-invalid{border-color:var(--red,#C4574E)!important}' +
      '.mv6-mask{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;background:rgba(18,39,55,.48);backdrop-filter:blur(3px)}' +
      '.mv6-mask .modal{max-height:90vh}';
    (document.head || document.documentElement).appendChild(s);
  }

  function init() {
    if (initialized) return api;
    initialized = true;
    injectStyle();
    watchAccess();
    return api;
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return function () { };
    listeners.add(fn);
    return function () { listeners.delete(fn); };
  }

  var api = Object.freeze({
    init: init,
    version: function () { return version; },
    onChange: onChange,
    fillPermission: fillPermission,
    get: get,
    set: set,
    supplyFor: supplyFor,
    nonRegisteredFor: nonRegisteredFor,
    openFillUI: openFillUI,
    viewRows: viewRows
  });

  window.WBSupplement = api;
  init(); // 自执行；owner 再调 init() 为幂等空操作
})();
