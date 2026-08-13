/* ============================================================
   AGENTFLOW — 第二章「技术方案」领域模型
   五层架构 / 任务契约 / 多智能体 / 受控连接 / 质量门禁 / 证据链
   ============================================================ */

import type { IconName } from "../components/Icons";

/* ========================= （一）总体架构：五层 ========================= */

export interface ArchLayer {
  id: string;
  index: string;
  name: string;
  glyph: IconName;
  tint: "azure" | "accent" | "cyan" | "sage" | "gold";
  duty: string;
  items: string[];
  owner: "人工" | "AI" | "确定性程序" | "平台";
}

export const archLayers: ArchLayer[] = [
  {
    id: "l-biz",
    index: "L1",
    name: "业务研发层",
    glyph: "Book",
    tint: "azure",
    duty: "承载需求、设计、开发、测试、交付和运行等正式研发活动。",
    items: ["需求", "设计", "开发", "测试", "交付", "运行"],
    owner: "平台",
  },
  {
    id: "l-exec",
    index: "L2",
    name: "智能执行层",
    glyph: "Nodes",
    tint: "accent",
    duty: "理解任务、拆分步骤、调度专业智能体并汇总交付物。",
    items: ["任务契约", "步骤拆分", "智能体调度", "交付汇总"],
    owner: "AI",
  },
  {
    id: "l-conn",
    index: "L3",
    name: "受控连接层",
    glyph: "Plug",
    tint: "cyan",
    duty: "访问项目、代码、测试和发布等外部系统，并检查身份、权限和调用参数。",
    items: ["身份校验", "权限分级", "参数校验", "调用审计"],
    owner: "确定性程序",
  },
  {
    id: "l-qa",
    index: "L4",
    name: "质量验证层",
    glyph: "Shield",
    tint: "sage",
    duty: "通过编译、测试、覆盖率检查、安全扫描和独立审查核验任务结果。",
    items: ["编译", "测试", "覆盖率", "安全扫描", "独立审查"],
    owner: "确定性程序",
  },
  {
    id: "l-human",
    index: "L5",
    name: "人工检查层",
    glyph: "Check",
    tint: "gold",
    duty: "需求确认、高风险方案、代码合并和生产发布等关键决策。",
    items: ["需求确认", "高风险方案", "代码合并", "生产发布"],
    owner: "人工",
  },
];

/* ===================== （二）智能执行中枢：任务契约 ===================== */

export interface TaskContract {
  problem: string;
  scope: string[];
  doneCriteria: string[];
  approvals: string[];
  materials: string[];
  tools: string[];
  deliverables: string[];
}

/* 目标仓库：本次只涉及两个 —— 源仓库（需求所在）与目标仓库（重构落地）。
   越界改动会被门禁按契约范围拦截，故这里不放无关仓库。 */
export interface RepoOption {
  name: string;
  lang: string;
  branch: string;
  dot: string;
  /** 该仓库在本次任务中的角色，让人一眼看出谁是源、谁是目标 */
  role: "源仓库" | "目标仓库";
}

export const repoOptions: RepoOption[] = [
  {
    name: "sseinternetvote",
    lang: "Java",
    branch: "main",
    dot: "var(--azure)",
    role: "源仓库",
  },
  {
    name: "vote_org_qfii",
    lang: "Go",
    branch: "main",
    dot: "var(--cyan)",
    role: "目标仓库",
  },
];

export const taskContract: TaskContract = {
  problem:
    "将 sseinternetvote 项目中 QFII 投票相关的需求提取出来，并在 vote_org_qfii 项目中重构。与周边系统的架构关系需要保持不变。",
  /* 改动范围按业务模块划分：QFII 作为股票名义持有人，需向实际持有人征集
     投票意见，故涉及会议查询、文件上传（名册与征集结果）、权限审计与通行证对接 */
  scope: ["会议查询模块", "文件上传模块", "权限与审计", "通行证对接"],
  doneCriteria: [
    "需求条目全部标注事实 / 推断 / 待确认",
    "单元测试与集成测试通过且覆盖率达门禁阈值",
    "独立审查无阻断与严重问题",
  ],
  approvals: ["关键业务语义确认", "代码合并", "生产发布"],
  materials: ["项目源码", "依赖扫描结果"],
  tools: ["repo.read", "repo.patch", "test.run", "scan.sast"],
  deliverables: ["需求与规则材料", "设计材料", "实现与验证材料", "交付与运维材料"],
};

