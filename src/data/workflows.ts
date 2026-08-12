/* ============================================================
   AGENTFLOW — 工作流编排（DAG）
   节点绑定智能体角色，边分为流转 / 失败回退 / 审批三类
   ============================================================ */

import type { IconName } from "../components/Icons";
import type { AgentRole } from "./settings";

export type EdgeKind = "flow" | "fail" | "approve";

/* ---------------------------------------------------------------
   主控智能体（Orchestrator）
   每个工作流必须且只能有一个。它不是流程里的一个普通节点，
   而是这条流程的「设计者与监工」：
     1. 开工前 —— 为每个节点设计契约规则（输入/输出文件 + 本次任务的具体职责）
     2. 开工后 —— 汇总各节点输出、监控偏差、辅助调度
   契约由主控下发，因此职责描述可以超出 agent 自带提示词的范围。
   --------------------------------------------------------------- */

/** 节点契约：主控智能体为某个节点下发的输入输出与职责约定 */
export interface NodeContract {
  /** 该节点开工所需的输入文件（缺失即不允许启动） */
  inputs: string[];
  /** 该节点必须交付的输出文件（缺失即视为未完成） */
  outputs: string[];
  /** 与当前任务匹配的具体职责，由主控按任务上下文下发，非 agent 通用提示词 */
  duty: string;
  /** 完成判定：可被机器或人核验的验收条件 */
  acceptance: string;
  /** 被人工改写过：结构变化时不再被自动推导覆盖 */
  manual?: boolean;
}

export interface Orchestrator {
  id: string;
  name: string;
  /** 主控自身的职责说明 */
  duty: string;
  /** 汇总与监控策略 */
  supervision: string[];
  /** 按节点 id 索引的契约规则 */
  contracts: Record<string, NodeContract>;
}

/** 节点运行态：决定节点能否被点开查看消息 */
export type NodeRunState = "done" | "running" | "blocked" | "todo";

export const nodeRunLabel: Record<NodeRunState, string> = {
  done: "已完成",
  running: "进行中",
  blocked: "已阻断",
  todo: "未开始",
};

/** 节点消息：某个智能体在执行期间产生的一条信息 */
export interface NodeMessage {
  id: string;
  /** 发出这条消息的节点 id；主控自身的消息用 "orchestrator" */
  node: string;
  at: string;
  tone: "plan" | "act" | "output" | "warn" | "gate";
  title: string;
  body: string;
  /** 关联的产物或证据 */
  refs?: string[];
}

export interface WfNode {
  id: string;
  name: string;
  role: AgentRole;
  col: number;
  lane: number;
  desc: string;
  gate?: string;
  approval?: boolean;
}

export interface WfEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
}

export interface Workflow {
  id: string;
  name: string;
  glyph: IconName;
  tint: "accent" | "cyan" | "sage" | "gold" | "plum" | "azure";
  builtin: boolean;
  summary: string;
  scene: string;
  nodes: WfNode[];
  edges: WfEdge[];
  maxRetry: number;
  onExhaust: "人工接管" | "降级处理" | "终止任务";
  /** 主控智能体：必须存在，由 withOrchestrator 保证 */
  orchestrator: Orchestrator;
}

export const roleGlyph: Record<AgentRole, IconName> = {
  orchestrator: "Nodes",
  requirement: "Book",
  architecture: "Layers",
  development: "Pencil",
  testing: "Beaker",
  review: "Shield",
  delivery: "Cube",
  ops: "Terminal",
};

export const roleTint: Record<AgentRole, Workflow["tint"]> = {
  orchestrator: "accent",
  requirement: "azure",
  architecture: "cyan",
  development: "accent",
  testing: "sage",
  review: "gold",
  delivery: "plum",
  ops: "sage",
};

export const edgeKindLabel: Record<EdgeKind, string> = {
  flow: "流转",
  fail: "失败回退",
  approve: "人工审批",
};

/* ------------------- 主控智能体：契约规则生成 -------------------------
   契约按「角色 × 上游产物」推导：输入来自上游节点的输出，
   形成一条首尾相接的产物链 —— 这正是主控存在的意义：
   它让每个节点的开工条件与交付标准都可核验，而不依赖 agent 自觉。
   --------------------------------------------------------------------- */

