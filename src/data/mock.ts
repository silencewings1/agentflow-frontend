import type { AgentRole, PermTier } from "./settings";

export type Theme = "lumen" | "ink";

export type SessionState = "running" | "review" | "done" | "failed" | "idle";

export interface Session {
  id: string;
  title: string;
  repo: string;
  branch: string;
  state: SessionState;
  time: string;
  bucket: "今天" | "昨天" | "更早";
  diff: { added: number; removed: number; files: number };
  turns: number;
  /** 该会话所用的编排（workflowTemplates 的 id）。
      不同类型的任务本就该走不同流水线：全都是「需求开发」会让人以为
      这套编排只有一条路径。切换会话时顶部流水线要跟着换。 */
  workflow: string;
}

/* 会话只保留本次 QFII 投票重构相关的任务：无关项目会稀释注意力，
   也让人误以为这套编排是通用待办列表。 */
export const sessions: Session[] = [
  {
    id: "s-1",
    title: "提取 QFII 投票需求并在 vote_org_qfii 重构",
    repo: "vote_org_qfii",
    branch: "feat/qfii-vote-refactor",
    state: "review",
    time: "2 分钟前",
    bucket: "今天",
    diff: { added: 148, removed: 62, files: 5 },
    turns: 7,
    workflow: "wf-feature",
  },
  {
    id: "s-2",
    title: "逆向 QFII 征集投票的业务规则与时点约束",
    repo: "sseinternetvote",
    branch: "docs/qfii-rules",
    state: "running",
    time: "刚刚",
    bucket: "今天",
    diff: { added: 302, removed: 0, files: 6 },
    turns: 12,
    workflow: "wf-legacy",
  },
  {
    id: "s-3",
    title: "核对与上证信息投票平台的接口契约不变",
    repo: "vote_org_qfii",
    branch: "test/platform-contract",
    state: "done",
    time: "上午 10:24",
    bucket: "今天",
    diff: { added: 24, removed: 31, files: 3 },
    turns: 4,
    workflow: "wf-review",
  },
  {
    id: "s-4",
    title: "为名册与征集结果上传补齐边界用例",
    repo: "vote_org_qfii",
    branch: "test/upload-edges",
    state: "failed",
    time: "昨天 21:40",
    bucket: "昨天",
    diff: { added: 96, removed: 4, files: 2 },
    turns: 9,
    workflow: "wf-unit",
  },
  {
    id: "s-5",
    title: "梳理通行证对接与权限审计的调用链",
    repo: "sseinternetvote",
    branch: "docs/auth-callgraph",
    state: "done",
    time: "昨天 16:02",
    bucket: "昨天",
    diff: { added: 41, removed: 0, files: 4 },
    turns: 5,
    workflow: "wf-review",
  },
  {
    id: "s-6",
    title: "修复多通道重复投票未按时间优先裁决",
    repo: "vote_org_qfii",
    branch: "fix/duplicate-vote-order",
    state: "done",
    time: "8 月 11 日",
    bucket: "更早",
    diff: { added: 38, removed: 6, files: 2 },
    turns: 11,
    workflow: "wf-bugfix",
  },
  {
    id: "s-7",
    title: "整改 fastjson 与 commons-io 的已知漏洞",
    repo: "vote_org_qfii",
    branch: "chore/cve-upgrade",
    state: "done",
    time: "8 月 8 日",
    bucket: "更早",
    diff: { added: 27, removed: 43, files: 6 },
    turns: 8,
    workflow: "wf-cve",
  },
];

/* ---------------------------------- events --------------------------------- */

export type EventBase = { id: string };

