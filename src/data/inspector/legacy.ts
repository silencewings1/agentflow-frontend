/* ============== 存量系统逆向重构（wf-legacy）的检查面板现场 ==============
   这套现场要与 data/streams/legacy.ts 的事件流互为印证。事件流讲的是
   「事实 / 推断 / 待确认三类结论必须分开标注，只有事实可以直接进入设计」，
   检查面板则要让这条叙事可核验：

     files    逆向重写会产出新的征集域与规则文档，改动面天然比缺陷修复大 ——
              新增的是域服务与交易日历，被降级的是存量对应模块的薄适配层
     diffs    把「自然日回推 → 交易日历取前一交易日」这处语义修正摊到行上，
              它既是本次逆向的关键缺陷，也是第 1 轮门禁 block 的那一维
     evidence 逆向类证据的特点是 source 必须指到存量源码的类名与版本 ——
              指不到出处的结论只能算推断，不能算事实
     replay   有一步 fail（逆向规则与业务语义不符被门禁拦下）与一步人工裁决，
              说明「代码怎么写的」不等于「业务要什么」
     terminal 保留读取存量源码与交易日历用例两段现场，跨节假日样本可复算

   业务背景：存量系统 sseinternetvote（Java / Struts + iBATIS，包名
   com.sse.internetvote，svn r4187，无设计文档、无测试目录）中 QFII 征集投票
   规则散落在 action 与 service 两层。需在 vote_org_qfii（com.sse.vote.qfii，
   分支 docs/qfii-rules）重写，对外保持与 vote.sseinfo.com 的接口契约不变。
   关键缺陷：存量用 DateUtils.addDays(voteStartDate, -1) 自然日回推征集日，
   跨节假日会算错一天（样本 2025-10-09 起投，征集日应为 2025-09-30）。
   正确规则是取前一交易日，窗口 9:15-15:00；多通道重复投票按时间优先，
   以第一次为准。
   ========================================================================= */

import type { DiffLine, FileNode } from "../mock";
import type { EvidenceItem, ReplayStep } from "../settings";
import type { InspectorBundle } from "./bundle";

/* 文件树：路径与事件流 lg14 的 diff 文件列表逐一对应。
   added 的是本次逆向重写新建的征集域、交易日历与规则文档 —— 逆向重构的产物
   不只是代码，规则说明本身就是交付物之一（存量系统缺的正是它）。
   modified 的是被降为薄适配层的既有模块：征集时点校验从 action 与 service
   两层收口到 CollectDayResolver，原调用点只保留转发。
   不带 status 的文件是判定范围的上下文（如对外报送契约），本次零变更 ——
   「接口契约不参与重构」这条约束要在界面上看得见。 */
const files: FileNode[] = [
  {
    name: "src/main/java/com/sse/vote/qfii",
    kind: "dir",
    children: [
      {
        name: "collect",
        kind: "dir",
        children: [
          /* 征集日回推的唯一裁决点：存量的自然日回推在这里被交易日历取代 */
          { name: "CollectDayResolver.java", kind: "file", status: "added", lines: 96 },
          { name: "CollectWindowService.java", kind: "file", status: "added", lines: 148 },
          { name: "DuplicateVoteChecker.java", kind: "file", status: "added", lines: 82 },
          /* 存量 QfiiCollectServiceImpl 的对位模块，重写后只做转发与事务边界 */
          { name: "CollectService.java", kind: "file", status: "modified", lines: 74 },
        ],
      },
      {
        name: "calendar",
        kind: "dir",
        children: [
          { name: "TradeCalendarRepository.java", kind: "file", status: "added", lines: 74 },
          { name: "TradeCalendar.java", kind: "file", status: "added", lines: 58 },
        ],
      },
      {
        name: "meeting",
        kind: "dir",
        children: [
          /* 存量 QfiiVoteAction 里的时点校验被移出，这里只剩会议信息查询 */
          { name: "MeetingQueryService.java", kind: "file", status: "modified", lines: 96 },
        ],
      },
      {
        name: "report",
        kind: "dir",
        children: [
          /* 报送链路只换数据来源，字段与响应码不动，因此不带 status */
          { name: "CollectReportClient.java", kind: "file", lines: 134 },
        ],
      },
    ],
  },
  {
    name: "src/main/resources",
    kind: "dir",
    children: [
      {
        name: "mapper",
        kind: "dir",
        children: [
          { name: "TradeCalendarMapper.xml", kind: "file", status: "added", lines: 62 },
          { name: "VoteRecordMapper.xml", kind: "file", status: "modified", lines: 108 },
        ],
      },
      /* 对外契约：比对通过、零变更，是「重构不改接口」的物证 */
      { name: "vote-org-api.yaml", kind: "file" },
    ],
  },
  {
    name: "docs/reverse",
    kind: "dir",
    children: [
      /* 规则说明文档：事实 / 推断 / 待确认三类标注的落点，存量系统缺失的交付物 */
      { name: "qfii-collect-rules.md", kind: "file", status: "added", lines: 216 },
      { name: "legacy-behavior-diff.md", kind: "file", status: "added", lines: 88 },
    ],
  },
  {
    name: "src/test/java/com/sse/vote/qfii/collect",
    kind: "dir",
    children: [
      { name: "CollectDayResolverTest.java", kind: "file", status: "added", lines: 137 },
      { name: "CollectWindowServiceTest.java", kind: "file", status: "added", lines: 119 },
      { name: "DuplicateVoteCheckerTest.java", kind: "file", status: "added", lines: 94 },
    ],
  },
  { name: "pom.xml", kind: "file" },
];