/* ====================== （四）多智能体协同：编排 ======================= */

export type AgentRole =
  | "orchestrator"
  | "requirement"
  | "architecture"
  | "development"
  | "testing"
  | "review"
  | "delivery"
  | "ops";

export type AgentScope = "readonly" | "ask" | "auto";

export interface AgentSpec {
  id: string;
  role: AgentRole;
  name: string;
  kind: "system" | "custom";
  glyph: IconName;
  tint: "accent" | "cyan" | "sage" | "gold" | "plum" | "azure";
  duty: string;
  model: string;
  scope: AgentScope;
  tools: string[];
  outputs: string[];
  independent: boolean;
  enabled: boolean;
}

export const scopeLabel: Record<AgentScope, string> = {
  readonly: "只读",
  ask: "逐条确认",
  auto: "自动执行",
};

export const builtinAgents: AgentSpec[] = [
  {
    id: "ag-orch",
    role: "orchestrator",
    name: "主控智能体",
    kind: "system",
    glyph: "Nodes",
    tint: "accent",
    duty: "任务拆解、依赖管理、检查点控制、异常处理与结果汇总。",
    model: "agentflow-large",
    scope: "auto",
    tools: ["agent.dispatch", "plan.write", "contract.read"],
    outputs: ["步骤计划", "检查点状态", "结果汇总"],
    independent: false,
    enabled: true,
  },
  {
    id: "ag-req",
    role: "requirement",
    name: "需求智能体",
    kind: "system",
    glyph: "Book",
    tint: "azure",
    duty: "从源码查找业务规则、校验条件、接口行为与页面流程，形成需求说明初稿。",
    model: "agentflow-large",
    scope: "readonly",
    tools: ["repo.read", "doc.read"],
    outputs: ["需求说明", "事实/推断/待确认标注"],
    independent: false,
    enabled: true,
  },
  {
    id: "ag-arch",
    role: "architecture",
    name: "架构智能体",
    kind: "system",
    glyph: "Layers",
    tint: "cyan",
    duty: "系统结构、模块职责、接口与兼容性方案设计，评估修改影响范围。",
    model: "agentflow-large",
    scope: "readonly",
    tools: ["repo.read", "dep.graph"],
    outputs: ["设计材料", "接口定义", "影响分析"],
    independent: false,
    enabled: true,
  },
  {
    id: "ag-dev",
    role: "development",
    name: "开发智能体",
    kind: "system",
    glyph: "Pencil",
    tint: "accent",
    duty: "在隔离分支中修改代码、配置与文档，按测试驱动方式实现需求。",
    model: "agentflow-large",
    scope: "ask",
    tools: ["repo.read", "repo.patch", "shell"],
    outputs: ["代码差异", "变更说明"],
    independent: false,
    enabled: true,
  },
  {
    id: "ag-test",
    role: "testing",
    name: "测试智能体",
    kind: "system",
    glyph: "Beaker",
    tint: "sage",
    duty: "编写并运行单元、集成与回归测试，保留预期失败记录与复现用例。",
    model: "agentflow-large",
    scope: "ask",
    tools: ["test.run", "coverage.read", "browser.smoke"],
    outputs: ["测试报告", "覆盖率报告"],
    independent: false,
    enabled: true,
  },
  {
    id: "ag-review",
    role: "review",
    name: "审查智能体",
    kind: "system",
    glyph: "Shield",
    tint: "gold",
    duty: "独立核对实现与需求，检查安全、合规与变更影响，写回问题位置与严重程度。",
    model: "agentflow-large",
    scope: "readonly",
    tools: ["diff.read", "scan.sast", "rule.read"],
    outputs: ["审查结论", "问题清单"],
    independent: true,
    enabled: true,
  },
  {
    id: "ag-deliver",
    role: "delivery",
    name: "交付智能体",
    kind: "system",
    glyph: "Cube",
    tint: "plum",
    duty: "汇总变更说明、测试报告、审查问题及处理结果、发布方案与回滚措施。",
    model: "agentflow-swift",
    scope: "ask",
    tools: ["doc.write", "release.plan"],
    outputs: ["交付包", "发布与回滚方案"],
    independent: false,
    enabled: true,
  },
  {
    id: "ag-ops",
    role: "ops",
    name: "运维智能体",
    kind: "system",
    glyph: "Terminal",
    tint: "sage",
    duty: "执行构建、迁移与部署脚本，回写运行状态，全过程留痕。",
    model: "agentflow-swift",
    scope: "ask",
    tools: ["shell", "env.read", "deploy"],
    outputs: ["部署记录", "运行信息"],
    independent: false,
    enabled: false,
  },
];

