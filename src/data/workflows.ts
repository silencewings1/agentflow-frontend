/* ============================================================
   AGENTFLOW — 工作流编排（DAG）
   节点绑定智能体角色，边分为流转 / 失败回退 / 审批三类
   ============================================================ */

import type { IconName } from "../components/Icons";
import type { AgentEvent } from "./mock";
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

/** 一个模板的模拟运行现场：节点状态 + 完整消息流 */
export interface WfRun {
  states: WfRunStates;
  messages: NodeMessage[];
}

/* ==================== 各模板的模拟运行数据 ==========================
   每个模板都给出「每个阶段」的输出，并且都包含至少一次失败返工：
   失败沿 fail 边定向回退到上游，上游修正后重跑，重试轮次显式记录。
   这样界面上的返工不是一句空话，而是能一路读到证据的。

   约定：
   - tone: plan=调度 / act=执行 / output=产出 / warn=偏差 / gate=门禁
   - 回退用 warn（谁判的、为什么退、退到哪），重跑记 act 并标注第几轮
   - 主控消息 node 用 "orchestrator"，它负责调度、汇总与偏差裁决
   ===================================================================== */

/* ---------- 需求开发：代码开发未过评审，退回重做后通过 ---------- */
const runFeature: WfRun = {
  states: { n1: "done", n2: "done", n3: "done", n4: "running" },
  messages: [
    {
      id: "f-m1",
      node: "orchestrator",
      at: "10:20:04",
      tone: "plan",
      title: "已下发 4 份节点契约",
      body: "按「需求开发」编排为 4 个节点各下发输入输出与职责约定，重试上限 3 次，超限转人工接管。",
      refs: ["orchestration/plan.md"],
    },
    {
      id: "f-m2",
      node: "n1",
      at: "10:20:16",
      tone: "act",
      title: "读取任务契约",
      body: "解析 contract/task.md，提取 20 条约定，识别出 3 项需要澄清的语义。",
      refs: ["contract/task.md"],
    },
    {
      id: "f-m3",
      node: "n1",
      at: "10:21:38",
      tone: "output",
      title: "交付需求与验收条件",
      body: "输出 12 条可测试需求，每条附验收条件；3 项推断已显式标注待确认。",
      refs: ["docs/requirement.md", "docs/acceptance.md"],
    },
    {
      id: "f-m4",
      node: "n1",
      at: "10:21:52",
      tone: "gate",
      title: "门禁通过：需求可测试性",
      body: "12/12 条需求具备可验证的验收条件，允许流转到代码开发。",
    },
    {
      id: "f-m5",
      node: "orchestrator",
      at: "10:21:55",
      tone: "plan",
      title: "调度：需求分析 → 代码开发",
      body: "上游产物齐备（requirement.md、acceptance.md），满足代码开发的输入契约，准许启动。",
    },
    {
      id: "f-m6",
      node: "n2",
      at: "10:22:09",
      tone: "act",
      title: "定位改造范围（第 1 轮）",
      body: "grep refreshToken|rotateSession 命中 4 个文件 17 处，确定以 token-service 收敛重复逻辑。",
    },
    {
      id: "f-m7",
      node: "n2",
      at: "10:23:41",
      tone: "output",
      title: "提交实现与单元测试",
      body: "新增 token-service.ts（+94），改造 3 个中间件，补 26 行用例；累计 +148 −62。",
      refs: ["src/auth/token-service.ts", "test/auth/token-service.spec.ts"],
    },
    {
      id: "f-m8",
      node: "n2",
      at: "10:23:58",
      tone: "gate",
      title: "门禁通过：编译与单元测试",
      body: "tsc 0 error；vitest 23 passed / 0 failed，覆盖率 96.4%。流转到评审。",
    },
    {
      id: "f-m9",
      node: "n3",
      at: "10:24:30",
      tone: "act",
      title: "独立核对实现与需求（第 1 轮）",
      body: "逐条比对 12 条需求与实现，重点检查并发刷新路径与异常分支。",
    },
    {
      id: "f-m10",
      node: "n3",
      at: "10:25:12",
      tone: "warn",
      title: "门禁未过：并发刷新缺互斥",
      body: "两个请求同时命中过期 token 时会并发写 Redis，与验收条件「并发刷新有互斥保护」不符。判定为阻断问题，按失败回退边退回代码开发。",
      refs: ["src/auth/token-service.ts:58"],
    },
    {
      id: "f-m11",
      node: "orchestrator",
      at: "10:25:15",
      tone: "plan",
      title: "回退：评审 → 代码开发（第 2 轮）",
      body: "沿「实现问题」回退边定向返工，已将评审结论与命中位置作为附加输入下发。重试计数 1/3。",
      refs: ["reports/review-r1.md"],
    },
    {
      id: "f-m12",
      node: "n2",
      at: "10:26:04",
      tone: "act",
      title: "按评审意见返工（第 2 轮）",
      body: "改用 Redis SETNX 分布式锁保护刷新临界区，锁超时 3s，失败方等待复用结果而非重复刷新。",
    },
    {
      id: "f-m13",
      node: "n2",
      at: "10:27:20",
      tone: "output",
      title: "提交返工实现与并发用例",
      body: "token-service.ts +38 −6，新增 4 条并发场景用例（含 50 并发压测）；累计 +186 −68。",
      refs: ["src/auth/token-service.ts", "test/auth/concurrent-refresh.spec.ts"],
    },
    {
      id: "f-m14",
      node: "n2",
      at: "10:27:41",
      tone: "gate",
      title: "门禁通过：编译与单元测试（第 2 轮）",
      body: "tsc 0 error；vitest 27 passed / 0 failed，并发用例全绿。",
    },
    {
      id: "f-m15",
      node: "n3",
      at: "10:28:16",
      tone: "act",
      title: "复核返工结果（第 2 轮）",
      body: "确认互斥保护覆盖全部刷新入口，检查锁超时与异常释放路径无死锁风险。",
    },
    {
      id: "f-m16",
      node: "n3",
      at: "10:29:02",
      tone: "output",
      title: "评审通过，出具审查报告",
      body: "6 个维度全部通过；1 项非阻断建议：legacy/compat.ts 的再导出缺少 @deprecated 注释。",
      refs: ["reports/review-r2.md"],
    },
    {
      id: "f-m17",
      node: "n3",
      at: "10:29:10",
      tone: "gate",
      title: "门禁通过：无阻断与严重问题",
      body: "阻断问题 0 项，严重问题 0 项，建议项 1 项不拦截流转。",
    },
    {
      id: "f-m18",
      node: "orchestrator",
      at: "10:29:14",
      tone: "plan",
      title: "调度：评审 → 交付",
      body: "返工闭环已完成（1 次回退，2 轮实现）。审查报告齐备，准许进入交付。",
    },
    {
      id: "f-m19",
      node: "n4",
      at: "10:29:48",
      tone: "act",
      title: "汇总交付材料",
      body: "收集变更说明、测试报告、返工记录与回滚方案，核对证据链完整性。",
    },
    {
      id: "f-m20",
      node: "n4",
      at: "10:30:26",
      tone: "output",
      title: "交付包已就绪，待人工验收",
      body: "变更说明含本次返工原因与修正方式；回滚方案已验证可执行（保留 rotateSession 再导出）。",
      refs: ["docs/changelog.md", "docs/rollback.md"],
    },
    {
      id: "f-m21",
      node: "orchestrator",
      at: "10:30:30",
      tone: "warn",
      title: "监控：1 项非阻断偏差待决",
      body: "弃用注释属建议项，不影响验收条件。已记入证据链，交由人工检查点判定。",
      refs: ["legacy/compat.ts"],
    },
  ],
};