/** 各角色的交付物与职责模板 */
const roleContract: Record<
  AgentRole,
  { outputs: string[]; duty: string; acceptance: string }
> = {
  orchestrator: {
    outputs: ["orchestration/plan.md", "orchestration/status.json"],
    duty: "拆解任务、下发契约、汇总各节点输出并监控偏差。",
    acceptance: "各节点契约齐备且状态可追溯。",
  },
  requirement: {
    outputs: ["docs/requirement.md", "docs/acceptance.md"],
    duty: "把任务目标拆成可测试的验收条件，标注事实、推断与待确认项。",
    acceptance: "每条需求都有对应验收条件，无未标注的推断。",
  },
  architecture: {
    outputs: ["docs/design.md", "docs/interface.md"],
    duty: "确定模块职责与接口边界，记录关键设计决定及其理由。",
    acceptance: "接口定义完整，变更影响范围已评估。",
  },
  development: {
    outputs: ["src/**", "test/**"],
    duty: "在隔离分支实现需求并同步补齐单元测试，保持既有契约不变。",
    acceptance: "编译通过、单元测试全绿、无未声明的接口变更。",
  },
  testing: {
    outputs: ["test/**", "reports/coverage.json"],
    duty: "按验收条件编写用例，保留预期失败记录再补实现。",
    acceptance: "覆盖率达阈值，关键分支均有断言。",
  },
  review: {
    outputs: ["reports/review.md"],
    duty: "独立核对实现与需求，检查安全、异常处理与影响范围。",
    acceptance: "无阻断问题，严重问题均已整改或明确豁免。",
  },
  delivery: {
    outputs: ["docs/changelog.md", "docs/rollback.md"],
    duty: "汇总变更说明、测试报告与回滚方案，提交责任人验收。",
    acceptance: "证据链完整，回滚方案可执行。",
  },
  ops: {
    outputs: ["ops/deploy.log"],
    duty: "执行构建与部署脚本，回写运行状态并全程留痕。",
    acceptance: "部署成功且状态已回写，异常有告警记录。",
  },
};

/**
 * 为工作流补齐主控智能体。
 * 输入 = 上游节点（按流转边）的输出并集；无上游时取任务契约本身。
 * 这样每个节点的开工条件都能追溯到某个具体产物，而非「大概齐」。
 */
export function withOrchestrator(
  wf: Omit<Workflow, "orchestrator">,
  overrides: Partial<Record<string, Partial<NodeContract>>> = {},
): Workflow {
  const contracts: Record<string, NodeContract> = {};

  wf.nodes.forEach((n) => {
    const base = roleContract[n.role];
    const upstream = wf.edges
      .filter((e) => e.kind === "flow" && e.to === n.id)
      .map((e) => wf.nodes.find((x) => x.id === e.from))
      .filter((x): x is WfNode => Boolean(x));

    const inputs = upstream.length
      ? Array.from(new Set(upstream.flatMap((u) => roleContract[u.role].outputs)))
      : ["contract/task.md"];

    contracts[n.id] = {
      inputs,
      outputs: base.outputs,
      /* 职责 = 角色通用职责 + 该节点在本工作流中的具体分工 */
      duty: `${base.duty} 本节点在「${wf.name}」中负责：${n.desc}`,
      acceptance: n.gate ? `${base.acceptance}（门禁：${n.gate}）` : base.acceptance,
      ...overrides[n.id],
    };
  });

  return {
    ...wf,
    orchestrator: {
      id: `orch-${wf.id}`,
      name: "主控智能体",
      duty:
        "开工前为每个节点下发契约规则（输入输出产物与本次任务的具体职责）；" +
        "运行期汇总各节点输出信息流，监控偏差并辅助调度。",
      supervision: [
        `重试上限 ${wf.maxRetry} 次，超限后${wf.onExhaust}`,
        "节点输入产物缺失时不允许启动，直接回退上游",
        "输出未达验收条件时按失败回退边定向返工",
        "汇总各节点信息流，向人工检查点提交结论与证据",
      ],
      contracts,
    },
  };
}

/** 模板声明期还没有主控智能体，由 withOrchestrator 在出口处补齐 */
export type WfTemplate = Omit<Workflow, "orchestrator">;

/* ------------------------- 1. 需求开发（默认） ------------------------- */

