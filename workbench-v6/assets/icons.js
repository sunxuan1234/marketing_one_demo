/* Shared linear SVG icon set. No external font or network dependency. */
(function (global) {
  'use strict';

  const paths = {
    water: '<path d="M12 2.7c4 4.8 6.3 8.2 6.3 11.3a6.3 6.3 0 0 1-12.6 0C5.7 10.9 8 7.5 12 2.7z"/><path d="M9.2 14.4a3 3 0 0 0 2.8 2"/>',
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    kpi: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/><path d="m3 6 5-3 6 4 6-4"/>',
    trend: '<path d="m3 17 5-5 4 4 8-9"/><path d="M15 7h5v5"/>',
    trendDown: '<path d="m3 7 5 5 4-4 8 9"/><path d="M15 17h5v-5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    meter: '<circle cx="12" cy="13" r="8"/><path d="m12 13 3-3M9 2h6M12 2v3"/>',
    wallet: '<path d="M3 6.5h15a3 3 0 0 1 3 3V19H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h13M16 12h5"/><circle cx="16" cy="12" r=".7"/>',
    flow: '<path d="M5 3v4c0 2 2 3 4 3h6c2 0 4 1 4 3v4M3 3h4M17 17h4"/><circle cx="5" cy="17" r="2"/><path d="M5 15v4"/>',
    report: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 11h6M9 15h4"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08a1.7 1.7 0 0 0-1.06-1.52 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3v-4h.08a1.7 1.7 0 0 0 1.52-1.06 1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3h4v.08a1.7 1.7 0 0 0 1.03 1.52 1.7 1.7 0 0 0 1.88-.34L17 4.2 19.8 7l-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.96 10H21v4h-.08a1.7 1.7 0 0 0-1.52 1z"/>',
    collapse: '<path d="m15 18-6-6 6-6M21 12H9M4 4v16"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronUp: '<path d="m6 15 6-6 6 6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    arrowUpRight: '<path d="M7 17 17 7M7 7h10v10"/>',
    arrowLeft: '<path d="M19 12H5m7 7-7-7 7-7"/>',
    arrowRight: '<path d="M5 12h14m-7-7 7 7-7 7"/>',
    arrowUp: '<path d="m12 19V5m-7 7 7-7 7 7"/>',
    arrowDown: '<path d="M12 5v14m7-7-7 7-7-7"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 19v2h16v-2"/>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 19v2h16v-2"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5M6.1 8a7 7 0 0 1 11.4-2L20 8M4 16l2.5 2a7 7 0 0 0 11.4-2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    xCircle: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    building: '<path d="M3 21h18M5 21V5l7-3v19M19 21V9l-7-3M8 8h1M8 12h1M8 16h1M15 12h1M15 16h1"/>',
    location: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/>',
    layers: '<path d="M12 2 2 7l10 5 10-5-10-5zM2 12l10 5 10-5M2 17l10 5 10-5"/>',
    filter: '<path d="M4 5h16M7 12h10M10 19h4"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6"/>',
    home: '<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',
    alert: '<path d="M10.3 3.7 2.4 18a2 2 0 0 0 1.8 3h15.6a2 2 0 0 0 1.8-3L13.7 3.7a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>',
    empty: '<path d="m4 7 8-4 8 4-8 4-8-4zM4 7v10l8 4 8-4V7M9 14h6"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    logout: '<path d="m10 17 5-5-5-5M15 12H3M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/>',
    fullscreen: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    spark: '<path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16z"/>',
    project: '<path d="M3 21h18M5 21V8h14v13M8 8V4h8v4M8 12h2M14 12h2M8 16h2M14 16h2"/>',
    forecast: '<path d="M3 17l5-5 4 3 8-9M15 6h5v5"/><path d="M3 21h18" stroke-dasharray="2 2"/>',
    work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-5"/>',
    role: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0M17 5l2-2 2 2-2 2z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5"/>',
    external: '<path d="M14 3h7v7M10 14 21 3M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>',
    sort: '<path d="M3 6h13M3 12h9M3 18h5M17 15v6m-3-3 3 3 3-3"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
    pause: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>',
    attachment: '<path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.6-9.6a4 4 0 0 1 5.7 5.7l-9.6 9.6a2 2 0 0 1-2.8-2.8l8.9-8.9"/>',
    send: '<path d="m22 2-7 20-4-9-9-4zM22 2 11 13"/>',
    undo: '<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>'
  };

  function escapeAttribute(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function icon(name, className, label) {
    const content = paths[name] || paths.file;
    const classes = ['icon', className || ''].filter(Boolean).join(' ');
    const accessibility = label
      ? 'role="img" aria-label="' + escapeAttribute(label) + '"'
      : 'aria-hidden="true"';
    return '<svg class="' + escapeAttribute(classes) + '" viewBox="0 0 24 24" ' + accessibility + ' focusable="false">' + content + '</svg>';
  }

  function hydrate(root) {
    const scope = root || document;
    if (scope.nodeType === 1 && scope.matches && scope.matches('[data-icon]') && !scope.querySelector('svg.icon')) {
      scope.innerHTML = icon(scope.getAttribute('data-icon'));
    }
    scope.querySelectorAll('[data-icon]').forEach(function (element) {
      if (!element.querySelector('svg.icon')) element.innerHTML = icon(element.getAttribute('data-icon'));
    });
  }

  global.WBIcons = { paths: paths, icon: icon, hydrate: hydrate };

  let scheduled = false;
  function scheduleHydration() {
    if (scheduled) return;
    scheduled = true;
    Promise.resolve().then(function () {
      scheduled = false;
      if (document.body) hydrate(document.body);
    });
  }

  function startObserver() {
    hydrate(document);
    if (!global.MutationObserver) return;
    const observer = new MutationObserver(function (records) {
      if (records.some(function (record) { return record.addedNodes.length; })) scheduleHydration();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  else startObserver();
})(window);