/* ---------- 单元测试：覆盖率不足被退回，补齐边界用例后通过 ---------- */
const runUnit: WfRun = {
  states: { n1: "done", n2: "done", n3: "running" },
  messages: [
    {
      id: "u-m1",
      node: "orchestrator",
      at: "14:02:10",
      tone: "plan",
      title: "已下发 3 份节点契约",
      body: "按「单元测试」编排下发契约：先写用例并保留预期失败记录，再补实现。重试上限 3 次。",
      refs: ["orchestration/plan.md"],
    },
    {
      id: "u-m2",
      node: "n1",
      at: "14:02:34",
      tone: "act",
      title: "解析待测模块（第 1 轮）",
      body: "读取 src/billing/discount.ts 的 6 个导出函数与已确认需求，梳理出 14 条业务规则。",
      refs: ["docs/requirement.md"],
    },
    {
      id: "u-m3",
      node: "n1",
      at: "14:04:02",
      tone: "output",
      title: "提交首批用例（含预期失败记录）",
      body: "编写 18 条用例，先运行留档：14 passed / 4 failed（预期失败，对应未实现分支），随后补齐实现转全绿。",
      refs: ["test/billing/discount.spec.ts", "reports/expected-failures.md"],
    },
    {
      id: "u-m4",
      node: "n1",
      at: "14:04:20",
      tone: "gate",
      title: "门禁通过：覆盖率阈值",
      body: "行覆盖 82.6% ≥ 阈值 80%，允许流转到评审。",
    },
    {
      id: "u-m5",
      node: "n2",
      at: "14:05:08",
      tone: "act",
      title: "检查用例有效性（第 1 轮）",
      body: "核查 18 条用例的断言强度，比对 14 条业务规则的覆盖情况。",
    },
    {
      id: "u-m6",
      node: "n2",
      at: "14:06:15",
      tone: "warn",
      title: "门禁未过：边界与断言不足",
      body: "阶梯折扣的临界值（满减边界 99.99 / 100.00）无用例；3 条断言仅校验非空未校验数值。行覆盖达标但规则覆盖仅 11/14，按「覆盖不足」回退边退回。",
      refs: ["reports/review-r1.md"],
    },
    {
      id: "u-m7",
      node: "orchestrator",
      at: "14:06:18",
      tone: "plan",
      title: "回退：评审 → 单元测试开发（第 2 轮）",
      body: "行覆盖率达标不等于规则覆盖达标，判定回退成立。缺口清单已作为附加输入下发。重试计数 1/3。",
    },
    {
      id: "u-m8",
      node: "n1",
      at: "14:07:30",
      tone: "act",
      title: "补齐边界用例（第 2 轮）",
      body: "针对 3 条未覆盖规则补 7 条临界值用例，并把 3 条弱断言改为精确数值比对。",
    },
    {
      id: "u-m9",
      node: "n1",
      at: "14:08:52",
      tone: "output",
      title: "提交返工用例集",
      body: "用例增至 25 条，全部通过；行覆盖 94.1%，规则覆盖 14/14。",
      refs: ["test/billing/discount.spec.ts", "reports/coverage.html"],
    },
    {
      id: "u-m10",
      node: "n1",
      at: "14:09:05",
      tone: "gate",
      title: "门禁通过：覆盖率阈值（第 2 轮）",
      body: "行覆盖 94.1%，分支覆盖 88.0%，均高于阈值。",
    },
    {
      id: "u-m11",
      node: "n2",
      at: "14:09:40",
      tone: "output",
      title: "复核通过：断言有效性",
      body: "25 条用例断言均可判定真实行为，临界值用例已覆盖满减边界两侧。无阻断问题。",
      refs: ["reports/review-r2.md"],
    },
    {
      id: "u-m12",
      node: "n2",
      at: "14:09:48",
      tone: "gate",
      title: "门禁通过：断言有效性",
      body: "规则覆盖 14/14，弱断言 0 条。允许流转到交付。",
    },
    {
      id: "u-m13",
      node: "orchestrator",
      at: "14:09:52",
      tone: "plan",
      title: "调度：评审 → 交付",
      body: "返工闭环完成（1 次回退，2 轮用例）。测试资产与覆盖率报告齐备，准许交付。",
    },
    {
      id: "u-m14",
      node: "n3",
      at: "14:10:26",
      tone: "act",
      title: "纳入回归基线",
      body: "将 25 条用例注册进 CI 回归套件，覆盖率阈值按实测上调至 90%。",
    },
    {
      id: "u-m15",
      node: "n3",
      at: "14:11:04",
      tone: "output",
      title: "测试资产已提交，待人工验收",
      body: "证据链含首轮预期失败记录、回退原因与两轮覆盖率对比，可追溯本次为何返工。",
      refs: ["reports/coverage.html", "docs/test-baseline.md"],
    },
  ],
};