const wfFeature: WfTemplate = {
  id: "wf-feature",
  name: "需求开发",
  glyph: "Book",
  tint: "azure",
  builtin: true,
  summary: "需求分析 → 代码开发 → 评审 → 交付，每级失败回退上一节点。",
  scene: "新增功能、需求变更、常规迭代交付",
  maxRetry: 3,
  onExhaust: "人工接管",
  nodes: [
    {
      id: "n1",
      name: "需求分析",
      role: "requirement",
      col: 0,
      lane: 0,
      desc: "拆解需求语义与验收条件，标注事实、推断与待确认项。",
      gate: "需求可测试性",
      approval: true,
    },
    {
      id: "n2",
      name: "代码开发",
      role: "development",
      col: 1,
      lane: 0,
      desc: "在隔离分支实现需求，同步补齐单元测试。",
      gate: "编译与单元测试",
    },
    {
      id: "n3",
      name: "评审",
      role: "review",
      col: 2,
      lane: 0,
      desc: "独立核对实现与需求，检查安全、异常处理与影响范围。",
      gate: "无阻断与严重问题",
    },
    {
      id: "n4",
      name: "交付",
      role: "delivery",
      col: 3,
      lane: 0,
      desc: "汇总变更说明、测试报告与回滚方案，提交责任人验收。",
      gate: "证据链完整",
      approval: true,
    },
  ],
  edges: [
    { id: "e1", from: "n1", to: "n2", kind: "flow" },
    { id: "e2", from: "n2", to: "n3", kind: "flow" },
    { id: "e3", from: "n3", to: "n4", kind: "flow" },
    { id: "f1", from: "n2", to: "n1", kind: "fail", label: "需求不明" },
    { id: "f2", from: "n3", to: "n2", kind: "fail", label: "实现问题" },
    { id: "f3", from: "n4", to: "n3", kind: "fail", label: "证据不足" },
  ],
};

/* ------------------------- 2. 单元测试（默认） ------------------------- */

const wfUnit: WfTemplate = {
  id: "wf-unit",
  name: "单元测试",
  glyph: "Beaker",
  tint: "sage",
  builtin: true,
  summary: "单元测试代码开发 → 评审 → 交付，每级失败回退上一节点。",
  scene: "测试补充、覆盖率提升、历史模块补测",
  maxRetry: 3,
  onExhaust: "人工接管",
  nodes: [
    {
      id: "n1",
      name: "单元测试开发",
      role: "testing",
      col: 0,
      lane: 0,
      desc: "按已确认需求编写用例，保留预期失败记录后再补实现。",
      gate: "覆盖率阈值",
    },
    {
      id: "n2",
      name: "评审",
      role: "review",
      col: 1,
      lane: 0,
      desc: "检查用例是否覆盖主要业务规则与边界，核查断言有效性。",
      gate: "断言有效性",
    },
    {
      id: "n3",
      name: "交付",
      role: "delivery",
      col: 2,
      lane: 0,
      desc: "提交测试资产与覆盖率报告，纳入回归基线。",
      gate: "证据链完整",
      approval: true,
    },
  ],
  edges: [
    { id: "e1", from: "n1", to: "n2", kind: "flow" },
    { id: "e2", from: "n2", to: "n3", kind: "flow" },
    { id: "f1", from: "n2", to: "n1", kind: "fail", label: "覆盖不足" },
    { id: "f2", from: "n3", to: "n2", kind: "fail", label: "复核未过" },
  ],
};

/* --------------------------- 3. 缺陷修复 ------------------------------- */