export const customAgents: AgentSpec[] = [
  {
    id: "ag-cve",
    role: "architecture",
    name: "漏洞排查智能体",
    kind: "custom",
    glyph: "Bolt",
    tint: "gold",
    duty: "按组件清单识别直接依赖、间接依赖与受影响版本，生成影响分析与整改任务。",
    model: "agentflow-swift",
    scope: "readonly",
    tools: ["dep.graph", "scan.sca", "repo.read"],
    outputs: ["排查清单", "依赖与影响分析"],
    independent: false,
    enabled: true,
  },
];

export const agentToolCatalog = [
  "repo.read",
  "repo.patch",
  "diff.read",
  "doc.read",
  "doc.write",
  "dep.graph",
  "shell",
  "test.run",
  "coverage.read",
  "browser.smoke",
  "scan.sast",
  "scan.sca",
  "rule.read",
  "release.plan",
  "deploy",
  "env.read",
  "agent.dispatch",
  "plan.write",
];

export const roleLabel: Record<AgentRole, string> = {
  orchestrator: "编排",
  requirement: "需求",
  architecture: "架构",
  development: "开发",
  testing: "测试",
  review: "审查",
  delivery: "交付",
  ops: "运维",
};

/* ======================= （五）受控连接层：分级 ======================== */

export type ConnKind = "mcp" | "internal" | "platform";
export type ConnState = "linked" | "degraded" | "paused";
export type PermTier = "readonly" | "write" | "highrisk";

export interface Connection {
  id: string;
  name: string;
  kind: ConnKind;
  state: ConnState;
  endpoint: string;
  transport: string;
  scopes: string[];
  tier: PermTier;
  calls24h: number;
  p95: number;
  denied: number;
}

export const connKindLabel: Record<ConnKind, string> = {
  mcp: "MCP",
  internal: "自建系统",
  platform: "研发平台",
};

export const connStateLabel: Record<ConnState, string> = {
  linked: "已连接",
  degraded: "降级",
  paused: "已暂停",
};

export const permTiers: {
  id: PermTier;
  name: string;
  rule: string;
  examples: string[];
  gate: string;
}[] = [
  {
    id: "readonly",
    name: "只读权限",
    rule: "查询需求、代码和测试结果，不产生写入。",
    examples: ["读取需求条目", "读取代码与历史修改", "读取测试结果"],
    gate: "按任务范围放行",
  },
  {
    id: "write",
    name: "普通写入",
    rule: "创建分支、回写任务状态等，需经过工具白名单和参数检查。",
    examples: ["创建隔离分支", "回写任务状态", "提交合并请求"],
    gate: "白名单 + 参数校验",
  },
  {
    id: "highrisk",
    name: "高风险写入",
    rule: "代码合并、生产发布、生产数据及权限变更，必须由责任人审批。",
    examples: ["代码合并", "生产发布", "生产数据变更", "权限变更"],
    gate: "责任人审批",
  },
];

export const permTierLabel: Record<PermTier, string> = {
  readonly: "只读",
  write: "普通写入",
  highrisk: "高风险写入",
};