/* diffs：key 与上面文件树拼出的路径完全一致（父目录名 + / + 文件名）。
   三个 key 覆盖这次语义修正的三个层次：
     CollectDayResolver  —— 裁决逻辑本身，自然日回推被交易日历取代
     CollectService      —— 存量对位模块降为薄适配层，旧回推调用被摘除
     CollectDayResolverTest —— 把跨节假日样本固化为验收基线 */
const diffs: Record<string, DiffLine[]> = {
  /* 逆向重写的核心：存量 QfiiCollectServiceImpl:127 的
     DateUtils.addDays(voteStartDate, -1) 是自然日回推，跨节假日会落到非交易日。
     这里改为查交易日历取前一交易日，并且日历缺失时显式抛异常 ——
     静默回退到自然日等于把已经裁决过的缺陷又放回来。 */
  "src/main/java/com/sse/vote/qfii/collect/CollectDayResolver.java": [
    { type: "hunk", text: "@@ -1,26 +1,40 @@ public final class CollectDayResolver" },
    { type: "ctx", n: 1, text: "package com.sse.vote.qfii.collect;" },
    { type: "ctx", n: 2, text: "" },
    { type: "del", n: 3, text: "import org.apache.commons.lang3.time.DateUtils;" },
    { type: "add", n: 3, text: "import java.time.LocalDate;" },
    { type: "add", n: 4, text: "import java.time.LocalTime;" },
    { type: "add", n: 5, text: "import com.sse.vote.qfii.calendar.TradeCalendar;" },
    { type: "ctx", n: 6, text: "" },
    { type: "del", n: 7, text: "/** 征集日：投票起始日前一天 09:15 - 15:00。（逆向自 svn r4187） */" },
    { type: "add", n: 7, text: "/** 征集日 = 股东会投票起始日的「前一交易日」，窗口 09:15 - 15:00。" },
    { type: "add", n: 8, text: " *" },
    { type: "add", n: 9, text: " *  存量 QfiiCollectServiceImpl:127 用自然日回推，跨节假日会算错一天：" },
    { type: "add", n: 10, text: " *  2025-10-09 起投时回推到 2025-10-08（假日），正确结果是 2025-09-30。" },
    { type: "add", n: 11, text: " *  该行为已由人工检查点裁决为历史缺陷，不随重写继承。 */" },
    { type: "ctx", n: 12, text: "public final class CollectDayResolver {" },
    { type: "add", n: 13, text: "    /** 窗口两端均闭合，核对自 svn r4187，属事实项而非推断。 */" },
    { type: "add", n: 14, text: "    public static final LocalTime WINDOW_OPEN = LocalTime.of(9, 15);" },
    { type: "add", n: 15, text: "    public static final LocalTime WINDOW_CLOSE = LocalTime.of(15, 0);" },
    { type: "add", n: 16, text: "" },
    { type: "add", n: 17, text: "    private final TradeCalendar calendar;" },
    { type: "ctx", n: 18, text: "" },
    { type: "ctx", n: 19, text: "    /** 由投票起始日推出征集日。 */" },
    { type: "del", n: 20, text: "    public Date resolve(Date voteStartDate) {" },
    { type: "del", n: 21, text: "        // 征集日：投票起始日前一天 09:15 - 15:00" },
    { type: "del", n: 22, text: "        return DateUtils.addDays(voteStartDate, -1);" },
    { type: "add", n: 20, text: "    public LocalDate resolve(LocalDate voteStartDate) {" },
    { type: "add", n: 21, text: "        if (!calendar.covers(voteStartDate)) {" },
    { type: "add", n: 22, text: "            // 日历缺失时必须失败，不得静默回退到自然日回推" },
    { type: "add", n: 23, text: "            throw new CalendarMissingException(voteStartDate);" },
    { type: "add", n: 24, text: "        }" },
    { type: "add", n: 25, text: "        return calendar.previousTradeDay(voteStartDate);" },
    { type: "ctx", n: 26, text: "    }" },
    { type: "add", n: 27, text: "" },
    { type: "add", n: 28, text: "    /** 时点校验：仅在征集日的 09:15 - 15:00 之间受理意见征集。 */" },
    { type: "add", n: 29, text: "    public boolean inCollectWindow(LocalDate voteStartDate, LocalDateTime now) {" },
    { type: "add", n: 30, text: "        if (!resolve(voteStartDate).equals(now.toLocalDate())) {" },
    { type: "add", n: 31, text: "            return false;" },
    { type: "add", n: 32, text: "        }" },
    { type: "add", n: 33, text: "        LocalTime t = now.toLocalTime();" },
    { type: "add", n: 34, text: "        return !t.isBefore(WINDOW_OPEN) && !t.isAfter(WINDOW_CLOSE);" },
    { type: "add", n: 35, text: "    }" },
    { type: "ctx", n: 36, text: "}" },
  ],
  /* 存量对位模块降为薄适配层：征集日计算与时点校验全部收口到
     CollectDayResolver，这里只保留转发与事务边界。
     旧的 addDays 调用必须物理摘除 —— 留着就还有第二处语义来源。 */
  "src/main/java/com/sse/vote/qfii/collect/CollectService.java": [
    { type: "hunk", text: "@@ -41,26 +41,22 @@ public class CollectService" },
    { type: "ctx", n: 41, text: "    /** 受理一次意见征集提交。 */" },
    { type: "ctx", n: 42, text: "    @Transactional(rollbackFor = Exception.class)" },
    { type: "ctx", n: 43, text: "    public CollectResult accept(CollectCommand cmd) {" },
    { type: "ctx", n: 44, text: "        Meeting meeting = meetingQuery.byId(cmd.getMeetingId());" },
    { type: "del", n: 45, text: "        // 逆向自 QfiiCollectServiceImpl:127 —— 自然日回推" },
    { type: "del", n: 46, text: "        Date collectDay = DateUtils.addDays(meeting.getVoteStartDate(), -1);" },
    { type: "del", n: 47, text: "        if (!DateUtils.isSameDay(collectDay, cmd.getSubmitAt())) {" },
    { type: "del", n: 48, text: "            return CollectResult.outOfTime();" },
    { type: "del", n: 49, text: "        }" },
    { type: "del", n: 50, text: "        int minutes = minutesOfDay(cmd.getSubmitAt());" },
    { type: "del", n: 51, text: "        if (minutes < 9 * 60 + 15 || minutes > 15 * 60) {" },
    { type: "del", n: 52, text: "            return CollectResult.outOfTime();" },
    { type: "del", n: 53, text: "        }" },
    { type: "add", n: 45, text: "        // 征集日与窗口判定收口到 CollectDayResolver：" },
    { type: "add", n: 46, text: "        // 本类降为薄适配层，不再持有任何日期语义。" },
    { type: "add", n: 47, text: "        if (!collectDay.inCollectWindow(" },
    { type: "add", n: 48, text: "                meeting.getVoteStartDate(), cmd.getSubmitAt())) {" },
    { type: "add", n: 49, text: "            return CollectResult.outOfTime();" },
    { type: "add", n: 50, text: "        }" },
    { type: "ctx", n: 51, text: "        // 多通道重复投票按时间优先，以第一次提交为准" },
    { type: "ctx", n: 52, text: "        VoteRecord kept = duplicateChecker.record(cmd.toRecord());" },
    { type: "ctx", n: 53, text: "        return CollectResult.accepted(kept);" },
    { type: "ctx", n: 54, text: "    }" },
    { type: "del", n: 55, text: "" },
    { type: "del", n: 56, text: "    private int minutesOfDay(Date d) {" },
    { type: "del", n: 57, text: "        Calendar c = Calendar.getInstance();" },
    { type: "del", n: 58, text: "        c.setTime(d);" },
    { type: "del", n: 59, text: "        return c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);" },
    { type: "del", n: 60, text: "    }" },
    { type: "ctx", n: 55, text: "}" },
  ],
  /* 用例是这次语义修正的验收基线：跨节假日、跨周末、日历缺失三类样本
     分别锁住「取前一交易日」「不得回退自然日」「窗口端点闭合」三条结论。
     2025-10-09 → 2025-09-30 就是人工检查点裁决时用的那个样本。 */
  "src/test/java/com/sse/vote/qfii/collect/CollectDayResolverTest.java": [
    { type: "hunk", text: "@@ -0,0 +1,32 @@ class CollectDayResolverTest" },
    { type: "add", n: 1, text: "class CollectDayResolverTest {" },
    { type: "add", n: 2, text: "" },
    { type: "add", n: 3, text: "    /** 存量自然日回推的反例样本：国庆后首个交易日起投。 */" },
    { type: "add", n: 4, text: "    @Test" },
    { type: "add", n: 5, text: "    void 起投日为节后首个交易日_征集日应取节前最后一个交易日() {" },
    { type: "add", n: 6, text: "        LocalDate collectDay = resolver.resolve(LocalDate.of(2025, 10, 9));" },
    { type: "add", n: 7, text: "        assertThat(collectDay).isEqualTo(LocalDate.of(2025, 9, 30));" },
    { type: "add", n: 8, text: "        // 自然日回推会得到 2025-10-08（假日），这正是存量缺陷" },
    { type: "add", n: 9, text: "        assertThat(collectDay).isNotEqualTo(LocalDate.of(2025, 10, 8));" },
    { type: "add", n: 10, text: "    }" },
    { type: "add", n: 11, text: "" },
    { type: "add", n: 12, text: "    @Test" },
    { type: "add", n: 13, text: "    void 起投日为周一_征集日应取上周五() {" },
    { type: "add", n: 14, text: "        assertThat(resolver.resolve(LocalDate.of(2025, 11, 17)))" },
    { type: "add", n: 15, text: "                .isEqualTo(LocalDate.of(2025, 11, 14));" },
    { type: "add", n: 16, text: "    }" },
    { type: "add", n: 17, text: "" },
    { type: "add", n: 18, text: "    /** 日历缺年度时必须显式失败，静默回退自然日等于让缺陷复活。 */" },
    { type: "add", n: 19, text: "    @Test" },
    { type: "add", n: 20, text: "    void 交易日历缺失年度_应抛出显式异常而非静默回退自然日() {" },
    { type: "add", n: 21, text: "        assertThatThrownBy(() -> resolver.resolve(LocalDate.of(2031, 3, 2)))" },
    { type: "add", n: 22, text: "                .isInstanceOf(CalendarMissingException.class);" },
    { type: "add", n: 23, text: "    }" },
    { type: "add", n: 24, text: "" },
    { type: "add", n: 25, text: "    /** 窗口两端闭合：09:15:00 与 15:00:00 均应受理（svn r4187 事实项）。 */" },
    { type: "add", n: 26, text: "    @ParameterizedTest" },
    { type: "add", n: 27, text: "    @ValueSource(strings = {\"09:15:00\", \"15:00:00\"})" },
    { type: "add", n: 28, text: "    void 征集窗口端点应闭合(String at) {" },
    { type: "add", n: 29, text: "        assertThat(resolver.inCollectWindow(" },
    { type: "add", n: 30, text: "                LocalDate.of(2025, 10, 9), atCollectDay(at))).isTrue();" },
    { type: "add", n: 31, text: "    }" },
    { type: "add", n: 32, text: "}" },
  ],
};