export type AgentEvent = EventBase &
  (
    | { kind: "user"; text: string; attachments?: string[] }
    | { kind: "reasoning"; title: string; body: string; ms: number }
    | { kind: "text"; body: string }
    | {
        kind: "plan";
        steps: { label: string; status: "done" | "active" | "todo" }[];
      }
    | {
        kind: "tool";
        tool: "read" | "search" | "edit" | "shell" | "web";
        label: string;
        meta: string;
        lines?: string[];
        status: "ok" | "running" | "warn" | "fail";
      }
    | {
        kind: "diff";
        summary: string;
        files: { path: string; added: number; removed: number }[];
      }
    | {
        kind: "approval";
        command: string;
        rationale: string;
        risk: "low" | "medium" | "high";
      }
    | { kind: "tests"; passed: number; failed: number; skipped: number; ms: number }
    /* ---- 以下为「可信协同」工作流事件 ---- */
    | {
        /** 结构化任务交接：上游 agent 向下游交付的交接物 */
        kind: "handoff";
        from: AgentRole;
        to: AgentRole;
        title: string;
        /** 交接契约字段：范围 / 完成判定 / 未决问题 */
        scope: string[];
        done: string[];
        open?: string[];
        /** 随交接物一并传递的证据 id */
        evidence: string[];
      }
    | {
        /** AI 研发质量门禁：作为公开质量节点的评审结论 */
        kind: "gate";
        gate: string;
        node: string;
        verdict: "pass" | "block" | "waived";
        /** 各审查维度的结论 */
        checks: { dim: string; state: "pass" | "fail" | "warn"; note: string }[];
        reviewer: string;
        evidence: string[];
      }
    | {
        /** 定向返工：门禁失败后精确回退到责任节点，而非整体重来 */
        kind: "rework";
        reason: string;
        fromNode: string;
        toNode: string;
        role: AgentRole;
        /** 仅重做的范围，体现「定向」 */
        redo: string[];
        keep: string[];
        round: number;
      }
    | {
        /** 受控连接层调用：七步受控链路的一次落库记录 */
        kind: "controlled";
        conn: string;
        tier: PermTier;
        action: string;
        steps: { label: string; state: "ok" | "wait" | "deny" }[];
        traceId: string;
        /** 高风险写入需要的人工放行 */
        approver?: string;
      }
    | {
        /** 人工检查层：把人从逐行读码升级为节点判定 */
        kind: "checkpoint";
        node: string;
        question: string;
        /** 供人工判断的收敛信息，而非全量代码 */
        facts: { label: string; value: string; tone?: "ok" | "warn" | "info" }[];
        options: string[];
        decided?: string;
        decidedBy?: string;
      }
    | {
        /** 智能执行中枢：任务契约是任务的唯一入口与验收依据 */
        kind: "contract";
        title: string;
        problem: string;
        repo: string;
        workflow: string;
        /** 契约七要素中的清单类字段 */
        scope: string[];
        doneCriteria: string[];
        approvals: string[];
        materials: string[];
        tools: string[];
        deliverables: string[];
      }
    | {
        /** 主控规划方案：开工前为每个节点分配输入输出与增强提示词，
            必须经用户确认才推进流水线。confirmed / feedback 把「用户是否确认、
            改了什么」编码进事件本身，回放会话时能复原每一轮决策。 */
        kind: "orchestrator-plan";
        /** 任务描述，用于上下文对齐 */
        task: string;
        /** 全局规划说明 */
        summary: string;
        /** 流转 / 回退 / 审批边统计 */
        strategy: string;
        /** 第几轮规划，提交修改意见后递增 */
        round: number;
        assignments: {
          nodeId: string;
          nodeName: string;
          inputs: string[];
          outputs: string[];
          duty: string;
          acceptance: string;
          /** 增强提示词：结合任务上下文与用户意见定制，区别于 agent 自带提示词 */
          enhancedPrompt: string;
        }[];
        confirmed: boolean;
        /** 用户上一轮的修改意见 */
        feedback?: string;
        /** 已被更新一轮的规划取代 */
        superseded?: boolean;
      }
  );

