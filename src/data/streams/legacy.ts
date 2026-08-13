/* ------------------------------ 存量系统逆向重构事件流 ------------------------------
   这套事件流要讲的设计主张是：逆向工程的可信性不来自「模型读懂了代码」，而来自
   「事实、推断、待确认三类结论被分开标注，并且只有事实可以直接进入设计」。

   因此叙事被固定为四条约束：
   1. 三分标注先行 —— 从源码读出的行为是事实（可指到文件与行号），补上的业务意图
      是推断（有理由但无出处），既非事实也无法自证的是待确认。三类结论在
      reasoning / text / handoff 里必须显式分开，混在一起就等于把推断伪装成事实。
   2. 待确认项不允许被 AI 自行拍板 —— 存量代码的行为本身可能就是缺陷，「代码怎么写
      的」不等于「业务要什么」。待确认项一律走人工检查点，由人给出语义裁决，AI 只能
      请求、不能代替。
   3. 门禁读的是标注质量而不是叙述完整度 —— 需求与设计门禁会比对逆向结论与实际业务
      语义：第一轮把「征集日 = 投票起始日前一自然日」当成事实带进了设计，与交易日历
      语义不符，门禁只能出 block。
   4. 返工是路由而不是重述 —— 沿「架构设计 → 需求逆向」这条语义待澄清的回退边定向
      回到责任节点，redo 只含被推翻的那条规则及其下游设计，keep 明确保留已闭环的调用
      链事实、接口契约比对与其余规则，证据不重复采集。

   业务背景：存量系统 sseinternetvote（Java / Struts + iBATIS，包名
   com.sse.internetvote）中 QFII 征集投票的规则散落在 action 与 service 两层，且无
   设计文档。需在 vote_org_qfii（com.sse.vote.qfii）重写，并保持与上证信息投票平台
   （vote.sseinfo.com）的接口契约不变。逆向出的关键缺陷：存量代码用自然日回推征集
   日，跨节假日会算错一天。
   ---------------------------------------------------------------------------- */

import type { AgentEvent } from "../mock";

