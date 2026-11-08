# 营销一体化：GPT完整开发文档

版本 V4.2 · 2026-11-09

本文件由分章规格及SQL原文合并，基于当前优化后的原型。后端尚未实现，SQL尚未在数据库执行。修改时先编辑分章/生成源，再运行 scripts/build_delivery_doc.py。


---

# 对话成果分析与决策登记

## 证据与优先级

- S1：用户在本次聊天确认的技术栈：JDK 25、Spring Boot 3.5、Vue 3，TimescaleDB HA（PostgreSQL，带 TimescaleDB / pgvector / PostGIS）。最高优先级。
- S2：用户提供的 `../gemini对话文档.pdf`，37 页，已逐页以渲染图阅读；这是截图型 PDF，无可抽取的正文文本。
- S3：当前仓库的 `assets/*.js`、`README.md`、需求登记与校验脚本。README 是历史变更日志，其中较早的“未完成/缺数据”不一定代表当前实现。
- S4：本次工程建议与修复。不得把建议写成甲方已签认需求。

## Gemini 对话取得了什么成果

| PDF 页码 | 成果 | 本次处理 |
|---|---|---|
| 1–5、18–20 | ODS/MDM/DWD/TS/ADS 五层；日增约30万条（遥测20万、业务10万） | 保留分层；容量为规划输入，真实峰值、保存年限、硬件待核 |
| 2、9–10、15 | 账期/自然月双口径、四类核心费用和 JSONB 扩展费 | 保留；增加有效期日历、支付与账单核销分表 |
| 3、5–8 | BIGINT 内部键 + 16位业务编码；多源映射 | 保留思路；源系统与实体类型进入幂等键，编码已由用户确认 |
| 5–17 | 一版 DDL，含分区、时序聚合、报表、账号 | 作为设计参考，不直接执行；存在跨表关系和运维缺口 |
| 20–24 | 用户明确各公司组织层级不同，不能跨区比较内部节点 | 作为核心业务需求，推翻固定 unit/team/line 层级模型 |
| 25–33 | 给出了旧单 HTML 原型的下钻与角色补丁 | 不适用于本仓库的模块化文件；不能按所述行号机械替换 |
| 34–36 | 识别模块化 V4，提出组织树与权限根适配 | 方向正确但未交付可验证的实际代码 |
| 37 | 对话停在要求提供代码/修改需求 | 原对话并未完成现有仓库的改造 |

## 关键纠正

1. 异构树用稳定 org_id、parent_id 和节点类型建模，叶节点挂业务数据。集团下公司平级；市区下营业所→班组→线路→册本；东区/港区下站点→线路；高新下网格→固定人员（册本）。不以深度判断业务类型。
2. 对比集合是“所选节点的直接子节点”，不是同深度所有节点。账号可查询自身及后代，不能返回权限根以上。
3. 五个 schema 是逻辑分层，不会自动隔离写入负载。连接池、查询限时、批量写入、索引、刷新窗口、资源监控仍须实现。
4. 原稿仅建立 2026 分区，无法承接当前原型的 2023 起数据；新方案业务明细先使用普通关系表，遥测使用 hypertable；业务分区在压测后决策。需要分区时先解决全局幂等与跨表键。
5. 原稿 payment 直接挂 bill，无法完整表达一笔收款核销多账单、分次核销、预收与冲正；改为 payment + allocation。
6. 日供水量不能直接将瞬时流量样本相加；累计读数必须识别换表、重置、逆转及窗口边界。连续聚合只直接生成平均/最小/最大瞬时流量，供水量另经质量校验形成。
7. 原稿 `<10ms`、压缩节省 `90%+` 是未验证的目标或估计，不是本项目保证。给出有环境、有数据规模、有并发的验收方案。
8. `timescaledb-ha` 镜像不是已部署好的高可用集群。需要独立故障域、Patroni/DCS、流量入口、备份与恢复演练。
9. 不将 `to_char` 包装成 IMMUTABLE 来规避生成列限制；账期由显式日历映射，月份字段采用月初 DATE。
10. 向量扩展可预留，但用户没有要求自动问答/RAG；一期不增加向量收费或对外模型调用，不凭空规定 embedding 维数。

## 已完成的原型优化

- 新增 `organization.js`：从现有样例构建 596 个稳定组织节点，2,000 户分别归属末级节点；保持原事实源冻结。
- 现有下钻页保留指标、同比环比、维度分析和专项分析；组织导航改用节点身份和直属下级，支持市区5层和其他公司3层。
- 新增演示视角选择、权限根内面包屑和查询范围说明；核心事实、用户、账单、表务、工程与工单公共过滤器使用同一组织范围判断。
- 修复跨页面残留班组/线路筛选、重置遗漏、查询月份边界与搜索域路由错误；更新预测和抄见率报表的过时说明。
- 演示仍不接真实认证、不回写源系统、不持久化账号或计划等操作。

## 未决事项

| 编号 | 问题 | 当前处理 | 正式开发影响 |
|---|---|---|---|
| Q01 | 现有库是否已有需要保留的数据 | 用户确认仅测试库，可按新设计建库；本轮不实际执行DDL | 提供新建库脚本，无需旧库增量迁移 |
| Q02 | 16位统一编码是否正式沿用 | 用户确认双轨主键及CHAR(16) Luhn方案，提供分配和校验函数 | 历史映射与外部契约 |
| Q03 | 各公司实际关账日、双月/单月周期、补抄归期 | 使用有效期账期日历，拒绝统一写死25日 | 月报与新增户口径 |
| Q04 | 收费率按当期账单回收还是当期现金流 | 两种显式指标，不混用；界面默认需签认 | 领导驾驶舱、跨年收回 |
| Q05 | 部分缴费对应欠费水量、减免、违约金、预收冲抵 | 欠费金额可计算，欠费水量无明确定义时为null | 5000m³专项、账龄 |
| Q06 | 源系统清单、主键、删除标记、更新时间、接入方式 | 按公司+源系统配置；原稿“网报”不得视为必有独立系统 | ETL 适配器 |
| Q07 | 真实组织名单、图形边界、GPS坐标系、DMA映射 | 当前节点和地图均样例 | 权限初始化与GIS |
| Q08 | 正式数据库主版本、扩展版本、HA拓扑与保存年限 | 固定镜像tag/digest前需确认；不写latest | SQL兼容、压缩保留策略 |
| Q09 | 生产工单是否只督办，是否对接源工单回写 | 默认源系统只读，平台督办独立 | 状态机与接口授权 |

未决项不阻止原型评审和独立模块开发，但涉及金额口径、真实权限和数据迁移的上线必须在其签认后进行。


---

# 营销一体化完整开发规格

版本 V4.2，2026-11-08。适用对象：产品、后端、前端、数据开发、测试、运维及 GPT 开发代理。

## 1. 产品定位与交付边界

集团营销数据集成、统一指标分析、异常督查及报表平台。接入四家公司异构系统，保留来源证据，统一组织、用户表卡、设备、账期和字典。正式产品复刻本仓库优化后的原型交互，不复制模拟数据算法作为生产算法。

一期保留13个可见菜单和1个隐藏下钻路由。来源营收、表务、报装、远传、手机抄表等明细默认只读；允许写入平台组织权限、指标配置、计划、规则、预测因子、督办工单及审计。是否回写源工单须另行签认。不上线支付、收费开账、源系统改账等能力。

角色：集团管理、公司管理、营业所/站点/网格管理、班组/线路/册本/固定人员、数据治理管理员、平台管理员。业务角色数据范围与菜单权限分开配置；平台管理员不因管理账号而自动获得所有业务明细。

## 2. 业务需求及验收矩阵

| ID / 优先级 | 页面及行为 | 输入与输出 | 核心验收 |
|---|---|---|---|
| R01 P0 | 首页五指标、公司地图、排行 | 期间/口径/公司；五指标及可用性 | 数字可追溯到聚合版本；地图示意不冒充服务边界 |
| R02 P0 | 异构组织整页下钻 | orgId、metric；直属下级比较、趋势、维度、专项 | 市区5层、其余3层；权限根止退；不同公司内部不横比 |
| R03 P0 | 用户查询与全景档案 | 统一码/源表卡/客户号/姓名/性质/组织等；分页列表及9类档案 | 同一源客户可关联多个表卡；联查不会错误合户；敏感字段脱敏 |
| R04 P0 | 表务与抄表督查 | 质量、台账、换表、仓库、册本、证据、远传7页签 | 应抄任务与读数分开；任务去重；无照片/无定位不补造合规结果 |
| R05 P0 | 智能分析与预警 | 业务分类、严重度、规则版本；异常清单及证据 | 数据异常跳治理；规则启停有审计；运行结果记录版本与基线 |
| R06 P0 | 工程及未立户监管 | 工程台账、节点时效、未立户核查 | 节点时间顺序校验；完工未立户与无表立户分别展示 |
| R07 P0 | 应收账款监管 | 应收、欠费、账龄、5000m³、减免、退款、特殊账7页签 | 欠费与核销对账；冲正不删除原记录；五档账龄互斥且完备 |
| R08 P1 | DMA及流量计 | 拓扑、夜流、24小时流量、压力、供售平衡5页签 | 同一时区；不把瞬时流量求和当体积；缺测/重置可识别 |
| R09 P1 | 售水量预测 | 月/季/年、组织、历史、因子；预测与回测 | 不使用目标期未来数据训练；实际/计划/预测三列分开 |
| R10 P0 | 工单督查 | 统计、源工单处理、预警转督办3页签 | 源单只读；重复转单幂等；状态变更有事件与责任人 |
| R11 P0 | 数据集成治理 | 数据源、批次、质量异常 | 来源定位、失败重试、隔离与复核；失败批次不得推进水位 |
| R12 P0 | 报表中心 | 21张目录、参数、预览、导出、任务记录 | 使用统一查询口径；导出重新鉴权；大文件异步生成 |
| R13 P0 | 组织账号权限 | 动态组织树、账号、角色、功能权限、数据范围 | 角色不能授予自身没有的权限；禁用立即失效；越权返回403 |
| R14 P0 | 系统设置 | 指标口径/字典、计划值、报表参数、操作日志 | 版本化、生效时间、乐观锁、审计；配置不覆盖源实绩 |

### 用户档案

9类视图：基本档案、抄表、应收实收、水表、换表、报装、远传、调整减免、用水画像。使用统一 accountId 联查。客户主体 customer 与计费表卡 account 分离；不以姓名/手机号自动认定同一客户。原型 `users` 更接近“计费表卡”，不是认证用户。

### 页面统一规范

- 查询点击后生效，未提交的条件不改变表格；新查询回第一页。列表分页10/20/50/100，默认20。
- URL 保存 orgId、期间、口径、页签；账号权限来自后端会话，不能从 URL 指定。
- 切换父组织清除不兼容后代；返回保留时间与指标。展示当前范围、批次、更新时间、口径版本。
- loading、空结果、缺来源、权限拒绝、查询失败分别显示。null显示“—”，零显示0；禁止用0伪装缺数。
- 图表、卡片、表格、导出使用同一查询上下文及数据版本。图表组织点击进入直属下级；末级打开明细。
- 桌面1440/1920主界面；375宽可查看列表、打开详情及筛选，宽表在容器内滚动。按钮键盘可达，焦点可见，弹窗关闭恢复焦点。

## 3. 组织与权限

### 3.1 树模型

集团根→公司；公司的后代任意深度。org_type包括 GROUP/COMPANY/OFFICE/STATION/GRID/TEAM/LINE/BOOKLET/STAFF。深度仅用于显示缩进，业务规则不能写 `depth===3`。

关系真相为 parent_id，org_closure缓存祖先/后代关系（包含自身，distance=0）。org_path可作为可读缓存，不能成为未经验证的客户端授权条件。移动节点须事务内检查无环、公司边界、重新生成闭包、失效缓存并审计；历史业务归属由 account_org_history 的有效期决定。

横向比较：`parent_id = requestedOrgId`。末级：children为空，展示本级数据与明细，不退到全集团。禁止跨公司内部节点排名。集团允许公司之间比较。

### 3.2 数据范围

服务端根据登录账号的 org_scope 和可用角色计算授权组织集合，与请求组织的后代集合求交。详情、聚合、搜索建议、图表、导出、下载、附件同样执行校验。请求越界组织返回403，不能悄悄回退全集团。原型出于演示可回退权限根，生产不得沿用这一宽容逻辑。

每个写接口还检查动作权限，例如 `plan:write`、`rule:publish`、`supervision:assign`。缓存键包含范围版本、账号/授权集合摘要、组织、时间、口径、指标版本、数据批次。多实例下权限变更需广播失效或通过版本号拒绝旧缓存。

登录优先对接现有统一认证（是否具备待确认）；无统一认证时提供独立账号模块，密码使用 Spring Security 支持的安全哈希，登录限流和审计。生产不提供任意切换他人账号的“演示视角”。

## 4. 时间、金额与指标口径

时区 Asia/Shanghai。发生时间用 timestamptz，纯业务日期用 date；月份用月初 date。金额 numeric(20,2)，水量 numeric(20,4)，比例中间值保留充分精度，展示最后一步四舍五入。Java使用BigDecimal，API大整数ID与金额十进制字符串输出，前端不可用浮点累加财务金额。

| 指标 | 计算 | 空值/边界 |
|---|---|---|
| 售水量 | 范围内有效开账水量求和；调整按签认的正负事件归期 | 未抄任务不凭空形成开账水量 |
| 期末注册数 | 截至截止日有效表卡快照；不能累加各月存量 | 注册/注销边界使用明确日期规则 |
| 新增数 | 业务账期时按所属公司账期日历；自然月时按自然月注册日期 | 原型26日至25日仅样例，不推广全公司 |
| 售水均价 | 指定水费收入合计 / 对应售水量合计 | 分母0或缺失为null；不平均单位均价 |
| 账单回收率 | 选中账期账单截至asOf已核销本金 / 有效应收本金 | 跨年回收仍归原账单；应收0为null |
| 现金流收入 | 选中自然月实际收款减冲正，按费用分项 | 不能直接替代账单回收率分子 |
| 产销差率 | (同期同域供水量−售水量)/供水量 | 供水映射不完整或分母≤0为null |
| 抄见率 | 有效已抄任务数 / 有效应抄任务数 | 分母必须来自任务，不来自读数记录 |
| 到位率/照片合规率 | 签认范围的有效到位/合规任务数除以基线任务数 | 无GPS/照片字段为UNKNOWN，不等同违规或合规 |
| 估抄率 | 有效估抄任务数 / 已签认基线 | 基线采用应抄还是已抄待签认 |
| 远传开账率 | 已开账的有效远传任务 / 有效远传应开账任务 | 不以报文数量作分母 |
| 欠费余额 | 有效应收 + 已批准增减调整 − 截至asOf净核销 | 不直接用支付总额抵账；不忽略冲正 |
| 同比/环比 | (本期−比较期)/abs(比较期) | 基期0或缺失为null，跨组织保持同范围 |

账龄建议（待签认）：未到期、逾期1–30日、31–90日、91–180日、181日以上；使用asOf与due_date差值。生产不可直接用原型标签推断财务标准。金额按未核销账单余额累加，各档之和必须等于总欠费。账期和自然月切换必须返回明确 `caliberMode`；报表标题及导出记录此值。

四类核心费用：基本水费、污水处理费、水资源费/税、垃圾处理费。其他收费进入 bill_fee_item，保留源代码与标准代码，ext_attrs仅存低频源属性，不能把所有可统计金额塞入无约束JSON。违约金与本金分列。部分缴费的欠费水量默认null，除非业务签认分配方法。

## 5. 技术架构

用户指定：Vue3 + JDK25 + Spring Boot3.5 + PostgreSQL/TimescaleDB HA，扩展PostGIS、pgvector。建议模块化单体起步，以包边界分开 auth、organization、customer、meter、billing、project、alert、supervision、integration、analytics、forecast、report。避免在未确认团队及吞吐前引入微服务。

前端建议 TypeScript、Vue Router、Pinia、ECharts，组件库由既有工程决定。后端 Spring MVC/Security/Validation/Actuator，SQL查询适配现有持久层；复杂统计保留显式SQL，不能用ORM循环加载明细。迁移采用Flyway或现有迁移工具，禁止生产自动改表。

ODS保存原始报文及水位；MDM维护组织、标识、字典、权限；DWD存标准明细与平台工作流；TS存设备时序；ADS存已发布的聚合版本及计划预测。定时任务与异步任务采用数据库任务表、租约/锁及幂等；多实例只有一个执行者，失败可重试。