export const conversation: AgentEvent[] = [
  {
    id: "e1",
    kind: "user",
    text: "把 sseinternetvote 里 QFII 征集投票的逻辑提取出来，在 vote_org_qfii 重构，与周边系统的接口契约保持不变，并补上单测。",
    attachments: ["qfii-collect-flow.png", "QfiiVoteAction.java"],
  },
  {
    id: "e1b",
    kind: "contract",
    title: "QFII 征集投票需求提取与重构",
    problem:
      "QFII 作为股票名义持有人，行使表决权前须向实际持有人征集投票意见。Java 侧的征集时点判断与重复投票判定散落在会议查询、投票提交、结果导出三处，规则各写一遍且已出现偏差；需在 vote_org_qfii 收敛为单一征集域服务，并保持与上证信息互联网投票平台（vote.sseinfo.com）及周边系统的接口契约不变。",
    repo: "vote_org_qfii · main",
    workflow: "需求开发",
    scope: [
      "meeting 包 会议查询与征集时点校验",
      "collect 包：征集域服务与重复投票判定（新增）",
      "upload 包、auth 包 名册与征集结果上传、通行证对接",
    ],
    doneCriteria: [
      "与周边系统接口契约不变：向 vote.sseinfo.com 报送的字段、响应码与 src/main/resources/vote-org-api.yaml 定义零变更",
      "征集日（投票起始日前一交易日）9:15–15:00 时点校验有用例覆盖，交易日历跨节假日不偏移",
      "多通道重复投票按时间优先以第一次为准，并发提交有唯一约束保护",
      "mvn compile 与 spotbugs 通过，测试覆盖率不低于 90%",
      "审查门禁六个维度无阻断项",
    ],
    approvals: ["沙箱内执行 mvn test", "代码合并到 main"],
    materials: ["sseinternetvote 源码与建表脚本", "AGENTS.md 工程约定", "依赖扫描结果"],
    tools: ["repo.read", "repo.patch", "test.run", "scan.sast"],
    deliverables: ["实现与验证材料", "证据链归档", "变更说明"],
  },
  {
    id: "e2",
    kind: "reasoning",
    title: "已思考 12 秒",
    body: "先定位 Java 侧所有判断征集时点的位置，判断规则是否已经分叉。会议查询、投票提交、结果导出三处各自算了一遍「投票起始日前一交易日 9:15–15:00」，其中结果导出用的是自然日而非交易日，说明规则应收敛到单一征集域服务，交易日历由会议模块单点提供。重复投票的时间优先判定同理，需要在写入侧加约束而不是在各通道分别拦截。对外报送 vote.sseinfo.com 的字段与响应码必须保持不变。",
    ms: 12_400,
  },
  {
    id: "e3",
    kind: "plan",
    steps: [
      { label: "梳理 Java 侧 QFII 征集的全部调用点", status: "done" },
      { label: "抽出 collect 包的征集域服务与时点校验", status: "done" },
      { label: "改写会议查询与名册上传为薄适配层", status: "done" },
      { label: "补充征集时点与重复投票的单元测试", status: "active" },
      { label: "跑全量测试并比对平台报送契约", status: "todo" },
    ],
  },
  {
    id: "e3b",
    kind: "handoff",
    from: "requirement",
    to: "development",
    title: "需求智能体 → 开发智能体：QFII 征集时点与重复投票判定收敛",
    scope: [
      "统一会议查询、投票提交、结果导出三处的征集时点校验",
      "对外保持向 vote.sseinfo.com 报送的字段与 src/main/resources/vote-org-api.yaml 定义不变",
      "多通道重复投票在写入侧收敛为一条有效记录，取时间最早的一次",
    ],
    done: [
      "三处不再各自实现「前一交易日 9:15–15:00」的窗口判断",
      "新增单测覆盖并发提交与征集窗口首尾边界",
      "平台报送契约回归比对通过，无字段增删",
    ],
    open: ["名册文件 GBK 编码是否本次一并兼容，待人工检查点确认"],
    evidence: ["ev-req-01", "ev-scan-02"],
  },
  {
    id: "e4",
    kind: "tool",
    tool: "search",
    label: "grep",
    meta: "checkCollectWindow|isDuplicateVote — 4 files, 17 matches",
    status: "ok",
    lines: [
      "src/.../action/QfiiMeetingAction.java:142   if (checkCollectWindow(meeting.getVoteBeginDate()))",
      "src/.../service/QfiiVoteServiceImpl.java:71  isDuplicateVote(shareholderId, meetingId)",
      "src/.../export/CollectResultExporter.java:38 calcCollectDay(voteBeginDate) // 用了自然日",
      "src/.../common/VoteDateUtil.java:12          public static Date prevTradeDay(Date d)",
    ],
  },
  {
    id: "e5",
    kind: "tool",
    tool: "read",
    label: "read",
    meta: "src/.../action/QfiiMeetingAction.java · 1–128",
    status: "ok",
  },
  {
    id: "e6",
    kind: "text",
    body: "三处确实各自实现了一遍征集窗口判断，其中 `CollectResultExporter` 用自然日回推征集日——遇到节假日会把窗口算错一天。我把它们统一到 `collect 包` 的 `WindowChecker`，交易日历由 `meeting 包` 单点提供；重复投票改为在 `vote_record` 上按（会议、实际持有人、通道）唯一约束落库，冲突时保留时间最早的一条。",
  },
  {
    id: "e7",
    kind: "tool",
    tool: "edit",
    label: "apply_patch",
    meta: "5 files changed · +148 −62",
    status: "ok",
  },
  {
    id: "e8",
    kind: "diff",
    summary: "抽出 collect 征集域服务，会议与上传降为薄适配层",
    files: [
      { path: "src/main/java/com/sse/vote/qfii/collect/CollectWindowService.java", added: 94, removed: 0 },
      { path: "src/main/java/com/sse/vote/qfii/meeting/MeetingQueryService.java", added: 12, removed: 31 },
      { path: "src/main/java/com/sse/vote/qfii/collect/DuplicateVoteChecker.java", added: 9, removed: 22 },
      { path: "src/main/java/com/sse/vote/qfii/upload/RosterParser.java", added: 7, removed: 9 },
      { path: "src/test/java/com/sse/vote/qfii/collect/CollectWindowServiceTest.java", added: 26, removed: 0 },
    ],
  },
  {
    id: "e8b",
    kind: "gate",
    gate: "AI 变更审查门禁",
    node: "评审",
    verdict: "block",
    reviewer: "审查智能体 · reviewer-1",
    checks: [
      { dim: "需求一致性", state: "pass", note: "改造范围与交接物 scope 逐条对齐" },
      { dim: "对外契约兼容", state: "pass", note: "平台报送字段与响应码比对无差异" },
      { dim: "并发安全", state: "fail", note: "重复投票唯一约束冲突后未按时间优先回退，多通道同秒提交会保留后到的一条" },
      { dim: "测试有效性", state: "warn", note: "并发用例仅断言记录条数，未断言留存记录的提交时间为最早" },
      { dim: "日志与可观测", state: "pass", note: "征集窗口拒绝已打点，含 traceId 与会议编号" },
      { dim: "敏感信息", state: "pass", note: "名册中的证件号在日志中已掩码" },
    ],
    evidence: ["ev-diff-04", "ev-test-05"],
  },
  {
    id: "e8c",
    kind: "rework",
    reason: "并发安全维度未通过：唯一约束冲突后未按时间优先裁决",
    fromNode: "评审",
    toNode: "代码开发",
    role: "development",
    round: 2,
    redo: [
      "冲突分支改为比对 vote_time 后保留最早一条，同秒时以平台受理序号兜底",
      "并发用例追加「留存记录为最早提交」断言",
    ],
    keep: [
      "collect 征集域服务抽取结果",
      "会议查询与名册上传的薄适配层改写",
      "平台报送契约回归比对结论",
    ],
  },
  {
    id: "e8d",
    kind: "handoff",
    from: "review",
    to: "development",
    title: "审查智能体 → 开发智能体：定向返工交接",
    scope: ["仅修复重复投票的时间优先裁决与对应断言，不重做已通过部分"],
    done: ["多通道同一实际持有人最终只留最早一条投票", "冲突分支在事务回滚后不产生脏记录"],
    evidence: ["ev-gate-06"],
  },
  {
    id: "e9",
    kind: "approval",
    command: "mvn -pl collect test -Djacoco.skip=false",
    rationale: "需要执行测试来验证多通道并发提交只留存最早一条投票记录。命令会写入 coverage.out。",
    risk: "low",
  },
  {
    id: "e10",
    kind: "tool",
    tool: "shell",
    label: "shell",
    meta: "mvn -pl collect test -Djacoco.skip=false",
    status: "ok",
    lines: [
      "$ mvn -pl collect test -Djacoco.skip=false",
      "",
      " [INFO] Scanning for projects...  vote_org_qfii (JDK 17)",
      "",
      " CollectWindowServiceTest      (9 tests)  214ms",
      " DuplicateVoteCheckerTest     (14 tests) 331ms",
      "",
      " [INFO] jacoco 覆盖率报告",
      " CollectWindowService.java     行 96.4 | 分支 91.2 | 方法 100",
      "",
      " Tests run: 23, Failures: 0, Errors: 0, Skipped: 0",
      " [INFO] BUILD SUCCESS  ·  Total time: 1.42s",
    ],
  },
  {
    id: "e11",
    kind: "tests",
    passed: 23,
    failed: 0,
    skipped: 1,
    ms: 1420,
  },
  {
    id: "e11b",
    kind: "gate",
    gate: "AI 变更审查门禁",
    node: "评审",
    verdict: "pass",
    reviewer: "审查智能体 · reviewer-1（第 2 轮）",
    checks: [
      { dim: "需求一致性", state: "pass", note: "返工范围未溢出交接物约定" },
      { dim: "对外契约兼容", state: "pass", note: "平台报送契约比对复跑一致" },
      { dim: "并发安全", state: "pass", note: "冲突分支已按 vote_time 取最早，事务在 defer 中回滚" },
      { dim: "测试有效性", state: "pass", note: "新增最早提交留存断言，并发用例 9 → 11" },
      { dim: "日志与可观测", state: "pass", note: "重复投票被拒新增独立打点，记录被覆盖通道" },
      { dim: "敏感信息", state: "pass", note: "无新增外发字段" },
    ],
    evidence: ["ev-diff-07", "ev-test-08", "ev-cover-09"],
  },
  {
    id: "e11c",
    kind: "controlled",
    conn: "代码仓库平台 · vote_org_qfii",
    tier: "write",
    action: "创建合并请求 feat/qfii-vote-refactor → main",
    traceId: "trc-8f21c40e",
    steps: [
      { label: "身份核验", state: "ok" },
      { label: "权限判定", state: "ok" },
      { label: "参数校验", state: "ok" },
      { label: "影响面预估", state: "ok" },
      { label: "人工放行", state: "ok" },
      { label: "执行调用", state: "ok" },
      { label: "留痕归档", state: "ok" },
    ],
    approver: "me@agentflow.dev",
  },
  {
    id: "e11d",
    kind: "checkpoint",
    node: "交付",
    question: "本次 QFII 征集投票重构是否可以合入 main？",
    facts: [
      { label: "门禁结论", value: "6/6 维度通过（第 2 轮）", tone: "ok" },
      { label: "定向返工", value: "1 次 · 仅重做时间优先裁决与断言", tone: "info" },
      { label: "对外契约", value: "平台报送字段与响应码无变更", tone: "ok" },
      { label: "测试", value: "23 通过 / 0 失败 / 1 跳过 · 覆盖 96.4%", tone: "ok" },
      { label: "受控写入", value: "1 次合并请求创建，已留痕 trc-8f21c40e", tone: "info" },
      { label: "未决问题", value: "名册文件 GBK 编码兼容未处理", tone: "warn" },
    ],
    options: ["同意合入", "先补名册编码兼容", "退回开发"],
    decided: "先补名册编码兼容",
    decidedBy: "me@agentflow.dev",
  },
  {
    id: "e12",
    kind: "text",
    body: "全部通过。与周边系统的接口契约没有变化：向 vote.sseinfo.com 报送的字段与响应码逐一比对一致，`src/main/resources/vote-org-api.yaml` 也未改动。要我顺手把名册上传的 GBK 编码兼容补上，并开一个 PR 吗？",
  },
];