/* 证据链：逆向类任务的证据必须能回溯到存量源码的具体位置与版本 ——
   source 一律写 sseinternetvote 的类名与 svn 修订号，指不到出处的结论只能
   记作推断，不能进入设计（这是 streams/legacy.ts 的第一条纪律）。
   lg-ev-3 是三分标注结论本身的证据（事实 11 / 推断 2 / 待确认 0）。
   末 2 条刻意未闭环：历史征集记录回溯方案与交付验收都在人工检查层。 */
const evidence: EvidenceItem[] = [
  {
    id: "lg-ev-1",
    kind: "change",
    title: "13 个文件变更 · +1 034 −78（征集域重写，对外契约零变更）",
    source: "git.corp/sse/vote_org_qfii",
    version: "docs/qfii-rules@5e28b7a",
    at: "15:47",
    actor: "开发智能体 · dev-legacy-1",
    confirmed: true,
    required: true,
  },
  {
    id: "lg-ev-2",
    kind: "toolcall",
    title: "只读解析存量源码 4 文件 1 862 行 · 征集规则命中 11 处",
    source: "sseinternetvote · QfiiVoteAction:284 / QfiiCollectServiceImpl:127",
    version: "svn r4187（2019-11-06，无设计文档）",
    at: "14:52",
    actor: "受控连接层",
    confirmed: true,
    required: true,
  },
  {
    id: "lg-ev-3",
    kind: "review",
    title: "三分标注结论：事实 11 条 / 推断 2 条 / 待确认 0 条（原 2 条已裁决）",
    source: "docs/reverse/qfii-collect-rules.md · 逐条附 svn 行号出处",
    version: "rules@v2（第 2 轮，含检查点裁决回写）",
    at: "15:21",
    actor: "需求智能体 · req-legacy-1",
    confirmed: true,
    required: true,
  },
  {
    id: "lg-ev-4",
    kind: "approval",
    title: "人工裁决：征集日取前一交易日，自然日回推记为历史缺陷",
    source: "人工检查点 · 需求逆向节点（样本 2025-10-09 → 2025-09-30）",
    version: "decide@lg10",
    at: "15:14",
    actor: "me@agentflow.dev",
    confirmed: true,
    required: true,
  },
  {
    id: "lg-ev-5",
    kind: "test",
    title: "集成验证 56 passed / 0 failed / 2 skipped · 分支覆盖 91.2%",
    source: "ci.corp/pipeline/9308 · 含 LegacyBehaviorDiffIT 与 svn r4187 行为比对",
    version: "run#9308",
    at: "16:04",
    actor: "测试智能体 · integration-legacy-2",
    confirmed: true,
    required: true,
  },
  {
    id: "lg-ev-6",
    kind: "scan",
    title: "spotbugs 无高危项 · 无遗留 DateUtils.addDays 自然日回推调用",
    source: "scan.corp/spotbugs/2418 · 全仓检索 addDays 调用点 0 处",
    version: "spotbugs#2418",
    at: "16:07",
    actor: "确定性程序",
    confirmed: true,
    required: true,
  },
  {
    id: "lg-ev-7",
    kind: "change",
    title: "存量按自然日生成的历史征集记录回溯校正方案（待出）",
    source: "sseinternetvote · t_qfii_collect（2019-11 起累计 4 216 条待核）",
    version: "—",
    at: "待评估",
    actor: "业务责任人",
    confirmed: false,
    required: true,
  },
];