const wfBugfix: WfTemplate = {
  id: "wf-bugfix",
  name: "缺陷修复",
  glyph: "Bolt",
  tint: "gold",
  builtin: true,
  summary: "先复现再定位，修复后回归验证，失败按原因定向回退。",
  scene: "线上缺陷、CI 偶发失败、生产问题处置",
  maxRetry: 3,
  onExhaust: "人工接管",
  nodes: [
    {
      id: "n1",
      name: "缺陷复现",
      role: "testing",
      col: 0,
      lane: 0,
      desc: "补一条能稳定复现问题的测试，作为修复的验证标准。",
      gate: "可复现用例",
    },
    {
      id: "n2",
      name: "根因定位",
      role: "architecture",
      col: 1,
      lane: 0,
      desc: "沿调用链定位根因，判断影响范围与兼容性风险。",
    },
    {
      id: "n3",
      name: "修复实现",
      role: "development",
      col: 2,
      lane: 0,
      desc: "以最小改动修复，保持既有契约不变。",
      gate: "复现用例转通过",
    },
    {
      id: "n4",
      name: "回归验证",
      role: "testing",
      col: 3,
      lane: 0,
      desc: "运行受影响模块的回归测试与关键业务流程。",
      gate: "回归全绿",
    },
    {
      id: "n5",
      name: "评审交付",
      role: "review",
      col: 4,
      lane: 0,
      desc: "审查修复方式与副作用，汇总证据链提交合并。",
      gate: "无阻断问题",
      approval: true,
    },
  ],
  edges: [
    { id: "e1", from: "n1", to: "n2", kind: "flow" },
    { id: "e2", from: "n2", to: "n3", kind: "flow" },
    { id: "e3", from: "n3", to: "n4", kind: "flow" },
    { id: "e4", from: "n4", to: "n5", kind: "flow" },
    { id: "f1", from: "n2", to: "n1", kind: "fail", label: "无法复现" },
    { id: "f2", from: "n3", to: "n2", kind: "fail", label: "根因有误" },
    { id: "f3", from: "n4", to: "n3", kind: "fail", label: "回归失败" },
    { id: "f4", from: "n5", to: "n3", kind: "fail", label: "审查驳回" },
  ],
};

/* ---------------------- 4. 存量系统逆向重构 ---------------------------- */

const wfLegacy: WfTemplate = {
  id: "wf-legacy",
  name: "存量系统逆向重构",
  glyph: "Layers",
  tint: "cyan",
  builtin: true,
  summary: "从源码逆向需求，人工确认后重新设计并以测试驱动方式重写。",
  scene: "资料缺失的存量系统梳理与整系统重写",
  maxRetry: 2,
  onExhaust: "人工接管",
  nodes: [
    {
      id: "n1",
      name: "源码解析",
      role: "architecture",
      col: 0,
      lane: 0,
      desc: "按模块、调用关系与依赖整理源码，记录来源与版本。",
    },
    {
      id: "n2",
      name: "需求逆向",
      role: "requirement",
      col: 1,
      lane: 0,
      desc: "抽取业务规则与接口行为，区分代码事实、推断与待确认。",
      gate: "G1 需求与设计",
      approval: true,
    },
    {
      id: "n3",
      name: "架构设计",
      role: "architecture",
      col: 2,
      lane: 0,
      desc: "确定新系统结构、模块职责、接口与关键设计决定。",
      gate: "G1 需求与设计",
    },
    {
      id: "n4",
      name: "测试驱动开发",
      role: "development",
      col: 3,
      lane: 0,
      desc: "先写用例并保留预期失败，再实现代码直至转为通过。",
      gate: "G2 测试驱动开发",
    },
    {
      id: "n5",
      name: "集成验证",
      role: "testing",
      col: 4,
      lane: 0,
      desc: "跨模块业务流程集成测试与浏览器冒烟测试。",
      gate: "G3 集成验证",
    },
    {
      id: "n6",
      name: "交付验收",
      role: "delivery",
      col: 5,
      lane: 0,
      desc: "输出需求、设计、验证与运维四类材料，交付人工验收。",
      gate: "G4 交付提交",
      approval: true,
    },
  ],
  edges: [
    { id: "e1", from: "n1", to: "n2", kind: "flow" },
    { id: "e2", from: "n2", to: "n3", kind: "flow" },
    { id: "e3", from: "n3", to: "n4", kind: "flow" },
    { id: "e4", from: "n4", to: "n5", kind: "flow" },
    { id: "e5", from: "n5", to: "n6", kind: "flow" },
    { id: "f1", from: "n2", to: "n1", kind: "fail", label: "资料不足" },
    { id: "f2", from: "n3", to: "n2", kind: "fail", label: "语义待澄清" },
    { id: "f3", from: "n4", to: "n3", kind: "fail", label: "接口不兼容" },
    { id: "f4", from: "n5", to: "n4", kind: "fail", label: "集成失败" },
    { id: "f5", from: "n6", to: "n5", kind: "fail", label: "验收驳回" },
  ],
};

