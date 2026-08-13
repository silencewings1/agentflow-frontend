/* ------------------------------- 缺陷修复事件流 -------------------------------
   这套事件流要讲的设计主张是：缺陷修复的可信性不来自「模型给出的解释」，
   而来自「先有可复现的验证标准，再谈根因与修复」这一顺序。

   因此叙事被固定为四条约束：
   1. 复现先行 —— 修复实现之前必须存在一条能稳定失败的 JUnit 用例，它既是根因的
      证据，也是修复完成的判定标准；没有它，「已修复」只是断言。
   2. 门禁由确定性程序裁决 —— 回归验证门禁读的是 mvn 的失败用例数与断言内容，
      不读修复说明。第一轮同秒样本仍然失败，门禁只能出 block。
   3. 返工是路由而不是重试 —— 回归失败沿「回归验证 → 修复实现」这条回退边定向
      回到责任节点，redo 只含被推翻的裁决逻辑与断言，keep 明确保留已闭环的复现
      用例、根因结论与对外契约比对结果，证据不重复采集。
   4. 不可逆动作必须穿过受控连接层与人工检查层 —— 合并请求是一次有 traceId 的
      受控写入，是否合入由人在收敛后的事实上判定，而不是由通过的测试自动推进。

   业务背景：QFII 投票项目（Java / Maven，仓库 vote_org_qfii，包名
   com.sse.vote.qfii）中，多通道重复投票未按「时间优先」以第一次为准——唯一约束
   冲突后直接覆盖存量记录，未比较 vote_time，同秒提交保留了后到的一条。
   ---------------------------------------------------------------------------- */

import type { AgentEvent } from "../mock";