/* 任务回放：把「代码这么写的原因」从反复追问变成按步查证。
   stage 只用 wf-legacy 的真实节点名（源码解析 / 需求逆向 / 架构设计 /
   测试驱动开发 / 集成验证 / 交付验收）与通用阶段（任务契约 / 受控调用 /
   人工确认），换成别的名字就与编排画布对不上了。
   lg-rp-5 是刻意保留的 fail：逆向出的征集日规则与业务语义不符被 G1 拦下 ——
   门禁读的是标注质量，把推断当事实写进设计就必须 block。
   lg-rp-7 是人工确认：待确认项一律由人裁决，AI 只能请求、不能代替。 */
const replay: ReplayStep[] = [
  { id: "lg-rp-1", at: "14:46", stage: "任务契约", actor: "责任人", action: "确认逆向范围限定三条征集链路，接口契约不参与重构", materials: "contract@lg-v1", tier: "—", result: "ok" },
  { id: "lg-rp-2", at: "14:52", stage: "源码解析", actor: "受控连接层", action: "按只读权限解析 action / service / sqlmap 三层调用关系", materials: "sseinternetvote@svn r4187", tier: "readonly", result: "ok" },
  { id: "lg-rp-3", at: "15:03", stage: "需求逆向", actor: "需求智能体", action: "抽取 11 条规则并按事实 / 推断 / 待确认三类标注", materials: "rules@v1", tier: "readonly", result: "ok" },
  { id: "lg-rp-4", at: "15:06", stage: "受控调用", actor: "受控连接层", action: "只读拉取投票平台接口契约与交易日历用于比对", materials: "trc-9f2b41c7 · vote.sseinfo.com", tier: "readonly", result: "ok" },
  { id: "lg-rp-5", at: "15:09", stage: "架构设计", actor: "独立审查智能体", action: "G1 判定：征集日按前一自然日写入设计，与交易日历语义不符", materials: "review#legacy-1 · 2 项待确认未裁决", tier: "—", result: "fail" },
  { id: "lg-rp-6", at: "15:11", stage: "架构设计", actor: "主控智能体", action: "判定为语义待澄清，定向退回需求逆向，仅重做该规则及下游", materials: "rework#2 · keep 4 项已闭环事实", tier: "—", result: "ok" },
  { id: "lg-rp-7", at: "15:14", stage: "人工确认", actor: "业务责任人", action: "裁决征集日取前一交易日，自然日回推记为历史缺陷", materials: "decide@lg10 · 样本 2025-10-09 → 2025-09-30", tier: "—", result: "ok" },
  { id: "lg-rp-8", at: "15:32", stage: "测试驱动开发", actor: "开发智能体", action: "先写跨节假日用例保留失败，再实现交易日历回推", materials: "CollectDayResolverTest · 11 tests", tier: "write", result: "ok" },
  { id: "lg-rp-9", at: "16:04", stage: "集成验证", actor: "确定性程序", action: "与 svn r4187 逐场景比对，仅征集日一处按裁决有意偏离", materials: "run#9308 · 58 tests", tier: "readonly", result: "ok" },
  { id: "lg-rp-10", at: "16:12", stage: "交付验收", actor: "业务责任人", action: "四类材料已交，等待历史征集记录回溯方案", materials: "docs/reverse · 待评估 4 216 条", tier: "highrisk", result: "wait" },
];

