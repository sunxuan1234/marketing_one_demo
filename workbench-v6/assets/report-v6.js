/* 营销一体化 V6 · 月报导出（HTML 图表与摘要 / ZIP / 分章CSV）。
 * 只消费 WBAnalysis 的成品结果：buildReportModel / chartOption / tableRows。
 * 报告层不重复聚合、不改口径、不推算原因；18 章图表优先，仅 presentation==='table' 的必需块出汇总表，
 * 空块保留简短说明；逐户明细不入月报（明细见应用内导出），分章 CSV 仅含模型内聚合数据。
 * 导出全程锁定 身份/范围版本/查询条件/手填版本（仅 WBSupplement.version()，不使用旧别名），
 * 异步每一步与下载前复核，任一变化即中止；源行经 engine.exportGuard 复核，跨范围行拒绝导出。
 * 纯前端离线 file://，无外部依赖：ZIP 为真实 store 法（CRC32 / UTF-8 flag / 中央目录 / EOCD），
 * CSV 带 BOM/CRLF/引号转义并防 Excel 公式注入；下载为 Blob URL + anchor.click 真实文件。
 * 加载顺序：manual-v6.js → analysis-v6.js → report-v6.js → app.js（index.html 已按此挂载）。 */
(function () {
  'use strict';

  const CHART_WIDTH = 1100;
  const CHART_HEIGHT = 420;
  const CHART_PIXEL_RATIO = 2;
  const CHAPTER_COUNT = 18;
  const REVOKE_DELAY_MS = 4000;

  /* ---------- 基础工具 ---------- */
  const engine = () => window.WB && window.WB.engine;
  const analysis = () => window.WBAnalysis;
  const isFn = (obj, key) => !!obj && typeof obj[key] === 'function';
  const pad2 = n => String(n).padStart(2, '0');
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));

  function esc(value) {
    const E = engine();
    if (isFn(E, 'esc')) return E.esc(value);
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function safeFileName(name, fallback) {
    const text = String(name == null ? '' : name)
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80);
    return text || fallback;
  }

  function formatLocal(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function abortError(message) {
    const err = new Error(message);
    err.name = 'ReportExportAbort';
    err.aborted = true;
    return err;
  }

  /* ---------- 通知与过程状态（本模块自有浮层，不改其他文件） ---------- */
  function notify(message, isError) {
    const WB = window.WB;
    if (WB && WB.ui && typeof WB.ui.toast === 'function') { WB.ui.toast(message, isError ? 'warning' : 'success'); return; }
    if (WB && WB.shell && typeof WB.shell.toast === 'function') { WB.shell.toast(message, isError ? 'warning' : 'success'); return; }
    if (isError) { console.error('[WBReportV6]', message); try { window.alert(message); } catch (_) { /* 无窗口环境 */ } }
    else console.info('[WBReportV6]', message);
  }

  let statusEl = null;
  function ensureStatusStyle() {
    if (document.getElementById('wb-report-v6-style')) return;
    const style = document.createElement('style');
    style.id = 'wb-report-v6-style';
    style.textContent = [
      '.wb-report-v6-status{position:fixed;right:20px;bottom:20px;z-index:9999;display:flex;align-items:center;gap:10px;',
      'max-width:min(420px,calc(100vw - 40px));padding:12px 16px;border-radius:10px;background:#0E3A5D;color:#F2F8FC;',
      'font:13px/1.5 "Microsoft YaHei","PingFang SC",sans-serif;box-shadow:0 10px 30px rgba(14,58,93,.35);}',
      '.wb-report-v6-spinner{flex:none;width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.25);',
      'border-top-color:#7DB9A0;animation:wb-report-v6-spin .9s linear infinite;}',
      '@keyframes wb-report-v6-spin{to{transform:rotate(360deg)}}',
      '@media print{.wb-report-v6-status{display:none!important}}'
    ].join('');
    document.head.appendChild(style);
  }
  function showStatus(text) {
    ensureStatusStyle();
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.className = 'wb-report-v6-status';
      statusEl.setAttribute('role', 'status');
      statusEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(statusEl);
    }
    statusEl.innerHTML = '<span class="wb-report-v6-spinner" aria-hidden="true"></span><span>' + esc(text) + '</span>';
  }
  function hideStatus() {
    if (statusEl) { statusEl.remove(); statusEl = null; }
  }

  /* ---------- 导出上下文锁定：身份 / 范围版本 / 查询条件 / 手填版本 ---------- */
  function manualVersionNow() {
    const S = window.WBSupplement;
    if (!isFn(S, 'version')) return null;
    try { const v = S.version(); return Number.isFinite(+v) ? +v : null; } catch (_) { return null; }
  }

  function stateJson() {
    return JSON.stringify((window.WB && window.WB.state) || {});
  }

  function captureLock() {
    const A = window.WBAccess;
    if (!isFn(A, 'current')) throw new Error('WBAccess 不可用，无法锁定导出数据范围');
    const snap = A.current();
    return {
      scopeVersion: snap.scopeVersion,
      personaId: snap.personaId,
      roleId: snap.roleId,
      personaLabel: snap.label || snap.personaId || '',
      roleLabel: snap.roleLabel || '',
      scopeLabel: snap.scopeLabel || '',
      stateJson: stateJson(),
      manualVersion: manualVersionNow(),
      at: Date.now()
    };
  }

  function lockBreach(lock) {
    const A = window.WBAccess;
    if (!isFn(A, 'current')) return '身份服务不可用';
    const snap = A.current();
    if (snap.personaId !== lock.personaId) return '演示身份已切换';
    if (snap.scopeVersion !== lock.scopeVersion) return '数据范围已变更';
    let current;
    try { current = stateJson(); } catch (_) { return '查询条件状态不可读'; }
    if (current !== lock.stateJson) return '查询条件（范围/期间/口径）已变更';
    if (manualVersionNow() !== lock.manualVersion) return '单位手填数据版本已变更';
    return '';
  }

  function assertLock(lock) {
    const why = lockBreach(lock);
    if (why) throw abortError(why + '，本次导出已中止，请重新发起');
  }

  /* ---------- 模型规范化与源行范围守卫 ---------- */
  function normalizeModel(raw) {
    if (!raw || !Array.isArray(raw.chapters) || !raw.chapters.length) {
      throw new Error('报告模型为空：WBAnalysis.buildReportModel 未返回章节');
    }
    const meta = Object.assign({
      title: '营销一体化月报', periodLabel: '', filterLabel: '', scopeLabel: '',
      persona: '', generatedAt: '', dataRange: '', asOf: ''
    }, raw.meta || {});
    const chapters = raw.chapters
      .slice()
      .sort((a, b) => (Number(a.no) || 0) - (Number(b.no) || 0))
      .map(ch => ({ no: Number(ch.no) || 0, title: String(ch.title == null ? '' : ch.title), blocks: Array.isArray(ch.blocks) ? ch.blocks : [] }));
    if (chapters.length !== CHAPTER_COUNT) {
      console.warn('[WBReportV6] 报告模型章节数为 ' + chapters.length + '，预期 ' + CHAPTER_COUNT + ' 章；已按模型导出，不遗漏任何 block');
    }
    return { meta, chapters };
  }

  function blockSourceRows(result) {
    const out = [];
    const seen = new Set();
    const push = row => {
      if (row && typeof row === 'object' && !seen.has(row)) { seen.add(row); out.push(row); }
    };
    if (Array.isArray(result.sourceRows)) result.sourceRows.forEach(push);
    (Array.isArray(result.rows) ? result.rows : []).forEach(row => {
      const raw = row && row._raw;
      if (Array.isArray(raw)) raw.forEach(push);
      else if (raw && typeof raw === 'object') push(raw);
    });
    return out;
  }

  /* 用真实源行走现有 engine.exportGuard：不构造假 source，不绕过守卫。
   * 返回全部去重源行，供下载前再做一次归属复核。 */
  function guardModel(model, lock) {
    const E = engine();
    if (!isFn(E, 'exportGuard')) throw new Error('engine.exportGuard 不可用，拒绝无守卫导出');
    const all = [];
    const seen = new Set();
    model.chapters.forEach(ch => {
      ch.blocks.forEach(block => {
        const result = block && block.result;
        if (!result) return;
        const src = blockSourceRows(result);
        if (!src.length) return; // 空块无源行，无需守卫
        const verdict = E.exportGuard(src, { kind: 'report', scopeVersion: lock.scopeVersion, sourceRows: src });
        if (!verdict.ok) {
          throw abortError('第' + ch.no + '章「' + (block.heading || ch.title) + '」源数据守卫拒绝：' + verdict.reason);
        }
        src.forEach(row => { if (!seen.has(row)) { seen.add(row); all.push(row); } });
      });
    });
    return all;
  }

  function assertSourcesOwned(sources) {
    const E = engine();
    if (!isFn(E, 'exportSourceOwn')) return;
    for (let i = 0; i < sources.length; i++) {
      if (!E.exportSourceOwn(sources[i])) {
        throw abortError('发现不属于当前数据范围的源行，导出已中止');
      }
    }
  }

  function countRows(model) {
    let n = 0;
    model.chapters.forEach(ch => ch.blocks.forEach(b => {
      const rows = b && b.result && b.result.rows;
      if (Array.isArray(rows)) n += rows.length;
    }));
    return n;
  }

  /* ---------- CSV：BOM / CRLF / 引号转义 / 防 Excel 公式注入 ---------- */
  const NUMERIC_TEXT = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  function csvCell(value) {
    if (value == null) return ''; // 缺数留空，绝不按 0
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    let text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    // 正负纯数字保留数值形态；危险开头的动态文本加单引号前缀
    if (!NUMERIC_TEXT.test(text) && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }
  function csvText(headers, rows) {
    const lines = [headers.map(csvCell).join(',')];
    rows.forEach(row => lines.push(row.map(csvCell).join(',')));
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  function dataSourceNote(lock) {
    let note = '合成样例（本地演示数据）';
    if (lock.manualVersion != null) note += '＋单位手填补充（版本' + lock.manualVersion + '）';
    return note;
  }

  /* 原型模拟补全块来源标注：仅 result.synthetic=true 的分析结果改标；旧合成样例口径不变，不重标真实。 */
  const SYNTHETIC_LABEL = '原型模拟数据（非真实接入）';
  function blockSourceLabel(result) {
    return result && result.synthetic ? String(result.sourceLabel || SYNTHETIC_LABEL) : '';
  }
  function blockSourceNote(result, lock) {
    const label = blockSourceLabel(result);
    if (!label) return dataSourceNote(lock);
    return lock.manualVersion != null ? label + '＋单位手填补充（版本' + lock.manualVersion + '）' : label;
  }
  function reportSourceNote(model, lock) {
    let label = '';
    model.chapters.forEach(ch => ch.blocks.forEach(b => { if (!label) label = blockSourceLabel(b && b.result); }));
    if (!label) return dataSourceNote(lock);
    let note = '合成样例（本地演示数据）＋' + label;
    if (lock.manualVersion != null) note += '＋单位手填补充（版本' + lock.manualVersion + '）';
    return note;
  }

  /* tableRows 的 headers 为 {key,label,align} 对象；统一取标签/键/对齐，兼容纯字符串形态。 */
  const headerLabel = h => (h && typeof h === 'object') ? String(h.label != null ? h.label : (h.key != null ? h.key : '')) : String(h == null ? '' : h);
  const headerKey = h => (h && typeof h === 'object') ? h.key : h;
  const headerAlign = h => (h && typeof h === 'object' && h.align === 'right') ? 'right' : 'left';

  /* 单个 block 的 CSV：优先用原始数值列（Excel 保留数值），有合计行则附末行，空块输出含说明行。 */
  function blockCsv(block, meta, lock) {
    const result = (block && block.result) || {};
    const A = analysis();
    const formatted = isFn(A, 'tableRows') ? (A.tableRows(result) || {}) : {};
    const headerDefs = Array.isArray(formatted.headers) ? formatted.headers : [];
    const headers = headerDefs.map(headerLabel);
    const columns = Array.isArray(result.columns) ? result.columns : [];
    const sourceRows = Array.isArray(result.rows) ? result.rows : [];
    let rows;
    if (columns.length) {
      rows = sourceRows.map(row => columns.map(col => (row ? row[col.key] : null)));
      if (Array.isArray(formatted.totals)) rows.push(formatted.totals.map(v => v === '—' ? '' : v));
    } else {
      const keys = headerDefs.map(headerKey);
      rows = (Array.isArray(formatted.rows) ? formatted.rows : []).map(row => keys.map(key => (row && typeof row === 'object') ? row[key] : null));
    }
    if (!rows.length) {
      const emptyText = result.empty || result.note || '本期无数据（缺数不按0计）';
      const width = Math.max(headers.length, 1);
      const noteRow = new Array(width).fill('');
      noteRow[0] = '【空态说明】' + emptyText + (result.empty && result.note && result.note !== result.empty ? '；口径：' + result.note : '');
      rows = [noteRow];
      if (!headers.length) headers.push('说明');
    }
    const periodLabel = result.periodLabel || meta.periodLabel || '';
    headers.push('统计期间', '查询条件', '数据范围', '数据性质');
    rows = rows.map(row => row.concat([periodLabel, meta.filterLabel || '', lock.scopeLabel || meta.scopeLabel || '', blockSourceNote(result, lock)]));
    return { text: csvText(headers, rows), rowCount: sourceRows.length };
  }

  function blockFileStem(ch, bi, block) {
    const label = safeFileName((block && block.heading) || ch.title, '数据块').slice(0, 30);
    return pad2(ch.no) + '-' + pad2(bi + 1) + '_' + label;
  }
  function blockCsvName(ch, bi, block) { return 'csv/' + blockFileStem(ch, bi, block) + '.csv'; }
  function blockPngName(ch, bi, block) { return 'png/' + blockFileStem(ch, bi, block) + '.png'; }

  function csvPlan(model, lock) {
    const files = [];
    const index = [];
    model.chapters.forEach(ch => {
      ch.blocks.forEach((block, bi) => {
        const name = blockCsvName(ch, bi, block);
        const built = blockCsv(block, model.meta, lock);
        files.push({ name, data: built.text });
        index.push({ ch, block, bi, name, rowCount: built.rowCount });
      });
    });
    return { files, index };
  }

  function manifestCsv(model, lock, index, htmlName) {
    const meta = model.meta;
    const headers = ['类型', '章节号', '章节标题', '块序号', '块标题', '文件', '数据行数', '空态/备注'];
    const rows = [];
    rows.push(['报告HTML', '', meta.title, '', '', htmlName, '', '18 章图表与摘要（仅必需块出汇总表），不含逐户明细；浏览器打开后可打印/存PDF']);
    index.forEach(item => {
      const result = (item.block && item.block.result) || {};
      rows.push(['章节CSV', pad2(item.ch.no), item.ch.title, pad2(item.bi + 1), (item.block && item.block.heading) || '', item.name, item.rowCount, [result.empty, result.note, result.totalsNote, blockSourceLabel(result)].filter(Boolean).join('；')]);
    });
    const metaRows = [
      ['数据期间', meta.periodLabel], ['查询条件', meta.filterLabel], ['数据范围', meta.scopeLabel || lock.scopeLabel],
      ['数据覆盖', meta.dataRange], ['数据截至', meta.asOf], ['导出身份', meta.persona || (lock.personaLabel + (lock.roleLabel ? '（' + lock.roleLabel + '）' : ''))],
      ['生成时间', meta.generatedAt || formatLocal(lock.at)], ['手填版本', lock.manualVersion == null ? '未启用手填层' : String(lock.manualVersion)],
      ['数据性质', reportSourceNote(model, lock)], ['章节标题说明', '章节标题沿用月报原题（原题中的月份为模板名称）；各块实际统计期间以该块 CSV“统计期间”列及 HTML 图表旁标注为准']
    ];
    metaRows.forEach(pair => rows.push(['元数据', '', pair[0], '', '', '', '', pair[1] == null ? '' : pair[1]]));
    return csvText(headers, rows);
  }

  /* ---------- 真实 ZIP（store 法，无依赖）：CRC32 / UTF-8 flag / 中央目录 / EOCD ---------- */
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function dosDateTime(ts) {
    const d = new Date(ts);
    const year = Math.max(1980, d.getFullYear());
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }
  function buildZip(files, ts) {
    const enc = new TextEncoder();
    const dt = dosDateTime(ts);
    const entries = files.map(file => {
      const name = enc.encode(file.name);
      const data = typeof file.data === 'string' ? enc.encode(file.data) : file.data;
      return { name, data, crc: crc32(data) };
    });
    let size = 22; // EOCD
    entries.forEach(e => { size += 30 + e.name.length + e.data.length + 46 + e.name.length; });
    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let offset = 0;
    const u16 = v => { view.setUint16(offset, v, true); offset += 2; };
    const u32 = v => { view.setUint32(offset, v >>> 0, true); offset += 4; };
    const raw = arr => { bytes.set(arr, offset); offset += arr.length; };
    const localOffsets = [];
    entries.forEach(e => {
      localOffsets.push(offset);
      u32(0x04034b50); u16(20); u16(0x0800); u16(0); u16(dt.time); u16(dt.date);
      u32(e.crc); u32(e.data.length); u32(e.data.length); u16(e.name.length); u16(0);
      raw(e.name); raw(e.data);
    });
    const cdStart = offset;
    entries.forEach((e, i) => {
      u32(0x02014b50); u16(20); u16(20); u16(0x0800); u16(0); u16(dt.time); u16(dt.date);
      u32(e.crc); u32(e.data.length); u32(e.data.length); u16(e.name.length);
      u16(0); u16(0); u16(0); u16(0); u32(0); u32(localOffsets[i]);
      raw(e.name);
    });
    const cdSize = offset - cdStart;
    u32(0x06054b50); u16(0); u16(0); u16(entries.length); u16(entries.length); u32(cdSize); u32(cdStart); u16(0);
    return bytes;
  }

  /* ---------- 图表 PNG：离屏临时 div，渲染后立即销毁 ---------- */
  async function renderBlockChart(result, fallbackPeriod, heading) {
    if (!result || !result.chart) return null;
    const A = analysis();
    const echarts = window.echarts;
    if (!echarts || typeof echarts.init !== 'function') throw new Error('echarts 不可用，无法生成图表 PNG');
    const period = result.periodLabel || fallbackPeriod || '';
    const sourceLabel = result.sourceLabel || blockSourceLabel(result) || (result.manualSource ? '手动填报' : '演示数据（合成样例）');
    const subParts = [];
    if (period) subParts.push('统计期间：' + period);
    if (sourceLabel) subParts.push('数据来源：' + sourceLabel);
    /* 块标题经 opts.title、期间/来源拼成 opts.subtitle 传入 chartOption：主/副标题、各面板标题与顶部预留带均由核心组合在 option.title[] 内生成，
       导出侧不再覆写 title/legend/grid（避免与核心重复标题）。仅导出快照，不改屏幕图表与计算。 */
    const opts = { width: CHART_WIDTH, height: CHART_HEIGHT, animation: false };
    if (heading) opts.title = heading;
    if (subParts.length) opts.subtitle = subParts.join(' · ');
    const option = A.chartOption(result, opts);
    if (!option) return null;
    const holder = document.createElement('div');
    holder.setAttribute('aria-hidden', 'true');
    holder.style.cssText = 'position:fixed;left:-12000px;top:0;width:' + CHART_WIDTH + 'px;height:' + CHART_HEIGHT + 'px;overflow:hidden;pointer-events:none;';
    document.body.appendChild(holder);
    let chart = null;
    try {
      chart = echarts.init(holder, null, { renderer: 'canvas', width: CHART_WIDTH, height: CHART_HEIGHT });
      option.animation = false;
      if (option.backgroundColor == null) option.backgroundColor = '#FFFFFF';
      /* option.title/legend/grid 已由 chartOption 依 subtitle 生成（含面板标题与顶部预留带），导出侧保持原样，仅确保白底。 */
      chart.setOption(option, true);
      return chart.getDataURL({ type: 'png', pixelRatio: CHART_PIXEL_RATIO, backgroundColor: '#FFFFFF' });
    } finally {
      if (chart) { try { chart.dispose(); } catch (_) { /* 已销毁 */ } }
      holder.remove();
    }
  }

  /* ---------- 真实文件下载：Blob URL + anchor.click，延迟 revoke ---------- */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  }

  function reportBaseName(meta) {
    const parts = [meta.title || '营销一体化月报'];
    if (meta.asOf) parts.push(String(meta.asOf));
    else if (meta.periodLabel) parts.push(String(meta.periodLabel));
    return safeFileName(parts.join('_'), '月报');
  }

  /* ---------- 缺数清点：只数空块与缺值单元格，不做任何聚合推算 ---------- */
  function collectMissing(model) {
    const list = [];
    let missingCells = 0;
    let emptyBlocks = 0;
    model.chapters.forEach(ch => {
      ch.blocks.forEach((block, bi) => {
        const result = (block && block.result) || {};
        const rows = Array.isArray(result.rows) ? result.rows : [];
        const columns = Array.isArray(result.columns) ? result.columns : [];
        if (!rows.length) {
          emptyBlocks++;
          list.push({ ch, bi, block, empty: true, text: result.empty || result.note || '本期无数据（缺数不按0计）', nulls: 0 });
          return;
        }
        let nulls = 0;
        if (columns.length) {
          rows.forEach(row => columns.forEach(col => {
            const v = row ? row[col.key] : null;
            if (v == null || (typeof v === 'number' && !Number.isFinite(v))) nulls++;
          }));
        }
        if (nulls) { missingCells += nulls; list.push({ ch, bi, block, empty: false, text: '', nulls }); }
      });
    });
    return { list, missingCells, emptyBlocks };
  }

  function missingNotesText(model, lock, missing) {
    const meta = model.meta;
    const lines = [
      '月报缺数说明',
      '生成时间：' + (meta.generatedAt || formatLocal(lock.at)),
      '数据期间：' + (meta.periodLabel || '—') + ' · 查询条件：' + (meta.filterLabel || '—'),
      '数据范围：' + (lock.scopeLabel || meta.scopeLabel || '—') + ' · 导出身份：' + (meta.persona || lock.personaLabel),
      '数据性质：' + reportSourceNote(model, lock),
      '',
      '规则：缺值在 HTML 中显示为“—”、CSV 中留空，绝不按 0 计；0 为真实数值，原样保留。',
      '规则：牟新水务为空占位单位，不参与合计/排名/占比；章节保留原题与空态说明，不造数。',
      ''
    ];
    if (!missing.list.length) lines.push('本期无空块，也无缺值单元格。');
    else {
      lines.push('空块 ' + missing.emptyBlocks + ' 个 · 缺值单元格 ' + missing.missingCells + ' 个：');
      missing.list.forEach(item => {
        const where = '第' + item.ch.no + '章「' + item.ch.title + '」块' + pad2(item.bi + 1) + '「' + ((item.block && item.block.heading) || '') + '」';
        const tag = blockSourceLabel(item.block && item.block.result);
        const suffix = tag ? '（' + tag + '）' : '';
        lines.push(item.empty ? where + '：【空块】' + item.text + suffix : where + '：' + item.nulls + ' 个缺值单元格（显示“—”，不按0计）' + suffix);
      });
    }
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  /* ---------- 离线 HTML：内嵌样式 / 图 PNG / 格式化表格 / 口径说明，可直接打印存 PDF ---------- */
  const REPORT_CSS = `
:root{--deep:#0E3A5D;--deep-2:#155A7A;--teal:#2E8B7A;--mint:#7DB9A0;--ink:#1C2B36;--muted:#5B7280;--paper:#F2F6F8;--card:#FFFFFF;--line:#D9E4EA;--amber:#9A6B15;--amber-bg:#FBF3E2}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scrollbar-color:var(--deep-2) var(--paper);scrollbar-width:thin}
body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.65 "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-track{background:var(--paper)}
::-webkit-scrollbar-thumb{background:var(--deep-2);border-radius:6px;border:2px solid var(--paper)}
::-webkit-scrollbar-thumb:hover{background:var(--teal)}
.cover{background:linear-gradient(135deg,var(--deep) 0%,var(--deep-2) 55%,var(--teal) 100%);color:#F2F8FC;padding:34px 40px 30px}
.cover h1{margin:0 0 6px;font-size:26px;letter-spacing:.04em}
.cover .sub{opacity:.85;font-size:13px;margin-bottom:18px}
.meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px 18px;font-size:12.5px}
.meta-grid .k{opacity:.72;margin-right:6px}
.notice{margin:16px 40px 0;padding:10px 14px;border-radius:8px;background:var(--amber-bg);border:1px solid #E8D5AC;color:var(--amber);font-size:12.5px}
.toc{margin:18px 40px;padding:16px 18px;background:var(--card);border:1px solid var(--line);border-radius:10px}
.toc h2{margin:0 0 10px;font-size:14px;color:var(--deep)}
.toc ol{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:4px 16px}
.toc a{color:var(--deep-2);text-decoration:none;font-size:12.5px;display:block;padding:3px 6px;border-radius:6px}
.toc a:hover,.toc a:focus-visible{background:#EAF2F6;color:var(--deep)}
main{padding:6px 40px 30px}
.chapter{background:var(--card);border:1px solid var(--line);border-radius:12px;margin:18px 0;padding:20px 24px;scroll-margin-top:16px}
.chapter>h2{display:flex;align-items:center;gap:10px;margin:0 0 14px;font-size:18px;color:var(--deep)}
.ch-no{flex:none;display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;background:linear-gradient(150deg,var(--deep),var(--teal));color:#fff;font-size:13px}
.block{border-top:1px dashed var(--line);padding:14px 0 6px;margin-top:12px}
.block:first-of-type{border-top:none;margin-top:0;padding-top:0}
.block h3{margin:0 0 10px;font-size:15px;color:var(--ink)}
.period-tag{font-weight:normal;font-size:11.5px;color:var(--deep-2);background:#E8F1F6;border:1px solid var(--line);border-radius:10px;padding:1px 8px;margin-left:8px;vertical-align:1px;white-space:nowrap}
.synthetic-tag{font-weight:normal;font-size:11.5px;color:var(--amber);background:var(--amber-bg);border:1px solid #E8D5AC;border-radius:10px;padding:1px 8px;margin-left:8px;vertical-align:1px;white-space:nowrap}
figure{margin:0 0 12px}
figure img{max-width:100%;height:auto;border:1px solid var(--line);border-radius:8px;background:#fff}
figcaption{font-size:12px;color:var(--muted);margin-top:4px}
.tbl-wrap{overflow-x:auto;scrollbar-width:thin}
table{border-collapse:collapse;width:100%;font-size:13px}
thead th{background:var(--deep);color:#F2F8FC;padding:7px 10px;text-align:left;font-weight:600;white-space:nowrap}
tbody td{padding:6px 10px;border-bottom:1px solid var(--line)}
tbody tr:nth-child(even){background:#F5F9FB}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
tr.totals td{background:#E8F2EE;font-weight:700;border-top:2px solid var(--mint)}
.empty-box{padding:14px 16px;border:1px dashed #D9BE82;border-radius:8px;background:var(--amber-bg);color:var(--amber);font-size:13px}
.summary{font-size:13.5px;color:var(--ink);margin:0 0 10px;line-height:1.75}
footer.doc{padding:0 40px 46px;font-size:12px;color:var(--muted)}
.toolbar{position:fixed;right:20px;bottom:20px;display:flex;align-items:center;gap:10px;z-index:50}
.toolbar .hint{background:#fff;border:1px solid var(--line);color:var(--muted);font-size:12px;padding:8px 12px;border-radius:8px;box-shadow:0 2px 10px rgba(14,58,93,.12)}
.toolbar button{border:none;cursor:pointer;background:linear-gradient(150deg,var(--deep),var(--teal));color:#fff;font-family:inherit;font-size:13px;font-weight:600;padding:10px 16px;border-radius:8px;box-shadow:0 3px 12px rgba(14,58,93,.25)}
.toolbar button:hover{filter:brightness(1.1)}
.toolbar button:focus-visible{outline:2px solid var(--mint);outline-offset:2px}
@media (max-width:720px){.cover{padding:24px 18px}.notice,.toc{margin-left:18px;margin-right:18px}main{padding:6px 18px 24px}footer.doc{padding:0 18px 40px}}
@page{size:A4;margin:13mm 11mm}
@media print{
html,body{background:#fff}
.toolbar,.no-print{display:none!important}
.cover{background:var(--deep)!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:20px 24px}
.notice,.toc{margin-left:0;margin-right:0}
main{padding:0}
.chapter{border:none;border-radius:0;margin:0;padding:12px 0;page-break-before:always;break-before:page}
.chapter:first-child{page-break-before:auto;break-before:auto}
.block{page-break-inside:avoid;break-inside:avoid}
thead{display:table-header-group}
tr{page-break-inside:avoid}
a{color:inherit;text-decoration:none}
}
`;

  function htmlTable(result) {
    const A = analysis();
    const t = (isFn(A, 'tableRows') && A.tableRows(result)) || {};
    const headers = Array.isArray(t.headers) ? t.headers : [];
    const rows = Array.isArray(t.rows) ? t.rows : [];
    if (!headers.length || !rows.length) return '';
    const parts = ['<div class="tbl-wrap"><table><thead><tr>'];
    headers.forEach(h => parts.push('<th class="' + (headerAlign(h) === 'right' ? 'num' : '') + '">' + esc(headerLabel(h)) + '</th>'));
    parts.push('</tr></thead><tbody>');
    rows.forEach(row => {
      parts.push('<tr>');
      headers.forEach(h => parts.push('<td class="' + (headerAlign(h) === 'right' ? 'num' : '') + '">' + esc(row ? row[headerKey(h)] : null) + '</td>'));
      parts.push('</tr>');
    });
    if (Array.isArray(t.totals)) {
      parts.push('<tr class="totals">');
      t.totals.forEach((v, i) => parts.push('<td class="' + (headerAlign(headers[i]) === 'right' ? 'num' : '') + '">' + esc(v) + '</td>'));
      parts.push('</tr>');
    }
    parts.push('</tbody></table></div>');
    return parts.join('');
  }

  function blockHtml(ch, bi, block, model, pngMap) {
    const result = (block && block.result) || {};
    const meta = model.meta;
    const periodLabel = result.periodLabel || meta.periodLabel || '';
    const rows = Array.isArray(result.rows) ? result.rows : [];
    const heading = (block && block.heading) || ('数据块 ' + pad2(bi + 1));
    const sourceLabel = blockSourceLabel(result);
    const wantsTable = !!(block && block.presentation === 'table');
    const summary = block && typeof block.summary === 'string' ? block.summary.trim() : '';
    const parts = ['<article class="block"><h3>' + esc(heading) + '<span class="period-tag">统计期间：' + esc(periodLabel || '—') + '</span>' + (sourceLabel ? '<span class="synthetic-tag">' + esc(sourceLabel) + '</span>' : '') + '</h3>'];
    if (summary) parts.push('<p class="summary">' + esc(summary) + '</p>');
    const png = pngMap.get(ch.no + ':' + bi);
    if (!rows.length) {
      parts.push('<div class="empty-box"><strong>空态：</strong>' + esc(result.empty || '本期无数据（缺数不按0计）') + '</div>');
    } else if (wantsTable) {
      parts.push(htmlTable(result) || '<div class="empty-box">本块有数据行但无可显示列。</div>');
    } else if (png) {
      parts.push('<figure><img src="' + png + '" alt="' + esc(heading) + ' 图表"><figcaption>图表快照（PNG 已内嵌，离线可见）</figcaption></figure>');
    } else {
      parts.push('<div class="empty-box">本块无可用图表快照；聚合数据见分章 CSV（ZIP 导出内），此处不逐行展示。</div>');
    }
    parts.push('</article>');
    return parts.join('');
  }

  function buildHtmlDocument(model, lock, pngMap, missing) {
    const meta = model.meta;
    const title = (meta.title || '营销一体化月报') + (meta.periodLabel ? ' · ' + meta.periodLabel : '');
    const parts = [];
    parts.push('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">');
    parts.push('<meta name="viewport" content="width=device-width,initial-scale=1">');
    parts.push('<meta name="color-scheme" content="light">');
    parts.push('<title>' + esc(title) + '</title><style>' + REPORT_CSS + '</style></head><body>');
    parts.push('<header class="cover"><h1>' + esc(meta.title || '营销一体化月报') + '</h1>');
    parts.push('<div class="sub">离线静态快照 · 按月报原题顺序 18 章 · 图表与摘要，不含逐户明细</div>');
    parts.push('<div class="sub">章节沿用参考月报原题（原题中的7月等月份为模板名称）；各项本次统计期间以图表旁标注为准</div>');
    parts.push('<div class="meta-grid">');
    const metaPairs = [
      ['数据期间', meta.periodLabel], ['数据范围', lock.scopeLabel || meta.scopeLabel],
      ['数据性质', reportSourceNote(model, lock)], ['生成时间', meta.generatedAt || formatLocal(lock.at)]
    ];
    metaPairs.forEach(pair => parts.push('<div><span class="k">' + esc(pair[0]) + '</span><span>' + esc(pair[1] == null || pair[1] === '' ? '—' : pair[1]) + '</span></div>'));
    parts.push('</div></header>');
    const hasSynthetic = model.chapters.some(ch => ch.blocks.some(b => blockSourceLabel(b && b.result)));
    parts.push('<div class="notice">本文件为离线原型导出：数据为合成样例，不冒称实时接入；' + (hasSynthetic ? '部分数据块为原型模拟数据（非真实接入），已在各块单独标注；' : '') + '缺值显示“—”（CSV 留空），绝不按 0 计；牟新水务为空占位单位，不参与合计/排名/占比。如需 PDF：点击右下角“打印 / 另存为 PDF”，在打印对话框目标中选择“另存为 PDF”。</div>');
    parts.push('<nav class="toc"><h2>目录（' + model.chapters.length + ' 章）</h2><ol>');
    model.chapters.forEach(ch => parts.push('<li><a href="#ch-' + pad2(ch.no) + '">' + esc(ch.title) + '</a></li>'));
    parts.push('</ol></nav><main>');
    model.chapters.forEach(ch => {
      parts.push('<section class="chapter" id="ch-' + pad2(ch.no) + '"><h2><span class="ch-no">' + pad2(ch.no) + '</span>' + esc(ch.title) + '</h2>');
      if (!ch.blocks.length) parts.push('<div class="empty-box">本章无数据块。</div>');
      ch.blocks.forEach((block, bi) => parts.push(blockHtml(ch, bi, block, model, pngMap)));
      parts.push('</section>');
    });
    parts.push('</main>');
    let embeddedPng = 0;
    model.chapters.forEach(ch => ch.blocks.forEach((block, bi) => {
      if (!(block && block.presentation === 'table') && pngMap.has(ch.no + ':' + bi)) embeddedPng++;
    }));
    parts.push('<footer class="doc">空块 ' + missing.emptyBlocks + ' 个 · 缺值单元格 ' + missing.missingCells + ' 个（明细见 ZIP 导出内“缺数说明.txt”）· 图表 PNG ' + embeddedPng + ' 张已内嵌 · 本文件不依赖任何外部资源，双击即可离线打开。</footer>');
    parts.push('<div class="toolbar no-print"><span class="hint">离线快照 · 可打印</span><button type="button" onclick="window.print()">打印 / 另存为 PDF</button></div>');
    parts.push('</body></html>');
    return parts.join('\n');
  }

  function dataUrlToBytes(dataUrl) {
    const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  /* ---------- 导出编排：冻结上下文 → 模型 → 守卫 → CSV/PNG → HTML/ZIP → 下载前复核 ---------- */
  let exporting = false;

  function requireAnalysis() {
    const A = analysis();
    const missing = ['buildReportModel', 'tableRows', 'chartOption'].filter(key => !isFn(A, key));
    if (missing.length) throw new Error('WBAnalysis 导出接口不可用：' + missing.join('、') + '（请确认 analysis-v6.js 已加载）');
    return A;
  }

  function logExport(kind, ok, reason, extra) {
    const E = engine();
    if (isFn(E, 'logEvent')) { try { E.logEvent('export', 'report-' + kind, ok, reason || '', extra || {}); } catch (_) { /* 审计不可用不阻断导出 */ } }
  }

  async function runExport(kind) {
    if (exporting) { notify('已有月报导出正在进行，请等待其结束后再发起', true); return false; }
    exporting = true;
    let lock = null;
    let sources = [];
    let pngCount = 0;
    try {
      const A = requireAnalysis();
      showStatus('正在锁定导出上下文（身份 / 范围 / 查询 / 手填版本）…');
      lock = captureLock();
      await tick();
      showStatus('正在构建月报 18 章模型…');
      const model = normalizeModel(A.buildReportModel());
      assertLock(lock);
      await tick();
      showStatus('正在校验源数据范围（engine.exportGuard）…');
      sources = guardModel(model, lock);
      assertSourcesOwned(sources);
      assertLock(lock);
      const missing = collectMissing(model);
      const totalBlocks = model.chapters.reduce((n, ch) => n + ch.blocks.length, 0);
      const chartBlocks = [];
      model.chapters.forEach(ch => ch.blocks.forEach((block, bi) => {
        if (block && block.result && block.result.chart) chartBlocks.push({ ch, bi, block });
      }));
      const pngMap = new Map();
      for (let i = 0; i < chartBlocks.length; i++) {
        const entry = chartBlocks[i];
        showStatus('正在渲染图表 PNG（' + (i + 1) + '/' + chartBlocks.length + '）· 第' + entry.ch.no + '章…');
        await tick();
        const url = await renderBlockChart(entry.block.result, model.meta.periodLabel, entry.block.heading);
        assertLock(lock);
        if (url) { pngMap.set(entry.ch.no + ':' + entry.bi, url); pngCount++; }
      }
      showStatus('正在生成 ' + totalBlocks + ' 个数据块 CSV 与离线 HTML…');
      await tick();
      const plan = csvPlan(model, lock);
      const html = buildHtmlDocument(model, lock, pngMap, missing);
      assertLock(lock);
      assertSourcesOwned(sources);
      const base = reportBaseName(model.meta);
      const rowCount = countRows(model);
      if (kind === 'html') {
        showStatus('正在准备 HTML 下载…');
        downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), base + '.html');
        logExport(kind, true, '', { rows: rowCount, blocks: totalBlocks, png: pngCount, empty: missing.emptyBlocks });
        notify('已导出月报 HTML：' + base + '.html（' + model.chapters.length + ' 章 / ' + totalBlocks + ' 块 · 图表与摘要；离线打开后可打印另存 PDF）', false);
      } else {
        showStatus('正在打包 ZIP（HTML + CSV + PNG + 目录 + 缺数说明）…');
        await tick();
        const files = [{ name: base + '.html', data: html }];
        plan.files.forEach(file => files.push(file));
        chartBlocks.forEach(entry => {
          const url = pngMap.get(entry.ch.no + ':' + entry.bi);
          if (url) files.push({ name: blockPngName(entry.ch, entry.bi, entry.block), data: dataUrlToBytes(url) });
        });
        files.push({ name: 'manifest.csv', data: manifestCsv(model, lock, plan.index, base + '.html') });
        files.push({ name: '缺数说明.txt', data: missingNotesText(model, lock, missing) });
        assertLock(lock);
        assertSourcesOwned(sources);
        const bytes = buildZip(files, lock.at);
        downloadBlob(new Blob([bytes], { type: 'application/zip' }), base + '.zip');
        logExport(kind, true, '', { rows: rowCount, blocks: totalBlocks, png: pngCount, files: files.length, empty: missing.emptyBlocks });
        notify('已导出月报 ZIP：' + base + '.zip（' + files.length + ' 个文件：图表与摘要 HTML / ' + plan.files.length + ' 个分章 CSV / ' + pngCount + ' 张 PNG / 目录与缺数说明）', false);
      }
      return true;
    } catch (err) {
      const message = (err && err.message) || String(err);
      const aborted = !!(err && err.aborted);
      logExport(kind, false, message, {});
      notify((aborted ? '导出已中止：' : '导出失败：') + message, true);
      return false;
    } finally {
      hideStatus();
      exporting = false;
    }
  }

  window.WBReportV6 = Object.freeze({
    exportHtml: () => runExport('html'),
    exportZip: () => runExport('zip')
  });
})();