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
  /** 该会话所用的编排（workflowTemplates 的 id）。 */
  workflow: string;
}

export const sessions: Session[] = [
  {
    id: "s-1",
    title: "实现用户认证模块",
    repo: "demo-app",
    branch: "feat/auth",
    state: "review",
    time: "2 分钟前",
    bucket: "今天",
    diff: { added: 148, removed: 62, files: 5 },
    turns: 7,
    workflow: "wf-feature",
  },
  {
    id: "s-2",
    title: "修复登录超时未释放连接",
    repo: "demo-app",
    branch: "fix/conn-leak",
    state: "running",
    time: "刚刚",
    bucket: "今天",
    diff: { added: 12, removed: 8, files: 2 },
    turns: 4,
    workflow: "wf-bugfix",
  },
  {
    id: "s-3",
    title: "审核认证模块安全合规",
    repo: "demo-app",
    branch: "review/auth-audit",
    state: "done",
    time: "上午 10:24",
    bucket: "今天",
    diff: { added: 5, removed: 0, files: 1 },
    turns: 3,
    workflow: "wf-review",
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
        scope: string[];
        done: string[];
        open?: string[];
        evidence: string[];
      }
    | {
        /** AI 研发质量门禁：作为公开质量节点的评审结论 */
        kind: "gate";
        gate: string;
        node: string;
        verdict: "pass" | "block" | "waived";
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
        approver?: string;
      }
    | {
        /** 人工检查层：把人从逐行读码升级为节点判定 */
        kind: "checkpoint";
        node: string;
        question: string;
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
        scope: string[];
        doneCriteria: string[];
        approvals: string[];
        materials: string[];
        tools: string[];
        deliverables: string[];
      }
    | {
        /** 主控规划方案：开工前为每个节点分配输入输出与增强提示词 */
        kind: "orchestrator-plan";
        task: string;
        summary: string;
        strategy: string;
        round: number;
        assignments: {
          nodeId: string;
          nodeName: string;
          inputs: string[];
          outputs: string[];
          duty: string;
          acceptance: string;
          enhancedPrompt: string;
        }[];
        confirmed: boolean;
        feedback?: string;
        superseded?: boolean;
      }
  );

/* 默认演示事件流：覆盖全部事件类型，保证界面中每种卡片都能渲染。 */
export const conversation: AgentEvent[] = [
  { id: "e1", kind: "user", text: "帮我实现一个用户认证模块，支持密码登录与 Token 刷新。" },
  {
    id: "e1b",
    kind: "contract",
    title: "用户认证模块",
    problem: "需要实现密码登录与 Token 刷新，密码须加盐哈希存储，Token 须有过期与吊销机制。",
    repo: "demo-app · main",
    workflow: "需求开发",
    scope: ["auth 包：登录、刷新、吊销", "对应测试包"],
    doneCriteria: ["密码加盐哈希", "Token 过期可刷新", "覆盖率不低于 90%", "门禁六维无阻断"],
    approvals: ["沙箱内执行测试", "代码合并到 main"],
    materials: ["项目源码", "安全规范"],
    tools: ["repo.read", "repo.patch", "test.run", "scan.sast"],
    deliverables: ["实现与测试", "证据链归档"],
  },
  {
    id: "e2",
    kind: "reasoning",
    title: "已思考 6 秒",
    body: "先确认改动范围与安全要求。密码须加盐哈希（bcrypt），Token 用 JWT 并设短期过期 + refresh。据此拟定最小步骤集。",
    ms: 6_000,
  },
  {
    id: "e3",
    kind: "plan",
    steps: [
      { label: "定位现有认证相关代码", status: "done" },
      { label: "实现 AuthService 与 Token 管理", status: "active" },
      { label: "补 JUnit 用例并跑通编译", status: "todo" },
    ],
  },
  {
    id: "e3b",
    kind: "handoff",
    from: "requirement",
    to: "development",
    title: "需求智能体 → 开发智能体：认证模块交接",
    scope: ["统一登录、刷新、吊销三入口", "密码加盐哈希存储"],
    done: ["三入口不再散落", "新增单测覆盖边界"],
    open: ["Token 吊销策略是否走 Redis，待人工检查点确认"],
    evidence: ["ev-1"],
  },
  {
    id: "e4",
    kind: "tool",
    tool: "search",
    label: "grep",
    meta: "AuthService|TokenManager — 2 files, 5 matches",
    status: "ok",
    lines: [
      "src/main/java/com/demo/auth/AuthService.java:31   login(username, password)",
      "src/main/java/com/demo/auth/TokenManager.java:12  generateToken(userId)",
    ],
  },
  {
    id: "e5",
    kind: "diff",
    summary: "新增 AuthService 与 TokenManager，改写登录入口",
    files: [
      { path: "src/main/java/com/demo/auth/AuthService.java", added: 48, removed: 0 },
      { path: "src/main/java/com/demo/auth/TokenManager.java", added: 32, removed: 12 },
    ],
  },
  {
    id: "e6",
    kind: "gate",
    gate: "AI 变更审查门禁",
    node: "评审",
    verdict: "block",
    reviewer: "审查智能体 · reviewer-1",
    checks: [
      { dim: "需求一致性", state: "pass", note: "改造范围与契约对齐" },
      { dim: "安全", state: "fail", note: "Token 刷新未校验吊销状态" },
      { dim: "测试有效性", state: "warn", note: "吊销分支缺断言" },
    ],
    evidence: ["ev-1"],
  },
  {
    id: "e7",
    kind: "rework",
    reason: "安全维度未通过：Token 刷新未校验吊销状态",
    fromNode: "评审",
    toNode: "代码开发",
    role: "development",
    round: 2,
    redo: ["刷新时校验吊销列表", "补吊销分支断言"],
    keep: ["AuthService 实现", "密码哈希方案"],
  },
  {
    id: "e8",
    kind: "tool",
    tool: "shell",
    label: "shell",
    meta: "mvn -pl auth test",
    status: "ok",
    lines: [
      "$ mvn -pl auth test",
      " AuthServiceTest    (8 tests)  208ms",
      " TokenManagerTest   (6 tests)  142ms",
      " Tests run: 14, Failures: 0, Skipped: 0  ·  1.1s",
    ],
  },
  {
    id: "e9",
    kind: "tests",
    passed: 14,
    failed: 0,
    skipped: 0,
    ms: 1100,
  },
  {
    id: "e10",
    kind: "gate",
    gate: "AI 变更审查门禁",
    node: "评审",
    verdict: "pass",
    reviewer: "审查智能体 · reviewer-1（第 2 轮）",
    checks: [
      { dim: "需求一致性", state: "pass", note: "返工范围未溢出" },
      { dim: "安全", state: "pass", note: "刷新已校验吊销状态" },
      { dim: "测试有效性", state: "pass", note: "吊销分支断言已补" },
    ],
    evidence: ["ev-2", "ev-3"],
  },
  {
    id: "e11",
    kind: "controlled",
    conn: "代码仓库平台 · demo-app",
    tier: "write",
    action: "创建合并请求 feat/auth → main",
    traceId: "trc-a1b2c3",
    steps: [
      { label: "身份核验", state: "ok" },
      { label: "权限判定", state: "ok" },
      { label: "参数校验", state: "ok" },
      { label: "人工放行", state: "ok" },
      { label: "执行调用", state: "ok" },
      { label: "留痕归档", state: "ok" },
    ],
    approver: "me@agentflow.dev",
  },
  {
    id: "e12",
    kind: "checkpoint",
    node: "交付",
    question: "认证模块是否可以合入 main？",
    facts: [
      { label: "门禁结论", value: "3/3 维度通过（第 2 轮）", tone: "ok" },
      { label: "测试", value: "14 通过 / 0 失败", tone: "ok" },
      { label: "未决问题", value: "Token 吊销是否走 Redis", tone: "warn" },
    ],
    options: ["同意合入", "先补 Redis 吊销", "退回开发"],
    decided: "同意合入",
    decidedBy: "me@agentflow.dev",
  },
  {
    id: "e13",
    kind: "text",
    body: "全部通过。认证模块已合入 main，密码加盐哈希与 Token 刷新吊销均已覆盖。要我补上 Redis 吊销方案吗？",
  },
];