/* ---------------------- 5. 开源漏洞排查整改 --------------------------- */

const wfCve: WfTemplate = {
  id: "wf-cve",
  name: "开源漏洞整改",
  glyph: "Shield",
  tint: "gold",
  builtin: true,
  summary: "排查后并行做依赖分析与版本核对，整改经回归与审查后发布。",
  scene: "组件漏洞通告、跨项目安全处置",
  maxRetry: 2,
  onExhaust: "降级处理",
  nodes: [
    {
      id: "n1",
      name: "影响排查",
      role: "orchestrator",
      col: 0,
      lane: 0,
      desc: "读取组件清单与依赖扫描结果，确定受影响项目范围。",
    },
    {
      id: "n2",
      name: "依赖分析",
      role: "architecture",
      col: 1,
      lane: 0,
      desc: "区分直接依赖与间接依赖，确定可用修复版本。",
    },
    {
      id: "n3",
      name: "兼容性核对",
      role: "testing",
      col: 1,
      lane: 1,
      desc: "核对接口变化、构建限制与可能影响的业务功能。",
    },
    {
      id: "n4",
      name: "整改实现",
      role: "development",
      col: 2,
      lane: 0,
      desc: "在独立分支升级组件并调整代码、配置与构建文件。",
      gate: "构建与单元测试",
    },
    {
      id: "n5",
      name: "回归验证",
      role: "testing",
      col: 3,
      lane: 0,
      desc: "执行集成测试与关键业务回归测试。",
      gate: "关键业务回归",
    },
    {
      id: "n6",
      name: "安全复核",
      role: "review",
      col: 4,
      lane: 0,
      desc: "确认漏洞已消除、依赖完整升级且未引入新问题。",
      gate: "漏洞已消除",
    },
    {
      id: "n7",
      name: "发布审批",
      role: "delivery",
      col: 5,
      lane: 0,
      desc: "由项目负责人批准合并与发布，状态回写现有平台。",
      gate: "责任人审批",
      approval: true,
    },
  ],
  edges: [
    { id: "e1", from: "n1", to: "n2", kind: "flow" },
    { id: "e2", from: "n1", to: "n3", kind: "flow" },
    { id: "e3", from: "n2", to: "n4", kind: "flow" },
    { id: "e4", from: "n3", to: "n4", kind: "flow" },
    { id: "e5", from: "n4", to: "n5", kind: "flow" },
    { id: "e6", from: "n5", to: "n6", kind: "flow" },
    { id: "e7", from: "n6", to: "n7", kind: "flow" },
    { id: "f1", from: "n4", to: "n2", kind: "fail", label: "无可用版本" },
    { id: "f2", from: "n5", to: "n4", kind: "fail", label: "回归失败" },
    { id: "f3", from: "n6", to: "n4", kind: "fail", label: "仍有风险" },
    { id: "f4", from: "n7", to: "n6", kind: "fail", label: "审批驳回" },
  ],
};

/* ------------------------- 6. AI 代码审核 ----------------------------- */

const wfReview: WfTemplate = {
  id: "wf-review",
  name: "AI 代码审核",
  glyph: "Merge",
  tint: "plum",
  builtin: true,
  summary: "取差异后并行做功能与安全审查，汇总问题定向整改再复核。",
  scene: "合并请求触发的公共质量节点、项目全量扫描",
  maxRetry: 2,
  onExhaust: "人工接管",
  nodes: [
    {
      id: "n1",
      name: "差异获取",
      role: "orchestrator",
      col: 0,
      lane: 0,
      desc: "经受控连接层取得代码差异、相关文件、任务说明与项目规则。",
    },
    {
      id: "n2",
      name: "功能与边界审查",
      role: "review",
      col: 1,
      lane: 0,
      desc: "检查功能正确性、异常处理、边界条件与并发资源使用。",
    },
    {
      id: "n3",
      name: "安全与合规审查",
      role: "review",
      col: 1,
      lane: 1,
      desc: "检查安全问题、合规要求、测试充分性与修改影响范围。",
    },
    {
      id: "n4",
      name: "问题汇总",
      role: "orchestrator",
      col: 2,
      lane: 0,
      desc: "按问题位置与严重程度写回代码平台，区分阻断与一般问题。",
      gate: "严重问题必须整改",
    },
    {
      id: "n5",
      name: "定向整改",
      role: "development",
      col: 3,
      lane: 0,
      desc: "按问题清单修改，一般问题由人员决定是否处理。",
    },
    {
      id: "n6",
      name: "复核放行",
      role: "review",
      col: 4,
      lane: 0,
      desc: "复核整改结果，通过后允许进入人工合并流程。",
      gate: "复核通过",
      approval: true,
    },
  ],
  edges: [
    { id: "e1", from: "n1", to: "n2", kind: "flow" },
    { id: "e2", from: "n1", to: "n3", kind: "flow" },
    { id: "e3", from: "n2", to: "n4", kind: "flow" },
    { id: "e4", from: "n3", to: "n4", kind: "flow" },
    { id: "e5", from: "n4", to: "n5", kind: "flow" },
    { id: "e6", from: "n5", to: "n6", kind: "flow" },
    { id: "f1", from: "n6", to: "n5", kind: "fail", label: "整改不达标" },
    { id: "f2", from: "n5", to: "n4", kind: "fail", label: "问题需重判" },
  ],
};