/* --------------------- 各编排的开场（用户消息 + 任务契约） ---------------------
   同一套演示执行细节可以复用，但「任务是什么、契约怎么定」必须跟着会话变：
   否则会出现标题写着「整改 fastjson 漏洞」、正文却在讲 QFII 重构的自相矛盾。
   这里只覆盖开头两条，后续 e2 起的执行过程沿用共享演示流。
   ------------------------------------------------------------------------- */
type Opening = { user: Extract<AgentEvent, { kind: "user" }>; contract: Extract<AgentEvent, { kind: "contract" }> };

const openings: Record<string, Opening> = {
  "wf-bugfix": {
    user: {
      id: "e1",
      kind: "user",
      text: "多通道重复投票没有按「时间优先」以第一次为准，交易系统与互联网平台同秒提交时会保留后到的一条。帮我定位根因并给出最小修复。",
      attachments: ["duplicate-vote-case.log"],
    },
    contract: {
      id: "e1b",
      kind: "contract",
      title: "重复投票时间优先裁决缺陷修复",
      problem:
        "同一实际持有人经交易系统与互联网投票平台重复表决时，应以第一次提交为准。现有实现在唯一约束冲突后直接以后到记录覆盖，未比较 vote_time，同秒提交会保留错误的一条，直接影响表决结果统计。",
      repo: "vote_org_qfii · main",
      workflow: "缺陷修复",
      scope: ["collect 包：重复投票裁决", "vote_record 唯一约束与事务边界"],
      doneCriteria: [
        "冲突分支按 vote_time 保留最早一条，同秒时以平台受理序号兜底",
        "并发提交用例断言留存记录的提交时间为最早，而非仅断言记录条数",
        "缺陷可复现用例先失败、修复后通过",
      ],
      approvals: ["缺陷根因确认", "代码合并到 main"],
      materials: ["缺陷现场日志", "vote_record 建表脚本"],
      tools: ["repo.read", "repo.patch", "test.run"],
      deliverables: ["复现用例", "根因分析", "修复与回归材料"],
    },
  },
  "wf-cve": {
    user: {
      id: "e1",
      kind: "user",
      text: "排查 `pom.xml` 里 fastjson 与 commons-io 的已知漏洞影响范围，给出升级方案与回归清单，注意别动对外报送的接口行为。",
      attachments: ["dependency-scan.json"],
    },
    contract: {
      id: "e1b",
      kind: "contract",
      title: "开源组件已知漏洞整改",
      problem:
        "依赖扫描报出 fastjson 反序列化与 commons-io 路径遍历两类已知漏洞。需确认实际调用路径是否可达、评估升级的兼容性影响，并在不改变对外报送行为的前提下完成整改。",
      repo: "vote_org_qfii · main",
      workflow: "开源漏洞整改",
      scope: ["pom.xml 依赖版本", "名册与征集结果的文件解析调用点"],
      doneCriteria: [
        "逐条给出漏洞可达性判定：可达 / 不可达 / 需改造，并附调用链证据",
        "升级后 mvn test 全绿，报送字段与响应码零变更",
        "安全复核确认无新增高危项",
      ],
      approvals: ["升级方案确认", "代码合并到 main", "生产发布"],
      materials: ["依赖扫描结果", "组件安全公告"],
      tools: ["repo.read", "repo.patch", "test.run", "scan.sast"],
      deliverables: ["影响范围评估", "升级与回归材料", "安全复核结论"],
    },
  },
  "wf-unit": {
    user: {
      id: "e1",
      kind: "user",
      text: "为股东名册上传补齐边界用例，覆盖 `RosterParser` 的编码、字段格式与越权分支，覆盖率要过门禁阈值。",
      attachments: ["roster-sample.xlsx"],
    },
    contract: {
      id: "e1b",
      kind: "contract",
      title: "股东名册上传边界用例补齐",
      problem:
        "名册上传目前只有主流程用例，GBK 编码、证件号字段缺列、非持有人越权上传等分支均无覆盖。缺陷一旦流到生产将直接影响征集对象的准确性。",
      repo: "vote_org_qfii · main",
      workflow: "单元测试",
      scope: ["upload 包：RosterParser 与越权校验", "对应测试包"],
      doneCriteria: [
        "先写出会失败的用例，确认它们确实暴露了缺陷",
        "编码、字段格式、越权三类分支均有用例覆盖",
        "行覆盖率不低于 90% 且不靠无断言用例充数",
      ],
      approvals: ["沙箱内执行 mvn test"],
      materials: ["名册样例文件", "上交所名册字段规范"],
      tools: ["repo.read", "repo.patch", "test.run"],
      deliverables: ["用例清单", "覆盖率报告", "缺陷记录"],
    },
  },
  "wf-review": {
    user: {
      id: "e1",
      kind: "user",
      text: "审核 `EkeyAuthenticator` 的通行证校验与审计留痕，指出越权风险与日志脱敏缺口。",
      attachments: ["auth-callgraph.png"],
    },
    contract: {
      id: "e1b",
      kind: "contract",
      title: "通行证校验与审计留痕代码审核",
      problem:
        "通行证（Ekey）登录与权限校验分散在多个入口，审计留痕字段不统一。需独立审查是否存在越权可达路径，以及名册中的证件号是否在日志中被脱敏。",
      repo: "vote_org_qfii · main",
      workflow: "AI 代码审核",
      scope: ["auth 包：通行证校验与审计留痕", "会议查询与上传入口的权限判定"],
      doneCriteria: [
        "逐个入口给出权限判定结论，越权可达路径必须附调用链",
        "敏感字段（证件号、持股数）在日志与异常栈中均已掩码",
        "审查结论区分阻断项与建议项，阻断项必须有回退目标",
      ],
      approvals: ["审查结论确认"],
      materials: ["项目源码", "权限矩阵", "审计日志样例"],
      tools: ["repo.read", "scan.sast"],
      deliverables: ["审查报告", "问题清单与定级", "整改建议"],
    },
  },
};