Spring官方3.5系统要求页当前说明其维护版本支持Java25；必须锁定经验证的3.5.x补丁，不把“3.5.0必然支持25”写成结论。[官方系统要求](https://docs.spring.io/spring-boot/3.5/system-requirements.html)。数据库镜像官方仓库说明包含PostgreSQL、TimescaleDB和HA相关组件；实际扩展版本需通过运行镜像的 `pg_available_extensions` 验证。[官方镜像仓库](https://github.com/timescale/timescaledb-docker-ha)。

开发环境部署单节点即可验证功能，生产HA需至少跨独立故障域规划数据库节点及DCS多数派，明确同步/异步复制、RPO/RTO、读写入口和脑裂防护。单容器名字带ha不能作为验收证据。

## 6. 数据接入与治理

1. 每个公司、系统、实体配置独立适配器。读取最小权限账号，连接凭证只存密钥管理引用，不写 conn_metadata 明文。
2. 抽取窗口使用 `(updated_at, source_pk)` 水位；首次全量从2023起按确认范围回补，随后增量。无更新时间的源按可用CDC或周期快照差异处理。
3. 原始报文落ODS，携带来源、批次、源主键、源版本、接收时间、hash。幂等唯一键含source_id/entity_type/source_pk/source_version。
4. 校验必填字段、日期、金额、字典、组织、关联键；失败记录进入 quarantine，不静默默认成0或当前公司。
5. 以实体映射表定位内部ID，保证重跑不再分配新统一码。源客户与源表卡、源水表分开映射。客户合并必须保留人工确认与历史关联。
6. 一个实体批次内标准化及水位推进事务一致；大型批次按分片记录checkpoint，全部完成后发布批次。失败重试不推进成功水位。
7. 迟到、补抄、冲正、源删除会标记受影响期间；重算相关ADS版本，原版本保留以支持报表追溯。
8. 发布前按公司+账期对账记录数、有效水量、四类费用、收款、核销、余额；异常超过配置阈值阻止发布。

源字段清单至少包含：实体主键、公司、组织码、客户/表卡/水表码、业务发生时间、更新时间、删除标志、状态、金额/量单位、账期、源版本。取得真实DDL后逐字段建立映射表，不能仅凭原型字段名臆造源列。

## 7. 工作流与状态机

源工单是只读快照；平台督办单独建表。状态：DRAFT→ASSIGNED→ACCEPTED→PROCESSING→RESOLVED→CLOSED；RESOLVED可退回PROCESSING；未关闭可CANCELLED（需权限及原因）。ASSIGNED设置责任节点/责任人和deadline；完成需结果说明，关闭需验收意见。修改带expectedVersion，冲突返回409。

创建督办与写入“预警关联/事件/幂等结果”在同一事务。相同sourceAlertId不得形成多张有效督办单；是否允许取消后重开需明确，基线使用一预警一督办，复开同一单。不修改原业务异常证据。

规则：草稿→发布（生成不可变版本）→停用；编辑已发布规则产生新版本。每次运行保存阈值、时间范围、数据批次及命中对象。系统规则可停用不可物理删除。异常误报通过核查结论关闭，保留审计。

计划：按org+metric+period+caliber+版本维护。金额/水量计划非负；比例计划在0–100范围内，产销差特殊阈值另核。不得用单位计划覆盖其全部后代的计划，也不能对比例计划直接求和。预测模型/版本/训练截止日/输入因子/回测窗口写入forecast_run，输出值带可用性与说明。

## 8. API 契约

基路径 `/api/v1`，UTF-8 JSON；查询参数时间格式 `YYYY-MM`，日期 `YYYY-MM-DD`，时间ISO8601含偏移。ID字符串。分页 page从1起，size最大100，排序字段白名单。所有查询返回 requestId、dataVersion、scopeOrgId、caliberMode；下载无敏感内容长链公开地址。

成功示例：
```json
{"requestId":"req-demo","data":{"items":[{"orgId":"101","name":"中原营业所","soldVolume":"1200.0000","chargeRate":"95.20","lossRate":null}],"total":1,"page":1,"size":20},"meta":{"scopeOrgId":"10","period":"2026-10","caliberMode":"BILL_PERIOD","dataVersion":"batch-demo","quality":"DEMO"}}
```
错误：`{"requestId":"...","code":"ORG_SCOPE_DENIED","message":"无权访问该组织","fieldErrors":[]}`。400参数错误、401未登录、403范围/动作越权、404不存在、409版本/幂等冲突、422口径未配置、429限流、503依赖不可用。错误不得返回SQL或连接信息。

| 方法及路径 | 输入 | 输出/动作权限 |
|---|---|---|
| GET /me | 会话 | 用户、功能权限、scopeRoots、scopeVersion |
| GET /organizations/{id}/children | id、includeInactive=false | 直属下级；逐个受授权约束 |
| GET /organizations/{id}/breadcrumbs | id | 仅权限根内面包屑 |
| GET /dashboard | orgId, period, periodMode, caliberMode | 五指标、质量、直属下级比较 |
| GET /analytics/trend | orgId, start,end,metric,granularity | 按月/季/年序列 |
| GET /analytics/breakdown | orgId,period,metric,dimension | 维度白名单，不接受任意SQL |
| GET /accounts | orgId, keyword,nature,status,page,size | 表卡分页；脱敏姓名/电话 |
| GET /accounts/{id} | id | 基础档案，明细访问再鉴权 |
| GET /accounts/{id}/{readings\|bills\|meters\|swaps\|projects\|telemetry\|adjustments\|profile} | 期间分页 | 档案页签数据 |
| GET /meters, /read-tasks, /meter-swaps, /warehouses | orgId、期间与业务筛选 | 表务分页及质量汇总 |
| GET /projects, /projects/{id}/nodes | 组织、状态、时间 | 台账/节点时长/异常 |
| GET /receivables/summary, /receivables/aging | orgId,period,asOf,caliberMode | 金额、账龄、核销基线 |
| GET /alerts, /rules | 组织、类别、状态 | 分页与规则版本 |
| POST /rules; POST /rules/{id}/publish | 校验后的条件DSL、expectedVersion | rule:write / rule:publish |
| GET /source-orders | orgId,status,page,size | 只读源单及事件 |
| POST /supervisions | alertId,assigneeId,assigneeOrgId,deadline,description | supervision:create；Idempotency-Key必填 |
| POST /supervisions/{id}/transitions | action,reason,expectedVersion | 按状态与责任范围校验 |
| GET /dma/nodes; GET /dma/{id}/telemetry | from,to,bucket | 受限窗口遥测；单位与缺测标识 |
| GET /dma/{id}/balance | start,end,caliberMode | 供售及完整性 |
| POST /forecast-runs; GET /forecast-runs/{id} | orgId,horizon,cutoff,model,factors | 异步预测，forecast:run |
| PUT /plans/{orgId}/{metric}/{period} | value,caliberMode,expectedVersion | plan:write，原实绩不变 |
| GET /reports; POST /report-jobs | reportCode,params | report:read / report:export |
| GET /report-jobs/{id}; GET /report-jobs/{id}/download | id | 任务状态及受鉴权下载 |
| GET /integration/sources, /integration/batches, /quality/issues | 过滤分页 | integration:read |
| POST /integration/batches/{id}/retry | expectedVersion,reason | integration:retry，幂等 |
| GET/POST/PATCH /admin/users, /admin/roles, /admin/scopes | 合法字段与expectedVersion | 独立管理员权限，审计 |
| GET /audit-events | actor,action,from,to | audit:read，敏感字段脱敏 |

POST创建成功201；异步任务202含jobId与查询地址；幂等键相同且payload hash相同返回原结果，不同返回409。持有创建权限不自动获得下载其他用户任务的权限。审批与授权修改不提供批量任意字段PATCH。

## 9. 数据库实现约束

完整字段见03，建库DDL见sql。普通表使用identity bigint；统一码是业务唯一键，不作为所有外键。源业务明细保留source_id/source_pk/source_version/imported_at。只读源表和平台写表使用不同数据库权限。

遥测幂等唯一键包含source_id、device_id、observed_at，符合时序分区约束；同一时刻多测点用device区分。源设备一个时间点多条合法报文时需增加测量通道或源序号，不直接丢弃。

组织历史区间为[valid_from,valid_to)，使用排他约束阻止同一表卡归属时间重叠。历史统计采用发生时归属；若需按当前组织重述历史，作为第二种显式查询选项并注明版本。

SQL不预设删除策略。所有主数据默认停用，源撤销用状态及版本；账户、账单、支付、核销不级联物理删除。向量字段留到模型维数和访问边界明确后的单独迁移，不对业务流水无差别向量化。

## 10. 容量、运维与质量目标

规划量级：日遥测20万条，年约7300万；业务10万/日，年约3650万。三年约2.19亿遥测与1.095亿业务记录，不能套用原型92,000行的性能结论。存储预算=实测每行与索引字节×保留条数×副本数+WAL+备份+30%余量。

建议验收目标（需在指定硬件签认）：50并发下聚合查询P95≤1s、分页明细P95≤2s，首屏可交互≤3s；5倍日均写入峰值连续30分钟无丢数；10万行导出异步任务≤5分钟。测试保留SQL执行计划、缓存冷热条件、数据量、错误率和硬件。

遥测初始chunk建议7天，仅作为起点，压测后按活跃索引与内存调整。连续聚合刷新窗口覆盖迟到范围，超窗口纠正手工重算。压缩/列存、保留策略必须与已锁定Timescale版本语法一致，并验证解压修改、备份恢复及升级。不得未经确认删除历史数据。

监控：接口P95、错误率、连接池、慢SQL、锁等待、复制延迟、WAL、磁盘、ETL延迟、失败批次、隔离数、聚合水位、导出队列。日志带requestId/sourceBatchId，不记录完整身份信息或凭证。

备份：全量+WAL连续归档，独立介质，定期点时间恢复演练；HA不替代备份。RPO/RTO由业务确认。迁移前备份、影子库重放、行数金额校验、灰度切换；回退使用应用兼容版本与备份，不用盲目DROP回滚。

## 11. 开发阶段与测试

| 阶段 | 交付 | 出口条件 |
|---|---|---|
| M0 | 锁定版本、数据库清点、业务口径签认、API草案 | Q01/Q02及首批来源字段明确 |
| M1 | 账号、角色、异构组织、表卡与映射、迁移骨架 | 任意层树、无环、同名节点、越权列表/详情/导出测试通过 |
| M2 | 首家公司营收/表务接入、双口径、核销、首页与下钻 | 来源→明细→指标→报表四级对账 |
| M3 | 四家公司接入、工程、异常、督办、21报表 | 幂等重跑、迟到/冲正、跨年回收与状态机测试 |
| M4 | DMA/GIS、预测、性能、HA与恢复 | 遥测重置/缺测测试，回测无泄漏，压测与恢复演练 |

必测用例：集团与公司加总一致；月末存量不累加；市区5层与高新3层；同名班组不串数据；叶节点停止；权限根止退；伪造orgId403；报表导出与列表同范围；分母0/null；一年跨账期；闰年/月末关账；预收不冒充核销；部分付款与退款/冲正；一笔收款核销多账单；重复批次/重复转单；组织移动后历史不漂移；遥测乱序/重复/累计清零；多实例任务抢占；失败分片重试；数据库恢复后对账。

自动化层次：纯口径单元测试、真实PostgreSQL+扩展集成测试、REST权限矩阵测试、Vue组件与浏览器端到端测试、性能与灾备。不能以H2代替Timescale/PostGIS兼容性验收。


---

# 数据库字段字典

基线为新库设计，尚未在真实PostgreSQL/Timescale实例执行。字段类型、默认值、主外键以同批生成的SQL为准。禁止直接对旧库执行本基线。

共 57 张表。一般关系为：公司→组织→表卡；客户1:N表卡；表卡1:N账单；支付N:M账单经核销表；规则版本1:N预警；预警1:1督办；设备1:N遥测；发布版本1:N组织月度汇总。

JSONB为扩展信息，不代替主外键与核心统计字段。所有更新时间由服务显式维护，数据库DEFAULT只负责插入。


## mdm.company

公司主体；编码与样例名称必须按正式清单初始化

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| code | `varchar(16) NOT NULL UNIQUE` | 公司稳定编码 |
| name | `varchar(128) NOT NULL` | 公司名称 |
| unified_prefix | `varchar(2) UNIQUE` | 统一码公司段，未签认可空 |
| enabled | `boolean NOT NULL DEFAULT true` | 是否启用 |
| created_at | `timestamptz NOT NULL DEFAULT now()` | 创建时间 |
| updated_at | `timestamptz NOT NULL DEFAULT now()` | 更新时间（应用显式维护） |
| version | `bigint NOT NULL DEFAULT 0` | 乐观锁版本 |

## mdm.org

异构树节点；集团公司可空，非集团必须有所属公司

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| company_id | `bigint REFERENCES mdm.company(id)` | 所属公司 |
| parent_id | `bigint REFERENCES mdm.org(id)` | 父节点；集团根为空 |
| code | `varchar(80) NOT NULL UNIQUE` | 全平台组织编码 |
| name | `varchar(128) NOT NULL` | 显示名称，允许跨父节点重名 |
| org_type | `varchar(24) NOT NULL` | GROUP/COMPANY/OFFICE/STATION/GRID/TEAM/LINE/BOOKLET/STAFF |
| child_label | `varchar(32)` | 直属下级显示名称 |
| path | `text NOT NULL` | 物化ID路径缓存；不是授权输入 |
| sort_order | `integer NOT NULL DEFAULT 0` | 同父节点排序 |
| boundary | `geometry(MultiPolygon,4326)` | 正式服务边界；需确认来源坐标系 |
| enabled | `boolean NOT NULL DEFAULT true` | 停用不删除历史 |
| created_at | `timestamptz NOT NULL DEFAULT now()` | 创建时间 |
| updated_at | `timestamptz NOT NULL DEFAULT now()` | 更新时间（应用显式维护） |
| version | `bigint NOT NULL DEFAULT 0` | 乐观锁版本 |

表级约束：
```sql
CHECK (parent_id IS NULL OR parent_id <> id),
CHECK ((org_type='GROUP' AND company_id IS NULL) OR (org_type<>'GROUP' AND company_id IS NOT NULL))
```

## mdm.org_closure

组织传递闭包，事务内维护，自身distance为0

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| ancestor_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 祖先 |
| descendant_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 后代 |
| distance | `integer NOT NULL CHECK(distance>=0)` | 路径距离 |

表级约束：
```sql
PRIMARY KEY(ancestor_id,descendant_id)
```

## mdm.billing_calendar

按公司和抄表周期显式配置区间，开始含/结束不含

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| company_id | `bigint NOT NULL REFERENCES mdm.company(id)` | 公司 |
| cycle_code | `varchar(32) NOT NULL` | 月抄/双月/线路周期标识 |
| bill_period | `date NOT NULL` | 账期月初 |
| starts_on | `date NOT NULL` | 区间开始 |
| ends_on | `date NOT NULL` | 区间结束（不含） |
| rule_version | `varchar(32) NOT NULL` | 规则版本 |

表级约束：
```sql
UNIQUE(company_id,cycle_code,bill_period),
CHECK(ends_on>starts_on),
CHECK(extract(day FROM bill_period)=1),
EXCLUDE USING gist(company_id WITH =,cycle_code WITH =,daterange(starts_on,ends_on,'[)') WITH &&)
```

## ods.source

连接与适配配置，只存密钥引用

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| company_id | `bigint NOT NULL REFERENCES mdm.company(id)` | 公司 |
| code | `varchar(32) NOT NULL` | 系统代码 |
| name | `varchar(128) NOT NULL` | 来源名称 |
| adapter | `varchar(64) NOT NULL` | 适配器类型 |
| connection_meta | `jsonb NOT NULL DEFAULT '{}'` | 非敏感连接描述 |
| secret_ref | `varchar(256)` | 密钥引用 |
| checkpoint | `jsonb NOT NULL DEFAULT '{}'` | 已成功水位 |
| enabled | `boolean NOT NULL DEFAULT false` | 默认不自动连接 |
| created_at | `timestamptz NOT NULL DEFAULT now()` | 创建时间 |
| updated_at | `timestamptz NOT NULL DEFAULT now()` | 更新时间（应用显式维护） |
| version | `bigint NOT NULL DEFAULT 0` | 乐观锁版本 |

表级约束：
```sql
UNIQUE(company_id,code)
```

## ods.batch

抽取批次与检查点

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| source_id | `bigint NOT NULL REFERENCES ods.source(id)` | 来源 |
| entity_type | `varchar(48) NOT NULL` | 实体类型 |
| batch_key | `varchar(128) NOT NULL` | 幂等批次键 |
| status | `varchar(24) NOT NULL` | QUEUED/RUNNING/SUCCEEDED/FAILED/PARTIAL |
| from_watermark | `jsonb` | 起始水位 |
| to_watermark | `jsonb` | 目标水位 |
| received_count | `bigint NOT NULL DEFAULT 0` | 收到记录数 |
| accepted_count | `bigint NOT NULL DEFAULT 0` | 入标准层数 |
| rejected_count | `bigint NOT NULL DEFAULT 0` | 隔离数 |
| started_at | `timestamptz` | 开始 |
| finished_at | `timestamptz` | 结束 |
| error_summary | `text` | 脱敏错误摘要 |

表级约束：
```sql
UNIQUE(source_id,entity_type,batch_key)
```

## ods.raw_record

原始报文；来源变更的可追溯版本

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| batch_id | `bigint NOT NULL REFERENCES ods.batch(id)` | 所属批次 |
| source_id | `bigint NOT NULL REFERENCES ods.source(id)` | 来源 |
| entity_type | `varchar(48) NOT NULL` | 实体类型 |
| source_pk | `varchar(160) NOT NULL` | 源主键 |
| source_version | `varchar(80) NOT NULL` | 源版本；无版本时适配器生成稳定hash |
| payload | `jsonb NOT NULL` | 原始内容；访问受限 |
| payload_hash | `varchar(64) NOT NULL` | 内容SHA256 |
| received_at | `timestamptz NOT NULL DEFAULT now()` | 收到时间 |
| is_deleted | `boolean NOT NULL DEFAULT false` | 源撤销标记 |

表级约束：
```sql
UNIQUE(source_id,entity_type,source_pk,source_version)
```

## ods.quality_issue

质量隔离与复核

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| raw_record_id | `bigint REFERENCES ods.raw_record(id)` | 原始记录 |
| batch_id | `bigint NOT NULL REFERENCES ods.batch(id)` | 批次 |
| rule_code | `varchar(64) NOT NULL` | 质量规则 |
| field_name | `varchar(80)` | 字段 |
| severity | `varchar(16) NOT NULL` | ERROR/WARN |
| status | `varchar(16) NOT NULL DEFAULT 'OPEN'` | OPEN/RESOLVED/IGNORED |
| message | `text NOT NULL` | 问题说明 |
| resolution | `text` | 复核说明 |
| resolved_by | `bigint` | 操作账号，FK后置 |
| created_at | `timestamptz NOT NULL DEFAULT now()` | 创建时间 |
| updated_at | `timestamptz NOT NULL DEFAULT now()` | 更新时间（应用显式维护） |
| version | `bigint NOT NULL DEFAULT 0` | 乐观锁版本 |

## mdm.dictionary_mapping

源字典映射，保留有效版本

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| source_id | `bigint NOT NULL REFERENCES ods.source(id)` | 来源（包含公司） |
| dict_type | `varchar(48) NOT NULL` | 字典类型 |
| source_code | `varchar(128) NOT NULL` | 源代码 |
| standard_code | `varchar(64) NOT NULL` | 标准代码 |
| standard_name | `varchar(128) NOT NULL` | 标准名称 |
| target_field | `varchar(64)` | 固定费用列白名单，禁止任意SQL标识符 |
| valid_from | `date NOT NULL` | 生效开始 |
| valid_to | `date` | 结束不含 |

表级约束：
```sql
UNIQUE(source_id,dict_type,source_code,valid_from),
CHECK(valid_to IS NULL OR valid_to>valid_from),
EXCLUDE USING gist(source_id WITH =,dict_type WITH =,source_code WITH =,daterange(valid_from,valid_to,'[)') WITH &&)
```

## mdm.entity_mapping

统一实体映射；实体类型与来源进入唯一键

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| source_id | `bigint NOT NULL REFERENCES ods.source(id)` | 来源 |
| entity_type | `varchar(32) NOT NULL` | CUSTOMER/ACCOUNT/METER/PROJECT |
| source_pk | `varchar(160) NOT NULL` | 源业务主键 |
| target_id | `bigint NOT NULL` | 目标实体ID，服务按entity_type校验 |
| unified_code | `varchar(32)` | 仅有统一码的实体填写 |
| created_at | `timestamptz NOT NULL DEFAULT now()` | 映射建立时间 |

表级约束：
```sql
UNIQUE(source_id,entity_type,source_pk)
```

## mdm.app_user

认证账号；与业务客户严格分离

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| username | `varchar(80) NOT NULL UNIQUE` | 登录账号 |
| display_name | `varchar(80) NOT NULL` | 显示名 |
| password_hash | `varchar(255)` | SSO可空；不存明文 |
| external_subject | `varchar(200) UNIQUE` | SSO主体 |
| enabled | `boolean NOT NULL DEFAULT false` | 状态 |
| scope_version | `bigint NOT NULL DEFAULT 0` | 权限缓存版本 |
| created_at | `timestamptz NOT NULL DEFAULT now()` | 创建时间 |
| updated_at | `timestamptz NOT NULL DEFAULT now()` | 更新时间（应用显式维护） |
| version | `bigint NOT NULL DEFAULT 0` | 乐观锁版本 |

## mdm.role

角色定义

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| code | `varchar(64) NOT NULL UNIQUE` | 角色码 |
| name | `varchar(80) NOT NULL` | 名称 |
| created_at | `timestamptz NOT NULL DEFAULT now()` | 创建时间 |
| updated_at | `timestamptz NOT NULL DEFAULT now()` | 更新时间（应用显式维护） |
| version | `bigint NOT NULL DEFAULT 0` | 乐观锁版本 |

## mdm.user_role

账号角色关联

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| user_id | `bigint NOT NULL REFERENCES mdm.app_user(id)` | 账号 |
| role_id | `bigint NOT NULL REFERENCES mdm.role(id)` | 角色 |

表级约束：
```sql
PRIMARY KEY(user_id,role_id)
```

## mdm.role_permission

动作权限白名单

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| role_id | `bigint NOT NULL REFERENCES mdm.role(id)` | 角色 |
| permission | `varchar(100) NOT NULL` | 模块:动作 |

表级约束：
```sql
PRIMARY KEY(role_id,permission)
```

## mdm.user_scope

数据范围根，可多个，查询取并集再与请求交集

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| user_id | `bigint NOT NULL REFERENCES mdm.app_user(id)` | 账号 |
| org_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 授权根 |
| include_descendants | `boolean NOT NULL DEFAULT true` | 是否含下级 |

表级约束：
```sql
PRIMARY KEY(user_id,org_id)
```

## mdm.config

版本化平台配置

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| config_key | `varchar(100) NOT NULL` | 配置码 |
| value | `jsonb NOT NULL` | 类型由配置定义校验 |
| effective_from | `timestamptz NOT NULL` | 生效时间 |
| changed_by | `bigint NOT NULL REFERENCES mdm.app_user(id)` | 修改者 |
| created_at | `timestamptz NOT NULL DEFAULT now()` | 创建时间 |
| updated_at | `timestamptz NOT NULL DEFAULT now()` | 更新时间（应用显式维护） |
| version | `bigint NOT NULL DEFAULT 0` | 乐观锁版本 |

表级约束：
```sql
UNIQUE(config_key,effective_from)
```

## mdm.audit_event

追加式审计，不提供普通UPDATE/DELETE权限

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| actor_id | `bigint REFERENCES mdm.app_user(id)` | 操作者；系统任务可空 |
| action | `varchar(80) NOT NULL` | 动作 |
| entity_type | `varchar(64) NOT NULL` | 对象类型 |
| entity_id | `varchar(100)` | 对象ID |
| request_id | `varchar(100)` | 请求关联 |
| before_value | `jsonb` | 脱敏前值 |
| after_value | `jsonb` | 脱敏后值 |
| reason | `text` | 操作原因 |
| occurred_at | `timestamptz NOT NULL DEFAULT now()` | 时间 |

## dwd.customer

客户主体：个人或企业，可关联多个计费表卡

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| company_id | `bigint NOT NULL REFERENCES mdm.company(id)` | 所属公司 |
| name | `varchar(200) NOT NULL` | 名称，查询按权限脱敏 |
| customer_type | `varchar(24) NOT NULL` | PERSON/ENTERPRISE/OTHER |
| phone_cipher | `text` | 电话密文 |
| identity_digest | `varchar(128)` | 身份去重摘要；不能凭姓名合并 |
| ext_attrs | `jsonb NOT NULL DEFAULT '{}'` | 扩展属性 |
| source_id | `bigint REFERENCES ods.source(id)` | 来源系统；平台数据可空 |
| source_pk | `varchar(160)` | 源主键 |
| source_version | `varchar(80)` | 源版本/更新时间序列 |
| imported_at | `timestamptz` | 入仓时间 |
| created_at | `timestamptz NOT NULL DEFAULT now()` | 创建时间 |
| updated_at | `timestamptz NOT NULL DEFAULT now()` | 更新时间（应用显式维护） |
| version | `bigint NOT NULL DEFAULT 0` | 乐观锁版本 |

## dwd.account

统一计费表卡；原型users对应此表

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| company_id | `bigint NOT NULL REFERENCES mdm.company(id)` | 公司 |
| customer_id | `bigint NOT NULL REFERENCES dwd.customer(id)` | 客户主体 |
| unified_code | `char(16) NOT NULL UNIQUE` | ZZU+2位区域码+10位区域流水+1位Luhn；用户已确认 |
| source_card_no | `varchar(100)` | 源表卡号 |
| source_customer_no | `varchar(100)` | 源客户号 |
| current_org_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 当前末级归属 |
| water_nature | `varchar(32) NOT NULL` | 用水性质 |
| industry | `varchar(64)` | 行业 |
| community | `varchar(160)` | 小区 |
| admin_code | `varchar(16)` | 行政区 |
| address | `text` | 地址 |
| location | `geometry(Point,4326)` | 坐标；来源CRS须转换 |
| registered_on | `date NOT NULL` | 注册日期 |
| cancelled_on | `date` | 注销日期 |
| status | `varchar(24) NOT NULL` | ACTIVE/CANCELLED/SUSPENDED |
| ext_attrs | `jsonb NOT NULL DEFAULT '{}'` | 扩展属性 |
| source_id | `bigint REFERENCES ods.source(id)` | 来源系统；平台数据可空 |
| source_pk | `varchar(160)` | 源主键 |
| source_version | `varchar(80)` | 源版本/更新时间序列 |
| imported_at | `timestamptz` | 入仓时间 |
| created_at | `timestamptz NOT NULL DEFAULT now()` | 创建时间 |
| updated_at | `timestamptz NOT NULL DEFAULT now()` | 更新时间（应用显式维护） |
| version | `bigint NOT NULL DEFAULT 0` | 乐观锁版本 |

表级约束：
```sql
CHECK(cancelled_on IS NULL OR cancelled_on>=registered_on)
```

## dwd.account_org_history

发生时组织归属；同表卡时间不得重叠

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| account_id | `bigint NOT NULL REFERENCES dwd.account(id)` | 表卡 |
| org_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 末级节点 |
| valid_from | `date NOT NULL` | 开始含 |
| valid_to | `date` | 结束不含，空表示当前 |

表级约束：
```sql
CHECK(valid_to IS NULL OR valid_to>valid_from),
EXCLUDE USING gist(account_id WITH =,daterange(valid_from,valid_to,'[)') WITH &&)
```

## mdm.warehouse

仓库

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| company_id | `bigint NOT NULL REFERENCES mdm.company(id)` | 公司 |
| org_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 归属节点 |
| code | `varchar(80) NOT NULL` | 仓库码 |
| name | `varchar(128) NOT NULL` | 名称 |

表级约束：
```sql
UNIQUE(company_id,code)
```

## dwd.meter

水表资产

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| company_id | `bigint NOT NULL REFERENCES mdm.company(id)` | 公司 |
| meter_no | `varchar(100) NOT NULL` | 资产表号 |
| meter_type | `varchar(32) NOT NULL` | 类型 |
| caliber_mm | `integer CHECK(caliber_mm>0)` | 口径mm |
| manufacturer | `varchar(128)` | 厂家 |
| model | `varchar(80)` | 型号 |
| barcode | `varchar(100)` | 条码 |
| status | `varchar(32) NOT NULL` | 在用/在库/周转/待检/报废 |
| warehouse_id | `bigint REFERENCES mdm.warehouse(id)` | 当前仓库 |
| ext_attrs | `jsonb NOT NULL DEFAULT '{}'` | 低频属性 |
| source_id | `bigint REFERENCES ods.source(id)` | 来源系统；平台数据可空 |
| source_pk | `varchar(160)` | 源主键 |
| source_version | `varchar(80)` | 源版本/更新时间序列 |
| imported_at | `timestamptz` | 入仓时间 |
| created_at | `timestamptz NOT NULL DEFAULT now()` | 创建时间 |
| updated_at | `timestamptz NOT NULL DEFAULT now()` | 更新时间（应用显式维护） |
| version | `bigint NOT NULL DEFAULT 0` | 乐观锁版本 |

表级约束：
```sql
UNIQUE(company_id,meter_no)
```

## dwd.meter_installation

户表绑定有效期

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| account_id | `bigint NOT NULL REFERENCES dwd.account(id)` | 表卡 |
| meter_id | `bigint NOT NULL REFERENCES dwd.meter(id)` | 水表 |
| installed_at | `timestamptz NOT NULL` | 安装时间 |
| removed_at | `timestamptz` | 拆除时间 |
| initial_reading | `numeric(20,4)` | 起始指数 |
| final_reading | `numeric(20,4)` | 拆表指数 |

表级约束：
```sql
CHECK(removed_at IS NULL OR removed_at>installed_at),
EXCLUDE USING gist(meter_id WITH =,tstzrange(installed_at,removed_at,'[)') WITH &&)
```

## dwd.meter_swap

换表记录

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| account_id | `bigint NOT NULL REFERENCES dwd.account(id)` | 表卡 |
| old_meter_id | `bigint REFERENCES dwd.meter(id)` | 原表 |
| new_meter_id | `bigint NOT NULL REFERENCES dwd.meter(id)` | 新表 |
| occurred_at | `timestamptz NOT NULL` | 换表时间 |
| reason | `varchar(100) NOT NULL` | 周检/故障等 |
| old_stop | `numeric(20,4)` | 拆表止码 |
| new_start | `numeric(20,4)` | 新表起码 |
| source_id | `bigint REFERENCES ods.source(id)` | 来源系统；平台数据可空 |
| source_pk | `varchar(160)` | 源主键 |
| source_version | `varchar(80)` | 源版本/更新时间序列 |
| imported_at | `timestamptz` | 入仓时间 |

表级约束：
```sql
CHECK(old_meter_id IS NULL OR old_meter_id<>new_meter_id)
```

## dwd.inventory_event

库存流水；不能仅靠当前库存推算历史

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| warehouse_id | `bigint NOT NULL REFERENCES mdm.warehouse(id)` | 仓库 |
| meter_id | `bigint NOT NULL REFERENCES dwd.meter(id)` | 资产 |
| direction | `smallint NOT NULL CHECK(direction IN(-1,1))` | 入库1出库-1 |
| event_type | `varchar(32) NOT NULL` | 新装/周转/检定等 |
| occurred_at | `timestamptz NOT NULL` | 时间 |
| source_id | `bigint REFERENCES ods.source(id)` | 来源系统；平台数据可空 |
| source_pk | `varchar(160)` | 源主键 |
| source_version | `varchar(80)` | 源版本/更新时间序列 |
| imported_at | `timestamptz` | 入仓时间 |

## dwd.read_task

应抄基线；无读数也必须有任务

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| account_id | `bigint NOT NULL REFERENCES dwd.account(id)` | 表卡 |
| meter_id | `bigint REFERENCES dwd.meter(id)` | 任务表具 |
| org_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 发生时组织 |
| bill_period | `date NOT NULL` | 账期 |
| cycle_code | `varchar(32) NOT NULL` | 周期 |
| scheduled_on | `date NOT NULL` | 应抄日 |
| status | `varchar(24) NOT NULL` | PENDING/READ/MISSED/CANCELLED |
| is_estimated | `boolean` | 是否估抄；未知可空 |
| arrival_status | `varchar(16) NOT NULL DEFAULT 'UNKNOWN'` | PASS/FAIL/UNKNOWN |
| photo_status | `varchar(16) NOT NULL DEFAULT 'UNKNOWN'` | 照片合规 |
| remote_billed | `boolean` | 远传是否开账；未知可空 |
| photo_ref | `varchar(300)` | 受鉴权附件对象键 |
| read_location | `geometry(Point,4326)` | 实际定位 |
| source_id | `bigint REFERENCES ods.source(id)` | 来源系统；平台数据可空 |
| source_pk | `varchar(160)` | 源主键 |
| source_version | `varchar(80)` | 源版本/更新时间序列 |
| imported_at | `timestamptz` | 入仓时间 |

表级约束：
```sql
UNIQUE(account_id,bill_period,cycle_code)
```

## dwd.reading

有效读数；保留源版本与自然发生日

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| task_id | `bigint REFERENCES dwd.read_task(id)` | 关联应抄任务 |
| account_id | `bigint NOT NULL REFERENCES dwd.account(id)` | 表卡 |
| meter_id | `bigint NOT NULL REFERENCES dwd.meter(id)` | 表具 |
| org_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 历史组织 |
| observed_at | `timestamptz NOT NULL` | 抄表时刻 |
| bill_period | `date NOT NULL` | 业务账期 |
| natural_month | `date NOT NULL` | 按Asia/Shanghai生成的月初 |
| previous_value | `numeric(20,4)` | 上期指数 |
| current_value | `numeric(20,4)` | 本期指数 |
| read_volume | `numeric(20,4)` | 经翻转/换表校验的读数水量 |
| billed_volume | `numeric(20,4)` | 实际开账水量，不强制等于指数差 |
| quality | `varchar(24) NOT NULL` | VALID/ESTIMATED/INVALID/UNKNOWN |
| source_id | `bigint REFERENCES ods.source(id)` | 来源系统；平台数据可空 |
| source_pk | `varchar(160)` | 源主键 |
| source_version | `varchar(80)` | 源版本/更新时间序列 |
| imported_at | `timestamptz` | 入仓时间 |

## dwd.bill

应收账单本金与费用分项

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| account_id | `bigint NOT NULL REFERENCES dwd.account(id)` | 表卡 |
| org_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 发生时组织 |
| bill_period | `date NOT NULL` | 业务账期 |
| natural_month | `date NOT NULL` | 自然月 |
| issued_on | `date NOT NULL` | 开账日期 |
| due_on | `date` | 应缴期限 |
| billed_volume | `numeric(20,4)` | 开账量 |
| water_fee | `numeric(20,2) NOT NULL DEFAULT 0` | 水费 |
| sewage_fee | `numeric(20,2) NOT NULL DEFAULT 0` | 污水处理费 |
| resource_fee | `numeric(20,2) NOT NULL DEFAULT 0` | 水资源费税 |
| garbage_fee | `numeric(20,2) NOT NULL DEFAULT 0` | 垃圾处理费 |
| other_fee | `numeric(20,2) NOT NULL DEFAULT 0` | 其他费用分项合计 |
| principal_amount | `numeric(20,2) NOT NULL` | 本金应收 |
| late_fee | `numeric(20,2) NOT NULL DEFAULT 0` | 违约金独立 |
| status | `varchar(24) NOT NULL` | OPEN/SETTLED/VOID |
| source_id | `bigint REFERENCES ods.source(id)` | 来源系统；平台数据可空 |
| source_pk | `varchar(160)` | 源主键 |
| source_version | `varchar(80)` | 源版本/更新时间序列 |
| imported_at | `timestamptz` | 入仓时间 |
| created_at | `timestamptz NOT NULL DEFAULT now()` | 创建时间 |
| updated_at | `timestamptz NOT NULL DEFAULT now()` | 更新时间（应用显式维护） |
| version | `bigint NOT NULL DEFAULT 0` | 乐观锁版本 |

表级约束：
```sql
CHECK(principal_amount=water_fee+sewage_fee+resource_fee+garbage_fee+other_fee)
```

## dwd.bill_fee_item

长尾费用规范化分项

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| bill_id | `bigint NOT NULL REFERENCES dwd.bill(id)` | 账单 |
| fee_code | `varchar(64) NOT NULL` | 标准费用码 |
| source_fee_code | `varchar(100)` | 源费用码 |
| amount | `numeric(20,2) NOT NULL` | 金额，可含冲减 |

表级约束：
```sql
UNIQUE(bill_id,fee_code)
```

## dwd.payment

收款事件，与核销分离；负数为冲正

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| account_id | `bigint NOT NULL REFERENCES dwd.account(id)` | 表卡 |
| org_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 收款发生组织 |
| paid_at | `timestamptz NOT NULL` | 收款时刻 |
| natural_month | `date NOT NULL` | 收款自然月 |
| amount | `numeric(20,2) NOT NULL` | 净收款事件金额 |
| channel | `varchar(64)` | 渠道 |
| reversal_of | `bigint REFERENCES dwd.payment(id)` | 被冲正事件 |
| source_id | `bigint REFERENCES ods.source(id)` | 来源系统；平台数据可空 |
| source_pk | `varchar(160)` | 源主键 |
| source_version | `varchar(80)` | 源版本/更新时间序列 |
| imported_at | `timestamptz` | 入仓时间 |

## dwd.payment_allocation

多对多核销；余额约束必须事务锁定后校验

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| payment_id | `bigint NOT NULL REFERENCES dwd.payment(id)` | 收款 |
| bill_id | `bigint NOT NULL REFERENCES dwd.bill(id)` | 被核销账单 |
| allocated_at | `timestamptz NOT NULL` | 核销时刻 |
| principal_amount | `numeric(20,2) NOT NULL` | 本金核销，可负冲正 |
| late_fee_amount | `numeric(20,2) NOT NULL DEFAULT 0` | 违约金核销 |
| reversal_of | `bigint REFERENCES dwd.payment_allocation(id)` | 被撤销核销 |
| source_id | `bigint REFERENCES ods.source(id)` | 来源系统；平台数据可空 |
| source_pk | `varchar(160)` | 源主键 |
| source_version | `varchar(80)` | 源版本/更新时间序列 |
| imported_at | `timestamptz` | 入仓时间 |

## dwd.bill_adjustment

调整减免/退款/特殊账事件，不覆盖原账单

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| account_id | `bigint NOT NULL REFERENCES dwd.account(id)` | 表卡 |
| bill_id | `bigint REFERENCES dwd.bill(id)` | 可关联账单 |
| org_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 组织 |
| kind | `varchar(32) NOT NULL` | ADJUST/REFUND/SPECIAL/PENDING |
| amount | `numeric(20,2) NOT NULL` | 带符号金额 |
| occurred_at | `timestamptz NOT NULL` | 发生时间 |
| bill_period | `date` | 归属账期 |
| status | `varchar(24) NOT NULL` | PENDING/APPROVED/REJECTED/REVERSED |
| reason | `text NOT NULL` | 原因 |
| source_id | `bigint REFERENCES ods.source(id)` | 来源系统；平台数据可空 |
| source_pk | `varchar(160)` | 源主键 |
| source_version | `varchar(80)` | 源版本/更新时间序列 |
| imported_at | `timestamptz` | 入仓时间 |

## dwd.project

报装工程台账

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| org_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 归属节点 |
| account_id | `bigint REFERENCES dwd.account(id)` | 未立户时为空 |
| project_no | `varchar(100) NOT NULL` | 工程号 |
| name | `varchar(200) NOT NULL` | 项目名称 |
| status | `varchar(32) NOT NULL` | 状态 |
| started_on | `date` | 开工日 |
| completed_on | `date` | 完工日 |
| meter_installed_on | `date` | 装表日 |
| meter_id | `bigint REFERENCES dwd.meter(id)` | 表具 |
| source_id | `bigint REFERENCES ods.source(id)` | 来源系统；平台数据可空 |
| source_pk | `varchar(160)` | 源主键 |
| source_version | `varchar(80)` | 源版本/更新时间序列 |
| imported_at | `timestamptz` | 入仓时间 |
| created_at | `timestamptz NOT NULL DEFAULT now()` | 创建时间 |
| updated_at | `timestamptz NOT NULL DEFAULT now()` | 更新时间（应用显式维护） |
| version | `bigint NOT NULL DEFAULT 0` | 乐观锁版本 |

## dwd.project_node

工程节点多次往返均保留

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| project_id | `bigint NOT NULL REFERENCES dwd.project(id)` | 工程 |
| node_code | `varchar(64) NOT NULL` | 节点 |
| entered_at | `timestamptz NOT NULL` | 进入 |
| left_at | `timestamptz` | 离开 |
| deadline | `timestamptz` | 时限 |

表级约束：
```sql
CHECK(left_at IS NULL OR left_at>=entered_at)
```

## dwd.alert_rule

可发布规则头

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| code | `varchar(64) NOT NULL UNIQUE` | 规则码 |
| name | `varchar(128) NOT NULL` | 名称 |
| category | `varchar(32) NOT NULL` | 分类 |
| enabled | `boolean NOT NULL DEFAULT false` | 启停 |
| system_rule | `boolean NOT NULL DEFAULT false` | 系统规则不可删 |
| created_at | `timestamptz NOT NULL DEFAULT now()` | 创建时间 |
| updated_at | `timestamptz NOT NULL DEFAULT now()` | 更新时间（应用显式维护） |
| version | `bigint NOT NULL DEFAULT 0` | 乐观锁版本 |

## dwd.alert_rule_version

不可变已发布规则版本

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| rule_id | `bigint NOT NULL REFERENCES dwd.alert_rule(id)` | 规则 |
| revision | `integer NOT NULL` | 修订号 |
| definition | `jsonb NOT NULL` | 受限条件DSL，不执行任意脚本 |
| published_by | `bigint NOT NULL REFERENCES mdm.app_user(id)` | 发布人 |
| published_at | `timestamptz NOT NULL DEFAULT now()` | 发布时间 |

表级约束：
```sql
UNIQUE(rule_id,revision)
```

## dwd.alert

异常实例及证据

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| org_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 对象归属 |
| account_id | `bigint REFERENCES dwd.account(id)` | 表卡 |
| rule_version_id | `bigint REFERENCES dwd.alert_rule_version(id)` | 规则版本 |
| dedup_key | `varchar(160) NOT NULL UNIQUE` | 规则版本+对象+检测窗口 |
| detected_at | `timestamptz NOT NULL` | 检出时间 |
| severity | `varchar(16) NOT NULL` | 严重度 |
| status | `varchar(24) NOT NULL DEFAULT 'OPEN'` | OPEN/VERIFIED/FALSE_POSITIVE/CLOSED |
| evidence | `jsonb NOT NULL DEFAULT '{}'` | 证据快照和来源指针 |
| batch_id | `bigint REFERENCES ods.batch(id)` | 数据版本 |
| created_at | `timestamptz NOT NULL DEFAULT now()` | 创建时间 |
| updated_at | `timestamptz NOT NULL DEFAULT now()` | 更新时间（应用显式维护） |
| version | `bigint NOT NULL DEFAULT 0` | 乐观锁版本 |

## dwd.source_order

只读源工单快照

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| org_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 组织 |
| account_id | `bigint REFERENCES dwd.account(id)` | 表卡 |
| order_no | `varchar(100) NOT NULL` | 源单号 |
| order_type | `varchar(64) NOT NULL` | 类别 |
| status | `varchar(64) NOT NULL` | 源状态 |
| sent_at | `timestamptz` | 发出 |
| accepted_at | `timestamptz` | 接收 |
| finished_at | `timestamptz` | 完成 |
| trace | `jsonb NOT NULL DEFAULT '[]'` | 源流程记录 |
| source_id | `bigint REFERENCES ods.source(id)` | 来源系统；平台数据可空 |
| source_pk | `varchar(160)` | 源主键 |
| source_version | `varchar(80)` | 源版本/更新时间序列 |
| imported_at | `timestamptz` | 入仓时间 |

## dwd.supervision

平台督办；一预警一督办，复开原单

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| alert_id | `bigint NOT NULL UNIQUE REFERENCES dwd.alert(id)` | 关联异常 |
| org_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 责任组织 |
| assignee_id | `bigint REFERENCES mdm.app_user(id)` | 责任人 |
| created_by | `bigint NOT NULL REFERENCES mdm.app_user(id)` | 创建人 |
| status | `varchar(24) NOT NULL DEFAULT 'DRAFT'` | 状态机 |
| deadline | `timestamptz` | 截止 |
| resolution | `text` | 处理结果 |
| created_at | `timestamptz NOT NULL DEFAULT now()` | 创建时间 |
| updated_at | `timestamptz NOT NULL DEFAULT now()` | 更新时间（应用显式维护） |
| version | `bigint NOT NULL DEFAULT 0` | 乐观锁版本 |

表级约束：
```sql
CHECK(status IN('DRAFT','ASSIGNED','ACCEPTED','PROCESSING','RESOLVED','CLOSED','CANCELLED'))
```

## dwd.supervision_event

督办事件审计

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| supervision_id | `bigint NOT NULL REFERENCES dwd.supervision(id)` | 督办 |
| actor_id | `bigint NOT NULL REFERENCES mdm.app_user(id)` | 操作者 |
| from_status | `varchar(24)` | 原状态 |
| to_status | `varchar(24) NOT NULL` | 新状态 |
| reason | `text NOT NULL` | 说明 |
| occurred_at | `timestamptz NOT NULL DEFAULT now()` | 时间 |

## mdm.dma_node

DMA空间拓扑；业务映射独立于组织树

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| org_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 责任组织 |
| parent_id | `bigint REFERENCES mdm.dma_node(id)` | 上级分区 |
| code | `varchar(80) NOT NULL UNIQUE` | 分区码 |
| name | `varchar(128) NOT NULL` | 名称 |
| boundary | `geometry(MultiPolygon,4326)` | 区域边界 |
| created_at | `timestamptz NOT NULL DEFAULT now()` | 创建时间 |
| updated_at | `timestamptz NOT NULL DEFAULT now()` | 更新时间（应用显式维护） |
| version | `bigint NOT NULL DEFAULT 0` | 乐观锁版本 |

## mdm.telemetry_device

遥测设备与分区关联

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| source_id | `bigint NOT NULL REFERENCES ods.source(id)` | 数据源 |
| device_code | `varchar(100) NOT NULL` | 源设备码 |
| org_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 责任组织 |
| dma_node_id | `bigint REFERENCES mdm.dma_node(id)` | DMA |
| meter_id | `bigint REFERENCES dwd.meter(id)` | 可关联户表 |
| location | `geometry(Point,4326)` | 位置 |
| unit | `varchar(24) NOT NULL` | 单位 |

表级约束：
```sql
UNIQUE(source_id,device_code), UNIQUE(id,source_id)
```

## mdm.dma_account

DMA覆盖表卡有效期

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| dma_node_id | `bigint NOT NULL REFERENCES mdm.dma_node(id)` | DMA |
| account_id | `bigint NOT NULL REFERENCES dwd.account(id)` | 表卡 |
| valid_from | `date NOT NULL` | 开始 |
| valid_to | `date` | 结束 |

表级约束：
```sql
CHECK(valid_to IS NULL OR valid_to>valid_from),
EXCLUDE USING gist(account_id WITH =,daterange(valid_from,valid_to,'[)') WITH &&)
```

## ts.telemetry

高频时序；唯一键含时间分区列

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| source_id | `bigint NOT NULL REFERENCES ods.source(id)` | 来源 |
| device_id | `bigint NOT NULL` | 设备 |
| observed_at | `timestamptz NOT NULL` | 观测时间 |
| received_at | `timestamptz NOT NULL DEFAULT now()` | 到达时间 |
| instant_flow | `numeric(20,6)` | 瞬时流量m³/h |
| cumulative_volume | `numeric(24,6)` | 累计体积m³ |
| pressure_mpa | `numeric(12,6)` | 压力MPa |
| quality | `varchar(24) NOT NULL DEFAULT 'UNKNOWN'` | VALID/MISSING/RESET/INVALID/UNKNOWN |
| raw_payload | `jsonb` | 可选来源证据 |

表级约束：
```sql
PRIMARY KEY(device_id,observed_at,source_id),
FOREIGN KEY(device_id,source_id) REFERENCES mdm.telemetry_device(id,source_id)
```

## ads.data_release

聚合发布版本；构建完成才发布

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| release_key | `varchar(100) NOT NULL UNIQUE` | 版本号 |
| batch_ids | `jsonb NOT NULL` | 输入批次集合 |
| metric_version | `varchar(40) NOT NULL` | 指标定义版本 |
| status | `varchar(24) NOT NULL` | BUILDING/PUBLISHED/FAILED |
| published_at | `timestamptz` | 发布时间 |
| created_at | `timestamptz NOT NULL DEFAULT now()` | 创建 |

## ads.org_month

组织月度基础可加总量；比率查询时派生

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| release_id | `bigint NOT NULL REFERENCES ads.data_release(id)` | 发布版本 |
| org_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 组织 |
| period | `date NOT NULL` | 月初 |
| caliber_mode | `varchar(16) NOT NULL` | BILL_PERIOD/NATURAL_MONTH |
| sold_volume | `numeric(24,4)` | 售水 |
| supply_volume | `numeric(24,4)` | 供水，缺失为空 |
| water_revenue | `numeric(24,2)` | 水费收入 |
| receivable_principal | `numeric(24,2)` | 应收本金 |
| allocated_principal | `numeric(24,2)` | 回收本金 |
| registered_count | `bigint` | 期末存量 |
| new_count | `bigint` | 新增 |
| cancelled_count | `bigint` | 注销 |
| quality | `varchar(24) NOT NULL` | COMPLETE/PARTIAL/MISSING |

表级约束：
```sql
PRIMARY KEY(release_id,org_id,period,caliber_mode),
CHECK(caliber_mode IN('BILL_PERIOD','NATURAL_MONTH'))
```

## ads.metric_definition

指标口径与展示元数据

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| code | `varchar(64) NOT NULL` | 指标码 |
| revision | `integer NOT NULL` | 版本 |
| name | `varchar(100) NOT NULL` | 名称 |
| unit | `varchar(24) NOT NULL` | 单位 |
| formula_description | `text NOT NULL` | 明确分子分母与空值规则 |
| status | `varchar(16) NOT NULL DEFAULT 'DRAFT'` | DRAFT/APPROVED/RETIRED |
| approved_by | `bigint REFERENCES mdm.app_user(id)` | 签认人 |

表级约束：
```sql
UNIQUE(code,revision)
```

## ads.plan

平台手工计划，按节点与指标唯一

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| org_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 计划节点 |
| metric_code | `varchar(64) NOT NULL` | 已注册指标码 |
| period | `date NOT NULL` | 计划月份 |
| caliber_mode | `varchar(16) NOT NULL` | 口径 |
| value | `numeric(24,6) NOT NULL` | 计划值 |
| updated_by | `bigint NOT NULL REFERENCES mdm.app_user(id)` | 修改人 |
| created_at | `timestamptz NOT NULL DEFAULT now()` | 创建时间 |
| updated_at | `timestamptz NOT NULL DEFAULT now()` | 更新时间（应用显式维护） |
| version | `bigint NOT NULL DEFAULT 0` | 乐观锁版本 |

表级约束：
```sql
UNIQUE(org_id,metric_code,period,caliber_mode)
```

## ads.forecast_run

模型与回测上下文

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| org_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 预测范围 |
| model_code | `varchar(64) NOT NULL` | 模型名 |
| model_version | `varchar(64) NOT NULL` | 模型版本 |
| training_cutoff | `date NOT NULL` | 训练截止；防未来数据泄漏 |
| horizon | `varchar(16) NOT NULL` | MONTH/QUARTER/YEAR |
| factors | `jsonb NOT NULL DEFAULT '{}'` | 因子快照 |
| backtest | `jsonb NOT NULL DEFAULT '{}'` | 窗口/样本/MAPE等，零值另处理 |
| status | `varchar(24) NOT NULL` | QUEUED/RUNNING/SUCCEEDED/FAILED |
| created_by | `bigint NOT NULL REFERENCES mdm.app_user(id)` | 创建者 |
| created_at | `timestamptz NOT NULL DEFAULT now()` | 时间 |

## ads.forecast_value

分节点预测结果

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| run_id | `bigint NOT NULL REFERENCES ads.forecast_run(id)` | 预测批次 |
| org_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 结果节点 |
| period | `date NOT NULL` | 目标月份 |
| value | `numeric(24,4)` | 预测水量 |
| lower_bound | `numeric(24,4)` | 区间下界 |
| upper_bound | `numeric(24,4)` | 区间上界 |
| quality | `varchar(24) NOT NULL` | VALID/INSUFFICIENT |

表级约束：
```sql
PRIMARY KEY(run_id,org_id,period)
```

## ads.dma_balance

经映射与质量检查的供售水结果

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| release_id | `bigint NOT NULL REFERENCES ads.data_release(id)` | 版本 |
| dma_node_id | `bigint NOT NULL REFERENCES mdm.dma_node(id)` | DMA |
| period | `date NOT NULL` | 月份 |
| supply_volume | `numeric(24,4)` | 校验后供水量 |
| sold_volume | `numeric(24,4)` | 覆盖表卡售水 |
| quality | `varchar(24) NOT NULL` | COMPLETE/PARTIAL/MISSING |

表级约束：
```sql
PRIMARY KEY(release_id,dma_node_id,period)
```

## ads.report_definition

21张报表及参数schema

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| code | `varchar(32) NOT NULL UNIQUE` | P-RPT-001等 |
| name | `varchar(160) NOT NULL` | 名称 |
| category | `varchar(64) NOT NULL` | 分类 |
| parameter_schema | `jsonb NOT NULL DEFAULT '{}'` | 允许参数及校验 |
| template_version | `varchar(40) NOT NULL` | 模板版本 |
| enabled | `boolean NOT NULL DEFAULT true` | 启停 |

## ads.report_job

异步报表/导出；下载时重验权限

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| report_id | `bigint NOT NULL REFERENCES ads.report_definition(id)` | 报表 |
| requested_by | `bigint NOT NULL REFERENCES mdm.app_user(id)` | 请求者 |
| org_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 范围 |
| release_id | `bigint REFERENCES ads.data_release(id)` | 数据版本 |
| parameters | `jsonb NOT NULL` | 参数快照 |
| status | `varchar(24) NOT NULL DEFAULT 'QUEUED'` | QUEUED/RUNNING/SUCCEEDED/FAILED/EXPIRED |
| object_key | `varchar(300)` | 文件对象键，不是公开URL |
| expires_at | `timestamptz` | 下载有效期 |
| row_count | `bigint` | 导出行数 |
| error_summary | `text` | 脱敏错误 |
| created_at | `timestamptz NOT NULL DEFAULT now()` | 创建时间 |
| updated_at | `timestamptz NOT NULL DEFAULT now()` | 更新时间（应用显式维护） |
| version | `bigint NOT NULL DEFAULT 0` | 乐观锁版本 |

## mdm.idempotency

写操作幂等结果，按账号/接口/键隔离

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| actor_id | `bigint NOT NULL REFERENCES mdm.app_user(id)` | 账号 |
| operation | `varchar(100) NOT NULL` | 动作/路径 |
| request_key | `varchar(128) NOT NULL` | Idempotency-Key |
| payload_hash | `varchar(64) NOT NULL` | 请求内容hash |
| result | `jsonb` | 原结果 |
| expires_at | `timestamptz NOT NULL` | 过期时间 |

表级约束：
```sql
PRIMARY KEY(actor_id,operation,request_key)
```

## mdm.meter_barcode_rule

报表001的厂家/表型/条码规则，需业务签认

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| prefix | `varchar(32) NOT NULL` | 条码前缀 |
| manufacturer | `varchar(128) NOT NULL` | 厂家 |
| meter_type | `varchar(32) NOT NULL` | 表型 |
| valid_from | `date NOT NULL` | 生效日 |
| valid_to | `date` | 失效日 |

表级约束：
```sql
UNIQUE(prefix,manufacturer,meter_type,valid_from)
```

## dwd.account_event

性质变更、入册、调册等事件，不能用注册日代替入册日

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| id | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` | 内部代理主键 |
| account_id | `bigint NOT NULL REFERENCES dwd.account(id)` | 表卡 |
| org_id | `bigint NOT NULL REFERENCES mdm.org(id)` | 发生时组织 |
| event_type | `varchar(32) NOT NULL` | NATURE_CHANGE/BOOKLET_JOIN/BOOKLET_MOVE |
| occurred_at | `timestamptz NOT NULL` | 发生时间 |
| before_value | `jsonb` | 原值 |
| after_value | `jsonb NOT NULL` | 新值 |
| source_id | `bigint REFERENCES ods.source(id)` | 来源系统；平台数据可空 |
| source_pk | `varchar(160)` | 源主键 |
| source_version | `varchar(80)` | 源版本/更新时间序列 |
| imported_at | `timestamptz` | 入仓时间 |

## ads.account_profile

画像规则版本与结果；无依据不打分

| 字段 | 类型/约束/默认 | 说明 |
|---|---|---|
| account_id | `bigint NOT NULL REFERENCES dwd.account(id)` | 表卡 |
| release_id | `bigint NOT NULL REFERENCES ads.data_release(id)` | 数据批次 |
| rule_version | `varchar(64) NOT NULL` | 画像口径 |
| as_of | `date NOT NULL` | 评价日期 |
| dimensions | `jsonb NOT NULL` | 稳定性/缴费等定义、值、证据；不凭空默认分数 |
| quality | `varchar(24) NOT NULL` | COMPLETE/PARTIAL/INSUFFICIENT |

表级约束：
```sql
PRIMARY KEY(account_id,release_id,rule_version,as_of)
```


---

# 原型—需求—数据库映射与21张报表

这是从当前优化后代码提取的页面及报表字段，不使用历史截图推断实现。所有样例数据不等于真实来源已接入。

| 路由 | 页面 | 主要代码 | 正式数据库 |
|---|---|---|---|
| #/home | 首页 | assets/home.js | ads.org_month、mdm.org |
| #/drill | 指标下钻（隐藏路由） | assets/home.js / organization.js | mdm.org / org_closure、ads.org_month |
| #/user | 用户查询与分析 | assets/business.js | dwd.customer / account / account_org_history |
| #/meter | 表务与抄表督查 | assets/business.js | dwd.meter / reading / read_task / meter_swap / inventory_event |
| #/alert | 智能分析与预警 | assets/business.js | dwd.alert / alert_rule / alert_rule_version |
| #/project | 工程与未立户监管 | assets/business.js | dwd.project / project_node |
| #/ar | 应收账款与账务 | assets/views.js | dwd.bill / payment / payment_allocation / bill_adjustment |
| #/dma | 分区计量与流量计 | assets/views.js | mdm.dma_node / dma_account / telemetry_device、ts.telemetry、ads.dma_balance |
| #/forecast | 指标预测 | assets/views.js | ads.forecast_run / forecast_value / plan |
| #/work | 工单督查 | assets/views.js | dwd.source_order / supervision / supervision_event |
| #/data | 数据集成与治理 | assets/views.js | ods.source / batch / raw_record / quality_issue |
| #/report | 报表中心 | assets/views.js | ads.report_definition / report_job |
| #/auth | 用户管理 | assets/views.js / admin.js | mdm.org / app_user / role / user_role / role_permission / user_scope |
| #/set | 系统设置 | assets/views.js / admin.js | mdm.config / audit_event、ads.plan / metric_definition |

## 报表公共契约

每张报表必须有组织范围、时间范围、caliberMode、asOf、模板版本、数据版本、生成者和生成时间。空数据可生成只有标题与表头的文件，但来源缺失必须标记“待数据”，不能宣称结果为零。原型可预览数不是生产验收完成数。


## P-RPT-001 水表基础信息异常报表

- 周期：周报；分类：表务计量。
- 目录口径：按「水表厂家 × 水表类型 × 条形码前 8 位」对应关系校验，三者不匹配即判为基础信息异常
- 当前实现：待真实数据/规则。缺少厂家×表型×条形码前8位对应规则及判定结果。
- 输出列：异常编号、水表、厂家、表型、条形码、异常说明。
- 目标数据表：meter、meter_barcode_rule。
- 验收：在同组织、同期间、同口径下与来源明细逐项对账，缺失项不生成虚拟行；导出和预览行数及合计一致。

## P-RPT-002 周检水表报表

- 周期：月报；分类：表务计量。
- 目录口径：统计维度：水表类型、水表厂家、口径
- 当前实现：样例可预览。当前仅包含已提供的周检换表记录。
- 输出列：事件编号、统一表卡、用户名称、用户地址、用水性质、所属组织、册本、换表类型、换表时间、经营单位、旧物理表、新物理表、厂家、型号、口径、状态。
- 目标数据表：meter、meter_swap。
- 验收：在同组织、同期间、同口径下与来源明细逐项对账，缺失项不生成虚拟行；导出和预览行数及合计一致。

## P-RPT-003 故障水表报表

- 周期：月报；分类：表务计量。
- 目录口径：统计维度：水表类型、水表厂家、口径
- 当前实现：样例可预览。当前仅包含已提供的故障换表记录。
- 输出列：事件编号、统一表卡、用户名称、用户地址、用水性质、所属组织、册本、换表类型、换表时间、经营单位、旧物理表、新物理表、厂家、型号、口径、状态。
- 目标数据表：meter、meter_swap。
- 验收：在同组织、同期间、同口径下与来源明细逐项对账，缺失项不生成虚拟行；导出和预览行数及合计一致。

## P-RPT-004 周检换表前后周期水量对比报表

- 周期：季报；分类：表务计量。
- 目录口径：同一户换表前后各 2 个抄表周期（可选 2/3 期）逐户水量对比
- 当前实现：样例可预览。按事件已有前后2期序列展示。
- 输出列：事件编号、统一表卡、经营单位、换表日期、换表前2期水量序列、换表后2期水量序列、均值变化(%)、单位。
- 目标数据表：meter_swap、reading。
- 验收：在同组织、同期间、同口径下与来源明细逐项对账，缺失项不生成虚拟行；导出和预览行数及合计一致。

## P-RPT-005 故障换表前后周期水量对比报表

- 周期：季报；分类：表务计量。
- 目录口径：故障拆表前后各 2 个周期（可选 2/3 期）逐户水量对比
- 当前实现：样例可预览。按事件已有前后2期序列展示。
- 输出列：事件编号、统一表卡、经营单位、换表日期、换表前2期水量序列、换表后2期水量序列、均值变化(%)、单位。
- 目标数据表：meter_swap、reading。
- 验收：在同组织、同期间、同口径下与来源明细逐项对账，缺失项不生成虚拟行；导出和预览行数及合计一致。

## P-RPT-006 水表入库统计表

- 周期：周报；分类：水表仓储。
- 目录口径：本期入库数量按入库类型（新装、周转、检定合格回库）与厂家统计
- 当前实现：待真实数据/规则。本期入库流水待接入，当前仅支持库存快照查询。
- 输出列：入库日期、仓库、水表、入库类型、厂家、数量。
- 目标数据表：inventory_event、warehouse。
- 验收：在同组织、同期间、同口径下与来源明细逐项对账，缺失项不生成虚拟行；导出和预览行数及合计一致。

## P-RPT-007 水表库存统计表

- 周期：日报；分类：水表仓储。
- 目录口径：期末库存＝期初＋入库－出库，按口径、水表类型统计
- 当前实现：样例可预览。当前库存快照；未提供期初与出入库流水时不重算期末公式。
- 输出列：口径、水表类型、库存状态、台数。
- 目标数据表：meter、inventory_event。
- 验收：在同组织、同期间、同口径下与来源明细逐项对账，缺失项不生成虚拟行；导出和预览行数及合计一致。

## P-RPT-008 各仓库库存报表

- 周期：月报；分类：水表仓储。
- 目录口径：各仓库在库、周转、待检、报废四类状态台数明细
- 当前实现：样例可预览。按当前水表库存记录逐仓汇总。
- 输出列：仓库、经营单位、在库(台)、周转(台)、待检(台)、报废(台)、合计(台)。
- 目标数据表：meter、warehouse。
- 验收：在同组织、同期间、同口径下与来源明细逐项对账，缺失项不生成虚拟行；导出和预览行数及合计一致。

## P-RPT-009 抄见率统计报表

- 周期：月报；分类：抄表与水量。
- 目录口径：按样例应抄任务计算已抄任务/应抄任务；真实任务基线及有效任务范围待确认
- 当前实现：样例可预览。按抄表任务基线计算（样例任务自 2023-01 起）；未抄任务不计水量与应收。
- 输出列：经营单位、应抄任务(户次)、已抄(户次)、未抄(户次)、抄见率(%)、照片合规率(%)、定位到位率(%)。
- 目标数据表：read_task。
- 验收：在同组织、同期间、同口径下与来源明细逐项对账，缺失项不生成虚拟行；导出和预览行数及合计一致。

## P-RPT-010 未抄见报表

- 周期：月报；分类：抄表与水量。
- 目录口径：估抄、空号、拆表、表井被占、远传掉线等未抄见原因明细
- 当前实现：样例可预览。按应抄任务中的未抄任务展示；不以已有读数记录反推未抄名单。
- 输出列：抄表记录、统一表卡、经营单位、组织/线路、抄表员、账期、抄表状态、抄表方式、水量(m³)。
- 目标数据表：read_task。
- 验收：在同组织、同期间、同口径下与来源明细逐项对账，缺失项不生成虚拟行；导出和预览行数及合计一致。

## P-RPT-011 异常状态统计报表

- 周期：周报；分类：抄表与水量。
- 目录口径：按抄表与水表异常状态（远传改手工、非手机抄表、周检到期等）分类统计
- 当前实现：样例可预览。按异常样例已有类型统计。
- 输出列：异常类型、异常分类、数量(条)。
- 目标数据表：alert。
- 验收：在同组织、同期间、同口径下与来源明细逐项对账，缺失项不生成虚拟行；导出和预览行数及合计一致。

## P-RPT-012 连续零水量用户报表

- 周期：月报；分类：抄表与水量。
- 目录口径：连续 ≥2 个抄表周期用水量为 0 的用户清单
- 当前实现：样例可预览。按连续3个账期检查，缺月即中断；应抄任务基线待核。
- 输出列：统一表卡、经营单位、组织/线路、连续零水量周期数、最近账期、核验状态。
- 目标数据表：reading、read_task。
- 验收：在同组织、同期间、同口径下与来源明细逐项对账，缺失项不生成虚拟行；导出和预览行数及合计一致。

## P-RPT-013 100立方米以上用户报表

- 周期：月报；分类：抄表与水量。
- 目录口径：月用水 ≥100m³ 用户，含当月水量与累计同比
- 当前实现：样例可预览。门槛为月用水量≥100m³；缺去年同期时同比为空。
- 输出列：统一表卡、经营单位、用水性质、账期、本期水量(m³)、去年同期(m³)、同比(%)。
- 目标数据表：reading。
- 验收：在同组织、同期间、同口径下与来源明细逐项对账，缺失项不生成虚拟行；导出和预览行数及合计一致。

## P-RPT-014 异常水量分析报表

- 周期：月报；分类：抄表与水量。
- 目录口径：连续三个周期 0 水量，或水量同比变化超过 ±30% 的用户
- 当前实现：样例可预览。按实际记录判断连续3期零水量或同比变化超过±30%。
- 输出列：统一表卡、经营单位、组织/线路、账期、本期水量(m³)、去年同期(m³)、同比(%)、异常依据。
- 目标数据表：reading、alert_rule_version。
- 验收：在同组织、同期间、同口径下与来源明细逐项对账，缺失项不生成虚拟行；导出和预览行数及合计一致。

## P-RPT-015 用水性质变更统计报表

- 周期：月报；分类：用户与册本。
- 目录口径：当月变更户数与历史累计变更对比（居民阶梯 / 非阶梯 / 非居民 / 特行互转）
- 当前实现：待真实数据/规则。未提供用水性质变更记录。
- 输出列：变更日期、统一表卡、原用水性质、新用水性质、经营单位。
- 目标数据表：account_event。
- 验收：在同组织、同期间、同口径下与来源明细逐项对账，缺失项不生成虚拟行；导出和预览行数及合计一致。

## P-RPT-016 小区各用水性质户数报表

- 周期：季报；分类：用户与册本。
- 目录口径：按小区统计居民阶梯、居民非阶梯、非居民、特行户数
- 当前实现：样例可预览。按查询截止月的有效表卡统计；不同公司或组织的同名小区不合并。
- 输出列：经营单位、组织、小区、居民阶梯(户)、居民非阶梯(户)、非居民(户)、特行(户)、合计(户)。
- 目标数据表：account、account_org_history。
- 验收：在同组织、同期间、同口径下与来源明细逐项对账，缺失项不生成虚拟行；导出和预览行数及合计一致。

## P-RPT-017 册本户数报表

- 周期：季报；分类：用户与册本。
- 目录口径：按抄表册本统计在册户数与应抄表数
- 当前实现：样例可预览。同名册本按经营单位与组织分别统计；应抄任务基线待接入。
- 输出列：经营单位、组织、册本、在册户数(户)、当期有抄表记录户数(户)。
- 目标数据表：account、read_task、account_org_history。
- 验收：在同组织、同期间、同口径下与来源明细逐项对账，缺失项不生成虚拟行；导出和预览行数及合计一致。

## P-RPT-018 存量用水册本调整报表

- 周期：月报；分类：用户与册本。
- 目录口径：存量用户册本归属调整（拆分、合并、移交）明细
- 当前实现：待真实数据/规则。未提供存量用户册本调整记录。
- 输出列：调整日期、统一表卡、原册本、新册本、调整类型。
- 目标数据表：account_event。
- 验收：在同组织、同期间、同口径下与来源明细逐项对账，缺失项不生成虚拟行；导出和预览行数及合计一致。

## P-RPT-019 新增用户入册报表

- 周期：周报；分类：用户与册本。
- 目录口径：当月新立户用户分配抄表册本情况
- 当前实现：待真实数据/规则。未提供新增入册事件，立户日期不代替入册日期。
- 输出列：入册日期、统一表卡、立户日期、经营单位、组织、册本、用水性质。
- 目标数据表：account_event。
- 验收：在同组织、同期间、同口径下与来源明细逐项对账，缺失项不生成虚拟行；导出和预览行数及合计一致。

## P-RPT-020 新增用户按用水性质统计报表

- 周期：月报；分类：用户与册本。
- 目录口径：当月新增开户按用水性质拆分，口径与用户注册数维度分析一致
- 当前实现：样例可预览。新增窗口为上月26日至本月25日。
- 输出列：用水性质、新增用户(户)。
- 目标数据表：account、billing_calendar。
- 验收：在同组织、同期间、同口径下与来源明细逐项对账，缺失项不生成虚拟行；导出和预览行数及合计一致。

## P-RPT-021 注销用户按用水性质统计报表

- 周期：月报；分类：用户与册本。
- 目录口径：当月销户用户按用水性质拆分，口径与用户注册数维度分析一致
- 当前实现：样例可预览。按已有注销日期的所在月份统计。
- 输出列：用水性质、注销用户(户)。
- 目标数据表：account、billing_calendar。
- 验收：在同组织、同期间、同口径下与来源明细逐项对账，缺失项不生成虚拟行；导出和预览行数及合计一致。

## 原型与生产差异

用户、表务、报表中的旧显示列仍保留公司/组织/册本名称；正式接口统一orgId与组织路径，不以这些名称作为联合主键。样例中的固定人员为演示名称，必须用正式组织清单替换。报表001/006/015/018/019当前缺来源或规则；生产须接入对应规则、库存流水及表卡事件后验收。



---

# 给 GPT 的开发启动指令

下面这一段可直接复制给开发 GPT，同时提供整个项目目录和docs目录。

```text
你正在开发郑州水务集团营销一体化平台。先完整阅读 docs/00-阅读入口.md 及其列出的文档，再读取当前原型 index.html 和 assets。以当前V4.2原型作为交互基准，Gemini PDF仅作为历史决策证据，不机械粘贴旧HTML补丁。

已确认技术栈：JDK25 + Spring Boot3.5（锁定明确支持Java25的补丁版本），Vue3，PostgreSQL/TimescaleDB HA，PostGIS、pgvector、pg_trgm。不要擅自改成MySQL或其他后端语言。现有数据库仅测试库，可按新设计建库，但不要未经任务授权删除旧库。

已确认主键：内部BIGINT自增代理键（BIGSERIAL或GENERATED AS IDENTITY均需使用bigint），对外unified_code CHAR(16)唯一键，格式ZZU+2位区域码+10位区域内流水+1位Luhn。外键全部使用内部ID。保留各来源的客户号、表卡号、水表号。样例ZZU0200000000014有效。统一码属于计费表卡；客户主体可有多表卡，不能因同客户而丢失多个统一表卡。

组织为异构任意层级树：市区为公司→营业所→班组→线路→册本，东区/港区为公司→站点→线路，高新为公司→网格→固定人员（册本）。集团在这些公司之上。不能写固定层数判断；比较仅取当前节点直属子节点；末级查询自身明细。后端从会话计算授权根，列表/详情/聚合/导出/下载都校验。禁止相信请求中的authRoot或浏览器过滤。

按docs/02的R01–R14需求、docs/04的21报表、docs/03字段字典和sql脚本实现。数据库脚本是未在真实扩展实例执行的评审基线，先用干净测试库执行验证，修正发现的问题并同步字典。不得宣称现有文档等于后端已完成。

账期与自然月分离；业务日期、发生时组织、费用本金、违约金、支付和核销分离。金额BigDecimal，API大ID及金额输出字符串。零和缺数不同，分母0输出null，比例与均价按分子分母汇总后计算；注册数是期末存量。不得将原型随机算法搬入生产，也不能编造缺少的照片、GPS、DMA映射或供水量。

源业务只读；平台配置、计划、异常规则、督办及审计可写。正式写接口有事务、幂等、乐观锁、状态机及审计。向量扩展不代表一期必须实现RAG，不默认上传业务数据到外部模型。

实施顺序：M0版本和来源清点→M1组织权限/统一表卡→M2首家公司双口径接入与对账→M3全业务与21报表→M4时序/GIS/预测/压测与灾备。每阶段提交可运行代码、迁移、接口示例、测试结果和剩余问题。未明确的业务口径向用户确认，但继续推进不依赖该答案的工作。

开始时先检查已有工程及AGENTS.md，不覆盖用户修改。交付必须包括启动命令、环境变量示例（不含凭证）、数据库迁移说明、API契约和自动化测试。缺少PostgreSQL扩展或源系统权限时如实记录，不用H2或假成功代替验收。
```

## 推荐首次开发任务

先完成M1可运行纵向切片：登录→获取授权树→当前节点五指标→直属下级→表卡列表→表卡详情→CSV导出，使用可识别的测试数据集。覆盖市区5层、高新3层、同名节点、伪造orgId、超出权限根、空数据、0分母、导出越权等用例。先验证组织模型与指标契约再并行铺业务页面。

## 分批上下文包

- 后端：02、03、sql、01未决事项；用04定位交互。
- 前端：02、04、index.html和assets、后端实际OpenAPI；生产状态不能复用全局WB模拟对象。
- 数据：02第4/6/9章、03、sql、真实源DDL和字典。
- 测试：02验收矩阵、04报表、06验证记录。历史validation文件不是新生产系统的验收结果。

## 完成定义

每个需求必须对应页面、API、表/指标、正常与异常测试；对账差异需解释并签认。数据库迁移在目标扩展版本测试成功；授权对所有读写入口生效；13菜单和21报表均有明确完成或缺数据状态；备份恢复、HA故障切换与性能报告可复现后才可称生产可上线。


---

# V4.2 验证记录

最终整理日期：2026-11-09。范围是本地演示原型和开发设计资料。

## 已完成

| 检查 | 结果 | 证据 |
|---|---|---|
| 静态资源、模块与样例算术 | PASS；14个路由（含隐藏下钻）、21张报表、2,000户、92,000条月事实 | `validation/static-check.json`；`node scripts/validate_static.cjs` |
| 异构组织、汇总对账、权限根及缓存 | PASS；596节点；公司层级深度5/3/3/3；越界无数据、末级停止 | `validation/organization-check.json`；`node scripts/validate_organization.cjs` |
| 统一业务码 | 2,000个样例编码唯一且通过独立Luhn校验；正确/错误样例断言通过 | `scripts/validate_organization.cjs` |
| 报表契约提取 | 21张；16张样例可预览，5张明确缺数据/规则 | `validation/report-contracts.json`；`node scripts/build_report_docs.cjs` |
| 浏览器页面检查 | 13个菜单页面均可打开；组织逐级下钻、网格固定人员和末级展示已检查；最终报表页控制台未捕获error | 本次浏览器操作记录及 `validation/v4.2-organization-desktop.png` |
| 响应式 | 已检查375px与1440px宽度；修复顶部搜索框与专项宽表撑宽整页 | 本次浏览器实测，宽表在容器内滚动 |
| 数据字典同步生成 | 001脚本57张表，与字典同源生成；002新增区域流水表，总计58张 | `scripts/build_database_docs.py` 与 `docs/sql/` |

复现时先运行数据库字典生成器，再运行两个校验脚本和报表文档生成器；浏览器可直接打开根目录index.html，或使用本地静态服务。截图是本次组织页展示证据，不代表所有模块已完成生产验收。

## 尚未执行与已知限制

- 未连接PostgreSQL，未执行DDL、HA切换、TimescaleDB扩展兼容、真实权限接口及性能压测。SQL须按sql/README.md在指定版本的空测试库执行验证。
- 未实现Spring Boot后端或Vue 3正式工程；当前原型是离线JavaScript/ECharts，账号切换属于演示，不能作为服务端安全边界。
- 五张报表仍缺来源或规则：001、006、015、018、019。已有样例预览不等于真实来源已接入。
- 原型中部分历史专项指标（例如未抄表到户、二次加压非注册户数）仍使用样例零值并附缺数说明；正式系统必须按开发规格输出null/待数据，不能把样例零值迁移为事实。
- 组织名称、人员、地图和业务事实为样例；正式口径及接入清单未决项见01。未对真实财务数据或生产权限作准确性承诺。
- 本轮未执行全量导出文件内容验收、数据库集成测试或生产部署；这些已列入正式开发验收任务。


---

# 附录：SQL执行说明

# 新建库执行说明

用户已确认当前只有测试库，可按新设计建库。本轮只生成脚本，没有连接、删除或修改数据库。

1. 选定并固定PostgreSQL主版本、TimescaleDB/PostGIS/pgvector扩展版本及镜像digest。先验证扩展在镜像内可用。
2. 在独立空测试库中，用有建扩展权限的迁移账号执行001、002、003；开启遇错立即停止。不要把001覆盖运行到旧Gemini表结构上。
3. 根据正式区域清单初始化mdm.region_sequence及mdm.company。公司代码、区域码及公司名称并非可以随意互换；当前原型公司码与区域码的对应仅作样例。
4. 初始化mdm.org及org_closure，导入正式组织树和叶节点映射；检查无环、单根、跨公司父子关系合法。业务表卡只能挂叶节点。
5. 导入源配置及字典，不写真实密码到SQL文件。用只读源账号、小批量数据完成端到端对账后扩大范围。

示例（PGSERVICE在本机安全配置，命令不含密码）：
```powershell
psql service=marketing-test -v ON_ERROR_STOP=1 -f docs/sql/001-baseline.sql
psql service=marketing-test -v ON_ERROR_STOP=1 -f docs/sql/002-unified-code.sql
psql service=marketing-test -v ON_ERROR_STOP=1 -f docs/sql/003-report-catalog.sql
```

001包含57张核心表，002增加区域流水表和编码函数，因此总计58张表。数据字典03详细列出001，区域流水定义见002：region_code CHAR(2)主键、last_value BIGINT非负且不超过9999999999。编码分配在同区域UPDATE行锁下串行，不跨区域争用。表卡、编码分配和源实体映射须同事务提交；先查源映射，再分配新码。禁止向外返回尚未提交的编码；不承诺流水无空号。

`GENERATED BY DEFAULT AS IDENTITY`是SQL标准自增BIGINT，与用户指定的BIGSERIAL内部代理键目标一致，便于显式导入历史ID；导入后须校正序列到最大ID之后。对外统一码严格CHAR(16)，不参与内部JOIN。校验位用于输入错误检测，不是防伪或鉴权。

需要在真实库验证的项目：建扩展权限、hypertable API、PostGIS与GiST、排他约束、Luhn有效/无效例、同区域并发发码唯一性、流水耗尽异常、事务回滚、表卡唯一、重复批次幂等、核销并发余额、完整备份恢复。

业务规则仍需服务保证：组织无环与跨公司一致性、叶节点挂载、闭包维护、费用分项合计、核销不超支付/账单余额、跨表客户与公司一致性、状态迁移、发布版本完整性。不能只凭DDL存在即认为这些约束已生效。

普通应用账号不应拥有DDL、扩展管理和源事实表任意写权限。ODS写入、标准化写入、平台业务写入、只读分析、迁移和备份使用独立角色，按实际部署创建并验证；不在可分发脚本中硬编码账号密码。


## 001-baseline.sql

```sql
-- V4.2 NEW DATABASE BASELINE ONLY. Never apply over an existing production schema.
-- Review extension versions before execution; no connection or migration was performed by the generator.
BEGIN;
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE SCHEMA IF NOT EXISTS ods;
CREATE SCHEMA IF NOT EXISTS mdm;
CREATE SCHEMA IF NOT EXISTS dwd;
CREATE SCHEMA IF NOT EXISTS ts;
CREATE SCHEMA IF NOT EXISTS ads;

CREATE TABLE mdm.company (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  code varchar(16) NOT NULL UNIQUE,
  name varchar(128) NOT NULL,
  unified_prefix varchar(2) UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 0
);
COMMENT ON TABLE mdm.company IS '公司主体；编码与样例名称必须按正式清单初始化';
COMMENT ON COLUMN mdm.company.id IS '内部代理主键';
COMMENT ON COLUMN mdm.company.code IS '公司稳定编码';
COMMENT ON COLUMN mdm.company.name IS '公司名称';
COMMENT ON COLUMN mdm.company.unified_prefix IS '统一码公司段，未签认可空';
COMMENT ON COLUMN mdm.company.enabled IS '是否启用';
COMMENT ON COLUMN mdm.company.created_at IS '创建时间';
COMMENT ON COLUMN mdm.company.updated_at IS '更新时间（应用显式维护）';
COMMENT ON COLUMN mdm.company.version IS '乐观锁版本';

CREATE TABLE mdm.org (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  company_id bigint REFERENCES mdm.company(id),
  parent_id bigint REFERENCES mdm.org(id),
  code varchar(80) NOT NULL UNIQUE,
  name varchar(128) NOT NULL,
  org_type varchar(24) NOT NULL,
  child_label varchar(32),
  path text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  boundary geometry(MultiPolygon,4326),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 0,
  CHECK (parent_id IS NULL OR parent_id <> id),
  CHECK ((org_type='GROUP' AND company_id IS NULL) OR (org_type<>'GROUP' AND company_id IS NOT NULL))
);
COMMENT ON TABLE mdm.org IS '异构树节点；集团公司可空，非集团必须有所属公司';
COMMENT ON COLUMN mdm.org.id IS '内部代理主键';
COMMENT ON COLUMN mdm.org.company_id IS '所属公司';
COMMENT ON COLUMN mdm.org.parent_id IS '父节点；集团根为空';
COMMENT ON COLUMN mdm.org.code IS '全平台组织编码';
COMMENT ON COLUMN mdm.org.name IS '显示名称，允许跨父节点重名';
COMMENT ON COLUMN mdm.org.org_type IS 'GROUP/COMPANY/OFFICE/STATION/GRID/TEAM/LINE/BOOKLET/STAFF';
COMMENT ON COLUMN mdm.org.child_label IS '直属下级显示名称';
COMMENT ON COLUMN mdm.org.path IS '物化ID路径缓存；不是授权输入';
COMMENT ON COLUMN mdm.org.sort_order IS '同父节点排序';
COMMENT ON COLUMN mdm.org.boundary IS '正式服务边界；需确认来源坐标系';
COMMENT ON COLUMN mdm.org.enabled IS '停用不删除历史';
COMMENT ON COLUMN mdm.org.created_at IS '创建时间';
COMMENT ON COLUMN mdm.org.updated_at IS '更新时间（应用显式维护）';
COMMENT ON COLUMN mdm.org.version IS '乐观锁版本';

CREATE TABLE mdm.org_closure (
  ancestor_id bigint NOT NULL REFERENCES mdm.org(id),
  descendant_id bigint NOT NULL REFERENCES mdm.org(id),
  distance integer NOT NULL CHECK(distance>=0),
  PRIMARY KEY(ancestor_id,descendant_id)
);
COMMENT ON TABLE mdm.org_closure IS '组织传递闭包，事务内维护，自身distance为0';
COMMENT ON COLUMN mdm.org_closure.ancestor_id IS '祖先';
COMMENT ON COLUMN mdm.org_closure.descendant_id IS '后代';
COMMENT ON COLUMN mdm.org_closure.distance IS '路径距离';

CREATE TABLE mdm.billing_calendar (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES mdm.company(id),
  cycle_code varchar(32) NOT NULL,
  bill_period date NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  rule_version varchar(32) NOT NULL,
  UNIQUE(company_id,cycle_code,bill_period),
  CHECK(ends_on>starts_on),
  CHECK(extract(day FROM bill_period)=1),
  EXCLUDE USING gist(company_id WITH =,cycle_code WITH =,daterange(starts_on,ends_on,'[)') WITH &&)
);
COMMENT ON TABLE mdm.billing_calendar IS '按公司和抄表周期显式配置区间，开始含/结束不含';
COMMENT ON COLUMN mdm.billing_calendar.id IS '内部代理主键';
COMMENT ON COLUMN mdm.billing_calendar.company_id IS '公司';
COMMENT ON COLUMN mdm.billing_calendar.cycle_code IS '月抄/双月/线路周期标识';
COMMENT ON COLUMN mdm.billing_calendar.bill_period IS '账期月初';
COMMENT ON COLUMN mdm.billing_calendar.starts_on IS '区间开始';
COMMENT ON COLUMN mdm.billing_calendar.ends_on IS '区间结束（不含）';
COMMENT ON COLUMN mdm.billing_calendar.rule_version IS '规则版本';

CREATE TABLE ods.source (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES mdm.company(id),
  code varchar(32) NOT NULL,
  name varchar(128) NOT NULL,
  adapter varchar(64) NOT NULL,
  connection_meta jsonb NOT NULL DEFAULT '{}',
  secret_ref varchar(256),
  checkpoint jsonb NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 0,
  UNIQUE(company_id,code)
);
COMMENT ON TABLE ods.source IS '连接与适配配置，只存密钥引用';
COMMENT ON COLUMN ods.source.id IS '内部代理主键';
COMMENT ON COLUMN ods.source.company_id IS '公司';
COMMENT ON COLUMN ods.source.code IS '系统代码';
COMMENT ON COLUMN ods.source.name IS '来源名称';
COMMENT ON COLUMN ods.source.adapter IS '适配器类型';
COMMENT ON COLUMN ods.source.connection_meta IS '非敏感连接描述';
COMMENT ON COLUMN ods.source.secret_ref IS '密钥引用';
COMMENT ON COLUMN ods.source.checkpoint IS '已成功水位';
COMMENT ON COLUMN ods.source.enabled IS '默认不自动连接';
COMMENT ON COLUMN ods.source.created_at IS '创建时间';
COMMENT ON COLUMN ods.source.updated_at IS '更新时间（应用显式维护）';
COMMENT ON COLUMN ods.source.version IS '乐观锁版本';

CREATE TABLE ods.batch (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  source_id bigint NOT NULL REFERENCES ods.source(id),
  entity_type varchar(48) NOT NULL,
  batch_key varchar(128) NOT NULL,
  status varchar(24) NOT NULL,
  from_watermark jsonb,
  to_watermark jsonb,
  received_count bigint NOT NULL DEFAULT 0,
  accepted_count bigint NOT NULL DEFAULT 0,
  rejected_count bigint NOT NULL DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  error_summary text,
  UNIQUE(source_id,entity_type,batch_key)
);
COMMENT ON TABLE ods.batch IS '抽取批次与检查点';
COMMENT ON COLUMN ods.batch.id IS '内部代理主键';
COMMENT ON COLUMN ods.batch.source_id IS '来源';
COMMENT ON COLUMN ods.batch.entity_type IS '实体类型';
COMMENT ON COLUMN ods.batch.batch_key IS '幂等批次键';
COMMENT ON COLUMN ods.batch.status IS 'QUEUED/RUNNING/SUCCEEDED/FAILED/PARTIAL';
COMMENT ON COLUMN ods.batch.from_watermark IS '起始水位';
COMMENT ON COLUMN ods.batch.to_watermark IS '目标水位';
COMMENT ON COLUMN ods.batch.received_count IS '收到记录数';
COMMENT ON COLUMN ods.batch.accepted_count IS '入标准层数';
COMMENT ON COLUMN ods.batch.rejected_count IS '隔离数';
COMMENT ON COLUMN ods.batch.started_at IS '开始';
COMMENT ON COLUMN ods.batch.finished_at IS '结束';
COMMENT ON COLUMN ods.batch.error_summary IS '脱敏错误摘要';

CREATE TABLE ods.raw_record (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  batch_id bigint NOT NULL REFERENCES ods.batch(id),
  source_id bigint NOT NULL REFERENCES ods.source(id),
  entity_type varchar(48) NOT NULL,
  source_pk varchar(160) NOT NULL,
  source_version varchar(80) NOT NULL,
  payload jsonb NOT NULL,
  payload_hash varchar(64) NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  UNIQUE(source_id,entity_type,source_pk,source_version)
);
COMMENT ON TABLE ods.raw_record IS '原始报文；来源变更的可追溯版本';
COMMENT ON COLUMN ods.raw_record.id IS '内部代理主键';
COMMENT ON COLUMN ods.raw_record.batch_id IS '所属批次';
COMMENT ON COLUMN ods.raw_record.source_id IS '来源';
COMMENT ON COLUMN ods.raw_record.entity_type IS '实体类型';
COMMENT ON COLUMN ods.raw_record.source_pk IS '源主键';
COMMENT ON COLUMN ods.raw_record.source_version IS '源版本；无版本时适配器生成稳定hash';
COMMENT ON COLUMN ods.raw_record.payload IS '原始内容；访问受限';
COMMENT ON COLUMN ods.raw_record.payload_hash IS '内容SHA256';
COMMENT ON COLUMN ods.raw_record.received_at IS '收到时间';
COMMENT ON COLUMN ods.raw_record.is_deleted IS '源撤销标记';

CREATE TABLE ods.quality_issue (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  raw_record_id bigint REFERENCES ods.raw_record(id),
  batch_id bigint NOT NULL REFERENCES ods.batch(id),
  rule_code varchar(64) NOT NULL,
  field_name varchar(80),
  severity varchar(16) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'OPEN',
  message text NOT NULL,
  resolution text,
  resolved_by bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 0
);
COMMENT ON TABLE ods.quality_issue IS '质量隔离与复核';
COMMENT ON COLUMN ods.quality_issue.id IS '内部代理主键';
COMMENT ON COLUMN ods.quality_issue.raw_record_id IS '原始记录';
COMMENT ON COLUMN ods.quality_issue.batch_id IS '批次';
COMMENT ON COLUMN ods.quality_issue.rule_code IS '质量规则';
COMMENT ON COLUMN ods.quality_issue.field_name IS '字段';
COMMENT ON COLUMN ods.quality_issue.severity IS 'ERROR/WARN';
COMMENT ON COLUMN ods.quality_issue.status IS 'OPEN/RESOLVED/IGNORED';
COMMENT ON COLUMN ods.quality_issue.message IS '问题说明';
COMMENT ON COLUMN ods.quality_issue.resolution IS '复核说明';
COMMENT ON COLUMN ods.quality_issue.resolved_by IS '操作账号，FK后置';
COMMENT ON COLUMN ods.quality_issue.created_at IS '创建时间';
COMMENT ON COLUMN ods.quality_issue.updated_at IS '更新时间（应用显式维护）';
COMMENT ON COLUMN ods.quality_issue.version IS '乐观锁版本';

CREATE TABLE mdm.dictionary_mapping (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  source_id bigint NOT NULL REFERENCES ods.source(id),
  dict_type varchar(48) NOT NULL,
  source_code varchar(128) NOT NULL,
  standard_code varchar(64) NOT NULL,
  standard_name varchar(128) NOT NULL,
  target_field varchar(64),
  valid_from date NOT NULL,
  valid_to date,
  UNIQUE(source_id,dict_type,source_code,valid_from),
  CHECK(valid_to IS NULL OR valid_to>valid_from),
  EXCLUDE USING gist(source_id WITH =,dict_type WITH =,source_code WITH =,daterange(valid_from,valid_to,'[)') WITH &&)
);
COMMENT ON TABLE mdm.dictionary_mapping IS '源字典映射，保留有效版本';
COMMENT ON COLUMN mdm.dictionary_mapping.id IS '内部代理主键';
COMMENT ON COLUMN mdm.dictionary_mapping.source_id IS '来源（包含公司）';
COMMENT ON COLUMN mdm.dictionary_mapping.dict_type IS '字典类型';
COMMENT ON COLUMN mdm.dictionary_mapping.source_code IS '源代码';
COMMENT ON COLUMN mdm.dictionary_mapping.standard_code IS '标准代码';
COMMENT ON COLUMN mdm.dictionary_mapping.standard_name IS '标准名称';
COMMENT ON COLUMN mdm.dictionary_mapping.target_field IS '固定费用列白名单，禁止任意SQL标识符';
COMMENT ON COLUMN mdm.dictionary_mapping.valid_from IS '生效开始';
COMMENT ON COLUMN mdm.dictionary_mapping.valid_to IS '结束不含';

CREATE TABLE mdm.entity_mapping (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  source_id bigint NOT NULL REFERENCES ods.source(id),
  entity_type varchar(32) NOT NULL,
  source_pk varchar(160) NOT NULL,
  target_id bigint NOT NULL,
  unified_code varchar(32),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_id,entity_type,source_pk)
);
COMMENT ON TABLE mdm.entity_mapping IS '统一实体映射；实体类型与来源进入唯一键';
COMMENT ON COLUMN mdm.entity_mapping.id IS '内部代理主键';
COMMENT ON COLUMN mdm.entity_mapping.source_id IS '来源';
COMMENT ON COLUMN mdm.entity_mapping.entity_type IS 'CUSTOMER/ACCOUNT/METER/PROJECT';
COMMENT ON COLUMN mdm.entity_mapping.source_pk IS '源业务主键';
COMMENT ON COLUMN mdm.entity_mapping.target_id IS '目标实体ID，服务按entity_type校验';
COMMENT ON COLUMN mdm.entity_mapping.unified_code IS '仅有统一码的实体填写';
COMMENT ON COLUMN mdm.entity_mapping.created_at IS '映射建立时间';