export const legacyStream: AgentEvent[] = [
  {
    id: "lg1",
    kind: "reasoning",
    title: "已思考 14 秒",
    body: "这个仓库没有设计文档，唯一的信息源就是源码本身，所以最大的风险不是读不懂，而是把「代码这么写」直接当成「业务要这样」。先立一条纪律：所有结论分三类落账 —— 能指到文件与行号的算事实，比如征集时点判断写在哪个方法、用了哪个日期工具；根据字段命名与调用上下文补出来的业务意图算推断，比如为什么要设 9:15 这个起点；既无出处也无法自证的算待确认，比如 QFII 是名义持有人这件事在代码里只体现为一张实际持有人明细表，征集的法定含义完全没有落在代码里。第三类必须交人，不能由我补齐。",
    ms: 14_300,
  },
  {
    id: "lg2",
    kind: "plan",
    steps: [
      { label: "按模块与调用关系解析存量源码，记录出处与版本", status: "done" },
      { label: "抽取征集规则并按事实 / 推断 / 待确认三类标注", status: "done" },
      { label: "待确认项提交人工确认，确认后固化为验收基线", status: "active" },
      { label: "以确认后的规则重新设计征集域并测试驱动重写", status: "todo" },
      { label: "比对对外接口契约并交付四类材料", status: "todo" },
    ],
  },
  {
    id: "lg3",
    kind: "tool",
    tool: "read",
    label: "read_file",
    meta: "sseinternetvote · 4 files · 1 862 lines",
    status: "ok",
    lines: [
      "src/main/java/com/sse/internetvote/qfii/action/QfiiVoteAction.java          612 行",
      "src/main/java/com/sse/internetvote/qfii/service/QfiiCollectServiceImpl.java 438 行",
      "src/main/java/com/sse/internetvote/common/util/VoteDateUtil.java            176 行",
      "src/main/resources/sqlmap/QfiiVote.xml                                      636 行",
      "",
      "svn r4187 · 最后提交 2019-11-06 · 无设计文档、无单元测试目录",
    ],
  },
  {
    id: "lg4",
    kind: "tool",
    tool: "search",
    label: "grep",
    meta: "征集日回推与时点校验 — 3 files, 11 matches",
    status: "warn",
    lines: [
      "qfii/service/QfiiCollectServiceImpl.java:127   Date collectDay = DateUtils.addDays(meeting.getVoteStartDate(), -1);",
      "qfii/service/QfiiCollectServiceImpl.java:131   // 征集日：投票起始日前一天 09:15 - 15:00",
      "qfii/action/QfiiVoteAction.java:284             if (!collectSrv.inCollectWindow(new Date())) { return ERROR_OUT_OF_TIME; }",
      "common/util/VoteDateUtil.java:94                public static boolean isTradeDay(Date d) { … }  // 存在但此处未被调用",
      "sqlmap/QfiiVote.xml:412                         select … from t_trade_calendar where trade_date = #tradeDate#",
      "",
      "命中要点：addDays 为自然日加减，与 isTradeDay / t_trade_calendar 并未串联",
    ],
  },
  {
    id: "lg5",
    kind: "text",
    body: "逆向结论按三类分开落账。\n\n**事实**（可指到出处）：一、征集时点校验只有一处入口，`QfiiVoteAction` 第 284 行调 `QfiiCollectServiceImpl.inCollectWindow`；二、征集日由第 127 行 `DateUtils.addDays(voteStartDate, -1)` 得出，是自然日回推；三、窗口硬编码为 09:15–15:00，与注释一致；四、多通道重复提交在 `QfiiVote.xml` 里按会议编号 + 实际持有人做唯一约束，冲突后取 `vote_time` 较早的一条。\n\n**推断**（有理由但无出处）：窗口起点取 9:15 而不是 9:30，是为了与集中竞价开始前的申报时段对齐，让实际持有人能在开市前完成意见反馈；`t_trade_calendar` 与 `isTradeDay` 早已存在却没有被征集日计算调用，更像是历史遗漏而非有意为之。\n\n**待确认**（不接受我自行补齐）：征集日到底应当是「投票起始日前一自然日」还是「前一交易日」。代码事实是自然日，业务语义大概率是交易日 —— 一旦投票起始日为节后首个交易日，自然日回推会落到节假日，征集窗口整体错开一天。这一条既是逆向缺陷，也是规则歧义，必须由业务责任人裁决后才能进入设计。",
  },
  {
    id: "lg6",
    kind: "handoff",
    from: "architecture",
    to: "requirement",
    title: "架构智能体 → 需求智能体：存量征集逻辑解析结论（含三类标注）",
    scope: [
      "仅覆盖 QFII 征集投票：征集时点校验、重复投票判定、征集结果报送三条链路",
      "事实项附文件与行号出处，推断项附推理依据，两者不得合并陈述",
      "对外保持与 vote.sseinfo.com 的报送字段与响应码一致，接口契约不参与重构",
    ],
    done: [
      "征集时点唯一入口与调用链已定位，svn r4187 为基线版本",
      "重复投票「时间优先、以第一次为准」为代码事实，已确认无第二处实现",
      "9:15–15:00 窗口边界为代码事实，边界闭合方式（含端点）已核对",
    ],
    open: [
      "待确认：征集日是前一自然日（代码事实）还是前一交易日（业务推断），跨节假日结论不同",
      "待确认：QFII 名义持有人身份校验在存量代码中无独立实现，是否被通行证系统前置承担",
    ],
    evidence: ["ev-src-01", "ev-trace-02"],
  },
  {
    id: "lg7",
    kind: "controlled",
    conn: "上证信息投票平台 · vote.sseinfo.com",
    tier: "readonly",
    action: "只读拉取投票平台接口契约与交易日历，用于比对逆向结论",
    traceId: "trc-9f2b41c7",
    steps: [
      { label: "工具选择", state: "ok" },
      { label: "身份与分级授权", state: "ok" },
      { label: "上下文与参数校验", state: "ok" },
      { label: "连接器执行", state: "ok" },
      { label: "结果完整性检查", state: "ok" },
      { label: "调用审计", state: "ok" },
      { label: "任务状态回写", state: "ok" },
    ],
  },
  {
    id: "lg8",
    kind: "gate",
    gate: "G1 需求与设计",
    node: "架构设计",
    verdict: "block",
    reviewer: "独立审查智能体 · review-legacy-1",
    checks: [
      { dim: "事实可追溯", state: "pass", note: "11 条规则全部附 svn r4187 出处，行号可复核" },
      { dim: "推断与事实分离", state: "warn", note: "9:15 起点的对齐理由仍为推断，设计文档中未加标注" },
      {
        dim: "业务语义一致",
        state: "fail",
        note: "征集日按「前一自然日」写入设计，与投票平台交易日历语义不符：2025-10-08 起投时自然日回推落到 10-07 假日",
      },
      { dim: "接口契约不变", state: "pass", note: "vote-org-api.yaml 报送字段与响应码零变更，比对通过" },
      { dim: "待确认项闭环", state: "fail", note: "2 项待确认未经人工裁决即进入架构设计，违反逆向标注纪律" },
      { dim: "覆盖完整性", state: "pass", note: "存量 3 条链路均有对应新模块，无遗漏分支" },
    ],
    evidence: ["ev-src-01", "ev-review-03"],
  },
  {
    id: "lg9",
    kind: "rework",
    reason: "业务语义一致与待确认项闭环两维度未通过：逆向出的征集日规则与实际业务语义不符，需人工确认后修正",
    fromNode: "架构设计",
    toNode: "需求逆向",
    role: "requirement",
    round: 2,
    redo: [
      "重写征集日规则：以交易日历回推，并明确标注它是修正后的业务语义而非代码事实",
      "两项待确认提交人工检查点裁决，裁决结论作为验收基线写回规则清单",
      "推断项在规则清单中单独成节并标注推理依据，不与事实混排",
    ],
    keep: [
      "征集时点唯一入口与调用链事实（QfiiVoteAction:284 → inCollectWindow）",
      "重复投票时间优先、以第一次为准的规则与唯一约束事实",
      "与 vote.sseinfo.com 的接口契约比对结论（trc-9f2b41c7 已留痕）",
      "9:15–15:00 窗口边界事实与端点闭合方式核对结果",
    ],
  },
  {
    id: "lg10",
    kind: "checkpoint",
    node: "需求逆向",
    question: "征集日应以自然日还是交易日回推？名义持有人身份校验由谁承担？",
    facts: [
      { label: "代码事实", value: "DateUtils.addDays(voteStartDate, -1) — 自然日回推，svn r4187", tone: "info" },
      { label: "冲突证据", value: "起投日为节后首个交易日时，回推落到节假日，窗口整体错开一天", tone: "warn" },
      { label: "现成能力", value: "VoteDateUtil.isTradeDay 与 t_trade_calendar 已存在但未被调用", tone: "info" },
      { label: "监管语义", value: "QFII 为名义持有人，须在行使表决权前向实际持有人征集意见", tone: "info" },
      { label: "身份校验", value: "存量代码无独立实现，疑由通行证系统前置承担，无出处", tone: "warn" },
      { label: "影响面", value: "仅影响征集日计算入口，重复投票与报送链路不受波及", tone: "ok" },
    ],
    options: [
      "确认为前一交易日，按交易日历回推并保留自然日行为为历史缺陷",
      "维持自然日回推，与存量行为完全对齐",
      "退回源码解析，继续找是否存在第二处征集日计算",
    ],
    decided: "确认为前一交易日，按交易日历回推并保留自然日行为为历史缺陷",
    decidedBy: "me@agentflow.dev",
  },
  {
    id: "lg11",
    kind: "handoff",
    from: "requirement",
    to: "architecture",
    title: "需求智能体 → 架构智能体：定向返工交接（第 2 轮，规则已人工裁决）",
    scope: [
      "仅替换征集日回推规则与其下游设计，其余规则与接口契约结论沿用第 1 轮",
      "征集日改为按 t_trade_calendar 取投票起始日的前一交易日，窗口仍为 9:15–15:00",
      "名义持有人身份校验按裁决结论前置到通行证系统，新系统只做结果校验",
    ],
    done: [
      "征集日规则标注由「待确认」转为「已人工确认」，出处记为检查点裁决而非源码",
      "自然日回推作为历史缺陷单独记账，不随重写继承",
      "推断项独立成节并标注依据，事实节内不含任何无出处陈述",
    ],
    open: ["存量已按自然日生成的历史征集记录是否回溯校正，留待交付验收阶段单独评估"],
    evidence: ["ev-decide-04"],
  },
  {
    id: "lg12",
    kind: "tool",
    tool: "shell",
    label: "shell",
    meta: "mvn -q -Dtest=CollectDayResolverTest test",
    status: "ok",
    lines: [
      "$ mvn -q -Dtest=CollectDayResolverTest test",
      "",
      " CollectDayResolverTest  (11 tests)  0.38s   vote_org_qfii (JDK 17)",
      " 起投日为节后首个交易日_征集日应取节前最后一个交易日   2025-10-09 → 2025-09-30",
      " 起投日为周一_征集日应取上周五                       2025-11-17 → 2025-11-14",
      " 交易日历缺失年度_应抛出显式异常而非静默回退自然日      throws CalendarMissingException",
      "",
      " Tests run: 11, Failures: 0, Errors: 0, Skipped: 0",
      " [INFO] BUILD SUCCESS  ·  Total time: 1.42s",
    ],
  },
  {
    id: "lg13",
    kind: "gate",
    gate: "G1 需求与设计",
    node: "架构设计",
    verdict: "pass",
    reviewer: "独立审查智能体 · review-legacy-1（第 2 轮）",
    checks: [
      { dim: "事实可追溯", state: "pass", note: "事实项出处不变，返工未改动第 1 轮已闭环证据" },
      { dim: "推断与事实分离", state: "pass", note: "推断独立成节并标注依据，设计文档三类标注齐备" },
      { dim: "业务语义一致", state: "pass", note: "征集日按 t_trade_calendar 回推，跨节假日样本 11 例结论正确" },
      { dim: "接口契约不变", state: "pass", note: "报送字段与响应码复跑比对一致，vote-org-api.yaml 未改动" },
      { dim: "待确认项闭环", state: "pass", note: "2 项均由人工裁决，裁决人与结论已入证据链" },
      { dim: "覆盖完整性", state: "pass", note: "历史缺陷单独记账，未混入新系统行为定义" },
    ],
    evidence: ["ev-decide-04", "ev-review-05"],
  },
  {
    id: "lg14",
    kind: "diff",
    summary: "征集域在 vote_org_qfii 重写：交易日历回推 + 时间优先判定，对外契约零变更",
    files: [
      { path: "src/main/java/com/sse/vote/qfii/collect/CollectWindowService.java", added: 148, removed: 0 },
      { path: "src/main/java/com/sse/vote/qfii/collect/CollectDayResolver.java", added: 96, removed: 0 },
      { path: "src/main/java/com/sse/vote/qfii/calendar/TradeCalendarRepository.java", added: 74, removed: 0 },
      { path: "src/main/java/com/sse/vote/qfii/collect/DuplicateVoteChecker.java", added: 82, removed: 0 },
      { path: "src/test/java/com/sse/vote/qfii/collect/CollectDayResolverTest.java", added: 137, removed: 0 },
      { path: "src/test/java/com/sse/vote/qfii/collect/CollectWindowServiceTest.java", added: 119, removed: 0 },
    ],
  },
  {
    id: "lg15",
    kind: "approval",
    command: "mvn clean verify -Pintegration -Djacoco.skip=false",
    rationale:
      "需要在沙箱内跑征集域全量用例与跨模块集成验证，覆盖交易日历回推、9:15–15:00 时点校验与多通道重复提交三条链路。命令会写入 target/site/jacoco 覆盖率报告，不触达任何外部系统。",
    risk: "low",
  },
  {
    id: "lg16",
    kind: "tool",
    tool: "shell",
    label: "shell",
    meta: "mvn clean verify -Pintegration -Djacoco.skip=false",
    status: "ok",
    lines: [
      "$ mvn clean verify -Pintegration -Djacoco.skip=false",
      "",
      " CollectDayResolverTest        (11 tests)  0.38s",
      " CollectWindowServiceTest      (18 tests)  0.51s",
      " DuplicateVoteCheckerTest      (14 tests)  0.44s",
      " CollectReportContractIT       (9 tests)   1.86s   报送字段与响应码比对",
      " LegacyBehaviorDiffIT          (6 tests)   1.12s   与 svn r4187 行为差异回归",
      "",
      " [INFO] jacoco 覆盖率报告",
      " collect 包                    行 94.6 | 分支 91.2 | 方法 97.8",
      " calendar 包                   行 96.1 | 分支 92.5 | 方法 100",
      "",
      " Tests run: 58, Failures: 0, Errors: 0, Skipped: 2",
      " [INFO] BUILD SUCCESS  ·  Total time: 9.74s",
    ],
  },
  {
    id: "lg17",
    kind: "tests",
    passed: 56,
    failed: 0,
    skipped: 2,
    ms: 9740,
  },
  {
    id: "lg18",
    kind: "gate",
    gate: "G3 集成验证",
    node: "集成验证",
    verdict: "pass",
    reviewer: "测试智能体 · integration-legacy-2",
    checks: [
      { dim: "行为等价性", state: "pass", note: "与 svn r4187 逐场景比对，仅征集日一处按裁决结论有意偏离并已记账" },
      { dim: "接口契约不变", state: "pass", note: "CollectReportContractIT 9 例通过，向 vote.sseinfo.com 报送字段零增删" },
      { dim: "时点校验", state: "pass", note: "9:15–15:00 边界与跨节假日回推共 29 例覆盖，端点闭合行为一致" },
      { dim: "重复投票判定", state: "pass", note: "多通道时间优先以第一次为准，并发提交唯一约束生效" },
      { dim: "覆盖率", state: "pass", note: "collect 行 94.6 / 分支 91.2，均高于 90% 阈值" },
      { dim: "静态扫描", state: "pass", note: "spotbugs 无高危项，无遗留自然日回推调用" },
    ],
    evidence: ["ev-test-06", "ev-cover-07", "ev-scan-08"],
  },
  {
    id: "lg19",
    kind: "checkpoint",
    node: "交付验收",
    question: "QFII 征集投票逆向重写是否可以验收交付？",
    facts: [
      { label: "门禁结论", value: "G1 6/6（第 2 轮）· G3 6/6，无阻断项", tone: "ok" },
      { label: "定向返工", value: "1 次 · 架构设计 → 需求逆向，仅重做征集日规则与其下游设计", tone: "info" },
      { label: "结论标注", value: "事实 11 条 / 推断 2 条 / 待确认 0 条，待确认均已人工裁决", tone: "ok" },
      { label: "语义修正", value: "征集日由自然日回推改为交易日回推，存量行为记为历史缺陷", tone: "ok" },
      { label: "对外契约", value: "vote.sseinfo.com 报送字段与响应码零变更，比对留痕 trc-9f2b41c7", tone: "ok" },
      { label: "测试", value: "56 通过 / 0 失败 / 2 跳过 · 分支覆盖 91.2%", tone: "ok" },
      { label: "未决问题", value: "存量按自然日生成的历史征集记录尚未回溯校正", tone: "warn" },
    ],
    options: ["同意验收交付", "先出历史征集记录回溯方案", "退回集成验证补充存量比对场景"],
    decided: "先出历史征集记录回溯方案",
    decidedBy: "me@agentflow.dev",
  },
];