export const connections: Connection[] = [
  {
    id: "c-proj",
    name: "项目与知识平台",
    kind: "platform",
    state: "linked",
    endpoint: "https://project.corp/api/v4",
    transport: "REST · OAuth2",
    scopes: ["task.read", "task.write", "doc.read"],
    tier: "write",
    calls24h: 2184,
    p95: 96,
    denied: 7,
  },
  {
    id: "c-repo",
    name: "代码仓库平台",
    kind: "platform",
    state: "linked",
    endpoint: "https://git.corp/api/v4",
    transport: "REST · mTLS",
    scopes: ["repo.read", "branch.write", "mr.write"],
    tier: "highrisk",
    calls24h: 4820,
    p95: 138,
    denied: 12,
  },
  {
    id: "c-ci",
    name: "流水线与测试平台",
    kind: "platform",
    state: "linked",
    endpoint: "https://ci.corp/api/v2",
    transport: "REST · OAuth2",
    scopes: ["pipeline.read", "test.read", "coverage.read"],
    tier: "readonly",
    calls24h: 1936,
    p95: 210,
    denied: 0,
  },
  {
    id: "c-fs",
    name: "filesystem-mcp",
    kind: "mcp",
    state: "linked",
    endpoint: "stdio://mcp-server-filesystem",
    transport: "stdio",
    scopes: ["fs.read", "fs.write"],
    tier: "write",
    calls24h: 6412,
    p95: 42,
    denied: 3,
  },
  {
    id: "c-sca",
    name: "开源治理清单",
    kind: "internal",
    state: "linked",
    endpoint: "grpc://sca-gw.svc.cluster.local:8443",
    transport: "gRPC · mTLS",
    scopes: ["component.read", "cve.read"],
    tier: "readonly",
    calls24h: 742,
    p95: 611,
    denied: 0,
  },
  {
    id: "c-release",
    name: "发布与审批系统",
    kind: "internal",
    state: "paused",
    endpoint: "https://release.corp/api/v1",
    transport: "REST · PAT",
    scopes: ["release.read", "release.exec"],
    tier: "highrisk",
    calls24h: 0,
    p95: 0,
    denied: 15,
  },
];

/* 一次受控调用的七个步骤 */
export const callSteps: { id: string; name: string; note: string; glyph: IconName }[] = [
  { id: "s1", name: "工具选择", note: "按任务契约在白名单内选定工具", glyph: "Sliders" },
  { id: "s2", name: "身份与分级授权", note: "确认调用人与任务身份，授予限时权限", glyph: "Key" },
  { id: "s3", name: "上下文与参数校验", note: "检查访问范围、参数与脱敏要求", glyph: "Shield" },
  { id: "s4", name: "连接器执行", note: "由连接器代理发起实际外部调用", glyph: "Plug" },
  { id: "s5", name: "结果完整性检查", note: "校验返回结果结构与完整性", glyph: "Check" },
  { id: "s6", name: "调用审计", note: "记录操作、参数摘要与结果", glyph: "Book" },
  { id: "s7", name: "任务状态回写", note: "将结果写回任务与现有研发平台", glyph: "Arrow" },
];

export const connPolicies = [
  { id: "p-cred", title: "凭据统一保管", body: "外部系统凭据由受控连接层或现有凭据系统保管，不写入提示内容或代码。", on: true },
  { id: "p-mask", title: "任务信息脱敏", body: "提示内容、代码与智能体长期记录只使用经过脱敏的任务信息。", on: true },
  { id: "p-approve", title: "高风险写入授权", body: "代码合并、生产发布、生产数据与权限变更必须经人工授权。", on: true },
  { id: "p-least", title: "最小权限", body: "智能体只获得当前任务需要的权限，权限随任务结束回收。", on: true },
  { id: "p-audit", title: "全量调用审计", body: "工具选择、参数摘要、返回结果与处理人全部留痕，支持回放。", on: true },
  { id: "p-rate", title: "调用速率限制", body: "单连接默认 120 次/分，超出后排队而非直接失败。", on: false },
];

/* ==================== （六）AI 研发质量门禁：四道 ===================== */

export type GateState = "passed" | "active" | "blocked" | "todo";

export interface QualityGate {
  id: string;
  index: string;
  name: string;
  state: GateState;
  deliverables: string[];
  checks: { label: string; value: string; ok: boolean }[];
  independentReview: string;
  fallback: string;
}