CREATE TABLE mdm.app_user (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  username varchar(80) NOT NULL UNIQUE,
  display_name varchar(80) NOT NULL,
  password_hash varchar(255),
  external_subject varchar(200) UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  scope_version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 0
);
COMMENT ON TABLE mdm.app_user IS '认证账号；与业务客户严格分离';
COMMENT ON COLUMN mdm.app_user.id IS '内部代理主键';
COMMENT ON COLUMN mdm.app_user.username IS '登录账号';
COMMENT ON COLUMN mdm.app_user.display_name IS '显示名';
COMMENT ON COLUMN mdm.app_user.password_hash IS 'SSO可空；不存明文';
COMMENT ON COLUMN mdm.app_user.external_subject IS 'SSO主体';
COMMENT ON COLUMN mdm.app_user.enabled IS '状态';
COMMENT ON COLUMN mdm.app_user.scope_version IS '权限缓存版本';
COMMENT ON COLUMN mdm.app_user.created_at IS '创建时间';
COMMENT ON COLUMN mdm.app_user.updated_at IS '更新时间（应用显式维护）';
COMMENT ON COLUMN mdm.app_user.version IS '乐观锁版本';

CREATE TABLE mdm.role (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  code varchar(64) NOT NULL UNIQUE,
  name varchar(80) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 0
);
COMMENT ON TABLE mdm.role IS '角色定义';
COMMENT ON COLUMN mdm.role.id IS '内部代理主键';
COMMENT ON COLUMN mdm.role.code IS '角色码';
COMMENT ON COLUMN mdm.role.name IS '名称';
COMMENT ON COLUMN mdm.role.created_at IS '创建时间';
COMMENT ON COLUMN mdm.role.updated_at IS '更新时间（应用显式维护）';
COMMENT ON COLUMN mdm.role.version IS '乐观锁版本';