/* 7. 自定义编排：从最小骨架开始，按需插入节点与失败回退 */

const wfCustom: WfTemplate = {
  id: "wf-custom",
  name: "自定义编排",
  glyph: "Sparkle",
  tint: "accent",
  builtin: true,
  summary: "从最小骨架开始，按需插入节点、连接失败回退，组合多角色流程。",
  scene: "非典型场景、需要自行组合角色的自定义流程",
  maxRetry: 2,
  onExhaust: "人工接管",
  nodes: [
    {
      id: "cu1",
      name: "需求分析",
      role: "requirement",
      col: 0,
      lane: 0,
      desc: "拆解需求语义与验收条件，标注事实、推断与待确认项。",
      gate: "需求可测试性",
      approval: true,
    },
    {
      id: "cu2",
      name: "交付",
      role: "delivery",
      col: 1,
      lane: 0,
      desc: "汇总变更说明、测试报告与回滚方案，提交责任人验收。",
      gate: "证据链完整",
    },
  ],
  edges: [
    { id: "cu-e1", from: "cu1", to: "cu2", kind: "flow" },
    { id: "cu-f1", from: "cu2", to: "cu1", kind: "fail", label: "校验未过" },
  ],
};

/* 主控智能体对每个模板都必须存在，统一在出口处补齐，
   避免每个模板手写一遍契约（也就无法漏写） */
export const workflowTemplates: Workflow[] = [
  wfFeature,
  wfUnit,
  wfBugfix,
  wfLegacy,
  wfCve,
  wfReview,
  wfCustom,
].map((w) => withOrchestrator(w));

/* ==================== 运行态：节点状态与消息流 ========================
   这两项让「编排图」从静态配置变成可观测的运行现场：
   点开任一已完成或进行中的节点，就能看到它当时到底做了什么。
   ===================================================================== */

/** 某次运行中各节点的状态 */
export type WfRunStates = Record<string, NodeRunState>;

/** 需求开发流程的运行现场（对应默认会话 s-1） */
export const demoRunStates: WfRunStates = {
  n1: "done",
  n2: "running",
  n3: "todo",
  n4: "todo",
};

/**
 * 节点消息流。主控视图 = 全部消息按时间汇总；
 * 点开某节点 = 只看该节点自己的消息。
 */
