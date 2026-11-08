/* 郑州市12法定行政区 + 4功能区独立叠加。几何非生产批准，业务值只取WB.engine。 */
window.WBMap = (() => {
  const G = window.WB_MAP_DATA;
  const D = window.WB_DATA;
  const E = window.WB.engine;
  const instances = new Map();
  const state = { metric: 'sold_vol', view: 'main', functional: false };
  const metrics = {
    sold_vol: { label: '售水量', unit: 'm³', decimals: 0, displayUnit: '万m³', displayDecimals: 2, colors: ['#E8F2FA', '#8BBCE2', '#317FC2'] },
    registered_count: { label: '注册用户数', unit: '户', decimals: 0, displayUnit: '户', displayDecimals: 0, colors: ['#EAF5EE', '#93CBA6', '#41A75E'] },
    loss_rate_pct: { label: '产销差率', unit: '%', decimals: 2, displayUnit: '%', displayDecimals: 2, colors: ['#DDF0E3', '#F5D8A8', '#D95555'] },
    avg_price_yuan: { label: '售水均价', unit: '元/m³', decimals: 3, displayUnit: '元/m³', displayDecimals: 3, colors: ['#F0EEF8', '#B6A9D8', '#735DA8'] },
    charge_rate_pct: { label: '收费率', unit: '%', decimals: 2, displayUnit: '%', displayDecimals: 2, colors: ['#FFF2E7', '#F6BE8C', '#E77825'] }
  };
  const bounds = {
    wide: [[112.65, 35.04], [114.28, 34.22]],
    main: [[113.42, 35.00], [114.25, 34.25]]
  };
  const zoneColors = ['#735DA8', '#317FC2', '#E77825', '#41A75E'];
  const esc = value => E?.esc ? E.esc(value) : String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (value, digits = 0) => E?.fmt ? E.fmt(value, digits) : (value == null || !Number.isFinite(+value) ? '—' : (+value).toFixed(digits));
  const metric = key => metrics[key] || metrics.sold_vol;
  const region = code => (D?.adminRegions || []).find(item => item.code === code);
  const isGray = status => ['none', 'wholesale', 'out_of_scope', 'wholesale_only'].includes(String(status || '').toLowerCase());
  const statusLabel = () => '样例分布 · 实际归属待映射';

  function displayValue(key, value) {
    if (value == null || !Number.isFinite(+value)) return null;
    return key === 'sold_vol' ? +value / 10000 : +value;
  }

  function totals(filters) {
    if (!E?.filterFacts || !E?.aggregate) return { count: 0 };
    const rows = E.filterFacts(filters || {});
    const layered = E.applyLayer ? E.applyLayer(rows, filters || {}) : rows;
    return E.aggregate(layered, filters || {});
  }

  function baseFilters(filters) {
    return { ...(filters || {}), admin: '', functional: '' };
  }

  function buildRows(filters) {
    const f = baseFilters(filters);
    const key = state.metric;
    return (D?.adminRegions || []).map(item => {
      const t = totals({ ...f, admin: item.code });
      if(key==='loss_rate_pct')t.loss_rate_pct=null;const raw = t.count ? (t[key] ?? null) : null;
      return {
        code: item.code,
        name: item.name,
        group: item.group,
        status: item.status,
        count: t.count || 0,
        totals: t,
        rawValue: raw,
        displayValue: displayValue(key, raw),
        visible: state.view === 'wide' || item.group === 'main'
      };
    });
  }

  function buildFunctionalRows(filters) {
    const f = baseFilters(filters);
    const key = state.metric;
    return (D?.functionalZones || []).map((item, index) => {
      const t = totals({ ...f, functional: item.code });
      if(key==='loss_rate_pct')t.loss_rate_pct=null;const raw = t.count ? (t[key] ?? null) : null;
      return {
        code: item.code,
        name: item.name,
        short: item.short || item.name,
        count: t.count || 0,
        totals: t,
        rawValue: raw,
        displayValue: displayValue(key, raw),
        color: zoneColors[index % zoneColors.length]
      };
    });
  }

  let hatchPattern;
  function grayPattern() {
    if (hatchPattern || typeof document === 'undefined') return hatchPattern;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 10;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#E9EDF1';
    ctx.fillRect(0, 0, 10, 10);
    ctx.strokeStyle = '#C8D0D7';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-3, 3); ctx.lineTo(3, -3);
    ctx.moveTo(0, 10); ctx.lineTo(10, 0);
    ctx.moveTo(7, 13); ctx.lineTo(13, 7);
    ctx.stroke();
    hatchPattern = { image: canvas, repeat: 'repeat' };
    return hatchPattern;
  }

  function registerMaps() {
    if (!G || typeof echarts === 'undefined') throw new Error('离线地图几何或 ECharts 未加载');
    if (registerMaps.done) return;
    const mainCodes = (D?.adminRegions || []).filter(item => item.group === 'main').map(item => item.code);
    echarts.registerMap('wb-zhengzhou-wide', G.admin);
    echarts.registerMap('wb-zhengzhou-main', {
      type: 'FeatureCollection',
      features: G.admin.features.filter(item => mainCodes.includes(String(item.properties.code || item.properties.id)))
    });
    echarts.registerMap('wb-zhengzhou-functional', G.functional);
    registerMaps.done = true;
  }

  function summaryHtml(name, row, functional) {
    const m = metric(state.metric);
    const status = functional ? '功能区独立空间筛选' : statusLabel(row.status);
    const value = row.count ? `${fmt(row.displayValue, m.displayDecimals)} ${m.displayUnit}` : '源数据缺失（非0）';
    const lines = [
      `<div style="font-size:14px;font-weight:600;margin-bottom:6px">${esc(name)}</div>`,
      `<div style="color:#758697;margin-bottom:6px">${esc(status)}</div>`,
      `<div><strong>${esc(m.label)}：</strong>${esc(value)}</div>`,
      `<div>售水量：${fmt(displayValue('sold_vol', row.totals.sold_vol), 2)} 万m³</div>`,
      `<div>收费率：${fmt(row.totals.charge_rate_pct, 2)}%　产销差率：${fmt(row.totals.loss_rate_pct, 2)}%</div>`,
      `<div>售水均价：${fmt(row.totals.avg_price_yuan, 3)} 元/m³</div>`,
      `<div>注册用户数：${fmt(row.totals.registered_count, 0)} ${state.view === 'main' ? '户' : '户'}</div>`
    ];
    return lines.join('');
  }

  function makeOption(rows, functionalRows, filters) {
    const m = metric(state.metric);
    const numeric = rows.filter(row => row.visible && !isGray(row.status) && row.displayValue != null).map(row => row.displayValue);
    let min = numeric.length ? Math.min(...numeric) : 0;
    let max = numeric.length ? Math.max(...numeric) : 1;
    if (min === max) { min = Math.min(0, min); max = max || min + 1; }
    const layout = {
      layoutCenter: ['50%', '50%'], layoutSize: '92%', aspectScale: 0.88,
      boundingCoords: bounds[state.view], roam: false, selectedMode: false
    };
    const adminData = rows.filter(row => row.visible).map(row => {
      const gray = isGray(row.status);
      return {
        name: row.name,
        code: row.code,
        value: gray ? null : row.displayValue,
        displayValue: row.displayValue,
        rawValue: row.rawValue,
        count: row.count,
        totals: row.totals,
        status: row.status,
        itemStyle: gray ? { areaColor: grayPattern(), borderColor: '#B8C2CB' } : row.status === 'partial' ? { borderColor: '#E89A4A', borderWidth: 1.4, borderType: 'dashed' } : undefined,
        label: { color: gray ? '#8A949C' : '#40566A' }
      };
    });
    const functionalData = functionalRows.map(row => ({
      name: row.name,
      code: row.code,
      value: row.displayValue,
      displayValue: row.displayValue,
      rawValue: row.rawValue,
      count: row.count,
      totals: row.totals,
      itemStyle: {
        areaColor: row.color,
        opacity: 0.10,
        borderColor: row.color,
        borderWidth: 1.8,
        borderType: 'dashed'
      },
      emphasis: { itemStyle: { areaColor: row.color, opacity: 0.22, borderWidth: 2.4 }, label: { color: row.color, fontWeight: 'bold' } },
      label: { show: true, formatter: row.short, color: row.color, fontSize: 10, fontWeight: 600 }
    }));
    return {
      animationDurationUpdate: 250,
      tooltip: {
        trigger: 'item', confine: true, backgroundColor: 'rgba(255,255,255,.97)',
        borderColor: '#DCE6EE', textStyle: { color: '#354B5C', fontSize: 12, lineHeight: 21 },
        formatter: params => {
          if (params.seriesId === 'functional') {
            const row = functionalRows.find(item => item.name === params.name);
            return row ? summaryHtml(params.name, row, true) : esc(params.name);
          }
          const row = rows.find(item => item.name === params.name);
          return row ? summaryHtml(params.name, row, false) : `${esc(params.name)}<br>映射待核`;
        }
      },
      visualMap: {
        show: numeric.length > 0, seriesIndex: 0, min, max, calculable: false,
        left: 8, bottom: 6, itemWidth: 8, itemHeight: 88,
        text: [m.displayUnit, m.label], textStyle: { color: '#758697', fontSize: 10 },
        inRange: { color: m.colors }, outOfRange: { color: ['#E9EDF1'] },
        formatter: value => fmt(value, m.displayDecimals)
      },
      series: [{
        id: 'admin', name: '法定行政区', type: 'map', map: state.view === 'main' ? 'wb-zhengzhou-main' : 'wb-zhengzhou-wide',
        ...layout, z: 2, data: adminData,
        label: { show: true, fontSize: 10, formatter: params => params.name.replace('回族区', '').replace('市', '') },
        itemStyle: { borderColor: '#FFFFFF', borderWidth: 1.1 },
        emphasis: { label: { show: true, color: '#17364D', fontWeight: 'bold' }, itemStyle: { areaColor: '#F5C77E', borderColor: '#317FC2', borderWidth: 1.5 } },
        select: { disabled: true }
      }, ...(state.functional ? [{
        id: 'functional', name: '功能区叠加（不重复汇总）', type: 'map', map: 'wb-zhengzhou-functional',
        ...layout, z: 3, data: functionalData,
        label: { show: true }, itemStyle: { opacity: 0.1 }, emphasis: { label: { show: true } }
      }] : [])]
    };
  }

  function csvRows(rows) {
    const m = metric(state.metric);
    return rows.filter(row => row.visible).map(row => [row.name, row.count ? row.rawValue : null, `${m.unit}｜${statusLabel(row.status)}`]);
  }

  function create(el, options = {}) {
    registerMaps();
    const id = options.id || el.id || 'C-HOME-01';
    let latestRows = [];
    const definition = {
      id,
      title: options.title || '郑州市行政区划双层交互地图',
      dimension: 'admin',
      getLocalFilters: () => ({ view: state.view, functional: state.functional, metric: state.metric }),
      getOption: ctx => {
        latestRows = buildRows(ctx.filters);
        const functionalRows = state.functional ? buildFunctionalRows(ctx.filters) : [];
        const option = makeOption(latestRows, functionalRows, ctx.filters);
        if (options.onRows) setTimeout(() => options.onRows(latestRows.filter(row => row.visible), state.metric), 0);
        return option;
      },
      getRows: () => csvRows(latestRows),
      onClick: params => {
        const functional = params.seriesId === 'functional';
        const code = params.data?.code;
        const row = functional ? buildFunctionalRows(WB.state).find(item => item.code === code) : latestRows.find(item => item.code === code);
        if (!row || !code) return;
        if (!row.count) {
          WB.shell?.toast(`${row.name}当前Filter无可用事实，缺数不按0处理`);
          return;
        }
        if (options.onDrill) options.onDrill({ type: functional ? 'functional' : 'admin', code, name: row.name, metric: state.metric, totals: row.totals });
      }
    };
    let chart;
    if (E?.registerChart) chart = E.registerChart(id, el, definition);
    else {
      chart = echarts.init(el);
      const render = () => {
        const filters = { ...WB.state };
        latestRows = buildRows(filters);
        chart.setOption(makeOption(latestRows, state.functional ? buildFunctionalRows(filters) : [], filters), true);
      };
      chart.on('click', definition.onClick);
      render();
    }
    const api = { id, chart, state, refresh: () => E?.refreshChart ? E.refreshChart(id) : chart.resize() };
    instances.set(id, api);
    return api;
  }

  function setState(patch, id = 'C-HOME-01') {
    Object.assign(state, patch || {});
    if (E?.refreshChart && E.charts?.has(id)) E.refreshChart(id);
    else instances.get(id)?.chart?.resize();
  }

  return {
    create,
    setState,
    getState: () => ({ ...state }),
    metrics,
    meta: G?.meta || {},
    formatValue: displayValue,
    statusLabel
  };
})();