/* ---------- 缺陷修复：首轮无法复现被退回，补环境变量后复现并修复 ---------- */
const runBugfix: WfRun = {
  states: { n1: "done", n2: "done", n3: "done", n4: "done", n5: "running" },
  messages: [
    {
      id: "b-m1",
      node: "orchestrator",
      at: "09:12:02",
      tone: "plan",
      title: "已下发 5 份节点契约",
      body: "按「缺陷修复」编排下发契约：先复现再定位，失败按原因定向回退。重试上限 3 次。",
      refs: ["orchestration/plan.md"],
    },
    {
      id: "b-m2",
      node: "n1",
      at: "09:12:40",
      tone: "act",
      title: "尝试复现缺陷（第 1 轮）",
      body: "读取工单 BUG-2317「结算金额偶发差 1 分」，按报告步骤在本地跑 200 次未复现。",
      refs: ["issues/BUG-2317.md"],
    },
    {
      id: "b-m3",
      node: "n1",
      at: "09:14:18",
      tone: "output",
      title: "提交疑似复现用例（不稳定）",
      body: "构造一条用例，200 次中偶发失败 3 次，无法稳定复现，未达「可复现用例」标准。",
      refs: ["test/billing/settle-flaky.spec.ts"],
    },
    {
      id: "b-m4",
      node: "n2",
      at: "09:15:06",
      tone: "warn",
      title: "回退：根因定位 → 缺陷复现（无法复现）",
      body: "用例不稳定则无法作为修复验证标准，沿调用链也无法确定根因。按「无法复现」回退边退回，并给出线索：失败集中在时区跨日的样本。",
      refs: ["reports/triage-r1.md"],
    },
    {
      id: "b-m5",
      node: "orchestrator",
      at: "09:15:10",
      tone: "plan",
      title: "回退成立：缺陷复现（第 2 轮）",
      body: "不稳定用例不能进入修复环节，否则修完无法验证。已把时区线索作为附加输入下发。重试计数 1/3。",
    },
    {
      id: "b-m6",
      node: "n1",
      at: "09:16:22",
      tone: "act",
      title: "按线索补齐复现条件（第 2 轮）",
      body: "固定 TZ=Asia/Shanghai 且账期跨 UTC 零点，改用固定时钟注入替代 Date.now()。",
    },
    {
      id: "b-m7",
      node: "n1",
      at: "09:17:44",
      tone: "output",
      title: "提交稳定复现用例",
      body: "500 次运行 500 次失败，稳定复现。确认为跨日账期下四舍五入方向不一致导致 1 分差异。",
      refs: ["test/billing/settle-tz.spec.ts"],
    },
    {
      id: "b-m8",
      node: "n1",
      at: "09:17:56",
      tone: "gate",
      title: "门禁通过：可复现用例",
      body: "复现率 100%，可作为修复的验证标准。允许流转到根因定位。",
    },
    {
      id: "b-m9",
      node: "n2",
      at: "09:18:40",
      tone: "act",
      title: "沿调用链定位根因（第 2 轮）",
      body: "追踪 settle → toMinorUnit → round，发现两处分别用 Math.round 与 toFixed，跨日样本走入不同分支。",
    },
    {
      id: "b-m10",
      node: "n2",
      at: "09:20:02",
      tone: "output",
      title: "根因报告：两处取整实现不一致",
      body: "toFixed 采用银行家舍入，Math.round 向上取整，跨日账期同时命中两条路径故差 1 分。影响 3 个调用点，无对外接口变更。",
      refs: ["reports/root-cause.md"],
    },
    {
      id: "b-m11",
      node: "n3",
      at: "09:21:15",
      tone: "act",
      title: "以最小改动修复",
      body: "抽出统一的 roundMinorUnit helper，3 个调用点改为统一实现，保持函数签名不变。",
    },
    {
      id: "b-m12",
      node: "n3",
      at: "09:22:48",
      tone: "output",
      title: "提交修复实现",
      body: "新增 helper（+22），改造 3 处调用（+9 −11）；复现用例由失败转为通过。",
      refs: ["src/billing/round.ts", "src/billing/settle.ts"],
    },
    {
      id: "b-m13",
      node: "n3",
      at: "09:23:00",
      tone: "gate",
      title: "门禁通过：复现用例转通过",
      body: "settle-tz.spec.ts 500 次运行全部通过，缺陷已消除。",
    },
    {
      id: "b-m14",
      node: "n4",
      at: "09:23:52",
      tone: "act",
      title: "运行受影响模块回归",
      body: "执行 billing 全量单测与结算、退款、对账三条关键业务流程。",
    },
    {
      id: "b-m15",
      node: "n4",
      at: "09:25:30",
      tone: "output",
      title: "回归报告：全绿",
      body: "billing 单测 142 passed / 0 failed；3 条业务流程端到端通过；金额比对 0 差异。",
      refs: ["reports/regression.md"],
    },
    {
      id: "b-m16",
      node: "n4",
      at: "09:25:38",
      tone: "gate",
      title: "门禁通过：回归全绿",
      body: "无新增失败，无性能劣化（P95 持平）。允许流转到评审交付。",
    },
    {
      id: "b-m17",
      node: "n5",
      at: "09:26:20",
      tone: "act",
      title: "审查修复方式与副作用",
      body: "确认统一取整未改变历史账单口径，核对是否需要数据修补脚本。",
    },
    {
      id: "b-m18",
      node: "n5",
      at: "09:27:40",
      tone: "warn",
      title: "偏差提示：历史数据需修补",
      body: "已产生的 47 笔跨日账单存在 1 分偏差，修复只阻断新增。建议补一次性对账脚本，属非阻断建议。",
      refs: ["reports/affected-records.csv"],
    },
    {
      id: "b-m19",
      node: "orchestrator",
      at: "09:27:46",
      tone: "warn",
      title: "监控：1 项非阻断偏差待决",
      body: "本次修复闭环完整（1 次回退、复现→修复→回归全绿）。历史数据修补超出本次契约范围，交人工检查点决定是否另开任务。",
    },
  ],
};