CREATE TABLE mdm.user_role (
  user_id bigint NOT NULL REFERENCES mdm.app_user(id),
  role_id bigint NOT NULL REFERENCES mdm.role(id),
  PRIMARY KEY(user_id,role_id)
);
COMMENT ON TABLE mdm.user_role IS '账号角色关联';
COMMENT ON COLUMN mdm.user_role.user_id IS '账号';
COMMENT ON COLUMN mdm.user_role.role_id IS '角色';

CREATE TABLE mdm.role_permission (
  role_id bigint NOT NULL REFERENCES mdm.role(id),
  permission varchar(100) NOT NULL,
  PRIMARY KEY(role_id,permission)
);
COMMENT ON TABLE mdm.role_permission IS '动作权限白名单';
COMMENT ON COLUMN mdm.role_permission.role_id IS '角色';
COMMENT ON COLUMN mdm.role_permission.permission IS '模块:动作';

CREATE TABLE mdm.user_scope (
  user_id bigint NOT NULL REFERENCES mdm.app_user(id),
  org_id bigint NOT NULL REFERENCES mdm.org(id),
  include_descendants boolean NOT NULL DEFAULT true,
  PRIMARY KEY(user_id,org_id)
);
COMMENT ON TABLE mdm.user_scope IS '数据范围根，可多个，查询取并集再与请求交集';
COMMENT ON COLUMN mdm.user_scope.user_id IS '账号';
COMMENT ON COLUMN mdm.user_scope.org_id IS '授权根';
COMMENT ON COLUMN mdm.user_scope.include_descendants IS '是否含下级';