/** 按编排取开场两条（用户消息 + 任务契约）；未登记则返回 undefined。
    整条正文的装配在 data/streams/index.ts —— 放在那里是为了避免与各
    stream 文件的类型导入形成循环引用。 */
export function openingOf(wfId: string | undefined): AgentEvent[] | undefined {
  const o = wfId ? openings[wfId] : undefined;
  return o ? [o.user, o.contract] : undefined;
}

/* --------------------------------- file tree -------------------------------- */

export type FileNode = {
  name: string;
  kind: "dir" | "file";
  status?: "added" | "modified" | "removed";
  children?: FileNode[];
  lines?: number;
};

/* 文件树：vote_org_qfii 的 Maven 工程结构，与事件流中改动的路径一一对应。
   collect 包是本次新增的征集域，其余为被改为薄适配层的既有模块。 */
export const fileTree: FileNode[] = [
  {
    name: "src/main/java/com/sse/vote/qfii",
    kind: "dir",
    children: [
      {
        name: "collect",
        kind: "dir",
        children: [
          { name: "CollectWindowService.java", kind: "file", status: "added", lines: 94 },
          { name: "DuplicateVoteChecker.java", kind: "file", status: "added", lines: 76 },
          { name: "CollectService.java", kind: "file", status: "modified", lines: 128 },
        ],
      },
      {
        name: "meeting",
        kind: "dir",
        children: [
          { name: "MeetingQueryService.java", kind: "file", status: "modified", lines: 96 },
          { name: "TradingCalendar.java", kind: "file", lines: 62 },
        ],
      },
      {
        name: "upload",
        kind: "dir",
        children: [
          { name: "RosterParser.java", kind: "file", status: "modified", lines: 74 },
        ],
      },
      {
        name: "auth",
        kind: "dir",
        children: [
          { name: "EkeyAuthenticator.java", kind: "file" },
          { name: "AuditLogger.java", kind: "file" },
        ],
      },
    ],
  },
  {
    name: "src/test/java/com/sse/vote/qfii/collect",
    kind: "dir",
    children: [
      { name: "CollectWindowServiceTest.java", kind: "file", status: "added", lines: 26 },
      { name: "DuplicateVoteCheckerTest.java", kind: "file", status: "modified", lines: 48 },
    ],
  },
  {
    name: "src/main/resources",
    kind: "dir",
    children: [{ name: "vote-org-api.yaml", kind: "file" }],
  },
  { name: "pom.xml", kind: "file" },
  { name: "AGENTS.md", kind: "file" },
];