/* ---------- 存量系统逆向重构：集成验证失败退回 TDD，且当前处于阻断态 ---------- */
const runLegacy: WfRun = {
  states: {
    n1: "done",
    n2: "done",
    n3: "done",
    n4: "done",
    n5: "blocked",
    /* 也标 blocked：它被上游阻断而无法开工，标 todo 会让人以为「还没轮到」，
       但实际是「本该轮到却卡住了」，两者对判断当前处境的意义完全不同 */
    n6: "blocked",
  },
  messages: [
    {
      id: "l-m1",
      node: "orchestrator",
      at: "08:30:00",
      tone: "plan",
      title: "已下发 6 份节点契约",
      body: "按「存量系统逆向重构」编排下发契约，重试上限 2 次，超限转人工接管。四道门禁 G1–G4 逐级放行。",
      refs: ["orchestration/plan.md"],
    },
    {
      id: "l-m2",
      node: "n1",
      at: "08:31:20",
      tone: "act",
      title: "解析存量源码",
      body: "扫描 VB6 工程 214 个文件，按模块与调用关系整理依赖，记录来源版本 v3.2.1（2011 年）。",
      refs: ["legacy/src.zip"],
    },
    {
      id: "l-m3",
      node: "n1",
      at: "08:34:10",
      tone: "output",
      title: "输出源码结构清单",
      body: "识别 18 个业务模块、6 个外部依赖、42 个数据库存储过程；标注 7 处无法静态判定的动态调用。",
      refs: ["docs/source-inventory.md", "docs/call-graph.svg"],
    },
    {
      id: "l-m4",
      node: "n2",
      at: "08:35:40",
      tone: "act",
      title: "抽取业务规则",
      body: "从代码与存储过程反推业务规则，逐条标注「代码事实 / 推断 / 待确认」三类来源。",
    },
    {
      id: "l-m5",
      node: "n2",
      at: "08:39:02",
      tone: "output",
      title: "输出逆向需求说明",
      body: "94 条业务规则：事实 71 条、推断 18 条、待确认 5 条。5 条待确认均涉及历史遗留的特殊客户折扣。",
      refs: ["docs/requirement.md", "docs/assumptions.md"],
    },
    {
      id: "l-m6",
      node: "n2",
      at: "08:39:20",
      tone: "gate",
      title: "门禁通过：G1 需求与设计",
      body: "推断项均已显式标注，5 条待确认已提请人工检查点确认后放行。",
    },
    {
      id: "l-m7",
      node: "n3",
      at: "08:41:00",
      tone: "act",
      title: "确定新系统结构",
      body: "按领域划分 6 个服务边界，定义模块职责、对外接口与 4 项关键设计决定。",
    },
    {
      id: "l-m8",
      node: "n3",
      at: "08:44:30",
      tone: "output",
      title: "输出架构设计与接口契约",
      body: "6 个服务、23 个接口定义；存储过程按业务语义重写为应用层逻辑，保留数据结构兼容。",
      refs: ["docs/architecture.md", "docs/api-contract.yaml"],
    },
    {
      id: "l-m9",
      node: "n4",
      at: "08:46:10",
      tone: "act",
      title: "测试驱动实现（第 1 轮）",
      body: "先按 94 条规则写用例并保留预期失败记录，再逐步实现直至转为通过。",
    },
    {
      id: "l-m10",
      node: "n4",
      at: "08:58:44",
      tone: "output",
      title: "提交首轮实现",
      body: "用例 268 条，预期失败记录已留档；实现完成后 268 passed，行覆盖 91.2%。",
      refs: ["reports/expected-failures.md", "reports/coverage.html"],
    },
    {
      id: "l-m11",
      node: "n4",
      at: "08:59:00",
      tone: "gate",
      title: "门禁通过：G2 测试驱动开发",
      body: "预期失败记录完整，用例全部转通过，覆盖率达标。允许进入集成验证。",
    },
    {
      id: "l-m12",
      node: "n5",
      at: "09:01:30",
      tone: "act",
      title: "跨模块集成验证（第 1 轮）",
      body: "执行 12 条跨模块业务流程与浏览器冒烟测试，比对新旧系统输出。",
    },
    {
      id: "l-m13",
      node: "n5",
      at: "09:06:12",
      tone: "warn",
      title: "门禁未过：G3 集成验证失败",
      body: "12 条流程中 3 条失败：批量导入在 5000 行以上超时（旧系统分片提交，新实现单事务）。单元测试全绿但集成暴露事务边界设计问题，按「集成失败」回退边退回测试驱动开发。",
      refs: ["reports/integration-r1.md"],
    },
    {
      id: "l-m14",
      node: "orchestrator",
      at: "09:06:18",
      tone: "plan",
      title: "回退：集成验证 → 测试驱动开发（第 2 轮）",
      body: "单测通过不代表集成可用，回退成立。已把 3 条失败流程与旧系统分片策略作为附加输入下发。重试计数 1/2。",
    },
    {
      id: "l-m15",
      node: "n4",
      at: "09:08:00",
      tone: "act",
      title: "按集成结论返工（第 2 轮）",
      body: "补 6 条大批量集成用例（含 20000 行样本），改为按 1000 行分片提交并支持断点续传。",
    },
    {
      id: "l-m16",
      node: "n4",
      at: "09:18:20",
      tone: "output",
      title: "提交返工实现",
      body: "用例增至 274 条全部通过；20000 行导入耗时由超时降至 42s，内存峰值下降 63%。",
      refs: ["src/import/batch.ts", "test/import/large-batch.spec.ts"],
    },
    {
      id: "l-m17",
      node: "n4",
      at: "09:18:32",
      tone: "gate",
      title: "门禁通过：G2 测试驱动开发（第 2 轮）",
      body: "274 passed，行覆盖 92.8%，大批量场景已纳入用例。",
    },
    {
      id: "l-m18",
      node: "n5",
      at: "09:20:10",
      tone: "act",
      title: "重跑集成验证（第 2 轮）",
      body: "12 条业务流程全部重跑，重点复验批量导入与并发写入路径。",
    },
    {
      id: "l-m19",
      node: "n5",
      at: "09:24:50",
      tone: "warn",
      title: "门禁未过：仍有 1 条流程失败（已阻断）",
      body: "批量导入已修复，但并发对账在双节点部署下出现重复记账。重试计数已达 2/2 上限，按契约转人工接管，流水线在此阻断。",
      refs: ["reports/integration-r2.md"],
    },
    {
      id: "l-m20",
      node: "orchestrator",
      at: "09:24:58",
      tone: "warn",
      title: "重试超限，已转人工接管",
      body: "集成验证连续 2 轮未通过，超出重试上限。已阻断向交付验收的流转，并附两轮集成报告与差异对比，等待人工决定是补设计还是降低本次范围。",
      refs: ["reports/integration-r1.md", "reports/integration-r2.md"],
    },
    {
      id: "l-m21",
      node: "n6",
      at: "09:25:04",
      tone: "plan",
      title: "未启动：等待上游解除阻断",
      body: "输入契约要求集成验证通过的验证材料，当前 G3 未放行故不具备开工条件。已预置四类交付材料的清单模板，待上游闭环后即可开始汇总。",
      refs: ["docs/delivery-checklist.md"],
    },
  ],
};

