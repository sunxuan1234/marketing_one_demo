/* V6 原型模拟数据（非真实接入）
 * 仅用于补齐 21 项缺源需求（r9/11/12/21/41/45/47/48/52/55/63/64/65/66/67/76/78/79/80/81/82）的可演示样本。
 * 全部为确定性模拟记录，不修改 WB_DATA / WBOrg 任何源数组；只读取二者（不依赖后加载的 WBAccess）。
 * 加载顺序：data.js 之后、demo-profiles.js 之前。所有集合 deepFreeze。
 * 生成假设见 meta.assumptions。用户关联行展开完整 dims(u) 以兼容 business.matches 与 ownsRow 权限。
 */
window.WBPrototypeData = (() => {
  'use strict';
  const D = window.WB_DATA;
  const Org = window.WBOrg;
  if (!D || !Org) throw new Error('WBPrototypeData: 需先加载 data.js 与 organization.js');

  const hash = D.hash;
  const pad2 = n => String(n).padStart(2, '0');
  const round2 = n => Math.round(n * 100) / 100;
  const round3 = n => Math.round(n * 1000) / 1000;
  const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const PERIODS_2026 = Array.from({ length: 10 }, (_, i) => `2026-${pad2(i + 1)}`);
  const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31]; // 2026 非闰年
  const CALIBERS = D.calibers;
  const userIndex = D.userIndex; // Map(userId -> user)
  const codeIndex = new Map(D.users.map(u => [u.unified_code, u])); // Map(unified_code -> user)

  // 完整维度（与 data.js dims(u) 一致），供 business.matches 使用。
  const dimsOf = u => ({
    company: u.company, companyId: u.companyId, unitId: u.unitId, unitNodeId: u.unitNodeId,
    orgNodeId: u.orgNodeId, orgType: u.orgType, lineKey: u.lineKey, admin: u.admin, adminCode: u.adminCode,
    org: u.org, team: u.team, line: u.line, booklet: u.booklet, nature: u.nature, industry: u.industry,
    caliber: u.caliber, meterType: u.meterType, functionalZones: u.functionalZones
  });
  // 用户关联行公共键：userId + accountId + 完整 dims（ownsRow 安全：orgNodeId 与 accountId 同户）。
  const base = u => ({ userId: u.id, accountId: u.unified_code, ...dimsOf(u) });
  const activeAt = (u, period) => {
    const end = `${period}-31`;
    return u.regDate <= end && (!u.deregisterDate || u.deregisterDate > end);
  };
  const naturePrice = nature => nature === '特行' ? 6.2 : nature === '非居民' ? 4.8 : nature === '居民非阶梯' ? 4.4 : 3.1;
  const INDUSTRY_CODES = {};
  D.industries.forEach((name, i) => { INDUSTRY_CODES[name] = `IND-${pad2(i + 1)}`; });

  /* 1. 规模以上企业名单（r9）——显式枚举模拟名单，非行业/用量/取模推断（C12）。 */
  const SCALE_IDS = [3, 7, 11, 15, 19, 23, 27, 31, 103, 203, 303, 403, 503, 603, 703, 803, 903,
    1003, 1103, 1203, 1303, 1403, 1503, 1603, 1703, 1803];
  const scaleRoster = SCALE_IDS.map(id => {
    const u = userIndex.get(id);
    return { id: `SR6-${id}`, ...base(u), industry: u.industry, validFrom: '2023-01-01', validTo: null, isScale: true };
  });

  /* 2. 水价优惠政策用户（r12）——按行业代码归集；POL-001 为显式居民低保名单。 */
  const POLICY_RESIDENT_IDS = [1, 2, 101, 102, 301, 302, 501, 502, 701, 702, 901, 902,
    1101, 1102, 1301, 1302, 1501, 1502, 1701, 1702, 1901, 1902];
  const POLICIES = [
    { code: 'POL-001', name: '低保户水价减免', match: u => POLICY_RESIDENT_IDS.includes(u.id) },
    { code: 'POL-002', name: '学校教学用水优惠', match: u => u.industry === '学校' },
    { code: 'POL-003', name: '绿化环卫用水优惠', match: u => u.industry === '绿化环卫' }
  ];
  const policyMembership = [];
  for (const u of D.users) {
    for (const p of POLICIES) {
      if (!p.match(u)) continue;
      const validFrom = u.regDate > '2023-01-01' ? u.regDate : '2023-01-01';
      policyMembership.push({
        id: `PM6-${p.code}-${u.id}`, ...base(u), policyCode: p.code, policyName: p.name,
        industryCode: INDUSTRY_CODES[u.industry], validFrom, validTo: null
      });
    }
  }

  /* 3. 水表口径变更（r21）——口径变更≠用水性质变更；部分与周检换表（2026-07-18）同步。 */
  const caliberChanges = [];
  D.users.slice(0, 240).forEach((u, i) => {
    if (i % 7 !== 0) return;
    const k = i / 7;
    const beforeCaliber = u.caliber;
    const afterCaliber = CALIBERS[(i % CALIBERS.length + 1) % CALIBERS.length];
    let effectiveDate, period, reason;
    if (k % 5 === 0) { effectiveDate = '2026-07-18'; period = '2026-07'; reason = '周检换表同步变更口径'; }
    else {
      const month = 1 + (k % 10), day = 5 + (k * 3) % 20;
      period = `2026-${pad2(month)}`; effectiveDate = `${period}-${pad2(day)}`; reason = '用水规模调整变更口径';
    }
    caliberChanges.push({
      id: `CC6-${u.id}`, ...base(u), meterId: u.meterId, effectiveDate, period,
      beforeCaliber, afterCaliber, reason
    });
  });

  /* 4. 仓库（r45）——营业所/网格/线路级真实组织节点，新表库 + 报废库各一；旧中心库 additive 保留。 */
  const LEAF_TYPE = { '1': 'office', '2': 'line', '3': 'grid', '4': 'grid' };
  const warehouses = [];
  const newWh = [];
  const newWhByUnit = new Map();
  const scrapWhList = [];
  for (const c of D.companies) {
    const unitId = String(c.id);
    const leaves = Org.nodes.filter(n => n.unitId === unitId && n.type === LEAF_TYPE[unitId]);
    leaves.forEach((leaf, idx) => {
      for (const [suffix, type] of [['N', '新表库'], ['S', '报废库']]) {
        const wh = {
          id: `WH6-${leaf.id}-${suffix}`, name: `${leaf.name}${type}`,
          address: `${c.name}${leaf.name}示例库址${idx + 1}号`, orgNodeId: leaf.id,
          unitId, company: c.name, unitNodeId: leaf.unitNodeId, type, ownershipLevel: leaf.type
        };
        warehouses.push(wh);
        if (type === '新表库') {
          newWh.push(wh);
          if (!newWhByUnit.has(unitId)) newWhByUnit.set(unitId, []);
          newWhByUnit.get(unitId).push(wh);
        } else scrapWhList.push(wh);
      }
    });
  }
  // 报废库按用户 orgPath 祖先匹配（unit1 库在营业所级、用户在网格/线路级，需祖先解析）。
  const scrapWhForUser = u => scrapWhList.find(w => w.unitId === u.unitId && u.orgPath.includes(w.orgNodeId));

  /* 5. 出入库流水（r41）——模拟台账，含地址/时间 lineage；最新流水决定库存状态。
   *    status：IN 在库 / OUT 已出库 / TRANSFER 调拨出库(源)+调拨入库( dest ) / SCRAP 报废入库。
   *    TRANSFER 成对，dest id > source id（同 eventAt），按 max(eventAt,id) 取最新落到 dest。 */
  const warehouseMovements = [];
  let mvSeq = 0;
  const mvId = () => `WM6-${String(++mvSeq).padStart(4, '0')}`;
  const whOrg = wh => {
    const wl = Org.get(wh.orgNodeId);
    return { orgNodeId: wh.orgNodeId, orgType: wl.type, lineKey: wl.lineKey, org: wl.org, team: wl.team, line: wl.line, unitId: wh.unitId, company: wh.company, unitNodeId: wh.unitNodeId, companyId: Number(wh.unitId) };
  };
  // 每个新表库下可选用户（orgPath 含该库节点），保证 OUT 行权限同叶子。
  const usersByWh = new Map();
  for (const wh of newWh) usersByWh.set(wh.id, D.users.filter(u => u.unitId === wh.unitId && u.orgPath.includes(wh.orgNodeId)));
  const inMeta = [];
  for (let k = 0; k < 120; k++) {
    const wh = newWh[k % newWh.length];
    const month = 1 + (k % 10), day = 3 + (k % 20);
    const period = `2026-${pad2(month)}`, eventAt = `${period}-${pad2(day)}`;
    const meterId = `NM6-${100000 + k}`, caliber = CALIBERS[k % CALIBERS.length], meterType = k % 3 === 0 ? '远传表' : '机械表';
    warehouseMovements.push({
      id: mvId(), meterId, warehouseId: wh.id, userId: null, accountId: null, eventType: 'IN',
      eventAt, period, address: wh.address, status: '在库', caliber, meterType, ...whOrg(wh)
    });
    inMeta.push({ wh, month, meterId, caliber, meterType, k });
  }
  for (const m of inMeta) { // OUT：偶数 k，晚于 IN
    if (m.k % 2 !== 0) continue;
    const month = Math.min(10, m.month + 1), day = 5 + (m.k % 20);
    const period = `2026-${pad2(month)}`, eventAt = `${period}-${pad2(day)}`;
    const list = usersByWh.get(m.wh.id), u = list[(m.k * 17) % list.length];
    warehouseMovements.push({
      id: mvId(), ...dimsOf(u), meterId: m.meterId, warehouseId: m.wh.id, userId: u.id, accountId: u.unified_code,
      eventType: 'OUT', eventAt, period, address: m.wh.address, status: '已出库', caliber: m.caliber, meterType: m.meterType, ...whOrg(m.wh)
    });
  }
  for (const m of inMeta) { // TRANSFER：k≡5 (mod 10)，同单位下一库，成对
    if (!(m.k % 5 === 0 && m.k % 2 === 1)) continue;
    const unitList = newWhByUnit.get(m.wh.unitId);
    const dest = unitList[(unitList.indexOf(m.wh) + 1) % unitList.length];
    const month = Math.min(10, m.month + 2), day = 8 + (m.k % 15);
    const period = `2026-${pad2(month)}`, eventAt = `${period}-${pad2(day)}`;
    warehouseMovements.push({
      id: mvId(), meterId: m.meterId, warehouseId: m.wh.id, userId: null, accountId: null, eventType: 'TRANSFER',
      eventAt, period, address: m.wh.address, status: '调拨出库', caliber: m.caliber, meterType: m.meterType, ...whOrg(m.wh)
    });
    warehouseMovements.push({
      id: mvId(), meterId: m.meterId, warehouseId: dest.id, userId: null, accountId: null, eventType: 'TRANSFER',
      eventAt, period, address: dest.address, status: '调拨入库', caliber: m.caliber, meterType: m.meterType, ...whOrg(dest)
    });
  }
  for (const me of D.meterEvents) { // SCRAP：换表旧表入报废库（2026-07-18）
    const i = Number(me.id.slice(3)) - 44001;
    if (i % 10 !== 0) continue;
    const u = userIndex.get(me.userId);
    const wh = scrapWhForUser(u);
    warehouseMovements.push({
      id: mvId(), ...dimsOf(u), meterId: me.oldMeter, warehouseId: wh.id, userId: u.id, accountId: u.unified_code,
      eventType: 'SCRAP', eventAt: me.date, period: me.period, address: wh.address, status: '报废入库',
      caliber: u.caliber, meterType: u.meterType, ...whOrg(wh)
    });
  }

  /* 6. 册本事件（r47 调整 / r48 入册）——入册日期=立户日+1..14 天（非立户日别名），2026-10 封顶。 */
  const bookletEvents = [];
  for (const u of D.users) {
    const offset = 1 + (u.id % 14);
    let eventAt = addDays(u.regDate, offset);
    if (eventAt > '2026-10-31') eventAt = '2026-10-31';
    bookletEvents.push({
      id: `BE6-E-${u.id}`, ...base(u), eventType: 'ENROLL', eventAt, period: eventAt.slice(0, 7),
      beforeBooklet: null, afterBooklet: u.booklet, reason: '新增用户入册'
    });
  }
  D.users.forEach((u, i) => {
    if (i % 17 !== 0) return;
    const k = i / 17, month = 1 + (k % 10), day = 8 + (k % 18);
    const period = `2026-${pad2(month)}`, eventAt = `${period}-${pad2(day)}`;
    const afterBooklet = `${pad2((i % 12 + 1) % 12 + 1)}册本`;
    bookletEvents.push({
      id: `BE6-T-${u.id}`, ...base(u), eventType: 'TRANSFER', eventAt, period,
      beforeBooklet: u.booklet, afterBooklet, reason: '抄表线路优化调整册本'
    });
  });

  /* 11. DMA 用户唯一划分（r76）——单位内按户号顺序连续均分 3 节点，每户恰属 1 DMA；分块混合表型/性质，避免与远传表型(i%3)同余退化；父/子拓扑不重复统计。 */
  const usersByUnit = new Map();
  for (const u of D.users) {
    if (!usersByUnit.has(u.unitId)) usersByUnit.set(u.unitId, []);
    usersByUnit.get(u.unitId).push(u);
  }
  const dmaMemberships = [];
  const userDma = new Map();
  const membersByDma = new Map();
  for (const [unitId, list] of usersByUnit) {
    list.forEach((u, j) => {
      const dmaId = `DMA-${unitId}-${Math.min(2, Math.floor(j * 3 / list.length)) + 1}`;
      userDma.set(u.id, dmaId);
      dmaMemberships.push({ id: `DM6-${u.id}`, dmaId, ...base(u), meterId: u.meterId, validFrom: '2023-01-01', validTo: null });
      if (!membersByDma.has(dmaId)) membersByDma.set(dmaId, []);
      membersByDma.get(dmaId).push(u);
    });
  }

  /* 单次遍历 facts（92k）构建 DMA 期间流量累计 + 户累计售水（远传指数）+ 调整前值。 */
  const dmaSold = new Map(), dmaRemoteSold = new Map(), dmaNonresSold = new Map();
  const cumSold = new Map(), factsSold = new Map(), runByUser = new Map();
  for (const f of D.facts) {
    const uid = Number(f.seriesKey); // facts 无 userId 字段，户键为 seriesKey=String(u.id)
    const u = userIndex.get(uid);
    const key = `${uid}|${f.period}`;
    factsSold.set(key, f.sold_vol);
    const run = (runByUser.get(uid) || 0) + f.sold_vol;
    runByUser.set(uid, run);
    cumSold.set(key, run);
    const dmaId = userDma.get(uid);
    if (dmaId) {
      const dk = `${dmaId}|${f.period}`;
      dmaSold.set(dk, (dmaSold.get(dk) || 0) + f.sold_vol);
      if (u.meterType === '远传表') dmaRemoteSold.set(dk, (dmaRemoteSold.get(dk) || 0) + f.sold_vol);
      if (!u.nature.startsWith('居民')) dmaNonresSold.set(dk, (dmaNonresSold.get(dk) || 0) + f.sold_vol);
    }
  }

  /* 7. 远传推送/开账（r52）——每期每户一条，late 与 missing 分开；readIndex=1000+户号×100+累计售水。 */
  const remoteUsers = D.users.filter(u => u.meterType === '远传表');
  const remotePushEvents = [];
  for (const u of remoteUsers) {
    for (const period of PERIODS_2026) {
      if (!activeAt(u, period)) continue;
      const readIndex = 1000 + u.id * 100 + (cumSold.get(`${u.id}|${period}`) || 0);
      const dueAt = `${period}-25`, readingAt = `${period}-20`;
      const h = hash(`${u.id}|${period}|push6`);
      let pushedAt = null, billedAt = null, billedIndex = null;
      if (h >= 0.03) { // 非 missing
        const late = h < 0.08;
        pushedAt = late ? `${period}-28` : `${period}-21`;
        billedAt = late ? `${period}-29` : `${period}-26`;
        billedIndex = readIndex;
        if (hash(`${u.id}|${period}|idx6`) < 0.02) billedIndex = readIndex + (1 + Math.floor(hash(`${u.id}|${period}|idx6d`) * 5));
      }
      remotePushEvents.push({
        id: `RP6-${u.id}-${period}`, ...base(u), meterId: u.meterId, period, dueAt, readingAt,
        pushedAt, billedAt, readIndex, billedIndex
      });
    }
  }

  /* 8. 远传报警（r55 指数不一致 / r63 水量 / r64 通讯）。
   *    COMM_ALARM 对齐源在线快照窗口 2026-10-25…31，不宣称历史在线问题。 */
  const remoteAlerts = [];
  const alertStatus = key => hash(key) < 0.5 ? '待核查' : '已处理';
  const firstRemoteByUnit = new Map();
  for (const u of remoteUsers) if (!firstRemoteByUnit.has(u.unitId)) firstRemoteByUnit.set(u.unitId, u.id);
  for (const p of remotePushEvents) { // INDEX_MISMATCH
    if (p.billedIndex == null || p.billedIndex === p.readIndex) continue;
    const u = userIndex.get(p.userId);
    remoteAlerts.push({
      id: `RA6-IM-${p.userId}-${p.period}`, ...base(u), meterId: p.meterId, period: p.period,
      alertType: 'INDEX_MISMATCH', type: 'INDEX_MISMATCH', openedAt: `${p.period}-26`, value: Math.abs(p.billedIndex - p.readIndex),
      threshold: 1, status: alertStatus(`IM|${p.userId}|${p.period}`)
    });
  }
  for (const u of remoteUsers) { // WATER_ALARM + COMM_ALARM
    for (const period of PERIODS_2026) {
      if (!activeAt(u, period)) continue;
      const sold = factsSold.get(`${u.id}|${period}`) || 0;
      const threshold = u.nature.startsWith('居民') ? 30 : 180;
      if (sold > threshold && hash(`${u.id}|${period}|wa6`) < 0.3) {
        remoteAlerts.push({
          id: `RA6-WA-${u.id}-${period}`, ...base(u), meterId: u.meterId, period,
          alertType: 'WATER_ALARM', type: 'WATER_ALARM', openedAt: `${period}-22`, value: sold, threshold,
          status: alertStatus(`WA|${u.id}|${period}`)
        });
      }
      if (period === '2026-10' && (hash(`${u.id}|2026-10|ca6`) < 0.02 || u.id === firstRemoteByUnit.get(u.unitId))) {
        const day = 25 + Math.floor(hash(`${u.id}|2026-10|ca6d`) * 7);
        remoteAlerts.push({
          id: `RA6-CA-${u.id}-2026-10`, ...base(u), meterId: u.meterId, period: '2026-10',
          alertType: 'COMM_ALARM', type: 'COMM_ALARM', openedAt: `2026-10-${pad2(day)}`,
          value: 3 + Math.floor(hash(`${u.id}|2026-10|ca6v`) * 5), threshold: 3,
          status: alertStatus(`CA|${u.id}|2026-10`)
        });
      }
    }
  }

  /* 9. 账务调整明细（r65 水量 / r66 水价 / r67 违约金）——adjustmentId 关联真实 ADJ-u-k；delta=after-before。 */
  const adjustmentDetails = [];
  for (const a of D.adjustments) {
    const u = codeIndex.get(a.cust_id);
    const sold = factsSold.get(`${u.id}|${a.period}`) || 0;
    const price = naturePrice(u.nature);
    let field, beforeValue, afterValue, reason;
    if (a.proc_type === '调整减免') {
      field = 'waterVolume'; beforeValue = sold;
      const reduction = Math.min(Math.round(a.proc_amt / price), Math.max(0, beforeValue - 1));
      afterValue = beforeValue - reduction; reason = '水量多计核减';
    } else if (a.proc_type === '价差退款') {
      field = 'unitPrice'; beforeValue = price;
      const refund = a.proc_amt / Math.max(1, sold);
      afterValue = round2(Math.max(0.5, beforeValue - Math.min(refund, beforeValue - 0.5))); reason = '水价调整价差退还';
    } else if (a.proc_type === '特殊开账') {
      field = 'waterVolume'; beforeValue = 0;
      afterValue = Math.max(1, Math.round(a.proc_amt / price)); reason = '补录历史漏抄账单';
    } else { // 待处理账
      field = 'penalty'; beforeValue = round2(a.proc_amt * 0.1); afterValue = 0; reason = '待处理账挂账核实减免';
    }
    adjustmentDetails.push({
      id: `AD6-${a.id}`, adjustmentId: a.id, ...base(u), field, period: a.period,
      effectiveAt: a.initiate_time.slice(0, 10), beforeValue, afterValue, delta: round2(afterValue - beforeValue), reason
    });
  }

  /* 10. 小区考核表↔直供↔二次加压（r11）——每单位+小区一个显式合成考核总表 ASM6-；成员经 assessmentMeterId 关联父表。 */
  const communityMeterLinks = [];
  const communityGroups = new Map();
  for (const u of D.users) {
    const key = `${u.unitId}|${u.community}`;
    if (!communityGroups.has(key)) communityGroups.set(key, []);
    communityGroups.get(key).push(u);
  }
  for (const list of communityGroups.values()) {
    const first = list[0];
    const num = parseInt(first.community.replace('示例小区', ''), 10);
    const communityId = `COM6-${first.unitId}-${pad2(num)}`;
    const assessmentMeterId = `ASM6-${first.unitId}-${pad2(num)}`;
    communityMeterLinks.push({
      id: `CML6-A-${communityId}`, communityId, communityName: first.community, userId: null, accountId: null,
      meterId: assessmentMeterId, assessmentMeterId, role: 'ASSESSMENT',
      company: first.company, companyId: first.companyId, unitId: first.unitId, unitNodeId: first.unitNodeId,
      orgNodeId: first.orgNodeId, orgType: first.orgType, lineKey: first.lineKey
    });
    for (const u of list) {
      const role = u.id % 5 === 0 ? 'SECONDARY' : 'DIRECT';
      communityMeterLinks.push({
        id: `CML6-M-${u.id}`, communityId, communityName: u.community, userId: u.id,
        meterId: u.meterId, assessmentMeterId, role, ...base(u)
      });
    }
  }

  /* 12. DMA 流量计↔户号映射（r76/r79）——AREA_INLET 合成总表 + 成员表（REMOTE/DIRECT/SECONDARY）。 */
  const dmaMeterLinks = [];
  for (const node of D.dmaNodes) {
    dmaMeterLinks.push({
      id: `DML6-I-${node.id}`, dmaId: node.id, meterId: `INLET6-${node.id}`, userId: null, accountId: null,
      role: 'AREA_INLET', company: node.company, companyId: node.companyId, unitId: node.unitId,
      unitNodeId: node.unitNodeId, orgNodeId: node.unitNodeId, ownershipLevel: 'unit'
    });
  }
  for (const u of D.users) {
    const role = u.meterType === '远传表' ? 'REMOTE' : (u.id % 5 === 0 ? 'SECONDARY' : 'DIRECT');
    dmaMeterLinks.push({ id: `DML6-M-${u.id}`, dmaId: userDma.get(u.id), meterId: u.meterId, userId: u.id, role, ...base(u) });
  }

  /* 13. DMA 日读数（r78 日用水/累加 / r79 夜流 / r82 压力）——2026 Jan–Oct 连续计数器。
   *    月供水=当月关联用户售水×(1+模拟漏损率 6–16%)，按日权重分配，整月合计≥售水；
   *    end-start=dailyVolume，跨日跨月连续；cumulativeVolume 为年累计（不可跨日求和）；
   *    onlineSamples 18–24（无全中断日），压力/夜流每日有效（压力均值按有效日）。 */
  const dmaDailyReadings = [];
  const dmaSupply = new Map();
  for (const node of D.dmaNodes) {
    let counter = round2(100000 + hash(`${node.id}|init6`) * 50000);
    let ytd = 0;
    PERIODS_2026.forEach((period, mi) => {
      const sold = dmaSold.get(`${node.id}|${period}`) || 0;
      const lossRate = 0.06 + hash(`${node.id}|${period}|loss6`) * 0.10;
      const target = round2(sold * (1 + lossRate));
      const days = MONTH_DAYS[mi];
      const weights = [];
      let wsum = 0;
      for (let d = 1; d <= days; d++) {
        const w = 0.8 + hash(`${node.id}|${period}-${pad2(d)}|w6`) * 0.4;
        weights.push(w); wsum += w;
      }
      let allocated = 0, monthSupply = 0;
      for (let d = 1; d <= days; d++) {
        const date = `${period}-${pad2(d)}`;
        let daily;
        if (d < days) { daily = round2(target * weights[d - 1] / wsum); allocated += daily; }
        else daily = round2(target - allocated);
        const startVolume = counter;
        const endVolume = round2(startVolume + daily);
        const dailyVolume = round2(endVolume - startVolume);
        counter = endVolume;
        ytd = round2(ytd + dailyVolume);
        monthSupply = round2(monthSupply + dailyVolume);
        const hOn = hash(`${node.id}|${date}|on6`);
        const onlineSamples = hOn < 0.03 ? 18 + Math.floor(hash(`${node.id}|${date}|on6b`) * 6) : 24;
        const pressureMpa = round3(0.24 + hash(`${node.id}|${date}|p6`) * 0.08);
        const nightVolume = round2(dailyVolume * (0.04 + hash(`${node.id}|${date}|n6`) * 0.05));
        dmaDailyReadings.push({
          id: `DDR6-${node.id}-${date}`, dmaId: node.id, date, period, unitId: node.unitId, company: node.company,
          unitNodeId: node.unitNodeId, orgNodeId: node.unitNodeId, startVolume, endVolume, dailyVolume,
          cumulativeVolume: ytd, pressureMpa, onlineSamples, expectedSamples: 24, nightVolume
        });
      }
      dmaSupply.set(`${node.id}|${period}`, monthSupply);
    });
  }

  /* 14. DMA 产销差（r76/r80/r81）——supply=Σ日供水，sold=原始 facts 精确求和；存量按月末 active，流量按当月。 */
  const dmaBalance = [];
  for (const node of D.dmaNodes) {
    const members = membersByDma.get(node.id) || [];
    for (const period of PERIODS_2026) {
      const supply_vol = dmaSupply.get(`${node.id}|${period}`) || 0;
      const sold_vol = dmaSold.get(`${node.id}|${period}`) || 0;
      const loss_rate_pct = supply_vol > 0 ? round2((supply_vol - sold_vol) / supply_vol * 100) : 0;
      let registered_count = 0, remote_count = 0, nonres_count = 0;
      for (const u of members) {
        if (!activeAt(u, period)) continue;
        registered_count++;
        if (u.meterType === '远传表') remote_count++;
        if (!u.nature.startsWith('居民')) nonres_count++;
      }
      dmaBalance.push({
        id: `DB6-${node.id}-${period}`, dmaId: node.id, period, supply_vol, sold_vol, loss_rate_pct,
        registered_count, remote_count, remote_sold_vol: dmaRemoteSold.get(`${node.id}|${period}`) || 0,
        nonres_count, nonres_sold_vol: dmaNonresSold.get(`${node.id}|${period}`) || 0,
        company: node.company, companyId: node.companyId, unitId: node.unitId, unitNodeId: node.unitNodeId,
        orgNodeId: node.unitNodeId, ownershipLevel: 'unit'
      });
    }
  }

  /* 15. 自动建单示例（r82 智能分析 G-20）——3 条独立规则关联（非源 Orders80），已自动创建并分派，无真实定时器。
   *    关联本模块 remoteAlerts（跨 3 个单位），规则语义与报警类型一致；通讯报警用显式原型规则（独立于原 R- 目录）。 */
  const ruleById = new Map(D.alertRules.map(r => [r.id, r]));
  const PROTO_COMM_RULE = { id: 'PR6-COMM-001', name: '远传通讯中断报警', type: '远传通讯中断', threshold: 3, unit: '天' };
  const alertUnit = a => userIndex.get(a.userId).unitId;
  const waPool = remoteAlerts.filter(a => a.type === 'WATER_ALARM' && a.period === '2026-10');
  const imPool = remoteAlerts.filter(a => a.type === 'INDEX_MISMATCH' && a.period === '2026-10');
  const caPool = remoteAlerts.filter(a => a.type === 'COMM_ALARM');
  const autoAlerts = [];
  const usedUnits = new Set();
  const pickAuto = (pool, rule) => {
    const a = pool.find(x => !usedUnits.has(alertUnit(x)));
    usedUnits.add(alertUnit(a));
    autoAlerts.push({ alert: a, rule });
  };
  pickAuto(waPool, ruleById.get('R-001'));      // 水量报警 ↔ 水量波动超阈值
  pickAuto(imPool, ruleById.get('R-006'));      // 指数不一致 ↔ 手机与营收指数差异
  pickAuto(caPool, PROTO_COMM_RULE);            // 通讯报警 ↔ 显式原型通讯规则
  const automaticOrderExamples = autoAlerts.map(({ alert: a, rule: r }, idx) => {
    const n = idx + 1;
    const u = userIndex.get(a.userId);
    const baseDate = a.openedAt.slice(0, 10);
    const triggeredAt = `${baseDate} 09:0${n}`;
    const createdAt = `${baseDate} 09:0${n + 1}`;
    const id = `AO6-${n}`;
    return {
      id, ...base(u), alertId: a.id, ruleId: r.id, ruleName: r.name, triggeredAt, createdAt,
      creationMethod: 'AUTO', createdBy: '规则引擎（模拟）', status: '已分派',
      ownerOrgNodeId: u.orgNodeId, lineKey: u.lineKey, type: r.type, period: baseDate.slice(0, 7),
      history: [
        { at: `${baseDate} 08:30`, action: 'ALERT_GENERATED', actor: '数据预警（模拟）', detail: `远传报警 ${a.type} 命中规则 ${r.id} ${r.name}` },
        { at: triggeredAt, action: 'RULE_HIT', actor: '规则引擎（模拟）', detail: `阈值 ${r.threshold}${r.unit}，自动判定需建单` },
        { at: createdAt, action: 'AUTO_CREATE', actor: '规则引擎（模拟）', detail: `创建工单 ${id}，类型 ${r.type}` },
        { at: `${baseDate} 09:1${n}`, action: 'AUTO_ASSIGN', actor: '规则引擎（模拟）', detail: `分派至 ${u.org} ${u.line || u.team || ''} 责任班组` }
      ]
    };
  });

  const meta = {
    synthetic: true,
    version: 'v6-demo-20261113',
    label: '原型模拟数据（非真实接入）',
    assumptions: [
      '全部为原型模拟数据，非真实接入；不修改 WB_DATA / WBOrg 源数组，仅读取二者生成。',
      '规上企业名单（scaleRoster）为显式枚举模拟名单，非按行业名称/用量/取模推断（C12）。',
      '水价优惠（policyMembership）按行业代码模拟归集，行业代码表 IND-01…IND-12 为模拟编码；POL-001 为显式居民低保名单。',
      'DMA 分区按单位内户号顺序轮转唯一划分（每单位 3 节点，每户恰属 1 DMA）；父/子拓扑不重复统计。',
      'DMA 日供水=当月关联用户售水×(1+模拟漏损率 6–16%)，按日权重分配，整月合计≥售水；计数器跨日跨月连续，end-start=dailyVolume。',
      'dmaDailyReadings.cumulativeVolume 为年累计（不可跨日求和）；onlineSamples 18–24（无全中断日），压力/夜流每日有效，压力均值按有效日。',
      'dmaBalance 存量（registered/remote/nonres_count）按月末 active 用户，流量（sold/remote/nonres_sold_vol）按当月 facts 原始售水精确求和；比率同口径同分母。',
      '仓库为营业所/网格/线路级真实组织节点，新表库/报废库各一；旧中心库 additive 保留；出入库为含地址/时间的模拟台账，最新流水决定库存状态。',
      '入册日期=立户日+1..14 天（非立户日别名），2026-10-31 封顶；册本调整为独立事件。',
      '远传推送每期每户一条，late 与 missing 分开；readIndex=1000+户号×100+累计售水；remoteAlerts 含 type 与 alertType 双字段；COMM_ALARM 对齐源在线快照窗口 2026-10-25…31，每单位至少一条（首位远传户强制）。',
      '账务调整 delta=after-before，单位 m³/元每m³/元；adjustmentId 关联真实 ADJ-u-k。',
      '小区考核表为显式合成总表（ASM6-），成员 DIRECT/SECONDARY 经 assessmentMeterId 关联父表，不将居民户表当作总表。',
      '自动建单 3 条关联本模块 remoteAlerts（跨 3 单位）：水量报警↔R-001、指数不一致↔R-006、通讯报警↔显式原型规则 PR6-COMM-001（独立于原 R- 目录）；history 动作 ALERT_GENERATED/RULE_HIT/AUTO_CREATE/AUTO_ASSIGN；非源 Orders80，无真实定时器/外部写入。',
      '事件窗口 2026-01…10；关联名单（scaleRoster/policyMembership/dmaMemberships）历史有效自 2023 起。'
    ]
  };

  const data = {
    meta, scaleRoster, policyMembership, caliberChanges, warehouses, warehouseMovements,
    bookletEvents, remotePushEvents, remoteAlerts, adjustmentDetails, communityMeterLinks,
    dmaMemberships, dmaMeterLinks, dmaDailyReadings, dmaBalance, automaticOrderExamples
  };
  const freezeTree = v => {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) {
      if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) freezeTree(v[i]); }
      else for (const k in v) freezeTree(v[k]);
      Object.freeze(v);
    }
    return v;
  };
  freezeTree(data);
  return data;
})();