/* ----------------------------------- diffs ---------------------------------- */

export type DiffLine = { type: "ctx" | "add" | "del" | "hunk"; n?: number; text: string };

/* diffs：与 e8 的 files 列表逐一对应。
   征集日回推从「自然日」改为「交易日历」，是本次从 Java 源仓库逆向出的关键规则；
   DuplicateVoteChecker 的冲突分支则是门禁判定为阻断的那处（未按时间优先取最早）。 */
export const diffs: Record<string, DiffLine[]> = {
  "src/main/java/com/sse/vote/qfii/collect/CollectWindowService.java": [
    { type: "hunk", text: "@@ -0,0 +1,94 @@ new file" },
    { type: "add", n: 1, text: "package com.sse.vote.qfii.collect;" },
    { type: "add", n: 2, text: "" },
    { type: "add", n: 3, text: "import java.time.LocalDate;" },
    { type: "add", n: 4, text: "import java.time.LocalTime;" },
    { type: "add", n: 5, text: "" },
    { type: "add", n: 6, text: "import com.sse.vote.qfii.meeting.TradingCalendar;" },
    { type: "add", n: 7, text: "" },
    {
      type: "add",
      n: 8,
      text: "/** 征集日为股东会投票起始日的前一交易日，窗口 9:15-15:00。",
    },
    {
      type: "add",
      n: 9,
      text: " *  必须按交易日历回推：跨节假日时自然日回推会落到非交易日。 */",
    },
    { type: "add", n: 10, text: "@Service" },
    { type: "add", n: 11, text: "public class CollectWindowService {" },
    { type: "add", n: 12, text: "" },
    {
      type: "add",
      n: 13,
      text: "    static final LocalTime WINDOW_OPEN = LocalTime.of(9, 15);",
    },
    {
      type: "add",
      n: 14,
      text: "    static final LocalTime WINDOW_CLOSE = LocalTime.of(15, 0);",
    },
    { type: "add", n: 15, text: "" },
    { type: "add", n: 16, text: "    private final TradingCalendar calendar;" },
    { type: "add", n: 17, text: "" },
    {
      type: "add",
      n: 18,
      text: "    /** 返回投票起始日对应的征集日（前一交易日）。 */",
    },
    {
      type: "add",
      n: 19,
      text: "    public LocalDate collectDayOf(LocalDate voteStart) {",
    },
    { type: "add", n: 20, text: "        return calendar.prevTradingDay(voteStart);" },
    { type: "add", n: 21, text: "    }" },
    { type: "add", n: 22, text: "}" },
  ],
  "src/main/java/com/sse/vote/qfii/meeting/MeetingQueryService.java": [
    { type: "hunk", text: "@@ -34,25 +34,6 @@ public List<Meeting> listCollectable" },
    {
      type: "ctx",
      n: 34,
      text: "    public List<Meeting> listCollectable(String holderId) {",
    },
    { type: "ctx", n: 35, text: "        var meetings = repository.byHolder(holderId);" },
    { type: "ctx", n: 36, text: "        var out = new ArrayList<Meeting>();" },
    { type: "del", n: 37, text: "        for (Meeting m : meetings) {" },
    { type: "del", n: 38, text: "            // 判断是否处于征集窗口内" },
    {
      type: "del",
      n: 39,
      text: "            LocalDate collectDay = m.voteStart().minusDays(1); // 用了自然日",
    },
    {
      type: "del",
      n: 40,
      text: "            if (LocalDateTime.now().isAfter(collectDay.atTime(9, 15))) {",
    },
    { type: "del", n: 41, text: "                out.add(m);" },
    { type: "del", n: 42, text: "            }" },
    { type: "del", n: 43, text: "        }" },
    { type: "del", n: 44, text: "        return out;" },
    { type: "del", n: 45, text: "    }" },
    {
      type: "add",
      n: 37,
      text: "        return collectWindow.filterInWindow(meetings, LocalDateTime.now());",
    },
    { type: "add", n: 38, text: "    }" },
  ],
  "src/main/java/com/sse/vote/qfii/collect/DuplicateVoteChecker.java": [
    { type: "hunk", text: "@@ -0,0 +1,76 @@ new file" },
    { type: "add", n: 1, text: "package com.sse.vote.qfii.collect;" },
    { type: "add", n: 2, text: "" },
    {
      type: "add",
      n: 3,
      text: "/** 多通道重复投票按「时间优先」：同一实际持有人在交易系统与互联网平台",
    },
    { type: "add", n: 4, text: " *  重复表决时，以第一次提交为准。 */" },
    { type: "add", n: 5, text: "@Transactional" },
    { type: "add", n: 6, text: "public void record(VoteRecord vote) {" },
    { type: "add", n: 7, text: "    try {" },
    { type: "add", n: 8, text: "        repository.insert(vote);" },
    {
      type: "add",
      n: 9,
      text: "    } catch (DuplicateKeyException e) {",
    },
    {
      type: "add",
      n: 10,
      text: "        // FIXME: 冲突后直接覆盖，未比较 voteTime 取最早",
    },
    { type: "add", n: 11, text: "        repository.update(vote);" },
    { type: "add", n: 12, text: "    }" },
    { type: "add", n: 13, text: "}" },
  ],
  "src/main/java/com/sse/vote/qfii/upload/RosterParser.java": [
    { type: "hunk", text: "@@ -30,14 +30,7 @@ public List<Holder> parse" },
    {
      type: "ctx",
      n: 30,
      text: "    public List<Holder> parse(InputStream in) throws IOException {",
    },
    { type: "del", n: 31, text: "        return parseWithLayout(in, LEGACY_LAYOUT);" },
    { type: "add", n: 31, text: "        return parseWithLayout(in, SSE_ROSTER_LAYOUT);" },
    { type: "ctx", n: 32, text: "    }" },
  ],
  "src/test/java/com/sse/vote/qfii/collect/CollectWindowServiceTest.java": [
    { type: "hunk", text: "@@ -0,0 +1,26 @@ new file" },
    { type: "add", n: 1, text: "package com.sse.vote.qfii.collect;" },
    { type: "add", n: 2, text: "" },
    { type: "add", n: 3, text: "@Test" },
    { type: "add", n: 4, text: "void 征集日跨节假日应回推到节前最后一个交易日() {" },
    {
      type: "add",
      n: 5,
      text: "    // 投票起始日为节后首个交易日",
    },
    {
      type: "add",
      n: 6,
      text: "    LocalDate voteStart = LocalDate.of(2026, 10, 9);",
    },
    {
      type: "add",
      n: 7,
      text: "    var service = new CollectWindowService(fakeCalendar());",
    },
    { type: "add", n: 8, text: "" },
    {
      type: "add",
      n: 9,
      text: "    assertThat(service.collectDayOf(voteStart))",
    },
    {
      type: "add",
      n: 10,
      text: "        .isEqualTo(LocalDate.of(2026, 9, 30));",
    },
    { type: "add", n: 11, text: "}" },
  ],
};
/* -------------------------------- terminal ---------------------------------- */

