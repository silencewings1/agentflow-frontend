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
}

export const sessions: Session[] = [
  {
    id: "s-1",
    title: "重构鉴权中间件，抽离 token 刷新逻辑",
    repo: "agentflow/atlas-api",
    branch: "feat/auth-refresh",
    state: "review",
    time: "2 分钟前",
    bucket: "今天",
    diff: { added: 148, removed: 62, files: 5 },
    turns: 7,
  },
  {
    id: "s-2",
    title: "把 dashboard 图表迁移到虚拟滚动",
    repo: "agentflow/atlas-web",
    branch: "perf/virtual-chart",
    state: "running",
    time: "刚刚",
    bucket: "今天",
    diff: { added: 302, removed: 187, files: 11 },
    turns: 12,
  },
  {
    id: "s-3",
    title: "修复 CI 中 flaky 的快照测试",
    repo: "agentflow/atlas-web",
    branch: "fix/flaky-snapshot",
    state: "done",
    time: "上午 10:24",
    bucket: "今天",
    diff: { added: 24, removed: 31, files: 3 },
    turns: 4,
  },
  {
    id: "s-4",
    title: "为 billing 模块补齐边界用例",
    repo: "agentflow/atlas-api",
    branch: "test/billing-edges",
    state: "failed",
    time: "昨天 21:40",
    bucket: "昨天",
    diff: { added: 96, removed: 4, files: 2 },
    turns: 9,
  },
  {
    id: "s-5",
    title: "升级 pnpm workspace 到 v9",
    repo: "agentflow/infra",
    branch: "chore/pnpm-9",
    state: "done",
    time: "昨天 16:02",
    bucket: "昨天",
    diff: { added: 41, removed: 118, files: 8 },
    turns: 5,
  },
  {
    id: "s-6",
    title: "把日志管线从 winston 换成 pino",
    repo: "agentflow/atlas-api",
    branch: "chore/pino",
    state: "done",
    time: "8 月 6 日",
    bucket: "更早",
    diff: { added: 210, removed: 254, files: 14 },
    turns: 16,
  },
  {
    id: "s-7",
    title: "设计 token 化的主题系统",
    repo: "agentflow/design-kit",
    branch: "feat/tokens",
    state: "done",
    time: "8 月 4 日",
    bucket: "更早",
    diff: { added: 512, removed: 76, files: 22 },
    turns: 21,
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
  );

export const conversation: AgentEvent[] = [
  {
    id: "e1",
    kind: "user",
    text: "`/auth` 里的 token 刷新逻辑散落在三个中间件里，帮我抽成独立的 service，保持现有 API 行为不变，并补上单测。",
    attachments: ["auth-flow.png", "middleware.ts"],
  },
  {
    id: "e1b",
    kind: "contract",
    title: "token 刷新逻辑收敛改造",
    problem:
      "三处中间件各自读写 Redis 完成 token 刷新，存在并发双写风险且无法单点验证；需收敛为单一 TokenService 并保持对外行为不变。",
    repo: "agentflow/atlas-api · main",
    workflow: "需求开发",
    scope: [
      "src/auth/middleware/* 的 refresh 调用点",
      "src/auth/token-service.ts（新增）",
      "test/auth/* 单元测试",
    ],
    doneCriteria: [
      "res.locals.session 对外契约零变更",
      "并发刷新场景有互斥保护且有用例覆盖",
      "类型检查通过，测试覆盖率不低于 90%",
      "审查门禁六个维度无阻断项",
    ],
    approvals: ["沙箱内执行测试命令", "代码合并到 main"],
    materials: ["仓库源码", "AGENTS.md 工程约定", "依赖扫描结果"],
    tools: ["repo.read", "repo.patch", "test.run", "scan.sast"],
    deliverables: ["实现与验证材料", "证据链归档", "变更说明"],
  },
  {
    id: "e2",
    kind: "reasoning",
    title: "已思考 12 秒",
    body: "先定位所有触碰 refreshToken 的位置，判断是否存在共享状态。三处中间件都各自读写 Redis，说明可以收敛到单一 TokenService，并用互斥锁避免并发刷新导致的双写。需要保留 res.locals.session 的对外契约。",
    ms: 12_400,
  },
  {
    id: "e3",
    kind: "plan",
    steps: [
      { label: "梳理 refresh 逻辑的全部调用点", status: "done" },
      { label: "抽出 TokenService 并注入依赖", status: "done" },
      { label: "改写三处中间件为薄封装", status: "done" },
      { label: "补充并发刷新的单元测试", status: "active" },
      { label: "跑完整测试套件并校验契约", status: "todo" },
    ],
  },
  {
    id: "e3b",
    kind: "handoff",
    from: "requirement",
    to: "development",
    title: "需求智能体 → 开发智能体：token 刷新收敛改造",
    scope: [
      "统一 session / bearer / cookie 三处中间件的刷新逻辑",
      "对外保持 res.locals.session 字段与 legacy/compat.ts 再导出不变",
      "并发刷新场景下 Redis 写入必须收敛为一次",
    ],
    done: [
      "三处中间件不再各自实现刷新窗口判断",
      "新增单测覆盖并发刷新与过期边界",
      "契约回归比对通过，无字段增删",
    ],
    open: ["rotateSession 是否本次一并标记弃用，待人工检查点确认"],
    evidence: ["ev-req-01", "ev-scan-02"],
  },
  {
    id: "e4",
    kind: "tool",
    tool: "search",
    label: "grep",
    meta: "refreshToken|rotateSession — 4 files, 17 matches",
    status: "ok",
    lines: [
      "src/auth/middleware/session.ts:42   const next = await refreshToken(raw)",
      "src/auth/middleware/bearer.ts:71    await refreshToken(payload.rt, { silent: true })",
      "src/auth/middleware/cookie.ts:38    rotateSession(req, res)",
      "src/auth/legacy/compat.ts:12        export { refreshToken } from '../token'",
    ],
  },
  {
    id: "e5",
    kind: "tool",
    tool: "read",
    label: "read",
    meta: "src/auth/middleware/session.ts · 1–128",
    status: "ok",
  },
  {
    id: "e6",
    kind: "text",
    body: "三处中间件确实各自实现了一遍刷新窗口判断，其中 `bearer.ts` 少了并发保护——高并发下会重复写入 Redis。我把它们统一到 `TokenService`，用单飞（single-flight）锁收敛刷新。",
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
    summary: "抽出 TokenService，中间件降为薄封装",
    files: [
      { path: "src/auth/token-service.ts", added: 94, removed: 0 },
      { path: "src/auth/middleware/session.ts", added: 12, removed: 31 },
      { path: "src/auth/middleware/bearer.ts", added: 9, removed: 22 },
      { path: "src/auth/middleware/cookie.ts", added: 7, removed: 9 },
      { path: "test/auth/token-service.spec.ts", added: 26, removed: 0 },
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
      { dim: "对外契约兼容", state: "pass", note: "res.locals.session 字段比对无差异" },
      { dim: "并发安全", state: "fail", note: "single-flight 锁未覆盖 Redis 连接抖动后的重入路径" },
      { dim: "测试有效性", state: "warn", note: "并发用例仅验证调用次数，未断言锁释放" },
      { dim: "日志与可观测", state: "pass", note: "刷新失败已打点，含 traceId" },
      { dim: "敏感信息", state: "pass", note: "未出现明文 token 落日志" },
    ],
    evidence: ["ev-diff-04", "ev-test-05"],
  },
  {
    id: "e8c",
    kind: "rework",
    reason: "并发安全维度未通过：锁重入路径缺失",
    fromNode: "评审",
    toNode: "代码开发",
    role: "development",
    round: 2,
    redo: [
      "为 single-flight 锁补充连接抖动后的重入保护",
      "并发用例追加锁释放断言",
    ],
    keep: [
      "TokenService 抽取结果",
      "三处中间件薄封装改写",
      "契约回归比对结论",
    ],
  },
  {
    id: "e8d",
    kind: "handoff",
    from: "review",
    to: "development",
    title: "审查智能体 → 开发智能体：定向返工交接",
    scope: ["仅修复锁重入路径与对应断言，不重做已通过部分"],
    done: ["重入场景下 Redis 写入仍为一次", "锁在异常分支上必定释放"],
    evidence: ["ev-gate-06"],
  },
  {
    id: "e9",
    kind: "approval",
    command: "pnpm vitest run test/auth --coverage",
    rationale: "需要执行测试来验证并发刷新只触发一次 Redis 写入。命令会写入 coverage/ 目录。",
    risk: "low",
  },
  {
    id: "e10",
    kind: "tool",
    tool: "shell",
    label: "shell",
    meta: "pnpm vitest run test/auth --coverage",
    status: "ok",
    lines: [
      "$ pnpm vitest run test/auth --coverage",
      "",
      " RUN  v2.1.4  /workspace/atlas-api",
      "",
      " ✓ test/auth/token-service.spec.ts (9 tests) 214ms",
      " ✓ test/auth/middleware.spec.ts (14 tests) 331ms",
      "",
      " % Coverage report from v8",
      " src/auth/token-service.ts   96.4 |   91.2 |  100 |  96.4",
      "",
      " Test Files  2 passed (2)",
      "      Tests  23 passed (23)",
      "   Duration  1.42s",
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
      { dim: "对外契约兼容", state: "pass", note: "契约比对复跑一致" },
      { dim: "并发安全", state: "pass", note: "重入路径已覆盖，锁释放在 finally 分支" },
      { dim: "测试有效性", state: "pass", note: "新增锁释放断言，并发用例 9 → 11" },
      { dim: "日志与可观测", state: "pass", note: "重入告警新增独立打点" },
      { dim: "敏感信息", state: "pass", note: "无新增外发字段" },
    ],
    evidence: ["ev-diff-07", "ev-test-08", "ev-cover-09"],
  },
  {
    id: "e11c",
    kind: "controlled",
    conn: "GitLab · atlas-api",
    tier: "write",
    action: "创建合并请求 feat/token-service-consolidation → main",
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
    question: "本次改造是否可以合入 main？",
    facts: [
      { label: "门禁结论", value: "6/6 维度通过（第 2 轮）", tone: "ok" },
      { label: "定向返工", value: "1 次 · 仅重做并发锁与断言", tone: "info" },
      { label: "对外契约", value: "无变更，legacy 再导出保留", tone: "ok" },
      { label: "测试", value: "23 通过 / 0 失败 / 1 跳过 · 覆盖 96.4%", tone: "ok" },
      { label: "受控写入", value: "1 次 MR 创建，已留痕 trc-8f21c40e", tone: "info" },
      { label: "未决问题", value: "rotateSession 弃用注释未处理", tone: "warn" },
    ],
    options: ["同意合入", "先补弃用注释", "退回开发"],
    decided: "先补弃用注释",
    decidedBy: "me@agentflow.dev",
  },
  {
    id: "e12",
    kind: "text",
    body: "全部通过。对外契约没有变化：`res.locals.session` 的字段与旧实现逐一比对一致，`legacy/compat.ts` 的再导出也保留了。要我顺手把 `rotateSession` 的弃用注释加上，并开一个 PR 吗？",
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
    name: "src",
    kind: "dir",
    children: [
      {
        name: "auth",
        kind: "dir",
        children: [
          { name: "token-service.ts", kind: "file", status: "added", lines: 94 },
          {
            name: "middleware",
            kind: "dir",
            children: [
              { name: "session.ts", kind: "file", status: "modified", lines: 128 },
              { name: "bearer.ts", kind: "file", status: "modified", lines: 96 },
              { name: "cookie.ts", kind: "file", status: "modified", lines: 74 },
            ],
          },
          { name: "legacy", kind: "dir", children: [{ name: "compat.ts", kind: "file" }] },
        ],
      },
      { name: "billing", kind: "dir", children: [{ name: "invoice.ts", kind: "file" }] },
      { name: "server.ts", kind: "file" },
    ],
  },
  {
    name: "test",
    kind: "dir",
    children: [
      {
        name: "auth",
        kind: "dir",
        children: [
          { name: "token-service.spec.ts", kind: "file", status: "added", lines: 26 },
          { name: "middleware.spec.ts", kind: "file" },
        ],
      },
    ],
  },
  { name: "package.json", kind: "file" },
  { name: "AGENTS.md", kind: "file" },
];

/* ----------------------------------- diffs ---------------------------------- */

export type DiffLine = { type: "ctx" | "add" | "del" | "hunk"; n?: number; text: string };

export const diffs: Record<string, DiffLine[]> = {
  "src/auth/token-service.ts": [
    { type: "hunk", text: "@@ -0,0 +1,94 @@ new file" },
    { type: "add", n: 1, text: "import { createClient } from '../redis'" },
    { type: "add", n: 2, text: "import type { Session, RawToken } from './types'" },
    { type: "add", n: 3, text: "" },
    { type: "add", n: 4, text: "const REFRESH_WINDOW_MS = 60_000" },
    { type: "add", n: 5, text: "" },
    { type: "add", n: 6, text: "export class TokenService {" },
    { type: "add", n: 7, text: "  #inflight = new Map<string, Promise<Session>>()" },
    { type: "add", n: 8, text: "" },
    { type: "add", n: 9, text: "  constructor(private redis = createClient()) {}" },
    { type: "add", n: 10, text: "" },
    { type: "add", n: 11, text: "  /** Single-flight refresh: 并发请求共享同一个刷新 promise。 */" },
    { type: "add", n: 12, text: "  async refresh(raw: RawToken): Promise<Session> {" },
    { type: "add", n: 13, text: "    const key = `rt:${raw.jti}`" },
    { type: "add", n: 14, text: "    const pending = this.#inflight.get(key)" },
    { type: "add", n: 15, text: "    if (pending) return pending" },
    { type: "add", n: 16, text: "" },
    { type: "add", n: 17, text: "    const task = this.#rotate(key, raw).finally(() => {" },
    { type: "add", n: 18, text: "      this.#inflight.delete(key)" },
    { type: "add", n: 19, text: "    })" },
    { type: "add", n: 20, text: "    this.#inflight.set(key, task)" },
    { type: "add", n: 21, text: "    return task" },
    { type: "add", n: 22, text: "  }" },
    { type: "add", n: 23, text: "}" },
  ],
  "src/auth/middleware/session.ts": [
    { type: "hunk", text: "@@ -34,25 +34,6 @@ export function sessionGuard()" },
    { type: "ctx", n: 34, text: "export function sessionGuard(opts: GuardOpts = {}) {" },
    { type: "ctx", n: 35, text: "  return async (req, res, next) => {" },
    { type: "ctx", n: 36, text: "    const raw = readCookie(req)" },
    { type: "del", n: 37, text: "    if (!raw) return next()" },
    { type: "del", n: 38, text: "" },
    { type: "del", n: 39, text: "    // 判断是否处于刷新窗口内" },
    { type: "del", n: 40, text: "    const exp = decode(raw).exp * 1000" },
    { type: "del", n: 41, text: "    if (exp - Date.now() < 60_000) {" },
    { type: "del", n: 42, text: "      const next = await refreshToken(raw)" },
    { type: "del", n: 43, text: "      await redis.set(`rt:${next.jti}`, next.token)" },
    { type: "del", n: 44, text: "      res.locals.session = next" },
    { type: "del", n: 45, text: "    }" },
    { type: "add", n: 37, text: "    if (!raw) return next()" },
    { type: "add", n: 38, text: "" },
    { type: "add", n: 39, text: "    res.locals.session = await tokens.ensureFresh(raw)" },
    { type: "ctx", n: 40, text: "    return next()" },
    { type: "ctx", n: 41, text: "  }" },
    { type: "ctx", n: 42, text: "}" },
  ],
  "src/auth/middleware/bearer.ts": [
    { type: "hunk", text: "@@ -64,18 +64,5 @@ bearerGuard" },
    { type: "ctx", n: 64, text: "  const payload = verify(header.slice(7))" },
    { type: "del", n: 65, text: "  // FIXME: 没有并发保护，高并发下会重复写 Redis" },
    { type: "del", n: 66, text: "  if (isNearExpiry(payload)) {" },
    { type: "del", n: 67, text: "    await refreshToken(payload.rt, { silent: true })" },
    { type: "del", n: 68, text: "  }" },
    { type: "add", n: 65, text: "  res.locals.session = await tokens.ensureFresh(payload.rt)" },
    { type: "ctx", n: 66, text: "  return next()" },
  ],
  "src/auth/middleware/cookie.ts": [
    { type: "hunk", text: "@@ -30,14 +30,7 @@ cookieBridge" },
    { type: "ctx", n: 30, text: "export function cookieBridge() {" },
    { type: "del", n: 31, text: "    rotateSession(req, res)" },
    { type: "add", n: 31, text: "    await tokens.rotate(req, res)" },
    { type: "ctx", n: 32, text: "}" },
  ],
  "test/auth/token-service.spec.ts": [
    { type: "hunk", text: "@@ -0,0 +1,26 @@ new file" },
    { type: "add", n: 1, text: "import { describe, it, expect, vi } from 'vitest'" },
    { type: "add", n: 2, text: "import { TokenService } from '../../src/auth/token-service'" },
    { type: "add", n: 3, text: "" },
    { type: "add", n: 4, text: "describe('TokenService.refresh', () => {" },
    { type: "add", n: 5, text: "  it('并发调用只触发一次 Redis 写入', async () => {" },
    { type: "add", n: 6, text: "    const redis = { set: vi.fn(), get: vi.fn() }" },
    { type: "add", n: 7, text: "    const svc = new TokenService(redis as never)" },
    { type: "add", n: 8, text: "    await Promise.all([svc.refresh(raw), svc.refresh(raw)])" },
    { type: "add", n: 9, text: "    expect(redis.set).toHaveBeenCalledTimes(1)" },
    { type: "add", n: 10, text: "  })" },
    { type: "add", n: 11, text: "})" },
  ],
};

/* -------------------------------- terminal ---------------------------------- */

export const terminalLog: string[] = [
  "agentflow@sandbox  ~/workspace/atlas-api  (feat/auth-refresh)",
  "$ git status --short",
  " M src/auth/middleware/bearer.ts",
  " M src/auth/middleware/cookie.ts",
  " M src/auth/middleware/session.ts",
  "?? src/auth/token-service.ts",
  "?? test/auth/token-service.spec.ts",
  "",
  "$ pnpm typecheck",
  "> tsc --noEmit -p tsconfig.json",
  "✔ 0 errors  ·  312 files  ·  4.1s",
  "",
  "$ pnpm vitest run test/auth",
  " ✓ test/auth/token-service.spec.ts (9)",
  " ✓ test/auth/middleware.spec.ts (14)",
  " Tests  23 passed (23)",
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
      { icon: "merge", label: "把当前改动开成 PR", hint: "atlas-api #482" },
      { icon: "clock", label: "查看会话历史", hint: "7 条记录" },
    ],
  },
  {
    group: "代理",
    items: [
      { icon: "cpu", label: "切换模型", hint: "agentflow-large · agentflow-swift" },
      { icon: "shield", label: "审批模式", hint: "自动 / 逐条确认 / 只读", keys: ["⌘", "⇧", "A"] },
      { icon: "terminal", label: "重跑上一条命令", hint: "pnpm vitest run test/auth" },
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