/* ---------- 开源漏洞整改：无可用版本被退回依赖分析，改走间接升级 ---------- */
const runCve: WfRun = {
  states: {
    n1: "done",
    n2: "done",
    n3: "done",
    n4: "done",
    n5: "done",
    n6: "done",
    /* 安全复核已出结论，当前停在人工审批这一步 */
    n7: "running",
  },
  messages: [
    {
      id: "c-m1",
      node: "orchestrator",
      at: "16:40:00",
      tone: "plan",
      title: "已下发 7 份节点契约",
      body: "按「开源漏洞整改」编排下发契约，重试上限 2 次，超限降级处理。影响排查并行触发依赖分析与兼容性核对。",
      refs: ["orchestration/plan.md"],
    },
    {
      id: "c-m2",
      node: "n1",
      at: "16:40:38",
      tone: "act",
      title: "读取组件清单与扫描结果",
      body: "接入 CVE-2026-31402（lodash 原型污染，CVSS 8.1），比对 14 个项目的组件清单。",
      refs: ["security/cve-2026-31402.json"],
    },
    {
      id: "c-m3",
      node: "n1",
      at: "16:42:10",
      tone: "output",
      title: "确定受影响范围",
      body: "14 个项目中 5 个受影响：2 个直接依赖、3 个经 webpack-chain 间接引入。",
      refs: ["reports/impact-scope.md"],
    },
    {
      id: "c-m4",
      node: "n2",
      at: "16:43:00",
      tone: "act",
      title: "依赖分析（第 1 轮）",
      body: "解析依赖树，确认直接依赖可升至 4.17.21；检查 3 个间接依赖的上游约束。",
    },
    {
      id: "c-m5",
      node: "n3",
      at: "16:43:20",
      tone: "act",
      title: "兼容性核对（并行）",
      body: "比对 4.17.21 与当前 4.17.15 的接口差异，核对构建限制与受影响业务功能。",
    },
    {
      id: "c-m6",
      node: "n3",
      at: "16:45:40",
      tone: "output",
      title: "兼容性结论：直接依赖可平滑升级",
      body: "无破坏性接口变更；2 个直接依赖项目升级风险低。间接依赖需等依赖分析结论。",
      refs: ["reports/compat-check.md"],
    },
    {
      id: "c-m7",
      node: "n2",
      at: "16:46:05",
      tone: "output",
      title: "依赖分析结论（第 1 轮）",
      body: "建议 5 个项目统一升至 lodash 4.17.21；间接依赖拟用 npm overrides 强制提升。",
      refs: ["reports/dependency-r1.md"],
    },
    {
      id: "c-m8",
      node: "n4",
      at: "16:47:30",
      tone: "act",
      title: "整改实现（第 1 轮）",
      body: "在独立分支为 5 个项目升级 lodash，对 3 个间接依赖写入 overrides。",
    },
    {
      id: "c-m9",
      node: "n4",
      at: "16:49:52",
      tone: "warn",
      title: "门禁未过：间接依赖无可用版本",
      body: "webpack-chain 4.x 硬约束 lodash ^4.17.11 且不接受 overrides，强制提升后构建失败（peer 冲突）。2 个直接依赖已成功，3 个间接依赖受阻。按「无可用版本」回退边退回依赖分析。",
      refs: ["reports/build-failure-r1.log"],
    },
    {
      id: "c-m10",
      node: "orchestrator",
      at: "16:50:00",
      tone: "plan",
      title: "回退：整改实现 → 依赖分析（第 2 轮）",
      body: "overrides 绕不过上游 peer 约束，回退成立。要求依赖分析给出可落地路径而非强制提升。重试计数 1/2。",
    },
    {
      id: "c-m11",
      node: "n2",
      at: "16:51:20",
      tone: "act",
      title: "重新分析升级路径（第 2 轮）",
      body: "改查上游是否有已修复版本：webpack-chain 6.5.1 已放宽约束至 ^4.17.21。",
    },
    {
      id: "c-m12",
      node: "n2",
      at: "16:53:40",
      tone: "output",
      title: "修正方案：先升上游再升传递依赖",
      body: "3 个间接依赖改为先升 webpack-chain 4.x → 6.5.1，再自然获得安全版 lodash。附该升级的破坏性变更清单。",
      refs: ["reports/dependency-r2.md", "reports/breaking-changes.md"],
    },
    {
      id: "c-m13",
      node: "n4",
      at: "16:55:10",
      tone: "act",
      title: "按修正方案返工（第 2 轮）",
      body: "升级 webpack-chain 至 6.5.1，同步调整 3 个项目的构建配置（loader 写法变更）。",
    },
    {
      id: "c-m14",
      node: "n4",
      at: "16:58:30",
      tone: "output",
      title: "提交整改实现",
      body: "5 个项目全部升级完成；构建配置改动 3 处；lodash 均为 4.17.21，漏洞版本已不在依赖树中。",
      refs: ["reports/upgrade-diff.md"],
    },
    {
      id: "c-m15",
      node: "n4",
      at: "16:58:44",
      tone: "gate",
      title: "门禁通过：构建与单元测试",
      body: "5 个项目构建成功，单元测试 386 passed / 0 failed。",
    },
    {
      id: "c-m16",
      node: "n5",
      at: "17:00:15",
      tone: "act",
      title: "回归验证",
      body: "对 5 个项目执行集成测试与关键业务回归，重点验证构建产物与打包体积。",
    },
    {
      id: "c-m17",
      node: "n5",
      at: "17:04:20",
      tone: "output",
      title: "回归报告：全部通过",
      body: "集成测试 74 passed；关键业务 11 条流程通过；产物体积变化 −2.3%，无功能差异。",
      refs: ["reports/regression.md"],
    },
    {
      id: "c-m18",
      node: "n5",
      at: "17:04:32",
      tone: "gate",
      title: "门禁通过：关键业务回归",
      body: "无新增失败，无性能劣化。允许流转到安全复核。",
    },
    {
      id: "c-m19",
      node: "n6",
      at: "17:05:40",
      tone: "act",
      title: "安全复核",
      body: "重跑依赖扫描，确认漏洞消除且升级未引入新的已知漏洞。",
    },
    {
      id: "c-m20",
      node: "n6",
      at: "17:07:10",
      tone: "output",
      title: "复核结论：漏洞已消除",
      body: "CVE-2026-31402 在 5 个项目中均已消除；新引入依赖 12 个，扫描未发现中危及以上漏洞。",
      refs: ["reports/security-rescan.json"],
    },
    {
      id: "c-m20b",
      node: "n6",
      at: "17:07:14",
      tone: "gate",
      title: "门禁通过：漏洞已消除",
      body: "目标漏洞消除率 5/5，未引入新的中危及以上漏洞。允许流转到发布审批。",
    },
    {
      id: "c-m21",
      node: "orchestrator",
      at: "17:07:18",
      tone: "plan",
      title: "汇总：整改闭环完成，待发布审批",
      body: "本次经 1 次回退（强制提升不可行 → 改升上游），5 个项目全部整改。证据链含两轮依赖分析对比，可追溯方案为何变更。",
    },
    {
      id: "c-m22",
      node: "n7",
      at: "17:07:30",
      tone: "plan",
      title: "待责任人审批",
      body: "已按 5 个项目分别生成合并请求与发布单，附漏洞消除证明、回归报告与两轮方案对比。审批通过后状态回写现有安全平台。",
      refs: ["reports/security-rescan.json", "release/approval-request.md"],
    },
  ],
};