/* --------------------------------- file tree -------------------------------- */

export type FileNode = {
  name: string;
  kind: "dir" | "file";
  status?: "added" | "modified" | "removed";
  children?: FileNode[];
  lines?: number;
};

export const fileTree: FileNode[] = [
  {
    name: "src/main/java/com/demo/auth",
    kind: "dir",
    children: [
      { name: "AuthService.java", kind: "file", status: "added", lines: 48 },
      { name: "TokenManager.java", kind: "file", status: "modified", lines: 32 },
    ],
  },
  {
    name: "src/test/java/com/demo/auth",
    kind: "dir",
    children: [{ name: "AuthServiceTest.java", kind: "file", status: "added", lines: 26 }],
  },
];

/* ----------------------------------- diffs ---------------------------------- */

export type DiffLine = { type: "ctx" | "add" | "del" | "hunk"; n?: number; text: string };

export const diffs: Record<string, DiffLine[]> = {
  "src/main/java/com/demo/auth/AuthService.java": [
    { type: "hunk", text: "@@ -0,0 +1,48 @@ new file" },
    { type: "add", n: 1, text: "package com.demo.auth;" },
    { type: "add", n: 2, text: "" },
    { type: "add", n: 3, text: "public class AuthService {" },
    { type: "add", n: 4, text: "    public boolean login(String user, String pass) {" },
    { type: "add", n: 5, text: "        return verify(user, pass);" },
    { type: "add", n: 6, text: "    }" },
    { type: "add", n: 7, text: "}" },
  ],
};

/* -------------------------------- terminal ---------------------------------- */

export const terminalLog: string[] = [
  "agentflow@sandbox  ~/workspace/demo-app  (feat/auth)",
  "$ git status --short",
  " M src/main/java/com/demo/auth/TokenManager.java",
  "?? src/main/java/com/demo/auth/AuthService.java",
  "",
  "$ mvn -q compile",
  "✔ BUILD SUCCESS  ·  48 source files  ·  2.1s",
  "",
  "$ mvn -pl auth test",
  " Tests run: 14, Failures: 0, Skipped: 0  ·  1.1s",
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
      { icon: "branch", label: "切换分支…", hint: "feat/auth" },
      { icon: "merge", label: "把当前改动开成 PR", hint: "demo-app #482" },
      { icon: "clock", label: "查看会话历史", hint: "3 条记录" },
    ],
  },
  {
    group: "代理",
    items: [
      { icon: "cpu", label: "切换模型", hint: "deepseek-v4-pro · kimi-k3 · qwen-3.8-max" },
      { icon: "shield", label: "审批模式", hint: "自动 / 逐条确认 / 只读", keys: ["⌘", "⇧", "A"] },
      { icon: "terminal", label: "重跑上一条命令", hint: "mvn -pl auth test" },
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