/* 终端现场：分支 docs/qfii-rules 上的可复算过程 ——
   先看存量源码的读取与检索（逆向的输入），再看改动面（新增征集域与规则文档），
   最后看交易日历用例把跨节假日样本跑成绿色（语义修正的输出）。 */
const terminal: string[] = [
  "agentflow@sandbox  ~/workspace/vote_org_qfii  (docs/qfii-rules)",
  "$ svn info ../legacy/sseinternetvote | head -3",
  " URL: svn://svn.corp/sse/sseinternetvote/trunk",
  " Revision: 4187   ·   Last Changed Date: 2019-11-06",
  "",
  "$ grep -rn 'addDays' ../legacy/sseinternetvote/src/main/java",
  " qfii/service/QfiiCollectServiceImpl.java:127  DateUtils.addDays(meeting.getVoteStartDate(), -1);",
  " 1 match  ·  自然日回推，未串联 VoteDateUtil.isTradeDay / t_trade_calendar",
  "",
  "$ git status --short",
  " M src/main/java/com/sse/vote/qfii/collect/CollectService.java",
  " M src/main/java/com/sse/vote/qfii/meeting/MeetingQueryService.java",
  " M src/main/resources/mapper/VoteRecordMapper.xml",
  "?? src/main/java/com/sse/vote/qfii/collect/CollectDayResolver.java",
  "?? src/main/java/com/sse/vote/qfii/calendar/TradeCalendarRepository.java",
  "?? docs/reverse/qfii-collect-rules.md",
  "",
  "$ mvn -q -Dtest=CollectDayResolverTest test",
  " 起投日为节后首个交易日_征集日应取节前最后一个交易日   2025-10-09 → 2025-09-30",
  " 起投日为周一_征集日应取上周五                         2025-11-17 → 2025-11-14",
  " 交易日历缺失年度_应抛出显式异常而非静默回退自然日        CalendarMissingException",
  " 征集窗口端点应闭合[09:15:00] / [15:00:00]              受理",
  " Tests run: 11, Failures: 0, Errors: 0, Skipped: 0  ·  0.38s",
  "",
  "$ grep -rn 'addDays' src/main/java | wc -l",
  " 0   ·  存量自然日回推调用已全部摘除",
  "",
  "$ git log --oneline -2",
  " 5e28b7a docs(reverse): 征集规则三类标注定稿，待确认项均附裁决出处",
  " c93af16 feat(collect): 征集日改按交易日历取前一交易日，缺历史年度时显式失败",
  "",
];

/** 存量系统逆向重构（wf-legacy）的检查面板现场 */
export const legacyBundle: InspectorBundle = { files, diffs, evidence, replay, terminal };