export const gateStateLabel: Record<GateState, string> = {
  passed: "已通过",
  active: "进行中",
  blocked: "已阻断",
  todo: "待进入",
};

export const qualityGates: QualityGate[] = [
  {
    id: "g1",
    index: "G1",
    name: "需求与设计",
    state: "passed",
    deliverables: ["需求说明", "事实/推断/待确认标注", "设计材料"],
    checks: [
      { label: "需求可测试性", value: "62/62 条", ok: true },
      { label: "待确认项已澄清", value: "9/9", ok: true },
      { label: "业务语义人工确认", value: "已确认", ok: true },
    ],
    independentReview: "需求审查智能体核对完整性、可测试性与安全问题",
    fallback: "退回需求分析并交人工确认",
  },
  {
    id: "g2",
    index: "G2",
    name: "测试驱动开发",
    state: "passed",
    deliverables: ["预期失败记录", "单元测试", "实现代码"],
    checks: [
      { label: "单元测试", value: "312 passed", ok: true },
      { label: "行覆盖率", value: "91.4%", ok: true },
      { label: "断言有效性抽查", value: "无空断言", ok: true },
    ],
    independentReview: "审查测试是否覆盖主要业务规则与边界情况",
    fallback: "退回开发与测试环节",
  },
  {
    id: "g3",
    index: "G3",
    name: "集成验证",
    state: "active",
    deliverables: ["集成测试报告", "浏览器冒烟记录", "复现用例"],
    checks: [
      { label: "集成测试", value: "48/52 passed", ok: false },
      { label: "冒烟测试", value: "12 passed", ok: true },
      { label: "阻断问题", value: "1 项待整改", ok: false },
    ],
    independentReview: "审查跨模块业务流程与问题复现用例",
    fallback: "补充复现测试后退回开发",
  },
  {
    id: "g4",
    index: "G4",
    name: "交付提交",
    state: "todo",
    deliverables: ["变更说明", "发布与回滚方案", "审查问题处理结果"],
    checks: [
      { label: "AI 代码审核", value: "待触发", ok: false },
      { label: "安全扫描", value: "待触发", ok: false },
      { label: "责任人审批", value: "待提交", ok: false },
    ],
    independentReview: "审查智能体核对实现与需求、安全合规与变更影响",
    fallback: "退回对应环节并重新复验",
  },
];

/* AI 代码审核的检查维度 */
export const reviewDimensions = [
  { id: "r1", name: "功能正确性", found: 2, severity: "major" as const },
  { id: "r2", name: "安全", found: 1, severity: "blocker" as const },
  { id: "r3", name: "异常处理", found: 3, severity: "minor" as const },
  { id: "r4", name: "边界条件", found: 2, severity: "major" as const },
  { id: "r5", name: "并发与资源使用", found: 0, severity: "none" as const },
  { id: "r6", name: "可维护性", found: 4, severity: "minor" as const },
  { id: "r7", name: "测试充分性", found: 1, severity: "major" as const },
  { id: "r8", name: "修改影响范围", found: 0, severity: "none" as const },
];

export const severityLabel: Record<string, string> = {
  blocker: "阻断",
  major: "严重",
  minor: "一般",
  none: "无",
};

/* ==================== （三）结构化任务交接：证据链 ==================== */

export type EvidenceKind =
  | "change"
  | "toolcall"
  | "test"
  | "scan"
  | "review"
  | "approval";

export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  title: string;
  source: string;
  version: string;
  at: string;
  actor: string;
  confirmed: boolean;
  required: boolean;
}

export const evidenceKindLabel: Record<EvidenceKind, string> = {
  change: "实际变更",
  toolcall: "关键工具调用",
  test: "测试结果",
  scan: "安全扫描",
  review: "独立审查",
  approval: "人工审批",
};