export const demoMessages: NodeMessage[] = [
  {
    id: "m1",
    node: "orchestrator",
    at: "10:20:04",
    tone: "plan",
    title: "已下发 4 份节点契约",
    body: "按「需求开发」编排为 4 个节点各下发输入输出与职责约定，重试上限 3 次，超限转人工接管。",
    refs: ["orchestration/plan.md"],
  },
  {
    id: "m2",
    node: "n1",
    at: "10:20:16",
    tone: "act",
    title: "读取任务契约",
    body: "解析 contract/task.md，提取 20 条约定，识别出 3 项需要澄清的语义。",
    refs: ["contract/task.md"],
  },
  {
    id: "m3",
    node: "n1",
    at: "10:21:38",
    tone: "output",
    title: "交付需求与验收条件",
    body: "输出 12 条可测试需求，每条附验收条件；3 项推断已显式标注待确认。",
    refs: ["docs/requirement.md", "docs/acceptance.md"],
  },
  {
    id: "m4",
    node: "n1",
    at: "10:21:52",
    tone: "gate",
    title: "门禁通过：需求可测试性",
    body: "12/12 条需求具备可验证的验收条件，允许流转到代码开发。",
  },
  {
    id: "m5",
    node: "orchestrator",
    at: "10:21:55",
    tone: "plan",
    title: "调度：需求分析 → 代码开发",
    body: "上游产物齐备（requirement.md、acceptance.md），满足代码开发的输入契约，准许启动。",
  },
  {
    id: "m6",
    node: "n2",
    at: "10:22:09",
    tone: "act",
    title: "定位改造范围",
    body: "grep refreshToken|rotateSession 命中 4 个文件 17 处，确定以 token-service 收敛重复逻辑。",
  },
  {
    id: "m7",
    node: "n2",
    at: "10:23:41",
    tone: "output",
    title: "提交实现与单元测试",
    body: "新增 token-service.ts（+94），改造 3 个中间件，补 26 行用例；累计 +148 −62。",
    refs: ["src/auth/token-service.ts", "test/auth/token-service.spec.ts"],
  },
  {
    id: "m8",
    node: "n2",
    at: "10:24:02",
    tone: "warn",
    title: "偏差提示：遗留弃用注释",
    body: "legacy/compat.ts 的再导出仍保留，但缺少 @deprecated 注释，未违反契约但建议补齐。",
    refs: ["legacy/compat.ts"],
  },
  {
    id: "m9",
    node: "orchestrator",
    at: "10:24:05",
    tone: "warn",
    title: "监控：1 项非阻断偏差待决",
    body: "代码开发输出满足验收条件，弃用注释属建议项。已记入证据链，交由人工检查点判定。",
  },
];

/* ============================ 布局与编辑 ============================== */

export const NODE_W = 148;
export const NODE_H = 62;
export const GAP_X = 60;
export const GAP_Y = 26;

export function nodePos(n: WfNode) {
  return { x: n.col * (NODE_W + GAP_X), y: n.lane * (NODE_H + GAP_Y) };
}

export function dagSize(nodes: WfNode[]) {
  const maxCol = Math.max(0, ...nodes.map((n) => n.col));
  const maxLane = Math.max(0, ...nodes.map((n) => n.lane));
  return {
    w: maxCol * (NODE_W + GAP_X) + NODE_W,
    h: maxLane * (NODE_H + GAP_Y) + NODE_H,
  };
}

/** 流转边：右侧出、左侧入，三次贝塞尔 */
export function flowPath(a: WfNode, b: WfNode) {
  const pa = nodePos(a);
  const pb = nodePos(b);
  const x1 = pa.x + NODE_W;
  const y1 = pa.y + NODE_H / 2;
  const x2 = pb.x;
  const y2 = pb.y + NODE_H / 2;
  const dx = Math.max(28, (x2 - x1) * 0.55);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

/** 失败回退边：自底部下沉后向左回绕，depth 用于错开多条回退线 */
export function failPath(a: WfNode, b: WfNode, depth: number, baseY: number) {
  const pa = nodePos(a);
  const pb = nodePos(b);
  const x1 = pa.x + NODE_W * 0.34;
  const y1 = pa.y + NODE_H;
  const x2 = pb.x + NODE_W * 0.66;
  const y2 = pb.y + NODE_H;
  const dip = baseY + depth * 17;
  return `M ${x1} ${y1} C ${x1} ${dip}, ${x2} ${dip}, ${x2} ${y2}`;
}

/** 回退边标签的落点 */
export function failLabelPos(a: WfNode, b: WfNode, depth: number, baseY: number) {
  const pa = nodePos(a);
  const pb = nodePos(b);
  const x1 = pa.x + NODE_W * 0.34;
  const x2 = pb.x + NODE_W * 0.66;
  const y1 = pa.y + NODE_H;
  const y2 = pb.y + NODE_H;
  const dip = baseY + depth * 17;
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 * 0.25 + dip * 0.75 };
}