export const bugfixStream: AgentEvent[] = [
  {
    id: "bf1",
    kind: "reasoning",
    title: "已思考 9 秒",
    body: "先不看代码，只看现象：同一实际持有人从交易系统与互联网平台各提交一次，最终留存的是后到的一条。这说明写入侧的唯一约束确实生效了（否则会有两条），但冲突之后的处理选择了覆盖而不是比较时间。所以根因大概率在唯一约束冲突的兜底分支里，而不是在各通道的入口校验里。要证明这一点，得先有一条能稳定失败的并发用例——没有可复现的失败，任何根因结论都只是推断。",
    ms: 9_200,
  },
  {
    id: "bf2",
    kind: "plan",
    steps: [
      { label: "补一条稳定失败的并发复现用例", status: "done" },
      { label: "沿写入链路定位时间优先裁决的缺失点", status: "done" },
      { label: "以最小改动修复冲突分支的裁决逻辑", status: "active" },
      { label: "跑受影响模块回归并比对对外报送契约", status: "todo" },
      { label: "汇总证据链提交评审与合并", status: "todo" },
    ],
  },
  {
    id: "bf3",
    kind: "tool",
    tool: "shell",
    label: "shell",
    meta: "mvn -Dtest=DuplicateVoteConcurrencyTest test",
    status: "fail",
    lines: [
      "$ mvn -Dtest=DuplicateVoteConcurrencyTest test",
      "",
      " [INFO] Scanning for projects...  vote_org_qfii (JDK 17)",
      "",
      " DuplicateVoteConcurrencyTest.早到通道先落库_晚到通道应被丢弃",
      " [ERROR] expected: <09:31:02 交易系统> but was: <09:31:05 互联网平台>",
      "",
      " Tests run: 3, Failures: 1, Errors: 0, Skipped: 0",
      " [ERROR] BUILD FAILURE  ·  Total time: 2.31s",
    ],
  },
  {
    id: "bf4",
    kind: "tool",
    tool: "search",
    label: "grep",
    meta: "DuplicateKeyException|vote_time — 3 files, 9 matches",
    status: "ok",
    lines: [
      "src/main/java/com/sse/vote/qfii/collect/DuplicateVoteChecker.java:63   catch (DuplicateKeyException e) {",
      "src/main/java/com/sse/vote/qfii/collect/DuplicateVoteChecker.java:64     mapper.updateByMeetingAndHolder(record); // 直接覆盖存量记录",
      "src/main/java/com/sse/vote/qfii/collect/VoteRecordWriter.java:48       record.setVoteTime(new Date());",
      "src/main/resources/mapper/VoteRecordMapper.xml:71                      vote_time datetime — 秒级精度，同秒不可排序",
    ],
  },
  {
    id: "bf5",
    kind: "text",
    body: "根因确认，并且是两层叠加的：第一层是 `DuplicateVoteChecker` 第 63 行捕获 `DuplicateKeyException` 后直接走 `updateByMeetingAndHolder` 覆盖，全程没有读取存量记录的 `vote_time`，等于把「时间优先」实现成了「后写优先」；第二层是 `vote_time` 在库里是秒级 `datetime`，即使加上时间比较，同秒的两条仍然无法排序，必须引入平台受理序号 `accept_seq` 作为同秒兜底。最小修复只动冲突分支：先按会议与实际持有人加锁读存量记录，晚到的直接丢弃并落一条审计，不改任何对外报送字段。",
  },
  {
    id: "bf6",
    kind: "handoff",
    from: "architecture",
    to: "development",
    title: "架构智能体 → 开发智能体：时间优先裁决缺失点与最小修复边界",
    scope: [
      "只改 DuplicateVoteChecker 的唯一约束冲突分支，不动各通道入口校验",
      "同秒场景以平台受理序号 accept_seq 兜底，不修改 vote_time 字段类型",
      "对外保持向 vote.sseinfo.com 报送的字段与响应码不变",
    ],
    done: [
      "DuplicateVoteConcurrencyTest 由稳定失败转为通过",
      "多通道提交最终只留存 vote_time 最早的一条，晚到记录有审计留痕",
      "既有 collect 包用例全绿，无新增外发字段",
    ],
    open: ["历史脏数据（已被覆盖的早到记录）是否本次一并回补，需人工判定"],
    evidence: ["ev-repro-01", "ev-trace-02"],
  },
  {
    id: "bf7",
    kind: "diff",
    summary: "冲突分支改为按 vote_time 裁决，晚到通道丢弃并留审计",
    files: [
      { path: "src/main/java/com/sse/vote/qfii/collect/DuplicateVoteChecker.java", added: 31, removed: 6 },
      { path: "src/main/resources/mapper/VoteRecordMapper.xml", added: 12, removed: 0 },
      { path: "src/test/java/com/sse/vote/qfii/collect/DuplicateVoteConcurrencyTest.java", added: 24, removed: 2 },
    ],
  },
  {
    id: "bf8",
    kind: "approval",
    command: "mvn -Dtest='DuplicateVote*Test,CollectWindowServiceTest' test -Djacoco.skip=false",
    rationale: "需要在沙箱内运行 collect 包回归，验证复现用例转通过且未影响征集窗口校验。命令会写入 target/site/jacoco 覆盖率报告。",
    risk: "low",
  },
  {
    id: "bf9",
    kind: "tool",
    tool: "shell",
    label: "shell",
    meta: "mvn -Dtest='DuplicateVote*Test,CollectWindowServiceTest' test -Djacoco.skip=false",
    status: "fail",
    lines: [
      "$ mvn -Dtest='DuplicateVote*Test,CollectWindowServiceTest' test -Djacoco.skip=false",
      "",
      " DuplicateVoteConcurrencyTest    (5 tests)  1.09s",
      " [ERROR] 同秒提交_应保留受理序号较小的一条",
      " [ERROR] expected accept_seq: <100237> but was: <100241>",
      " [ERROR] 同秒提交_两通道时间戳相同时不得覆盖",
      " [ERROR] expected: <no update> but was: <1 row updated>",
      " CollectWindowServiceTest        (9 tests)  0.24s  全部通过",
      "",
      " Tests run: 28, Failures: 2, Errors: 0, Skipped: 0",
      " [ERROR] BUILD FAILURE  ·  Total time: 3.18s",
    ],
  },
  {
    id: "bf10",
    kind: "tests",
    passed: 26,
    failed: 2,
    skipped: 0,
    ms: 3180,
  },
  {
    id: "bf11",
    kind: "gate",
    gate: "回归验证门禁",
    node: "回归验证",
    verdict: "block",
    reviewer: "测试智能体 · regression-1",
    checks: [
      { dim: "复现用例转通过", state: "pass", note: "原失败用例「早到通道先落库_晚到通道应被丢弃」已通过" },
      { dim: "回归结果", state: "fail", note: "同秒样本 2 例失败：vote_time 相同时 accept_seq 未参与比较，仍执行了覆盖" },
      { dim: "对外契约兼容", state: "pass", note: "报送字段与响应码比对无差异，vote-org-api.yaml 未改动" },
      { dim: "事务与幂等", state: "warn", note: "丢弃分支未显式回滚，依赖调用方事务边界" },
      { dim: "改动范围", state: "pass", note: "仅冲突分支与对应 mapper，未溢出交接物 scope" },
      { dim: "日志与可观测", state: "pass", note: "晚到记录丢弃已打点，含 traceId、会议编号与来源通道" },
    ],
    evidence: ["ev-diff-03", "ev-test-04"],
  },
  {
    id: "bf12",
    kind: "rework",
    reason: "回归结果维度未通过：同秒提交未纳入时间优先裁决，仍按后写覆盖",
    fromNode: "回归验证",
    toNode: "修复实现",
    role: "development",
    round: 2,
    redo: [
      "冲突分支在 vote_time 相等时追加 accept_seq 比较，取序号较小的一条",
      "丢弃分支显式标记事务不写入，避免依赖调用方边界",
      "同秒用例补齐 accept_seq 与「零行更新」两条断言",
    ],
    keep: [
      "DuplicateVoteConcurrencyTest 的复现用例与失败样本",
      "时间优先裁决缺失点的根因结论与调用链证据",
      "对外报送契约比对结论与 CollectWindowServiceTest 全绿结果",
    ],
  },
  {
    id: "bf13",
    kind: "handoff",
    from: "testing",
    to: "development",
    title: "测试智能体 → 开发智能体：定向返工交接（第 2 轮）",
    scope: ["仅补同秒裁决与丢弃分支的事务语义，不重做已通过的复现用例与契约比对"],
    done: [
      "vote_time 相同时以 accept_seq 较小者留存，且不产生任何 update",
      "同秒场景有独立断言覆盖，回归全绿",
    ],
    evidence: ["ev-gate-05"],
  },
  {
    id: "bf14",
    kind: "tool",
    tool: "edit",
    label: "apply_patch",
    meta: "2 files changed · +18 −4",
    status: "ok",
  },
  {
    id: "bf15",
    kind: "tool",
    tool: "shell",
    label: "shell",
    meta: "mvn clean test -Djacoco.skip=false",
    status: "ok",
    lines: [
      "$ mvn clean test -Djacoco.skip=false",
      "",
      " DuplicateVoteConcurrencyTest    (7 tests)  1.21s",
      " DuplicateVoteCheckerTest       (15 tests) 0.42s",
      " CollectWindowServiceTest        (9 tests)  0.23s",
      "",
      " [INFO] jacoco 覆盖率报告",
      " DuplicateVoteChecker.java      行 97.1 | 分支 93.8 | 方法 100",
      "",
      " Tests run: 32, Failures: 0, Errors: 0, Skipped: 1",
      " [INFO] BUILD SUCCESS  ·  Total time: 3.86s",
    ],
  },
  {
    id: "bf16",
    kind: "tests",
    passed: 31,
    failed: 0,
    skipped: 1,
    ms: 3860,
  },
  {
    id: "bf17",
    kind: "gate",
    gate: "回归验证门禁",
    node: "回归验证",
    verdict: "pass",
    reviewer: "测试智能体 · regression-1（第 2 轮）",
    checks: [
      { dim: "复现用例转通过", state: "pass", note: "复现用例与同秒用例共 7 例全部通过" },
      { dim: "回归结果", state: "pass", note: "同秒场景按 accept_seq 取较小者，晚到提交零行更新" },
      { dim: "对外契约兼容", state: "pass", note: "报送契约比对复跑一致，无字段增删" },
      { dim: "事务与幂等", state: "pass", note: "丢弃分支显式不写入，重复提交结果稳定" },
      { dim: "改动范围", state: "pass", note: "返工仅动 2 个文件 +18 −4，未溢出返工清单" },
      { dim: "日志与可观测", state: "pass", note: "同秒裁决新增打点，记录被丢弃的受理序号" },
    ],
    evidence: ["ev-diff-06", "ev-test-07", "ev-cover-08"],
  },
  {
    id: "bf18",
    kind: "controlled",
    conn: "代码仓库平台 · vote_org_qfii",
    tier: "write",
    action: "创建合并请求 fix/duplicate-vote-order → main",
    traceId: "trc-3a7d91b2",
    steps: [
      { label: "工具选择", state: "ok" },
      { label: "身份与分级授权", state: "ok" },
      { label: "上下文与参数校验", state: "ok" },
      { label: "连接器执行", state: "ok" },
      { label: "结果完整性检查", state: "ok" },
      { label: "调用审计", state: "ok" },
      { label: "任务状态回写", state: "ok" },
    ],
    approver: "me@agentflow.dev",
  },
  {
    id: "bf19",
    kind: "checkpoint",
    node: "评审交付",
    question: "重复投票时间优先修复是否可以合入 main？",
    facts: [
      { label: "门禁结论", value: "6/6 维度通过（第 2 轮）", tone: "ok" },
      { label: "定向返工", value: "1 次 · 回归验证 → 修复实现，仅重做同秒裁决与断言", tone: "info" },
      { label: "复现验证", value: "原失败用例已转通过，同秒样本新增 2 条断言", tone: "ok" },
      { label: "改动规模", value: "3 文件 · +67 −8，未触及通道入口与对外报送", tone: "ok" },
      { label: "测试", value: "31 通过 / 0 失败 / 1 跳过 · 分支覆盖 93.8%", tone: "ok" },
      { label: "受控写入", value: "1 次合并请求创建，已留痕 trc-3a7d91b2", tone: "info" },
      { label: "未决问题", value: "历史被覆盖的早到记录未回补，需单独评估数据修复", tone: "warn" },
    ],
    options: ["同意合入", "先出历史数据回补方案", "退回修复实现"],
    decided: "先出历史数据回补方案",
    decidedBy: "me@agentflow.dev",
  },
];