export const evidenceChain: EvidenceItem[] = [
  {
    id: "ev-1",
    kind: "change",
    title: "5 个文件变更 · +302 −187",
    source: "git.corp/sse/vote_org_qfii",
    version: "fix/flaky-snapshot@a1c9f42",
    at: "10:12",
    actor: "开发智能体",
    confirmed: true,
    required: true,
  },
  {
    id: "ev-2",
    kind: "toolcall",
    title: "受控调用 18 次 · 拒绝 1 次",
    source: "受控连接层审计",
    version: "audit-2026-08-12",
    at: "10:12",
    actor: "受控连接层",
    confirmed: true,
    required: true,
  },
  {
    id: "ev-3",
    kind: "test",
    title: "单元 312 passed · 覆盖率 91.4%",
    source: "ci.corp/pipeline/8841",
    version: "run#8841",
    at: "10:18",
    actor: "测试智能体",
    confirmed: true,
    required: true,
  },
  {
    id: "ev-4",
    kind: "test",
    title: "集成 48/52 passed · 4 failed",
    source: "ci.corp/pipeline/8842",
    version: "run#8842",
    at: "10:24",
    actor: "测试智能体",
    confirmed: false,
    required: true,
  },
  {
    id: "ev-5",
    kind: "scan",
    title: "SAST 1 阻断项待整改",
    source: "scan.corp/sast/2291",
    version: "sast#2291",
    at: "10:25",
    actor: "确定性程序",
    confirmed: false,
    required: true,
  },
  {
    id: "ev-6",
    kind: "review",
    title: "独立审查 13 项问题 · 1 阻断",
    source: "审查智能体",
    version: "review#441",
    at: "10:27",
    actor: "审查智能体",
    confirmed: false,
    required: true,
  },
  {
    id: "ev-7",
    kind: "approval",
    title: "代码合并审批",
    source: "project.corp/approval",
    version: "—",
    at: "待提交",
    actor: "项目负责人",
    confirmed: false,
    required: true,
  },
];

/* 定向返工路由 */
export const reworkRoutes: {
  id: string;
  cause: string;
  target: string;
  handler: "智能体" | "人工";
  note: string;
}[] = [
  {
    id: "rw-1",
    cause: "需求语义或验收条件需澄清",
    target: "需求分析 + 人工确认",
    handler: "人工",
    note: "关键业务含义由业务人员最终确认",
  },
  {
    id: "rw-2",
    cause: "架构、接口或兼容性问题",
    target: "方案设计",
    handler: "智能体",
    note: "架构智能体重评接口与影响范围",
  },
  {
    id: "rw-3",
    cause: "实现、测试或代码质量问题",
    target: "开发与测试",
    handler: "智能体",
    note: "先补可复现测试，再修改代码并复验",
  },
  {
    id: "rw-4",
    cause: "工具权限不足或外部系统异常",
    target: "暂停调用并记录原因",
    handler: "人工",
    note: "由人员确认权限范围后恢复",
  },
  {
    id: "rw-5",
    cause: "连续失败、信息不足或风险上升",
    target: "人工接管节点",
    handler: "人工",
    note: "人员决定继续、调整、降级或终止",
  },
];

/* 任务回放 */
export interface ReplayStep {
  id: string;
  at: string;
  stage: string;
  actor: string;
  action: string;
  materials: string;
  tier: PermTier | "—";
  result: "ok" | "fail" | "denied" | "wait";
}

export const replaySteps: ReplayStep[] = [
  { id: "rp-1", at: "10:02", stage: "任务契约", actor: "责任人", action: "确认范围、完成标准与审批点", materials: "contract@v3", tier: "—", result: "ok" },
  { id: "rp-2", at: "10:04", stage: "资料读取", actor: "受控连接层", action: "按权限读取需求与源码", materials: "sseinternetvote@a1c9f42", tier: "readonly", result: "ok" },
  { id: "rp-3", at: "10:06", stage: "需求分析", actor: "需求智能体", action: "抽取业务规则并标注事实/推断", materials: "req@v2", tier: "readonly", result: "ok" },
  { id: "rp-4", at: "10:09", stage: "门禁 G1", actor: "需求审查智能体", action: "核对完整性与可测试性", materials: "review#438", tier: "—", result: "ok" },
  { id: "rp-5", at: "10:12", stage: "开发", actor: "开发智能体", action: "隔离分支修改 5 个文件", materials: "diff@302/187", tier: "write", result: "ok" },
  { id: "rp-6", at: "10:13", stage: "受控调用", actor: "受控连接层", action: "尝试写入生产配置", materials: "release.exec", tier: "highrisk", result: "denied" },
  { id: "rp-7", at: "10:18", stage: "门禁 G2", actor: "确定性程序", action: "单元测试与覆盖率检查", materials: "run#8841", tier: "readonly", result: "ok" },
  { id: "rp-8", at: "10:24", stage: "门禁 G3", actor: "确定性程序", action: "集成测试 4 项失败", materials: "run#8842", tier: "readonly", result: "fail" },
  { id: "rp-9", at: "10:25", stage: "定向返工", actor: "主控智能体", action: "判定为实现问题，退回开发与测试", materials: "rework#7", tier: "—", result: "ok" },
  { id: "rp-10", at: "10:27", stage: "人工检查点", actor: "项目负责人", action: "等待代码合并审批", materials: "approval#—", tier: "highrisk", result: "wait" },
];