/**
 * 结构变化后重建主控契约。
 * 节点或边一变，「上游产物 → 本节点输入」的推导结果就变了，
 * 因此每次编辑都必须重算，否则契约会指向已不存在的上游。
 * 人工改写过的契约（overrides）予以保留。
 */
function rebuild(wf: Workflow, keep: Record<string, NodeContract>): Workflow {
  const { orchestrator: _drop, ...rest } = wf;
  const next = withOrchestrator(rest);
  /* 保留仍然存在的节点上、被人工改过的契约字段 */
  Object.keys(keep).forEach((id) => {
    if (next.orchestrator.contracts[id] && keep[id].manual) {
      next.orchestrator.contracts[id] = keep[id];
    }
  });
  return next;
}

/** 在指定节点之后插入一个节点，自动重连流转边并补一条回退边 */
export function insertAfter(wf: Workflow, afterId: string, role: AgentRole, name: string): Workflow {
  const anchor = wf.nodes.find((n) => n.id === afterId);
  if (!anchor) return wf;
  const id = `n${Date.now().toString(36)}`;
  const nodes = wf.nodes.map((n) =>
    n.col > anchor.col ? { ...n, col: n.col + 1 } : n,
  );
  nodes.push({
    id,
    name,
    role,
    col: anchor.col + 1,
    lane: anchor.lane,
    desc: "新增节点，待补充职责说明。",
  });
  const edges: WfEdge[] = wf.edges.map((e) =>
    e.kind === "flow" && e.from === afterId ? { ...e, from: id } : e,
  );
  edges.push({ id: `e${id}`, from: afterId, to: id, kind: "flow" });
  edges.push({ id: `f${id}`, from: id, to: afterId, kind: "fail", label: "校验未过" });
  return rebuild(
    { ...wf, nodes, edges, builtin: false },
    wf.orchestrator.contracts,
  );
}

/** 删除节点，把它的前驱直接接到后继 */
export function removeNode(wf: Workflow, id: string): Workflow {
  const target = wf.nodes.find((n) => n.id === id);
  if (!target || wf.nodes.length <= 2) return wf;
  const preds = wf.edges.filter((e) => e.kind === "flow" && e.to === id).map((e) => e.from);
  const succs = wf.edges.filter((e) => e.kind === "flow" && e.from === id).map((e) => e.to);
  const kept = wf.edges.filter(
    (e) => e.from !== id && e.to !== id,
  );
  const bridged: WfEdge[] = [];
  preds.forEach((p) =>
    succs.forEach((s) => {
      if (!kept.some((e) => e.kind === "flow" && e.from === p && e.to === s))
        bridged.push({ id: `e${p}${s}`, from: p, to: s, kind: "flow" });
    }),
  );
  const nodes = wf.nodes
    .filter((n) => n.id !== id)
    .map((n) => (n.col > target.col ? { ...n, col: n.col - 1 } : n));
  return rebuild(
    { ...wf, nodes, edges: [...kept, ...bridged], builtin: false },
    wf.orchestrator.contracts,
  );
}

/** 切换某节点的失败回退目标 */
export function setFailTarget(wf: Workflow, nodeId: string, targetId: string | null): Workflow {
  const edges = wf.edges.filter((e) => !(e.kind === "fail" && e.from === nodeId));
  if (targetId) {
    edges.push({
      id: `f${nodeId}-${targetId}`,
      from: nodeId,
      to: targetId,
      kind: "fail",
      label: "校验未过",
    });
  }
  return rebuild({ ...wf, edges, builtin: false }, wf.orchestrator.contracts);
}

export function patchNode(wf: Workflow, id: string, patch: Partial<WfNode>): Workflow {
  return rebuild(
    {
      ...wf,
      builtin: false,
      nodes: wf.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    },
    wf.orchestrator.contracts,
  );
}

/** 人工改写某节点的契约：标记 manual，后续结构变化不再覆盖它 */
export function patchContract(
  wf: Workflow,
  nodeId: string,
  patch: Partial<NodeContract>,
): Workflow {
  const cur = wf.orchestrator.contracts[nodeId];
  if (!cur) return wf;
  return {
    ...wf,
    builtin: false,
    orchestrator: {
      ...wf.orchestrator,
      contracts: {
        ...wf.orchestrator.contracts,
        [nodeId]: { ...cur, ...patch, manual: true },
      },
    },
  };
}