/* ---------- AI 代码审核：整改不达标被复核驳回，二次整改后放行 ---------- */
const runReview: WfRun = {
  states: {
    n1: "done",
    n2: "done",
    n3: "done",
    n4: "done",
    n5: "done",
    n6: "running",
  },
  messages: [
    {
      id: "r-m1",
      node: "orchestrator",
      at: "11:20:00",
      tone: "plan",
      title: "已下发 6 份节点契约",
      body: "按「AI 代码审核」编排下发契约，功能与安全两路并行审查后汇总。重试上限 2 次。",
      refs: ["orchestration/plan.md"],
    },
    {
      id: "r-m2",
      node: "n1",
      at: "11:20:26",
      tone: "act",
      title: "获取代码差异与项目规则",
      body: "经受控连接层拉取 MR !482 的差异、相关文件、任务说明与 AGENTS.md 规则。",
      refs: ["mr/482.diff"],
    },
    {
      id: "r-m3",
      node: "n1",
      at: "11:21:10",
      tone: "output",
      title: "差异已就绪",
      body: "14 个文件、+486 −152；关联任务说明 1 份，命中项目规则 9 条。",
      refs: ["mr/482.diff", "AGENTS.md"],
    },
    {
      id: "r-m4",
      node: "n2",
      at: "11:22:00",
      tone: "act",
      title: "功能与边界审查（并行）",
      body: "检查功能正确性、异常处理、边界条件与并发资源使用。",
    },
    {
      id: "r-m5",
      node: "n3",
      at: "11:22:04",
      tone: "act",
      title: "安全与合规审查（并行）",
      body: "检查注入风险、鉴权边界、日志脱敏、测试充分性与影响范围。",
    },
    {
      id: "r-m6",
      node: "n2",
      at: "11:24:30",
      tone: "output",
      title: "功能审查结论：4 个问题",
      body: "1 个严重（分页游标未校验上界，可致全表扫描）、2 个一般、1 个建议。",
      refs: ["reports/review-func.md"],
    },
    {
      id: "r-m7",
      node: "n3",
      at: "11:25:12",
      tone: "output",
      title: "安全审查结论：3 个问题",
      body: "1 个阻断（用户手机号写入 info 日志未脱敏）、1 个严重（新接口缺少租户隔离校验）、1 个建议。",
      refs: ["reports/review-sec.md"],
    },
    {
      id: "r-m8",
      node: "n4",
      at: "11:26:00",
      tone: "output",
      title: "问题汇总并写回代码平台",
      body: "合并去重后 7 个问题：阻断 1、严重 2、一般 2、建议 2，已按行号写回 MR !482。",
      refs: ["mr/482/comments.json"],
    },
    {
      id: "r-m9",
      node: "n4",
      at: "11:26:12",
      tone: "gate",
      title: "门禁：严重问题必须整改",
      body: "阻断 1 项、严重 2 项须整改；一般与建议共 4 项由人员决定。流转到定向整改。",
    },
    {
      id: "r-m10",
      node: "n5",
      at: "11:27:30",
      tone: "act",
      title: "定向整改（第 1 轮）",
      body: "按问题清单修改：日志脱敏、补分页上界校验、补租户隔离判断。",
    },
    {
      id: "r-m11",
      node: "n5",
      at: "11:29:50",
      tone: "output",
      title: "提交首轮整改",
      body: "改动 5 个文件（+62 −18）：手机号改掩码输出，游标上界限制 500，新增 tenantId 校验。",
      refs: ["mr/482/patch-r1.diff"],
    },
    {
      id: "r-m12",
      node: "n6",
      at: "11:31:20",
      tone: "warn",
      title: "复核驳回：租户隔离仅覆盖单一入口",
      body: "日志脱敏与分页上界已达标，但 tenantId 校验只加在列表接口，导出接口同一数据源仍可越权。阻断问题未完全消除，按「整改不达标」回退边退回定向整改。",
      refs: ["reports/recheck-r1.md", "src/api/export.ts:74"],
    },
    {
      id: "r-m13",
      node: "orchestrator",
      at: "11:31:28",
      tone: "plan",
      title: "回退：复核放行 → 定向整改（第 2 轮）",
      body: "同源数据的越权入口未覆盖完整，判定回退成立。已把遗漏入口清单作为附加输入下发。重试计数 1/2。",
    },
    {
      id: "r-m14",
      node: "n5",
      at: "11:32:40",
      tone: "act",
      title: "补齐遗漏入口（第 2 轮）",
      body: "把租户校验下沉到 repository 层统一拦截，覆盖列表、导出、详情三个入口。",
    },
    {
      id: "r-m15",
      node: "n5",
      at: "11:34:55",
      tone: "output",
      title: "提交二次整改",
      body: "改动 3 个文件（+34 −22），校验从接口层下沉到数据访问层；补 5 条越权访问用例。",
      refs: ["mr/482/patch-r2.diff", "test/api/tenant-isolation.spec.ts"],
    },
    {
      id: "r-m16",
      node: "n6",
      at: "11:36:10",
      tone: "act",
      title: "复核整改结果（第 2 轮）",
      body: "复验三个入口的越权路径，确认校验在数据访问层生效且有用例覆盖。",
    },
    {
      id: "r-m17",
      node: "n6",
      at: "11:37:30",
      tone: "output",
      title: "复核通过，允许进入人工合并",
      body: "阻断 0 项、严重 0 项；4 项一般与建议由人员决定，已在 MR 标注为不拦截。",
      refs: ["reports/recheck-r2.md"],
    },
    {
      id: "r-m17b",
      node: "n6",
      at: "11:37:34",
      tone: "gate",
      title: "门禁通过：复核通过",
      body: "三个越权入口均已覆盖并有用例验证，阻断与严重问题清零。放行至人工合并流程。",
    },
    {
      id: "r-m18",
      node: "orchestrator",
      at: "11:37:38",
      tone: "warn",
      title: "监控：4 项非阻断问题待人工决定",
      body: "本次经 1 次回退（整改覆盖不全 → 校验下沉）。放行仅代表阻断与严重问题已消除，合并仍需人工确认。",
    },
  ],
};