/* ========================= 环境与沙箱（承接第六章边界） ================= */

export interface CloudEnv {
  id: string;
  name: string;
  region: string;
  spec: string;
  image: string;
  state: "ready" | "warming" | "stopped";
  network: string;
  dataTier: string;
  active: boolean;
}

export const cloudEnvs: CloudEnv[] = [
  {
    id: "e-inner",
    name: "内网受控环境",
    region: "idc-shanghai-b",
    spec: "8 vCPU · 16 GiB · 60 GiB SSD",
    image: "agentflow-sandbox:2026.08",
    state: "ready",
    network: "仅内网 · 白名单出站",
    dataTier: "可使用原始材料（授权范围内）",
    active: true,
  },
  {
    id: "e-outer",
    name: "外部执行环境",
    region: "cloud-shanghai-c",
    spec: "16 vCPU · 64 GiB · 200 GiB SSD",
    image: "agentflow-sandbox-heavy:2026.08",
    state: "warming",
    network: "公网受限 · 强制代理",
    dataTier: "材料须先完成脱敏",
    active: false,
  },
  {
    id: "e-lite",
    name: "轻量校验环境",
    region: "idc-beijing-a",
    spec: "2 vCPU · 4 GiB · 20 GiB SSD",
    image: "agentflow-sandbox-lite:2026.08",
    state: "stopped",
    network: "无出网",
    dataTier: "仅脱敏摘要",
    active: false,
  },
];

export const cloudEnvStateLabel: Record<CloudEnv["state"], string> = {
  ready: "就绪",
  warming: "预热中",
  stopped: "已停止",
};

export const sandboxToggles = [
  { id: "s-branch", title: "隔离分支修改", body: "代码、配置与文档只在隔离分支与安全环境中修改。", on: true, locked: true },
  { id: "s-whitelist", title: "命令与网络白名单", body: "终端命令、网络地址、文件与工具按任务白名单调用。", on: true, locked: true },
  { id: "s-mask", title: "日志与缓存分级", body: "模型服务产生的日志、缓存和中间文件按分类分级管理。", on: true, locked: true },
  { id: "s-persist", title: "工作区持久化", body: "任务结束后保留 24 小时，便于中断恢复与事后复核。", on: true, locked: false },
  { id: "s-root", title: "特权模式", body: "允许容器内 root 与挂载操作，风险较高。", on: false, locked: false },
  { id: "s-cache", title: "依赖缓存", body: "复用 pnpm / pip 缓存卷，冷启动更快。", on: true, locked: false },
];

export const sandboxLimits = [
  { label: "单任务超时", value: "30 分钟" },
  { label: "连续失败上限", value: "3 次转人工" },
  { label: "磁盘写入上限", value: "10 GiB" },
  { label: "审计日志保留", value: "180 天" },
];

export const envVars = [
  { key: "TASK_CONTRACT_ID", value: "contract-2026-0812-03", secret: false },
  { key: "DATA_TIER", value: "L2-internal", secret: false },
  { key: "REGISTRY_TOKEN", value: "由凭据系统注入", secret: true },
  { key: "SCA_API_KEY", value: "由凭据系统注入", secret: true },
];