export const terminalLog: string[] = [
  "agentflow@sandbox  ~/workspace/vote_org_qfii  (feat/qfii-vote-refactor)",
  "$ git status --short",
  " M src/main/java/com/sse/vote/qfii/collect/CollectService.java",
  " M src/main/java/com/sse/vote/qfii/meeting/MeetingQueryService.java",
  " M src/main/java/com/sse/vote/qfii/upload/RosterParser.java",
  "?? src/main/java/com/sse/vote/qfii/collect/CollectWindowService.java",
  "?? src/test/java/com/sse/vote/qfii/collect/CollectWindowServiceTest.java",
  "",
  "$ mvn -q compile",
  "✔ BUILD SUCCESS  ·  86 source files  ·  4.1s",
  "",
  "$ mvn -pl collect test",
  " CollectWindowServiceTest  ·  9 tests, 0 failures",
  " DuplicateVoteCheckerTest  ·  14 tests, 0 failures",
  " Tests run: 23, Failures: 0, Skipped: 0  ·  1.42s",
  " 行覆盖率 96.4%（jacoco）",
  "",
];

/* --------------------------------- palette ---------------------------------- */

export const paletteGroups: {
  group: string;
  items: { icon: string; label: string; hint: string; keys?: string[] }[];
}[] = [
  {
    group: "任务",
    items: [
      { icon: "plus", label: "开启新任务", hint: "在当前仓库创建会话", keys: ["⌘", "N"] },
      { icon: "branch", label: "切换分支…", hint: "feat/auth-refresh" },
      { icon: "merge", label: "把当前改动开成 PR", hint: "vote_org_qfii #482" },
      { icon: "clock", label: "查看会话历史", hint: "7 条记录" },
    ],
  },
  {
    group: "代理",
    items: [
      { icon: "cpu", label: "切换模型", hint: "deepseek-v4-pro · kimi-k3 · qwen-3.8-max" },
      { icon: "shield", label: "审批模式", hint: "自动 / 逐条确认 / 只读", keys: ["⌘", "⇧", "A"] },
      { icon: "terminal", label: "重跑上一条命令", hint: "mvn -pl collect test" },
      { icon: "book", label: "编辑 AGENTS.md", hint: "仓库级代理约定" },
    ],
  },
  {
    group: "界面",
    items: [
      { icon: "sun", label: "切换主题", hint: "Lumen ⇄ Ink", keys: ["⌘", "J"] },
      { icon: "panel", label: "折叠检查面板", hint: "更宽的对话区", keys: ["⌘", "\\"] },
    ],
  },
];