/* ---------- 自定义编排：交付校验未过退回需求分析，补验收条件后通过 ---------- */
const runCustom: WfRun = {
  states: { cu1: "done", cu2: "running" },
  messages: [
    {
      id: "x-m1",
      node: "orchestrator",
      at: "15:10:00",
      tone: "plan",
      title: "已下发 2 份节点契约",
      body: "按「自定义编排」下发契约：需求分析 → 交付，交付校验未过则回退需求分析。重试上限 2 次。",
      refs: ["orchestration/plan.md"],
    },
    {
      id: "x-m2",
      node: "cu1",
      at: "15:10:32",
      tone: "act",
      title: "拆解需求（第 1 轮）",
      body: "解析任务契约，拆出 8 条需求，其中 2 条为从上下文推断所得。",
      refs: ["contract/task.md"],
    },
    {
      id: "x-m3",
      node: "cu1",
      at: "15:11:48",
      tone: "output",
      title: "输出需求与验收条件",
      body: "8 条需求；6 条附验收条件，2 条推断项暂未给出可验证的判定标准。",
      refs: ["docs/requirement.md"],
    },
    {
      id: "x-m4",
      node: "cu1",
      at: "15:12:00",
      tone: "gate",
      title: "门禁通过：需求可测试性",
      body: "6/8 条具备验收条件，达到放行阈值，2 条推断项标注待确认后流转。",
    },
    {
      id: "x-m5",
      node: "cu2",
      at: "15:12:40",
      tone: "act",
      title: "汇总交付材料（第 1 轮）",
      body: "收集变更说明与回滚方案，核对证据链是否可支撑全部 8 条需求。",
    },
    {
      id: "x-m6",
      node: "cu2",
      at: "15:13:55",
      tone: "warn",
      title: "门禁未过：2 条需求无验收证据",
      body: "2 条推断需求没有可验证的判定标准，交付物无法证明其达成，证据链不完整。按「校验未过」回退边退回需求分析。",
      refs: ["reports/evidence-gap.md"],
    },
    {
      id: "x-m7",
      node: "orchestrator",
      at: "15:14:02",
      tone: "plan",
      title: "回退：交付 → 需求分析（第 2 轮）",
      body: "需求门禁按比例阈值放行，但交付要求证据链完整，两者判定标准不同故在此暴露。已要求补齐 2 条推断项的验收条件。重试计数 1/2。",
    },
    {
      id: "x-m8",
      node: "cu1",
      at: "15:15:20",
      tone: "act",
      title: "补齐推断项验收条件（第 2 轮）",
      body: "与上下文核对后将 2 条推断转为明确需求，各补 1 条可验证的验收条件。",
    },
    {
      id: "x-m9",
      node: "cu1",
      at: "15:16:30",
      tone: "output",
      title: "输出修正后的需求集",
      body: "8 条需求全部具备验收条件，推断项标注已解除。",
      refs: ["docs/requirement.md", "docs/acceptance.md"],
    },
    {
      id: "x-m10",
      node: "cu1",
      at: "15:16:40",
      tone: "gate",
      title: "门禁通过：需求可测试性（第 2 轮）",
      body: "8/8 条具备可验证的验收条件。",
    },
    {
      id: "x-m11",
      node: "cu2",
      at: "15:17:20",
      tone: "act",
      title: "重新汇总交付材料（第 2 轮）",
      body: "按 8 条验收条件逐条挂接证据，核对回滚方案可执行性。",
    },
    {
      id: "x-m12",
      node: "cu2",
      at: "15:18:40",
      tone: "output",
      title: "交付包已就绪，待人工验收",
      body: "8/8 条需求均有对应证据；变更说明记录了本次回退原因，说明为何补充验收条件。",
      refs: ["docs/changelog.md", "docs/rollback.md"],
    },
  ],
};