CREATE TABLE mdm.config (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  config_key varchar(100) NOT NULL,
  value jsonb NOT NULL,
  effective_from timestamptz NOT NULL,
  changed_by bigint NOT NULL REFERENCES mdm.app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 0,
  UNIQUE(config_key,effective_from)
);
COMMENT ON TABLE mdm.config IS '版本化平台配置';
COMMENT ON COLUMN mdm.config.id IS '内部代理主键';
COMMENT ON COLUMN mdm.config.config_key IS '配置码';
COMMENT ON COLUMN mdm.config.value IS '类型由配置定义校验';
COMMENT ON COLUMN mdm.config.effective_from IS '生效时间';
COMMENT ON COLUMN mdm.config.changed_by IS '修改者';
COMMENT ON COLUMN mdm.config.created_at IS '创建时间';
COMMENT ON COLUMN mdm.config.updated_at IS '更新时间（应用显式维护）';
COMMENT ON COLUMN mdm.config.version IS '乐观锁版本';

CREATE TABLE mdm.audit_event (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  actor_id bigint REFERENCES mdm.app_user(id),
  action varchar(80) NOT NULL,
  entity_type varchar(64) NOT NULL,
  entity_id varchar(100),
  request_id varchar(100),
  before_value jsonb,
  after_value jsonb,
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE mdm.audit_event IS '追加式审计，不提供普通UPDATE/DELETE权限';
COMMENT ON COLUMN mdm.audit_event.id IS '内部代理主键';
COMMENT ON COLUMN mdm.audit_event.actor_id IS '操作者；系统任务可空';
COMMENT ON COLUMN mdm.audit_event.action IS '动作';
COMMENT ON COLUMN mdm.audit_event.entity_type IS '对象类型';
COMMENT ON COLUMN mdm.audit_event.entity_id IS '对象ID';
COMMENT ON COLUMN mdm.audit_event.request_id IS '请求关联';
COMMENT ON COLUMN mdm.audit_event.before_value IS '脱敏前值';
COMMENT ON COLUMN mdm.audit_event.after_value IS '脱敏后值';
COMMENT ON COLUMN mdm.audit_event.reason IS '操作原因';
COMMENT ON COLUMN mdm.audit_event.occurred_at IS '时间';

CREATE TABLE dwd.customer (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES mdm.company(id),
  name varchar(200) NOT NULL,
  customer_type varchar(24) NOT NULL,
  phone_cipher text,
  identity_digest varchar(128),
  ext_attrs jsonb NOT NULL DEFAULT '{}',
  source_id bigint REFERENCES ods.source(id),
  source_pk varchar(160),
  source_version varchar(80),
  imported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 0
);
COMMENT ON TABLE dwd.customer IS '客户主体：个人或企业，可关联多个计费表卡';
COMMENT ON COLUMN dwd.customer.id IS '内部代理主键';
COMMENT ON COLUMN dwd.customer.company_id IS '所属公司';
COMMENT ON COLUMN dwd.customer.name IS '名称，查询按权限脱敏';
COMMENT ON COLUMN dwd.customer.customer_type IS 'PERSON/ENTERPRISE/OTHER';
COMMENT ON COLUMN dwd.customer.phone_cipher IS '电话密文';
COMMENT ON COLUMN dwd.customer.identity_digest IS '身份去重摘要；不能凭姓名合并';
COMMENT ON COLUMN dwd.customer.ext_attrs IS '扩展属性';
COMMENT ON COLUMN dwd.customer.source_id IS '来源系统；平台数据可空';
COMMENT ON COLUMN dwd.customer.source_pk IS '源主键';
COMMENT ON COLUMN dwd.customer.source_version IS '源版本/更新时间序列';
COMMENT ON COLUMN dwd.customer.imported_at IS '入仓时间';
COMMENT ON COLUMN dwd.customer.created_at IS '创建时间';
COMMENT ON COLUMN dwd.customer.updated_at IS '更新时间（应用显式维护）';
COMMENT ON COLUMN dwd.customer.version IS '乐观锁版本';

CREATE TABLE dwd.account (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES mdm.company(id),
  customer_id bigint NOT NULL REFERENCES dwd.customer(id),
  unified_code char(16) NOT NULL UNIQUE,
  source_card_no varchar(100),
  source_customer_no varchar(100),
  current_org_id bigint NOT NULL REFERENCES mdm.org(id),
  water_nature varchar(32) NOT NULL,
  industry varchar(64),
  community varchar(160),
  admin_code varchar(16),
  address text,
  location geometry(Point,4326),
  registered_on date NOT NULL,
  cancelled_on date,
  status varchar(24) NOT NULL,
  ext_attrs jsonb NOT NULL DEFAULT '{}',
  source_id bigint REFERENCES ods.source(id),
  source_pk varchar(160),
  source_version varchar(80),
  imported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 0,
  CHECK(cancelled_on IS NULL OR cancelled_on>=registered_on)
);
COMMENT ON TABLE dwd.account IS '统一计费表卡；原型users对应此表';
COMMENT ON COLUMN dwd.account.id IS '内部代理主键';
COMMENT ON COLUMN dwd.account.company_id IS '公司';
COMMENT ON COLUMN dwd.account.customer_id IS '客户主体';
COMMENT ON COLUMN dwd.account.unified_code IS 'ZZU+2位区域码+10位区域流水+1位Luhn；用户已确认';
COMMENT ON COLUMN dwd.account.source_card_no IS '源表卡号';
COMMENT ON COLUMN dwd.account.source_customer_no IS '源客户号';
COMMENT ON COLUMN dwd.account.current_org_id IS '当前末级归属';
COMMENT ON COLUMN dwd.account.water_nature IS '用水性质';
COMMENT ON COLUMN dwd.account.industry IS '行业';
COMMENT ON COLUMN dwd.account.community IS '小区';
COMMENT ON COLUMN dwd.account.admin_code IS '行政区';
COMMENT ON COLUMN dwd.account.address IS '地址';
COMMENT ON COLUMN dwd.account.location IS '坐标；来源CRS须转换';
COMMENT ON COLUMN dwd.account.registered_on IS '注册日期';
COMMENT ON COLUMN dwd.account.cancelled_on IS '注销日期';
COMMENT ON COLUMN dwd.account.status IS 'ACTIVE/CANCELLED/SUSPENDED';
COMMENT ON COLUMN dwd.account.ext_attrs IS '扩展属性';
COMMENT ON COLUMN dwd.account.source_id IS '来源系统；平台数据可空';
COMMENT ON COLUMN dwd.account.source_pk IS '源主键';
COMMENT ON COLUMN dwd.account.source_version IS '源版本/更新时间序列';
COMMENT ON COLUMN dwd.account.imported_at IS '入仓时间';
COMMENT ON COLUMN dwd.account.created_at IS '创建时间';
COMMENT ON COLUMN dwd.account.updated_at IS '更新时间（应用显式维护）';
COMMENT ON COLUMN dwd.account.version IS '乐观锁版本';

CREATE TABLE dwd.account_org_history (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES dwd.account(id),
  org_id bigint NOT NULL REFERENCES mdm.org(id),
  valid_from date NOT NULL,
  valid_to date,
  CHECK(valid_to IS NULL OR valid_to>valid_from),
  EXCLUDE USING gist(account_id WITH =,daterange(valid_from,valid_to,'[)') WITH &&)
);
COMMENT ON TABLE dwd.account_org_history IS '发生时组织归属；同表卡时间不得重叠';
COMMENT ON COLUMN dwd.account_org_history.id IS '内部代理主键';
COMMENT ON COLUMN dwd.account_org_history.account_id IS '表卡';
COMMENT ON COLUMN dwd.account_org_history.org_id IS '末级节点';
COMMENT ON COLUMN dwd.account_org_history.valid_from IS '开始含';
COMMENT ON COLUMN dwd.account_org_history.valid_to IS '结束不含，空表示当前';

CREATE TABLE mdm.warehouse (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES mdm.company(id),
  org_id bigint NOT NULL REFERENCES mdm.org(id),
  code varchar(80) NOT NULL,
  name varchar(128) NOT NULL,
  UNIQUE(company_id,code)
);
COMMENT ON TABLE mdm.warehouse IS '仓库';
COMMENT ON COLUMN mdm.warehouse.id IS '内部代理主键';
COMMENT ON COLUMN mdm.warehouse.company_id IS '公司';
COMMENT ON COLUMN mdm.warehouse.org_id IS '归属节点';
COMMENT ON COLUMN mdm.warehouse.code IS '仓库码';
COMMENT ON COLUMN mdm.warehouse.name IS '名称';

CREATE TABLE dwd.meter (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES mdm.company(id),
  meter_no varchar(100) NOT NULL,
  meter_type varchar(32) NOT NULL,
  caliber_mm integer CHECK(caliber_mm>0),
  manufacturer varchar(128),
  model varchar(80),
  barcode varchar(100),
  status varchar(32) NOT NULL,
  warehouse_id bigint REFERENCES mdm.warehouse(id),
  ext_attrs jsonb NOT NULL DEFAULT '{}',
  source_id bigint REFERENCES ods.source(id),
  source_pk varchar(160),
  source_version varchar(80),
  imported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 0,
  UNIQUE(company_id,meter_no)
);
COMMENT ON TABLE dwd.meter IS '水表资产';
COMMENT ON COLUMN dwd.meter.id IS '内部代理主键';
COMMENT ON COLUMN dwd.meter.company_id IS '公司';
COMMENT ON COLUMN dwd.meter.meter_no IS '资产表号';
COMMENT ON COLUMN dwd.meter.meter_type IS '类型';
COMMENT ON COLUMN dwd.meter.caliber_mm IS '口径mm';
COMMENT ON COLUMN dwd.meter.manufacturer IS '厂家';
COMMENT ON COLUMN dwd.meter.model IS '型号';
COMMENT ON COLUMN dwd.meter.barcode IS '条码';
COMMENT ON COLUMN dwd.meter.status IS '在用/在库/周转/待检/报废';
COMMENT ON COLUMN dwd.meter.warehouse_id IS '当前仓库';
COMMENT ON COLUMN dwd.meter.ext_attrs IS '低频属性';
COMMENT ON COLUMN dwd.meter.source_id IS '来源系统；平台数据可空';
COMMENT ON COLUMN dwd.meter.source_pk IS '源主键';
COMMENT ON COLUMN dwd.meter.source_version IS '源版本/更新时间序列';
COMMENT ON COLUMN dwd.meter.imported_at IS '入仓时间';
COMMENT ON COLUMN dwd.meter.created_at IS '创建时间';
COMMENT ON COLUMN dwd.meter.updated_at IS '更新时间（应用显式维护）';
COMMENT ON COLUMN dwd.meter.version IS '乐观锁版本';

CREATE TABLE dwd.meter_installation (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES dwd.account(id),
  meter_id bigint NOT NULL REFERENCES dwd.meter(id),
  installed_at timestamptz NOT NULL,
  removed_at timestamptz,
  initial_reading numeric(20,4),
  final_reading numeric(20,4),
  CHECK(removed_at IS NULL OR removed_at>installed_at),
  EXCLUDE USING gist(meter_id WITH =,tstzrange(installed_at,removed_at,'[)') WITH &&)
);
COMMENT ON TABLE dwd.meter_installation IS '户表绑定有效期';
COMMENT ON COLUMN dwd.meter_installation.id IS '内部代理主键';
COMMENT ON COLUMN dwd.meter_installation.account_id IS '表卡';
COMMENT ON COLUMN dwd.meter_installation.meter_id IS '水表';
COMMENT ON COLUMN dwd.meter_installation.installed_at IS '安装时间';
COMMENT ON COLUMN dwd.meter_installation.removed_at IS '拆除时间';
COMMENT ON COLUMN dwd.meter_installation.initial_reading IS '起始指数';
COMMENT ON COLUMN dwd.meter_installation.final_reading IS '拆表指数';

CREATE TABLE dwd.meter_swap (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES dwd.account(id),
  old_meter_id bigint REFERENCES dwd.meter(id),
  new_meter_id bigint NOT NULL REFERENCES dwd.meter(id),
  occurred_at timestamptz NOT NULL,
  reason varchar(100) NOT NULL,
  old_stop numeric(20,4),
  new_start numeric(20,4),
  source_id bigint REFERENCES ods.source(id),
  source_pk varchar(160),
  source_version varchar(80),
  imported_at timestamptz,
  CHECK(old_meter_id IS NULL OR old_meter_id<>new_meter_id)
);
COMMENT ON TABLE dwd.meter_swap IS '换表记录';
COMMENT ON COLUMN dwd.meter_swap.id IS '内部代理主键';
COMMENT ON COLUMN dwd.meter_swap.account_id IS '表卡';
COMMENT ON COLUMN dwd.meter_swap.old_meter_id IS '原表';
COMMENT ON COLUMN dwd.meter_swap.new_meter_id IS '新表';
COMMENT ON COLUMN dwd.meter_swap.occurred_at IS '换表时间';
COMMENT ON COLUMN dwd.meter_swap.reason IS '周检/故障等';
COMMENT ON COLUMN dwd.meter_swap.old_stop IS '拆表止码';
COMMENT ON COLUMN dwd.meter_swap.new_start IS '新表起码';
COMMENT ON COLUMN dwd.meter_swap.source_id IS '来源系统；平台数据可空';
COMMENT ON COLUMN dwd.meter_swap.source_pk IS '源主键';
COMMENT ON COLUMN dwd.meter_swap.source_version IS '源版本/更新时间序列';
COMMENT ON COLUMN dwd.meter_swap.imported_at IS '入仓时间';

CREATE TABLE dwd.inventory_event (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  warehouse_id bigint NOT NULL REFERENCES mdm.warehouse(id),
  meter_id bigint NOT NULL REFERENCES dwd.meter(id),
  direction smallint NOT NULL CHECK(direction IN(-1,1)),
  event_type varchar(32) NOT NULL,
  occurred_at timestamptz NOT NULL,
  source_id bigint REFERENCES ods.source(id),
  source_pk varchar(160),
  source_version varchar(80),
  imported_at timestamptz
);
COMMENT ON TABLE dwd.inventory_event IS '库存流水；不能仅靠当前库存推算历史';
COMMENT ON COLUMN dwd.inventory_event.id IS '内部代理主键';
COMMENT ON COLUMN dwd.inventory_event.warehouse_id IS '仓库';
COMMENT ON COLUMN dwd.inventory_event.meter_id IS '资产';
COMMENT ON COLUMN dwd.inventory_event.direction IS '入库1出库-1';
COMMENT ON COLUMN dwd.inventory_event.event_type IS '新装/周转/检定等';
COMMENT ON COLUMN dwd.inventory_event.occurred_at IS '时间';
COMMENT ON COLUMN dwd.inventory_event.source_id IS '来源系统；平台数据可空';
COMMENT ON COLUMN dwd.inventory_event.source_pk IS '源主键';
COMMENT ON COLUMN dwd.inventory_event.source_version IS '源版本/更新时间序列';
COMMENT ON COLUMN dwd.inventory_event.imported_at IS '入仓时间';

CREATE TABLE dwd.read_task (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES dwd.account(id),
  meter_id bigint REFERENCES dwd.meter(id),
  org_id bigint NOT NULL REFERENCES mdm.org(id),
  bill_period date NOT NULL,
  cycle_code varchar(32) NOT NULL,
  scheduled_on date NOT NULL,
  status varchar(24) NOT NULL,
  is_estimated boolean,
  arrival_status varchar(16) NOT NULL DEFAULT 'UNKNOWN',
  photo_status varchar(16) NOT NULL DEFAULT 'UNKNOWN',
  remote_billed boolean,
  photo_ref varchar(300),
  read_location geometry(Point,4326),
  source_id bigint REFERENCES ods.source(id),
  source_pk varchar(160),
  source_version varchar(80),
  imported_at timestamptz,
  UNIQUE(account_id,bill_period,cycle_code)
);
COMMENT ON TABLE dwd.read_task IS '应抄基线；无读数也必须有任务';
COMMENT ON COLUMN dwd.read_task.id IS '内部代理主键';
COMMENT ON COLUMN dwd.read_task.account_id IS '表卡';
COMMENT ON COLUMN dwd.read_task.meter_id IS '任务表具';
COMMENT ON COLUMN dwd.read_task.org_id IS '发生时组织';
COMMENT ON COLUMN dwd.read_task.bill_period IS '账期';
COMMENT ON COLUMN dwd.read_task.cycle_code IS '周期';
COMMENT ON COLUMN dwd.read_task.scheduled_on IS '应抄日';
COMMENT ON COLUMN dwd.read_task.status IS 'PENDING/READ/MISSED/CANCELLED';
COMMENT ON COLUMN dwd.read_task.is_estimated IS '是否估抄；未知可空';
COMMENT ON COLUMN dwd.read_task.arrival_status IS 'PASS/FAIL/UNKNOWN';
COMMENT ON COLUMN dwd.read_task.photo_status IS '照片合规';
COMMENT ON COLUMN dwd.read_task.remote_billed IS '远传是否开账；未知可空';
COMMENT ON COLUMN dwd.read_task.photo_ref IS '受鉴权附件对象键';
COMMENT ON COLUMN dwd.read_task.read_location IS '实际定位';
COMMENT ON COLUMN dwd.read_task.source_id IS '来源系统；平台数据可空';
COMMENT ON COLUMN dwd.read_task.source_pk IS '源主键';
COMMENT ON COLUMN dwd.read_task.source_version IS '源版本/更新时间序列';
COMMENT ON COLUMN dwd.read_task.imported_at IS '入仓时间';

CREATE TABLE dwd.reading (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  task_id bigint REFERENCES dwd.read_task(id),
  account_id bigint NOT NULL REFERENCES dwd.account(id),
  meter_id bigint NOT NULL REFERENCES dwd.meter(id),
  org_id bigint NOT NULL REFERENCES mdm.org(id),
  observed_at timestamptz NOT NULL,
  bill_period date NOT NULL,
  natural_month date NOT NULL,
  previous_value numeric(20,4),
  current_value numeric(20,4),
  read_volume numeric(20,4),
  billed_volume numeric(20,4),
  quality varchar(24) NOT NULL,
  source_id bigint REFERENCES ods.source(id),
  source_pk varchar(160),
  source_version varchar(80),
  imported_at timestamptz
);
COMMENT ON TABLE dwd.reading IS '有效读数；保留源版本与自然发生日';
COMMENT ON COLUMN dwd.reading.id IS '内部代理主键';
COMMENT ON COLUMN dwd.reading.task_id IS '关联应抄任务';
COMMENT ON COLUMN dwd.reading.account_id IS '表卡';
COMMENT ON COLUMN dwd.reading.meter_id IS '表具';
COMMENT ON COLUMN dwd.reading.org_id IS '历史组织';
COMMENT ON COLUMN dwd.reading.observed_at IS '抄表时刻';
COMMENT ON COLUMN dwd.reading.bill_period IS '业务账期';
COMMENT ON COLUMN dwd.reading.natural_month IS '按Asia/Shanghai生成的月初';
COMMENT ON COLUMN dwd.reading.previous_value IS '上期指数';
COMMENT ON COLUMN dwd.reading.current_value IS '本期指数';
COMMENT ON COLUMN dwd.reading.read_volume IS '经翻转/换表校验的读数水量';
COMMENT ON COLUMN dwd.reading.billed_volume IS '实际开账水量，不强制等于指数差';
COMMENT ON COLUMN dwd.reading.quality IS 'VALID/ESTIMATED/INVALID/UNKNOWN';
COMMENT ON COLUMN dwd.reading.source_id IS '来源系统；平台数据可空';
COMMENT ON COLUMN dwd.reading.source_pk IS '源主键';
COMMENT ON COLUMN dwd.reading.source_version IS '源版本/更新时间序列';
COMMENT ON COLUMN dwd.reading.imported_at IS '入仓时间';

CREATE TABLE dwd.bill (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES dwd.account(id),
  org_id bigint NOT NULL REFERENCES mdm.org(id),
  bill_period date NOT NULL,
  natural_month date NOT NULL,
  issued_on date NOT NULL,
  due_on date,
  billed_volume numeric(20,4),
  water_fee numeric(20,2) NOT NULL DEFAULT 0,
  sewage_fee numeric(20,2) NOT NULL DEFAULT 0,
  resource_fee numeric(20,2) NOT NULL DEFAULT 0,
  garbage_fee numeric(20,2) NOT NULL DEFAULT 0,
  other_fee numeric(20,2) NOT NULL DEFAULT 0,
  principal_amount numeric(20,2) NOT NULL,
  late_fee numeric(20,2) NOT NULL DEFAULT 0,
  status varchar(24) NOT NULL,
  source_id bigint REFERENCES ods.source(id),
  source_pk varchar(160),
  source_version varchar(80),
  imported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 0,
  CHECK(principal_amount=water_fee+sewage_fee+resource_fee+garbage_fee+other_fee)
);
COMMENT ON TABLE dwd.bill IS '应收账单本金与费用分项';
COMMENT ON COLUMN dwd.bill.id IS '内部代理主键';
COMMENT ON COLUMN dwd.bill.account_id IS '表卡';
COMMENT ON COLUMN dwd.bill.org_id IS '发生时组织';
COMMENT ON COLUMN dwd.bill.bill_period IS '业务账期';
COMMENT ON COLUMN dwd.bill.natural_month IS '自然月';
COMMENT ON COLUMN dwd.bill.issued_on IS '开账日期';
COMMENT ON COLUMN dwd.bill.due_on IS '应缴期限';
COMMENT ON COLUMN dwd.bill.billed_volume IS '开账量';
COMMENT ON COLUMN dwd.bill.water_fee IS '水费';
COMMENT ON COLUMN dwd.bill.sewage_fee IS '污水处理费';
COMMENT ON COLUMN dwd.bill.resource_fee IS '水资源费税';
COMMENT ON COLUMN dwd.bill.garbage_fee IS '垃圾处理费';
COMMENT ON COLUMN dwd.bill.other_fee IS '其他费用分项合计';
COMMENT ON COLUMN dwd.bill.principal_amount IS '本金应收';
COMMENT ON COLUMN dwd.bill.late_fee IS '违约金独立';
COMMENT ON COLUMN dwd.bill.status IS 'OPEN/SETTLED/VOID';
COMMENT ON COLUMN dwd.bill.source_id IS '来源系统；平台数据可空';
COMMENT ON COLUMN dwd.bill.source_pk IS '源主键';
COMMENT ON COLUMN dwd.bill.source_version IS '源版本/更新时间序列';
COMMENT ON COLUMN dwd.bill.imported_at IS '入仓时间';
COMMENT ON COLUMN dwd.bill.created_at IS '创建时间';
COMMENT ON COLUMN dwd.bill.updated_at IS '更新时间（应用显式维护）';
COMMENT ON COLUMN dwd.bill.version IS '乐观锁版本';

CREATE TABLE dwd.bill_fee_item (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  bill_id bigint NOT NULL REFERENCES dwd.bill(id),
  fee_code varchar(64) NOT NULL,
  source_fee_code varchar(100),
  amount numeric(20,2) NOT NULL,
  UNIQUE(bill_id,fee_code)
);
COMMENT ON TABLE dwd.bill_fee_item IS '长尾费用规范化分项';
COMMENT ON COLUMN dwd.bill_fee_item.id IS '内部代理主键';
COMMENT ON COLUMN dwd.bill_fee_item.bill_id IS '账单';
COMMENT ON COLUMN dwd.bill_fee_item.fee_code IS '标准费用码';
COMMENT ON COLUMN dwd.bill_fee_item.source_fee_code IS '源费用码';
COMMENT ON COLUMN dwd.bill_fee_item.amount IS '金额，可含冲减';

CREATE TABLE dwd.payment (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES dwd.account(id),
  org_id bigint NOT NULL REFERENCES mdm.org(id),
  paid_at timestamptz NOT NULL,
  natural_month date NOT NULL,
  amount numeric(20,2) NOT NULL,
  channel varchar(64),
  reversal_of bigint REFERENCES dwd.payment(id),
  source_id bigint REFERENCES ods.source(id),
  source_pk varchar(160),
  source_version varchar(80),
  imported_at timestamptz
);
COMMENT ON TABLE dwd.payment IS '收款事件，与核销分离；负数为冲正';
COMMENT ON COLUMN dwd.payment.id IS '内部代理主键';
COMMENT ON COLUMN dwd.payment.account_id IS '表卡';
COMMENT ON COLUMN dwd.payment.org_id IS '收款发生组织';
COMMENT ON COLUMN dwd.payment.paid_at IS '收款时刻';
COMMENT ON COLUMN dwd.payment.natural_month IS '收款自然月';
COMMENT ON COLUMN dwd.payment.amount IS '净收款事件金额';
COMMENT ON COLUMN dwd.payment.channel IS '渠道';
COMMENT ON COLUMN dwd.payment.reversal_of IS '被冲正事件';
COMMENT ON COLUMN dwd.payment.source_id IS '来源系统；平台数据可空';
COMMENT ON COLUMN dwd.payment.source_pk IS '源主键';
COMMENT ON COLUMN dwd.payment.source_version IS '源版本/更新时间序列';
COMMENT ON COLUMN dwd.payment.imported_at IS '入仓时间';

CREATE TABLE dwd.payment_allocation (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  payment_id bigint NOT NULL REFERENCES dwd.payment(id),
  bill_id bigint NOT NULL REFERENCES dwd.bill(id),
  allocated_at timestamptz NOT NULL,
  principal_amount numeric(20,2) NOT NULL,
  late_fee_amount numeric(20,2) NOT NULL DEFAULT 0,
  reversal_of bigint REFERENCES dwd.payment_allocation(id),
  source_id bigint REFERENCES ods.source(id),
  source_pk varchar(160),
  source_version varchar(80),
  imported_at timestamptz
);
COMMENT ON TABLE dwd.payment_allocation IS '多对多核销；余额约束必须事务锁定后校验';
COMMENT ON COLUMN dwd.payment_allocation.id IS '内部代理主键';
COMMENT ON COLUMN dwd.payment_allocation.payment_id IS '收款';
COMMENT ON COLUMN dwd.payment_allocation.bill_id IS '被核销账单';
COMMENT ON COLUMN dwd.payment_allocation.allocated_at IS '核销时刻';
COMMENT ON COLUMN dwd.payment_allocation.principal_amount IS '本金核销，可负冲正';
COMMENT ON COLUMN dwd.payment_allocation.late_fee_amount IS '违约金核销';
COMMENT ON COLUMN dwd.payment_allocation.reversal_of IS '被撤销核销';
COMMENT ON COLUMN dwd.payment_allocation.source_id IS '来源系统；平台数据可空';
COMMENT ON COLUMN dwd.payment_allocation.source_pk IS '源主键';
COMMENT ON COLUMN dwd.payment_allocation.source_version IS '源版本/更新时间序列';
COMMENT ON COLUMN dwd.payment_allocation.imported_at IS '入仓时间';

CREATE TABLE dwd.bill_adjustment (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES dwd.account(id),
  bill_id bigint REFERENCES dwd.bill(id),
  org_id bigint NOT NULL REFERENCES mdm.org(id),
  kind varchar(32) NOT NULL,
  amount numeric(20,2) NOT NULL,
  occurred_at timestamptz NOT NULL,
  bill_period date,
  status varchar(24) NOT NULL,
  reason text NOT NULL,
  source_id bigint REFERENCES ods.source(id),
  source_pk varchar(160),
  source_version varchar(80),
  imported_at timestamptz
);
COMMENT ON TABLE dwd.bill_adjustment IS '调整减免/退款/特殊账事件，不覆盖原账单';
COMMENT ON COLUMN dwd.bill_adjustment.id IS '内部代理主键';
COMMENT ON COLUMN dwd.bill_adjustment.account_id IS '表卡';
COMMENT ON COLUMN dwd.bill_adjustment.bill_id IS '可关联账单';
COMMENT ON COLUMN dwd.bill_adjustment.org_id IS '组织';
COMMENT ON COLUMN dwd.bill_adjustment.kind IS 'ADJUST/REFUND/SPECIAL/PENDING';
COMMENT ON COLUMN dwd.bill_adjustment.amount IS '带符号金额';
COMMENT ON COLUMN dwd.bill_adjustment.occurred_at IS '发生时间';
COMMENT ON COLUMN dwd.bill_adjustment.bill_period IS '归属账期';
COMMENT ON COLUMN dwd.bill_adjustment.status IS 'PENDING/APPROVED/REJECTED/REVERSED';
COMMENT ON COLUMN dwd.bill_adjustment.reason IS '原因';
COMMENT ON COLUMN dwd.bill_adjustment.source_id IS '来源系统；平台数据可空';
COMMENT ON COLUMN dwd.bill_adjustment.source_pk IS '源主键';
COMMENT ON COLUMN dwd.bill_adjustment.source_version IS '源版本/更新时间序列';
COMMENT ON COLUMN dwd.bill_adjustment.imported_at IS '入仓时间';

CREATE TABLE dwd.project (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  org_id bigint NOT NULL REFERENCES mdm.org(id),
  account_id bigint REFERENCES dwd.account(id),
  project_no varchar(100) NOT NULL,
  name varchar(200) NOT NULL,
  status varchar(32) NOT NULL,
  started_on date,
  completed_on date,
  meter_installed_on date,
  meter_id bigint REFERENCES dwd.meter(id),
  source_id bigint REFERENCES ods.source(id),
  source_pk varchar(160),
  source_version varchar(80),
  imported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 0
);
COMMENT ON TABLE dwd.project IS '报装工程台账';
COMMENT ON COLUMN dwd.project.id IS '内部代理主键';
COMMENT ON COLUMN dwd.project.org_id IS '归属节点';
COMMENT ON COLUMN dwd.project.account_id IS '未立户时为空';
COMMENT ON COLUMN dwd.project.project_no IS '工程号';
COMMENT ON COLUMN dwd.project.name IS '项目名称';
COMMENT ON COLUMN dwd.project.status IS '状态';
COMMENT ON COLUMN dwd.project.started_on IS '开工日';
COMMENT ON COLUMN dwd.project.completed_on IS '完工日';
COMMENT ON COLUMN dwd.project.meter_installed_on IS '装表日';
COMMENT ON COLUMN dwd.project.meter_id IS '表具';
COMMENT ON COLUMN dwd.project.source_id IS '来源系统；平台数据可空';
COMMENT ON COLUMN dwd.project.source_pk IS '源主键';
COMMENT ON COLUMN dwd.project.source_version IS '源版本/更新时间序列';
COMMENT ON COLUMN dwd.project.imported_at IS '入仓时间';
COMMENT ON COLUMN dwd.project.created_at IS '创建时间';
COMMENT ON COLUMN dwd.project.updated_at IS '更新时间（应用显式维护）';
COMMENT ON COLUMN dwd.project.version IS '乐观锁版本';

CREATE TABLE dwd.project_node (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES dwd.project(id),
  node_code varchar(64) NOT NULL,
  entered_at timestamptz NOT NULL,
  left_at timestamptz,
  deadline timestamptz,
  CHECK(left_at IS NULL OR left_at>=entered_at)
);
COMMENT ON TABLE dwd.project_node IS '工程节点多次往返均保留';
COMMENT ON COLUMN dwd.project_node.id IS '内部代理主键';
COMMENT ON COLUMN dwd.project_node.project_id IS '工程';
COMMENT ON COLUMN dwd.project_node.node_code IS '节点';
COMMENT ON COLUMN dwd.project_node.entered_at IS '进入';
COMMENT ON COLUMN dwd.project_node.left_at IS '离开';
COMMENT ON COLUMN dwd.project_node.deadline IS '时限';

CREATE TABLE dwd.alert_rule (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  code varchar(64) NOT NULL UNIQUE,
  name varchar(128) NOT NULL,
  category varchar(32) NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  system_rule boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 0
);
COMMENT ON TABLE dwd.alert_rule IS '可发布规则头';
COMMENT ON COLUMN dwd.alert_rule.id IS '内部代理主键';
COMMENT ON COLUMN dwd.alert_rule.code IS '规则码';
COMMENT ON COLUMN dwd.alert_rule.name IS '名称';
COMMENT ON COLUMN dwd.alert_rule.category IS '分类';
COMMENT ON COLUMN dwd.alert_rule.enabled IS '启停';
COMMENT ON COLUMN dwd.alert_rule.system_rule IS '系统规则不可删';
COMMENT ON COLUMN dwd.alert_rule.created_at IS '创建时间';
COMMENT ON COLUMN dwd.alert_rule.updated_at IS '更新时间（应用显式维护）';
COMMENT ON COLUMN dwd.alert_rule.version IS '乐观锁版本';

CREATE TABLE dwd.alert_rule_version (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  rule_id bigint NOT NULL REFERENCES dwd.alert_rule(id),
  revision integer NOT NULL,
  definition jsonb NOT NULL,
  published_by bigint NOT NULL REFERENCES mdm.app_user(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rule_id,revision)
);
COMMENT ON TABLE dwd.alert_rule_version IS '不可变已发布规则版本';
COMMENT ON COLUMN dwd.alert_rule_version.id IS '内部代理主键';
COMMENT ON COLUMN dwd.alert_rule_version.rule_id IS '规则';
COMMENT ON COLUMN dwd.alert_rule_version.revision IS '修订号';
COMMENT ON COLUMN dwd.alert_rule_version.definition IS '受限条件DSL，不执行任意脚本';
COMMENT ON COLUMN dwd.alert_rule_version.published_by IS '发布人';
COMMENT ON COLUMN dwd.alert_rule_version.published_at IS '发布时间';

CREATE TABLE dwd.alert (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  org_id bigint NOT NULL REFERENCES mdm.org(id),
  account_id bigint REFERENCES dwd.account(id),
  rule_version_id bigint REFERENCES dwd.alert_rule_version(id),
  dedup_key varchar(160) NOT NULL UNIQUE,
  detected_at timestamptz NOT NULL,
  severity varchar(16) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'OPEN',
  evidence jsonb NOT NULL DEFAULT '{}',
  batch_id bigint REFERENCES ods.batch(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 0
);
COMMENT ON TABLE dwd.alert IS '异常实例及证据';
COMMENT ON COLUMN dwd.alert.id IS '内部代理主键';
COMMENT ON COLUMN dwd.alert.org_id IS '对象归属';
COMMENT ON COLUMN dwd.alert.account_id IS '表卡';
COMMENT ON COLUMN dwd.alert.rule_version_id IS '规则版本';
COMMENT ON COLUMN dwd.alert.dedup_key IS '规则版本+对象+检测窗口';
COMMENT ON COLUMN dwd.alert.detected_at IS '检出时间';
COMMENT ON COLUMN dwd.alert.severity IS '严重度';
COMMENT ON COLUMN dwd.alert.status IS 'OPEN/VERIFIED/FALSE_POSITIVE/CLOSED';
COMMENT ON COLUMN dwd.alert.evidence IS '证据快照和来源指针';
COMMENT ON COLUMN dwd.alert.batch_id IS '数据版本';
COMMENT ON COLUMN dwd.alert.created_at IS '创建时间';
COMMENT ON COLUMN dwd.alert.updated_at IS '更新时间（应用显式维护）';
COMMENT ON COLUMN dwd.alert.version IS '乐观锁版本';

CREATE TABLE dwd.source_order (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  org_id bigint NOT NULL REFERENCES mdm.org(id),
  account_id bigint REFERENCES dwd.account(id),
  order_no varchar(100) NOT NULL,
  order_type varchar(64) NOT NULL,
  status varchar(64) NOT NULL,
  sent_at timestamptz,
  accepted_at timestamptz,
  finished_at timestamptz,
  trace jsonb NOT NULL DEFAULT '[]',
  source_id bigint REFERENCES ods.source(id),
  source_pk varchar(160),
  source_version varchar(80),
  imported_at timestamptz
);
COMMENT ON TABLE dwd.source_order IS '只读源工单快照';
COMMENT ON COLUMN dwd.source_order.id IS '内部代理主键';
COMMENT ON COLUMN dwd.source_order.org_id IS '组织';
COMMENT ON COLUMN dwd.source_order.account_id IS '表卡';
COMMENT ON COLUMN dwd.source_order.order_no IS '源单号';
COMMENT ON COLUMN dwd.source_order.order_type IS '类别';
COMMENT ON COLUMN dwd.source_order.status IS '源状态';
COMMENT ON COLUMN dwd.source_order.sent_at IS '发出';
COMMENT ON COLUMN dwd.source_order.accepted_at IS '接收';
COMMENT ON COLUMN dwd.source_order.finished_at IS '完成';
COMMENT ON COLUMN dwd.source_order.trace IS '源流程记录';
COMMENT ON COLUMN dwd.source_order.source_id IS '来源系统；平台数据可空';
COMMENT ON COLUMN dwd.source_order.source_pk IS '源主键';
COMMENT ON COLUMN dwd.source_order.source_version IS '源版本/更新时间序列';
COMMENT ON COLUMN dwd.source_order.imported_at IS '入仓时间';

CREATE TABLE dwd.supervision (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  alert_id bigint NOT NULL UNIQUE REFERENCES dwd.alert(id),
  org_id bigint NOT NULL REFERENCES mdm.org(id),
  assignee_id bigint REFERENCES mdm.app_user(id),
  created_by bigint NOT NULL REFERENCES mdm.app_user(id),
  status varchar(24) NOT NULL DEFAULT 'DRAFT',
  deadline timestamptz,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 0,
  CHECK(status IN('DRAFT','ASSIGNED','ACCEPTED','PROCESSING','RESOLVED','CLOSED','CANCELLED'))
);
COMMENT ON TABLE dwd.supervision IS '平台督办；一预警一督办，复开原单';
COMMENT ON COLUMN dwd.supervision.id IS '内部代理主键';
COMMENT ON COLUMN dwd.supervision.alert_id IS '关联异常';
COMMENT ON COLUMN dwd.supervision.org_id IS '责任组织';
COMMENT ON COLUMN dwd.supervision.assignee_id IS '责任人';
COMMENT ON COLUMN dwd.supervision.created_by IS '创建人';
COMMENT ON COLUMN dwd.supervision.status IS '状态机';
COMMENT ON COLUMN dwd.supervision.deadline IS '截止';
COMMENT ON COLUMN dwd.supervision.resolution IS '处理结果';
COMMENT ON COLUMN dwd.supervision.created_at IS '创建时间';
COMMENT ON COLUMN dwd.supervision.updated_at IS '更新时间（应用显式维护）';
COMMENT ON COLUMN dwd.supervision.version IS '乐观锁版本';

CREATE TABLE dwd.supervision_event (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  supervision_id bigint NOT NULL REFERENCES dwd.supervision(id),
  actor_id bigint NOT NULL REFERENCES mdm.app_user(id),
  from_status varchar(24),
  to_status varchar(24) NOT NULL,
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE dwd.supervision_event IS '督办事件审计';
COMMENT ON COLUMN dwd.supervision_event.id IS '内部代理主键';
COMMENT ON COLUMN dwd.supervision_event.supervision_id IS '督办';
COMMENT ON COLUMN dwd.supervision_event.actor_id IS '操作者';
COMMENT ON COLUMN dwd.supervision_event.from_status IS '原状态';
COMMENT ON COLUMN dwd.supervision_event.to_status IS '新状态';
COMMENT ON COLUMN dwd.supervision_event.reason IS '说明';
COMMENT ON COLUMN dwd.supervision_event.occurred_at IS '时间';

CREATE TABLE mdm.dma_node (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  org_id bigint NOT NULL REFERENCES mdm.org(id),
  parent_id bigint REFERENCES mdm.dma_node(id),
  code varchar(80) NOT NULL UNIQUE,
  name varchar(128) NOT NULL,
  boundary geometry(MultiPolygon,4326),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 0
);
COMMENT ON TABLE mdm.dma_node IS 'DMA空间拓扑；业务映射独立于组织树';
COMMENT ON COLUMN mdm.dma_node.id IS '内部代理主键';
COMMENT ON COLUMN mdm.dma_node.org_id IS '责任组织';
COMMENT ON COLUMN mdm.dma_node.parent_id IS '上级分区';
COMMENT ON COLUMN mdm.dma_node.code IS '分区码';
COMMENT ON COLUMN mdm.dma_node.name IS '名称';
COMMENT ON COLUMN mdm.dma_node.boundary IS '区域边界';
COMMENT ON COLUMN mdm.dma_node.created_at IS '创建时间';
COMMENT ON COLUMN mdm.dma_node.updated_at IS '更新时间（应用显式维护）';
COMMENT ON COLUMN mdm.dma_node.version IS '乐观锁版本';

CREATE TABLE mdm.telemetry_device (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  source_id bigint NOT NULL REFERENCES ods.source(id),
  device_code varchar(100) NOT NULL,
  org_id bigint NOT NULL REFERENCES mdm.org(id),
  dma_node_id bigint REFERENCES mdm.dma_node(id),
  meter_id bigint REFERENCES dwd.meter(id),
  location geometry(Point,4326),
  unit varchar(24) NOT NULL,
  UNIQUE(source_id,device_code), UNIQUE(id,source_id)
);
COMMENT ON TABLE mdm.telemetry_device IS '遥测设备与分区关联';
COMMENT ON COLUMN mdm.telemetry_device.id IS '内部代理主键';
COMMENT ON COLUMN mdm.telemetry_device.source_id IS '数据源';
COMMENT ON COLUMN mdm.telemetry_device.device_code IS '源设备码';
COMMENT ON COLUMN mdm.telemetry_device.org_id IS '责任组织';
COMMENT ON COLUMN mdm.telemetry_device.dma_node_id IS 'DMA';
COMMENT ON COLUMN mdm.telemetry_device.meter_id IS '可关联户表';
COMMENT ON COLUMN mdm.telemetry_device.location IS '位置';
COMMENT ON COLUMN mdm.telemetry_device.unit IS '单位';

CREATE TABLE mdm.dma_account (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  dma_node_id bigint NOT NULL REFERENCES mdm.dma_node(id),
  account_id bigint NOT NULL REFERENCES dwd.account(id),
  valid_from date NOT NULL,
  valid_to date,
  CHECK(valid_to IS NULL OR valid_to>valid_from),
  EXCLUDE USING gist(account_id WITH =,daterange(valid_from,valid_to,'[)') WITH &&)
);
COMMENT ON TABLE mdm.dma_account IS 'DMA覆盖表卡有效期';
COMMENT ON COLUMN mdm.dma_account.id IS '内部代理主键';
COMMENT ON COLUMN mdm.dma_account.dma_node_id IS 'DMA';
COMMENT ON COLUMN mdm.dma_account.account_id IS '表卡';
COMMENT ON COLUMN mdm.dma_account.valid_from IS '开始';
COMMENT ON COLUMN mdm.dma_account.valid_to IS '结束';

CREATE TABLE ts.telemetry (
  source_id bigint NOT NULL REFERENCES ods.source(id),
  device_id bigint NOT NULL,
  observed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  instant_flow numeric(20,6),
  cumulative_volume numeric(24,6),
  pressure_mpa numeric(12,6),
  quality varchar(24) NOT NULL DEFAULT 'UNKNOWN',
  raw_payload jsonb,
  PRIMARY KEY(device_id,observed_at,source_id),
  FOREIGN KEY(device_id,source_id) REFERENCES mdm.telemetry_device(id,source_id)
);
COMMENT ON TABLE ts.telemetry IS '高频时序；唯一键含时间分区列';
COMMENT ON COLUMN ts.telemetry.source_id IS '来源';
COMMENT ON COLUMN ts.telemetry.device_id IS '设备';
COMMENT ON COLUMN ts.telemetry.observed_at IS '观测时间';
COMMENT ON COLUMN ts.telemetry.received_at IS '到达时间';
COMMENT ON COLUMN ts.telemetry.instant_flow IS '瞬时流量m³/h';
COMMENT ON COLUMN ts.telemetry.cumulative_volume IS '累计体积m³';
COMMENT ON COLUMN ts.telemetry.pressure_mpa IS '压力MPa';
COMMENT ON COLUMN ts.telemetry.quality IS 'VALID/MISSING/RESET/INVALID/UNKNOWN';
COMMENT ON COLUMN ts.telemetry.raw_payload IS '可选来源证据';

CREATE TABLE ads.data_release (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  release_key varchar(100) NOT NULL UNIQUE,
  batch_ids jsonb NOT NULL,
  metric_version varchar(40) NOT NULL,
  status varchar(24) NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE ads.data_release IS '聚合发布版本；构建完成才发布';
COMMENT ON COLUMN ads.data_release.id IS '内部代理主键';
COMMENT ON COLUMN ads.data_release.release_key IS '版本号';
COMMENT ON COLUMN ads.data_release.batch_ids IS '输入批次集合';
COMMENT ON COLUMN ads.data_release.metric_version IS '指标定义版本';
COMMENT ON COLUMN ads.data_release.status IS 'BUILDING/PUBLISHED/FAILED';
COMMENT ON COLUMN ads.data_release.published_at IS '发布时间';
COMMENT ON COLUMN ads.data_release.created_at IS '创建';

CREATE TABLE ads.org_month (
  release_id bigint NOT NULL REFERENCES ads.data_release(id),
  org_id bigint NOT NULL REFERENCES mdm.org(id),
  period date NOT NULL,
  caliber_mode varchar(16) NOT NULL,
  sold_volume numeric(24,4),
  supply_volume numeric(24,4),
  water_revenue numeric(24,2),
  receivable_principal numeric(24,2),
  allocated_principal numeric(24,2),
  registered_count bigint,
  new_count bigint,
  cancelled_count bigint,
  quality varchar(24) NOT NULL,
  PRIMARY KEY(release_id,org_id,period,caliber_mode),
  CHECK(caliber_mode IN('BILL_PERIOD','NATURAL_MONTH'))
);
COMMENT ON TABLE ads.org_month IS '组织月度基础可加总量；比率查询时派生';
COMMENT ON COLUMN ads.org_month.release_id IS '发布版本';
COMMENT ON COLUMN ads.org_month.org_id IS '组织';
COMMENT ON COLUMN ads.org_month.period IS '月初';
COMMENT ON COLUMN ads.org_month.caliber_mode IS 'BILL_PERIOD/NATURAL_MONTH';
COMMENT ON COLUMN ads.org_month.sold_volume IS '售水';
COMMENT ON COLUMN ads.org_month.supply_volume IS '供水，缺失为空';
COMMENT ON COLUMN ads.org_month.water_revenue IS '水费收入';
COMMENT ON COLUMN ads.org_month.receivable_principal IS '应收本金';
COMMENT ON COLUMN ads.org_month.allocated_principal IS '回收本金';
COMMENT ON COLUMN ads.org_month.registered_count IS '期末存量';
COMMENT ON COLUMN ads.org_month.new_count IS '新增';
COMMENT ON COLUMN ads.org_month.cancelled_count IS '注销';
COMMENT ON COLUMN ads.org_month.quality IS 'COMPLETE/PARTIAL/MISSING';

CREATE TABLE ads.metric_definition (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  code varchar(64) NOT NULL,
  revision integer NOT NULL,
  name varchar(100) NOT NULL,
  unit varchar(24) NOT NULL,
  formula_description text NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'DRAFT',
  approved_by bigint REFERENCES mdm.app_user(id),
  UNIQUE(code,revision)
);
COMMENT ON TABLE ads.metric_definition IS '指标口径与展示元数据';
COMMENT ON COLUMN ads.metric_definition.id IS '内部代理主键';
COMMENT ON COLUMN ads.metric_definition.code IS '指标码';
COMMENT ON COLUMN ads.metric_definition.revision IS '版本';
COMMENT ON COLUMN ads.metric_definition.name IS '名称';
COMMENT ON COLUMN ads.metric_definition.unit IS '单位';
COMMENT ON COLUMN ads.metric_definition.formula_description IS '明确分子分母与空值规则';
COMMENT ON COLUMN ads.metric_definition.status IS 'DRAFT/APPROVED/RETIRED';
COMMENT ON COLUMN ads.metric_definition.approved_by IS '签认人';

CREATE TABLE ads.plan (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  org_id bigint NOT NULL REFERENCES mdm.org(id),
  metric_code varchar(64) NOT NULL,
  period date NOT NULL,
  caliber_mode varchar(16) NOT NULL,
  value numeric(24,6) NOT NULL,
  updated_by bigint NOT NULL REFERENCES mdm.app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 0,
  UNIQUE(org_id,metric_code,period,caliber_mode)
);
COMMENT ON TABLE ads.plan IS '平台手工计划，按节点与指标唯一';
COMMENT ON COLUMN ads.plan.id IS '内部代理主键';
COMMENT ON COLUMN ads.plan.org_id IS '计划节点';
COMMENT ON COLUMN ads.plan.metric_code IS '已注册指标码';
COMMENT ON COLUMN ads.plan.period IS '计划月份';
COMMENT ON COLUMN ads.plan.caliber_mode IS '口径';
COMMENT ON COLUMN ads.plan.value IS '计划值';
COMMENT ON COLUMN ads.plan.updated_by IS '修改人';
COMMENT ON COLUMN ads.plan.created_at IS '创建时间';
COMMENT ON COLUMN ads.plan.updated_at IS '更新时间（应用显式维护）';
COMMENT ON COLUMN ads.plan.version IS '乐观锁版本';

CREATE TABLE ads.forecast_run (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  org_id bigint NOT NULL REFERENCES mdm.org(id),
  model_code varchar(64) NOT NULL,
  model_version varchar(64) NOT NULL,
  training_cutoff date NOT NULL,
  horizon varchar(16) NOT NULL,
  factors jsonb NOT NULL DEFAULT '{}',
  backtest jsonb NOT NULL DEFAULT '{}',
  status varchar(24) NOT NULL,
  created_by bigint NOT NULL REFERENCES mdm.app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE ads.forecast_run IS '模型与回测上下文';
COMMENT ON COLUMN ads.forecast_run.id IS '内部代理主键';
COMMENT ON COLUMN ads.forecast_run.org_id IS '预测范围';
COMMENT ON COLUMN ads.forecast_run.model_code IS '模型名';
COMMENT ON COLUMN ads.forecast_run.model_version IS '模型版本';
COMMENT ON COLUMN ads.forecast_run.training_cutoff IS '训练截止；防未来数据泄漏';
COMMENT ON COLUMN ads.forecast_run.horizon IS 'MONTH/QUARTER/YEAR';
COMMENT ON COLUMN ads.forecast_run.factors IS '因子快照';
COMMENT ON COLUMN ads.forecast_run.backtest IS '窗口/样本/MAPE等，零值另处理';
COMMENT ON COLUMN ads.forecast_run.status IS 'QUEUED/RUNNING/SUCCEEDED/FAILED';
COMMENT ON COLUMN ads.forecast_run.created_by IS '创建者';
COMMENT ON COLUMN ads.forecast_run.created_at IS '时间';

CREATE TABLE ads.forecast_value (
  run_id bigint NOT NULL REFERENCES ads.forecast_run(id),
  org_id bigint NOT NULL REFERENCES mdm.org(id),
  period date NOT NULL,
  value numeric(24,4),
  lower_bound numeric(24,4),
  upper_bound numeric(24,4),
  quality varchar(24) NOT NULL,
  PRIMARY KEY(run_id,org_id,period)
);
COMMENT ON TABLE ads.forecast_value IS '分节点预测结果';
COMMENT ON COLUMN ads.forecast_value.run_id IS '预测批次';
COMMENT ON COLUMN ads.forecast_value.org_id IS '结果节点';
COMMENT ON COLUMN ads.forecast_value.period IS '目标月份';
COMMENT ON COLUMN ads.forecast_value.value IS '预测水量';
COMMENT ON COLUMN ads.forecast_value.lower_bound IS '区间下界';
COMMENT ON COLUMN ads.forecast_value.upper_bound IS '区间上界';
COMMENT ON COLUMN ads.forecast_value.quality IS 'VALID/INSUFFICIENT';

CREATE TABLE ads.dma_balance (
  release_id bigint NOT NULL REFERENCES ads.data_release(id),
  dma_node_id bigint NOT NULL REFERENCES mdm.dma_node(id),
  period date NOT NULL,
  supply_volume numeric(24,4),
  sold_volume numeric(24,4),
  quality varchar(24) NOT NULL,
  PRIMARY KEY(release_id,dma_node_id,period)
);
COMMENT ON TABLE ads.dma_balance IS '经映射与质量检查的供售水结果';
COMMENT ON COLUMN ads.dma_balance.release_id IS '版本';
COMMENT ON COLUMN ads.dma_balance.dma_node_id IS 'DMA';
COMMENT ON COLUMN ads.dma_balance.period IS '月份';
COMMENT ON COLUMN ads.dma_balance.supply_volume IS '校验后供水量';
COMMENT ON COLUMN ads.dma_balance.sold_volume IS '覆盖表卡售水';
COMMENT ON COLUMN ads.dma_balance.quality IS 'COMPLETE/PARTIAL/MISSING';

CREATE TABLE ads.report_definition (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  code varchar(32) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  category varchar(64) NOT NULL,
  parameter_schema jsonb NOT NULL DEFAULT '{}',
  template_version varchar(40) NOT NULL,
  enabled boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE ads.report_definition IS '21张报表及参数schema';
COMMENT ON COLUMN ads.report_definition.id IS '内部代理主键';
COMMENT ON COLUMN ads.report_definition.code IS 'P-RPT-001等';
COMMENT ON COLUMN ads.report_definition.name IS '名称';
COMMENT ON COLUMN ads.report_definition.category IS '分类';
COMMENT ON COLUMN ads.report_definition.parameter_schema IS '允许参数及校验';
COMMENT ON COLUMN ads.report_definition.template_version IS '模板版本';
COMMENT ON COLUMN ads.report_definition.enabled IS '启停';

CREATE TABLE ads.report_job (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  report_id bigint NOT NULL REFERENCES ads.report_definition(id),
  requested_by bigint NOT NULL REFERENCES mdm.app_user(id),
  org_id bigint NOT NULL REFERENCES mdm.org(id),
  release_id bigint REFERENCES ads.data_release(id),
  parameters jsonb NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'QUEUED',
  object_key varchar(300),
  expires_at timestamptz,
  row_count bigint,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 0
);
COMMENT ON TABLE ads.report_job IS '异步报表/导出；下载时重验权限';
COMMENT ON COLUMN ads.report_job.id IS '内部代理主键';
COMMENT ON COLUMN ads.report_job.report_id IS '报表';
COMMENT ON COLUMN ads.report_job.requested_by IS '请求者';
COMMENT ON COLUMN ads.report_job.org_id IS '范围';
COMMENT ON COLUMN ads.report_job.release_id IS '数据版本';
COMMENT ON COLUMN ads.report_job.parameters IS '参数快照';
COMMENT ON COLUMN ads.report_job.status IS 'QUEUED/RUNNING/SUCCEEDED/FAILED/EXPIRED';
COMMENT ON COLUMN ads.report_job.object_key IS '文件对象键，不是公开URL';
COMMENT ON COLUMN ads.report_job.expires_at IS '下载有效期';
COMMENT ON COLUMN ads.report_job.row_count IS '导出行数';
COMMENT ON COLUMN ads.report_job.error_summary IS '脱敏错误';
COMMENT ON COLUMN ads.report_job.created_at IS '创建时间';
COMMENT ON COLUMN ads.report_job.updated_at IS '更新时间（应用显式维护）';
COMMENT ON COLUMN ads.report_job.version IS '乐观锁版本';

CREATE TABLE mdm.idempotency (
  actor_id bigint NOT NULL REFERENCES mdm.app_user(id),
  operation varchar(100) NOT NULL,
  request_key varchar(128) NOT NULL,
  payload_hash varchar(64) NOT NULL,
  result jsonb,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(actor_id,operation,request_key)
);
COMMENT ON TABLE mdm.idempotency IS '写操作幂等结果，按账号/接口/键隔离';
COMMENT ON COLUMN mdm.idempotency.actor_id IS '账号';
COMMENT ON COLUMN mdm.idempotency.operation IS '动作/路径';
COMMENT ON COLUMN mdm.idempotency.request_key IS 'Idempotency-Key';
COMMENT ON COLUMN mdm.idempotency.payload_hash IS '请求内容hash';
COMMENT ON COLUMN mdm.idempotency.result IS '原结果';
COMMENT ON COLUMN mdm.idempotency.expires_at IS '过期时间';

CREATE TABLE mdm.meter_barcode_rule (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  prefix varchar(32) NOT NULL,
  manufacturer varchar(128) NOT NULL,
  meter_type varchar(32) NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  UNIQUE(prefix,manufacturer,meter_type,valid_from)
);
COMMENT ON TABLE mdm.meter_barcode_rule IS '报表001的厂家/表型/条码规则，需业务签认';
COMMENT ON COLUMN mdm.meter_barcode_rule.id IS '内部代理主键';
COMMENT ON COLUMN mdm.meter_barcode_rule.prefix IS '条码前缀';
COMMENT ON COLUMN mdm.meter_barcode_rule.manufacturer IS '厂家';
COMMENT ON COLUMN mdm.meter_barcode_rule.meter_type IS '表型';
COMMENT ON COLUMN mdm.meter_barcode_rule.valid_from IS '生效日';
COMMENT ON COLUMN mdm.meter_barcode_rule.valid_to IS '失效日';

CREATE TABLE dwd.account_event (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES dwd.account(id),
  org_id bigint NOT NULL REFERENCES mdm.org(id),
  event_type varchar(32) NOT NULL,
  occurred_at timestamptz NOT NULL,
  before_value jsonb,
  after_value jsonb NOT NULL,
  source_id bigint REFERENCES ods.source(id),
  source_pk varchar(160),
  source_version varchar(80),
  imported_at timestamptz
);
COMMENT ON TABLE dwd.account_event IS '性质变更、入册、调册等事件，不能用注册日代替入册日';
COMMENT ON COLUMN dwd.account_event.id IS '内部代理主键';
COMMENT ON COLUMN dwd.account_event.account_id IS '表卡';
COMMENT ON COLUMN dwd.account_event.org_id IS '发生时组织';
COMMENT ON COLUMN dwd.account_event.event_type IS 'NATURE_CHANGE/BOOKLET_JOIN/BOOKLET_MOVE';
COMMENT ON COLUMN dwd.account_event.occurred_at IS '发生时间';
COMMENT ON COLUMN dwd.account_event.before_value IS '原值';
COMMENT ON COLUMN dwd.account_event.after_value IS '新值';
COMMENT ON COLUMN dwd.account_event.source_id IS '来源系统；平台数据可空';
COMMENT ON COLUMN dwd.account_event.source_pk IS '源主键';
COMMENT ON COLUMN dwd.account_event.source_version IS '源版本/更新时间序列';
COMMENT ON COLUMN dwd.account_event.imported_at IS '入仓时间';

CREATE TABLE ads.account_profile (
  account_id bigint NOT NULL REFERENCES dwd.account(id),
  release_id bigint NOT NULL REFERENCES ads.data_release(id),
  rule_version varchar(64) NOT NULL,
  as_of date NOT NULL,
  dimensions jsonb NOT NULL,
  quality varchar(24) NOT NULL,
  PRIMARY KEY(account_id,release_id,rule_version,as_of)
);
COMMENT ON TABLE ads.account_profile IS '画像规则版本与结果；无依据不打分';
COMMENT ON COLUMN ads.account_profile.account_id IS '表卡';
COMMENT ON COLUMN ads.account_profile.release_id IS '数据批次';
COMMENT ON COLUMN ads.account_profile.rule_version IS '画像口径';
COMMENT ON COLUMN ads.account_profile.as_of IS '评价日期';
COMMENT ON COLUMN ads.account_profile.dimensions IS '稳定性/缴费等定义、值、证据；不凭空默认分数';
COMMENT ON COLUMN ads.account_profile.quality IS 'COMPLETE/PARTIAL/INSUFFICIENT';

ALTER TABLE ods.quality_issue ADD CONSTRAINT fk_issue_actor FOREIGN KEY(resolved_by) REFERENCES mdm.app_user(id);
CREATE UNIQUE INDEX org_one_root ON mdm.org((1)) WHERE parent_id IS NULL;
CREATE INDEX org_children ON mdm.org(parent_id,sort_order,id);
CREATE INDEX org_descendants ON mdm.org_closure(descendant_id,ancestor_id);
CREATE INDEX org_boundary_gist ON mdm.org USING gist(boundary);
CREATE INDEX account_scope ON dwd.account(current_org_id,status,water_nature);
CREATE INDEX customer_name_trgm ON dwd.customer USING gin(name gin_trgm_ops);
CREATE INDEX account_location_gist ON dwd.account USING gist(location);
CREATE INDEX reading_scope_period ON dwd.reading(org_id,bill_period,account_id);
CREATE INDEX reading_account_time ON dwd.reading(account_id,observed_at DESC);
CREATE INDEX task_scope_period ON dwd.read_task(org_id,bill_period,status);
CREATE INDEX bill_scope_period ON dwd.bill(org_id,bill_period,account_id);
CREATE INDEX bill_account_date ON dwd.bill(account_id,issued_on DESC);
CREATE INDEX bill_open_due ON dwd.bill(org_id,due_on) WHERE status='OPEN';
CREATE INDEX payment_account_date ON dwd.payment(account_id,paid_at DESC);
CREATE INDEX allocation_bill ON dwd.payment_allocation(bill_id,allocated_at);
CREATE INDEX allocation_payment ON dwd.payment_allocation(payment_id);
CREATE INDEX project_scope ON dwd.project(org_id,status);
CREATE INDEX alert_scope_status ON dwd.alert(org_id,status,detected_at DESC);
CREATE INDEX supervision_assignee ON dwd.supervision(assignee_id,status,deadline);
CREATE INDEX report_job_user ON ads.report_job(requested_by,created_at DESC);
CREATE INDEX audit_time ON mdm.audit_event(occurred_at DESC,actor_id);
CREATE INDEX raw_batch ON ods.raw_record(batch_id);
CREATE INDEX batch_source_status ON ods.batch(source_id,status,started_at DESC);
SELECT create_hypertable('ts.telemetry','observed_at',chunk_time_interval=>INTERVAL '7 days',if_not_exists=>true);
CREATE INDEX telemetry_time ON ts.telemetry(device_id,observed_at DESC);
-- Compression / columnstore / retention policies deliberately omitted until deployed extension versions
-- and business retention are signed off. Do not auto-delete historical telemetry.

CREATE UNIQUE INDEX customer_source_key ON dwd.customer(source_id,source_pk) WHERE source_id IS NOT NULL AND source_pk IS NOT NULL;
CREATE UNIQUE INDEX account_source_key ON dwd.account(source_id,source_pk) WHERE source_id IS NOT NULL AND source_pk IS NOT NULL;
CREATE UNIQUE INDEX meter_source_key ON dwd.meter(source_id,source_pk) WHERE source_id IS NOT NULL AND source_pk IS NOT NULL;
CREATE UNIQUE INDEX meter_swap_source_key ON dwd.meter_swap(source_id,source_pk) WHERE source_id IS NOT NULL AND source_pk IS NOT NULL;
CREATE UNIQUE INDEX inventory_event_source_key ON dwd.inventory_event(source_id,source_pk) WHERE source_id IS NOT NULL AND source_pk IS NOT NULL;
CREATE UNIQUE INDEX read_task_source_key ON dwd.read_task(source_id,source_pk) WHERE source_id IS NOT NULL AND source_pk IS NOT NULL;
CREATE UNIQUE INDEX reading_source_key ON dwd.reading(source_id,source_pk) WHERE source_id IS NOT NULL AND source_pk IS NOT NULL;
CREATE UNIQUE INDEX bill_source_key ON dwd.bill(source_id,source_pk) WHERE source_id IS NOT NULL AND source_pk IS NOT NULL;
CREATE UNIQUE INDEX payment_source_key ON dwd.payment(source_id,source_pk) WHERE source_id IS NOT NULL AND source_pk IS NOT NULL;
CREATE UNIQUE INDEX payment_allocation_source_key ON dwd.payment_allocation(source_id,source_pk) WHERE source_id IS NOT NULL AND source_pk IS NOT NULL;
CREATE UNIQUE INDEX bill_adjustment_source_key ON dwd.bill_adjustment(source_id,source_pk) WHERE source_id IS NOT NULL AND source_pk IS NOT NULL;
CREATE UNIQUE INDEX project_source_key ON dwd.project(source_id,source_pk) WHERE source_id IS NOT NULL AND source_pk IS NOT NULL;
CREATE UNIQUE INDEX source_order_source_key ON dwd.source_order(source_id,source_pk) WHERE source_id IS NOT NULL AND source_pk IS NOT NULL;
CREATE UNIQUE INDEX account_event_source_key ON dwd.account_event(source_id,source_pk) WHERE source_id IS NOT NULL AND source_pk IS NOT NULL;
COMMIT;

```


## 002-unified-code.sql

```sql
-- Run after 001-baseline.sql in the NEW database. Region codes must be signed off before seeding.
BEGIN;
CREATE TABLE mdm.region_sequence (
  region_code char(2) PRIMARY KEY CHECK(region_code ~ '^[0-9]{2}$'),
  last_value bigint NOT NULL DEFAULT 0 CHECK(last_value BETWEEN 0 AND 9999999999)
);

CREATE FUNCTION mdm.luhn_digit(payload text) RETURNS char(1)
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE total integer := 0; digit integer; pos integer; distance integer;
BEGIN
  IF payload !~ '^[0-9]{12}$' THEN RAISE EXCEPTION 'Luhn payload must contain 12 digits'; END IF;
  FOR pos IN 1..12 LOOP
    digit := substring(payload FROM pos FOR 1)::integer;
    distance := 12-pos;
    IF distance % 2 = 0 THEN
      digit := digit*2;
      IF digit>9 THEN digit:=digit-9; END IF;
    END IF;
    total:=total+digit;
  END LOOP;
  RETURN ((10-total%10)%10)::text::char(1);
END $$;

CREATE FUNCTION mdm.valid_unified_code(code text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
BEGIN
  IF code !~ '^ZZU[0-9]{13}$' THEN RETURN false; END IF;
  RETURN right(code,1)=mdm.luhn_digit(substring(code FROM 4 FOR 12));
END $$;

CREATE FUNCTION mdm.next_unified_code(region text) RETURNS char(16)
LANGUAGE plpgsql VOLATILE STRICT AS $$
DECLARE seq bigint; payload text;
BEGIN
  IF region !~ '^[0-9]{2}$' THEN RAISE EXCEPTION 'Region must contain 2 digits'; END IF;
  -- Row lock acquired by UPDATE serializes issuance only within the same region.
  UPDATE mdm.region_sequence SET last_value=last_value+1
    WHERE region_code=region AND last_value<9999999999 RETURNING last_value INTO seq;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown or exhausted region %',region; END IF;
  payload:=region||lpad(seq::text,10,'0');
  RETURN ('ZZU'||payload||mdm.luhn_digit(payload))::char(16);
END $$;

ALTER TABLE dwd.account ADD CONSTRAINT account_code_luhn CHECK(mdm.valid_unified_code(unified_code));
ALTER TABLE mdm.company ADD CONSTRAINT company_region_fk FOREIGN KEY(unified_prefix) REFERENCES mdm.region_sequence(region_code);
COMMIT;

-- Verification (read-only): should return true / false respectively.
SELECT mdm.valid_unified_code('ZZU0200000000014') AS valid_example,
       mdm.valid_unified_code('ZZU0200000000015') AS invalid_example;
-- Issuance must occur in the same transaction as account + entity_mapping creation.
-- Do not issue externally before commit; do not promise gapless sequences.

```


## 003-report-catalog.sql

```sql
-- Report catalogue only; no production facts or accounts seeded.
BEGIN;
INSERT INTO ads.report_definition(code,name,category,parameter_schema,template_version) VALUES('P-RPT-001','水表基础信息异常报表','表务计量','{}','v4.2') ON CONFLICT(code) DO NOTHING;
INSERT INTO ads.report_definition(code,name,category,parameter_schema,template_version) VALUES('P-RPT-002','周检水表报表','表务计量','{}','v4.2') ON CONFLICT(code) DO NOTHING;
INSERT INTO ads.report_definition(code,name,category,parameter_schema,template_version) VALUES('P-RPT-003','故障水表报表','表务计量','{}','v4.2') ON CONFLICT(code) DO NOTHING;
INSERT INTO ads.report_definition(code,name,category,parameter_schema,template_version) VALUES('P-RPT-004','周检换表前后周期水量对比报表','表务计量','{}','v4.2') ON CONFLICT(code) DO NOTHING;
INSERT INTO ads.report_definition(code,name,category,parameter_schema,template_version) VALUES('P-RPT-005','故障换表前后周期水量对比报表','表务计量','{}','v4.2') ON CONFLICT(code) DO NOTHING;
INSERT INTO ads.report_definition(code,name,category,parameter_schema,template_version) VALUES('P-RPT-006','水表入库统计表','水表仓储','{}','v4.2') ON CONFLICT(code) DO NOTHING;
INSERT INTO ads.report_definition(code,name,category,parameter_schema,template_version) VALUES('P-RPT-007','水表库存统计表','水表仓储','{}','v4.2') ON CONFLICT(code) DO NOTHING;
INSERT INTO ads.report_definition(code,name,category,parameter_schema,template_version) VALUES('P-RPT-008','各仓库库存报表','水表仓储','{}','v4.2') ON CONFLICT(code) DO NOTHING;
INSERT INTO ads.report_definition(code,name,category,parameter_schema,template_version) VALUES('P-RPT-009','抄见率统计报表','抄表与水量','{}','v4.2') ON CONFLICT(code) DO NOTHING;
INSERT INTO ads.report_definition(code,name,category,parameter_schema,template_version) VALUES('P-RPT-010','未抄见报表','抄表与水量','{}','v4.2') ON CONFLICT(code) DO NOTHING;
INSERT INTO ads.report_definition(code,name,category,parameter_schema,template_version) VALUES('P-RPT-011','异常状态统计报表','抄表与水量','{}','v4.2') ON CONFLICT(code) DO NOTHING;
INSERT INTO ads.report_definition(code,name,category,parameter_schema,template_version) VALUES('P-RPT-012','连续零水量用户报表','抄表与水量','{}','v4.2') ON CONFLICT(code) DO NOTHING;
INSERT INTO ads.report_definition(code,name,category,parameter_schema,template_version) VALUES('P-RPT-013','100立方米以上用户报表','抄表与水量','{}','v4.2') ON CONFLICT(code) DO NOTHING;
INSERT INTO ads.report_definition(code,name,category,parameter_schema,template_version) VALUES('P-RPT-014','异常水量分析报表','抄表与水量','{}','v4.2') ON CONFLICT(code) DO NOTHING;
INSERT INTO ads.report_definition(code,name,category,parameter_schema,template_version) VALUES('P-RPT-015','用水性质变更统计报表','用户与册本','{}','v4.2') ON CONFLICT(code) DO NOTHING;
INSERT INTO ads.report_definition(code,name,category,parameter_schema,template_version) VALUES('P-RPT-016','小区各用水性质户数报表','用户与册本','{}','v4.2') ON CONFLICT(code) DO NOTHING;
INSERT INTO ads.report_definition(code,name,category,parameter_schema,template_version) VALUES('P-RPT-017','册本户数报表','用户与册本','{}','v4.2') ON CONFLICT(code) DO NOTHING;
INSERT INTO ads.report_definition(code,name,category,parameter_schema,template_version) VALUES('P-RPT-018','存量用水册本调整报表','用户与册本','{}','v4.2') ON CONFLICT(code) DO NOTHING;
INSERT INTO ads.report_definition(code,name,category,parameter_schema,template_version) VALUES('P-RPT-019','新增用户入册报表','用户与册本','{}','v4.2') ON CONFLICT(code) DO NOTHING;
INSERT INTO ads.report_definition(code,name,category,parameter_schema,template_version) VALUES('P-RPT-020','新增用户按用水性质统计报表','用户与册本','{}','v4.2') ON CONFLICT(code) DO NOTHING;
INSERT INTO ads.report_definition(code,name,category,parameter_schema,template_version) VALUES('P-RPT-021','注销用户按用水性质统计报表','用户与册本','{}','v4.2') ON CONFLICT(code) DO NOTHING;
COMMIT;

```