/* 按模板 id 索引：换模板即换整套运行现场，避免所有编排共用同一份消息 */
export const wfRuns: Record<string, WfRun> = {
  "wf-feature": runFeature,
  "wf-unit": runUnit,
  "wf-bugfix": runBugfix,
  "wf-legacy": runLegacy,
  "wf-cve": runCve,
  "wf-review": runReview,
  "wf-custom": runCustom,
};

/** 取某模板的模拟运行现场；未定义的自定义编排回退到空现场 */
export function runOf(wfId: string): WfRun {
  return wfRuns[wfId] ?? { states: {}, messages: [] };
}

/* ==================== 主控规划方案（开工前的第一步） ==================
   流水线不直接开跑：主控先把每个节点的输入输出与增强提示词摊开给人看，
   经确认后才推进。增强提示词区别于 agent 自带提示词 —— 它由主控按当前
   任务上下文（以及用户历轮修改意见）临时注入。
   ===================================================================== */

export type OrchestratorPlanEvent = Extract<
  AgentEvent,
  { kind: "orchestrator-plan" }
>;

export function buildOrchestratorPlan(
  wf: Workflow,
  task: string,
  feedback?: string,
  round = 1,
): OrchestratorPlanEvent {
  const contracts = wf.orchestrator.contracts;

  const assignments = wf.nodes.map((n) => {
    const c = contracts[n.id];
    const inputs = c?.inputs ?? [];
    const outputs = c?.outputs ?? [];
    /* 增强提示词 = 角色职责 + 本节点在该编排中的分工 + 产物链 + 用户意见。
       前三段来自契约推导，最后一段让「重新规划」在界面上可见地不同于上一轮。 */
    const lines = [
      `你在「${wf.name}」编排中承担「${n.name}」节点，角色职责：${c?.duty ?? n.desc}`,
      `开工前置：必须先读取 ${inputs.join("、") || "任务契约"}；缺失则不得启动，直接回退上游。`,
      `交付要求：产出 ${outputs.join("、")}，完成判定为「${c?.acceptance ?? "由主控核验"}」。`,
      n.gate ? `质量门禁「${n.gate}」未通过时，本节点视为未完成。` : null,
      feedback ? `用户对上一轮规划提出修改意见，请按此调整：${feedback}` : null,
    ].filter(Boolean);

    return {
      nodeId: n.id,
      nodeName: n.name,
      inputs,
      outputs,
      duty: c?.duty ?? n.desc,
      acceptance: c?.acceptance ?? "由主控核验",
      enhancedPrompt: lines.join("\n"),
    };
  });

  const flows = wf.edges.filter((e) => e.kind === "flow").length;
  const fails = wf.edges.filter((e) => e.kind === "fail").length;
  const gates = wf.nodes.filter((n) => n.gate).length;
  const approvals = wf.nodes.filter((n) => n.approval).length;

  return {
    id: `plan-r${round}-${Date.now().toString(36)}`,
    kind: "orchestrator-plan",
    task,
    summary: `已按「${wf.name}」为 ${wf.nodes.length} 个节点下发契约与增强提示词，重试上限 ${wf.maxRetry} 次，超限后${wf.onExhaust}。`,
    strategy: `流转 ${flows} 条 · 失败回退 ${fails} 条 · 质量门禁 ${gates} 道 · 人工检查点 ${approvals} 个`,
    round,
    assignments,
    confirmed: false,
    ...(feedback ? { feedback } : {}),
  };
}

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
